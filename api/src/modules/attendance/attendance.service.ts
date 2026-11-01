import type { Prisma, PunchSource } from "@prisma/client";
import { prisma } from "../../db";
import { addDays, dateOnly, eachDay, localDateOf, toDateString, todayIn, zonedInstant } from "../../lib/dates";
import { getSettings, holidaySet } from "../settings/settings.service";
import { evaluateDay, isWeeklyOff } from "./rules";

export interface IncomingPunch {
  employeeId: number;
  punchedAt: Date;
}

/**
 * Store raw punches (duplicates ignored) and re-process the affected days.
 * Every attendance source — biometric device, simulator, Excel/CSV import — goes through here.
 */
export async function ingestPunches(punches: IncomingPunch[], source: PunchSource, deviceId?: number) {
  if (punches.length === 0) return { inserted: 0, duplicates: 0 };
  const settings = await getSettings();
  const result = await prisma.punch.createMany({
    data: punches.map((p) => ({ ...p, source, deviceId: deviceId ?? null })),
    skipDuplicates: true,
  });

  // Reprocess the affected date range for the affected employees
  const dates = punches.map((p) => localDateOf(p.punchedAt, settings.timezone)).sort();
  const employeeIds = [...new Set(punches.map((p) => p.employeeId))];
  await processRange({ from: dates[0], to: dates[dates.length - 1], employeeIds });
  return { inserted: result.count, duplicates: punches.length - result.count };
}

interface ProcessOptions {
  from: string;
  to: string;
  employeeIds?: number[];
}

/**
 * Rebuild AttendanceDay rows from punches, approved leave, holidays and weekly offs.
 * Rows edited manually by HR are left untouched. Future dates are never processed.
 */
export async function processRange({ from, to, employeeIds }: ProcessOptions) {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const end = to > today ? today : to;
  if (from > end) return { processed: 0 };

  const tz = settings.timezone;
  const dates = eachDay(from, end);
  const holidays = await holidaySet(from, end);

  const employees = await prisma.employee.findMany({
    where: {
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
      dateOfJoining: { lte: dateOnly(end) },
      OR: [{ dateOfExit: null }, { dateOfExit: { gte: dateOnly(from) } }],
    },
    select: { id: true, dateOfJoining: true, dateOfExit: true, shift: true },
  });
  if (employees.length === 0) return { processed: 0 };
  const ids = employees.map((e) => e.id);

  const [punches, leaves, manualDays] = await Promise.all([
    prisma.punch.findMany({
      where: {
        employeeId: { in: ids },
        punchedAt: { gte: zonedInstant(from, "00:00", tz), lt: zonedInstant(addDays(end, 1), "00:00", tz) },
      },
      select: { employeeId: true, punchedAt: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: "APPROVED",
        startDate: { lte: dateOnly(end) },
        endDate: { gte: dateOnly(from) },
      },
      select: { id: true, employeeId: true, startDate: true, endDate: true, isHalfDay: true },
    }),
    prisma.attendanceDay.findMany({
      where: { employeeId: { in: ids }, date: { gte: dateOnly(from), lte: dateOnly(end) }, isManual: true },
      select: { employeeId: true, date: true },
    }),
  ]);

  const key = (employeeId: number, date: string) => `${employeeId}|${date}`;

  const punchMap = new Map<string, Date[]>();
  for (const p of punches) {
    const k = key(p.employeeId, localDateOf(p.punchedAt, tz));
    const list = punchMap.get(k) ?? [];
    list.push(p.punchedAt);
    punchMap.set(k, list);
  }

  const leaveMap = new Map<string, { fraction: number; requestId: number }>();
  for (const l of leaves) {
    for (const date of eachDay(toDateString(l.startDate), toDateString(l.endDate))) {
      if (holidays.has(date) || isWeeklyOff(date, settings.weeklyOffDays)) continue;
      leaveMap.set(key(l.employeeId, date), { fraction: l.isHalfDay ? 0.5 : 1, requestId: l.id });
    }
  }

  const manual = new Set(manualDays.map((d) => key(d.employeeId, toDateString(d.date))));

  const rows: Prisma.AttendanceDayCreateManyInput[] = [];
  for (const emp of employees) {
    const joined = toDateString(emp.dateOfJoining);
    const exited = emp.dateOfExit ? toDateString(emp.dateOfExit) : null;
    for (const date of dates) {
      if (date < joined || (exited && date > exited)) continue;
      const k = key(emp.id, date);
      if (manual.has(k)) continue;
      const leave = leaveMap.get(k);
      const result = evaluateDay({
        date,
        timezone: tz,
        shift: emp.shift,
        punches: punchMap.get(k) ?? [],
        isHoliday: holidays.has(date),
        isWeeklyOff: isWeeklyOff(date, settings.weeklyOffDays),
        leaveFraction: leave?.fraction ?? 0,
        isToday: date === today,
      });
      if (!result) continue;
      rows.push({
        employeeId: emp.id,
        date: dateOnly(date),
        ...result,
        leaveFraction: leave?.fraction ?? 0,
        leaveRequestId: leave?.requestId ?? null,
      });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.attendanceDay.deleteMany({
        where: { employeeId: { in: ids }, date: { gte: dateOnly(from), lte: dateOnly(end) }, isManual: false },
      });
      for (let i = 0; i < rows.length; i += 5000) {
        await tx.attendanceDay.createMany({ data: rows.slice(i, i + 5000) });
      }
    },
    { timeout: 120_000 },
  );
  return { processed: rows.length };
}

/** Build punches for a manual or imported in/out time pair. */
export function punchesForTimes(employeeId: number, date: string, times: (string | null | undefined)[], timezone: string) {
  return times.filter((t): t is string => !!t).map((t) => ({ employeeId, punchedAt: zonedInstant(date, t, timezone) }));
}
