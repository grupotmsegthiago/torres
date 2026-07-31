import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret,
  decryptSecret,
  parseRhidDate,
  parseRhidAfdRecords,
  normalizeEvent,
  normalizeName,
  nameTokens,
  nameMatchScore,
  monthToFechamento,
  minuteKeyBRT,
  truncateToMinuteMs,
  workedMinutesBetween,
  computeDayWorkedMinutesFromPunches,
  isSyntheticMidnightMarker,
  isControlIdDevicePunch,
  isManualOpsPunch,
  selectCanonicalDayPunches,
  stripIllegalDeviceReentries,
  detectFolhaDayAnomalies,
  folhaObservation,
} from "./control-id-parsers.ts";

// ============================================================================
// encryptSecret / decryptSecret
// ============================================================================

test("crypto: round-trip simples", () => {
  const enc = encryptSecret("minha-senha-secreta");
  assert.notEqual(enc, "minha-senha-secreta");
  assert.equal(decryptSecret(enc), "minha-senha-secreta");
});

test("crypto: round-trip com caracteres especiais", () => {
  const plain = "P@ssw0rd!ção#$%🔐";
  assert.equal(decryptSecret(encryptSecret(plain)), plain);
});

test("crypto: round-trip de string vazia", () => {
  assert.equal(decryptSecret(encryptSecret("")), "");
});

test("crypto: cada encrypt gera ciphertext diferente (IV aleatório)", () => {
  const a = encryptSecret("igual");
  const b = encryptSecret("igual");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "igual");
  assert.equal(decryptSecret(b), "igual");
});

test("crypto: ciphertext corrompido lança erro", () => {
  assert.throws(() => decryptSecret("not-valid-base64-cipher!!!"), /Falha ao descriptografar/);
});

test("crypto: ciphertext alterado falha auth tag", () => {
  const enc = encryptSecret("senha");
  // Corrompe um byte do meio do ciphertext
  const buf = Buffer.from(enc, "base64");
  buf[buf.length - 1] = (buf[buf.length - 1] ^ 0xff) & 0xff;
  const tampered = buf.toString("base64");
  assert.throws(() => decryptSecret(tampered), /Falha ao descriptografar/);
});

// ============================================================================
// parseRhidDate
// ============================================================================

test("parseRhidDate: formato Microsoft /Date(...)/", () => {
  const d = parseRhidDate("/Date(1700000000000)/");
  assert.equal(d.getTime(), 1700000000000);
});

test("parseRhidDate: formato Microsoft /Date(...)/ com offset", () => {
  const d = parseRhidDate("/Date(1700000000000+0000)/");
  assert.equal(d.getTime(), 1700000000000);
});

test("parseRhidDate: ISO string padrão", () => {
  const d = parseRhidDate("2025-06-15T10:30:00Z");
  assert.equal(d.toISOString(), "2025-06-15T10:30:00.000Z");
});

test("parseRhidDate: null/undefined retorna epoch 0", () => {
  assert.equal(parseRhidDate(null).getTime(), 0);
  assert.equal(parseRhidDate(undefined).getTime(), 0);
  assert.equal(parseRhidDate("").getTime(), 0);
});

test("parseRhidDate: número (timestamp ms)", () => {
  const d = parseRhidDate(1700000000000);
  assert.equal(d.getTime(), 1700000000000);
});

// ============================================================================
// parseRhidAfdRecords
// ============================================================================

test("AFD: parsea array com campos lowercase", () => {
  const ts = Date.now() - 60_000;
  const since = new Date(ts - 3600_000);
  const records = [
    {
      id: "p1",
      dateTime: "/Date(" + ts + ")/",
      idPerson: "42",
      personName: "João Silva",
      faceScore: 99,
    },
  ];
  const events = parseRhidAfdRecords(records, since);
  assert.equal(events.length, 1);
  assert.equal(events[0].userId, "42");
  assert.equal(events[0].userName, "João Silva");
  assert.equal(events[0].source, "facial");
  assert.equal(events[0].direction, "unknown");
  assert.ok(events[0].id.startsWith("rhid_"));
});

