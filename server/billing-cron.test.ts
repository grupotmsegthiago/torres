import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBillingPayloadForOs,
  resolveContractForOs,
  shouldSkipBillingHours,
  DEFAULT_BILLING_CONTRACT,
} from "./billing-calc.ts";

// Contrato típico com modelo "acionamento" (cliente normal)
const CONTRATO_ACIONAMENTO = {
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

// Contrato sem acionamento (modelo por km)
const CONTRATO_POR_KM = {
  id: 202,
  valor_acionamento: 0,
  franquia_horas: 0,
  franquia_km: 100,
  franquia_minima_km: 100,
  valor_km_extra: 0,
  valor_km_carregado: 2.5,
  valor_km_vazio: 1.2,
  valor_hora_extra: 0,
  valor_hora_estadia: 50,
  vrp_base: 120,
  valor_diaria: 0,
  adicional_noturno_km_pct: 10,
  adicional_noturno_vrp_pct: 0,
  adicional_periculosidade_pct: 0,
};

const FIXED_NOW = new Date("2025-06-15T15:00:00Z");

function baseOs(overrides: Record<string, any> = {}) {
  return {
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
    origin: "São Paulo - SP",
    destination: "Campinas - SP",
    escorted_vehicle_plate: "ESC1A23",
    escorted_driver_name: "João",
    // 12:00 BRT = 15:00 UTC
    scheduled_date: "2025-06-15T15:00:00Z",
    mission_started_at: "2025-06-15T15:00:00Z",
    completed_date: "2025-06-15T20:00:00Z", // 17:00 BRT
    ...overrides,
  };
}

test("shouldSkipBillingHours: mission aguardando → skip", () => {
  assert.equal(shouldSkipBillingHours({ mission_status: "aguardando" }), true);
});

test("shouldSkipBillingHours: agendada com data futura → skip", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  assert.equal(
    shouldSkipBillingHours({ mission_status: "em_andamento", status: "agendada", scheduled_date: future }),
    true,
  );
});

test("shouldSkipBillingHours: missão em andamento → NÃO pula", () => {
  assert.equal(
    shouldSkipBillingHours({ mission_status: "em_andamento", status: "em_andamento", scheduled_date: "2025-01-01T00:00:00Z" }),
    false,
  );
});

test("resolveContractForOs: usa escort_contract_id quando presente", () => {
  const cm = new Map<number, any>([[101, { id: 101, vrp_base: 999 }]]);
  const ccm = new Map<number, any>([[500, { id: 555, vrp_base: 111 }]]);
  const c = resolveContractForOs({ escort_contract_id: 101, client_id: 500 }, cm, ccm);
  assert.equal(c.id, 101);
});

test("resolveContractForOs: fallback para client_id quando escort_contract_id ausente", () => {
  const cm = new Map<number, any>();
  const ccm = new Map<number, any>([[500, { id: 555, vrp_base: 111 }]]);
  const c = resolveContractForOs({ escort_contract_id: null, client_id: 500 }, cm, ccm);
  assert.equal(c.id, 555);
});

test("resolveContractForOs: fallback para default quando nada bate", () => {
  const c = resolveContractForOs({ client_id: 9999 }, new Map(), new Map(), { id: "DEFAULT" });
  assert.equal(c.id, "DEFAULT");
});

test("resolveContractForOs: sem default explícito usa DEFAULT_BILLING_CONTRACT", () => {
  const c = resolveContractForOs({ client_id: 9999 }, new Map(), new Map());
  assert.equal(c.valor_km_carregado, DEFAULT_BILLING_CONTRACT.valor_km_carregado);
});

