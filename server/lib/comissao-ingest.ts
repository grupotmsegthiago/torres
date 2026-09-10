/**
 * Satélite TM SEG — painel central de Comissões.
 *
 * SSOT do comercial vive na TM SEG. O TORRES só guarda o UUID em
 * `clients.responsavel_comercial_id` (sem tabela `comerciais`, sem FK).
 *
 * Ingestão de FATURADO / PAGO / CANCELADO é fail-soft: falha de rede
 * nunca bloqueia emissão, baixa ou cancelamento da fatura no TORRES.
 */

export const COMISSAO_INGEST_DEFAULT_URL =
  "https://sistema.grupotmseg.com.br/api/comissoes/ingest";
export const COMISSAO_INGEST_TOKEN_ENV = "COMISSAO_INGEST_TOKEN";
export const COMISSAO_INGEST_URL_ENV = "COMISSAO_INGEST_URL";
export const COMISSAO_INGEST_TIMEOUT_MS = 8_000;

export type ComissaoEvento = "FATURADO" | "PAGO" | "CANCELADO";

export type ComercialAtivo = { id: string; nome: string };

export type ComissaoIngestPayload = {
  empresa: "TORRES";
  evento: ComissaoEvento;
  origemFaturaId: string;
  clienteOrigemId: string;
  clienteNome: string;
  comercialId: string;
  valorFaturamento: number;
  dataFaturamento: string;
  faturaNumero: string;
  dataRecebimento?: string;
  ordemServicoId?: string;
};

export type InvoiceForComissao = {
  id?: number | string | null;
  client_id?: number | string | null;
  client_name?: string | null;
  value?: number | string | null;
  created_at?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
  nfse_number?: string | null;
  status?: string | null;
  service_order_id?: number | string | null;
};

export type ComissaoIngestDeps = {
  fetchFn?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  loadClient?: (id: number) => Promise<{
    id: number;
    name?: string | null;
    responsavel_comercial_id?: string | null;
  } | null>;
  loadInvoice?: (id: number) => Promise<InvoiceForComissao | null>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SKIP_FATURADO = new Set([
  "AGUARDANDO_FATURAMENTO",
  "CANCELLED",
  "CANCELED",
  "REFUNDED",
]);

function envOf(deps?: ComissaoIngestDeps): NodeJS.ProcessEnv {
  return deps?.env ?? process.env;
}

export function todayBrtDate(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function dateOnly(value: unknown, fallback: string): string {
  if (!value) return fallback;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : fallback;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function getComissaoIngestConfig(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  token: string;
  configured: boolean;
} {
  const token = String(env[COMISSAO_INGEST_TOKEN_ENV] || "").trim();
  const url = String(env[COMISSAO_INGEST_URL_ENV] || "").trim() || COMISSAO_INGEST_DEFAULT_URL;
  return { url, token, configured: token.length > 0 };
}

export function parseComerciaisResponse(body: unknown): ComercialAtivo[] {
  const root = body && typeof body === "object" ? (body as Record<string, any>) : {};
  const list = Array.isArray(body)
    ? body
    : Array.isArray(root.comerciais)
      ? root.comerciais
      : Array.isArray(root.data?.comerciais)
        ? root.data.comerciais
        : Array.isArray(root.data)
          ? root.data
          : [];
  const seen = new Set<string>();
  const out: ComercialAtivo[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const id = String((raw as any).id ?? (raw as any).uuid ?? "").trim();
    const nome = String((raw as any).nome ?? (raw as any).name ?? "").trim();
    if (!isUuid(id) || !nome) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, nome });
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return out;
}

export function buildComissaoIngestPayload(opts: {
  evento: ComissaoEvento;
  invoice: InvoiceForComissao;
  comercialId: string;
  clienteNome?: string | null;
  dataRecebimento?: string;
  ordemServicoId?: string | null;
  now?: Date;
}): ComissaoIngestPayload | null {
  const invoiceId = opts.invoice?.id;
  const clientId = opts.invoice?.client_id;
  const comercialId = String(opts.comercialId || "").trim();
  if (invoiceId == null || invoiceId === "") return null;
  if (clientId == null || clientId === "") return null;
  if (!isUuid(comercialId)) return null;

  const today = todayBrtDate(opts.now ?? new Date());
  const status = String(opts.invoice.status || "").toUpperCase();
  if (opts.evento === "FATURADO" && SKIP_FATURADO.has(status)) return null;

  const valor = Number(opts.invoice.value);
  if (!Number.isFinite(valor)) return null;

  const dataFaturamento = dateOnly(
    opts.invoice.created_at || opts.invoice.due_date,
    today,
  );
  const payload: ComissaoIngestPayload = {
    empresa: "TORRES",
    evento: opts.evento,
    origemFaturaId: String(invoiceId),
    clienteOrigemId: String(clientId),
    clienteNome: String(opts.clienteNome || opts.invoice.client_name || "").trim(),
    comercialId,
    valorFaturamento: Math.round(valor * 100) / 100,
    dataFaturamento,
    faturaNumero: String(opts.invoice.nfse_number || invoiceId),
  };
  const osId = String(opts.ordemServicoId || opts.invoice.service_order_id || "").trim();
  if (osId) payload.ordemServicoId = osId;
  if (opts.evento === "PAGO") {
    payload.dataRecebimento = dateOnly(
      opts.dataRecebimento || opts.invoice.payment_date,
      today,
    );
  }
  return payload;
}

function ingestHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-comissao-ingest-token": token,
  };
}

