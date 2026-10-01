import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { authFetch } from "@/lib/queryClient";
import logoUrl from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type DiariasGrade = {
  month: string;
  from: string;
  to: string;
  label: string;
  valorUnitario: number;
  days: string[];
  rows: { employeeId: number; name: string; matricula: string; dates: string[]; total: number }[];
  totalGeral: number;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dayParts(iso: string) {
  const [, m, d] = iso.split("-");
  return { day: d, month: MESES[Number(m) - 1] || "" };
}

function fitText(doc: jsPDF, text: string, maxW: number) {
  let s = text || "—";
  while (s.length > 1 && doc.getTextWidth(s) > maxW) s = s.slice(0, -1);
  return s.length < (text || "").length ? `${s.slice(0, -1)}…` : s;
}

async function loadLogo(): Promise<{ dataUrl: string; buffer: ArrayBuffer } | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("logo"));
      reader.readAsDataURL(new Blob([buffer], { type: "image/jpeg" }));
    });
    return { dataUrl, buffer };
  } catch {
    return null;
  }
}

export async function fetchDiariasGrade(month: string): Promise<DiariasGrade> {
  const r = await authFetch(`/api/daily-allowances/ponto-grade?month=${encodeURIComponent(month)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.message || "Não foi possível montar o controle de diárias");
  }
  return r.json();
}

export async function downloadDiariasPdf(grade: DiariasGrade) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 7;
  const logo = await loadLogo();

  doc.setFillColor(203, 213, 225);
  doc.roundedRect(m + 1.5, m + 1.8, pageW - m * 2, pageH - m * 2, 5, 5, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(m, m, pageW - m * 2, pageH - m * 2, 5, 5, "F");

  doc.setFillColor(23, 23, 23);
  doc.roundedRect(m, m, pageW - m * 2, 16, 5, 5, "F");
  doc.rect(m, m + 8, pageW - m * 2, 8, "F");

  if (logo) doc.addImage(logo.dataUrl, "JPEG", m + 3, m + 2, 12, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CONTROLE DE DIÁRIAS", m + 18, m + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(212, 212, 212);
  doc.text(`Ciclo ${grade.label}   ·   ${brl(grade.valorUnitario)} por dia marcado`, m + 18, m + 12);

  const tableTop = m + 20;
  const tableLeft = m + 3;
  const tableRight = pageW - m - 3;
  const nameW = 48;
  const matW = 16;
  const totW = 22;
  const days = grade.days;
  const dayW = (tableRight - tableLeft - nameW - matW - totW) / Math.max(days.length, 1);
  const headH = 8;
  const bodyTop = tableTop + headH;
  const bodyBottom = pageH - m - 8;
  const slots = Math.max(grade.rows.length, 1) + 1;
  const rowH = (bodyBottom - bodyTop) / slots;
  const font = rowH < 4 ? 4.6 : rowH < 5 ? 5.5 : 6.5;

  doc.setFillColor(24, 24, 27);
  doc.roundedRect(tableLeft, tableTop, tableRight - tableLeft, headH, 1.6, 1.6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("VIGILANTE", tableLeft + 1.4, tableTop + 4.8);
  doc.text("MATR.", tableLeft + nameW + 1, tableTop + 4.8);
  days.forEach((iso, i) => {
    const x = tableLeft + nameW + matW + i * dayW;
    const p = dayParts(iso);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(dayW < 4.4 ? 4 : 5.2);
    doc.text(p.day, x + dayW / 2, tableTop + 3.3, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(3.6);
    doc.text(p.month, x + dayW / 2, tableTop + 6.2, { align: "center" });
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("TOTAL", tableRight - totW / 2, tableTop + 4.8, { align: "center" });

  if (grade.rows.length === 0) {
    doc.setTextColor(113, 113, 122);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Nenhuma diária marcada neste ciclo.", tableLeft + 2, bodyTop + 8);
  }

  grade.rows.forEach((row, ri) => {
    const y = bodyTop + ri * rowH;
    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(tableLeft, y, tableRight - tableLeft, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(font);
    doc.setTextColor(24, 24, 27);
    doc.text(fitText(doc, row.name, nameW - 2), tableLeft + 1.2, y + rowH * 0.68);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 91);
    doc.text(fitText(doc, row.matricula || "—", matW - 1.4), tableLeft + nameW + 0.8, y + rowH * 0.68);
    const marked = new Set(row.dates);
    days.forEach((iso, i) => {
      if (!marked.has(iso)) return;
      const x = tableLeft + nameW + matW + i * dayW;
      const pad = Math.min(0.35, dayW * 0.08);
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(x + pad, y + pad, Math.max(dayW - pad * 2, 0.4), Math.max(rowH - pad * 2, 0.4), 0.5, 0.5, "F");
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(font);
    doc.setTextColor(row.total > 0 ? 21 : 161, row.total > 0 ? 128 : 161, row.total > 0 ? 61 : 170);
    doc.text(brl(row.total), tableRight - 1.2, y + rowH * 0.68, { align: "right" });
  });

  const yTot = bodyTop + grade.rows.length * rowH;
  doc.setFillColor(23, 23, 23);
  doc.roundedRect(tableLeft, yTot, tableRight - tableLeft, rowH, 1.2, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.min(7, font + 0.4));
  doc.text(`${grade.rows.length} vigilantes  ·  dia verde = diária marcada`, tableLeft + 1.6, yTot + rowH * 0.68);
  doc.text(brl(grade.totalGeral), tableRight - 1.4, yTot + rowH * 0.68, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(113, 113, 122);
  doc.text("Torres Vigilância Patrimonial", m + 3, pageH - m - 1.2);

  doc.save(`Controle_Diarias_${grade.month}.pdf`);
}

export async function downloadDiariasExcel(grade: DiariasGrade) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();
  const colCount = 3 + grade.days.length;
  const ws = wb.addWorksheet("Diárias", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddFooter: "&L&8Torres Vigilância Patrimonial&C&8Página &P de &N&R&8&D",
    },
  });

  const widths = [28, 12, ...grade.days.map(() => 3.4), 14];
  ws.columns = widths.map((w) => ({ width: w }));

  const dark: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF171717" } };
  const green: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  const empty: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  const zebra: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
  const whiteFont: Partial<ExcelJS.Font> = { name: "Calibri", color: { argb: "FFFFFFFF" }, bold: true, size: 8 };
  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE4E4E7" } };
  const borders: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

  const banner = ws.addRow([null]);
  ws.mergeCells(1, 1, 1, colCount);
  banner.height = 22;
  banner.getCell(1).value = "CONTROLE DE DIÁRIAS";
  banner.getCell(1).font = { name: "Calibri", bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  banner.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= colCount; c++) banner.getCell(c).fill = dark;

  const sub = ws.addRow([null]);
  ws.mergeCells(2, 1, 2, colCount);
  sub.height = 16;
  sub.getCell(1).value = `Ciclo ${grade.label}   ·   ${brl(grade.valorUnitario)} por dia marcado`;
  sub.getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FFE4E4E7" } };
  sub.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= colCount; c++) sub.getCell(c).fill = dark;

  const logo = await loadLogo();
  if (logo) {
    const imageId = wb.addImage({ buffer: logo.buffer, extension: "jpeg" });
    ws.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 42, height: 42 } });
  }

  const head = ws.addRow(["Vigilante", "Matrícula", ...grade.days.map((iso) => {
    const p = dayParts(iso);
    return `${p.day}\n${p.month}`;
  }), "Total"]);
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = dark;
    cell.font = whiteFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borders;
  });
  head.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

  for (const row of grade.rows) {
    const marked = new Set(row.dates);
    const values: (string | number)[] = [
      row.name,
      row.matricula || "—",
      ...grade.days.map((iso) => (marked.has(iso) ? "✓" : "")),
      row.total,
    ];
    const xl = ws.addRow(values);
    xl.height = 16;
    xl.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = borders;
      cell.alignment = { vertical: "middle", horizontal: col <= 2 ? "left" : "center" };
      cell.font = { name: "Calibri", size: 8 };
      if (col >= 3 && col < colCount) {
        cell.fill = marked.has(grade.days[col - 3]) ? green : empty;
        if (marked.has(grade.days[col - 3])) cell.font = { name: "Calibri", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
      } else if (ws.rowCount % 2 === 0) {
        cell.fill = zebra;
      }
    });
    const totalCell = xl.getCell(colCount);
    totalCell.numFmt = '"R$" #,##0.00';
    totalCell.font = { name: "Calibri", size: 8, bold: true, color: { argb: row.total > 0 ? "FF166534" : "FF71717A" } };
    totalCell.alignment = { horizontal: "right", vertical: "middle" };
  }

  const tot = ws.addRow(["", "", ...grade.days.map(() => ""), grade.totalGeral]);
  ws.mergeCells(tot.number, 1, tot.number, 2);
  tot.getCell(1).value = `${grade.rows.length} vigilantes`;
  tot.height = 18;
  tot.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = dark;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = borders;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  const grand = tot.getCell(colCount);
  grand.value = grade.totalGeral;
  grand.numFmt = '"R$" #,##0.00';
  grand.alignment = { horizontal: "right", vertical: "middle" };

  ws.pageSetup.printTitlesRow = "1:3";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Controle_Diarias_${grade.month}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
