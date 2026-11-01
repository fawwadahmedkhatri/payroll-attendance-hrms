"use client";

import { Download, FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, PageHeader, Table, useToast } from "@/components/ui";
import { api, errorMessage, openFile } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  errors: { row: number; message: string }[];
  preview?: { row: number; employeeCode: string; date: string; checkIn: string; checkOut: string | null }[];
  inserted?: number;
  duplicates?: number;
}

export default function ImportView() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<ImportResult>(`/attendance/import?dryRun=${dryRun}`, { form });
      setResult(r);
      if (!dryRun) {
        toast(`Imported ${r.validRows} rows — ${r.inserted} new punches, ${r.duplicates} duplicates skipped`);
        setFile(null);
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Import attendance"
        subtitle="Upload an Excel (.xlsx) or CSV export from a biometric system or a manual register"
        actions={
          <>
            <Button variant="secondary" onClick={() => openFile("/attendance/import/template?format=xlsx")}>
              <Download className="h-4 w-4" /> Excel template
            </Button>
            <Button variant="secondary" onClick={() => openFile("/attendance/import/template?format=csv")}>
              <Download className="h-4 w-4" /> CSV template
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="1. Choose file" className="lg:col-span-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-brand-400">
            <FileUp className="h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">{file ? file.name : "Click to choose a .xlsx or .csv file"}</p>
            <p className="text-xs text-slate-400">Max 10 MB · 20,000 rows</p>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" disabled={!file} loading={busy && !result} onClick={() => upload(true)}>
              2. Validate
            </Button>
            <Button disabled={!file || !result?.dryRun || result.validRows === 0} loading={busy && !!result} onClick={() => upload(false)}>
              <Upload className="h-4 w-4" /> 3. Import {result?.dryRun ? `${result.validRows} valid rows` : ""}
            </Button>
          </div>
        </Card>

        <Card title="File format">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {[
                ["EmployeeCode", "EMP0003"],
                ["Date", "2026-03-10 (YYYY-MM-DD)"],
                ["CheckIn", "09:42 (24h HH:mm)"],
                ["CheckOut", "18:35 (optional)"],
              ].map(([c, e]) => (
                <tr key={c}>
                  <td className="py-2 font-mono text-xs font-semibold">{c}</td>
                  <td className="py-2 text-slate-500">{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Times are read in the company timezone. Re-importing the same file is safe — duplicate punches are skipped. Late marks and half days are calculated automatically from each employee&apos;s shift.
          </p>
        </Card>
      </div>

      {result && (
        <Card className="mt-6" title={result.dryRun ? "Validation result" : "Import complete"}>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="gray">{result.totalRows} rows</Badge>
            <Badge tone="green">{result.validRows} valid</Badge>
            <Badge tone={result.errors.length ? "red" : "gray"}>{result.errors.length} with errors</Badge>
            {!result.dryRun && <Badge tone="blue">{result.inserted} punches saved</Badge>}
          </div>
          {result.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-rose-700">Rows that will be skipped</h3>
              <Table
                rows={result.errors.slice(0, 200)}
                rowKey={(e) => e.row}
                columns={[
                  { header: "Row", cell: (e) => e.row },
                  { header: "Problem", cell: (e) => <span className="text-rose-700">{e.message}</span>, className: "whitespace-normal" },
                ]}
              />
            </div>
          )}
          {result.preview && result.preview.length > 0 && (
            <>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Preview (first 20 valid rows)</h3>
              <Table
                rows={result.preview}
                rowKey={(r) => r.row}
                columns={[
                  { header: "Row", cell: (r) => r.row },
                  { header: "Employee", cell: (r) => r.employeeCode },
                  { header: "Date", cell: (r) => formatDate(r.date) },
                  { header: "Check in", cell: (r) => r.checkIn },
                  { header: "Check out", cell: (r) => r.checkOut ?? "—" },
                ]}
              />
            </>
          )}
        </Card>
      )}
    </>
  );
}
