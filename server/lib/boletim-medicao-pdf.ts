/**
 * Espelho PDF do boletim de medição a partir do snapshot congelado.
 * Não recalcula faturamento — só imprime os totais já gravados.
 */
import PDFDocument from "pdfkit";
import { supabaseAdmin } from "../supabase";
import { round2 } from "./boletim-totals";

function fmtBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

async function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  build(doc);
  doc.end();
  return done;
}

export async function buildBoletimMedicaoPdfForInvoice(invoice: {
  id: number;
  client_id?: number | null;
  client_name?: string | null;
}): Promise<Buffer | null> {
  const invoiceId = Number(invoice?.id);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) return null;

  const { data: bills } = await supabaseAdmin
    .from("escort_billings")
    .select("id, boletim_numero, fat_total, service_order_id, data_missao")
    .eq("invoice_id", invoiceId);
  const billingIds = (bills || []).map((b: any) => String(b.id));
  if (billingIds.length === 0) return null;

  const { data: approvals } = await supabaseAdmin
    .from("boletim_approvals")
    .select("id, client_name, period_start, period_end, total_value, os_count, billing_ids, billing_snapshot, status")
    .eq("client_id", invoice.client_id || 0)
    .order("created_at", { ascending: false })
    .limit(40);

  const approval = (approvals || []).find((a: any) => {
    const ids = (a.billing_ids || []).map((x: any) => String(x));
    return billingIds.some((id) => ids.includes(id));
  }) || null;
  if (!approval) return null;

  const snapshot: any[] = Array.isArray(approval.billing_snapshot) ? approval.billing_snapshot : [];
  const rows = snapshot.length
    ? snapshot
    : (bills || []).map((b: any) => ({
      os_number: `OS-${b.service_order_id || ""}`,
      total: Number(b.fat_total || 0),
    }));

  const clientName = String(approval.client_name || invoice.client_name || "Cliente");
  const total = round2(Number(approval.total_value || rows.reduce((s, r) => s + Number(r.total || 0), 0)));

  return pdfBuffer((doc) => {
    doc.fontSize(14).fillColor("#1a1a2e").text("BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#333").text(`Cliente: ${clientName}`);
    doc.text(`Período: ${fmtDate(approval.period_start)} a ${fmtDate(approval.period_end)}`);
    doc.text(`OS: ${approval.os_count || rows.length}    Total: ${fmtBRL(total)}    Status: ${approval.status || "—"}`);
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor("#111").text("OS", 36, doc.y, { continued: true, width: 120 });
    doc.text("Acionamento", 160, doc.y, { continued: true, width: 90 });
    doc.text("HE", 250, doc.y, { continued: true, width: 70 });
    doc.text("KM", 320, doc.y, { continued: true, width: 70 });
    doc.text("Pedágio", 390, doc.y, { continued: true, width: 80 });
    doc.text("Total", 480);
    doc.moveTo(36, doc.y + 2).lineTo(780, doc.y + 2).strokeColor("#ccc").stroke();
    doc.moveDown(0.4);
    for (const r of rows.slice(0, 40)) {
      if (doc.y > 520) {
        doc.addPage();
      }
      doc.fillColor("#222").text(String(r.os_number || "—"), 36, doc.y, { continued: true, width: 120 });
      doc.text(fmtBRL(Number(r.fat_acionamento || 0)), 160, doc.y, { continued: true, width: 90 });
      doc.text(fmtBRL(Number(r.fat_hora_extra || 0)), 250, doc.y, { continued: true, width: 70 });
      doc.text(fmtBRL(Number(r.fat_km || 0)), 320, doc.y, { continued: true, width: 70 });
      doc.text(fmtBRL(Number(r.despesas_pedagio || 0)), 390, doc.y, { continued: true, width: 80 });
      doc.text(fmtBRL(Number(r.total || 0)), 480);
    }
    if (rows.length > 40) {
      doc.moveDown(0.4).fontSize(8).fillColor("#666").text(`… e mais ${rows.length - 40} OS no snapshot oficial.`);
    }
    doc.moveDown(0.8).fontSize(8).fillColor("#666").text(
      "Espelho do snapshot congelado no envio do boletim. Valores idênticos à tela/e-mail/Excel oficiais.",
    );
  });
}
