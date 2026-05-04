import type { Express, Request, Response } from "express";
import { requireAdminRole } from "./auth";
import { supabaseAdmin } from "./supabase";
import { logSystemAudit } from "./audit";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "./routes/_helpers";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://www.asaas.com/api/v3";

// CNPJ da Torres Vigilância Patrimonial — emitente único de todas as NFs do sistema.
// Usado para filtrar/marcar invoices e impedir que registros legados/teste de outros
// emitentes apareçam no Relatório de NFs.
const TORRES_CNPJ = "36982392000189";
const cleanCnpj = (v: string | null | undefined): string => String(v || "").replace(/\D/g, "");

const CNAE_PRINCIPAL = "7870";
const CODIGO_SERVICO_MUNICIPAL = "25";
const CODIGO_SERVICO_MUNICIPAL_CODE = "07870";
const ISS_ALIQUOTA = 0;
const DESCRICAO_SERVICO_FIXA = "Vigilância, segurança ou monitoramento de bens, pessoas e semoventes";

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
}

function buildInvoiceDescription(_clientName: string, periodoInicio: string, periodoFim: string, _osCount?: number): string {
  const inicio = new Date(periodoInicio + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const fim = new Date(periodoFim + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Ref. a Serviço de Escolta Armada Caracterizada - Período: ${inicio} a ${fim}`;
}

const INSS_OBSERVACAO_LEGAL = "Retenção de INSS sobre cessão de mão-de-obra (Anexo IV) — Art. 111, II da IN RFB nº 2.110/2022.";
const INSS_DISPENSA_OBSERVACAO = "De acordo com o artigo 115 da IN RFB nº 2.110/2022, a contratante fica dispensada de efetuar a retenção de INSS.";

function buildInssObservation(retemInss: boolean, aliquota: number, valor: number): string {
  if (!retemInss) return INSS_DISPENSA_OBSERVACAO;
  return `${INSS_OBSERVACAO_LEGAL} Alíquota: ${aliquota.toFixed(2)}%. Valor retido: R$ ${valor.toFixed(2).replace(".", ",")}.`;
}

function buildFiscalPayload(value: number, clientCpfCnpj: string, opts?: { retemInss?: boolean; inssAliquota?: number }): Record<string, any> {
  const retemInss = !!opts?.retemInss;
  const inssAliquota = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((value * inssAliquota / 100).toFixed(2)) : 0;
  const inssObs = buildInssObservation(retemInss, inssAliquota, inssValor);
  return {
    serviceListItem: CODIGO_SERVICO_MUNICIPAL,
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    deductions: 0,
    effectiveDatePeriod: "MONTHLY",
    receivedOnly: false,
    observations: `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. ${inssObs}`.trim(),
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0,
      csll: 0,
      inss: inssAliquota,
      ir: 0,
      pis: 0,
    },
  };
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function buildNfseInvoicePayload(opts: { paymentId: string; value: number; description: string; observations?: string; customerId?: string; retemInss?: boolean; inssAliquota?: number }): Record<string, any> {
  const retemInss = !!opts.retemInss;
  const inssAliquota = retemInss ? Number(opts.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((opts.value * inssAliquota / 100).toFixed(2)) : 0;
  const inssObs = buildInssObservation(retemInss, inssAliquota, inssValor);
  const baseObs = opts.observations || `CNAE ${CNAE_PRINCIPAL}. ${opts.description || ""}`.trim();
  const payload: Record<string, any> = {
    serviceDescription: DESCRICAO_SERVICO_FIXA,
    observations: `${baseObs} ${inssObs}`.trim(),
    value: opts.value,
    deductions: 0,
    effectiveDate: todayDateStr(),
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    municipalServiceName: DESCRICAO_SERVICO_FIXA,
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0, csll: 0, inss: inssAliquota, ir: 0, pis: 0,
    },
  };
  const overrideMunicipalServiceId = process.env.ASAAS_MUNICIPAL_SERVICE_ID;
  if (overrideMunicipalServiceId) {
    payload.municipalServiceId = parseInt(overrideMunicipalServiceId);
  }
  if (opts.paymentId) payload.payment = opts.paymentId;
  if (opts.customerId) payload.customer = opts.customerId;
  console.log("[asaas] NFS-e payload:", JSON.stringify({
    municipalServiceCode: payload.municipalServiceCode,
    municipalServiceName: payload.municipalServiceName,
    municipalServiceId: payload.municipalServiceId ?? "(omitido)",
  }));
  return payload;
}

async function sendBillingEmail(invoice: {
  id: number;
  client_name: string;
  value: number;
  due_date: string;
  billing_type: string;
  description: string;
  invoice_url?: string | null;
  bank_slip_url?: string | null;
  nfse_url?: string | null;
  pix_copia_e_cola?: string | null;
  service_order_id?: number | null;
}, clientEmail: string) {
  const transporter = createSmtpTransporter();
  if (!transporter || !clientEmail) {
    console.log(`[billing-email] Skipped: ${!transporter ? "SMTP not configured" : "No client email"}`);
    return;
  }

  const dueDateFormatted = new Date(invoice.due_date + "T12:00:00").toLocaleDateString("pt-BR");
  const valueFormatted = invoice.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const osRef = invoice.service_order_id ? `OS #${invoice.service_order_id}` : "";

  const links: string[] = [];
  if (invoice.invoice_url) {
    links.push(`<a href="${invoice.invoice_url}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">📄 VER FATURA</a>`);
  }
  if (invoice.bank_slip_url) {
    links.push(`<a href="${invoice.bank_slip_url}" style="display:inline-block;background:#0066cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">🏦 BOLETO BANCÁRIO</a>`);
  }
  if (invoice.nfse_url) {
    links.push(`<a href="${invoice.nfse_url}" style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">📋 NOTA FISCAL</a>`);
  }

  let pixSection = "";
  if (invoice.pix_copia_e_cola) {
    pixSection = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:13px;font-weight:bold;color:#166534;margin:0 0 8px;">Pagamento via PIX</p>
      <p style="font-size:11px;color:#15803d;margin:0 0 8px;">Copie o código abaixo e cole no app do seu banco:</p>
      <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:11px;color:#374151;">
        ${invoice.pix_copia_e_cola}
      </div>
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Torres Vigilância Patrimonial</h1>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Faturamento</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">
      Prezado(a) <strong>${invoice.client_name}</strong>,
    </p>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 16px;">
      Segue abaixo a cobrança referente aos serviços de escolta armada prestados${osRef ? ` (${osRef})` : ""}.
    </p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table style="width:100%;font-size:13px;color:#333;">
        <tr><td style="padding:4px 0;color:#666;">Descrição:</td><td style="padding:4px 0;font-weight:bold;text-align:right;">${invoice.description || DESCRICAO_SERVICO_FIXA}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Valor:</td><td style="padding:4px 0;font-weight:bold;font-size:16px;color:#1a1a2e;text-align:right;">${valueFormatted}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Vencimento:</td><td style="padding:4px 0;font-weight:bold;text-align:right;">${dueDateFormatted}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Forma:</td><td style="padding:4px 0;text-align:right;">${invoice.billing_type === "PIX" ? "PIX" : invoice.billing_type === "CREDIT_CARD" ? "Cartão" : "Boleto"}</td></tr>
      </table>
    </div>
    ${links.length > 0 ? `<div style="text-align:center;margin:20px 0;">${links.join("\n")}</div>` : ""}
    ${pixSection}
    <p style="font-size:12px;color:#888;line-height:1.5;margin:20px 0 0;">
      Em caso de dúvidas, entre em contato conosco pelo e-mail 
      <a href="mailto:diretoria@torresseguranca.com.br" style="color:#1a1a2e;">diretoria@torresseguranca.com.br</a> 
      ou pelo telefone (11) 96369-6699.
    </p>
  </div>
  <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#888;font-size:11px;margin:2px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
    <p style="color:#999;font-size:10px;margin:2px 0;">CNPJ 36.982.392/0001-89</p>
    <p style="color:#999;font-size:10px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ escolta@torresseguranca.com.br</p>
  </div>
</div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: getSmtpFrom(),
      to: clientEmail,
      bcc: ["thiago@grupotmseg.com.br", "financeiro@torresseguranca.com.br"],
      subject: `Torres Segurança - Fatura ${valueFormatted} - Venc. ${dueDateFormatted}${osRef ? ` - ${osRef}` : ""}`,
      html,
    });

    await supabaseAdmin.from("invoices").update({
      email_sent: true,
      email_sent_at: nowBRTString(),
      email_sent_to: clientEmail,
    }).eq("id", invoice.id);

    console.log(`[billing-email] ✓ Fatura #${invoice.id} enviada para ${clientEmail}`);
  } catch (err: any) {
    console.error(`[billing-email] ✗ Erro ao enviar fatura #${invoice.id} para ${clientEmail}: ${err.message}`);
  }
}

async function emitNfseImmediate(opts: { paymentId: string; value: number; description: string; observations?: string; customerId?: string; retemInss?: boolean; inssAliquota?: number }): Promise<{ id: string; status: string; number?: string }> {
  const payload = buildNfseInvoicePayload(opts);
  const result = await asaasRequest("POST", "/invoices", payload);
  const nfId = result.id;
  console.log(`[asaas] NFS-e criada via /invoices: id=${nfId}, status=${result.status}`);

  if (nfId && result.status !== "AUTHORIZED" && result.status !== "PROCESSING") {
    try {
      const authResult = await asaasRequest("POST", `/invoices/${nfId}/authorize`);
      console.log(`[asaas] NFS-e ${nfId} authorize called: status=${authResult.status}`);
      return { id: nfId, status: authResult.status || "AUTHORIZED", number: authResult.number ? String(authResult.number) : undefined };
    } catch (authErr: any) {
      console.log(`[asaas] NFS-e ${nfId} authorize failed (non-blocking): ${authErr.message}`);
    }
  }

  return { id: nfId, status: result.status || "SCHEDULED", number: result.number ? String(result.number) : undefined };
}

