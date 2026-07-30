import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isCanonicalPairingEnabled, isPunchAuditEnforced } from "./control-id-flags.js";

const KEYS = ["CONTROL_ID_CANONICAL_PAIRING", "CONTROL_ID_PUNCH_AUDIT_ENFORCE"] as const;
const prev: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) prev[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

test("pairing default off", () => {
  delete process.env.CONTROL_ID_CANONICAL_PAIRING;
  assert.equal(isCanonicalPairingEnabled(), false);
});

test("pairing on com true", () => {
  process.env.CONTROL_ID_CANONICAL_PAIRING = "true";
  assert.equal(isCanonicalPairingEnabled(), true);
});

test("audit enforce segue pairing por default", () => {
  delete process.env.CONTROL_ID_PUNCH_AUDIT_ENFORCE;
  process.env.CONTROL_ID_CANONICAL_PAIRING = "false";
  assert.equal(isPunchAuditEnforced(), false);
  process.env.CONTROL_ID_CANONICAL_PAIRING = "true";
  assert.equal(isPunchAuditEnforced(), true);
});