test("AFD: aceita variações de case (DateTime, IdPerson, PersonName)", () => {
  const ts = Date.now() - 60_000;
  const since = new Date(ts - 3600_000);
  const events = parseRhidAfdRecords(
    [{ DateTime: "/Date(" + ts + ")/", IdPerson: "7", PersonName: "Maria" }],
    since,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].userId, "7");
  assert.equal(events[0].userName, "Maria");
});

test("AFD: aceita afdData aninhado em .data", () => {
  const ts = Date.now() - 60_000;
  const since = new Date(ts - 3600_000);
  const events = parseRhidAfdRecords(
    { data: [{ dateTime: "/Date(" + ts + ")/", idPerson: "1" }] },
    since,
  );
  assert.equal(events.length, 1);
});

test("AFD: aceita afdData aninhado em .records", () => {
  const ts = Date.now() - 60_000;
  const since = new Date(ts - 3600_000);
  const events = parseRhidAfdRecords(
    { records: [{ dateTime: "/Date(" + ts + ")/", idPerson: "1" }] },
    since,
  );
  assert.equal(events.length, 1);
});

test("AFD: ignora registros anteriores ao since", () => {
  const since = new Date("2025-06-01T00:00:00Z");
  const events = parseRhidAfdRecords(
    [
      { dateTime: "/Date(" + new Date("2025-05-15T10:00:00Z").getTime() + ")/", idPerson: "1" },
      { dateTime: "/Date(" + new Date("2025-06-15T10:00:00Z").getTime() + ")/", idPerson: "2" },
    ],
    since,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].userId, "2");
});

test("AFD: ignora registros com data inválida (epoch 0)", () => {
  const events = parseRhidAfdRecords([{ idPerson: "1" }], null);
  assert.equal(events.length, 0);
});

test("AFD: resposta vazia retorna []", () => {
  assert.deepEqual(parseRhidAfdRecords([], null), []);
  assert.deepEqual(parseRhidAfdRecords({}, null), []);
  assert.deepEqual(parseRhidAfdRecords(null, null), []);
});

test("AFD: sem faceScore, source é undefined", () => {
  const ts = Date.now() - 60_000;
  const events = parseRhidAfdRecords(
    [{ dateTime: "/Date(" + ts + ")/", idPerson: "1", faceScore: 0 }],
    new Date(ts - 3600_000),
  );
  assert.equal(events[0].source, undefined);
});

// ============================================================================
// normalizeEvent (Control iD generic)
// ============================================================================

test("normalizeEvent: timestamp unix em segundos", () => {
  const sec = 1700000000;
  const e = normalizeEvent({ id: "e1", time: sec, user_id: "u1" });
  assert.equal(e.time, new Date(sec * 1000).toISOString());
  assert.equal(e.userId, "u1");
});

test("normalizeEvent: timestamp unix em ms", () => {
  const ms = 1700000000000;
  const e = normalizeEvent({ id: "e1", time: ms, user_id: "u1" });
  assert.equal(e.time, new Date(ms).toISOString());
});

test("normalizeEvent: timestamp como string ISO", () => {
  const e = normalizeEvent({ id: "e1", time: "2025-06-01T10:00:00Z", user_id: "u1" });
  assert.equal(e.time, "2025-06-01T10:00:00.000Z");
});

test("normalizeEvent: timestamp como string epoch", () => {
  const e = normalizeEvent({ id: "e1", time: "1700000000", user_id: "u1" });
  assert.equal(e.time, new Date(1700000000 * 1000).toISOString());
});

test("normalizeEvent: direction in/entrada", () => {
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "in" }).direction, "in");
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "entrada" }).direction, "in");
});

test("normalizeEvent: direction out/saida/saída", () => {
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "out" }).direction, "out");
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "saida" }).direction, "out");
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "saída" }).direction, "out");
});

test("normalizeEvent: direction desconhecida → unknown", () => {
  assert.equal(normalizeEvent({ id: "1", time: 0 }).direction, "unknown");
  assert.equal(normalizeEvent({ id: "1", time: 0, direction: "foo" }).direction, "unknown");
});

