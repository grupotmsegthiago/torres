import { test } from "node:test";
import assert from "node:assert/strict";
import { getRelatorioBadges, getRelatorioStatus } from "./mission-status.ts";

test("getRelatorioStatus: recusada some; faturada do período prevalece", () => {
  assert.equal(getRelatorioStatus("recusada", "CANCELADO").label, "Recusada");
  assert.equal(getRelatorioStatus("recusada", "FATURADO").label, "Faturada");
  assert.equal(getRelatorioStatus("cancelada", "CANCELADO").label, "Cancelada");
  assert.equal(getRelatorioStatus("cancelada", "FATURADO").label, "Faturada");
  assert.equal(getRelatorioStatus("concluida", "APROVADA", "encerrada").label, "Aprovada");
});

test("getRelatorioBadges: invoice do período mantém selo Faturada", () => {
  assert.equal(getRelatorioBadges("recusada", "FATURADO")[0].label, "Faturada");
  assert.equal(getRelatorioBadges("cancelada", "PAGO")[0].label, "Pago");
  assert.equal(getRelatorioBadges("cancelada", "APROVADA")[0].label, "Aprovada / Cancelada");
  assert.equal(getRelatorioBadges("recusada", "CANCELADO")[0].label, "Recusada");
});
