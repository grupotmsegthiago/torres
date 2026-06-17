import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecusadaZeroPayload } from "./recusada-guard";

test("§8.1: zera TODOS os campos fat_* e marca CANCELADO", () => {
  const p = buildRecusadaZeroPayload();
  assert.equal(p.status, "CANCELADO");
  const zeroFields = [
    "fat_total", "fat_acionamento", "fat_hora_extra", "fat_km",
    "fat_km_carregado", "fat_km_vazio", "fat_estadia", "fat_pernoite",
    "fat_diaria", "fat_adicional_noturno", "resultado_bruto",
    "resultado_liquido", "margem_percentual",
  ] as const;
  for (const f of zeroFields) {
    assert.equal((p as any)[f], 0, `campo ${f} deve ser 0`);
  }
});

test("§8.1: observação default é 'OS RECUSADA'", () => {
  assert.equal(buildRecusadaZeroPayload().observacoes, "OS RECUSADA");
});

test("§8.1: motivo entra na observação", () => {
  assert.equal(
    buildRecusadaZeroPayload("sem viatura").observacoes,
    "OS RECUSADA — sem viatura",
  );
});

test("§8.1: preserva observação existente que já começa com OS RECUSADA", () => {
  assert.equal(
    buildRecusadaZeroPayload("novo motivo", "OS RECUSADA — motivo original").observacoes,
    "OS RECUSADA — motivo original",
  );
});

test("§8.1: spread do zero payload sobre billing calculado anula todo fat_* (padrão das rotas submit-os/salvar/recalcular)", () => {
  // Simula o que as rotas de escrita fazem: cálculo pelo contrato gerou valores,
  // e o guard espalha buildRecusadaZeroPayload por cima ⇒ tudo vai a zero.
  const calculado = {
    status: "A_VERIFICAR",
    fat_total: 2921.67, fat_acionamento: 960, fat_hora_extra: 1961.67,
    fat_km: 120, fat_km_carregado: 80, fat_km_vazio: 40, fat_estadia: 50,
    fat_pernoite: 200, fat_diaria: 200, fat_adicional_noturno: 30,
    resultado_bruto: 2921.67, resultado_liquido: 2500, margem_percentual: 85,
    km_total: 246, // campo não-fat: deve permanecer (não é cobrança)
  };
  const final = { ...calculado, ...buildRecusadaZeroPayload(null, "") };
  assert.equal(final.status, "CANCELADO");
  assert.equal(final.fat_total, 0);
  assert.equal(final.fat_acionamento, 0);
  assert.equal(final.fat_hora_extra, 0);
  assert.equal(final.resultado_liquido, 0);
  assert.equal(final.margem_percentual, 0);
  assert.equal(final.km_total, 246);
});
