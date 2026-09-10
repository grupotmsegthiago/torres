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
