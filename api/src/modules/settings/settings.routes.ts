import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { audit } from "../../lib/audit";
import { dateOnly } from "../../lib/dates";
import { badRequest } from "../../lib/errors";
import { dateString, idParam, timeString } from "../../lib/validate";
import { authenticate, currentUser, requireAdmin, requireHR } from "../../middleware/auth";
import { getSettings } from "./settings.service";

// ───────────── Branding (public read: the login page is branded before sign-in) ─────────────

const brandingSelect = {
  companyName: true,
  productName: true,
  brandColor: true,
  accentColor: true,
  logoDataUrl: true,
  defaultTheme: true,
  cornerStyle: true,
  updatedAt: true,
} as const;

export const brandingRouter = Router();

brandingRouter.get("/", async (_req, res) => {
  const branding = await prisma.companySettings.findUnique({ where: { id: 1 }, select: brandingSelect });
  res.setHeader("Cache-Control", "no-cache");
  res.json(branding);
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3a5ce0");
const MAX_LOGO_CHARS = 400_000; // ≈ 300 KB of image data once base64-encoded

const brandingSchema = z.object({
  productName: z.string().trim().min(1).max(40),
  brandColor: hexColor,
  accentColor: hexColor,
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_CHARS, "Logo is too large — use an image under 300 KB")
    .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG, JPEG, WebP or SVG image")
    .nullable(),
  defaultTheme: z.enum(["light", "dark", "system"]),
  cornerStyle: z.enum(["sharp", "soft", "rounded"]),
});

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.put("/branding", requireAdmin, async (req, res) => {
  const data = brandingSchema.parse(req.body);
  const branding = await prisma.companySettings.update({ where: { id: 1 }, data, select: brandingSelect });
  const { logoDataUrl, ...logged } = data;
  await audit(currentUser(req).id, "UPDATE", "Branding", 1, { ...logged, logoChanged: logoDataUrl !== undefined });
  res.json(branding);
});

// ───────────── Company ─────────────

const companySchema = z.object({
  companyName: z.string().min(1),
  address: z.string().nullish(),
  countryCode: z.string().min(2).max(3),
  currencyCode: z.string().min(3).max(3),
  currencySymbol: z.string().min(1).max(5),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6),
  payDivisorMode: z.enum(["CALENDAR_DAYS", "WORKING_DAYS", "FIXED_DAYS"]),
  fixedPayDays: z.number().int().min(1).max(31),
  lateDeductionMode: z.enum(["NONE", "COUNT_BASED", "PER_MINUTE"]),
  latesPerPenalty: z.number().int().min(1).max(31),
  latePenaltyDays: z.number().min(0).max(31),
});

settingsRouter.get("/company", async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put("/company", requireAdmin, async (req, res) => {
  const data = companySchema.parse(req.body);
  const settings = await prisma.companySettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(currentUser(req).id, "UPDATE", "CompanySettings", 1, data);
  res.json(settings);
});

// ───────────── Generic CRUD for simple lookup tables ─────────────

type Delegate = {
  findMany: (args?: any) => Promise<any[]>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

function crud(path: string, entity: string, delegate: Delegate, schema: z.ZodTypeAny, orderBy: object, readRole = requireHR) {
  settingsRouter.get(`/${path}`, readRole, async (_req, res) => {
    res.json(await delegate.findMany({ orderBy }));
  });
  settingsRouter.post(`/${path}`, requireAdmin, async (req, res) => {
    const data = schema.parse(req.body);
    const row = await delegate.create({ data });
    await audit(currentUser(req).id, "CREATE", entity, row.id, data);
    res.status(201).json(row);
  });
  settingsRouter.put(`/${path}/:id`, requireAdmin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const data = (schema as z.AnyZodObject).partial().parse(req.body);
    const row = await delegate.update({ where: { id }, data });
    await audit(currentUser(req).id, "UPDATE", entity, id, data);
    res.json(row);
  });
  settingsRouter.delete(`/${path}/:id`, requireAdmin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await delegate.delete({ where: { id } });
    await audit(currentUser(req).id, "DELETE", entity, id);
    res.status(204).end();
  });
}

