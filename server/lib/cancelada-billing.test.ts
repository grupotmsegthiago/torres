import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularEscolta } from "../billing-calc";

// Regra do dono p/ OS CANCELADA: puxar a "tabela de 100 km" do cliente e cobrar
// o acionamento + excedente real de km/horas. Dentro da franquia (≤100 km/≤3 h)
// ou sem equipe acionada ⇒ só o acionamento. Estes testes travam o cálculo base
// que computeCanceladaBilling usa (calcularEscolta com a tabela de 100 km).

// Espelho da tabela de 100 km de produção (franquia_km=100, franquia_horas=3).
const tabela100km = {
  valor_acionamento: 480,
  franquia_km: 100,
  franquia_horas: 3,
  valor_hora_extra: 110,
  valor_km_extra: 4.8,
  valor_km_carregado: 2.8,
  valor_km_vazio: 1.4,
  vrp_base: 150,
  adicional_noturno_km_pct: 15,
  adicional_noturno_vrp_pct: 20,
  adicional_periculosidade_pct: 30,
  periculosidade_horas_limite: 8,
  valor_hora_estadia: 50,
  valor_diaria: 200,
};

const base = {
  km_vazio: 0,
  horas_missao: 0,
  horas_estadia: 0,
  teve_pernoite: false,
  // OS canceladas reais sempre têm horário agendado (diurno aqui) — sem isso o
  // cálculo assume "00:00" e aplica adicional noturno. computeCanceladaBilling
  // sempre passa o horário do scheduled_date da OS.
  horario_agendado: "10:00",
  despesas_pedagio: 0,
  despesas_combustivel: 0,
  despesas_outras: 0,
  receitas_os: 0,
  contrato: tabela100km,
} as const;

test("cancelada dentro da franquia (0 km, sem tempo) cobra só o acionamento", () => {
  const r = calcularEscolta({ ...base, km_inicial: 0, km_final: 0 });
  assert.equal(r.fat_acionamento, 480);
  assert.equal(r.fat_km, 0);
  assert.equal(r.fat_hora_extra, 0);
  assert.equal(r.fat_total, 480);
});

test("cancelada sem equipe acionada (tudo zero) cobra o mínimo = acionamento", () => {
  const r = calcularEscolta({ ...base, km_inicial: 14679, km_final: 14679 });
  assert.equal(r.fat_total, 480);
});

test("cancelada com km excedente cobra acionamento + km extra", () => {
  // 150 km rodados, franquia 100 ⇒ 50 km excedente × 4,8 = 240
  const r = calcularEscolta({ ...base, km_inicial: 0, km_final: 150 });
  assert.equal(r.km_excedente, 50);
  assert.equal(r.fat_km, 240);
  assert.equal(r.fat_total, 720);
});

test("cancelada com horas excedentes cobra acionamento + hora extra fracionada", () => {
  // 10:00 → 15:00 = 5 h, franquia 3 h ⇒ 2 h × 110 = 220 (diurno, sem noturno)
  const r = calcularEscolta({
    ...base,
    km_inicial: 0,
    km_final: 0,
    horario_agendado: "10:00",
    horario_inicio: "10:00",
    inicio_ts: "2026-06-10T10:00:00-03:00",
    fim_ts: "2026-06-10T15:00:00-03:00",
    scheduled_date: "2026-06-10T10:00:00-03:00",
  });
  assert.equal(r.is_noturno, false);
  assert.equal(r.fat_hora_extra, 220);
  assert.equal(r.fat_total, 700);
});
