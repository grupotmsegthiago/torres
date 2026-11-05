import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escolherOsAtivaDaViatura,
  missaoEmCursoNaViatura,
  outraMissaoEmCursoNaViatura,
} from "./os-viatura";

test("na TMG0E84 ganha a OS que já iniciou a missão, não a Omega parada no check-in", () => {
  const tor1178 = {
    id: 1572,
    osNumber: "TOR-1178",
    status: "em_andamento",
    missionStatus: "em_transito_destino",
    scheduledDate: "2026-11-05T09:30:00-03:00",
    missionStartedAt: "2026-11-05T09:59:23.705-03:00",
    assignedEmployeeId: 56,
    assignedEmployee2Id: 59,
  };
  const tor1215 = {
    id: 1609,
    osNumber: "TOR-1215",
    status: "em_andamento",
    missionStatus: "checkin_veiculo_escoltado",
    scheduledDate: "2026-11-05T09:30:00-03:00",
    missionStartedAt: null,
    assignedEmployeeId: 25,
    assignedEmployee2Id: 47,
  };
  const escolhida = escolherOsAtivaDaViatura([tor1215, tor1178], { driverId: 56, partnerId: 59 });
  assert.equal(escolhida?.osNumber, "TOR-1178");
  assert.equal(outraMissaoEmCursoNaViatura([tor1178, tor1215], 1609)?.osNumber, "TOR-1178");
  assert.equal(missaoEmCursoNaViatura(tor1215), true);
});

test("empatando o passo, a OS que casa com a sessão do condutor fica na frente", () => {
  const a = {
    id: 1,
    osNumber: "TOR-1",
    status: "em_andamento",
    missionStatus: "em_transito_origem",
    scheduledDate: "2026-11-05T10:00:00-03:00",
    assignedEmployeeId: 10,
    assignedEmployee2Id: 11,
  };
  const b = {
    id: 2,
    osNumber: "TOR-2",
    status: "em_andamento",
    missionStatus: "em_transito_origem",
    scheduledDate: "2026-11-05T10:00:00-03:00",
    assignedEmployeeId: 20,
    assignedEmployee2Id: 21,
  };
  assert.equal(escolherOsAtivaDaViatura([a, b], { driverId: 20, partnerId: 21 })?.osNumber, "TOR-2");
});

test("OS só agendada sem passo não compete com missão em curso", () => {
  const ativa = {
    id: 3,
    osNumber: "TOR-3",
    status: "em_andamento",
    missionStatus: "checkout_armamento",
    scheduledDate: "2026-11-05T11:00:00-03:00",
    assignedEmployeeId: 1,
  };
  const futura = {
    id: 4,
    osNumber: "TOR-4",
    status: "agendada",
    missionStatus: "aguardando",
    scheduledDate: "2026-11-05T13:00:00-03:00",
    assignedEmployeeId: 1,
  };
  assert.equal(escolherOsAtivaDaViatura([futura, ativa])?.osNumber, "TOR-3");
  assert.equal(outraMissaoEmCursoNaViatura([ativa, futura], 4)?.osNumber, "TOR-3");
});
