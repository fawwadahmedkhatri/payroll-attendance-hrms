import { prisma } from "../../db";
import { dateOnly, toDateString } from "../../lib/dates";
import { badRequest, notFound } from "../../lib/errors";
import { processRange } from "../attendance/attendance.service";
import { getSettings, workingDates } from "../settings/settings.service";

/** Leave days = working days in the range (weekly offs and holidays are not counted). */
export async function countLeaveDays(start: string, end: string, isHalfDay: boolean) {
  const settings = await getSettings();
  const days = (await workingDates(start, end, settings.weeklyOffDays)).size;
  if (isHalfDay) return days === 1 ? 0.5 : 0;
  return days;
}

/** Create this year's balance rows for one employee (new joiners). */
export async function allocateBalancesForEmployee(employeeId: number, year: number) {
  const types = await prisma.leaveType.findMany({ where: { isActive: true } });
  await prisma.leaveBalance.createMany({
    data: types.map((t) => ({ employeeId, leaveTypeId: t.id, year, allocated: t.annualQuota ?? 0 })),
    skipDuplicates: true,
  });
}

/**
 * Yearly allocation for all active employees. Unused balance is carried forward
 * for leave types that allow it, up to their maximum.
 */
export async function allocateYear(year: number) {
  const [types, employees, previous] = await Promise.all([
    prisma.leaveType.findMany({ where: { isActive: true } }),
    prisma.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    prisma.leaveBalance.findMany({ where: { year: year - 1 } }),
  ]);
  const prevMap = new Map(previous.map((b) => [`${b.employeeId}|${b.leaveTypeId}`, b]));

  let created = 0;
  for (const type of types) {
    const data = employees.map((e) => {
      const prev = prevMap.get(`${e.id}|${type.id}`);
      const remaining = prev ? prev.allocated + prev.carriedForward - prev.used : 0;
      const carried = type.carryForward ? Math.max(0, Math.min(remaining, type.maxCarryForward)) : 0;
      return { employeeId: e.id, leaveTypeId: type.id, year, allocated: type.annualQuota ?? 0, carriedForward: carried };
    });
    const result = await prisma.leaveBalance.createMany({ data, skipDuplicates: true });
    created += result.count;
  }
  return { year, created };
}

export async function balancesFor(employeeId: number, year: number) {
  const [balances, pending] = await Promise.all([
    prisma.leaveBalance.findMany({
      where: { employeeId, year, leaveType: { isActive: true } },
      include: { leaveType: true },
      orderBy: { leaveType: { name: "asc" } },
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: { employeeId, status: "PENDING", startDate: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) } },
      _sum: { days: true },
    }),
  ]);
  const pendingMap = new Map(pending.map((p) => [p.leaveTypeId, p._sum.days ?? 0]));
  return balances.map((b) => {
    const total = b.allocated + b.carriedForward;
    const pendingDays = pendingMap.get(b.leaveTypeId) ?? 0;
    return {
      leaveTypeId: b.leaveTypeId,
      code: b.leaveType.code,
      name: b.leaveType.name,
      color: b.leaveType.color,
      isPaid: b.leaveType.isPaid,
      allowHalfDay: b.leaveType.allowHalfDay,
      unlimited: b.leaveType.annualQuota === null,
      allocated: b.allocated,
      carriedForward: b.carriedForward,
      used: b.used,
      pending: pendingDays,
      available: b.leaveType.annualQuota === null ? null : total - b.used - pendingDays,
    };
  });
}

interface ApplyInput {
  employeeId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
}

export async function applyLeave(input: ApplyInput) {
  if (input.endDate < input.startDate) throw badRequest("End date must be on or after start date");
  if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4))
    throw badRequest("A leave request cannot span two leave years. Split it into two requests.");
  if (input.isHalfDay && input.startDate !== input.endDate) throw badRequest("A half-day leave must be a single date");

  const type = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || !type.isActive) throw notFound("Leave type");
  if (input.isHalfDay && !type.allowHalfDay) throw badRequest(`${type.name} cannot be taken as a half day`);

  const days = await countLeaveDays(input.startDate, input.endDate, input.isHalfDay);
  if (days <= 0) throw badRequest("The selected dates are all holidays or weekly offs");

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateOnly(input.endDate) },
      endDate: { gte: dateOnly(input.startDate) },
    },
  });
  if (overlap) throw badRequest("You already have a leave request overlapping these dates");

  if (type.annualQuota !== null) {
    const year = Number(input.startDate.slice(0, 4));
    const balance = (await balancesFor(input.employeeId, year)).find((b) => b.leaveTypeId === type.id);
    const available = balance?.available ?? 0;
    if (available < days) throw badRequest(`Not enough ${type.name} balance: ${available} day(s) available, ${days} requested`);
  }

  return prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: dateOnly(input.startDate),
      endDate: dateOnly(input.endDate),
      isHalfDay: input.isHalfDay,
      days,
      reason: input.reason,
    },
    include: { leaveType: true },
  });
}

async function reprocessLeaveDates(request: { employeeId: number; startDate: Date; endDate: Date }) {
  await processRange({
    from: toDateString(request.startDate),
    to: toDateString(request.endDate),
    employeeIds: [request.employeeId],
  });
}

export async function reviewLeave(id: number, reviewerId: number, approve: boolean, comment?: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id }, include: { leaveType: true } });
  if (!request) throw notFound("Leave request");
  if (request.status !== "PENDING") throw badRequest(`This request is already ${request.status.toLowerCase()}`);
  const year = request.startDate.getUTCFullYear();

  const updated = await prisma.$transaction(async (tx) => {
    if (approve) {
      const balance = await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
        update: {},
        create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, allocated: request.leaveType.annualQuota ?? 0 },
      });
      if (request.leaveType.annualQuota !== null) {
        const available = balance.allocated + balance.carriedForward - balance.used;
        if (available < request.days) throw badRequest(`Insufficient balance: ${available} day(s) available`);
      }
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { used: { increment: request.days } } });
    }
    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment ?? null,
      },
      include: { leaveType: true },
    });
  });

  if (approve) await reprocessLeaveDates(request);
  return updated;
}

/** Employees cancel their own pending requests; HR can also cancel approved ones (balance is restored). */
export async function cancelLeave(id: number, actor: { id: number; employeeId: number | null; isHR: boolean }) {
  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) throw notFound("Leave request");
  if (!actor.isHR && request.employeeId !== actor.employeeId) throw notFound("Leave request");
  if (request.status === "APPROVED" && !actor.isHR) throw badRequest("Approved leave can only be cancelled by HR");
  if (request.status !== "PENDING" && request.status !== "APPROVED") throw badRequest("This request cannot be cancelled");

  const wasApproved = request.status === "APPROVED";
  await prisma.$transaction(async (tx) => {
    if (wasApproved) {
      await tx.leaveBalance.updateMany({
        where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear() },
        data: { used: { decrement: request.days } },
      });
      await tx.attendanceDay.updateMany({ where: { leaveRequestId: id }, data: { leaveRequestId: null } });
    }
    await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", reviewedById: actor.id, reviewedAt: new Date() } });
  });
  if (wasApproved) await reprocessLeaveDates(request);
}
