import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPedagioClientMarkup,
  osCobraMarkupPedagio,
  pedagioCobrancaCliente,
  PEDAGIO_CLIENT_MARKUP_FACTOR,
} from "../shared/pedagio-markup.ts";
import {
  calcularEscolta,
  computeBillingPayloadForOs,
  DEFAULT_BILLING_CONTRACT,
} from "./billing-calc.ts";

test("markup de pedágio é 20% e só liga quando operacao_dhl é false", () => {
  assert.equal(PEDAGIO_CLIENT_MARKUP_FACTOR, 1.2);
  assert.equal(osCobraMarkupPedagio({ operacao_dhl: false }), true);
  assert.equal(osCobraMarkupPedagio({ operacaoDhl: false }), true);
  assert.equal(osCobraMarkupPedagio({ operacao_dhl: true }), false);
  assert.equal(osCobraMarkupPedagio({ operacaoDhl: null }), false);
  assert.equal(osCobraMarkupPedagio(null), false);
  assert.equal(applyPedagioClientMarkup(50, false), 50);
  assert.equal(applyPedagioClientMarkup(50, true), 60);
  assert.equal(applyPedagioClientMarkup(5.7, true), 6.84);
  assert.equal(pedagioCobrancaCliente(50, true, true), 120);
  assert.equal(pedagioCobrancaCliente(50, true, false), 100);
});

test("calcularEscolta: +20% entra no fat_total e o reembolso fica no custo", () => {
  const contrato = {
    ...DEFAULT_BILLING_CONTRACT,
    valor_acionamento: 200,
    franquia_horas: 4,
    franquia_km: 50,
    valor_km_extra: 3,
    valor_hora_extra: 80,
  };
  const r = calcularEscolta({
    km_inicial: 1000,
    km_final: 1050,
    km_vazio: 0,
    horas_missao: 3,
    horas_estadia: 0,
    teve_pernoite: false,
    horario_inicio: "10:00",
    horario_fim: "13:00",
    horario_agendado: "10:00",
    despesas_pedagio: 50,
    despesas_combustivel: 0,
    despesas_outras: 0,
    aplicar_markup_pedagio: true,
    contrato,
  });
  assert.equal(r.despesas.pedagio, 60);
  assert.equal(r.despesas.pedagio_custo, 50);
  assert.equal(r.fat_total, 260);
  assert.equal(r.pag_reembolsos, 50);
});

test("calcularEscolta: sem a flag o pedágio continua 1:1", () => {
  const contrato = {
    ...DEFAULT_BILLING_CONTRACT,
    valor_acionamento: 200,
    franquia_horas: 4,
    franquia_km: 50,
    valor_km_extra: 3,
    valor_hora_extra: 80,
  };
  const r = calcularEscolta({
    km_inicial: 1000,
    km_final: 1050,
    km_vazio: 0,
    horas_missao: 3,
    horas_estadia: 0,
    teve_pernoite: false,
    horario_inicio: "10:00",
    horario_fim: "13:00",
    despesas_pedagio: 50,
    despesas_combustivel: 0,
    despesas_outras: 0,
    contrato,
  });
  assert.equal(r.despesas.pedagio, 50);
  assert.equal(r.fat_total, 250);
  assert.equal(r.pag_reembolsos, 50);
});

test("computeBillingPayloadForOs: DHL não aplica 20%; demais OS novas aplicam", () => {
  const soBase = {
    id: 9001,
    os_number: "OS-9001",
    type: "escolta",
    status: "concluida",
    mission_status: "encerrada",
    client_id: 500,
    escort_contract_id: 101,
    assigned_employee_id: 1,
    assigned_employee_2_id: null,
    vehicle_id: 11,
    origin: "SP",
    destination: "Campinas",
    escorted_vehicle_plate: "ESC1A23",
    escorted_driver_name: "João",
    scheduled_date: "2026-09-23T15:00:00Z",
    mission_started_at: "2026-09-23T15:00:00Z",
    completed_date: "2026-09-23T19:00:00Z",
  };
  const contrato = {
    id: 101,
    valor_acionamento: 200,
    franquia_horas: 4,
    franquia_km: 50,
    franquia_minima_km: 50,
    valor_km_extra: 3,
    valor_km_carregado: 3,
    valor_km_vazio: 1.5,
    valor_hora_extra: 80,
    valor_hora_estadia: 80,
    vrp_base: 150,
    valor_diaria: 200,
    adicional_noturno_km_pct: 15,
    adicional_noturno_vrp_pct: 20,
    adicional_periculosidade_pct: 30,
  };
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 1050 },
  ];
  const mCosts = [{ category: "Pedágio", amount: 50, cost_type: "expense" }];
  const common = {
    contrato,
    photos,
    mCosts,
    horasMissao: 4,
    clientName: "Cliente A",
    empName: "Agente 1",
    emp2Name: null,
    vehPlate: "ABC1D23",
    nowDate: new Date("2026-09-23T19:00:00Z"),
  };

  const comMarkup = computeBillingPayloadForOs({ ...common, so: { ...soBase, operacao_dhl: false } });
  assert.equal(comMarkup.despesas_pedagio, 60);
  assert.equal(comMarkup.fat_total, 260);
  assert.equal(comMarkup.pag_reembolsos, 50);

  const dhl = computeBillingPayloadForOs({ ...common, so: { ...soBase, operacao_dhl: true } });
  assert.equal(dhl.despesas_pedagio, 50);
  assert.equal(dhl.fat_total, 250);

  const legado = computeBillingPayloadForOs({ ...common, so: { ...soBase, operacao_dhl: null } });
  assert.equal(legado.despesas_pedagio, 50);
  assert.equal(legado.fat_total, 250);
});
