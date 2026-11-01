"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export interface EmployeeInput {
  employeeCode: string;
  biometricId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  dateOfJoining: string;
  departmentId: number | "";
  designationId: number | "";
  shiftId: number | "";
  baseSalary: number | "";
  bankName: string;
  bankAccount: string;
  taxId: string;
  address: string;
  role: "EMPLOYEE" | "HR" | "ADMIN";
  password?: string;
}

export const emptyEmployee: EmployeeInput = {
  employeeCode: "",
  biometricId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  dateOfJoining: new Date().toISOString().slice(0, 10),
  departmentId: "",
  designationId: "",
  shiftId: "",
  baseSalary: "",
  bankName: "",
  bankAccount: "",
  taxId: "",
  address: "",
  role: "EMPLOYEE",
  password: "",
};

export function employeeToInput(e: any): EmployeeInput {
  return {
    employeeCode: e.employeeCode,
    biometricId: e.biometricId ?? "",
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone ?? "",
    gender: e.gender ?? "",
    dateOfBirth: e.dateOfBirth?.slice(0, 10) ?? "",
    dateOfJoining: e.dateOfJoining.slice(0, 10),
    departmentId: e.departmentId,
    designationId: e.designationId,
    shiftId: e.shiftId,
    baseSalary: Number(e.baseSalary),
    bankName: e.bankName ?? "",
    bankAccount: e.bankAccount ?? "",
    taxId: e.taxId ?? "",
    address: e.address ?? "",
    role: e.user?.role ?? "EMPLOYEE",
  };
}

export function EmployeeForm({ initial, employeeId, onSaved }: { initial: EmployeeInput; employeeId?: number; onSaved: (employee: any) => void }) {
  const { isAdmin, currency } = useAuth();
  const [form, setForm] = useState<EmployeeInput>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: departments } = useApi<any[]>("/settings/departments");
  const { data: designations } = useApi<any[]>("/settings/designations");
  const { data: shifts } = useApi<any[]>("/settings/shifts");

  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const body = {
      ...form,
      departmentId: Number(form.departmentId),
      designationId: Number(form.designationId),
      shiftId: Number(form.shiftId),
      baseSalary: Number(form.baseSalary),
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      biometricId: form.biometricId || null,
      ...(employeeId ? { password: undefined } : {}),
    };
    try {
      const saved = await api(employeeId ? `/employees/${employeeId}` : "/employees", { method: employeeId ? "PUT" : "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Personal details</legend>
        <Field label="First name *">
          <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
        </Field>
        <Field label="Last name *">
          <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Email (login) *">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-3">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Employment</legend>
        <Field label="Employee code *">
          <Input value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value.toUpperCase())} required />
        </Field>
        <Field label="Biometric / device ID" hint="ID enrolled on the fingerprint or face device. Defaults to the employee code.">
          <Input value={form.biometricId} onChange={(e) => set("biometricId", e.target.value)} />
        </Field>
        <Field label="Date of joining *">
          <Input type="date" value={form.dateOfJoining} onChange={(e) => set("dateOfJoining", e.target.value)} required />
        </Field>
        <Field label="Department *">
          <Select value={form.departmentId} onChange={(e) => set("departmentId", Number(e.target.value))} required>
            <option value="">Select…</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Designation *">
          <Select value={form.designationId} onChange={(e) => set("designationId", Number(e.target.value))} required>
            <option value="">Select…</option>
            {designations?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Shift *">
          <Select value={form.shiftId} onChange={(e) => set("shiftId", Number(e.target.value))} required>
            <option value="">Select…</option>
            {shifts
              ?.filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
          </Select>
        </Field>
        <Field label="System role">
          <Select value={form.role} onChange={(e) => set("role", e.target.value as EmployeeInput["role"])} disabled={!isAdmin}>
            <option value="EMPLOYEE">Employee</option>
            <option value="HR">HR</option>
            <option value="ADMIN">Admin</option>
          </Select>
        </Field>
        {!employeeId && (
          <Field label="Initial password *" hint="At least 8 characters. Share it with the employee securely.">
            <Input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Salary & bank</legend>
        <Field label={`Monthly base salary (${currency}) *`} hint="Pay components are calculated from this amount.">
          <Input type="number" min={0} step="0.01" value={form.baseSalary} onChange={(e) => set("baseSalary", e.target.value === "" ? "" : Number(e.target.value))} required />
        </Field>
        <Field label="Bank name">
          <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
        </Field>
        <Field label="Bank account">
          <Input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
        </Field>
        <Field label="Tax ID">
          <Input value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
        </Field>
      </fieldset>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {employeeId ? "Save changes" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