async function ingestFetch(
  url: string,
  init: RequestInit,
  deps?: ComissaoIngestDeps,
): Promise<Response> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), COMISSAO_INGEST_TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchComerciaisAtivos(
  deps?: ComissaoIngestDeps,
): Promise<{ ok: boolean; comerciais: ComercialAtivo[]; error: string | null }> {
  const cfg = getComissaoIngestConfig(envOf(deps));
  if (!cfg.configured) {
    return { ok: false, comerciais: [], error: "COMISSAO_INGEST_TOKEN não configurado" };
  }
  try {
    const res = await ingestFetch(cfg.url, { method: "GET", headers: ingestHeaders(cfg.token) }, deps);
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) {
      return {
        ok: false,
        comerciais: [],
        error: `TM SEG recusou a listagem (${res.status})`,
      };
    }
    return { ok: true, comerciais: parseComerciaisResponse(body), error: null };
  } catch (err: any) {
    const msg = err?.name === "AbortError"
      ? "TM SEG indisponível (timeout)"
      : (err?.message || "TM SEG indisponível");
    console.error("[comissao-ingest] GET comerciais falhou:", msg);
    return { ok: false, comerciais: [], error: msg };
  }
}

export async function postComissaoIngest(
  payload: ComissaoIngestPayload,
  deps?: ComissaoIngestDeps,
): Promise<{ sent: boolean; skipped?: string; status?: number }> {
  const cfg = getComissaoIngestConfig(envOf(deps));
  if (!cfg.configured) return { sent: false, skipped: "not_configured" };
  try {
    const res = await ingestFetch(
      cfg.url,
      { method: "POST", headers: ingestHeaders(cfg.token), body: JSON.stringify(payload) },
      deps,
    );
    if (!res.ok) {
      console.error(
        `[comissao-ingest] POST ${payload.evento} fatura #${payload.origemFaturaId} → HTTP ${res.status}`,
      );
      return { sent: false, status: res.status };
    }
    console.log(
      `[comissao-ingest] ${payload.evento} fatura #${payload.origemFaturaId} enviado (comercial ${payload.comercialId})`,
    );
    return { sent: true, status: res.status };
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message || String(err));
    console.error(
      `[comissao-ingest] fail-soft ${payload.evento} fatura #${payload.origemFaturaId}:`,
      msg,
    );
    return { sent: false };
  }
}

async function defaultLoadClient(id: number) {
  const { supabaseAdmin } = await import("../supabase");
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, responsavel_comercial_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[comissao-ingest] load client falhou:", error.message);
    return null;
  }
  return data;
}

async function defaultLoadInvoice(id: number): Promise<InvoiceForComissao | null> {
  const { supabaseAdmin } = await import("../supabase");
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, client_id, client_name, value, created_at, due_date, payment_date, nfse_number, status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[comissao-ingest] load invoice falhou:", error.message);
    return null;
  }
  return data;
}

