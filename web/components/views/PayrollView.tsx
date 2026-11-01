"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, useToast } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MONTHS, formatDateTime, money, monthLabel } from "@/lib/format";

export default function PayrollView() {
  const router = useRouter();
  const toast = useToast();
  const { currency } = useAuth();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);
  const [running, setRunning] = useState(false);
  const { data: runs, mutate } = useApi<any[]>("/payroll/runs");

  async function run() {
    const existing = runs?.find((r) => r.year === year && r.month === month);
    if (existing?.status === "FINALIZED") {
      toast("That month is finalized and locked", "error");
      return;
    }
    if (existing && !confirm(`Re-process ${monthLabel(year, month)}? The draft payslips will be recalculated.`)) return;
    setRunning(true);
    try {
      const r = await api("/payroll/runs", { body: { year, month } });
      toast(`Payroll processed for ${r.employeeCount} employees`);
      mutate();
      router.push(`/payroll/${r.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly payroll processing with automatic deductions for unpaid leave and late attendance" />

      <Card title="Process payroll">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Month">
            <Select className="w-44" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year">
            <Input className="w-28" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </Field>
          <Button onClick={run} loading={running}>
            <Play className="h-4 w-4" /> Run payroll
          </Button>
        </div>
        <ol className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-4">
          <li>1. Attendance for the month is re-processed (punches, leave, holidays).</li>
          <li>2. Absences, unpaid leave and late marks become loss-of-pay deductions.</li>
          <li>3. Earnings, deductions and employer contributions are calculated from the pay components.</li>
          <li>4. Review the draft, then finalize to lock it and publish payslips to employees.</li>
        </ol>
      </Card>

      <Card title="Payroll runs" className="mt-6" padded={false}>
        <Table
          rows={runs}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/payroll/${r.id}`)}
          empty="No payroll runs yet"
          columns={[
            { header: "Month", cell: (r) => <span className="font-medium">{monthLabel(r.year, r.month)}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Employees", cell: (r) => r.employeeCount },
            { header: "Gross", cell: (r) => money(r.totalGross, currency), className: "text-right" },
            { header: "Deductions", cell: (r) => money(r.totalDeductions, currency), className: "text-right" },
            { header: "Net pay", cell: (r) => <span className="font-semibold">{money(r.totalNet, currency)}</span>, className: "text-right" },
            { header: "Employer cost", cell: (r) => money(r.totalEmployerContrib, currency), className: "text-right" },
            { header: "Processed", cell: (r) => <span className="text-xs text-slate-500">{formatDateTime(r.processedAt)}</span> },
          ]}
        />
      </Card>
    </>
  );
}
