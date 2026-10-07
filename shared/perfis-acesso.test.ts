import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  resolveActorName,
  INTEGRATION_ACTOR,
  parsePermissions,
  hasPermission,
  canSeePath,
  canSeeAdminPath,
  usesAclMenu,
  DEFAULT_PROFILE_PERMISSIONS,
  canEnterGestaoByCpf,
} from "./perfis-acesso.ts";

const root = path.resolve(import.meta.dirname, "..");

test("resolveActorName: integração quando não há usuário", () => {
  assert.equal(resolveActorName({}), INTEGRATION_ACTOR);
  assert.equal(resolveActorName({ createdBy: null, userName: "" }), INTEGRATION_ACTOR);
});

test("resolveActorName: nome do usuário quando informado", () => {
  assert.equal(resolveActorName({ userName: "Thiago Moreira", createdBy: 1 }), "Thiago Moreira");
});

test("parsePermissions: aceita JSON e array", () => {
  assert.deepEqual(parsePermissions('["relatorio_nf"]'), ["relatorio_nf"]);
  assert.deepEqual(parsePermissions(["invoice_baixa"]), ["invoice_baixa"]);
  assert.deepEqual(parsePermissions("nao-json"), []);
});

test("hasPermission: * libera tudo; financeiro só o que está no perfil", () => {
  assert.equal(hasPermission(["*"], "database"), true);
  assert.equal(hasPermission(DEFAULT_PROFILE_PERMISSIONS.financeiro, "invoice_baixa"), true);
  assert.equal(hasPermission(DEFAULT_PROFILE_PERMISSIONS.financeiro, "database"), false);
});

test("canSeePath: relatório de NF no perfil financeiro", () => {
  assert.equal(canSeePath(DEFAULT_PROFILE_PERMISSIONS.financeiro, "/admin/relatorio-nf"), true);
  assert.equal(canSeePath(DEFAULT_PROFILE_PERMISSIONS.financeiro, "/admin/faturamento"), true);
  assert.equal(canSeePath(DEFAULT_PROFILE_PERMISSIONS.financeiro, "/admin/database"), false);
});

test("comercial: vê telas comerciais e não vê controladoria/RH/sistema", () => {
  assert.equal(usesAclMenu("comercial"), true);
  assert.equal(usesAclMenu("diretoria"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/clients"), true);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/leads"), true);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/patrimonial"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/patrimonial/precificacao"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/patrimonial/proposta"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/service-orders"), true);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/boletim-medicao"), true);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/financeiro"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/employees"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/usuarios"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/faturamento"), false);
  assert.equal(canSeeAdminPath(DEFAULT_PROFILE_PERMISSIONS.comercial, "/admin/perfil"), true);
});

test("cadastro comercial reutiliza perfis_acesso (sem segundo ACL)", () => {
  const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
  const app = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
  const leads = readFileSync(path.join(root, "server/routes/leads.ts"), "utf8");
  assert.match(hr, /ALLOWED_USER_ROLES/);
  assert.match(app, /canSeeAdminPath/);
  assert.match(app, /usesAclMenu/);
  assert.match(leads, /requireComercial/);
  assert.doesNotMatch(leads, /requireAdminRole/);
});

test("gestão por CPF só admin e diretoria; funcionário não entra", () => {
  assert.equal(canEnterGestaoByCpf("admin"), true);
  assert.equal(canEnterGestaoByCpf("diretoria"), true);
  assert.equal(canEnterGestaoByCpf("funcionario"), false);
  assert.equal(canEnterGestaoByCpf("comercial"), false);
  assert.equal(canEnterGestaoByCpf("financeiro"), false);
  assert.equal(canEnterGestaoByCpf(null), false);
  const login = readFileSync(path.join(root, "client/src/pages/admin/login.tsx"), "utf8");
  const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
  assert.match(login, /gestao:\s*loginMode === "interno"/);
  assert.match(login, /looksLikeCpf/);
  assert.match(login, /E-mail ou CPF/);
  assert.match(routes, /canEnterGestaoByCpf/);
  assert.match(routes, /from \"\.\/auth\"/);
  assert.match(routes, /requireAuth, requireAdminRole, requireDiretoria/);
});
