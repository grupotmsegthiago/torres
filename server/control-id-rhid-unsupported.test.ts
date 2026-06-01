import { test } from "node:test";
import assert from "node:assert/strict";
import { RhidUnsupportedError } from "./control-id.ts";

// O catch de processRhidQueueItem decide "unsupported vs retry" via `instanceof
// RhidUnsupportedError`. Estes testes blindam esse contrato: se alguém trocar a
// classe por uma string de erro ou parar de estender Error, o branch quebra e a
// fila volta a dar spam de 404 em update/delete.

test("RhidUnsupportedError é instância de Error", () => {
  const e = new RhidUnsupportedError("AFD append-only");
  assert.ok(e instanceof Error);
  assert.ok(e instanceof RhidUnsupportedError);
});

test("RhidUnsupportedError carrega name e message", () => {
  const e = new RhidUnsupportedError("não dá pra editar");
  assert.equal(e.name, "RhidUnsupportedError");
  assert.equal(e.message, "não dá pra editar");
});

test("RhidUnsupportedError é distinguível de Error comum no catch", () => {
  const comum: unknown = new Error("timeout");
  const unsup: unknown = new RhidUnsupportedError("append-only");
  assert.equal(comum instanceof RhidUnsupportedError, false);
  assert.equal(unsup instanceof RhidUnsupportedError, true);
});
