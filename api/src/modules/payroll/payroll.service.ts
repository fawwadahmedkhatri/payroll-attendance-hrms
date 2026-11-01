import type { EmployeeComponentOverride, PayComponent } from "@prisma/client";
import { prisma } from "../../db";
import { addDays, dateOnly, eachDay, monthRange, toDateString, todayIn } from "../../lib/dates";
import { badRequest, notFound } from "../../lib/errors";
import { round2, toNum, toNumOrNull } from "../../lib/money";
import { processRange } from "../attendance/attendance.service";
import { latePenaltyDays, shiftMinutes, summarizeMonth, type SummaryDay } from "../attendance/rules";
import { getSettings, workingDates } from "../settings/settings.service";
import { calculatePay, type ComponentRule, type Slab } from "./engine";

export function toRule(c: PayComponent, override?: EmployeeComponentOverride): ComponentRule | null {
  if (override?.isDisabled) return null;
  return {
    code: c.code,
    name: c.name,
    kind: c.kind,
    calcType: c.calcType,
    amount: override?.amount !== null && override?.amount !== undefined ? toNum(override.amount) : toNumOrNull(c.amount),
    percentage: override?.percentage ?? c.percentage,
    baseCodes: c.baseCodes,
    baseCap: toNumOrNull(c.baseCap),
    minAmount: toNumOrNull(c.minAmount),
    maxAmount: toNumOrNull(c.maxAmount),
    slabs: (c.slabs as Slab[] | null) ?? null,
    slabMode: c.slabMode,
    slabPeriod: c.slabPeriod,
    applyIfGrossMin: toNumOrNull(c.applyIfGrossMin),
    applyIfGrossMax: toNumOrNull(c.applyIfGrossMax),
    prorate: c.prorate,
    sequence: c.sequence,
  };
}

/**
 * Process (or re-process) the payroll for a month. Attendance is refreshed first,
 * then every employee employed during the month gets a payslip snapshot.
 * A FINALIZED run is locked and cannot be re-processed.
 */
