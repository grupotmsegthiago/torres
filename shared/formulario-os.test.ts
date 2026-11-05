import { test } from "node:test";
import assert from "node:assert/strict";
import { camposRotaDoFormulario, resolverOsDoFormulario } from "./formulario-os";

test("formulário da TOR-1215 não pega origem da TOR-1178 ativa na mesma viatura", () => {
  const viatura = {
    plate: "TMG0E84",
    activeOs: {
      osNumber: "TOR-1178",
      clientName: "R J C DEFESA",
      origin: "RJC Defesa Aeroespacial - Lorena - SP",
      destination: "Aeroporto Internacional de Viracopos - Campinas",
      escortedVehiclePlate: "CPG5A89",
      escortedDriverName: "André Luiz",
      employee1: { name: "CLAUDEANO DA SILVA" },
      employee2: { name: "REINALDO FERREIRA CAMPOS" },
    },
    upcomingOrders: [{
      osNumber: "TOR-1215",
      clientName: "OMEGA SOLUTIONS TRANSPORTES",
      origin: "Embragen - Jaguaré, São Paulo - SP",
      destination: "DHL Supply Chain - Osasco",
      escortedVehiclePlate: "",
      employee1: { name: "JEANDRO SABINO DA SILVAA" },
      employee2: { name: "HERMISON LUIS ROCHA QUIRINO" },
    }],
  };
  const grade = {
    osNumber: "TOR-1215",
    clientName: "OMEGA SOLUTIONS TRANSPORTES",
    origin: "Embragen - Jaguaré, São Paulo - SP",
    destination: "DHL Supply Chain - Osasco",
    employee1: { name: "JEANDRO SABINO DA SILVAA" },
    employee2: { name: "HERMISON LUIS ROCHA QUIRINO" },
  };

  const os = resolverOsDoFormulario(viatura, grade);
  const rota = camposRotaDoFormulario(os);
  assert.equal(os?.osNumber, "TOR-1215");
  assert.equal(os?.clientName, "OMEGA SOLUTIONS TRANSPORTES");
  assert.match(rota.origin, /Embragen/i);
  assert.match(rota.destination, /DHL/i);
  assert.doesNotMatch(rota.origin, /RJC/i);
  assert.doesNotMatch(rota.destination, /Viracopos/i);
});

test("sem grade, o formulário usa a OS ativa da viatura", () => {
  const os = resolverOsDoFormulario({
    activeOs: {
      osNumber: "TOR-1178",
      origin: "RJC Defesa - Lorena",
      destination: "Viracopos",
    },
  }, null);
  assert.equal(os?.osNumber, "TOR-1178");
  assert.match(camposRotaDoFormulario(os).origin, /RJC/);
});
