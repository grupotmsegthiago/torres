import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDayJornada,
  computePeriodJornada,
  minutesToHHMM,
  truncateToMinuteBRT,
  fmtHHMMBRT,
} from "./jornada-calc.js";

const p = (iso: string, id?: number) => ({ punch_at: iso, id: id ?? null });

test("1) duas batidas", () => {
  const d = computeDayJornada([
    p("2026-07-14T05:00:00-03:00", 1),
    p("2026-07-14T14:16:00-03:00", 2),
  ]);
  assert.equal(d.workedMin, 9 * 60 + 16);
  assert.equal(d.pairs.length, 1);
  assert.equal(d.orphans.length, 0);
});

test("2) quatro batidas com almoço", () => {
  const d = computeDayJornada([
    p("2026-06-26T01:00:00-03:00"),
    p("2026-06-26T11:56:00-03:00"),
    p("2026-06-26T13:00:00-03:00"),
    p("2026-06-26T23:31:00-03:00"),
  ]);
  // 10:56 + 10:31 = 21:27 → cap 19:59
  assert.equal(d.workedMinRaw, 21 * 60 + 27);
  assert.equal(d.workedMin, 1199);
  assert.equal(d.capped, true);
});

test("3) cinco ou mais batidas — órfã no fim", () => {
  const d = computeDayJornada([
    p("2026-07-20T05:53:00-03:00"),
    p("2026-07-20T07:00:00-03:00"),
    p("2026-07-20T12:11:00-03:00"),
    p("2026-07-20T13:20:00-03:00"),
    p("2026-07-20T23:59:00-03:00"),
  ]);
  assert.equal(d.workedMin, 2 * 60 + 16);
  assert.equal(d.orphans.length, 1);
  assert.equal(d.orphans[0].hhmm, "23:59");
});

test("4) batida órfã isolada", () => {
  const d = computeDayJornada([p("2026-07-12T23:13:00-03:00")]);
  assert.equal(d.workedMin, 0);
  assert.equal(d.orphans.length, 1);
});

test("5) 00:00 e 23:59 não viram first_last integral", () => {
  const d = computeDayJornada([
    p("2026-06-28T00:00:00-03:00"),
    p("2026-06-28T12:05:00-03:00"),
    p("2026-06-28T13:08:00-03:00"),
    p("2026-06-28T23:59:00-03:00"),
  ]);
  // pares: 12:05 + 10:51 = 22:56 → cap 19:59 — NÃO 23:59 first_last
  assert.equal(d.workedMin, 1199);
  assert.equal(d.pairs.length, 2);
});

test("6) virada de madrugada — dias separados (sem stitch)", () => {
  const r = computePeriodJornada([
    p("2026-05-10T18:00:00-03:00"),
    p("2026-05-10T23:59:00-03:00"),
    p("2026-05-11T00:00:00-03:00"),
    p("2026-05-11T05:00:00-03:00"),
  ]);
  const d10 = r.days.find((d) => d.day === "2026-05-10")!;
  const d11 = r.days.find((d) => d.day === "2026-05-11")!;
  assert.equal(d10.workedMin, 5 * 60 + 59);
  assert.equal(d11.workedMin, 5 * 60);
  assert.equal(r.totalWorkedMin, 5 * 60 + 59 + 5 * 60);
});

test("7) jornada noturna no mesmo dia", () => {
  const d = computeDayJornada([
    p("2026-07-18T00:00:00-03:00"),
    p("2026-07-18T05:12:00-03:00"),
  ]);
  assert.equal(d.workedMin, 5 * 60 + 12);
});

test("8) batidas no mesmo minuto — dedup", () => {
  const d = computeDayJornada([
    p("2026-07-21T14:00:00-03:00", 750134),
    p("2026-07-21T14:00:30-03:00", 780452), // trunc → 14:00
    p("2026-07-21T08:00:00-03:00", 1),
    p("2026-07-21T00:00:00-03:00", 2),
    p("2026-07-21T02:24:00-03:00", 3),
  ]);
  assert.equal(d.normalized.filter((x) => x.hhmm === "14:00").length, 1);
  assert.equal(d.workedMin, 8 * 60 + 24);
});

test("9) segundos truncados, nunca arredondados", () => {
  const t = truncateToMinuteBRT("2026-07-21T08:00:59-03:00");
  assert.equal(fmtHHMMBRT(t), "08:00");
  const d = computeDayJornada([
    p("2026-07-21T08:00:59-03:00"),
    p("2026-07-21T14:00:59-03:00"),
  ]);
  assert.equal(d.workedMin, 6 * 60);
});

