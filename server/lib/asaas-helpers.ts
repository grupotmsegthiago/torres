/**
 * Pure helpers da integração Asaas — sem efeitos colaterais nem dependências
 * de runtime (Supabase / Express). Extraídos para permitir testes unitários.
 */

export const TORRES_CNPJ = "36982392000189";

export const CNAE_PRINCIPAL = "7870";
export const CODIGO_SERVICO_MUNICIPAL = "25";
export const CODIGO_SERVICO_MUNICIPAL_CODE = "07870";
export const ISS_ALIQUOTA = 0;
export const DESCRICAO_SERVICO_FIXA =
  "Vigilância, segurança ou monitoramento de bens, pessoas e semoventes";

export const INSS_OBSERVACAO_LEGAL =
  "Retenção de INSS sobre cessão de mão-de-obra (Anexo IV) — Art. 111, II da IN RFB nº 2.110/2022.";
export const INSS_DISPENSA_OBSERVACAO =
  "De acordo com o artigo 115 da IN RFB nº 2.110/2022, a contratante fica dispensada de efetuar a retenção de INSS.";
export const SIMPLES_NACIONAL_OBSERVACAO =
  "Empresa optante pelo Simples Nacional. Dispensada da retenção de PIS, COFINS e CSLL, conforme art. 30 da Lei nº 10.833/2003.";

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const cleanCnpj = (v: string | null | undefined): string =>
  String(v || "").replace(/\D/g, "");

export function buildInvoiceDescription(
  _clientName: string,
  periodoInicio: string,
  periodoFim: string,
  _osCount?: number,
): string {
  const inicioDate = new Date(periodoInicio + "T12:00:00Z");
  const fimDate = new Date(periodoFim + "T12:00:00Z");
  const inicio = inicioDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const fim = fimDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const mesRef = MESES_PT[inicioDate.getUTCMonth()];
  const anoRef = inicioDate.getUTCFullYear();
  return `Referente aos serviços de Escolta Armada - Período: ${inicio} a ${fim} (${mesRef}/${anoRef})`;
}

export function buildInssObservation(
  retemInss: boolean,
  aliquota: number,
  valor: number,
): string {
  if (!retemInss) return INSS_DISPENSA_OBSERVACAO;
  return `${INSS_OBSERVACAO_LEGAL} Alíquota: ${aliquota.toFixed(2)}%. Valor retido: R$ ${valor.toFixed(2).replace(".", ",")}.`;
}

/**
 * Texto com valor BRUTO e LÍQUIDO pro corpo da NF (exigência fiscal).
 * Sem retenção de INSS: bruto == líquido (mostra só o bruto).
 * Com retenção: bruto, INSS retido e líquido (= bruto − INSS).
 * O ISS NÃO é tratado aqui (decisão do dono 23/06/2026: não mexer no ISS).
 */
export function buildValoresObservation(
  grossValue: number,
  retemInss: boolean,
  inssAliquota: number,
): string {
  const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  if (!retemInss) return `Valor bruto: ${brl(grossValue)}.`;
  const inssValor = Number((grossValue * inssAliquota / 100).toFixed(2));
  const liquido = Number((grossValue - inssValor).toFixed(2));
  return `Valor bruto: ${brl(grossValue)}. INSS retido (${inssAliquota.toFixed(2)}%): ${brl(inssValor)}. Valor líquido: ${brl(liquido)}.`;
}

/**
 * Calcula o valor do BOLETO/cobrança (o que o cliente efetivamente paga) quando
 * há retenção de INSS. A NF continua sendo emitida pelo valor BRUTO (com a
 * observação legal da retenção); só a cobrança sai líquida (bruto − INSS retido).
 *
 * - Sem retenção: boleto = bruto, inssValor = 0.
 * - Com retenção: inssValor = bruto × alíquota%, boleto = bruto − inssValor.
 */
export function netBoletoValue(
  grossValue: number,
  opts?: { retemInss?: boolean; inssAliquota?: number },
): { boleto: number; inssValor: number; inssAliquota: number } {
  const retemInss = !!opts?.retemInss;
  const inssAliquota = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  const inssValor = retemInss
    ? Number((grossValue * inssAliquota / 100).toFixed(2))
    : 0;
  const boleto = Number((grossValue - inssValor).toFixed(2));
  return { boleto, inssValor, inssAliquota };
}

export function buildFiscalPayload(
  value: number,
  clientCpfCnpj: string,
  opts?: { retemInss?: boolean; inssAliquota?: number },
): Record<string, any> {
  const retemInss = !!opts?.retemInss;
  const inssAliquota = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((value * inssAliquota / 100).toFixed(2)) : 0;
  const inssObs = buildInssObservation(retemInss, inssAliquota, inssValor);
  return {
    serviceListItem: CODIGO_SERVICO_MUNICIPAL,
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    deductions: 0,
    effectiveDatePeriod: "MONTHLY",
    receivedOnly: false,
    observations: `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. ${inssObs} ${SIMPLES_NACIONAL_OBSERVACAO} ${buildValoresObservation(value, retemInss, inssAliquota)}`.trim(),
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0,
      csll: 0,
      inss: inssAliquota,
      ir: 0,
      pis: 0,
    },
  };
}

