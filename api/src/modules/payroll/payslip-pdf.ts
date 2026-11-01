import PDFDocument from "pdfkit";
import type { CompanySettings, Payslip, PayslipLine, PayrollRun } from "@prisma/client";
import { toNum } from "../../lib/money";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type FullPayslip = Payslip & { lines: PayslipLine[]; payrollRun: PayrollRun; employee: { bankName: string | null; bankAccount: string | null; taxId: string | null } };

/** Render a payslip to a PDF buffer. Currency is shown by ISO code because PDF base fonts lack many symbols. */
export function renderPayslipPdf(slip: FullPayslip, company: CompanySettings): Promise<Buffer> {
  const money = (value: unknown) =>
    `${company.currencyCode} ${toNum(value as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 40;
    const width = doc.page.width - 80;
    const period = `${MONTHS[slip.payrollRun.month - 1]} ${slip.payrollRun.year}`;

    // Header in the organisation's brand colour, with its logo when one is set (PDF supports PNG/JPEG)
    doc.rect(left, 40, width, 60).fill(company.brandColor);
    let textX = left + 16;
    const logo = company.logoDataUrl?.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (logo) {
      try {
        doc.roundedRect(left + 12, 48, 44, 44, 6).fill("#ffffff");
        doc.image(Buffer.from(logo[2], "base64"), left + 15, 51, { fit: [38, 38], align: "center", valign: "center" });
        textX = left + 66;
      } catch {
        /* unreadable image — header still renders without it */
      }
    }
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(16).text(company.companyName, textX, 52);
    doc.font("Helvetica").fontSize(9).text(company.address ?? "", textX, 74, { width: width - 250 });
    doc.font("Helvetica-Bold").fontSize(12).text("PAYSLIP", left, 52, { width: width - 16, align: "right" });
    doc.font("Helvetica").fontSize(10).text(period, left, 70, { width: width - 16, align: "right" });
    if (slip.payrollRun.status !== "FINALIZED") {
      doc.fontSize(8).text("DRAFT — not final", left, 84, { width: width - 16, align: "right" });
    }
    doc.fill("#0f172a");

    // Employee details
    let y = 116;
    const detail = (label: string, value: string, x: number) => {
      doc.font("Helvetica").fontSize(8).fill("#64748b").text(label, x, y);
      // Fixed column width: long values wrap (max 2 lines) instead of running into the next column
      doc.font("Helvetica-Bold").fontSize(10).fill("#0f172a").text(value || "-", x, y + 10, { width: 150, height: 24, ellipsis: true });
    };
    detail("Employee", slip.employeeName, left);
    detail("Employee code", slip.employeeCode, left + 180);
    detail("Department", slip.departmentName, left + 340);
    y += 32;
    detail("Designation", slip.designationTitle, left);
    detail("Bank account", [slip.employee.bankName, slip.employee.bankAccount].filter(Boolean).join(" - "), left + 180);
    detail("Tax ID", slip.employee.taxId ?? "", left + 340);
    y += 40;

    // Attendance summary
    doc.rect(left, y, width, 44).fill("#f1f5f9").fill("#0f172a");
    const stats: [string, string][] = [
      ["Pay days (divisor)", String(slip.divisorDays)],
      ["Working days", String(slip.workingDays)],
      ["Present", String(slip.presentDays)],
      ["Paid leave", String(slip.paidLeaveDays)],
      ["Unpaid leave", String(slip.unpaidLeaveDays)],
      ["Absent", String(slip.absentDays)],
      ["Late marks", String(slip.lateCount)],
      ["LOP days", String(slip.lopDays)],
    ];
    const colW = width / stats.length;
    stats.forEach(([label, value], i) => {
      doc.font("Helvetica").fontSize(7).fill("#64748b").text(label, left + i * colW + 6, y + 8, { width: colW - 8 });
      doc.font("Helvetica-Bold").fontSize(11).fill("#0f172a").text(value, left + i * colW + 6, y + 22, { width: colW - 8 });
    });
    y += 60;

    // Earnings | Deductions tables
    const earnings = slip.lines.filter((l) => l.kind === "EARNING").sort((a, b) => a.sequence - b.sequence);
    const deductions = slip.lines.filter((l) => l.kind === "DEDUCTION").sort((a, b) => a.sequence - b.sequence);
    const employer = slip.lines.filter((l) => l.kind === "EMPLOYER_CONTRIBUTION");
    const half = width / 2 - 6;

    const table = (title: string, rows: PayslipLine[], x: number, total: [string, unknown]) => {
      let ty = y;
      doc.rect(x, ty, half, 20).fill("#e2e8f0").fill("#0f172a");
      doc.font("Helvetica-Bold").fontSize(9).text(title, x + 8, ty + 6);
      doc.text("Amount", x, ty + 6, { width: half - 8, align: "right" });
      ty += 24;
      doc.font("Helvetica").fontSize(9);
      for (const row of rows) {
        // Long component names wrap; the row grows to fit instead of overlapping the next one
        const nameHeight = doc.heightOfString(row.name, { width: half - 110 });
        doc.text(row.name, x + 8, ty, { width: half - 110 });
        doc.text(money(row.amount), x, ty, { width: half - 8, align: "right" });
        ty += Math.max(16, nameHeight + 5);
      }
      return { ty, total };
    };
    const a = table("Earnings", earnings, left, ["Gross earnings", slip.grossEarnings]);
    const b = table("Deductions", deductions, left + half + 12, ["Total deductions", slip.totalDeductions]);
    const totalY = Math.max(a.ty, b.ty) + 4;
    for (const [x, [label, value]] of [
      [left, a.total],
      [left + half + 12, b.total],
    ] as const) {
      doc.moveTo(x, totalY).lineTo(x + half, totalY).strokeColor("#cbd5e1").stroke();
      doc.font("Helvetica-Bold").fontSize(9).text(label, x + 8, totalY + 6);
      doc.text(money(value), x, totalY + 6, { width: half - 8, align: "right" });
    }
    y = totalY + 32;

    // Net pay
    doc.rect(left, y, width, 36).fill(company.brandColor);
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(12).text("NET PAY", left + 12, y + 12);
    doc.fontSize(14).text(money(slip.netPay), left, y + 11, { width: width - 12, align: "right" });
    doc.fill("#0f172a");
    y += 52;

    if (employer.length > 0) {
      doc.font("Helvetica-Bold").fontSize(9).text("Employer contributions (not deducted from your pay)", left, y);
      y += 14;
      doc.font("Helvetica").fontSize(9);
      for (const row of employer) {
        doc.text(row.name, left + 8, y);
        doc.text(money(row.amount), left, y, { width: half - 8, align: "right" });
        y += 14;
      }
    }

    doc
      .font("Helvetica")
      .fontSize(7)
      .fill("#94a3b8")
      .text("This is a computer-generated payslip and does not require a signature.", left, doc.page.height - 60, {
        width,
        align: "center",
      });
    doc.end();
  });
}
