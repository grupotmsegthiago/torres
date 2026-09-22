/**
 * Pure helpers da integração Asaas — sem efeitos colaterais nem dependências
 * de runtime (Supabase / Express). Extraídos para permitir testes unitários.
 */

import {
  isNfOkStatus,
  isFinalNfNumber,
  isNfFullyIssued,
  classifyIssuedOrProcessing,
} from "../../shared/nfse-status";

export {
  isNfOkStatus,
  isFinalNfNumber,
  isNfFullyIssued,
  classifyIssuedOrProcessing,
  isLocalNfProcessingPlaceholder,
  isQueuedAtPrefecture,
} from "../../shared/nfse-status";

export const TORRES_CNPJ = "36982392000189";

export const CNAE_PRINCIPAL = "7870";
export const CODIGO_SERVICO_MUNICIPAL = "25";
export const CODIGO_SERVICO_MUNICIPAL_CODE = "07870";
/**
 * ID interno Asaas do 07870 | 11.02 — só para consulta/log.
 * POST /invoices segue a TM: municipalServiceCode `"07870"`, sem municipalServiceId.
 */
export const MUNICIPAL_SERVICE_ID_DEFAULT = 402;
export const MUNICIPAL_SERVICE_EXTERNAL_ID = 402;

/** Sempre texto `"402"`. Número vira 402.0 no log do Asaas e a prefeitura rejeita. */
export function asMunicipalServiceIdString(raw?: number | string | null): string {
  const n = parseInt(String(raw ?? MUNICIPAL_SERVICE_ID_DEFAULT), 10);
  const id = Number.isFinite(n) && n > 0 ? n : MUNICIPAL_SERVICE_ID_DEFAULT;
  return String(id);
}

/** Recorte do JSON que vai no fio — para log e para o Natan conferir as aspas. */
export function summarizeNfseWirePayload(body: Record<string, any>): Record<string, unknown> {
  const id = body?.municipalServiceId;
  return {
    municipalServiceId: id ?? null,
    municipalServiceIdType: typeof id,
    municipalServiceIdJson: JSON.stringify(id),
    municipalServiceCode: Object.prototype.hasOwnProperty.call(body, "municipalServiceCode")
      ? body.municipalServiceCode
      : "(omitido)",
    municipalServiceName: body?.municipalServiceName ?? null,
    municipalServiceExternalId: body?.municipalServiceExternalId ?? "(omitido)",
    taxes: body?.taxes ?? null,
  };
}
/** ISS 5% retido na NFS-e e no boleto quando emite NF. */
export const ISS_ALIQUOTA = 5;
export const ISS_RETAIN = true;
/** INSS 11% integral na NF/boleto (sem reduzir a 50% da base). */
export const INSS_BASE_FRACTION = 1;
export const DESCRICAO_SERVICO_FIXA =
  "Vigilância, segurança ou monitoramento de bens, pessoas e semoventes";

/** Nome do serviço no padrão TM SEG: "07870 - descrição". Código NÃO vai na discriminação (NFe003). */
export function municipalServiceNameOficial(): string {
  return `${CODIGO_SERVICO_MUNICIPAL_CODE} - ${DESCRICAO_SERVICO_FIXA}`;
}

/** Discriminacao municipal (SP) — texto do serviço. Observações da NF: 250 caracteres. */
export const NF_DISCRIMINACAO_MAX = 2000;
export const NF_OBSERVATIONS_MAX = 250;

export const INSS_OBSERVACAO_LEGAL =
  "Retenção de INSS sobre cessão de mão-de-obra (Anexo IV) — Art. 111, II da IN RFB nº 2.110/2022.";
export const INSS_DISPENSA_OBSERVACAO =
  "De acordo com o artigo 115 da IN RFB nº 2.110/2022, a contratante fica dispensada de efetuar a retenção de INSS.";
export const SIMPLES_NACIONAL_OBSERVACAO =
  "Empresa optante pelo Simples Nacional. Dispensada da retenção de PIS, COFINS e CSLL, conforme art. 30 da Lei nº 10.833/2003.";

/** Textos oficiais na discriminação do boleto Asaas e da NFS-e Focus (pedido do proprietário). */
export const NF_INSS_ANEXO_IV_TEXTO =
  "Retenção de INSS sobre cessão de mão-de-obra (ANEXO IV) - Art. 111, II da IN RFB nº 2.110/2022";
export const NF_SIMPLES_NACIONAL_TEXTO =
  "Empresa optante pelo Simples Nacional. Não sujeita à retenção das contribuições conforme art. 30 da Lei 10.833/2003";

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

/**
 * Chave PIX aleatória da empresa, exibida como opção de pagamento no e-mail
 * padrão de envio de NF de Escolta Armada ao cliente (modelo do financeiro).
 */
export const EMPRESA_PIX_ALEATORIA = "8165456b-57f5-4a6c-a633-fa0d004a89db";

/**
 * Extrai Competência (Mês/Ano) e Data de Execução (período) a partir da
 * descrição da fatura, que segue o formato fixo de buildInvoiceDescription:
 *   "Referente aos serviços de Escolta Armada - Período: DD/MM/YYYY a DD/MM/YYYY (Mês/Ano)"
 * Quando a descrição não casa, faz fallback da competência pelo vencimento.
 */