crud("departments", "Department", prisma.department, z.object({ code: z.string().min(1).max(10), name: z.string().min(1) }), { name: "asc" });
crud("designations", "Designation", prisma.designation, z.object({ title: z.string().min(1) }), { title: "asc" });

const shiftSchema = z
  .object({
    name: z.string().min(1),
    startTime: timeString,
    endTime: timeString,
    graceMinutes: z.number().int().min(0).max(240),
    minFullDayHours: z.number().min(0).max(24),
    minHalfDayHours: z.number().min(0).max(24),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((s) => s.minHalfDayHours <= s.minFullDayHours, "Half-day hours cannot exceed full-day hours");

settingsRouter.get("/shifts", requireHR, async (_req, res) => {
  res.json(await prisma.shift.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } }));
});

async function saveShift(id: number | null, data: z.infer<typeof shiftSchema>) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.shift.updateMany({ data: { isDefault: false } });
    return id ? tx.shift.update({ where: { id }, data }) : tx.shift.create({ data });
  });
}

settingsRouter.post("/shifts", requireAdmin, async (req, res) => {
  const data = shiftSchema.parse(req.body);
  const shift = await saveShift(null, data);
  await audit(currentUser(req).id, "CREATE", "Shift", shift.id, data);
  res.status(201).json(shift);
});

settingsRouter.put("/shifts/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = shiftSchema.parse(req.body);
  const shift = await saveShift(id, data);
  await audit(currentUser(req).id, "UPDATE", "Shift", id, data);
  res.json(shift);
});

settingsRouter.delete("/shifts/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const inUse = await prisma.employee.count({ where: { shiftId: id } });
  if (inUse > 0) throw badRequest(`${inUse} employees are assigned to this shift. Reassign them first or deactivate the shift.`);
  await prisma.shift.delete({ where: { id } });
  await audit(currentUser(req).id, "DELETE", "Shift", id);
  res.status(204).end();
});

// ───────────── Holidays ─────────────

const holidaySchema = z.object({ date: dateString, name: z.string().min(1) });

settingsRouter.get("/holidays", async (req, res) => {
  const year = z.coerce.number().int().optional().parse(req.query.year);
  const where = year ? { date: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) } } : {};
  res.json(await prisma.holiday.findMany({ where, orderBy: { date: "asc" } }));
});

settingsRouter.post("/holidays", requireAdmin, async (req, res) => {
  const data = holidaySchema.parse(req.body);
  const holiday = await prisma.holiday.create({ data: { name: data.name, date: dateOnly(data.date) } });
  await audit(currentUser(req).id, "CREATE", "Holiday", holiday.id, data);
  res.status(201).json(holiday);
});

settingsRouter.put("/holidays/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = holidaySchema.parse(req.body);
  const holiday = await prisma.holiday.update({ where: { id }, data: { name: data.name, date: dateOnly(data.date) } });
  res.json(holiday);
});

settingsRouter.delete("/holidays/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  await prisma.holiday.delete({ where: { id } });
  await audit(currentUser(req).id, "DELETE", "Holiday", id);
  res.status(204).end();
});

// ───────────── Leave types ─────────────

const leaveTypeSchema = z.object({
  code: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  name: z.string().min(1),
  annualQuota: z.number().min(0).max(365).nullable(),
  isPaid: z.boolean(),
  allowHalfDay: z.boolean(),
  carryForward: z.boolean(),
  maxCarryForward: z.number().min(0).max(365),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  isActive: z.boolean().default(true),
});

settingsRouter.get("/leave-types", async (_req, res) => {
  res.json(await prisma.leaveType.findMany({ orderBy: { name: "asc" } }));
});

