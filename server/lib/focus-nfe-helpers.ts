/**
 * Helpers puros da NFS-e Focus NFe.
 * Emissão nova: Ambiente Nacional (/v2/nfsen), JSON plano da DPS.
 * Sem I/O — o HTTP e a persistência ficam em focus-nfe.ts.
 *
 * Reutiliza discriminacao, ISS/INSS e CNPJ oficiais de asaas-helpers.
 * Vigilância (posto) e Escolta têm código nacional e NBS diferentes.
 * O código Paulistana de 5 dígitos não entra na DPS: cTribMun só aceita 3.
 */

import {
  TORRES_CNPJ,
  CODIGO_SERVICO_MUNICIPAL_CODE,
  ISS_ALIQUOTA,
  ISS_RETAIN,
  normalizeMunicipalInscriptionForAsaas,
  cleanCnpj,
  extractStreetNumber,
} from "./asaas-helpers";
import { isFinalNfNumber, isFocusNfseRef, isNfOkStatus } from "../../shared/nfse-status";
import { parseEmailList } from "../../shared/client-emails";
import { isValidCnpj, sanitizeComplement } from "../../shared/nfse-tomador";
import {
  buildDefaultNfseDescription,
  sanitizeNfseDescription,
  type NfseDescriptionInput,
} from "../../shared/nfse-descricao";

export {
  buildDefaultNfseDescription,
  sanitizeNfseDescription,
  cleanNfseDescription,
  nfsePeriodoLabel,
  nfseCategoryPrefix,
  nfseCategoryPrefixes,
  parseNfseCategory,
  swapNfseCategoryPrefix,
  NFSE_DESCRICAO_MAX,
  NFSE_DESCRICAO_MIN,
  NFSE_CATEGORIA_OPCOES,
} from "../../shared/nfse-descricao";
export type { NfseCategoriaFiscal, NfseDescriptionInput } from "../../shared/nfse-descricao";

export { isValidCnpj, sanitizeComplement };

/** Item municipal histórico da Paulistana (vigilância). Não entra na DPS nacional. */
export const FOCUS_ITEM_LISTA_SERVICO = CODIGO_SERVICO_MUNICIPAL_CODE;
export type FocusServicoCategoria = "vigilancia" | "escolta";
/**
 * cTribMun da DPS aceita só 3 dígitos. 07870 e 07897 são o código da Paulistana
 * e a Sefin recusa esse tamanho. A nota nacional identifica o serviço por
 * codigo_tributacao_nacional_iss + NBS.
 */
export const FOCUS_SERVICO_FISCAL: Record<FocusServicoCategoria, {
  codigo_tributacao_nacional_iss: string;
  codigo_nbs: string;
  codigo_paulistana: string;
}> = {
  vigilancia: {
    codigo_tributacao_nacional_iss: "110201",
    codigo_nbs: "118025000",
    codigo_paulistana: "07870",
  },
  escolta: {
    codigo_tributacao_nacional_iss: "110301",
    codigo_nbs: "118023000",
    codigo_paulistana: "07897",
  },
};
export const FOCUS_CODIGO_MUNICIPIO_SP = "3550308";
/** indTotTrib=0: não informa estimativa de tributos (Decreto 8.264/2014). */
export const FOCUS_INDICADOR_TOTAL_TRIBUTACAO_NAO_INFORMA = 0;
/** 3 = optante ME/EPP. 1 = não optante. Campo oficial: codigo_opcao_simples_nacional. */
export const FOCUS_OPCAO_SIMPLES_ME_EPP = 3;
export const FOCUS_OPCAO_SIMPLES_NAO_OPTANTE = 1;
/** 0 = nenhum. No padrão nacional, 6 é sociedade de profissionais, não o Simples. */
export const FOCUS_REGIME_ESPECIAL_NENHUM = 0;
export const FOCUS_TRIBUTACAO_ISS_TRIBUTAVEL = 1;
export const FOCUS_TIPO_RETENCAO_ISS_NAO_RETIDO = 1;
export const FOCUS_TIPO_RETENCAO_ISS_TOMADOR = 2;
export const FOCUS_PROVIDER = "focus";
export const FOCUS_REF_PREFIX = "torres-inv-";
export const FOCUS_API_PRODUCTION_URL = "https://api.focusnfe.com.br";
export const FOCUS_API_HOMOLOG_URL = "https://homologacao.focusnfe.com.br";
/** Schema Paulistana: EmailTomador maxLength 75. */
export const FOCUS_TOMADOR_EMAIL_MAX = 75;

