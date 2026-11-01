"use client";

import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { openFile, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, monthLabel } from "@/lib/format";

export default function PayslipView({ id }: { id: string }) {
  const router = useRouter();
  const { me, currency } = useAuth();
  const { data: slip } = useApi<any>(`/payroll/payslips/${id}`);
  if (!slip) return <Spinner />;

  const earnings = slip.lines.filter((l: any) => l.kind === "EARNING");
  const deductions = slip.lines.filter((l: any) => l.kind === "DEDUCTION");
  const employer = slip.lines.filter((l: any) => l.kind === "EMPLOYER_CONTRIBUTION");
  const stats = [
    ["Pay days", slip.divisorDays],
    ["Working days", slip.workingDays],
    ["Present", slip.presentDays],
    ["Paid leave", slip.paidLeaveDays],
    ["Unpaid leave", slip.unpaidLeaveDays],
    ["Absent", slip.absentDays],
    ["Not employed", slip.notEmployedDays],
    ["Late marks", slip.lateCount],
    ["LOP days", slip.lopDays],
  ];

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={() => openFile(`/payroll/payslips/${id}/pdf`)}>
            <FileDown className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      <Card className="mx-auto max-w-4xl" padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-t-2xl bg-[oklch(0.24_0.03_262)] px-6 py-5 text-white dark:bg-surface-2">
          <div>
            <p className="text-lg font-semibold">{me?.company?.companyName}</p>
            <p className="text-sm text-slate-300">Payslip for {monthLabel(slip.payrollRun.year, slip.payrollRun.month)}</p>
          </div>
          {slip.payrollRun.status !== "FINALIZED" && <Badge tone="amber">Draft — not final</Badge>}
        </div>

        <div className="grid gap-4 border-b border-slate-100 px-6 py-5 text-sm sm:grid-cols-3">
          {[
            ["Employee", slip.employeeName],
            ["Employee code", slip.employeeCode],
            ["Department", slip.departmentName],
            ["Designation", slip.designationTitle],
            ["Bank account", [slip.employee.bankName, slip.employee.bankAccount].filter(Boolean).join(" · ") || "—"],
            ["Monthly base salary", money(slip.baseSalary, currency)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-slate-500">{k}</p>
              <p className="font-medium text-slate-900">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-9">
          {stats.map(([k, v]) => (
            <div key={k} className="bg-slate-50 px-3 py-3 text-center">
              <p className="text-[11px] text-slate-500">{k}</p>
              <p className="text-base font-semibold text-slate-900">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <LineTable title="Earnings" lines={earnings} total={slip.grossEarnings} totalLabel="Gross earnings" currency={currency} />
          <LineTable title="Deductions" lines={deductions} total={slip.totalDeductions} totalLabel="Total deductions" currency={currency} negative />
        </div>

        <div className="mx-6 mb-6 flex items-center justify-between rounded-xl bg-emerald-600 px-5 py-4 text-white">
          <span className="font-semibold">Net pay</span>
          <span className="text-2xl font-semibold">{money(slip.netPay, currency)}</span>
        </div>

        {employer.length > 0 && (
          <div className="px-6 pb-6">
            <LineTable title="Employer contributions (paid by the company, not deducted)" lines={employer} total={slip.employerContributions} totalLabel="Total" currency={currency} />
          </div>
        )}
      </Card>
    </>
  );
}

function LineTable({ title, lines, total, totalLabel, currency, negative }: { title: string; lines: any[]; total: string; totalLabel: string; currency: string; negative?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {lines.map((l) => (
            <tr key={l.id}>
              <td className={`py-2 ${l.code === "LOP" || l.code === "LATE" ? "text-rose-700" : "text-slate-600"}`}>{l.name}</td>
              <td className="py-2 text-right font-medium">{money(l.amount, currency)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td className="py-2 text-slate-400">None</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td className="py-2 font-semibold">{totalLabel}</td>
            <td className={`py-2 text-right font-semibold ${negative ? "text-rose-700" : ""}`}>{money(total, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
