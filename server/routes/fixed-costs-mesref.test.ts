// Regressão: o mesRef calculado pelo /api/fixed-costs/rh-summary precisa ser
// o MÊS DE FECHAMENTO da competência (26→25), não o mês do início (`from`).
// Bug histórico (26/05/2026): mesRef = from.slice(0,7) gerou competência
// deslocada em 1 ciclo — buildFolhaStats e jornada_calculos liam mês errado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPayrollPeriodForDate } from "../../shared/payroll-period";
import { payrollPeriodRange } from "./holidays";

test("mesRef do rh-summary: deve ser o mês de fechamento (to.slice 0,7), não o mês do from", () => {
  // Cenário 1: hoje é dentro do ciclo (entre dia 1 e 25 do mês)
  // Ex: hoje = 15/05/2026 → competência = 2026-05 (ciclo 26/04 → 25/05)
  const d1 = new Date(Date.UTC(2026, 4, 15, 12)); // 15/05/2026
  const pp1 = getPayrollPeriodForDate(d1);
  assert.equal(pp1.startDate, "2026-04-26", "from deve ser 26 do mês anterior");
  assert.equal(pp1.endDate, "2026-05-25", "to deve ser 25 do mês corrente");
  assert.equal(pp1.endDate.slice(0, 7), "2026-05", "mesRef CORRETO via to");
  assert.notEqual(pp1.startDate.slice(0, 7), pp1.endDate.slice(0, 7),
    "from e to estão em meses diferentes — confirma o risco de usar from");

  // Cenário 2: virada de ano (jan)
  const d2 = new Date(Date.UTC(2026, 0, 10, 12)); // 10/01/2026
  const pp2 = getPayrollPeriodForDate(d2);
  assert.equal(pp2.startDate, "2025-12-26");
  assert.equal(pp2.endDate, "2026-01-25");
  assert.equal(pp2.endDate.slice(0, 7), "2026-01", "mesRef janeiro/2026 (não dez/2025)");

  // Cenário 3: bate com payrollPeriodRange (year, month) — month é o de fechamento
  const r = payrollPeriodRange(2026, 5);
  assert.equal(r.from, "2026-04-26");
  assert.equal(r.to, "2026-05-25");
  assert.equal(r.to.slice(0, 7), "2026-05");
});
