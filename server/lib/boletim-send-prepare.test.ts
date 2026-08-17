import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBillingsForBoletimSend,
  contractsMatch,
  normalizeContractId,
  planContractHeals,
} from "./boletim-send-prepare.ts";

test("normalizeContractId trim+lower", () => {
  assert.equal(normalizeContractId("  ABC-DEF  "), "abc-def");
  assert.equal(normalizeContractId(null), null);
  assert.equal(normalizeContractId(""), null);
});

test("contractsMatch ignora caixa", () => {
  assert.equal(contractsMatch("Aaa", "aaa"), true);
  assert.equal(contractsMatch("a", "b"), false);
  assert.equal(contractsMatch(null, "a"), false);
});

test("classify exclui recusada e detecta mismatch", () => {
  const orders = new Map<number, any>([
    [1, { id: 1, status: "concluida", escort_contract_id: "C1", os_number: "TOR-1" }],
    [2, { id: 2, status: "recusada", escort_contract_id: "C1", os_number: "TOR-2" }],
    [3, { id: 3, status: "cancelada", escort_contract_id: "C-OS", os_number: "TOR-0560" }],
    [4, { id: 4, status: "concluida", escort_contract_id: null, os_number: "TOR-4" }],
  ]);
  const billings = [
    { id: "b1", service_order_id: 1, status: "A_VERIFICAR", contract_id: "C1", os_number: "TOR-1" },
    { id: "b2", service_order_id: 2, status: "CANCELADO", contract_id: "C1", os_number: "TOR-2" },
    { id: "b3", service_order_id: 3, status: "CANCELADO", contract_id: "C-100", os_number: "TOR-0560" },
    { id: "b4", service_order_id: 4, status: "A_VERIFICAR", contract_id: null, os_number: "TOR-4" },
  ];
  const c = classifyBillingsForBoletimSend(billings, orders);
  assert.deepEqual(c.refused.map((b) => b.id), ["b2"]);
  assert.deepEqual(c.missingContract.map((b) => b.id), ["b4"]);
  assert.equal(c.contractMismatch.length, 1);
  assert.equal(c.contractMismatch[0].billing.id, "b3");
  assert.deepEqual(c.eligible.map((b) => b.id).sort(), ["b1", "b3"]);
});

test("planContractHeals usa contract_id do billing (tabela que precificou)", () => {
  const heals = planContractHeals([
    {
      billing: { id: "b3", service_order_id: 3, os_number: "TOR-0560", contract_id: "C-100" },
      os: { id: 3, escort_contract_id: "C-OS" },
      billingContractId: "c-100",
      osContractId: "c-os",
    },
  ]);
  assert.equal(heals.length, 1);
  assert.equal(heals[0].contractId, "C-100");
  assert.equal(heals[0].serviceOrderId, 3);
});
