import ExcelJS from "exceljs";

const DARK_BG = "1B1B1B";
const HEADER_BG = "2D2D2D";
const ACCENT_BG = "F5F5DC";
const WHITE = "FFFFFF";
const BORDER_COLOR = "D4D4D4";

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

function applyTitleStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 14, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function applySubtitleStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = allBorders;
}

function applyDataStyle(cell: ExcelJS.Cell, isEven: boolean) {
  cell.font = { size: 9 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = allBorders;
  if (isEven) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F9F9F9" } };
  }
}

function applyTotalStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = allBorders;
}

function applyCurrencyFormat(cell: ExcelJS.Cell) {
  cell.numFmt = '#.##0,00;-#.##0,00';
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

export async function exportFormattedExcel(config: ExcelExportConfig) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();

  const ws = wb.addWorksheet(config.sheetName || "Relatório", {
    views: [{ state: "frozen", ySplit: config.groupHeaders ? 6 : 5 }],
  });

  ws.columns = config.colWidths.map((w) => ({ width: w }));

  const colCount = config.headers.length;

  const titleRow = ws.addRow([config.title]);
  ws.mergeCells(1, 1, 1, colCount);
  applyTitleStyle(titleRow.getCell(1));
  titleRow.height = 32;

  if (config.period) {
    const periodRow = ws.addRow([config.period]);
    ws.mergeCells(2, 1, 2, colCount);
    applySubtitleStyle(periodRow.getCell(1));
    periodRow.height = 20;
  }

  if (config.subtitle) {
    const subRow = ws.addRow([config.subtitle]);
    const subRowNum = subRow.number;
    ws.mergeCells(subRowNum, 1, subRowNum, colCount);
    const cell = subRow.getCell(1);
    cell.font = { italic: true, size: 9, color: { argb: "999999" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    subRow.height = 18;
  }

  ws.addRow([]);

  if (config.groupHeaders) {
    const ghRow = ws.addRow(config.groupHeaders.map((g) => g.label));
    let colIdx = 1;
    for (const g of config.groupHeaders) {
      if (g.span > 1) {
        ws.mergeCells(ghRow.number, colIdx, ghRow.number, colIdx + g.span - 1);
      }
      const cell = ghRow.getCell(colIdx);
      cell.font = { bold: true, size: 9, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "444444" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
      for (let j = 1; j < g.span; j++) {
        const c = ghRow.getCell(colIdx + j);
        c.border = allBorders;
      }
      colIdx += g.span;
    }
    ghRow.height = 22;
  }

  const headerRow = ws.addRow(config.headers);
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    applyHeaderStyle(headerRow.getCell(i));
  }

  const currCols = new Set(config.currencyColumns || []);

  config.rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData);
    row.height = 20;
    const isEven = idx % 2 === 0;
    for (let i = 1; i <= colCount; i++) {
      applyDataStyle(row.getCell(i), isEven);
      if (currCols.has(i - 1)) {
        const val = rowData[i - 1];
        if (typeof val === "number") {
          row.getCell(i).numFmt = '#,##0.00';
        }
      }
    }
  });

  if (config.totalsRow) {
    ws.addRow([]);
    const totalRow = ws.addRow(config.totalsRow);
    totalRow.height = 26;
    for (let i = 1; i <= colCount; i++) {
      applyTotalStyle(totalRow.getCell(i));
    }
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
