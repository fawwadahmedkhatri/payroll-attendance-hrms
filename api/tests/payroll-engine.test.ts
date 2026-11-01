import { describe, expect, it } from "vitest";
import { calculatePay, computeSlab, type ComponentRule, type PayInput } from "../src/modules/payroll/engine";

const rule = (r: Partial<ComponentRule> & Pick<ComponentRule, "code" | "kind" | "calcType">): ComponentRule => ({
  name: r.code,
  baseCodes: [],
  prorate: true,
  sequence: 10,
  ...r,
});

// A generic structure: Basic 50%, Housing 20%, Special 30% of base salary + fixed transport
const earnings: ComponentRule[] = [
  rule({ code: "BASIC", kind: "EARNING", calcType: "PERCENTAGE", percentage: 50, baseCodes: ["BASE_SALARY"], sequence: 1 }),
  rule({ code: "HRA", kind: "EARNING", calcType: "PERCENTAGE", percentage: 20, baseCodes: ["BASE_SALARY"], sequence: 2 }),
  rule({ code: "SPECIAL", kind: "EARNING", calcType: "PERCENTAGE", percentage: 30, baseCodes: ["BASE_SALARY"], sequence: 3 }),
  rule({ code: "TRANSPORT", kind: "EARNING", calcType: "FIXED", amount: 1000, prorate: false, sequence: 4 }),
];

const noLate = { mode: "NONE" as const, penaltyDays: 0, lateMinutes: 0, shiftMinutes: 540 };

function input(overrides: Partial<PayInput> = {}): PayInput {
  return { baseSalary: 30000, rules: earnings, divisorDays: 30, lopDays: 0, late: noLate, ...overrides };
}

describe("calculatePay", () => {
  it("pays full earnings when there is no loss of pay", () => {
    const r = calculatePay(input());
    expect(r.grossEarnings).toBe(31000);
    expect(r.lopDeduction).toBe(0);
    expect(r.netPay).toBe(31000);
  });

  it("deducts loss of pay from prorated earnings only", () => {
    // per day = 30000 / 30 = 1000; transport (not prorated) is untouched
    const r = calculatePay(input({ lopDays: 2 }));
    expect(r.lopDeduction).toBe(2000);
    expect(r.earnedGross).toBe(29000);
    expect(r.netPay).toBe(29000);
    expect(r.lines.find((l) => l.code === "LOP")?.amount).toBe(2000);
  });

  it("applies the count-based late rule", () => {
    const r = calculatePay(input({ late: { ...noLate, mode: "COUNT_BASED", penaltyDays: 0.5 } }));
    expect(r.lateDeduction).toBe(500);
    expect(r.netPay).toBe(30500);
  });

  it("applies the per-minute late rule", () => {
    // per minute = 1000 / 540; 54 minutes = 100
    const r = calculatePay(input({ late: { ...noLate, mode: "PER_MINUTE", lateMinutes: 54 } }));
    expect(r.lateDeduction).toBe(100);
  });

  it("never deducts more than the prorated earnings", () => {
    const r = calculatePay(input({ lopDays: 45 }));
    expect(r.lopDeduction).toBe(30000);
    expect(r.netPay).toBe(1000);
  });

  it("calculates percentage deductions on earned values with a base cap", () => {
    const pension = rule({
      code: "PENSION",
      kind: "DEDUCTION",
      calcType: "PERCENTAGE",
      percentage: 12,
      baseCodes: ["BASIC"],
      baseCap: 10000,
      sequence: 20,
    });
    // BASIC full 15000 -> earned 15000 with no LOP -> capped at 10000 -> 1200
    const r = calculatePay(input({ rules: [...earnings, pension] }));
    expect(r.lines.find((l) => l.code === "PENSION")?.amount).toBe(1200);
    expect(r.netPay).toBe(29800);

    // With 20 LOP days BASIC earned = 5000 -> 600
    const r2 = calculatePay(input({ rules: [...earnings, pension], lopDays: 20 }));
    expect(r2.lines.find((l) => l.code === "PENSION")?.amount).toBe(600);
  });

  it("skips a rule outside its gross condition", () => {
    const insurance = rule({
      code: "INS",
      kind: "DEDUCTION",
      calcType: "PERCENTAGE",
      percentage: 1,
      baseCodes: ["GROSS"],
      applyIfGrossMax: 21000,
      sequence: 21,
    });
    expect(calculatePay(input({ rules: [...earnings, insurance] })).lines.some((l) => l.code === "INS")).toBe(false);
    const low = calculatePay(input({ rules: [...earnings, insurance], baseSalary: 15000 }));
    expect(low.lines.find((l) => l.code === "INS")?.amount).toBe(160); // 1% of 16000
  });

  it("keeps employer contributions out of net pay", () => {
    const employer = rule({
      code: "PENSION_ER",
      kind: "EMPLOYER_CONTRIBUTION",
      calcType: "PERCENTAGE",
      percentage: 12,
      baseCodes: ["BASIC"],
      sequence: 30,
    });
    const r = calculatePay(input({ rules: [...earnings, employer] }));
    expect(r.employerContributions).toBe(1800);
    expect(r.netPay).toBe(31000);
  });

  it("calculates annual progressive income tax monthly", () => {
    const tax = rule({
      code: "TAX",
      kind: "DEDUCTION",
      calcType: "SLAB",
      baseCodes: ["GROSS"],
      slabMode: "PROGRESSIVE",
      slabPeriod: "ANNUAL",
      slabs: [
        { from: 0, to: 250000, rate: 0 },
        { from: 250000, to: 500000, rate: 10 },
        { from: 500000, to: null, rate: 20 },
      ],
      sequence: 40,
    });
    // gross 31000 x 12 = 372000 -> 10% of 122000 = 12200 / 12 = 1016.67
    const r = calculatePay(input({ rules: [...earnings, tax] }));
    expect(r.lines.find((l) => l.code === "TAX")?.amount).toBe(1016.67);
  });
});

describe("computeSlab", () => {
  const slabs = [
    { from: 0, to: 10000, amount: 0 },
    { from: 10000, to: 20000, amount: 150 },
    { from: 20000, to: null, amount: 200 },
  ];

  it("FLAT returns the amount of the matching band", () => {
    expect(computeSlab(5000, slabs, "FLAT")).toBe(0);
    expect(computeSlab(15000, slabs, "FLAT")).toBe(150);
    expect(computeSlab(50000, slabs, "FLAT")).toBe(200);
  });

  it("PROGRESSIVE sums each band at its own rate", () => {
    const tax = [
      { from: 0, to: 1000, rate: 0 },
      { from: 1000, to: 2000, rate: 10 },
      { from: 2000, to: null, rate: 30 },
    ];
    expect(computeSlab(2500, tax, "PROGRESSIVE")).toBe(250);
  });
});
