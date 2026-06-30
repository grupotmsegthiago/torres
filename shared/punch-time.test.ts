import { test } from "node:test";
import assert from "node:assert/strict";
import { isBoundaryPunchTime } from "./punch-time";

test("isBoundaryPunchTime: detecta os horários de borda 00:00 e 23:59", () => {
  assert.equal(isBoundaryPunchTime("2026-06-02T00:00"), true);
  assert.equal(isBoundaryPunchTime("2026-06-02T23:59"), true);
  // com segundos / sufixo também funciona (slice pega só HH:MM)
  assert.equal(isBoundaryPunchTime("2026-06-02T23:59:00"), true);
  assert.equal(isBoundaryPunchTime("2026-06-02T00:00:00.000Z"), true);
});

test("isBoundaryPunchTime: horários normais NÃO são borda", () => {
  assert.equal(isBoundaryPunchTime("2026-06-02T08:00"), false);
  assert.equal(isBoundaryPunchTime("2026-06-02T12:12"), false);
  assert.equal(isBoundaryPunchTime("2026-06-02T13:18"), false);
  assert.equal(isBoundaryPunchTime("2026-06-02T18:00"), false);
  // perto da borda, mas não exatamente
  assert.equal(isBoundaryPunchTime("2026-06-02T23:58"), false);
  assert.equal(isBoundaryPunchTime("2026-06-02T00:01"), false);
});

test("cenário plantão: dia completo 08:00/12:12/13:18/23:59 só força a Saída", () => {
  const slots = ["08:00", "12:12", "13:18", "23:59"].map(
    (hhmm) => `2026-06-02T${hhmm}`,
  );
  const forced = slots.map(isBoundaryPunchTime);
  assert.deepEqual(forced, [false, false, false, true]);
});
