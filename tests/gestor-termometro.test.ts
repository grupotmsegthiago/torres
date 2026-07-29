import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificarFaixaTermometro,
  computeTermometroFinanceiro,
  pctSobreCustoToFill,
  fraseTermometro,
} from "../client/src/lib/gestor-financeiro.ts";

test("1) faturamento < custo → PREJUÍZO vermelho", () => {
  const r = computeTermometroFinanceiro({ faturamento: 9000, custoTotal: 10000 });
  assert.equal(r.faixa, "prejuizo");
  assert.equal(r.cor, "vermelho");
  assert.ok(r.pctSobreCusto != null && r.pctSobreCusto < 0);
  assert.match(r.frase, /ALERTA CRÍTICO/);
});

test("2) faturamento = custo → 0% MARGEM BAIXA laranja", () => {
  const r = computeTermometroFinanceiro({ faturamento: 10000, custoTotal: 10000 });
  assert.equal(r.pctSobreCusto, 0);
  assert.equal(r.faixa, "margem_baixa");
  assert.equal(r.cor, "laranja");
});

test("3) resultado 19,99% → laranja", () => {
  const cls = classificarFaixaTermometro(19.99);
  assert.equal(cls.faixa, "margem_baixa");
  assert.equal(cls.cor, "laranja");
});

test("4) resultado 20,00% → amarelo ATENÇÃO", () => {
  const cls = classificarFaixaTermometro(20);
  assert.equal(cls.faixa, "atencao");
  assert.equal(cls.cor, "amarelo");
});

test("5) resultado 34,99% → amarelo", () => {
  const cls = classificarFaixaTermometro(34.99);
  assert.equal(cls.faixa, "atencao");
  assert.equal(cls.cor, "amarelo");
});

test("6) resultado 35,00% → verde SAUDÁVEL", () => {
  const cls = classificarFaixaTermometro(35);
  assert.equal(cls.faixa, "saudavel");
  assert.equal(cls.cor, "verde");
  const r = computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000 });
  assert.equal(r.pctSobreCusto, 35);
  assert.equal(r.faixa, "saudavel");
  assert.match(r.frase, /RESULTADO SAUDÁVEL/);
});

test("7) custo = 0 → insuficiente, sem divisão", () => {
  const r = computeTermometroFinanceiro({ faturamento: 5000, custoTotal: 0 });
  assert.equal(r.pctSobreCusto, null);
  assert.equal(r.faixa, "insuficiente");
  assert.equal(r.cor, "cinza");
  assert.equal(r.fillPct, 0);
  assert.match(r.statusLabel, /INSUFICIENTES/);
});

test("8) custo ausente/negativo tratado como insuficiente", () => {
  const r = computeTermometroFinanceiro({ faturamento: 1000, custoTotal: -1 });
  assert.equal(r.faixa, "insuficiente");
  assert.equal(r.pctSobreCusto, null);
});

test("9) faturamento ausente (0) com custo → prejuízo", () => {
  const r = computeTermometroFinanceiro({ faturamento: 0, custoTotal: 8000 });
  assert.equal(r.faixa, "prejuizo");
  assert.equal(r.lucro, -8000);
});

test("10) bordas exatas −0.01 e 0.00", () => {
  assert.equal(classificarFaixaTermometro(-0.01).cor, "vermelho");
  assert.equal(classificarFaixaTermometro(0).cor, "laranja");
});

test("11) fill sobe com o percentual (vermelho embaixo)", () => {
  const a = pctSobreCustoToFill(-10);
  const b = pctSobreCustoToFill(10);
  const c = pctSobreCustoToFill(25);
  const d = pctSobreCustoToFill(40);
  assert.ok(a < b && b < c && c < d);
  assert.ok(a <= 25);
  assert.ok(b > 25 && b < 50);
  assert.ok(c > 50 && c < 75);
  assert.ok(d >= 75);
});

test("12) fill nulo/insuficiente = 0", () => {
  assert.equal(pctSobreCustoToFill(null), 0);
});

test("13) exemplos do spec (−10%, +10%, +20%, +35%)", () => {
  assert.equal(computeTermometroFinanceiro({ faturamento: 9000, custoTotal: 10000 }).pctSobreCusto, -10);
  assert.equal(computeTermometroFinanceiro({ faturamento: 11000, custoTotal: 10000 }).pctSobreCusto, 10);
  assert.equal(computeTermometroFinanceiro({ faturamento: 12000, custoTotal: 10000 }).pctSobreCusto, 20);
  assert.equal(computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000 }).pctSobreCusto, 35);
});

test("14) frases determinísticas por faixa", () => {
  assert.match(
    fraseTermometro({ faixa: "prejuizo", faturamento: 9, custo: 10, lucro: -1, pctSobreCusto: -10 }),
    /ALERTA CRÍTICO/,
  );
  assert.match(
    fraseTermometro({ faixa: "margem_baixa", faturamento: 11, custo: 10, lucro: 1, pctSobreCusto: 10 }),
    /MARGEM BAIXA/,
  );
  assert.match(
    fraseTermometro({ faixa: "atencao", faturamento: 12, custo: 10, lucro: 2, pctSobreCusto: 20 }),
    /ATENÇÃO/,
  );
  assert.match(
    fraseTermometro({ faixa: "saudavel", faturamento: 14, custo: 10, lucro: 4, pctSobreCusto: 40 }),
    /RESULTADO SAUDÁVEL/,
  );
});

test("15) lucro oficial do input é respeitado (não recalcula se passado)", () => {
  const r = computeTermometroFinanceiro({ faturamento: 100, custoTotal: 50, lucro: 40 });
  assert.equal(r.lucro, 40);
});

test("16) período sem movimento (fat=0, custo>0)", () => {
  const r = computeTermometroFinanceiro({ faturamento: 0, custoTotal: 500 });
  assert.equal(r.faixa, "prejuizo");
  assert.ok((r.pctSobreCusto ?? 0) < 0);
});
