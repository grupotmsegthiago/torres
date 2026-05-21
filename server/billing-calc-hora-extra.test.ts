import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFaturamentoLive, calcularEscolta, splitMissionCostsForBilling } from "./billing-calc.ts";

// REGRESSÃO TOR-0179 (Bug #2 — pedágio duplicado)
// O sistema cria 2 entries em mission_costs por pedágio (expense + revenue).
// A revenue de pedágio NÃO deve somar em receitas_os — senão duplica em fat_total.
test("splitMissionCostsForBilling: pedágio com cost_type=revenue NÃO conta em receitas_os", () => {
  const mcs = [
    { id: 1, category: "Pedágio", amount: 13.60, cost_type: "expense" },
    { id: 2, category: "Pedágio", amount: 13.60, cost_type: "revenue" },
    { id: 3, category: "Pedágio", amount: 13.70, cost_type: "expense" },
    { id: 4, category: "Pedágio", amount: 13.70, cost_type: "revenue" },
    { id: 5, category: "Pedágio", amount: 3.50, cost_type: "expense" },
    { id: 6, category: "Pedágio", amount: 3.50, cost_type: "revenue" },
    { id: 7, category: "Combustível", amount: 143.29, cost_type: "expense" },
    { id: 8, category: "Bonificação", amount: 50.00, cost_type: "revenue" },
  ];
  const r = splitMissionCostsForBilling(mcs);
  assert.equal(r.despesas_pedagio, 30.80, "pedágios expense somam 30.80");
  assert.equal(r.despesas_combustivel, 143.29);
  assert.equal(r.despesas_outras, 0);
  assert.equal(r.receitas_os, 50.00, "apenas Bonificação revenue conta; pedágio revenue é ignorado");
  assert.equal(r.revenueItems.length, 1, "só 1 revenue item (Bonificação)");
});

test("splitMissionCostsForBilling: aceita costType (camelCase) do storage layer", () => {
  const r = splitMissionCostsForBilling([
    { id: 1, category: "Pedágio", amount: 10, costType: "expense" },
    { id: 2, category: "Pedágio", amount: 10, costType: "revenue" },
    { id: 3, category: "Outros", amount: 5, costType: "revenue" },
  ]);
  assert.equal(r.despesas_pedagio, 10);
  assert.equal(r.receitas_os, 5);
});

test("TOR-0179: split + calcularEscolta produzem fat_total=676,80 (sem pedágio duplicado)", () => {
  // Simula o fluxo real: caller faz split antes, passa só despesas_pedagio para calcularEscolta.
  const mCosts = [
    { category: "Pedágio", amount: 13.60, cost_type: "expense" },
    { category: "Pedágio", amount: 13.60, cost_type: "revenue" },
    { category: "Pedágio", amount: 13.70, cost_type: "expense" },
    { category: "Pedágio", amount: 13.70, cost_type: "revenue" },
    { category: "Pedágio", amount: 3.50, cost_type: "expense" },
    { category: "Pedágio", amount: 3.50, cost_type: "revenue" },
  ];
  const split = splitMissionCostsForBilling(mCosts);
  assert.equal(split.despesas_pedagio, 30.80);
  assert.equal(split.receitas_os, 0, "pedágio revenue NÃO conta — anti-duplicação");

  const contrato = {
    valor_acionamento: 546, valor_km_extra: 5.46, valor_hora_extra: 150,
    franquia_km: 100, franquia_horas: 3, valor_hora_estadia: 50,
    hora_extra_fracionada: true, adicional_noturno_km_pct: 0, vrp_base: 0,
  };
  const r = calcularEscolta({
    km_inicial: 12428, km_final: 12514, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "18:00", horario_fim: "21:40", horario_agendado: "18:00",
    despesas_pedagio: split.despesas_pedagio,
    despesas_combustivel: split.despesas_combustivel,
    despesas_outras: split.despesas_outras,
    receitas_os: split.receitas_os,
    contrato,
  });
  // 546 acionamento + (40/60)*150 = 100 hora extra + 30.80 pedágio = 676.80
  assert.equal(r.fat_acionamento, 546);
  assert.ok(Math.abs(r.fat_hora_extra - 100) < 0.02, `fat_hora_extra esperado ~100, got ${r.fat_hora_extra}`);
  assert.ok(Math.abs(r.fat_total - 676.80) < 0.02, `fat_total esperado 676.80, got ${r.fat_total}`);
});

// REGRESSÃO TASK #102 — bug TOR-0179
// 40min HE com valor_hora_extra=R$150 deve gravar R$100 (não R$3,64).
// R$3,64 indica que o sistema leu valor_km_extra (R$5,46/km) em vez de valor_hora_extra.

