import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertReason } from "./punch-audit.js";

const prevPairing = process.env.CONTROL_ID_CANONICAL_PAIRING;
const prevAudit = process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE;

beforeEach(() => {
  process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE = "true";
});
afterEach(() => {
  if (prevPairing === undefined) delete process.env.CONTROL_ID_CANONICAL_PAIRING;
  else process.env.CONTROL_ID_CANONICAL_PAIRING = prevPairing;
  if (prevAudit === undefined) delete process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE;
  else process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE = prevAudit;
});

test("motivo obrigatório rejeita vazio/curto quando audit enforced", () => {
  assert.throws(() => assertReason(""), /Motivo obrigatório/);
  assert.throws(() => assertReason("abc"), /Motivo obrigatório/);
});

test("motivo válido", () => {
  assert.equal(assertReason("  correção oficial  "), "correção oficial");
});

test("motivo opcional quando audit não enforced", () => {
  process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE = "false";
  assert.ok(assertReason("").length > 0);
});
