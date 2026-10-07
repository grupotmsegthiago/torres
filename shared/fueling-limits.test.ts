import test from "node:test";
import assert from "node:assert/strict";
import { fuelingLimitUserMessage, fuelingLimitViolation } from "./fueling-limits";

test("R$ 300,00 e 55 litros ainda podem ser salvos", () => {
  assert.equal(fuelingLimitViolation(300, 55), null);
  assert.equal(fuelingLimitViolation("300.00", "55"), null);
  assert.equal(fuelingLimitViolation("300,00", "55,000"), null);
});

test("valor acima de R$ 300 bloqueia mesmo com poucos litros", () => {
  const v = fuelingLimitViolation(300.01, 40);
  assert.ok(v);
  assert.equal(v.overTotal, true);
  assert.equal(v.overLiters, false);
  assert.match(fuelingLimitUserMessage(v), /não foi salvo/i);
  assert.match(fuelingLimitUserMessage(v), /300,01/);
});

test("litros acima de 55 bloqueiam mesmo com valor baixo", () => {
  const v = fuelingLimitViolation(200, 55.001);
  assert.ok(v);
  assert.equal(v.overTotal, false);
  assert.equal(v.overLiters, true);
  assert.match(fuelingLimitUserMessage(v), /55/);
});

test("os dois limites juntos entram na mesma mensagem", () => {
  const v = fuelingLimitViolation(450, 70);
  assert.ok(v);
  assert.equal(v.overTotal, true);
  assert.equal(v.overLiters, true);
  const msg = fuelingLimitUserMessage(v);
  assert.match(msg, /450,00/);
  assert.match(msg, /70 litros/);
});

test("vazio ou inválido não dispara o teto", () => {
  assert.equal(fuelingLimitViolation(null, undefined), null);
  assert.equal(fuelingLimitViolation("", "abc"), null);
});
