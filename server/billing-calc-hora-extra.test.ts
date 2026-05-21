import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFaturamentoLive, calcularEscolta } from "./billing-calc.ts";

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
