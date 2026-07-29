/**
 * Políticas de cache Folha/RH/Balanço — contratos sem DOM/React.
 * Cobre: chaves estáveis, geração de sync (race), idade formatada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryKeys, RH_SUMMARY_FRESH_TTL_MS, RH_SUMMARY_HARD_TTL_MS } from "../shared/cache-keys.ts";

/** Espelha a regra do syncGenRef no Balanço. */
function applySyncResult(currentGen: number, responseGen: number, payload: number, ui: { value: number | null }) {
  if (responseGen !== currentGen) return false;
  ui.value = payload;
  return true;
}

test("TTL: fresh << hard (revalidar ≠ recálculo pesado sempre)", () => {
  assert.ok(RH_SUMMARY_FRESH_TTL_MS < RH_SUMMARY_HARD_TTL_MS);
  assert.equal(RH_SUMMARY_FRESH_TTL_MS, 2 * 60 * 1000);
});

test("race: resposta antiga de sync não sobrescreve a nova", () => {
  const ui = { value: null as number | null };
  let gen = 0;
  const g1 = ++gen;
  const g2 = ++gen;
  // g2 termina primeiro
  assert.equal(applySyncResult(gen, g2, 200, ui), true);
  assert.equal(ui.value, 200);
  // g1 chega depois — descartado
  assert.equal(applySyncResult(gen, g1, 100, ui), false);
  assert.equal(ui.value, 200);
});

test("leitura e sync usam a mesma chave tipada", () => {
  const from = "2026-06-26";
  const to = "2026-07-25";
  const readKey = queryKeys.rhSummary(from, to);
  const syncKey = queryKeys.rhSummary(from, to);
  assert.deepEqual(readKey, syncKey);
  assert.deepEqual(queryKeys.rhSummaryRoot, ["/api/fixed-costs/rh-summary"]);
});

test("formatCacheAge (espelho client)", () => {
  const formatCacheAge = (ageSec: number) => {
    if (!Number.isFinite(ageSec) || ageSec < 0) return "idade desconhecida";
    if (ageSec < 60) return `${ageSec}s`;
    const min = Math.floor(ageSec / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem ? `${h}h ${rem}min` : `${h}h`;
  };
  assert.equal(formatCacheAge(45), "45s");
  assert.equal(formatCacheAge(120), "2 min");
  assert.equal(formatCacheAge(3660), "1h 1min");
});
