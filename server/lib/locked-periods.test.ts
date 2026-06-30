import { test } from "node:test";
import assert from "node:assert/strict";
import { isDateLocked, isMissingTableError, type LockedPeriod } from "./locked-periods.ts";

const period2605a2506: LockedPeriod = {
  id: 1,
  startDate: "2026-05-26",
  endDate: "2026-06-25",
  deviceId: null,
  note: "folha mai/jun",
};

test("sem períodos: nunca trava", () => {
  assert.equal(isDateLocked("2026-06-01T10:00:00-03:00", []), false);
});

test("data dentro do período fechado: trava", () => {
  assert.equal(isDateLocked("2026-06-01T10:00:00-03:00", [period2605a2506]), true);
});

test("limites inclusivos (início e fim)", () => {
  assert.equal(isDateLocked("2026-05-26T00:01:00-03:00", [period2605a2506]), true);
  assert.equal(isDateLocked("2026-06-25T23:59:00-03:00", [period2605a2506]), true);
});

test("fora do período (antes e depois): não trava", () => {
  assert.equal(isDateLocked("2026-05-25T23:59:00-03:00", [period2605a2506]), false);
  assert.equal(isDateLocked("2026-06-26T00:01:00-03:00", [period2605a2506]), false);
});

test("madrugada BRT sem offset não escorrega de dia (usa brtDateKey)", () => {
  // 2026-06-26 01:00 BRT é o 1º dia FORA do período — não pode ser tratado como 25/06.
  assert.equal(isDateLocked("2026-06-26T01:00:00", [period2605a2506]), false);
  // 2026-05-26 01:00 BRT é o 1º dia DENTRO — deve travar.
  assert.equal(isDateLocked("2026-05-26T01:00:00", [period2605a2506]), true);
});

test("valor inválido/nulo: não trava (fail-open)", () => {
  assert.equal(isDateLocked(null, [period2605a2506]), false);
  assert.equal(isDateLocked("lixo", [period2605a2506]), false);
});

test("múltiplos períodos: trava se cair em qualquer um", () => {
  const outro: LockedPeriod = { id: 2, startDate: "2026-04-26", endDate: "2026-05-25", deviceId: null, note: null };
  assert.equal(isDateLocked("2026-05-10T08:00:00-03:00", [period2605a2506, outro]), true);
  assert.equal(isDateLocked("2026-06-10T08:00:00-03:00", [period2605a2506, outro]), true);
  assert.equal(isDateLocked("2026-07-10T08:00:00-03:00", [period2605a2506, outro]), false);
});

test("isMissingTableError: pré-DDL é fail-open (true)", () => {
  // Mensagens típicas do PostgREST/Postgres quando a tabela não existe.
  assert.equal(isMissingTableError('relation "control_id_locked_periods" does not exist'), true);
  assert.equal(isMissingTableError("Could not find the table 'public.control_id_locked_periods' in the schema cache"), true);
  assert.equal(isMissingTableError("schema cache reload"), true);
  assert.equal(isMissingTableError("42P01"), true);
});

test("isMissingTableError: erro real é fail-closed (false)", () => {
  // Erros transitórios/reais NÃO podem ser tratados como 'sem trava'.
  assert.equal(isMissingTableError("fetch failed"), false);
  assert.equal(isMissingTableError("network timeout"), false);
  assert.equal(isMissingTableError("permission denied for table"), false);
  assert.equal(isMissingTableError(null), false);
  assert.equal(isMissingTableError(undefined), false);
});
