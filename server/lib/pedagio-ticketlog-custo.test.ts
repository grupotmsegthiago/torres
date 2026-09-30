import { test } from "node:test";
import assert from "node:assert/strict";
import { isPeriodoQuinzena, periodoQuinzena, resolverCustoTicketlog } from "./pedagio-ticketlog-custo.ts";

const dia = [{ periodo_inicio: "2026-09-30", periodo_fim: "2026-09-30", valor: 11974.42 }];

test("quinzena vai do dia 1 ao 15 e do 16 ao último dia", () => {
  assert.deepEqual(periodoQuinzena(2026, 9, 1), { inicio: "2026-09-01", fim: "2026-09-15" });
  assert.deepEqual(periodoQuinzena(2026, 9, 2), { inicio: "2026-09-16", fim: "2026-09-30" });
  assert.deepEqual(periodoQuinzena(2026, 10, 2), { inicio: "2026-10-16", fim: "2026-10-31" });
  assert.deepEqual(periodoQuinzena(2024, 2, 2), { inicio: "2024-02-16", fim: "2024-02-29" });
  assert.equal(isPeriodoQuinzena("2026-09-16", "2026-09-30"), true);
  assert.equal(isPeriodoQuinzena("2026-09-30", "2026-09-30"), false);
});

test("filtro do mesmo dia usa o valor salvo", () => {
  assert.equal(resolverCustoTicketlog("2026-09-30", "2026-09-30", dia), 11974.42);
});

test("semana e mês que incluem o dia entram com o valor salvo", () => {
  assert.equal(resolverCustoTicketlog("2026-09-28", "2026-10-04", dia), 11974.42);
  assert.equal(resolverCustoTicketlog("2026-09-01", "2026-09-30", dia), 11974.42);
});

test("dia de fora fica zerado", () => {
  assert.equal(resolverCustoTicketlog("2026-09-29", "2026-09-29", dia), 0);
});

test("mês salvo rateia na semana e não soma o dia de novo", () => {
  const rows = [
    { periodo_inicio: "2026-09-01", periodo_fim: "2026-09-30", valor: 3000 },
    { periodo_inicio: "2026-09-30", periodo_fim: "2026-09-30", valor: 100 },
  ];
  assert.equal(resolverCustoTicketlog("2026-09-01", "2026-09-30", rows), 3000);
  assert.equal(resolverCustoTicketlog("2026-09-30", "2026-09-30", rows), 100);
  assert.equal(resolverCustoTicketlog("2026-09-28", "2026-10-04", rows), 300);
});
