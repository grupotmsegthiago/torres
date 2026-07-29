import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeJornadaPares,
  computeJornadaFirstLast,
  computeLegacyFirstLastReferenceMin,
  resolveFolhaEngine,
  parseFolhaEngineQuery,
  hhmmFromMinutes,
  nightMinutesBRT,
} from "./jornada-pares";
import {
  REIS_OFICIAL_DAYS,
  REIS_OFICIAL_TOTAL_NORMAIS_MIN,
  REIS_OFICIAL_HE_MIN,
  fixturePunchesToInputs,
  brtHHMMtoIso,
} from "./fixtures/reis-oficial-controlid";
import {
  REIS_TORRES_DAYS,
  REIS_TORRES_FIRST_LAST_TOTAL_MIN,
  REIS_TORRES_PARES_TOTAL_MIN,
  REIS_TORRES_PARES_HE_MIN,
  REIS_TORRES_IS_RECONSTRUCTION,
  fixtureTorresPunchesToInputs,
  REIS_TORRES_AUDIT,
} from "./fixtures/reis-torres-dump";

function iso(date: string, hhmm: string) {
  return brtHHMMtoIso(date, hhmm);
}

function sumEngine(
  days: typeof REIS_OFICIAL_DAYS,
  engine: "pares" | "first_last",
  toInputs: typeof fixturePunchesToInputs,
) {
  let total = 0;
  const perDay: Record<string, number> = {};
  for (const d of days) {
    const r =
      engine === "pares"
        ? computeJornadaPares(toInputs(d))
        : computeJornadaFirstLast(toInputs(d));
    perDay[d.date] = r.workedMinutes;
    total += r.workedMinutes;
  }
  return { total, perDay };
}

// ─── Casos unitários ───────────────────────────────────────────────

test("pares: duas batidas", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00") },
    { punchAt: iso("2026-07-01", "17:00") },
  ]);
  assert.equal(r.workedMinutes, 9 * 60);
  assert.equal(r.completePairs.length, 1);
  assert.equal(r.orphanPunches.length, 0);
});

test("pares: quatro batidas (desconta intervalo naturalmente)", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00") },
    { punchAt: iso("2026-07-01", "12:00") },
    { punchAt: iso("2026-07-01", "13:00") },
    { punchAt: iso("2026-07-01", "18:00") },
  ]);
  assert.equal(r.workedMinutes, 9 * 60);
  assert.equal(r.completePairs.length, 2);
});

test("pares: cinco batidas — órfã no final", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-20", "05:53") },
    { punchAt: iso("2026-07-20", "07:00") },
    { punchAt: iso("2026-07-20", "12:11") },
    { punchAt: iso("2026-07-20", "13:20") },
    { punchAt: iso("2026-07-20", "23:59") },
  ]);
  assert.equal(r.workedMinutes, 2 * 60 + 16);
  assert.equal(r.completePairs.length, 2);
  assert.equal(r.orphanPunches.length, 1);
  assert.equal(r.orphanPunches[0].reason, "unpaired_trailing");
  assert.ok(r.auditFlags.some((f) => f.code === "orphan_punch"));
});

test("pares: órfã no começo (1 batida só)", () => {
  const r = computeJornadaPares([{ punchAt: iso("2026-07-01", "08:00") }]);
  assert.equal(r.workedMinutes, 0);
  assert.equal(r.orphanPunches.length, 1);
});

test("pares: múltiplos intervalos", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00") },
    { punchAt: iso("2026-07-01", "10:00") },
    { punchAt: iso("2026-07-01", "10:30") },
    { punchAt: iso("2026-07-01", "12:00") },
    { punchAt: iso("2026-07-01", "13:00") },
    { punchAt: iso("2026-07-01", "17:00") },
  ]);
  assert.equal(r.workedMinutes, 2 * 60 + 90 + 4 * 60); // 2h + 1h30 + 4h = 7h30
  assert.equal(r.completePairs.length, 3);
});

test("pares: eventos duplicados no mesmo minuto BRT", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00"), id: 1 },
    { punchAt: "2026-07-01T11:00:45.000Z", id: 2 }, // 08:00:45 BRT
    { punchAt: iso("2026-07-01", "12:00"), id: 3 },
  ]);
  assert.equal(r.duplicateEvents.length, 1);
  assert.equal(r.workedMinutes, 4 * 60);
  assert.equal(r.eventsAfterDedup.length, 2);
});

