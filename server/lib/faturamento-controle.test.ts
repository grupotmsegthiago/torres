import { test } from "node:test";
import assert from "node:assert/strict";
import { buildControleFaturamento } from "./faturamento-controle.ts";

const today = "2026-09-10";

test("KPI: OS sem billing no ciclo fechado fica vermelho", () => {
  const r = buildControleFaturamento({
    today,
    from: "2026-08-01",
    to: "2026-09-10",
    clients: [{ id: 1, name: "ACME", billing_cycle: "quinzenal" }],
    orders: [
      { id: 10, os_number: "TOR-10", status: "concluida", client_id: 1, scheduled_date: "2026-08-20" },
      { id: 11, os_number: "TOR-11", status: "concluida", client_id: 1, scheduled_date: "2026-08-22" },
    ],
    billings: [
      { id: "b10", service_order_id: 10, data_missao: "2026-08-20", status: "APROVADA", fat_total: 1000, invoice_id: null },
    ],
    invoices: [],
  });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].osTotal, 2);
  assert.equal(r.rows[0].osFaltando, 1);
  assert.equal(r.rows[0].status, "FALTA_OS");
  assert.equal(r.rows[0].semaforo, "vermelho");
  assert.equal(r.kpis.osSemFaturar, 2);
});

test("recusada não entra no ciclo; pago fica verde", () => {
  const r = buildControleFaturamento({
    today,
    from: "2026-09-01",
    to: "2026-09-10",
    clients: [{ id: 2, name: "Beta", billing_cycle: "diario" }],
    orders: [
      { id: 20, os_number: "TOR-20", status: "concluida", client_id: 2, scheduled_date: "2026-09-09" },
      { id: 21, os_number: "TOR-21", status: "recusada", client_id: 2, scheduled_date: "2026-09-09" },
    ],
    billings: [
      { id: "b20", service_order_id: 20, data_missao: "2026-09-09", status: "FATURADO", fat_total: 500, invoice_id: 9 },
    ],
    invoices: [{ id: 9, status: "RECEIVED", value: 500, due_date: "2026-09-15", payment_date: "2026-09-10", created_at: "2026-09-09" }],
  });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].osTotal, 1);
  assert.equal(r.rows[0].status, "PAGO");
  assert.equal(r.rows[0].semaforo, "verde");
  assert.equal(r.rows[0].dataPagamento, "2026-09-10");
});

test("quinzena vigente: missão do dia 09 não aparece como problema em 10/09", () => {
  const r = buildControleFaturamento({
    today: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
    clients: [{ id: 4, name: "Delta", billing_cycle: "quinzenal" }],
    orders: [
      { id: 40, os_number: "TOR-40", status: "concluida", client_id: 4, scheduled_date: "2026-09-09" },
    ],
    billings: [],
    invoices: [],
  });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].periodStart, "2026-09-01");
  assert.equal(r.rows[0].periodEnd, "2026-09-15");
  assert.equal(r.rows[0].status, "CICLO_ABERTO");
  assert.equal(r.rows[0].semaforo, "verde");
  assert.equal(r.kpis.osSemFaturar, 0);
  assert.equal(r.kpis.semaforo, "verde");
});

test("quinzena já encerrada: OS sem billing fica vermelho", () => {
  const r = buildControleFaturamento({
    today: "2026-09-16",
    from: "2026-09-01",
    to: "2026-09-16",
    clients: [{ id: 5, name: "Echo", billing_cycle: "quinzenal" }],
    orders: [
      { id: 50, os_number: "TOR-50", status: "concluida", client_id: 5, scheduled_date: "2026-09-09" },
    ],
    billings: [],
    invoices: [],
  });
  assert.equal(r.rows[0].status, "FALTA_OS");
  assert.equal(r.rows[0].semaforo, "vermelho");
  assert.equal(r.kpis.osSemFaturar, 1);
});

test("alerta de ciclo ainda vigente não entra na tela", () => {
  const r = buildControleFaturamento({
    today: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
    clients: [{ id: 6, name: "Fox", billing_cycle: "quinzenal" }],
    orders: [
      { id: 60, os_number: "TOR-60", status: "concluida", client_id: 6, scheduled_date: "2026-09-03" },
    ],
    billings: [],
    invoices: [],
    alerts: [
      {
        id: 1,
        client_name: "Fox",
        alert_type: "PENDENTE_FATURAMENTO",
        message: "ainda no prazo",
        period_start: "2026-09-01",
        period_end: "2026-09-15",
        resolved: false,
      },
      {
        id: 2,
        client_name: "Fox",
        alert_type: "PENDENTE_FATURAMENTO",
        message: "ciclo passado",
        period_start: "2026-08-16",
        period_end: "2026-08-31",
        resolved: false,
      },
    ],
  });
  assert.equal(r.alertas.length, 1);
  assert.equal(r.alertas[0].id, 2);
});

test("mensal em aberto no prazo = amarelo EM_ABERTO", () => {
  const r = buildControleFaturamento({
    today: "2026-09-08",
    from: "2026-08-01",
    to: "2026-09-08",
    clients: [{ id: 3, name: "Gama", billing_cycle: "mensal" }],
    orders: [
      { id: 30, os_number: "TOR-30", status: "concluida", client_id: 3, scheduled_date: "2026-08-10" },
    ],
    billings: [
      { id: "b30", service_order_id: 30, data_missao: "2026-08-10", status: "FATURADO", fat_total: 800, invoice_id: 3 },
    ],
    invoices: [{ id: 3, status: "PENDING", value: 800, due_date: "2026-09-20", created_at: "2026-09-02" }],
  });
  assert.equal(r.rows[0].status, "EM_ABERTO");
  assert.equal(r.rows[0].semaforo, "amarelo");
  assert.equal(r.rows[0].dataFaturamento, "2026-09-02");
  assert.equal(r.rows[0].diasAtraso, null);
});
