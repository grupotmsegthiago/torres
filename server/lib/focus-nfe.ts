/**
 * Satélite Focus NFe — emissão, consulta e cancelamento de NFS-e (São Paulo).
 * Camada 0: não altera valor comercial da invoice (boletim/billing).
 */

import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdminRole } from "../auth";
import { asaasTomadorEmail, CLIENT_EMAIL_COLUMNS } from "../../shared/client-emails";
import {
  DESCRICAO_SERVICO_FIXA,
  MISSING_EMAIL_NF_MSG,
  assertFiscalAddressForNf,
  shouldBlockNfEmission,
} from "./asaas-helpers";
import {
  isNfFullyIssued,
} from "../../shared/nfse-status";
import {
  FOCUS_PROVIDER,
  buildFocusNfsePayload,
  extractFocusErrorMessage,
  focusCancelJustification,
  focusNfseRef,
  ibgeMunicipioFromCityUf,
  isFocusManagedInvoice,
  nfseUpdatesFromFocusObject,
  type FocusTomadorInput,
} from "./focus-nfe-helpers";

const FOCUS_TIMEOUT_MS = 45_000;
const viaCepCache = new Map<string, string>();

export function resolveFocusApiToken(): string {
  return String(process.env.FOCUS_API_TOKEN || process.env.FOCUS_NFE_TOKEN || "").trim();
}

export function hasFocusApiToken(): boolean {
  return !!resolveFocusApiToken();
}