export function parseInvoicePeriodInfo(
  description: string | null | undefined,
  dueDateISO?: string | null,
): { competencia: string; dataExecucao: string } {
  const desc = String(description || "");
  const m = desc.match(
    /Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\(([^)]+)\))?/i,
  );
  if (m) {
    const inicio = m[1];
    const fim = m[2];
    let competencia = (m[3] || "").trim();
    if (!competencia) {
      const mm = Number(inicio.slice(3, 5)) - 1;
      const yyyy = inicio.slice(6, 10);
      if (mm >= 0 && mm < 12) competencia = `${MESES_PT[mm]}/${yyyy}`;
    }
    const dataExecucao = inicio === fim ? inicio : `${inicio} a ${fim}`;
    return { competencia, dataExecucao };
  }
  let competencia = "";
  if (dueDateISO) {
    const d = new Date(String(dueDateISO).slice(0, 10) + "T12:00:00Z");
    if (!isNaN(d.getTime())) {
      competencia = `${MESES_PT[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
    }
  }
  return { competencia, dataExecucao: "" };
}

/**
 * Número "limpo" da NF para exibição. nfse_number pode vir como id interno do
 * Asaas ("inv_...") — que NÃO é número fiscal — e nesse caso retorna null.
 * Número definitivo e "RPS-N" provisório (usado como fallback em outros pontos
 * do sistema) são exibidos como estão.
 */
export function formatNfNumber(nfseNumber: string | null | undefined): string | null {
  const n = String(nfseNumber || "").trim();
  if (!n) return null;
  if (n.toLowerCase().startsWith("inv_")) return null;
  if (/^torres-inv-/i.test(n)) return null;
  return n;
}

/**
 * Monta o e-mail PADRÃO de envio de NF de Escolta Armada ao cliente (modelo do
 * financeiro). Retorna { subject, html }. Função pura/testável — o envio SMTP
 * fica no chamador (sendBillingEmail). Campos:
 *   Competência / Data de Execução / Nº da NF / Serviço Prestado / Valor Total
 *   + opções de pagamento (Boleto Bancário ou PIX copia-e-cola dinâmico do Asaas,
 *     que permite BAIXA AUTOMÁTICA — só aparece quando a fatura tem pix_copia_e_cola).
 * Quando há retenção de INSS, mostra a retenção e o líquido a pagar.
 */
export function buildNfClientEmail(invoice: {
  client_name?: string | null;
  value: number;
  due_date: string;
  description?: string | null;
  bank_slip_url?: string | null;
  nfse_url?: string | null;
  nfse_number?: string | null;
  pix_copia_e_cola?: string | null;
  valor_inss_retido?: number | string | null;
  inss_aliquota?: number | string | null;
  valor_iss_retido?: number | string | null;
  iss_aliquota?: number | string | null;
}): { subject: string; html: string } {
  const dueDateFormatted = new Date(invoice.due_date + "T12:00:00").toLocaleDateString("pt-BR");
  const valueFormatted = fmtBRL(invoice.value);
  const inssRetido = Number(invoice.valor_inss_retido || 0);
  const issRetido = invoice.valor_iss_retido != null && invoice.valor_iss_retido !== ""
    ? Number(invoice.valor_iss_retido)
    : (ISS_RETAIN ? Number((Number(invoice.value || 0) * ISS_ALIQUOTA / 100).toFixed(2)) : 0);
  const temInss = inssRetido > 0.005;
  const temIss = issRetido > 0.005;
  const inssAliq = Number(invoice.inss_aliquota || 0);
  const issAliq = Number(invoice.iss_aliquota || ISS_ALIQUOTA);
  const liquidoPagar = Number((invoice.value - inssRetido - issRetido).toFixed(2));
  const liquidoFormatted = fmtBRL(liquidoPagar);
  const inssFormatted = fmtBRL(inssRetido);
  const issFormatted = fmtBRL(issRetido);

  const pixCode = String(invoice.pix_copia_e_cola || "").trim();
  const { competencia, dataExecucao } = parseInvoicePeriodInfo(invoice.description, invoice.due_date);
  const nfNumber = formatNfNumber(invoice.nfse_number);
  const subject = nfNumber
    ? `Prestação de Serviço de Escolta Armada Torres – NF nº ${nfNumber}`
    : `Prestação de Serviço de Escolta Armada Torres`;

  const links: string[] = [];
  if (invoice.bank_slip_url) {
    links.push(`<a href="${invoice.bank_slip_url}" style="display:inline-block;background:#0066cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">🏦 BOLETO BANCÁRIO</a>`);
  }
  if (invoice.nfse_url) {
    links.push(`<a href="${invoice.nfse_url}" style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">📋 NOTA FISCAL</a>`);
  }

  const infoRow = (label: string, val: string) =>
    `<tr><td style="padding:5px 0;color:#666;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:5px 0;font-weight:bold;text-align:right;color:#1a1a2e;">${val}</td></tr>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Torres Vigilância Patrimonial</h1>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Escolta Armada</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">Prezados,</p>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 16px;">
      Encaminhamos abaixo as informações referentes à prestação de serviço de escolta armada:
    </p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table style="width:100%;font-size:13px;color:#333;">
        ${infoRow("Competência:", competencia || "—")}
        ${infoRow("Data de Execução:", dataExecucao || "—")}
        ${infoRow("Nº da Nota Fiscal:", nfNumber || "—")}
        ${infoRow("Serviço Prestado:", "Escolta Armada")}
        ${infoRow("Valor Total da Prestação de Serviço:", valueFormatted)}
        ${temInss ? infoRow(`(-) Retenção INSS${inssAliq ? ` (${inssAliq.toFixed(2).replace(".", ",")}%)` : ""}:`, `- ${inssFormatted}`) : ""}
        ${temIss ? infoRow(`(-) Retenção ISS${issAliq ? ` (${issAliq.toFixed(2).replace(".", ",")}%)` : ""}:`, `- ${issFormatted}`) : ""}
        ${(temInss || temIss) ? infoRow("Valor líquido a pagar:", liquidoFormatted) : ""}
        ${infoRow("Vencimento:", dueDateFormatted)}
      </table>
    </div>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 8px;">
      Para pagamento, disponibilizamos as seguintes opções:
    </p>
    <ul style="font-size:13px;color:#333;line-height:1.6;margin:0 0 16px;padding-left:20px;">
      <li><strong>Boleto Bancário</strong></li>
      ${pixCode ? `<li><strong>PIX (Copia e Cola):</strong></li>` : ``}
    </ul>
    ${pixCode ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:0 0 20px;">
      <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:12px;color:#166534;text-align:center;">
        ${pixCode}
      </div>
    </div>` : ``}
    ${links.length > 0 ? `<div style="text-align:center;margin:20px 0;">${links.join("\n")}</div>` : ""}
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:20px 0 0;">
      Permanecemos à disposição para quaisquer esclarecimentos.
    </p>
    <p style="font-size:12px;color:#888;line-height:1.5;margin:16px 0 0;">
      Em caso de dúvidas, entre em contato conosco pelo e-mail 
      <a href="mailto:diretoria@torresseguranca.com.br" style="color:#1a1a2e;">diretoria@torresseguranca.com.br</a> 
      ou pelo telefone (11) 96369-6699.
    </p>
  </div>
  <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#888;font-size:11px;margin:2px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
    <p style="color:#999;font-size:10px;margin:2px 0;">CNPJ 36.982.392/0001-89</p>
    <p style="color:#999;font-size:10px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ escolta@torresseguranca.com.br</p>
  </div>
