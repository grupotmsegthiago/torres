import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEspelhoPonto, nightMinutesBRT } from "./espelho-ponto.js";

const p = (iso: string, source: string | null = null) => ({ punch_at: iso, source });

test("costura meia-noite: 18:00→05:00 vira UM turno só no dia da entrada", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-10T18:00:00-03:00"),
      p("2026-05-10T23:59:00-03:00"), // marcador sintético de fechamento
      p("2026-05-11T00:00:00-03:00"), // marcador sintético de abertura
      p("2026-05-11T05:00:00-03:00"),
    ],
    "2026-05-10",
    "2026-05-11",
    528,
  );
  const d10 = r.days.find((d) => d.date === "2026-05-10")!;
  const d11 = r.days.find((d) => d.date === "2026-05-11")!;
  assert.equal(d10.duracao, "11:00", "total trabalhado do plantão");
  assert.equal(d10.noturno, "07:00", "noturno 22:00→05:00 = 7h");
  assert.equal(d10.jornada.ent1, "18:00");
  assert.equal(d10.jornada.sai1, "05:00");
  assert.deepEqual(d10.marcacoes, ["18:00", "05:00 (+1)"]);
  assert.equal(d10.extra, "02:12", "HE = 11h - 8h48 = 2h12");
  // o dia seguinte NÃO recebe metade do turno (sem zerar/dividir)
  assert.equal(d11.duracao, "");
  assert.equal(d11.noturno, "");
  assert.equal(r.hasBlocking, false);
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
  assert.equal(d.noturno, "");
  assert.equal(d.jornada.ent1, "08:00");
  assert.equal(d.jornada.sai1, "12:00");
  assert.equal(d.jornada.ent2, "13:00");
  assert.equal(d.jornada.sai2, "17:00");
  assert.equal(d.extra, "", "8h não passa de 8h48");
});

test("batida única = batida incompleta (entrada sem saída) bloqueia emissão", () => {
  const r = buildEspelhoPonto(
    [p("2026-05-13T04:53:00-03:00")],
    "2026-05-13",
    "2026-05-13",
    528,
  );
  const d = r.days[0];
  assert.equal(d.duracao, "");
  assert.equal(d.issues.length, 1);
  assert.match(d.issues[0], /Batida incompleta/);
  assert.equal(r.hasBlocking, true);
  assert.equal(r.validation[0].severity, "erro");
});

test("par muito curto (batida duplicada) gera AVISO não-bloqueante", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-14T08:00:00-03:00"),
      p("2026-05-14T08:02:00-03:00"), // 2 min depois: provável dupla batida
    ],
    "2026-05-14",
    "2026-05-14",
    528,
  );
  const d = r.days.find((x) => x.date === "2026-05-14")!;
  assert.match(d.issues.join(" "), /Par muito curto/);
  assert.equal(r.validation.some((v) => v.severity === "aviso" && /Par muito curto/.test(v.message)), true);
  assert.equal(r.hasBlocking, false, "par curto é aviso, não bloqueia");
});

test("entrada órfã além do teto de 18h NÃO emparelha (sem turno-monstro) e bloqueia", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-14T04:00:00-03:00"), // entrada órfã (sem saída próxima)
      p("2026-05-22T05:00:00-03:00"), // batida 8 dias depois: não pode virar 1 turno
    ],
    "2026-05-14",
    "2026-05-22",
    528,
  );
  const d14 = r.days.find((x) => x.date === "2026-05-14")!;
  assert.equal(d14.duracao, "", "órfã não vira turno de 192h (sem duração)");
  assert.match(d14.issues.join(" "), /Batida incompleta/);
  // garante que NENHUM dia virou turno-monstro (>24h)
  for (const d of r.days) {
    const [h] = (d.duracao || "0:0").split(":").map(Number);
    assert.ok(h < 24, `dia ${d.date} com duração suspeita ${d.duracao}`);
  }
  assert.equal(r.hasBlocking, true);
});

test("turno noturno 22:00→06:00: noturno = 7h, total 8h", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-15T22:00:00-03:00"),
      p("2026-05-16T06:00:00-03:00"),
    ],
    "2026-05-15",
    "2026-05-16",
    528,
  );
  const d = r.days.find((x) => x.date === "2026-05-15")!;
  assert.equal(d.duracao, "08:00");
  assert.equal(d.noturno, "07:00", "22:00→05:00 = 7h dentro da faixa noturna");
  assert.equal(d.jornada.sai1, "06:00");
  assert.deepEqual(d.marcacoes, ["22:00", "06:00 (+1)"]);
});

test("dedup por minuto remove batida duplicada do equipamento", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-17T08:00:10-03:00"),
      p("2026-05-17T08:00:45-03:00"), // mesmo minuto → duplicada
      p("2026-05-17T16:00:00-03:00"),
    ],
    "2026-05-17",
    "2026-05-17",
    528,
  );
  const d = r.days[0];
  assert.equal(d.duracao, "08:00");
  assert.equal(d.jornada.ent1, "08:00");
  assert.equal(d.jornada.sai1, "16:00");
});

test("nightMinutesBRT conta só a faixa 22h–05h", () => {
  const s = new Date("2026-05-10T20:00:00-03:00").getTime();
  const e = new Date("2026-05-11T06:00:00-03:00").getTime();
  // 20:00→06:00: noturno = 22:00→05:00 = 7h = 420min
  assert.equal(nightMinutesBRT(s, e), 420);
});

test("totais do período somam dias", () => {
  const r = buildEspelhoPonto(
    [
      p("2026-05-12T08:00:00-03:00"),
      p("2026-05-12T17:00:00-03:00"), // 9h → 12min HE
      p("2026-05-13T22:00:00-03:00"),
      p("2026-05-14T06:00:00-03:00"), // 8h, 7h noturno
    ],
    "2026-05-12",
    "2026-05-14",
    528,
  );
  assert.equal(r.totalHHMM, "17:00", "9h + 8h");
  assert.equal(r.totalNoturnoHHMM, "07:00");
});
