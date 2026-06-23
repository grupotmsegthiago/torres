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
    /Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})\s*\(([^)]+)\)/i,
  );
  if (m) {
    const inicio = m[1];
    const fim = m[2];
    const competencia = m[3].trim();
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
  return n;
}

/**
 * Monta o e-mail PADRÃO de envio de NF de Escolta Armada ao cliente (modelo do
 * financeiro). Retorna { subject, html }. Função pura/testável — o envio SMTP
 * fica no chamador (sendBillingEmail). Campos:
 *   Competência / Data de Execução / Nº da NF / Serviço Prestado / Valor Total
 *   + opções de pagamento (Boleto Bancário ou PIX chave aleatória).
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
  valor_inss_retido?: number | string | null;
  inss_aliquota?: number | string | null;
}): { subject: string; html: string } {
  const dueDateFormatted = new Date(invoice.due_date + "T12:00:00").toLocaleDateString("pt-BR");
  const valueFormatted = fmtBRL(invoice.value);
  const inssRetido = Number(invoice.valor_inss_retido || 0);
  const temInss = inssRetido > 0.005;
  const inssAliq = Number(invoice.inss_aliquota || 0);
  const liquidoPagar = temInss ? Number((invoice.value - inssRetido).toFixed(2)) : invoice.value;
  const liquidoFormatted = fmtBRL(liquidoPagar);
  const inssFormatted = fmtBRL(inssRetido);

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
        ${temInss ? `
        ${infoRow(`(-) Retenção INSS${inssAliq ? ` (${inssAliq.toFixed(2).replace(".", ",")}%)` : ""}:`, `- ${inssFormatted}`)}
        ${infoRow("Valor líquido a pagar:", liquidoFormatted)}
        ` : ``}
        ${infoRow("Vencimento:", dueDateFormatted)}
      </table>
    </div>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 8px;">
      Para pagamento, disponibilizamos as seguintes opções:
    </p>
    <ul style="font-size:13px;color:#333;line-height:1.6;margin:0 0 16px;padding-left:20px;">
      <li><strong>Boleto Bancário</strong></li>
      <li><strong>PIX (Chave Aleatória):</strong></li>
    </ul>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:0 0 20px;">
      <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:13px;color:#166534;text-align:center;">
        ${EMPRESA_PIX_ALEATORIA}
      </div>
    </div>
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
