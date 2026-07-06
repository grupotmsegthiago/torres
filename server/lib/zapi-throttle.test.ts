import { test } from "node:test";
import assert from "node:assert/strict";
import { throttleZapiSend, __resetZapiThrottleForTests } from "./zapi-throttle.ts";

test("throttleZapiSend: primeira mensagem não espera", async () => {
  __resetZapiThrottleForTests();
  const t0 = Date.now();
  await throttleZapiSend("a", async () => "ok");
  assert.ok(Date.now() - t0 < 500);
});

test("throttleZapiSend: segunda mensagem respeita intervalo mínimo", async () => {
  __resetZapiThrottleForTests();
  const prev = process.env.ZAPI_SEND_MIN_INTERVAL_MS;
  process.env.ZAPI_SEND_MIN_INTERVAL_MS = "200";
  try {
    await throttleZapiSend("a", async () => 1);
    const t0 = Date.now();
    await throttleZapiSend("b", async () => 2);
    assert.ok(Date.now() - t0 >= 150, `esperava >=150ms de fila, obteve ${Date.now() - t0}ms`);
  } finally {
    if (prev === undefined) delete process.env.ZAPI_SEND_MIN_INTERVAL_MS;
    else process.env.ZAPI_SEND_MIN_INTERVAL_MS = prev;
    __resetZapiThrottleForTests();
  }
});
