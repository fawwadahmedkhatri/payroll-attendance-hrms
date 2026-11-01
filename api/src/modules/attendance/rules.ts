import { shiftLengthMinutes, weekday, zonedInstant } from "../../lib/dates";

/**
 * Attendance rules (pure functions). Turns the raw punches of one employee on one day
 * into a daily status, using the employee's shift and the company calendar.
 */

export type DayStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "WEEKLY_OFF";

export interface ShiftRule {
  startTime: string;
  endTime: string;
  graceMinutes: number;
  minFullDayHours: number;
  minHalfDayHours: number;
}

export interface DayContext {
  date: string;
  timezone: string;
  shift: ShiftRule;
  punches: Date[];
  isHoliday: boolean;
  isWeeklyOff: boolean;
  /** 0, 0.5 or 1 from approved leave */
  leaveFraction: number;
  /** true when the day is still in progress (today) */
  isToday: boolean;
}

export interface DayResult {
  status: DayStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  isLate: boolean;
  remarks: string | null;
}

/** Returns null when no row should be stored yet (a working day today with no punches). */
export function evaluateDay(ctx: DayContext): DayResult | null {
  const sorted = [...ctx.punches].sort((a, b) => a.getTime() - b.getTime());
  const checkIn = sorted[0] ?? null;
  const checkOut = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const workedMinutes = checkIn && checkOut ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60000) : 0;
  const base = { checkIn, checkOut, workedMinutes, lateMinutes: 0, isLate: false, remarks: null as string | null };

  if (ctx.leaveFraction >= 1) return { ...base, status: "ON_LEAVE" };
  if (ctx.isHoliday) return { ...base, status: "HOLIDAY" };
  if (ctx.isWeeklyOff) return { ...base, status: "WEEKLY_OFF" };

  if (!checkIn) {
    if (ctx.isToday) return null;
    return { ...base, status: "ABSENT" };
  }

  const shiftStart = zonedInstant(ctx.date, ctx.shift.startTime, ctx.timezone);
  const minutesAfterStart = Math.round((checkIn.getTime() - shiftStart.getTime()) / 60000);
  const lateMinutes = minutesAfterStart > ctx.shift.graceMinutes ? minutesAfterStart : 0;
  const late = { lateMinutes, isLate: lateMinutes > 0 };

  if (!checkOut) {
    // Only one punch: still at work today, or a missed punch-out on a past day
    return { ...base, ...late, status: "PRESENT", remarks: ctx.isToday ? null : "Missing check-out punch" };
  }

  // A half-day leave lowers the hours needed for the day to count
  const needFull = ctx.shift.minFullDayHours * 60 * (1 - ctx.leaveFraction);
  const needHalf = ctx.shift.minHalfDayHours * 60 * (1 - ctx.leaveFraction);
  let status: DayStatus = "PRESENT";
  if (workedMinutes < needHalf) status = "ABSENT";
  else if (workedMinutes < needFull) status = "HALF_DAY";
  return { ...base, ...late, status };
}

export function isWeeklyOff(date: string, weeklyOffDays: number[]): boolean {
  return weeklyOffDays.includes(weekday(date));
}

export function shiftMinutes(shift: ShiftRule): number {
  return shiftLengthMinutes(shift.startTime, shift.endTime);
}

// ───────────────────────── Monthly summary for payroll ─────────────────────────

export interface SummaryDay {
  date: string;
  status: DayStatus;
  isLate: boolean;
  lateMinutes: number;
  leaveFraction: number;
  leaveIsPaid: boolean | null;
}

export interface MonthSummary {
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  notEmployedDays: number;
  lateCount: number;
  lateMinutes: number;
}

export interface SummaryOptions {
  dates: string[];
  workingDates: Set<string>;
  /** Divisor mode decides how days outside employment are counted */
  countCalendarDays: boolean;
  joinDate: string;
  exitDate: string | null;
  /** Past working days with no row are treated as absent */
  lastProcessedDate: string;
}

export function summarizeMonth(days: SummaryDay[], opts: SummaryOptions): MonthSummary {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const s: MonthSummary = {
    workingDays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    notEmployedDays: 0,
    lateCount: 0,
    lateMinutes: 0,
  };

  for (const date of opts.dates) {
    const working = opts.workingDates.has(date);
    if (working) s.workingDays += 1;

    const employed = date >= opts.joinDate && (!opts.exitDate || date <= opts.exitDate);
    if (!employed) {
      if (opts.countCalendarDays || working) s.notEmployedDays += 1;
      continue;
    }
    if (!working) continue;

    const day = byDate.get(date);
    if (!day) {
      if (date <= opts.lastProcessedDate) s.absentDays += 1;
      continue;
    }

    const leave = day.leaveFraction;
    const addLeave = (amount: number) => {
      if (day.leaveIsPaid === false) s.unpaidLeaveDays += amount;
      else s.paidLeaveDays += amount;
    };

    switch (day.status) {
      case "ON_LEAVE":
        addLeave(1);
        break;
      case "PRESENT":
        s.presentDays += 1 - leave;
        if (leave > 0) addLeave(leave);
        break;
      case "HALF_DAY":
        if (leave > 0) {
          s.presentDays += 1 - leave;
          addLeave(leave);
        } else {
          s.presentDays += 0.5;
          s.absentDays += 0.5;
        }
        break;
      case "ABSENT":
        if (leave > 0) addLeave(leave);
        s.absentDays += 1 - leave;
        break;
      default:
        // HOLIDAY / WEEKLY_OFF on a working date can happen after a manual edit: paid
        s.presentDays += 1;
    }
    if (day.isLate) {
      s.lateCount += 1;
      s.lateMinutes += day.lateMinutes;
    }
  }
  return s;
}

/** COUNT_BASED late rule: every `latesPerPenalty` late marks = `penaltyDays` deducted. */
export function latePenaltyDays(lateCount: number, latesPerPenalty: number, penaltyDays: number): number {
  if (latesPerPenalty <= 0) return 0;
  return Math.floor(lateCount / latesPerPenalty) * penaltyDays;
}
