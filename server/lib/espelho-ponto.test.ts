import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEspelhoPonto, nightMinutesBRT } from "./espelho-ponto.js";

const p = (iso: string, source: string | null = null) => ({ punch_at: iso, source });

test("virada de madrugada: dias separados (motor canônico sem stitch)", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-10T18:00:00-03:00"),
      p("2026-05-10T23:59:00-03:00"),
      p("2026-05-11T00:00:00-03:00"),
      p("2026-05-11T05:00:00-03:00"),
    ],
    "2026-05-10",
    "2026-05-11",
    528,
  );
  const d10 = r.days.find((d) => d.date === "2026-05-10")!;
  const d11 = r.days.find((d) => d.date === "2026-05-11")!;
  assert.equal(d10.duracao, "05:59");
  assert.equal(d11.duracao, "05:00");
  assert.equal(d10.jornada.ent1, "18:00");
  assert.equal(d10.jornada.sai1, "23:59");
  assert.equal(d11.jornada.ent1, "00:00");
  assert.equal(d11.jornada.sai1, "05:00");
});

test("dia normal com intervalo: entrada/saída intervalo/retorno/saída final", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-12T08:00:00-03:00"),
      p("2026-05-12T12:00:00-03:00"),
      p("2026-05-12T13:00:00-03:00"),
      p("2026-05-12T17:00:00-03:00"),
    ],
    "2026-05-12",
    "2026-05-12",
    528,
  );
  const d = r.days[0];
  assert.equal(d.duracao, "08:00");
  assert.equal(d.jornada.ent1, "08:00");
  assert.equal(d.jornada.sai1, "12:00");
  assert.equal(d.jornada.ent2, "13:00");
  assert.equal(d.jornada.sai2, "17:00");
});

test("órfã 23:59 sinalizada — 20/07 estilo Control iD", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-07-20T05:53:00-03:00"),
      p("2026-07-20T07:00:00-03:00"),
      p("2026-07-20T12:11:00-03:00"),
      p("2026-07-20T13:20:00-03:00"),
      p("2026-07-20T23:59:00-03:00"),
    ],
    "2026-07-20",
    "2026-07-20",
    528,
  );
  const d = r.days[0];
  assert.equal(d.duracao, "02:16");
  assert.ok(d.issues.some((i) => i.includes("23:59")));
  assert.equal(r.hasBlocking, true);
});

test("cluster ≤2min 04/07 → 3:40", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-07-04T00:00:00-03:00"),
      p("2026-07-04T00:01:00-03:00"),
      p("2026-07-04T00:02:00-03:00"),
      p("2026-07-04T03:39:00-03:00"),
      p("2026-07-04T03:40:00-03:00"),
    ],
    "2026-07-04",
    "2026-07-04",
    528,
  );
  assert.equal(r.days[0].duracao, "03:40");
});

test("nightMinutesBRT helper", () => {
  const start = new Date("2026-07-18T00:00:00-03:00").getTime();
  const end = new Date("2026-07-18T05:00:00-03:00").getTime();
  assert.equal(nightMinutesBRT(start, end), 5 * 60);
});

test("cap diário 19:59 no espelho", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-06-30T00:27:00-03:00"),
      p("2026-06-30T15:32:00-03:00"),
      p("2026-06-30T16:29:00-03:00"),
      p("2026-06-30T23:59:00-03:00"),
    ],
    "2026-06-30",
    "2026-06-30",
    528,
  );
  assert.equal(r.days[0].duracao, "19:59");
});
