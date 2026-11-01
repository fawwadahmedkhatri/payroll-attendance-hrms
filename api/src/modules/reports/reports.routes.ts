import { Router, type Response } from "express";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "../../db";
import { addDays, dateOnly, formatTime, monthRange, toDateString, todayIn } from "../../lib/dates";
import { toNum } from "../../lib/money";
import { dateString } from "../../lib/validate";
import { authenticate, currentEmployeeId, requireHR } from "../../middleware/auth";
import { balancesFor } from "../leave/leave.service";
import { getSettings } from "../settings/settings.service";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

function sendCsv(res: Response, filename: string, rows: object[]) {
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.type("text/csv").send(Papa.unparse(rows));
}

// ───────────── HR dashboard ─────────────

reportsRouter.get("/dashboard", requireHR, async (_req, res) => {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const trendFrom = addDays(today, -13);
  const trendRange = { gte: dateOnly(trendFrom), lte: dateOnly(today) };

  const [activeCount, todayGroups, lateToday, pendingLeaves, trend, lateTrend, departments, runs] = await Promise.all([
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.attendanceDay.groupBy({ by: ["status"], where: { date: dateOnly(today) }, _count: true }),
    prisma.attendanceDay.count({ where: { date: dateOnly(today), isLate: true } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendanceDay.groupBy({ by: ["date", "status"], where: { date: trendRange }, _count: true }),
    prisma.attendanceDay.groupBy({ by: ["date"], where: { date: trendRange, isLate: true }, _count: true }),
    prisma.department.findMany({
      select: { name: true, _count: { select: { employees: { where: { status: "ACTIVE" } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 6 }),
  ]);

  const todayCounts: Record<string, number> = Object.fromEntries(todayGroups.map((g) => [g.status, g._count]));
  const present = (todayCounts.PRESENT ?? 0) + (todayCounts.HALF_DAY ?? 0);
  const trendMap = new Map<string, Record<string, number>>();
  for (const t of trend) {
    const d = toDateString(t.date);
    trendMap.set(d, { ...(trendMap.get(d) ?? {}), [t.status]: t._count });
  }
  const lateMap = new Map(lateTrend.map((t) => [toDateString(t.date), t._count]));

  const attendanceTrend = [];
  for (let d = trendFrom; d <= today; d = addDays(d, 1)) {
    const c = trendMap.get(d) ?? {};
    attendanceTrend.push({
      date: d,
      present: (c.PRESENT ?? 0) + (c.HALF_DAY ?? 0),
      absent: c.ABSENT ?? 0,
      onLeave: c.ON_LEAVE ?? 0,
      late: lateMap.get(d) ?? 0,
    });
  }

  const offToday = (todayCounts.HOLIDAY ?? 0) + (todayCounts.WEEKLY_OFF ?? 0);
  res.json({
    today,
    headcount: activeCount,
    todayStats: {
      present,
      late: lateToday,
      absent: todayCounts.ABSENT ?? 0,
      onLeave: todayCounts.ON_LEAVE ?? 0,
      notPunched: offToday > 0 ? 0 : Math.max(0, activeCount - present - (todayCounts.ON_LEAVE ?? 0) - (todayCounts.ABSENT ?? 0)),
      isOffDay: offToday > 0,
    },
    pendingLeaves,
    attendanceTrend,
    departments: departments.map((d) => ({ name: d.name, employees: d._count.employees })),
    payrollTrend: runs
      .map((r) => ({
        label: `${r.year}-${String(r.month).padStart(2, "0")}`,
        status: r.status,
        gross: toNum(r.totalGross),
        deductions: toNum(r.totalDeductions),
        net: toNum(r.totalNet),
        employees: r.employeeCount,
      }))
      .reverse(),
  });
});

// ───────────── Attendance summary (monthly, per employee) ─────────────

const monthQuery = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  departmentId: z.coerce.number().int().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

reportsRouter.get("/attendance-summary", requireHR, async (req, res) => {
  const q = monthQuery.parse(req.query);
  const { from, to } = monthRange(q.year, q.month);
  const dateFilter = { gte: dateOnly(from), lte: dateOnly(to) };
  const employeeFilter = q.departmentId ? { departmentId: q.departmentId } : {};

  const [employees, groups, late] = await Promise.all([
    prisma.employee.findMany({
      where: { ...employeeFilter, attendanceDays: { some: { date: dateFilter } } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: { employeeCode: "asc" },
    }),
    prisma.attendanceDay.groupBy({
      by: ["employeeId", "status"],
      where: { date: dateFilter, employee: employeeFilter },
      _count: true,
    }),
    prisma.attendanceDay.groupBy({
      by: ["employeeId"],
      where: { date: dateFilter, isLate: true, employee: employeeFilter },
      _count: true,
      _sum: { lateMinutes: true },
    }),
  ]);
  const counts = new Map<number, Record<string, number>>();
  for (const g of groups) counts.set(g.employeeId, { ...(counts.get(g.employeeId) ?? {}), [g.status]: g._count });
  const lateMap = new Map(late.map((l) => [l.employeeId, l]));

  const rows = employees.map((e) => {
    const c = counts.get(e.id) ?? {};
    const l = lateMap.get(e.id);
    return {
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department.name,
      present: c.PRESENT ?? 0,
      halfDay: c.HALF_DAY ?? 0,
      absent: c.ABSENT ?? 0,
      onLeave: c.ON_LEAVE ?? 0,
      holidays: (c.HOLIDAY ?? 0) + (c.WEEKLY_OFF ?? 0),
      lateCount: l?._count ?? 0,
      lateMinutes: l?._sum.lateMinutes ?? 0,
    };
  });
  if (q.format === "csv") return sendCsv(res, `attendance-summary-${q.year}-${String(q.month).padStart(2, "0")}.csv`, rows);
  res.json(rows);
});

// ───────────── Late arrivals ─────────────

reportsRouter.get("/late", requireHR, async (req, res) => {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const q = z
    .object({
      from: dateString.default(`${today.slice(0, 8)}01`),
      to: dateString.default(today),
      departmentId: z.coerce.number().int().optional(),
      format: z.enum(["json", "csv"]).default("json"),
    })
    .parse(req.query);
  const days = await prisma.attendanceDay.findMany({
    where: {
      isLate: true,
      date: { gte: dateOnly(q.from), lte: dateOnly(q.to) },
      ...(q.departmentId ? { employee: { departmentId: q.departmentId } } : {}),
    },
    orderBy: [{ date: "desc" }, { lateMinutes: "desc" }],
    take: 5000,
    include: {
      employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } }, shift: true } },
    },
  });
  const rows = days.map((d) => ({
    date: toDateString(d.date),
    employeeCode: d.employee.employeeCode,
    name: `${d.employee.firstName} ${d.employee.lastName}`,
    department: d.employee.department.name,
    shiftStart: d.employee.shift.startTime,
    checkIn: formatTime(d.checkIn, settings.timezone) ?? "",
    lateMinutes: d.lateMinutes,
  }));
  if (q.format === "csv") return sendCsv(res, `late-arrivals-${q.from}-to-${q.to}.csv`, rows);
  res.json(rows);
});

// ───────────── Leave usage ─────────────

reportsRouter.get("/leave-summary", requireHR, async (req, res) => {
  const year = z.coerce.number().int().default(new Date().getFullYear()).parse(req.query.year);
  const [types, balances, requests] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { name: "asc" } }),
    prisma.leaveBalance.groupBy({ by: ["leaveTypeId"], where: { year }, _sum: { allocated: true, carriedForward: true, used: true } }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { startDate: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) } },
      _count: true,
    }),
  ]);
  res.json(
    types.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id)?._sum;
      const r = (status: string) => requests.find((x) => x.leaveTypeId === t.id && x.status === status)?._count ?? 0;
      return {
        code: t.code,
        name: t.name,
        isPaid: t.isPaid,
        allocated: (b?.allocated ?? 0) + (b?.carriedForward ?? 0),
        used: b?.used ?? 0,
        approved: r("APPROVED"),
        pending: r("PENDING"),
        rejected: r("REJECTED"),
      };
    }),
  );
});

