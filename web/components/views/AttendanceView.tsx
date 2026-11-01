"use client";

import { Cpu, Pencil, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, StatusBadge, Table, Textarea, useToast } from "@/components/ui";
import { api, errorMessage, qs, useApi, type Paged } from "@/lib/api";
import { formatDate, minutesToHours, todayString } from "@/lib/format";

const STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF"];

export default function AttendanceView() {
  const toast = useToast();
  const today = todayString();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"" | "simulate" | "process">("");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: departments } = useApi<any[]>("/settings/departments");
  const { data, mutate } = useApi<Paged<any>>(`/attendance${qs({ from, to, status, departmentId, search, page, pageSize: 25 })}`, { keepPreviousData: true });

  async function simulate() {
    setBusy("simulate");
    try {
      const r = await api("/attendance/simulate", { body: { date: to } });
      toast(`Simulated device feed for ${r.date}: ${r.inserted} new punches from ${r.employees} employees`);
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  }

  async function processRange() {
    setBusy("process");
    try {
      const r = await api("/attendance/process", { body: { from, to } });
      toast(`Re-processed ${r.processed} attendance records`);
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Daily attendance built from biometric punches, imports, leave and the holiday calendar"
        actions={
          <>
            <Button variant="secondary" onClick={processRange} loading={busy === "process"}>
              <RefreshCw className="h-4 w-4" /> Re-process
            </Button>
            <Button onClick={simulate} loading={busy === "simulate"} title="Generate realistic fingerprint/face punches for the selected 'To' date">
              <Cpu className="h-4 w-4" /> Simulate device feed
            </Button>
          </>
        }
      />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="From">
            <Input type="date" value={from} max={today} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} max={today} onChange={(e) => (setTo(e.target.value), setPage(1))} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
              <option value="">All</option>
              <option value="LATE">Late arrivals</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={departmentId} onChange={(e) => (setDepartmentId(e.target.value), setPage(1))}>
              <option value="">All</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employee" className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Name or code" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} />
            </div>
          </Field>
        </div>
        <Table
          rows={data?.items}
          rowKey={(d) => d.id}
          empty="No attendance records for this filter. Use “Simulate device feed” or import a file."
          columns={[
            { header: "Date", cell: (d) => formatDate(d.date) },
            {
              header: "Employee",
              cell: (d) => (
                <div>
                  <p className="font-medium text-slate-900">
                    {d.employee.firstName} {d.employee.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {d.employee.employeeCode} · {d.employee.department.name}
                  </p>
                </div>
              ),
            },
            {
              header: "Status",
              cell: (d) => (
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={d.status} />
                  {d.leaveFraction === 0.5 && <Badge tone="blue">½ leave</Badge>}
                  {d.isManual && <Badge tone="violet">Manual</Badge>}
                </div>
              ),
            },
            { header: "In", cell: (d) => d.checkInTime ?? "—" },
            { header: "Out", cell: (d) => d.checkOutTime ?? "—" },
            { header: "Worked", cell: (d) => minutesToHours(d.workedMinutes) },
            { header: "Late", cell: (d) => (d.isLate ? <span className="font-medium text-amber-700">{d.lateMinutes} min</span> : "—") },
            { header: "Remarks", cell: (d) => <span className="text-xs text-slate-500">{d.leaveRequest?.leaveType.name ?? d.remarks ?? ""}</span> },
            {
              header: "",
              cell: (d) => (
                <Button size="sm" variant="ghost" onClick={() => setEditing(d)} title="Correct this record">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      {editing && (
        <ManualEdit
          day={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
          }}
        />
      )}
    </>
  );
}

function ManualEdit({ day, onClose, onSaved }: { day: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(day.status);
  const [checkIn, setCheckIn] = useState(day.checkInTime ?? "");
  const [checkOut, setCheckOut] = useState(day.checkOutTime ?? "");
  const [remarks, setRemarks] = useState(day.isManual ? (day.remarks ?? "") : "");
  const { data: punches } = useApi<any[]>(`/attendance/punches${qs({ employeeId: day.employeeId, date: day.date })}`);

  async function save() {
    try {
      await api("/attendance/manual", {
        method: "PUT",
        body: { employeeId: day.employeeId, date: day.date, status, checkIn: checkIn || null, checkOut: checkOut || null, remarks },
      });
      toast("Attendance corrected");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function reset() {
    try {
      await api(`/attendance/${day.id}/reset`, { method: "POST" });
      toast("Manual correction removed — recalculated from punches");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal
      open
      title={`Correct attendance — ${day.employee.firstName} ${day.employee.lastName}, ${formatDate(day.date)}`}
      onClose={onClose}
      footer={
        <>
          {day.isManual && (
            <Button variant="secondary" onClick={reset}>
              Undo manual correction
            </Button>
          )}
          <Button onClick={save} disabled={remarks.trim().length < 3}>
            Save correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">Raw punches received</p>
          {punches === undefined ? "Loading…" : punches.length === 0 ? "No punches recorded" : punches.map((p) => `${p.time} (${p.source.toLowerCase()}${p.device ? `, ${p.device.name}` : ""})`).join(" · ")}
        </div>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check in">
            <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label="Check out">
            <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason for correction *" hint="Saved in the audit log. Late minutes are recalculated from the check-in time and the employee's shift.">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
