"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Tabs } from "@/components/ui";
import { openFile, qs, useApi } from "@/lib/api";
import { MONTHS, formatDate, todayString } from "@/lib/format";

type Tab = "attendance" | "late" | "leave";

export default function ReportsView() {
  const [tab, setTab] = useState<Tab>("attendance");
  const { data: departments } = useApi<any[]>("/settings/departments");
  const [departmentId, setDepartmentId] = useState("");

  return (
    <>
      <PageHeader title="Reports" subtitle="Attendance, late-arrival and leave reports with CSV export. Payroll registers are on each payroll run." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "attendance", label: "Monthly attendance summary" },
          { value: "late", label: "Late arrivals" },
          { value: "leave", label: "Leave usage" },
        ]}
      />
      {tab !== "leave" && (
        <div className="mb-4 w-64">
          <Field label="Department">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {tab === "attendance" && <AttendanceSummary departmentId={departmentId} />}
      {tab === "late" && <LateReport departmentId={departmentId} />}
      {tab === "leave" && <LeaveSummary />}
    </>
  );
}

function AttendanceSummary({ departmentId }: { departmentId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const query = qs({ year, month, departmentId });
  const { data } = useApi<any[]>(`/reports/attendance-summary${query}`);

  return (
    <Card
      padded={false}
      title={
        <div className="flex items-center gap-2">
          <Select className="w-36" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
          <Input className="w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
      }
      actions={
        <Button size="sm" variant="secondary" onClick={() => openFile(`/reports/attendance-summary${query}&format=csv`)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      <Table
        rows={data}
        rowKey={(r) => r.employeeCode}
        columns={[
          { header: "Code", cell: (r) => <span className="font-mono text-xs">{r.employeeCode}</span> },
          { header: "Name", cell: (r) => r.name },
          { header: "Department", cell: (r) => r.department },
          { header: "Present", cell: (r) => r.present },
          { header: "Half day", cell: (r) => r.halfDay },
          { header: "Absent", cell: (r) => (r.absent ? <span className="text-rose-600">{r.absent}</span> : 0) },
          { header: "On leave", cell: (r) => r.onLeave },
          { header: "Off / holiday", cell: (r) => r.holidays },
          { header: "Late", cell: (r) => (r.lateCount ? <span className="text-amber-700">{r.lateCount}</span> : 0) },
          { header: "Late minutes", cell: (r) => r.lateMinutes },
        ]}
      />
    </Card>
  );
}

function LateReport({ departmentId }: { departmentId: string }) {
  const today = todayString();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const query = qs({ from, to, departmentId });
  const { data } = useApi<any[]>(`/reports/late${query}`);
  return (
    <Card
      padded={false}
      title={
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      }
      actions={
        <Button size="sm" variant="secondary" onClick={() => openFile(`/reports/late${query}&format=csv`)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      <Table
        rows={data?.slice(0, 500)}
        rowKey={(r) => `${r.employeeCode}-${r.date}`}
        empty="No late arrivals in this period"
        columns={[
          { header: "Date", cell: (r) => formatDate(r.date) },
          { header: "Code", cell: (r) => <span className="font-mono text-xs">{r.employeeCode}</span> },
          { header: "Name", cell: (r) => r.name },
          { header: "Department", cell: (r) => r.department },
          { header: "Shift start", cell: (r) => r.shiftStart },
          { header: "Checked in", cell: (r) => r.checkIn },
          { header: "Late by", cell: (r) => <span className="font-medium text-amber-700">{r.lateMinutes} min</span> },
        ]}
      />
      {data && data.length > 500 && <p className="px-4 py-3 text-xs text-slate-500">Showing 500 of {data.length}. Export CSV for the full list.</p>}
    </Card>
  );
}

function LeaveSummary() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useApi<any[]>(`/reports/leave-summary?year=${year}`);
  return (
    <Card padded={false} title={<Input className="w-28" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />}>
      <Table
        rows={data}
        rowKey={(r) => r.code}
        columns={[
          { header: "Leave type", cell: (r) => r.name },
          { header: "Paid", cell: (r) => (r.isPaid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>) },
          { header: "Days allocated", cell: (r) => r.allocated },
          { header: "Days used", cell: (r) => r.used },
          { header: "Approved requests", cell: (r) => r.approved },
          { header: "Pending", cell: (r) => r.pending },
          { header: "Rejected", cell: (r) => r.rejected },
        ]}
      />
    </Card>
  );
}
