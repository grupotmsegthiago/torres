/**
 * Espelho da fatura emitida em Contas a Receber.
 * A fatura (`invoices`) continua sendo o fato da cobrança.
 * `financial_transactions` com origin_type "invoice" é o lançamento que a aba
 * Contas a Receber exibe — criado na emissão, pendente até a baixa, removido
 * se a cobrança for cancelada.
 *
 * O valor é o líquido do Relatório de NFs (o que o cliente paga no boleto).
 */
import { TORRES_CNPJ, cleanCnpj, nfGrossAndLiquid } from "./asaas-helpers";

export const INVOICE_RECEIVABLE_ORIGIN = "invoice";

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "PAGO", "PAID"]);
const CANCELLED = new Set(["CANCELLED", "CANCELED", "REFUNDED", "REFUND_REQUESTED"]);

export type InvoiceReceivableClient = {
  emite_nf?: boolean | null;
  retem_inss?: boolean | null;
  inss_aliquota?: number | null;
};

export type InvoiceReceivableDecision =
  | { action: "remove" }
  | {
      action: "upsert";
      amount: number;
      status: "PENDING" | "PAID";
      due_date: string;
      description: string;
      entity_name: string;
    };

function dateOnly(value: unknown): string | null {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

function todayBrt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function decideInvoiceReceivable(
  invoice: any,
  client?: InvoiceReceivableClient | null,
): InvoiceReceivableDecision {
  if (!invoice?.id) return { action: "remove" };

  const status = String(invoice.status || "").toUpperCase();
  const provider = cleanCnpj(invoice.provider_cnpj);
  if (provider && provider !== TORRES_CNPJ) return { action: "remove" };
  if (status === "AGUARDANDO_FATURAMENTO") return { action: "remove" };
  if (CANCELLED.has(status)) return { action: "remove" };

  const gross = Number(invoice.value || 0);
  if (!(gross > 0)) return { action: "remove" };

  // Mesma leitura do Relatório de NFs: sem cliente, trata como emite NF.
  const emiteNf = client ? client.emite_nf !== false : true;
  const retemInss = client?.retem_inss === true;
  const aliquota = client?.inss_aliquota != null ? Number(client.inss_aliquota) : undefined;
  const liquid = nfGrossAndLiquid(gross, emiteNf, retemInss, aliquota).liquid;
  if (!(liquid > 0)) return { action: "remove" };

  const nf = String(invoice.nfse_number || "").trim();
  const nfLabel = nf && !/^inv_/i.test(nf) ? ` NF ${nf}` : "";
  const clientName = String(invoice.client_name || "Cliente").trim() || "Cliente";

  return {
    action: "upsert",
    amount: liquid,
    status: PAID.has(status) ? "PAID" : "PENDING",
    due_date: dateOnly(invoice.due_date) || dateOnly(invoice.created_at) || todayBrt(),
    description: `Fatura #${invoice.id}${nfLabel} — ${clientName}`,
    entity_name: clientName,
  };
}

export async function syncInvoiceReceivable(invoice: any, client?: InvoiceReceivableClient | null) {
  const { createAutoTransaction, removeAutoTransaction } = await import("../routes/_helpers");
  const decision = decideInvoiceReceivable(invoice, client);
  const originId = String(invoice?.id || "");
  if (!originId) return null;
  if (decision.action === "remove") {
    await removeAutoTransaction(INVOICE_RECEIVABLE_ORIGIN, originId);
    return null;
  }
  return createAutoTransaction({
    description: decision.description,
    amount: decision.amount,
    type: "INCOME",
    status: decision.status,
    due_date: decision.due_date,
    origin_type: INVOICE_RECEIVABLE_ORIGIN,
    origin_id: originId,
    category_name: "Faturamento",
    entity_name: decision.entity_name,
    created_by: "SISTEMA",
  });
}

/** Lançamentos de fatura que ainda não estão recebidos. Quem já está PAID fica como está. */
export function invoiceIdsNeedingReceivableSettle(
  invoiceIds: number[],
  existing: { origin_id?: string | null; status?: string | null }[],
): number[] {
  const paid = new Set(
    existing
      .filter((row) => String(row.status || "").toUpperCase() === "PAID")
      .map((row) => String(row.origin_id || "")),
  );
  return Array.from(new Set(invoiceIds.filter((id) => Number.isFinite(id) && id > 0 && !paid.has(String(id)))));
}

export async function settlePaidInvoiceReceivables(invoiceIds: number[]): Promise<number> {
  const ids = Array.from(new Set(invoiceIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (ids.length === 0) return 0;
  const { supabaseAdmin } = await import("../supabase");
  const { data, error } = await supabaseAdmin
    .from("financial_transactions")
    .select("origin_id, status")
    .eq("origin_type", INVOICE_RECEIVABLE_ORIGIN)
    .in("origin_id", ids.map(String));
  if (error) throw error;
  const pending = invoiceIdsNeedingReceivableSettle(ids, data || []);
  for (const id of pending) await syncInvoiceReceivableById(id);
  return pending.length;
}

export async function syncInvoiceReceivableById(invoiceId: number) {
  const { removeAutoTransaction } = await import("../routes/_helpers");
  const { supabaseAdmin } = await import("../supabase");
  const { data: invoice, error } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (error) throw error;
  if (!invoice) {
    await removeAutoTransaction(INVOICE_RECEIVABLE_ORIGIN, String(invoiceId));
    return null;
  }
  let client: InvoiceReceivableClient | null = null;
  if (invoice.client_id) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("emite_nf, retem_inss, inss_aliquota")
      .eq("id", invoice.client_id)
      .maybeSingle();
    client = data;
  }
  return syncInvoiceReceivable(invoice, client);
}

let backfillAt = 0;
let backfillInflight: Promise<void> | null = null;

function receivableMatches(existing: any, decision: InvoiceReceivableDecision): boolean {
  if (!existing) return decision.action === "remove";
  if (decision.action === "remove") return false;
  const due = String(existing.due_date || "").slice(0, 10);
  return Number(existing.amount) === decision.amount
    && String(existing.status || "") === decision.status
    && due === decision.due_date
    && String(existing.description || "") === decision.description
    && String(existing.entity_name || "") === decision.entity_name;
}

/** Garante que faturas já emitidas (as do Relatório de NFs) tenham lançamento. Idempotente. */
export function ensureInvoiceReceivables(minIntervalMs = 60_000): Promise<void> {
  if (backfillInflight) return backfillInflight;
  if (Date.now() - backfillAt < minIntervalMs) return Promise.resolve();
  backfillInflight = (async () => {
    const { supabaseAdmin } = await import("../supabase");
    const invoices: any[] = [];
    const page = 1000;
    for (let offset = 0; ; offset += page) {
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .select("id, client_id, client_name, value, due_date, created_at, status, nfse_status, nfse_number, provider_cnpj")
        .order("id", { ascending: true })
        .range(offset, offset + page - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      invoices.push(...data);
      if (data.length < page) break;
    }

    const existing = new Map<string, any>();
    for (let offset = 0; ; offset += page) {
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .select("id, origin_id, amount, status, due_date, description, entity_name, conciliado_em")
        .eq("origin_type", INVOICE_RECEIVABLE_ORIGIN)
        .order("id", { ascending: true })
        .range(offset, offset + page - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) existing.set(String(row.origin_id), row);
      if (data.length < page) break;
    }

    const clientIds = Array.from(new Set(invoices.map((i) => i.client_id).filter(Boolean))) as number[];
    const clients = new Map<number, InvoiceReceivableClient>();
    for (let i = 0; i < clientIds.length; i += 200) {
      const slice = clientIds.slice(i, i + 200);
      const { data, error } = await supabaseAdmin
        .from("clients")
        .select("id, emite_nf, retem_inss, inss_aliquota")
        .in("id", slice);
      if (error) throw error;
      for (const c of data || []) clients.set(c.id, c);
    }

    for (const invoice of invoices) {
      const decision = decideInvoiceReceivable(
        invoice,
        invoice.client_id ? clients.get(invoice.client_id) || null : null,
      );
      const row = existing.get(String(invoice.id));
      if (row?.conciliado_em) continue;
      if (receivableMatches(row, decision)) continue;
      await syncInvoiceReceivable(invoice, invoice.client_id ? clients.get(invoice.client_id) || null : null);
    }
    backfillAt = Date.now();
  })().catch((e: any) => {
    console.error("[invoice-receivable] backfill:", e?.message || e);
  }).finally(() => {
    backfillInflight = null;
  });
  return backfillInflight;
}
