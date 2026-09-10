import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vehicleIconSrc,
  inferVehicleIcon,
  resolveVehicleIcon,
  vehicleRequiresInsuranceDocs,
  isMobiInsuranceIncomplete,
  VEHICLE_ICON_OPTIONS,
} from "./vehicle-icons.ts";

test("vehicleIconSrc: polo, kwid e mobi", () => {
  assert.equal(vehicleIconSrc("polo"), "/polo-icon.webp");
  assert.equal(vehicleIconSrc("kwid"), "/kwid-icon.png");
  assert.equal(vehicleIconSrc("mobi"), "/mobi-icon.webp");
  assert.equal(vehicleIconSrc(null), "/polo-icon.webp");
});

test("inferVehicleIcon: FIAT / MOBI", () => {
  assert.equal(inferVehicleIcon("FIAT", "MOBI"), "mobi");
  assert.equal(inferVehicleIcon("Fiat", "Mobi Like"), "mobi");
  assert.equal(inferVehicleIcon("", "MOBI"), "mobi");
  assert.equal(inferVehicleIcon("VW", "POLO TRACK"), "polo");
});

test("resolveVehicleIcon: Mobi com icon_type default polo usa marca/modelo", () => {
  assert.equal(resolveVehicleIcon("polo", "FIAT", "MOBI"), "mobi");
  assert.equal(vehicleIconSrc("polo", "Fiat", "Mobi Like"), "/mobi-icon.webp");
  assert.equal(resolveVehicleIcon("mobi", "VW", "POLO TRACK"), "mobi");
  assert.equal(resolveVehicleIcon("polo", "VW", "POLO TRACK"), "polo");
});

test("vehicleRequiresInsuranceDocs: só MOBI", () => {
  assert.equal(vehicleRequiresInsuranceDocs("mobi", "FIAT", "MOBI"), true);
  assert.equal(vehicleRequiresInsuranceDocs("polo", "FIAT", "MOBI"), true);
  assert.equal(vehicleRequiresInsuranceDocs("polo", "VW", "POLO TRACK"), false);
  assert.equal(vehicleRequiresInsuranceDocs("kwid", "RENAULT", "KWID"), false);
});

test("isMobiInsuranceIncomplete: MOBI vermelho sem apólice ou contrato; Polo nunca", () => {
  assert.equal(isMobiInsuranceIncomplete({
    iconType: "mobi", brand: "FIAT", model: "MOBI",
  }), true);
  assert.equal(isMobiInsuranceIncomplete({
    iconType: "mobi", brand: "FIAT", model: "MOBI",
    insurancePolicyFile: "1/apolice.pdf",
  }), true);
  assert.equal(isMobiInsuranceIncomplete({
    iconType: "mobi", brand: "FIAT", model: "MOBI",
    insurancePolicyFile: "1/apolice.pdf",
    insuranceContractFile: "1/contrato.pdf",
  }), false);
  assert.equal(isMobiInsuranceIncomplete({
    iconType: "polo", brand: "VW", model: "POLO TRACK",
  }), false);
});

test("Fiat Mobi tem adesivagem nas 4 vistas", () => {
  const mobi = VEHICLE_ICON_OPTIONS.find((o) => o.key === "mobi");
  assert.ok(mobi?.wrap?.front);
  assert.ok(mobi?.wrap?.left);
  assert.ok(mobi?.wrap?.rear);
  assert.ok(mobi?.wrap?.right);
});