</div>
</body></html>`;

  return { subject, html };
}

export function inssAliquotaEfetiva(retemInss: boolean, legalAliquota?: number): number {
  if (!retemInss) return 0;
  return Number((Number(legalAliquota ?? 11) * INSS_BASE_FRACTION).toFixed(2));
}

/** Quando emite NFS-e: INSS 11% + ISS 5% no boleto. Sem NF, só INSS se o cliente retém. */
export function boletoRetentionOpts(emiteNf: boolean, retemInss: boolean, inssAliquota?: number) {
  return {
    retemInss: emiteNf || retemInss,
    inssAliquota: emiteNf ? 11 : Number(inssAliquota ?? 11),
    retainIss: ISS_RETAIN && emiteNf,
  };
}

export function nfPeriodoPhrase(description?: string | null, extra?: string | null): string {
  const from = (text: string) => {
    const m = String(text || "").match(
      /Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})(?:\s*\(([^)]+)\))?/i,
    );
    if (!m) return "";
    let comp = (m[3] || "").trim();
    if (!comp) {
      const mm = Number(m[1].slice(3, 5)) - 1;
      const yyyy = m[1].slice(6, 10);
      if (mm >= 0 && mm < 12) comp = `${MESES_PT[mm]}/${yyyy}`;
    }
    return `${m[1]} a ${m[2]} (${comp})`;
  };
  return from(description || "") || from(extra || "");
}

export function extractStreetNumber(
  address?: string | null,
  addressNumber?: string | null,
): string {
  const explicit = String(addressNumber || "").trim();
  if (explicit) return explicit.slice(0, 10);
  const addr = String(address || "");
  const m = addr.match(/,\s*(\d+)\b/) || addr.match(/\s(\d+)\s*(?:,|$)/);
  return (m?.[1] || "").slice(0, 10);
}

function servicoHeaderFromDescription(description?: string | null, extra?: string | null): string {
  const desc = String(description || "").trim();
  const firstLine = desc.split(/\n/)[0].replace(/\s+/g, " ").trim();
  const periodo = nfPeriodoPhrase(desc, extra);
  const hasEscolta = /escolta\s+armada/i.test(desc);
  const hasPeriodo = /per[ií]odo:/i.test(desc);
  const isCnaeOnly = firstLine && sanitizeNfDiscriminacao(firstLine) === nfDiscriminacaoOficial();
  if (hasEscolta && hasPeriodo) return firstLine;
  if (periodo) return `Referente aos serviços de Escolta Armada - Período: ${periodo}`;
  if (hasEscolta && firstLine) return firstLine;
  if (firstLine && !isCnaeOnly) return `Referente aos serviços de Escolta Armada. ${firstLine}`;
  return "Referente aos serviços de Escolta Armada";
}

/**
 * Discriminação conjunta boleto + NFS-e: escolta, período e textos legais (INSS Anexo IV + Simples).
 * Focus aceita quebras de linha; Asaas description é a mesma frase em uma linha (500).
 */
export function buildServicoDiscriminacao(opts?: {
  description?: string | null;
  observationsHint?: string | null;
}): string {
  const raw = String(opts?.description || "");
  if (/ANEXO IV/i.test(raw) && /Simples Nacional/i.test(raw) && /escolta\s+armada/i.test(raw)) {
    return sanitizeFocusDiscriminacao(raw);
  }
  const header = servicoHeaderFromDescription(opts?.description, opts?.observationsHint);
  return sanitizeFocusDiscriminacao(
    [header, NF_INSS_ANEXO_IV_TEXTO, NF_SIMPLES_NACIONAL_TEXTO].join("\n"),
  );
}

export function asaasBoletoDescription(
  description?: string | null,
  extra?: string | null,
): string {
  return buildServicoDiscriminacao({ description, observationsHint: extra })
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function sanitizeFocusDiscriminacao(raw: string | null | undefined): string {
  let s = String(raw || "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s) s = "Referente aos serviços de Escolta Armada";
  return s.slice(0, NF_DISCRIMINACAO_MAX);
}

function nfObsBRL(v: number): string {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

/**
 * Observação da NFS-e (Asaas): resumo do modelo do financeiro, ≤ 250 caracteres.
 * Parametriza período, alíquota e valores; Discriminacao continua o CNAE oficial.
 */
export function buildNfseObservations(opts: {
  value: number;
  description?: string | null;
  observationsHint?: string | null;
  retemInss?: boolean;
  inssAliquota?: number;
  retainIss?: boolean;
}): string {
  const value = Number(opts.value || 0);
  const periodo = nfPeriodoPhrase(opts.description, opts.observationsHint);
  const retemInss = !!opts.retemInss;
  const legal = retemInss ? Number(opts.inssAliquota ?? 11) : 0;
  const efetiva = inssAliquotaEfetiva(retemInss, legal);
  const inssValor = Number((value * efetiva / 100).toFixed(2));
  const retainIss = opts.retainIss !== false && ISS_RETAIN;
  const issAliq = retainIss ? ISS_ALIQUOTA : 0;
  const issValor = Number((value * issAliq / 100).toFixed(2));
  const liquido = Number((value - inssValor - issValor).toFixed(2));
  const aliqTxt = efetiva.toFixed(2).replace(".", ",");
  const servico = periodo
    ? `Referente aos serviços de Escolta Armada - Período: ${periodo}`
    : "Referente aos serviços de Escolta Armada";
  const servicoCurto = periodo
    ? `Escolta Armada - Período: ${periodo}`
    : "Escolta Armada";
  const inssLong = retemInss
    ? `INSS Anexo IV Art.111 II IN RFB 2.110/2022. Alíquota: ${aliqTxt}%. Valor retido: ${nfObsBRL(inssValor)}.`
    : "Sem retenção INSS (Art.115 IN RFB 2.110/2022).";
  const inssCurto = retemInss
    ? `INSS Anexo IV Art.111 II IN 2.110/2022 Aliq ${aliqTxt}% ret. ${nfObsBRL(inssValor)}.`
    : "Sem ret. INSS (Art.115 IN 2.110/2022).";
  const issBit = issValor > 0.005 ? ` ISS ${issAliq.toFixed(0)}% ret. ${nfObsBRL(issValor)}.` : "";
  const valoresLong = `Valor bruto: ${nfObsBRL(value)}.${retemInss ? ` INSS retido (${aliqTxt}%): ${nfObsBRL(inssValor)}.` : ""}${issValor > 0.005 ? ` ISS retido (${issAliq.toFixed(0)}%): ${nfObsBRL(issValor)}.` : ""}${inssValor > 0.005 || issValor > 0.005 ? ` Valor líquido: ${nfObsBRL(liquido)}.` : ""}`;
  const valoresMini = `Bruto ${nfObsBRL(value)}.${issValor > 0.005 ? ` ISS ${nfObsBRL(issValor)}.` : ""}${inssValor > 0.005 || issValor > 0.005 ? ` Liq ${nfObsBRL(liquido)}.` : ""}`;
  const simplesLong = "Empresa optante pelo Simples Nacional. Dispensada da retenção de PIS, COFINS e CSLL (Lei 10.833/03 art.30).";
  const simplesCurto = "Simples Nac. s/ PIS/COFINS/CSLL (Lei 10.833/03 art.30).";

  const pack = (...parts: string[]) => parts.join(" ").replace(/\s+/g, " ").trim();
  const candidates = [
    pack(`CNAE ${CNAE_PRINCIPAL}. ${servico}.`, inssLong, simplesLong, valoresLong),
    pack(`CNAE ${CNAE_PRINCIPAL}. ${servico}.`, inssCurto + issBit, simplesCurto, valoresMini),
    pack(`CNAE ${CNAE_PRINCIPAL}. ${servicoCurto}.`, inssCurto + issBit, simplesCurto, valoresMini),
    pack(`CNAE ${CNAE_PRINCIPAL}. ${servicoCurto}.`, inssCurto, simplesCurto, valoresMini),
    pack(`CNAE ${CNAE_PRINCIPAL}. ${servicoCurto}.`, inssCurto, simplesCurto, `Bruto ${nfObsBRL(value)}. Liq ${nfObsBRL(liquido)}.`),
  ];
  const fit = candidates.find((c) => c.length <= NF_OBSERVATIONS_MAX);
  if (fit) return fit;
  return candidates[candidates.length - 1].slice(0, NF_OBSERVATIONS_MAX).trim();
}

export function buildIssObservation(issValor: number, issAliquota: number = ISS_ALIQUOTA): string {
  if (issValor <= 0.005) return "";
  return `ISS ${issAliquota.toFixed(2)}% retido pelo tomador: R$ ${issValor.toFixed(2).replace(".", ",")}.`;
}

export function buildInssObservation(
  retemInss: boolean,
  aliquotaLegal: number,
  valor: number,
): string {
  if (!retemInss) return INSS_DISPENSA_OBSERVACAO;
  const efetiva = inssAliquotaEfetiva(true, aliquotaLegal);
  return `${INSS_OBSERVACAO_LEGAL} Alíquota legal: ${aliquotaLegal.toFixed(2)}% sobre ${Math.round(INSS_BASE_FRACTION * 100)}% da base (efetivo ${efetiva.toFixed(2)}%). Valor retido: R$ ${valor.toFixed(2).replace(".", ",")}.`;
}

/**
 * Texto com valor BRUTO e LÍQUIDO pro corpo da NF (exigência fiscal).
 * Sem retenção de INSS: ainda pode mostrar ISS 5% e o líquido.
 * Com retenção: bruto, INSS 11% integral, ISS 5% e líquido.
 */
export function buildValoresObservation(
  grossValue: number,
  retemInss: boolean,
  inssAliquotaLegal: number,
  opts?: { retainIss?: boolean; issAliquota?: number },
): string {
  const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const inssAliq = inssAliquotaEfetiva(retemInss, inssAliquotaLegal);
  const inssValor = Number((grossValue * inssAliq / 100).toFixed(2));
  const retainIss = opts?.retainIss !== false && ISS_RETAIN;
  const issAliq = retainIss ? Number(opts?.issAliquota ?? ISS_ALIQUOTA) : 0;
  const issValor = Number((grossValue * issAliq / 100).toFixed(2));
  const liquido = Number((grossValue - inssValor - issValor).toFixed(2));
  const parts = [`Valor bruto: ${brl(grossValue)}.`];
  if (inssValor > 0.005) {
    parts.push(`INSS retido (${inssAliq.toFixed(2)}% = ${Number(inssAliquotaLegal || 11).toFixed(2)}% sobre ${Math.round(INSS_BASE_FRACTION * 100)}% da base): ${brl(inssValor)}.`);
  }
  if (issValor > 0.005) {
    parts.push(`ISS retido (${issAliq.toFixed(2)}%): ${brl(issValor)}.`);
  }
  if (inssValor > 0.005 || issValor > 0.005) {
    parts.push(`Valor líquido: ${brl(liquido)}.`);
  }
  return parts.join(" ");
}

/**
 * Calcula o valor do BOLETO/cobrança (o que o cliente efetivamente paga).
 * A NF continua no valor BRUTO; o boleto desconta as retenções da NF:
 * INSS integral (11% se retemInss) e ISS 5% (se retainIss).
 */
export function netBoletoValue(
  grossValue: number,
  opts?: { retemInss?: boolean; inssAliquota?: number; retainIss?: boolean; issAliquota?: number },
): { boleto: number; inssValor: number; inssAliquota: number; issValor: number; issAliquota: number } {
  const retemInss = !!opts?.retemInss;
  const inssAliquotaLegal = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  const inssAliquota = inssAliquotaEfetiva(retemInss, inssAliquotaLegal);
  const inssValor = Number((grossValue * inssAliquota / 100).toFixed(2));
  const retainIss = opts?.retainIss === true;
  const issAliquota = retainIss ? Number(opts?.issAliquota ?? ISS_ALIQUOTA) : 0;
  const issValor = Number((grossValue * issAliquota / 100).toFixed(2));
  const boleto = Number((grossValue - inssValor - issValor).toFixed(2));
  return { boleto, inssValor, inssAliquota, issValor, issAliquota };
}

export function buildFiscalPayload(
  value: number,
  clientCpfCnpj: string,
  opts?: { retemInss?: boolean; inssAliquota?: number },
): Record<string, any> {
  const retemInss = !!opts?.retemInss;
  const inssAliquotaLegal = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  return {
    serviceListItem: CODIGO_SERVICO_MUNICIPAL,
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    deductions: 0,
    effectiveDatePeriod: "MONTHLY",
    receivedOnly: false,
    observations: buildNfseObservations({ value, retemInss, inssAliquota: inssAliquotaLegal || 11 }),
    taxes: {
      retainIss: ISS_RETAIN,
      iss: ISS_ALIQUOTA,
      cofins: 0,
      csll: 0,
      inss: inssAliquotaEfetiva(retemInss, inssAliquotaLegal || 11),
      ir: 0,
      pis: 0,
    },
  };
}

/** Data civil BRT. UTC (`toISOString`) depois das 21h vira o dia seguinte e a NFS-e fica SCHEDULED. */
export function todayDateStr(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export const ASAAS_PROD_URL = "https://api.asaas.com/v3";
export const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

export type AsaasBillingType = "BOLETO" | "PIX" | "UNDEFINED" | "CREDIT_CARD";

export interface AsaasPaymentCreatePayload {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  postalService?: boolean;
  fiscalObservations?: string;
}

export function isAsaasSandboxKey(key: string | null | undefined): boolean {
  return /_hmlg_|_sandbox_|\$aact_hmlg_/i.test(String(key || ""));
}

/** www.asaas.com e sandbox.asaas.com/api são aliases legados — a API oficial é api / api-sandbox. */
export function normalizeAsaasUrl(url: string | null | undefined): string {
  const u = String(url || "").trim().replace(/\/$/, "");
  if (/^https:\/\/www\.asaas\.com\/api\/v3$/i.test(u)) return ASAAS_PROD_URL;
  if (/^https:\/\/sandbox\.asaas\.com\/api\/v3$/i.test(u)) return ASAAS_SANDBOX_URL;
  return u;
}

export function resolveAsaasBaseUrl(opts: {
  key?: string | null;
  prodUrl?: string | null;
  sandboxUrl?: string | null;
  legacyUrl?: string | null;
}): string {
  const sandbox = isAsaasSandboxKey(opts.key);
  const dedicated = String(sandbox ? (opts.sandboxUrl || "") : (opts.prodUrl || "")).trim();
  if (dedicated) return normalizeAsaasUrl(dedicated);
  const legacy = String(opts.legacyUrl || "").trim();
  if (legacy) return normalizeAsaasUrl(legacy);
  return sandbox ? ASAAS_SANDBOX_URL : ASAAS_PROD_URL;
}

/** Dia 15 do mês seguinte em calendário BRT — não usa toISOString() (UTC). */
export function defaultInvoiceDueDate(now: Date = new Date()): string {
  const [ys, ms] = todayDateStr(now).split("-");
  const y = Number(ys);
  const m = Number(ms);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${nextY}-${String(nextM).padStart(2, "0")}-15`;
}

