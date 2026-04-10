import ExcelJS from "exceljs";

const DARK_BG = "1B1B1B";
const HEADER_BG = "2D2D2D";
const GROUP_BG = "444444";
const ACCENT_BG = "F5F5DC";
const WHITE = "FFFFFF";
const RED = "FF0000";
const BORDER_COLOR = "D4D4D4";

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const noBorder: Partial<ExcelJS.Borders> = { top: {}, left: {}, bottom: {}, right: {} };

async function fetchLogoAsBuffer(): Promise<{ buffer: ArrayBuffer; ext: "jpeg" | "png" } | null> {
  try {
    const resp = await fetch("/logo-torres-dark.jpeg");
    if (!resp.ok) return null;
    return { buffer: await resp.arrayBuffer(), ext: "jpeg" };
  } catch { return null; }
}

function applyFullRowFill(ws: ExcelJS.Worksheet, row: ExcelJS.Row, colCount: number, fill: ExcelJS.Fill) {
  for (let i = 1; i <= colCount; i++) {
    row.getCell(i).fill = fill;
  }
}

function clearBeyondColumns(ws: ExcelJS.Worksheet, rowNum: number, colCount: number, extraCols: number = 30) {
  const row = ws.getRow(rowNum);
  for (let c = colCount + 1; c <= colCount + extraCols; c++) {
    const cell = row.getCell(c);
    cell.value = null;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } };
    cell.border = noBorder;
    cell.font = {};
  }
}

export interface ExcelExportConfig {
  title: string;
  subtitle?: string;
  period?: string;
  headers: string[];
  colWidths: number[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  fileName: string;
  sheetName?: string;
  currencyColumns?: number[];
  groupHeaders?: { label: string; span: number }[];
}

const BRL_FMT = '"R$ "#,##0.00';

export async function exportFormattedExcel(config: ExcelExportConfig) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();

  const colCount = config.headers.length;

  const ws = wb.addWorksheet(config.sheetName || "Relatório", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      showRowColHeaders: false,
      showGridLines: false,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: "&L&8Torres Vigilância Patrimonial&C&8Página &P de &N&R&8&D",
    },
  });

  ws.columns = config.colWidths.map((w) => ({ width: w }));

  const logo = await fetchLogoAsBuffer();
  if (logo) {
    const imageId = wb.addImage({ buffer: logo.buffer, extension: logo.ext });
    ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 55 } });
  }

  const darkFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  const accentFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_BG } };

  const emptyArr = Array(colCount).fill("");

  const row1 = ws.addRow(emptyArr);
  ws.mergeCells(1, 1, 1, colCount);
  const c1 = row1.getCell(1);
  c1.value = config.title;
  c1.font = { bold: true, size: 14, color: { argb: WHITE } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  applyFullRowFill(ws, row1, colCount, darkFill);
  row1.height = 32.1;
  clearBeyondColumns(ws, row1.number, colCount);

  if (config.period) {
    const row2 = ws.addRow(emptyArr);
    const r2n = row2.number;
    ws.mergeCells(r2n, 1, r2n, colCount);
    const c2 = row2.getCell(1);
    c2.value = config.period;
    c2.font = { bold: true, size: 10, color: { argb: WHITE } };
    c2.alignment = { horizontal: "center", vertical: "middle" };
    applyFullRowFill(ws, row2, colCount, darkFill);
    row2.height = 20;
    clearBeyondColumns(ws, r2n, colCount);
  }

  if (config.subtitle) {
    const row3 = ws.addRow(emptyArr);
    const r3n = row3.number;
    ws.mergeCells(r3n, 1, r3n, colCount);
    const c3 = row3.getCell(1);
    c3.value = config.subtitle;
    c3.font = { bold: true, italic: true, size: 9, color: { argb: RED } };
    c3.alignment = { horizontal: "center", vertical: "middle" };
    applyFullRowFill(ws, row3, colCount, accentFill);
    row3.height = 18;
    clearBeyondColumns(ws, r3n, colCount);
  }

  if (config.groupHeaders) {
    const ghValues: string[] = [];
    for (const g of config.groupHeaders) {
      ghValues.push(g.label);
      for (let j = 1; j < g.span; j++) ghValues.push("");
    }
    while (ghValues.length < colCount) ghValues.push("");
    const ghRow = ws.addRow(ghValues.slice(0, colCount));
    let colIdx = 1;
    for (const g of config.groupHeaders) {
      if (g.span > 1) {
        ws.mergeCells(ghRow.number, colIdx, ghRow.number, Math.min(colIdx + g.span - 1, colCount));
      }
      for (let j = 0; j < g.span && colIdx + j <= colCount; j++) {
        const cell = ghRow.getCell(colIdx + j);
        cell.font = { bold: true, size: 9, color: { argb: WHITE } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_BG } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = allBorders;
      }
      colIdx += g.span;
    }
    ghRow.height = 22;
    clearBeyondColumns(ws, ghRow.number, colCount);
  }

  const headerRow = ws.addRow(config.headers);
  const headerRowNum = headerRow.number;
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    const cell = headerRow.getCell(i);
    cell.font = { bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = allBorders;
  }
  clearBeyondColumns(ws, headerRowNum, colCount);

  ws.pageSetup.printTitlesRow = `1:${headerRowNum}`;

  const currCols = new Set(config.currencyColumns || []);

  config.rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData);
    row.height = 20.1;
    const isEven = idx % 2 === 0;
    for (let i = 1; i <= colCount; i++) {
      const cell = row.getCell(i);
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F9F9F9" } };
      }
      if (currCols.has(i - 1) && typeof rowData[i - 1] === "number") {
        cell.numFmt = BRL_FMT;
      }
    }
    clearBeyondColumns(ws, row.number, colCount);
  });

  if (config.totalsRow) {
    const blankRow = ws.addRow([]);
    blankRow.height = 4;
    clearBeyondColumns(ws, blankRow.number, colCount);

    const totalRow = ws.addRow(config.totalsRow);
    totalRow.height = 26.1;
    for (let i = 1; i <= colCount; i++) {
      const cell = totalRow.getCell(i);
      cell.font = { bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
      if (currCols.has(i - 1) && typeof config.totalsRow[i - 1] === "number") {
        cell.numFmt = BRL_FMT;
      }
    }
    clearBeyondColumns(ws, totalRow.number, colCount);
  }

  const lastUsedRow = ws.rowCount;
  for (let r = lastUsedRow + 1; r <= lastUsedRow + 90; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount + 30; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } };
      cell.border = noBorder;
      cell.value = null;
    }
    row.commit();
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = config.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