test("pares: eventos separados por um minuto formam par", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00") },
    { punchAt: iso("2026-07-01", "08:01") },
  ]);
  assert.equal(r.workedMinutes, 1);
  assert.equal(r.completePairs.length, 1);
});

test("pares: 00:00 e 23:59 válidos (não strip)", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-06-28", "00:00") },
    { punchAt: iso("2026-06-28", "06:00") },
    { punchAt: iso("2026-06-28", "18:00") },
    { punchAt: iso("2026-06-28", "23:59") },
  ]);
  assert.equal(r.workedMinutes, 360 + 359);
  assert.equal(r.completePairs.length, 2);
  assert.equal(r.orphanPunches.length, 0);
});

test("pares: jornada com virada representada por markers no mesmo dia BRT", () => {
  // Folha agrupa por dia BRT; markers 00:00/23:59 costuram o plantão no dia.
  const r = computeJornadaPares([
    { punchAt: iso("2026-06-27", "00:00") },
    { punchAt: iso("2026-06-27", "06:00") },
    { punchAt: iso("2026-06-27", "18:00") },
    { punchAt: iso("2026-06-27", "23:59") },
  ]);
  assert.ok(r.workedMinutes > 0);
  assert.equal(r.completePairs.length, 2);
});

test("pares: marcação manual preservada (source não altera pareamento)", () => {
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "08:00"), source: "manual" },
    { punchAt: iso("2026-07-01", "12:00"), source: "facial" },
  ]);
  assert.equal(r.workedMinutes, 4 * 60);
});

test("pares: dia sem batidas / folga = zero", () => {
  const r = computeJornadaPares([]);
  assert.equal(r.workedMinutes, 0);
  assert.equal(r.completePairs.length, 0);
});

test("pares: teto diário 19:59 após soma", () => {
  const r = computeJornadaPares(
    [
      { punchAt: iso("2026-06-28", "00:00") },
      { punchAt: iso("2026-06-28", "12:05") },
      { punchAt: iso("2026-06-28", "13:08") },
      { punchAt: iso("2026-06-28", "23:59") },
    ],
    { dailyCapMin: 1199 },
  );
  assert.equal(r.rawWorkedMinutes, 12 * 60 + 5 + (23 * 60 + 59 - 13 * 60 - 8));
  assert.equal(r.workedMinutes, 1199);
  assert.ok(r.cappedMinutes > 0);
  assert.ok(r.auditFlags.some((f) => f.code === "daily_cap_applied"));
});

test("noturno: calculado por par (não first→last com almoço noturno)", () => {
  // Par 22:00→02:00 = 4h noturnas; almoço 00:00→01:00 NÃO existe como par separado aqui.
  const r = computeJornadaPares([
    { punchAt: iso("2026-07-01", "22:00") },
    { punchAt: iso("2026-07-02", "02:00") }, // outro dia — ainda um intervalo contínuo se passado junto
  ]);
  // Se o chamador misturar dias, o motor ainda soma o intervalo; Folha agrupa por dia.
  assert.equal(r.nightMinutes, nightMinutesBRT(
    new Date(iso("2026-07-01", "22:00")).getTime(),
    new Date(iso("2026-07-02", "02:00")).getTime(),
  ));
});

test("resolveFolhaEngine: produção SEMPRE first_last (ignora override + FOLHA_ENGINE)", () => {
  const prevNode = process.env.NODE_ENV;
  const prevEng = process.env.FOLHA_ENGINE;
  try {
    process.env.NODE_ENV = "production";
    process.env.FOLHA_ENGINE = "pares";
    assert.equal(resolveFolhaEngine(), "first_last");
    assert.equal(resolveFolhaEngine("pares"), "first_last");
    assert.equal(resolveFolhaEngine("first_last"), "first_last");
    assert.equal(parseFolhaEngineQuery("pares"), undefined);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevEng === undefined) delete process.env.FOLHA_ENGINE;
    else process.env.FOLHA_ENGINE = prevEng;
  }
});

test("resolveFolhaEngine: dev permite FOLHA_ENGINE=pares e override", () => {
  const prevNode = process.env.NODE_ENV;
  const prevEng = process.env.FOLHA_ENGINE;
  try {
    process.env.NODE_ENV = "development";
    process.env.FOLHA_ENGINE = "pares";
    assert.equal(resolveFolhaEngine(), "pares");
    assert.equal(resolveFolhaEngine("first_last"), "first_last");
    delete process.env.FOLHA_ENGINE;
    assert.equal(resolveFolhaEngine("pares"), "pares");
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevEng === undefined) delete process.env.FOLHA_ENGINE;
    else process.env.FOLHA_ENGINE = prevEng;
  }
});

