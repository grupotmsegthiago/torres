import { test } from "node:test";
import assert from "node:assert/strict";
import {
  digitsCnpj,
  addressHouseNumber,
  cepBandBounds,
  classifyFoundPoint,
  emptyReasonAfterGeo,
  emptyReasonForUnmatchedCity,
  haversineKm,
  isCepInBand,
  isMunicipalCentroid,
  maxRadiusStepKm,
  catalogPhrase,
  coordinateOrNull,
  noStationMessage,
  pickUsablePoint,
  orderCepsByProximity,
  pickRadiusStep,
  radiusStepForDistance,
  stationGeocodeQuery,
  streetGeocodeQuery,
  estimateDriveMinutes,
  isAnpBaseNotLoaded,
  isDesinterdiction,
  isFuelQualityProcedure,
  isTotalInterdiction,
  latestGasolinaEtanolHref,
  latestPricesByStation,
  parseAnpPriceCsv,
  productKey,
  qualityPhrase,
  rankStations,
  researchWeekLabel,
  summarizeFiscal,
  type StationCandidate,
} from "./anp-onde-abastecer.ts";

const CSV = [
  "Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ da Revenda;Nome da Rua;Numero Rua;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira",
  "SE;SP;São Paulo;POSTO SHELL ANHANGUERA;06.321.359/0001-47;AVENIDA X;100;;CENTRO;01310-100;GASOLINA;01/09/2026;6,19;;R$ / litro;SHELL",
  "SE;SP;São Paulo;POSTO SHELL ANHANGUERA;06.321.359/0001-47;AVENIDA X;100;;CENTRO;01310-100;GASOLINA ADITIVADA;01/09/2026;6,49;;R$ / litro;SHELL",
  "SE;SP;São Paulo;POSTO SHELL ANHANGUERA;06.321.359/0001-47;AVENIDA X;100;;CENTRO;01310-100;ETANOL;01/09/2026;3,79;;R$ / litro;SHELL",
  "SE;SP;São Paulo;POSTO SHELL ANHANGUERA;06.321.359/0001-47;AVENIDA X;100;;CENTRO;01310-100;GASOLINA;08/09/2026;5,89;;R$ / litro;SHELL",
  "SE;SP;São Paulo;POSTO CARO;12.419.940/0004-43;RUA Y;2;;CENTRO;01310-200;GASOLINA;08/09/2026;7,10;;R$ / litro;BRANCA",
  "SE;SP;São Paulo;POSTO CARO;12.419.940/0004-43;RUA Y;2;;CENTRO;01310-200;ETANOL;08/09/2026;4,90;;R$ / litro;BRANCA",
  "SE;SP;São Paulo;POSTO SO GASOLINA;11.111.111/0001-11;RUA Z;3;;CENTRO;01310-300;GASOLINA;08/09/2026;5,00;;R$ / litro;BRANCA",
].join("\n");

function station(partial: Partial<StationCandidate> & Pick<StationCandidate, "cnpj" | "name" | "distanceKm">): StationCandidate {
  return {
    address: null,
    latitude: 0,
    longitude: 0,
    anpScore: null,
    gasolinePrice: null,
    ethanolPrice: null,
    researchDate: null,
    ...partial,
  };
}

test("parser ignora aditivada e fica com o preço mais recente de cada produto", () => {
  const rows = parseAnpPriceCsv("\uFEFF" + CSV);
  assert.equal(rows.length, 6);
  assert.equal(productKey("GASOLINA ADITIVADA"), null);
  const latest = latestPricesByStation(rows);
  const shell = latest.get("06321359000147");
  assert.equal(shell?.gasoline, 5.89);
  assert.equal(shell?.ethanol, 3.79);
  assert.equal(shell?.researchDate, "2026-09-08");
  assert.equal(rows[0].cityNorm, "SAO PAULO");
  assert.equal(digitsCnpj(" 06.321.359/0001-47"), "06321359000147");
  assert.equal(digitsCnpj("1241994000443"), "01241994000443");
  assert.equal(digitsCnpj("12345678901"), null);
});