export async function ingestComissaoInvoice(
  evento: ComissaoEvento,
  source: { invoiceId?: number; invoice?: InvoiceForComissao | null },
  extras?: { dataRecebimento?: string },
  deps?: ComissaoIngestDeps,
): Promise<{ sent: boolean; skipped?: string }> {
  try {
    const cfg = getComissaoIngestConfig(envOf(deps));
    if (!cfg.configured) return { sent: false, skipped: "not_configured" };

    let invoice = source.invoice || null;
    const invoiceId = Number(source.invoiceId ?? invoice?.id);
    if (!invoice && invoiceId) {
      const loader = deps?.loadInvoice ?? defaultLoadInvoice;
      invoice = await loader(invoiceId);
    }
    if (!invoice?.id) return { sent: false, skipped: "no_invoice" };

    const clientId = Number(invoice.client_id);
    if (!clientId) return { sent: false, skipped: "no_client" };

    const loadClient = deps?.loadClient ?? defaultLoadClient;
    const client = await loadClient(clientId);
    const comercialId = String(client?.responsavel_comercial_id || "").trim();
    if (!isUuid(comercialId)) return { sent: false, skipped: "no_comercial" };

    const payload = buildComissaoIngestPayload({
      evento,
      invoice,
      comercialId,
      clienteNome: client?.name || invoice.client_name,
      dataRecebimento: extras?.dataRecebimento,
      now: deps?.now?.(),
    });
    if (!payload) return { sent: false, skipped: "invalid_payload" };

    return await postComissaoIngest(payload, deps);
  } catch (err: any) {
    console.error("[comissao-ingest] fail-soft inesperado:", err?.message || err);
    return { sent: false, skipped: "error" };
  }
}

/**
 * Dispara a ingestão em background. Nunca rejeita — a fatura do TORRES
 * segue mesmo se a TM SEG estiver fora.
 */
export function notifyComissaoInvoiceEvent(
  evento: ComissaoEvento,
  source: { invoiceId?: number; invoice?: InvoiceForComissao | null },
  extras?: { dataRecebimento?: string },
  deps?: ComissaoIngestDeps,
): void {
  void ingestComissaoInvoice(evento, source, extras, deps);
}

export const COMISSAO_BULK_MAX = 400;

export type ClienteComissaoCadastro = {
  id: number | string;
  name?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  responsavel_comercial_id?: string | null;
};

export type EscortBillingForComissao = {
  invoice_id?: number | string | null;
  os_number?: string | number | null;
  service_order_id?: number | string | null;
  pago_em?: string | null;
  fat_total?: number | string | null;
  data_missao?: string | null;
  faturado_em?: string | null;
  created_at?: string | null;
  status?: string | null;
  client_id?: number | string | null;
  client_name?: string | null;
};

export type IncomeTxForComissao = {
  id?: string | number | null;
  entity_name?: string | null;
  entity_id?: number | string | null;
  amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
  origin_type?: string | null;
  origin_id?: string | number | null;
  type?: string | null;
};

export type ComissaoBulkItem = {
  evento: ComissaoEvento;
  payload: ComissaoIngestPayload;
};

export type SyncAllComissoesResult = {
  ok: boolean;
  configured: boolean;
  clientesComComercial: number;
  clientes: Array<{ id: number; nome: string; comercialId: string }>;
  faturados: number;
  pagos: number;
  erros: number;
  pulados: number;
  error?: string;
};

