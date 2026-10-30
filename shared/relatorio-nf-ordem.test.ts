import test from "node:test";
import assert from "node:assert/strict";
import { faturaForaDaCobranca, ordenarFaturas } from "./relatorio-nf-ordem";

const hoje = "2026-10-30";

test("vencida mais antiga fica acima da vencida recente, e as duas acima de hoje", () => {
  const rows = [
    { id: "hoje", dueDate: "2026-10-30", normalizedStatus: "NF_EMITIDA" },
    { id: "atraso-recente", dueDate: "2026-10-19", normalizedStatus: "VENCIDO" },
    { id: "atraso-antigo", dueDate: "2026-09-01", normalizedStatus: "AGUARDANDO_PAGAMENTO" },
    { id: "futura", dueDate: "2026-11-02", normalizedStatus: "NF_EMITIDA" },
  ];
  assert.deepEqual(ordenarFaturas(rows, hoje).map((r) => r.id), [
    "atraso-antigo",
    "atraso-recente",
    "hoje",
    "futura",
  ]);
});

test("cancelada antiga e paga não furam a fila de cobrança", () => {
  const rows = [
    { id: "cancelada", dueDate: "2026-09-01", normalizedStatus: "NF_CANCELADA", rawStatus: "CANCELLED" },
    { id: "paga", dueDate: "2026-10-01", normalizedStatus: "PAGO", rawStatus: "RECEIVED" },
    { id: "amanha", dueDate: "2026-10-31", normalizedStatus: "NF_EMITIDA" },
    { id: "vencida", dueDate: "2026-10-19", normalizedStatus: "VENCIDO" },
  ];
  assert.deepEqual(ordenarFaturas(rows, hoje).map((r) => r.id), [
    "vencida",
    "amanha",
    "cancelada",
    "paga",
  ]);
});

test("data YYYY-MM-DD não escorrega o dia e recebida no Asaas sai da cobrança", () => {
  assert.equal(faturaForaDaCobranca({ rawStatus: "RECEIVED", normalizedStatus: "NF_EMITIDA" }), true);
  assert.equal(faturaForaDaCobranca({ normalizedStatus: "VENCIDO", rawStatus: "OVERDUE" }), false);
  const rows = [
    { id: "d19", dueDate: "2026-10-19", normalizedStatus: "VENCIDO" },
    { id: "d30", dueDate: "2026-10-30", normalizedStatus: "NF_EMITIDA" },
  ];
  assert.deepEqual(ordenarFaturas(rows, hoje).map((r) => r.id), ["d19", "d30"]);
});