test("computeBillingPayloadForOs: missão diurna padrão (acionamento + horas dentro da franquia)", () => {
  const so = baseOs();
  // 12:00 BRT → 17:00 BRT = 5h trabalhadas. Franquia 4h → 1h extra.
  const horasMissao = 5;
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 1080 }, // 80 km
  ];
  const mCosts: any[] = [];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts, horasMissao,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.service_order_id, 9001);
  assert.equal(p.client_id, 500);
  assert.equal(p.client_name, "Cliente A");
  assert.equal(p.contract_id, 101);
  assert.equal(p.km_inicial, 1000);
  assert.equal(p.km_final, 1080);
  assert.equal(p.km_total, 80);
  assert.equal(p.km_carregado, 80);
  assert.equal(p.km_franquia, 50);
  assert.equal(p.km_excedente, 30);
  // km_excedente=30 * valor_km_extra=3 = 90
  assert.equal(p.fat_km, 90);
  assert.equal(p.fat_acionamento, 200);
  // 1h extra * 80 = 80
  assert.equal(p.fat_hora_extra, 80);
  // 200 + 90 + 80 = 370 (sem noturno, sem despesas)
  assert.equal(p.fat_total, 370);
  assert.equal(p.is_noturno, false);
  assert.equal(p.horario_agendado, "12:00");
  assert.equal(p.horario_inicio, "12:00");
  assert.equal(p.horario_fim, "17:00");
  assert.equal(p.horario_inicio_considerado, "12:00");
  assert.equal(p.horas_missao, 5);
  assert.equal(p.despesas_pedagio, 0);
  assert.equal(p.despesas_combustivel, 0);
  assert.equal(p.despesas_outras, 0);
  assert.equal(p.receitas_os, 0);
  assert.equal(p.pag_vrp, 150);
  assert.equal(p.resultado_bruto, 220);
  assert.equal(p.status, "A_VERIFICAR");
  assert.equal(p.created_by, "CRON");
  assert.equal(p.placa_viatura, "ABC1D23");
  assert.equal(p.placa_escoltado, "ESC1A23");
  assert.equal(p.vigilante_name, "Agente 1");
});

test("computeBillingPayloadForOs: missão noturna aplica adicional_noturno_km_pct", () => {
  // 23:00 BRT = 02:00 UTC do dia seguinte; 04:00 BRT = 07:00 UTC
  const so = baseOs({
    scheduled_date: "2025-06-16T02:00:00Z",
    mission_started_at: "2025-06-16T02:00:00Z",
    completed_date: "2025-06-16T07:00:00Z",
  });
  const horasMissao = 5;
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 1080 },
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts: [], horasMissao,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.horario_inicio_considerado, "23:00");
  assert.equal(p.horario_fim, "04:00");
  assert.equal(p.is_noturno, true);
  assert.equal(p.fat_acionamento, 200);
  assert.equal(p.fat_km, 90); // 30 * 3
  assert.equal(p.fat_hora_extra, 80);
  // Base 370 + adicional noturno 15% sobre (acionamento+fat_km)=290 = 43.5
  // fat_total = 370 + 43.5 = 413.5
  assert.equal(p.fat_total, 413.5);
});

test("computeBillingPayloadForOs: mission_costs com múltiplas categorias e receita", () => {
  const so = baseOs();
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 1050 }, // 50 km — exatamente na franquia
  ];
  const mCosts = [
    { category: "Pedágio", amount: 25.5, cost_type: "expense" },
    { category: "Pedágio", amount: 10, cost_type: "expense" },
    { category: "Combustível", amount: 120, cost_type: "expense" },
    { category: "Alimentação", amount: 30, cost_type: "expense" },
    { category: "Pedágio Cliente", amount: 40, cost_type: "revenue" },
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts, horasMissao: 4,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.despesas_pedagio, 35.5);
  assert.equal(p.despesas_combustivel, 120);
  assert.equal(p.despesas_outras, 30);
  assert.equal(p.receitas_os, 40);
  assert.equal(p.km_total, 50);
  assert.equal(p.km_excedente, 0);
  assert.equal(p.fat_acionamento, 200);
  assert.equal(p.fat_km, 0);
  assert.equal(p.fat_hora_extra, 0);
  // fat_total base = 200; + despesas_pedagio (35.5) + receitas_os (40) = 275.5
  // combustível e outras NÃO entram no fat_total
  assert.equal(p.fat_total, 275.5);
  assert.equal(p.resultado_bruto, 125.5);
});

test("computeBillingPayloadForOs: múltiplas km_chegada usa a primeira (ordem de chegada)", () => {
  const so = baseOs();
  // Duplicatas/correções: primeira leitura é 1000, segunda (corrigida) é 1500
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_chegada", km_value: 1500 },
    { step: "km_final", km_value: 1080 },
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts: [], horasMissao: 4,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.km_inicial, 1000); // primeira leitura, não a segunda
  assert.equal(p.km_final, 1080);
  assert.equal(p.km_total, 80);
});

test("computeBillingPayloadForOs: km_saida usado como fallback quando km_chegada ausente", () => {
  const so = baseOs();
  const photos = [
    { step: "km_saida", km_value: 2000 },
    { step: "km_final", km_value: 2120 },
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts: [], horasMissao: 4,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.km_inicial, 2000);
  assert.equal(p.km_final, 2120);
  assert.equal(p.km_total, 120);
});

test("computeBillingPayloadForOs: km_final menor que km_inicial fica preso em km_inicial", () => {
  const so = baseOs();
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 800 }, // leitura inconsistente
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts: [], horasMissao: 4,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.km_inicial, 1000);
  assert.equal(p.km_final, 1000);
  assert.equal(p.km_total, 0);
});

