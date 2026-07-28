import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFolha } from "./payroll";

test("calcularFolha CLT (default) calcula INSS/IRRF/FGTS e provisões", () => {
  const f = calcularFolha({
    salarioBaseCheio: 3000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    diasUteis: 22,
    refeicaoDiaria: 43,
  });
  assert.ok(f.inss > 0, "INSS deve ser > 0 em CLT");
  assert.ok(f.fgts > 0, "FGTS deve ser > 0 em CLT");
  assert.ok(f.provisaoDecimoTerceiro > 0, "13º deve provisionar em CLT");
  assert.ok(f.provisaoFerias > 0, "férias devem provisionar em CLT");
  assert.ok(f.custoTotalEmpresa > f.totalBruto, "custo empresa > bruto em CLT (FGTS+provisões)");
  assert.ok(f.liquidoFuncionario < f.totalBruto, "líquido < bruto em CLT (descontos)");
});

test("calcularFolha não-CLT (isClt=false) zera INSS/IRRF/FGTS/provisões", () => {
  const f = calcularFolha({
    salarioBaseCheio: 3000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    diasUteis: 22,
    refeicaoDiaria: 43,
    isClt: false,
  });
  assert.equal(f.inss, 0, "INSS deve ser 0");
  assert.equal(f.irrf, 0, "IRRF deve ser 0");
  assert.equal(f.fgts, 0, "FGTS deve ser 0");
  assert.equal(f.provisaoDecimoTerceiro, 0, "13º deve ser 0");
  assert.equal(f.provisaoFerias, 0, "férias devem ser 0");
  assert.equal(f.provisaoTercoFerias, 0, "1/3 férias deve ser 0");
  assert.equal(f.provisaoFGTSsobreFerias13, 0);
  assert.equal(f.provisaoINSSsobreFerias13, 0);
  assert.equal(f.totalProvisoes, 0);
  assert.equal(f.totalDeducoes, 0);
  assert.equal(f.custoTotalEmpresa, f.totalBruto, "custo empresa = bruto (sem encargos)");
  // Modelo Torres: líquido salarial = base tributável (benefícios ficam em tabela
  // separada, fora do líquido). Não-CLT zera descontos → líquido = baseTributavel.
  assert.equal(f.liquidoFuncionario, f.baseTributavel, "líquido = base (sem descontos, sem benefícios)");
});

test("calcularFolha não-CLT preserva vencimentos (salário/HE/VR; peric opcional)", () => {
  const f = calcularFolha({
    salarioBaseCheio: 3000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    aplicarPericulosidade: true, // peric é opcional; aqui testamos o caminho ligado
    horasExtras: 10,
    diasUteis: 22,
    refeicaoDiaria: 43,
    isClt: false,
  });
  assert.equal(f.salarioProporcional, 3000, "salário proporcional preservado");
  assert.equal(f.periculosidade, 900, "periculosidade 30% preservada quando ligada");
  assert.ok(f.horasExtrasValor > 0, "HE preservada");
  assert.equal(f.refeicao, 946, "VR preservado (43 × 22)");
});

test("modelo Torres (default): peric somada, DSR desligado", () => {
  // Default: peric ON (base do cadastro é SEM peric), DSR OFF.
  const f = calcularFolha({
    salarioBaseCheio: 3000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasExtras: 10,
    horasNoturnas: 10,
  });
  assert.equal(f.periculosidade, 900, "periculosidade 30% somada (3000 × 0.3)");
  assert.equal(f.dsr, 0, "DSR desligado por default");
});

test("modelo Torres: hora noturna = R$ 16,50/h fixo (planilha oficial 28/07/2026)", () => {
  // 10h noturnas → 16,50 × 10 = 165,00 — independe do salário base.
  const f = calcularFolha({
    salarioBaseCheio: 2000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasNoturnas: 10,
  });
  assert.equal(f.adicionalNoturnoValor, 165, "noturno = 16,50 × horas (valor fixo)");
});