function foldFocusEnv(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isFocusProdLabel(v: string): boolean {
  return v === "producao" || v === "production" || v === "prod";
}

function isFocusHomologLabel(v: string): boolean {
  return v === "homologacao" || v === "homolog" || v === "homologation";
}

/**
 * Homologação só com FOCUS_NFE_ENV explícito em runtime local/dev.
 * Preview da Vercel tem NODE_ENV=production e VERCEL_ENV=preview — se o
 * preview vier primeiro, o Relatório caía em homologacao.focus e o token
 * de produção voltava "Access token inválido".
 */
export function resolveFocusApiBaseUrl(
  focusNfeEnv?: string | null,
  runtime?: { vercelEnv?: string | null; nodeEnv?: string | null },
): string {
  const env = foldFocusEnv(String(focusNfeEnv || ""));
  const vercel = foldFocusEnv(String(runtime?.vercelEnv || ""));
  const node = foldFocusEnv(String(runtime?.nodeEnv || ""));
  if (isFocusProdLabel(env)) return FOCUS_API_PRODUCTION_URL;
  if (isFocusProdLabel(vercel)) return FOCUS_API_PRODUCTION_URL;
  if (isFocusProdLabel(node) && !isFocusHomologLabel(env)) return FOCUS_API_PRODUCTION_URL;
  if (isFocusHomologLabel(env)) return FOCUS_API_HOMOLOG_URL;
  return FOCUS_API_HOMOLOG_URL;
}

export function focusNfsenEmitPath(ref: string): string {
  const r = String(ref || "").trim();
  if (!r) throw new Error("Referência Focus ausente");
  return `/nfsen?ref=${encodeURIComponent(r)}`;
}

export function focusNfsenResourcePath(ref: string): string {
  const r = String(ref || "").trim();
  if (!r) throw new Error("Referência Focus ausente");
  return `/nfsen/${encodeURIComponent(r)}`;
}

/** Notas já autorizadas na Paulistana. Emissão nova não usa este caminho. */
export function focusNfseMunicipalResourcePath(ref: string): string {
  const r = String(ref || "").trim();
  if (!r) throw new Error("Referência Focus ausente");
  return `/nfse/${encodeURIComponent(r)}`;
}

/** Data da DPS no horário de Brasília. O ambiente nacional pede ISO com fuso e competência AAAA-MM-DD. */
export function focusDpsTimestamps(input?: string | Date): { data_emissao: string; data_competencia: string } {
  const date = input == null || input === ""
    ? new Date()
    : input instanceof Date
      ? input
      : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error("Data de emissão da NFS-e inválida");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  const data_competencia = `${pick("year")}-${pick("month")}-${pick("day")}`;
  return {
    data_emissao: `${data_competencia}T${hour}:${pick("minute")}:${pick("second")}-03:00`,
    data_competencia,
  };
}

export function focusNfseRef(invoiceId: number): string {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Fatura inválida para referência Focus NFe");
  return `${FOCUS_REF_PREFIX}${id}`;
}

export { isFocusNfseRef };

export function isFocusManagedInvoice(invoice?: {
  nfse_provider?: string | null;
  nfse_ref?: string | null;
  nfse_number?: string | null;
} | null): boolean {
  if (!invoice) return false;
  if (String(invoice.nfse_provider || "").toLowerCase() === FOCUS_PROVIDER) return true;
  return isFocusNfseRef(invoice.nfse_ref) || isFocusNfseRef(invoice.nfse_number);
}

/** Ref usada na consulta Focus: nfse_ref, senão torres-inv-{id} em NF Focus/PROCESSANDO/ERRO. */
export function focusNfseConsultRef(invoice?: {
  id?: number | null;
  nfse_provider?: string | null;
  nfse_ref?: string | null;
  nfse_number?: string | null;
  nfse_status?: string | null;
} | null): string {
  if (!invoice) return "";
  const fromRef = String(invoice.nfse_ref || "").trim();
  if (fromRef) return fromRef;
  if (isFocusManagedInvoice(invoice)) {
    const n = String(invoice.nfse_number || "").trim();
    if (n) return n;
  }
  const status = String(invoice.nfse_status || "").toUpperCase();
  const tryDefault =
    status === "PROCESSING" ||
    status === "ERROR" ||
    String(invoice.nfse_provider || "").toLowerCase() === FOCUS_PROVIDER ||
    isFocusManagedInvoice(invoice);
  const id = Number(invoice.id);
  if (tryDefault && Number.isFinite(id) && id > 0) return focusNfseRef(id);
  return "";
}

/**
 * Novas emissões vão pela Focus. Documento Asaas vivo (inv_*) continua no Asaas
 * para não gerar duplicidade fiscal.
 */
export function shouldEmitNfseViaFocus(invoice?: {
  nfse_provider?: string | null;
  nfse_ref?: string | null;
  nfse_number?: string | null;
} | null, asaasHasLiveDocument = false): boolean {
  if (isFocusManagedInvoice(invoice)) return true;
  if (asaasHasLiveDocument) return false;
  return true;
}

export function mapFocusStatusToTorres(status: string | null | undefined): string {
  const s = String(status || "").trim().toLowerCase();
  if (s === "autorizado" || s === "autorizada") return "AUTHORIZED";
  if (s === "processando_autorizacao" || s === "processando" || s === "processando_autorização") return "PROCESSING";
  if (s === "erro_autorizacao" || s === "erro_autorização" || s === "erro") return "ERROR";
  if (s === "cancelado" || s === "cancelada" || s === "nfe_cancelada") return "CANCELLED";
  if (s === "erro_cancelamento") return "ERROR";
  if (!s) return "PROCESSING";
  const upper = s.toUpperCase();
  if (["AUTHORIZED", "SYNCHRONIZED", "ISSUED", "ERROR", "ERRO", "CANCELLED", "CANCELED", "PROCESSING", "PENDING", "SCHEDULED"].includes(upper)) {
    return upper === "CANCELED" ? "CANCELLED" : upper;
  }
  return upper;
}

export function extractFocusErrorMessage(obj: any): string | null {
  if (!obj) return null;
  const chunks: string[] = [];
  const push = (v: unknown) => {
    const s = String(v || "").trim();
    if (s) chunks.push(s);
  };
  push(obj.mensagem);
  push(obj.mensagem_erro);
  push(obj.status_sefaz);
  push(obj.mensagem_sefaz);
  const erros = obj.erros || obj.errors;
  if (Array.isArray(erros)) {
    for (const e of erros) {
      if (!e) continue;
      if (typeof e === "string") push(e);
      else push(e.mensagem || e.message || e.codigo);
    }
  }
  const joined = chunks.join(" — ").slice(0, 1000);
  return joined || null;
}

/** Falha de satélite (token/host/rede). Não é recusa da prefeitura — não gravar como erro fiscal. */
export function isFocusConnectivityError(msg: unknown): boolean {
  const s = String(msg || "").toLowerCase();
  return /access token inv[aá]lido|unauthorized|timeout ao chamar a focus|econnrefused|enotfound/.test(s);
}

export function focusMunicipalNumber(nf: any): string | null {
  const candidates = [nf?.numero, nf?.numero_nfse, nf?.number];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    if (isFinalNfNumber(c) && !isFocusNfseRef(c)) return String(c).trim();
  }
  return null;
}

