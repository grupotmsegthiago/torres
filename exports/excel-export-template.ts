/**
 * ============================================================
 * TORRES — TEMPLATE DE EXPORTAÇÃO EXCEL FORMATADO
 * ============================================================
 * 
 * Dependência: npm install exceljs
 * 
 * USO:
 * 
 *   import { exportFormattedExcel } from "./excel-export-template";
 * 
 *   exportFormattedExcel({
 *     title: "MEU RELATÓRIO",
 *     subtitle: "Detalhes adicionais",
 *     period: "Janeiro 2026",
 *     headers: ["Coluna A", "Coluna B", "Valor"],
 *     colWidths: [20, 30, 15],
 *     rows: [
 *       ["Item 1", "Descrição", 150.00],
 *       ["Item 2", "Descrição", 250.00],
 *     ],
 *     totalsRow: ["TOTAL", "", 400.00],
 *     currencyColumns: [2],        // índice 0-based das colunas com R$
 *     groupHeaders: [              // (opcional) cabeçalhos agrupados
 *       { label: "GRUPO A", span: 2 },
 *       { label: "VALORES", span: 1 },
 *     ],
 *     fileName: "Relatorio.xlsx",
 *     sheetName: "Dados",
 *     sheetPassword: "MinhaSenha123",  // (opcional) proteger planilha
 *     logoUrl: "/logo.jpeg",           // (opcional) URL do logo
 *   });
 * 
 * ============================================================
 */

import ExcelJS from "exceljs";

// ---- CORES (ARGB sem #) ----
const DARK_BG = "1B1B1B";
const HEADER_BG = "2D2D2D";
const GROUP_BG = "444444";
const ACCENT_BG = "F5F5DC";
const WHITE = "FFFFFF";
const RED = "FF0000";
const BORDER_COLOR = "D4D4D4";
const EVEN_ROW_BG = "F9F9F9";

// ---- BORDAS ----
const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const noBorder: Partial<ExcelJS.Borders> = { top: {}, left: {}, bottom: {}, right: {} };

// ---- FORMATO MOEDA BRL ----
const BRL_FMT = '"R$ "#,##0.00';

// ---- INTERFACE DE CONFIGURAÇÃO ----
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
  sheetPassword?: string;
  logoUrl?: string;
  creator?: string;
}

// ---- HELPERS ----
async function fetchLogoAsBuffer(url: string): Promise<{ buffer: ArrayBuffer; ext: "jpeg" | "png" } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const ext = url.toLowerCase().includes(".png") ? "png" : "jpeg";
    return { buffer: await resp.arrayBuffer(), ext };
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

