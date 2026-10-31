import assert from "node:assert/strict";
import { test } from "node:test";
import { coordNoBrasil, pontosDaRota } from "./mapa-rota-os.ts";

test("coordenada fora do Brasil não entra no mapa", () => {
  assert.equal(coordNoBrasil(0, 0), false);
  assert.equal(coordNoBrasil(40, -46), false);
  assert.equal(coordNoBrasil(-23.96, -46.33), true);
});

test("a rota usa origem, destino e a viatura quando a coordenada vale", () => {
  assert.deepEqual(pontosDaRota({
    origemLat: -23.9,
    origemLng: -46.4,
    destinoLat: null,
    destinoLng: null,
    posLat: 0,
    posLng: 0,
  }), [
    { lat: -23.9, lng: -46.4, papel: "origem" },
  ]);
});

test("os três pontos entram na ordem origem, destino e viatura", () => {
  const pontos = pontosDaRota({
    origemLat: "-23.90",
    origemLng: "-46.40",
    destinoLat: -23.7,
    destinoLng: -46.5,
    posLat: -23.8,
    posLng: -46.45,
  });
  assert.deepEqual(pontos.map((p) => p.papel), ["origem", "destino", "viatura"]);
});