test("normalizeEvent: source facial/rfid/digital/senha", () => {
  assert.equal(normalizeEvent({ id: "1", time: 0, source: "facial" }).source, "facial");
  assert.equal(normalizeEvent({ id: "1", time: 0, source: "cartao" }).source, "rfid");
  assert.equal(normalizeEvent({ id: "1", time: 0, source: "fingerprint" }).source, "digital");
  assert.equal(normalizeEvent({ id: "1", time: 0, source: "senha" }).source, "senha");
});

test("normalizeEvent: id sintético quando não vem id explícito", () => {
  const e = normalizeEvent({ user_id: "u9", time: 1700000000 });
  assert.equal(e.id, "u9-1700000000");
});

test("normalizeEvent: aceita campos alternativos (userId, person_id, matricula)", () => {
  assert.equal(normalizeEvent({ id: "1", time: 0, userId: "uA" }).userId, "uA");
  assert.equal(normalizeEvent({ id: "1", time: 0, person_id: "pB" }).userId, "pB");
  assert.equal(normalizeEvent({ id: "1", time: 0, matricula: "m123" }).userId, "m123");
});

// ============================================================================
// normalizeName / nameTokens / nameMatchScore
// ============================================================================

test("normalizeName: remove acentos e pontuação, lowercase", () => {
  assert.equal(normalizeName("João da Silva-Pereira"), "joao da silvapereira");
});

test("normalizeName: aceita null/undefined", () => {
  assert.equal(normalizeName(null as any), "");
  assert.equal(normalizeName(undefined as any), "");
});

test("normalizeName: colapsa espaços múltiplos", () => {
  assert.equal(normalizeName("  João    Silva  "), "joao silva");
});

test("nameTokens: descarta tokens com menos de 3 chars", () => {
  assert.deepEqual(nameTokens("João da Silva"), ["joao", "silva"]);
});

test("nameMatchScore: idênticos = 1", () => {
  assert.equal(nameMatchScore("João Silva", "joao silva"), 1);
});

test("nameMatchScore: nomes sem tokens em comum = 0", () => {
  assert.equal(nameMatchScore("Alice Costa", "Bob Pereira"), 0);
});

test("nameMatchScore: match parcial — 1 de 2 tokens", () => {
  // "joao silva" vs "joao pereira": 1 token comum (joao), max=2 tokens → 0.5
  assert.equal(nameMatchScore("João Silva", "João Pereira"), 0.5);
});

test("nameMatchScore: nome vazio → 0", () => {
  assert.equal(nameMatchScore("", "João Silva"), 0);
  assert.equal(nameMatchScore("João Silva", ""), 0);
});

test("nameMatchScore: nome com sobrenome em ordem invertida ainda casa", () => {
  // "joao silva" vs "silva joao" → 2 tokens em comum / 2 → 1
  assert.equal(nameMatchScore("João Silva", "Silva João"), 1);
});

test("nameMatchScore: ≥ 0.5 (threshold de auto-mapping) — sobrenome composto", () => {
  // "joao silva pereira" vs "joao silva" → 2 comuns / 3 max ≈ 0.667
  const s = nameMatchScore("João Silva Pereira", "João Silva");
  assert.ok(s >= 0.5, `esperado >= 0.5, obteve ${s}`);
});

// ============================================================================
// monthToFechamento
// ============================================================================

test("fechamento: mês X = dia 26 de X-1 até dia 26 de X (exclusivo)", () => {
  const { start, end } = monthToFechamento("2026-06");
  // dia 26 de maio (mês anterior)
  assert.equal(start.toISOString().slice(0, 10), "2026-05-26");
  // dia 26 de junho (mês informado)
  assert.equal(end.toISOString().slice(0, 10), "2026-06-26");
});

test("fechamento: virada de ano (janeiro)", () => {
  const { start, end } = monthToFechamento("2027-01");
  assert.equal(start.toISOString().slice(0, 10), "2026-12-26");
  assert.equal(end.toISOString().slice(0, 10), "2027-01-26");
});

test("fechamento: clamp inferior em 2026-03-01", () => {
  // Mês 2026-03 → start seria 2026-02-26, mas é clampado para 2026-03-01
  const { start, end } = monthToFechamento("2026-03");
  assert.equal(start.toISOString().slice(0, 10), "2026-03-01");
  assert.equal(end.toISOString().slice(0, 10), "2026-03-26");
});

