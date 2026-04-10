import ExcelJS from "exceljs";

const DARK_BG = "1B1B1B";
const HEADER_BG = "2D2D2D";
const ACCENT_BG = "F5F5DC";
const WHITE = "FFFFFF";
const BORDER_COLOR = "D4D4D4";

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const noBorders: Partial<ExcelJS.Borders> = {};

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

async function fetchLogoAsBuffer(): Promise<{ buffer: ArrayBuffer; ext: "jpeg" | "png" } | null> {
  try {
    const resp = await fetch("/logo-torres-dark.jpeg");
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return { buffer: buf, ext: "jpeg" };
  } catch {
    return null;
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

export async function exportFormattedExcel(config: ExcelExportConfig) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();

  const colCount = config.headers.length;
  const headerRowNum = config.groupHeaders ? 6 : 5;

  const ws = wb.addWorksheet(config.sheetName || "Relatório", {
    views: [{ state: "frozen", ySplit: headerRowNum }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.3, right: 0.3,
        top: 0.5, bottom: 0.5,
        header: 0.3, footer: 0.3,
      },
    },
    headerFooter: {
      oddFooter: "&L&8Torres Vigilância Patrimonial&C&8Página &P de &N&R&8&D",
    },
  });

  ws.pageSetup.printTitlesRow = `1:${headerRowNum}`;

  ws.columns = config.colWidths.map((w) => ({ width: w }));

  const logo = await fetchLogoAsBuffer();
  let logoRowOffset = 0;

  if (logo) {
    const imageId = wb.addImage({
      buffer: logo.buffer,
      extension: logo.ext,
    });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 80, height: 80 },
    });
    const logoRow = ws.addRow([]);
    logoRow.height = 60;
    logoRowOffset = 1;
  }

  const titleRow = ws.addRow([config.title]);
  const titleRowNum = titleRow.number;
  ws.mergeCells(titleRowNum, 1, titleRowNum, colCount);
  applyTitleStyle(titleRow.getCell(1));
  titleRow.height = 32;

  if (config.period) {
    const periodRow = ws.addRow([config.period]);
    const prNum = periodRow.number;
    ws.mergeCells(prNum, 1, prNum, colCount);
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

  const spacerRow = ws.addRow([]);
  spacerRow.height = 6;

  if (config.groupHeaders) {
    const ghValues: string[] = [];
    for (const g of config.groupHeaders) {
      ghValues.push(g.label);
      for (let j = 1; j < g.span; j++) ghValues.push("");
    }
    const ghRow = ws.addRow(ghValues);
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
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "444444" } };
        c.border = allBorders;
      }
      colIdx += g.span;
    }
    ghRow.height = 22;
  }

  const headerRow = ws.addRow(config.headers);
  const actualHeaderRowNum = headerRow.number;
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    applyHeaderStyle(headerRow.getCell(i));
  }

  ws.pageSetup.printTitlesRow = `1:${actualHeaderRowNum}`;

  const currCols = new Set(config.currencyColumns || []);
  let lastDataRowNum = actualHeaderRowNum;

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
    lastDataRowNum = row.number;
  });

  if (config.totalsRow) {
    const blankRow = ws.addRow([]);
    blankRow.height = 4;
    for (let i = 1; i <= colCount; i++) {
      blankRow.getCell(i).border = noBorders;
    }
    const totalRow = ws.addRow(config.totalsRow);
    totalRow.height = 26;
    for (let i = 1; i <= colCount; i++) {
      applyTotalStyle(totalRow.getCell(i));
      if (currCols.has(i - 1)) {
        const val = config.totalsRow[i - 1];
        if (typeof val === "number") {
          totalRow.getCell(i).numFmt = '#,##0.00';
        }
      }
    }
    lastDataRowNum = totalRow.number;
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
