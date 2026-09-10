import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessBoletimCoverage,
  billingCycleLabel,
  daysBetween,
  isOsReadyForBoletim,
  lastDayOfMonth,
  normalizeBillingCycle,
  periodForDate,
} from "./billing-cycle.ts";

test("normalizeBillingCycle: quinzenal / mensal / diario / por_missao", () => {
  assert.equal(normalizeBillingCycle("Quinzenal"), "quinzenal");
  assert.equal(normalizeBillingCycle("mensal"), "mensal");
  assert.equal(normalizeBillingCycle("diário"), "diario");
  assert.equal(normalizeBillingCycle("por_missao"), "por_missao");
  assert.equal(normalizeBillingCycle(""), "indefinido");
});

test("quinzenal: 1–15 e 16–último dia (mês 31 e 30)", () => {
  const q1 = periodForDate("quinzenal", "2026-09-10");
  assert.equal(q1.start, "2026-09-01");
  assert.equal(q1.end, "2026-09-15");
  assert.equal(q1.dueBy, "2026-09-17");
  assert.equal(q1.key, "Q1:2026-09");

  const q2 = periodForDate("quinzenal", "2026-09-16");
  assert.equal(q2.start, "2026-09-16");
  assert.equal(q2.end, "2026-09-30");
  assert.equal(q2.dueBy, "2026-10-02");

  const jul = periodForDate("quinzenal", "2026-07-31");
  assert.equal(jul.end, "2026-07-31");
  assert.equal(lastDayOfMonth("2026-02"), 28);
});

test("mensal: 01 até último dia; diário: o próprio dia", () => {
  const m = periodForDate("mensal", "2026-09-10");
  assert.equal(m.start, "2026-09-01");
  assert.equal(m.end, "2026-09-30");
  assert.equal(m.dueBy, "2026-10-05");

  const d = periodForDate("diario", "2026-09-10");
  assert.equal(d.start, "2026-09-10");
  assert.equal(d.end, "2026-09-10");
  assert.equal(d.dueBy, "2026-09-10");
  assert.equal(billingCycleLabel("diario"), "Diário");
});

test("isOsReadyForBoletim: APROVADA e cancelada calculada; A_VERIFICAR não", () => {
  assert.equal(isOsReadyForBoletim("concluida", "APROVADA"), true);
  assert.equal(isOsReadyForBoletim("cancelada", "CANCELADO"), true);
  assert.equal(isOsReadyForBoletim("concluida", "A_VERIFICAR"), false);
  assert.equal(isOsReadyForBoletim("recusada", "APROVADA"), false);
});

test("assessBoletimCoverage: bloqueia OS faltando no ciclo", () => {
  const r = assessBoletimCoverage({
    cycle: "quinzenal",
    selectedOsIds: [1],
    allOsInWindow: [
      { id: 1, osNumber: "TOR-1", status: "concluida", date: "2026-09-03", billingStatus: "APROVADA" },
      { id: 2, osNumber: "TOR-2", status: "concluida", date: "2026-09-12", billingStatus: "APROVADA" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "BOLETIM_COBERTURA_INCOMPLETA");
  assert.equal(r.missing.map((o) => o.id).join(), "2");
});

test("assessBoletimCoverage: bloqueia OS não APROVADA", () => {
  const r = assessBoletimCoverage({
    cycle: "mensal",
    selectedOsIds: [1],
    allOsInWindow: [
      { id: 1, osNumber: "TOR-1", status: "concluida", date: "2026-09-03", billingStatus: "A_VERIFICAR" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "BOLETIM_OS_NAO_APROVADA");
});

test("assessBoletimCoverage: recusada não entra nem falta", () => {
  const r = assessBoletimCoverage({
    cycle: "diario",
    selectedOsIds: [1],
    allOsInWindow: [
      { id: 1, osNumber: "TOR-1", status: "concluida", date: "2026-09-10", billingStatus: "APROVADA" },
      { id: 2, osNumber: "TOR-2", status: "recusada", date: "2026-09-10", billingStatus: "REJEITADA" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.recusadas.length, 1);
});

test("daysBetween: atraso de pagamento", () => {
  assert.equal(daysBetween("2026-09-01", "2026-09-11"), 10);
  assert.equal(daysBetween("2026-09-11", "2026-09-11"), 0);
});
