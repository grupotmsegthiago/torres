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
