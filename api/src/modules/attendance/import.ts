import ExcelJS from "exceljs";
import Papa from "papaparse";
import { isDateString } from "../../lib/dates";
import { badRequest } from "../../lib/errors";

/**
 * Attendance import from Excel (.xlsx) or CSV.
 * Expected columns (header names are case-insensitive):
 *   EmployeeCode | Date (YYYY-MM-DD) | CheckIn (HH:mm) | CheckOut (HH:mm)
 */

export const IMPORT_COLUMNS = ["EmployeeCode", "Date", "CheckIn", "CheckOut"] as const;

export interface RawRow {
  row: number;
  employeeCode: string;
  date: string;
  checkIn: string;
  checkOut: string;
}

export interface RowError {
  row: number;
  message: string;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function normaliseHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Excel stores dates and times as Date objects (times on 1899-12-30, in UTC). */
function cellToString(value: unknown, kind: "date" | "time"): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return kind === "date"
      ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
      : `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  }
  if (typeof value === "object" && value && "text" in value) return String((value as { text: unknown }).text).trim();
  if (typeof value === "number" && kind === "time") {
    // Fraction of a day
    const minutes = Math.round(value * 24 * 60);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  return String(value).trim();
}

function mapRecords(records: Record<string, unknown>[], firstDataRow: number): RawRow[] {
  return records.map((r, i) => {
    const get = (name: string) => {
      const key = Object.keys(r).find((k) => normaliseHeader(k) === normaliseHeader(name));
      return key ? r[key] : undefined;
    };
    return {
      row: firstDataRow + i,
      employeeCode: cellToString(get("EmployeeCode"), "date"),
      date: cellToString(get("Date"), "date"),
      checkIn: cellToString(get("CheckIn"), "time"),
      checkOut: cellToString(get("CheckOut"), "time"),
    };
  });
}

function checkHeaders(headers: string[]) {
  const present = new Set(headers.map(normaliseHeader));
  const missing = IMPORT_COLUMNS.filter((c) => !present.has(normaliseHeader(c)));
  if (missing.length > 0) throw badRequest(`Missing column(s): ${missing.join(", ")}. Download the template for the expected format.`);
}

export async function parseAttendanceFile(buffer: Buffer, filename: string): Promise<RawRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf8"), { header: true, skipEmptyLines: true });
    checkHeaders(parsed.meta.fields ?? []);
    return mapRecords(parsed.data, 2);
  }
  if (lower.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest("The workbook has no sheets");
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.value ?? "")));
    checkHeaders(headers.filter(Boolean));
    const records: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, unknown> = {};
      row.eachCell((cell, col) => {
        if (headers[col]) record[headers[col]] = cell.value;
      });
      if (Object.keys(record).length > 0) records.push({ ...record, __row: rowNumber });
    });
    return records.map((r) => ({ ...mapRecords([r], 0)[0], row: r.__row as number }));
  }
  throw badRequest("Upload a .csv or .xlsx file");
}

export interface ValidRow {
  row: number;
  employeeId: number;
  employeeCode: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
}

/** Validate rows against known employees; returns valid rows and row-level errors. */
export function validateRows(rows: RawRow[], employeesByCode: Map<string, { id: number; dateOfJoining: string }>, today: string) {
  const valid: ValidRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const problems: string[] = [];
    const employee = employeesByCode.get(r.employeeCode.toUpperCase());
    if (!r.employeeCode) problems.push("EmployeeCode is empty");
    else if (!employee) problems.push(`Unknown employee code "${r.employeeCode}"`);
    if (!isDateString(r.date)) problems.push(`Date "${r.date}" must be YYYY-MM-DD`);
    else if (r.date > today) problems.push("Date is in the future");
    else if (employee && r.date < employee.dateOfJoining) problems.push("Date is before the employee joined");
    if (!TIME_RE.test(r.checkIn)) problems.push(`CheckIn "${r.checkIn}" must be HH:mm`);
    if (r.checkOut && !TIME_RE.test(r.checkOut)) problems.push(`CheckOut "${r.checkOut}" must be HH:mm`);
    const checkIn = r.checkIn.slice(0, 5).padStart(5, "0");
    const checkOut = r.checkOut ? r.checkOut.slice(0, 5).padStart(5, "0") : null;
    if (!problems.length && checkOut && checkOut <= checkIn) problems.push("CheckOut must be after CheckIn");
    const dupKey = `${r.employeeCode.toUpperCase()}|${r.date}`;
    if (seen.has(dupKey)) problems.push("Duplicate row for this employee and date");
    seen.add(dupKey);

    if (problems.length > 0 || !employee) {
      errors.push({ row: r.row, message: problems.join("; ") });
    } else {
      valid.push({ row: r.row, employeeId: employee.id, employeeCode: r.employeeCode, date: r.date, checkIn, checkOut });
    }
  }
  return { valid, errors };
}

export async function buildTemplate(format: "csv" | "xlsx", sample: { code: string; date: string }[]) {
  const rows = sample.map((s, i) => [s.code, s.date, i % 3 === 0 ? "09:52" : "09:24", "18:41"]);
  if (format === "csv") {
    return Buffer.from(Papa.unparse({ fields: [...IMPORT_COLUMNS], data: rows }));
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance");
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c, key: c, width: 16 }));
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
