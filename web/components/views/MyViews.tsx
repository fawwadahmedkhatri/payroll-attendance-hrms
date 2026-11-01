"use client";

import clsx from "clsx";
import { CalendarCheck, Clock, Receipt, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Spinner, StatCard, StatusBadge, Table, Textarea, useToast } from "@/components/ui";
import { api, errorMessage, qs, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MONTHS, STATUS_LABEL, formatDate, minutesToHours, money, monthLabel, todayString } from "@/lib/format";

// ───────────── My dashboard ─────────────

export function MyDashboardView() {
  const { me, currency } = useAuth();
  const { data } = useApi<any>("/reports/me");
  if (!data) return <Spinner />;
  const t = data.todayAttendance;

  return (
    <>
      <PageHeader
        title={`Hello, ${me?.employee?.firstName ?? ""}`}
        subtitle={`${formatDate(data.today)} · ${data.shift ? `${data.shift.name} ${data.shift.startTime}–${data.shift.endTime} (grace ${data.shift.graceMinutes} min)` : ""}`}
        actions={
          <Link href="/me/leave">
            <Button>
              <CalendarCheck className="h-4 w-4" /> Apply for leave
            </Button>
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today"
          value={t ? STATUS_LABEL[t.status] : "Not punched in"}
          hint={t?.checkInTime ? `In ${t.checkInTime}${t.checkOutTime ? ` · Out ${t.checkOutTime}` : ""}${t.isLate ? ` · late ${t.lateMinutes} min` : ""}` : "Punch in on the biometric device"}
          icon={<UserCheck className="h-4 w-4" />}
          tone={t?.isLate ? "amber" : t ? "green" : "slate"}
        />
        <StatCard label="Present this month" value={data.month.present} hint={`${data.month.absent} absent · ${data.month.onLeave} on leave`} icon={<CalendarCheck className="h-4 w-4" />} tone="blue" />
        <StatCard label="Late marks this month" value={data.month.late} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <StatCard
          label="Last payslip"
          value={data.lastPayslip ? money(data.lastPayslip.netPay, currency) : "—"}
          hint={data.lastPayslip ? monthLabel(data.lastPayslip.payrollRun.year, data.lastPayslip.payrollRun.month) : "No payslip yet"}
          icon={<Receipt className="h-4 w-4" />}
          tone="green"
        />
      </div>

      <Card title="My leave balance" className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.balances.map((b: any) => (
            <div key={b.leaveTypeId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /> {b.name}
              </div>
              <p className="mt-2 text-2xl font-semibold">{b.unlimited ? "∞" : b.available}</p>
              <p className="text-xs text-slate-500">{b.unlimited ? `${b.used} used` : `of ${b.allocated + b.carriedForward} · ${b.used} used${b.pending ? ` · ${b.pending} pending` : ""}`}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ───────────── My attendance ─────────────

const CAL_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  HALF_DAY: "bg-amber-100 text-amber-800",
  ABSENT: "bg-rose-100 text-rose-800",
  ON_LEAVE: "bg-sky-100 text-sky-800",
  HOLIDAY: "bg-violet-100 text-violet-800",
  WEEKLY_OFF: "bg-slate-100 text-slate-500",
};

export function MyAttendanceView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  const { data } = useApi<any[]>(`/attendance/me${qs({ from, to })}`);
  const byDate = new Map((data ?? []).map((d) => [d.date, d]));
  const offset = new Date(year, month - 1, 1).getDay();

  return (
    <>
      <PageHeader
        title="My attendance"
        actions={
          <>
            <Select className="w-36" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
            <Input className="w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card title={monthLabel(year, month)} className="xl:col-span-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1 font-medium text-slate-400">
                {d}
              </div>
            ))}
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: lastDay }).map((_, i) => {
              const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
              const d = byDate.get(date);
              return (
                <div key={date} className={clsx("relative rounded-md py-2", d ? CAL_COLORS[d.status] : "text-slate-300")} title={d ? STATUS_LABEL[d.status] : ""}>
                  {i + 1}
                  {d?.isLate && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(CAL_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={clsx("h-3 w-3 rounded", c)} /> {STATUS_LABEL[k]}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Late
            </span>
          </div>
        </Card>
        <Card title="Daily log" padded={false} className="xl:col-span-3">
          <Table
            rows={data}
            rowKey={(d) => d.id}
            empty="No attendance recorded for this month"
            columns={[
              { header: "Date", cell: (d) => formatDate(d.date) },
              { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
              { header: "In", cell: (d) => d.checkInTime ?? "—" },
              { header: "Out", cell: (d) => d.checkOutTime ?? "—" },
              { header: "Worked", cell: (d) => minutesToHours(d.workedMinutes) },
              { header: "Late", cell: (d) => (d.isLate ? <span className="text-amber-700">{d.lateMinutes} min</span> : "—") },
              { header: "Note", cell: (d) => <span className="text-xs text-slate-500">{d.leaveRequest?.leaveType.name ?? d.remarks ?? ""}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

// ───────────── My leave ─────────────

export function MyLeaveView() {
  const toast = useToast();
  const { data: balances, mutate: refreshBalances } = useApi<any[]>("/leave/me/balances");
  const { data: requests, mutate } = useApi<any[]>("/leave/me/requests");
  const [open, setOpen] = useState(false);
  const today = todayString();
  const [form, setForm] = useState({ leaveTypeId: "", startDate: today, endDate: today, isHalfDay: false, reason: "" });
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = balances?.find((b) => b.leaveTypeId === Number(form.leaveTypeId));

  useEffect(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return setDays(null);
    api(`/leave/days${qs({ startDate: form.startDate, endDate: form.isHalfDay ? form.startDate : form.endDate, isHalfDay: form.isHalfDay })}`)
      .then((r) => setDays(r.days))
      .catch(() => setDays(null));
  }, [form.startDate, form.endDate, form.isHalfDay]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/leave/me/requests", {
        body: { ...form, leaveTypeId: Number(form.leaveTypeId), endDate: form.isHalfDay ? form.startDate : form.endDate },
      });
      toast("Leave request submitted to HR");
      setOpen(false);
      setForm({ leaveTypeId: "", startDate: today, endDate: today, isHalfDay: false, reason: "" });
      mutate();
      refreshBalances();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: number) {
    if (!confirm("Withdraw this leave request?")) return;
    try {
      await api(`/leave/requests/${id}/cancel`, { method: "POST" });
      mutate();
      refreshBalances();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader title="My leave" actions={<Button onClick={() => setOpen(true)}>Apply for leave</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {balances?.map((b) => (
          <div key={b.leaveTypeId} className="elevated rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /> {b.name}
              {!b.isPaid && <Badge tone="amber">Unpaid</Badge>}
            </div>
            <p className="mt-2 text-2xl font-semibold">{b.unlimited ? "No limit" : `${b.available} days`}</p>
            {!b.unlimited && (
              <p className="text-xs text-slate-500">
                {b.allocated} allocated{b.carriedForward ? ` + ${b.carriedForward} carried` : ""} · {b.used} used{b.pending ? ` · ${b.pending} pending` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
      <Card title="My requests" padded={false}>
        <Table
          rows={requests}
          rowKey={(r) => r.id}
          empty="You have not applied for leave yet"
          columns={[
            { header: "Type", cell: (r) => r.leaveType.name },
            { header: "Dates", cell: (r) => (r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`) },
            { header: "Days", cell: (r) => (r.isHalfDay ? "½" : r.days) },
            { header: "Reason", cell: (r) => <span className="block max-w-60 truncate">{r.reason}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "HR comment", cell: (r) => <span className="text-xs text-slate-500">{r.reviewComment ?? ""}</span> },
            {
              header: "",
              cell: (r) =>
                r.status === "PENDING" && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                    Withdraw
                  </Button>
                ),
            },
          ]}
        />
      </Card>

      <Modal open={open} title="Apply for leave" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Leave type">
            <Select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} required>
              <option value="">Select…</option>
              {balances?.map((b) => (
                <option key={b.leaveTypeId} value={b.leaveTypeId}>
                  {b.name} {b.unlimited ? "" : `(${b.available} available)`}
                </option>
              ))}
            </Select>
          </Field>
          {selected?.allowHalfDay && <Checkbox label="Half day" checked={form.isHalfDay} onChange={(v) => setForm({ ...form, isHalfDay: v })} />}
          <div className="grid grid-cols-2 gap-4">
            <Field label={form.isHalfDay ? "Date" : "From"}>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} required />
            </Field>
            {!form.isHalfDay && (
              <Field label="To">
                <Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              </Field>
            )}
          </div>
          {days !== null && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {days} working day(s) — weekly offs and holidays are not counted.
              {selected && !selected.isPaid && " This is unpaid leave: it will be deducted from your salary."}
            </p>
          )}
          <Field label="Reason">
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!days}>
              Submit request
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ───────────── My payslips ─────────────

export function MyPayslipsView() {
  const router = useRouter();
  const { currency } = useAuth();
  const { data } = useApi<any[]>("/payroll/me/payslips");
  return (
    <>
      <PageHeader title="My payslips" subtitle="Payslips appear here once HR finalizes the month's payroll" />
      <Card padded={false}>
        <Table
          rows={data}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/payslips/${p.id}`)}
          empty="No payslips yet"
          columns={[
            { header: "Month", cell: (p) => <span className="font-medium">{monthLabel(p.payrollRun.year, p.payrollRun.month)}</span> },
            { header: "Working days", cell: (p) => p.workingDays },
            { header: "LOP days", cell: (p) => p.lopDays },
            { header: "Late marks", cell: (p) => p.lateCount },
            { header: "Gross", cell: (p) => money(p.grossEarnings, currency), className: "text-right" },
            { header: "Deductions", cell: (p) => money(p.totalDeductions, currency), className: "text-right" },
            { header: "Net pay", cell: (p) => <span className="font-semibold text-emerald-700">{money(p.netPay, currency)}</span>, className: "text-right" },
          ]}
        />
      </Card>
    </>
  );
}
