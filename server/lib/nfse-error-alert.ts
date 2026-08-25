import { createSmtpTransporter, getSmtpFrom } from "../routes/_helpers";
import { logSystemAudit } from "../audit";
import { supabaseAdmin } from "../supabase";
import { NFSE_ERROR_ALERT_TO } from "../../shared/perfis-acesso";
import { fmtBRL } from "./asaas-helpers";

export async function notifyNfseIntegrationError(opts: {
  invoice: any;
  errorMessage: string;
}): Promise<void> {
  const invoice = opts.invoice || {};
  const invoiceId = String(invoice.id || "");
  if (!invoiceId) return;

  const { data: already } = await supabaseAdmin
    .from("system_audit_logs")
    .select("id")
    .eq("action", "NFSE_ERROR_EMAIL_SENT")
    .eq("target_type", "invoice")
    .eq("target_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (already?.id) return;

  const transporter = createSmtpTransporter();
  if (!transporter) {
    console.warn("[nfse-error-alert] SMTP ausente — e-mail de erro de NF não enviado");
    return;
  }

  const valor = fmtBRL(Number(invoice.value || 0));
  const cliente = String(invoice.client_name || "—");
  const venc = String(invoice.due_date || "—");
  const nf = String(invoice.nfse_number || "—");
  const motivo = String(opts.errorMessage || "Erro não informado").slice(0, 2000);

  const html = `
    <p>Falha na emissão de NFS-e <strong>após a integração</strong> (Asaas).</p>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr><td>Fatura</td><td><strong>#${invoiceId}</strong></td></tr>
      <tr><td>Cliente</td><td>${cliente}</td></tr>
      <tr><td>Valor</td><td>${valor}</td></tr>
      <tr><td>Vencimento</td><td>${venc}</td></tr>
      <tr><td>Nº NF / id Asaas</td><td>${nf}</td></tr>
      <tr><td>Status cobrança</td><td>${invoice.status || "—"}</td></tr>
      <tr><td>Motivo</td><td>${motivo.replace(/</g, "&lt;")}</td></tr>
    </table>
    <p>Corrija o cadastro do cliente (e-mail de quem paga, endereço, inscrição municipal) e use <strong>Resolver agora</strong> no Relatório de NFs.</p>
  `;

  try {
    await transporter.sendMail({
      from: getSmtpFrom(),
      to: NFSE_ERROR_ALERT_TO.join(", "),
      subject: `[Torres] Erro NFS-e fatura #${invoiceId} — ${cliente} ${valor}`,
      html,
    });
    await logSystemAudit({
      action: "NFSE_ERROR_EMAIL_SENT",
      targetType: "invoice",
      targetId: invoiceId,
      details: `Alerta enviado a ${NFSE_ERROR_ALERT_TO.join(", ")}: ${motivo.slice(0, 300)}`,
      userName: "Integração",
      userRole: "integracao",
    });
  } catch (err: any) {
    console.error("[nfse-error-alert]", err?.message || err);
  }
}