test("first_last: dois eventos distintos no mesmo minuto — preserva legado (sem dedup)", () => {
  // 08:00:10, 08:00:50, 12:00, 13:00, 18:00 BRT
  // Legado: length=5 → lunch = idx1→idx2 = 08:00→12:00 = 4h
  //   worked = (18:00−08:00) − 4h = 6h
  // Pares com dedup/minuto: 08:00,12:00,13:00,18:00 → first_last seria 9h (ERRADO para A)
  const punches = [
    { punchAt: "2026-07-01T11:00:10.000Z", id: 1 }, // 08:00:10 BRT
    { punchAt: "2026-07-01T11:00:50.000Z", id: 2 }, // 08:00:50 BRT (mesmo minuto)
    { punchAt: "2026-07-01T15:00:00.000Z", id: 3 }, // 12:00
    { punchAt: "2026-07-01T16:00:00.000Z", id: 4 }, // 13:00
    { punchAt: "2026-07-01T21:00:00.000Z", id: 5 }, // 18:00
  ];
  const ref = computeLegacyFirstLastReferenceMin(punches.map((p) => p.punchAt));
  const fl = computeJornadaFirstLast(punches);
  assert.equal(ref.workedMin, 6 * 60);
  assert.equal(fl.workedMinutes, ref.workedMin);
  assert.equal(fl.nightMinutes, ref.noturnoMin);
  assert.equal(fl.eventsAfterDedup.length, 5); // sem colapsar minuto
  assert.equal(fl.duplicateEvents.length, 0);

  const pares = computeJornadaPares(punches);
  assert.equal(pares.duplicateEvents.length, 1);
  assert.equal(pares.eventsAfterDedup.length, 4);
  // Pares: 08:00→12:00 + 13:00→18:00 = 4h + 5h = 9h (diferente do legado — esperado)
  assert.equal(pares.workedMinutes, 9 * 60);
  assert.notEqual(pares.workedMinutes, fl.workedMinutes);
});

test("first_last ≡ referência legado em dias oficiais do Reis", () => {
  for (const d of REIS_OFICIAL_DAYS) {
    const inputs = fixturePunchesToInputs(d);
    const fl = computeJornadaFirstLast(inputs);
    const ref = computeLegacyFirstLastReferenceMin(inputs.map((p) => p.punchAt));
    assert.equal(
      fl.workedMinutes,
      ref.workedMin,
      `${d.date}: first_last=${fl.workedMinutes} ref=${ref.workedMin}`,
    );
    assert.equal(fl.nightMinutes, ref.noturnoMin, `${d.date} noturno`);
  }
});

// ─── Regressão 20/07 ───────────────────────────────────────────────

test("regressão 20/07: pares=02:16 + órfã 23:59; first_last=12:55", () => {
  const punches = [
    { punchAt: iso("2026-07-20", "05:53") },
    { punchAt: iso("2026-07-20", "07:00") },
    { punchAt: iso("2026-07-20", "12:11") },
    { punchAt: iso("2026-07-20", "13:20") },
    { punchAt: iso("2026-07-20", "23:59") },
  ];
  const pares = computeJornadaPares(punches);
  assert.equal(pares.workedMinutes, 2 * 60 + 16);
  assert.equal(pares.orphanPunches.length, 1);
  const orphanHHMM = new Date(pares.orphanPunches[0].atMs).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(orphanHHMM, "23:59");

  const fl = computeJornadaFirstLast(punches);
  assert.equal(fl.workedMinutes, 12 * 60 + 55);
  assert.equal(fl.workedMinutes - pares.workedMinutes, 10 * 60 + 39);
});

// ─── Fixture A — oficial Control iD ────────────────────────────────

test("fixture oficial: cada dia bate TOTAL NORMAIS do cartão", () => {
  for (const d of REIS_OFICIAL_DAYS) {
    const r = computeJornadaPares(fixturePunchesToInputs(d));
    assert.equal(
      r.workedMinutes,
      d.officialNormaisMin,
      `${d.date}: got ${hhmmFromMinutes(r.workedMinutes)} expected ${hhmmFromMinutes(d.officialNormaisMin!)}`,
    );
  }
});