test("modelo Torres: hora extra = R$ 16,00/h fixo (planilha oficial 28/07/2026)", () => {
  // 10h extras → 16 × 10 = 160,00 — independe do salário base.
  const f = calcularFolha({
    salarioBaseCheio: 5000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasExtras: 10,
  });
  assert.equal(f.horasExtrasValor, 160, "HE = 16,00 × horas (valor fixo)");
});

test("modelo Torres: INSS 9% + IRRF 0% fixos + FGTS NÃO desconta do líquido", () => {
  // peric desligada p/ isolar: base = 2200.
  const f = calcularFolha({
    salarioBaseCheio: 2200,
    diasTrabalhados: 30,
    horasMensais: 220,
    aplicarPericulosidade: false,
  });
  assert.equal(f.baseTributavel, 2200, "base = salário (sem peric/dsr)");
  assert.equal(f.inss, 198, "INSS 9% fixo (2200 × 0.09)");
  assert.equal(f.irrf, 0, "IRRF 0% (planilha oficial 28/07/2026)");
  assert.equal(f.fgts, 176, "FGTS 8% (2200 × 0.08)");
  // líquido = base − inss − irrf (FGTS NÃO desconta do líquido).
  assert.equal(f.liquidoFuncionario, +(2200 - 198).toFixed(2), "líquido = base − INSS (IRRF 0, sem FGTS)");
});

test("modelo Torres: regressão planilha do dono (caso André)", () => {
  // André: cadastro base 2.565,31 + peric 30% = salário 3.334,90 (planilha).
  // HE 132h17m; Noturnas 84h46m. Horas reais (H + M/60).
  const base = 2565.31;
  const peric = 0.30;
  const horasMensais = 220;
  const horasExtras = 132 + 17 / 60;
  const horasNoturnas = 84 + 46 / 60;
  const f = calcularFolha({
    salarioBaseCheio: base,
    diasTrabalhados: 30,
    horasMensais,
    periculosidadePct: peric,
    horasExtras,
    horasNoturnas,
    diasUteis: 23,
    refeicaoDiaria: 43,
  });
  const salarioComPeric = base * (1 + peric); // 3334.90
  // "Salário" da planilha = base + peric
  assert.equal(+(f.salarioProporcional + f.periculosidade).toFixed(2), +salarioComPeric.toFixed(2), "salário c/ peric = 3334.90");
  assert.equal(f.dsr, 0);
  // Desde 28/07/2026 (planilha oficial): HE R$ 16,00/h e noturno R$ 16,50/h fixos.
  assert.ok(Math.abs(f.horasExtrasValor - 16 * horasExtras) < 0.01, "HE = 16,00 × horas (valor fixo)");
  assert.ok(Math.abs(f.adicionalNoturnoValor - 16.5 * horasNoturnas) < 0.01, "Noturno = 16,50 × horas (valor fixo)");
  assert.equal(f.baseTributavel, +(salarioComPeric + f.horasExtrasValor + f.adicionalNoturnoValor).toFixed(2), "Total = salário(c/peric) + HE + Noturno");
  assert.equal(f.inss, +(f.baseTributavel * 0.09).toFixed(2), "INSS 9% do total");
  assert.equal(f.irrf, 0, "IRRF 0% (planilha oficial 28/07/2026)");
  assert.equal(f.fgts, +(f.baseTributavel * 0.08).toFixed(2), "FGTS 8% do total");
  assert.equal(f.liquidoFuncionario, +(f.baseTributavel - f.inss - f.irrf).toFixed(2), "líquido = Total − INSS − IRRF (FGTS NÃO desconta)");
  // Sanidade: 3.334,90 + 132,2833h×16 (2.116,53) + 84,7667h×16,50 (1.398,65) = 6.850,08.
  assert.ok(Math.abs(f.baseTributavel - 6850.08) < 1, `Total (${f.baseTributavel}) ~ 6850,08`);
});
