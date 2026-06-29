import { test } from "node:test";
import assert from "node:assert/strict";
import { brtDateKey } from "./brt-date";

test("brtDateKey: null/undefined/empty → null", () => {
  assert.equal(brtDateKey(null), null);
  assert.equal(brtDateKey(undefined), null);
  assert.equal(brtDateKey(""), null);
});

test("brtDateKey: BRT-nativo SEM offset na madrugada NÃO escorrega de dia (blindagem)", () => {
  // Este é o caso que o offset -03:00 dos dados atuais mascara. Com TZ=UTC, new Date()
  // jogaria para o dia anterior; o helper mantém o dia BRT correto.
  assert.equal(brtDateKey("2026-06-30T01:00:00"), "2026-06-30");
  assert.equal(brtDateKey("2026-06-30T00:00:00"), "2026-06-30");
  assert.equal(brtDateKey("2026-06-30T02:59:00"), "2026-06-30");
});

test("brtDateKey: offset -03:00 (formato real de produção) → prefixo é a data BRT", () => {
  assert.equal(brtDateKey("2026-06-26T01:00:00-03:00"), "2026-06-26");
  assert.equal(brtDateKey("2026-06-30T16:30:00-03:00"), "2026-06-30");
  assert.equal(brtDateKey("2026-04-30T02:01:13.398-03:00"), "2026-04-30");
});

test("brtDateKey: offset -0300 (sem dois-pontos) também é BRT", () => {
  assert.equal(brtDateKey("2026-06-26T01:00:00-0300"), "2026-06-26");
});

test("brtDateKey: data pura YYYY-MM-DD é preservada", () => {
  assert.equal(brtDateKey("2026-06-30"), "2026-06-30");
});

test("brtDateKey: sufixo Z (UTC) converte para data-calendário BRT", () => {
  // 02:00Z = 23:00 BRT do dia anterior.
  assert.equal(brtDateKey("2026-06-30T02:00:00Z"), "2026-06-29");
  // 23:59Z = 20:59 BRT do mesmo dia.
  assert.equal(brtDateKey("2026-06-30T23:59:00Z"), "2026-06-30");
});

test("brtDateKey: offset não-BRT converte para BRT", () => {
  // 00:00 em +00:00 = 21:00 BRT do dia anterior.
  assert.equal(brtDateKey("2026-06-30T00:00:00+00:00"), "2026-06-29");
});

test("brtDateKey: lixo não-parseável → null", () => {
  assert.equal(brtDateKey("sem-data"), null);
});
