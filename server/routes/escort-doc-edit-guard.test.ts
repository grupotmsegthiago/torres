import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditTransactionDocs } from "./escort";

// Regra (decisão do dono 20/06/2026): QUALQUER pessoa do administrativo
// (role "admin" ou "diretoria") pode alterar anexos (boleto/NF/comprovante) de
// qualquer lançamento, independentemente de quem criou. As rotas já exigem
// requireAdminRole, então funcionário comum nunca chega aqui. O created_by
// (segundo parâmetro) não é mais usado na decisão.

test("Diretoria edita anexo de qualquer pessoa", () => {
  assert.equal(
    canEditTransactionDocs({ role: "diretoria", name: "Thiago" }, { created_by: "Maria" }),
    true,
  );
});

test("Admin edita anexo de qualquer pessoa (não precisa ter criado)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: "Maria" }, { created_by: "João" }),
    true,
  );
});

test("Admin edita mesmo com created_by nulo (registro antigo)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "admin", name: "Maria" }, { created_by: null }),
    true,
  );
});

test("Funcionário comum NÃO edita anexo (fail-closed)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "funcionario", name: "Maria" }, { created_by: "Maria" }),
    false,
  );
});

test("Usuário sem papel NÃO edita (fail-closed)", () => {
  assert.equal(
    canEditTransactionDocs({ role: null, name: "Maria" }, { created_by: "Maria" }),
    false,
  );
});

test("Papel desconhecido NÃO edita (fail-closed)", () => {
  assert.equal(
    canEditTransactionDocs({ role: "supervisor", name: "Maria" }, { created_by: "Maria" }),
    false,
  );
});

test("user/existing nulos não quebram (fail-closed)", () => {
  assert.equal(canEditTransactionDocs(null, null), false);
  assert.equal(canEditTransactionDocs(undefined, { created_by: "Maria" }), false);
});
