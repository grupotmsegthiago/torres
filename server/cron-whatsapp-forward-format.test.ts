import { test } from "node:test";
import assert from "node:assert/strict";
import { cidadeFromAddr, rotaCidades, parseCoord, mapsLink, pickCoords } from "./cron-whatsapp-forward.js";

test("cidadeFromAddr: extrai cidade de endereço completo (Cidade - UF, Brasil)", () => {
  assert.equal(
    cidadeFromAddr("Multilog Clia Campinas - Rodovia Anhanguera - Boa Vista, Campinas - SP, Brasil"),
    "Campinas",
  );
  assert.equal(
    cidadeFromAddr("Terra Nova Logística | Matriz - Avenida X - Centro, Barueri - SP, Brasil"),
    "Barueri",
  );
});

test("cidadeFromAddr: UF minúscula não casa o padrão, cai no fallback (último segmento)", () => {
  // "sp" minúsculo não casa /- [A-Z]{2}$/; fallback = último segmento ignorando Brasil.
  assert.equal(cidadeFromAddr("Rua A, Santos - sp, Brasil"), "Santos - sp");
});

test("cidadeFromAddr: sem 'Brasil' no fim ainda extrai a cidade", () => {
  assert.equal(cidadeFromAddr("Av. Paulista, 1000, São Paulo - SP"), "São Paulo");
});

test("cidadeFromAddr: endereço parcial (sem UF) usa último segmento", () => {
  assert.equal(cidadeFromAddr("Centro, Jundiaí"), "Jundiaí");
  assert.equal(cidadeFromAddr("Sorocaba"), "Sorocaba");
});

test("cidadeFromAddr: vazio/nulo retorna ''", () => {
  assert.equal(cidadeFromAddr(""), "");
  assert.equal(cidadeFromAddr(null), "");
  assert.equal(cidadeFromAddr(undefined), "");
});

test("rotaCidades: monta 'Origem → Destino' por cidade", () => {
  assert.equal(
    rotaCidades(
      "Multilog Clia Campinas - Rodovia Anhanguera - Boa Vista, Campinas - SP, Brasil",
      "Terra Nova Logística - Centro, Barueri - SP, Brasil",
    ),
    "Campinas → Barueri",
  );
});

test("rotaCidades: cai pro endereço cru quando não dá pra extrair cidade", () => {
  assert.equal(rotaCidades("Pátio interno", "Doca 3"), "Pátio interno → Doca 3");
});

test("rotaCidades: só um lado preenchido retorna esse lado, sem seta", () => {
  assert.equal(rotaCidades("Campinas - SP, Brasil", null), "Campinas");
  assert.equal(rotaCidades(null, "Barueri - SP, Brasil"), "Barueri");
});

test("rotaCidades: ambos vazios retorna ''", () => {
  assert.equal(rotaCidades(null, null), "");
  assert.equal(rotaCidades("", ""), "");
});

test("parseCoord: aceita number e string; rejeita ausente/inválido", () => {
  assert.equal(parseCoord(-23.5), -23.5);
  assert.equal(parseCoord("-23.5"), -23.5);
  assert.ok(Number.isNaN(parseCoord(null)));
  assert.ok(Number.isNaN(parseCoord(undefined)));
  assert.ok(Number.isNaN(parseCoord("")));
  assert.ok(Number.isNaN(parseCoord("abc")));
});

test("mapsLink: monta link do Google Maps com 4 casas decimais", () => {
  assert.equal(
    mapsLink(-23.123456, -46.987654),
    "https://www.google.com/maps?q=-23.1235,-46.9877&z=17&hl=pt-BR",
  );
});

test("pickCoords: escolhe o primeiro candidato válido na ordem de prioridade", () => {
  // 1º candidato (GPS da própria update) tem prioridade.
  assert.deepEqual(
    pickCoords({ lat: -23.5, lng: -46.6 }, { lat: -10, lng: -10 }),
    { lat: -23.5, lng: -46.6 },
  );
  // 1º sem coords → cai pro 2º (fallback de rastreamento).
  assert.deepEqual(
    pickCoords({ lat: null, lng: null }, { lat: "-23.5", lng: "-46.6" }),
    { lat: -23.5, lng: -46.6 },
  );
  // Coordenada incompleta (só lat) não conta.
  assert.deepEqual(
    pickCoords({ lat: -23.5, lng: null }, { lat: -10, lng: -20 }),
    { lat: -10, lng: -20 },
  );
});

test("pickCoords: nenhum candidato válido retorna null", () => {
  assert.equal(pickCoords(null, undefined, { lat: null, lng: null }, { lat: "", lng: "" }), null);
});
