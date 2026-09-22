/**
 * Helpers puros da NFS-e Focus NFe (São Paulo / Nota Fiscal Paulistana).
 * Sem I/O — o HTTP e a persistência ficam em focus-nfe.ts.
 *
 * Reutiliza discriminacao, ISS/INSS e CNPJ oficiais de asaas-helpers.
 */

import {
  TORRES_CNPJ,
  CODIGO_SERVICO_MUNICIPAL_CODE,
  ISS_ALIQUOTA,
  ISS_RETAIN,
  buildServicoDiscriminacao,
  inssAliquotaEfetiva,
  normalizeMunicipalInscriptionForAsaas,
  cleanCnpj,
  extractStreetNumber,
} from "./asaas-helpers";
import { isFinalNfNumber, isFocusNfseRef, isNfOkStatus } from "../../shared/nfse-status";

/** Paulistana: item da lista municipal (Focus SP usa 7870; Torres homologou 07870). LC 116 11.02 não é aceito como 1102. */
export const FOCUS_ITEM_LISTA_SERVICO = CODIGO_SERVICO_MUNICIPAL_CODE;
export const FOCUS_CODIGO_MUNICIPIO_SP = "3550308";
export const FOCUS_NATUREZA_OPERACAO = "1";
export const FOCUS_REGIME_SIMPLES_ME_EPP = "6";
export const FOCUS_PROVIDER = "focus";
export const FOCUS_REF_PREFIX = "torres-inv-";
export const FOCUS_API_PRODUCTION_URL = "https://api.focusnfe.com.br";
export const FOCUS_API_HOMOLOG_URL = "https://homologacao.focusnfe.com.br";

function foldFocusEnv(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Homologação só em runtime local/dev. Em Vercel/Node production a API é
 * sempre api.focusnfe.com.br — senão o Relatório consulta homologacao.focus
 * e a NF real some.
 */
export function resolveFocusApiBaseUrl(
  focusNfeEnv?: string | null,
  runtime?: { vercelEnv?: string | null; nodeEnv?: string | null },
): string {
  const rt = foldFocusEnv(String(runtime?.vercelEnv || runtime?.nodeEnv || ""));
  if (rt === "production" || rt === "prod") return FOCUS_API_PRODUCTION_URL;
  const env = foldFocusEnv(String(focusNfeEnv || ""));
  if (env === "producao" || env === "production" || env === "prod") {
    return FOCUS_API_PRODUCTION_URL;
  }
  return FOCUS_API_HOMOLOG_URL;
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

export function focusMunicipalNumber(nf: any): string | null {
  const candidates = [nf?.numero, nf?.numero_nfse, nf?.number];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    if (isFinalNfNumber(c) && !isFocusNfseRef(c)) return String(c).trim();
  }
  return null;
}

export function isLikelyPdfUrl(u: string): boolean {
  const s = String(u || "").trim();
  if (!s) return false;
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
    .filter(Boolean);
  const pdf = candidates.find(isLikelyPdfUrl);
  return pdf || candidates[0] || null;
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

export type FocusNfsePayloadOpts = {
  value: number;
  description?: string | null;
  tomador: FocusTomadorInput;
  retemInss?: boolean;
  inssAliquota?: number;
  prestadorIm: string;
  prestadorCnpj?: string;
  dataEmissaoIso?: string;
  optanteSimplesNacional?: boolean;
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

  const issValor = Number((value * ISS_ALIQUOTA / 100).toFixed(2));
  const inssAliq = inssAliquotaEfetiva(!!opts.retemInss, opts.inssAliquota ?? 11);
  const inssValor = Number((value * inssAliq / 100).toFixed(2));
  const ccmTomador = normalizeMunicipalInscriptionForAsaas(opts.tomador.inscricaoMunicipal);
  const phone = onlyDigits(opts.tomador.phone).slice(0, 11);

  const tomador: Record<string, any> = {
    razao_social: String(opts.tomador.name || "").trim().slice(0, 115),
    email: String(opts.tomador.email || "").trim().slice(0, 80) || undefined,
    endereco: {
      logradouro: String(opts.tomador.address || "").trim().slice(0, 125),
      numero: extractStreetNumber(opts.tomador.address, opts.tomador.addressNumber) || "S/N",
      complemento: String(opts.tomador.complement || "").trim().slice(0, 60) || undefined,
      bairro: String(opts.tomador.bairro || "Centro").trim().slice(0, 60),
      codigo_municipio: ibgeTomador,
      uf: String(opts.tomador.state || "").trim().toUpperCase().slice(0, 2),
      cep,
    },
  };
  if (digits.length === 14) tomador.cnpj = digits;
  else tomador.cpf = digits;
  if (ccmTomador) tomador.inscricao_municipal = ccmTomador;
  if (phone.length >= 10) tomador.telefone = phone;

  const servico: Record<string, any> = {
    valor_servicos: value,
    iss_retido: ISS_RETAIN,
    item_lista_servico: FOCUS_ITEM_LISTA_SERVICO,
    codigo_tributario_municipio: CODIGO_SERVICO_MUNICIPAL_CODE,
    discriminacao: buildServicoDiscriminacao({ description: opts.description }),
    codigo_municipio: FOCUS_CODIGO_MUNICIPIO_SP,
    aliquota: ISS_ALIQUOTA,
    base_calculo: value,
    valor_iss: issValor,
  };
  if (ISS_RETAIN) servico.valor_iss_retido = issValor;
  if (inssValor > 0) servico.valor_inss = inssValor;

  const optante = opts.optanteSimplesNacional !== false;
  return {
    data_emissao: opts.dataEmissaoIso || new Date().toISOString(),
    natureza_operacao: FOCUS_NATUREZA_OPERACAO,
    optante_simples_nacional: optante,
    incentivador_cultural: false,
    regime_especial_tributacao: optante ? FOCUS_REGIME_SIMPLES_ME_EPP : undefined,
    prestador: {
      cnpj: cleanCnpj(opts.prestadorCnpj || TORRES_CNPJ),
      inscricao_municipal: prestadorIm,
      codigo_municipio: FOCUS_CODIGO_MUNICIPIO_SP,
    },
    tomador,
    servico,
  };
}

export function focusCancelJustification(reason?: string | null): string {
  const s = String(reason || "").trim();
  if (s.length >= 15) return s.slice(0, 255);
  return "Cancelamento solicitado pela diretoria no sistema Torres.";
}