settingsRouter.post("/leave-types", requireAdmin, async (req, res) => {
  const data = leaveTypeSchema.parse(req.body);
  const type = await prisma.leaveType.create({ data });
  await audit(currentUser(req).id, "CREATE", "LeaveType", type.id, data);
  res.status(201).json(type);
});

settingsRouter.put("/leave-types/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = leaveTypeSchema.parse(req.body);
  const type = await prisma.leaveType.update({ where: { id }, data });
  await audit(currentUser(req).id, "UPDATE", "LeaveType", id, data);
  res.json(type);
});

settingsRouter.delete("/leave-types/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const used = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
  if (used > 0) {
    // Keep history intact; just hide it from new applications
    await prisma.leaveType.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.leaveBalance.deleteMany({ where: { leaveTypeId: id } });
    await prisma.leaveType.delete({ where: { id } });
  }
  await audit(currentUser(req).id, used > 0 ? "DEACTIVATE" : "DELETE", "LeaveType", id);
  res.status(204).end();
});

// ───────────── Pay components ─────────────

const slabSchema = z.object({
  from: z.number().min(0),
  to: z.number().min(0).nullable(),
  rate: z.number().min(0).max(100).nullish(),
  amount: z.number().min(0).nullish(),
});

const componentSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(20)
      .transform((s) => s.toUpperCase())
      .refine((c) => !["BASE_SALARY", "GROSS", "LOP", "LATE"].includes(c), "This code is reserved"),
    name: z.string().min(1),
    kind: z.enum(["EARNING", "DEDUCTION", "EMPLOYER_CONTRIBUTION"]),
    calcType: z.enum(["FIXED", "PERCENTAGE", "SLAB"]),
    amount: z.number().min(0).nullish(),
    percentage: z.number().min(0).max(1000).nullish(),
    baseCodes: z.array(z.string().min(1)).default([]),
    baseCap: z.number().min(0).nullish(),
    minAmount: z.number().min(0).nullish(),
    maxAmount: z.number().min(0).nullish(),
    slabs: z.array(slabSchema).nullish(),
    slabMode: z.enum(["PROGRESSIVE", "FLAT"]).nullish(),
    slabPeriod: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
    applyIfGrossMin: z.number().min(0).nullish(),
    applyIfGrossMax: z.number().min(0).nullish(),
    prorate: z.boolean().default(true),
    isTaxable: z.boolean().default(true),
    sequence: z.number().int().min(0).max(10000),
    isActive: z.boolean().default(true),
    description: z.string().nullish(),
  })
  .superRefine((c, ctx) => {
    if (c.calcType === "FIXED" && (c.amount === null || c.amount === undefined))
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount is required for a fixed component" });
    if (c.calcType === "PERCENTAGE" && (c.percentage === null || c.percentage === undefined))
      ctx.addIssue({ code: "custom", path: ["percentage"], message: "Percentage is required" });
    if (c.calcType !== "FIXED" && c.baseCodes.length === 0)
      ctx.addIssue({ code: "custom", path: ["baseCodes"], message: "Choose at least one base (e.g. BASE_SALARY, GROSS or a component)" });
    if (c.calcType === "SLAB" && (!c.slabs || c.slabs.length === 0))
      ctx.addIssue({ code: "custom", path: ["slabs"], message: "Add at least one slab" });
    if (c.calcType === "SLAB" && !c.slabMode)
      ctx.addIssue({ code: "custom", path: ["slabMode"], message: "Choose progressive or flat slabs" });
  });

async function validateBaseCodes(code: string, kind: string, sequence: number, baseCodes: string[]) {
  const others = await prisma.payComponent.findMany({ where: { code: { in: baseCodes } } });
  for (const base of baseCodes) {
    if (base === "BASE_SALARY") continue;
    if (base === "GROSS") {
      if (kind === "EARNING") throw badRequest("Earnings cannot be based on GROSS (it is the sum of earnings)");
      continue;
    }
    if (base === code) throw badRequest("A component cannot be based on itself");
    const other = others.find((o) => o.code === base);
    if (!other) throw badRequest(`Unknown base component ${base}`);
    if (kind === "EARNING" && other.kind !== "EARNING") throw badRequest("Earnings can only be based on other earnings");
    if (other.kind === kind && other.sequence >= sequence)
      throw badRequest(`${base} must come before ${code} in the calculation order (lower sequence)`);
  }
}

