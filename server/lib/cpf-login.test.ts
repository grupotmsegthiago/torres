import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cleanCpfDigits,
  formatCpfMasked,
  isEnforceableEmployeeCpf,
  isPlaceholderEmployeeCpf,
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

  it("distingue CPF placeholder de CPF real para unicidade", () => {
    assert.equal(isPlaceholderEmployeeCpf("000.000.000-00"), true);
    assert.equal(isPlaceholderEmployeeCpf("000.000.000-24"), true);
    assert.equal(isPlaceholderEmployeeCpf("781.119.275-68"), false);
    assert.equal(isEnforceableEmployeeCpf("000.000.000-00"), false);
    assert.equal(isEnforceableEmployeeCpf("781.119.275-68"), true);
    assert.equal(isEnforceableEmployeeCpf("123"), false);
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

  it("POST/PATCH employees bloqueiam CPF duplicado via findEmployeeCpfConflict", () => {
    const emp = readFileSync(path.join(root, "server/routes/employees.ts"), "utf8");
    assert.match(emp, /findEmployeeCpfConflict/);
    assert.match(emp, /isEnforceableEmployeeCpf/);
    assert.match(emp, /Já existe funcionário com este CPF/);
    assert.match(emp, /status\(409\)/);
  });

  it("boot SQL garante índice único parcial de CPF em employees", () => {
    const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    assert.match(routes, /uniq_employees_cpf_digits/);
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
