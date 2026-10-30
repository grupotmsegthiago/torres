import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acumularDiariaPonto,
  calendarDiariasRange,
  daysInclusive,
  diaElegivelDiariaFolha,
  formatPeriodoBR,
  rangeFitsDiarias,
  somarDiariasDaFolha,
} from "./diarias-periodo";

test("outubro/2026: 1ª quinzena vai de 01 a 15", () => {
  const r = calendarDiariasRange(2026, 10, "q1");
  assert.deepEqual(r, { from: "2026-10-01", to: "2026-10-15" });
  assert.equal(daysInclusive(r.from, r.to).length, 15);
});

test("outubro/2026: 2ª quinzena vai de 16 a 31", () => {
  const r = calendarDiariasRange(2026, 10, "q2");
  assert.deepEqual(r, { from: "2026-10-16", to: "2026-10-31" });
  assert.equal(daysInclusive(r.from, r.to).length, 16);
  assert.equal(daysInclusive(r.from, r.to)[0], "2026-10-16");
  assert.equal(daysInclusive(r.from, r.to).at(-1), "2026-10-31");
});

test("fevereiro não bissexto fecha a 2ª quinzena em 28", () => {
  assert.deepEqual(calendarDiariasRange(2026, 2, "q2"), { from: "2026-02-16", to: "2026-02-28" });
  assert.deepEqual(calendarDiariasRange(2024, 2, "q2"), { from: "2024-02-16", to: "2024-02-29" });
});

test("mês completo é o mês civil, e o rótulo traz as duas datas", () => {
  const r = calendarDiariasRange(2026, 10, "mes");
  assert.deepEqual(r, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(formatPeriodoBR(r.from, "2026-10-15"), "Período: 01/10/2026 a 15/10/2026");
});

test("diária do ponto conta R$ 43 uma vez por dia e ignora o pacote AUTO-Q", () => {
  const map = acumularDiariaPonto([
    { employeeId: 18, date: "2026-10-15", amount: 43, description: "[PONTO] Diária jornada >16h" },
    { employeeId: 18, date: "2026-10-15", amount: 43, description: "[PONTO] Diária jornada >16h" },
    { employeeId: 18, date: "2026-10-15", amount: 258, description: "[AUTO-Q] Diárias jornada >16h — Q1/2026-10 — 6 jornadas >16h" },
    { employeeId: 18, date: "2026-10-16", amount: 43, description: "[PONTO] Diária jornada >16h" },
  ]);
  const row = map.get(18);
  assert.deepEqual(row?.dates, ["2026-10-15", "2026-10-16"]);
  assert.equal(row?.total, 86);
});

test("diária da jornada só com 4 batidas e mais de 16 horas", () => {
  const base = {
    totalPunches: 4,
    clockIn: "09:00",
    lunchOut: "12:09",
    lunchIn: "13:14",
    clockOut: "23:59",
  };
  assert.equal(diaElegivelDiariaFolha({ ...base, jornadaRealMin: 16 * 60 }), false);
  assert.equal(diaElegivelDiariaFolha({ ...base, jornadaRealMin: 16 * 60 + 1 }), true);
  assert.equal(diaElegivelDiariaFolha({ ...base, totalPunches: 3, jornadaRealMin: 19 * 60 }), false);
  assert.equal(diaElegivelDiariaFolha({ ...base, totalPunches: 5, jornadaRealMin: 19 * 60 }), false);
  assert.equal(diaElegivelDiariaFolha({ ...base, lunchIn: null, jornadaRealMin: 19 * 60 }), false);
  assert.equal(diaElegivelDiariaFolha({ ...base, clockOut: "", jornadaRealMin: 19 * 60 }), false);
});

test("folha soma ponto válido e manual justificada, uma vez por dia", () => {
  const elegiveis = new Set(["2026-10-26"]);
  const soma = somarDiariasDaFolha([
    { employeeId: 7, date: "2026-10-26", amount: 43, description: "[PONTO] Diária jornada >16h", origem: "PONTO_AUTOMATICO" },
    { employeeId: 7, date: "2026-10-28", amount: 43, description: "[PONTO] Diária jornada >16h", origem: "PONTO_AUTOMATICO" },
    { employeeId: 7, date: "2026-10-27", amount: 43, description: "[MANUAL] Diária autorizada — Missão sem almoço no relógio", origem: "MANUAL", justificativa: "Missão sem almoço no relógio" },
    { employeeId: 7, date: "2026-10-29", amount: 50, description: "[MANUAL] Diária autorizada — abc", origem: "MANUAL", justificativa: "abc" },
    { employeeId: 7, date: "2026-10-31", amount: 258, description: "[AUTO-Q] Diárias jornada >16h" },
  ], elegiveis);
  assert.deepEqual(soma.dates, ["2026-10-26", "2026-10-27"]);
  assert.equal(soma.total, 86);
  assert.equal(soma.quantidade, 2);
});

test("intervalo invertido ou maior que 62 dias não entra no relatório", () => {
  assert.equal(rangeFitsDiarias("2026-10-15", "2026-10-01"), false);
  assert.equal(rangeFitsDiarias("2026-01-01", "2026-04-01"), false);
  assert.equal(rangeFitsDiarias("2026-10-01", "2026-10-15"), true);
});
