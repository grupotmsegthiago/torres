import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInterWebhookEvent,
  isInterPaymentConfirmation,
  classifyInterPayment,
} from "./inter-webhook-parser.ts";

// ============================================================================
// parseInterWebhookEvent
// ============================================================================

const FIXED_NOW = "2025-06-01T12:00:00.000Z";
const nowFactory = () => FIXED_NOW;

test("parser: extrai codigoSolicitacao do root", () => {
  const r = parseInterWebhookEvent(
    { codigoSolicitacao: "abc-123", situacao: "RECEBIDO", valor: 50, dataHoraSituacao: "2025-06-01T10:00:00Z" },
    nowFactory,
  );
  assert.equal(r.codigoSolicitacao, "abc-123");
  assert.equal(r.evento, "RECEBIDO");
  assert.equal(r.valorPago, 50);
  assert.equal(r.dataHoraSituacao, "2025-06-01T10:00:00Z");
});

test("parser: extrai codigoSolicitacao aninhado em cobranca", () => {
  const r = parseInterWebhookEvent(
    { cobranca: { codigoSolicitacao: "nested-1", valorTotalRecebido: 200 }, evento: "PAGO" },
    nowFactory,
  );
  assert.equal(r.codigoSolicitacao, "nested-1");
  assert.equal(r.evento, "PAGO");
  assert.equal(r.valorPago, 200);
});

test("parser: prefere situacao sobre evento quando ambos presentes", () => {
  const r = parseInterWebhookEvent({ situacao: "RECEBIDO", evento: "OUTRO" }, nowFactory);
  assert.equal(r.evento, "RECEBIDO");
});

test("parser: payload vazio retorna defaults seguros", () => {
  const r = parseInterWebhookEvent({}, nowFactory);
  assert.equal(r.codigoSolicitacao, null);
  assert.equal(r.evento, "DESCONHECIDO");
  assert.equal(r.valorPago, 0);
  assert.equal(r.dataHoraSituacao, FIXED_NOW);
});

test("parser: null/undefined retorna defaults", () => {
  const r1 = parseInterWebhookEvent(null, nowFactory);
  assert.equal(r1.codigoSolicitacao, null);
  assert.equal(r1.evento, "DESCONHECIDO");
  const r2 = parseInterWebhookEvent(undefined, nowFactory);
  assert.equal(r2.evento, "DESCONHECIDO");
});

test("parser: valor negativo cai pra 0 (não confiável)", () => {
  const r = parseInterWebhookEvent({ valor: -50, situacao: "PAGO" }, nowFactory);
  assert.equal(r.valorPago, 0);
});

test("parser: valor não numérico cai pra 0", () => {
  const r = parseInterWebhookEvent({ valor: "abc", situacao: "PAGO" }, nowFactory);
  assert.equal(r.valorPago, 0);
});

test("parser: valorTotalRecebido (root) é usado quando valor ausente", () => {
  const r = parseInterWebhookEvent({ valorTotalRecebido: 75 }, nowFactory);
  assert.equal(r.valorPago, 75);
});

test("parser: ausência de dataHoraSituacao usa now()", () => {
  const r = parseInterWebhookEvent({ situacao: "RECEBIDO" }, nowFactory);
  assert.equal(r.dataHoraSituacao, FIXED_NOW);
});

test("parser: codigoSolicitacao numérico é convertido pra string", () => {
  const r = parseInterWebhookEvent({ codigoSolicitacao: 12345 }, nowFactory);
  assert.equal(r.codigoSolicitacao, "12345");
});

// ============================================================================
// isInterPaymentConfirmation
// ============================================================================

test("classificação evento: RECEBIDO é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("RECEBIDO"), true);
});

test("classificação evento: PAGO é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("PAGO"), true);
});

test("classificação evento: PAYMENT_RECEIVED é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("PAYMENT_RECEIVED"), true);
});

test("classificação evento: MARCADA_RECEBIDA é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("MARCADA_RECEBIDA"), true);
});

test("classificação evento: case-insensitive (recebido lower)", () => {
  assert.equal(isInterPaymentConfirmation("recebido"), true);
});

test("classificação evento: CANCELADA NÃO é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("CANCELADA"), false);
});

test("classificação evento: EXPIRADA NÃO é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("EXPIRADA"), false);
});

test("classificação evento: DESCONHECIDO NÃO é confirmação", () => {
  assert.equal(isInterPaymentConfirmation("DESCONHECIDO"), false);
});

// ============================================================================
// classifyInterPayment
// ============================================================================

test("pagamento: valorPago = valorEsperado → RECEIVED integral", () => {
  const r = classifyInterPayment({ valorPago: 1000, valorEsperado: 1000 });
  assert.equal(r.isPartial, false);
  assert.equal(r.novoStatus, "RECEIVED");
  assert.equal(r.valorRecebido, 1000);
  assert.equal(r.descPrefix, "Recebimento Inter — ");
});

test("pagamento: valorPago < valorEsperado (diff > 1 centavo) → PARTIAL", () => {
  const r = classifyInterPayment({ valorPago: 500, valorEsperado: 1000 });
  assert.equal(r.isPartial, true);
  assert.equal(r.novoStatus, "PARTIAL");
  assert.equal(r.valorRecebido, 500);
  assert.match(r.descPrefix, /PAGAMENTO PARCIAL/);
  assert.match(r.descPrefix, /500\.00 de 1000\.00/);
});

test("pagamento: tolerância de 1 centavo conta como integral", () => {
  const r = classifyInterPayment({ valorPago: 999.99, valorEsperado: 1000 });
  assert.equal(r.isPartial, false);
  assert.equal(r.novoStatus, "RECEIVED");
});

test("pagamento: diferença = exatamente 1 centavo conta como integral (≤ 0.01)", () => {
  const r = classifyInterPayment({ valorPago: 1000.01, valorEsperado: 1000 });
  assert.equal(r.isPartial, false);
});

test("pagamento: diferença > 1 centavo é parcial", () => {
  const r = classifyInterPayment({ valorPago: 999.98, valorEsperado: 1000 });
  assert.equal(r.isPartial, true);
});

test("pagamento: valorPago=0 (webhook sem valor) assume integral", () => {
  const r = classifyInterPayment({ valorPago: 0, valorEsperado: 1000 });
  assert.equal(r.isPartial, false);
  assert.equal(r.novoStatus, "RECEIVED");
  assert.equal(r.valorRecebido, 1000);
});

test("pagamento: valorEsperado zero — guarda contra divisão/edge cases", () => {
  const r = classifyInterPayment({ valorPago: 0, valorEsperado: 0 });
  assert.equal(r.isPartial, false);
  assert.equal(r.valorRecebido, 0);
});

test("pagamento: valorPago > valorEsperado também conta como parcial (anomalia)", () => {
  const r = classifyInterPayment({ valorPago: 1500, valorEsperado: 1000 });
  // Maior diferença que 1 centavo → PARTIAL (qualquer divergência > 1cent)
  assert.equal(r.isPartial, true);
  assert.equal(r.valorRecebido, 1500);
});
