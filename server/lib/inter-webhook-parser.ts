/**
 * Pure helpers para o webhook do Banco Inter. Normaliza payloads vindos do
 * Inter (que variam de schema entre eventos) e classifica se é confirmação
 * de pagamento + se houve pagamento parcial.
 *
 * Extraído para teste — sem dependência de runtime.
 */

export interface InterWebhookNormalized {
  codigoSolicitacao: string | null;
  evento: string;
  valorPago: number;
  dataHoraSituacao: string;
}

const PAYMENT_CONFIRMATION_EVENTS = new Set([
  "RECEBIDO",
  "PAGO",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "MARCADA_RECEBIDA",
]);

/**
 * Extrai os campos relevantes de um evento Inter, lidando com diferentes
 * shapes (alguns trazem codigoSolicitacao no root, outros aninhado em cobranca).
 */
export function parseInterWebhookEvent(
  ev: any,
  nowIsoFactory: () => string = () => new Date().toISOString(),
): InterWebhookNormalized {
  if (!ev || typeof ev !== "object") {
    return {
      codigoSolicitacao: null,
      evento: "DESCONHECIDO",
      valorPago: 0,
      dataHoraSituacao: nowIsoFactory(),
    };
  }
  const codigoSolicitacao =
    ev?.codigoSolicitacao ||
    ev?.cobranca?.codigoSolicitacao ||
    null;
  const evento = ev?.situacao || ev?.evento || "DESCONHECIDO";
  const valorPagoRaw =
    ev?.valor ?? ev?.valorTotalRecebido ?? ev?.cobranca?.valorTotalRecebido ?? 0;
  const valorPagoNum = Number(valorPagoRaw);
  const valorPago = Number.isFinite(valorPagoNum) && valorPagoNum > 0 ? valorPagoNum : 0;
  const dataHoraSituacao = ev?.dataHoraSituacao || nowIsoFactory();
  return {
    codigoSolicitacao: codigoSolicitacao ? String(codigoSolicitacao) : null,
    evento: String(evento),
    valorPago,
    dataHoraSituacao: String(dataHoraSituacao),
  };
}

export function isInterPaymentConfirmation(evento: string): boolean {
  return PAYMENT_CONFIRMATION_EVENTS.has(String(evento).toUpperCase());
}

export interface InterPaymentClassification {
  valorRecebido: number;
  isPartial: boolean;
  novoStatus: "RECEIVED" | "PARTIAL";
  descPrefix: string;
}

/**
 * Decide se um pagamento Inter é parcial (diferença > 1 centavo do esperado),
 * e gera o status + prefixo de descrição que vão para invoice/transação.
 *
 * Quando o webhook não envia valor (valorPago = 0), assume valorEsperado e
 * trata como pagamento integral.
 */
export function classifyInterPayment(opts: {
  valorPago: number;
  valorEsperado: number;
}): InterPaymentClassification {
  const valorPago = Number(opts.valorPago) || 0;
  const valorEsperado = Number(opts.valorEsperado) || 0;
  const valorRecebido = valorPago > 0 ? valorPago : valorEsperado;
  const isPartial = valorPago > 0 && Math.abs(valorPago - valorEsperado) > 0.01;
  const novoStatus: "RECEIVED" | "PARTIAL" = isPartial ? "PARTIAL" : "RECEIVED";
  const descPrefix = isPartial
    ? `[PAGAMENTO PARCIAL] Recebido ${valorRecebido.toFixed(2)} de ${valorEsperado.toFixed(2)} — `
    : "Recebimento Inter — ";
  return { valorRecebido, isPartial, novoStatus, descPrefix };
}