test("fechamento: meses bem antigos também batem no clamp", () => {
  const { start } = monthToFechamento("2025-01");
  assert.equal(start.toISOString().slice(0, 10), "2026-03-01");
});

test("fechamento: end é exclusivo (00:00 BRT do dia 26 = fim do dia 25)", () => {
  const { end } = monthToFechamento("2026-06");
  // 00:00:00 BRT do dia 26 = 03:00:00 UTC do dia 26 (BRT é UTC-3).
  assert.equal(end.getUTCHours(), 3);
  assert.equal(end.getUTCMinutes(), 0);
  assert.equal(end.getUTCSeconds(), 0);
});

test("fechamento: limites batem com BRT, não com UTC (turno noturno 25→26)", () => {
  // Batida às 22:30 BRT do dia 25/05 = 01:30 UTC do dia 26/05.
  // Deve estar DENTRO do ciclo de maio (start <= ts < end).
  const { start, end } = monthToFechamento("2026-05");
  const punchInside = new Date("2026-05-26T01:30:00.000Z"); // 22:30 BRT 25/05
  assert.ok(punchInside.getTime() >= start.getTime(), "22:30 BRT 25/05 deve ser >= start de maio");
  assert.ok(punchInside.getTime() < end.getTime(), "22:30 BRT 25/05 deve ser < end de maio");

  // Batida às 22:30 BRT do dia 25/04 = 01:30 UTC do dia 26/04.
  // NÃO deve estar no ciclo de maio (é o último momento de abril).
  const punchBefore = new Date("2026-04-26T01:30:00.000Z"); // 22:30 BRT 25/04
  assert.ok(punchBefore.getTime() < start.getTime(), "22:30 BRT 25/04 deve ser < start de maio");
});

// ============================================================================
// minuteKeyBRT — chave de casamento por minuto (BRT) usada na conciliação RHID
// ============================================================================

test("minuteKeyBRT: bucketiza por minuto em BRT (UTC-3)", () => {
  // 2026-06-01T12:34:56Z → 09:34 BRT
  const k = minuteKeyBRT(new Date("2026-06-01T12:34:56.000Z"));
  assert.equal(k, "2026-06-01 09:34");
});

test("computeDayWorkedMinutes: opt-in strip remove 00:00/23:59 e desconta pausas", () => {
  // Dia diurno com marcadores + almoço + 2ª pausa.
  // Real: 08:00-12:00 + 13:00-15:00 + 15:30-18:00 = 8h30.
  const punches = [
    "2026-07-01T03:00:00.000Z", // 00:00 BRT marcador
    "2026-07-01T11:00:00.000Z", // 08:00 BRT
    "2026-07-01T15:00:00.000Z", // 12:00
    "2026-07-01T16:00:00.000Z", // 13:00
    "2026-07-01T18:00:00.000Z", // 15:00
    "2026-07-01T18:30:00.000Z", // 15:30
    "2026-07-01T21:00:00.000Z", // 18:00
    "2026-07-02T02:59:00.000Z", // 23:59 BRT marcador
  ];
  assert.equal(isSyntheticMidnightMarker(new Date(punches[0])), true);
  assert.equal(isSyntheticMidnightMarker(new Date(punches[7])), true);
  const r = computeDayWorkedMinutesFromPunches(punches, { stripSyntheticMarkers: true });
  assert.equal(r.ignoredMarkers, 2);
  assert.equal(r.pairs.length, 3);
  assert.equal(r.workedMin, 8 * 60 + 30); // 8h30
});

