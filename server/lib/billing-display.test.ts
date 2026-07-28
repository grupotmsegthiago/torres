// Testes da FONTE ÚNICA de exibição financeira (Etapa 1 sincronismo).
// Rodar: npx tsx --test server/lib/billing-display.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { oficialBillingView, resolverContratoParaBilling } from "./billing-display";

const contrato = {
  id: 1, client_id: 10, status: "Ativo",
  valor_acionamento: 350, franquia_horas: 6, franquia_km: 100,
  valor_hora_extra: 60, valor_km_extra: 2.5, hora_extra_fracionada: true,
};

test("§8.1 — OS recusada = R$0 em tudo, mesmo com valores persistidos", () => {
  const v = oficialBillingView({ fat_total: 999, fat_acionamento: 350 }, "recusada", contrato);
  assert.equal(v.total, 0);
  assert.equal(v.acionamento, 0);
  assert.equal(v.hora_extra, 0);
});

test("fat_total persistido > 0 tem precedência absoluta", () => {
  const v = oficialBillingView({ fat_total: 512.34, fat_acionamento: 350, fat_km: 100 }, "concluida", contrato);
  assert.equal(v.total, 512.34);
});

test("sem fat_total: soma dos 9 componentes persistidos", () => {
  const b = { fat_acionamento: 350, fat_hora_extra: 60, fat_km: 25, despesas_pedagio: 12.5, receitas_os: 7.5 };
  const v = oficialBillingView(b, "concluida", contrato);
  assert.equal(v.total, 455);
  assert.equal(v.usa_fallback, false);
});

test("fallback de hora extra fracionada = horasExc × valor (regra do calcularEscolta)", () => {
  const b = { horas_missao: 7.5, km_total: 80 }; // 1.5h extra
  const v = oficialBillingView(b, "concluida", contrato);
  assert.equal(v.hora_extra, 90); // 1.5 × 60
  assert.equal(v.acionamento, 350);
  assert.equal(v.usa_fallback, true);
});

test("fallback de hora extra cheia = ceil(horasExc) × valor", () => {
  const ct = { ...contrato, hora_extra_fracionada: false };
  const b = { horas_missao: 7.5, km_total: 0 };
  const v = oficialBillingView(b, "concluida", ct);
  assert.equal(v.hora_extra, 120); // ceil(1.5)=2 × 60
});

test("fallback de KM excedente = (km_total − franquia) × valor_km_extra", () => {
  const b = { horas_missao: 5, km_total: 140 };
  const v = oficialBillingView(b, "concluida", contrato);
  assert.equal(v.km, 100); // 40 × 2.5
});

test("cancelada sem fat_total: soma componentes (acionamento + extras, §8.1b)", () => {
  const b = { fat_acionamento: 350, despesas_pedagio: 20, status: "CANCELADA" };
  const v = oficialBillingView(b, "cancelada", contrato);
  assert.equal(v.total, 370);
});

test("billing nulo = tudo zero", () => {
  const v = oficialBillingView(null, "concluida", contrato);
  assert.equal(v.total, 0);
});

test("resolverContrato: precedência OS.escort_contract_id > billing.contract_id > Ativo do cliente", () => {
  const cts = [contrato, { id: 2, client_id: 10, status: "Inativo" }, { id: 3, client_id: 10, status: "Ativo" }];
  assert.equal(resolverContratoParaBilling({ contract_id: 3 }, { escort_contract_id: 1 }, cts)?.id, 1);
  assert.equal(resolverContratoParaBilling({ contract_id: 3 }, {}, cts)?.id, 3);
  assert.equal(resolverContratoParaBilling({ client_id: 10 }, null, cts)?.id, 1); // primeiro Ativo
  assert.equal(resolverContratoParaBilling({}, null, cts), null);
});
