import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFolha, resolveCestaAjudaTorres, IRRF_ISENTO_ATE, VR_DIAS_UTEIS_CCT } from "./payroll";

test("calcularFolha CLT (default) calcula INSS/FGTS e provisões", () => {
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
  // Base mensal 3900 ≤ 5000 → IRRF 0; custo ainda inclui FGTS+provisões+VR
  assert.equal(f.irrf, 0, "IRRF isento até 5k (salário+peric)");
  assert.ok(f.custoTotalEmpresa > f.totalBruto, "custo empresa > bruto em CLT (VR+FGTS+provisões)");
  assert.ok(f.liquidoFuncionario < f.totalBruto, "líquido < bruto em CLT (INSS)");
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

test("calcularFolha PJ: valor fixo = base cadastrada (sem peric/HE/VR)", () => {
  // Caso Moacir: PJ com R$ 4.000 acordados — não soma 30% CCT em cima.
  const f = calcularFolha({
    salarioBaseCheio: 4000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    aplicarPericulosidade: true, // ignorado em PJ
    horasExtras: 10,
    horasNoturnas: 8,
    diasUteis: 22,
    refeicaoDiaria: 43,
    ajudaCustoMensal: 0,
    isClt: false,
  });
  assert.equal(f.salarioProporcional, 4000, "valor fixo = base cadastrada");
  assert.equal(f.periculosidade, 0, "PJ não soma periculosidade automática");
  assert.equal(f.horasExtrasValor, 0, "PJ não contabiliza HE");
  assert.equal(f.adicionalNoturnoValor, 0, "PJ não contabiliza noturno");
  assert.equal(f.refeicao, 0, "PJ não contabiliza VR variável");
  assert.equal(f.custoTotalEmpresa, 4000, "custo PJ = valor fixo");
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

test("modelo Torres: hora noturna = valorHora(c/ peric) × 1.8 × horas", () => {
  // base 2000 + peric 30% → salário 2600; valorHora = 2600/220 = 11.8182;
  // 10h noturnas → 11.8182 × 1.8 × 10 = 212.73.
  const f = calcularFolha({
    salarioBaseCheio: 2000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasNoturnas: 10,
  });
  const vh = (2000 * 1.3) / 220;
  assert.ok(Math.abs(f.adicionalNoturnoValor - vh * 1.8 * 10) < 0.01, "noturno 1.8× sobre hora c/ peric");
});

test("modelo Torres: INSS 12% + IRRF isento ≤5k + FGTS NÃO desconta do líquido", () => {
  // peric desligada p/ isolar: base = 2200 ≤ 5000 → IRRF 0.
  const f = calcularFolha({
    salarioBaseCheio: 2200,
    diasTrabalhados: 30,
    horasMensais: 220,
    aplicarPericulosidade: false,
  });
  assert.equal(f.baseTributavel, 2200, "base = salário (sem peric/dsr)");
  assert.equal(f.baseIrrfMensal, 2200, "base IRRF = salário+peric");
  assert.equal(f.inss, 264, "INSS 12% fixo (2200 × 0.12)");
  assert.equal(f.irrf, 0, "IRRF isento (2200 ≤ 5000)");
  assert.equal(f.fgts, 176, "FGTS 8% (2200 × 0.08)");
  assert.equal(f.liquidoFuncionario, +(2200 - 264).toFixed(2), "líquido = base − INSS (sem IRRF/FGTS)");
});

test("caso Jorge: bruto = salário+peric; IRRF 0; VR fixo 946; ajuda 200", () => {
  const base = 2565.31;
  const f = calcularFolha({
    salarioBaseCheio: base,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    diasUteis: VR_DIAS_UTEIS_CCT,
    refeicaoDiaria: 43,
    ajudaCustoMensal: 200,
  });
  assert.equal(+(f.salarioProporcional + f.periculosidade).toFixed(2), 3334.9);
  assert.equal(f.totalBruto, 3334.9, "Total bruto = salário+peric (sem VR)");
  assert.equal(f.refeicao, 946, "VR fixo 43×22");
  assert.equal(f.ajudaCusto, 200);
  assert.equal(f.irrf, 0, "IRRF 0 (base mensal 3334.90 ≤ 5000)");
  assert.equal(f.inss, +(3334.9 * 0.12).toFixed(2));
  assert.equal(f.baseIrrfMensal, 3334.9);
  // Custo inclui VR + ajuda mesmo com IRRF 0
  assert.ok(f.custoTotalEmpresa >= f.totalBruto + f.refeicao + f.ajudaCusto);
});

test("IRRF flat só acima do teto de isenção (sobre salário+peric, sem HE)", () => {
  // Base alta sem peric: 6000 > 5000 → 22% sobre 6000.
  const f = calcularFolha({
    salarioBaseCheio: 6000,
    diasTrabalhados: 30,
    horasMensais: 220,
    aplicarPericulosidade: false,
    horasExtras: 50, // HE NÃO entra na base de IRRF
  });
  assert.equal(f.baseIrrfMensal, 6000);
  assert.ok(f.baseTributavel > 6000, "HE entra na base tributável INSS/FGTS");
  assert.equal(f.irrf, +(6000 * 0.22).toFixed(2), "IRRF 22% só sobre salário (sem HE)");
  assert.ok(f.baseIrrfMensal > IRRF_ISENTO_ATE);
});

test("modelo Torres: regressão planilha do dono (caso André) — HE fora do IRRF", () => {
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
  const vh = salarioComPeric / horasMensais;
  assert.equal(+(f.salarioProporcional + f.periculosidade).toFixed(2), +salarioComPeric.toFixed(2), "salário c/ peric = 3334.90");
  assert.equal(f.totalBruto, f.baseTributavel, "bruto = remuneração (sem VR)");
  assert.equal(f.dsr, 0);
  assert.ok(Math.abs(f.horasExtrasValor - vh * 1.6 * horasExtras) < 0.01, "HE = valorHora(c/peric) × 1.6 × horas");
  assert.ok(Math.abs(f.adicionalNoturnoValor - vh * 1.8 * horasNoturnas) < 0.01, "Noturno = valorHora(c/peric) × 1.8 × horas");
  assert.equal(f.baseTributavel, +(salarioComPeric + f.horasExtrasValor + f.adicionalNoturnoValor).toFixed(2), "Total = salário(c/peric) + HE + Noturno");
  assert.equal(f.inss, +(f.baseTributavel * 0.12).toFixed(2), "INSS 12% do total");
  // IRRF: base mensal 3334.90 ≤ 5000 → 0 (HE paga à parte)
  assert.equal(f.baseIrrfMensal, +salarioComPeric.toFixed(2));
  assert.equal(f.irrf, 0, "IRRF isento na folha mensal (≤5k; HE à parte)");
  assert.equal(f.fgts, +(f.baseTributavel * 0.08).toFixed(2), "FGTS 8% do total");
  assert.equal(f.liquidoFuncionario, +(f.baseTributavel - f.inss - f.irrf).toFixed(2), "líquido = Total − INSS − IRRF (FGTS NÃO desconta)");
  assert.ok(Math.abs(f.baseTributavel - 8846.26) < 25, `Total (${f.baseTributavel}) ~ 8846,26`);
});

test("resolveCestaAjudaTorres: kit 200 vira ajuda de custo", () => {
  assert.deepEqual(resolveCestaAjudaTorres(200, 0), { cesta: 0, ajudaCusto: 200 });
  assert.deepEqual(resolveCestaAjudaTorres(208.45, 0), { cesta: 0, ajudaCusto: 208.45 });
  assert.deepEqual(resolveCestaAjudaTorres(200, 50), { cesta: 200, ajudaCusto: 50 }, "não remapeia se já há ajuda");
  assert.deepEqual(resolveCestaAjudaTorres(0, 200), { cesta: 0, ajudaCusto: 200 });
  assert.deepEqual(resolveCestaAjudaTorres(315, 0), { cesta: 315, ajudaCusto: 0 }, "SIEMACO cesta II intacta");
});