test("semana da coleta é de domingo a sábado", () => {
  assert.equal(researchWeekLabel("2026-09-01"), "30/08 a 05/09");
});

test("mais em conta exige os dois preços; empate fica com o mais próximo", () => {
  const ranked = rankStations([
    station({ cnpj: "1", name: "Longe barato", distanceKm: 4, gasolinePrice: 5.5, ethanolPrice: 3.5, researchDate: "2026-09-08" }),
    station({ cnpj: "2", name: "Perto caro", distanceKm: 1, gasolinePrice: 6.2, ethanolPrice: 4.2, researchDate: "2026-09-08" }),
    station({ cnpj: "3", name: "Só gasolina", distanceKm: 0.4, gasolinePrice: 4, researchDate: "2026-09-08" }),
    station({ cnpj: "4", name: "Fora do raio", distanceKm: 6, gasolinePrice: 1, ethanolPrice: 1, researchDate: "2026-09-08" }),
    station({
      cnpj: "5",
      name: "Empate mais perto",
      distanceKm: 2,
      gasolinePrice: 5.5,
      ethanolPrice: 3.5,
      researchDate: "2026-09-08",
      anpScore: 5,
    }),
  ]);
  assert.equal(ranked.mode, "priced");
  assert.equal(ranked.stations[0].name, "Empate mais perto");
  assert.equal(ranked.stations[0].qualityPhrase, "Nota ANP 5. Sem infração de qualidade nos últimos 2 anos.");
  assert.equal(ranked.stations[1].name, "Longe barato");
  assert.equal(ranked.stations.at(-1)?.name, "Só gasolina");
  assert.equal(ranked.stations.some((s) => s.name === "Fora do raio"), false);
  assert.equal(estimateDriveMinutes(1.4), 3);
});

test("sem os dois preços o cartão é o mais próximo e não diz mais em conta", () => {
  const ranked = rankStations([
    station({ cnpj: "1", name: "B", distanceKm: 3, gasolinePrice: 5 }),
    station({ cnpj: "2", name: "A", distanceKm: 1.1 }),
  ]);
  assert.equal(ranked.mode, "nearest");
  assert.equal(ranked.message, "Preço desta semana ainda não pesquisado.");
  assert.equal(ranked.stations[0].name, "A");
  assert.equal(ranked.stations[0].qualityPhrase, "Sem infração de qualidade registrada nos últimos 2 anos.");
});

test("infração de qualidade e interdição total", () => {
  assert.equal(isFuelQualityProcedure("Coleta de amostra de Gasolina comum"), false);
  assert.equal(isFuelQualityProcedure("Amostra Prova de Gasolina Reprovada - presença de marcador/solvente"), true);
  assert.equal(isFuelQualityProcedure("Interdição - Etanol fora das especificações - Teor de metanol"), true);
  assert.equal(isFuelQualityProcedure("Amostra Prova de Lubrificante Reprovada - Presença de Éster"), false);
  assert.equal(isTotalInterdiction("Desinterdição total"), false);
  assert.equal(isDesinterdiction("Desinterdição total"), true);
  assert.equal(isTotalInterdiction("Reinterdição total por remover Lacre"), true);

  const flags = summarizeFiscal([
    { cnpj: "06321359000147", date: "2025-01-10", procedure: "Amostra Prova de Gasolina Reprovada - destilação" },
    { cnpj: "06321359000147", date: "2019-01-01", procedure: "Amostra Prova de Gasolina Reprovada - cor" },
    { cnpj: "11111111000111", date: "2024-05-01", procedure: "Interdição total" },
    { cnpj: "11111111000111", date: "2024-06-01", procedure: "Desinterdição total" },
    { cnpj: "22222222000122", date: "2024-06-01", procedure: "Desinterdição total" },
    { cnpj: "22222222000122", date: "2024-07-01", procedure: "Interdição total" },
    { cnpj: "33333333000133", date: "2026-01-01", procedure: "Coleta de amostra de Etanol Hidratado Combustível" },
  ], "2026-11-03");

  assert.equal(flags.get("06321359000147")?.hasQualityInfraction, true);
  assert.equal(flags.has("11111111000111"), false);
  assert.equal(flags.get("22222222000122")?.isInterdicted, true);
  assert.equal(flags.has("33333333000133"), false);
});

