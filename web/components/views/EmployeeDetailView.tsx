"use client";

import { ArrowLeft, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner, StatusBadge, Table, Tabs, useToast } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, todayString } from "@/lib/format";
import { EmployeeForm, employeeToInput } from "./EmployeeForm";

type Tab = "profile" | "leave" | "pay";

export default function EmployeeDetailView({ id }: { id: string }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");
  const [deactivating, setDeactivating] = useState(false);
  const [exitDate, setExitDate] = useState(todayString());
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const { data: employee, mutate } = useApi<any>(`/employees/${id}`);

  if (!employee) return <Spinner />;

  async function deactivate() {
    try {
      await api(`/employees/${id}/deactivate`, { body: { dateOfExit: exitDate } });
      toast("Employee deactivated — login disabled, history kept");
      setDeactivating(false);
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function activate() {
    try {
      await api(`/employees/${id}/activate`, { method: "POST" });
      toast("Employee re-activated");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function resetPassword() {
    try {
      await api(`/employees/${id}/reset-password`, { body: { password: newPassword } });
      toast("Password reset");
      setResetOpen(false);
      setNewPassword("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Employees
      </Link>
      <PageHeader
        title={`${employee.firstName} ${employee.lastName}`}
        subtitle={`${employee.employeeCode} · ${employee.designation.title}, ${employee.department.name}`}
        actions={
          <>
            <StatusBadge status={employee.status} />
            {isAdmin && (
              <Button variant="secondary" onClick={() => setResetOpen(true)}>
                Reset password
              </Button>
            )}
            {employee.status === "ACTIVE" ? (
              <Button variant="danger" onClick={() => setDeactivating(true)}>
                <UserX className="h-4 w-4" /> Deactivate
              </Button>
            ) : (
              <Button variant="success" onClick={activate}>
                <UserCheck className="h-4 w-4" /> Re-activate
              </Button>
            )}
          </>
        }
      />
      {employee.status === "INACTIVE" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Deactivated — exit date {formatDate(employee.dateOfExit)}. The login is disabled; attendance and payroll history are kept.
        </p>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "profile", label: "Profile" },
          { value: "leave", label: "Leave balances" },
          { value: "pay", label: "Salary components" },
        ]}
      />

      {tab === "profile" && (
        <Card>
          <EmployeeForm
            key={employee.updatedAt}
            initial={employeeToInput(employee)}
            employeeId={employee.id}
            onSaved={() => {
              toast("Employee updated");
              mutate();
            }}
          />
          <p className="mt-4 text-xs text-slate-400">
            Last login: {formatDateTime(employee.user?.lastLoginAt)} · Created {formatDateTime(employee.createdAt)}
          </p>
        </Card>
      )}
      {tab === "leave" && <LeaveBalances employeeId={employee.id} />}
      {tab === "pay" && <PayOverrides employee={employee} onSaved={mutate} />}

      <Modal
        open={deactivating}
        title="Deactivate employee"
        onClose={() => setDeactivating(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivating(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deactivate}>
              Deactivate
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-600">
          The employee will no longer be able to sign in or appear in new payroll runs after the exit date. Past attendance, leave and payslips stay available.
        </p>
        <Field label="Last working day (exit date)">
          <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={resetOpen}
        title="Reset password"
        onClose={() => setResetOpen(false)}
        footer={
          <Button onClick={resetPassword} disabled={newPassword.length < 8}>
            Set password
          </Button>
        }
      >
        <Field label="New password" hint="At least 8 characters">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

function LeaveBalances({ employeeId }: { employeeId: number }) {
  const year = new Date().getFullYear();
  const { data } = useApi<any[]>(`/leave/balances/${employeeId}?year=${year}`);
  return (
    <Card title={`Leave balances ${year}`} padded={false}>
      <Table
        rows={data}
        rowKey={(b) => b.leaveTypeId}
        columns={[
          {
            header: "Leave type",
            cell: (b) => (
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /> {b.name}
              </span>
            ),
          },
          { header: "Paid", cell: (b) => (b.isPaid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>) },
          { header: "Allocated", cell: (b) => (b.unlimited ? "No limit" : b.allocated) },
          { header: "Carried forward", cell: (b) => b.carriedForward },
          { header: "Used", cell: (b) => b.used },
          { header: "Pending", cell: (b) => b.pending },
          { header: "Available", cell: (b) => <span className="font-semibold">{b.unlimited ? "—" : b.available}</span> },
        ]}
      />
    </Card>
  );
}

function PayOverrides({ employee, onSaved }: { employee: any; onSaved: () => void }) {
  const toast = useToast();
  const { data: components } = useApi<any[]>("/settings/pay-components");
  const [draft, setDraft] = useState<Record<number, { amount: string; percentage: string; isDisabled: boolean }>>(() =>
    Object.fromEntries(
      employee.componentOverrides.map((o: any) => [
        o.componentId,
        { amount: o.amount ?? "", percentage: o.percentage ?? "", isDisabled: o.isDisabled },
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);

  if (!components) return <Spinner />;

  const update = (id: number, patch: Partial<{ amount: string; percentage: string; isDisabled: boolean }>) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { amount: "", percentage: "", isDisabled: false }), ...patch } }));

  async function save() {
    setSaving(true);
    const body = Object.entries(draft)
      .filter(([, v]) => v.isDisabled || v.amount !== "" || v.percentage !== "")
      .map(([componentId, v]) => ({
        componentId: Number(componentId),
        amount: v.amount === "" ? null : Number(v.amount),
        percentage: v.percentage === "" ? null : Number(v.percentage),
        isDisabled: v.isDisabled,
      }));
    try {
      await api(`/employees/${employee.id}/overrides`, { method: "PUT", body });
      toast("Salary overrides saved — they apply from the next payroll run");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Salary components for this employee"
      actions={
        <Button size="sm" onClick={save} loading={saving}>
          Save overrides
        </Button>
      }
      padded={false}
    >
      <p className="px-5 pt-4 text-sm text-slate-500">
        By default every employee follows the company pay structure (Settings → Pay components). Override a fixed amount or rate, or switch a component off, for this employee only.
      </p>
      <Table
        rows={components.filter((c) => c.isActive)}
        rowKey={(c) => c.id}
        columns={[
          {
            header: "Component",
            cell: (c) => (
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-slate-400">{c.code}</p>
              </div>
            ),
          },
          { header: "Type", cell: (c) => <Badge tone={c.kind === "EARNING" ? "green" : c.kind === "DEDUCTION" ? "red" : "blue"}>{c.kind.replace("_", " ")}</Badge> },
          {
            header: "Company rule",
            cell: (c) =>
              c.calcType === "FIXED" ? `Fixed ${Number(c.amount).toLocaleString()}` : c.calcType === "PERCENTAGE" ? `${c.percentage}% of ${c.baseCodes.join(" + ")}` : `Slab on ${c.baseCodes.join(" + ")}`,
          },
          {
            header: "Override",
            cell: (c) =>
              c.calcType === "FIXED" ? (
                <Input className="w-32" type="number" placeholder="Amount" value={draft[c.id]?.amount ?? ""} onChange={(e) => update(c.id, { amount: e.target.value })} />
              ) : c.calcType === "PERCENTAGE" ? (
                <Input className="w-32" type="number" placeholder="Rate %" value={draft[c.id]?.percentage ?? ""} onChange={(e) => update(c.id, { percentage: e.target.value })} />
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
          {
            header: "Exclude",
            cell: (c) => (
              <input
                type="checkbox"
                className="h-4 w-4 accent-rose-600"
                checked={draft[c.id]?.isDisabled ?? false}
                onChange={(e) => update(c.id, { isDisabled: e.target.checked })}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
