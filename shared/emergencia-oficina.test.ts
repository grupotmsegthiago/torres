import assert from "node:assert/strict";
import { test } from "node:test";
import { maxRadiusStepKm } from "./anp-onde-abastecer";
import {
  classifyOficina,
  noOficinaMessage,
  oficinaBbox,
  oficinaFromPhoton,
  oficinaFromPlace,
  oficinaTelHref,
  oficinasPayload,
  rankOficinas,
  type OficinaHit,
} from "./emergencia-oficina";

const ORIGIN = { lat: -23.42202, lng: -46.86707 };

function hit(partial: OficinaHit): OficinaHit {
  return partial;
}

test("borracharia e mecânico entram; autopeças, guincho e posto ficam de fora", () => {
  assert.equal(classifyOficina({ name: "Tonhão BORRACHARIA", osmKey: "shop", osmValue: "tyres" }), "borracharia");
  assert.equal(classifyOficina({ name: "Shop Car Pneus", osmKey: "shop", osmValue: "tyres" }), "borracharia");
  assert.equal(classifyOficina({ name: "Borracharia e Guincho", osmKey: "shop", osmValue: "tyres" }), "borracharia");
  assert.equal(classifyOficina({ name: "Mecânica Dory", osmKey: "shop", osmValue: "car_repair" }), "mecanico");
  assert.equal(classifyOficina({ name: "Oficina de Caminhões", osmKey: "shop", osmValue: "car_repair" }), "mecanico");
  assert.equal(classifyOficina({ name: "Auto Peças China", osmKey: "shop", osmValue: "car_parts" }), null);
  assert.equal(classifyOficina({ name: "Guincho 24h", osmKey: "shop", osmValue: "car_repair" }), null);
  assert.equal(classifyOficina({ name: "Posto Shell", osmKey: "amenity", osmValue: "fuel" }), null);
  assert.equal(classifyOficina({ name: "Oficial de Registro de Imóveis", osmKey: "building", osmValue: "yes" }), null);
  assert.equal(classifyOficina({ name: "Loja de Carros", osmKey: "shop", osmValue: "car" }), null);
});

test("a régua para no menor degrau e não usa o centro de São Paulo", () => {
  const ranked = rankOficinas(ORIGIN.lat, ORIGIN.lng, [
    hit({ id: "N:1", name: "Rubinho Pneus", kind: "borracharia", latitude: -23.49357, longitude: -46.84258, address: "Barueri", phone: null }),
    hit({ id: "N:2", name: "Shop Car Pneus", kind: "borracharia", latitude: -23.50991, longitude: -46.88325, address: null, phone: "11999998888" }),
    hit({ id: "W:3", name: "Águia Pneus", kind: "borracharia", latitude: -23.49635, longitude: -46.79137, address: "Osasco", phone: null }),
    hit({ id: "N:4", name: "Centro", kind: "mecanico", latitude: -23.5475, longitude: -46.63611, address: null, phone: null }),
    hit({ id: "N:5", name: "Fora", kind: "mecanico", latitude: 40.7, longitude: -46.8, address: null, phone: null }),
    hit({ id: "N:1", name: "Rubinho Pneus", kind: "borracharia", latitude: -23.49357, longitude: -46.84258, address: "duplicado", phone: null }),
  ]);
  assert.ok(ranked);
  assert.equal(ranked.radiusKm, 10);
  assert.deepEqual(ranked.shops.map((shop) => shop.name), ["Rubinho Pneus", "Shop Car Pneus"]);
  assert.equal(ranked.shops[0].kindLabel, "Borracharia");
  assert.equal(oficinaTelHref(ranked.shops[1].phone), "tel:+5511999998888");
  assert.equal(oficinaTelHref(null), null);
});

test("sem resposta não vira lista vazia", () => {
  const failed = oficinasPayload(ORIGIN.lat, ORIGIN.lng, [], false);
  assert.equal(failed.emptyReason, "search_failed");
  assert.match(failed.message ?? "", /Toque de novo/);
  const empty = oficinasPayload(ORIGIN.lat, ORIGIN.lng, [], true);
  assert.equal(empty.emptyReason, "no_station");
  assert.equal(empty.message, noOficinaMessage(maxRadiusStepKm()));
});

test("o ponto do mapa e o do Photon passam pelo mesmo filtro", () => {
  const photon = oficinaFromPhoton({
    geometry: { coordinates: [-46.8814185, -23.4977542] },
    properties: {
      name: "Tonhão BORRACHARIA",
      osm_type: "N",
      osm_id: 5685289020,
      osm_key: "shop",
      osm_value: "tyres",
      street: "Rua Mar Negro",
      city: "Barueri",
      state: "São Paulo",
      countrycode: "BR",
    },
  });
  assert.equal(photon?.id, "N:5685289020");
  assert.equal(photon?.kind, "borracharia");
  assert.match(photon?.address ?? "", /Rua Mar Negro/);
  assert.equal(oficinaFromPhoton({
    geometry: { coordinates: [-46.88, -23.49] },
    properties: { name: "Auto Peças China", osm_type: "W", osm_id: 1, osm_key: "shop", osm_value: "car_parts", countrycode: "BR" },
  }), null);

  const place = oficinaFromPlace({
    placeId: "abc",
    name: "Oficina Mecânica Armando",
    lat: -23.45,
    lng: -46.86,
    vicinity: "Rua A, 10",
    types: ["car_repair", "point_of_interest"],
  });
  assert.equal(place?.kind, "mecanico");
  assert.equal(place?.id, "g:abc");
  assert.equal(oficinaFromPlace({
    placeId: "fechado",
    name: "Borracharia Fechada",
    lat: -23.45,
    lng: -46.86,
    businessStatus: "CLOSED_PERMANENTLY",
  }), null);

  const box = oficinaBbox(ORIGIN.lat, ORIGIN.lng, 10);
  assert.ok(box.west < ORIGIN.lng && box.east > ORIGIN.lng);
  assert.ok(box.south < ORIGIN.lat && box.north > ORIGIN.lat);
});
