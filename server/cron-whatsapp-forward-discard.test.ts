// Testes do descarte de backlog do cron de encaminhamento WhatsApp.
// Regra (ordem do dono 03/07/2026): quando o bot volta, o backlog acumulado
// durante a queda NÃO é reenviado — as pendências são descartadas enquanto o
// bot está comprovadamente fora. Erro transitório NUNCA descarta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldDiscardPendingForwards } from "./cron-whatsapp-forward.js";

test("descarta quando a Z-API CONFIRMOU que a instância está desconectada", () => {
  assert.equal(shouldDiscardPendingForwards({ confirmed: true, connected: false }), true);
});

test("NÃO descarta quando o bot está conectado (envio normal)", () => {
  assert.equal(shouldDiscardPendingForwards({ confirmed: true, connected: true }), false);
});

test("NÃO descarta em erro transitório do /status (não confirmado)", () => {
  // rede fora / 5xx / timeout → confirmed:false → mantém re-tentativa
  assert.equal(shouldDiscardPendingForwards({ confirmed: false, connected: false }), false);
});

test("nunca descarta só por connected:false sem confirmação positiva", () => {
  // combinação teórica (connected true sem confirmed não existe na prática,
  // mas o contrato é: sem confirmed, nada de descarte)
  assert.equal(shouldDiscardPendingForwards({ confirmed: false, connected: true }), false);
});
