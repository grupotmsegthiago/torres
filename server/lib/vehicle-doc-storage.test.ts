import { test } from "node:test";
import assert from "node:assert/strict";
import { insuranceColumn, parseInsuranceKind } from "./vehicle-doc-storage.ts";

test("parseInsuranceKind: policy/contract e sinônimos", () => {
  assert.equal(parseInsuranceKind("policy"), "policy");
  assert.equal(parseInsuranceKind("apolice"), "policy");
  assert.equal(parseInsuranceKind("contract"), "contract");
  assert.equal(parseInsuranceKind("contrato"), "contract");
  assert.equal(parseInsuranceKind("x"), null);
});

test("insuranceColumn: mapeia para campos camelCase do schema", () => {
  assert.equal(insuranceColumn("policy"), "insurancePolicyFile");
  assert.equal(insuranceColumn("contract"), "insuranceContractFile");
});
