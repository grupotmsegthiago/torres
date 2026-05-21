import { test } from "node:test";
import assert from "node:assert/strict";
import { supabaseAdmin } from "./supabase.ts";
import { executeBillingCron } from "./cron.ts";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

interface ScenarioState {
  tables: Tables;
  updates: Array<{ table: string; values: Row; filters: Array<[string, any]> }>;
  inserts: Array<{ table: string; values: Row | Row[] }>;
}

function makeQueryBuilder(state: ScenarioState, table: string) {
  let rows: Row[] = (state.tables[table] || []).slice();
  let mode: "select" | "update" | "insert" | "delete" | "upsert" = "select";
  let pendingUpdate: Row | null = null;
  let pendingInsert: Row | Row[] | null = null;
  let pendingUpsert: { values: Row | Row[]; onConflict: string } | null = null;
  const filters: Array<[string, any]> = [];

  const applyFilters = (input: Row[]) => {
    let out = input;
    for (const [col, val] of filters) {
      if (Array.isArray(val)) out = out.filter((r) => val.includes(r[col]));
      else out = out.filter((r) => r[col] === val);
    }
    return out;
  };

  const builder: any = {
    select(_cols?: string) { mode = "select"; return builder; },
    update(values: Row) { mode = "update"; pendingUpdate = values; return builder; },
    insert(values: Row | Row[]) { mode = "insert"; pendingInsert = values; return builder; },
    upsert(values: Row | Row[], opts?: { onConflict?: string }) {
      mode = "upsert";
      pendingUpsert = { values, onConflict: opts?.onConflict || "id" };
      return builder;
    },
    delete() { mode = "delete"; return builder; },
    eq(col: string, val: any) { filters.push([col, val]); return builder; },
    in(col: string, vals: any[]) { filters.push([col, vals]); return builder; },
    order(_col: string, _opts?: any) { return builder; },
    range(_from: number, _to: number) { return builder; },
    limit(_n: number) { return builder; },
    single() {
      const filtered = applyFilters(rows);
      return Promise.resolve({ data: filtered[0] || null, error: null });
    },
    then(resolve: any, reject: any) {
      try {
        if (mode === "select") {
          return Promise.resolve({ data: applyFilters(rows), error: null }).then(resolve, reject);
        }
        if (mode === "update") {
          state.updates.push({ table, values: pendingUpdate!, filters: filters.slice() });
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        if (mode === "insert") {
          state.inserts.push({ table, values: pendingInsert! });
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        if (mode === "upsert") {
          // Resolve para INSERT ou UPDATE com base no UNIQUE column (onConflict)
          const { values, onConflict } = pendingUpsert!;
          const rowsArr: Row[] = Array.isArray(values) ? values : [values];
          const tbl = state.tables[table] || [];
          for (const row of rowsArr) {
            const key = row[onConflict];
            const existing = key !== undefined && tbl.find((r) => r[onConflict] === key);
            if (existing) {
              state.updates.push({ table, values: row, filters: [[onConflict, key]] });
            } else {
              state.inserts.push({ table, values: row });
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).catch(reject);
      }
    },
  };
  return builder;
}

function installMock(state: ScenarioState) {
  const origFrom = (supabaseAdmin as any).from;
  const origRpc = (supabaseAdmin as any).rpc;
  (supabaseAdmin as any).from = (table: string) => makeQueryBuilder(state, table);
  (supabaseAdmin as any).rpc = async (_name: string, _args: any) => ({ data: 0, error: null });
  return () => {
    (supabaseAdmin as any).from = origFrom;
    (supabaseAdmin as any).rpc = origRpc;
  };
}

function buildScenario(billingStatus: string, manualValues: Row): ScenarioState {
  const so = {
    id: 9001,
    os_number: "TEST-9001",
    type: "escolta",
    status: "concluida",
    mission_status: "encerrada",
    client_id: 1,
    assigned_employee_id: 10,
    assigned_employee_2_id: null,
    vehicle_id: 100,
    escort_contract_id: 1,
    completed_date: "2026-01-10T18:00:00",
    scheduled_date: "2026-01-10T08:00:00",
    mission_started_at: "2026-01-10T08:30:00",
    origin: "São Paulo",
    destination: "Campinas",
    escorted_vehicle_plate: "ABC1D23",
    escorted_driver_name: "João",
  };

  const billing = {
    id: 5001,
    service_order_id: 9001,
    status: billingStatus,
    contract_id: 1,
    ...manualValues,
  };

  return {
    tables: {
      service_orders: [so],
      escort_billings: [billing],
      escort_contracts: [{ id: 1, status: "Ativo", client_id: 1, valor_km_carregado: 2.8, valor_km_vazio: 1.4, valor_km_extra: 2.4, franquia_minima_km: 50, franquia_km: 50, franquia_horas: 3, valor_hora_estadia: 50, valor_hora_extra: 110, valor_acionamento: 200, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30 }],
      clients: [{ id: 1, name: "Cliente Teste" }],
      employees: [{ id: 10, name: "Agente Teste" }],
      vehicles: [{ id: 100, plate: "XYZ1A23" }],
      mission_photos: [],
      mission_costs: [],
    },
    updates: [],
    inserts: [],
  };
}

test("cron Billing: não sobrescreve billing em A_VERIFICAR", async () => {
  const manual = { fat_total: 12345, despesas_pedagio: 999.99, fat_acionamento: 777, km_inicial: 100, km_final: 200 };
  const state = buildScenario("A_VERIFICAR", manual);
  const restore = installMock(state);
  try {
    await executeBillingCron();
  } finally {
    restore();
  }
  const updates = state.updates.filter((u) => u.table === "escort_billings");
  assert.equal(updates.length, 0, `Esperado 0 updates em escort_billings A_VERIFICAR, recebeu ${updates.length}`);
  const inserts = state.inserts.filter((i) => i.table === "escort_billings");
  assert.equal(inserts.length, 0, "Não deve inserir novo billing quando já existe um em A_VERIFICAR");
});

test("cron Billing: não sobrescreve billing em APROVADA", async () => {
  const manual = { fat_total: 55555, despesas_pedagio: 42.42, km_inicial: 0, km_final: 0 };
  const state = buildScenario("APROVADA", manual);
  const restore = installMock(state);
  try {
    await executeBillingCron();
  } finally {
    restore();
  }
  const updates = state.updates.filter((u) => u.table === "escort_billings");
  assert.equal(updates.length, 0, "Billing APROVADA não pode ser atualizado pelo cron");
});

test("cron Billing: cria billing para OS concluída sem billing existente", async () => {
  const state = buildScenario("A_VERIFICAR", {});
  state.tables.escort_billings = [];
  const restore = installMock(state);
  try {
    await executeBillingCron();
  } finally {
    restore();
  }
  const inserts = state.inserts.filter((i) => i.table === "escort_billings");
  assert.equal(inserts.length, 1, "Deve criar billing novo para OS concluída sem billing");
  const payload = Array.isArray(inserts[0].values) ? inserts[0].values[0] : inserts[0].values;
  assert.equal(payload.status, "A_VERIFICAR");
  assert.equal(payload.service_order_id, 9001);
});

test("cron Billing: atualiza billing PENDENTE em OS ativa (não congelado)", async () => {
  const state = buildScenario("PENDENTE", { fat_total: 1, km_inicial: 0, km_final: 0 });
  state.tables.service_orders[0].status = "em_andamento";
  state.tables.service_orders[0].mission_status = "em_andamento";
  state.tables.service_orders[0].completed_date = null;
  const restore = installMock(state);
  try {
    await executeBillingCron();
  } finally {
    restore();
  }
  const updates = state.updates.filter((u) => u.table === "escort_billings");
  assert.equal(updates.length, 1, "Billing PENDENTE em OS ativa deve ser atualizado");
});
