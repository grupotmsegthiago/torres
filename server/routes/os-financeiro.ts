// =============================================================================
// SITUAÇÃO FINANCEIRA POR OS — endpoint em lote (Task #161)
// Deriva o status financeiro de cada OS a partir das fontes reais
// (escort_billings.invoice_id → invoices). Derivação em server/lib/os-financeiro.ts.
// Só leitura — nunca grava status.
// =============================================================================
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { derivarSituacaoFinanceira, SITUACAO_FINANCEIRA_META } from "../lib/os-financeiro";
import { oficialBillingView, resolverContratoParaBilling } from "../lib/billing-display";
import { brtDateKey } from "../lib/brt-date";

const CHUNK = 200; // .in() paginado — nunca confiar no corte de 1000 do Supabase

async function fetchByIdsChunked(table: string, col: string, ids: number[], select: string): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin.from(table).select(select).in(col, slice);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
  }
  return all;
}

export function registerOsFinanceiroRoutes(app: Express) {
  // POST (osIds no corpo) — GET estouraria a URL com centenas de IDs.
  app.post("/api/os-financeiro/situacao", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.osIds) ? req.body.osIds : [];
      const osIds = Array.from(new Set(raw.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0))) as number[];
      if (osIds.length === 0) return res.json({ meta: SITUACAO_FINANCEIRA_META, porOs: {} });
      if (osIds.length > 2000) return res.status(400).json({ message: "Máximo de 2000 OSs por consulta." });

      const BILLING_COLS = "id, service_order_id, client_id, contract_id, status, invoice_id, fat_total, fat_acionamento, fat_hora_extra, fat_km, fat_adicional_noturno, fat_estadia, fat_pernoite, despesas_pedagio, despesas_outras, receitas_os, km_total, km_excedente, km_franquia, horas_missao, valor_km_extra";
      const [billings, osRows, contractsRes] = await Promise.all([
        fetchByIdsChunked("escort_billings", "service_order_id", osIds, BILLING_COLS),
        fetchByIdsChunked("service_orders", "id", osIds, "id, status, escort_contract_id, client_id"),
        supabaseAdmin.from("escort_contracts").select("*"),
      ]);
      if (contractsRes.error) throw new Error(contractsRes.error.message);
      const contratos = contractsRes.data || [];

      const invoiceIds = Array.from(new Set(billings.map((b) => b.invoice_id).filter((x) => x != null))) as number[];
      const INVOICE_COLS = "id, status, value, net_value, valor_recebido, due_date, payment_date, gateway, invoice_url, bank_slip_url, nfse_number, nfse_status, nfse_url";
      const invoices = invoiceIds.length ? await fetchByIdsChunked("invoices", "id", invoiceIds, INVOICE_COLS) : [];
      const invoiceMap = new Map(invoices.map((i) => [i.id, i]));

      // Etapa 2: itens da fatura (rateio por OS)
      const itemByBilling = new Map<string, any>();
      if (invoiceIds.length) {
        const items = await fetchByIdsChunked("invoice_billing_items", "invoice_id", invoiceIds, "invoice_id, billing_id, valor_item, valor_alocado, participacao_pct");
        for (const it of items) itemByBilling.set(String(it.billing_id), it);
      }

      // Fatura agrupada: contar TODOS os billings da invoice (não só os pedidos).
      const countByInvoice = new Map<number, number>();
      if (invoiceIds.length) {
        const linked = await fetchByIdsChunked("escort_billings", "invoice_id", invoiceIds, "id, invoice_id");
        for (const l of linked) countByInvoice.set(l.invoice_id, (countByInvoice.get(l.invoice_id) || 0) + 1);
      }

      const osMap = new Map(osRows.map((o) => [o.id, o]));
      const billingByOs = new Map<number, any>();
      for (const b of billings) if (b.service_order_id != null) billingByOs.set(b.service_order_id, b);

      const hoje = brtDateKey(new Date().toISOString())!;
      const porOs: Record<string, any> = {};
      for (const osId of osIds) {
        const billing = billingByOs.get(osId) || null;
        const os = osMap.get(osId) || null;
        const invoice = billing?.invoice_id != null ? invoiceMap.get(billing.invoice_id) || null : null;
        const contrato = billing ? resolverContratoParaBilling(billing, os, contratos) : null;
        const valorOs = billing ? oficialBillingView(billing, os?.status, contrato).total : null;
        const rawItem = billing ? itemByBilling.get(String(billing.id)) : null;
        porOs[String(osId)] = derivarSituacaoFinanceira({
          billing, invoice, osStatus: os?.status ?? null,
          invoiceBillingCount: invoice ? countByInvoice.get(invoice.id) || 1 : 1,
          hoje, valorOs,
          item: rawItem ? { valorItem: Number(rawItem.valor_item || 0), valorAlocado: Number(rawItem.valor_alocado || 0), participacaoPct: rawItem.participacao_pct != null ? Number(rawItem.participacao_pct) : null } : null,
          invoiceValorRecebido: invoice?.valor_recebido != null ? Number(invoice.valor_recebido) : null,
        });
      }

      res.json({ meta: SITUACAO_FINANCEIRA_META, porOs });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Erro ao derivar situação financeira" });
    }
  });
}
