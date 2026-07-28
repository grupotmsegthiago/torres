// Etapa 2 do Vínculo OS↔Fatura — parte com IO: itens de fatura, aplicação de
// recebimento (integral/parcial) e reversão automática (estorno/cancelamento),
// sempre com trilha de auditoria em os_financeiro_audits.
//
// INVARIANTES:
// - Nunca altera valores de faturamento (§8.1 intocado) — só status/alocação.
// - OS só vira PAGO quando valor alocado >= valor do item - tolerância.
// - Estorno/cancelamento NUNCA deixa OS "PAGA" com fatura morta.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../supabase";
import { ratearRecebimento, TOLERANCIA_CENTAVOS, type ItemRateio } from "./invoice-allocation";

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

async function audit(rows: Array<{
  billing_id: number | null; service_order_id: number | null; invoice_id: number | null;
  evento: string; status_antes?: string | null; status_depois?: string | null;
  valor_alocado?: number | null; origem: string; detalhes?: any;
}>) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from("os_financeiro_audits").insert(rows.map((r) => ({
    ...r,
    detalhes: r.detalhes ?? null,
  })));
  if (error) console.error("[invoice-payment] audit insert falhou:", error.message);
}

/**
 * Garante que a fatura tem itens (1 por billing vinculado) com valor e
 * participação registrados. Idempotente — usada no faturamento e como
 * retro-preenchimento lazy para faturas antigas.
 */
export async function ensureInvoiceItems(invoiceId: number): Promise<any[]> {
  const { data: existing } = await supabaseAdmin
    .from("invoice_billing_items").select("*").eq("invoice_id", invoiceId);
  const byBilling = new Map((existing || []).map((it: any) => [String(it.billing_id), it]));

  const { data: billings } = await supabaseAdmin
    .from("escort_billings")
    .select("id, service_order_id, fat_total, status")
    .eq("invoice_id", invoiceId);
  if (!billings || billings.length === 0) return existing || [];

  const total = billings.reduce((s: number, b: any) => s + r2(b.fat_total), 0);
  const faltantes = billings.filter((b: any) => !byBilling.has(String(b.id)));
  if (faltantes.length > 0) {
    const rows = faltantes.map((b: any) => ({
      invoice_id: invoiceId,
      billing_id: b.id,
      service_order_id: b.service_order_id,
      valor_item: r2(b.fat_total),
      participacao_pct: total > 0 ? r2((r2(b.fat_total) / total) * 100) : 0,
      valor_alocado: 0,
      alocacao_origem: null,
    }));
    const { error } = await supabaseAdmin.from("invoice_billing_items")
      .upsert(rows, { onConflict: "invoice_id,billing_id", ignoreDuplicates: true });
    if (error) {
      console.error("[invoice-payment] ensureInvoiceItems falhou:", error.message);
      return existing || [];
    }
  }
  const { data: fresh } = await supabaseAdmin
    .from("invoice_billing_items").select("*").eq("invoice_id", invoiceId);
  return fresh || [];
}

/**
 * Aplica um recebimento (integral ou parcial) à fatura: rateia por OS,
 * grava alocação nos itens, marca PAGO só o que ficou quitado e audita tudo.
 */
