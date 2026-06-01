import { test } from "node:test";
import assert from "node:assert/strict";
import { exportPunchDisposition } from "./rhid-reconciliation";

// REGRESSÃO (Visibilidade do export — Edivando #14 e similares):
// Antes, exportMissingToRhid pulava com `continue` silencioso 2 situações:
//  (a) funcionário sem mapping/identidade no RHID;
//  (b) batida com external_id obsoleto (no RHID em outro minuto).
// As batidas "sumiam" sem rastro. exportPunchDisposition torna a decisão
// explícita e testável — cada situação vira um carimbo de erro visível,
// nunca mais um descarte silencioso.

test("sem mapping/identidade → skip_no_mapping (carimba erro, não exporta)", () => {
  assert.equal(exportPunchDisposition({ noIdentity: true, hasExternalId: false }), "skip_no_mapping");
  // mesmo já tendo external_id, falta de identidade tem prioridade
  assert.equal(exportPunchDisposition({ noIdentity: true, hasExternalId: true }), "skip_no_mapping");
});

test("com mapping + external_id obsoleto → stuck_external_id (revisão manual, NÃO re-exporta cego)", () => {
  assert.equal(exportPunchDisposition({ noIdentity: false, hasExternalId: true }), "stuck_external_id");
});

test("com mapping + sem external_id → export (caminho normal da corretiva)", () => {
  assert.equal(exportPunchDisposition({ noIdentity: false, hasExternalId: false }), "export");
});
