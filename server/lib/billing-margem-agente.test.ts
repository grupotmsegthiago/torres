import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMargemAgenteFromBilling,
  buildCostSideRepairFromMissionCosts,
} from "./billing-margem-agente.js";

test("TOR-0783: margem do agente ignora combustível fantasma do billing", () => {
  const billing = {
    fat_total: 7926.43,
    pag_vrp: 0,
    pag_periculosidade: 0,
    pag_adicional_noturno: 0,
    pag_reembolsos: 104686.86,
    pag_total: 104686.86,
    despesas_combustivel: 104665.26,
    despesas_pedagio: 189,
    despesas_outras: 0,
    resultado_liquido: -96760.43,
  };
  const missionCosts = [
    { amount: 105.29, category: "Combustível", cost_type: "expense" },
    { amount: 112.29, category: "Combustível", cost_type: "expense" },
    { amount: 150.3, category: "Pedágio", cost_type: "expense" },
    { amount: 150.3, category: "Pedágio", cost_type: "revenue" },
  ];

  const m = computeMargemAgenteFromBilling(billing, missionCosts);
  assert.equal(m.billingCombustivelInflado, true);
  assert.equal(m.usedMissionCosts, true);
  assert.equal(m.combustivel, 217.58);
  assert.equal(m.pedagio, 150.3);
  assert.equal(m.despesas, 367.88);
  // fat - labor(0) - desp reais
  assert.equal(m.margemLiquida, 7558.55);

  // Share 50% (dupla) → lucro atribuído ao Tiago ≈ +R$ 3.779,28 (não -48k)
  assert.equal(+(m.margemLiquida * 0.5).toFixed(2), 3779.28);
});

test("buildCostSideRepairFromMissionCosts: repara só o lado custo", () => {
  const repair = buildCostSideRepairFromMissionCosts(
    {
      fat_total: 7926.43,
      pag_vrp: 0,
      despesas_combustivel: 104665.26,
      pag_reembolsos: 104686.86,
    },
    [
      { amount: 217.58, category: "Combustível", cost_type: "expense" },
      { amount: 150.3, category: "Pedágio", cost_type: "expense" },
    ],
  );
  assert.equal(repair.despesas_combustivel, 217.58);
  assert.equal(repair.pag_reembolsos, 367.88);
  assert.equal(repair.pag_total, 367.88);
  assert.equal(repair.resultado_liquido, 7558.55);
  assert.equal(repair.resultado_bruto, 7558.55);
});

test("sem mission_costs: usa componentes do billing (sem inventar)", () => {
  const m = computeMargemAgenteFromBilling(
    {
      fat_total: 1000,
      pag_vrp: 150,
      despesas_combustivel: 80,
      despesas_pedagio: 20,
      despesas_outras: 0,
      resultado_liquido: -999,
    },
    [],
  );
  assert.equal(m.usedMissionCosts, false);
  assert.equal(m.billingCombustivelInflado, false);
  assert.equal(m.margemLiquida, 750); // 1000 - 150 - 80 - 20
});
