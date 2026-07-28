import { test } from "node:test";
import assert from "node:assert/strict";
import { isResumoAuthorizedPhone, RESUMO_AUTHORIZED_PHONES } from "./agent-central-fleet-resumo.ts";

test("isResumoAuthorizedPhone: só libera os dois celulares do dono", () => {
  for (const p of RESUMO_AUTHORIZED_PHONES) {
    assert.equal(isResumoAuthorizedPhone(p), true, `deveria autorizar ${p}`);
    assert.equal(isResumoAuthorizedPhone(`55${p}`), true, `deveria autorizar com DDI ${p}`);
    assert.equal(isResumoAuthorizedPhone(`+55 (${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`), true);
  }
  assert.equal(isResumoAuthorizedPhone("11999998888"), false);
  assert.equal(isResumoAuthorizedPhone("11999998888"), false);
  assert.equal(isResumoAuthorizedPhone(null), false);
  assert.equal(isResumoAuthorizedPhone(""), false);
});
