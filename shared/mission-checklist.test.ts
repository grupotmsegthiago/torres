import { test } from "node:test";
import assert from "node:assert/strict";
import { VEHICLE_CHECKLIST_ITEMS, checklistViaturaObrigatorio } from "./mission-checklist";

const HOJE = "2026-10-01";

test("checklist da viatura inclui água, óleo, estepe e chave de roda", () => {
  const ids = VEHICLE_CHECKLIST_ITEMS.map((item) => item.id);
  assert.ok(ids.includes("agua"));
  assert.ok(ids.includes("oleo"));
  assert.ok(ids.includes("estepe"));
  assert.ok(ids.includes("chave_roda"));
  assert.ok(ids.includes("macaco"));
  assert.ok(ids.includes("triangulo"));
});

test("agendada cobra o checklist mesmo quando já houve outra OS no dia", () => {
  const obrigatorio = checklistViaturaObrigatorio({
    priority: "agendada",
    osId: 2,
    hoje: HOJE,
    outras: [{ id: 1, missionStartedAt: "2026-10-01T11:00:00Z" }],
  });
  assert.equal(obrigatorio, true);
});

test("imediata cobra na primeira OS do dia", () => {
  const obrigatorio = checklistViaturaObrigatorio({
    priority: "imediata",
    osId: 2,
    hoje: HOJE,
    outras: [{ id: 1, missionStartedAt: "2026-09-30T11:00:00Z" }],
  });
  assert.equal(obrigatorio, true);
});

test("imediata não cobra quando outra OS já saiu da base no mesmo dia", () => {
  const obrigatorio = checklistViaturaObrigatorio({
    priority: "imediata",
    osId: 2,
    hoje: HOJE,
    outras: [{
      id: 1,
      stepLogs: [{ step: "checkout_viatura", completedAt: "2026-10-01T12:00:00Z" }],
    }],
  });
  assert.equal(obrigatorio, false);
});

test("a própria OS já iniciada continua cobrando o checklist no retorno", () => {
  const obrigatorio = checklistViaturaObrigatorio({
    priority: "imediata",
    osId: 5,
    hoje: HOJE,
    outras: [{ id: 5, missionStartedAt: "2026-10-01T15:00:00Z" }],
  });
  assert.equal(obrigatorio, true);
});

test("abrir outra OS sem sair da base não dispensa o checklist da imediata", () => {
  const obrigatorio = checklistViaturaObrigatorio({
    priority: "imediata",
    osId: 2,
    hoje: HOJE,
    outras: [{
      id: 1,
      stepLogs: [{ step: "aguardando", completedAt: "2026-10-01T12:00:00Z" }],
    }],
  });
  assert.equal(obrigatorio, true);
});
