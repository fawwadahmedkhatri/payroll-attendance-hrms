import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { audit } from "../../lib/audit";
import { dateOnly, todayIn } from "../../lib/dates";
import { badRequest, notFound } from "../../lib/errors";
import { toNum } from "../../lib/money";
import { dateString, idParam, pageArgs, paged, pagination } from "../../lib/validate";
import { authenticate, currentUser, requireAdmin, requireHR } from "../../middleware/auth";
import { allocateBalancesForEmployee } from "../leave/leave.service";
import { getSettings } from "../settings/settings.service";

export const employeesRouter = Router();
employeesRouter.use(authenticate, requireHR);

const employeeSchema = z.object({
  employeeCode: z.string().min(1).max(20),
  biometricId: z.string().max(40).nullish(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().transform((e) => e.toLowerCase()),
  phone: z.string().nullish(),
  gender: z.enum(["Male", "Female", "Other"]).nullish(),
  dateOfBirth: dateString.nullish(),
  dateOfJoining: dateString,
  departmentId: z.number().int(),
  designationId: z.number().int(),
  shiftId: z.number().int(),
  baseSalary: z.number().min(0),
  bankName: z.string().nullish(),
  bankAccount: z.string().nullish(),
  taxId: z.string().nullish(),
  address: z.string().nullish(),
  role: z.enum(["EMPLOYEE", "HR", "ADMIN"]).default("EMPLOYEE"),
});

const createSchema = employeeSchema.extend({
  password: z.string().min(8, "Initial password must be at least 8 characters"),
});

function toData(input: z.infer<typeof employeeSchema>) {
  const { role: _role, ...rest } = input;
  return {
    ...rest,
    biometricId: rest.biometricId || null,
    dateOfBirth: rest.dateOfBirth ? dateOnly(rest.dateOfBirth) : null,
    dateOfJoining: dateOnly(rest.dateOfJoining),
  };
}

const listQuery = pagination.extend({
  search: z.string().optional(),
  departmentId: z.coerce.number().int().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
});

employeesRouter.get("/", async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.EmployeeWhereInput = {
    ...(q.status !== "ALL" ? { status: q.status } : {}),
    ...(q.departmentId ? { departmentId: q.departmentId } : {}),
    ...(q.search
      ? {
          OR: [
            { firstName: { contains: q.search, mode: "insensitive" } },
            { lastName: { contains: q.search, mode: "insensitive" } },
            { employeeCode: { contains: q.search, mode: "insensitive" } },
            { email: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      ...pageArgs(q),
      orderBy: { employeeCode: "asc" },
      include: {
        department: { select: { name: true } },
        designation: { select: { title: true } },
        shift: { select: { name: true } },
      },
    }),
    prisma.employee.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

employeesRouter.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      designation: true,
      shift: true,
      user: { select: { id: true, role: true, isActive: true, lastLoginAt: true } },
      componentOverrides: { include: { component: { select: { code: true, name: true, kind: true } } } },
    },
  });
  if (!employee) throw notFound("Employee");
  res.json(employee);
});

employeesRouter.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const actor = currentUser(req);
  if (input.role !== "EMPLOYEE" && actor.role !== "ADMIN") throw badRequest("Only an admin can create HR or admin accounts");
  const { password, ...rest } = input;
  const passwordHash = await bcrypt.hash(password, 10);

  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({ data: toData(rest) });
    await tx.user.create({ data: { email: created.email, passwordHash, role: input.role, employeeId: created.id } });
    return created;
  });
  await allocateBalancesForEmployee(employee.id, new Date().getFullYear());
  await audit(actor.id, "CREATE", "Employee", employee.id, { employeeCode: employee.employeeCode });
  res.status(201).json(employee);
});

employeesRouter.put("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = employeeSchema.parse(req.body);
  const actor = currentUser(req);
  const existing = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
  if (!existing) throw notFound("Employee");
  if (existing.user && existing.user.role !== input.role && actor.role !== "ADMIN")
    throw badRequest("Only an admin can change a user's role");

  const employee = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: toData(input) });
    if (existing.user) {
      await tx.user.update({ where: { id: existing.user.id }, data: { email: updated.email, role: input.role } });
    }
    return updated;
  });
  await audit(actor.id, "UPDATE", "Employee", id, {
    changed: Object.keys(input),
    salaryChanged: toNum(existing.baseSalary) !== input.baseSalary,
  });
  res.json(employee);
});

const deactivateSchema = z.object({ dateOfExit: dateString.optional() });

employeesRouter.post("/:id/deactivate", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { dateOfExit } = deactivateSchema.parse(req.body ?? {});
  const actor = currentUser(req);
  if (actor.employeeId === id) throw badRequest("You cannot deactivate your own account");
  const settings = await getSettings();
  const exit = dateOfExit ?? todayIn(settings.timezone);

  const employee = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: { status: "INACTIVE", dateOfExit: dateOnly(exit) } });
    await tx.user.updateMany({ where: { employeeId: id }, data: { isActive: false } });
    return updated;
  });
  await audit(actor.id, "DEACTIVATE", "Employee", id, { dateOfExit: exit });
  res.json(employee);
});

employeesRouter.post("/:id/activate", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const employee = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: { status: "ACTIVE", dateOfExit: null } });
    await tx.user.updateMany({ where: { employeeId: id }, data: { isActive: true } });
    return updated;
  });
  await audit(currentUser(req).id, "ACTIVATE", "Employee", id);
  res.json(employee);
});

employeesRouter.post("/:id/reset-password", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
  const result = await prisma.user.updateMany({
    where: { employeeId: id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  if (result.count === 0) throw notFound("Login for this employee");
  await audit(currentUser(req).id, "RESET_PASSWORD", "Employee", id);
  res.status(204).end();
});

// ───────────── Per-employee pay component overrides ─────────────

const overrideSchema = z.object({
  componentId: z.number().int(),
  amount: z.number().min(0).nullish(),
  percentage: z.number().min(0).nullish(),
  isDisabled: z.boolean().default(false),
});

employeesRouter.put("/:id/overrides", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const overrides = z.array(overrideSchema).parse(req.body);
  await prisma.$transaction([
    prisma.employeeComponentOverride.deleteMany({ where: { employeeId: id } }),
    prisma.employeeComponentOverride.createMany({
      data: overrides.map((o) => ({ ...o, employeeId: id, amount: o.amount ?? null, percentage: o.percentage ?? null })),
    }),
  ]);
  await audit(currentUser(req).id, "UPDATE_OVERRIDES", "Employee", id, overrides);
  res.json(await prisma.employeeComponentOverride.findMany({ where: { employeeId: id }, include: { component: true } }));
});
