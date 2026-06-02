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
  assert.equal(f.liquidoFuncionario, f.totalBruto, "líquido = bruto (sem descontos)");
});

test("calcularFolha não-CLT preserva vencimentos (salário/peric/HE/VR)", () => {
  const f = calcularFolha({
    salarioBaseCheio: 3000,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasExtras: 10,
    diasUteis: 22,
    refeicaoDiaria: 43,
    isClt: false,
  });
  assert.equal(f.salarioProporcional, 3000, "salário proporcional preservado");
  assert.equal(f.periculosidade, 900, "periculosidade 30% preservada");
  assert.ok(f.horasExtrasValor > 0, "HE preservada");
  assert.equal(f.refeicao, 946, "VR preservado (43 × 22)");
});

test("calcularFolha adicional noturno = só o prêmio de 20% (valorHora × 0.20 × horasNoturnas)", () => {
  // valorHora = 2200/220 = 10; 10h noturnas → prêmio = 10 × 0.20 × 10 = 20.00
  const f = calcularFolha({
    salarioBaseCheio: 2200,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0,
    horasNoturnas: 10,
  });
  assert.equal(f.adicionalNoturnoValor, 20, "deve pagar só o prêmio de 20%, não 1.20× a hora cheia");
});

test("calcularFolha adicional noturno bate com a fórmula do Control iD (mesmo padrão 20%)", () => {
  // Mesmo cálculo usado em buildFolhaStats (server/control-id.ts): valorHora × pct × horas.
  const salarioBaseCheio = 2563.60;
  const horasMensais = 220;
  const horasNoturnas = 3.47;
  const valorHora = salarioBaseCheio / horasMensais;
  const esperado = +(valorHora * 0.2 * horasNoturnas).toFixed(2);
  const f = calcularFolha({ salarioBaseCheio, diasTrabalhados: 30, horasMensais, periculosidadePct: 0, horasNoturnas });
  assert.ok(Math.abs(f.adicionalNoturnoValor - esperado) < 0.02, `holerite (${f.adicionalNoturnoValor}) deve casar com Control iD (${esperado})`);
});

test("calcularFolha adicional noturno 20% reflete em DSR e baseTributável (não 120%)", () => {
  // valorHora=10, 10h noturnas → adicional=20 (não 120). diasDescanso=30-25=5.
  // dsr = (0 HE + 20) × (5/25) = 4. baseTributável = 2200 + 0 + 0 + 20 + 4 = 2224.
  const f = calcularFolha({
    salarioBaseCheio: 2200,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0,
    horasNoturnas: 10,
    diasUteisDSR: 25,
    isClt: true,
  });
  assert.equal(f.adicionalNoturnoValor, 20);
  assert.equal(f.dsr, 4, "DSR deve incidir sobre o prêmio de 20 (não sobre 120)");
  assert.equal(f.baseTributavel, 2224, "base tributável reflete adicional de 20% + DSR");
});
