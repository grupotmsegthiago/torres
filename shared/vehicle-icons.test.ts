import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vehicleIconSrc,
  inferVehicleIcon,
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
  assert.equal(inferVehicleIcon("VW", "POLO TRACK"), "polo");
});

test("Fiat Mobi tem adesivagem nas 4 vistas", () => {
  const mobi = VEHICLE_ICON_OPTIONS.find((o) => o.key === "mobi");
  assert.ok(mobi?.wrap?.front);
  assert.ok(mobi?.wrap?.left);
  assert.ok(mobi?.wrap?.rear);
  assert.ok(mobi?.wrap?.right);
});
