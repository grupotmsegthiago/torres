/**
 * E-mail de fatura ao cliente: boleto Asaas + NFS-e Focus + boletim, em anexo.
 * CC financeiro/adm; BCC thiago. Não envia NF pelo Asaas.
 */
import { supabaseAdmin } from "../supabase";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "../routes/_helpers";
import { CLIENT_EMAIL_COLUMNS, parseEmailList, financeiroCadastroEmails } from "../../shared/client-emails";
import { buildNfClientEmail } from "./asaas-helpers";
import { isNfFullyIssued } from "../../shared/nfse-status";
import { buildBoletimMedicaoPdfForInvoice } from "./boletim-medicao-pdf";

export const INVOICE_CLIENT_EMAIL_CC = [
  "financeiro@torresseguranca.com.br",
  "adm@torresseguranca.com.br",
] as const;

export const INVOICE_CLIENT_EMAIL_BCC = ["thiago@grupotmseg.com.br"] as const;

type MailAttachment = { filename: string; content: Buffer; contentType: string };

export function invoiceReadyForClientEmail(
  inv: {
    email_sent?: boolean | null;
    asaas_payment_id?: string | null;
    bank_slip_url?: string | null;
    invoice_url?: string | null;
    nfse_status?: string | null;
    nfse_number?: string | null;
    nfse_provider?: string | null;
    nfse_ref?: string | null;
  } | null | undefined,
  emiteNf: boolean,
): boolean {
  if (!inv || inv.email_sent) return false;
  const hasBoleto = Boolean(inv.asaas_payment_id) && Boolean(inv.bank_slip_url || inv.invoice_url);
  if (!hasBoleto) return false;
  if (!emiteNf) return true;
  return isNfFullyIssued(inv.nfse_status, inv.nfse_number);
}

async function fetchUrlBuffer(url: string | null | undefined): Promise<Buffer | null> {
  const href = String(url || "").trim();
  if (!href) return null;
  try {
    const res = await fetch(href, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 20 ? buf : null;
  } catch {
    return null;
  }
}

export async function collectInvoiceEmailAttachments(invoice: any): Promise<MailAttachment[]> {
  const attachments: MailAttachment[] = [];
  const boletoUrl = invoice.bank_slip_url || invoice.invoice_url;
  const boleto = await fetchUrlBuffer(boletoUrl);
  if (boleto) {
    const isPdf = boleto.slice(0, 4).toString() === "%PDF";
    attachments.push({
      filename: isPdf ? `boleto-fatura-${invoice.id}.pdf` : `boleto-fatura-${invoice.id}.html`,
      content: boleto,
      contentType: isPdf ? "application/pdf" : "text/html",
    });
  }

  try {
    const { loadFocusNfsePdf } = await import("./focus-nfe");
    const nf = await loadFocusNfsePdf(invoice);
    if (nf?.buf?.length) {
      const isPdf = nf.contentType.includes("pdf") || nf.buf.slice(0, 4).toString() === "%PDF";
      attachments.push({
        filename: isPdf ? `nfse-${invoice.nfse_number || invoice.id}.pdf` : `nfse-${invoice.id}.html`,
        content: nf.buf,
        contentType: isPdf ? "application/pdf" : (nf.contentType || "application/octet-stream"),
      });
    }
  } catch (e: any) {
    console.error(`[billing-email] anexo NF fatura #${invoice.id}: ${e?.message || e}`);
  }

  try {
    const boletim = await buildBoletimMedicaoPdfForInvoice(invoice);
    if (boletim?.length) {
      attachments.push({
        filename: `boletim-medicao-fatura-${invoice.id}.pdf`,
        content: boletim,
        contentType: "application/pdf",
      });
    }
  } catch (e: any) {
    console.error(`[billing-email] anexo boletim fatura #${invoice.id}: ${e?.message || e}`);
  }

  return attachments;
}

export async function sendBillingEmail(invoice: {
  id: number;
  client_name: string;
  value: number;
  due_date: string;
  billing_type: string;
  description: string;
  invoice_url?: string | null;
  bank_slip_url?: string | null;
  nfse_url?: string | null;
  nfse_number?: string | null;
  nfse_ref?: string | null;
  nfse_provider?: string | null;
  nfse_status?: string | null;
  pix_copia_e_cola?: string | null;
  service_order_id?: number | null;
  client_id?: number | null;
  valor_inss_retido?: number | string | null;
  inss_aliquota?: number | string | null;
}, clientEmail: string): Promise<boolean> {
  const transporter = createSmtpTransporter();
  const to = parseEmailList(clientEmail);
  if (!transporter || to.length === 0) {
    console.log(`[billing-email] Skipped: ${!transporter ? "SMTP not configured" : "No client email"}`);
    return false;
  }

  const toSet = new Set(to);
  const cc = INVOICE_CLIENT_EMAIL_CC.filter((e) => !toSet.has(e));
  const { subject, html } = buildNfClientEmail(invoice);
  const attachments = await collectInvoiceEmailAttachments(invoice);

  try {
    await transporter.sendMail({
      from: getSmtpFrom(),
      to,
      cc,
      bcc: [...INVOICE_CLIENT_EMAIL_BCC],
      subject,
      html,
      attachments,
    });

    await supabaseAdmin.from("invoices").update({
      email_sent: true,
      email_sent_at: nowBRTString(),
      email_sent_to: to.join(", "),
    }).eq("id", invoice.id);

    console.log(`[billing-email] ✓ Fatura #${invoice.id} enviada para ${to.join(", ")} cc=${cc.join(", ")} anexos=${attachments.length}`);
    return true;
  } catch (err: any) {
    console.error(`[billing-email] ✗ Erro ao enviar fatura #${invoice.id}: ${err.message}`);
    return false;
  }
}

export async function maybeSendInvoiceReadyEmail(invoiceId: number): Promise<boolean> {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const { data: inv } = await supabaseAdmin.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) return false;

  let emiteNf = true;
  let clientEmail = "";
  if (inv.client_id) {
    const { data: cli } = await supabaseAdmin
      .from("clients")
      .select(`emite_nf, ${CLIENT_EMAIL_COLUMNS}`)
      .eq("id", inv.client_id)
      .maybeSingle();
    emiteNf = cli?.emite_nf === true;
    const fin = financeiroCadastroEmails(cli);
    clientEmail = fin.length ? fin.join(", ") : "";
  }
  if (!invoiceReadyForClientEmail(inv, emiteNf)) return false;
  if (!clientEmail) {
    console.log(`[billing-email] Fatura #${id}: boleto+NF prontos, cliente sem e-mail`);
    return false;
  }

  return sendBillingEmail({
    id: inv.id,
    client_name: inv.client_name,
    value: Number(inv.value),
    due_date: inv.due_date,
    billing_type: inv.billing_type,
    description: inv.description,
    invoice_url: inv.invoice_url,
    bank_slip_url: inv.bank_slip_url,
    nfse_url: inv.nfse_url,
    nfse_number: inv.nfse_number,
    nfse_ref: inv.nfse_ref,
    nfse_provider: inv.nfse_provider,
    nfse_status: inv.nfse_status,
    pix_copia_e_cola: inv.pix_copia_e_cola,
    service_order_id: inv.service_order_id || null,
    client_id: inv.client_id,
    valor_inss_retido: inv.valor_inss_retido,
    inss_aliquota: inv.inss_aliquota,
  }, clientEmail);
}
