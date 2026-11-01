import { Router } from "express";
import Papa from "papaparse";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { audit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import { toNum } from "../../lib/money";
import { idParam, pageArgs, paged, pagination } from "../../lib/validate";
import { authenticate, currentEmployeeId, currentUser, requireHR } from "../../middleware/auth";
import { getSettings } from "../settings/settings.service";
import { deleteDraftRun, finalizeRun, processPayrollRun } from "./payroll.service";
import { renderPayslipPdf } from "./payslip-pdf";

export const payrollRouter = Router();
payrollRouter.use(authenticate);

// ───────────── Employee self-service (finalized payslips only) ─────────────

payrollRouter.get("/me/payslips", async (req, res) => {
  const payslips = await prisma.payslip.findMany({
    where: { employeeId: currentEmployeeId(req), payrollRun: { status: "FINALIZED" } },
    orderBy: [{ payrollRun: { year: "desc" } }, { payrollRun: { month: "desc" } }],
    include: { payrollRun: { select: { year: true, month: true, status: true } } },
  });
  res.json(payslips);
});

async function loadPayslipForUser(id: number, req: Parameters<typeof currentUser>[0]) {
  const user = currentUser(req);
  const slip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      lines: { orderBy: [{ kind: "asc" }, { sequence: "asc" }] },
      payrollRun: true,
      employee: { select: { bankName: true, bankAccount: true, taxId: true, email: true } },
    },
  });
  if (!slip) throw notFound("Payslip");
  if (user.role === "EMPLOYEE" && (slip.employeeId !== user.employeeId || slip.payrollRun.status !== "FINALIZED")) {
    throw notFound("Payslip");
  }
  return slip;
}

payrollRouter.get("/payslips/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await loadPayslipForUser(id, req));
});

payrollRouter.get("/payslips/:id/pdf", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const slip = await loadPayslipForUser(id, req);
  const pdf = await renderPayslipPdf(slip, await getSettings());
  const name = `payslip-${slip.employeeCode}-${slip.payrollRun.year}-${String(slip.payrollRun.month).padStart(2, "0")}.pdf`;
  res.setHeader("Content-Disposition", `inline; filename="${name}"`);
  res.type("application/pdf").send(pdf);
});

// ───────────── HR ─────────────

payrollRouter.get("/runs", requireHR, async (_req, res) => {
  res.json(await prisma.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] }));
});

const runSchema = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });

payrollRouter.post("/runs", requireHR, async (req, res) => {
  const { year, month } = runSchema.parse(req.body);
  const user = currentUser(req);
  const run = await processPayrollRun(year, month, user.id);
  await audit(user.id, "PROCESS_PAYROLL", "PayrollRun", run.id, { year, month, employees: run.employeeCount });
  res.json(run);
});

const runQuery = pagination.extend({ search: z.string().optional(), departmentName: z.string().optional() });

payrollRouter.get("/runs/:id", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const q = runQuery.parse(req.query);
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  const where: Prisma.PayslipWhereInput = {
    payrollRunId: id,
    ...(q.departmentName ? { departmentName: q.departmentName } : {}),
    ...(q.search
      ? {
          OR: [
            { employeeName: { contains: q.search, mode: "insensitive" } },
            { employeeCode: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total, byDepartment] = await Promise.all([
    prisma.payslip.findMany({ where, ...pageArgs(q), orderBy: { employeeCode: "asc" } }),
    prisma.payslip.count({ where }),
    prisma.payslip.groupBy({
      by: ["departmentName"],
      where: { payrollRunId: id },
      _sum: { grossEarnings: true, totalDeductions: true, netPay: true },
      _count: true,
      orderBy: { departmentName: "asc" },
    }),
  ]);
  res.json({ run, payslips: paged(items, total, q), byDepartment });
});

payrollRouter.post("/runs/:id/finalize", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const user = currentUser(req);
  const run = await finalizeRun(id, user.id);
  await audit(user.id, "FINALIZE_PAYROLL", "PayrollRun", id);
  res.json(run);
});

payrollRouter.delete("/runs/:id", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  await deleteDraftRun(id);
  await audit(currentUser(req).id, "DELETE_PAYROLL", "PayrollRun", id);
  res.status(204).end();
});

/** Payroll register: one row per employee with every component as a column. */
payrollRouter.get("/runs/:id/export", requireHR, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  const slips = await prisma.payslip.findMany({
    where: { payrollRunId: id },
    include: { lines: true },
    orderBy: { employeeCode: "asc" },
  });
  const codes: { code: string; name: string }[] = [];
  for (const line of slips.flatMap((s) => s.lines).sort((a, b) => a.kind.localeCompare(b.kind) || a.sequence - b.sequence)) {
    if (!codes.some((c) => c.code === line.code)) codes.push({ code: line.code, name: line.name });
  }
  const rows = slips.map((s) => {
    const row: Record<string, string | number> = {
      "Employee Code": s.employeeCode,
      Name: s.employeeName,
      Department: s.departmentName,
      Designation: s.designationTitle,
      "Base Salary": toNum(s.baseSalary),
      "Working Days": s.workingDays,
      Present: s.presentDays,
      "Paid Leave": s.paidLeaveDays,
      "Unpaid Leave": s.unpaidLeaveDays,
      Absent: s.absentDays,
      "Late Marks": s.lateCount,
      "LOP Days": s.lopDays,
    };
    for (const c of codes) row[c.name] = toNum(s.lines.find((l) => l.code === c.code)?.amount ?? 0);
    row["Gross Earnings"] = toNum(s.grossEarnings);
    row["Total Deductions"] = toNum(s.totalDeductions);
    row["Employer Contributions"] = toNum(s.employerContributions);
    row["Net Pay"] = toNum(s.netPay);
    return row;
  });
  res.setHeader("Content-Disposition", `attachment; filename="payroll-register-${run.year}-${String(run.month).padStart(2, "0")}.csv"`);
  res.type("text/csv").send(Papa.unparse(rows));
});