// ============================================================
// FUNÇÃO PRINCIPAL DE EXPORTAÇÃO
// ============================================================
export async function exportFormattedExcel(config: ExcelExportConfig) {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.creator || "Sistema Torres";
  wb.created = new Date();

  const colCount = config.headers.length;

  // ---- CRIAR PLANILHA ----
  const ws = wb.addWorksheet(config.sheetName || "Relatório", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,         // A4
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
      oddFooter: `&L&8${config.creator || "Sistema"}&C&8Página &P de &N&R&8&D`,
    },
  });

  ws.columns = config.colWidths.map((w) => ({ width: w }));

  // ---- FILLS ----
  const darkFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  const accentFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_BG } };
  const emptyArr = Array(colCount).fill(null);

  // ---- LOGO (opcional) ----
  const logoUrl = config.logoUrl || "/logo-torres-dark.jpeg";
  const logo = await fetchLogoAsBuffer(logoUrl);

  // ---- ROW 1: Barra escura (área do logo) ----
  const row1 = ws.addRow(emptyArr);
  if (logo) {
    ws.mergeCells(1, 2, 1, colCount);
  } else {
    ws.mergeCells(1, 1, 1, colCount);
  }
  applyFullRowFill(ws, row1, colCount, darkFill);
  row1.height = 28;
  clearBeyondColumns(ws, row1.number, colCount);

  // ---- ROW 2: Título principal ----
  const row2 = ws.addRow(emptyArr);
  ws.mergeCells(2, 2, 2, colCount);
  const c2 = row2.getCell(2);
  c2.value = config.title;
  c2.font = { bold: true, size: 14, color: { argb: WHITE } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  applyFullRowFill(ws, row2, colCount, darkFill);
  row2.height = 32.1;
  clearBeyondColumns(ws, row2.number, colCount);

  // ---- LOGO IMAGEM ----
  if (logo) {
    const imageId = wb.addImage({ buffer: logo.buffer, extension: logo.ext });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 } as any,
      br: { col: 1, row: 2 } as any,
      editAs: "oneCell",
    });
  }

  // ---- ROW: Período (opcional) ----
  if (config.period) {
    const rowP = ws.addRow(emptyArr);
    const rn = rowP.number;
    ws.mergeCells(rn, 1, rn, colCount);
    const cp = rowP.getCell(1);
    cp.value = config.period;
    cp.font = { bold: true, size: 10, color: { argb: WHITE } };
    cp.alignment = { horizontal: "center", vertical: "middle" };
    applyFullRowFill(ws, rowP, colCount, darkFill);
    rowP.height = 20;
    clearBeyondColumns(ws, rn, colCount);
  }

  // ---- ROW: Subtítulo (opcional) ----
  if (config.subtitle) {
    const rowS = ws.addRow(emptyArr);
    const rn = rowS.number;
    ws.mergeCells(rn, 1, rn, colCount);
    const cs = rowS.getCell(1);
    cs.value = config.subtitle;
    cs.font = { bold: true, italic: true, size: 9, color: { argb: RED } };
    cs.alignment = { horizontal: "center", vertical: "middle" };
    applyFullRowFill(ws, rowS, colCount, accentFill);
    rowS.height = 18;
    clearBeyondColumns(ws, rn, colCount);
  }

  // ---- ROW: Cabeçalhos de grupo (opcional) ----
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

  // ---- ROW: Cabeçalhos das colunas ----
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

  // Fixar linhas de cabeçalho na impressão
  ws.pageSetup.printTitlesRow = `1:${headerRowNum}`;

  // ---- DADOS ----
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
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EVEN_ROW_BG } };
      }
      if (currCols.has(i - 1) && typeof rowData[i - 1] === "number") {
        cell.numFmt = BRL_FMT;
      }
    }
    clearBeyondColumns(ws, row.number, colCount);
  });

  // ---- LINHA DE TOTAIS (opcional) ----
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

  // ---- AUTO-AJUSTE DE LARGURA ----
  for (let c = 1; c <= colCount; c++) {
    let maxLen = config.headers[c - 1] ? String(config.headers[c - 1]).length : 0;
    config.rows.forEach(rowData => {
      const val = rowData[c - 1];
      if (val != null) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    });
    if (config.totalsRow && config.totalsRow[c - 1] != null) {
      const len = String(config.totalsRow[c - 1]).length;
      if (len > maxLen) maxLen = len;
    }
    const autoWidth = Math.max(maxLen + 3, 6);
    const staticWidth = config.colWidths[c - 1] || 10;
    ws.getColumn(c).width = Math.max(autoWidth, staticWidth);
  }

  // ---- LIMPAR ÁREA ABAIXO DOS DADOS ----
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

  // ---- PROTEÇÃO DA PLANILHA (opcional) ----
  const password = config.sheetPassword || "TorresVP2026";
  ws.protect(password, {
    sheet: true,
    objects: true,
    scenarios: true,
    selectLockedCells: false,
    selectUnlockedCells: false,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  // ---- GERAR E BAIXAR ----
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = config.fileName;
  a.click();
  URL.revokeObjectURL(url);
}


// ============================================================
// EXEMPLO DE USO COMPLETO
// ============================================================
/*
import { exportFormattedExcel } from "./excel-export-template";

exportFormattedExcel({
  title: "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL",
  subtitle: "REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — CLIENTE XYZ",
  period: "Janeiro 2026",
  headers: [
    "Nº", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ",
    "HR EXTRA R$", "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO",
    "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM",
    "KM INICIAL", "KM FINAL", "KM TOTAL",
    "HR INÍCIO", "HR FIM", "HR TOTAL",
    "KM EXC.", "VLR KM", "TOT KM",
    "HR EXC.", "VLR HR", "TOT HR",
    "PEDÁGIO", "TOTAL"
  ],
  colWidths: [10, 30, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14],
  groupHeaders: [
    { label: "TABELA ACORDADA", span: 7 },
    { label: "INFORMAÇÕES DA VIAGEM", span: 6 },
    { label: "KILOMETRAGEM", span: 3 },
    { label: "HORÁRIOS", span: 3 },
    { label: "KM EXCEDENTE", span: 3 },
    { label: "HORA EXCEDENTE", span: 3 },
    { label: "VALORES", span: 2 },
  ],
  rows: [
    ["TOR-0001", "São Paulo → Campinas", 850, "08:00", 200, 45, 2.5, "01/01/2026", "08:00", "ABC1D23", "XYZ9F87", "01/01/2026", "16:30", 45230, 45680, 450, "08:00", "16:30", "08:30", 250, 2.5, 625, "0:30", 45, 22.5, 35, 1532.5],
  ],
  totalsRow: (() => { const t: (string|number)[] = Array(27).fill(""); t[0] = "TOTAL"; t[26] = 1532.50; return t; })(),
  currencyColumns: [2, 5, 6, 20, 21, 23, 24, 25, 26],
  fileName: "Boletim_ClienteXYZ_202601.xlsx",
  sheetName: "Boletim",
  sheetPassword: "MinhaSenha123",
  logoUrl: "/logo.jpeg",
  creator: "Minha Empresa",
});
*/