test("10) período 26→25 — HE sobre 220:00", () => {
  // 1 dia com 10h → HE 0 se base 220; usa base pequena pra teste
  const r = computePeriodJornada(
    [
      p("2026-06-26T08:00:00-03:00"),
      p("2026-06-26T18:00:00-03:00"),
    ],
    { baseMin: 8 * 60 },
  );
  assert.equal(r.totalWorkedMin, 10 * 60);
  assert.equal(r.heMin, 2 * 60);
  assert.equal(r.heHHMM, "2:00");
});

test("11) fuso America/Sao_Paulo — UTC armazenado vira dia BRT", () => {
  // 2026-06-26 01:00 BRT = 2026-06-26 04:00 UTC
  const d = computeDayJornada([p("2026-06-26T04:00:00.000Z"), p("2026-06-26T14:56:00.000Z")]);
  assert.equal(d.day, "2026-06-26");
  assert.equal(d.pairs[0].entrada.hhmm, "01:00");
});

test("12) limite diário 19:59", () => {
  const d = computeDayJornada([
    p("2026-06-30T00:27:00-03:00"),
    p("2026-06-30T15:32:00-03:00"),
    p("2026-06-30T16:29:00-03:00"),
    p("2026-06-30T23:59:00-03:00"),
  ]);
  assert.ok(d.workedMinRaw > 1199);
  assert.equal(d.workedMin, 1199);
});

test("13) manuais misturados com AFD — cluster 04/07", () => {
  const d = computeDayJornada([
    { punch_at: "2026-07-04T00:00:00-03:00", id: 1, source: "admin_manual", is_manual: true },
    { punch_at: "2026-07-04T00:01:00-03:00", id: 2, source: null },
    { punch_at: "2026-07-04T00:02:00-03:00", id: 3, source: null },
    { punch_at: "2026-07-04T03:39:00-03:00", id: 4, source: null },
    { punch_at: "2026-07-04T03:40:00-03:00", id: 5, source: null },
  ]);
  assert.equal(d.workedMin, 3 * 60 + 40);
  assert.equal(d.clusters.length, 2);
  assert.equal(d.clusters[0].representative.hhmm, "00:00");
  assert.equal(d.clusters[1].representative.hhmm, "03:40");
  assert.equal(d.clusters[0].ambiguous, true);
  assert.equal(d.clusters[1].ambiguous, false);
  assert.equal(d.clusters[1].clustered, true);
});

test("14) caso real Reis — 21/07 oficial + 04/07 cluster + totais período", () => {
  // Subconjunto mínimo que prova regra dos dias críticos + um dia cap
  const punches = [
    // 04/07
    p("2026-07-04T00:00:00-03:00", 469466),
    p("2026-07-04T00:01:00-03:00", 886543),
    p("2026-07-04T00:02:00-03:00", 886544),
    p("2026-07-04T03:39:00-03:00", 600625),
    p("2026-07-04T03:40:00-03:00", 886545),
    // 21/07 restaurado
    p("2026-07-21T00:00:00-03:00", 735072),
    p("2026-07-21T02:24:00-03:00", 886872),
    p("2026-07-21T08:00:00-03:00", 735073),
    p("2026-07-21T14:00:00-03:00", 780452),
    p("2026-07-21T14:00:00-03:00", 750134), // dedup
    // 20/07 órfã
    p("2026-07-20T05:53:00-03:00"),
    p("2026-07-20T07:00:00-03:00"),
    p("2026-07-20T12:11:00-03:00"),
    p("2026-07-20T13:20:00-03:00"),
    p("2026-07-20T23:59:00-03:00"),
  ];
  const r = computePeriodJornada(punches, { baseMin: 220 * 60 });
  assert.equal(r.days.find((d) => d.day === "2026-07-04")!.workedMin, 220);
  assert.equal(r.days.find((d) => d.day === "2026-07-21")!.workedMin, 504);
  assert.equal(r.days.find((d) => d.day === "2026-07-20")!.workedMin, 136);
  assert.equal(minutesToHHMM(220 + 504 + 136), "14:20");
});

test("15) não regressão — dia simples 8h sem cluster indevido", () => {
  const d = computeDayJornada([
    p("2026-07-22T08:00:00-03:00"),
    p("2026-07-22T12:00:00-03:00"),
    p("2026-07-22T13:03:00-03:00"), // gap 63min — NÃO cluster com 12:00
    p("2026-07-22T17:00:00-03:00"),
  ]);
  assert.equal(d.clusters.length, 4);
  assert.equal(d.workedMin, 8 * 60 - 3); // 4h + 3h57
  assert.equal(d.safeClusters?.length ?? d.clusters.filter((c) => c.clustered && !c.ambiguous).length, 0);
});
