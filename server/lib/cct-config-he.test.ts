import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeVigilanciaHeRates } from "./cct-config.ts";
import { DEFAULT_CCT_CONFIG } from "@shared/cct-config";

test("normalize: diurna 0 → 16 (evita salário×1,6 no Balanço)", () => {
  const out = normalizeVigilanciaHeRates({
    ...DEFAULT_CCT_CONFIG,
    horaExtraValor: 0,
    horaExtraNoturnaValor: 16.5,
  });
  assert.equal(out.horaExtraValor, 16);
  assert.equal(out.horaExtraNoturnaValor, 16.5);
});

test("normalize: legado 22,99 → 16", () => {
  const out = normalizeVigilanciaHeRates({
    ...DEFAULT_CCT_CONFIG,
    horaExtraValor: 22.99,
    horaExtraNoturnaValor: 0,
  });
  assert.equal(out.horaExtraValor, 16);
  assert.equal(out.horaExtraNoturnaValor, 16.5);
});

test("normalize: 16 / 16,50 permanece", () => {
  const out = normalizeVigilanciaHeRates({
    ...DEFAULT_CCT_CONFIG,
    horaExtraValor: 16,
    horaExtraNoturnaValor: 16.5,
  });
  assert.equal(out.horaExtraValor, 16);
  assert.equal(out.horaExtraNoturnaValor, 16.5);
});
