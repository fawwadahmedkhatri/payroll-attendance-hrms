import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { audit } from "../../lib/audit";
import { toDateString } from "../../lib/dates";
import { dateString, idParam, pageArgs, paged, pagination } from "../../lib/validate";
import { authenticate, currentEmployeeId, currentUser, requireAdmin, requireHR } from "../../middleware/auth";
import { allocateYear, applyLeave, balancesFor, cancelLeave, countLeaveDays, reviewLeave } from "./leave.service";

export const leaveRouter = Router();
leaveRouter.use(authenticate);

function serialize<T extends { startDate: Date; endDate: Date }>(r: T) {
  return { ...r, startDate: toDateString(r.startDate), endDate: toDateString(r.endDate) };
}

const requestInclude = {
  leaveType: { select: { code: true, name: true, color: true, isPaid: true } },
  employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
  reviewedBy: { select: { email: true } },
} satisfies Prisma.LeaveRequestInclude;

// ───────────── Employee self-service ─────────────

leaveRouter.get("/me/balances", async (req, res) => {
  const year = z.coerce.number().int().default(new Date().getFullYear()).parse(req.query.year);
  res.json(await balancesFor(currentEmployeeId(req), year));
});

leaveRouter.get("/me/requests", async (req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: currentEmployeeId(req) },
    orderBy: { startDate: "desc" },
    take: 100,
    include: requestInclude,
  });
  res.json(requests.map(serialize));
});

const applySchema = z.object({
  leaveTypeId: z.number().int(),
  startDate: dateString,
  endDate: dateString,
  isHalfDay: z.boolean().default(false),
  reason: z.string().min(3).max(500),
});

leaveRouter.get("/days", async (req, res) => {
  const q = z.object({ startDate: dateString, endDate: dateString, isHalfDay: z.enum(["true", "false"]).default("false") }).parse(req.query);
  res.json({ days: await countLeaveDays(q.startDate, q.endDate, q.isHalfDay === "true") });
});

leaveRouter.post("/me/requests", async (req, res) => {
  const input = applySchema.parse(req.body);
  const employeeId = currentEmployeeId(req);
  const request = await applyLeave({ ...input, employeeId });
  await audit(currentUser(req).id, "APPLY", "LeaveRequest", request.id, input);
  res.status(201).json(serialize(request));
});

leaveRouter.post("/requests/:id/cancel", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const user = currentUser(req);
  await cancelLeave(id, { id: user.id, employeeId: user.employeeId, isHR: user.role !== "EMPLOYEE" });
  await audit(user.id, "CANCEL", "LeaveRequest", id);
  res.status(204).end();
});

// ───────────── HR ─────────────

const listQuery = pagination.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"]).default("PENDING"),
  employeeId: z.coerce.number().int().optional(),
  leaveTypeId: z.coerce.number().int().optional(),
  search: z.string().optional(),
});

leaveRouter.get("/requests", requireHR, async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.LeaveRequestWhereInput = {
    ...(q.status !== "ALL" ? { status: q.status } : {}),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
    ...(q.search
      ? {
          employee: {
            OR: [
              { firstName: { contains: q.search, mode: "insensitive" } },
              { lastName: { contains: q.search, mode: "insensitive" } },
              { employeeCode: { contains: q.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      ...pageArgs(q),
      orderBy: q.status === "PENDING" ? { createdAt: "asc" } : { startDate: "desc" },
      include: requestInclude,
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  res.json(paged(items.map(serialize), total, q));
});

const reviewSchema = z.object({ comment: z.string().max(500).optional() });

leaveRouter.post("/requests/:id/approve", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { comment } = reviewSchema.parse(req.body ?? {});
  const user = currentUser(req);
  const request = await reviewLeave(id, user.id, true, comment);
  await audit(user.id, "APPROVE", "LeaveRequest", id, { comment });
  res.json(serialize(request));
});

leaveRouter.post("/requests/:id/reject", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { comment } = z.object({ comment: z.string().min(3, "Please give a reason for rejecting") }).parse(req.body ?? {});
  const user = currentUser(req);
  const request = await reviewLeave(id, user.id, false, comment);
  await audit(user.id, "REJECT", "LeaveRequest", id, { comment });
  res.json(serialize(request));
});

leaveRouter.get("/balances/:id", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const year = z.coerce.number().int().default(new Date().getFullYear()).parse(req.query.year);
  res.json(await balancesFor(id, year));
});

leaveRouter.post("/balances/allocate", requireAdmin, async (req, res) => {
  const { year } = z.object({ year: z.number().int().min(2000).max(2100) }).parse(req.body);
  const result = await allocateYear(year);
  await audit(currentUser(req).id, "ALLOCATE_LEAVE", "LeaveBalance", null, result);
  res.json(result);
});
