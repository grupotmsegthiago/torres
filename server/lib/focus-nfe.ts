/**
 * Satélite Focus NFe — emissão, consulta e cancelamento de NFS-e.
 * Emissão nova: Ambiente Nacional POST /v2/nfsen. Consulta e cancelamento
 * usam /v2/nfsen e, só em 404, a Paulistana /v2/nfse (notas já emitidas).
 * Camada 0: não altera valor comercial da invoice (boletim/billing).
 */

import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdminRole } from "../auth";
import { CLIENT_EMAIL_COLUMNS, nfseTomadorEmail } from "../../shared/client-emails";
import { maybeSendInvoiceReadyEmail } from "./invoice-billing-email";
import {
  ISS_ALIQUOTA,
  MISSING_EMAIL_NF_MSG,
  assertFiscalAddressForNf,
  shouldBlockNfEmission,
} from "./asaas-helpers";
import {
  isNfFullyIssued,
} from "../../shared/nfse-status";
import { bloqueioNfSemOs } from "../../shared/nf-os-guard";
import { multilogRefsForOrder } from "../../shared/multilog-refs";
import { NFSE_CATEGORIA_OPCOES, type NfseCategoriaFiscal } from "../../shared/nfse-descricao";
import {
  FOCUS_PROVIDER,
  absoluteFocusAssetUrl,
  buildDefaultNfseDescription,
  buildFocusNfsePayload,
  extractFocusErrorMessage,
  focusCancelJustification,
  focusNfseConsultRef,
  focusNfseMunicipalResourcePath,
  focusNfseRef,
  focusNfsenEmitPath,
  focusNfsenResourcePath,
  focusPdfUrl,
  nfseCategoryPrefixes,
  nfsePeriodoLabel,
  parseNfseCategory,
  resolveFocusServicoCategoria,
  sanitizeNfseDescription,
  focusTomadorEmail,
  ibgeMunicipioFromCityUf,
  isFocusConnectivityError,
  isFocusManagedInvoice,
  isLikelyPdfUrl,
  isPrefeituraNfseHtmlUrl,
  nfseUpdatesFromFocusObject,
  resolveFocusApiBaseUrl,
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
  return resolveFocusApiBaseUrl(process.env.FOCUS_NFE_ENV || process.env.FOCUS_API_ENV, {
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function resolveFocusPrestadorIm(): string {
  return String(process.env.FOCUS_PRESTADOR_IM || process.env.FOCUS_IM || "").replace(/\D/g, "");
}

function focusOptanteSimples(): boolean {
  const raw = String(process.env.FOCUS_OPTANTE_SIMPLES || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "nao" && raw !== "não";
}

function focusAliquotaSimples(): number {
  const raw = String(process.env.FOCUS_ALIQUOTA_SIMPLES || "").trim().replace(",", ".");
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  return ISS_ALIQUOTA;
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
      let host = "";
      try { host = new URL(url).host; } catch { host = ""; }
      const raw = extractFocusErrorMessage(json) || text || `Focus NFe HTTP ${res.status}`;
      const msg = host ? `${raw} (host: ${host})` : raw;
      const err: any = new Error(msg.slice(0, 1000));
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Timeout ao chamar a Focus NFe");
    if (e?.status) throw e;
    const host = resolveFocusBaseUrl().includes("homologacao") ? "homologação" : "produção";
    const cause = String(e?.cause?.message || e?.cause?.code || e?.message || e).slice(0, 240);
    throw new Error(`Falha ao consultar Focus (${host}): ${cause}`);
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
  const given = String(client.codigoMunicipioIbge || "").replace(/\D/g, "");
  if (given.length === 7) return given;
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
    return await focusRequest("GET", focusNfsenResourcePath(r));
  } catch (e: any) {
    if (e?.status === 404) {
      try {
        return await focusRequest("GET", focusNfseMunicipalResourcePath(r));
      } catch (legacy: any) {
        if (legacy?.status === 404) return null;
        if (isFocusConnectivityError(legacy?.message)) return null;
        throw legacy;
      }
    }
    if (isFocusConnectivityError(e?.message)) return null;
    throw e;
  }
}

export async function cancelFocusNfse(ref: string, reason?: string | null): Promise<any> {
  const body = { justificativa: focusCancelJustification(reason) };
  const r = String(ref || "").trim();
  try {
    return await focusRequest("DELETE", focusNfsenResourcePath(r), body);
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    return await focusRequest("DELETE", focusNfseMunicipalResourcePath(r), body);
  }
}

function focusAssetNeedsAuth(url: string): boolean {
  return /focusnfe\.com\.br/i.test(url) && !/amazonaws|\.s3\./i.test(url);
}

export async function fetchFocusAsset(url: string): Promise<{ buf: Buffer; contentType: string } | null> {
  const href = String(url || "").trim();
  if (!href) return null;
  const abs = absoluteFocusAssetUrl(href, resolveFocusBaseUrl());
  const headers: Record<string, string> = { Accept: "application/pdf,application/octet-stream,*/*" };
  if (focusAssetNeedsAuth(abs)) {
    const token = resolveFocusApiToken();
    if (token) headers.Authorization = basicAuthHeader(token);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FOCUS_TIMEOUT_MS);
  try {
    const res = await fetch(abs, { headers, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    return { buf, contentType: ct };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadFocusNfsePdf(invoice: any): Promise<{ buf: Buffer; contentType: string; url: string } | null> {
  const ref = String(invoice?.nfse_ref || "").trim()
    || (isFocusManagedInvoice(invoice) ? String(invoice?.nfse_number || "") : "");
  let live: any = null;
  if (ref && hasFocusApiToken()) {
    try { live = await consultFocusNfse(ref); } catch { live = null; }
  }
  const candidates = [
    focusPdfUrl(live, resolveFocusBaseUrl()),
    live?.url_danfse,
    isLikelyPdfUrl(String(invoice?.nfse_url || "")) ? invoice.nfse_url : null,
  ].map((u) => String(u || "").trim()).filter(Boolean);

  for (const url of candidates) {
    if (isPrefeituraNfseHtmlUrl(url) || !isLikelyPdfUrl(url)) continue;
    const got = await fetchFocusAsset(url);
    if (!got || got.buf.length < 8) continue;
    const isPdf = got.contentType.includes("pdf") || got.buf.slice(0, 4).toString() === "%PDF";
    if (!isPdf) continue;
    if (invoice?.id && url !== String(invoice?.nfse_url || "")) {
      await supabaseAdmin.from("invoices").update({
        nfse_url: url,
        updated_at: new Date().toISOString(),
      }).eq("id", invoice.id);
    }
    return { buf: got.buf, contentType: "application/pdf", url };
  }
  return null;
}

export async function syncFocusNfsesForInvoices(
  invoices: any[],
  opts?: { limit?: number },
): Promise<{ processed: number; updated: number }> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 30, 80));
  let processed = 0;
  let updated = 0;
  if (!hasFocusApiToken()) return { processed, updated };
  for (const inv of invoices || []) {
    if (processed >= limit) break;
    if (!focusNfseConsultRef(inv)) continue;
    processed += 1;
    try {
      const r = await syncFocusNfseForInvoice(inv);
      if (r.nf) {
        const persisted = await persistFocusNfse(inv.id, r.nf, String(inv.nfse_ref || r.updates.nfse_ref || "").trim(), inv);
        if (Object.keys(persisted).length > 0 || Object.keys(r.updates).length > 0) updated += 1;
        continue;
      }
      if (Object.keys(r.updates).length === 0) continue;
      const { error } = await supabaseAdmin.from("invoices").update(invoiceUpdatesNow(r.updates)).eq("id", inv.id);
      if (!error) updated += 1;
      else console.error(`[focus-nfe] gravar fatura #${inv.id}: ${error.message}`);
    } catch (e: any) {
      console.error(`[focus-nfe] consulta fatura #${inv.id}: ${e?.message || e}`);
    }
  }
  return { processed, updated };
}

function invoiceUpdatesNow(updates: Record<string, any>): Record<string, any> {
  return { ...updates, updated_at: new Date().toISOString() };
}

export async function persistFocusNfse(invoiceId: number, nf: any, ref: string, current: any): Promise<Record<string, any>> {
  const updates = nfseUpdatesFromFocusObject(nf, current || {}, ref);
  let payload: Record<string, any> = {};
  if (Object.keys(updates).length > 0) {
    payload = invoiceUpdatesNow(updates);
    const { error } = await supabaseAdmin.from("invoices").update(payload).eq("id", invoiceId);
    if (error) throw error;
  }
  void maybeSendInvoiceReadyEmail(invoiceId).catch((e: any) => {
    console.error(`[billing-email] pós-Focus fatura #${invoiceId}: ${e?.message || e}`);
  });
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

function tomadorFrom(invoice: any, client: any, emailOverride?: string): FocusTomadorInput {
  const billingCnpj = String(invoice?.billing_cnpj || "").replace(/\D/g, "");
  if (billingCnpj.length === 14) {
    return {
      name: invoice.billing_razao_social,
      cpfCnpj: billingCnpj,
      email: focusTomadorEmail(invoice.billing_email),
      phone: null,
      inscricaoMunicipal: invoice.billing_inscricao_municipal,
      address: invoice.billing_logradouro,
      addressNumber: invoice.billing_numero,
      complement: invoice.billing_complemento,
      bairro: invoice.billing_bairro,
      city: null,
      state: invoice.billing_uf,
      zip: invoice.billing_cep,
      codigoMunicipioIbge: invoice.billing_codigo_ibge,
    };
  }
  return {
    name: client?.name || invoice.client_name,
    cpfCnpj: client?.cnpj || client?.cpf || invoice.client_cpf_cnpj,
    email: focusTomadorEmail(emailOverride) || nfseTomadorEmail(client),
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

type InvoiceOsRef = {
  type: string;
  scheduledDate: string | null;
  processoOmega: string;
  multilogOs: string;
  multilogSm: string;
};

function mapServiceOrder(row: any): InvoiceOsRef {
  const multilog = multilogRefsForOrder(row || {});
  return {
    type: String(row?.type || "").trim(),
    scheduledDate: row?.scheduled_date ? String(row.scheduled_date) : null,
    processoOmega: String(row?.processo_omega || "").trim(),
    multilogOs: multilog.os,
    multilogSm: multilog.sm,
  };
}

async function loadInvoiceServiceOrders(invoice: { id: number; service_order_id?: number | null }): Promise<{ orders: InvoiceOsRef[]; vinculados: number }> {
  const { data: bills, error } = await supabaseAdmin
    .from("escort_billings")
    .select("service_order_id")
    .eq("invoice_id", invoice.id)
    .not("service_order_id", "is", null);
  if (error) throw new Error(error.message || "Falha ao conferir OS da fatura");
  const osIds = new Set<number>();
  const direct = Number(invoice.service_order_id);
  if (Number.isFinite(direct) && direct > 0) osIds.add(direct);
  for (const bill of bills || []) {
    const osId = Number(bill.service_order_id);
    if (Number.isFinite(osId) && osId > 0) osIds.add(osId);
  }
  if (osIds.size === 0) return { orders: [], vinculados: (bills || []).length };
  const { data: orders, error: osError } = await supabaseAdmin
    .from("service_orders")
    .select("id, type, scheduled_date, processo_omega, multilog_os, multilog_sm")
    .in("id", Array.from(osIds));
  if (osError) throw new Error(osError.message || "Falha ao ler o tipo da OS");
  return { orders: (orders || []).map(mapServiceOrder), vinculados: (bills || []).length };
}

function osPeriodBounds(orders: InvoiceOsRef[]): { periodStart: string | null; periodEnd: string | null } {
  const days = orders
    .map((order) => String(order.scheduledDate || "").slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  if (!days.length) return { periodStart: null, periodEnd: null };
  return { periodStart: days[0], periodEnd: days[days.length - 1] };
}

function descriptionContext(invoice: any, orders: InvoiceOsRef[]) {
  const bounds = osPeriodBounds(orders);
  return {
    description: invoice?.description || null,
    notes: invoice?.notes || null,
    dueDate: invoice?.due_date || null,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    clientName: invoice?.client_name || null,
    multilogItems: orders.map((order) => ({ os: order.multilogOs, sm: order.multilogSm })),
    processosOmega: orders.map((order) => order.processoOmega),
    valorInssRetido: invoice?.valor_inss_retido,
  };
}

export function buildNfsePreview(invoice: any, orders: InvoiceOsRef[], opts?: { incluirSimples?: boolean }) {
  const fiscal = resolveFocusServicoCategoria({
    serviceOrderTypes: orders.map((order) => order.type),
    description: invoice?.description,
  });
  const category: NfseCategoriaFiscal = fiscal.categoria;
  const context = descriptionContext(invoice, orders);
  const periodo = nfsePeriodoLabel({ ...context, description: invoice?.description, notes: invoice?.notes, dueDate: invoice?.due_date });
  return {
    category,
    conflito: fiscal.conflito,
    periodo,
    descricao_servico: buildDefaultNfseDescription({
      category,
      ...context,
      incluirSimples: opts?.incluirSimples !== false,
    }),
    prefixo: nfseCategoryPrefixes(periodo),
    opcoes: NFSE_CATEGORIA_OPCOES,
  };
}

export async function previewFocusNfseForInvoice(invoiceId: number): Promise<{ ok: true; preview: ReturnType<typeof buildNfsePreview> } | { ok: false; message: string }> {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, message: "Fatura inválida" };
  const { data: invoice } = await supabaseAdmin.from("invoices").select("id, client_name, description, notes, due_date, service_order_id, valor_inss_retido").eq("id", id).maybeSingle();
  if (!invoice) return { ok: false, message: "Fatura não encontrada" };
  try {
    const loaded = await loadInvoiceServiceOrders(invoice);
    return { ok: true, preview: buildNfsePreview(invoice, loaded.orders, { incluirSimples: focusOptanteSimples() }) };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Não foi possível montar a descrição da NFS-e." };
  }
}

export async function emitFocusNfseForInvoice(
  invoiceId: number,
  opts?: { source?: string; clientEmail?: string; category?: string | null; descricaoServico?: string | null },
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

  const billingEmail = String(invoice.billing_cnpj || "").replace(/\D/g, "").length === 14
    ? focusTomadorEmail(invoice.billing_email)
    : "";
  const clientEmail = billingEmail
    || (opts?.clientEmail !== undefined
      ? (focusTomadorEmail(opts.clientEmail) || nfseTomadorEmail(client))
      : nfseTomadorEmail(client));
  if (shouldBlockNfEmission(clientEmail)) {
    await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: MISSING_EMAIL_NF_MSG }, focusNfseRef(id), invoice);
    return { ok: false, message: MISSING_EMAIL_NF_MSG };
  }

  const hasBillingTomador = String(invoice.billing_cnpj || "").replace(/\D/g, "").length === 14;
  if (!hasBillingTomador) {
    const fiscalErr = assertFiscalAddressForNf(client, true);
    if (fiscalErr) {
      await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: fiscalErr }, focusNfseRef(id), invoice);
      return { ok: false, message: fiscalErr };
    }
  }

  const prestadorImRaw = String(process.env.FOCUS_PRESTADOR_IM || process.env.FOCUS_IM || "").trim();
  const prestadorIm = resolveFocusPrestadorIm();
  if (!prestadorIm) {
    const msg = prestadorImRaw
      ? "FOCUS_PRESTADOR_IM precisa ser o CCM numérico da Torres em São Paulo (não o nome do ambiente)"
      : "FOCUS_PRESTADOR_IM não configurado (CCM da Torres em São Paulo)";
    await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: msg }, focusNfseRef(id), invoice);
    return { ok: false, message: msg };
  }

  const ref = String(invoice.nfse_ref || "").trim() || focusNfseRef(id);

  const existing = await consultFocusNfse(ref);
  const existingStatus = String(existing?.status || "").toLowerCase();
  if (existing) {
    if (existingStatus === "autorizado" || existingStatus === "autorizada") {
      await persistFocusNfse(id, existing, ref, invoice);
      return { ok: true, message: "NFS-e já emitida na Focus", status: "AUTHORIZED" };
    }
    if (existingStatus === "processando_autorizacao" || existingStatus === "processando") {
      await persistFocusNfse(id, existing, ref, invoice);
      return { ok: true, message: "NFS-e na fila da prefeitura (Focus) — só consulta", status: "PROCESSING" };
    }
    if (existingStatus === "cancelado" || existingStatus === "cancelada"
      || existingStatus === "erro_autorizacao" || existingStatus === "erro") {
      // ref morta: nova tentativa na mesma fatura, sem regravar o erro antigo.
    } else {
      await persistFocusNfse(id, existing, ref, invoice);
      return { ok: true, message: `NFS-e Focus status ${existing.status}`, status: existing.status };
    }
  }

  const tomador = tomadorFrom(invoice, client, clientEmail);
  tomador.codigoMunicipioIbge = await resolveTomadorIbge(tomador);
  const emitRef = existing && /cancel|erro/.test(existingStatus)
    ? `${focusNfseRef(id)}-r${Date.now().toString(36)}`
    : ref;

  let loadedOrders: InvoiceOsRef[] = [];
  let osVinculadas = 0;
  try {
    const loaded = await loadInvoiceServiceOrders(invoice);
    loadedOrders = loaded.orders;
    osVinculadas = loaded.vinculados;
  } catch (e: any) {
    return { ok: false, message: e?.message || "Não foi possível conferir as OS desta fatura. A NF não foi emitida." };
  }
  const semOs = bloqueioNfSemOs(osVinculadas);
  if (semOs) return { ok: false, message: semOs };
  const categoryInformada = parseNfseCategory(opts?.category);
  if (opts?.category != null && String(opts.category).trim() !== "" && !categoryInformada) {
    return { ok: false, message: "Categoria fiscal inválida. Use escolta ou vigilancia." };
  }
  const fiscal = resolveFocusServicoCategoria({
    categoria: categoryInformada,
    serviceOrderTypes: loadedOrders.map((order) => order.type),
    description: invoice.description,
  });
  if (!categoryInformada && fiscal.conflito) {
    return { ok: false, message: "A fatura mistura OS de Vigilância e Escolta. A NFS-e não foi emitida." };
  }
  let descricaoServico: string | undefined;
  if (opts?.descricaoServico != null && String(opts.descricaoServico).trim() !== "") {
    try {
      descricaoServico = sanitizeNfseDescription(opts.descricaoServico);
    } catch (e: any) {
      return { ok: false, message: e?.message || "Descrição da NFS-e inválida." };
    }
  }
  const texto = descriptionContext(invoice, loadedOrders);

  let result: any;
  try {
    const optante = focusOptanteSimples();
    result = await focusRequest("POST", focusNfsenEmitPath(emitRef), buildFocusNfsePayload({
      value: parseFloat(invoice.value),
      description: invoice.description || null,
      tomador,
      categoria: categoryInformada || fiscal.categoria,
      valorInssRetido: invoice.valor_inss_retido,
      prestadorIm,
      optanteSimplesNacional: optante,
      aliquotaSimples: optante ? focusAliquotaSimples() : null,
      descricaoServico,
      notes: texto.notes,
      dueDate: texto.dueDate,
      periodStart: texto.periodStart,
      periodEnd: texto.periodEnd,
      clientName: texto.clientName,
      multilogItems: texto.multilogItems,
      processosOmega: texto.processosOmega,
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
    const keepFiscal = isFocusConnectivityError(msg)
      && invoice?.nfse_error_message
      && !isFocusConnectivityError(invoice.nfse_error_message);
    if (!keepFiscal) {
      await persistFocusNfse(id, { status: "erro_autorizacao", mensagem: msg }, emitRef, invoice);
    }
    return { ok: false, message: msg };
  }

  await persistFocusNfse(id, { ...(result || {}), status: result?.status || "processando_autorizacao", ref: emitRef }, emitRef, invoice);
  console.log(`[focus-nfe] fatura #${id} (${opts?.source || "emit"}): ref=${emitRef} status=${result?.status || "processando"}`);
  return { ok: true, message: `NFS-e ${result?.status || "processando_autorizacao"}`, status: result?.status };
}

export async function syncFocusNfseForInvoice(invoice: any): Promise<{ updates: Record<string, any>; source: string; nf: any | null }> {
  const ref = focusNfseConsultRef(invoice);
  if (!ref || !hasFocusApiToken()) return { updates: {}, source: "none", nf: null };
  try {
    const nf = await consultFocusNfse(ref);
    if (!nf) return { updates: {}, source: "focus-miss", nf: null };
    const updates = nfseUpdatesFromFocusObject(nf, invoice, ref);
    return { updates, source: "focus", nf };
  } catch (e: any) {
    const msg = String(e?.message || "Falha ao consultar Focus").slice(0, 1000);
    if (isFocusConnectivityError(msg) || isNfFullyIssued(invoice?.nfse_status, invoice?.nfse_number)) {
      return { updates: {}, source: "focus-error-keep", nf: null };
    }
    return { updates: { nfse_error_message: msg }, source: "focus-error", nf: null };
  }
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
