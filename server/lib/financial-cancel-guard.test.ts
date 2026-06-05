import { test } from "node:test";
import assert from "node:assert/strict";
import { canCancelAguardando } from "./financial-cancel-guard";

test("null/undefined → 404", () => {
  assert.deepEqual(canCancelAguardando(null), { ok: false, code: 404, message: "Lançamento não encontrado" });
  assert.deepEqual(canCancelAguardando(undefined), { ok: false, code: 404, message: "Lançamento não encontrado" });
});

test("lançamento automático → 403 (não cancela manual)", () => {
  const r = canCancelAguardando({ status: "AGUARDANDO_APROVACAO", origin_type: "mission_cost" });
  assert.equal(r.ok, false);
  assert.equal((r as any).code, 403);
});

test("já aprovado (PENDING) → 403", () => {
  const r = canCancelAguardando({ status: "PENDING", origin_type: "manual" });
  assert.equal(r.ok, false);
  assert.equal((r as any).code, 403);
});

test("já pago (PAID) → 403", () => {
  assert.equal(canCancelAguardando({ status: "PAID", origin_type: "manual" }).ok, false);
});

test("recusado (RECUSADA) → 403", () => {
  assert.equal(canCancelAguardando({ status: "RECUSADA", origin_type: "manual" }).ok, false);
});

test("aguardando aprovação (manual) → ok", () => {
  assert.deepEqual(canCancelAguardando({ status: "AGUARDANDO_APROVACAO", origin_type: "manual" }), { ok: true });
});

test("aguardando aprovação (origin_type null) → ok", () => {
  assert.deepEqual(canCancelAguardando({ status: "AGUARDANDO_APROVACAO", origin_type: null }), { ok: true });
});