test("computeBillingPayloadForOs: OS A_VERIFICAR já existente continua sendo recalculada como A_VERIFICAR", () => {
  // Cenário: cron passa por OS já concluída com billing A_VERIFICAR.
  // O payload regerado deve manter status A_VERIFICAR (cron não promove para gerado).
  const so = baseOs({ status: "concluida", mission_status: "encerrada" });
  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO,
    photos: [{ step: "km_chegada", km_value: 0 }, { step: "km_final", km_value: 50 }],
    mCosts: [], horasMissao: 4,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });
  assert.equal(p.status, "A_VERIFICAR");
  assert.equal(p.created_by, "CRON");
});

test("computeBillingPayloadForOs: modelo por km (sem acionamento) cobra mínimo da franquia", () => {
  const so = baseOs({ escort_contract_id: 202, client_id: 600 });
  const photos = [
    { step: "km_chegada", km_value: 100 },
    { step: "km_final", km_value: 130 }, // 30 km — abaixo da franquia de 100
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_POR_KM, photos, mCosts: [], horasMissao: 2,
    clientName: "Cliente B", empName: "Agente 2", emp2Name: null, vehPlate: "XYZ9Z99",
    nowDate: FIXED_NOW,
  });

  assert.equal(p.km_total, 30);
  assert.equal(p.km_franquia, 100);
  assert.equal(p.km_excedente, 0);
  assert.equal(p.fat_acionamento, 0);
  // km_faturado = max(30, 100) = 100; * 2.5 = 250
  assert.equal(p.fat_km, 250);
  assert.equal(p.fat_hora_extra, 0);
  assert.equal(p.fat_total, 250);
  assert.equal(p.pag_vrp, 120);
  assert.equal(p.resultado_bruto, 130);
  // valor_franquia = min(30, 100) * 2.5 = 75
  assert.equal(p.valor_franquia, 75);
});

test("computeBillingPayloadForOs: snapshot completo do payload de uma missão típica", () => {
  // Trava todo o payload pra detectar qualquer mudança silenciosa nos campos.
  const so = baseOs();
  const photos = [
    { step: "km_chegada", km_value: 1000 },
    { step: "km_final", km_value: 1080 },
  ];
  const mCosts = [
    { category: "Pedágio", amount: 25, cost_type: "expense" },
    { category: "Combustível", amount: 100, cost_type: "expense" },
  ];

  const p = computeBillingPayloadForOs({
    so, contrato: CONTRATO_ACIONAMENTO, photos, mCosts, horasMissao: 5,
    clientName: "Cliente A", empName: "Agente 1", emp2Name: null, vehPlate: "ABC1D23",
    nowDate: FIXED_NOW,
  });

  const expected = {
    service_order_id: 9001,
    client_id: 500,
    client_name: "Cliente A",
    contract_id: 101,
    km_inicial: 1000,
    km_final: 1080,
    km_vazio: 0,
    km_carregado: 80,
    km_total: 80,
    km_faturado: 80,
    km_franquia: 50,
    km_excedente: 30,
    horario_agendado: "12:00",
    horario_inicio: "12:00",
    horario_fim: "17:00",
    horario_inicio_considerado: "12:00",
    horas_missao: 5,
    horas_trabalhadas: 5,
    horas_estadia: 0,
    teve_pernoite: false,
    is_noturno: false,
    fat_acionamento: 200,
    fat_km: 90,
    fat_hora_extra: 80,
    fat_total: 395, // 370 base + 25 pedágio
    valor_franquia: 200,
    valor_km_extra: 90,
    pag_vrp: 150,
    pag_total: 150,
    resultado_bruto: 245,
    resultado_liquido: 245,
    margem_percentual: 62.03,
    vigilante_id: 1,
    vigilante_name: "Agente 1",
    vigilante2_id: null,
    vigilante2_name: null,
    origem: "São Paulo - SP",
    destino: "Campinas - SP",
    placa_viatura: "ABC1D23",
    placa_escoltado: "ESC1A23",
    motorista_escoltado: "João",
    despesas_pedagio: 25,
    despesas_combustivel: 100,
    despesas_outras: 0,
    receitas_os: 0,
    data_missao: "2025-06-15T15:00:00Z",
    status: "A_VERIFICAR",
    created_by: "CRON",
  };

  for (const [k, v] of Object.entries(expected)) {
    assert.deepEqual((p as any)[k], v, `campo ${k} divergiu: esperado ${JSON.stringify(v)}, recebido ${JSON.stringify((p as any)[k])}`);
  }
});
