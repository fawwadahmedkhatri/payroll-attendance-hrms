import { describe, expect, it } from "vitest";
import { evaluateDay, latePenaltyDays, summarizeMonth, type DayContext } from "../src/modules/attendance/rules";

const shift = { startTime: "09:30", endTime: "18:30", graceMinutes: 15, minFullDayHours: 8, minHalfDayHours: 4 };
const tz = "Asia/Kolkata";
const at = (time: string) => new Date(`2026-03-10T${time}:00+05:30`);

function ctx(overrides: Partial<DayContext> = {}): DayContext {
  return {
    date: "2026-03-10",
    timezone: tz,
    shift,
    punches: [],
    isHoliday: false,
    isWeeklyOff: false,
    leaveFraction: 0,
    isToday: false,
    ...overrides,
  };
}

describe("evaluateDay", () => {
  it("marks on-time full day as present", () => {
    const r = evaluateDay(ctx({ punches: [at("09:40"), at("18:35")] }))!;
    expect(r.status).toBe("PRESENT");
    expect(r.isLate).toBe(false);
    expect(r.workedMinutes).toBe(535);
  });

  it("marks late after the grace period with minutes from shift start", () => {
    const r = evaluateDay(ctx({ punches: [at("10:05"), at("18:35")] }))!;
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(35);
  });

  it("marks short days as half day or absent", () => {
    expect(evaluateDay(ctx({ punches: [at("09:30"), at("15:00")] }))!.status).toBe("HALF_DAY");
    expect(evaluateDay(ctx({ punches: [at("09:30"), at("11:00")] }))!.status).toBe("ABSENT");
  });

  it("marks a past working day with no punches as absent, but waits for today", () => {
    expect(evaluateDay(ctx())!.status).toBe("ABSENT");
    expect(evaluateDay(ctx({ isToday: true }))).toBeNull();
  });

  it("gives leave, holidays and weekly offs priority", () => {
    expect(evaluateDay(ctx({ leaveFraction: 1 }))!.status).toBe("ON_LEAVE");
    expect(evaluateDay(ctx({ isHoliday: true }))!.status).toBe("HOLIDAY");
    expect(evaluateDay(ctx({ isWeeklyOff: true }))!.status).toBe("WEEKLY_OFF");
  });

  it("counts a half-day leave with half the hours as present", () => {
    const r = evaluateDay(ctx({ punches: [at("09:30"), at("14:00")], leaveFraction: 0.5 }))!;
    expect(r.status).toBe("PRESENT");
  });
});

describe("summarizeMonth", () => {
  const dates = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"];
  const workingDates = new Set(dates.slice(0, 6)); // Sunday the 8th off
  const base = { dates, workingDates, countCalendarDays: true, joinDate: "2020-01-01", exitDate: null, lastProcessedDate: "2026-03-31" };
  const day = (date: string, status: any, extra: object = {}) => ({
    date,
    status,
    isLate: false,
    lateMinutes: 0,
    leaveFraction: 0,
    leaveIsPaid: null,
    ...extra,
  });

  it("splits present, paid/unpaid leave, absent and late", () => {
    const s = summarizeMonth(
      [
        day("2026-03-02", "PRESENT", { isLate: true, lateMinutes: 20 }),
        day("2026-03-03", "ON_LEAVE", { leaveFraction: 1, leaveIsPaid: true }),
        day("2026-03-04", "ON_LEAVE", { leaveFraction: 1, leaveIsPaid: false }),
        day("2026-03-05", "HALF_DAY"),
        day("2026-03-06", "ABSENT"),
        // 7th missing -> absent
        day("2026-03-08", "WEEKLY_OFF"),
      ],
      base,
    );
    expect(s).toEqual({
      workingDays: 6,
      presentDays: 1.5,
      paidLeaveDays: 1,
      unpaidLeaveDays: 1,
      absentDays: 2.5,
      notEmployedDays: 0,
      lateCount: 1,
      lateMinutes: 20,
    });
  });

  it("counts days before joining as not employed", () => {
    const s = summarizeMonth([], { ...base, joinDate: "2026-03-05", lastProcessedDate: "2026-03-01" });
    expect(s.notEmployedDays).toBe(3);
  });
});

describe("latePenaltyDays", () => {
  it("deducts per completed block of late marks", () => {
    expect(latePenaltyDays(2, 3, 0.5)).toBe(0);
    expect(latePenaltyDays(3, 3, 0.5)).toBe(0.5);
    expect(latePenaltyDays(7, 3, 0.5)).toBe(1);
  });
});
