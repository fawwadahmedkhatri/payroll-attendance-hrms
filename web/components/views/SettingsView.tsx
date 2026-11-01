"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, useToast } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/api";
import { WEEKDAYS, formatDate, formatDateTime } from "@/lib/format";
import { BrandingTab } from "./BrandingTab";
import { PayComponentsTab } from "./PayComponentsTab";

type Tab = "company" | "branding" | "shifts" | "holidays" | "leave" | "pay" | "org" | "devices" | "audit";

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>("company");
  return (
    <>
      <PageHeader title="Settings" subtitle="Every attendance, leave and payroll rule is configured here — nothing is hard-coded for a country" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "company", label: "Company & rules" },
          { value: "branding", label: "Branding" },
          { value: "shifts", label: "Shifts" },
          { value: "holidays", label: "Holidays" },
          { value: "leave", label: "Leave types" },
          { value: "pay", label: "Pay components" },
          { value: "org", label: "Departments & designations" },
          { value: "devices", label: "Biometric devices" },
          { value: "audit", label: "Audit log" },
        ]}
      />
      {tab === "company" && <CompanyTab />}
      {tab === "branding" && <BrandingTab />}
      {tab === "shifts" && <ShiftsTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "leave" && <LeaveTypesTab />}
      {tab === "pay" && <PayComponentsTab />}
      {tab === "org" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SimpleList path="departments" title="Departments" fields={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }]} />
          <SimpleList path="designations" title="Designations" fields={[{ key: "title", label: "Title" }]} />
        </div>
      )}
      {tab === "devices" && <DevicesTab />}
      {tab === "audit" && <AuditTab />}
    </>
  );
}

// ───────────── Company ─────────────

