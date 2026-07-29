import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCltContrato,
  labelTipoContratacao,
  normalizeTipoContratacao,
} from "./contratacao";

test("normalizeTipoContratacao: clt default e pj/fixo", () => {
  assert.equal(normalizeTipoContratacao(null), "clt");
  assert.equal(normalizeTipoContratacao(""), "clt");
  assert.equal(normalizeTipoContratacao("CLT"), "clt");
  assert.equal(normalizeTipoContratacao("pj"), "pj");
  assert.equal(normalizeTipoContratacao("PJ"), "pj");
  assert.equal(normalizeTipoContratacao("fixo"), "pj"); // legado
});

test("isCltContrato / label", () => {
  assert.equal(isCltContrato("clt"), true);
  assert.equal(isCltContrato("pj"), false);
  assert.equal(isCltContrato("fixo"), false);
  assert.equal(labelTipoContratacao("pj"), "PJ");
  assert.equal(labelTipoContratacao("clt"), "CLT");
});
