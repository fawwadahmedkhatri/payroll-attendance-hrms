import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { audit } from "../../lib/audit";
import { dateOnly, eachDay, formatTime, toDateString, todayIn, zonedInstant } from "../../lib/dates";
import { badRequest, notFound } from "../../lib/errors";
import { dateString, idParam, pageArgs, paged, pagination, timeString } from "../../lib/validate";
import { authenticate, currentEmployeeId, currentUser, requireHR } from "../../middleware/auth";
import { getSettings, holidaySet } from "../settings/settings.service";
import { ingestPunches, processRange, punchesForTimes } from "./attendance.service";
import { buildTemplate, parseAttendanceFile, validateRows } from "./import";
import { evaluateDay, isWeeklyOff } from "./rules";
import { simulateDay } from "./simulator";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function serializeDay(day: any, timezone: string) {
  return {
    ...day,
    date: toDateString(day.date),
    checkInTime: formatTime(day.checkIn, timezone),
    checkOutTime: formatTime(day.checkOut, timezone),
  };
}

// ───────────── Employee self-service ─────────────

attendanceRouter.get("/me", async (req, res) => {
  const employeeId = currentEmployeeId(req);
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const q = z.object({ from: dateString.default(`${today.slice(0, 8)}01`), to: dateString.default(today) }).parse(req.query);
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId, date: { gte: dateOnly(q.from), lte: dateOnly(q.to) } },
    orderBy: { date: "desc" },
    include: { leaveRequest: { select: { leaveType: { select: { name: true } } } } },
  });
  res.json(days.map((d) => serializeDay(d, settings.timezone)));
});

// ───────────── HR views ─────────────

const listQuery = pagination.extend({
  from: dateString.optional(),
  to: dateString.optional(),
  employeeId: z.coerce.number().int().optional(),
  departmentId: z.coerce.number().int().optional(),
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF", "LATE"]).optional(),
  search: z.string().optional(),
});

attendanceRouter.get("/", requireHR, async (req, res) => {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const q = listQuery.parse(req.query);
  const from = q.from ?? today;
  const to = q.to ?? from;

  const where: Prisma.AttendanceDayWhereInput = {
    date: { gte: dateOnly(from), lte: dateOnly(to) },
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    ...(q.status === "LATE" ? { isLate: true } : q.status ? { status: q.status } : {}),
    employee: {
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: "insensitive" } },
              { lastName: { contains: q.search, mode: "insensitive" } },
              { employeeCode: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  };
  const [items, total] = await Promise.all([
    prisma.attendanceDay.findMany({
      where,
      ...pageArgs(q),
      orderBy: [{ date: "desc" }, { employee: { employeeCode: "asc" } }],
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        leaveRequest: { select: { leaveType: { select: { name: true } } } },
      },
    }),
    prisma.attendanceDay.count({ where }),
  ]);
  res.json(paged(items.map((d) => serializeDay(d, settings.timezone)), total, q));
});

attendanceRouter.get("/punches", requireHR, async (req, res) => {
  const settings = await getSettings();
  const q = z.object({ employeeId: z.coerce.number().int(), date: dateString }).parse(req.query);
  const punches = await prisma.punch.findMany({
    where: {
      employeeId: q.employeeId,
      punchedAt: { gte: zonedInstant(q.date, "00:00", settings.timezone), lte: zonedInstant(q.date, "23:59", settings.timezone) },
    },
    orderBy: { punchedAt: "asc" },
    include: { device: { select: { name: true } } },
  });
  res.json(punches.map((p) => ({ ...p, time: formatTime(p.punchedAt, settings.timezone) })));
});

// ───────────── Manual correction ─────────────

const manualSchema = z.object({
  employeeId: z.number().int(),
  date: dateString,
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF"]),
  checkIn: timeString.nullish(),
  checkOut: timeString.nullish(),
  remarks: z.string().min(3, "Please give a reason for the correction"),
});

attendanceRouter.put("/manual", requireHR, async (req, res) => {
  const input = manualSchema.parse(req.body);
  const settings = await getSettings();
  if (input.date > todayIn(settings.timezone)) throw badRequest("Cannot mark attendance for a future date");
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, include: { shift: true } });
  if (!employee) throw notFound("Employee");

  // Re-use the normal rules to derive worked/late minutes from the corrected times
  const punches = punchesForTimes(employee.id, input.date, [input.checkIn, input.checkOut], settings.timezone).map((p) => p.punchedAt);
  const derived = evaluateDay({
    date: input.date,
    timezone: settings.timezone,
    shift: employee.shift,
    punches,
    isHoliday: false,
    isWeeklyOff: false,
    leaveFraction: 0,
    isToday: false,
  })!;
  const data = {
    status: input.status,
    checkIn: derived.checkIn,
    checkOut: derived.checkOut,
    workedMinutes: derived.workedMinutes,
    lateMinutes: input.status === "PRESENT" || input.status === "HALF_DAY" ? derived.lateMinutes : 0,
    isLate: (input.status === "PRESENT" || input.status === "HALF_DAY") && derived.isLate,
    isManual: true,
    remarks: input.remarks,
  };
  const day = await prisma.attendanceDay.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: dateOnly(input.date) } },
    update: data,
    create: { ...data, employeeId: input.employeeId, date: dateOnly(input.date) },
  });
  await audit(currentUser(req).id, "MANUAL_ATTENDANCE", "AttendanceDay", day.id, input);
  res.json(serializeDay(day, settings.timezone));
});

