import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId?: string | number | null,
  details?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: { userId: userId ?? null, action, entity, entityId: entityId?.toString() ?? null, details },
  });
}