export function asAsaasBillingType(raw: unknown): AsaasBillingType {
  const t = String(raw || "BOLETO").toUpperCase();
  if (t === "PIX" || t === "UNDEFINED" || t === "CREDIT_CARD" || t === "BOLETO") return t;
  return "BOLETO";
}

export function assertAsaasDate(raw: unknown, field = "dueDate"): string {
  const s = String(raw || "").trim();
  const isoPrefix = s.length >= 10 && s[4] === "-" && s[7] === "-" ? s.slice(0, 10) : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    throw new Error(`${field} deve estar no formato AAAA-MM-DD`);
  }
  const y = Number(isoPrefix.slice(0, 4));
  const m = Number(isoPrefix.slice(5, 7));
  const d = Number(isoPrefix.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`${field} inválida (data inexistente no calendário)`);
  }
  return isoPrefix;
}

export function parseAsaasMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? "").replace(/R\$\s?/i, "").trim();
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function assertAsaasMoney(raw: unknown, field = "value"): number {
  const n = parseAsaasMoney(raw);
  if (n == null || n <= 0) throw new Error(`${field} deve ser número > 0`);
  return Number(n.toFixed(2));
}

export function assertCpfCnpj(raw: unknown): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11 && d.length !== 14) {
    throw new Error("CPF/CNPJ inválido (11 ou 14 dígitos)");
  }
  return d;
}

export type AsaasWebhookAuthDecision =
  | { allow: true }
  | { allow: false; reason: "missing_server_secret" | "invalid_token" };

export function extractAsaasWebhookToken(headers: {
  "asaas-access-token"?: string | string[];
  "x-asaas-access-token"?: string | string[];
  authorization?: string | string[];
}): string {
  const first = (v?: string | string[]) => String(Array.isArray(v) ? v[0] : v || "");
  const rawAuth = first(headers.authorization);
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : rawAuth.trim();
  return (first(headers["asaas-access-token"]) || first(headers["x-asaas-access-token"]) || bearer).trim();
}

export function resolveAsaasWebhookExpectedToken(opts: {
  webhookToken?: string | null;
  apiKey?: string | null;
}): string {
  return String(opts.webhookToken || opts.apiKey || "").trim();
}

function asaasTokensEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Fail-closed: sem secret no servidor ou token divergente → recusa. Nunca aceita aberto. */
export function evaluateAsaasWebhookAuth(expected: string, received: string): AsaasWebhookAuthDecision {
  if (!String(expected || "").trim()) return { allow: false, reason: "missing_server_secret" };
  if (!asaasTokensEqual(String(expected).trim(), String(received || "").trim())) {
    return { allow: false, reason: "invalid_token" };
  }
  return { allow: true };
}

/** Junta errors[] do Asaas (code + description). Equivale a response.data.errors no axios. */
export function formatAsaasErrors(data: unknown, status: number): string {
  const body = data as { errors?: Array<{ code?: string; description?: string; message?: string }>; message?: string } | null;
  const items = Array.isArray(body?.errors) ? body.errors : [];
  if (items.length > 0) {
    const detail = items.map((e, i) =>
      `[${i}] code=${e?.code ?? "?"} desc=${e?.description || e?.message || "?"}`,
    ).join(" | ");
    return `Asaas HTTP ${status}: ${detail}`;
  }
  return body?.message || `Asaas API error ${status}`;
}

/**
 * Discriminacao da NFS-e (SP/ABRASF): sem travessão tipográfico, sem XML
 * control chars. A descrição da fatura (cliente/período) NÃO vai neste campo —
 * a prefeitura rejeita o schema. Período fica em observations.
 */
export function sanitizeNfDiscriminacao(raw: string | null | undefined): string {
  let s = String(raw || "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = DESCRICAO_SERVICO_FIXA;
  return s.slice(0, NF_DISCRIMINACAO_MAX);
}

export function nfDiscriminacaoOficial(): string {
  return sanitizeNfDiscriminacao(DESCRICAO_SERVICO_FIXA);
}

export function isDiscriminacaoSchemaError(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("discriminacao") ||
    m.includes("discriminação") ||
    m.includes("xml não compatível") ||
    m.includes("xml nao compativel")
  );
}

/** Discriminacao da fatura (Escolta Armada / cliente / período) — SP rejeita ou trava SYNCHRONIZED. */
export function isLegacyEscoltaDiscriminacao(serviceDescription: string | null | undefined): boolean {
  const s = String(serviceDescription || "");
  if (!s.trim()) return false;
  if (sanitizeNfDiscriminacao(s) === nfDiscriminacaoOficial()) return false;
  return /escolta\s+armada/i.test(s) || /[\u2010-\u2015\u2212]/.test(s) || /per[ií]odo\s*:/i.test(s);
}

export const LEGACY_DISCRIMINACAO_STUCK_MSG =
  "Discriminacao antiga sem RPS nem número municipal — não é espera da prefeitura. Cancele esta NF no painel Asaas (Notas fiscais). Quando o Asaas ficar ERROR ou cancelada, use Resolver agora: o Torres faz PUT na mesma inv_* com o texto oficial. Não clique Emitir enquanto essa inv_* existir.";

