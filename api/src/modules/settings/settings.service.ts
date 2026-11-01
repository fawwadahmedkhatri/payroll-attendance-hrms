import type { CompanySettings } from "@prisma/client";
import { prisma } from "../../db";
import { dateOnly, eachDay, toDateString, weekday } from "../../lib/dates";
import { badRequest } from "../../lib/errors";

export async function getSettings(): Promise<CompanySettings> {
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!settings) throw badRequest("Company settings are not configured yet. Run the database seed first.");
  return settings;
}

export async function getDefaultShift() {
  const shift = await prisma.shift.findFirst({ where: { isDefault: true, isActive: true } });
  if (!shift) throw badRequest("No default shift configured. Add a shift in Settings.");
  return shift;
}

/** Holidays between two dates as a set of "YYYY-MM-DD". */
export async function holidaySet(from: string, to: string): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
    select: { date: true },
  });
  return new Set(holidays.map((h) => toDateString(h.date)));
}

/** Working dates = all dates minus weekly offs and holidays. */
export async function workingDates(from: string, to: string, weeklyOffDays: number[]): Promise<Set<string>> {
  const holidays = await holidaySet(from, to);
  return new Set(eachDay(from, to).filter((d) => !weeklyOffDays.includes(weekday(d)) && !holidays.has(d)));
}
