import { DateTime } from "luxon";

/**
 * Date conventions used across the API:
 *  - Calendar dates ("2026-03-15") are plain strings in code and Postgres DATE columns
 *    (stored as UTC midnight by Prisma).
 *  - Punch / check-in instants are UTC Date objects, converted with the company timezone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  return DATE_RE.test(value) && DateTime.fromISO(value, { zone: "utc" }).isValid;
}

/** "YYYY-MM-DD" -> Date at UTC midnight (what Prisma expects for @db.Date). */
export function dateOnly(value: string): Date {
  return DateTime.fromISO(value, { zone: "utc" }).startOf("day").toJSDate();
}

/** Date (UTC midnight from a DATE column) -> "YYYY-MM-DD". */
export function toDateString(value: Date): string {
  return DateTime.fromJSDate(value, { zone: "utc" }).toISODate()!;
}

/** Inclusive list of "YYYY-MM-DD" strings. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = DateTime.fromISO(from, { zone: "utc" });
  const end = DateTime.fromISO(to, { zone: "utc" });
  while (cursor <= end) {
    days.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string): number {
  return DateTime.fromISO(date, { zone: "utc" }).weekday % 7;
}

/** Calendar date of an instant as seen in the company timezone. */
export function localDateOf(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate()!;
}

/** Instant for a wall-clock time ("09:30") on a date in the company timezone. */
export function zonedInstant(date: string, time: string, timezone: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toJSDate();
}

export function todayIn(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;
}

export function monthRange(year: number, month: number): { from: string; to: string; daysInMonth: number } {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: "utc" });
  return {
    from: start.toISODate()!,
    to: start.endOf("month").toISODate()!,
    daysInMonth: start.daysInMonth!,
  };
}

/** Minutes between "HH:mm" strings, wrapping past midnight for night shifts. */
export function shiftLengthMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

export function formatTime(instant: Date | null, timezone: string): string | null {
  if (!instant) return null;
  return DateTime.fromJSDate(instant, { zone: timezone }).toFormat("HH:mm");
}
