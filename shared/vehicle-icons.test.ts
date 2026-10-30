import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vehicleIconSrc,
  inferVehicleIcon,
  resolveVehicleIcon,
  painelEscoltaThumb,
  rotuloModeloPainel,
  rotuloVtr,
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

test("rotulo do painel: modelo curto e VTR do kit quando a frota está vazia", () => {
  assert.equal(rotuloModeloPainel("MOBI LIKE"), "Mobi");
  assert.equal(rotuloModeloPainel("POLO TRACK MA"), "Polo");
  assert.equal(rotuloModeloPainel("VIRTUS MB"), "Virtus");
  assert.equal(rotuloVtr(null, "KIT TORRES - 01 - UGL7E48"), "VTR-01");
  assert.equal(rotuloVtr("12", null), "VTR-12");
  assert.equal(rotuloVtr(null, null), null);
});

test("painelEscoltaThumb segue o modelo do cadastro, inclusive Virtus gravado como polo", () => {
  assert.equal(painelEscoltaThumb("MOBI"), "/assets/escolta-mobi.png");
  assert.equal(painelEscoltaThumb("MOBI LIKE"), "/assets/escolta-mobi.png");
  assert.equal(painelEscoltaThumb("POLO TRACK"), "/assets/escolta-polo.png");
  assert.equal(painelEscoltaThumb("POLO TRACK MA"), "/assets/escolta-polo.png");
  assert.equal(painelEscoltaThumb("VIRTUS MB"), "/assets/escolta-virtus.png");
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
