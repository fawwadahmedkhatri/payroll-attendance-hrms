import { round2 } from "../../lib/money";

/**
 * Country-agnostic payroll engine (pure functions, no database access).
 *
 * A company models its payroll by defining pay components:
 *   - FIXED       a flat amount                              e.g. Transport allowance 1,500
 *   - PERCENTAGE  rate x sum(base components), base capped    e.g. Pension 12% of BASIC capped at 15,000
 *   - SLAB        ranges, either PROGRESSIVE (tax brackets)   e.g. Income tax 0% / 10% / 20%
 *                 or FLAT (amount for the matched range)      e.g. Professional tax 200 if gross > 15,000
 * plus an optional "apply only if gross is between X and Y" condition.
 *
 * Calculation order:
 *   1. Earnings at their full monthly value (by sequence).
 *   2. Loss of pay = per-day pay x LOP days; late deduction per the company late rule.
 *      Per-day pay = sum of prorated earnings / divisor days.
 *   3. Prorated earnings are scaled down by those deductions -> "earned" values and earned GROSS.
 *   4. Deductions and employer contributions are calculated on earned values.
 */

export type ComponentKind = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";
export type CalcType = "FIXED" | "PERCENTAGE" | "SLAB";
export type LateMode = "NONE" | "COUNT_BASED" | "PER_MINUTE";

export interface Slab {
  from: number;
  to: number | null;
  rate?: number | null;
  amount?: number | null;
}

export interface ComponentRule {
  code: string;
  name: string;
  kind: ComponentKind;
  calcType: CalcType;
  amount?: number | null;
  percentage?: number | null;
  baseCodes: string[];
  baseCap?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  slabs?: Slab[] | null;
  slabMode?: "PROGRESSIVE" | "FLAT" | null;
  slabPeriod?: "MONTHLY" | "ANNUAL";
  applyIfGrossMin?: number | null;
  applyIfGrossMax?: number | null;
  prorate: boolean;
  sequence: number;
}

export interface PayInput {
  baseSalary: number;
  rules: ComponentRule[];
  divisorDays: number;
  /** Absent + unpaid leave + days outside employment */
  lopDays: number;
  late: {
    mode: LateMode;
    /** COUNT_BASED: days to deduct (already computed from the late count) */
    penaltyDays: number;
    /** PER_MINUTE: total late minutes in the month */
    lateMinutes: number;
    /** Shift length, used to derive the per-minute rate */
    shiftMinutes: number;
  };
}

export interface PayLine {
  code: string;
  name: string;
  kind: ComponentKind;
  amount: number;
  sequence: number;
}

export interface PayResult {
  lines: PayLine[];
  /** Earnings at full monthly value (before loss of pay) */
  grossEarnings: number;
  /** Earnings after loss-of-pay and late deductions; base for statutory deductions */
  earnedGross: number;
  lopDeduction: number;
  lateDeduction: number;
  /** All deductions, including loss of pay and late */
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
}

export const LOP_CODE = "LOP";
export const LATE_CODE = "LATE";
export const BASE_SALARY = "BASE_SALARY";
export const GROSS = "GROSS";

export function computeSlab(base: number, slabs: Slab[], mode: "PROGRESSIVE" | "FLAT"): number {
  const sorted = [...slabs].sort((a, b) => a.from - b.from);
  if (mode === "FLAT") {
    const match = sorted.find((s) => base >= s.from && (s.to === null || base <= s.to));
    if (!match) return 0;
    if (match.amount !== null && match.amount !== undefined) return match.amount;
    return (base * (match.rate ?? 0)) / 100;
  }
  let total = 0;
  for (const slab of sorted) {
    if (base <= slab.from) break;
    const upper = slab.to === null ? base : Math.min(base, slab.to);
    total += ((upper - slab.from) * (slab.rate ?? 0)) / 100;
  }
  return total;
}

function sumBase(codes: string[], values: Map<string, number>): number {
  return codes.reduce((sum, code) => sum + (values.get(code) ?? 0), 0);
}

function clamp(value: number, min?: number | null, max?: number | null): number {
  let result = value;
  if (min !== null && min !== undefined) result = Math.max(result, min);
  if (max !== null && max !== undefined) result = Math.min(result, max);
  return result;
}

