import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFuelingKm, FUELING_MAX_KM_JUMP } from "./fleet";

test("validateFuelingKm: KM igual ao atual é OK", () => {
  assert.equal(validateFuelingKm(23162, 23162, false), null);
});

test("validateFuelingKm: KM um pouco maior é OK", () => {
  assert.equal(validateFuelingKm(23500, 23162, false), null);
});

test("validateFuelingKm: KM menor SEM autorização bloqueia (caso do print)", () => {
  const r = validateFuelingKm(21886, 23162, false);
  assert.ok(r, "deveria bloquear");
  assert.equal(r!.reason, "lower");
  assert.match(r!.message, /menor que o KM atual/);
});

test("validateFuelingKm: KM menor COM autorização (lançamento retroativo) passa", () => {
  assert.equal(validateFuelingKm(21886, 23162, true), null);
});

test("validateFuelingKm: salto grande pra cima bloqueia mesmo SEM ser retroativo", () => {
  const r = validateFuelingKm(23162 + FUELING_MAX_KM_JUMP + 1, 23162, false);
  assert.ok(r);
  assert.equal(r!.reason, "jump");
});

test("validateFuelingKm: autorização NÃO libera salto absurdo pra cima (continua erro de digitação)", () => {
  const r = validateFuelingKm(99999, 23162, true);
  assert.ok(r, "salto grande pra cima deve continuar bloqueado mesmo com override");
  assert.equal(r!.reason, "jump");
});

test("validateFuelingKm: veículo zerado (km=0) não bloqueia primeiro abastecimento", () => {
  assert.equal(validateFuelingKm(50000, 0, false), null);
});
