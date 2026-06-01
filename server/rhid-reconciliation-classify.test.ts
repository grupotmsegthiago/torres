import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMark } from "./rhid-reconciliation";

test("classifyMark: 1 nosso + 1 RHID = validado", () => {
  assert.equal(classifyMark(1, 1), "validado");
});

test("classifyMark: 1 nosso + 0 RHID = faltando_no_rhid (exportar)", () => {
  assert.equal(classifyMark(1, 0), "faltando_no_rhid");
});

test("classifyMark: 0 nosso + 1 RHID = faltando_no_local (importar)", () => {
  assert.equal(classifyMark(0, 1), "faltando_no_local");
});

test("classifyMark: 2 nossos = duplicada", () => {
  assert.equal(classifyMark(2, 1), "duplicada");
});

test("classifyMark: RHID-side dup (1 nosso + 2 RHID) é DUPLICADA, nunca validado", () => {
  // Regressão: o AFD do RHID podia ter 2 ids no mesmo minuto; antes era
  // classificado como 'validado' e a divergência sumia do painel/e-mail.
  assert.equal(classifyMark(1, 2), "duplicada");
});

test("classifyMark: dup dos dois lados = duplicada", () => {
  assert.equal(classifyMark(3, 2), "duplicada");
});

test("classifyMark: só RHID com 2 batidas (0 nosso + 2 RHID) = duplicada", () => {
  // RHID tem 2 batidas no minuto e nós não temos nenhuma: ainda é divergência
  // de duplicação no RHID, não 'faltando_no_local'.
  assert.equal(classifyMark(0, 2), "duplicada");
});