test("fixture oficial: competência 322:22 / HE 102:22; 20/07 órfã", () => {
  const { total, perDay } = sumEngine(REIS_OFICIAL_DAYS, "pares", fixturePunchesToInputs);
  assert.equal(total, REIS_OFICIAL_TOTAL_NORMAIS_MIN);
  assert.equal(total - 220 * 60, REIS_OFICIAL_HE_MIN);
  assert.equal(perDay["2026-07-20"], 2 * 60 + 16);
  const d20 = computeJornadaPares(
    fixturePunchesToInputs(REIS_OFICIAL_DAYS.find((d) => d.date === "2026-07-20")!),
  );
  assert.equal(d20.orphanPunches.length, 1);
});

// ─── Fixture B — Torres (reconstrução) ─────────────────────────────

test("fixture Torres: 30/06 = 10:44; auditoria 00:27 vs 12:18 (sem inventar)", () => {
  const d = REIS_TORRES_DAYS.find((x) => x.date === "2026-06-30")!;
  assert.deepEqual(d.punchesHHMM, ["12:18", "15:32", "16:29", "23:59"]);
  assert.ok(!d.punchesHHMM.includes("00:27"));
  const r = computeJornadaPares(fixtureTorresPunchesToInputs(d));
  assert.equal(r.workedMinutes, 10 * 60 + 44);
  assert.equal(REIS_TORRES_AUDIT["2026-06-30"].officialEntry, "00:27");
  assert.equal(REIS_TORRES_AUDIT["2026-06-30"].torresFirstPunch, "12:18");
});

test("fixture Torres 04/07: dump reconstruído 03:39; oficial 03:40 só na fixture A", () => {
  const torres = REIS_TORRES_DAYS.find((x) => x.date === "2026-07-04")!;
  const oficial = REIS_OFICIAL_DAYS.find((x) => x.date === "2026-07-04")!;
  const rt = computeJornadaPares(fixtureTorresPunchesToInputs(torres));
  const ro = computeJornadaPares(fixturePunchesToInputs(oficial));
  assert.equal(rt.workedMinutes, 3 * 60 + 39);
  assert.equal(ro.workedMinutes, 3 * 60 + 40);
  assert.equal(rt.completePairs.length, 1);
  assert.deepEqual(
    rt.eventsAfterDedup.map((e) =>
      new Date(e.atMs).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    ),
    ["00:00", "03:39"],
  );
});

test("fixture Torres (RECONSTRUÇÃO): first_last 323:45; pares 313:06 — não é dump comprovado", () => {
  assert.equal(REIS_TORRES_IS_RECONSTRUCTION, true);
  const fl = sumEngine(REIS_TORRES_DAYS, "first_last", fixtureTorresPunchesToInputs);
  const pares = sumEngine(REIS_TORRES_DAYS, "pares", fixtureTorresPunchesToInputs);

  assert.equal(fl.total, REIS_TORRES_FIRST_LAST_TOTAL_MIN, `first_last=${hhmmFromMinutes(fl.total)}`);
  assert.equal(pares.total, REIS_TORRES_PARES_TOTAL_MIN, `pares reconstrução=${hhmmFromMinutes(pares.total)}`);
  assert.equal(pares.total, 313 * 60 + 6);
  assert.notEqual(pares.total, 313 * 60 + 5);
  assert.equal(pares.total - 220 * 60, REIS_TORRES_PARES_HE_MIN);

  // Identidades da perícia (reconstrução)
  assert.equal(fl.total - pares.total, 10 * 60 + 39);
  assert.equal(REIS_OFICIAL_TOTAL_NORMAIS_MIN - (9 * 60 + 15) - 1, REIS_TORRES_PARES_TOTAL_MIN);
  assert.equal(fl.perDay["2026-07-20"] - pares.perDay["2026-07-20"], 10 * 60 + 39);
  assert.equal(pares.perDay["2026-06-30"], 10 * 60 + 44);
  assert.equal(pares.perDay["2026-07-04"], 3 * 60 + 39);
});

test("simulação A×B com fixture Torres (read-only, sem gravar)", () => {
  const rows = REIS_TORRES_DAYS.map((d) => {
    const a = computeJornadaFirstLast(fixtureTorresPunchesToInputs(d));
    const b = computeJornadaPares(fixtureTorresPunchesToInputs(d));
    return {
      date: d.date,
      anterior: a.workedMinutes,
      novo: b.workedMinutes,
      delta: b.workedMinutes - a.workedMinutes,
      orphans: b.orphanPunches.length,
      capped: b.cappedMinutes,
    };
  }).filter((r) => r.delta !== 0 || r.orphans > 0);
  assert.ok(rows.some((r) => r.date === "2026-07-20" && r.delta === -(10 * 60 + 39)));
});
