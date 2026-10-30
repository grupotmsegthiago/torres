import assert from "node:assert/strict";
import { test } from "node:test";
import { classeDaArma, classesDoKit, kitCompativelComPlaca } from "./kit-visual";

test("separa pistola, espingarda e revolver", () => {
  assert.equal(classeDaArma("Pistola", ".380 ACP"), "pistola");
  assert.equal(classeDaArma("Espingarda", "12 GA"), "12");
  assert.equal(classeDaArma("Revólver", ".38"), "38");
  assert.equal(classeDaArma("Outro", "9mm"), null);
});

test("o kit mostra cada classe uma vez, na ordem 38, 12 e pistola", () => {
  assert.deepEqual(classesDoKit([
    { type: "Revólver", caliber: ".38" },
    { type: "Revólver", caliber: ".38" },
    { type: "Pistola", caliber: ".380 ACP" },
    { type: "Espingarda", caliber: "12 GA" },
  ]), ["38", "12", "pistola"]);
});

test("a placa com zero encontra o kit escrito com a letra O", () => {
  assert.equal(kitCompativelComPlaca("KIT TORRES - 06 - TMGOE12", "TMG0E12"), true);
  assert.equal(kitCompativelComPlaca("KIT TORRES - 12 - SWG2F39", "TMG0B72"), false);
});