const baseContrato = {
  valor_acionamento: 530,
  valor_km_extra: 5.46,        // valor que aparecia "errado" no billing
  valor_km_carregado: 5.46,
  valor_km_vazio: 1.40,
  valor_hora_extra: 150,        // valor correto da hora extra
  valor_hora_estadia: 50,
  franquia_horas: 3,
  franquia_km: 100,
  hora_extra_fracionada: true,
  vrp_base: 150,
  valor_diaria: 200,
  adicional_noturno_vrp_pct: 0,
  adicional_noturno_km_pct: 0,
  adicional_periculosidade_pct: 0,
  periculosidade_horas_limite: 0,
};

test("calcularFaturamentoLive: 40min de HE com valor_hora_extra=R$150 → R$100,00", () => {
  // missão 3h40min, franquia 3h → 40min excedentes = 0.6667h
  const r = calcularFaturamentoLive({
    horasMissao: 3 + 40 / 60,
    kmInicial: 0, kmFinal: 50,
    contrato: baseContrato,
  });
  assert.equal(r.fat_hora_extra, 100, `fat_hora_extra deve ser R$100, foi R$${r.fat_hora_extra}`);
  assert.notEqual(r.fat_hora_extra, 3.64, "fat_hora_extra NÃO pode ser R$3,64 (bug TOR-0179)");
});

test("calcularEscolta: 40min de HE fracionada com valor_hora_extra=R$150 → R$100,00", () => {
  const r = calcularEscolta({
    km_inicial: 0, km_final: 50, km_vazio: 0,
    horas_missao: 3 + 40 / 60, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "08:00", horario_fim: "11:40", horario_agendado: "08:00",
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: baseContrato,
  });
  assert.equal(r.fat_hora_extra, 100, `fat_hora_extra deve ser R$100, foi R$${r.fat_hora_extra}`);
  assert.notEqual(r.fat_hora_extra, 3.64, "fat_hora_extra NÃO pode ser R$3,64");
});

test("calcularFaturamentoLive: HE usa valor_hora_extra, NUNCA valor_km_extra", () => {
  // 1h excedente — resultado deve ser igual ao valor_hora_extra, não ao valor_km_extra
  const r = calcularFaturamentoLive({
    horasMissao: 4, // franquia 3h → 1h excedente
    kmInicial: 0, kmFinal: 50,
    contrato: baseContrato,
  });
  assert.equal(r.fat_hora_extra, 150, "1h excedente deve cobrar R$150 (valor_hora_extra)");
  assert.notEqual(r.fat_hora_extra, 5.46, "fat_hora_extra não pode ser igual a valor_km_extra");
});

test("calcularEscolta: hora_extra_fracionada=false → arredonda para hora cheia", () => {
  const r = calcularEscolta({
    km_inicial: 0, km_final: 50, km_vazio: 0,
    horas_missao: 3 + 40 / 60, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "08:00", horario_fim: "11:40",
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: { ...baseContrato, hora_extra_fracionada: false },
  });
  // 40min → arredonda para 1h cheia → R$150
  assert.equal(r.fat_hora_extra, 150, `hora cheia: 40min→1h×R$150=R$150, foi R$${r.fat_hora_extra}`);
});

test("calcularFaturamentoLive: missão dentro da franquia → fat_hora_extra=0", () => {
  const r = calcularFaturamentoLive({
    horasMissao: 2.5, // franquia 3h
    kmInicial: 0, kmFinal: 50,
    contrato: baseContrato,
  });
  assert.equal(r.fat_hora_extra, 0);
});

test("calcularFaturamentoLive: fallback usa valor_hora_estadia quando valor_hora_extra=0", () => {
  const r = calcularFaturamentoLive({
    horasMissao: 4, kmInicial: 0, kmFinal: 50,
    contrato: { ...baseContrato, valor_hora_extra: 0, valor_hora_estadia: 80 },
  });
  // fallback documentado em billing-calc.ts:106
  assert.equal(r.fat_hora_extra, 80, "deve usar valor_hora_estadia como fallback");
});

test("calcularFaturamentoLive: sem acionamento → fat_hora_extra=0 (modelo KM-only)", () => {
  const r = calcularFaturamentoLive({
    horasMissao: 10, // bem acima da franquia
    kmInicial: 0, kmFinal: 50,
    contrato: { ...baseContrato, valor_acionamento: 0 },
  });
  assert.equal(r.fat_hora_extra, 0, "modelo sem acionamento não cobra hora extra");
});

test("calcularEscolta: 2h30min excedente fracionada com R$150/h → R$375,00", () => {
  const r = calcularEscolta({
    km_inicial: 0, km_final: 50, km_vazio: 0,
    horas_missao: 5.5, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "08:00", horario_fim: "13:30",
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: baseContrato,
  });
  // 5.5h - 3h franquia = 2.5h × R$150 = R$375
  assert.equal(r.fat_hora_extra, 375);
});