test("computeDayWorkedMinutes: default mantém 00:00/23:59 (turno noturno Control iD)", () => {
  // Espelho costura virada no mesmo dia BRT: 00:00–06:00 + 18:00–23:59.
  const fullNight = [
    "2026-06-27T03:00:00.000Z", // 00:00 BRT
    "2026-06-27T09:00:00.000Z", // 06:00
    "2026-06-27T21:00:00.000Z", // 18:00
    "2026-06-28T02:59:00.000Z", // 23:59 BRT
  ];
  const keep = computeDayWorkedMinutesFromPunches(fullNight);
  assert.equal(keep.ignoredMarkers, 0);
  assert.equal(keep.pairs.length, 2);
  assert.equal(keep.workedMin, 360 + 359); // 6h + 5h59

  // Meia jornada da noite (só saída até meia-noite): sem 23:59 a batida 18:00 fica órfã → 0.
  const eveningOnly = [
    "2026-06-27T21:00:00.000Z", // 18:00
    "2026-06-28T02:59:00.000Z", // 23:59 marcador
  ];
  assert.equal(computeDayWorkedMinutesFromPunches(eveningOnly).workedMin, 359);
  const strippedEve = computeDayWorkedMinutesFromPunches(eveningOnly, { stripSyntheticMarkers: true });
  assert.equal(strippedEve.ignoredMarkers, 1);
  assert.equal(strippedEve.workedMin, 0); // regressão prod: HE/noturno zerados
});

test("computeDayWorkedMinutes: dia normal 4 batidas = (out−in)−almoço", () => {
  const punches = [
    "2026-07-01T11:00:00.000Z", // 08:00
    "2026-07-01T15:00:00.000Z", // 12:00
    "2026-07-01T16:00:00.000Z", // 13:00
    "2026-07-01T21:00:00.000Z", // 18:00
  ];
  const r = computeDayWorkedMinutesFromPunches(punches);
  assert.equal(r.workedMin, 9 * 60); // 9h
  assert.equal(r.ignoredMarkers, 0);
});

test("truncateToMinuteMs / workedMinutesBetween: jornada ignora segundos", () => {
  // 08:00:47 → 18:00:22 BRT (UTC-3 → 11:00:47Z / 21:00:22Z)
  const inMs = new Date("2026-06-01T11:00:47.500Z").getTime();
  const outMs = new Date("2026-06-01T21:00:22.900Z").getTime();
  assert.equal(truncateToMinuteMs(inMs), new Date("2026-06-01T11:00:00.000Z").getTime());
  assert.equal(truncateToMinuteMs(outMs), new Date("2026-06-01T21:00:00.000Z").getTime());
  // Com segundos o delta era ~9h59m35s; sem segundos = 10h00 (igual à tela HH:MM).
  assert.equal(workedMinutesBetween(inMs, outMs), 600);
  // Saída com segundos altos não pode inflar a jornada além do HH:MM da tela.
  const outLate = new Date("2026-06-01T21:00:59.999Z").getTime();
  assert.equal(workedMinutesBetween(inMs, outLate), 600);
});

test("minuteKeyBRT: ignora segundos/ms (mesma chave para tempos no mesmo minuto)", () => {
  const a = minuteKeyBRT(new Date("2026-06-01T12:34:00.000Z"));
  const b = minuteKeyBRT(new Date("2026-06-01T12:34:59.999Z"));
  assert.equal(a, b);
});

test("minuteKeyBRT: vira o dia corretamente perto da meia-noite BRT", () => {
  // 2026-06-02T02:30:00Z → 23:30 BRT do dia 01
  const k = minuteKeyBRT(new Date("2026-06-02T02:30:00.000Z"));
  assert.equal(k, "2026-06-01 23:30");
});

test("minuteKeyBRT: batida do nosso sistema e do AFD no mesmo minuto casam (dedup)", () => {
  // Mesmo instante, formatos de origem diferentes: ambos devem gerar a mesma chave,
  // garantindo que a batida facial do AFD não duplique a manual já existente.
  const ours = minuteKeyBRT(new Date("2026-06-01T11:00:10.000Z"));
  const afd = minuteKeyBRT(new Date("2026-06-01T11:00:55.000Z"));
  assert.equal(ours, afd);
});

// ============================================================================
// Modelo canônico 4 batidas (Entrada Control iD + 3 operação)
// ============================================================================

function brtIso(day: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m, 0, 0)).toISOString();
}

test("isControlIdDevicePunch: facial e AFD rhid_* contam como parede", () => {
  assert.equal(isControlIdDevicePunch({ punch_at: "x", source: "facial" }), true);
  assert.equal(isControlIdDevicePunch({ punch_at: "x", source: null, external_id: "rhid_1_2" }), true);
  assert.equal(isControlIdDevicePunch({ punch_at: "x", source: "admin_manual" }), false);
  assert.equal(isManualOpsPunch({ punch_at: "x", source: "admin_manual" }), true);
});

