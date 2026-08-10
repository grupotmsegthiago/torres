import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  billingHasCommercialSnapshot,
  COMMERCIAL_FROZEN_BILLING_STATUSES,
  GENERIC_RECALC_PROTECTED_STATUSES,
  isBillingProtected,
  isBillingStatusProtected,
} from "./billing-frozen";

function snapshotMock(found = false, error: any = null) {
  const calls: any[] = [];
  return {
    sb: {
      rpc(name: string, args: any) {
        calls.push(["rpc", name, args]);
        return Promise.resolve({ data: found, error });
      },
    },
    calls,
  };
}

describe("billing frozen — contrato normativo", () => {
  test("status comerciais frozen são completos", () => {
    assert.deepEqual(
      [...COMMERCIAL_FROZEN_BILLING_STATUSES],
      ["APROVADA", "FATURADO", "FATURADA", "PAGO"],
    );
  });

  test("canceladas ficam protegidas contra recálculo genérico", () => {
    assert.equal(GENERIC_RECALC_PROTECTED_STATUSES.has("CANCELADO"), true);
    assert.equal(GENERIC_RECALC_PROTECTED_STATUSES.has("CANCELADA"), true);
  });

  test("estados abertos não são frozen só pelo status", () => {
    for (const status of ["A_VERIFICAR", "PENDENTE", "VERIFICADA", "REJEITADA"]) {
      assert.equal(isBillingStatusProtected(status), false, status);
    }
  });

  test("normaliza status antes de proteger", () => {
    assert.equal(isBillingStatusProtected(" faturada "), true);
    assert.equal(isBillingStatusProtected(null), false);
  });

  test("snapshot comercial protege billing aberto", async () => {
    const mock = snapshotMock(true);
    assert.equal(
      await isBillingProtected(mock.sb, {
        id: "billing-1",
        status: "A_VERIFICAR",
        lock_version: 0,
      }),
      true,
    );
    assert.deepEqual(mock.calls, [
      ["rpc", "is_escort_billing_snapshotted", {
        p_billing_id: "billing-1",
        p_lock_version: 0,
      }],
    ]);
  });

  test("billing aberto sem snapshot pode ser recalculado", async () => {
    const mock = snapshotMock(false);
    assert.equal(
      await isBillingProtected(mock.sb, { id: "billing-2", status: "PENDENTE" }),
      false,
    );
  });

  test("status frozen não consulta snapshot", async () => {
    const mock = snapshotMock(false);
    assert.equal(
      await isBillingProtected(mock.sb, { id: "billing-3", status: "APROVADA" }),
      true,
    );
    assert.deepEqual(mock.calls, []);
  });

  test("billing aberto sem ID falha fechado", async () => {
    const mock = snapshotMock(false);
    await assert.rejects(
      isBillingProtected(mock.sb, { status: "A_VERIFICAR" }),
      /ID do billing é obrigatório/,
    );
    assert.deepEqual(mock.calls, []);
  });

  test("falha de catálogo é fail-closed via erro", async () => {
    const mock = snapshotMock(false, { message: "schema unavailable" });
    await assert.rejects(
      billingHasCommercialSnapshot(mock.sb, "billing-4"),
      /Falha ao verificar snapshot comercial/,
    );
  });
});