export function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function buildNfseInvoicePayload(opts: {
  paymentId: string;
  value: number;
  description: string;
  observations?: string;
  customerId?: string;
  retemInss?: boolean;
  inssAliquota?: number;
  municipalServiceIdOverride?: number;
}): Record<string, any> {
  const retemInss = !!opts.retemInss;
  const inssAliquota = retemInss ? Number(opts.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((opts.value * inssAliquota / 100).toFixed(2)) : 0;
  const inssObs = buildInssObservation(retemInss, inssAliquota, inssValor);
  const baseObs = opts.observations || `CNAE ${CNAE_PRINCIPAL}. ${opts.description || ""}`.trim();
  const serviceDescription =
    (opts.description && opts.description.trim()) || DESCRICAO_SERVICO_FIXA;
  const payload: Record<string, any> = {
    serviceDescription,
    observations: `${baseObs} ${inssObs} ${SIMPLES_NACIONAL_OBSERVACAO} ${buildValoresObservation(opts.value, retemInss, inssAliquota)}`.trim(),
    value: opts.value,
    deductions: 0,
    effectiveDate: todayDateStr(),
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    municipalServiceName: DESCRICAO_SERVICO_FIXA,
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0, csll: 0, inss: inssAliquota, ir: 0, pis: 0,
    },
  };
  if (opts.municipalServiceIdOverride) {
    payload.municipalServiceId = opts.municipalServiceIdOverride;
  }
  if (opts.paymentId) payload.payment = opts.paymentId;
  if (opts.customerId) payload.customer = opts.customerId;
  return payload;
}

export function fmtBRL(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Validação preventiva + captura de erro de NFS-e
// ---------------------------------------------------------------------------

/** Valida e-mail simples (1 endereço; aceita lista separada por vírgula/;). */
export function isValidEmail(raw: string | null | undefined): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  const parts = s.split(/[;,]\s*/).map((e) => e.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return parts.every((e) => re.test(e));
}

/** Mensagem clara e acionável quando a NF não é emitida por falta de e-mail. */
export const MISSING_EMAIL_NF_MSG =
  'NF não emitida: e-mail do cliente ausente ou inválido no cadastro. ' +
  'Preencha o e-mail do cliente e clique em "Resolver agora" para reemitir.';

/**
 * Decide se a emissão de NF deve ser bloqueada ANTES de chamar o Asaas por
 * causa de e-mail do cliente faltando/inválido. Opt-in: `undefined` = caller
 * legado que não informou e-mail ⇒ não bloqueia (mantém comportamento antigo).
 */
export function shouldBlockNfEmission(clientEmail: string | undefined): boolean {
  return clientEmail !== undefined && !isValidEmail(clientEmail);
}

/** Status de NFS-e que indicam erro/rejeição (espelha normalizeInvoiceStatus). */
const NF_ERROR_STATUSES = ["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA"];
const NF_OK_STATUSES = ["AUTHORIZED", "SYNCHRONIZED", "ISSUED"];

export function isNfErrorStatus(status: string | null | undefined): boolean {
  return NF_ERROR_STATUSES.includes(String(status || "").toUpperCase());
}

export function isNfOkStatus(status: string | null | undefined): boolean {
  return NF_OK_STATUSES.includes(String(status || "").toUpperCase());
}

/**
 * Extrai SÓ a mensagem concreta de erro presente no objeto do Asaas, varrendo
 * os campos conhecidos. Retorna `null` quando o Asaas não mandou nenhuma
 * mensagem — assim o caller pode preservar uma mensagem específica já gravada
 * em vez de sobrescrevê-la por um texto genérico.
 */
export function extractConcreteNfErrorMessage(nfObj: any): string | null {
  const candidates = [
    nfObj?.rejectionReason,
    nfObj?.rejectionMessage,
    nfObj?.statusDescription,
    nfObj?.errorMessage,
    nfObj?.error,
    Array.isArray(nfObj?.errors) ? (nfObj.errors[0]?.description || nfObj.errors[0]?.message || nfObj.errors[0]?.code) : undefined,
    nfObj?.observations,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s.slice(0, 1000);
  }
  return null;
}

/** Texto genérico (nunca vazio) quando não há mensagem concreta do Asaas. */
export function genericNfErrorMessage(status?: string | null): string {
  const st = String(status || "ERRO").toUpperCase();
  return `NF com erro no Asaas (status: ${st}). Verifique os dados do cliente (e-mail, endereço, inscrição municipal) e use "Resolver agora" para reemitir.`;
}

export function extractNfErrorMessage(
  nfObj: any,
  status?: string | null,
): string {
  return extractConcreteNfErrorMessage(nfObj) ?? genericNfErrorMessage(status || nfObj?.status);
}

/**
 * Decide qual mensagem gravar em `nfse_error_message` para um status de erro,
 * SEM perder detalhe: prioriza a mensagem concreta do Asaas; se não houver,
 * mantém a mensagem específica já gravada; só cai no genérico se não houver
 * nada. Retorna `null` quando nada muda (evita escrita desnecessária).
 */
export function resolveNfErrorMessage(
  nfObj: any,
  status: string | null | undefined,
  existing: string | null | undefined,
): string {
  const concrete = extractConcreteNfErrorMessage(nfObj);
  if (concrete) return concrete;
  const prev = String(existing || "").trim();
  if (prev) return prev;
  return genericNfErrorMessage(status || nfObj?.status);
}