attendanceRouter.post("/:id/reset", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const day = await prisma.attendanceDay.update({ where: { id }, data: { isManual: false } });
  const date = toDateString(day.date);
  await processRange({ from: date, to: date, employeeIds: [day.employeeId] });
  await audit(currentUser(req).id, "RESET_ATTENDANCE", "AttendanceDay", id);
  res.status(204).end();
});

// ───────────── Processing, simulator, import ─────────────

const rangeSchema = z
  .object({ from: dateString, to: dateString })
  .refine((r) => r.from <= r.to, "From must be before To")
  .refine((r) => eachDay(r.from, r.to).length <= 62, "Process at most 62 days at a time");

attendanceRouter.post("/process", requireHR, async (req, res) => {
  const range = rangeSchema.parse(req.body);
  const result = await processRange(range);
  await audit(currentUser(req).id, "PROCESS_ATTENDANCE", "AttendanceDay", null, range);
  res.json(result);
});

attendanceRouter.post("/simulate", requireHR, async (req, res) => {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const { date } = z.object({ date: dateString.default(today) }).parse(req.body ?? {});
  if (date > today) throw badRequest("Cannot simulate a future date");
  const holidays = await holidaySet(date, date);
  if (holidays.has(date) || isWeeklyOff(date, settings.weeklyOffDays)) {
    throw badRequest(`${date} is a holiday or weekly off — nobody is expected to punch in`);
  }

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", dateOfJoining: { lte: dateOnly(date) } },
    select: { id: true, shift: { select: { startTime: true, endTime: true } } },
  });
  const punches = simulateDay(employees, {
    date,
    timezone: settings.timezone,
    until: date === today ? new Date() : undefined,
  });
  const result = await ingestPunches(punches, "SIMULATOR");
  await audit(currentUser(req).id, "SIMULATE_FEED", "Punch", null, { date, ...result });
  res.json({ date, employees: employees.length, ...result });
});

attendanceRouter.get("/import/template", requireHR, async (req, res) => {
  const format = z.enum(["csv", "xlsx"]).default("xlsx").parse(req.query.format);
  const settings = await getSettings();
  const employees = await prisma.employee.findMany({ where: { status: "ACTIVE" }, take: 3, orderBy: { employeeCode: "asc" } });
  const date = todayIn(settings.timezone);
  const buffer = await buildTemplate(format, employees.map((e) => ({ code: e.employeeCode, date })));
  res.setHeader("Content-Disposition", `attachment; filename="attendance-template.${format}"`);
  res.type(format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

attendanceRouter.post("/import", requireHR, upload.single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Attach a file in the 'file' field");
  const dryRun = req.query.dryRun !== "false";
  const settings = await getSettings();
  const rows = await parseAttendanceFile(req.file.buffer, req.file.originalname);
  if (rows.length === 0) throw badRequest("The file has no data rows");
  if (rows.length > 20000) throw badRequest("Import at most 20,000 rows at a time");

  const codes = [...new Set(rows.map((r) => r.employeeCode.toUpperCase()).filter(Boolean))];
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { in: codes, mode: "insensitive" } },
    select: { id: true, employeeCode: true, dateOfJoining: true },
  });
  const byCode = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), { id: e.id, dateOfJoining: toDateString(e.dateOfJoining) }]));
  const { valid, errors } = validateRows(rows, byCode, todayIn(settings.timezone));

  if (dryRun) {
    res.json({ dryRun: true, totalRows: rows.length, validRows: valid.length, errors, preview: valid.slice(0, 20) });
    return;
  }
  if (valid.length === 0) throw badRequest("No valid rows to import", errors);

  const punches = valid.flatMap((r) => punchesForTimes(r.employeeId, r.date, [r.checkIn, r.checkOut], settings.timezone));
  const result = await ingestPunches(punches, "IMPORT");
  await audit(currentUser(req).id, "IMPORT_ATTENDANCE", "Punch", null, {
    file: req.file.originalname,
    rows: rows.length,
    valid: valid.length,
    errors: errors.length,
    ...result,
  });
  res.json({ dryRun: false, totalRows: rows.length, validRows: valid.length, errors, ...result });
});
