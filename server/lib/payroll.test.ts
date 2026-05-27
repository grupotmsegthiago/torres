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
