import { test } from "node:test";
import assert from "node:assert/strict";
import { round2, osCanonicalTotal, billingTotalForBoletim } from "./boletim-totals";

const billing = (over: Record<string, any> = {}) => ({
  fat_acionamento: 1000,
  fat_hora_extra: 200,
  fat_km: 100,
  fat_adicional_noturno: 50,
  fat_estadia: 0,
  fat_pernoite: 0,
  despesas_pedagio: 30,
  despesas_outras: 20,
  receitas_os: 0,
  fat_total: 0,
  ...over,
});

test("osCanonicalTotal soma os 9 componentes", () => {
  assert.equal(osCanonicalTotal(billing()), 1400);
});

test("billingTotalForBoletim: OS recusada SEMPRE R$0 (§8.1), ignorando componentes e fat_total", () => {
  assert.equal(billingTotalForBoletim(billing({ fat_total: 9999 }), "recusada"), 0);
  assert.equal(billingTotalForBoletim(billing(), "recusada"), 0);
});

test("billingTotalForBoletim: usa fat_total persistido quando > 0", () => {
  assert.equal(billingTotalForBoletim(billing({ fat_total: 1234.56 }), "concluida"), 1234.56);
});

test("billingTotalForBoletim: cai na soma dos 9 componentes quando fat_total = 0", () => {
  assert.equal(billingTotalForBoletim(billing({ fat_total: 0 }), "concluida"), 1400);
  assert.equal(billingTotalForBoletim(billing({ fat_total: 0 }), "cancelada"), 1400);
});

test("billingTotalForBoletim: status indefinido trata como faturável (não-recusada)", () => {
  assert.equal(billingTotalForBoletim(billing({ fat_total: 500 }), undefined), 500);
});

test("round2 arredonda para 2 casas", () => {
  assert.equal(round2(10.005), 10.01);
  assert.equal(round2(0), 0);
});
