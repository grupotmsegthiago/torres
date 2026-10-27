import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fuelingKmSaltoAlert,
  shouldSendFuelingTrackerReminder,
  shouldShowFuelingReminder,
} from "./fueling-km-salto";

test("salto até 500 km não pede confirmação", () => {
  assert.equal(fuelingKmSaltoAlert(20500, 20000, false), null);
});

test("salto acima de 500 km sem confirmação devolve o alerta", () => {
  const r = fuelingKmSaltoAlert(20600, 20000, false);
  assert.ok(r);
  assert.equal(r!.code, "salto_km");
  assert.equal(r!.delta, 600);
  assert.match(r!.message, /20600/);
  assert.match(r!.message, /600 km/);
  assert.match(r!.message, /20000/);
});

test("salto acima de 500 km com confirmação segue", () => {
  assert.equal(fuelingKmSaltoAlert(20600, 20000, true), null);
});

test("lembrete do app aparece quando a missão não tem abastecimento na data ou depois", () => {
  assert.equal(shouldShowFuelingReminder({
    hasRecentMission: true,
    missionDate: "2026-10-05",
    lastFuelingDate: "2026-10-04",
  }), true);
  assert.equal(shouldShowFuelingReminder({
    hasRecentMission: true,
    missionDate: "2026-10-05",
    lastFuelingDate: "2026-10-05",
  }), false);
  assert.equal(shouldShowFuelingReminder({
    hasRecentMission: false,
    missionDate: "2026-10-05",
    lastFuelingDate: null,
  }), false);
});

test("rastreador só avisa com missão ativa, mais de 400 km e sem abastecimento na OS", () => {
  assert.equal(shouldSendFuelingTrackerReminder({ missionActive: true, kmDriven: 401, hasFuelingOnMission: false }), true);
  assert.equal(shouldSendFuelingTrackerReminder({ missionActive: true, kmDriven: 400, hasFuelingOnMission: false }), false);
  assert.equal(shouldSendFuelingTrackerReminder({ missionActive: true, kmDriven: 800, hasFuelingOnMission: true }), false);
  assert.equal(shouldSendFuelingTrackerReminder({ missionActive: false, kmDriven: 800, hasFuelingOnMission: false }), false);
});