test("cidade sem linha com a base nacional vazia é histórico não carregado", () => {
  assert.equal(emptyReasonForUnmatchedCity(0), "not_loaded");
  assert.equal(emptyReasonForUnmatchedCity(5825), "no_station");
});

test("busca do posto usa o endereço, não só o CEP", () => {
  assert.equal(
    stationGeocodeQuery("AVENIDA X, 100 - CENTRO", "São Paulo", "SP"),
    "AVENIDA X, 100 - CENTRO, São Paulo, SP, Brasil",
  );
  assert.equal(stationGeocodeQuery("", null, "SP"), "SP, Brasil");
  assert.equal(
    streetGeocodeQuery("11823", "Avenida Raimundo Pereira de Magalhães", "São Paulo", "SP"),
    "11823 Avenida Raimundo Pereira de Magalhães, São Paulo, SP, Brasil",
  );
});

test("a frase da lista confirma o que está no sistema", () => {
  assert.equal(
    catalogPhrase({ stations: 0, known: 0, inCity: 0 }, null),
    "A lista de postos ainda não está no sistema.",
  );
  assert.equal(
    catalogPhrase({ stations: 5940, known: 5940, inCity: 290 }, "São Paulo"),
    "Lista no sistema: 5.940 postos, 290 em São Paulo.",
  );
  assert.equal(
    catalogPhrase({ stations: 5940, known: 0, inCity: 290 }, "São Paulo"),
    "Lista no sistema: 5.940 postos. Histórico de qualidade ainda não entrou.",
  );
  assert.equal(
    catalogPhrase({ stations: 5940, known: 5940, inCity: 0 }, "Santana de Parnaíba"),
    "Lista no sistema: 5.940 postos. Santana de Parnaíba não tem posto na pesquisa da ANP.",
  );
});

test("coordenada nula não vira o ponto 0,0", () => {
  assert.equal(coordinateOrNull(null), null);
  assert.equal(coordinateOrNull(undefined), null);
  assert.equal(coordinateOrNull(""), null);
  assert.equal(coordinateOrNull("  "), null);
  assert.equal(coordinateOrNull(-23.42202), -23.42202);
  assert.equal(coordinateOrNull("-46.86707"), -46.86707);
});

