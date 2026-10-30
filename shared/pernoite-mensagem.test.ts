import assert from "node:assert/strict";
import { test } from "node:test";
import { isPernoiteMessage } from "./pernoite-mensagem";

test("pernoite na mensagem marca o estado", () => {
  assert.equal(isPernoiteMessage("Início de pernoite no pátio"), true);
  assert.equal(isPernoiteMessage("parado pernoite"), true);
});

test("reinício cancela o pernoite", () => {
  assert.equal(isPernoiteMessage("Saí do pernoite, retomando viagem"), false);
  assert.equal(isPernoiteMessage("Reinício da escolta"), false);
});

test("mensagem comum não é pernoite", () => {
  assert.equal(isPernoiteMessage("Operação segue normal"), false);
  assert.equal(isPernoiteMessage(null), false);
});
