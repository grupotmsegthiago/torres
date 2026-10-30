import test from "node:test";
import assert from "node:assert/strict";
import { bloqueioNfSemOs, faturaCanceladaNaoRecebeOs, NF_SEM_OS_MSG, parseLinkOsPayload } from "./nf-os-guard";

test("zero OS bloqueia a emissão", () => {
  assert.equal(bloqueioNfSemOs(0), NF_SEM_OS_MSG);
  assert.equal(bloqueioNfSemOs(Number.NaN), NF_SEM_OS_MSG);
});

test("uma OS libera a emissão", () => {
  assert.equal(bloqueioNfSemOs(1), null);
  assert.equal(bloqueioNfSemOs(3), null);
});

test("vínculo aceita o UUID do faturamento e o número da fatura", () => {
  const billingId = "3f1c2a80-7b44-4e1a-9c20-6d8e0a1b2c3d";
  const parsed = parseLinkOsPayload({ invoiceId: 231, billingIds: [billingId] });
  assert.deepEqual(parsed, { invoiceId: 231, billingIds: [billingId] });
  assert.equal(parseLinkOsPayload({ invoiceId: 231, billingIds: [Number(billingId)] }), null);
  assert.equal(parseLinkOsPayload({ invoiceId: "231", billingIds: [] }), null);
});

test("fatura ou NF cancelada não recebe OS", () => {
  assert.equal(faturaCanceladaNaoRecebeOs({ status: "CANCELED", nfse_status: "CANCELLED" }), true);
  assert.equal(faturaCanceladaNaoRecebeOs({ status: "RECEIVED", nfse_status: "EMITIDA" }), false);
});
