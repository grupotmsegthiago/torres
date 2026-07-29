import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFolha } from "./payroll";
import { composeCustoEmpresaDetalhado } from "./employee-monthly-cost";

test("Fernando HE=0: custo fecha ~5452,83 sem encargos CCT extras", () => {
  // Base vigilante 2565.31 × 1.3 = 3334.90; VR 43×23; cesta 200; VT/outros/VA/assid = 86
  const folha = calcularFolha({
    salarioBaseCheio: 2565.31,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    horasExtras: 0,
    horasNoturnas: 0,
    diasUteis: 23,
    refeicaoDiaria: 43,
  });
  const beneficios = { cesta: 200, vt: 0, outros: 86, valeAlimentacao: 0, assiduidade: 0 };
  // Sem INSS patronal / seguro — regressão do custo antigo
  const c = composeCustoEmpresaDetalhado({
    folha,
    beneficios,
    diarias: 0,
    inssPatronalPct: 0,
    seguroVidaMensal: 0,
  });
  // 3334.90 + 989 + 200 + 86 + 266.79 FGTS + 576.14 provisões ≈ 5452.83
  assert.ok(Math.abs(c.custoTotalEmpresa - 5452.83) < 0.05, `esperado ~5452.83, veio ${c.custoTotalEmpresa}`);
  assert.equal(c.custoProvisionado, +(folha.fgts + folha.totalProvisoes).toFixed(2));
});

test("composeCustoEmpresa: INSS patronal + seguro entram no realizado e no total", () => {
  const folha = calcularFolha({
    salarioBaseCheio: 2565.31,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    diasUteis: 23,
    refeicaoDiaria: 43,
  });
  const beneficios = { cesta: 200, vt: 0, outros: 86, valeAlimentacao: 0, assiduidade: 0 };
  const sem = composeCustoEmpresaDetalhado({
    folha,
    beneficios,
    inssPatronalPct: 0,
    seguroVidaMensal: 0,
  });
  const com = composeCustoEmpresaDetalhado({
    folha,
    beneficios,
    inssPatronalPct: 20,
    seguroVidaMensal: 14.9,
  });
  const esperadoPatronal = +(folha.baseTributavel * 0.2).toFixed(2);
  assert.equal(com.inssPatronal, esperadoPatronal);
  assert.equal(com.seguroVida, 14.9);
  assert.equal(
    +(com.custoTotalEmpresa - sem.custoTotalEmpresa).toFixed(2),
    +(esperadoPatronal + 14.9).toFixed(2),
  );
  assert.equal(
    com.custoRealizado,
    +(sem.custoRealizado + esperadoPatronal + 14.9).toFixed(2),
  );
  // Provisionado (FGTS + provisões) não muda com encargos CCT
  assert.equal(com.custoProvisionado, sem.custoProvisionado);
});

test("composeCustoEmpresa: diárias entram no realizado", () => {
  const folha = calcularFolha({
    salarioBaseCheio: 2565.31,
    diasTrabalhados: 30,
    periculosidadePct: 0.3,
    diasUteis: 22,
    refeicaoDiaria: 43,
  });
  const beneficios = { cesta: 200, vt: 0, outros: 0, valeAlimentacao: 0, assiduidade: 0 };
  const sem = composeCustoEmpresaDetalhado({ folha, beneficios, diarias: 0, inssPatronalPct: 0 });
  const com = composeCustoEmpresaDetalhado({ folha, beneficios, diarias: 150, inssPatronalPct: 0 });
  assert.equal(com.diarias, 150);
  assert.equal(+(com.custoTotalEmpresa - sem.custoTotalEmpresa).toFixed(2), 150);
  assert.equal(+(com.custoRealizado - sem.custoRealizado).toFixed(2), 150);
});

test("composeCustoEmpresa: não-CLT zera INSS patronal e seguro", () => {
  const folha = calcularFolha({
    salarioBaseCheio: 3000,
    periculosidadePct: 0,
    isClt: false,
  });
  const c = composeCustoEmpresaDetalhado({
    folha,
    beneficios: { cesta: 0, vt: 0, outros: 0, valeAlimentacao: 0, assiduidade: 0 },
    inssPatronalPct: 20,
    seguroVidaMensal: 14.9,
    isClt: false,
  });
  assert.equal(c.inssPatronal, 0);
  assert.equal(c.seguroVida, 0);
  assert.equal(c.custoProvisionado, 0);
  assert.equal(c.custoTotalEmpresa, c.custoRealizado);
});

test("composeCustoEmpresa: descontos do empregado são informativos (não somam no custo)", () => {
  const folha = calcularFolha({
    salarioBaseCheio: 2565.31,
    periculosidadePct: 0.3,
  });
  const c = composeCustoEmpresaDetalhado({
    folha,
    beneficios: { cesta: 0, vt: 0, outros: 0, valeAlimentacao: 0, assiduidade: 0 },
    vtDesconto: 200,
    inssPatronalPct: 0,
  });
  assert.ok(c.descontosEmpregado.inss > 0);
  assert.ok(c.descontosEmpregado.irrf > 0);
  assert.equal(c.descontosEmpregado.vt, 200);
  // Custo não inclui descontos do empregado
  assert.ok(c.custoTotalEmpresa > c.descontosEmpregado.total);
});

test("HE eleva base tributável e, em cascata, FGTS + INSS patronal", () => {
  const base = {
    salarioBaseCheio: 2565.31,
    diasTrabalhados: 30,
    horasMensais: 220,
    periculosidadePct: 0.3,
    diasUteis: 23,
    refeicaoDiaria: 43,
  };
  const semHe = calcularFolha({ ...base, horasExtras: 0 });
  const comHe = calcularFolha({ ...base, horasExtras: 40 });
  const beneficios = { cesta: 200, vt: 0, outros: 86, valeAlimentacao: 0, assiduidade: 0 };
  const a = composeCustoEmpresaDetalhado({
    folha: semHe,
    beneficios,
    inssPatronalPct: 20,
    seguroVidaMensal: 14.9,
  });
  const b = composeCustoEmpresaDetalhado({
    folha: comHe,
    beneficios,
    inssPatronalPct: 20,
    seguroVidaMensal: 14.9,
  });
  assert.ok(comHe.horasExtrasValor > 0);
  assert.ok(b.custoTotalEmpresa > a.custoTotalEmpresa);
  assert.ok(b.inssPatronal > a.inssPatronal);
  assert.ok(b.custoProvisionado > a.custoProvisionado); // FGTS sobe com HE
});