export function hasAsaasRps(nf: { rpsNumber?: string | number | null } | null | undefined): boolean {
  return String(nf?.rpsNumber ?? "").trim() !== "";
}

/**
 * SYNCHRONIZED/AUTHORIZED sem RPS, sem nº municipal, Discriminacao ≠ CNAE oficial.
 * É rejeição escondida (#171), não fila da prefeitura (#170 tem RPS + texto oficial).
 */
export function isHiddenDiscriminacaoRejection(
  nf: {
    status?: string | null;
    number?: string | null;
    nfeNumber?: string | null;
    rpsNumber?: string | number | null;
    serviceDescription?: string | null;
  } | null | undefined,
  emiteNf: boolean,
): boolean {
  if (emiteNf !== true || !nf) return false;
  if (isNfFullyIssued(nf.status, nf.number) || isNfFullyIssued(nf.status, nf.nfeNumber)) return false;
  if (extractAsaasMunicipalNumber(nf)) return false;
  if (hasAsaasRps(nf)) return false;
  const st = String(nf.status || "").toUpperCase();
  if (st !== "SYNCHRONIZED" && st !== "AUTHORIZED") return false;
  return isLegacyEscoltaDiscriminacao(nf.serviceDescription);
}

/** @deprecated nome antigo — equivalente a isHiddenDiscriminacaoRejection (não cancela via API). */
export function shouldCancelRescheduleLegacyDiscriminacao(
  nf: Parameters<typeof isHiddenDiscriminacaoRejection>[0],
  emiteNf: boolean,
): boolean {
  return isHiddenDiscriminacaoRejection(nf, emiteNf);
}

/**
 * PUT /invoices/{id} só SCHEDULED ou ERROR. Mesma inv_*; nunca segundo POST.
 */
export function asaasNfIdForOfficialPut(
  nf: {
    id?: string | null;
    status?: string | null;
    number?: string | null;
    nfeNumber?: string | null;
    serviceDescription?: string | null;
  } | null | undefined,
  emiteNf: boolean,
): string | null {
  if (emiteNf !== true || !nf) return null;
  const id = String(nf.id || "").trim();
  if (!isAsaasInvoiceId(id)) return null;
  if (extractAsaasMunicipalNumber(nf) || isNfFullyIssued(nf.status, nf.number)) return null;
  const st = String(nf.status || "").toUpperCase();
  if (st.includes("CANCEL")) return null;
  const retry = existingAsaasNfIdToRetry({ id, status: st });
  if (retry) return retry;
  if (st === "SCHEDULED" && isLegacyEscoltaDiscriminacao(nf.serviceDescription)) return id;
  return null;
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
  const inssAliquotaLegal = retemInss ? Number(opts.inssAliquota ?? 11) : 0;
  const oficial = nfDiscriminacaoOficial();
  const payload: Record<string, any> = {
    serviceDescription: oficial,
    observations: buildNfseObservations({
      value: opts.value,
      description: opts.description,
      observationsHint: opts.observations,
      retemInss: true,
      inssAliquota: inssAliquotaLegal || 11,
    }),
    value: opts.value,
    deductions: 0,
    effectiveDatePeriod: "ON_PAYMENT_CREATION",
    municipalServiceName: municipalServiceNameOficial(),
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    taxes: {
      retainIss: ISS_RETAIN,
      iss: ISS_ALIQUOTA,
      cofins: 0, csll: 0, inss: inssAliquotaEfetiva(true, inssAliquotaLegal || 11), ir: 0, pis: 0,
    },
  };
  // Mesmo contrato da TM: código municipal, sem ID/externalId (Portal Nacional).
  // Torres permanece em 07870 — não copiar 07930.
  if (opts.paymentId) payload.payment = opts.paymentId;
  if (opts.customerId) payload.customer = opts.customerId;
  return payload;
}

/**
 * PUT /invoices/{id} no Asaas é substituição (só SCHEDULED ou ERROR).
 * Sem payment/customer — não cria segunda nota na mesma cobrança.
 */
export function buildNfsePutPayload(postPayload: Record<string, any>): Record<string, any> {
  const put: Record<string, any> = {
    serviceDescription: postPayload.serviceDescription,
    observations: postPayload.observations,
    value: postPayload.value,
    deductions: postPayload.deductions ?? 0,
    effectiveDatePeriod: postPayload.effectiveDatePeriod || "ON_PAYMENT_CREATION",
    municipalServiceName: postPayload.municipalServiceName || municipalServiceNameOficial(),
    municipalServiceCode: postPayload.municipalServiceCode || CODIGO_SERVICO_MUNICIPAL_CODE,
    taxes: postPayload.taxes,
    updatePayment: false,
  };
  if (postPayload.externalReference) put.externalReference = postPayload.externalReference;
  return put;
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
  if (clientEmail === undefined) return false;
  return !isValidEmail(clientEmail);
}

export function isNfCorrectionError(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return m.includes("e-mail do cliente ausente") || m.includes("e-mail do tomador") || m.includes("nf_correction_required");
}

/** Status de NFS-e que indicam erro/rejeição (espelha normalizeInvoiceStatus). */
const NF_ERROR_STATUSES = ["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA", "ERRO_AUTORIZACAO", "ERRO_CANCELAMENTO"];

export function isNfErrorStatus(status: string | null | undefined): boolean {
  return NF_ERROR_STATUSES.includes(String(status || "").toUpperCase());
}

/** Persiste o retorno do POST /invoices (Asaas). Nunca inventa AUTHORIZED. */
export function nfseFieldsFromEmitResult(result: {
  id?: string;
  status?: string;
  number?: string;
}): { nfse_status: string; nfse_number?: string } {
  const status = String(result.status || "").trim() || "SCHEDULED";
  const fields: { nfse_status: string; nfse_number?: string } = { nfse_status: status };
  if (result.number) fields.nfse_number = String(result.number);
  else if (result.id) fields.nfse_number = String(result.id);
  return fields;
}

export function isAsaasInvoiceId(nfseNumber: unknown): boolean {
  return /^inv_/i.test(String(nfseNumber || "").trim());
}

/** Número municipal no objeto Asaas (number pode vir numérico). RPS não conta. */
export function extractAsaasMunicipalNumber(nf: any): string | null {
  const candidates = [nf?.number, nf?.nfeNumber];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    if (isFinalNfNumber(c)) return String(c).trim();
  }
  return null;
}

/**
 * CCM do tomador para o Asaas / prefeitura SP: só números, no máximo 8 dígitos.
 * IE paulista (12 dígitos, ex. 188.201.912.119) não é CCM — devolve null.
 */
export function normalizeMunicipalInscriptionForAsaas(raw?: string | null): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 1 && digits.length <= 8) return digits;
  return null;
}

/**
 * CCM do tomador: só envia ao Asaas se o cadastro Torres tiver valor diferente.
 * Retorna "" para limpar IE colada no customer; null = não altera.
 */
export function municipalInscriptionIfChanged(
  existingAtAsaas: string | null | undefined,
  fromClient: string | null | undefined,
): string | null {
  const next = normalizeMunicipalInscriptionForAsaas(fromClient);
  const exist = normalizeMunicipalInscriptionForAsaas(existingAtAsaas);
  const existingDigits = String(existingAtAsaas || "").replace(/\D/g, "");
  const key = (d: string | null) => (d ? d.replace(/^0+/, "") || "0" : "");
  if (next && key(exist) === key(next)) return null;
  if (next) return next;
  if (existingDigits.length > 8) return "";
  return null;
}

/**
 * Rejeição real da prefeitura/Asaas — não confundir com “aguardando fila”.
 * SYNCHRONIZED às vezes traz o erro só em statusDescription.
 */
