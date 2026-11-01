"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, Select, Table, Textarea, useToast } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/api";

interface Slab {
  from: number;
  to: number | null;
  rate?: number | null;
  amount?: number | null;
}

interface ComponentForm {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";
  calcType: "FIXED" | "PERCENTAGE" | "SLAB";
  amount: number | null;
  percentage: number | null;
  baseCodes: string[];
  baseCap: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  slabs: Slab[];
  slabMode: "PROGRESSIVE" | "FLAT" | null;
  slabPeriod: "MONTHLY" | "ANNUAL";
  applyIfGrossMin: number | null;
  applyIfGrossMax: number | null;
  prorate: boolean;
  isTaxable: boolean;
  sequence: number;
  isActive: boolean;
  description: string;
}

const blank = (): ComponentForm => ({
  code: "",
  name: "",
  kind: "EARNING",
  calcType: "PERCENTAGE",
  amount: null,
  percentage: null,
  baseCodes: ["BASE_SALARY"],
  baseCap: null,
  minAmount: null,
  maxAmount: null,
  slabs: [{ from: 0, to: null, rate: 0 }],
  slabMode: "PROGRESSIVE",
  slabPeriod: "MONTHLY",
  applyIfGrossMin: null,
  applyIfGrossMax: null,
  prorate: true,
  isTaxable: true,
  sequence: 100,
  isActive: true,
  description: "",
});

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function toForm(c: any): ComponentForm {
  return {
    ...blank(),
    ...c,
    amount: num(c.amount),
    baseCap: num(c.baseCap),
    minAmount: num(c.minAmount),
    maxAmount: num(c.maxAmount),
    applyIfGrossMin: num(c.applyIfGrossMin),
    applyIfGrossMax: num(c.applyIfGrossMax),
    slabs: c.slabs ?? blank().slabs,
    description: c.description ?? "",
  };
}

function describe(c: any) {
  const base = c.baseCodes?.join(" + ");
  let text =
    c.calcType === "FIXED"
      ? `Fixed ${Number(c.amount).toLocaleString()}`
      : c.calcType === "PERCENTAGE"
        ? `${c.percentage}% of ${base}${c.baseCap ? ` (base capped at ${Number(c.baseCap).toLocaleString()})` : ""}`
        : `${c.slabMode === "PROGRESSIVE" ? "Progressive" : "Flat"} slabs on ${base}${c.slabPeriod === "ANNUAL" ? " (annualised)" : ""}`;
  if (c.applyIfGrossMax) text += ` · only if gross ≤ ${Number(c.applyIfGrossMax).toLocaleString()}`;
  if (c.applyIfGrossMin) text += ` · only if gross ≥ ${Number(c.applyIfGrossMin).toLocaleString()}`;
  return text;
}

const KIND_LABEL = { EARNING: "Earnings", DEDUCTION: "Deductions", EMPLOYER_CONTRIBUTION: "Employer contributions" } as const;

