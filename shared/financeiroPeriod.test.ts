import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodRange,
  filterTransactionsByPeriod,
  type PeriodFilterable,
} from "./financeiroPeriod.ts";

type Tx = PeriodFilterable & { id: string };

const tx = (id: string, status: string, due_date: string): Tx => ({ id, status, due_date });

test("periodRange retorna null para ALL (sem recorte)", () => {
  assert.equal(periodRange("ALL", "", "", "2026-06-08"), null);
});

test("periodRange DAY recorta no próprio dia", () => {
  assert.deepEqual(periodRange("DAY", "", "", "2026-06-08"), { start: "2026-06-08", end: "2026-06-08" });
});

test("periodRange MONTH cobre o mês inteiro", () => {
  assert.deepEqual(periodRange("MONTH", "", "", "2026-06-08"), { start: "2026-06-01", end: "2026-06-30" });
});

test("periodRange CUSTOM usa as datas informadas", () => {
  assert.deepEqual(periodRange("CUSTOM", "2026-01-10", "2026-03-20", "2026-06-08"), { start: "2026-01-10", end: "2026-03-20" });
});

test("filterTransactionsByPeriod: ALL devolve tudo", () => {
  const list = [tx("1", "PAID", "2020-01-01"), tx("2", "PENDING", "2026-06-08")];
  assert.equal(filterTransactionsByPeriod(list, "ALL", "", "", "2026-06-08").length, 2);
});

test("filterTransactionsByPeriod: MONTH recorta TUDO pela data de vencimento (sem exceção de pendente)", () => {
  const list = [
    tx("pago-mes", "PAID", "2026-06-15"),          // dentro do mês → fica
    tx("pago-fora", "PAID", "2026-04-15"),          // fora do mês → some
    tx("pend-mes", "PENDING", "2026-06-20"),        // pendente dentro do mês → fica
    tx("pend-vencido-fora", "PENDING", "2026-01-01"), // pendente vencido fora do mês → some
    tx("recusada-fora", "RECUSADA", "2026-04-01"),  // fora do mês → some
    tx("aguardando-fora", "AGUARDANDO_APROVACAO", "2025-12-01"), // fora do mês → some
  ];
  const out = filterTransactionsByPeriod(list, "MONTH", "", "", "2026-06-08").map(t => t.id).sort();
  assert.deepEqual(out, ["pago-mes", "pend-mes"]);
});

test("filterTransactionsByPeriod: CUSTOM inclui limites (>= start e <= end)", () => {
  const list = [
    tx("borda-ini", "PAID", "2026-01-10"),
    tx("borda-fim", "PAID", "2026-03-20"),
    tx("antes", "PAID", "2026-01-09"),
    tx("depois", "PAID", "2026-03-21"),
  ];
  const out = filterTransactionsByPeriod(list, "CUSTOM", "2026-01-10", "2026-03-20", "2026-06-08").map(t => t.id).sort();
  assert.deepEqual(out, ["borda-fim", "borda-ini"]);
});
