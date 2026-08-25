import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBalancoOsRevenue } from "../client/src/lib/balanco-revenue.ts";

test("cancelada com billing CANCELADO usa fat do boletim (100 km) e congela", () => {
  const r = resolveBalancoOsRevenue({
    osStatus: "cancelada",
    liveFat: 4340.5,
    bill: { status: "CANCELADO", fat_total_boletim: 767.83, fat_total: 767.83 },
  });
  assert.equal(r.fat, 767.83);
  assert.equal(r.isFrozen, true);
  assert.equal(r.useBoletim, true);
});

test("cancelada SEM billing no byMission: fail-closed (0) — NÃO usa liveFat", () => {
  // Cenário TOR-0560: dashboard truncava billings (>1000) e a OS caía no canônico.
  const r = resolveBalancoOsRevenue({
    osStatus: "cancelada",
    liveFat: 4340.5,
    bill: null,
  });
  assert.equal(r.fat, 0);
  assert.equal(r.isFrozen, true);
  assert.equal(r.useBoletim, false);
});

test("cancelada com billing A_VERIFICAR e fat>0 ainda usa snapshot (não live)", () => {
  const r = resolveBalancoOsRevenue({
    osStatus: "cancelada",
    liveFat: 4000,
    bill: { status: "A_VERIFICAR", fat_total_boletim: 767.83 },
  });
  assert.equal(r.fat, 767.83);
  assert.equal(r.isFrozen, true);
});

test("concluída sem boletim aprovado: previsão ao vivo (em aberto)", () => {
  const r = resolveBalancoOsRevenue({
    osStatus: "concluída",
    liveFat: 2105.7,
    bill: { status: "A_VERIFICAR", fat_total_boletim: 2105.7 },
  });
  assert.equal(r.fat, 2105.7);
  assert.equal(r.isFrozen, false);
});

test("boletim APROVADA congela mesmo com liveFat diferente", () => {
  const r = resolveBalancoOsRevenue({
    osStatus: "concluída",
    liveFat: 99999,
    bill: { status: "APROVADA", fat_total_boletim: 5144 },
  });
  assert.equal(r.fat, 5144);
  assert.equal(r.isFrozen, true);
});