export function resolveFocusBaseUrl(): string {
  const env = String(process.env.FOCUS_NFE_ENV || process.env.FOCUS_API_ENV || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (env === "producao" || env === "production" || env === "prod") {
    return "https://api.focusnfe.com.br";
  }
  return "https://homologacao.focusnfe.com.br";
}

export function resolveFocusPrestadorIm(): string {
  return String(process.env.FOCUS_PRESTADOR_IM || process.env.FOCUS_IM || "").replace(/\D/g, "");
}

function focusOptanteSimples(): boolean {
  const raw = String(process.env.FOCUS_OPTANTE_SIMPLES || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "nao" && raw !== "não";
}

function basicAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

export async function focusRequest(method: string, path: string, body?: unknown): Promise<any> {
  const token = resolveFocusApiToken();
  if (!token) throw new Error("FOCUS_API_TOKEN não configurado");
  const url = `${resolveFocusBaseUrl()}/v2${path.startsWith("/") ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FOCUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuthHeader(token),
        Accept: "application/json",
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { mensagem: text }; }
    if (!res.ok) {
      const msg = extractFocusErrorMessage(json) || text || `Focus NFe HTTP ${res.status}`;
      const err: any = new Error(msg.slice(0, 1000));
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Timeout ao chamar a Focus NFe");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function ibgeFromCep(cep: string): Promise<string | null> {
  const digits = String(cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  if (viaCepCache.has(digits)) return viaCepCache.get(digits) || null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    const ibge = String(data?.ibge || "").replace(/\D/g, "");
    if (ibge.length === 7) {
      viaCepCache.set(digits, ibge);
      return ibge;
    }
  } catch {
    // fallback de cidade abaixo
  }
  return null;
}

async function resolveTomadorIbge(client: FocusTomadorInput): Promise<string> {
  const fromCep = await ibgeFromCep(client.zip || "");
  if (fromCep) return fromCep;
  const fromCity = ibgeMunicipioFromCityUf(client.city, client.state);
  if (fromCity) return fromCity;
  throw new Error(
    `Código IBGE do município do tomador não encontrado (${client.city || "?"} / ${client.state || "?"}). Confira cidade e CEP.`,
  );
}

export async function consultFocusNfse(ref: string): Promise<any | null> {
  const r = String(ref || "").trim();
  if (!r) return null;
  try {
    return await focusRequest("GET", `/nfse/${encodeURIComponent(r)}`);
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function cancelFocusNfse(ref: string, reason?: string | null): Promise<any> {
  return focusRequest("DELETE", `/nfse/${encodeURIComponent(ref)}`, {
    justificativa: focusCancelJustification(reason),
  });
}

function invoiceUpdatesNow(updates: Record<string, any>): Record<string, any> {
  return { ...updates, updated_at: new Date().toISOString() };
}

export async function persistFocusNfse(invoiceId: number, nf: any, ref: string, current: any): Promise<Record<string, any>> {
  const updates = nfseUpdatesFromFocusObject(nf, current || {}, ref);
  if (Object.keys(updates).length === 0) return {};
  const payload = invoiceUpdatesNow(updates);
  const { error } = await supabaseAdmin.from("invoices").update(payload).eq("id", invoiceId);
  if (error) throw error;
  return payload;
}

async function loadClientForNf(invoice: any): Promise<any | null> {
  if (!invoice?.client_id) return null;
  const { data } = await supabaseAdmin
    .from("clients")
    .select(`id, name, cnpj, cpf, emite_nf, retem_inss, inss_aliquota, address, address_number, address_complement, bairro, city, state, zip, phone, inscricao_municipal, ${CLIENT_EMAIL_COLUMNS}`)
    .eq("id", invoice.client_id)
    .maybeSingle();
  return data;
}

function tomadorFrom(invoice: any, client: any): FocusTomadorInput {
  return {
    name: client?.name || invoice.client_name,
    cpfCnpj: client?.cnpj || client?.cpf || invoice.client_cpf_cnpj,
    email: asaasTomadorEmail(client),
    phone: client?.phone,
    inscricaoMunicipal: client?.inscricao_municipal,
    address: client?.address,
    addressNumber: client?.address_number,
    complement: client?.address_complement,
    bairro: client?.bairro,
    city: client?.city,
    state: client?.state,
    zip: client?.zip,
  };
}

export async function emitFocusNfseForInvoice(
  invoiceId: number,
  opts?: { source?: string; clientEmail?: string },
): Promise<{ ok: boolean; message: string; status?: string }> {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, message: "Fatura inválida" };
  if (!hasFocusApiToken()) return { ok: false, message: "FOCUS_API_TOKEN não configurado" };

  const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) return { ok: false, message: "Fatura não encontrada" };
  if (["CANCELLED", "CANCELED"].includes(String(invoice.status || "").toUpperCase())) {
    return { ok: false, message: "Cobrança cancelada" };
  }
  if (isNfFullyIssued(invoice.nfse_status, invoice.nfse_number)) {
    return { ok: true, message: "NFS-e já emitida", status: invoice.nfse_status };
  }

  const client = await loadClientForNf(invoice);
  const emiteNf = client ? client.emite_nf === true : true;
  if (!emiteNf) return { ok: false, message: "Cliente isento de NFS-e" };

  const clientEmail = opts?.clientEmail !== undefined ? opts.clientEmail : asaasTomadorEmail(client);
  if (shouldBlockNfEmission(clientEmail)) {
    await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: MISSING_EMAIL_NF_MSG }, focusNfseRef(id), invoice);
    return { ok: false, message: MISSING_EMAIL_NF_MSG };
  }

  const fiscalErr = assertFiscalAddressForNf(client, true);
  if (fiscalErr) {
    await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: fiscalErr }, focusNfseRef(id), invoice);
    return { ok: false, message: fiscalErr };
  }

  const prestadorIm = resolveFocusPrestadorIm();
  if (!prestadorIm) return { ok: false, message: "FOCUS_PRESTADOR_IM não configurado (CCM da Torres em São Paulo)" };

  const ref = String(invoice.nfse_ref || "").trim() || focusNfseRef(id);

  const existing = await consultFocusNfse(ref);
  if (existing) {
    await persistFocusNfse(id, existing, ref, invoice);
    const st = String(existing.status || "").toLowerCase();
    if (st === "autorizado" || st === "autorizada") {
      return { ok: true, message: "NFS-e já emitida na Focus", status: "AUTHORIZED" };
    }
    if (st === "processando_autorizacao" || st === "processando") {
      return { ok: true, message: "NFS-e na fila da prefeitura (Focus) — só consulta", status: "PROCESSING" };
    }
    if (st === "cancelado" || st === "cancelada") {
      // ref cancelada: nova emissão precisa de nova ref. Mantemos a mesma fatura com sufixo.
    } else if (st !== "erro_autorizacao" && st !== "erro") {
      return { ok: true, message: `NFS-e Focus status ${existing.status}`, status: existing.status };
    }
  }

  const tomador = tomadorFrom(invoice, client);
  tomador.codigoMunicipioIbge = await resolveTomadorIbge(tomador);
  const emitRef = existing && /cancel/.test(String(existing.status || "").toLowerCase())
    ? `${focusNfseRef(id)}-r${Date.now().toString(36)}`
    : ref;

  let result: any;
  try {
    result = await focusRequest("POST", `/nfse?ref=${encodeURIComponent(emitRef)}`, buildFocusNfsePayload({
      value: parseFloat(invoice.value),
      description: invoice.description || DESCRICAO_SERVICO_FIXA,
      tomador,
      retemInss: true,
      inssAliquota: Number(client?.inss_aliquota ?? 11),
      prestadorIm,
      optanteSimplesNacional: focusOptanteSimples(),
    }));
  } catch (e: any) {
    const code = String(e?.body?.codigo || "").toLowerCase();
    if (code === "nfe_autorizada" || /já autorizada/i.test(String(e?.message || ""))) {
      const live = await consultFocusNfse(emitRef);
      if (live) {
        await persistFocusNfse(id, live, emitRef, invoice);
        return { ok: true, message: "NFS-e já autorizada na Focus", status: "AUTHORIZED" };
      }
    }
    const msg = String(e?.message || "Erro ao emitir NFS-e na Focus").slice(0, 1000);
    await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: msg }, emitRef, invoice);
    return { ok: false, message: msg };
  }

  await persistFocusNfse(id, { ...(result || {}), status: result?.status || "processando_autorizacao", ref: emitRef }, emitRef, invoice);
  console.log(`[focus-nfe] fatura #${id} (${opts?.source || "emit"}): ref=${emitRef} status=${result?.status || "processando"}`);
  return { ok: true, message: `NFS-e ${result?.status || "processando_autorizacao"}`, status: result?.status };
}

export async function syncFocusNfseForInvoice(invoice: any): Promise<{ updates: Record<string, any>; source: string; nf: any | null }> {
  const ref = String(invoice?.nfse_ref || "").trim()
    || (isFocusManagedInvoice(invoice) ? String(invoice?.nfse_number || "") : "");
  if (!ref || !hasFocusApiToken()) return { updates: {}, source: "none", nf: null };
  const nf = await consultFocusNfse(ref);
  if (!nf) return { updates: {}, source: "focus-miss", nf: null };
  const updates = nfseUpdatesFromFocusObject(nf, invoice, ref);
  return { updates, source: "focus", nf };
}

export function extractFocusWebhookToken(req: Request): string {
  const header = String(req.headers["x-focus-token"] || req.headers["authorization"] || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  if (header) return header;
  return String((req.query as any)?.token || "").trim();
}

export function registerFocusNfeRoutes(app: Express): void {
  app.post("/api/webhooks/focus-nfe", async (req: Request, res: Response) => {
    const expected = String(process.env.FOCUS_WEBHOOK_TOKEN || "").trim();
    if (!expected) {
      console.error("[focus-nfe] webhook recusado: FOCUS_WEBHOOK_TOKEN não configurado");
      return res.status(401).json({ message: "Webhook Focus não configurado" });
    }
    const got = extractFocusWebhookToken(req);
    if (got !== expected) return res.status(401).json({ message: "Token inválido" });

    const body: any = req.body || {};
    const ref = String(body.ref || body.referencia || body?.nfse?.ref || "").trim();
    if (!ref) return res.status(400).json({ message: "ref ausente" });

    try {
      let { data: row } = await supabaseAdmin.from("invoices").select("*").eq("nfse_ref", ref).maybeSingle();
      if (!row) {
        const { data: byNumber } = await supabaseAdmin.from("invoices").select("*").eq("nfse_number", ref).maybeSingle();
        row = byNumber;
      }
      if (!row) {
        console.log(`[focus-nfe] webhook ref=${ref}: fatura local não encontrada`);
        return res.json({ ok: true, ignored: true });
      }
      const nf = await consultFocusNfse(ref);
      if (nf) await persistFocusNfse(row.id, nf, ref, row);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[focus-nfe] webhook:", e?.message || e);
      res.status(500).json({ message: e?.message || "erro" });
    }
  });

  app.get("/api/focus-nfe/status", requireAdminRole, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user?.role !== "diretoria") {
      return res.status(403).json({ connected: false, message: "Acesso restrito à diretoria." });
    }
    res.json({
      connected: hasFocusApiToken(),
      env: resolveFocusBaseUrl().includes("homologacao") ? "homologacao" : "producao",
      prestadorImConfigured: !!resolveFocusPrestadorIm(),
      provider: FOCUS_PROVIDER,
    });
  });
}
