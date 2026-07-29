import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, toDecimalString } from "../server/lib/parse-money.ts";

test("parseMoney aceita pt-BR com milhar (4.000,00)", () => {
  assert.equal(parseMoney("4.000,00"), 4000);
  assert.equal(parseMoney("R$ 4.000,00"), 4000);
  assert.equal(toDecimalString("4.000,00"), "4000.00");
});

test("parseMoney aceita en-US e número puro", () => {
  assert.equal(parseMoney("4,000.00"), 4000);
  assert.equal(parseMoney("4000.5"), 4000.5);
  assert.equal(parseMoney(6000), 6000);
  assert.equal(toDecimalString(6000), "6000.00");
});

test("parseMoney rejeita inválido / zero para salário base", () => {
  assert.ok(Number.isNaN(parseMoney("")));
  assert.equal(toDecimalString("0"), null);
  assert.equal(toDecimalString("abc"), null);
  assert.equal(toDecimalString("0", { allowZero: true }), "0.00");
});
