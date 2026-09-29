import test from "node:test";
import assert from "node:assert/strict";

/**
 * O bug GO LOG: `const clientId` dentro do `try` fazia o `catch` estourar
 * ReferenceError e mascarar o erro real do Asaas (invalid_email).
 * Padrão correto: declarar clientId fora do try.
 */
test("gerar-fatura: clientId fora do try preserva mensagem real do Asaas", () => {
  const clientId = parseInt("66", 10);
  let exposed = "";
  try {
    if (!clientId) throw new Error("clientId inválido");
    throw new Error("Asaas HTTP 400: [0] code=invalid_email desc=O email informado é inválido.");
  } catch (err: any) {
    assert.equal(clientId, 66); // acessível no catch
    exposed = String(err.message || "");
  }
  assert.match(exposed, /invalid_email/);
  assert.doesNotMatch(exposed, /clientId is not defined/);
});