export async function processPayrollRun(year: number, month: number, userId: number) {
  const existing = await prisma.payrollRun.findUnique({ where: { year_month: { year, month } } });
  if (existing?.status === "FINALIZED") throw badRequest("This payroll is finalized and locked");

  const settings = await getSettings();
  const { from, to, daysInMonth } = monthRange(year, month);
  const today = todayIn(settings.timezone);
  if (from > today) throw badRequest("Cannot run payroll for a future month");

  await processRange({ from, to });

  const working = await workingDates(from, to, settings.weeklyOffDays);
  const divisorDays =
    settings.payDivisorMode === "CALENDAR_DAYS"
      ? daysInMonth
      : settings.payDivisorMode === "WORKING_DAYS"
        ? working.size
        : settings.fixedPayDays;
  const dates = eachDay(from, to);
  const yesterday = addDays(today, -1);
  const lastProcessedDate = to < yesterday ? to : yesterday;

  const [employees, components, days] = await Promise.all([
    prisma.employee.findMany({
      where: {
        dateOfJoining: { lte: dateOnly(to) },
        OR: [{ dateOfExit: null }, { dateOfExit: { gte: dateOnly(from) } }],
        // Inactive employees without an exit date are skipped
        AND: [{ OR: [{ status: "ACTIVE" }, { dateOfExit: { not: null } }] }],
      },
      include: { department: true, designation: true, shift: true, componentOverrides: true },
      orderBy: { employeeCode: "asc" },
    }),
    prisma.payComponent.findMany({ where: { isActive: true } }),
    prisma.attendanceDay.findMany({
      where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
      select: {
        employeeId: true,
        date: true,
        status: true,
        isLate: true,
        lateMinutes: true,
        leaveFraction: true,
        leaveRequest: { select: { leaveType: { select: { isPaid: true } } } },
      },
    }),
  ]);
  if (employees.length === 0) throw badRequest("No employees were employed during this month");
  if (!components.some((c) => c.kind === "EARNING")) throw badRequest("Configure at least one earning component first");

  const daysByEmployee = new Map<number, SummaryDay[]>();
  for (const d of days) {
    const list = daysByEmployee.get(d.employeeId) ?? [];
    list.push({
      date: toDateString(d.date),
      status: d.status,
      isLate: d.isLate,
      lateMinutes: d.lateMinutes,
      leaveFraction: d.leaveFraction,
      leaveIsPaid: d.leaveRequest ? d.leaveRequest.leaveType.isPaid : null,
    });
    daysByEmployee.set(d.employeeId, list);
  }

  const payslips = employees.map((emp) => {
    const summary = summarizeMonth(daysByEmployee.get(emp.id) ?? [], {
      dates,
      workingDates: working,
      countCalendarDays: settings.payDivisorMode !== "WORKING_DAYS",
      joinDate: toDateString(emp.dateOfJoining),
      exitDate: emp.dateOfExit ? toDateString(emp.dateOfExit) : null,
      lastProcessedDate,
    });
    const lopDays = summary.absentDays + summary.unpaidLeaveDays + summary.notEmployedDays;
    const penaltyDays =
      settings.lateDeductionMode === "COUNT_BASED"
        ? latePenaltyDays(summary.lateCount, settings.latesPerPenalty, settings.latePenaltyDays)
        : 0;

    const overrides = new Map(emp.componentOverrides.map((o) => [o.componentId, o]));
    const rules = components.map((c) => toRule(c, overrides.get(c.id))).filter((r): r is ComponentRule => r !== null);
    const pay = calculatePay({
      baseSalary: toNum(emp.baseSalary),
      rules,
      divisorDays,
      lopDays,
      late: {
        mode: settings.lateDeductionMode,
        penaltyDays,
        lateMinutes: summary.lateMinutes,
        shiftMinutes: shiftMinutes(emp.shift),
      },
    });

    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      departmentName: emp.department.name,
      designationTitle: emp.designation.title,
      baseSalary: emp.baseSalary,
      divisorDays,
      ...summary,
      lopDays: round2(lopDays),
      latePenaltyDays: penaltyDays,
      grossEarnings: pay.grossEarnings,
      lopDeduction: pay.lopDeduction,
      lateDeduction: pay.lateDeduction,
      totalDeductions: pay.totalDeductions,
      employerContributions: pay.employerContributions,
      netPay: pay.netPay,
      lines: pay.lines,
    };
  });

  const totals = payslips.reduce(
    (t, p) => ({
      gross: t.gross + p.grossEarnings,
      deductions: t.deductions + p.totalDeductions,
      employer: t.employer + p.employerContributions,
      net: t.net + p.netPay,
    }),
    { gross: 0, deductions: 0, employer: 0, net: 0 },
  );

  return prisma.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.upsert({
        where: { year_month: { year, month } },
        update: {},
        create: { year, month },
      });
      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
      for (const { lines, ...slip } of payslips) {
        await tx.payslip.create({
          data: { ...slip, payrollRunId: run.id, lines: { create: lines } },
        });
      }
      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: "DRAFT",
          employeeCount: payslips.length,
          totalGross: round2(totals.gross),
          totalDeductions: round2(totals.deductions),
          totalEmployerContrib: round2(totals.employer),
          totalNet: round2(totals.net),
          processedAt: new Date(),
          processedById: userId,
        },
      });
    },
    { timeout: 180_000 },
  );
}

export async function finalizeRun(id: number, userId: number) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  if (run.status === "FINALIZED") throw badRequest("Already finalized");
  return prisma.payrollRun.update({
    where: { id },
    data: { status: "FINALIZED", finalizedAt: new Date(), finalizedById: userId },
  });
}

export async function deleteDraftRun(id: number) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  if (run.status === "FINALIZED") throw badRequest("A finalized payroll cannot be deleted");
  await prisma.payrollRun.delete({ where: { id } });
}
