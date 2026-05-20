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
    observations: `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. ${inssObs}`.trim(),
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
    observations: `${baseObs} ${inssObs}`.trim(),
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