export function isAsaasPrefeituraRejection(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  if (!m.trim()) return false;
  if (/aguardand|em fila|processando|enviad[oa] para a prefeitura|sincroniz/.test(m) && !isMunicipalCommFailure(m) && !isMissingMunicipalServiceCode(m)) {
    return false;
  }
  if (isDiscriminacaoSchemaError(m)) return true;
  if (isMunicipalCommFailure(m) || isMissingMunicipalServiceCode(m)) return true;
  return (
    m.includes("inscrição municipal") ||
    m.includes("inscricao municipal") ||
    m.includes("informações fiscais") ||
    m.includes("informacoes fiscais") ||
    m.includes("falha na autenticação") ||
    m.includes("falha na autenticacao") ||
    m.includes("rejeit") ||
    m.includes("xml não compatível") ||
    m.includes("xml nao compativel") ||
    m.includes("the 'discriminacao'")
  );
}

/**
 * Reusa a NFS-e já criada no Asaas (ERROR) em vez de POST /invoices de novo.
 * SYNCHRONIZED/AUTHORIZED sem nº municipal NÃO entram — isso é processamento.
 */
export function existingAsaasNfIdToRetry(opts: {
  id?: string | null;
  status?: string | null;
}): string | null {
  const id = String(opts.id || "").trim();
  if (!isAsaasInvoiceId(id)) return null;
  if (!isNfErrorStatus(opts.status)) return null;
  return id;
}

/** Horas em aberto sem nº municipal para tratar “AUTHORIZED fantasma” como erro. */
export const NF_PROCESSING_STALE_HOURS = 2;
export const NF_RECONCILE_STALE_MS = 3 * 60 * 1000;

export const NF_MISSING_AT_ASAAS_MSG =
  "NFS-e não encontrada no Asaas para esta cobrança. O status local não tem nota correspondente na prefeitura. Use Resolver agora para emitir.";

export function hoursSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

/** Asaas recusa cancelar NFS-e ainda “em processamento”. Não martelar cancel a cada cron. */
export function isAsaasNfCancelBlockedProcessing(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("não pode ser cancelada")
    || m.includes("nao pode ser cancelada")
    || m.includes("processando emissão")
    || m.includes("processando emissao")
  );
}

/** Isolates serverless/cron: se o reconcile ficou `running` após timeout, libera o botão. */
export function unstickStaleNfReconcile(state: {
  running: boolean;
  startedAt: string | null;
}, now: Date = new Date()): boolean {
  if (!state.running || !state.startedAt) return false;
  const t = new Date(state.startedAt).getTime();
  if (!Number.isFinite(t) || now.getTime() - t < NF_RECONCILE_STALE_MS) return false;
  state.running = false;
  return true;
}

export function isStuckNfWithoutNumber(invoice: {
  nfse_status?: string | null;
  nfse_number?: string | null;
}): boolean {
  return classifyIssuedOrProcessing(invoice.nfse_status, invoice.nfse_number) === "NF_PROCESSANDO";
}

function formatNfWaitAge(hours: number | null): string {
  if (hours == null || hours < 0) return "";
  if (hours < 1) return ` há ${Math.max(1, Math.round(hours * 60))} min`;
  return ` há ${Math.round(hours)}h`;
}

/** Texto de espera para a UI — NÃO grava em nfse_error_message (isso é só erro real). */
export function describeNfProcessingWait(
  invoice: {
    nfse_status?: string | null;
    nfse_number?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  },
  now: Date = new Date(),
  liveAsaasDetail?: string | null,
  rpsNumber?: string | number | null,
): string | null {
  if (!isStuckNfWithoutNumber(invoice)) return null;
  const st = String(invoice.nfse_status || "").toUpperCase() || "SEM STATUS";
  const hours = hoursSince(invoice.updated_at || invoice.created_at, now);
  const age = formatNfWaitAge(hours);
  const live = String(liveAsaasDetail || "").trim();
  const liveBit = live && !isAsaasPrefeituraRejection(live) ? ` Detalhe Asaas: ${live.slice(0, 180)}.` : "";
  const rps = String(rpsNumber ?? "").trim();
  const rpsBit = rps ? ` RPS ${rps} já na prefeitura; falta o nº da NFS-e.` : "";
  if (isNfOkStatus(st)) {
    return `Asaas: ${st}, sem número da prefeitura${age}. Em fila na prefeitura — o Torres só consulta o Asaas; não reenvia a emissão.${rpsBit}${liveBit}`;
  }
  return `NF em processamento no Asaas (${st})${age}. Sem número municipal ainda. O Torres segue batendo no Asaas até concluir.${rpsBit}${liveBit}`;
}

function sameInvoiceField(current: unknown, next: unknown): boolean {
  if ((next == null || next === "") && (current == null || current === "")) return true;
  if (typeof next === "number" || typeof current === "number" || (typeof next === "string" && typeof current === "string" && /^-?\d+(\.\d+)?$/.test(String(next).trim()) && /^-?\d+(\.\d+)?$/.test(String(current).trim()))) {
    const na = Number(next);
    const nb = Number(current);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 0.005;
  }
  return String(next ?? "") === String(current ?? "");
}

/** UPDATE de /sync sem mudança real não deve gravar só `updated_at` (zera o relógio de espera). */
export function invoiceUpdatesAreMaterial(
  current: Record<string, any>,
  updates: Record<string, any>,
): boolean {
  for (const [k, v] of Object.entries(updates)) {
    if (k === "updated_at") continue;
    if (!sameInvoiceField(current[k], v)) return true;
  }
  return false;
}

const PAID_OR_CANCELED_PAY = ["RECEIVED", "CONFIRMED", "PAGO", "RECEIVED_IN_CASH", "CANCELLED", "CANCELED"];

/**
 * AUTHORIZED/PROCESSANDO sem nº, cobrança em aberto, e já passou o prazo:
 * se o Asaas não devolver a nota, vira erro visível (não fica “processando” para sempre).
 * Não aplica em faturas já pagas (histórico antigo sem nº).
 */