test("selectCanonicalDayPunches: dia normal 4 batidas (facial + 3 manuais)", () => {
  const day = "2026-07-10";
  const punches = [
    { punch_at: brtIso(day, "08:00"), source: "facial", external_id: "rhid_1_1", id: 1 },
    { punch_at: brtIso(day, "12:00"), source: "admin_manual", id: 2 },
    { punch_at: brtIso(day, "13:00"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "18:00"), source: "admin_manual", id: 4 },
  ];
  const c = selectCanonicalDayPunches(punches);
  assert.equal(c.selected.length, 4);
  assert.equal(c.entry?.id, 1);
  assert.equal(c.lunchOut?.id, 2);
  assert.equal(c.lunchIn?.id, 3);
  assert.equal(c.exit?.id, 4);
  assert.equal(c.discarded.length, 0);
});

test("selectCanonicalDayPunches: marcador 00:00 + Control iD → entrada = parede", () => {
  const day = "2026-07-21";
  // 00:00 marcador manual + facial 02:24 → entrada prioriza parede
  const punches = [
    { punch_at: brtIso(day, "00:00"), source: "admin_manual", id: 10 },
    { punch_at: brtIso(day, "02:24"), source: null, external_id: "rhid_9_1", id: 11 },
    { punch_at: brtIso(day, "12:00"), source: "admin_manual", id: 12 },
    { punch_at: brtIso(day, "13:00"), source: "admin_manual", id: 13 },
    { punch_at: brtIso(day, "14:00"), source: "admin_manual", id: 14 },
  ];
  const c = selectCanonicalDayPunches(punches);
  assert.ok(c.flags.includes("entry_device_priority"));
  assert.equal(c.entry?.id, 11, "entrada = Control iD após marcador 00:00");
  assert.equal(c.lunchOut?.id, 12);
  assert.equal(c.lunchIn?.id, 13);
  assert.equal(c.exit?.id, 14);
  assert.ok(c.flags.includes("capped_to_4"));
});

test("stripIllegalDeviceReentries: 05:53→07:00 é bloco válido do cartão (não descarta)", () => {
  const day = "2026-07-20";
  const punches = [
    { punch_at: brtIso(day, "05:53"), source: null, external_id: "rhid_1_1", id: 1 },
    { punch_at: brtIso(day, "07:00"), source: null, external_id: "rhid_1_2", id: 2 },
    { punch_at: brtIso(day, "12:11"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "13:20"), source: "admin_manual", id: 4 },
    { punch_at: brtIso(day, "23:59"), source: "admin_manual", id: 5 },
  ];
  const { kept, discarded } = stripIllegalDeviceReentries(punches);
  assert.equal(discarded.length, 0);
  assert.equal(kept.length, 5);
});

test("computeDayWorkedMinutes: Reis 20/07 oficial = 02:16 (pares + órfã 23:59)", () => {
  const day = "2026-07-20";
  const punches = ["05:53", "07:00", "12:11", "13:20", "23:59"].map((t) => brtIso(day, t));
  const r = computeDayWorkedMinutesFromPunches(punches);
  assert.equal(r.workedMin, 2 * 60 + 16);
  assert.equal(r.pairs.length, 2);
});

test("stripIllegalDeviceReentries: saída facial no fim do dia NÃO é descartada", () => {
  const day = "2026-07-22";
  const punches = [
    { punch_at: brtIso(day, "05:47"), source: "facial", id: 1 },
    { punch_at: brtIso(day, "12:32"), source: "admin_manual", id: 2 },
    { punch_at: brtIso(day, "13:28"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "22:28"), source: "facial", id: 4 },
  ];
  const { kept, discarded } = stripIllegalDeviceReentries(punches);
  assert.equal(discarded.length, 0);
  assert.equal(kept.length, 4);
});

