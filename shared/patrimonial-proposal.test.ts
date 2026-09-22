import { test } from "node:test";
import assert from "node:assert/strict";
import { calcPatrimonialProposal, type PatrimonialMatrix } from "./patrimonial-proposal.ts";

const matrix: PatrimonialMatrix = {
  taxPercentage: 16,
  commissionPercentage: 3,
  bonusThreshold1: 500_000,
  bonusValue1: 5_000,
  bonusThreshold2: 1_000_000,
  bonusValue2: 10_000,
};

test("proposta abaixo da meta 1 não gera bônus", () => {
  const r = calcPatrimonialProposal(150_000, matrix);
  assert.equal(r.taxAmount, 24_000);
  assert.equal(r.netResult, 126_000);
  assert.equal(r.commissionAmount, 4_500);
  assert.equal(r.bonusAmount, 0);
  assert.equal(r.totalPayable, 4_500);
});

test("bônus da meta 1 entra no limite e a meta 2 substitui", () => {
  assert.equal(calcPatrimonialProposal(499_999.99, matrix).bonusAmount, 0);
  assert.equal(calcPatrimonialProposal(500_000, matrix).bonusAmount, 5_000);
  assert.equal(calcPatrimonialProposal(999_999.99, matrix).bonusAmount, 5_000);
  const top = calcPatrimonialProposal(1_000_000, matrix);
  assert.equal(top.bonusAmount, 10_000);
  assert.equal(top.commissionAmount, 30_000);
  assert.equal(top.totalPayable, 40_000);
  assert.equal(top.taxAmount, 160_000);
  assert.equal(top.netResult, 840_000);
});
