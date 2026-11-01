"use client";

import { ArrowLeft, Download, Lock, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, PageHeader, Pagination, Spinner, StatCard, StatusBadge, Table, useToast } from "@/components/ui";
import { api, errorMessage, openFile, qs, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, money, monthLabel } from "@/lib/format";

export default function PayrollRunView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { currency } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const { data, mutate } = useApi<any>(`/payroll/runs/${id}${qs({ search, page, pageSize: 25 })}`, { keepPreviousData: true });

  if (!data) return <Spinner />;
  const { run, payslips, byDepartment } = data;
  const draft = run.status === "DRAFT";

  async function act(kind: "finalize" | "reprocess" | "delete") {
    const prompts = {
      finalize: "Finalize this payroll? It will be locked and payslips become visible to employees.",
      reprocess: "Re-process this draft? All payslips will be recalculated from current attendance and settings.",
      delete: "Delete this draft payroll run?",
    };
    if (!confirm(prompts[kind])) return;
    setBusy(kind);
    try {
      if (kind === "finalize") await api(`/payroll/runs/${id}/finalize`, { method: "POST" });
      if (kind === "reprocess") await api("/payroll/runs", { body: { year: run.year, month: run.month } });
      if (kind === "delete") {
        await api(`/payroll/runs/${id}`, { method: "DELETE" });
        router.push("/payroll");
        return;
      }
      toast(kind === "finalize" ? "Payroll finalized and locked" : "Payroll re-processed");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Link href="/payroll" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Payroll runs
      </Link>
      <PageHeader
        title={`Payroll — ${monthLabel(run.year, run.month)}`}
        subtitle={`Processed ${formatDateTime(run.processedAt)}${run.finalizedAt ? ` · Finalized ${formatDateTime(run.finalizedAt)}` : ""}`}
        actions={
          <>
            <StatusBadge status={run.status} />
            <Button variant="secondary" onClick={() => openFile(`/payroll/runs/${id}/export`)}>
              <Download className="h-4 w-4" /> Payroll register (CSV)
            </Button>
            {draft && (
              <>
                <Button variant="ghost" onClick={() => act("delete")} loading={busy === "delete"}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="secondary" onClick={() => act("reprocess")} loading={busy === "reprocess"}>
                  <RefreshCw className="h-4 w-4" /> Re-process
                </Button>
                <Button variant="success" onClick={() => act("finalize")} loading={busy === "finalize"}>
                  <Lock className="h-4 w-4" /> Finalize
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Employees" value={run.employeeCount} />
        <StatCard label="Gross earnings" value={money(run.totalGross, currency)} />
        <StatCard label="Deductions" value={money(run.totalDeductions, currency)} tone="red" />
        <StatCard label="Net pay" value={money(run.totalNet, currency)} tone="green" />
        <StatCard label="Employer contributions" value={money(run.totalEmployerContrib, currency)} tone="blue" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Payslips" padded={false} className="xl:col-span-2">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Search employee" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} />
            </div>
          </div>
          <Table
            rows={payslips.items}
            rowKey={(p: any) => p.id}
            onRowClick={(p: any) => router.push(`/payslips/${p.id}`)}
            columns={[
              {
                header: "Employee",
                cell: (p: any) => (
                  <div>
                    <p className="font-medium text-slate-900">{p.employeeName}</p>
                    <p className="text-xs text-slate-500">
                      {p.employeeCode} · {p.departmentName}
                    </p>
                  </div>
                ),
              },
              { header: "Present", cell: (p: any) => p.presentDays },
              { header: "LOP days", cell: (p: any) => (p.lopDays > 0 ? <span className="text-rose-600">{p.lopDays}</span> : 0) },
              { header: "Late", cell: (p: any) => (p.lateCount > 0 ? <span className="text-amber-700">{p.lateCount}</span> : 0) },
              { header: "Gross", cell: (p: any) => money(p.grossEarnings, currency), className: "text-right" },
              { header: "Deductions", cell: (p: any) => money(p.totalDeductions, currency), className: "text-right" },
              { header: "Net pay", cell: (p: any) => <span className="font-semibold">{money(p.netPay, currency)}</span>, className: "text-right" },
            ]}
          />
          <Pagination page={payslips.page} totalPages={payslips.totalPages} total={payslips.total} onPage={setPage} />
        </Card>

        <Card title="By department" padded={false}>
          <Table
            rows={byDepartment}
            rowKey={(d: any) => d.departmentName}
            columns={[
              { header: "Department", cell: (d: any) => d.departmentName },
              { header: "Staff", cell: (d: any) => d._count },
              { header: "Net pay", cell: (d: any) => money(d._sum.netPay, currency), className: "text-right" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