export function isPrefeituraNfseHtmlUrl(u: string): boolean {
  return /nfe\.prefeitura\.sp\.gov\.br/i.test(String(u || ""));
}

/** Um único e-mail do tomador, dentro do teto da Paulistana (75). */
export function focusTomadorEmail(raw: string | null | undefined): string | undefined {
  const emails = parseEmailList(raw);
  return emails.find((e) => e.length > 0 && e.length <= FOCUS_TOMADOR_EMAIL_MAX);
}

export function isLikelyPdfUrl(u: string): boolean {
  const s = String(u || "").trim();
  if (!s) return false;
  if (isPrefeituraNfseHtmlUrl(s)) return false;
  return /\.pdf(\?|#|$)/i.test(s) || /danfse/i.test(s) || /\/DANFSEs\//i.test(s);
}

export function absoluteFocusAssetUrl(raw: string, apiBase?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const base = String(apiBase || FOCUS_API_PRODUCTION_URL).replace(/\/$/, "");
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

export function focusPdfUrl(nf: any, apiBase?: string | null): string | null {
  const candidates = [nf?.url_danfse, nf?.url_pdf, nf?.pdfUrl, nf?.url]
    .map((c) => absoluteFocusAssetUrl(String(c || "").trim(), apiBase))
    .filter(Boolean)
    .filter((u) => !isPrefeituraNfseHtmlUrl(u));
  return candidates.find(isLikelyPdfUrl) || null;
}

export function focusXmlPath(nf: any): string | null {
  const u = nf?.caminho_xml_nota_fiscal || nf?.caminho_xml || nf?.xmlUrl;
  const s = String(u || "").trim();
  return s || null;
}

export function nfseUpdatesFromFocusObject(
  nf: any,
  current: {
    nfse_number?: string | null;
    nfse_url?: string | null;
    nfse_error_message?: string | null;
    nfse_status?: string | null;
    nfse_ref?: string | null;
    nfse_codigo_verificacao?: string | null;
    nfse_xml_path?: string | null;
    nfse_provider?: string | null;
  },
  ref?: string | null,
): Record<string, any> {
  const next: Record<string, any> = {};
  const mapped = mapFocusStatusToTorres(nf?.status);
  if (mapped && mapped !== String(current.nfse_status || "")) next.nfse_status = mapped;
  if (String(current.nfse_provider || "") !== FOCUS_PROVIDER) next.nfse_provider = FOCUS_PROVIDER;

  const desiredRef = String(ref || nf?.ref || current.nfse_ref || "").trim();
  if (desiredRef && desiredRef !== String(current.nfse_ref || "")) next.nfse_ref = desiredRef;

  const municipal = focusMunicipalNumber(nf);
  if (municipal && municipal !== String(current.nfse_number || "")) {
    next.nfse_number = municipal;
  } else if (!isFinalNfNumber(current.nfse_number) && desiredRef && desiredRef !== String(current.nfse_number || "")) {
    next.nfse_number = desiredRef;
  }

  const url = focusPdfUrl(nf);
  if (url && url !== String(current.nfse_url || "")) next.nfse_url = url;

  const xml = focusXmlPath(nf);
  if (xml && xml !== String(current.nfse_xml_path || "")) next.nfse_xml_path = xml;

  const cv = String(nf?.codigo_verificacao || "").trim();
  if (cv && cv !== String(current.nfse_codigo_verificacao || "")) next.nfse_codigo_verificacao = cv;

  const err = extractFocusErrorMessage(nf);
  const st = String(next.nfse_status || mapped || current.nfse_status || "");
  if (st === "ERROR" || st === "ERRO") {
    if (err && err !== String(current.nfse_error_message || "")) next.nfse_error_message = err;
  } else if (isNfOkStatus(st) && isFinalNfNumber(next.nfse_number || current.nfse_number) && current.nfse_error_message) {
    next.nfse_error_message = null;
  } else if (st === "PROCESSING" && current.nfse_error_message) {
    next.nfse_error_message = null;
  }

  return next;
}

function onlyDigits(v: unknown): string {
  return String(v || "").replace(/\D/g, "");
}

function foldCity(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Capitais + municípios SP mais comuns nos tomadores da Torres. */
const IBGE_BY_CITY_UF: Record<string, string> = {
  "sao paulo|sp": "3550308",
  "campinas|sp": "3509502",
  "guarulhos|sp": "3518800",
  "osasco|sp": "3534401",
  "santo andre|sp": "3547809",
  "sao bernardo do campo|sp": "3548708",
  "sao caetano do sul|sp": "3548807",
  "barueri|sp": "3505708",
  "jundiai|sp": "3525904",
  "santos|sp": "3548500",
  "sorocaba|sp": "3552205",
  "ribeirao preto|sp": "3543402",
  "sao jose dos campos|sp": "3549904",
  "piracicaba|sp": "3538709",
  "maua|sp": "3529401",
  "diadema|sp": "3513801",
  "carapicuiba|sp": "3510609",
  "itupeva|sp": "3524006",
  "cajamar|sp": "3509205",
  "embu das artes|sp": "3515004",
  "taboao da serra|sp": "3552809",
  "cotia|sp": "3513009",
  "rio de janeiro|rj": "3304557",
  "serra|es": "3205002",
  "belo horizonte|mg": "3106200",
  "curitiba|pr": "4106902",
  "porto alegre|rs": "4314902",
  "brasilia|df": "5300108",
  "salvador|ba": "2927408",
  "fortaleza|ce": "2304400",
  "recife|pe": "2611606",
  "manaus|am": "1302603",
  "goiania|go": "5208707",
  "belem|pa": "1501402",
  "vitoria|es": "3205309",
  "florianopolis|sc": "4205407",
  "campo grande|ms": "5002704",
  "cuiaba|mt": "5103403",
  "natal|rn": "2408102",
  "joao pessoa|pb": "2507507",
  "maceio|al": "2704302",
  "aracaju|se": "2800308",
  "teresina|pi": "2211001",
  "sao luis|ma": "2111300",
  "palmas|to": "1721000",
  "boa vista|rr": "1400100",
  "macapa|ap": "1600303",
  "rio branco|ac": "1200401",
  "porto velho|ro": "1100205",
};

export function ibgeMunicipioFromCityUf(city?: string | null, uf?: string | null): string | null {
  const u = String(uf || "").trim().toUpperCase();
  const c = foldCity(String(city || ""));
  if (!c || u.length !== 2) return null;
  return IBGE_BY_CITY_UF[`${c}|${u.toLowerCase()}`] || null;
}

export type FocusTomadorInput = {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  inscricaoMunicipal?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  bairro?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  codigoMunicipioIbge?: string | null;
};

function foldFiscal(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenCategoria(raw: string | null | undefined): FocusServicoCategoria | null {
  const t = foldFiscal(String(raw || ""));
  if (!t) return null;
  if (t === "vigilancia" || t === "posto" || t === "posto fisico" || t.startsWith("vigilancia ")) return "vigilancia";
  if (t === "escolta" || t === "escolta armada" || t.startsWith("escolta ")) return "escolta";
  return null;
}

/**
 * A fatura não tem coluna de categoria. A OS guarda `service_orders.type` (hoje "escolta").
 * Sem tipo na OS, a descrição decide: "vigilância" sem "escolta" vira posto; o restante fica escolta,
 * que é o texto padrão da nota (`Referente aos serviços de Escolta Armada`).
 */
export function resolveFocusServicoCategoria(input?: {
  categoria?: string | null;
  serviceOrderTypes?: Array<string | null | undefined> | null;
  description?: string | null;
} | null): { categoria: FocusServicoCategoria; conflito: boolean } {
  const explicit = tokenCategoria(input?.categoria);
  if (explicit) return { categoria: explicit, conflito: false };
  const fromOs = new Set<FocusServicoCategoria>();
  for (const tipo of input?.serviceOrderTypes || []) {
    const categoria = tokenCategoria(tipo);
    if (categoria) fromOs.add(categoria);
  }
  if (fromOs.size > 1) return { categoria: "escolta", conflito: true };
  if (fromOs.size === 1) return { categoria: [...fromOs][0], conflito: false };
  const text = foldFiscal(String(input?.description || ""));
  const hasEscolta = /\bescolta\b/.test(text);
  const hasVigilancia = /\bvigilancia\b/.test(text);
  if (hasVigilancia && !hasEscolta) return { categoria: "vigilancia", conflito: false };
  return { categoria: "escolta", conflito: false };
}

export type FocusNfsePayloadOpts = {
  value: number;
  description?: string | null;
  tomador: FocusTomadorInput;
  /** Categoria explícita. Sem ela, a descrição classifica. */
  categoria?: FocusServicoCategoria | string | null;
  /** Tipos das OS da fatura (`service_orders.type`). */
  serviceOrderTypes?: Array<string | null | undefined> | null;
  /** Valor de INSS já retido na fatura. Só vira `valor_cp` se for maior que zero. */
  valorInssRetido?: number | string | null;
  prestadorIm: string;
  prestadorCnpj?: string;
  dataEmissaoIso?: string;
  optanteSimplesNacional?: boolean;
  /** Alíquota efetiva do Simples. Sem ela, o optante usa `ISS_ALIQUOTA`. */
  aliquotaSimples?: number | null;
  /** IBGE do local da prestação, quando for diferente do município do tomador. */
  codigoMunicipioPrestacao?: string | null;
  /** Texto já conferido no modal. Sem ele, a DPS usa `buildDefaultNfseDescription`. */
  descricaoServico?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  osNumbers?: NfseDescriptionInput["osNumbers"];
  controles?: NfseDescriptionInput["controles"];
  poNumbers?: NfseDescriptionInput["poNumbers"];
  smNumbers?: NfseDescriptionInput["smNumbers"];
};

export function buildFocusNfsePayload(opts: FocusNfsePayloadOpts): Record<string, any> {
  const value = Number(opts.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Valor da NFS-e inválido");
  const prestadorIm = onlyDigits(opts.prestadorIm);
  if (!prestadorIm) throw new Error("Inscrição municipal do prestador (FOCUS_PRESTADOR_IM) não configurada");

  const digits = onlyDigits(opts.tomador.cpfCnpj);
  if (digits.length !== 11 && digits.length !== 14) {
    throw new Error("CPF/CNPJ do tomador inválido para NFS-e");
  }

  const ibgeTomador = String(opts.tomador.codigoMunicipioIbge || "").replace(/\D/g, "")
    || ibgeMunicipioFromCityUf(opts.tomador.city, opts.tomador.state)
    || "";
  if (ibgeTomador.length !== 7) {
    throw new Error(
      `Código IBGE do município do tomador não encontrado (${opts.tomador.city || "?"} / ${opts.tomador.state || "?"}). Confira cidade e CEP no cadastro.`,
    );
  }

  const cep = onlyDigits(opts.tomador.zip);
  if (cep.length !== 8) throw new Error("CEP do tomador deve ter 8 dígitos");

  const ccmTomador = normalizeMunicipalInscriptionForAsaas(opts.tomador.inscricaoMunicipal);
  const phone = onlyDigits(opts.tomador.phone).slice(0, 11);
  const fiscal = resolveFocusServicoCategoria({
    categoria: opts.categoria,
    serviceOrderTypes: opts.serviceOrderTypes,
    description: opts.description,
  });
  if (fiscal.conflito) {
    throw new Error("A fatura mistura Vigilância e Escolta. Separe a NFS-e.");
  }
  const servico = FOCUS_SERVICO_FISCAL[fiscal.categoria];
  const descricaoInformada = String(opts.descricaoServico ?? "").trim();
  const descricaoServico = descricaoInformada
    ? sanitizeNfseDescription(descricaoInformada)
    : buildDefaultNfseDescription({
      category: fiscal.categoria,
      description: opts.description,
      notes: opts.notes,
      dueDate: opts.dueDate,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      osNumbers: opts.osNumbers,
      controles: opts.controles,
      poNumbers: opts.poNumbers,
      smNumbers: opts.smNumbers,
      valorInssRetido: opts.valorInssRetido,
      incluirSimples: opts.optanteSimplesNacional !== false,
    });
  const tomadorInSp = ibgeTomador === FOCUS_CODIGO_MUNICIPIO_SP;
  const prestacaoInformada = onlyDigits(opts.codigoMunicipioPrestacao || "");
  const municipioPrestacao = prestacaoInformada.length === 7
    ? prestacaoInformada
    : (tomadorInSp ? FOCUS_CODIGO_MUNICIPIO_SP : ibgeTomador);
  const optante = opts.optanteSimplesNacional !== false;
  const aliquotaInformada = Number(opts.aliquotaSimples);
  const aliquotaSimples = optante
    ? (Number.isFinite(aliquotaInformada) && aliquotaInformada > 0 && aliquotaInformada <= 100
      ? Number(aliquotaInformada.toFixed(2))
      : ISS_ALIQUOTA)
    : null;
  const inssRetido = Number(opts.valorInssRetido);
  const valorCp = Number.isFinite(inssRetido) && inssRetido > 0 ? Number(inssRetido.toFixed(2)) : null;
  const when = focusDpsTimestamps(opts.dataEmissaoIso);

  const payload: Record<string, any> = {
    data_emissao: when.data_emissao,
    data_competencia: when.data_competencia,
    codigo_municipio_emissora: FOCUS_CODIGO_MUNICIPIO_SP,
    cnpj_prestador: cleanCnpj(opts.prestadorCnpj || TORRES_CNPJ),
    inscricao_municipal_prestador: prestadorIm,
    codigo_opcao_simples_nacional: optante ? FOCUS_OPCAO_SIMPLES_ME_EPP : FOCUS_OPCAO_SIMPLES_NAO_OPTANTE,
    regime_especial_tributacao: FOCUS_REGIME_ESPECIAL_NENHUM,
    razao_social_tomador: String(opts.tomador.name || "").trim().slice(0, 150),
    codigo_municipio_tomador: ibgeTomador,
    cep_tomador: cep,
    logradouro_tomador: String(opts.tomador.address || "").trim().slice(0, 255),
    numero_tomador: extractStreetNumber(opts.tomador.address, opts.tomador.addressNumber) || "S/N",
    bairro_tomador: String(opts.tomador.bairro || "Centro").trim().slice(0, 60),
    codigo_municipio_prestacao: municipioPrestacao,
    codigo_tributacao_nacional_iss: servico.codigo_tributacao_nacional_iss,
    codigo_nbs: servico.codigo_nbs,
    descricao_servico: descricaoServico,
    valor_servico: value,
    tributacao_iss: FOCUS_TRIBUTACAO_ISS_TRIBUTAVEL,
    tipo_retencao_iss: ISS_RETAIN ? FOCUS_TIPO_RETENCAO_ISS_TOMADOR : FOCUS_TIPO_RETENCAO_ISS_NAO_RETIDO,
    indicador_total_tributacao: FOCUS_INDICADOR_TOTAL_TRIBUTACAO_NAO_INFORMA,
  };
  if (aliquotaSimples != null) payload.percentual_aliquota_relativa_municipio = aliquotaSimples;
  if (digits.length === 14) payload.cnpj_tomador = digits;
  else payload.cpf_tomador = digits;
  const email = focusTomadorEmail(opts.tomador.email);
  if (email) payload.email_tomador = email;
  const complemento = sanitizeComplement(opts.tomador.complement);
  if (complemento) payload.complemento_tomador = complemento;
  if (tomadorInSp && ccmTomador) payload.inscricao_municipal_tomador = ccmTomador;
  if (phone.length >= 10) payload.telefone_tomador = phone;
  if (valorCp != null) payload.valor_cp = valorCp;
  return payload;
}

export function focusCancelJustification(reason?: string | null): string {
  const s = String(reason || "").trim();
  if (s.length >= 15) return s.slice(0, 255);
  return "Cancelamento solicitado pela diretoria no sistema Torres.";
}
