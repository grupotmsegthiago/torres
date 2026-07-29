import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS_MES_COMERCIAL,
  buildFolhaAgentsView,
  findAgentByEmployeeId,
  rhPeriodScale,
  selectSalaryVigenteFromHistory,
  buildMemoriaCustoFuncionario,
} from "../client/src/lib/gestor-financeiro.ts";
import {
  selectSalaryVigenteFromHistory as selectSalaryServer,
  endOfMonthYmd,
} from "../server/lib/payroll.ts";

test("bug reproduzido: 6000 × 31/30 = 6200 (escala por calendário)", () => {
  assert.equal(+(6000 * (31 / 30)).toFixed(2), 6200);
  assert.equal(+(6000 * rhPeriodScale(31)).toFixed(2), 6200);
});

test("mês comercial MONTH: costDays=30 → escala 1 → salário 6000", () => {
  assert.equal(DIAS_MES_COMERCIAL, 30);
  assert.equal(rhPeriodScale(30), 1);
  const view = buildFolhaAgentsView({
    porAgente: [{
      id: 50,
      name: "JULIANA SANTANA PRATES VIEIRA",
      salarioBaseCheio: 6000,
      salarioProporcional: 6000,
      total: 6000,
      totalOperacional: 6000,
      effectiveDate: "2026-06-26",
      salaryRecordId: 99,
    }],
    costDays: 30,
    custoEmpresaTotal: 6000,
  });
  assert.equal(view.length, 1);
  assert.equal(view[0].salarioBaseCheio, 6000);
  assert.equal(view[0].custoTotal, 6000);
  assert.equal(view[0].custoDiario, 200); // 6000 ÷ 30
});

test("calendário 31d NÃO deve ser usado como costDays no MONTH", () => {
  const buggy = buildFolhaAgentsView({
    porAgente: [{ id: 1, name: "X", salarioBaseCheio: 6000, salarioProporcional: 6000, total: 6000, totalOperacional: 6000 }],
    costDays: 31, // errado para MONTH
  });
  assert.equal(+buggy[0].custoTotal.toFixed(2), 6200);
  const ok = buildFolhaAgentsView({
    porAgente: [{ id: 1, name: "X", salarioBaseCheio: 6000, salarioProporcional: 6000, total: 6000, totalOperacional: 6000 }],
    costDays: 30,
  });
  assert.equal(ok[0].salarioBaseCheio, 6000);
  assert.equal(ok[0].custoTotal, 6000);
});

test("salário base contratual não é reescalado; custo sim", () => {
  const view = buildFolhaAgentsView({
    porAgente: [{
      id: 1,
      name: "A",
      salarioBaseCheio: 6000,
      salarioProporcional: 6000,
      total: 6000,
      totalOperacional: 6000,
      fgts: 480,
    }],
    costDays: 15, // meio período comercial
  });
  assert.equal(view[0].salarioBaseCheio, 6000);
  assert.equal(view[0].custoTotal, 3000);
  assert.equal(view[0].fgts, 240);
});

test("painel: seleção por employee_id — Juliana ≠ Mickael", () => {
  const agents = [
    { id: 10, name: "Mickael Santos Soria", salarioBaseCheio: 5166.67 },
    { id: 50, name: "JULIANA SANTANA PRATES VIEIRA", salarioBaseCheio: 6000 },
  ];
  const juliana = findAgentByEmployeeId(agents, 50);
  const mickael = findAgentByEmployeeId(agents, 10);
  assert.equal(juliana?.name, "JULIANA SANTANA PRATES VIEIRA");
  assert.equal(juliana?.salarioBaseCheio, 6000);
  assert.equal(mickael?.name, "Mickael Santos Soria");
  assert.notEqual(juliana?.id, mickael?.id);
});

test("troca rápida Juliana → Mickael → Juliana resolve só por ID", () => {
  const agents = [
    { id: 50, name: "Juliana" },
    { id: 10, name: "Mickael" },
  ];
  let selected: number | null = 50;
  assert.equal(findAgentByEmployeeId(agents, selected)?.name, "Juliana");
  selected = 10;
  assert.equal(findAgentByEmployeeId(agents, selected)?.name, "Mickael");
  selected = 50;
  assert.equal(findAgentByEmployeeId(agents, selected)?.name, "Juliana");
  // resposta antiga / ID inválido não cai no primeiro da lista
  assert.equal(findAgentByEmployeeId(agents, 999), null);
  assert.equal(findAgentByEmployeeId(agents, null), null);
});

test("mesmo nome: vínculo só por ID", () => {
  const agents = [
    { id: 1, name: "João Silva" },
    { id: 2, name: "João Silva" },
  ];
  assert.equal(findAgentByEmployeeId(agents, 2)?.id, 2);
  assert.equal(findAgentByEmployeeId(agents, 1)?.id, 1);
});

