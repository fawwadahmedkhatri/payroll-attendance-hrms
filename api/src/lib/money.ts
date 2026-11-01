import type { Prisma } from "@prisma/client";

/** Round to 2 decimal places, avoiding floating point drift (1.005 -> 1.01). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convert a Prisma Decimal (or null) to a JS number. */
export function toNum(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function toNumOrNull(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}
