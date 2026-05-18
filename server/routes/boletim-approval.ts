import { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { createSmtpTransporter, getSmtpFrom } from "./_helpers";
import { emitInvoiceAuto } from "../asaas";
import crypto from "crypto";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const requireAdminRole = (req: Request, res: Response, next: any) => {
  if (!req.user) return res.status(401).json({ message: "Não autenticado" });
  next();
};

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

const DARK_BG = "1B1B1B";
const HEADER_BG = "2D2D2D";
const GROUP_BG = "444444";
const ACCENT_BG = "F5F5DC";
const WHITE_C = "FFFFFF";
const RED_C = "FF0000";
const BORDER_COLOR = "D4D4D4";
const BRL_FMT = '"R$ "#,##0.00';

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const noBorder: Partial<ExcelJS.Borders> = { top: {}, left: {}, bottom: {}, right: {} };

function fmtHHMM(h: number): string {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function extractCity(addr: string): string {
  if (!addr) return "—";
  const parts = addr.toUpperCase().trim().split(/[,\-\/]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts.find(p => !/^\d/.test(p) && p.length > 2 && !/^(SP|RJ|MG|PR|SC|RS|BA|GO|MT|MS|PA|AM|CE|PE|MA|PI|RN|PB|SE|AL|TO|RO|AC|AP|RR|ES|DF)$/.test(p));
    return city || parts[0];
  }
  return parts[0] || addr;
}

function fmtDateBR(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function fmtTimeBR(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function getPeriodLabel(periodStart: string, periodEnd: string): string {
  const sDate = new Date(periodStart + "T12:00:00");
  const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  const month = months[sDate.getMonth()];
  const year = sDate.getFullYear();
  const sDay = sDate.getDate();
  const eDate = new Date(periodEnd + "T12:00:00");
  const eDay = eDate.getDate();
  const lastDay = new Date(year, sDate.getMonth() + 1, 0).getDate();
  if (sDay === 1 && eDay === lastDay) return `GERAL — ${month}/${year} — MÊS COMPLETO`;
  if (sDay === 1 && eDay === 15) return `GERAL — ${month}/${year} — 1ª QUINZENA`;
  if (sDay === 16) return `GERAL — ${month}/${year} — 2ª QUINZENA`;
  const sd = `${sDay.toString().padStart(2, "0")}/${(sDate.getMonth() + 1).toString().padStart(2, "0")}/${year}`;
  const ed = `${eDay.toString().padStart(2, "0")}/${(eDate.getMonth() + 1).toString().padStart(2, "0")}/${eDate.getFullYear()}`;
  return `GERAL — ${month}/${year} — ${sd} A ${ed}`;
}

async function generateBoletimExcel(
  clientName: string,
  periodStart: string,
  periodEnd: string,
  billings: any[],
  orders: any[],
  contracts: any[],
  processoNumbers: string[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigilância Patrimonial";
  wb.created = new Date();

  const isOmegaClient = clientName.toUpperCase().includes("OMEGA SOLUTIONS");
  const colCount = isOmegaClient ? 28 : 27;
  const ws = wb.addWorksheet("Boletim", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, showRowColHeaders: false, showGridLines: false,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: "&L&8Torres Vigilância Patrimonial&C&8Página &P de &N&R&8&D" },
  });

  const baseColWidths = [10, 30, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14];
  const colWidths = isOmegaClient ? [10, 30, 14, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14] : baseColWidths;
  ws.columns = colWidths.map(w => ({ width: w }));

  const darkFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  const accentFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_BG } };

  const applyFill = (row: ExcelJS.Row, fill: ExcelJS.Fill) => { for (let i = 1; i <= colCount; i++) row.getCell(i).fill = fill; };
  const clearBeyond = (rowNum: number) => {
    const row = ws.getRow(rowNum);
    for (let c = colCount + 1; c <= colCount + 30; c++) {
      const cell = row.getCell(c);
      cell.value = null; cell.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } }; cell.border = noBorder; cell.font = {};
    }
  };

  let logoBuffer: Buffer | null = null;
  try {
    const logoPath = path.resolve("public", "logo-torres-dark.jpeg");
    if (fs.existsSync(logoPath)) logoBuffer = fs.readFileSync(logoPath);
  } catch {}

  const emptyArr = Array(colCount).fill(null);

  const row1 = ws.addRow(emptyArr);
  ws.mergeCells(1, 2, 1, colCount);
  applyFill(row1, darkFill);
  row1.height = 28;
  clearBeyond(1);

  const row2 = ws.addRow(emptyArr);
  ws.mergeCells(2, 2, 2, colCount);
  const c2 = row2.getCell(2);
  c2.value = "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL";
  c2.font = { bold: true, size: 14, color: { argb: WHITE_C } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  applyFill(row2, darkFill);
  row2.height = 32.1;
  clearBeyond(2);

  if (logoBuffer) {
    const imageId = wb.addImage({ buffer: logoBuffer, extension: "jpeg" });
    ws.addImage(imageId, { tl: { col: 0, row: 0 } as any, br: { col: 1, row: 2 } as any, editAs: "oneCell" });
  }

  const periodLabel = getPeriodLabel(periodStart, periodEnd);
  const rowP = ws.addRow(emptyArr);
  ws.mergeCells(rowP.number, 1, rowP.number, colCount);
  const cp = rowP.getCell(1);
  cp.value = periodLabel;
  cp.font = { bold: true, size: 10, color: { argb: WHITE_C } };
  cp.alignment = { horizontal: "center", vertical: "middle" };
  applyFill(rowP, darkFill);
  rowP.height = 20;
  clearBeyond(rowP.number);

  const rowS = ws.addRow(emptyArr);
  ws.mergeCells(rowS.number, 1, rowS.number, colCount);
  const cs = rowS.getCell(1);
  const isOmegaHeader = isOmegaClient && processoNumbers.length > 0;
  const omegaSuffix = isOmegaHeader
    ? (processoNumbers.length === 1
        ? ` — PROCESSO ${processoNumbers[0]}`
        : ` — PROCESSOS ${processoNumbers.join(", ")}`)
    : "";
  cs.value = `REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — ${clientName.toUpperCase()}${omegaSuffix}`;
  cs.font = { bold: true, italic: true, size: 9, color: { argb: RED_C } };
  cs.alignment = { horizontal: "center", vertical: "middle" };
  applyFill(rowS, accentFill);
  rowS.height = 18;
  clearBeyond(rowS.number);

  const groupHeaders = isOmegaClient
    ? [
        { label: "TABELA ACORDADA", span: 8 },
        { label: "INFORMAÇÕES DA VIAGEM", span: 6 },
        { label: "KILOMETRAGEM", span: 3 },
        { label: "HORÁRIOS", span: 3 },
        { label: "KM EXCEDENTE", span: 3 },
        { label: "HORA EXCEDENTE", span: 3 },
        { label: "VALORES", span: 2 },
      ]
    : [
        { label: "TABELA ACORDADA", span: 7 },
        { label: "INFORMAÇÕES DA VIAGEM", span: 6 },
        { label: "KILOMETRAGEM", span: 3 },
        { label: "HORÁRIOS", span: 3 },
        { label: "KM EXCEDENTE", span: 3 },
        { label: "HORA EXCEDENTE", span: 3 },
        { label: "VALORES", span: 2 },
      ];
  const ghValues: string[] = [];
  for (const g of groupHeaders) { ghValues.push(g.label); for (let j = 1; j < g.span; j++) ghValues.push(""); }
  const ghRow = ws.addRow(ghValues.slice(0, colCount));
  let colIdx = 1;
  for (const g of groupHeaders) {
    if (g.span > 1) ws.mergeCells(ghRow.number, colIdx, ghRow.number, Math.min(colIdx + g.span - 1, colCount));
    for (let j = 0; j < g.span && colIdx + j <= colCount; j++) {
      const cell = ghRow.getCell(colIdx + j);
      cell.font = { bold: true, size: 9, color: { argb: WHITE_C } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_BG } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
    }
    colIdx += g.span;
  }
  ghRow.height = 22;
  clearBeyond(ghRow.number);

  const baseHeaders = ["Nº", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM", "KM INICIAL", "KM FINAL", "KM TOTAL", "HR INÍCIO", "HR FIM", "HR TOTAL", "KM EXC.", "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PEDÁGIO", "TOTAL"];
  const headers = isOmegaClient
    ? ["Nº", "ROTA", "PROCESSO", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM", "KM INICIAL", "KM FINAL", "KM TOTAL", "HR INÍCIO", "HR FIM", "HR TOTAL", "KM EXC.", "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PEDÁGIO", "TOTAL"]
    : baseHeaders;
  const headerRow = ws.addRow(headers);
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    const cell = headerRow.getCell(i);
    cell.font = { bold: true, size: 9, color: { argb: WHITE_C } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = allBorders;
  }
  clearBeyond(headerRow.number);

  ws.pageSetup.printTitlesRow = `1:${headerRow.number}`;

  const currCols = isOmegaClient
    ? new Set([3, 6, 7, 21, 22, 24, 25, 26, 27])
    : new Set([2, 5, 6, 20, 21, 23, 24, 25, 26]);
  const ordersMap = new Map(orders.map(o => [o.id, o]));
  const contractsMap = new Map(contracts.map(c => [c.id, c]));

  let grandTotal = 0;

  billings.forEach((b: any, idx: number) => {
    const ct = contractsMap.get(b.contract_id) || {} as any;
    const so = ordersMap.get(b.service_order_id) || {} as any;
    const n = (v: any) => Number(v) || 0;

    const franquiaHoras = n(ct.franquia_horas) || n(b.franquia_horas);
    const franquiaKm = n(ct.franquia_km) || n(ct.franquia_minima_km) || n(b.km_franquia);
    const valorHoraExtra = n(ct.valor_hora_extra) || n(b.valor_hora_extra);
    const valorKmExtra = n(ct.valor_km_extra) || n(ct.valor_km_carregado) || n(b.valor_km_extra);
    const valorAcionamento = n(b.fat_acionamento) || n(ct.valor_acionamento);
    const horasMissao = n(b.horas_missao);
    const kmTotal = n(b.km_total);
    const kmExcedente = n(b.km_excedente) || Math.max(0, kmTotal - franquiaKm);
    const hrExcedente = Math.max(0, horasMissao - franquiaHoras);
    const fatHoraExtra = n(b.fat_hora_extra) || Math.round(hrExcedente * valorHoraExtra * 100) / 100;
    const fatKmExtra = n(b.fat_km) || Math.round(kmExcedente * valorKmExtra * 100) / 100;
    const fatPedagio = n(b.despesas_pedagio);
    const adNoturno = n(b.fat_adicional_noturno);
    const fatEstadia = n(b.fat_estadia);
    const fatPernoite = n(b.fat_pernoite);
    const fatOutras = n(b.despesas_outras);
    const fatReembolso = n(b.receitas_os);
    const fatTotal = n(b.fat_total) || (valorAcionamento + fatKmExtra + fatHoraExtra + fatPedagio + adNoturno + fatEstadia + fatPernoite + fatOutras + fatReembolso);
    grandTotal += fatTotal;

    const osNum = b.os_number || so.os_number || `OS-${b.service_order_id}`;
    const origem = b.origem || so.origin || "";
    const destino = b.destino || so.destination || "";
    const routeStr = (origem && destino) ? `${extractCity(origem)} × ${extractCity(destino)}` : (origem || destino || "—");
    const viatura = b.placa_viatura || so.vehicle_plate || "—";
    const escoltado = b.placa_escoltado || so.escorted_vehicle_plate || "—";
    const dataMissao = b.data_missao || so.scheduled_date || b.created_at;

    const baseRowData = [
      osNum, routeStr, Number(valorAcionamento.toFixed(2)), fmtHHMM(franquiaHoras), franquiaKm > 0 ? franquiaKm : 0,
      Number(valorHoraExtra.toFixed(2)), Number(valorKmExtra.toFixed(2)),
      fmtDateBR(dataMissao), b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTimeBR(dataMissao),
      viatura, escoltado, fmtDateBR(dataMissao),
      b.horario_fim ? b.horario_fim.substring(0, 5) : "—",
      n(b.km_inicial) > 0 ? n(b.km_inicial) : 0, n(b.km_final) > 0 ? n(b.km_final) : 0, kmTotal > 0 ? kmTotal : 0,
      b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTimeBR(dataMissao),
      b.horario_fim ? b.horario_fim.substring(0, 5) : "—",
      fmtHHMM(horasMissao),
      kmExcedente > 0 ? kmExcedente : 0, kmExcedente > 0 ? Number(valorKmExtra.toFixed(2)) : 0, Number(fatKmExtra.toFixed(2)),
      hrExcedente > 0 ? fmtHHMM(hrExcedente) : "0:00", hrExcedente > 0 ? Number(valorHoraExtra.toFixed(2)) : 0, Number(fatHoraExtra.toFixed(2)),
      Number(fatPedagio.toFixed(2)), Number(fatTotal.toFixed(2)),
    ];
    const rowData = isOmegaClient ? [baseRowData[0], baseRowData[1], "", ...baseRowData.slice(2)] : baseRowData;

    const row = ws.addRow(rowData);
    row.height = 20.1;
    const isEven = idx % 2 === 0;
    for (let i = 1; i <= colCount; i++) {
      const cell = row.getCell(i);
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
      if (isEven) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F9F9F9" } };
      if (currCols.has(i - 1) && typeof rowData[i - 1] === "number") cell.numFmt = BRL_FMT;
    }
    clearBeyond(row.number);
  });

  const blankRow = ws.addRow([]);
  blankRow.height = 4;
  clearBeyond(blankRow.number);

  const totalsArr: (string | number)[] = Array(colCount).fill("");
  totalsArr[0] = "TOTAL";
  totalsArr[colCount - 1] = Number(grandTotal.toFixed(2));
  const totalRow = ws.addRow(totalsArr);
  totalRow.height = 26.1;
  for (let i = 1; i <= colCount; i++) {
    const cell = totalRow.getCell(i);
    cell.font = { bold: true, size: 10, color: { argb: WHITE_C } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = allBorders;
    if (i === colCount) cell.numFmt = BRL_FMT;
  }
  clearBeyond(totalRow.number);

  for (let c = 1; c <= colCount; c++) {
    let maxLen = headers[c - 1] ? String(headers[c - 1]).length : 0;
    ws.eachRow((row, rowNum) => {
      if (rowNum <= headerRow.number) return;
      const val = row.getCell(c).value;
      if (val != null) { const len = String(val).length; if (len > maxLen) maxLen = len; }
    });
    const autoWidth = Math.max(maxLen + 3, 6);
    ws.getColumn(c).width = Math.max(autoWidth, colWidths[c - 1] || 10);
  }

  const lastUsedRow = ws.rowCount;
  for (let r = lastUsedRow + 1; r <= lastUsedRow + 90; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount + 30; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } };
      cell.border = noBorder; cell.value = null;
    }
    row.commit();
  }

  const isOmega = clientName.toUpperCase().includes("OMEGA SOLUTIONS");

  if (isOmega) {
    ws.eachRow((row) => {
      for (let c = 1; c <= colCount + 30; c++) {
        row.getCell(c).protection = { locked: false };
      }
    });
  } else {
    await ws.protect("TorresVP2026", {
      sheet: true, objects: true, scenarios: true,
      selectLockedCells: false, selectUnlockedCells: false,
      formatCells: false, formatColumns: false, formatRows: false,
      insertColumns: false, insertRows: false, insertHyperlinks: false,
      deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTables: false,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function sendApprovalEmailWithExcel(
  to: string, clientName: string, approvalUrl: string, period: string,
  osCount: number, totalValue: number, excelBuffer: Buffer, fileName: string,
  processoNumbers: string[] = [],
) {
  const isOmegaSubject = String(clientName || "").toUpperCase().includes("OMEGA SOLUTIONS");
  const processosLabel = processoNumbers.length > 0
    ? (processoNumbers.length === 1 ? `Processo ${processoNumbers[0]}` : `Processos ${processoNumbers.join(", ")}`)
    : "";
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const transporter = createSmtpTransporter();
  if (!transporter) throw new Error("SMTP não configurado");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #1e3a5f 100%); padding: 28px 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px; letter-spacing: 2px; font-weight: 800;">TORRES VIGILÂNCIA PATRIMONIAL</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 12px; letter-spacing: 1px;">CNPJ 36.982.392/0001-89 — Serviço de Escolta Armada</p>
      </div>

      <div style="padding: 32px 28px;">
        <h2 style="color: #1B1B1B; margin: 0 0 8px; font-size: 18px; font-weight: 700;">📋 Boletim de Medição</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
          Prezado(a) <strong>${clientName}</strong>,
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
          Segue em anexo o <strong>Boletim de Medição</strong> referente ao período <strong>${period}</strong> para sua conferência e aprovação.
        </p>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #1e40af; font-size: 13px; font-weight: 600;">
            📎 O detalhamento completo das medições está no <strong>arquivo Excel anexo</strong> a este e-mail.
          </p>
        </div>

        <div style="background: #f8fafb; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Período:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 14px; color: #1e293b;">${period}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0;">Quantidade de OS:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 14px; color: #1e293b; border-top: 1px solid #e2e8f0;">${osCount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0;">Valor Total:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 800; font-size: 18px; color: #059669; border-top: 1px solid #e2e8f0;">${fmt(totalValue)}</td>
            </tr>
          </table>
        </div>

        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="color: #065f46; font-size: 14px; font-weight: 600; margin: 0 0 4px;">
            Ao clicar no botão abaixo, você declara:
          </p>
          <p style="color: #047857; font-size: 13px; font-style: italic; margin: 0 0 16px; line-height: 1.6;">
            "Estou de acordo com as medições acima e autorizo a emissão da nota fiscal e boleto."
          </p>
          <a href="${approvalUrl}" style="display: inline-block; background-color: #047857; color: #ffffff; padding: 16px 44px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 16px; letter-spacing: 0.5px;">
            APROVAR MEDIÇÃO E AUTORIZAR FATURAMENTO
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 16px 0 0;">
          Este link é válido por 30 dias. O arquivo Excel em anexo contém o detalhamento completo.
        </p>
      </div>

      <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 11px; margin: 0;">Torres Vigilância Patrimonial LTDA — Serviço de Escolta Armada Caracterizada</p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">Este é um e-mail automático. Em caso de dúvidas, entre em contato conosco.</p>
      </div>
    </div>
  `;

  const subjectBase = `📋 Boletim de Medição — ${clientName} — ${period} — Aprovação Pendente`;
  const subject = isOmegaSubject && processosLabel
    ? `${subjectBase} — ${processosLabel}`
    : subjectBase;

  await transporter.sendMail({
    from: getSmtpFrom(),
    to,
    subject,
    headers: isOmegaSubject && processoNumbers.length > 0
      ? {
          "X-Omega-Processo": processoNumbers.join(", "),
          "References": processoNumbers.map(p => `<processo-${p}@torresvp.com.br>`).join(" "),
        }
      : undefined,
    html,
    attachments: [
      {
        filename: fileName,
        content: excelBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });
}

export function registerBoletimApprovalRoutes(app: Express) {
  app.post("/api/boletim/enviar-aprovacao", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { clientId, clientName, clientEmail, billingIds, totalValue, osCount, force } = req.body;
      let { periodStart, periodEnd } = req.body;
      const user = req.user as any;

      if (!clientId || !clientEmail || !billingIds?.length) {
        return res.status(400).json({ message: "Dados incompletos. Informe cliente, e-mail e IDs dos boletins." });
      }

      // ============================================================
      // Regra unificada: período do boletim é derivado da data_missao
      // (data de agendamento/início) das escort_billings selecionadas.
      // Garante que toda a aplicação use a mesma referência temporal.
      // ============================================================
      const { data: billingsForPeriod } = await supabaseAdmin
        .from("escort_billings")
        .select("id, data_missao, created_at")
        .in("id", billingIds);

      const missionDates = (billingsForPeriod || [])
        .map((b: any) => (b.data_missao || b.created_at || "").split("T")[0])
        .filter(Boolean)
        .sort();

      if (missionDates.length > 0) {
        const computedStart = missionDates[0];
        const computedEnd = missionDates[missionDates.length - 1];

        // Bloqueia quando as missões cruzam quinzenas diferentes do mesmo mês
        // (ex.: misturar dia 15 e dia 16). Cada quinzena precisa de boletim próprio.
        const startQuinz = Number(computedStart.split("-")[2]) <= 15 ? 1 : 2;
        const endQuinz = Number(computedEnd.split("-")[2]) <= 15 ? 1 : 2;
        const sameMonth = computedStart.slice(0, 7) === computedEnd.slice(0, 7);
        if (sameMonth && startQuinz !== endQuinz) {
          return res.status(400).json({
            message: `As OS selecionadas pertencem a quinzenas diferentes (${computedStart} a ${computedEnd}). Gere um boletim para cada quinzena separadamente.`,
          });
        }

        periodStart = computedStart;
        periodEnd = computedEnd;
      }

        // Bloqueia reenvio se já existir aprovação ativa (PENDENTE/APROVADO) cobrindo qualquer um dos billings
        if (!force) {
          const billingIdsAsStr = billingIds.map((x: any) => String(x));
          const { data: existing } = await supabaseAdmin
            .from("boletim_approvals")
            .select("id, token, status, sent_at, sent_by, client_email, period_start, period_end, billing_ids, total_value")
            .eq("client_id", clientId)
            .in("status", ["PENDENTE", "APROVADO"])
            .order("sent_at", { ascending: false });

          const conflict = (existing || []).find((row: any) => {
            const ids = (row.billing_ids || []).map((x: any) => String(x));
            return ids.some((id: string) => billingIdsAsStr.includes(id));
          });

          if (conflict) {
            const conflictIds = (conflict.billing_ids || []).map((x: any) => String(x));
            const overlap = billingIdsAsStr.filter((id: string) => conflictIds.includes(id));
            const sentAtFmt = conflict.sent_at ? new Date(conflict.sent_at).toLocaleString("pt-BR") : "data anterior";
            return res.status(409).json({
              message: conflict.status === "APROVADO"
                ? `Estas OS já foram aprovadas pelo cliente em ${sentAtFmt}. Para reenviar, libere as OS para refaturamento.`
                : `Boletim já enviado ao cliente em ${sentAtFmt}${conflict.sent_by ? " por " + conflict.sent_by : ""}. Aguarde a aprovação do cliente ou cancele o envio anterior antes de reenviar.`,
              existing: {
                id: conflict.id,
                token: conflict.token,
                status: conflict.status,
                sentAt: conflict.sent_at,
                sentBy: conflict.sent_by,
                clientEmail: conflict.client_email,
                periodStart: conflict.period_start,
                periodEnd: conflict.period_end,
                billingIds: conflict.billing_ids,
                overlapBillingIds: overlap,
                totalValue: conflict.total_value,
              },
            });
          }
        }
  

      const { data: billingsData } = await supabaseAdmin
        .from("escort_billings")
        .select("*")
        .in("id", billingIds);

      const soIds = (billingsData || []).map((b: any) => b.service_order_id).filter(Boolean);
      let ordersData: any[] = [];
      if (soIds.length > 0) {
        const { data: sos } = await supabaseAdmin
          .from("service_orders")
          .select("id, os_number, origin, destination, scheduled_date, vehicle_plate, escorted_vehicle_plate, completed_date, processo_omega")
          .in("id", soIds);
        ordersData = sos || [];
      }
      const isOmega = String(clientName || "").toUpperCase().includes("OMEGA SOLUTIONS");
      const processoNumbers = isOmega
        ? Array.from(new Set(ordersData.map((o: any) => String(o?.processo_omega || "").trim()).filter(Boolean)))
        : [];

      let contractsData: any[] = [];
      const contractIds = [...new Set((billingsData || []).map((b: any) => b.contract_id).filter(Boolean))];
      if (contractIds.length > 0) {
        const { data: cts } = await supabaseAdmin
          .from("escort_contracts")
          .select("*")
          .in("id", contractIds);
        contractsData = cts || [];
      }

      const excelBuffer = await generateBoletimExcel(
        clientName, periodStart, periodEnd,
        billingsData || [], ordersData, contractsData,
      );

      const token = generateToken();
      const baseUrl = getBaseUrl(req);
      const approvalUrl = `${baseUrl}/aprovacao/${token}`;
      const period = `${new Date(periodStart + "T12:00:00Z").toLocaleDateString("pt-BR")} a ${new Date(periodEnd + "T12:00:00Z").toLocaleDateString("pt-BR")}`;

      const { data, error } = await supabaseAdmin.from("boletim_approvals").insert({
        token,
        client_id: clientId,
        client_name: clientName,
        client_email: clientEmail,
        period_start: periodStart,
        period_end: periodEnd,
        billing_ids: billingIds,
        total_value: totalValue || 0,
        os_count: osCount || billingIds.length,
        status: "PENDENTE",
        sent_by: user?.name || user?.username || null,
        sent_by_user_id: user?.id || null,
      }).select().single();

      if (error) throw error;

      const periodShort = `${periodStart.replace(/-/g, "")}_${periodEnd.replace(/-/g, "")}`;
      const safeClient = clientName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
      const fileName = `Boletim_${safeClient}_${periodShort}.xlsx`;

      try {
        await sendApprovalEmailWithExcel(clientEmail, clientName, approvalUrl, period, osCount || billingIds.length, totalValue || 0, excelBuffer, fileName, processoNumbers);
        console.log(`[boletim-approval] E-mail com Excel enviado para ${clientEmail} (token: ${token.substring(0, 8)}...)`);
      } catch (emailErr: any) {
        console.error(`[boletim-approval] Erro ao enviar e-mail:`, emailErr.message);
        return res.json({ ...data, emailError: emailErr.message, approvalUrl });
      }

      res.json({ ...data, approvalUrl });
    } catch (err: any) {
      console.error("[boletim-approval] Erro:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/boletim/aprovacao/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { data: approval, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !approval) return res.status(404).json({ message: "Link de aprovação não encontrado ou expirado." });

      if (approval.expires_at && new Date(approval.expires_at) < new Date()) {
        return res.status(410).json({ message: "Este link de aprovação expirou." });
      }

      const billingIds = approval.billing_ids || [];
      let billings: any[] = [];
      if (billingIds.length > 0) {
        const { data: b } = await supabaseAdmin
          .from("escort_billings")
          .select("id, service_order_id, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, fat_adicional_noturno, fat_estadia, fat_pernoite, despesas_outras, receitas_os, fat_total, km_total, km_franquia, km_excedente, horas_trabalhadas, horario_inicio, horario_fim, status")
          .in("id", billingIds);
        billings = b || [];
      }

      let orders: any[] = [];
      const soIds = billings.map((b: any) => b.service_order_id).filter(Boolean);
      if (soIds.length > 0) {
        const { data: sos, error: soErr } = await supabaseAdmin
          .from("service_orders")
          .select("id, os_number, origin, destination, scheduled_date, completed_date, escorted_vehicle_plate, vehicle_id")
          .in("id", soIds);
        if (soErr) console.error("[boletim/aprovacao] erro carregando service_orders:", soErr.message);
        orders = sos || [];
      }

      // Carregar placa da viatura via vehicles (vehicle_id -> plate)
      const vehicleIds = orders.map((o: any) => o.vehicle_id).filter(Boolean);
      let vehiclesMap: Record<string, string> = {};
      if (vehicleIds.length > 0) {
        const { data: vs } = await supabaseAdmin.from("vehicles").select("id, plate").in("id", vehicleIds);
        for (const v of vs || []) vehiclesMap[String(v.id)] = v.plate;
      }

      const enriched = billings.map((b: any) => {
        const so = orders.find((o: any) => o.id === b.service_order_id);
        // Fallback de data: service_order > escort_billing.data_missao
        const scheduled = so?.scheduled_date || b.data_missao || null;
        const completed = so?.completed_date || null;
        return {
          ...b,
          osNumber: so?.os_number || `OS-${b.service_order_id}`,
          origin: so?.origin || b.origem || "",
          destination: so?.destination || b.destino || "",
          scheduledDate: scheduled,
          completedDate: completed,
          vehiclePlate: so?.vehicle_id ? (vehiclesMap[String(so.vehicle_id)] || "") : (b.placa_viatura || ""),
          escortedPlate: so?.escorted_vehicle_plate || b.placa_escoltado || "",
        };
      });

      res.json({
        id: approval.id,
        clientName: approval.client_name,
        periodStart: approval.period_start,
        periodEnd: approval.period_end,
        totalValue: approval.total_value,
        osCount: approval.os_count,
        status: approval.status,
        approvedAt: approval.approved_at,
        approvedByName: approval.approved_by_name,
        billings: enriched,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/boletim/aprovacao/:token/aprovar", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { nome } = req.body;

      const { data: approval, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !approval) return res.status(404).json({ message: "Link de aprovação não encontrado." });

      if (approval.status === "APROVADO") {
        return res.status(400).json({ message: "Este boletim já foi aprovado." });
      }

      if (approval.expires_at && new Date(approval.expires_at) < new Date()) {
        return res.status(410).json({ message: "Este link de aprovação expirou." });
      }

      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "";

      const { error: updateErr } = await supabaseAdmin
        .from("boletim_approvals")
        .update({
          status: "APROVADO",
          approved_at: new Date().toISOString(),
          approved_by_name: nome || "Cliente",
          approved_by_ip: clientIp,
        })
        .eq("id", approval.id);

      if (updateErr) throw updateErr;

      let autoEmitResult: { success: boolean; message: string; nfEmitted: boolean; paymentId?: string } | null = null;
      const billingIds = approval.billing_ids || [];
      if (billingIds.length > 0) {
        const { error: billErr } = await supabaseAdmin
          .from("escort_billings")
          .update({
            status: "APROVADA",
            revisado_por: `Cliente: ${nome || approval.client_name}`,
            revisado_em: new Date().toISOString(),
          })
          .in("id", billingIds);

        if (billErr) console.error("[boletim-approval] Erro ao aprovar billings:", billErr.message);
        else console.log(`[boletim-approval] ${billingIds.length} billing(s) aprovados pelo cliente ${nome || approval.client_name}`);
      }

      try {
        const { data: billingsDetail } = await supabaseAdmin
          .from("escort_billings")
          .select("*")
          .in("id", billingIds);

        let totalCalc = 0;
        const osDescParts: string[] = [];
        for (const b of (billingsDetail || [])) {
          const fat = Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.despesas_pedagio || 0) + Number(b.fat_adicional_noturno || 0) + Number(b.fat_estadia || 0) + Number(b.fat_pernoite || 0) + Number(b.despesas_outras || 0) + Number(b.receitas_os || 0);
          totalCalc += fat;
          const osRef = b.boletim_numero || b.os_number || `OS-${b.service_order_id}`;
          osDescParts.push(osRef);
        }
        if (totalCalc <= 0) totalCalc = Number(approval.total_value) || 0;

        const periodLabel = `${approval.period_start ? new Date(approval.period_start + "T12:00:00Z").toLocaleDateString("pt-BR") : "—"} a ${approval.period_end ? new Date(approval.period_end + "T12:00:00Z").toLocaleDateString("pt-BR") : "—"}`;
        const description = `Escolta Armada — ${approval.client_name} — Período: ${periodLabel} — ${billingIds.length} OS(s): ${osDescParts.join(", ")}`;

        // ─── Emissão atômica (Asaas + NFS-e) ──────────────────────────────
        // Cria a invoice + dispara cobrança/NF na mesma transação lógica:
        // se a emissão falhar, a invoice é REMOVIDA do banco (sem órfãs).
        let invInserted: any = null;
        if (approval.client_id) {
          const { data: invIns, error: invErr } = await supabaseAdmin.from("invoices").insert({
            client_id: approval.client_id,
            client_name: approval.client_name,
            description,
            value: totalCalc,
            due_date: "PENDENTE",
            billing_type: "BOLETO",
            status: "AGUARDANDO_FATURAMENTO",
            external_reference: `BOLETIM-${approval.id}`,
            notes: `Aprovado por ${nome || "Cliente"} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Billing IDs: ${billingIds.join(", ")}`,
          }).select().single();

          if (invErr) {
            console.error("[boletim-approval] Erro ao criar fatura pendente:", invErr.message);
          } else {
            invInserted = invIns;
            try {
              const { data: cli } = await supabaseAdmin.from("clients")
                .select("payment_terms_days, billing_type")
                .eq("id", approval.client_id).single();
              const prazo = Number(cli?.payment_terms_days) > 0 ? Number(cli?.payment_terms_days) : 30;
              const due = new Date(Date.now() + prazo * 24 * 60 * 60 * 1000);
              const dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(due);
              const billingType = (cli?.billing_type as string) || "BOLETO";

              autoEmitResult = await emitInvoiceAuto(invInserted.id, {
                dueDate,
                billingType,
                actorName: `Auto: aprovação cliente (${nome || approval.client_name})`,
              });
              console.log(`[boletim-approval] Auto-emissão: ${autoEmitResult.success ? "OK" : "FALHA"} — ${autoEmitResult.message}`);
            } catch (autoErr: any) {
              console.error("[boletim-approval] Auto-emissão falhou:", autoErr.message);
              autoEmitResult = { success: false, message: autoErr.message, nfEmitted: false };
            }

            // Rollback da invoice órfã: se a emissão NÃO gerou cobrança no Asaas
            // (sem asaas_payment_id), apaga a invoice para não poluir relatórios.
            // A NFS-e que falha após o pagamento ser criado NÃO é considerada órfã
            // (a cobrança Asaas está válida e a NF pode ser reemitida).
            const isOrphan = !autoEmitResult || (!autoEmitResult.success && !autoEmitResult.paymentId);
            if (isOrphan) {
              try {
                await supabaseAdmin.from("invoices").delete().eq("id", invInserted.id);
                console.log(`[boletim-approval] Fatura órfã #${invInserted.id} removida (emissão falhou: ${autoEmitResult?.message || "sem retorno"})`);
                invInserted = null;
              } catch (rbErr: any) {
                console.error(`[boletim-approval] Falha ao remover fatura órfã #${invInserted.id}:`, rbErr.message);
              }
            } else {
              console.log(`[boletim-approval] Fatura #${invInserted.id} emitida para ${approval.client_name} — R$${totalCalc.toFixed(2)}`);
            }
          }
        }
      } catch (invCreateErr: any) {
        console.error("[boletim-approval] Erro ao criar fatura:", invCreateErr.message);
      }

      try {
        const transporter = createSmtpTransporter();
        if (transporter) {
          const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const approvedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const totalFmt = fmt(approval.total_value || 0);

          const notifHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
              <div style="background: #047857; padding: 20px 24px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 1px;">MEDIÇÃO APROVADA PELO CLIENTE</h1>
              </div>
              <div style="padding: 28px 24px;">
                <p style="color: #333; font-size: 15px; margin: 0 0 20px; line-height: 1.6;">
                  O cliente aprovou o boletim de medição. Segue abaixo os detalhes para dar sequência ao faturamento:
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555; width: 40%;">Cliente</td>
                    <td style="padding: 10px 12px; font-weight: 600;">${approval.client_name}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">Período</td>
                    <td style="padding: 10px 12px;">${approval.period_start ? new Date(approval.period_start + "T12:00:00Z").toLocaleDateString("pt-BR") : "—"} a ${approval.period_end ? new Date(approval.period_end + "T12:00:00Z").toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">Qtd. OS</td>
                    <td style="padding: 10px 12px;">${approval.os_count || billingIds.length}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">Valor Total</td>
                    <td style="padding: 10px 12px; font-weight: 800; color: #047857; font-size: 18px;">${totalFmt}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">Aprovado por</td>
                    <td style="padding: 10px 12px;">${nome || "Cliente"}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e5e5;">
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">Data/Hora</td>
                    <td style="padding: 10px 12px;">${approvedAt}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 12px; background: #f8fafb; font-weight: 700; color: #555;">IP</td>
                    <td style="padding: 10px 12px; color: #888; font-size: 12px;">${clientIp}</td>
                  </tr>
                </table>
                ${autoEmitResult && autoEmitResult.success ? `
                <div style="background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="margin: 0; color: #065f46; font-weight: 700; font-size: 14px;">
                    ✅ Cobrança Asaas gerada automaticamente${autoEmitResult.nfEmitted ? " + NFS-e emitida" : ""}.
                  </p>
                  <p style="margin: 6px 0 0; color: #047857; font-size: 12px;">${autoEmitResult.message}</p>
                </div>` : `
                <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="margin: 0; color: #854d0e; font-weight: 700; font-size: 14px;">
                    Ação necessária: Emitir NF-e e boleto para este cliente.
                  </p>
                  ${autoEmitResult ? `<p style="margin: 6px 0 0; color: #b45309; font-size: 12px;">Auto-emissão falhou: ${autoEmitResult.message}</p>` : ""}
                </div>`}
              </div>
              <div style="background: #f1f5f9; padding: 12px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #64748b; font-size: 11px; margin: 0;">Torres Vigilância Patrimonial — Sistema de Gestão</p>
              </div>
            </div>`;

          await transporter.sendMail({
            from: getSmtpFrom(),
            to: "thiago@grupotmseg.com.br, operacional@grupotmseg.com.br",
            subject: `✅ MEDIÇÃO APROVADA — ${approval.client_name} — ${totalFmt}`,
            html: notifHtml,
          });
          console.log(`[boletim-approval] Notificação de aprovação enviada para admin`);
        }
      } catch (mailErr: any) {
        console.error("[boletim-approval] Erro ao enviar notificação de aprovação:", mailErr.message);
      }

      const okMsg = autoEmitResult && autoEmitResult.success
        ? `Boletim aprovado! Cobrança gerada${autoEmitResult.nfEmitted ? " e NF-e emitida" : ""} automaticamente.`
        : "Boletim aprovado com sucesso! A nota fiscal e boleto serão emitidos em breve.";
      res.json({ success: true, message: okMsg, autoEmit: autoEmitResult });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/boletim/aprovacoes", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Status atual das aprovações para um cliente/período (consulta para a UI saber se já enviou)
    app.get("/api/boletim/approval-status", requireAdminRole, async (req: Request, res: Response) => {
      try {
        const clientId = req.query.clientId ? Number(req.query.clientId) : NaN;
        const billingIdsRaw = String(req.query.billingIds || "").trim();
        if (!clientId || !billingIdsRaw) return res.json({ active: null, recent: [] });

        const billingIds = billingIdsRaw.split(",").map((x) => x.trim()).filter(Boolean);
        if (billingIds.length === 0) return res.json({ active: null, recent: [] });

        const { data, error } = await supabaseAdmin
          .from("boletim_approvals")
          .select("id, token, status, sent_at, sent_by, client_email, period_start, period_end, billing_ids, total_value, os_count, approved_at, approved_by_name")
          .eq("client_id", clientId)
          .order("sent_at", { ascending: false })
          .limit(20);
        if (error) throw error;

        const enriched = (data || []).map((row: any) => {
          const ids = (row.billing_ids || []).map((x: any) => String(x));
          const overlap = billingIds.filter((id) => ids.includes(id));
          return { ...row, overlapCount: overlap.length, overlapBillingIds: overlap };
        });

        const active = enriched.find(
          (r: any) => r.overlapCount > 0 && (r.status === "PENDENTE" || r.status === "APROVADO"),
        ) || null;

        res.json({
          active,
          recent: enriched.filter((r: any) => r.overlapCount > 0).slice(0, 5),
        });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    console.log("[boletim-approval] Rotas de aprovação de boletim registradas");
}
