import { test } from "node:test";
import assert from "node:assert/strict";
import {
  digitsCnpj,
  estimateDriveMinutes,
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
