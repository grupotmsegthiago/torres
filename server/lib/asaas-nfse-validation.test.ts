import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  isNfErrorStatus,
  isNfOkStatus,
  extractNfErrorMessage,
  extractConcreteNfErrorMessage,
  resolveNfErrorMessage,
  shouldBlockNfEmission,
  MISSING_EMAIL_NF_MSG,
} from "./asaas-helpers";

test("isValidEmail: vazio/ausente é inválido", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("   "), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
});

test("isValidEmail: formato simples", () => {
  assert.equal(isValidEmail("financeiro@cliente.com.br"), true);
  assert.equal(isValidEmail("semarroba.com"), false);
  assert.equal(isValidEmail("falta@dominio"), false);
  assert.equal(isValidEmail("com espaco @x.com"), false);
});

test("isValidEmail: lista separada por vírgula/; — todos precisam ser válidos", () => {
  assert.equal(isValidEmail("a@x.com, b@y.com"), true);
  assert.equal(isValidEmail("a@x.com; b@y.com"), true);
  assert.equal(isValidEmail("a@x.com, invalido"), false);
});

test("isNfErrorStatus / isNfOkStatus", () => {
  for (const s of ["ERROR", "erro", "Rejected", "DENIED", "failed", "FALHA"]) {
    assert.equal(isNfErrorStatus(s), true, `${s} deveria ser erro`);
  }
  for (const s of ["AUTHORIZED", "synchronized", "ISSUED"]) {
    assert.equal(isNfOkStatus(s), true, `${s} deveria ser OK`);
  }
  assert.equal(isNfErrorStatus("AUTHORIZED"), false);
  assert.equal(isNfOkStatus("ERROR"), false);
  assert.equal(isNfErrorStatus(null), false);
});

test("extractNfErrorMessage: usa o primeiro campo de rejeição disponível", () => {
  assert.equal(extractNfErrorMessage({ rejectionReason: "E-mail do tomador inválido" }), "E-mail do tomador inválido");
  assert.equal(extractNfErrorMessage({ statusDescription: "Inscrição municipal ausente" }), "Inscrição municipal ausente");
  assert.equal(
    extractNfErrorMessage({ errors: [{ description: "Endereço incompleto" }] }),
    "Endereço incompleto",
  );
});

test("extractNfErrorMessage: sem campo de erro devolve texto acionável (nunca vazio)", () => {
  const msg = extractNfErrorMessage({ status: "ERROR" }, "ERROR");
  assert.ok(msg.length > 0);
  assert.match(msg, /ERROR/);
  assert.match(msg, /Resolver agora/);
});

test("extractNfErrorMessage: nunca retorna string vazia mesmo com objeto vazio", () => {
  assert.ok(extractNfErrorMessage({}).length > 0);
  assert.ok(extractNfErrorMessage(null).length > 0);
});

test("MISSING_EMAIL_NF_MSG é claro e acionável", () => {
  assert.match(MISSING_EMAIL_NF_MSG, /e-mail/i);
  assert.match(MISSING_EMAIL_NF_MSG, /Resolver agora/);
});

test("shouldBlockNfEmission: undefined NÃO bloqueia (legado opt-in)", () => {
  assert.equal(shouldBlockNfEmission(undefined), false);
});

test("shouldBlockNfEmission: e-mail inválido/vazio bloqueia; válido não", () => {
  assert.equal(shouldBlockNfEmission(""), true);
  assert.equal(shouldBlockNfEmission("   "), true);
  assert.equal(shouldBlockNfEmission("semarroba"), true);
  assert.equal(shouldBlockNfEmission("a@x.com, invalido"), true);
  assert.equal(shouldBlockNfEmission("financeiro@cliente.com.br"), false);
  assert.equal(shouldBlockNfEmission("a@x.com, b@y.com"), false);
});

test("extractConcreteNfErrorMessage: retorna null quando não há mensagem real", () => {
  assert.equal(extractConcreteNfErrorMessage({}), null);
  assert.equal(extractConcreteNfErrorMessage(null), null);
  assert.equal(extractConcreteNfErrorMessage({ status: "ERROR" }), null);
  assert.equal(extractConcreteNfErrorMessage({ rejectionReason: "X inválido" }), "X inválido");
});

test("resolveNfErrorMessage: prioriza mensagem concreta do Asaas", () => {
  assert.equal(
    resolveNfErrorMessage({ rejectionReason: "Novo erro do Asaas" }, "ERROR", "Erro antigo específico"),
    "Novo erro do Asaas",
  );
});

test("resolveNfErrorMessage: sem concreta, PRESERVA a mensagem específica já gravada", () => {
  assert.equal(
    resolveNfErrorMessage({ status: "ERROR" }, "ERROR", "E-mail do cliente incompleto"),
    "E-mail do cliente incompleto",
  );
});

test("resolveNfErrorMessage: sem concreta e sem existente cai no genérico (nunca vazio)", () => {
  const msg = resolveNfErrorMessage({ status: "ERROR" }, "ERROR", null);
  assert.ok(msg.length > 0);
  assert.match(msg, /ERROR/);
  assert.match(msg, /Resolver agora/);
});
