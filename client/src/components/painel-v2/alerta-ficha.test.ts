import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararRelatorioAlerta, resolverFichaAlerta } from "./alerta-ficha";

const grade = [{
  id: 90,
  osNumber: "TOR-1842",
  clientName: "TRANSPORTES LOPES",
  origin: "Rua da Origem, 10, Campinas - SP",
  destination: "Avenida do Destino, 20, Santos - SP",
  missionStatus: "em_transito_destino",
  vehicle: { plate: "ABC1D23", model: "MOBI" },
  employee1: { name: "Maycon Agostinho", fullName: "Maycon Andrade Lopes Agostinho" },
  employee2: null,
  lastAgentUpdate: { message: "texto antigo", missionStep: "em_transito_destino" },
}];

test("a ficha sai da grade quando a viatura ainda não chegou no rastreamento", () => {
  const ficha = resolverFichaAlerta({ osNumber: "TOR-1842", serviceOrderId: 90 }, [], grade);
  assert.equal(ficha.cliente, "TRANSPORTES LOPES");
  assert.equal(ficha.origem, "Rua da Origem, 10, Campinas - SP");
  assert.equal(ficha.destino, "Avenida do Destino, 20, Santos - SP");
  assert.equal(ficha.plate, "ABC1D23");
});

test("a OS ativa da própria viatura prevalece sobre outra missão da mesma placa", () => {
  const ficha = resolverFichaAlerta(
    { osNumber: "TOR-1842" },
    [{
      plate: "ABC1D23",
      activeOs: {
        osNumber: "TOR-9999",
        clientName: "OUTRO CLIENTE",
        origin: "Outra origem",
        destination: "Outro destino",
      },
    }],
    grade,
  );
  assert.equal(ficha.cliente, "TRANSPORTES LOPES");
  assert.equal(ficha.origem, "Rua da Origem, 10, Campinas - SP");
  assert.equal(ficha.destino, "Avenida do Destino, 20, Santos - SP");
});

test("o formulário usa a mensagem desta atualização e não a OS de outra missão", () => {
  const ficha = resolverFichaAlerta(
    { osNumber: "TOR-1842", serviceOrderId: 90 },
    [{
      plate: "ABC1D23",
      activeOs: {
        osNumber: "TOR-9999",
        clientName: "OUTRO CLIENTE",
        origin: "Outra origem",
        destination: "Outro destino",
        lastAgentUpdate: { message: "mensagem da outra missão" },
      },
    }],
    grade,
  );
  const preparado = prepararRelatorioAlerta(ficha, {
    osNumber: "TOR-1842",
    serviceOrderId: 90,
    message: "Missão segue padrão, sem novidades",
    driver: "Maycon Andrade Lopes Agostinho",
  });
  assert.equal(preparado.vehicle.activeOs, null);
  assert.equal(preparado.gridItem?.clientName, "TRANSPORTES LOPES");
  assert.equal(preparado.gridItem?.origin, "Rua da Origem, 10, Campinas - SP");
  assert.equal(preparado.gridItem?.destination, "Avenida do Destino, 20, Santos - SP");
  assert.equal(preparado.gridItem?.lastAgentUpdate?.message, "Missão segue padrão, sem novidades");
});

test("com a OS ativa, o formulário troca a atualização pela frase que chegou agora", () => {
  const ficha = resolverFichaAlerta(
    { osNumber: "TOR-1842" },
    [{
      id: 7,
      plate: "ABC1D23",
      model: "VIRTUS",
      tracker: { latitude: -23.5, longitude: -46.6 },
      activeOs: {
        osNumber: "TOR-1842",
        clientName: "TRANSPORTES LOPES",
        origin: "Rua da Origem, 10, Campinas - SP",
        destination: "Avenida do Destino, 20, Santos - SP",
        missionStatus: "em_transito_destino",
        lastAgentUpdate: { message: "texto antigo", missionStep: "em_transito_destino" },
      },
      upcomingOrders: [],
    }],
    grade,
  );
  const preparado = prepararRelatorioAlerta(ficha, {
    osNumber: "TOR-1842",
    message: "Missão segue padrão, sem novidades",
    missionStep: null,
    driver: "Maycon",
    latitude: "-22.9",
    longitude: "-47.06",
  });
  assert.equal(preparado.vehicle.activeOs?.clientName, "TRANSPORTES LOPES");
  assert.equal(preparado.vehicle.activeOs?.origin, "Rua da Origem, 10, Campinas - SP");
  assert.equal(preparado.vehicle.activeOs?.destination, "Avenida do Destino, 20, Santos - SP");
  assert.equal(preparado.vehicle.activeOs?.lastAgentUpdate?.message, "Missão segue padrão, sem novidades");
  assert.equal(preparado.vehicle.activeOs?.lastAgentUpdate?.missionStep, "em_transito_destino");
  assert.equal(preparado.vehicle.tracker?.latitude, -23.5);
});
