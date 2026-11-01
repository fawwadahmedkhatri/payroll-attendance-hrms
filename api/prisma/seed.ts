/**
 * Seeds a complete demo company:
 *   - generic company settings, 2 shifts, holidays, leave types and a sample pay structure
 *   - 500 employees (plus admin + HR logins) with login accounts
 *   - ~3 months of simulated biometric punches, leave history and payroll runs
 *
 * Every rule seeded here is ordinary data that the admin can change in Settings.
 * Run: npm run db:seed   (skips if employees already exist; set SEED_FORCE=true to wipe and reseed)
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { DateTime } from "luxon";
import { prisma } from "../src/db";
import { addDays, dateOnly, eachDay, monthRange, todayIn } from "../src/lib/dates";
import { processRange } from "../src/modules/attendance/attendance.service";
import { isWeeklyOff } from "../src/modules/attendance/rules";
import { seededRandom, simulateDay } from "../src/modules/attendance/simulator";
import { countLeaveDays } from "../src/modules/leave/leave.service";
import { finalizeRun, processPayrollRun } from "../src/modules/payroll/payroll.service";
import { BANKS, DEPARTMENTS, DESIGNATIONS, FIRST_NAMES, LAST_NAMES } from "./seed-data";

const EMPLOYEE_COUNT = 500;
const HISTORY_MONTHS = 3;
const TIMEZONE = process.env.SEED_TIMEZONE ?? "Asia/Kolkata";

// Test logins for the demo (documented in README)
const ADMIN = { email: "admin@hrms.local", password: "Admin@123" };
const HR = { email: "hr@hrms.local", password: "Hr@12345" };
const EMPLOYEE_PASSWORD = "Employee@123";

const rng = seededRandom(20260101);
const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)];
const weighted = <T extends { weight: number }>(list: T[]) => {
  const total = list.reduce((s, i) => s + i.weight, 0);
  let roll = rng() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
};
const between = (min: number, max: number) => Math.round(min + rng() * (max - min));

async function wipe() {
  console.log("Wiping existing data…");
  await prisma.$transaction([
    prisma.payslipLine.deleteMany(),
    prisma.payslip.deleteMany(),
    prisma.payrollRun.deleteMany(),
    prisma.attendanceDay.deleteMany(),
    prisma.punch.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.employeeComponentOverride.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.device.deleteMany(),
    prisma.payComponent.deleteMany(),
    prisma.leaveType.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.designation.deleteMany(),
    prisma.department.deleteMany(),
    prisma.companySettings.deleteMany(),
  ]);
}

async function seedConfiguration(year: number) {
  await prisma.companySettings.create({
    data: {
      id: 1,
      companyName: "Acme Industries Pvt. Ltd.",
      address: "12 Business Park Road, Tech City",
      countryCode: "IN",
      currencyCode: "INR",
      currencySymbol: "₹",
      timezone: TIMEZONE,
      weeklyOffDays: [0], // Sunday
      payDivisorMode: "CALENDAR_DAYS",
      fixedPayDays: 30,
      lateDeductionMode: "COUNT_BASED",
      latesPerPenalty: 3,
      latePenaltyDays: 0.5,
    },
  });

  await prisma.shift.createMany({
    data: [
      { name: "General Shift", startTime: "09:30", endTime: "18:30", graceMinutes: 15, minFullDayHours: 8, minHalfDayHours: 4, isDefault: true },
      { name: "Early Shift", startTime: "07:00", endTime: "16:00", graceMinutes: 10, minFullDayHours: 8, minHalfDayHours: 4 },
    ],
  });

  await prisma.department.createMany({ data: DEPARTMENTS.map(({ code, name }) => ({ code, name })) });
  await prisma.designation.createMany({ data: DESIGNATIONS.map(({ title }) => ({ title })) });

  const holidays: [string, string][] = [
    ["01-01", "New Year's Day"],
    ["01-26", "Republic Day"],
    ["03-14", "Spring Festival"],
    ["05-01", "Labour Day"],
    ["08-15", "Independence Day"],
    ["10-02", "Founders' Day"],
    ["10-20", "Festival of Lights"],
    ["12-25", "Christmas Day"],
  ];
  await prisma.holiday.createMany({
    data: [year - 1, year].flatMap((y) => holidays.map(([md, name]) => ({ date: dateOnly(`${y}-${md}`), name }))),
  });

  await prisma.leaveType.createMany({
    data: [
      { code: "CL", name: "Casual Leave", annualQuota: 12, isPaid: true, allowHalfDay: true, carryForward: false, color: "#0ea5e9" },
      { code: "SL", name: "Sick Leave", annualQuota: 10, isPaid: true, allowHalfDay: true, carryForward: true, maxCarryForward: 5, color: "#f43f5e" },
      { code: "AL", name: "Annual / Earned Leave", annualQuota: 15, isPaid: true, allowHalfDay: false, carryForward: true, maxCarryForward: 30, color: "#10b981" },
      { code: "UL", name: "Unpaid Leave", annualQuota: null, isPaid: false, allowHalfDay: true, carryForward: false, color: "#f59e0b" },
    ],
  });

  // A sample salary structure. Admins rename/replace these to match their country's rules.
  await prisma.payComponent.createMany({
    data: [
      { code: "BASIC", name: "Basic Salary", kind: "EARNING", calcType: "PERCENTAGE", percentage: 50, baseCodes: ["BASE_SALARY"], sequence: 10 },
      { code: "HRA", name: "House Rent Allowance", kind: "EARNING", calcType: "PERCENTAGE", percentage: 20, baseCodes: ["BASE_SALARY"], sequence: 20 },
      { code: "SPECIAL", name: "Special Allowance", kind: "EARNING", calcType: "PERCENTAGE", percentage: 30, baseCodes: ["BASE_SALARY"], sequence: 30 },
      {
        code: "TRANSPORT",
        name: "Transport Allowance",
        kind: "EARNING",
        calcType: "FIXED",
        amount: 1600,
        prorate: false,
        sequence: 40,
        description: "Fixed allowance, not reduced for absence",
      },
      {
        code: "RETIRE",
        name: "Retirement Fund (Employee)",
        kind: "DEDUCTION",
        calcType: "PERCENTAGE",
        percentage: 12,
        baseCodes: ["BASIC"],
        baseCap: 15000,
        sequence: 10,
        description: "12% of Basic, Basic capped at 15,000",
      },
      {
        code: "HEALTH",
        name: "Health Insurance (Employee)",
        kind: "DEDUCTION",
        calcType: "PERCENTAGE",
        percentage: 0.75,
        baseCodes: ["GROSS"],
        applyIfGrossMax: 21000,
        sequence: 20,
        description: "Only for employees earning up to 21,000",
      },
      {
        code: "PTAX",
        name: "Professional Tax",
        kind: "DEDUCTION",
        calcType: "SLAB",
        baseCodes: ["GROSS"],
        slabMode: "FLAT",
        slabs: [
          { from: 0, to: 15000, amount: 0 },
          { from: 15000, to: 20000, amount: 150 },
          { from: 20000, to: null, amount: 200 },
        ],
        sequence: 30,
      },
      {
        code: "INCTAX",
        name: "Income Tax",
        kind: "DEDUCTION",
        calcType: "SLAB",
        baseCodes: ["GROSS"],
        slabMode: "PROGRESSIVE",
        slabPeriod: "ANNUAL",
        slabs: [
          { from: 0, to: 300000, rate: 0 },
          { from: 300000, to: 700000, rate: 5 },
          { from: 700000, to: 1000000, rate: 10 },
          { from: 1000000, to: 1200000, rate: 15 },
          { from: 1200000, to: 1500000, rate: 20 },
          { from: 1500000, to: null, rate: 30 },
        ],
        sequence: 40,
        description: "Annual progressive slabs applied monthly",
      },
      {
        code: "RETIRE_ER",
        name: "Retirement Fund (Employer)",
        kind: "EMPLOYER_CONTRIBUTION",
        calcType: "PERCENTAGE",
        percentage: 12,
        baseCodes: ["BASIC"],
        baseCap: 15000,
        sequence: 10,
      },
      {
        code: "HEALTH_ER",
        name: "Health Insurance (Employer)",
        kind: "EMPLOYER_CONTRIBUTION",
        calcType: "PERCENTAGE",
        percentage: 3.25,
        baseCodes: ["GROSS"],
        applyIfGrossMax: 21000,
        sequence: 20,
      },
    ],
  });

  const key = `dev_${crypto.randomBytes(24).toString("hex")}`;
  await prisma.device.create({
    data: {
      name: "Main Entrance Face Terminal",
      serialNumber: "FT-1000-0001",
      location: "Head Office — Main Entrance",
      apiKeyHash: crypto.createHash("sha256").update(key).digest("hex"),
      apiKeyPrefix: key.slice(0, 10),
    },
  });
  return key;
}

async function seedEmployees(today: string, historyStart: string) {
  const [departments, designations, shifts] = await Promise.all([
    prisma.department.findMany(),
    prisma.designation.findMany(),
    prisma.shift.findMany(),
  ]);
  const deptByCode = new Map(departments.map((d) => [d.code, d.id]));
  const desigByTitle = new Map(designations.map((d) => [d.title, d.id]));
  const general = shifts.find((s) => s.isDefault)!;
  const early = shifts.find((s) => !s.isDefault)!;

  const usedEmails = new Set<string>();
  const rows = [];
  for (let i = 1; i <= EMPLOYEE_COUNT; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    let email = `${firstName}.${lastName}`.toLowerCase() + "@hrms.local";
    for (let n = 2; usedEmails.has(email); n++) email = `${firstName}.${lastName}${n}`.toLowerCase() + "@hrms.local";
    usedEmails.add(email);

    let dept = weighted(DEPARTMENTS);
    let desig = weighted(DESIGNATIONS);
    if (i === 1) {
      dept = DEPARTMENTS.find((d) => d.code === "ADM")!;
      desig = DESIGNATIONS.find((d) => d.title === "Director")!;
    }
    if (i === 2) {
      dept = DEPARTMENTS.find((d) => d.code === "HR")!;
      desig = DESIGNATIONS.find((d) => d.title === "Manager")!;
    }

    // Most joined years ago; ~4% joined during the history window (shows proration)
    const recentJoiner = i > 2 && rng() < 0.04;
    const joining = recentJoiner
      ? addDays(historyStart, between(5, 60))
      : DateTime.fromISO(today).minus({ days: between(120, 6 * 365) }).toISODate()!;
    const salary = Math.round(between(desig.min, desig.max) / 500) * 500;
    const code = `EMP${String(i).padStart(4, "0")}`;

    rows.push({
      employeeCode: code,
      biometricId: `BIO${String(1000 + i)}`,
      firstName,
      lastName,
      email: i === 1 ? ADMIN.email : i === 2 ? HR.email : email,
      phone: `+91 9${between(100000000, 999999999)}`,
      gender: rng() < 0.48 ? "Female" : "Male",
      dateOfBirth: dateOnly(DateTime.fromISO(today).minus({ days: between(22 * 365, 55 * 365) }).toISODate()!),
      dateOfJoining: dateOnly(joining),
      departmentId: deptByCode.get(dept.code)!,
      designationId: desigByTitle.get(desig.title)!,
      shiftId: dept.code === "OPS" && rng() < 0.5 ? early.id : general.id,
      baseSalary: salary,
      bankName: pick(BANKS),
      bankAccount: String(between(10000000, 99999999)) + String(between(1000, 9999)),
      taxId: `TX${between(1000000, 9999999)}`,
      address: `${between(1, 250)} Residency Road, Tech City`,
    });
  }
  await prisma.employee.createMany({ data: rows });

  // ~2% left during the history window
  const employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
  const leavers = employees.filter((e, i) => i > 2 && rng() < 0.02 && e.dateOfJoining < dateOnly(historyStart));
  for (const e of leavers) {
    await prisma.employee.update({
      where: { id: e.id },
      data: { status: "INACTIVE", dateOfExit: dateOnly(addDays(historyStart, between(10, 70))) },
    });
  }

  const [adminHash, hrHash, employeeHash] = await Promise.all([
    bcrypt.hash(ADMIN.password, 10),
    bcrypt.hash(HR.password, 10),
    bcrypt.hash(EMPLOYEE_PASSWORD, 10),
  ]);
  const leaverIds = new Set(leavers.map((l) => l.id));
  await prisma.user.createMany({
    data: employees.map((e, i) => ({
      email: e.email,
      passwordHash: i === 0 ? adminHash : i === 1 ? hrHash : employeeHash,
      role: i === 0 ? ("ADMIN" as const) : i === 1 ? ("HR" as const) : ("EMPLOYEE" as const),
      employeeId: e.id,
      isActive: !leaverIds.has(e.id),
    })),
  });
  return prisma.employee.findMany({ include: { shift: true }, orderBy: { id: "asc" } });
}

async function seedLeave(
  employees: Awaited<ReturnType<typeof seedEmployees>>,
  historyStart: string,
  today: string,
  weeklyOff: number[],
) {
  const types = await prisma.leaveType.findMany();
  const hr = await prisma.user.findUniqueOrThrow({ where: { email: HR.email } });
  const years = [...new Set([Number(historyStart.slice(0, 4)), Number(today.slice(0, 4))])];

  for (const year of years) {
    await prisma.leaveBalance.createMany({
      data: employees.flatMap((e) =>
        types.map((t) => ({
          employeeId: e.id,
          leaveTypeId: t.id,
          year,
          allocated: t.annualQuota ?? 0,
          carriedForward: t.carryForward ? Math.min(between(0, 8), t.maxCarryForward) : 0,
        })),
      ),
      skipDuplicates: true,
    });
  }

  const requests: { employeeId: number; leaveTypeId: number; start: string; end: string; half: boolean; status: "APPROVED" | "PENDING" | "REJECTED" }[] = [];
  const reasons = ["Family function", "Not feeling well", "Personal work", "Medical appointment", "Travelling home", "Child's school event"];
  for (const e of employees.filter((x) => x.status === "ACTIVE")) {
    const count = rng() < 0.55 ? between(1, 3) : 0;
    const taken = new Set<string>();
    for (let n = 0; n < count; n++) {
      const type = weighted(types.map((t) => ({ ...t, weight: t.code === "CL" ? 5 : t.code === "SL" ? 3 : t.code === "AL" ? 2 : 1 })));
      const joined = e.dateOfJoining.toISOString().slice(0, 10);
      const windowStart = joined > historyStart ? joined : historyStart;
      const start = addDays(windowStart, between(0, Math.max(0, DateTime.fromISO(today).diff(DateTime.fromISO(windowStart), "days").days + 20)));
      const half = type.allowHalfDay && rng() < 0.2;
      const end = half ? start : addDays(start, type.code === "AL" ? between(1, 4) : between(0, 1));
      if (start.slice(0, 4) !== end.slice(0, 4) || isWeeklyOff(start, weeklyOff)) continue;
      if (eachDay(start, end).some((d) => taken.has(d))) continue;
      eachDay(start, end).forEach((d) => taken.add(d));
      const status = start > today ? (rng() < 0.7 ? "PENDING" : "APPROVED") : rng() < 0.88 ? "APPROVED" : "REJECTED";
      requests.push({ employeeId: e.id, leaveTypeId: type.id, start, end, half, status });
    }
  }

  let created = 0;
  for (const r of requests) {
    const days = await countLeaveDays(r.start, r.end, r.half);
    if (days <= 0) continue;
    const type = types.find((t) => t.id === r.leaveTypeId)!;
    await prisma.leaveRequest.create({
      data: {
        employeeId: r.employeeId,
        leaveTypeId: r.leaveTypeId,
        startDate: dateOnly(r.start),
        endDate: dateOnly(r.end),
        isHalfDay: r.half,
        days,
        reason: pick(reasons),
        status: r.status,
        reviewedById: r.status === "PENDING" ? null : hr.id,
        reviewedAt: r.status === "PENDING" ? null : new Date(),
        reviewComment: r.status === "REJECTED" ? "Team is short-staffed on these dates" : null,
        createdAt: new Date(`${addDays(r.start, -between(2, 10))}T10:00:00Z`),
      },
    });
    if (r.status === "APPROVED") {
      await prisma.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: type.id, year: Number(r.start.slice(0, 4)) } },
        data: { used: { increment: days } },
      });
    }
    created++;
  }
  return created;
}

async function seedAttendance(employees: Awaited<ReturnType<typeof seedEmployees>>, historyStart: string, today: string, weeklyOff: number[]) {
  const holidays = new Set(
    (await prisma.holiday.findMany()).map((h) => h.date.toISOString().slice(0, 10)),
  );
  const leaves = await prisma.leaveRequest.findMany({ where: { status: "APPROVED" } });
  const onLeave = new Set<string>();
  for (const l of leaves) {
    for (const d of eachDay(l.startDate.toISOString().slice(0, 10), l.endDate.toISOString().slice(0, 10))) {
      if (!l.isHalfDay) onLeave.add(`${l.employeeId}|${d}`);
    }
  }

  let total = 0;
  for (const date of eachDay(historyStart, today)) {
    if (holidays.has(date) || isWeeklyOff(date, weeklyOff)) continue;
    const working = employees.filter((e) => {
      const joined = e.dateOfJoining.toISOString().slice(0, 10);
      const exited = e.dateOfExit?.toISOString().slice(0, 10);
      return joined <= date && (!exited || exited >= date) && !onLeave.has(`${e.id}|${date}`);
    });
    const punches = simulateDay(
      working.map((e) => ({ id: e.id, shift: e.shift })),
      { date, timezone: TIMEZONE, rng, until: date === today ? new Date() : undefined },
    );
    await prisma.punch.createMany({ data: punches.map((p) => ({ ...p, source: "DEVICE" as const })), skipDuplicates: true });
    total += punches.length;
  }
  return total;
}

async function main() {
  const existing = await prisma.employee.count();
  if (existing > 0 && process.env.SEED_FORCE !== "true") {
    console.log(`Database already has ${existing} employees — skipping seed (set SEED_FORCE=true to wipe and reseed).`);
    return;
  }
  if (existing > 0) await wipe();

  const today = todayIn(TIMEZONE);
  const thisMonth = DateTime.fromISO(today).startOf("month");
  const historyStart = thisMonth.minus({ months: HISTORY_MONTHS }).toISODate()!;
  const year = Number(today.slice(0, 4));

  console.log("Creating configuration…");
  const deviceKey = await seedConfiguration(year);
  const weeklyOff = [0];

  console.log(`Creating ${EMPLOYEE_COUNT} employees…`);
  const employees = await seedEmployees(today, historyStart);

  console.log("Creating leave balances and requests…");
  const leaveCount = await seedLeave(employees, historyStart, today, weeklyOff);

  console.log(`Simulating biometric punches from ${historyStart} to ${today}…`);
  const punchCount = await seedAttendance(employees, historyStart, today, weeklyOff);

  console.log("Processing attendance…");
  let processed = 0;
  for (let from = historyStart; from <= today; ) {
    const to = DateTime.fromISO(from).endOf("month").toISODate()!;
    processed += (await processRange({ from, to: to > today ? today : to })).processed;
    from = addDays(to, 1);
  }

  console.log("Running payroll for past months…");
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
  for (let m = HISTORY_MONTHS; m >= 1; m--) {
    const month = thisMonth.minus({ months: m });
    const run = await processPayrollRun(month.year, month.month, admin.id);
    // Keep the most recent month as a DRAFT so finalizing can be demonstrated
    if (m > 1) await finalizeRun(run.id, admin.id);
    console.log(`  ${monthRange(month.year, month.month).from.slice(0, 7)}: ${run.employeeCount} payslips (${m > 1 ? "finalized" : "draft"})`);
  }

  console.log("\nSeed complete:");
  console.log(`  employees ${employees.length}, leave requests ${leaveCount}, punches ${punchCount}, attendance days ${processed}`);
  console.log(`  Admin login:    ${ADMIN.email}`);
  console.log(`  HR login:       ${HR.email}`);
  console.log(`  Employee login: any employee email, e.g. ${employees[2].email}`);
  console.log("  (passwords are listed in README.md)");
  console.log(`  Demo device API key (shown once): ${deviceKey}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
