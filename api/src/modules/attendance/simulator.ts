import { zonedInstant } from "../../lib/dates";

/**
 * Simulated biometric feed. Produces realistic punches for one day so the system can be
 * demonstrated without fingerprint/face hardware. The same generator seeds history.
 */

export interface SimEmployee {
  id: number;
  shift: { startTime: string; endTime: string };
}

export interface SimOptions {
  date: string;
  timezone: string;
  /** Only emit punches that happened before this instant (for "today") */
  until?: Date;
  rng?: () => number;
  absentRate?: number;
  lateRate?: number;
  halfDayRate?: number;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function simulateDay(employees: SimEmployee[], opts: SimOptions) {
  const rng = opts.rng ?? Math.random;
  const absentRate = opts.absentRate ?? 0.04;
  const lateRate = opts.lateRate ?? 0.12;
  const halfDayRate = opts.halfDayRate ?? 0.03;
  const between = (min: number, max: number) => Math.round(min + rng() * (max - min));
  const punches: { employeeId: number; punchedAt: Date }[] = [];

  for (const emp of employees) {
    const roll = rng();
    if (roll < absentRate) continue;

    const start = zonedInstant(opts.date, emp.shift.startTime, opts.timezone);
    let end = zonedInstant(opts.date, emp.shift.endTime, opts.timezone);
    if (end <= start) end = addMinutes(end, 24 * 60);

    const isLate = roll < absentRate + lateRate;
    const checkIn = addMinutes(start, isLate ? between(16, 75) : between(-20, 12));
    const isHalfDay = !isLate && roll < absentRate + lateRate + halfDayRate;
    const checkOut = isHalfDay ? addMinutes(checkIn, between(250, 400)) : addMinutes(end, between(-5, 50));
    // Seconds make the data look like a real device log
    checkIn.setSeconds(between(0, 59));
    checkOut.setSeconds(between(0, 59));

    for (const punchedAt of [checkIn, checkOut]) {
      if (!opts.until || punchedAt <= opts.until) punches.push({ employeeId: emp.id, punchedAt });
    }
  }
  return punches;
}

/** Small deterministic RNG so seed data is the same on every run. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
