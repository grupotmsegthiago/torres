import test from "node:test";
import assert from "node:assert/strict";
import { bloqueioNfSemOs, NF_SEM_OS_MSG } from "./nf-os-guard";

test("zero OS bloqueia a emissão", () => {
  assert.equal(bloqueioNfSemOs(0), NF_SEM_OS_MSG);
  assert.equal(bloqueioNfSemOs(Number.NaN), NF_SEM_OS_MSG);
});

test("uma OS libera a emissão", () => {
  assert.equal(bloqueioNfSemOs(1), null);
  assert.equal(bloqueioNfSemOs(3), null);
});
