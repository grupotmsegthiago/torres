import { test } from "node:test";
import assert from "node:assert/strict";
import { faixaDaLista, hospitalFromGoogle, juntarApoio, mesmoEstabelecimento, postoFromGoogle, textoFonte } from "./apoio-lista";
import { oficinaFromPlace } from "./emergencia-oficina";

const origem = { lat: -23.42, lng: -46.87 };

test("a ANP fica na frente e o Google novo entra no degrau seguinte", () => {
  const anp = [{ name: "Posto Shell", latitude: -23.43, longitude: -46.87, distanceKm: 1.2, source: "ANP" }];
  const google = [
    { name: "Posto Shell", latitude: -23.431, longitude: -46.871, distanceKm: 1.3, source: "Google" },
    { name: "Auto Posto Novo", latitude: -23.50, longitude: -46.90, distanceKm: 12, source: "Google" },
  ];
  const lista = juntarApoio(anp, google, 5);
  assert.equal(lista.itens[0].source, "ANP");
  assert.equal(lista.itens.length, 2);
  assert.equal(lista.itens[1].name, "Auto Posto Novo");
  assert.equal(lista.radiusKm, 15);
});

test("sem lista oficial o degrau sai do Google", () => {
  const google = [{ name: "Posto da Rua", latitude: -23.45, longitude: -46.88, distanceKm: 4, source: "Google" }];
  const lista = juntarApoio([], google, null);
  assert.equal(lista.radiusKm, 5);
  assert.equal(lista.itens.length, 1);
  assert.equal(textoFonte(lista.itens[0].source, "ANP"), "Fonte: Google");
});

test("o mesmo ponto não duplica e o posto do Google não inventa nota da ANP", () => {
  assert.equal(mesmoEstabelecimento(
    { name: "Posto Ipiranga", latitude: -23.42, longitude: -46.87 },
    { name: "Auto Posto Ipiranga", latitude: -23.421, longitude: -46.871 },
  ), true);
  const posto = postoFromGoogle({
    placeId: "abc",
    name: "Posto da Esquina",
    lat: origem.lat,
    lng: origem.lng,
  }, origem.lat, origem.lng);
  assert.equal(posto?.source, "Google");
  assert.match(posto?.qualityPhrase ?? "", /Sem nota da ANP/);
  assert.equal(posto?.priced, false);
});

test("hospital do Google fica fora da lista do Ministério e a dica da busca classifica a oficina", () => {
  const hospital = hospitalFromGoogle({
    placeId: "h1",
    name: "Hospital da Vila",
    lat: origem.lat,
    lng: origem.lng,
    vicinity: "Rua 1",
  }, origem.lat, origem.lng);
  assert.match(hospital?.categoryPhrase ?? "", /Google/);
  assert.equal(faixaDaLista(5, []), 5);
  const oficina = oficinaFromPlace({
    placeId: "of1",
    name: "Centro Automotivo Paulista",
    lat: origem.lat,
    lng: origem.lng,
  }, "borracharia");
  assert.equal(oficina?.kind, "borracharia");
  assert.equal(oficinaFromPlace({
    placeId: "g1",
    name: "Guincho Rápido",
    lat: origem.lat,
    lng: origem.lng,
  }, "borracharia"), null);
});
