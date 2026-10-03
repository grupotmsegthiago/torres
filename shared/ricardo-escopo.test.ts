import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isRicardoSemFinanceiro,
  ricardoCanSeeAdminPath,
  isBlockedApiForRicardo,
} from "./ricardo-escopo.ts";

test("reconhece só o Ricardo Tadeu administrador ativo", () => {
  assert.equal(
    isRicardoSemFinanceiro({
      id: 46,
      name: "RICARDO TADEU BEZERRA PEREIRA",
      role: "admin",
      email: "cpf_08741582730@torresseguranca.local",
    }),
    true,
  );
  assert.equal(
    isRicardoSemFinanceiro({
      id: 99,
      name: "RICARDO TADEU BEZERRA PEREIRA",
      role: "admin",
      email: "outro@torresseguranca.com.br",
    }),
    true,
  );
  assert.equal(
    isRicardoSemFinanceiro({
      id: 46,
      name: "RICARDO TADEU BEZERRA PEREIRA",
      role: "funcionario",
      email: "cpf_08741582730@torresseguranca.local",
    }),
    false,
  );
  assert.equal(
    isRicardoSemFinanceiro({
      id: 14,
      name: "RICARDO TADEU BEZERRA PEREIRA",
      role: "funcionario",
      email: "thiiagomoreiira87@gmail.com",
    }),
    false,
  );
  assert.equal(
    isRicardoSemFinanceiro({
      id: 14,
      name: "DESATIVADO TADEU BEZERRA PEREIRA",
      role: "admin",
      email: "thiiagomoreiira87@gmail.com",
    }),
    false,
  );
  assert.equal(
    isRicardoSemFinanceiro({ id: 1, name: "Outro Admin", role: "admin", email: "adm@torresseguranca.com.br" }),
    false,
  );
  assert.equal(isRicardoSemFinanceiro(null), false);
});

test("esconde controladoria e deixa operação", () => {
  assert.equal(ricardoCanSeeAdminPath("/admin/operational-grid"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/service-orders"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/boletim-medicao"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/clients"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/employees"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/dashboard"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/relatorio-faturamento"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/perfil"), true);
  assert.equal(ricardoCanSeeAdminPath("/admin/financeiro"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/balanco-gerencial"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/relatorio-nf"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/faturamento"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/custos-fixos"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/fornecedores"), false);
  assert.equal(ricardoCanSeeAdminPath("/admin/database"), false);
});

test("auth e create-app aplicam o recorte financeiro só deste usuário", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const auth = readFileSync(path.join(root, "server/auth.ts"), "utf8");
  const app = readFileSync(path.join(root, "server/create-app.ts"), "utf8");
  const layout = readFileSync(path.join(root, "client/src/components/admin/layout.tsx"), "utf8");
  const routes = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
  assert.match(auth, /isRicardoSemFinanceiro/);
  assert.match(auth, /canActAsFinanceiro/);
  assert.match(app, /ricardoEscopoGuard/);
  assert.match(layout, /isRicardoSemFinanceiro/);
  assert.match(routes, /ricardoCanSeeAdminPath/);
});

test("bloqueia APIs financeiras e libera operação", () => {
  assert.equal(isBlockedApiForRicardo("/api/service-orders"), false);
  assert.equal(isBlockedApiForRicardo("/api/clients"), false);
  assert.equal(isBlockedApiForRicardo("/api/employees"), false);
  assert.equal(isBlockedApiForRicardo("/api/operational-grid"), false);
  assert.equal(isBlockedApiForRicardo("/api/auth/me"), false);
  assert.equal(isBlockedApiForRicardo("/api/escort/billings"), false);
  assert.equal(isBlockedApiForRicardo("/api/relatorios/horas-trabalhadas"), false);

  assert.equal(isBlockedApiForRicardo("/api/financial/transactions"), true);
  assert.equal(isBlockedApiForRicardo("/api/financial/dashboard"), true);
  assert.equal(isBlockedApiForRicardo("/api/financeiro/resumo-diretoria"), true);
  assert.equal(isBlockedApiForRicardo("/api/invoices"), true);
  assert.equal(isBlockedApiForRicardo("/api/balanco/tco"), true);
  assert.equal(isBlockedApiForRicardo("/api/relatorio-nf"), true);
  assert.equal(isBlockedApiForRicardo("/api/asaas/payments"), true);
  assert.equal(isBlockedApiForRicardo("/api/controle-faturamento"), true);
});
