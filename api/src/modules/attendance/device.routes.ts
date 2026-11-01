import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { unauthorized } from "../../lib/errors";
import { ingestPunches } from "./attendance.service";

/**
 * Public endpoint for biometric (fingerprint / face recognition) terminals or their middleware.
 * Authenticated with a per-device API key in the X-Device-Key header — not a user login.
 *
 * POST /api/device/punches
 * { "punches": [ { "userId": "EMP0001", "timestamp": "2026-03-10T09:31:12+05:30" } ] }
 */
export const deviceRouter = Router();

const punchSchema = z.object({
  punches: z
    .array(
      z.object({
        userId: z.string().min(1),
        timestamp: z.string().datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(5000),
});

deviceRouter.post("/punches", async (req, res) => {
  const key = req.header("x-device-key");
  if (!key) throw unauthorized("Missing X-Device-Key header");
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const device = await prisma.device.findUnique({ where: { apiKeyHash: hash } });
  if (!device || !device.isActive) throw unauthorized("Unknown or inactive device key");

  const { punches } = punchSchema.parse(req.body);
  const userIds = [...new Set(punches.map((p) => p.userId))];
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", OR: [{ biometricId: { in: userIds } }, { employeeCode: { in: userIds } }] },
    select: { id: true, biometricId: true, employeeCode: true },
  });
  const lookup = new Map<string, number>();
  for (const e of employees) {
    lookup.set(e.employeeCode, e.id);
    if (e.biometricId) lookup.set(e.biometricId, e.id);
  }

  const unknown = userIds.filter((id) => !lookup.has(id));
  const accepted = punches
    .filter((p) => lookup.has(p.userId))
    .map((p) => ({ employeeId: lookup.get(p.userId)!, punchedAt: new Date(p.timestamp) }));

  const result = await ingestPunches(accepted, "DEVICE", device.id);
  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  res.json({ device: device.serialNumber, received: punches.length, ...result, unknownUserIds: unknown });
});
