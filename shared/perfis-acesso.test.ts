import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveActorName,
  INTEGRATION_ACTOR,
  parsePermissions,
  hasPermission,
  canSeePath,
  DEFAULT_PROFILE_PERMISSIONS,
} from "./perfis-acesso.ts";

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
  assert.equal(canSeePath(DEFAULT_PROFILE_PERMISSIONS.financeiro, "/admin/database"), false);
});
