import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCustomPeriodArgs,
  getDateRange,
  fmtYmdLocal,
  costDaysForPeriod,
  navigatePeriod,
  getDaysInRange,
} from "../client/src/lib/balanco-period.ts";

test("Aplicar período: MouseEvent no onClick NÃO quebra (usa draft)", () => {
  const fakeEvent = { type: "click", preventDefault() {} }; // como React onClick
  const r = resolveCustomPeriodArgs(fakeEvent, undefined, "2026-07-01", "2026-07-15");
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.from, "2026-07-01");
  assert.equal(r.to, "2026-07-15");
});

test("Aplicar período: strings YYYY-MM-DD têm prioridade sobre draft", () => {
  const r = resolveCustomPeriodArgs("2026-06-01", "2026-06-30", "2026-07-01", "2026-07-31");
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.from, "2026-06-01");
  assert.equal(r.to, "2026-06-30");
});

test("Aplicar período: inverte se final < inicial", () => {
  const r = resolveCustomPeriodArgs("2026-07-20", "2026-07-01", "", "");
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.from, "2026-07-01");
  assert.equal(r.to, "2026-07-20");
});

test("Aplicar período: sem datas → erro", () => {
  const r = resolveCustomPeriodArgs(undefined, undefined, "", "");
  assert.ok("error" in r);
});

test("CUSTOM range usa datas informadas", () => {
  const range = getDateRange("CUSTOM", new Date(2026, 0, 1), "2026-07-01", "2026-07-10");
  assert.equal(fmtYmdLocal(range.start), "2026-07-01");
  assert.equal(fmtYmdLocal(range.end), "2026-07-10");
  assert.equal(getDaysInRange(range), 10);
});

test("MONTH e WEEK geram ranges diferentes", () => {
  const ref = new Date(2026, 6, 15); // 15/jul/2026
  const month = getDateRange("MONTH", ref);
  const week = getDateRange("WEEK", ref);
  assert.equal(fmtYmdLocal(month.start), "2026-07-01");
  assert.equal(fmtYmdLocal(month.end), "2026-07-31");
  assert.notEqual(fmtYmdLocal(week.start), fmtYmdLocal(month.start));
  assert.ok(getDaysInRange(week) <= 7);
});

test("costDays MONTH = 30 mesmo com 31 dias de calendário", () => {
  assert.equal(costDaysForPeriod("MONTH", 31), 30);
  assert.equal(costDaysForPeriod("CUSTOM", 17), 17);
  assert.equal(costDaysForPeriod("WEEK", 7), 7);
});

test("CUSTOM ciclo RH 26→25 usa mês comercial 30 (não calendário 31)", () => {
  // 26/01→25/02 = 31 dias corridos — NÃO pode ratear HE/folha × 31/30
  assert.equal(costDaysForPeriod("CUSTOM", 31, "2026-01-26", "2026-02-25"), 30);
  // 26/06→25/07 = 30 dias — permanece 30
  assert.equal(costDaysForPeriod("CUSTOM", 30, "2026-06-26", "2026-07-25"), 30);
  // Personalizado qualquer outra faixa: dias corridos
  assert.equal(costDaysForPeriod("CUSTOM", 10, "2026-07-01", "2026-07-10"), 10);
});

test("CUSTOM 26/06→25/07: range e dias do filtro", () => {
  const range = getDateRange("CUSTOM", new Date(2026, 6, 1), "2026-06-26", "2026-07-25");
  assert.equal(fmtYmdLocal(range.start), "2026-06-26");
  assert.equal(fmtYmdLocal(range.end), "2026-07-25");
  assert.equal(getDaysInRange(range), 30);
  assert.equal(costDaysForPeriod("CUSTOM", 30, "2026-06-26", "2026-07-25"), 30);
});

test("navigatePeriod WEEK avança 7 dias (segunda)", () => {
  const monday = new Date(2026, 6, 13); // segunda 13/jul
  const next = navigatePeriod("WEEK", monday, 1);
  assert.equal(fmtYmdLocal(next), "2026-07-20");
});