test("vigência: escolhe último effective_date ≤ referência", () => {
  const rows = [
    { id: 1, effective_date: "2025-01-01", base_salary: "5000", created_at: "2025-01-01" },
    { id: 2, effective_date: "2026-06-26", base_salary: "6000", created_at: "2026-06-26" },
    { id: 3, effective_date: "2026-08-01", base_salary: "7000", created_at: "2026-08-01" },
  ];
  const jul = selectSalaryVigenteFromHistory(rows, "2026-07-31");
  assert.equal(jul?.id, 2);
  assert.equal(Number(jul?.base_salary), 6000);
  const server = selectSalaryServer(rows, "2026-07-31");
  assert.equal(server?.id, 2);
});

test("vigência: registro futuro ignorado", () => {
  const rows = [
    { id: 1, effective_date: "2026-06-26", base_salary: "6000" },
    { id: 2, effective_date: "2026-08-15", base_salary: "9999" },
  ];
  assert.equal(selectSalaryVigenteFromHistory(rows, "2026-07-31")?.id, 1);
});

test("vigência: registro duplicado mesma data → maior id/created_at", () => {
  const rows = [
    { id: 10, effective_date: "2026-06-26", base_salary: "6200", created_at: "2026-06-26T10:00:00Z" },
    { id: 11, effective_date: "2026-06-26", base_salary: "6000", created_at: "2026-06-26T12:00:00Z" },
  ];
  const v = selectSalaryVigenteFromHistory(rows, "2026-07-31");
  assert.equal(v?.id, 11);
  assert.equal(Number(v?.base_salary), 6000);
});

test("vigência: sem histórico → null", () => {
  assert.equal(selectSalaryVigenteFromHistory([], "2026-07-31"), null);
  assert.equal(selectSalaryVigenteFromHistory([{ id: 1, effective_date: "2027-01-01", base_salary: "1" }], "2026-07-31"), null);
});

test("endOfMonthYmd julho/2026 = 2026-07-31", () => {
  assert.equal(endOfMonthYmd(2026, 7), "2026-07-31");
  assert.equal(endOfMonthYmd(2026, 2), "2026-02-28");
});

test("funcionário sem missões → custo/missão 0 e UI usa —", () => {
  const view = buildFolhaAgentsView({
    porAgente: [{ id: 1, name: "A", salarioBaseCheio: 6000, salarioProporcional: 6000, total: 6000, totalOperacional: 6000 }],
    costDays: 30,
    opsAgents: [{ id: 1, missions: 0, fat_total: 0 }],
  });
  assert.equal(view[0].missoes, 0);
  assert.equal(view[0].custoMissao, 0);
});

test("missões só por employee_id (não por nome)", () => {
  const view = buildFolhaAgentsView({
    porAgente: [{ id: 50, name: "Juliana", salarioBaseCheio: 6000, salarioProporcional: 6000, total: 6000, totalOperacional: 6000 }],
    costDays: 30,
    opsAgents: [{ id: 99, name: "Juliana", missions: 5, fat_total: 1000 }],
  });
  assert.equal(view[0].missoes, 0);
  assert.equal(view[0].receita, 0);
});

test("custo com encargos rateados no período", () => {
  const view = buildFolhaAgentsView({
    porAgente: [{
      id: 1,
      name: "CLT",
      salarioBaseCheio: 3000,
      salarioProporcional: 3000,
      total: 4500,
      totalOperacional: 4500,
      fgts: 240,
      totalProvisoes: 500,
    }],
    costDays: 30,
  });
  assert.equal(view[0].salarioBaseCheio, 3000);
  assert.equal(view[0].custoTotal, 4500);
  assert.notEqual(view[0].salarioBaseCheio, view[0].custoTotal);
});

test("memória de cálculo carrega da fonte do agente (sem hardcode)", () => {
  const agent = buildFolhaAgentsView({
    porAgente: [{
      id: 50,
      name: "JULIANA SANTANA PRATES VIEIRA",
      salarioBaseCheio: 6000,
      salarioProporcional: 6000,
      total: 6000,
      totalOperacional: 6000,
      effectiveDate: "2026-06-26",
      salaryRecordId: 77,
      totalBruto: 6000,
      fgts: 0,
      totalProvisoes: 0,
    }],
    costDays: 30,
  })[0];
  const mem = buildMemoriaCustoFuncionario(agent, "julho de 2026", "2026-07-29T12:00:00Z");
  assert.match(mem.notes!.join("\n"), /6\.000/);
  assert.match(mem.notes!.join("\n"), /2026-06-26/);
  assert.match(mem.filters.join(" "), /employee_id=50/);
  assert.ok(!mem.notes!.some((n) => n.includes("5166")));
});

test("IDs string/number coerentes na seleção", () => {
  const agents = [{ id: "50" as any, name: "Juliana" }];
  assert.equal(findAgentByEmployeeId(agents, 50)?.name, "Juliana");
});