test("stripIllegalDeviceReentries: eco facial < 5 min é descartado", () => {
  const day = "2026-07-23";
  const punches = [
    { punch_at: brtIso(day, "05:53"), source: "facial", id: 1 },
    { punch_at: brtIso(day, "05:55"), source: null, external_id: "rhid_1_2", id: 2 },
    { punch_at: brtIso(day, "22:28"), source: "facial", id: 3 },
  ];
  const { kept, discarded } = stripIllegalDeviceReentries(punches);
  assert.deepEqual(discarded.map((p) => p.id), [2]);
  assert.deepEqual(kept.map((p) => p.id), [1, 3]);
});

test("selectCanonicalDayPunches: dia com 5 batidas escolhe almoço ~1h (não gap de 9h)", () => {
  const day = "2026-07-21";
  const punches = [
    { punch_at: brtIso(day, "00:00"), source: "admin_manual", id: 1 },
    { punch_at: brtIso(day, "02:24"), source: null, external_id: "rhid_1_1", id: 2 },
    { punch_at: brtIso(day, "12:00"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "13:00"), source: "admin_manual", id: 4 },
    { punch_at: brtIso(day, "14:00"), source: null, external_id: "rhid_1_2", id: 5 },
  ];
  // Sem swap de entrada (00:00 não é o único prefixo antes do device se... 00:00 É marker → entry=02:24)
  // Com entry=02:24, middle manuais 12:00/13:00, exit=14:00 → almoço 1h
  const c = selectCanonicalDayPunches(punches);
  assert.equal(c.lunchOut?.id, 3);
  assert.equal(c.lunchIn?.id, 4);
});

test("selectCanonicalDayPunches: virada meia-noite com 2 batidas (sem almoço)", () => {
  const day = "2026-07-18";
  const punches = [
    { punch_at: brtIso(day, "00:00"), source: "admin_manual", id: 1 },
    { punch_at: brtIso(day, "05:12"), source: "admin_manual", id: 2 },
  ];
  const c = selectCanonicalDayPunches(punches);
  assert.equal(c.selected.length, 2);
  assert.equal(c.lunchOut, null);
  assert.equal(c.exit?.id, 2);
});

test("detectFolhaDayAnomalies: eco facial < 5 min em vermelho", () => {
  const day = "2026-07-20";
  const punches = [
    { punch_at: brtIso(day, "05:53"), source: "facial", id: 1 },
    { punch_at: brtIso(day, "05:55"), source: null, external_id: "rhid_1_2", id: 2 },
    { punch_at: brtIso(day, "12:11"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "13:20"), source: "admin_manual", id: 4 },
  ];
  const canon = selectCanonicalDayPunches(punches);
  const anomalies = detectFolhaDayAnomalies(punches, canon);
  assert.ok(anomalies.some((a) => a.code === "illegal_reentry" && a.severity === "erro"));
  assert.ok(folhaObservation(anomalies)?.includes("05:55"));
});

test("detectFolhaDayAnomalies: almoço 07:00 após entrada 05:53 é erro", () => {
  const day = "2026-07-24";
  const punches = [
    { punch_at: brtIso(day, "05:53"), source: "facial", id: 1 },
    { punch_at: brtIso(day, "07:00"), source: "admin_manual", id: 2 },
    { punch_at: brtIso(day, "08:00"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "23:59"), source: "admin_manual", id: 4 },
  ];
  const canon = selectCanonicalDayPunches(punches);
  const anomalies = detectFolhaDayAnomalies(punches, canon);
  assert.ok(anomalies.some((a) => a.code === "lunch_too_early" && a.severity === "erro"));
});

test("detectFolhaDayAnomalies: dia normal 4 batidas sem alerta grave", () => {
  const day = "2026-07-25";
  const punches = [
    { punch_at: brtIso(day, "05:47"), source: "facial", id: 1 },
    { punch_at: brtIso(day, "12:32"), source: "admin_manual", id: 2 },
    { punch_at: brtIso(day, "13:28"), source: "admin_manual", id: 3 },
    { punch_at: brtIso(day, "22:28"), source: "facial", id: 4 },
  ];
  const canon = selectCanonicalDayPunches(punches);
  const anomalies = detectFolhaDayAnomalies(punches, canon);
  assert.equal(anomalies.filter((a) => a.severity === "erro").length, 0);
});
