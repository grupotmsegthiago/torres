// Trava de quinzena (gerar-fatura, asaas.ts): mesmo critério da tela de
// Faturamento via getRelatorioStatus. Este teste congela a semântica usada
// pelo guard: o que conta como "efetivamente aprovada" e o que bloqueia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRelatorioStatus, BILLING_STATUS_MAP } from "./mission-status";

const efetivoAprovada = (soStatus: string, billingStatus: string, missionStatus?: string) =>
  getRelatorioStatus(soStatus, billingStatus, missionStatus) === BILLING_STATUS_MAP.APROVADA;

test("A_VERIFICAR com OS concluída + missão encerrada NÃO bloqueia (vale como aprovada)", () => {
  assert.equal(efetivoAprovada("concluída", "A_VERIFICAR", "encerrada"), true);
  assert.equal(efetivoAprovada("concluida", "A_VERIFICAR", "encerrada"), true);
  assert.equal(efetivoAprovada("completed", "A_VERIFICAR", "encerrada"), true);
});

test("APROVADA de verdade vale como aprovada", () => {
  assert.equal(efetivoAprovada("concluída", "APROVADA", "encerrada"), true);
  assert.equal(efetivoAprovada("concluída", "APROVADA", undefined), true);
});

test("pendência real BLOQUEIA: missão não encerrada ou OS não concluída", () => {
  assert.equal(efetivoAprovada("concluída", "A_VERIFICAR", "em_andamento"), false);
  assert.equal(efetivoAprovada("in_progress", "A_VERIFICAR", undefined), false);
  assert.equal(efetivoAprovada("concluída", "PENDENTE", undefined), false);
});

test("recusada/cancelada nunca valem como aprovada (guard as ignora antes)", () => {
  assert.equal(efetivoAprovada("recusada", "A_VERIFICAR", "encerrada"), false);
  assert.equal(efetivoAprovada("cancelada", "A_VERIFICAR", "encerrada"), false);
});