function CompanyTab() {
  const toast = useToast();
  const { data, mutate } = useApi<any>("/settings/company");
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (!form) return <Spinner />;
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const { id: _id, updatedAt: _u, ...body } = form;
      await api("/settings/company", { method: "PUT", body });
      toast("Settings saved. Payroll runs use the new rules from the next processing.");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Company, currency & region">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2">
            <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Country code" hint="ISO code, e.g. IN, US, GB, AE">
            <Input value={form.countryCode} onChange={(e) => set("countryCode", e.target.value.toUpperCase())} maxLength={3} />
          </Field>
          <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata, Europe/London">
            <Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
          <Field label="Currency code" hint="ISO 4217, e.g. INR, USD, EUR">
            <Input value={form.currencyCode} onChange={(e) => set("currencyCode", e.target.value.toUpperCase())} maxLength={3} />
          </Field>
          <Field label="Currency symbol">
            <Input value={form.currencySymbol} onChange={(e) => set("currencySymbol", e.target.value)} maxLength={5} />
          </Field>
        </div>
      </Card>

      <Card title="Working week">
        <p className="mb-3 text-sm text-slate-500">Weekly off days are not working days: no attendance is expected and leave is not counted on them.</p>
        <div className="flex flex-wrap gap-4">
          {WEEKDAYS.map((d, i) => (
            <Checkbox
              key={d}
              label={d}
              checked={form.weeklyOffDays.includes(i)}
              onChange={(on) => set("weeklyOffDays", on ? [...form.weeklyOffDays, i].sort() : form.weeklyOffDays.filter((x: number) => x !== i))}
            />
          ))}
        </div>
      </Card>

      <Card title="Per-day salary (for loss of pay)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Divide monthly salary by">
            <Select value={form.payDivisorMode} onChange={(e) => set("payDivisorMode", e.target.value)}>
              <option value="CALENDAR_DAYS">Calendar days in the month (28–31)</option>
              <option value="WORKING_DAYS">Working days in the month</option>
              <option value="FIXED_DAYS">A fixed number of days</option>
            </Select>
          </Field>
          {form.payDivisorMode === "FIXED_DAYS" && (
            <Field label="Fixed days" hint="e.g. 26 or 30">
              <Input type="number" min={1} max={31} value={form.fixedPayDays} onChange={(e) => set("fixedPayDays", Number(e.target.value))} />
            </Field>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">Loss of pay = per-day salary × (absent days + unpaid leave days + days not employed).</p>
      </Card>

      <Card title="Late attendance deduction">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule" className="sm:col-span-2">
            <Select value={form.lateDeductionMode} onChange={(e) => set("lateDeductionMode", e.target.value)}>
              <option value="NONE">No deduction (track late marks only)</option>
              <option value="COUNT_BASED">Every N late marks = X days of pay</option>
              <option value="PER_MINUTE">Deduct per minute late</option>
            </Select>
          </Field>
          {form.lateDeductionMode === "COUNT_BASED" && (
            <>
              <Field label="Late marks (N)">
                <Input type="number" min={1} value={form.latesPerPenalty} onChange={(e) => set("latesPerPenalty", Number(e.target.value))} />
              </Field>
              <Field label="Days deducted (X)">
                <Input type="number" min={0} step={0.25} value={form.latePenaltyDays} onChange={(e) => set("latePenaltyDays", Number(e.target.value))} />
              </Field>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          An arrival counts as late when check-in is after shift start + grace minutes (set per shift). Per-minute rate = per-day salary ÷ shift length in minutes.
        </p>
      </Card>

      <div className="xl:col-span-2">
        <Button onClick={save} loading={saving}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

// ───────────── Reusable CRUD modal list ─────────────

interface CrudProps<T> {
  path: string;
  title: string;
  empty: () => T;
  toForm?: (row: any) => T;
  toBody?: (form: T) => unknown;
  columns: { header: string; cell: (row: any) => ReactNode }[];
  renderForm: (form: T, set: (k: keyof T, v: any) => void) => ReactNode;
  query?: string;
}

function CrudTable<T extends Record<string, any>>({ path, title, empty, toForm, toBody, columns, renderForm, query = "" }: CrudProps<T>) {
  const toast = useToast();
  const { data, mutate } = useApi<any[]>(`/settings/${path}${query}`);
  const [editing, setEditing] = useState<{ id: number | null; form: T } | null>(null);

  async function save() {
    if (!editing) return;
    try {
      await api(`/settings/${path}${editing.id ? `/${editing.id}` : ""}`, { method: editing.id ? "PUT" : "POST", body: toBody ? toBody(editing.form) : editing.form });
      toast(`${title.replace(/s$/, "")} saved`);
      setEditing(null);
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this record?")) return;
    try {
      await api(`/settings/${path}/${id}`, { method: "DELETE" });
      toast("Deleted");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Card
      title={title}
      padded={false}
      actions={
        <Button size="sm" onClick={() => setEditing({ id: null, form: empty() })}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      }
    >
      <Table
        rows={data}
        rowKey={(r) => r.id}
        columns={[
          ...columns,
          {
            header: "",
            cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id, form: toForm ? toForm(r) : r })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        title={`${editing?.id ? "Edit" : "Add"} ${title.toLowerCase().replace(/s$/, "")}`}
        onClose={() => setEditing(null)}
        footer={<Button onClick={save}>Save</Button>}
      >
        {editing && <div className="grid gap-4 sm:grid-cols-2">{renderForm(editing.form, (k, v) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } }))}</div>}
      </Modal>
    </Card>
  );
}

function SimpleList({ path, title, fields }: { path: string; title: string; fields: { key: string; label: string }[] }) {
  return (
    <CrudTable<Record<string, string>>
      path={path}
      title={title}
      empty={() => Object.fromEntries(fields.map((f) => [f.key, ""]))}
      toForm={(r) => Object.fromEntries(fields.map((f) => [f.key, r[f.key]]))}
      columns={fields.map((f) => ({ header: f.label, cell: (r) => r[f.key] }))}
      renderForm={(form, set) =>
        fields.map((f) => (
          <Field key={f.key} label={f.label} className="sm:col-span-2">
            <Input value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))
      }
    />
  );
}

// ───────────── Shifts ─────────────

function ShiftsTab() {
  return (
    <CrudTable
      path="shifts"
      title="Shifts"
      empty={() => ({ name: "", startTime: "09:00", endTime: "18:00", graceMinutes: 15, minFullDayHours: 8, minHalfDayHours: 4, isDefault: false, isActive: true })}
      toForm={({ id: _id, _count, ...r }) => r}
      columns={[
        { header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
        { header: "Timing", cell: (s) => `${s.startTime} – ${s.endTime}` },
        { header: "Grace", cell: (s) => `${s.graceMinutes} min` },
        { header: "Full / half day", cell: (s) => `${s.minFullDayHours}h / ${s.minHalfDayHours}h` },
        { header: "Employees", cell: (s) => s._count.employees },
        {
          header: "",
          cell: (s) => (
            <div className="flex gap-1">
              {s.isDefault && <Badge tone="blue">Default</Badge>}
              {!s.isActive && <Badge>Inactive</Badge>}
            </div>
          ),
        },
      ]}
      renderForm={(f, set) => (
        <>
          <Field label="Shift name" className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
          <Field label="End time">
            <Input type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </Field>
          <Field label="Grace minutes" hint="Check-in after start + grace is a late mark">
            <Input type="number" min={0} value={f.graceMinutes} onChange={(e) => set("graceMinutes", Number(e.target.value))} />
          </Field>
          <div />
          <Field label="Hours for a full day" hint="Below this = half day">
            <Input type="number" min={0} step={0.5} value={f.minFullDayHours} onChange={(e) => set("minFullDayHours", Number(e.target.value))} />
          </Field>
          <Field label="Hours for a half day" hint="Below this = absent">
            <Input type="number" min={0} step={0.5} value={f.minHalfDayHours} onChange={(e) => set("minHalfDayHours", Number(e.target.value))} />
          </Field>
          <Checkbox label="Default shift for new employees" checked={f.isDefault} onChange={(v) => set("isDefault", v)} />
          <Checkbox label="Active" checked={f.isActive} onChange={(v) => set("isActive", v)} />
        </>
      )}
    />
  );
}

// ───────────── Holidays ─────────────

function HolidaysTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  return (
    <>
      <div className="mb-4 w-32">
        <Field label="Year">
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </Field>
      </div>
      <CrudTable
        path="holidays"
        query={`?year=${year}`}
        title="Holidays"
        empty={() => ({ date: `${year}-01-01`, name: "" })}
        toForm={(h) => ({ date: h.date.slice(0, 10), name: h.name })}
        columns={[
          { header: "Date", cell: (h) => formatDate(h.date) },
          { header: "Day", cell: (h) => WEEKDAYS[new Date(h.date).getUTCDay()] },
          { header: "Holiday", cell: (h) => h.name },
        ]}
        renderForm={(f, set) => (
          <>
            <Field label="Date">
              <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Name">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </>
        )}
      />
    </>
  );
}

// ───────────── Leave types ─────────────

function LeaveTypesTab() {
  return (
    <CrudTable
      path="leave-types"
      title="Leave types"
      empty={() => ({ code: "", name: "", annualQuota: 12 as number | null, isPaid: true, allowHalfDay: true, carryForward: false, maxCarryForward: 0, color: "#6366f1", isActive: true })}
      toForm={({ id: _id, ...r }) => r}
      columns={[
        {
          header: "Leave type",
          cell: (t) => (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-slate-400">{t.code}</span>
            </span>
          ),
        },
        { header: "Days / year", cell: (t) => t.annualQuota ?? "No limit" },
        { header: "Paid", cell: (t) => (t.isPaid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid (loss of pay)</Badge>) },
        { header: "Half day", cell: (t) => (t.allowHalfDay ? "Allowed" : "—") },
        { header: "Carry forward", cell: (t) => (t.carryForward ? `Up to ${t.maxCarryForward} days` : "No") },
        { header: "", cell: (t) => !t.isActive && <Badge>Inactive</Badge> },
      ]}
      renderForm={(f, set) => (
        <>
          <Field label="Code" hint="Short code, e.g. CL, SL, ML">
            <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
          </Field>
          <Field label="Name">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Days per year" hint="Leave empty for no limit">
            <Input type="number" min={0} step={0.5} value={f.annualQuota ?? ""} onChange={(e) => set("annualQuota", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          <Field label="Colour">
            <Input type="color" value={f.color} onChange={(e) => set("color", e.target.value)} className="h-10 p-1" />
          </Field>
          <Checkbox label="Paid leave (unpaid = loss of pay)" checked={f.isPaid} onChange={(v) => set("isPaid", v)} />
          <Checkbox label="Allow half day" checked={f.allowHalfDay} onChange={(v) => set("allowHalfDay", v)} />
          <Checkbox label="Carry forward unused days" checked={f.carryForward} onChange={(v) => set("carryForward", v)} />
          {f.carryForward && (
            <Field label="Maximum days carried forward">
              <Input type="number" min={0} value={f.maxCarryForward} onChange={(e) => set("maxCarryForward", Number(e.target.value))} />
            </Field>
          )}
          <Checkbox label="Active" checked={f.isActive} onChange={(v) => set("isActive", v)} />
        </>
      )}
    />
  );
}

// ───────────── Devices ─────────────

function DevicesTab() {
  const toast = useToast();
  const { data, mutate } = useApi<any[]>("/settings/devices");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", serialNumber: "", location: "" });
  const [newKey, setNewKey] = useState<string | null>(null);

  async function create() {
    try {
      const d = await api("/settings/devices", { body: form });
      setNewKey(d.apiKey);
      setAdding(false);
      setForm({ name: "", serialNumber: "", location: "" });
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function rotate(id: number) {
    if (!confirm("Generate a new key? The old key stops working immediately.")) return;
    const d = await api(`/settings/devices/${id}/rotate-key`, { method: "POST" });
    setNewKey(d.apiKey);
    mutate();
  }

  async function toggle(d: any) {
    await api(`/settings/devices/${d.id}`, { method: "PUT", body: { isActive: !d.isActive } });
    mutate();
  }

  return (
    <div className="space-y-6">
      <Card
        title="Registered biometric terminals"
        padded={false}
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Register device
          </Button>
        }
      >
        <Table
          rows={data}
          rowKey={(d) => d.id}
          columns={[
            { header: "Device", cell: (d) => <span className="font-medium">{d.name}</span> },
            { header: "Serial", cell: (d) => <span className="font-mono text-xs">{d.serialNumber}</span> },
            { header: "Location", cell: (d) => d.location ?? "—" },
            { header: "API key", cell: (d) => <span className="font-mono text-xs">{d.apiKeyPrefix}…</span> },
            { header: "Punches", cell: (d) => d._count.punches.toLocaleString() },
            { header: "Last seen", cell: (d) => <span className="text-xs">{formatDateTime(d.lastSeenAt)}</span> },
            { header: "Status", cell: (d) => (d.isActive ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>) },
            {
              header: "",
              cell: (d) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => rotate(d.id)}>
                    New key
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(d)}>
                    {d.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card title="Integration — how devices send punches">
        <p className="mb-3 text-sm text-slate-600">
          Fingerprint or face-recognition terminals (or their vendor middleware, e.g. a ZKTeco / eSSL sync service) push punches to this REST endpoint with the device&apos;s API key. No device? Use <b>Attendance → Simulate device feed</b> or the
          <code className="mx-1 rounded bg-slate-100 px-1">npm run simulate</code> script.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-[oklch(0.2_0.02_262)] p-4 font-mono text-xs text-[oklch(0.92_0.01_255)] ring-1 ring-line">{`POST /api/device/punches
X-Device-Key: <device API key>
Content-Type: application/json

{
  "punches": [
    { "userId": "BIO1003", "timestamp": "2026-03-10T09:41:07+05:30" },
    { "userId": "EMP0004", "timestamp": "2026-03-10T09:28:55+05:30" }
  ]
}`}</pre>
        <p className="mt-3 text-xs text-slate-500">userId is the employee&apos;s biometric ID or employee code. Duplicates are ignored, so devices can safely resend.</p>
      </Card>

      <Modal open={adding} title="Register device" onClose={() => setAdding(false)} footer={<Button onClick={create}>Register</Button>}>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gate 2 fingerprint reader" />
          </Field>
          <Field label="Serial number">
            <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={!!newKey} title="Device API key" onClose={() => setNewKey(null)} footer={<Button onClick={() => setNewKey(null)}>I have copied it</Button>}>
        <p className="mb-3 text-sm text-slate-600">Copy this key into the device / middleware configuration. It is shown only once.</p>
        <code className="block break-all rounded-lg bg-slate-100 p-3 text-sm">{newKey}</code>
      </Modal>
    </div>
  );
}

// ───────────── Audit log ─────────────

function AuditTab() {
  const { data } = useApi<any[]>("/settings/audit-logs?limit=200");
  return (
    <Card title="Recent changes" padded={false}>
      <Table
        rows={data}
        rowKey={(a) => a.id}
        columns={[
          { header: "When", cell: (a) => <span className="text-xs">{formatDateTime(a.createdAt)}</span> },
          { header: "User", cell: (a) => a.user?.email ?? "system" },
          { header: "Action", cell: (a) => <Badge tone="blue">{a.action}</Badge> },
          { header: "Record", cell: (a) => `${a.entity}${a.entityId ? ` #${a.entityId}` : ""}` },
          {
            header: "Details",
            cell: (a) => <span className="block max-w-md truncate font-mono text-xs text-slate-500">{a.details ? JSON.stringify(a.details) : ""}</span>,
          },
        ]}
      />
    </Card>
  );
}
