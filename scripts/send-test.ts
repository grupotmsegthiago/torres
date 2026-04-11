import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

function fmtHHMM(h: number): string {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function extractCity(addr: string): string {
  if (!addr) return "\u2014";
  const parts = addr.toUpperCase().trim().split(/[,\-\/]+/).map(p => p.trim()).filter(Boolean);
  return parts[0] || addr;
}

function fmtDateBR(iso?: string | null): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return "\u2014"; }
}

function fmtTimeBR(iso?: string | null): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "\u2014"; }
}

async function run() {
  const billingId = "5a5868d9-e05a-40ba-a5f1-e19784a7036d";
  const clientName = "OMEGA SOLUTIONS TRANSPORTES LTDA";
  const clientEmail = "thiago@grupotmseg.com.br";
  const periodStart = "2026-04-01";
  const periodEnd = "2026-04-30";

  console.log("Fetching billing data for TOR-0039...");
  const { data: billingsData } = await sb.from("escort_billings").select("*").eq("id", billingId);
  console.log("Billings:", billingsData?.length);

  const soIds = (billingsData || []).map((b: any) => b.service_order_id).filter(Boolean);
  let ordersData: any[] = [];
  if (soIds.length > 0) {
    const { data: sos } = await sb.from("service_orders")
      .select("id, os_number, origin, destination, scheduled_date, vehicle_plate, escorted_vehicle_plate, completed_date")
      .in("id", soIds);
    ordersData = sos || [];
  }
  console.log("Orders:", ordersData.length);

  const contractIds = [...new Set((billingsData || []).map((b: any) => b.contract_id).filter(Boolean))];
  let contractsData: any[] = [];
  if (contractIds.length > 0) {
    const { data: cts } = await sb.from("escort_contracts").select("*").in("id", contractIds as string[]);
    contractsData = cts || [];
  }
  console.log("Contracts:", contractsData.length);

  console.log("Generating Excel...");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torres Vigil\u00e2ncia Patrimonial";
  const colCount = 27;
  const ws = wb.addWorksheet("Boletim", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colWidths = [10, 30, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14];
  ws.columns = colWidths.map(w => ({ width: w }));

  const darkFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  const accentFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_BG } };
  const applyFill = (row: ExcelJS.Row, fill: ExcelJS.Fill) => { for (let i = 1; i <= colCount; i++) row.getCell(i).fill = fill; };

  const emptyArr = Array(colCount).fill(null);

  const row1 = ws.addRow(emptyArr);
  ws.mergeCells(1, 2, 1, colCount);
  applyFill(row1, darkFill);
  row1.height = 28;

  const row2 = ws.addRow(emptyArr);
  ws.mergeCells(2, 2, 2, colCount);
  row2.getCell(2).value = "BOLETIM DE MEDI\u00C7\u00C3O \u2014 TORRES VIGIL\u00C2NCIA PATRIMONIAL";
  row2.getCell(2).font = { bold: true, size: 14, color: { argb: WHITE_C } };
  row2.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
  applyFill(row2, darkFill);
  row2.height = 32;

  let logoBuffer: Buffer | null = null;
  try {
    const logoPath = path.resolve("public", "logo-torres-dark.jpeg");
    if (fs.existsSync(logoPath)) logoBuffer = fs.readFileSync(logoPath);
  } catch {}
  if (logoBuffer) {
    const imageId = wb.addImage({ buffer: logoBuffer, extension: "jpeg" });
    ws.addImage(imageId, { tl: { col: 0, row: 0 } as any, br: { col: 1, row: 2 } as any, editAs: "oneCell" });
  }

  const rowP = ws.addRow(emptyArr);
  ws.mergeCells(rowP.number, 1, rowP.number, colCount);
  rowP.getCell(1).value = "GERAL \u2014 ABRIL/2026 \u2014 M\u00CAS COMPLETO";
  rowP.getCell(1).font = { bold: true, size: 10, color: { argb: WHITE_C } };
  rowP.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  applyFill(rowP, darkFill);
  rowP.height = 20;

  const rowS = ws.addRow(emptyArr);
  ws.mergeCells(rowS.number, 1, rowS.number, colCount);
  rowS.getCell(1).value = "REFERENTE AO SERVI\u00C7O DE ESCOLTA ARMADA \u2014 " + clientName;
  rowS.getCell(1).font = { bold: true, italic: true, size: 9, color: { argb: RED_C } };
  rowS.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  applyFill(rowS, accentFill);
  rowS.height = 18;

  const groupHeaders = [
    { label: "TABELA ACORDADA", span: 7 },
    { label: "INFORMA\u00C7\u00D5ES DA VIAGEM", span: 6 },
    { label: "KILOMETRAGEM", span: 3 },
    { label: "HOR\u00C1RIOS", span: 3 },
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

  const headers = ["N\u00BA", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$", "DATA IN\u00CDCIO", "HORA IN\u00CDCIO", "VIATURA", "VE\u00CDC. ESCOLTADO", "DATA FIM", "HORA FIM", "KM INICIAL", "KM FINAL", "KM TOTAL", "HR IN\u00CDCIO", "HR FIM", "HR TOTAL", "KM EXC.", "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PED\u00C1GIO", "TOTAL"];
  const headerRow = ws.addRow(headers);
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    const cell = headerRow.getCell(i);
    cell.font = { bold: true, size: 9, color: { argb: WHITE_C } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = allBorders;
  }

  const ordersMap = new Map(ordersData.map((o: any) => [o.id, o]));
  const contractsMap = new Map(contractsData.map((c: any) => [c.id, c]));
  const currCols = new Set([2, 5, 6, 20, 21, 23, 24, 25, 26]);
  let grandTotal = 0;

  (billingsData || []).forEach((b: any, idx: number) => {
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
    const fatTotal = n(b.fat_total) || (valorAcionamento + fatKmExtra + fatHoraExtra + fatPedagio);
    grandTotal += fatTotal;

    const osNum = b.os_number || so.os_number || "TOR-0039";
    const origem = b.origem || so.origin || "";
    const destino = b.destino || so.destination || "";
    const routeStr = (origem && destino) ? `${extractCity(origem)} \u00D7 ${extractCity(destino)}` : (origem || destino || "\u2014");
    const viatura = b.placa_viatura || so.vehicle_plate || "\u2014";
    const escoltado = b.placa_escoltado || so.escorted_vehicle_plate || "\u2014";
    const dataMissao = b.data_missao || so.scheduled_date || b.created_at;

    const rowData: any[] = [
      osNum, routeStr, Number(valorAcionamento.toFixed(2)), fmtHHMM(franquiaHoras), franquiaKm > 0 ? franquiaKm : 0,
      Number(valorHoraExtra.toFixed(2)), Number(valorKmExtra.toFixed(2)),
      fmtDateBR(dataMissao), b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTimeBR(dataMissao),
      viatura, escoltado, fmtDateBR(dataMissao),
      b.horario_fim ? b.horario_fim.substring(0, 5) : "\u2014",
      n(b.km_inicial), n(b.km_final), kmTotal,
      b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTimeBR(dataMissao),
      b.horario_fim ? b.horario_fim.substring(0, 5) : "\u2014",
      fmtHHMM(horasMissao),
      kmExcedente, Number(valorKmExtra.toFixed(2)), Number(fatKmExtra.toFixed(2)),
      hrExcedente > 0 ? fmtHHMM(hrExcedente) : "0:00", Number(valorHoraExtra.toFixed(2)), Number(fatHoraExtra.toFixed(2)),
      Number(fatPedagio.toFixed(2)), Number(fatTotal.toFixed(2)),
    ];

    const row = ws.addRow(rowData);
    row.height = 20;
    for (let i = 1; i <= colCount; i++) {
      const cell = row.getCell(i);
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = allBorders;
      if (idx % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F9F9F9" } };
      if (currCols.has(i - 1) && typeof rowData[i - 1] === "number") cell.numFmt = BRL_FMT;
    }
  });

  const totalsArr: (string | number)[] = Array(27).fill("");
  totalsArr[0] = "TOTAL";
  totalsArr[26] = Number(grandTotal.toFixed(2));
  const totalRow = ws.addRow(totalsArr);
  totalRow.height = 26;
  for (let i = 1; i <= colCount; i++) {
    const cell = totalRow.getCell(i);
    cell.font = { bold: true, size: 10, color: { argb: WHITE_C } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = allBorders;
    if (i === 27) cell.numFmt = BRL_FMT;
  }

  await ws.protect("TorresVP2026", { sheet: true, objects: true, scenarios: true });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  console.log("Excel generated:", buffer.length, "bytes");

  const token = crypto.randomBytes(32).toString("hex");
  const approvalUrl = "https://234c7c6a-bb34-4080-913c-2c786d224185-00-1ne4rfjd9dnv5.spock.replit.dev/aprovacao/" + token;
  const period = "01/04/2026 a 30/04/2026";

  const { error: insertErr } = await sb.from("boletim_approvals").insert({
    token,
    client_id: 9,
    client_name: clientName,
    client_email: clientEmail,
    period_start: periodStart,
    period_end: periodEnd,
    billing_ids: [billingId],
    total_value: grandTotal,
    os_count: 1,
    status: "PENDENTE",
  });

  if (insertErr) { console.error("Insert error:", insertErr.message); return; }
  console.log("Approval record created OK");

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  console.log("SMTP_PASS length:", (process.env.SMTP_PASS || "").length);
  console.log("Trying to send email...");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: "thiago@grupotmseg.com.br", pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.verify();
    console.log("SMTP connection verified OK!");
  } catch (verifyErr: any) {
    console.error("SMTP verify FAILED:", verifyErr.message);
    console.log("Trying with port 465 (SSL)...");
    
    const transporter2 = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "thiago@grupotmseg.com.br", pass: process.env.SMTP_PASS },
    });
    
    try {
      await transporter2.verify();
      console.log("SMTP (465/SSL) verified OK!");
      
      const html = buildHtml(clientName, period, 1, grandTotal, fmt, approvalUrl);
      await transporter2.sendMail({
        from: '"Torres Vigil\u00e2ncia Patrimonial" <thiago@grupotmseg.com.br>',
        to: clientEmail,
        subject: "\uD83D\uDCCB [TESTE] Boletim de Medi\u00E7\u00E3o \u2014 TOR-0039 \u2014 " + clientName,
        html,
        attachments: [{
          filename: "Boletim_OMEGA_SOLUTIONS_TOR0039.xlsx",
          content: buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      });
      console.log("\u2705 E-mail enviado com sucesso via porta 465!");
      console.log("Link:", approvalUrl);
      return;
    } catch (e2: any) {
      console.error("SMTP (465) also failed:", e2.message);
    }
    
    console.log("Trying with Gmail workspace SMTP relay (smtp-relay.gmail.com)...");
    const transporter3 = nodemailer.createTransport({
      host: "smtp-relay.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "thiago@grupotmseg.com.br", pass: process.env.SMTP_PASS },
    });
    
    try {
      await transporter3.verify();
      console.log("Relay SMTP verified OK!");
      
      const html = buildHtml(clientName, period, 1, grandTotal, fmt, approvalUrl);
      await transporter3.sendMail({
        from: '"Torres Vigil\u00e2ncia Patrimonial" <thiago@grupotmseg.com.br>',
        to: clientEmail,
        subject: "\uD83D\uDCCB [TESTE] Boletim de Medi\u00E7\u00E3o \u2014 TOR-0039 \u2014 " + clientName,
        html,
        attachments: [{
          filename: "Boletim_OMEGA_SOLUTIONS_TOR0039.xlsx",
          content: buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      });
      console.log("\u2705 E-mail enviado com sucesso via relay!");
      console.log("Link:", approvalUrl);
      return;
    } catch (e3: any) {
      console.error("Relay also failed:", e3.message);
    }
    
    console.log("\n\u274C SMTP n\u00e3o funcionou em nenhuma configura\u00e7\u00e3o.");
    console.log("A senha de app do Gmail pode ter expirado.");
    console.log("Excel foi salvo em: /tmp/Boletim_TESTE_TOR0039.xlsx");
    fs.writeFileSync("/tmp/Boletim_TESTE_TOR0039.xlsx", buffer);
    console.log("Approval link:", approvalUrl);
    return;
  }

  const html = buildHtml(clientName, period, 1, grandTotal, fmt, approvalUrl);

  await transporter.sendMail({
    from: '"Torres Vigil\u00e2ncia Patrimonial" <thiago@grupotmseg.com.br>',
    to: clientEmail,
    subject: "\uD83D\uDCCB [TESTE] Boletim de Medi\u00E7\u00E3o \u2014 TOR-0039 \u2014 " + clientName,
    html,
    attachments: [{
      filename: "Boletim_OMEGA_SOLUTIONS_TOR0039.xlsx",
      content: buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });
  
  console.log("\u2705 E-mail de teste enviado com sucesso para", clientEmail);
  console.log("Link de aprova\u00E7\u00E3o:", approvalUrl);
}

function buildHtml(clientName: string, period: string, osCount: number, totalValue: number, fmt: (v: number) => string, approvalUrl: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #1e3a5f 100%); padding: 28px 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px; letter-spacing: 2px; font-weight: 800;">TORRES VIGIL\u00C2NCIA PATRIMONIAL</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 12px; letter-spacing: 1px;">CNPJ 36.982.392/0001-89 \u2014 Servi\u00E7o de Escolta Armada</p>
      </div>
      <div style="padding: 32px 28px;">
        <h2 style="color: #1B1B1B; margin: 0 0 8px; font-size: 18px; font-weight: 700;">\uD83D\uDCCB Boletim de Medi\u00E7\u00E3o</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
          Prezado(a) <strong>${clientName}</strong>,
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
          Segue em anexo o <strong>Boletim de Medi\u00E7\u00E3o</strong> referente ao per\u00EDodo <strong>${period}</strong> para sua confer\u00EAncia e aprova\u00E7\u00E3o.
        </p>
        <div style="background: #f8fafb; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Per\u00EDodo:</td>
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
            Ao clicar no bot\u00E3o abaixo, voc\u00EA declara:
          </p>
          <p style="color: #047857; font-size: 13px; font-style: italic; margin: 0 0 16px; line-height: 1.6;">
            \u201CEstou de acordo com as medi\u00E7\u00F5es acima e autorizo a emiss\u00E3o da nota fiscal e boleto.\u201D
          </p>
          <a href="${approvalUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669, #047857); color: #fff; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 15px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
            \u2705 APROVAR MEDI\u00C7\u00C3O E AUTORIZAR FATURAMENTO
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 16px 0 0;">
          Este link \u00E9 v\u00E1lido por 30 dias. O arquivo Excel em anexo cont\u00E9m o detalhamento completo.
        </p>
      </div>
      <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 11px; margin: 0;">Torres Vigil\u00E2ncia Patrimonial LTDA \u2014 Servi\u00E7o de Escolta Armada Caracterizada</p>
        <p style="color: #ef4444; font-size: 10px; margin: 4px 0 0; font-weight: bold;">\u26A0\uFE0F E-MAIL DE TESTE \u2014 OS TOR-0039</p>
      </div>
    </div>
  `;
}

run().catch(e => console.error("Fatal:", e.message));