test("ponto do posto usa o número ou um CEP curto, e não a avenida espalhada", () => {
  const piracema = pickUsablePoint({
    queryHouseNumber: "601",
    stationCep: "06460030",
    hits: [
      { lat: -23.50274, lng: -46.83469, houseNumber: "69", postcode: "06460-030" },
      { lat: -23.50499, lng: -46.83394, houseNumber: "669", postcode: "06460-030" },
      { lat: -23.49816, lng: -46.83054, houseNumber: null, postcode: "06460-030" },
      { lat: -23.50929, lng: -46.83331, houseNumber: null, postcode: "06310-450" },
    ],
  });
  assert.deepEqual(piracema, { lat: -23.50499, lng: -46.83394 });
  const piracemaKm = haversineKm(-23.42202, -46.86707, piracema.lat, piracema.lng);
  assert.ok(piracemaKm > 5 && piracemaKm <= 10, `Piracema a ${piracemaKm} km`);
  assert.equal(radiusStepForDistance(piracemaKm), 10);

  const jussara = pickUsablePoint({
    queryHouseNumber: "1880",
    stationCep: "06465070",
    hits: [
      { lat: -23.51293, lng: -46.81916, houseNumber: null, postcode: "06465-070" },
      { lat: -23.51121, lng: -46.81786, houseNumber: null, postcode: "06465-070" },
      { lat: -23.51234, lng: -46.81733, houseNumber: "1818", postcode: "06465-070" },
    ],
  });
  assert.deepEqual(jussara, { lat: -23.51234, lng: -46.81733 });

  const exact = pickUsablePoint({
    queryHouseNumber: "3926",
    stationCep: "02901000",
    hits: [
      { lat: -23.50691, lng: -46.69558, houseNumber: "3926", postcode: "02910-055" },
      { lat: -23.50757, lng: -46.7026, houseNumber: null, postcode: "05101-100" },
    ],
  });
  assert.deepEqual(exact, { lat: -23.50691, lng: -46.69558 });

  const avenue = pickUsablePoint({
    queryHouseNumber: "11860",
    stationCep: "02938000",
    hits: [
      { lat: -23.46269, lng: -46.72112, houseNumber: null, postcode: "02952-230" },
      { lat: -23.49039, lng: -46.7312, houseNumber: null, postcode: "05145-200" },
      { lat: -23.44067, lng: -46.72103, houseNumber: null, postcode: "02984-035" },
      { lat: -23.40212, lng: -46.72121, houseNumber: null, postcode: "07744-000" },
    ],
  });
  assert.equal(avenue, null);

  const scatteredCep = pickUsablePoint({
    queryHouseNumber: "100",
    stationCep: "02938000",
    hits: [
      { lat: -23.4, lng: -46.7, houseNumber: "10", postcode: "02938-000" },
      { lat: -23.45, lng: -46.75, houseNumber: "9000", postcode: "02938-000" },
    ],
  });
  assert.equal(scatteredCep, null);

  assert.equal(
    pickUsablePoint({
      queryHouseNumber: "5720",
      stationCep: "01001000",
      hits: [{ lat: -23.5475, lng: -46.63611, houseNumber: "5720", postcode: "01001-000" }],
    }),
    null,
  );
});

test("a régua sobe ao menor degrau que já tem posto", () => {
  assert.equal(radiusStepForDistance(4.8), 5);
  assert.equal(radiusStepForDistance(5), 5);
  assert.equal(radiusStepForDistance(8), 10);
  assert.equal(radiusStepForDistance(25), 25);
  assert.equal(radiusStepForDistance(25.1), null);
  assert.equal(pickRadiusStep([12, 4.2, 18]), 5);
  assert.equal(pickRadiusStep([8, 14]), 10);
  assert.equal(pickRadiusStep([30, 40]), null);
  assert.equal(maxRadiusStepKm(), 25);
  assert.equal(noStationMessage(25), "Nenhum posto com histórico limpo em até 25 km.");
  const opened = rankStations([
    station({ cnpj: "6", name: "A 8 km", distanceKm: 8, gasolinePrice: 5.5, ethanolPrice: 3.4, researchDate: "2026-09-08" }),
    station({ cnpj: "7", name: "A 22 km", distanceKm: 22, gasolinePrice: 5, ethanolPrice: 3, researchDate: "2026-09-08" }),
  ], 10);
  assert.equal(opened.stations.length, 1);
  assert.equal(opened.stations[0].name, "A 8 km");
  assert.equal(rankStations([
    station({ cnpj: "6", name: "A 8 km", distanceKm: 8, gasolinePrice: 5.5, ethanolPrice: 3.4 }),
  ]).stations.length, 0);
});