export function shouldMarkMissingNfAsError(
  invoice: {
    status?: string | null;
    nfse_status?: string | null;
    nfse_number?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  const pay = String(invoice.status || "").toUpperCase();
  if (PAID_OR_CANCELED_PAY.includes(pay)) return false;
  if (!isStuckNfWithoutNumber(invoice)) return false;
  const hours = hoursSince(invoice.created_at || invoice.updated_at, now);
  return hours != null && hours >= NF_PROCESSING_STALE_HOURS;
}

export function missingNfAtAsaasMessage(nfseStatus?: string | null): string {
  const st = String(nfseStatus || "").toUpperCase();
  if (st) return `${NF_MISSING_AT_ASAAS_MSG} (status local: ${st})`;
  return NF_MISSING_AT_ASAAS_MSG;
}

/**
 * Aplica o objeto NFS-e do Asaas nos campos locais.
 * Guarda o id `inv_...` quando ainda não há número municipal — senão o próximo
 * sync não consegue dar GET /invoices/{id}.
 */
export function nfseUpdatesFromAsaasObject(
  nf: any,
  current: {
    nfse_number?: string | null;
    nfse_url?: string | null;
    nfse_error_message?: string | null;
    nfse_status?: string | null;
  },
): Record<string, any> {
  const next: Record<string, any> = {};
  const municipal = extractAsaasMunicipalNumber(nf);
  if (nf?.status && String(nf.status) !== String(current.nfse_status || "")) {
    next.nfse_status = String(nf.status);
  }

  let desiredNumber: string | null = null;
  if (municipal) desiredNumber = municipal;
  else if (!isFinalNfNumber(current.nfse_number) && nf?.id) desiredNumber = String(nf.id);
  if (desiredNumber && desiredNumber !== String(current.nfse_number || "")) {
    next.nfse_number = desiredNumber;
  }

  const desiredUrl = nf?.pdfUrl || nf?.externalUrl || (!current.nfse_url && nf?.xmlUrl ? nf.xmlUrl : null);
  if (desiredUrl && String(desiredUrl) !== String(current.nfse_url || "")) {
    next.nfse_url = String(desiredUrl);
  }

  const st = String(next.nfse_status || nf?.status || current.nfse_status || "");
  if (isHiddenDiscriminacaoRejection(nf, true)) {
    next.nfse_status = "ERROR";
    if (current.nfse_error_message !== LEGACY_DISCRIMINACAO_STUCK_MSG) {
      next.nfse_error_message = LEGACY_DISCRIMINACAO_STUCK_MSG;
    }
    return next;
  }
  const rejectionText = extractConcreteNfErrorMessage(nf);
  if (
    !isNfFullyIssued(st, next.nfse_number || current.nfse_number)
    && isAsaasPrefeituraRejection(rejectionText)
  ) {
    next.nfse_status = "ERROR";
    if (rejectionText && rejectionText !== current.nfse_error_message) {
      next.nfse_error_message = rejectionText.slice(0, 1000);
    }
  } else if (isNfErrorStatus(st)) {
    const msg = resolveNfErrorMessage(nf, st, current.nfse_error_message);
    if (msg !== current.nfse_error_message) next.nfse_error_message = msg;
  } else if (
    (isNfFullyIssued(st, next.nfse_number || current.nfse_number) || classifyIssuedOrProcessing(st, next.nfse_number || current.nfse_number) === "NF_PROCESSANDO")
    && current.nfse_error_message
    && isNfErrorStatus(current.nfse_status)
  ) {
    next.nfse_error_message = null;
  } else if (isNfOkStatus(st) && isFinalNfNumber(next.nfse_number || current.nfse_number) && current.nfse_error_message) {
    next.nfse_error_message = null;
  }
  return next;
}

export function isMunicipalCommFailure(message: string | null | undefined): boolean {
  return /falha ao comunicar/i.test(String(message || ""));
}

export function isMissingMunicipalServiceCode(message: string | null | undefined): boolean {
  const m = String(message || "");
  return /_nfe002/i.test(m) || /c[oó]digo de servi[cç]o municipal deve ser informado/i.test(m);
}

/**
 * PUT do Asaas não grava municipalServiceCode em nota já aberta (Portal Nacional).
 * Padrão TM: cancelar a inv_* e POST outra na mesma cobrança.
 * Cron: só ERROR / _NFe002. Manual (`explicit`): também SYNCHRONIZED/SCHEDULED sem nº municipal.
 */
export function shouldCancelRescheduleNfse(opts: {
  id?: string | null;
  status?: string | null;
  number?: string | null;
  message?: string | null;
  explicit?: boolean;
}): string | null {
  const id = String(opts.id || "").trim();
  if (!isAsaasInvoiceId(id)) return null;
  if (isNfFullyIssued(opts.status, opts.number)) return null;
  const st = String(opts.status || "").toUpperCase();
  if (st.includes("CANCEL")) return null;
  if (isMissingMunicipalServiceCode(opts.message)) return id;
  if (opts.explicit === true && (st === "SYNCHRONIZED" || st === "SCHEDULED" || st === "ERROR" || st === "AUTHORIZED")) return id;
  return null;
}

/**
 * Manda /authorize na mesma inv_* quando a nota está só agendada
 * ou quando houve falha de transporte / código municipal.
 * Não autoriza de novo se já existe número municipal.
 */
export function shouldNudgeNfseAuthorize(
  status?: unknown,
  nfseNumber?: unknown,
  message?: string | null,
): boolean {
  if (isFinalNfNumber(nfseNumber)) return false;
  if (!isAsaasInvoiceId(nfseNumber)) return false;
  if (isMunicipalCommFailure(message) || isMissingMunicipalServiceCode(message)) return true;
  const st = String(status || "").toUpperCase();
  if (st === "SCHEDULED") return true;
  if (!isNfErrorStatus(status)) return false;
  return false;
}

export const NF_AUTO_EMIT_MIN_AGE_HOURS = 10 / 60; // 10 min — evita corrida com o kick isolado

export const INCOMPLETE_FISCAL_ADDRESS_MSG =
  "Endereço fiscal incompleto. Cadastre CEP (8 dígitos), logradouro, número, cidade e UF. A Prefeitura rejeita a NFS-e sem isso — o sistema não completa pela Receita.";

export function fiscalAddressMissingFields(client?: {
  address?: string | null;
  address_number?: string | null;
  addressNumber?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null): string[] {
  const missing: string[] = [];
  if (!String(client?.address || "").trim()) missing.push("logradouro");
  const num = extractStreetNumber(client?.address, client?.address_number || client?.addressNumber);
  if (!String(num || "").trim()) missing.push("número");
  if (!String(client?.city || "").trim()) missing.push("cidade");
  const uf = String(client?.state || "").trim();
  if (uf.length !== 2) missing.push("UF");
  if (String(client?.zip || "").replace(/\D/g, "").length !== 8) missing.push("CEP (8 dígitos)");
  return missing;
}

/** Bloqueia cobrança+NF quando o cliente emite NFS-e e o cadastro fiscal está incompleto. */
export function assertFiscalAddressForNf(
  client: Parameters<typeof fiscalAddressMissingFields>[0],
  emiteNf: boolean,
): string | null {
  if (!emiteNf) return null;
  const missing = fiscalAddressMissingFields(client);
  if (missing.length === 0) return null;
  return `${INCOMPLETE_FISCAL_ADDRESS_MSG} Falta: ${missing.join(", ")}.`;
}

/**
 * Worker/cron pode POST /invoices quando a cobrança existe, o cliente emite NF
 * e o Asaas ainda não tem nota (fila TM: NF isolada). Não cria segunda nota.
 */
export function shouldAutoEmitMissingNfse(
  invoice?: {
    status?: string | null;
    nfse_status?: string | null;
    nfse_number?: string | null;
    created_at?: string | null;
  },
  opts?: { paymentLookupEmpty: boolean; emiteNf: boolean; now?: Date },
): boolean {
  if (!opts?.emiteNf) return false;
  if (!opts.paymentLookupEmpty) return false;
  const pay = String(invoice?.status || "").toUpperCase();
  if (["CANCELLED", "CANCELED"].includes(pay)) return false;
  if (isNfFullyIssued(invoice?.nfse_status, invoice?.nfse_number)) return false;
  if (isAsaasInvoiceId(invoice?.nfse_number)) return false;
  const nf = String(invoice?.nfse_status || "").toUpperCase();
  if (nf.includes("CANCEL")) return false;
  const placeholder = nf === "PROCESSING";
  if (!placeholder) {
    const ageH = hoursSince(invoice?.created_at, opts.now);
    if (ageH != null && ageH < NF_AUTO_EMIT_MIN_AGE_HOURS) return false;
  }
  return true;
}

export function isOpenNfFollowUpStatus(invoice: {
  status?: string | null;
  nfse_status?: string | null;
  nfse_number?: string | null;
}): boolean {
  const pay = String(invoice.status || "").toUpperCase();
  if (["CANCELLED", "CANCELED"].includes(pay)) return false;
  if (isNfFullyIssued(invoice.nfse_status, invoice.nfse_number)) return false;
  const nf = String(invoice.nfse_status || "").toUpperCase();
  if (nf.includes("CANCEL")) return false;
  return true;
}

/** Só o e-mail de cobrança criada; lembretes de vencimento/atraso ficam desligados. */
export const ASAAS_CUSTOMER_EMAIL_EVENTS = ["PAYMENT_CREATED"] as const;

export function asaasCustomerEmailAllowed(event: unknown): boolean {
  return String(event || "").toUpperCase() === "PAYMENT_CREATED";
}

export function isAsaasNotificationPolicyCompliant(n: {
  event?: string | null;
  enabled?: boolean | null;
  emailEnabledForCustomer?: boolean | null;
  smsEnabledForCustomer?: boolean | null;
  whatsappEnabledForCustomer?: boolean | null;
  phoneCallEnabledForCustomer?: boolean | null;
}): boolean {
  const allow = asaasCustomerEmailAllowed(n.event);
  const sms = n.smsEnabledForCustomer === true;
  const wa = n.whatsappEnabledForCustomer === true;
  const phone = n.phoneCallEnabledForCustomer === true;
  if (sms || wa || phone) return false;
  if (allow) return n.enabled !== false && n.emailEnabledForCustomer === true;
  return n.enabled === false || n.emailEnabledForCustomer !== true;
}

export function buildAsaasNotificationPolicyUpdate(n: {
  id: string;
  event?: string | null;
  scheduleOffset?: number | null;
}): Record<string, unknown> {
  const allow = asaasCustomerEmailAllowed(n.event);
  const patch: Record<string, unknown> = {
    id: n.id,
    enabled: allow,
    emailEnabledForCustomer: allow,
    smsEnabledForCustomer: false,
    phoneCallEnabledForCustomer: false,
    whatsappEnabledForCustomer: false,
    emailEnabledForProvider: false,
    smsEnabledForProvider: false,
  };
  if (n.scheduleOffset != null) patch.scheduleOffset = n.scheduleOffset;
  return patch;
}

/** Copia o vencimento vivo do boleto Asaas para a fatura local, se divergir. */
export function asaasDueDateIfDifferent(asaasDueDate: unknown, localDueDate: unknown): string | null {
  const next = String(asaasDueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return null;
  const cur = String(localDueDate || "").slice(0, 10);
  return next !== cur ? next : null;
}

export function isManualInvoiceDueDate(invoice: {
  nfse_observations?: string | null;
  notes?: string | null;
}): boolean {
  const text = `${invoice.nfse_observations || ""}\n${invoice.notes || ""}`;
  return /\[Vencimento alterado/i.test(text);
}

export type DueDateReconcilePlan =
  | { action: "none" }
  | { action: "pull"; dueDate: string }
  | { action: "push"; dueDate: string };

/**
 * Manual: a data do Torres é a do boleto — empurra para o Asaas, nunca sobrescreve local.
 * Automático: espelha o vencimento vivo do Asaas.
 */
export function planDueDateReconcile(opts: {
  localDueDate: unknown;
  asaasDueDate: unknown;
  manual: boolean;
}): DueDateReconcilePlan {
  const local = String(opts.localDueDate || "").slice(0, 10);
  const asaas = String(opts.asaasDueDate || "").slice(0, 10);
  const localOk = /^\d{4}-\d{2}-\d{2}$/.test(local);
  const asaasOk = /^\d{4}-\d{2}-\d{2}$/.test(asaas);
  if (localOk && asaasOk && local === asaas) return { action: "none" };
  if (opts.manual && localOk) {
    if (!asaasOk || asaas !== local) return { action: "push", dueDate: local };
    return { action: "none" };
  }
  if (asaasOk && asaas !== local) return { action: "pull", dueDate: asaas };
  return { action: "none" };
}

/** Prefere NF emitida; depois processando; erro; por último cancelada. */
export function pickPreferredAsaasNf(items: any[]): any | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const score = (x: any) => {
    const st = String(x?.status || "").toUpperCase();
    if (isNfFullyIssued(st, x?.number)) return 4;
    if (classifyIssuedOrProcessing(st, x?.number) === "NF_PROCESSANDO") return 3;
    if (isNfErrorStatus(st)) return 2;
    if (st.includes("CANCEL")) return 0;
    return 1;
  };
  return [...items].sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * Re-emitir só quando NÃO há NF municipal e há erro confirmado.
 * AUTHORIZED sem número NÃO é “já emitida” — senão a fatura trava para sempre.
 */
export function canReemitNfse(invoice: {
  nfse_status?: string | null;
  nfse_number?: string | null;
  nfse_error_message?: string | null;
}): { allowed: boolean; reason: string } {
  if (isNfFullyIssued(invoice.nfse_status, invoice.nfse_number)) {
    return {
      allowed: false,
      reason: "Esta fatura já tem NF emitida com número — reprocessar geraria duplicidade fiscal. Cancele a NF atual primeiro, se necessário.",
    };
  }
  const st = String(invoice.nfse_status || "").toUpperCase();
  const emErro =
    isNfErrorStatus(st) ||
    st === "AWAITING_CORRECTION" ||
    !!invoice.nfse_error_message;
  if (!emErro) {
    return {
      allowed: false,
      reason: "Esta fatura não está com NF em erro — use Sincronizar para consultar o Asaas. Reprocessar só é permitido após erro confirmado, para evitar nota duplicada.",
    };
  }
  return { allowed: true, reason: "" };
}

/**
 * Catch-up automático só para rejeição de schema Discriminacao (prefeitura SP).
 * Não cobre inscrição municipal da empresa no Asaas nem NF em processamento.
 */
export function shouldAutoRetryDiscriminacaoError(
  invoice: {
    nfse_status?: string | null;
    nfse_number?: string | null;
    nfse_error_message?: string | null;
  },
  emiteNf: boolean,
): boolean {
  if (emiteNf !== true) return false;
  if (isNfFullyIssued(invoice.nfse_status, invoice.nfse_number)) return false;
  if (!isNfErrorStatus(invoice.nfse_status) && !invoice.nfse_error_message) return false;
  return isDiscriminacaoSchemaError(invoice.nfse_error_message);
}

/**
 * Extrai SÓ a mensagem concreta de erro presente no objeto do Asaas, varrendo
 * os campos conhecidos. Retorna `null` quando o Asaas não mandou nenhuma
 * mensagem — assim o caller pode preservar uma mensagem específica já gravada
 * em vez de sobrescrevê-la por um texto genérico.
 */
export function extractConcreteNfErrorMessage(nfObj: any): string | null {
  // `observations` costuma ser o texto fiscal nosso (CNAE/serviço), não o erro da prefeitura.
  const candidates = [
    nfObj?.rejectionReason,
    nfObj?.rejectionMessage,
    nfObj?.statusDescription,
    nfObj?.errorMessage,
    nfObj?.error,
    Array.isArray(nfObj?.errors) ? (nfObj.errors[0]?.description || nfObj.errors[0]?.message || nfObj.errors[0]?.code) : undefined,
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

/** Colunas reais de `invoices` usadas ao marcar NF emitida fora do Asaas. */
export const MARK_EMITTED_INVOICE_COLUMNS = [
  "nfse_status",
  "nfse_observations",
  "nfse_number",
] as const;

/**
 * Payload de UPDATE para `/api/relatorio-nf/mark-emitted`.
 * Só inclui colunas que existem em `invoices` (não grava `nfse_authorized_at`).
 * O relatório classifica NF emitida por `nfse_status` AUTHORIZED/SYNCHRONIZED/ISSUED.
 */
export function buildMarkEmittedInvoiceUpdates(opts: {
  invoice: { nfse_observations?: string | null };
  email: string;
  nfNumber?: string | null;
  note?: string;
  nowIso?: string;
}): Record<string, string> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const note = String(opts.note || "").slice(0, 500);
  const updates: Record<string, string> = {
    nfse_status: "AUTHORIZED",
    nfse_observations: `[Marcada manualmente como emitida por ${opts.email} em ${nowIso}]${note ? ` ${note}` : ""}${opts.invoice.nfse_observations ? ` | ${opts.invoice.nfse_observations}` : ""}`.slice(0, 1000),
  };
  const nfNumber = String(opts.nfNumber || "").trim().slice(0, 60);
  if (nfNumber) updates.nfse_number = nfNumber;
  return updates;
}

const ASAAS_NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  PAYMENT_CREATED: "E-mail de cobrança enviado",
  PAYMENT_RECEIVED: "E-mail de confirmação de pagamento",
  PAYMENT_OVERDUE: "E-mail de cobrança vencida",
  PAYMENT_DUEDATE_WARNING: "E-mail de lembrete de vencimento",
  PAYMENT_DELETED: "E-mail de cobrança cancelada",
};

const ASAAS_NOTIFICATION_STATUS_LABEL: Record<string, string> = {
  READ: "lido",
  SENT: "enviado",
  DELIVERED: "enviado",
  BOUNCED: "falhou (bounce)",
  FAILED: "falhou",
  QUEUED: "agendado",
  SCHEDULED: "agendado",
};

/** Rótulo estável da notificação Asaas para a timeline da fatura. */
export function describeAsaasPaymentNotification(n: {
  event?: string | null;
  status?: string | null;
  emailAddress?: string | null;
  scheduleDate?: string | null;
  dateCreated?: string | null;
}): { kind: "email"; title: string; detail: string | null; at: string | null } {
  const eventKey = String(n.event || "").toUpperCase();
  const eventLabel = ASAAS_NOTIFICATION_EVENT_LABEL[eventKey] || `Notificação: ${n.event || "desconhecido"}`;
  const st = String(n.status || "").toUpperCase();
  const statusLabel = ASAAS_NOTIFICATION_STATUS_LABEL[st] || (st ? st.toLowerCase() : "registrado");
  return {
    kind: "email",
    title: `${eventLabel} (${statusLabel})`,
    detail: n.emailAddress ? `Para: ${n.emailAddress}` : null,
    at: n.scheduleDate || n.dateCreated || null,
  };
}