// REGRESSÃO HE MULTI-DIA — bug TOR-0153/TOR-0159
// Missão que atravessa dias deve usar timestamps reais, não HH:MM (que perde o dia).
test("calcularEscolta: missão de 35h39min (atravessa dia) deve gravar HE real", () => {
  const contratoTM = {
    valor_acionamento: 480, valor_hora_extra: 110, franquia_horas: 3,
    hora_extra_fracionada: true, valor_km_carregado: 0, valor_km_vazio: 0,
    franquia_km: 0, valor_km_extra: 0, vrp_base: 0,
    adicional_noturno_vrp_pct: 0, adicional_noturno_km_pct: 0,
  };
  // 07/05 07:13 → 08/05 18:52 = 35h39min reais
  const r = calcularEscolta({
    km_inicial: 0, km_final: 0, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "07:13", horario_fim: "18:52", horario_agendado: "07:00",
    inicio_ts: "2026-05-07T07:13:00-03:00",
    fim_ts: "2026-05-08T18:52:00-03:00",
    scheduled_date: "2026-05-07T07:00:00-03:00",
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: contratoTM,
  });
  // inicio_considerado = 07:00 (agendado < real). De 07/05 07:00 a 08/05 18:52 = 35h52min.
  // HE = 35h52min - 3h = 32h52min ≈ 32.867h × R$110 = R$3.615,33
  assert.ok(r.horas_trabalhadas > 30, `horas_trabalhadas deve ser > 30h, foi ${r.horas_trabalhadas}`);
  assert.ok(r.fat_hora_extra > 3500, `fat_hora_extra deve ser > R$3500 (multi-dia), foi ${r.fat_hora_extra}`);
  assert.ok(r.fat_hora_extra < 3700, `fat_hora_extra deve ser < R$3700, foi ${r.fat_hora_extra}`);
});

test("calcularEscolta: SEM timestamps reais, comportamento HH:MM continua valendo (fallback)", () => {
  // sanity check: o fallback HH:MM (legado) não quebra para missão de mesmo dia
  const contratoTM = {
    valor_acionamento: 480, valor_hora_extra: 110, franquia_horas: 3,
    hora_extra_fracionada: true, valor_km_carregado: 0, valor_km_vazio: 0,
    franquia_km: 0, valor_km_extra: 0, vrp_base: 0,
    adicional_noturno_vrp_pct: 0, adicional_noturno_km_pct: 0,
  };
  const r = calcularEscolta({
    km_inicial: 0, km_final: 0, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "08:00", horario_fim: "14:00", horario_agendado: "08:00",
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: contratoTM,
  });
  // 6h - 3h franquia = 3h × R$110 = R$330
  assert.ok(Math.abs(r.fat_hora_extra - 330) < 1, `fat_hora_extra ~R$330, foi ${r.fat_hora_extra}`);
});

test("calcularEscolta: agendamento noturno (scheduled_date em ISO UTC) usa data BRT, não desloca dia", () => {
  // Agendamento 07/05 23:30 BRT → em ISO UTC vira "2026-05-08T02:30:00.000Z".
  // slice(0,10) DARIA "2026-05-08" (errado: 1 dia depois). Após fix, deve ser "2026-05-07".
  // Missão real: chegou em 23:50, terminou em 09/05 06:00 = 6h30min reais (de 07/05 23:30 a 09/05 06:00).
  const contratoTM = {
    valor_acionamento: 400, valor_hora_extra: 100, franquia_horas: 3,
    hora_extra_fracionada: true, valor_km_carregado: 0, valor_km_vazio: 0,
    franquia_km: 0, valor_km_extra: 0, vrp_base: 0,
    adicional_noturno_vrp_pct: 0, adicional_noturno_km_pct: 0,
  };
  const r = calcularEscolta({
    km_inicial: 0, km_final: 0, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    horario_inicio: "23:50", horario_fim: "06:00", horario_agendado: "23:30",
    inicio_ts: "2026-05-07T23:50:00-03:00",
    fim_ts: "2026-05-09T06:00:00-03:00",
    scheduled_date: new Date("2026-05-07T23:30:00-03:00").toISOString(), // = 2026-05-08T02:30Z
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
    contrato: contratoTM,
  });
  // Início agendado em BRT = 07/05 23:30, fim = 09/05 06:00 → 30h30min reais.
  // Se bug do slice → daria 06h30min (perdia 24h).
  assert.ok(r.horas_trabalhadas > 30, `horas_trabalhadas deve ser ~30.5h (não 6.5h), foi ${r.horas_trabalhadas}`);
});