function dateOnlyOrEmpty(value: unknown): string {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function inPeriod(date: string, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

function statusCancelado(status: unknown): boolean {
  const s = String(status || "").toUpperCase();
  return s.includes("CANCEL") || s === "REFUNDED";
}

export function periodoSyncComissoesTorres(todayIso: string, monthsBack = 18): { start: string; end: string } {
  const end = String(todayIso || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!m) return { start: "2025-01-01", end: end || "2025-01-01" };
  let year = Number(m[1]);
  let month = Number(m[2]) - monthsBack;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end };
}

function comercialDoCliente(
  clientsById: Map<number, ClienteComissaoCadastro>,
  clientId: unknown,
): string {
  const id = Number(clientId);
  if (!Number.isFinite(id)) return "";
  return String(clientsById.get(id)?.responsavel_comercial_id || "").trim();
}

export function collectComissaoBulkPayloads(opts: {
  clients: ClienteComissaoCadastro[];
  invoices: InvoiceForComissao[];
  billings?: EscortBillingForComissao[];
  transactions?: IncomeTxForComissao[];
  periodStart: string;
  periodEnd: string;
  now?: Date;
}): ComissaoBulkItem[] {
  const start = opts.periodStart;
  const end = opts.periodEnd;
  const now = opts.now ?? new Date();
  const byId = new Map<number, ClienteComissaoCadastro>();
  for (const c of opts.clients || []) {
    const id = Number(c.id);
    if (Number.isFinite(id)) byId.set(id, c);
  }
  const out: ComissaoBulkItem[] = [];
  const invoiceIds = new Set<string>();
  const osContadas = new Set<string>();

  const pushInvoiceLike = (
    invoice: InvoiceForComissao,
    comercialId: string,
    clienteNome: string | null | undefined,
    ordemServicoId?: string | null,
  ) => {
    const fat = buildComissaoIngestPayload({
      evento: "FATURADO",
      invoice,
      comercialId,
      clienteNome,
      ordemServicoId,
      now,
    });
    if (!fat) return;
    out.push({ evento: "FATURADO", payload: fat });
    if (String(invoice.payment_date || "").trim()) {
      const pago = buildComissaoIngestPayload({
        evento: "PAGO",
        invoice,
        comercialId,
        clienteNome,
        ordemServicoId,
        dataRecebimento: String(invoice.payment_date),
        now,
      });
      if (pago) out.push({ evento: "PAGO", payload: pago });
    }
  };

  for (const inv of opts.invoices || []) {
    if (statusCancelado(inv.status)) continue;
    const date = dateOnlyOrEmpty(inv.due_date || inv.created_at);
    if (!inPeriod(date, start, end)) continue;
    const comercialId = comercialDoCliente(byId, inv.client_id);
    if (!isUuid(comercialId)) continue;
    const id = String(inv.id ?? "").trim();
    if (id) invoiceIds.add(id);
    const osId = inv.service_order_id != null ? String(inv.service_order_id).trim() : "";
    if (osId) osContadas.add(osId);
    const cli = byId.get(Number(inv.client_id));
    pushInvoiceLike(inv, comercialId, cli?.nome_fantasia || cli?.name || inv.client_name, osId || null);
  }

  for (const tx of opts.transactions || []) {
    if (String(tx.type || "").toUpperCase() !== "INCOME") continue;
    if (statusCancelado(tx.status)) continue;
    const date = dateOnlyOrEmpty(tx.due_date);
    if (!inPeriod(date, start, end)) continue;
    const originId = String(tx.origin_id || "").trim();
    if (String(tx.origin_type || "") === "invoice" && originId && invoiceIds.has(originId)) continue;
    const clientId = Number(tx.entity_id);
    const comercialId = comercialDoCliente(byId, clientId);
    if (!isUuid(comercialId)) continue;
    const txId = String(tx.id || "").trim();
    if (!txId) continue;
    const cli = byId.get(clientId);
    const osId = String(tx.origin_type || "") === "service_order" && originId ? originId : "";
    if (osId) osContadas.add(osId);
    pushInvoiceLike(
      {
        id: txId,
        client_id: clientId,
        client_name: tx.entity_name || cli?.name,
        value: tx.amount,
        created_at: date,
        due_date: date,
        payment_date: tx.payment_date,
        nfse_number: originId || txId,
        status: tx.payment_date ? "RECEIVED" : "PENDING",
        service_order_id: osId || null,
      },
      comercialId,
      tx.entity_name || cli?.nome_fantasia || cli?.name,
      osId || null,
    );
  }

  for (const bill of opts.billings || []) {
    if (statusCancelado(bill.status)) continue;
    const valor = Number(bill.fat_total);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const date = dateOnlyOrEmpty(bill.data_missao || bill.faturado_em || bill.created_at);
    if (!inPeriod(date, start, end)) continue;
    const invoiceId = String(bill.invoice_id || "").trim();
    if (invoiceId && invoiceIds.has(invoiceId)) continue;
    const osId = String(bill.os_number || bill.service_order_id || "").trim();
    if (osId && osContadas.has(osId)) continue;
    const clientId = Number(bill.client_id);
    const comercialId = comercialDoCliente(byId, clientId);
    if (!isUuid(comercialId)) continue;
    if (osId) osContadas.add(osId);
    const cli = byId.get(clientId);
    pushInvoiceLike(
      {
        id: `os:${osId || bill.service_order_id || date}`,
        client_id: clientId,
        client_name: bill.client_name || cli?.name,
        value: valor,
        created_at: date,
        due_date: date,
        payment_date: bill.pago_em,
        nfse_number: osId,
        status: bill.pago_em ? "RECEIVED" : "PENDING",
        service_order_id: osId || null,
      },
      comercialId,
      bill.client_name || cli?.nome_fantasia || cli?.name,
      osId || null,
    );
  }

  return out;
}

async function fetchAllAdmin(
  table: string,
  columns: string,
  configure?: (q: any) => any,
): Promise<any[]> {
  const { supabaseAdmin } = await import("../supabase");
  const rows: any[] = [];
  let from = 0;
  const page = 1000;
  while (true) {
    let q = supabaseAdmin.from(table).select(columns);
    if (configure) q = configure(q);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) {
      console.error(`[comissao-ingest] fetch ${table}:`, error.message);
      throw new Error(`${table}: ${error.message}`);
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < page) return rows;
    from += batch.length;
  }
}