export function PayComponentsTab() {
  const toast = useToast();
  const { data, mutate } = useApi<any[]>("/settings/pay-components");
  const [editing, setEditing] = useState<{ id: number | null; form: ComponentForm } | null>(null);

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = {
      ...f,
      slabs: f.calcType === "SLAB" ? f.slabs : null,
      slabMode: f.calcType === "SLAB" ? f.slabMode : null,
      baseCodes: f.calcType === "FIXED" ? [] : f.baseCodes,
      description: f.description || null,
    };
    try {
      await api(`/settings/pay-components${editing.id ? `/${editing.id}` : ""}`, { method: editing.id ? "PUT" : "POST", body });
      toast("Pay component saved");
      setEditing(null);
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this pay component? Finalized payslips are not affected.")) return;
    try {
      await api(`/settings/pay-components/${id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
        Build your country&apos;s salary structure from components. Each is a <b>fixed amount</b>, a <b>percentage</b> of other components (optionally capped), or <b>slabs</b> (income-tax brackets or banded amounts),
        and can apply only within a gross-salary range. Loss of pay and late deductions are added automatically. <code>BASE_SALARY</code> = the employee&apos;s monthly salary; <code>GROSS</code> = earned gross after loss of pay.
      </div>
      {(["EARNING", "DEDUCTION", "EMPLOYER_CONTRIBUTION"] as const).map((kind) => (
        <Card
          key={kind}
          title={KIND_LABEL[kind]}
          className="mb-6"
          padded={false}
          actions={
            <Button size="sm" onClick={() => setEditing({ id: null, form: { ...blank(), kind, baseCodes: kind === "EARNING" ? ["BASE_SALARY"] : ["GROSS"] } })}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          <Table
            rows={data?.filter((c) => c.kind === kind)}
            rowKey={(c) => c.id}
            empty="None configured"
            columns={[
              { header: "#", cell: (c) => <span className="text-xs text-slate-400">{c.sequence}</span> },
              {
                header: "Component",
                cell: (c) => (
                  <div>
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="font-mono text-xs text-slate-400">{c.code}</p>
                  </div>
                ),
              },
              { header: "Rule", cell: (c) => <span className="text-slate-600">{describe(c)}</span>, className: "whitespace-normal" },
              {
                header: "",
                cell: (c) => (
                  <div className="flex gap-1">
                    {kind === "EARNING" && !c.prorate && <Badge tone="violet">Not reduced for LOP</Badge>}
                    {!c.isActive && <Badge>Inactive</Badge>}
                  </div>
                ),
              },
              {
                header: "",
                cell: (c) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, form: toForm(c) })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ))}

      {editing && (
        <ComponentEditor
          form={editing.form}
          isNew={!editing.id}
          all={data ?? []}
          onChange={(form) => setEditing({ ...editing, form })}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  );
}

function ComponentEditor({
  form,
  isNew,
  all,
  onChange,
  onClose,
  onSave,
}: {
  form: ComponentForm;
  isNew: boolean;
  all: any[];
  onChange: (f: ComponentForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof ComponentForm>(k: K, v: ComponentForm[K]) => onChange({ ...form, [k]: v });
  const baseOptions = [
    "BASE_SALARY",
    ...(form.kind !== "EARNING" ? ["GROSS"] : []),
    ...all.filter((c) => c.code !== form.code && (form.kind !== "EARNING" ? c.kind === "EARNING" || c.kind === form.kind : c.kind === "EARNING")).map((c) => c.code),
  ];
  const setSlab = (i: number, patch: Partial<Slab>) => set("slabs", form.slabs.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Modal open wide title={`${isNew ? "Add" : "Edit"} pay component`} onClose={onClose} footer={<Button onClick={onSave}>Save component</Button>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code" hint="Unique, used in formulas">
          <Input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
        </Field>
        <Field label="Name (shown on payslip)" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value as ComponentForm["kind"])}>
            <option value="EARNING">Earning</option>
            <option value="DEDUCTION">Deduction (from employee)</option>
            <option value="EMPLOYER_CONTRIBUTION">Employer contribution</option>
          </Select>
        </Field>
        <Field label="Calculation">
          <Select value={form.calcType} onChange={(e) => set("calcType", e.target.value as ComponentForm["calcType"])}>
            <option value="FIXED">Fixed amount</option>
            <option value="PERCENTAGE">Percentage of…</option>
            <option value="SLAB">Slabs / brackets</option>
          </Select>
        </Field>
        <Field label="Calculation order" hint="Lower runs first">
          <Input type="number" value={form.sequence} onChange={(e) => set("sequence", Number(e.target.value))} />
        </Field>

        {form.calcType === "FIXED" && (
          <Field label="Amount (per month)">
            <Input type="number" min={0} value={form.amount ?? ""} onChange={(e) => set("amount", num(e.target.value))} />
          </Field>
        )}
        {form.calcType === "PERCENTAGE" && (
          <Field label="Rate %">
            <Input type="number" min={0} step="0.01" value={form.percentage ?? ""} onChange={(e) => set("percentage", num(e.target.value))} />
          </Field>
        )}
        {form.calcType !== "FIXED" && (
          <>
            <Field label="Calculated on (sum of)" className="sm:col-span-2">
              <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 p-2.5">
                {baseOptions.map((code) => (
                  <Checkbox
                    key={code}
                    label={code}
                    checked={form.baseCodes.includes(code)}
                    onChange={(on) => set("baseCodes", on ? [...form.baseCodes, code] : form.baseCodes.filter((c) => c !== code))}
                  />
                ))}
              </div>
            </Field>
            <Field label="Cap the base at" hint="Optional, e.g. a statutory wage ceiling">
              <Input type="number" min={0} value={form.baseCap ?? ""} onChange={(e) => set("baseCap", num(e.target.value))} />
            </Field>
          </>
        )}

        {form.calcType === "SLAB" && (
          <div className="space-y-3 sm:col-span-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slab type">
                <Select value={form.slabMode ?? "PROGRESSIVE"} onChange={(e) => set("slabMode", e.target.value as ComponentForm["slabMode"])}>
                  <option value="PROGRESSIVE">Progressive — each band at its own rate (income tax)</option>
                  <option value="FLAT">Flat — the band the base falls in decides the amount</option>
                </Select>
              </Field>
              <Field label="Slab ranges are">
                <Select value={form.slabPeriod} onChange={(e) => set("slabPeriod", e.target.value as ComponentForm["slabPeriod"])}>
                  <option value="MONTHLY">Monthly amounts</option>
                  <option value="ANNUAL">Annual amounts (base × 12, result ÷ 12)</option>
                </Select>
              </Field>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-1">From</th>
                  <th className="pb-1">To (empty = and above)</th>
                  <th className="pb-1">Rate %</th>
                  {form.slabMode === "FLAT" && <th className="pb-1">or fixed amount</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.slabs.map((s, i) => (
                  <tr key={i}>
                    <td className="pr-2 pb-2">
                      <Input type="number" value={s.from} onChange={(e) => setSlab(i, { from: Number(e.target.value) })} />
                    </td>
                    <td className="pr-2 pb-2">
                      <Input type="number" value={s.to ?? ""} onChange={(e) => setSlab(i, { to: num(e.target.value) })} />
                    </td>
                    <td className="pr-2 pb-2">
                      <Input type="number" step="0.01" value={s.rate ?? ""} onChange={(e) => setSlab(i, { rate: num(e.target.value) })} />
                    </td>
                    {form.slabMode === "FLAT" && (
                      <td className="pr-2 pb-2">
                        <Input type="number" value={s.amount ?? ""} onChange={(e) => setSlab(i, { amount: num(e.target.value) })} />
                      </td>
                    )}
                    <td className="pb-2">
                      <Button size="sm" variant="ghost" onClick={() => set("slabs", form.slabs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => set("slabs", [...form.slabs, { from: form.slabs[form.slabs.length - 1]?.to ?? 0, to: null, rate: 0 }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add slab
            </Button>
          </div>
        )}

        <Field label="Minimum amount">
          <Input type="number" min={0} value={form.minAmount ?? ""} onChange={(e) => set("minAmount", num(e.target.value))} />
        </Field>
        <Field label="Maximum amount">
          <Input type="number" min={0} value={form.maxAmount ?? ""} onChange={(e) => set("maxAmount", num(e.target.value))} />
        </Field>
        <div />
        {form.kind !== "EARNING" && (
          <>
            <Field label="Apply only if gross ≥" hint="Optional eligibility threshold">
              <Input type="number" min={0} value={form.applyIfGrossMin ?? ""} onChange={(e) => set("applyIfGrossMin", num(e.target.value))} />
            </Field>
            <Field label="Apply only if gross ≤">
              <Input type="number" min={0} value={form.applyIfGrossMax ?? ""} onChange={(e) => set("applyIfGrossMax", num(e.target.value))} />
            </Field>
            <div />
          </>
        )}
        <div className="flex flex-wrap gap-6 sm:col-span-3">
          {form.kind === "EARNING" && <Checkbox label="Reduce for loss of pay / late deductions" checked={form.prorate} onChange={(v) => set("prorate", v)} />}
          <Checkbox label="Taxable" checked={form.isTaxable} onChange={(v) => set("isTaxable", v)} />
          <Checkbox label="Active" checked={form.isActive} onChange={(v) => set("isActive", v)} />
        </div>
        <Field label="Description / notes" className="sm:col-span-3">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
