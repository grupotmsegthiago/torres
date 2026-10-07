import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCanceladaPriceTable } from "./cancelada-price-table";

const origem100 = {
  id: "100",
  name: "ORIGEM - BR x 100 KM ",
  status: "Ativo",
  franquia_km: "100.00",
  franquia_horas: "3.0",
  valor_acionamento: "480.00",
};
const dedicada = {
  id: "ded",
  name: "OP. DEDICADA SUL",
  status: "Ativo",
  franquia_km: "100.00",
  franquia_horas: "3.0",
  valor_acionamento: "1200.00",
};
const preservacao = {
  id: "pre",
  name: "PRESERVAÇÃO - TM SEG",
  status: "Ativo",
  franquia_km: "100.00",
  franquia_horas: "12.0",
  valor_acionamento: "1200.00",
};
const origem200 = {
  id: "200",
  name: "ORIGEM - BR x 200 KM ",
  status: "Ativo",
  franquia_km: "200.00",
  franquia_horas: "5.0",
  valor_acionamento: "960.00",
};

test("cancelada escolhe a tabela escrita 100 km / 3 h de menor acionamento", () => {
  const picked = pickCanceladaPriceTable([origem200, dedicada, preservacao, origem100]);
  assert.equal(picked?.id, "100");
  assert.equal(Number(picked?.valor_acionamento), 480);
});

test("cancelada ignora tabela de 100 km com franquia de horas diferente de 3", () => {
  const picked = pickCanceladaPriceTable([preservacao, origem200]);
  assert.equal(picked, null);
});

test("cancelada usa a única tabela 100 km / 3 h mesmo sem o texto no nome", () => {
  const picked = pickCanceladaPriceTable([origem200, dedicada]);
  assert.equal(picked?.id, "ded");
});