async function loadUniverseDefault(): Promise<{
  clients: ClienteComissaoCadastro[];
  invoices: InvoiceForComissao[];
  billings: EscortBillingForComissao[];
  transactions: IncomeTxForComissao[];
}> {
  const [clients, invoices, billings, transactions] = await Promise.all([
    fetchAllAdmin("clients", "id, name, nome_fantasia, razao_social, responsavel_comercial_id"),
    fetchAllAdmin("invoices", "id, client_id, client_name, value, created_at, due_date, payment_date, nfse_number, status, service_order_id"),
    fetchAllAdmin(
      "escort_billings",
      "invoice_id, os_number, service_order_id, pago_em, fat_total, data_missao, faturado_em, created_at, status, client_id, client_name",
    ),
    fetchAllAdmin(
      "financial_transactions",
      "id, entity_name, entity_id, amount, status, due_date, payment_date, origin_type, origin_id, type",
      (q) => q.eq("type", "INCOME"),
    ),
  ]);
  return { clients, invoices, billings, transactions };
}

export async function syncAllComissoesToTmSeg(deps?: ComissaoIngestDeps & {
  todayIso?: string;
  loadUniverse?: () => Promise<{
    clients: ClienteComissaoCadastro[];
    invoices: InvoiceForComissao[];
    billings?: EscortBillingForComissao[];
    transactions?: IncomeTxForComissao[];
  }>;
}): Promise<SyncAllComissoesResult> {
  const cfg = getComissaoIngestConfig(envOf(deps));
  const empty: SyncAllComissoesResult = {
    ok: false,
    configured: cfg.configured,
    clientesComComercial: 0,
    clientes: [],
    faturados: 0,
    pagos: 0,
    erros: 0,
    pulados: 0,
  };
  if (!cfg.configured) return { ...empty, error: "COMISSAO_INGEST_TOKEN não configurado" };
  try {
    const today = String(deps?.todayIso || todayBrtDate(deps?.now?.() ?? new Date())).slice(0, 10);
    const periodo = periodoSyncComissoesTorres(today);
    const universe = deps?.loadUniverse
      ? await deps.loadUniverse()
      : await loadUniverseDefault();
    const clientes = (universe.clients || [])
      .filter((c) => isUuid(c.responsavel_comercial_id))
      .map((c) => ({
        id: Number(c.id),
        nome: String(c.nome_fantasia || c.name || c.razao_social || "").trim() || `Cliente ${c.id}`,
        comercialId: String(c.responsavel_comercial_id),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const items = collectComissaoBulkPayloads({
      clients: universe.clients || [],
      invoices: universe.invoices || [],
      billings: universe.billings || [],
      transactions: universe.transactions || [],
      periodStart: periodo.start,
      periodEnd: periodo.end,
      now: deps?.now?.() ?? new Date(),
    });
    const limited = items.slice(0, COMISSAO_BULK_MAX);
    let faturados = 0;
    let pagos = 0;
    let erros = 0;
    let pulados = items.length - limited.length;
    for (const item of limited) {
      const r = await postComissaoIngest(item.payload, deps);
      if (r.sent) {
        if (item.evento === "PAGO") pagos += 1;
        else faturados += 1;
      } else if (r.skipped) pulados += 1;
      else erros += 1;
    }
    return {
      ok: erros === 0,
      configured: true,
      clientesComComercial: clientes.length,
      clientes,
      faturados,
      pagos,
      erros,
      pulados,
    };
  } catch (err: any) {
    console.error("[comissao-ingest] syncAll fail-soft:", err?.message || err);
    return { ...empty, error: err?.message || String(err) };
  }
}
