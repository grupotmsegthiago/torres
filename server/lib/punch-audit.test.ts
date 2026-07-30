import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReason } from "./punch-audit.js";

test("motivo obrigatório rejeita vazio/curto", () => {
  assert.throws(() => assertReason(""), /Motivo obrigatório/);
  assert.throws(() => assertReason("abc"), /Motivo obrigatório/);
});

test("motivo válido", () => {
  assert.equal(assertReason("  correção oficial  "), "correção oficial");
});