test("o raio vazio só fecha depois que o CEP da faixa foi localizado", () => {
  assert.equal(addressHouseNumber("AVENIDA RAIMUNDO P DE MAGALHAES, 11860 - JD PIRITUBA"), "11860");
  assert.equal(addressHouseNumber("AVENIDA OTAVIANO ALVES DE LIMA, 3926 - NOSSA SRA DO O"), "3926");
  assert.equal(addressHouseNumber("RUA SEM NUMERO - CENTRO"), null);
  assert.equal(isMunicipalCentroid(-23.5475, -46.63611), true);
  assert.equal(
    classifyFoundPoint({
      queryHouseNumber: "11823",
      foundHouseNumber: null,
      lat: -23.4021232,
      lng: -46.721206,
    }),
    "coarse",
  );
  assert.equal(
    classifyFoundPoint({
      queryHouseNumber: "3926",
      foundHouseNumber: "3926",
      lat: -23.5069068,
      lng: -46.6955805,
    }),
    "street",
  );
  assert.equal(
    classifyFoundPoint({
      queryHouseNumber: "5720",
      foundHouseNumber: "5720",
      lat: -23.5475,
      lng: -46.63611,
    }),
    "reject",
  );
  assert.equal(emptyReasonAfterGeo(11), "locating");
  assert.equal(emptyReasonAfterGeo(0), "no_station");
  const ordered = orderCepsByProximity("02939040", ["04506000", "02938000", "02924000"]);
  assert.deepEqual(ordered, ["02938000", "02924000", "04506000"]);
  assert.equal(isCepInBand("02939040", "02901000"), true);
  assert.equal(isCepInBand("02939040", "04506000"), false);
  assert.deepEqual(cepBandBounds("02939040"), { from: "02859040", to: "03019040" });
});

test("base não sincronizada não se confunde com raio vazio ou cidade", () => {
  const row = (
    mode: "priced" | "nearest" | "empty",
    emptyReason: "not_loaded" | "no_city" | "no_station" | "locating" | null,
    message: string | null,
  ) => ({ mode, emptyReason, message });

  assert.equal(isAnpBaseNotLoaded(row("empty", "not_loaded", "Nenhum posto com histórico limpo neste raio.")), true);
  assert.equal(isAnpBaseNotLoaded(row("empty", "no_station", "O histórico de qualidade da ANP ainda não foi carregado.")), false);
  assert.equal(isAnpBaseNotLoaded(row("empty", "no_city", null)), false);
  assert.equal(isAnpBaseNotLoaded(row("empty", "locating", null)), false);
  assert.equal(isAnpBaseNotLoaded(row("empty", null, "O histórico de qualidade da ANP ainda não foi carregado.")), true);
  assert.equal(isAnpBaseNotLoaded(row("empty", null, "Nenhum posto com histórico limpo neste raio.")), false);
  assert.equal(isAnpBaseNotLoaded(null), false);
  assert.equal(isAnpBaseNotLoaded(undefined), false);
  assert.equal(isAnpBaseNotLoaded(row("priced", "not_loaded", "O histórico de qualidade da ANP ainda não foi carregado.")), false);
  assert.equal(isAnpBaseNotLoaded(row("nearest", null, "O histórico de qualidade da ANP ainda não foi carregado.")), false);
});

test("escolhe o arquivo de gasolina e etanol do mês mais novo", () => {
  const html = `
    <a href="https://www.gov.br/anp/x/2026/07-dados-abertos-precos-gasolina-etanol.csv/view">jul</a>
    <a href="/anp/x/2026/09-dados-abertos-precos-2026-09-gasolina-etanol.csv/view">set</a>
    <a href="https://www.gov.br/anp/x/2026/08-dados-abertos-precos-2026-08-diesel-gnv.csv/view">diesel</a>
  `;
  const href = latestGasolinaEtanolHref(html, "https://www.gov.br/anp/x/2026/");
  assert.equal(
    href,
    "https://www.gov.br/anp/x/2026/09-dados-abertos-precos-2026-09-gasolina-etanol.csv/@@download/file",
  );
});
