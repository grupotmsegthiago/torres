import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptHospitalPin,
  formatHospitalPinList,
  hospitalCare,
  hospitalCatalogPhrase,
  hospitalCategoryPhrase,
  hospitalGeocodeQuery,
  hospitalStreetQuery,
  pickHospitalPoint,
  hospitalPhoneDigits,
  noHospitalMessage,
  parseCnesHospitalCsv,
  parseHospitalPinList,
  rankHospitals,
} from "./hospitais-cnes";

const CITIES = {
  "355030": ["São Paulo", "SP"],
} as const;

const CSV = [
  "CO_CNES;TP_UNIDADE;CO_IBGE;NO_RAZAO_SOCIAL;NO_FANTASIA;CO_CEP;NO_LOGRADOURO;NU_ENDERECO;NO_BAIRRO;NU_TELEFONE;CO_NATUREZA_JUR;CO_MOTIVO_DESAB;CO_AMBULATORIAL_SUS",
  '"2078015";"5";"355030";"SOCIEDADE BENEFICENTE";"HOSPITAL ALBERT EINSTEIN";"05652900";"AV ALBERT EINSTEIN";"627";"MORUMBI";"(11)21511233";"2062";"";"NAO"',
  '"1234567";"5";"355030";"PREFEITURA";"HOSPITAL MUNICIPAL";"01001000";"RUA X";"100";"CENTRO";"(11)33334444";"1147";"";"SIM"',
  '"2345678";"5";"355030";"SANTA CASA";"SANTA CASA";"01002000";"RUA Y";"10";"CENTRO";"(11)33335555";"3999";"";"SIM"',
  '"3456789";"22";"355030";"CLINICA";"CLINICA DA RUA";"01001000";"RUA Z";"1";"CENTRO";"(11)33336666";"2062";"";"NAO"',
  '"4567890";"5";"355030";"FECHADO";"HOSPITAL FECHADO";"01001000";"RUA W";"2";"CENTRO";"(11)33337777";"2062";"04";"NAO"',
  '"5678901";"5";"999999";"SEM CIDADE";"SEM CIDADE";"01001000";"RUA V";"3";"CENTRO";"(11)33338888";"2062";"";"NAO"',
  '"6789012";"20";"355030";"PREFEITURA";"PRONTO SOCORRO";"04001000";"RUA K";"9";"CENTRO";"1133339999";"1244";"";"SIM"',
].join("\n");

test("o CNES fica só com hospital e pronto-socorro ativos", () => {
  const rows = parseCnesHospitalCsv(CSV, CITIES);
  assert.deepEqual(rows.map((row) => row.cnes), ["2078015", "1234567", "2345678", "6789012"]);
  assert.equal(rows[0].care, "particular");
  assert.equal(rows[0].attendsSus, false);
  assert.equal(rows[0].name, "HOSPITAL ALBERT EINSTEIN");
  assert.equal(rows[0].address, "AV ALBERT EINSTEIN, 627 - MORUMBI");
  assert.equal(rows[0].city, "São Paulo");
  assert.equal(rows[0].state, "SP");
  assert.equal(rows[0].phone, "1121511233");
  assert.equal(rows[1].care, "publico");
  assert.equal(rows[1].attendsSus, true);
  assert.equal(hospitalCategoryPhrase(rows[1].care, rows[1].attendsSus), "Público · Atende SUS");
  assert.equal(rows[2].care, "filantropico");
  assert.equal(hospitalCategoryPhrase("particular", false), "Particular");
  assert.equal(rows[3].unitLabel, "Pronto-socorro geral");
  assert.equal(hospitalCare("4000"), null);
  assert.equal(hospitalPhoneDigits("110215112331"), null);
  assert.equal(
    hospitalGeocodeQuery(rows[0].address, rows[0].city, rows[0].state),
    "AV ALBERT EINSTEIN, 627 - MORUMBI, São Paulo, SP, Brasil",
  );
});

