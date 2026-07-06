import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSendDelayFields, ZAPI_SEND_DELAYS_ENABLED } from "./zapi";

test("buildSendDelayFields: com delay ligado, injeta delayTyping/delayMessage", () => {
  assert.equal(ZAPI_SEND_DELAYS_ENABLED, true);
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 8, delayMessageSeconds: 5 }), {
    delayTyping: 8,
    delayMessage: 5,
  });
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 14 }), { delayTyping: 14 });
  assert.deepEqual(buildSendDelayFields({}), {});
});

test("buildSendDelayFields: clamp em [1,15] (limite da Z-API)", () => {
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 20 }, true), { delayTyping: 15 });
  assert.deepEqual(buildSendDelayFields({ delayTypingSeconds: 0 }, true), {});
});
