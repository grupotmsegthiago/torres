import { test } from "node:test";
import assert from "node:assert/strict";
import { diaElegivelDiariaPonto, DIARIA_LONG_SHIFT_LIMITE_HORAS } from "./diarias-jornada-longa";

test("diária de ponto só acima de 16 horas", () => {
  const limite = DIARIA_LONG_SHIFT_LIMITE_HORAS * 60;
  assert.equal(diaElegivelDiariaPonto(limite), false);
  assert.equal(diaElegivelDiariaPonto(6 * 60 + 59), false);
  assert.equal(diaElegivelDiariaPonto(19 * 60 + 59), true);
  assert.equal(diaElegivelDiariaPonto(limite + 1), true);
});
