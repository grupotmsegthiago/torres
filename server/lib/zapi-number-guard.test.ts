import { test } from "node:test";
import assert from "node:assert/strict";
import { isOfficialBotNumber, decideNumberAllow, decideNumberBlockReason } from "./zapi";

const OFICIAL = "5511926839456"; // +55 11 92683-9456 (número oficial da Central)
const ERRADO = "5511999997803"; // chip diferente conectado por engano

// --- matcher puro ---
test("número oficial casa (com DDI)", () => {
  assert.equal(isOfficialBotNumber(OFICIAL), true);
});

test("número oficial casa sem DDI (só DDD+número)", () => {
  assert.equal(isOfficialBotNumber("11926839456"), true);
});

test("número oficial casa com máscara/formatação", () => {
  assert.equal(isOfficialBotNumber("+55 (11) 92683-9456"), true);
});

test("número diferente NÃO casa (chip errado conectado)", () => {
  assert.equal(isOfficialBotNumber(ERRADO), false);
});

test("string vazia NÃO casa", () => {
  assert.equal(isOfficialBotNumber(""), false);
});

test("número parecido mas final diferente NÃO casa", () => {
  assert.equal(isOfficialBotNumber("5511926839457"), false);
});

// --- decisão de envio (fail-closed) ---
test("conectado = oficial → LIBERA", () => {
  assert.equal(decideNumberAllow(OFICIAL, null), true);
});

test("conectado = errado → BLOQUEIA", () => {
  assert.equal(decideNumberAllow(ERRADO, null), false);
});

test("conectado desconhecido mas último confirmado = oficial → LIBERA (erro transitório do /device)", () => {
  assert.equal(decideNumberAllow(null, OFICIAL), true);
});

test("conectado desconhecido e último confirmado = errado → BLOQUEIA", () => {
  assert.equal(decideNumberAllow(null, ERRADO), false);
});

test("nunca confirmado (ambos null) → BLOQUEIA (fail-closed)", () => {
  assert.equal(decideNumberAllow(null, null), false);
});

test("troca de chip: conectado atual errado prevalece sobre último confirmado oficial → BLOQUEIA", () => {
  assert.equal(decideNumberAllow(ERRADO, OFICIAL), false);
});

// --- motivo do bloqueio (filas: descartar vs re-tentar) ---
test("motivo: número errado conhecido → wrong_number (fila pode DESCARTAR)", () => {
  assert.equal(decideNumberBlockReason(ERRADO, null), "wrong_number");
  assert.equal(decideNumberBlockReason(null, ERRADO), "wrong_number");
  assert.equal(decideNumberBlockReason(ERRADO, OFICIAL), "wrong_number");
});

test("motivo: nunca confirmado + /device falhou → unconfirmed (fila RE-TENTA, nunca descarta)", () => {
  assert.equal(decideNumberBlockReason(null, null), "unconfirmed");
});

test("motivo: número oficial → null (envio liberado)", () => {
  assert.equal(decideNumberBlockReason(OFICIAL, null), null);
  assert.equal(decideNumberBlockReason(null, OFICIAL), null);
});