test("o endereço vira pino na rua certa e não em outro número 399", () => {
  const origin = { lat: -23.422, lng: -46.86707 };
  const santaAna = pickHospitalPoint({
    originLat: origin.lat,
    originLng: origin.lng,
    address: "AVENIDA GERALDO DE CEZAR, 613 - CAMPO DA VILA",
    hospitalName: "HOSPITAL E MATERNIDADE MUNICIPAL SANTA ANA",
    cep: "06501008",
    hits: [
      { lat: -23.43986, lng: -46.91792, postcode: "06502-150", name: "Avenida Geraldo de Cezar", street: null },
      { lat: -23.43862, lng: -46.91366, postcode: "06501-210", name: "Avenida Geraldo de Cezar", street: null },
      { lat: -23.5475, lng: -46.63611, postcode: "01000-000", name: "São Paulo", street: null },
      { lat: -23.48, lng: -46.85, postcode: "06502-210", name: "Avenida Geraldo de Oliveira Doglio", street: null },
    ],
  });
  assert.equal(santaAna?.lat, -23.43862);
  const jose = pickHospitalPoint({
    originLat: origin.lat,
    originLng: origin.lng,
    address: "RUA JOSE MARTINHO, 399 - PARQUE IMPERIAL",
    hospitalName: "PRONTO SOCORRO MUNICIPAL JOSE AGOSTINHO DOS SANTOS",
    cep: "06462230",
    hits: [
      { lat: -23.51, lng: -46.84, houseNumber: "399", postcode: "06401-000", name: null, street: "Rua Campos Sales" },
      { lat: -23.48604, lng: -46.80446, houseNumber: null, postcode: "06462-120", name: "Pronto Socorro José Agostinho dos Santos", street: "Rua José Martinho" },
    ],
  });
  assert.equal(jose?.lat, -23.48604);
  assert.equal(
    hospitalStreetQuery("AVENIDA GERALDO DE CEZAR, 613 - CAMPO DA VILA", "Santana de Parnaíba", "SP"),
    "AVENIDA GERALDO DE CEZAR, 613, Santana de Parnaíba, SP, Brasil",
  );
});

test("o pino do hospital segue a mesma régua e não usa o centro da cidade", () => {
  const origin = { lat: -23.42202, lng: -46.86707 };
  assert.equal(
    acceptHospitalPin({
      pin: { cnes: "2078015", lat: -23.5475, lng: -46.63611 },
      originLat: origin.lat,
      originLng: origin.lng,
      allowed: ["2078015"],
    }),
    null,
  );
  assert.equal(
    acceptHospitalPin({
      pin: { cnes: "9999999", lat: -23.6, lng: -46.72 },
      originLat: origin.lat,
      originLng: origin.lng,
      allowed: ["2078015"],
    }),
    null,
  );
  const pin = acceptHospitalPin({
    pin: { cnes: "2078015", lat: -23.50499, lng: -46.83394 },
    originLat: origin.lat,
    originLng: origin.lng,
    allowed: ["2078015"],
  });
  assert.deepEqual(pin, { cnes: "2078015", lat: -23.50499, lng: -46.83394 });
  assert.equal(formatHospitalPinList(pin ? [pin] : []), "2078015:-23.50499:-46.83394");
  assert.deepEqual(parseHospitalPinList("2078015:-23.50499:-46.83394,lixo"), [
    { cnes: "2078015", lat: -23.50499, lng: -46.83394 },
  ]);

  const ranked = rankHospitals(origin.lat, origin.lng, [{
    cnes: "2078015",
    name: "HOSPITAL ALBERT EINSTEIN",
    address: "AV ALBERT EINSTEIN, 627 - MORUMBI",
    phone: "1121511233",
    care: "particular",
    attendsSus: false,
    unitLabel: "Hospital geral",
    latitude: -23.50499,
    longitude: -46.83394,
  }]);
  assert.equal(ranked?.radiusKm, 10);
  assert.equal(ranked?.hospitals[0].categoryPhrase, "Particular");
  assert.equal(ranked?.hospitals[0].name, "HOSPITAL ALBERT EINSTEIN");
  assert.equal(hospitalCatalogPhrase(0, 0, null), "A lista de hospitais ainda não está no sistema.");
  assert.equal(
    hospitalCatalogPhrase(8069, 0, "Santana de Parnaíba"),
    "Lista no sistema: 8.069 hospitais. Santana de Parnaíba não tem hospital nesta lista.",
  );
  assert.equal(noHospitalMessage(25), "Nenhum hospital em até 25 km.");
});
