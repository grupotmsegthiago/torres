import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPedagioConferidoLog } from "./pedagio-conferencia";

describe("pedagio-conferencia", () => {
  it("buildPedagioConferidoLog registra total e ajustes", () => {
    const log = buildPedagioConferidoLog({
      actorName: "Operador",
      actorId: 7,
      totalDespesa: 42.5,
      adjustedIds: [11, 12],
      expenseCount: 2,
    });
    assert.equal(log.step, "pedagio_conferido");
    assert.equal(log.agentId, 7);
    assert.match(log.reason, /R\$ 42\.50/);
    assert.match(log.reason, /#11/);
    assert.match(log.reason, /#12/);
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
});
