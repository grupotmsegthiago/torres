import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDiariasRange,
  daysInclusive,
  formatPeriodoBR,
  rangeFitsDiarias,
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

test("intervalo invertido ou maior que 62 dias não entra no relatório", () => {
  assert.equal(rangeFitsDiarias("2026-10-15", "2026-10-01"), false);
  assert.equal(rangeFitsDiarias("2026-01-01", "2026-04-01"), false);
  assert.equal(rangeFitsDiarias("2026-10-01", "2026-10-15"), true);
});
