import { test } from "node:test";
import assert from "node:assert/strict";
import { metaPeriodoFromMensal } from "@shared/balanco-meta";

test("metaPeriodoFromMensal: rateia mês comercial 30 dias", () => {
  assert.equal(metaPeriodoFromMensal(300_000, 30), 300_000);
  assert.equal(metaPeriodoFromMensal(310_000, 31), 320_333.33);
  assert.equal(metaPeriodoFromMensal(0, 30), 0);
});