/** Evaluate one rule against the values calculated so far. */
export function evaluateRule(rule: ComponentRule, values: Map<string, number>): number {
  let raw: number;
  switch (rule.calcType) {
    case "FIXED":
      raw = rule.amount ?? 0;
      break;
    case "PERCENTAGE": {
      let base = sumBase(rule.baseCodes, values);
      if (rule.baseCap !== null && rule.baseCap !== undefined) base = Math.min(base, rule.baseCap);
      raw = (base * (rule.percentage ?? 0)) / 100;
      break;
    }
    case "SLAB": {
      let base = sumBase(rule.baseCodes, values);
      if (rule.baseCap !== null && rule.baseCap !== undefined) base = Math.min(base, rule.baseCap);
      const annual = rule.slabPeriod === "ANNUAL";
      const result = computeSlab(annual ? base * 12 : base, rule.slabs ?? [], rule.slabMode ?? "PROGRESSIVE");
      raw = annual ? result / 12 : result;
      break;
    }
    default:
      raw = 0;
  }
  return round2(Math.max(0, clamp(raw, rule.minAmount, rule.maxAmount)));
}

function appliesForGross(rule: ComponentRule, gross: number): boolean {
  if (rule.applyIfGrossMin !== null && rule.applyIfGrossMin !== undefined && gross < rule.applyIfGrossMin) return false;
  if (rule.applyIfGrossMax !== null && rule.applyIfGrossMax !== undefined && gross > rule.applyIfGrossMax) return false;
  return true;
}

export function calculatePay(input: PayInput): PayResult {
  const rules = [...input.rules].sort((a, b) => a.sequence - b.sequence);
  const earnings = rules.filter((r) => r.kind === "EARNING");
  const others = rules.filter((r) => r.kind !== "EARNING");

  // 1. Full earnings
  const full = new Map<string, number>([[BASE_SALARY, input.baseSalary]]);
  for (const rule of earnings) full.set(rule.code, evaluateRule(rule, full));
  const grossEarnings = round2(earnings.reduce((s, r) => s + (full.get(r.code) ?? 0), 0));
  const proratedFull = earnings.filter((r) => r.prorate).reduce((s, r) => s + (full.get(r.code) ?? 0), 0);

  // 2. Loss of pay and late deductions
  const divisor = input.divisorDays > 0 ? input.divisorDays : 1;
  const perDay = proratedFull / divisor;
  const lopDays = Math.min(Math.max(input.lopDays, 0), divisor);
  let lopDeduction = round2(perDay * lopDays);

  let lateDeduction = 0;
  if (input.late.mode === "COUNT_BASED") {
    lateDeduction = round2(perDay * Math.max(input.late.penaltyDays, 0));
  } else if (input.late.mode === "PER_MINUTE" && input.late.shiftMinutes > 0) {
    lateDeduction = round2((perDay / input.late.shiftMinutes) * Math.max(input.late.lateMinutes, 0));
  }
  // Never deduct more than the prorated earnings
  lopDeduction = Math.min(lopDeduction, round2(proratedFull));
  lateDeduction = Math.min(lateDeduction, round2(proratedFull - lopDeduction));

  // 3. Earned values
  const factor = proratedFull > 0 ? 1 - (lopDeduction + lateDeduction) / proratedFull : 1;
  const earned = new Map<string, number>([[BASE_SALARY, input.baseSalary]]);
  for (const rule of earnings) {
    const value = full.get(rule.code) ?? 0;
    earned.set(rule.code, rule.prorate ? round2(value * factor) : value);
  }
  const earnedGross = round2(grossEarnings - lopDeduction - lateDeduction);
  earned.set(GROSS, earnedGross);

  // 4. Deductions and employer contributions on earned values
  const lines: PayLine[] = earnings.map((r) => ({
    code: r.code,
    name: r.name,
    kind: r.kind,
    amount: full.get(r.code) ?? 0,
    sequence: r.sequence,
  }));
  if (lopDeduction > 0) {
    lines.push({ code: LOP_CODE, name: "Loss of Pay (absence / unpaid leave)", kind: "DEDUCTION", amount: lopDeduction, sequence: 0 });
  }
  if (lateDeduction > 0) {
    lines.push({ code: LATE_CODE, name: "Late Attendance Deduction", kind: "DEDUCTION", amount: lateDeduction, sequence: 1 });
  }

  let otherDeductions = 0;
  let employerContributions = 0;
  for (const rule of others) {
    if (!appliesForGross(rule, earnedGross)) continue;
    const amount = evaluateRule(rule, earned);
    earned.set(rule.code, amount);
    if (amount <= 0) continue;
    lines.push({ code: rule.code, name: rule.name, kind: rule.kind, amount, sequence: rule.sequence });
    if (rule.kind === "DEDUCTION") otherDeductions += amount;
    else employerContributions += amount;
  }

  const totalDeductions = round2(lopDeduction + lateDeduction + otherDeductions);
  return {
    lines,
    grossEarnings,
    earnedGross,
    lopDeduction,
    lateDeduction,
    totalDeductions,
    employerContributions: round2(employerContributions),
    netPay: round2(grossEarnings - totalDeductions),
  };
}