settingsRouter.get("/pay-components", requireHR, async (_req, res) => {
  res.json(await prisma.payComponent.findMany({ orderBy: [{ kind: "asc" }, { sequence: "asc" }] }));
});

settingsRouter.post("/pay-components", requireAdmin, async (req, res) => {
  const data = componentSchema.parse(req.body);
  await validateBaseCodes(data.code, data.kind, data.sequence, data.baseCodes);
  const component = await prisma.payComponent.create({ data: { ...data, slabs: data.slabs ?? undefined } });
  await audit(currentUser(req).id, "CREATE", "PayComponent", component.id, req.body);
  res.status(201).json(component);
});

settingsRouter.put("/pay-components/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = componentSchema.parse(req.body);
  await validateBaseCodes(data.code, data.kind, data.sequence, data.baseCodes);
  const component = await prisma.payComponent.update({
    where: { id },
    data: { ...data, slabs: data.slabs ?? undefined },
  });
  await audit(currentUser(req).id, "UPDATE", "PayComponent", id, req.body);
  res.json(component);
});

settingsRouter.delete("/pay-components/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const component = await prisma.payComponent.findUniqueOrThrow({ where: { id } });
  const dependents = await prisma.payComponent.findMany({ where: { baseCodes: { has: component.code } } });
  if (dependents.length > 0)
    throw badRequest(`Used as a base by ${dependents.map((d) => d.code).join(", ")}. Update those first.`);
  await prisma.payComponent.delete({ where: { id } });
  await audit(currentUser(req).id, "DELETE", "PayComponent", id);
  res.status(204).end();
});

// ───────────── Biometric devices ─────────────

function newDeviceKey() {
  const key = `dev_${crypto.randomBytes(24).toString("hex")}`;
  return { key, hash: crypto.createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 10) };
}

const deviceSchema = z.object({
  name: z.string().min(1),
  serialNumber: z.string().min(1),
  location: z.string().nullish(),
  isActive: z.boolean().default(true),
});

const deviceSelect = {
  id: true,
  name: true,
  serialNumber: true,
  location: true,
  apiKeyPrefix: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
  _count: { select: { punches: true } },
} as const;

settingsRouter.get("/devices", requireHR, async (_req, res) => {
  res.json(await prisma.device.findMany({ select: deviceSelect, orderBy: { name: "asc" } }));
});

settingsRouter.post("/devices", requireAdmin, async (req, res) => {
  const data = deviceSchema.parse(req.body);
  const { key, hash, prefix } = newDeviceKey();
  const device = await prisma.device.create({ data: { ...data, apiKeyHash: hash, apiKeyPrefix: prefix }, select: deviceSelect });
  await audit(currentUser(req).id, "CREATE", "Device", device.id, data);
  // The raw key is only ever returned here
  res.status(201).json({ ...device, apiKey: key });
});

settingsRouter.put("/devices/:id", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = deviceSchema.partial().parse(req.body);
  res.json(await prisma.device.update({ where: { id }, data, select: deviceSelect }));
});

settingsRouter.post("/devices/:id/rotate-key", requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { key, hash, prefix } = newDeviceKey();
  const device = await prisma.device.update({ where: { id }, data: { apiKeyHash: hash, apiKeyPrefix: prefix }, select: deviceSelect });
  await audit(currentUser(req).id, "ROTATE_KEY", "Device", id);
  res.json({ ...device, apiKey: key });
});

settingsRouter.get("/audit-logs", requireAdmin, async (req, res) => {
  const take = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit);
  res.json(
    await prisma.auditLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
  );
});