// ───────────── Employee dashboard ─────────────

reportsRouter.get("/me", async (req, res) => {
  const employeeId = currentEmployeeId(req);
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const monthFilter = { gte: dateOnly(monthStart), lte: dateOnly(today) };

  const [todayRow, monthGroups, lateCount, balances, lastPayslip, pending, employee] = await Promise.all([
    prisma.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date: dateOnly(today) } } }),
    prisma.attendanceDay.groupBy({ by: ["status"], where: { employeeId, date: monthFilter }, _count: true }),
    prisma.attendanceDay.count({ where: { employeeId, isLate: true, date: monthFilter } }),
    balancesFor(employeeId, Number(today.slice(0, 4))),
    prisma.payslip.findFirst({
      where: { employeeId, payrollRun: { status: "FINALIZED" } },
      orderBy: [{ payrollRun: { year: "desc" } }, { payrollRun: { month: "desc" } }],
      include: { payrollRun: { select: { year: true, month: true } } },
    }),
    prisma.leaveRequest.count({ where: { employeeId, status: "PENDING" } }),
    prisma.employee.findUnique({ where: { id: employeeId }, include: { shift: true } }),
  ]);
  const month: Record<string, number> = Object.fromEntries(monthGroups.map((g) => [g.status, g._count]));
  res.json({
    today,
    shift: employee?.shift ?? null,
    todayAttendance: todayRow
      ? {
          status: todayRow.status,
          checkInTime: formatTime(todayRow.checkIn, settings.timezone),
          checkOutTime: formatTime(todayRow.checkOut, settings.timezone),
          isLate: todayRow.isLate,
          lateMinutes: todayRow.lateMinutes,
        }
      : null,
    month: {
      present: (month.PRESENT ?? 0) + (month.HALF_DAY ?? 0),
      absent: month.ABSENT ?? 0,
      onLeave: month.ON_LEAVE ?? 0,
      late: lateCount,
    },
    balances,
    pendingLeaves: pending,
    lastPayslip,
  });
});