export async function applyPaymentToInvoice(opts: {
  invoiceId: number;
  valorRecebido: number;         // valor efetivamente recebido neste evento (acumula)
  origem: string;                // webhook_asaas | webhook_inter | baixa_manual | ...
  conciliado?: boolean;          // false = baixa manual sem conciliação bancária
  /** chave idempotente do evento (ex: asaas:<paymentId>:<event>). Webhook
   *  reenviado com a mesma chave NÃO soma 2x. Sem chave = evento único. */
  eventKey?: string;
  detalhes?: any;
}): Promise<{ integral: boolean; percentualRecebido: number; quitados: number; total: number } | null> {
  const { invoiceId, origem } = opts;
  const items = await ensureInvoiceItems(invoiceId);
  if (items.length === 0) {
    // fatura sem billings vinculados — nada a ratear (comportamento antigo preservado)
    return null;
  }

  // Acúmulo ATÔMICO + dedupe por evento via RPC (webhooks duplicados/simultâneos
  // não somam 2x nem perdem update). Retorno NULL do RPC = evento já processado.
  const eventKey = opts.eventKey || `${origem}:${invoiceId}:${randomUUID()}`;
  const { data: acumuladoRaw, error: rpcErr } = await supabaseAdmin
    .rpc("os_fin_registrar_recebimento", {
      p_event_key: eventKey, p_invoice_id: invoiceId,
      p_valor: r2(opts.valorRecebido), p_origem: origem,
    });
  if (rpcErr) throw new Error(`os_fin_registrar_recebimento: ${rpcErr.message}`);
  if (acumuladoRaw == null) {
    console.log(`[invoice-payment] Fatura #${invoiceId}: evento ${eventKey} já processado — ignorando (idempotência)`);
    return {
      integral: false, percentualRecebido: 0, quitados: 0, total: items.length,
    };
  }
  const acumulado = r2(Number(acumuladoRaw));

  const entrada: ItemRateio[] = items.map((it: any) => ({
    billingId: String(it.billing_id),
    valorItem: r2(it.valor_item),
    valorAlocadoManual: it.alocacao_origem === "manual" ? r2(it.valor_alocado) : null,
  }));
  const rateio = ratearRecebimento(entrada, acumulado);

  const agora = new Date().toISOString();
  const statusAntes = new Map<string, string>();
  {
    const { data: bs } = await supabaseAdmin.from("escort_billings")
      .select("id, status").in("id", rateio.itens.map((i) => i.billingId));
    for (const b of bs || []) statusAntes.set(String(b.id), b.status);
  }

  for (const it of rateio.itens) {
    await supabaseAdmin.from("invoice_billing_items").update({
      valor_alocado: it.valorAlocado,
      alocacao_origem: it.origem,
      alocado_em: agora,
    }).eq("invoice_id", invoiceId).eq("billing_id", it.billingId);

    const antes = statusAntes.get(it.billingId) || null;
    if (it.quitado && antes !== "PAGO") {
      await supabaseAdmin.from("escort_billings")
        .update({ status: "PAGO", pago_em: agora }).eq("id", it.billingId);
    } else if (!it.quitado && antes === "PAGO") {
      // recebimento parcial nunca deixa OS PAGA sem lastro
      await supabaseAdmin.from("escort_billings")
        .update({ status: "FATURADO", pago_em: null }).eq("id", it.billingId);
    }
  }

  await supabaseAdmin.from("invoices").update({
    valor_recebido: rateio.totalAlocado,
    updated_at: agora,
  }).eq("id", invoiceId);

  const itemByBilling = new Map(items.map((it: any) => [String(it.billing_id), it]));
  await audit(rateio.itens.map((it) => ({
    billing_id: it.billingId,
    service_order_id: itemByBilling.get(it.billingId)?.service_order_id ?? null,
    invoice_id: invoiceId,
    evento: rateio.integral ? "RECEBIMENTO_INTEGRAL" : "RECEBIMENTO_PARCIAL",
    status_antes: statusAntes.get(it.billingId) || null,
    status_depois: it.quitado ? "PAGO" : (statusAntes.get(it.billingId) === "PAGO" ? "FATURADO" : statusAntes.get(it.billingId) || null),
    valor_alocado: it.valorAlocado,
    origem,
    detalhes: { rateio: it.origem, valor_item: it.valorItem, recebido_acumulado: acumulado, conciliado: opts.conciliado !== false, ...(opts.detalhes || {}) },
  })));

  console.log(`[invoice-payment] Fatura #${invoiceId}: recebido acumulado R$${acumulado.toFixed(2)} → ${rateio.integral ? "INTEGRAL" : `PARCIAL ${rateio.percentualRecebido}%`} (${rateio.itens.filter((i) => i.quitado).length}/${rateio.itens.length} OS quitadas) via ${origem}`);
  return {
    integral: rateio.integral,
    percentualRecebido: rateio.percentualRecebido,
    quitados: rateio.itens.filter((i) => i.quitado).length,
    total: rateio.itens.length,
  };
}

/**
 * Reversão automática: estorno (REFUNDED) ou cancelamento da fatura.
 * Zera alocações, reverte OSs PAGO → FATURADO e audita.
 */
export async function revertInvoicePayment(opts: {
  invoiceId: number;
  motivo: "ESTORNO" | "CANCELAMENTO";
  origem: string;
  detalhes?: any;
}): Promise<number> {
  const { invoiceId } = opts;
  const agora = new Date().toISOString();

  const { data: billings } = await supabaseAdmin.from("escort_billings")
    .select("id, service_order_id, status").eq("invoice_id", invoiceId);

  await supabaseAdmin.from("invoice_billing_items")
    .update({ valor_alocado: 0, alocacao_origem: null, alocado_em: agora })
    .eq("invoice_id", invoiceId);
  await supabaseAdmin.from("invoices")
    .update({ valor_recebido: 0, updated_at: agora }).eq("id", invoiceId);

  const pagos = (billings || []).filter((b: any) => b.status === "PAGO");
  if (pagos.length > 0) {
    await supabaseAdmin.from("escort_billings")
      .update({ status: "FATURADO", pago_em: null })
      .in("id", pagos.map((b: any) => b.id));
  }

  await audit((billings || []).map((b: any) => ({
    billing_id: b.id,
    service_order_id: b.service_order_id,
    invoice_id: invoiceId,
    evento: `REVERSAO_${opts.motivo}`,
    status_antes: b.status,
    status_depois: b.status === "PAGO" ? "FATURADO" : b.status,
    valor_alocado: 0,
    origem: opts.origem,
    detalhes: opts.detalhes ?? null,
  })));

  console.log(`[invoice-payment] Fatura #${invoiceId}: reversão por ${opts.motivo} via ${opts.origem} — ${pagos.length} OS revertidas de PAGO`);
  return pagos.length;
}

export { TOLERANCIA_CENTAVOS };
