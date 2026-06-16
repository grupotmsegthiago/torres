import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditTransactionDocs } from "./escort";

// Regra (decisão do dono 16/06/2026): admin comum só altera anexos
// (boleto/NF/comprovante) de lançamentos que ele mesmo criou; a Diretoria
// altera os de qualquer pessoa. created_by é o NOME do usuário (text).

test("Diretoria edita anexo de qualquer pessoa", () => {
  assert.equal(
    canEditTransactionDocs({ role: "diretoria", name: "Thiago" }, { created_by: "Maria" }),
    true,
  );
});

test("Diretoria edita mesmo com created_by nulo (registro antigo)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "diretoria", name: "Thiago" }, { created_by: null }),
    true,
  );
});

test("Admin comum edita o que ele mesmo criou", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: "Maria" }, { created_by: "Maria" }),
    true,
  );
});

test("Admin comum NÃO edita anexo de outra pessoa", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: "Maria" }, { created_by: "João" }),
    false,
  );
});

test("Admin comum NÃO edita quando created_by é nulo (fail-closed)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: "Maria" }, { created_by: null }),
    false,
  );
});

test("Admin comum sem nome NÃO edita (fail-closed)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: null }, { created_by: "Maria" }),
    false,
  );
});

test("user/existing nulos não quebram (fail-closed)", () => {
  assert.equal(canEditTransactionDocs(null, null), false);
  assert.equal(canEditTransactionDocs(undefined, { created_by: "Maria" }), false);
});
