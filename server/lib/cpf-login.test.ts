import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cleanCpfDigits,
  formatCpfMasked,
  isSyntheticCpfEmail,
  isValidCpfDigits,
  parseCpfFromSyntheticEmail,
  syntheticCpfEmail,
} from "./cpf-login";

const root = path.resolve(import.meta.dirname, "../..");

describe("cpf-login helpers", () => {
  it("normaliza CPF e e-mail sintético", () => {
    assert.equal(cleanCpfDigits("104.218.438-02"), "10421843802");
    assert.equal(isValidCpfDigits("10421843802"), true);
    assert.equal(isValidCpfDigits("141.218.438-02"), true);
    assert.equal(isValidCpfDigits("123"), false);
    assert.equal(formatCpfMasked("10421843802"), "104.218.438-02");
    assert.equal(syntheticCpfEmail("104.218.438-02"), "cpf_10421843802@torresseguranca.local");
    assert.equal(parseCpfFromSyntheticEmail("cpf_14121843802@torresseguranca.local"), "14121843802");
    assert.equal(isSyntheticCpfEmail("cpf_10421843802@torresseguranca.local"), true);
    assert.equal(isSyntheticCpfEmail("admin@torresseguranca.com.br"), false);
  });
});

describe("cpf-login contratos de fonte", () => {
  it("PATCH /api/users aceita CPF e usa applySyntheticCpfEmailChange", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.match(hr, /app\.patch\("\/api\/users\/:id"/);
    assert.match(hr, /applySyntheticCpfEmailChange/);
    assert.match(hr, /cpfRaw|cleanCpf|cpf/);
  });

  it("PATCH employees sincroniza login sintético quando o CPF muda", () => {
    const emp = readFileSync(path.join(root, "server/routes/employees.ts"), "utf8");
    assert.match(emp, /syncLinkedUserSyntheticEmail/);
  });

  it("UI de usuários permite editar login de CPF", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/users.tsx"), "utf8");
    assert.match(ui, /formLogin/);
    assert.match(ui, /isCpfLogin/);
    assert.match(ui, /data-testid="input-user-login"/);
    assert.doesNotMatch(
      ui,
      /value=\{getLoginFromEmail\(editingUser\.email\)\}\s*\n\s*disabled/,
    );
  });
});
