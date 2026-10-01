import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMoacirRestrito,
  moacirCanSeeAdminPath,
  isBlockedApiForMoacir,
  redactMoacirPayload,
} from "./moacir-escopo.ts";

test("reconhece só o Moacir administrador", () => {
  assert.equal(isMoacirRestrito({ id: 32, name: "Moacir Juvencio", role: "admin", email: "escoltas@torresseguranca.com.br" }), true);
  assert.equal(isMoacirRestrito({ id: 99, name: "Moacir Juvencio", role: "admin", email: "outro@torresseguranca.com.br" }), true);
  assert.equal(isMoacirRestrito({ id: 33, name: "MOACIR JUVENCIO FILHO", role: "funcionario", email: "cpf_00000000000@torresseguranca.local" }), false);
  assert.equal(isMoacirRestrito({ id: 1, name: "Outro Admin", role: "admin", email: "adm@torresseguranca.com.br" }), false);
  assert.equal(isMoacirRestrito(null), false);
});

test("menu do Moacir fica no painel operacional e no próprio perfil", () => {
  assert.equal(moacirCanSeeAdminPath("/admin/operational-grid"), true);
  assert.equal(moacirCanSeeAdminPath("/admin/perfil"), true);
  assert.equal(moacirCanSeeAdminPath("/admin/clients"), false);
  assert.equal(moacirCanSeeAdminPath("/admin/financeiro"), false);
  assert.equal(moacirCanSeeAdminPath("/admin/service-orders"), false);
  assert.equal(moacirCanSeeAdminPath("/admin/dashboard"), false);
});

test("API financeira, de clientes e de encaminhamento fica bloqueada", () => {
  assert.equal(isBlockedApiForMoacir("/api/clients"), true);
  assert.equal(isBlockedApiForMoacir("/api/financial/dre-operacao/10"), true);
  assert.equal(isBlockedApiForMoacir("/api/employees/4/cost-detail"), true);
  assert.equal(isBlockedApiForMoacir("/api/mission/updates/9/forward"), true);
  assert.equal(isBlockedApiForMoacir("/api/service-orders/10/forwards"), false);
  assert.equal(isBlockedApiForMoacir("/api/service-orders"), true);
  assert.equal(isBlockedApiForMoacir("/api/service-orders/10/pdf"), true);
  assert.equal(isBlockedApiForMoacir("/api/service-orders/10"), false);
  assert.equal(isBlockedApiForMoacir("/api/operational-grid"), false);
  assert.equal(isBlockedApiForMoacir("/api/vehicle-tracking"), false);
  assert.equal(isBlockedApiForMoacir("/api/auth/me"), false);
  assert.equal(isBlockedApiForMoacir("/api/mission/updates"), false);
});

test("redige telefone, e-mail e valor sem apagar a OS", () => {
  const redacted = redactMoacirPayload({
    osNumber: "OS-10",
    clientName: "Cliente Operacional",
    km_total: 12,
    faturamento: 1800,
    employee1: { name: "Agente", phone: "21999999999" },
    contactEmail: "cliente@exemplo.com",
    liveCost: { custo_total: 400, horas_missao: 3 },
  });
  assert.equal(redacted.osNumber, "OS-10");
  assert.equal(redacted.clientName, "Cliente Operacional");
  assert.equal(redacted.km_total, 12);
  assert.equal(redacted.faturamento, null);
  assert.equal(redacted.employee1.phone, null);
  assert.equal(redacted.employee1.name, "Agente");
  assert.equal(redacted.contactEmail, null);
  assert.equal(redacted.liveCost.custo_total, null);
  assert.equal(redacted.liveCost.horas_missao, 3);
});
