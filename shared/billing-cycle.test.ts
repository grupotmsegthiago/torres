import { test } from "node:test";
import assert from "node:assert/strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearsInFaturamentoReport,
  assessBoletimCoverage,
  billingCycleLabel,
  daysBetween,
  isCanceladaOs,
  isOsInvoicedStatus,
  isOsReadyForBoletim,
  isRecusadaOs,
  lastDayOfMonth,
  missionDateYmd,
  normalizeBillingCycle,
  periodClosed,
  periodForDate,
  ymdInInclusiveRange,
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

test("periodClosed: quinzena vigente ainda não venceu", () => {
  const q1 = periodForDate("quinzenal", "2026-09-09");
  assert.equal(periodClosed(q1, "2026-09-10"), false);
  assert.equal(periodClosed(q1, "2026-09-15"), false);
  assert.equal(periodClosed(q1, "2026-09-16"), true);
});

test("daysBetween: atraso de pagamento", () => {
  assert.equal(daysBetween("2026-09-01", "2026-09-11"), 10);
  assert.equal(daysBetween("2026-09-11", "2026-09-11"), 0);
});

test("isCanceladaOs: recusada com billing CANCELADO não conta como cancelada", () => {
  assert.equal(isCanceladaOs("cancelada", "CANCELADO"), true);
  assert.equal(isCanceladaOs("concluida", "CANCELADO"), true);
  assert.equal(isCanceladaOs("recusada", "CANCELADO"), false);
  assert.equal(isRecusadaOs("recusada", "CANCELADO"), true);
});

test("appearsInFaturamentoReport: oculta recusada; faturada permanece", () => {
  assert.equal(appearsInFaturamentoReport("recusada", "CANCELADO"), false);
  assert.equal(appearsInFaturamentoReport("recusada", "REJEITADA"), false);
  assert.equal(appearsInFaturamentoReport("recusada", "FATURADO"), true);
  assert.equal(appearsInFaturamentoReport("cancelada", "CANCELADO"), true);
  assert.equal(appearsInFaturamentoReport("concluida", "APROVADA"), true);
  assert.equal(isOsInvoicedStatus("FATURADA"), true);
});

test("missionDateYmd: quinzena segue o agendamento, não a gravação do billing", () => {
  const d = missionDateYmd(
    { scheduled_date: "2026-09-14T15:00:00-03:00" },
    { data_missao: "2026-09-17T10:30:05-03:00" },
  );
  assert.equal(d, "2026-09-14");
  assert.equal(periodForDate("quinzenal", d).key, "Q1:2026-09");
  assert.equal(periodForDate("quinzenal", "2026-09-17").key, "Q2:2026-09");
  assert.equal(ymdInInclusiveRange(d, "2026-09-01", "2026-09-15"), true);
  assert.equal(ymdInInclusiveRange(d, "2026-09-16", "2026-09-30"), false);
  assert.equal(ymdInInclusiveRange("2026-09-16", "2026-09-16", "2026-09-30"), true);
  assert.equal(ymdInInclusiveRange("2026-09-30", "2026-09-16", "2026-09-30"), true);
});

test("assessBoletimCoverage: 14 e 15 na 1ª quinzena; misturar 17 bloqueia", () => {
  const q1 = assessBoletimCoverage({
    cycle: "quinzenal",
    selectedOsIds: [833, 845],
    allOsInWindow: [
      { id: 833, osNumber: "TOR-0833", status: "cancelada", date: "2026-09-14", billingStatus: "CANCELADO" },
      { id: 845, osNumber: "TOR-0845", status: "cancelada", date: "2026-09-15", billingStatus: "CANCELADO" },
    ],
  });
  assert.equal(q1.ok, true);
  assert.equal(q1.period?.key, "Q1:2026-09");

  const mixed = assessBoletimCoverage({
    cycle: "quinzenal",
    selectedOsIds: [833, 900],
    allOsInWindow: [
      { id: 833, osNumber: "TOR-0833", status: "cancelada", date: "2026-09-14", billingStatus: "CANCELADO" },
      { id: 900, osNumber: "TOR-0900", status: "concluida", date: "2026-09-17", billingStatus: "APROVADA" },
    ],
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.code, "BOLETIM_CICLOS_MISTURADOS");
});