// ============================================================
  // Normalização de status para o Relatório de NFs
  // ============================================================
  export type NormalizedNfStatus =
    | "AGUARDANDO_BOLETIM"
    | "PENDENTE_APROVACAO"
    | "AUTORIZADO"
    | "NF_PROCESSANDO"
    | "NF_EMITIDA"
    | "NF_ERRO"
    | "NF_CANCELADA"
    | "PAGO"
    | "VENCIDO"
    | "OUTRO";

  export function normalizeInvoiceStatus(invoice: any): NormalizedNfStatus {
    const payStatus = String(invoice?.status || "").toUpperCase();
    const nfStatus = String(invoice?.nfse_status || "").toUpperCase();

    if (["RECEIVED", "CONFIRMED", "PAGO", "RECEIVED_IN_CASH"].includes(payStatus)) return "PAGO";
    if (nfStatus.includes("CANCEL")) return "NF_CANCELADA";
    if (["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA"].includes(nfStatus)) return "NF_ERRO";
    if (["AUTHORIZED", "SYNCHRONIZED", "ISSUED"].includes(nfStatus)) return "NF_EMITIDA";
    if (["PROCESSING", "WAITING_MUNICIPAL_PROCESSING", "SCHEDULED", "PENDING"].includes(nfStatus)) return "NF_PROCESSANDO";
    if (["CANCELLED", "CANCELED"].includes(payStatus)) return "NF_CANCELADA";
    if (payStatus === "OVERDUE") return "VENCIDO";
    return "AUTORIZADO";
  }

  export function normalizeBoletimStatus(approval: any): NormalizedNfStatus {
    const st = String(approval?.status || "").toUpperCase();
    if (st === "PENDENTE") return "PENDENTE_APROVACAO";
    if (st === "APROVADO") return "AUTORIZADO";
    return "OUTRO";
  }

  // ============================================================
  // Reconciliação de status com o Asaas (payment + NFS-e)
  // ============================================================
  export async function reconcileInvoiceFromAsaas(invoice: any): Promise<{ updated: boolean; changes?: Record<string, any> }> {
    if (!invoice?.asaas_payment_id || !process.env.ASAAS_API_KEY) return { updated: false };

    const updates: Record<string, any> = {};
    let changed = false;

    try {
      const payment = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
      if (payment?.status && payment.status !== invoice.status) { updates.status = payment.status; changed = true; }
      if (payment?.netValue && Number(payment.netValue) !== Number(invoice.net_value || 0)) { updates.net_value = payment.netValue; changed = true; }
      if (payment?.invoiceUrl && payment.invoiceUrl !== invoice.invoice_url) { updates.invoice_url = payment.invoiceUrl; changed = true; }
      const bsUrl = payment?.bankSlip?.url || payment?.bankSlipUrl;
      if (bsUrl && bsUrl !== invoice.bank_slip_url) { updates.bank_slip_url = bsUrl; changed = true; }
      if (payment?.paymentDate && payment.paymentDate !== invoice.payment_date) { updates.payment_date = payment.paymentDate; changed = true; }
    } catch (e: any) {
      console.log(`[reconcile] payment fetch invoice #${invoice.id} (${invoice.asaas_payment_id}): ${e.message}`);
    }

    if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
      try {
        const nf = await asaasRequest("GET", `/invoices/${invoice.nfse_number}`);
        if (nf?.status && nf.status !== invoice.nfse_status) { updates.nfse_status = nf.status; changed = true; }
        if (nf?.pdfUrl && nf.pdfUrl !== invoice.nfse_url) { updates.nfse_url = nf.pdfUrl; changed = true; }
        else if (nf?.xmlUrl && !invoice.nfse_url) { updates.nfse_url = nf.xmlUrl; changed = true; }
        if (nf?.number && String(nf.number) !== invoice.nfse_number) { updates.nfse_number = String(nf.number); changed = true; }
      } catch (e: any) {
        console.log(`[reconcile] /invoices fetch invoice #${invoice.id}: ${e.message}`);
      }
    } else {
      try {
        const fi = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
        if (fi?.status && fi.status !== invoice.nfse_status) { updates.nfse_status = fi.status; changed = true; }
        if (fi?.externalUrl && fi.externalUrl !== invoice.nfse_url) { updates.nfse_url = fi.externalUrl; changed = true; }
        if (fi?.number && String(fi.number) !== invoice.nfse_number) { updates.nfse_number = String(fi.number); changed = true; }
        else if (fi?.rpsNumber && !invoice.nfse_number) { updates.nfse_number = `RPS-${fi.rpsNumber}`; changed = true; }
      } catch (_e) {
        // silencioso: nem toda fatura tem fiscalInfo ainda
      }
    }

    if (changed) {
      updates.updated_at = new Date().toISOString();
      await supabaseAdmin.from("invoices").update(updates).eq("id", invoice.id);
    }
    return { updated: changed, changes: changed ? updates : undefined };
  }

  export const nfReconcileState: {
    startedAt: string | null;
    completedAt: string | null;
    processed: number;
    updated: number;
    errors: number;
    lastError: string | null;
    running: boolean;
  } = {
    startedAt: null,
    completedAt: null,
    processed: 0,
    updated: 0,
    errors: 0,
    lastError: null,
    running: false,
  };

  export async function reconcileAllInvoicesAsaas(opts?: { force?: boolean; limit?: number }): Promise<typeof nfReconcileState> {
    if (!process.env.ASAAS_API_KEY) {
      nfReconcileState.lastError = "ASAAS_API_KEY não configurada";
      return nfReconcileState;
    }
    if (nfReconcileState.running) return nfReconcileState;

    nfReconcileState.running = true;
    nfReconcileState.startedAt = new Date().toISOString();
    nfReconcileState.processed = 0;
    nfReconcileState.updated = 0;
    nfReconcileState.errors = 0;
    nfReconcileState.lastError = null;

    const force = opts?.force === true;
    const limit = opts?.limit ?? 80;

    try {
      const { data: invoices, error } = await supabaseAdmin.from("invoices")
        .select("*")
        .not("asaas_payment_id", "is", null)
        .order("updated_at", { ascending: true, nullsFirst: true } as any)
        .limit(limit);
      if (error) throw error;

      for (const inv of (invoices || [])) {
        try {
          if (!force) {
            const payTerminal = ["RECEIVED", "CONFIRMED"].includes(String(inv.status || "").toUpperCase());
            const nfStatusUp = String(inv.nfse_status || "").toUpperCase();
            const numIsFinal = inv.nfse_number && !String(inv.nfse_number).startsWith("inv_");
            const isCanceled = ["CANCELED", "CANCELLED"].includes(nfStatusUp);
            // NF é considerada "completa" quando está AUTHORIZED/SYNCHRONIZED com
            // número final (não inv_*) e URL do PDF, OU quando foi cancelada.
            // Caso contrário continua reconciliando para baixar nº/URL pendentes.
            const nfTerminal = isCanceled || (
              ["AUTHORIZED", "SYNCHRONIZED"].includes(nfStatusUp) && numIsFinal && !!inv.nfse_url
            );
            const recentlyUpdated = inv.updated_at && (Date.now() - new Date(inv.updated_at).getTime() < 8 * 60 * 1000);
            if (payTerminal && nfTerminal) continue;
            if (recentlyUpdated && nfTerminal) continue;
          }
          const r = await reconcileInvoiceFromAsaas(inv);
          nfReconcileState.processed += 1;
          if (r.updated) {
            nfReconcileState.updated += 1;
            console.log(`[reconcile] invoice #${inv.id} atualizada:`, JSON.stringify(r.changes));
          }
        } catch (e: any) {
          nfReconcileState.errors += 1;
          nfReconcileState.lastError = e?.message || String(e);
        }
      }
    } catch (e: any) {
      nfReconcileState.errors += 1;
      nfReconcileState.lastError = e?.message || String(e);
    } finally {
      nfReconcileState.completedAt = new Date().toISOString();
      nfReconcileState.running = false;
      console.log(`[reconcile] concluído: processadas=${nfReconcileState.processed}, atualizadas=${nfReconcileState.updated}, erros=${nfReconcileState.errors}`);
    }
    return nfReconcileState;
  }

  async function asaasRequest(method: string, path: string, body?: any): Promise<any> {
  const apiKey = getApiKey();
  const url = `${ASAAS_API_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "access_token": apiKey,
    "User-Agent": "TorresVP/1.0",
  };

  const opts: RequestInit = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  const text = await resp.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { rawText: text }; }

  if (!resp.ok) {
    const errMsg = data?.errors?.[0]?.description || data?.message || `Asaas API error ${resp.status}`;
    throw new Error(errMsg);
  }
  return data;
}

export async function getAsaasBalance(): Promise<{ connected: boolean; balance?: number; saldoAtual?: number; saldoAReceber?: number; message?: string }> {
  try {
    if (!process.env.ASAAS_API_KEY) {
      return { connected: false, message: "ASAAS_API_KEY não configurada" };
    }
    const result = await asaasRequest("GET", "/finance/balance");
    const saldoAtual = Number(result?.balance ?? result?.currentBalance ?? 0);
    let saldoAReceber = 0;
    try {
      const stats = await asaasRequest("GET", "/finance/payment/statistics");
      saldoAReceber = Number(stats?.value ?? stats?.totalValue ?? stats?.netValue ?? 0);
    } catch {
      saldoAReceber = Number(result?.receivableBalance ?? result?.totalReceivable ?? 0);
    }
    const balance = saldoAtual + saldoAReceber;
    return { connected: true, balance, saldoAtual, saldoAReceber };
  } catch (err: any) {
    return { connected: false, message: err?.message || "Erro ao consultar saldo Asaas" };
  }
}

async function ensureInvoicesTable() {
  try {
    await supabaseAdmin.rpc("exec_sql", {
      query: `CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        client_name TEXT NOT NULL,
        client_cpf_cnpj TEXT,
        asaas_customer_id TEXT,
        asaas_payment_id TEXT,
        service_order_id INTEGER,
        description TEXT NOT NULL,
        value DECIMAL(12,2) NOT NULL,
        net_value DECIMAL(12,2),
        due_date TEXT NOT NULL,
        billing_type TEXT NOT NULL DEFAULT 'BOLETO',
        status TEXT NOT NULL DEFAULT 'PENDING',
        invoice_url TEXT,
        bank_slip_url TEXT,
        pix_qr_code TEXT,
        pix_copia_e_cola TEXT,
        payment_date TEXT,
        external_reference TEXT,
        notes TEXT,
        nfse_url TEXT,
        nfse_status TEXT,
        nfse_number TEXT,
        nf_anexo_url TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_url TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_status TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_number TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nf_anexo_url TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent_to TEXT;`
    });
  } catch (e: any) {
    console.log("[asaas] ensureInvoicesTable via direct query fallback");
    const { error } = await supabaseAdmin.from("invoices").select("id").limit(1);
    if (error && error.code === "42P01") {
      console.error("[asaas] invoices table does not exist, create it manually in Supabase");
    }
  }
}

async function findOrCreateAsaasCustomer(name: string, cpfCnpj: string, email?: string, phone?: string, address?: string, city?: string, state?: string, zip?: string): Promise<string> {
  const cleanDoc = cpfCnpj.replace(/[^\d]/g, "");
  if (!cleanDoc) throw new Error("CPF/CNPJ é obrigatório para criar cobrança no Asaas");

  function parseAddress(raw?: string) {
    if (!raw) return {};
    const parts = raw.split(",").map(s => s.trim());
    const street = parts[0] || "";
    const number = parts[1] || "S/N";
    const complement = parts.slice(2).join(", ") || undefined;
    return { address: street, addressNumber: number, complement };
  }

  try {
    const search = await asaasRequest("GET", `/customers?cpfCnpj=${cleanDoc}`);
    if (search.data && search.data.length > 0) {
      const existing = search.data[0];
      const updatePayload: any = {};
      if (!existing.email && email) {
        const emails = email.split(/[;,]\s*/);
        updatePayload.email = emails[0].trim();
        const additionalEmails = emails.slice(1).map((e: string) => e.trim()).join(",");
        if (additionalEmails) updatePayload.additionalEmails = additionalEmails;
        updatePayload.notificationDisabled = true;
      }
      if (!existing.addressNumber && address) {
        const parsed = parseAddress(address);
        Object.assign(updatePayload, parsed);
        if (city) updatePayload.cityName = city;
        if (state) updatePayload.state = state;
        if (zip) updatePayload.postalCode = zip.replace(/[^\d]/g, "");
      }
      if (Object.keys(updatePayload).length > 0) {
        try {
          await asaasRequest("PUT", `/customers/${existing.id}`, updatePayload);
          console.log(`[asaas] Customer ${existing.id} atualizado: ${Object.keys(updatePayload).join(", ")}`);
        } catch (e: any) {
          console.log(`[asaas] Falha ao atualizar customer: ${e.message}`);
        }
      }
      return existing.id;
    }
  } catch {}

  const emails = (email || "").split(/[;,]\s*/);
  const primaryEmail = emails[0]?.trim() || undefined;
  const additionalEmails = emails.slice(1).map((e: string) => e.trim()).join(",") || undefined;

  const parsed = parseAddress(address);
  const customerPayload: any = {
    name,
    cpfCnpj: cleanDoc,
    notificationDisabled: true,
    ...parsed,
  };
  if (primaryEmail) customerPayload.email = primaryEmail;
  if (additionalEmails) customerPayload.additionalEmails = additionalEmails;
  if (phone) customerPayload.mobilePhone = phone.replace(/[^\d]/g, "");
  if (city) customerPayload.cityName = city;
  if (state) customerPayload.state = state;
  if (zip) customerPayload.postalCode = zip.replace(/[^\d]/g, "");

  const customer = await asaasRequest("POST", "/customers", customerPayload);
  return customer.id;
}

export function registerAsaasRoutes(app: Express) {
  ensureInvoicesTable().catch(e => console.log("[asaas] table check:", e.message));

  app.get("/api/asaas/status", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const hasKey = !!process.env.ASAAS_API_KEY;
      if (!hasKey) {
        return res.json({ connected: false, message: "ASAAS_API_KEY não configurada" });
      }
      const result = await asaasRequest("GET", "/finance/balance");
      res.json({ connected: true, balance: result });
    } catch (err: any) {
      res.json({ connected: false, message: err.message });
    }
  });

  app.get("/api/asaas/customers", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const q = req.query.q as string || "";
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 20;
      let path = `/customers?offset=${offset}&limit=${limit}`;
      if (q) path += `&name=${encodeURIComponent(q)}`;
      const data = await asaasRequest("GET", path);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const clientId = req.query.clientId as string;
      const month = req.query.month as string;

      let query = supabaseAdmin.from("invoices").select("*").order("created_at", { ascending: false });

      if (status && status !== "ALL") {
        query = query.eq("status", status);
      }
      if (clientId) {
        query = query.eq("client_id", parseInt(clientId));
      }
      if (month) {
        query = query.gte("due_date", `${month}-01`).lte("due_date", `${month}-31`);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      const invoices = data || [];

      if (process.env.ASAAS_API_KEY && invoices.length > 0) {
        const toSync = invoices.filter(inv =>
          inv.asaas_payment_id &&
          ["PENDING", "CONFIRMED", "OVERDUE"].includes(inv.status) &&
          (!inv.updated_at || Date.now() - new Date(inv.updated_at).getTime() > 5 * 60 * 1000)
        );
        if (toSync.length > 0) {
          (async () => {
            for (const inv of toSync) {
              try {
                const payment = await asaasRequest("GET", `/payments/${inv.asaas_payment_id}`);
                const upd: Record<string, any> = { updated_at: new Date().toISOString() };
                if (payment.status && payment.status !== inv.status) upd.status = payment.status;
                if (payment.value || payment.netValue) upd.net_value = payment.value || payment.netValue;
                if (payment.invoiceUrl) upd.invoice_url = payment.invoiceUrl;
                if (payment.paymentDate) upd.payment_date = payment.paymentDate;
                if (Object.keys(upd).length > 1) {
                  await supabaseAdmin.from("invoices").update(upd).eq("id", inv.id);
                  console.log(`[asaas] Auto-sync invoice #${inv.id}: ${inv.status} → ${upd.status || inv.status}`);
                }
              } catch (e: any) {
                console.log(`[asaas] Auto-sync error invoice #${inv.id}: ${e.message}`);
              }
            }
          })();
        }
      }

      res.json(invoices);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { clientName, clientCpfCnpj, clientId, serviceOrderId, description, value, dueDate, billingType, notes, sendToAsaas, clientEmail: bodyClientEmail } = req.body;

      if (!clientName || !value || !dueDate || !description) {
        return res.status(400).json({ message: "Campos obrigatórios: clientName, value, dueDate, description" });
      }

      if (serviceOrderId) {
        const { data: existingInvoice } = await supabaseAdmin.from("invoices")
          .select("id, asaas_payment_id, status")
          .eq("service_order_id", serviceOrderId)
          .in("status", ["PENDING", "CONFIRMED", "RECEIVED", "OVERDUE"])
          .limit(1);
        if (existingInvoice?.length) {
          return res.status(409).json({
            message: `Já existe fatura ativa (ID ${existingInvoice[0].id}) para esta OS. Cancele-a primeiro se deseja gerar outra.`,
            existingInvoiceId: existingInvoice[0].id,
          });
        }
      }

      let asaasCustomerId: string | null = null;
      let asaasPaymentId: string | null = null;
      let invoiceUrl: string | null = null;
      let bankSlipUrl: string | null = null;
      let pixQrCode: string | null = null;
      let pixCopiaECola: string | null = null;
      let status = "PENDING";

      let clientEmail: string | undefined = bodyClientEmail || undefined;
      let clientPhone: string | undefined;
      let clientAddress: string | undefined;
      let clientCity: string | undefined;
      let clientState: string | undefined;
      let clientZip: string | undefined;
      if (clientId) {
        const { data: cliInfo } = await supabaseAdmin.from("clients").select("email, email_financeiro, phone, address, city, state, zip").eq("id", clientId).single();
        if (!clientEmail) clientEmail = cliInfo?.email_financeiro || cliInfo?.email || undefined;
        clientPhone = cliInfo?.phone || undefined;
        clientAddress = cliInfo?.address || undefined;
        clientCity = cliInfo?.city || undefined;
        clientState = cliInfo?.state || undefined;
        clientZip = cliInfo?.zip || undefined;
      }

      if (sendToAsaas && process.env.ASAAS_API_KEY) {
        asaasCustomerId = await findOrCreateAsaasCustomer(clientName, clientCpfCnpj || "", clientEmail, clientPhone, clientAddress, clientCity, clientState, clientZip);

        let emiteNf = false;
        let retemInss = false;
        let inssAliquota = 11;
        if (clientId) {
          const { data: cliData } = await supabaseAdmin.from("clients").select("emite_nf, retem_inss, inss_aliquota").eq("id", clientId).single();
          emiteNf = cliData?.emite_nf === true;
          retemInss = cliData?.retem_inss === true;
          inssAliquota = Number(cliData?.inss_aliquota ?? 11);
        }

        const parsedValue = parseFloat(value);
        if (!parsedValue || parsedValue <= 0) {
          return res.status(400).json({ message: "Valor da cobrança deve ser maior que R$ 0,00. OS recusada/cancelada não pode gerar cobrança." });
        }

        const paymentPayload: any = {
          customer: asaasCustomerId,
          billingType: billingType || "BOLETO",
          value: parsedValue,
          dueDate,
          description,
          externalReference: serviceOrderId ? `OS-${serviceOrderId}` : undefined,
          notificationDisabled: true,
        };
        if (emiteNf) {
          paymentPayload.postalService = false;
          paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL} - Atividades de Vigilância e Segurança Privada`;
        }

        try {
          const payment = await asaasRequest("POST", "/payments", paymentPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          status = payment.status || "PENDING";

          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {}
          }

          if (asaasPaymentId && emiteNf) {
            try {
              const nfResult = await emitNfseImmediate({
                paymentId: asaasPaymentId,
                value: parsedValue,
                description: description || DESCRICAO_SERVICO_FIXA,
                retemInss,
                inssAliquota,
              });
              console.log(`[asaas] NFS-e emitida imediatamente para payment ${asaasPaymentId}: id=${nfResult.id}, status=${nfResult.status}`);
            } catch (nfErr: any) {
              console.log(`[asaas] NFS-e auto-emission (individual) non-blocking: ${nfErr.message}`);
            }
          } else if (asaasPaymentId && !emiteNf) {
            console.log(`[asaas] NFS-e NÃO emitida (cliente ${clientId} com emite_nf=false). Apenas boleto/cobrança gerada.`);
          }

          await logSystemAudit({
            userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
            action: "ASAAS_COBRANCA_GERADA", targetId: asaasPaymentId, targetType: "invoice",
            details: `Cobrança ${billingType || "BOLETO"} R$${parseFloat(value).toFixed(2)} gerada para ${clientName}. Asaas ID: ${asaasPaymentId}`,
            ipAddress: (req as any).ip,
          });
        } catch (asaasErr: any) {
          await logSystemAudit({
            userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
            action: "ASAAS_COBRANCA_ERRO", targetId: serviceOrderId ? String(serviceOrderId) : "manual", targetType: "invoice",
            details: `ERRO ao gerar cobrança para ${clientName}: ${asaasErr.message}`,
            ipAddress: (req as any).ip,
          });
          throw asaasErr;
        }
      }

      const userId = (req as any).user?.id;

      let inssAliquotaPersist: number | null = null;
      let inssValorPersist: number | null = null;
      if (clientId) {
        const { data: cliInss } = await supabaseAdmin.from("clients").select("retem_inss, inss_aliquota").eq("id", clientId).single();
        if (cliInss?.retem_inss === true) {
          inssAliquotaPersist = Number(cliInss.inss_aliquota ?? 11);
          inssValorPersist = Number((parseFloat(value) * inssAliquotaPersist / 100).toFixed(2));
        }
      }

      const { data, error } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId || null,
        client_name: clientName,
        client_cpf_cnpj: clientCpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        service_order_id: serviceOrderId || null,
        description,
        value: parseFloat(value),
        due_date: dueDate,
        billing_type: billingType || "BOLETO",
        status,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        notes: notes || null,
        external_reference: serviceOrderId ? `OS-${serviceOrderId}` : null,
        valor_inss_retido: inssValorPersist,
        inss_aliquota: inssAliquotaPersist,
        provider_cnpj: TORRES_CNPJ,
        created_by: userId,
      }).select().single();

      if (error) {
        if (asaasPaymentId) {
          try {
            await asaasRequest("DELETE", `/payments/${asaasPaymentId}`);
            console.error(`[Asaas] Cobrança ${asaasPaymentId} cancelada (falha no DB: ${error.message})`);
            await logSystemAudit({
              userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
              action: "ASAAS_COBRANCA_COMPENSACAO", targetId: asaasPaymentId, targetType: "invoice",
              details: `Cobrança ${asaasPaymentId} cancelada automaticamente após falha no DB: ${error.message}`,
              ipAddress: (req as any).ip,
            });
          } catch (cancelErr: any) {
            console.error(`[Asaas] CRÍTICO: Falha ao cancelar cobrança órfã ${asaasPaymentId}: ${cancelErr.message}`);
          }
        }
        throw error;
      }

      // [Política] E-mail de faturamento NÃO é enviado automaticamente na criação.
      // Será disparado somente quando a NF for anexada (POST /api/invoices/:id/attach-nf).
      console.log(`[billing-email] Fatura #${data.id} criada — aguardando anexo de NF para envio.`);

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const user = (req as any).user;

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      if (updates.status === "CANCELLED" && user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode cancelar faturas." });
      }

      if (updates.status === "CANCELLED" && existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Cancel payment error:", e.message);
        }
      }

      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/attach-nf", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { nf_anexo_url } = req.body;
      if (!nf_anexo_url) return res.status(400).json({ message: "URL do anexo da NF é obrigatória" });

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ nf_anexo_url, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const user = (req as any).user;
      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "ANEXAR_NF", targetId: String(id), targetType: "invoice",
        details: `NF anexada à fatura #${id}`,
        ipAddress: (req as any).ip,
      });

      // [Política] E-mail de faturamento é enviado APENAS após anexar a NF.
      // Se já foi enviado antes (re-anexo), não envia novamente.
      if (!existing.email_sent) {
        let clientEmail = "";
        if (existing.client_id) {
          const { data: cli } = await supabaseAdmin.from("clients").select("email, email_financeiro").eq("id", existing.client_id).single();
          clientEmail = cli?.email_financeiro || cli?.email || "";
        }
        if (clientEmail) {
          sendBillingEmail({
            id: existing.id,
            client_name: existing.client_name,
            value: Number(existing.value),
            due_date: existing.due_date,
            billing_type: existing.billing_type,
            description: existing.description,
            invoice_url: existing.invoice_url,
            bank_slip_url: existing.bank_slip_url,
            nfse_url: nf_anexo_url || existing.nfse_url || null,
            pix_copia_e_cola: existing.pix_copia_e_cola,
            service_order_id: existing.service_order_id || null,
          }, clientEmail).catch(e => console.error(`[billing-email] async error após attach-nf: ${e.message}`));
          console.log(`[billing-email] Disparando envio para ${clientEmail} (fatura #${id} — NF anexada)`);
        } else {
          console.log(`[billing-email] Fatura #${id}: NF anexada porém cliente sem e-mail cadastrado.`);
        }
      } else {
        console.log(`[billing-email] Fatura #${id}: NF re-anexada — e-mail já havia sido enviado, não reenvia.`);
      }

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id/attach-nf", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ nf_anexo_url: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/resend-email", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });

      let email = req.body.email || "";
      if (!email && invoice.client_id) {
        const { data: cli } = await supabaseAdmin.from("clients").select("email, email_financeiro").eq("id", invoice.client_id).single();
        email = cli?.email_financeiro || cli?.email || "";
      }
      if (!email) return res.status(400).json({ message: "E-mail do cliente não encontrado. Informe no campo 'email'." });

      await sendBillingEmail({
        id: invoice.id,
        client_name: invoice.client_name,
        value: invoice.value,
        due_date: invoice.due_date,
        billing_type: invoice.billing_type,
        description: invoice.description,
        invoice_url: invoice.invoice_url,
        bank_slip_url: invoice.bank_slip_url,
        nfse_url: invoice.nfse_url,
        pix_copia_e_cola: invoice.pix_copia_e_cola,
        service_order_id: invoice.service_order_id,
      }, email);

      res.json({ success: true, message: `E-mail enviado para ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;

      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      if (existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }

      const { error } = await supabaseAdmin.from("invoices").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/sync", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      const payment = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);

      const updates: Record<string, any> = {
        status: payment.status,
        net_value: payment.value || payment.netValue,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
        updated_at: new Date().toISOString(),
      };
      if (payment.paymentDate) updates.payment_date = payment.paymentDate;

      if (invoice.nfse_number && invoice.nfse_number.startsWith("inv_")) {
        try {
          const nfData = await asaasRequest("GET", `/invoices/${invoice.nfse_number}`);
          if (nfData) {
            updates.nfse_status = nfData.status || null;
            if (nfData.pdfUrl) updates.nfse_url = nfData.pdfUrl;
            else if (nfData.xmlUrl) updates.nfse_url = nfData.xmlUrl;
            if (nfData.number) updates.nfse_number = String(nfData.number);
            console.log(`[asaas] NFS-e sync via /invoices: status=${nfData.status}, number=${nfData.number || 'N/A'}, pdfUrl=${nfData.pdfUrl || 'N/A'}`);
          }
        } catch (nfErr: any) {
          console.log(`[asaas] NFS-e /invoices fetch (non-blocking): ${nfErr.message}`);
        }
      } else {
        try {
          const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
          if (fiscalInfo) {
            updates.nfse_status = fiscalInfo.status || null;
            if (fiscalInfo.externalUrl) updates.nfse_url = fiscalInfo.externalUrl;
            if (fiscalInfo.number) updates.nfse_number = String(fiscalInfo.number);
            else if (fiscalInfo.rpsNumber) updates.nfse_number = `RPS-${fiscalInfo.rpsNumber}`;
            console.log(`[asaas] NFS-e sync via fiscalInfo: status=${fiscalInfo.status}, number=${fiscalInfo.number || fiscalInfo.rpsNumber || 'N/A'}, url=${fiscalInfo.externalUrl || 'N/A'}`);
          }
        } catch (nfErr: any) {
          console.log(`[asaas] NFS-e fiscalInfo fetch (non-blocking): ${nfErr.message}`);
        }
      }

      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/emit-nfse", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas. A NFS-e só pode ser emitida para cobranças integradas." });

      const cpfCnpj = invoice.client_cpf_cnpj || "";
      if (!cpfCnpj) return res.status(400).json({ message: "CPF/CNPJ do cliente não informado. Atualize o cadastro do cliente." });

      let result: { id: string; status: string; number?: string };
      try {
        result = await emitNfseImmediate({
          paymentId: invoice.asaas_payment_id,
          value: parseFloat(invoice.value),
          description: invoice.description || DESCRICAO_SERVICO_FIXA,
        });
      } catch (emitErr: any) {
        throw new Error(`Erro ao emitir NFS-e: ${emitErr.message}`);
      }

      const updates: Record<string, any> = {
        nfse_status: result.status || "AUTHORIZED",
        updated_at: new Date().toISOString(),
      };
      if (result.number) updates.nfse_number = String(result.number);
      else if (result.id) updates.nfse_number = String(result.id);

      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;

      const user = (req as any).user;
      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "EMITIR_NFSE", targetId: invoice.asaas_payment_id, targetType: "invoice",
        details: `NFS-e emitida imediatamente para fatura #${id} (${invoice.asaas_payment_id}). Status: ${result.status}`,
        ipAddress: (req as any).ip,
      });

      console.log(`[asaas] NFS-e emitida imediatamente: payment=${invoice.asaas_payment_id}, status=${result.status}, id=${result.id}`);
      res.json({ ...data, nfseResult: result });
    } catch (err: any) {
      console.error("[asaas] Erro NFS-e:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/cancel-nfse", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode cancelar Notas Fiscais." });
      }

      const id = parseInt(req.params.id);
      const localOnly = !!(req.body as any)?.localOnly;
      const reason = (req.body as any)?.reason ? String((req.body as any).reason).slice(0, 500) : null;

      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.nfse_status) return res.status(400).json({ message: "Esta fatura não possui NFS-e emitida." });

      let cancelStatus = "CANCELED";
      let cancelMessage = "NFS-e cancelada localmente.";

      if (!localOnly) {
        let nfId: string | null = null;
        if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
          nfId = String(invoice.nfse_number);
        } else if (invoice.asaas_payment_id) {
          try {
            const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
            nfId = fiscalInfo?.id || null;
          } catch {}
        }

        if (nfId) {
          try {
            const cancelResult = await asaasRequest("POST", `/invoices/${nfId}/cancel`);
            cancelStatus = cancelResult?.status || "CANCELED";
            cancelMessage = `NFS-e ${nfId} cancelada no Asaas (status: ${cancelStatus}).`;
            console.log(`[asaas] NFS-e ${nfId} cancelada com sucesso. Status: ${cancelStatus}`);
          } catch (cancelErr: any) {
            console.error(`[asaas] Erro ao cancelar NFS-e ${nfId}: ${cancelErr.message}`);
            return res.status(500).json({ message: `Erro ao cancelar NFS-e no Asaas: ${cancelErr.message}. Se a NF já foi cancelada na prefeitura, marque como cancelamento local.` });
          }
        } else {
          console.log(`[asaas] NFS-e da fatura #${id} sem ID Asaas. Marcando como cancelada localmente.`);
        }
      } else {
        cancelMessage = `NFS-e marcada como cancelada localmente (já cancelada externamente)${reason ? `: ${reason}` : ""}.`;
        console.log(`[asaas] NFS-e da fatura #${id} marcada como cancelada localmente. ${reason || ""}`);
      }

      const { data: updated, error: updErr } = await supabaseAdmin.from("invoices").update({
        nfse_status: cancelStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (updErr) throw updErr;

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "CANCELAR_NFSE", targetId: String(id), targetType: "invoice",
        details: `NFS-e da fatura #${id} cancelada por ${user?.name || "diretoria"}. ${cancelMessage}`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, message: cancelMessage, invoice: updated });
    } catch (err: any) {
      console.error("[asaas] Erro ao cancelar NFS-e:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/emitir", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { dueDate, billingType } = req.body;

      if (!dueDate) return res.status(400).json({ message: "Data de vencimento é obrigatória." });

      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada." });
      if (invoice.status !== "AGUARDANDO_FATURAMENTO") {
        return res.status(400).json({ message: `Fatura não está aguardando faturamento. Status atual: ${invoice.status}` });
      }

      const clientId = invoice.client_id;
      if (!clientId) return res.status(400).json({ message: "Fatura sem cliente vinculado." });

      const { data: clientData } = await supabaseAdmin.from("clients").select("cnpj, cpf, emite_nf, address, city, state, zip, email, email_financeiro, phone, name").eq("id", clientId).single();
      const cpfCnpj = clientData?.cnpj || clientData?.cpf || "";
      if (!cpfCnpj) return res.status(400).json({ message: "Cliente sem CPF/CNPJ cadastrado. Atualize o cadastro primeiro." });

      const clientName = clientData?.name || invoice.client_name;
      const clientEmail = clientData?.email_financeiro || clientData?.email || undefined;
      const clientPhone = clientData?.phone || undefined;
      const emiteNf = clientData?.emite_nf === true;
      const totalValue = parseFloat(invoice.value);

      if (totalValue <= 0) return res.status(400).json({ message: "Valor da fatura é R$ 0,00." });

      if (!process.env.ASAAS_API_KEY) return res.status(400).json({ message: "Asaas não configurado (ASAAS_API_KEY)." });

      const asaasCustomerId = await findOrCreateAsaasCustomer(
        clientName, cpfCnpj, clientEmail, clientPhone,
        clientData?.address, clientData?.city, clientData?.state, clientData?.zip
      );

      const paymentPayload: any = {
        customer: asaasCustomerId,
        billingType: billingType || "BOLETO",
        value: totalValue,
        dueDate,
        description: (invoice.description || `Escolta Armada — ${clientName}`).substring(0, 500),
        externalReference: invoice.external_reference || `FATURA-${id}`,
        notificationDisabled: true,
      };

      if (emiteNf) {
        paymentPayload.postalService = false;
        paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}.`.substring(0, 500);
      }

      console.log(`[asaas] Emitindo fatura #${id} para ${clientName}: R$${totalValue.toFixed(2)} venc=${dueDate}`);
      const payment = await asaasRequest("POST", "/payments", paymentPayload);

      const updates: any = {
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: payment.id,
        client_cpf_cnpj: cpfCnpj,
        due_date: dueDate,
        billing_type: billingType || "BOLETO",
        status: payment.status || "PENDING",
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
        updated_at: new Date().toISOString(),
      };

      if (billingType === "PIX" || billingType === "UNDEFINED") {
        try {
          const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
          updates.pix_qr_code = pixData.encodedImage;
          updates.pix_copia_e_cola = pixData.payload;
        } catch {}
      }

      if (emiteNf) {
        try {
          const nfResult = await emitNfseImmediate({
            paymentId: payment.id,
            value: totalValue,
            description: invoice.description || DESCRICAO_SERVICO_FIXA,
          });
          updates.nfse_status = nfResult.status === "AUTHORIZED" || nfResult.status === "SYNCHRONIZED" ? "AUTHORIZED" : nfResult.status;
          if (nfResult.number) updates.nfse_number = String(nfResult.number);
          console.log(`[asaas] NFS-e emitida para fatura #${id}: ${nfResult.status}`);
        } catch (nfErr: any) {
          console.error(`[asaas] NFS-e falhou para fatura #${id}: ${nfErr.message}`);
          updates.nfse_status = "ERRO";
        }
      }

      const { data: updated, error: updateErr } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (updateErr) throw updateErr;

      const billingIdsMatch = (invoice.notes || "").match(/Billing IDs: (.+)$/);
      if (billingIdsMatch) {
        const bIds = billingIdsMatch[1].split(",").map((s: string) => s.trim());
        await supabaseAdmin.from("escort_billings").update({
          status: "FATURADO",
          invoice_id: id,
          faturado_em: new Date().toISOString(),
          faturado_por: (req as any).user?.name || "Admin",
        }).in("id", bIds);
        console.log(`[asaas] ${bIds.length} billing(s) marcados como FATURADO`);
      }

      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "EMITIR_FATURA_APROVADA", targetId: String(id), targetType: "invoice",
        details: `Fatura #${id} emitida via Asaas. ${clientName} R$${totalValue.toFixed(2)} venc=${dueDate}. Asaas=${payment.id}`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, message: `Boleto gerado${emiteNf ? " + NF-e emitida" : ""}. Asaas: ${payment.id}`, invoice: updated });
    } catch (err: any) {
      console.error("[asaas] Erro ao emitir fatura aprovada:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/resend", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      await asaasRequest("POST", `/payments/${invoice.asaas_payment_id}/resendNotification`, {});

      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "ASAAS_NOTIFICACAO_REENVIADA", targetId: invoice.asaas_payment_id, targetType: "invoice",
        details: `Notificação reenviada para cobrança ${invoice.asaas_payment_id} (R$${parseFloat(invoice.value).toFixed(2)}) às ${now}`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, message: "Notificação reenviada", timestamp: now });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices/:id/notifications", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      let notifications: any[] = [];
      let paymentDetails: any = null;

      try {
        paymentDetails = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
      } catch {}

      try {
        const notifData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/notifications`);
        if (notifData?.data) notifications = notifData.data;
        else if (Array.isArray(notifData)) notifications = notifData;
      } catch {}

      const { data: auditLogs } = await supabaseAdmin
        .from("system_audit_log")
        .select("action, details, created_at")
        .or(`target_id.eq.${invoice.asaas_payment_id},and(target_type.eq.invoice,target_id.eq.${invoice.id})`)
        .order("created_at", { ascending: true })
        .limit(20);

      const timeline: any[] = [];

      if (invoice.created_at) {
        timeline.push({
          type: "created",
          icon: "receipt",
          label: "Cobrança criada no Asaas",
          detail: `${invoice.billing_type} • R$ ${parseFloat(invoice.value).toFixed(2)}`,
          timestamp: invoice.created_at,
        });
      }

      if (auditLogs) {
        for (const log of auditLogs) {
          if (log.action === "ASAAS_COBRANCA_GERADA") {
            continue;
          }
          if (log.action === "ASAAS_NOTIFICACAO_REENVIADA") {
            timeline.push({
              type: "resent",
              icon: "send",
              label: "Notificação reenviada manualmente",
              detail: log.details,
              timestamp: log.created_at,
            });
          }
          if (log.action?.startsWith("ASAAS_WEBHOOK_")) {
            const evtName = log.action.replace("ASAAS_WEBHOOK_", "");
            timeline.push({
              type: "webhook",
              icon: "webhook",
              label: `Evento Asaas: ${evtName}`,
              detail: log.details,
              timestamp: log.created_at,
            });
          }
          if (log.action === "EMITIR_NFSE") {
            timeline.push({
              type: "sent",
              icon: "receipt",
              label: "NFS-e solicitada ao Asaas",
              detail: log.details,
              timestamp: log.created_at,
            });
          }
          if (log.action === "CANCELAR_NFSE") {
            timeline.push({
              type: "error",
              icon: "alert",
              label: "NFS-e cancelada (Diretoria)",
              detail: log.details,
              timestamp: log.created_at,
            });
          }
          if (log.action === "ANEXAR_NF") {
            timeline.push({
              type: "resent",
              icon: "receipt",
              label: "NF anexada manualmente",
              detail: log.details,
              timestamp: log.created_at,
            });
          }
        }
      }

      for (const n of notifications) {
        const eventLabel = n.event === "PAYMENT_CREATED" ? "E-mail de cobrança enviado"
          : n.event === "PAYMENT_RECEIVED" ? "E-mail de confirmação de pagamento"
          : n.event === "PAYMENT_OVERDUE" ? "E-mail de cobrança vencida"
          : n.event === "PAYMENT_DUEDATE_WARNING" ? "E-mail de lembrete de vencimento"
          : `Notificação: ${n.event || "desconhecido"}`;

        timeline.push({
          type: n.status === "FAILED" || n.status === "BOUNCED" ? "error" : n.status === "READ" ? "read" : "sent",
          icon: n.status === "FAILED" || n.status === "BOUNCED" ? "alert" : n.status === "READ" ? "eye" : "mail",
          label: eventLabel,
          detail: n.emailAddress ? `Para: ${n.emailAddress}` : undefined,
          status: n.status,
          timestamp: n.scheduleDate || n.dateCreated,
        });
      }

      const emailStatus = paymentDetails?.lastInvoiceViewedDate ? "VIEWED"
        : notifications.some((n: any) => n.status === "BOUNCED" || n.status === "FAILED") ? "BOUNCE"
        : notifications.some((n: any) => n.status === "READ") ? "READ"
        : notifications.some((n: any) => n.status === "SENT" || n.status === "DELIVERED") ? "SENT"
        : notifications.length > 0 ? "QUEUED"
        : "UNKNOWN";

      const customerEmail = paymentDetails?.customer?.email || null;

      timeline.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

      res.json({
        emailStatus,
        customerEmail,
        lastViewedDate: paymentDetails?.lastInvoiceViewedDate || null,
        notifications,
        timeline,
        paymentStatus: paymentDetails?.status,
      });
    } catch (err: any) {
      console.error("[asaas] notifications error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices/:id/nfse-pdf", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).send("Fatura não encontrada");

      let pdfUrl: string | null = invoice.nfse_url || null;

      let nfId: string | null = null;
      if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
        nfId = String(invoice.nfse_number);
      } else if (invoice.asaas_payment_id) {
        try {
          const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
          nfId = fiscalInfo?.id || null;
          if (!pdfUrl && fiscalInfo?.pdfUrl) pdfUrl = fiscalInfo.pdfUrl;
        } catch {}
      }

      if (!pdfUrl && nfId) {
        try {
          const nfDetails = await asaasRequest("GET", `/invoices/${nfId}`);
          pdfUrl = nfDetails?.pdfUrl || nfDetails?.pdf || null;
        } catch {}
      }

      if (!pdfUrl) return res.status(404).send("PDF da NFS-e indisponível");

      const upstream = await fetch(pdfUrl, { redirect: "follow" });
      if (!upstream.ok) return res.status(502).send("Falha ao obter PDF do Asaas");

      const ct = (upstream.headers.get("content-type") || "").toLowerCase();
      let buf = Buffer.from(await upstream.arrayBuffer());
      const isPdf = ct.includes("pdf") || (buf.length >= 4 && buf.slice(0, 4).toString() === "%PDF");

      if (isPdf) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="nfse-${id}.pdf"`);
      } else {
        let html = buf.toString("utf-8");
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
        html = html.replace(/\son[a-z]+="[^"]*"/gi, "");
        html = html.replace(/\son[a-z]+='[^']*'/gi, "");
        if (!/<base\s/i.test(html)) {
          const base = `<base href="${new URL(pdfUrl).origin}/" target="_blank">`;
          html = html.replace(/<head[^>]*>/i, m => `${m}${base}`);
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        buf = Buffer.from(html, "utf-8");
      }
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("ETag");
      res.removeHeader("Last-Modified");
      res.send(buf);
    } catch (err: any) {
      console.error("[asaas] nfse-pdf error:", err.message);
      res.status(500).send(err.message);
    }
  });

  app.get("/api/invoices/:id/pix", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      const pixData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/pixQrCode`);

      await supabaseAdmin.from("invoices").update({
        pix_qr_code: pixData.encodedImage,
        pix_copia_e_cola: pixData.payload,
      }).eq("id", id);

      res.json({ qrCode: pixData.encodedImage, copiaECola: pixData.payload });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/asaas/webhook", async (req: Request, res: Response) => {
    try {
      const webhookToken = req.headers["asaas-access-token"] as string | undefined;
      const asaasApiKey = process.env.ASAAS_API_KEY;

      if (asaasApiKey && webhookToken !== asaasApiKey) {
        console.warn(`[asaas] Webhook REJEITADO: token inválido de IP ${(req as any).ip}`);
        await logSystemAudit({
          userId: null, userName: "SISTEMA", userRole: "system",
          action: "ASAAS_WEBHOOK_REJEITADO", targetId: "N/A", targetType: "security",
          details: `Webhook rejeitado por token inválido. IP: ${(req as any).ip}. Headers recebidos: ${Object.keys(req.headers).join(", ")}`,
          ipAddress: (req as any).ip,
        });
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { event, payment } = req.body;
      console.log(`[asaas] Webhook received: ${event}`);

      if (!payment?.id) return res.json({ received: true });

      const statusMap: Record<string, string> = {
        "PAYMENT_CONFIRMED": "CONFIRMED",
        "PAYMENT_RECEIVED": "RECEIVED",
        "PAYMENT_OVERDUE": "OVERDUE",
        "PAYMENT_DELETED": "CANCELLED",
        "PAYMENT_REFUNDED": "REFUNDED",
        "PAYMENT_UPDATED": payment.status,
      };

      const newStatus = statusMap[event];
      if (!newStatus) return res.json({ received: true });

      const updates: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (payment.paymentDate) updates.payment_date = payment.paymentDate;
      if (payment.value || payment.netValue) updates.net_value = payment.value || payment.netValue;

      const { data: updatedInvoice } = await supabaseAdmin
        .from("invoices")
        .update(updates)
        .eq("asaas_payment_id", payment.id)
        .select("id, client_name, value, service_order_id")
        .single();

      if (updatedInvoice && (newStatus === "CONFIRMED" || newStatus === "RECEIVED")) {
        try {
          await supabaseAdmin
            .from("escort_billings")
            .update({ status: "PAGO", pago_em: new Date().toISOString() })
            .eq("invoice_id", updatedInvoice.id);
        } catch (_e) {}

        try {
          const { createAutoTransaction } = await import("./routes/_helpers");
          await createAutoTransaction({
            description: `Recebimento Asaas - ${updatedInvoice.client_name} (${payment.id})`,
            amount: payment.netValue || updatedInvoice.value,
            type: "INCOME",
            category: "Faturamento",
            origin_type: "invoice",
            origin_id: String(updatedInvoice.id),
          });
        } catch (_e) {}
      }

      await logSystemAudit({
        userId: null, userName: "Asaas Webhook", userRole: "system",
        action: `ASAAS_WEBHOOK_${event}`, targetId: payment.id, targetType: "asaas_payment",
        details: `Payment ${payment.id} → ${newStatus}. Valor: R$${payment.value || 0}. Líquido: R$${payment.netValue || 0}. Data pgto: ${payment.paymentDate || "—"}`,
        ipAddress: (req as any).ip,
      });

      console.log(`[asaas] Webhook: payment ${payment.id} → ${newStatus}`);
      res.json({ received: true });
    } catch (err: any) {
      console.error("[asaas] Webhook error:", err.message);
      res.json({ received: true });
    }
  });

  app.get("/api/asaas/payments", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      let path = `/payments?offset=${offset}&limit=${limit}`;
      if (status) path += `&status=${status}`;
      const data = await asaasRequest("GET", path);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const gerarFaturaLocks = new Map<number, number>();

  app.get("/api/billing-profiles/:clientId", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inválido" });
      const { data, error } = await supabaseAdmin
        .from("customer_billing_profiles")
        .select("*")
        .eq("client_id", clientId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/billing-profiles/:clientId", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inválido" });
      const { label, cnpj, razao_social, is_default } = req.body;
      if (!cnpj || !razao_social) return res.status(400).json({ message: "CNPJ e Razão Social são obrigatórios" });
      const { data, error } = await supabaseAdmin
        .from("customer_billing_profiles")
        .insert({ client_id: clientId, label: label || "", cnpj, razao_social, is_default: is_default || false })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/billing-profiles/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ message: "ID inválido" });
      const { error } = await supabaseAdmin.from("customer_billing_profiles").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/boletim-medicao/gerar-fatura/:clientId", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inválido" });

      const lastCall = gerarFaturaLocks.get(clientId);
      if (lastCall && Date.now() - lastCall < 10000) {
        return res.status(409).json({ message: "Fatura já está sendo gerada para este cliente. Aguarde alguns segundos." });
      }
      gerarFaturaLocks.set(clientId, Date.now());

      const { billingType, sendToAsaas, dueDate, startDate, endDate, expectedTotal, splits } = req.body;
      const user = (req as any).user;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Período obrigatório. Informe startDate e endDate." });
      }

      const fromDate = `${startDate}T00:00:00`;
      const toDate = `${endDate}T23:59:59`;

      let query = supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("client_id", clientId)
        .not("status", "in", '("RECUSADA","CANCELADA","CANCELADO","FATURADA","FATURADO","PAGO","REJEITADA")')
        .gte("data_missao", fromDate)
        .lte("data_missao", toDate);

      const { data: billings, error: billErr } = await query;

      if (billErr) throw billErr;
      if (!billings || billings.length === 0) {
        const { data: allBillings } = await supabaseAdmin
          .from("escort_billings")
          .select("id, status")
          .eq("client_id", clientId)
          .gte("data_missao", fromDate)
          .lte("data_missao", toDate);
        
        const total = allBillings?.length || 0;
        const faturados = allBillings?.filter((b: any) => b.status === "FATURADO" || b.status === "FATURADA").length || 0;
        
        if (faturados > 0) {
          return res.status(400).json({ message: `Todas as ${faturados} OS neste período já foram faturadas. Para gerar nova fatura, exclua a fatura existente primeiro.` });
        }
        return res.status(400).json({ message: `Nenhuma OS faturável no período ${startDate} a ${endDate}. Verifique se existem OS com status "APROVADA" neste período.` });
      }

      console.log(`[asaas] Faturando ${billings.length} OS(s) para cliente ${clientId}. Período: ${startDate} a ${endDate}. Status: ${[...new Set(billings.map(b => b.status))].join(", ")}`);


      const clientName = billings[0].client_name || "Cliente";

      const osDescriptions: string[] = [];
      let totalValue = 0;
      const billingIds: string[] = [];

      for (const b of billings) {
        const acionamento = Number(b.fat_acionamento || 0);
        const horaExtra = Number(b.fat_hora_extra || 0);
        const km = Number(b.fat_km || 0);
        const pedagio = Number(b.despesas_pedagio || 0);
        const receitas = Number(b.receitas_os || 0);
        const fat = acionamento + horaExtra + km + pedagio + receitas;
        totalValue += fat;
        billingIds.push(b.id);

        const osRef = b.boletim_numero || `OS-${b.service_order_id}`;
        const route = [b.origem, b.destino].filter(Boolean).join(" → ");
        const dataMissao = b.data_missao ? new Date(b.data_missao).toLocaleDateString("pt-BR") : "";
        osDescriptions.push(`${osRef} ${dataMissao} ${route} ${fmt(fat)}`.trim());
        console.log(`[billing-audit] ${osRef}: acion=${acionamento} hExtra=${horaExtra} km=${km} ped=${pedagio} rec=${receitas} = ${fat}`);
      }
      console.log(`[billing-audit] TOTAL para fatura: R$${totalValue.toFixed(2)} (${billings.length} OS). Período: ${startDate} a ${endDate}`);
      if (totalValue <= 0) {
        return res.status(400).json({ message: `Valor total é R$0,00. Verifique o Boletim de Medição.` });
      }

      if (expectedTotal && Math.abs(totalValue - Number(expectedTotal)) > 0.01) {
        const msg = `BLOQUEADO: Soma do backend (R$${totalValue.toFixed(2)}) difere do frontend (R$${Number(expectedTotal).toFixed(2)}). Diferença: R$${Math.abs(totalValue - Number(expectedTotal)).toFixed(2)}`;
        console.error(`[billing-audit] ${msg}`);
        return res.status(400).json({ message: msg });
      }

      if (splits && Array.isArray(splits) && splits.length > 0) {
        const splitsSum = splits.reduce((s: number, sp: any) => s + (Number(sp.valor) || 0), 0);
        if (Math.round(splitsSum * 100) > Math.round(totalValue * 100)) {
          gerarFaturaLocks.delete(clientId);
          return res.status(400).json({ message: `BLOQUEADO: Soma das parcelas (R$${splitsSum.toFixed(2)}) excede o valor total aprovado (R$${totalValue.toFixed(2)}).` });
        }
        if (Math.abs(splitsSum - totalValue) > 0.01) {
          gerarFaturaLocks.delete(clientId);
          return res.status(400).json({ message: `BLOQUEADO: Soma das parcelas (R$${splitsSum.toFixed(2)}) não confere com o total (R$${totalValue.toFixed(2)}). Diferença: R$${Math.abs(splitsSum - totalValue).toFixed(2)}.` });
        }
        for (const sp of splits) {
          if (!sp.cnpj || !sp.razao_social) {
            gerarFaturaLocks.delete(clientId);
            return res.status(400).json({ message: "Todos os CNPJs da divisão precisam ter CNPJ e Razão Social preenchidos." });
          }
          if ((Number(sp.valor) || 0) <= 0) {
            gerarFaturaLocks.delete(clientId);
            return res.status(400).json({ message: `Valor inválido para o CNPJ ${sp.razao_social}. Informe um valor maior que zero.` });
          }
        }
        console.log(`[billing-audit] SPLIT detectado: ${splits.length} parcelas. Soma: R$${splitsSum.toFixed(2)}`);
      }

      const now = new Date();
      const invoiceDueDate = dueDate || new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString().split("T")[0];

      const datasOs = billings.map(b => b.data_missao || b.created_at).filter(Boolean).sort();
      const periodoInicio = datasOs[0]?.split("T")[0] || invoiceDueDate;
      const periodoFim = datasOs[datasOs.length - 1]?.split("T")[0] || invoiceDueDate;
      const descricaoFiscal = buildInvoiceDescription(clientName, periodoInicio, periodoFim);
      console.log(`[billing-audit] Detalhamento interno (${billings.length} OS):\n${osDescriptions.join("\n")}`);

      const { data: clientData } = await supabaseAdmin.from("clients").select("cnpj, cpf, emite_nf, retem_inss, inss_aliquota, billing_cycle, address, city, state, zip, email, email_financeiro, phone").eq("id", clientId).single();
      const cpfCnpj = clientData?.cnpj || clientData?.cpf || "";
      const emiteNfConsolidado = clientData?.emite_nf === true;
      const retemInssConsolidado = clientData?.retem_inss === true;
      const inssAliquotaConsolidado = Number(clientData?.inss_aliquota ?? 11);
      const inssValorConsolidado = retemInssConsolidado ? Number((totalValue * inssAliquotaConsolidado / 100).toFixed(2)) : 0;

      if (clientData?.billing_cycle === "quinzenal") {
        const { data: allInPeriod } = await supabaseAdmin
          .from("escort_billings")
          .select("id, status, boletim_numero, service_order_id, data_missao")
          .eq("client_id", clientId)
          .gte("data_missao", fromDate)
          .lte("data_missao", toDate)
          .not("status", "in", '("RECUSADA","CANCELADA","CANCELADO","FATURADA","FATURADO","PAGO","REJEITADA")');
        const blocking = (allInPeriod || []).filter((b: any) =>
          !["APROVADA"].includes(b.status)
        );
        if (blocking.length > 0) {
          gerarFaturaLocks.delete(clientId);
          const osList = blocking.map((b: any) => ({
            id: b.id,
            osRef: b.boletim_numero || `OS-${b.service_order_id}`,
            status: b.status,
            dataMissao: b.data_missao,
          }));
          const refs = osList.map(o => `${o.osRef} (${o.status})`).slice(0, 10).join(", ");
          const extra = osList.length > 10 ? ` +${osList.length - 10} OS` : "";
          return res.status(409).json({
            code: "QUINZENA_INCOMPLETA",
            message: `BLOQUEADO: ${blocking.length} OS desta quinzena ainda NÃO está(ão) aprovada(s) para faturamento. Regularize antes de faturar: ${refs}${extra}.`,
            pendingOs: osList,
            totalPendente: blocking.length,
            periodo: { startDate, endDate },
          });
        }
        console.log(`[asaas] Validação quinzenal OK para cliente ${clientId}: 0 OS pendentes no período ${startDate} a ${endDate}.`);
      }
      const clientEmailConsolidado = clientData?.email_financeiro || clientData?.email || undefined;
      const clientPhoneConsolidado = clientData?.phone || undefined;

      // ============================================================
      // SPLIT MODE: cria uma invoice separada por CNPJ
      // ============================================================
      if (splits && Array.isArray(splits) && splits.length > 1) {
        console.log(`[billing] SPLIT MODE: ${splits.length} faturas para ${splits.length} CNPJs`);
        const createdInvoices: any[] = [];

        for (let idx = 0; idx < splits.length; idx++) {
          const sp = splits[idx];
          const splitValue = Number(sp.valor);
          const splitCnpj = String(sp.cnpj || "").replace(/\D/g, "");
          const splitName = sp.razao_social || clientName;
          const splitDescricao = `Ref. a Serviço de Escolta Armada Caracterizada - Período: ${periodoInicio} a ${periodoFim} (${splitName})`;

          let spAsaasCustomerId: string | null = null;
          let spAsaasPaymentId: string | null = null;
          let spInvoiceUrl: string | null = null;
          let spBankSlipUrl: string | null = null;
          let spPixQrCode: string | null = null;
          let spPixCopiaECola: string | null = null;
          let spInvoiceStatus = "PENDING";
          let spNfseStatus: string | null = null;
          let spNfseNumber: string | null = null;

          const spInssValor = retemInssConsolidado ? Number((splitValue * inssAliquotaConsolidado / 100).toFixed(2)) : 0;

          if (sendToAsaas && process.env.ASAAS_API_KEY && splitCnpj) {
            try {
              spAsaasCustomerId = await findOrCreateAsaasCustomer(splitName, splitCnpj, clientEmailConsolidado, clientPhoneConsolidado, clientData?.address, clientData?.city, clientData?.state, clientData?.zip);
              const payload: any = {
                customer: spAsaasCustomerId,
                billingType: billingType || "BOLETO",
                value: splitValue,
                dueDate: invoiceDueDate,
                description: splitDescricao.substring(0, 500),
                externalReference: `FATURA-SPLIT-${clientId}-${idx + 1}de${splits.length}-${now.getTime()}`,
                notificationDisabled: true,
              };
              if (emiteNfConsolidado) {
                payload.postalService = false;
                const inssObs = retemInssConsolidado
                  ? ` ${INSS_OBSERVACAO_LEGAL} Alíquota: ${inssAliquotaConsolidado.toFixed(2)}%. Valor retido: R$ ${spInssValor.toFixed(2).replace(".", ",")}.`
                  : "";
                payload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. Período: ${periodoInicio} a ${periodoFim}.${inssObs}`;
              }
              console.log(`[asaas] SPLIT ${idx + 1}/${splits.length} — CNPJ ${splitCnpj}, Valor R$${splitValue.toFixed(2)}. Payload:`, JSON.stringify(payload));
              const payment = await asaasRequest("POST", "/payments", payload);
              spAsaasPaymentId = payment.id;
              spInvoiceUrl = payment.invoiceUrl;
              spBankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
              spInvoiceStatus = payment.status || "PENDING";
              if (billingType === "PIX" || billingType === "UNDEFINED") {
                try {
                  const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
                  spPixQrCode = pixData.encodedImage;
                  spPixCopiaECola = pixData.payload;
                } catch {}
              }
              if (spAsaasPaymentId) {
                try {
                  const nfResult = await emitNfseImmediate({
                    paymentId: spAsaasPaymentId,
                    value: splitValue,
                    description: splitDescricao.substring(0, 500),
                    observations: `CNAE ${CNAE_PRINCIPAL}. Período: ${periodoInicio} a ${periodoFim}. ${billings.length} missão(ões). Split ${idx + 1}/${splits.length}.`,
                    retemInss: retemInssConsolidado,
                    inssAliquota: inssAliquotaConsolidado,
                  });
                  spNfseStatus = nfResult.status || "AUTHORIZED";
                  if (nfResult.number) spNfseNumber = String(nfResult.number);
                  else if (nfResult.id) spNfseNumber = String(nfResult.id);
                  console.log(`[asaas] NFS-e split ${idx + 1} emitida para payment ${spAsaasPaymentId}. ID: ${nfResult.id}`);
                } catch (nfErr: any) {
                  spNfseStatus = "ERROR";
                  console.log(`[asaas] NFS-e split ${idx + 1} error: ${nfErr.message}`);
                }
              }
              await logSystemAudit({
                userId: user?.id, userName: user?.name, userRole: user?.role,
                action: "ASAAS_FATURA_SPLIT", targetId: spAsaasPaymentId, targetType: "invoice",
                details: `Fatura split ${idx + 1}/${splits.length} — CNPJ ${splitCnpj} (${splitName}). R$${splitValue.toFixed(2)}. Asaas: ${spAsaasPaymentId}`,
                ipAddress: (req as any).ip,
              });
            } catch (asaasErr: any) {
              console.error(`[asaas] Erro split ${idx + 1}: ${asaasErr.message}`);
              await logSystemAudit({
                userId: user?.id, userName: user?.name, userRole: user?.role,
                action: "ASAAS_FATURA_ERRO", targetId: String(clientId), targetType: "invoice",
                details: `ERRO fatura split ${idx + 1}/${splits.length} CNPJ ${splitCnpj}: ${asaasErr.message}. Valor: R$${splitValue.toFixed(2)}`,
                ipAddress: (req as any).ip,
              });
            }
          }

          const { data: spInvoice, error: spInvErr } = await supabaseAdmin.from("invoices").insert({
            client_id: clientId,
            client_name: splitName,
            client_cpf_cnpj: splitCnpj || cpfCnpj || null,
            asaas_customer_id: spAsaasCustomerId,
            asaas_payment_id: spAsaasPaymentId,
            description: splitDescricao,
            value: splitValue,
            due_date: invoiceDueDate,
            billing_type: billingType || "BOLETO",
            status: spInvoiceStatus,
            invoice_url: spInvoiceUrl,
            bank_slip_url: spBankSlipUrl,
            pix_qr_code: spPixQrCode,
            pix_copia_e_cola: spPixCopiaECola,
            nfse_status: spNfseStatus,
            nfse_number: spNfseNumber,
            notes: `${DESCRICAO_SERVICO_FIXA} - Período: ${periodoInicio} a ${periodoFim}. ${billings.length} missão(ões). Split ${idx + 1}/${splits.length} — CNPJ ${splitCnpj}.`,
            external_reference: `BOLETIM-${clientId}-${billingIds.length}OS-SPLIT${idx + 1}`,
            provider_cnpj: TORRES_CNPJ,
            valor_inss_retido: retemInssConsolidado ? spInssValor : null,
            inss_aliquota: retemInssConsolidado ? inssAliquotaConsolidado : null,
            created_by: user?.id,
          }).select().single();

          if (spInvErr) throw spInvErr;
          createdInvoices.push(spInvoice);

          await supabaseAdmin.from("billing_splits").insert({
            invoice_id: spInvoice.id,
            client_id: clientId,
            profile_id: sp.profile_id || null,
            cnpj: sp.cnpj,
            razao_social: sp.razao_social,
            valor: splitValue,
            billing_ids: billingIds,
            status: spAsaasPaymentId ? "SENT" : "PENDING",
            created_by: user?.name || "Sistema",
          });

          if (sp.save_profile) {
            const { data: existing } = await supabaseAdmin
              .from("customer_billing_profiles")
              .select("id")
              .eq("client_id", clientId)
              .eq("cnpj", sp.cnpj)
              .maybeSingle();
            if (!existing) {
              await supabaseAdmin.from("customer_billing_profiles").insert({
                client_id: clientId,
                label: sp.label || "",
                cnpj: sp.cnpj,
                razao_social: sp.razao_social,
                is_default: false,
              });
              console.log(`[billing] Novo perfil CNPJ salvo para cliente ${clientId}: ${sp.cnpj}`);
            }
          }
        }

        const primaryInvoice = createdInvoices[0];
        const { error: updateErr } = await supabaseAdmin
          .from("escort_billings")
          .update({
            status: "FATURADO",
            faturado_em: new Date().toISOString(),
            faturado_por: user?.name || "Sistema",
            invoice_id: primaryInvoice.id,
          })
          .in("id", billingIds);

        if (updateErr) {
          console.error("[billing] Erro ao atualizar status para FATURADO:", updateErr.message);
        }

        await logSystemAudit({
          userId: user?.id, userName: user?.name, userRole: user?.role,
          action: "GERAR_FATURA_SPLIT", targetId: createdInvoices.map((i: any) => i.id).join(","), targetType: "invoice",
          details: `${createdInvoices.length} faturas split para ${clientName}. ${billings.length} OS(s). Total: R$${totalValue.toFixed(2)}. Invoices: ${createdInvoices.map((i: any) => `#${i.id} (R$${Number(i.value).toFixed(2)})`).join(", ")}`,
          ipAddress: (req as any).ip,
        });

        console.log(`[billing] SPLIT concluído: ${createdInvoices.length} faturas criadas. IDs: ${createdInvoices.map((i: any) => i.id).join(", ")}`);

        gerarFaturaLocks.delete(clientId);
        return res.json({
          invoice: primaryInvoice,
          invoices: createdInvoices,
          billingIds,
          totalValue,
          missionsCount: billings.length,
          splitCount: createdInvoices.length,
        });
      }

      // ============================================================
      // MODO NORMAL: uma única fatura (sem splits)
      // ============================================================
      let asaasCustomerId: string | null = null;
      let asaasPaymentId: string | null = null;
      let invoiceUrl: string | null = null;
      let bankSlipUrl: string | null = null;
      let pixQrCode: string | null = null;
      let pixCopiaECola: string | null = null;
      let invoiceStatus = "PENDING";
      let nfseStatus: string | null = null;
      let nfseNumber: string | null = null;

      if (sendToAsaas && process.env.ASAAS_API_KEY && cpfCnpj) {
        try {
          asaasCustomerId = await findOrCreateAsaasCustomer(clientName, cpfCnpj, clientEmailConsolidado, clientPhoneConsolidado, clientData?.address, clientData?.city, clientData?.state, clientData?.zip);
          const consolidadoPayload: any = {
            customer: asaasCustomerId,
            billingType: billingType || "BOLETO",
            value: totalValue,
            dueDate: invoiceDueDate,
            description: descricaoFiscal.substring(0, 500),
            externalReference: `FATURA-${clientId}-${now.getTime()}`,
            notificationDisabled: true,
          };
          if (emiteNfConsolidado) {
            consolidadoPayload.postalService = false;
            const inssObsPayment = retemInssConsolidado
              ? ` ${INSS_OBSERVACAO_LEGAL} Alíquota: ${inssAliquotaConsolidado.toFixed(2)}%. Valor retido: R$ ${inssValorConsolidado.toFixed(2).replace(".", ",")}.`
              : "";
            consolidadoPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. Período: ${periodoInicio} a ${periodoFim}.${inssObsPayment}`;
          }
          console.log(`[asaas] PAYLOAD AUDIT — Enviando para Asaas:`, JSON.stringify(consolidadoPayload, null, 2));
          const payment = await asaasRequest("POST", "/payments", consolidadoPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          invoiceStatus = payment.status || "PENDING";
          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {}
          }

          if (asaasPaymentId) {
            try {
              const nfResult = await emitNfseImmediate({
                paymentId: asaasPaymentId,
                value: totalValue,
                description: descricaoFiscal.substring(0, 500),
                observations: `CNAE ${CNAE_PRINCIPAL}. Período: ${periodoInicio} a ${periodoFim}. ${billings.length} missão(ões).`,
                retemInss: retemInssConsolidado,
                inssAliquota: inssAliquotaConsolidado,
              });
              nfseStatus = nfResult.status || "AUTHORIZED";
              if (nfResult.number) nfseNumber = String(nfResult.number);
              else if (nfResult.id) nfseNumber = String(nfResult.id);
              console.log(`[asaas] NFS-e emitida imediatamente para payment ${asaasPaymentId}. ID: ${nfResult.id}, Status: ${nfseStatus}`);
            } catch (nfErr: any) {
              nfseStatus = "ERROR";
              console.log(`[asaas] NFS-e auto-emission error (non-blocking): ${nfErr.message}`);
            }
          }

          await logSystemAudit({
            userId: user?.id, userName: user?.name, userRole: user?.role,
            action: "ASAAS_FATURA_CONSOLIDADA", targetId: asaasPaymentId, targetType: "invoice",
            details: `Fatura consolidada ${billingType || "BOLETO"} R$${totalValue.toFixed(2)} para ${clientName}. ${billings.length} OS(s). CNAE ${CNAE_PRINCIPAL}. Período: ${periodoInicio} a ${periodoFim}. Asaas: ${asaasPaymentId}`,
            ipAddress: (req as any).ip,
          });
        } catch (asaasErr: any) {
          console.error("[asaas] Erro ao gerar cobrança:", asaasErr.message);
          await logSystemAudit({
            userId: user?.id, userName: user?.name, userRole: user?.role,
            action: "ASAAS_FATURA_ERRO", targetId: String(clientId), targetType: "invoice",
            details: `ERRO fatura consolidada ${clientName}: ${asaasErr.message}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}`,
            ipAddress: (req as any).ip,
          });
        }
      }

      const { data: invoice, error: invErr } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId,
        client_name: clientName,
        client_cpf_cnpj: cpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        description: descricaoFiscal,
        value: totalValue,
        due_date: invoiceDueDate,
        billing_type: billingType || "BOLETO",
        status: invoiceStatus,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        nfse_status: nfseStatus,
        nfse_number: nfseNumber,
        notes: `${DESCRICAO_SERVICO_FIXA} - Período: ${periodoInicio} a ${periodoFim}. ${billings.length} missão(ões) aprovada(s).`,
        external_reference: `BOLETIM-${clientId}-${billingIds.length}OS`,
        provider_cnpj: TORRES_CNPJ,
        valor_inss_retido: retemInssConsolidado ? inssValorConsolidado : null,
        inss_aliquota: retemInssConsolidado ? inssAliquotaConsolidado : null,
        created_by: user?.id,
      }).select().single();

      if (invErr) throw invErr;

      const { error: updateErr } = await supabaseAdmin
        .from("escort_billings")
        .update({
          status: "FATURADO",
          faturado_em: new Date().toISOString(),
          faturado_por: user?.name || "Sistema",
          invoice_id: invoice.id,
        })
        .in("id", billingIds);

      if (updateErr) {
        console.error("[billing] Erro ao atualizar status para FATURADO:", updateErr.message);
      }

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "GERAR_FATURA", targetId: String(invoice.id), targetType: "invoice",
        details: `Fatura consolidada para ${clientName}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}. IDs: ${billingIds.join(", ")}. Asaas: ${asaasPaymentId || "não enviado"}`,
        ipAddress: (req as any).ip,
      });

      res.json({
        invoice,
        billingIds,
        totalValue,
        missionsCount: billings.length,
      });
    } catch (err: any) {
      console.error("[billing] Erro ao gerar fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ message: "ID inválido" });

      const user = (req as any).user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }

      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });

      if (invoice.status === "PAGO") {
        return res.status(400).json({ message: "Não é possível excluir fatura já paga" });
      }

      const { data: linkedBillings } = await supabaseAdmin
        .from("escort_billings")
        .select("id")
        .eq("invoice_id", invoiceId);

      if (linkedBillings && linkedBillings.length > 0) {
        const billingIds = linkedBillings.map((b: any) => b.id);
        await supabaseAdmin
          .from("escort_billings")
          .update({ status: "APROVADA", invoice_id: null, faturado_em: null, faturado_por: null })
          .in("id", billingIds);
      }

      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }

      await supabaseAdmin.from("financial_transactions").delete().eq("reference_id", `INV-${invoiceId}`);
      await supabaseAdmin.from("invoices").delete().eq("id", invoiceId);

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "DELETE_FATURA", targetId: String(invoiceId), targetType: "invoice",
        details: `Fatura #${invoiceId} excluída. ${linkedBillings?.length || 0} billing(s) revertidos para APROVADA.`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, revertedBillings: linkedBillings?.length || 0 });
    } catch (err: any) {
      console.error("[billing] Erro ao excluir fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });


    // ============================================================
    // GET /api/relatorio-nf — visão unificada (boletins + invoices)
    // ============================================================
    app.get("/api/relatorio-nf", requireAdminRole, async (req: Request, res: Response) => {
      try {
        const from = (req.query.from as string) || "";
        const to = (req.query.to as string) || "";

        // ============================================================
        // BASE UNIFICADA: escort_billings filtradas por data_missao.
        // Cada billing aparece em UMA única linha (FAT, BOL ou BIL),
        // garantindo que o total da tela = faturamento operacional do
        // período (mesma base do Relatório de Faturamento).
        // ============================================================
        const fromIso = from ? `${from}T00:00:00` : "1900-01-01";
        const toIso = to ? `${to}T23:59:59.999` : "2999-12-31";

        const { data: billingsBase, error: bbErr } = await supabaseAdmin
          .from("escort_billings")
          .select("id, client_id, client_name, data_missao, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, status, service_order_id, invoice_id, boletim_numero, created_at")
          .gte("data_missao", fromIso)
          .lte("data_missao", toIso);
        if (bbErr) throw bbErr;

        // Filtra billings improdutivas
        const validBillings = (billingsBase || []).filter((b: any) => {
          const st = String(b.status || "").toUpperCase();
          return !(st === "CANCELADO" || st === "CANCELADA" || st === "REJEITADA" || st === "REJEITADO");
        });

        const billingValor = (b: any) => {
          const v = Number(b.fat_total || 0);
          if (v > 0) return v;
          return Number(b.fat_acionamento || b.valor_franquia || 0)
               + Number(b.fat_hora_extra || 0)
               + Number(b.fat_km || b.valor_km_extra || 0)
               + Number(b.despesas_pedagio || 0)
               + Number(b.receitas_os || 0);
        };

        // Coletar invoice_ids e billing_ids para lookups
        const invIdsFromBills = Array.from(new Set(validBillings.map((b: any) => b.invoice_id).filter(Boolean))) as number[];
        const billingIdsAll = validBillings.map((b: any) => String(b.id));

        // Buscar invoices reais (resolve órfãs apontando pra invoice deletada)
        const { data: invoicesRaw } = invIdsFromBills.length > 0
          ? await supabaseAdmin.from("invoices").select("*").in("id", invIdsFromBills)
          : { data: [] as any[] };
        const invErr = null as any;
        const invoiceMap = new Map<number, any>();
        for (const inv of (invoicesRaw || [])) invoiceMap.set(inv.id, inv);

        // Buscar invoices CRIADAS no período que podem não ter sido capturadas
        // pelas billings (ex: fatura criada em maio com missões de abril)
        const { data: invoicesCreatedInPeriod } = await supabaseAdmin
          .from("invoices")
          .select("*")
          .gte("created_at", fromIso)
          .lte("created_at", toIso);
        for (const inv of (invoicesCreatedInPeriod || [])) {
          if (!invoiceMap.has(inv.id)) invoiceMap.set(inv.id, inv);
        }

        // Filtra invoices da Torres (oculta quando provider_cnpj é outro CNPJ)
        const invoiceIsTorres = (inv: any) => {
          if (!inv) return false;
          const pc = cleanCnpj(inv.provider_cnpj);
          if (!pc) return true;
          return pc === TORRES_CNPJ;
        };

        // Buscar boletim_approvals que contenham qualquer billing válida
        // (mapeamento reverso billing_id → boletim_approval)
        const { data: allApprovals } = await supabaseAdmin
          .from("boletim_approvals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000);
        const billingToApproval = new Map<string, any>();
        for (const ap of (allApprovals || [])) {
          for (const bid of ((ap.billing_ids as any[]) || [])) {
            const key = String(bid);
            const cur = billingToApproval.get(key);
            // Se houver duplicidade, prioriza APROVADO sobre PENDENTE; depois mais recente
            if (!cur) { billingToApproval.set(key, ap); continue; }
            const curApr = String(cur.status || "").toUpperCase() === "APROVADO" ? 1 : 0;
            const newApr = String(ap.status || "").toUpperCase() === "APROVADO" ? 1 : 0;
            if (newApr > curApr) { billingToApproval.set(key, ap); continue; }
            if (newApr === curApr && String(ap.created_at || "") > String(cur.created_at || "")) {
              billingToApproval.set(key, ap);
            }
          }
        }

        // Buscar clientes (nome atual + CPF/CNPJ) — inclui IDs das invoices criadas no período
        const invClientIds = (invoicesCreatedInPeriod || []).map((i: any) => i.client_id).filter(Boolean);
        const allClientIds = Array.from(new Set([
          ...validBillings.map((b: any) => b.client_id).filter(Boolean),
          ...invClientIds,
        ])) as number[];
        const clientMap = new Map<number, { name: string; cpfCnpj: string | null }>();
        if (allClientIds.length > 0) {
          const { data: clientsData } = await supabaseAdmin
            .from("clients")
            .select("id, name, cnpj, cpf")
            .in("id", allClientIds);
          for (const c of (clientsData || [])) {
            clientMap.set(c.id, { name: c.name, cpfCnpj: c.cnpj || c.cpf || null });
          }
        }

        // Buscar números de OS
        const allSoIds = Array.from(new Set(validBillings.map((b: any) => b.service_order_id).filter(Boolean))) as number[];
        const osNumMap = new Map<number, string>();
        if (allSoIds.length > 0) {
          const { data: sosAll } = await supabaseAdmin
            .from("service_orders")
            .select("id, os_number")
            .in("id", allSoIds);
          for (const so of (sosAll || [])) osNumMap.set(so.id, so.os_number);
        }
        const osLabel = (b: any) => osNumMap.get(b.service_order_id) || `OS-${b.service_order_id}`;

        // ============================================================
        // Agrupar billings por destino: FAT (invoice válida da Torres),
        // BOL (boletim) ou BIL (avulso). Cada billing aparece em UMA linha.
        // ============================================================
        const fatGroups = new Map<number, { inv: any; bills: any[] }>();
        const bolGroups = new Map<number, { ap: any; bills: any[] }>();
        const avulsos: any[] = [];

        for (const b of validBillings) {
          const inv = b.invoice_id ? invoiceMap.get(b.invoice_id) : null;
          if (inv && invoiceIsTorres(inv)) {
            const g = fatGroups.get(inv.id) || { inv, bills: [] };
            g.bills.push(b);
            fatGroups.set(inv.id, g);
            continue;
          }
          const ap = billingToApproval.get(String(b.id));
          if (ap) {
            const g = bolGroups.get(ap.id) || { ap, bills: [] };
            g.bills.push(b);
            bolGroups.set(ap.id, g);
            continue;
          }
          avulsos.push(b);
        }

        const rows: any[] = [];

        // FAT — uma linha por invoice (valor = invoice.value real cobrado)
        for (const { inv, bills } of fatGroups.values()) {
          const ns = normalizeInvoiceStatus(inv);
          const cli = clientMap.get(inv.client_id) || (bills[0] && clientMap.get(bills[0].client_id));
          const earliest = bills.map(b => b.data_missao).sort()[0];
          rows.push({
            id: `INV-${inv.id}`,
            source: "INVOICE",
            sourceId: inv.id,
            clientId: inv.client_id,
            clientName: cli?.name || inv.client_name,
            clientCpfCnpj: cli?.cpfCnpj || inv.client_cpf_cnpj,
            description: inv.description,
            value: Number(inv.value || 0),
            netValue: inv.net_value != null ? Number(inv.net_value) : null,
            dueDate: inv.due_date,
            paymentDate: inv.payment_date,
            createdAt: earliest || inv.created_at,
            updatedAt: inv.updated_at,
            asaasPaymentId: inv.asaas_payment_id,
            invoiceUrl: inv.invoice_url,
            nfseUrl: inv.nfse_url,
            nfseNumber: inv.nfse_number && !String(inv.nfse_number).startsWith("inv_") ? inv.nfse_number : null,
            osCount: bills.length,
            osList: Array.from(new Map(bills.filter(b => b.service_order_id).map(b => [b.service_order_id, { id: b.service_order_id, osNumber: osLabel(b) }])).values()),
            rawStatus: inv.status,
            rawNfseStatus: inv.nfse_status,
            rawBoletimStatus: null,
            normalizedStatus: ns,
            invoiceId: inv.id,
            approvalToken: null,
            approvalUrl: null,
          });
        }

        // Invoices criadas no período que NÃO apareceram via billings
        // (missões fora do período mas fatura criada dentro)
        for (const inv of (invoicesCreatedInPeriod || [])) {
          if (!invoiceIsTorres(inv)) continue;
          if (fatGroups.has(inv.id)) continue;
          const ns = normalizeInvoiceStatus(inv);
          const cli = clientMap.get(inv.client_id);
          rows.push({
            id: `INV-${inv.id}`,
            source: "INVOICE",
            sourceId: inv.id,
            clientId: inv.client_id,
            clientName: cli?.name || inv.client_name,
            clientCpfCnpj: cli?.cpfCnpj || inv.client_cpf_cnpj,
            description: inv.description,
            value: Number(inv.value || 0),
            netValue: inv.net_value != null ? Number(inv.net_value) : null,
            dueDate: inv.due_date,
            paymentDate: inv.payment_date,
            createdAt: inv.created_at,
            updatedAt: inv.updated_at,
            asaasPaymentId: inv.asaas_payment_id,
            invoiceUrl: inv.invoice_url,
            nfseUrl: inv.nfse_url,
            nfseNumber: inv.nfse_number && !String(inv.nfse_number).startsWith("inv_") ? inv.nfse_number : null,
            osCount: 0,
            osList: [],
            rawStatus: inv.status,
            rawNfseStatus: inv.nfse_status,
            rawBoletimStatus: null,
            normalizedStatus: ns,
            invoiceId: inv.id,
            approvalToken: null,
            approvalUrl: null,
          });
        }

        // BOL — uma linha por boletim (valor = soma das billings DO PERÍODO)
        for (const { ap, bills } of bolGroups.values()) {
          const apStatus = String(ap.status || "").toUpperCase();
          if (apStatus === "RECUSADO" || apStatus === "REJEITADO") continue;
          const ns = normalizeBoletimStatus(ap);
          const valorPeriodo = bills.reduce((s, b) => s + billingValor(b), 0);
          const cli = clientMap.get(ap.client_id) || (bills[0] && clientMap.get(bills[0].client_id));
          const earliest = bills.map(b => b.data_missao).sort()[0];
          rows.push({
            id: `BOL-${ap.id}`,
            source: "BOLETIM",
            sourceId: ap.id,
            clientId: ap.client_id,
            clientName: cli?.name || ap.client_name,
            clientCpfCnpj: cli?.cpfCnpj || null,
            description: `Boletim de medição — período ${ap.period_start} a ${ap.period_end}`,
            value: valorPeriodo,
            netValue: null,
            dueDate: null,
            paymentDate: null,
            createdAt: earliest || ap.created_at,
            updatedAt: ap.approved_at || ap.sent_at || ap.created_at,
            asaasPaymentId: null,
            invoiceUrl: null,
            nfseUrl: null,
            nfseNumber: null,
            osCount: bills.length,
            osList: Array.from(new Map(bills.filter(b => b.service_order_id).map(b => [b.service_order_id, { id: b.service_order_id, osNumber: osLabel(b) }])).values()),
            rawStatus: null,
            rawNfseStatus: null,
            rawBoletimStatus: ap.status,
            normalizedStatus: ns,
            invoiceId: null,
            approvalToken: ap.token,
            approvalUrl: ap.token ? `/aprovacao/${ap.token}` : null,
          });
        }

        // BIL avulso — uma linha por billing sem boletim/invoice
        // Exclui billings ainda não verificados (A_VERIFICAR) — só mostra
        // billings já aprovados ou faturados que ficaram sem boletim/invoice.
        const avulsosFiltrados = avulsos.filter((b: any) => {
          const st = String(b.status || "").toUpperCase();
          return st !== "A_VERIFICAR" && st !== "PENDENTE" && st !== "ENVIADA_APROVACAO";
        });
        for (const b of avulsosFiltrados) {
          const cli = clientMap.get(b.client_id);
          const lbl = osLabel(b);
          const dataFmt = (b.data_missao || "").split("T")[0];
          rows.push({
            id: `BIL-${b.id}`,
            source: "BILLING_AVULSO",
            sourceId: b.id,
            clientId: b.client_id,
            clientName: cli?.name || b.client_name || "—",
            clientCpfCnpj: cli?.cpfCnpj || null,
            description: `${lbl} — missão de ${dataFmt} (sem boletim)`,
            value: billingValor(b),
            netValue: null,
            dueDate: null,
            paymentDate: null,
            createdAt: b.data_missao || b.created_at,
            updatedAt: b.created_at,
            asaasPaymentId: null,
            invoiceUrl: null,
            nfseUrl: null,
            nfseNumber: null,
            osCount: 1,
            osList: b.service_order_id ? [{ id: b.service_order_id, osNumber: lbl }] : [],
            rawStatus: b.status,
            rawNfseStatus: null,
            rawBoletimStatus: null,
            normalizedStatus: "AGUARDANDO_BOLETIM" as const,
            invoiceId: null,
            approvalToken: null,
            approvalUrl: null,
          });
        }

        const STATUSES: string[] = ["AGUARDANDO_BOLETIM", "PENDENTE_APROVACAO", "AUTORIZADO", "NF_PROCESSANDO", "NF_EMITIDA", "NF_ERRO", "NF_CANCELADA", "PAGO", "VENCIDO", "OUTRO"];
        const totals: Record<string, { count: number; value: number }> = {};
        for (const st of STATUSES) {
          const subset = rows.filter(r => r.normalizedStatus === st);
          totals[st] = { count: subset.length, value: subset.reduce((s, r) => s + Number(r.value || 0), 0) };
        }
        // "Total no período" exclui NFs canceladas para refletir a receita efetiva
        const validRows = rows.filter(r => r.normalizedStatus !== "NF_CANCELADA");
        (totals as any).total = { count: validRows.length, value: validRows.reduce((s, r) => s + Number(r.value || 0), 0) };

        rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

        res.json({
          rows,
          totals,
          lastSync: nfReconcileState,
          period: { from, to },
        });
      } catch (err: any) {
        console.error("[relatorio-nf] error:", err.message);
        res.status(500).json({ message: err.message });
      }
    });

    // ============================================================
    // POST /api/asaas/reconcile-all — sync manual com Asaas
    // ============================================================
    app.post("/api/asaas/reconcile-all", requireAdminRole, async (req: Request, res: Response) => {
      try {
        const force = req.body?.force === true;
        const limit = Number(req.body?.limit) || 80;
        // executa em background para não travar a UI; UI fará polling em /api/relatorio-nf
        reconcileAllInvoicesAsaas({ force, limit }).catch(e => console.log("[reconcile-all] bg error:", e?.message));
        res.json({ started: true, state: nfReconcileState });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    app.get("/api/asaas/reconcile-status", requireAdminRole, async (_req: Request, res: Response) => {
      res.json(nfReconcileState);
    });

    // ============================================================
    // Excluir registro do relatório-nf (boletim ou fatura) — diretoria
    // ============================================================
    app.post("/api/relatorio-nf/delete-row", requireAdminRole, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (user?.role !== "diretoria") {
          return res.status(403).json({ message: "Somente a diretoria pode excluir registros." });
        }
        const source = String(req.body?.source || "").toUpperCase();
        const rawId = req.body?.sourceId;
        const reason = String(req.body?.reason || "").slice(0, 500);
        if (rawId === undefined || rawId === null || rawId === "" || (source !== "BOLETIM" && source !== "INVOICE")) {
          return res.status(400).json({ message: "source (BOLETIM|INVOICE) e sourceId obrigatórios" });
        }

        if (source === "BOLETIM") {
          // boletim_approvals.id é UUID (string)
          const sourceId = String(rawId);
          const { data: ap } = await supabaseAdmin.from("boletim_approvals").select("*").eq("id", sourceId).maybeSingle();
          if (!ap) return res.status(404).json({ message: "Boletim não encontrado" });
          const { error } = await supabaseAdmin.from("boletim_approvals").delete().eq("id", sourceId);
          if (error) throw error;
          console.log(`[relatorio-nf] Boletim ${sourceId} (${ap.client_name}, R$${ap.total_value}) EXCLUÍDO por ${user.email}. Motivo: ${reason || "—"}`);
          return res.json({ success: true, removed: { source, sourceId, clientName: ap.client_name, value: Number(ap.total_value || 0) } });
        }

        // INVOICE — id é integer
        const sourceId = Number(rawId);
        if (!sourceId) return res.status(400).json({ message: "sourceId inválido para INVOICE" });
        const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", sourceId).maybeSingle();
        if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });

        // Tentativa best-effort de excluir cobrança no Asaas
        if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
          try { await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`); }
          catch (e: any) { console.log("[asaas] delete payment err:", e.message); }
        }

        // Desvincula billings/escort_billings que apontam pra essa fatura
        try { await supabaseAdmin.from("billings").update({ invoice_id: null } as any).eq("invoice_id", sourceId); } catch {}
        try { await supabaseAdmin.from("escort_billings").update({ invoice_id: null } as any).eq("invoice_id", sourceId); } catch {}

        const { error } = await supabaseAdmin.from("invoices").delete().eq("id", sourceId);
        if (error) throw error;
        console.log(`[relatorio-nf] Invoice ${sourceId} (cliente=${invoice.client_id}, R$${invoice.value}) EXCLUÍDA por ${user.email}. Motivo: ${reason || "—"}`);
        return res.json({ success: true, removed: { source, sourceId, value: Number(invoice.value || 0) } });
      } catch (err: any) {
        console.error("[relatorio-nf delete-row] error:", err.message);
        res.status(500).json({ message: err.message });
      }
    });

    // ============================================================
    // Marcar fatura como NF emitida manualmente — diretoria
    // ============================================================
    app.post("/api/relatorio-nf/mark-emitted", requireAdminRole, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (user?.role !== "diretoria") {
          return res.status(403).json({ message: "Somente a diretoria pode marcar NF como emitida." });
        }
        const invoiceId = Number(req.body?.invoiceId);
        const nfNumber = String(req.body?.nfNumber || "").trim().slice(0, 60) || null;
        const note = String(req.body?.note || "").slice(0, 500);
        if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigatório" });

        const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
        if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });

        const updates: any = {
          nfse_status: "AUTHORIZED",
          nfse_observations: `[Marcada manualmente como emitida por ${user.email} em ${new Date().toISOString()}]${note ? ` ${note}` : ""}${invoice.nfse_observations ? ` | ${invoice.nfse_observations}` : ""}`.slice(0, 1000),
        };
        if (nfNumber) updates.nfse_number = nfNumber;
        if (!invoice.nfse_authorized_at) updates.nfse_authorized_at = new Date().toISOString();

        const { error } = await supabaseAdmin.from("invoices").update(updates).eq("id", invoiceId);
        if (error) throw error;

        console.log(`[relatorio-nf] Invoice ${invoiceId} marcada como NF EMITIDA por ${user.email}. NF=${nfNumber || "—"}`);
        res.json({ success: true });
      } catch (err: any) {
        console.error("[relatorio-nf mark-emitted] error:", err.message);
        res.status(500).json({ message: err.message });
      }
    });

    console.log("[asaas] Rotas de faturamento Asaas registradas");
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
