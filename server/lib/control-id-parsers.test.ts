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
