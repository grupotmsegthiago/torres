import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AtomicBillingError,
  createBoletimApprovalAtomic,
  updateBillingLifecycleAtomic,
  writeEscortBillingAtomic,
} from "./atomic-billing";

test("writeEscortBillingAtomic envia versão e nunca faz retry/fallback", async () => {
  const calls: any[] = [];
  const sb = {
    rpc: async (name: string, args: any) => {
      calls.push([name, args]);
      return { data: [{ id: "billing-1", lock_version: 8 }], error: null };
    },
  };
  const row = await writeEscortBillingAtomic({
    action: "UPDATE_OPEN",
    billingId: "billing-1",
    serviceOrderId: 981,
    expectedVersion: 7,
    payload: { fat_total: 480 },
    actor: { userId: 1, userName: "Admin", userRole: "admin" },
  }, sb);
  assert.equal(row.lock_version, 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "write_escort_billing_atomic");
  assert.equal(calls[0][1].p_expected_version, 7);
});

test("erro stale da RPC é propagado sem retry cego", async () => {
  let calls = 0;
  const sb = {
    rpc: async () => {
      calls++;
      return {
        data: null,
        error: { code: "40001", message: "PR5B1_TX_STALE_VERSION" },
      };
    },
  };
  await assert.rejects(
    writeEscortBillingAtomic({
      action: "UPDATE_OPEN",
      billingId: "billing-1",
      expectedVersion: 1,
      payload: { fat_total: 10 },
    }, sb),
    (error: any) => {
      assert.ok(error instanceof AtomicBillingError);
      assert.equal(error.code, "40001");
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("lifecycle lê lock_version e a envia para a RPC", async () => {
  const calls: any[] = [];
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "billing-2",
              service_order_id: 941,
              status: "APROVADA",
              lock_version: 12,
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (name: string, args: any) => {
      calls.push([name, args]);
      return { data: [{ id: "billing-2", lock_version: 13 }], error: null };
    },
  };
  await updateBillingLifecycleAtomic(
    "billing-2",
    "REOPEN_APPROVED",
    { status: "A_VERIFICAR" },
    { userName: "Admin", reason: "Correção" },
    sb,
  );
  assert.equal(calls[0][1].p_expected_version, 12);
  assert.equal(calls[0][1].p_action, "REOPEN_APPROVED");
});

test("snapshot atômico inclui versões preparadas pelo domínio", async () => {
  let args: any;
  const sb = {
    rpc: async (_name: string, input: any) => {
      args = input;
      return { data: [{ id: 90, status: "PENDENTE" }], error: null };
    },
  };
  await createBoletimApprovalAtomic({
    token: "token",
    clientId: 1,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-15",
    billingIds: ["billing-1"],
    totalValue: 100,
    osCount: 1,
    billingSnapshot: [{
      billing_id: "billing-1",
      billing_version: 4,
      total: 100,
    }],
  }, sb);
  assert.equal(args.p_billing_snapshot[0].billing_version, 4);
  assert.deepEqual(args.p_billing_ids, ["billing-1"]);
});
