import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPedagioConferidoLog,
  buildPedagioDePara,
  isEstimativaPedagio,
  mergeAjustesZeroEstimativa,
} from "./pedagio-conferencia";

describe("pedagio-conferencia", () => {
  it("buildPedagioConferidoLog registra total e ajustes", () => {
    const log = buildPedagioConferidoLog({
      actorName: "Operador",
      actorId: 7,
      totalDespesa: 42.5,
      adjustedIds: [11, 12],
      expenseCount: 2,
      estimado: 40,
      agentes: 42.5,
    });
    assert.equal(log.step, "pedagio_conferido");
    assert.equal(log.agentId, 7);
    assert.match(log.reason, /R\$ 42\.50/);
    assert.match(log.reason, /#11/);
    assert.match(log.reason, /#12/);
    assert.match(log.reason, /de\/para/);
    assert.match(log.reason, /estimado R\$ 40\.00/);
  });

  it("buildPedagioConferidoLog sem ajustes omite lista", () => {
    const log = buildPedagioConferidoLog({
      actorName: "Operador",
      actorId: 1,
      totalDespesa: 0,
      adjustedIds: [],
      expenseCount: 0,
    });
    assert.match(log.reason, /0 lançamento\(s\)/);
    assert.equal(log.reason.includes("ajustes:"), false);
  });

  it("isEstimativaPedagio detecta tag e descrição sem agente", () => {
    assert.equal(isEstimativaPedagio("[ESTIMATIVA_GOOGLE] Pedágio Ida", null), true);
    assert.equal(isEstimativaPedagio("Pedágio estimativa local", null), true);
    assert.equal(isEstimativaPedagio("Pedágio Anhanguera - foto", 12), false);
    assert.equal(isEstimativaPedagio("Pedágio Anhanguera", 12), false);
  });

  it("buildPedagioDePara separa estimado vs agente", () => {
    const d = buildPedagioDePara({
      osPedagioEstimado: 120,
      expenses: [
        { id: 1, amount: 120, description: "[ESTIMATIVA_GOOGLE] Pedágio", employeeId: null },
        { id: 2, amount: 55, description: "Pedágio agente 1", employeeId: 9 },
        { id: 3, amount: 60, description: "Pedágio agente 2", employeeId: 10 },
      ],
    });
    assert.equal(d.estimado, 120);
    assert.equal(d.agentes, 115);
    assert.equal(d.bateu, false);
    assert.deepEqual(d.estimativaIds, [1]);
    assert.deepEqual(d.agenteIds, [2, 3]);
  });

  it("mergeAjustesZeroEstimativa zera estimativa quando há agente", () => {
    const merged = mergeAjustesZeroEstimativa({
      expenses: [
        { id: 1, amount: 100, description: "[ESTIMATIVA_LOCAL] x", employeeId: null },
        { id: 2, amount: 95, description: "Agente", employeeId: 3 },
      ],
      ajustes: [{ id: 2, amount: 97 }],
    });
    const byId = Object.fromEntries(merged.map((a) => [a.id, a.amount]));
    assert.equal(byId[1], 0);
    assert.equal(byId[2], 97);
  });

  it("mergeAjustesZeroEstimativa não zera estimativa sem agente", () => {
    const merged = mergeAjustesZeroEstimativa({
      expenses: [{ id: 1, amount: 100, description: "[ESTIMATIVA_GOOGLE] x", employeeId: null }],
      ajustes: [{ id: 1, amount: 100 }],
    });
    assert.deepEqual(merged, [{ id: 1, amount: 100 }]);
  });
});
