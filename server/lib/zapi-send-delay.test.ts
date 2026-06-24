import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSendDelayFields, ZAPI_SEND_DELAYS_ENABLED } from "./zapi";

// O dono pediu (23/06/2026) que o bot responda SEM delay de mensagem. Enquanto
// ZAPI_SEND_DELAYS_ENABLED=false, buildSendDelayFields nunca injeta delayTyping/
// delayMessage no payload da Z-API — mesmo que o call-site passe segundos.

test("buildSendDelayFields: com delay desligado, ignora qualquer segundo pedido", () => {
  assert.equal(ZAPI_SEND_DELAYS_ENABLED, false);
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 8, delayMessageSeconds: 5 }), {});
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 14 }), {});
  assert.deepEqual(buildSendDelayFields({}), {});
});

// force=true (resposta da Central marcada pedindo atualização): mostra
// "digitando..." mesmo com o toggle global desligado, sem reativar o delay nos
// envios em massa do cron. delayTyping é clampado em [1,15] (limite da Z-API).
test("buildSendDelayFields: force injeta delayTyping mesmo com o toggle desligado", () => {
  assert.equal(ZAPI_SEND_DELAYS_ENABLED, false);
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 14 }, true), { delayTyping: 14 });
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 20 }, true), { delayTyping: 15 });
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 0 }, true), {});
  // sem force, segue desligado mesmo passando segundos
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 14 }, false), {});
});
