import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificarFaixaTermometro,
  computeTermometroFinanceiro,
  pctSobreCustoToFill,
  fraseTermometro,
  metaSaudavelTermometro,
  faixasTermometro,
} from "../client/src/lib/gestor-financeiro.ts";

test("1) faturamento < custo → PREJUÍZO vermelho", () => {
  const r = computeTermometroFinanceiro({ faturamento: 9000, custoTotal: 10000, period: "MONTH" });
  assert.equal(r.faixa, "prejuizo");
  assert.equal(r.cor, "vermelho");
  assert.ok(r.pctSobreCusto != null && r.pctSobreCusto < 0);
  assert.match(r.frase, /ALERTA CRÍTICO/);
});

test("2) faturamento = custo → 0% MARGEM BAIXA laranja", () => {
  const r = computeTermometroFinanceiro({ faturamento: 10000, custoTotal: 10000, period: "MONTH" });
  assert.equal(r.pctSobreCusto, 0);
  assert.equal(r.faixa, "margem_baixa");
  assert.equal(r.cor, "laranja");
});

test("3) mensal: 19,99% → laranja", () => {
  const cls = classificarFaixaTermometro(19.99, 35);
  assert.equal(cls.faixa, "margem_baixa");
  assert.equal(cls.cor, "laranja");
});

test("4) mensal: 20,00% → amarelo ATENÇÃO", () => {
  const cls = classificarFaixaTermometro(20, 35);
  assert.equal(cls.faixa, "atencao");
  assert.equal(cls.cor, "amarelo");
});

test("5) mensal: 34,99% → amarelo", () => {
  const cls = classificarFaixaTermometro(34.99, 35);
  assert.equal(cls.faixa, "atencao");
  assert.equal(cls.cor, "amarelo");
});

test("6) mensal: 35,00% → verde SAUDÁVEL", () => {
  const cls = classificarFaixaTermometro(35, 35);
  assert.equal(cls.faixa, "saudavel");
  assert.equal(cls.cor, "verde");
  const r = computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000, period: "MONTH" });
  assert.equal(r.pctSobreCusto, 35);
  assert.equal(r.metaSaudavel, 35);
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
  assert.equal(classificarFaixaTermometro(-0.01, 35).cor, "vermelho");
  assert.equal(classificarFaixaTermometro(0, 35).cor, "laranja");
});

test("11) fill sobe com o percentual (vermelho embaixo)", () => {
  const a = pctSobreCustoToFill(-10, 35);
  const b = pctSobreCustoToFill(10, 35);
  const c = pctSobreCustoToFill(25, 35);
  const d = pctSobreCustoToFill(40, 35);
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
    fraseTermometro({ faixa: "prejuizo", faturamento: 9, custo: 10, lucro: -1, pctSobreCusto: -10, metaSaudavel: 35 }),
    /ALERTA CRÍTICO/,
  );
  assert.match(
    fraseTermometro({ faixa: "margem_baixa", faturamento: 11, custo: 10, lucro: 1, pctSobreCusto: 10, metaSaudavel: 35 }),
    /MARGEM BAIXA/,
  );
  assert.match(
    fraseTermometro({ faixa: "atencao", faturamento: 12, custo: 10, lucro: 2, pctSobreCusto: 20, metaSaudavel: 35 }),
    /ATENÇÃO.*35%/,
  );
  assert.match(
    fraseTermometro({ faixa: "saudavel", faturamento: 14, custo: 10, lucro: 4, pctSobreCusto: 40, metaSaudavel: 35 }),
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

test("17) metas por período: diário 100 · semanal 50 · mensal 35", () => {
  assert.equal(metaSaudavelTermometro("DAY"), 100);
  assert.equal(metaSaudavelTermometro("WEEK"), 50);
  assert.equal(metaSaudavelTermometro("MONTH"), 35);
  assert.equal(metaSaudavelTermometro("QUARTER"), 35);
  assert.equal(metaSaudavelTermometro("CUSTOM", 1), 100);
  assert.equal(metaSaudavelTermometro("CUSTOM", 7), 50);
  assert.equal(metaSaudavelTermometro("CUSTOM", 30), 35);
});

test("18) diário: 35% ainda é MARGEM BAIXA; 100% é SAUDÁVEL", () => {
  const mid = computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000, period: "DAY" });
  assert.equal(mid.metaSaudavel, 100);
  assert.equal(mid.pctSobreCusto, 35);
  assert.equal(mid.faixa, "margem_baixa"); // 35 < 100*(20/35)≈57.14 → laranja
  const atencao = computeTermometroFinanceiro({ faturamento: 17000, custoTotal: 10000, period: "DAY" });
  assert.equal(atencao.pctSobreCusto, 70);
  assert.equal(atencao.faixa, "atencao");
  const ok = computeTermometroFinanceiro({ faturamento: 20000, custoTotal: 10000, period: "DAY" });
  assert.equal(ok.pctSobreCusto, 100);
  assert.equal(ok.faixa, "saudavel");
  assert.equal(ok.cor, "verde");
  assert.match(ok.frase, /100%/);
});

test("19) semanal: 35% ATENÇÃO; 50% SAUDÁVEL", () => {
  const mid = computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000, period: "WEEK" });
  assert.equal(mid.metaSaudavel, 50);
  assert.equal(mid.faixa, "atencao"); // 35 está entre 28.57 e 50
  const ok = computeTermometroFinanceiro({ faturamento: 15000, custoTotal: 10000, period: "WEEK" });
  assert.equal(ok.pctSobreCusto, 50);
  assert.equal(ok.faixa, "saudavel");
});

test("20) mensal mantém 35% como SAUDÁVEL", () => {
  const r = computeTermometroFinanceiro({ faturamento: 13500, custoTotal: 10000, period: "MONTH" });
  assert.equal(r.metaSaudavel, 35);
  assert.equal(r.faixa, "saudavel");
});

test("21) faixas proporcionais: semanal mid ≈ 28,57", () => {
  const f = faixasTermometro(50);
  assert.equal(f.metaSaudavel, 50);
  assert.ok(Math.abs(f.margemBaixaMax - (50 * 20) / 35) < 0.01);
  assert.equal(classificarFaixaTermometro(28, 50).faixa, "margem_baixa");
  assert.equal(classificarFaixaTermometro(29, 50).faixa, "atencao");
  assert.equal(classificarFaixaTermometro(50, 50).faixa, "saudavel");
});
