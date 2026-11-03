import assert from "node:assert/strict";
import { test } from "node:test";
import { bboxPosicao, textoPosicaoConfirmada } from "./posicao-confirmada.tsx";

test("a frase da posição confirmada traz coordenada e precisão", () => {
  assert.equal(
    textoPosicaoConfirmada(-23.42202, -46.86707, 6.2),
    "Posição confirmada · -23.42202, -46.86707 · precisão 6 m",
  );
  assert.equal(
    textoPosicaoConfirmada(-23.42202, -46.86707, null),
    "Posição confirmada · -23.42202, -46.86707",
  );
});

test("o mapa sem raio de busca fica na rua, com o pino dentro da moldura", () => {
  const box = bboxPosicao(-23.42202, -46.86707, 0.35);
  assert.ok(box.west < -46.86707 && box.east > -46.86707);
  assert.ok(box.south < -23.42202 && box.north > -23.42202);
  assert.ok(box.north - box.south < 0.02);
});
