// Trava de quinzena (gerar-fatura, asaas.ts): a semântica do guard vive em
// contaComoAprovadaParaFatura — separada do SELO da tela (getRelatorioStatus,
// que ficou estrito por ordem do dono em 20/07/2026). Este teste congela a
// semântica usada pelo guard: o que conta como "efetivamente aprovada" e o
// que bloqueia — e garante que o selo NÃO mostra APROVADA sem aprovação real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contaComoAprovadaParaFatura, getRelatorioStatus } from "./mission-status";

const efetivoAprovada = contaComoAprovadaParaFatura;

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

test("SELO da tela é estrito: A_VERIFICAR nunca aparece como Aprovada", () => {
  assert.equal(getRelatorioStatus("concluída", "A_VERIFICAR", "encerrada").label, "A Verificar");
  assert.equal(getRelatorioStatus("concluída", "APROVADA", "encerrada").label, "Aprovada");
});
