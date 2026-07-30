/**
 * Integração HTTP: direction obrigatória no lançamento/edição manual.
 * Espelha as regras da rota real com o mesmo helper (sem escrita em banco).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { parseRequiredManualDirection } from "../lib/punch-direction";
import {
  recordManualDirectionRejected,
  resetDirectionMetrics,
  getDirectionMetrics,
} from "../lib/punch-direction-metrics";

const calls: { fn: string; args: any }[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/control-id/manual-punch", async (req, res) => {
    const { employeeId, punchAt, direction } = req.body || {};
    if (!employeeId) return res.status(400).json({ message: "employeeId não identificado" });
    if (!punchAt) return res.status(400).json({ message: "punchAt obrigatório" });
    const dirCheck = parseRequiredManualDirection(direction);
    if (!dirCheck.ok) {
      recordManualDirectionRejected(dirCheck.error);
      return res.status(400).json({ message: dirCheck.error, code: "INVALID_DIRECTION" });
    }
    calls.push({
      fn: "createManualPunch",
      args: { employeeId: Number(employeeId), punchAt, direction: dirCheck.direction },
    });
    res.status(201).json({ punchId: 1, rhidSynced: false });
  });

  app.patch("/api/control-id/punches/:id", async (req, res) => {
    const { punchAt, direction } = req.body || {};
    const fields: any = {};
    if (punchAt) fields.punchAt = punchAt;
    if (direction !== undefined) {
      const dirCheck = parseRequiredManualDirection(direction);
      if (!dirCheck.ok) {
        recordManualDirectionRejected(dirCheck.error);
        return res.status(400).json({ message: dirCheck.error, code: "INVALID_DIRECTION" });
      }
      fields.direction = dirCheck.direction;
    }
    calls.push({ fn: "updateLocalPunch", args: { id: Number(req.params.id), fields } });
    res.json({ ok: true, rhidSynced: false });
  });

  return app;
}

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no addr");
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("HTTP manual-punch direction", () => {
  let server: Server;
  let base: string;

  before(async () => {
    resetDirectionMetrics();
    calls.length = 0;
    ({ server, base } = await listen(buildApp()));
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("POST sem direction → 400 e não cria", async () => {
    calls.length = 0;
    const r = await fetch(`${base}/api/control-id/manual-punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: 22,
        punchAt: "2026-07-28T12:00:00.000Z",
      }),
    });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.code, "INVALID_DIRECTION");
    assert.equal(calls.length, 0);
  });

  it("POST direction=unknown → 400", async () => {
    const r = await fetch(`${base}/api/control-id/manual-punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: 22,
        punchAt: "2026-07-28T12:00:00.000Z",
        direction: "unknown",
      }),
    });
    assert.equal(r.status, 400);
  });

  it("POST direction=in → 201", async () => {
    calls.length = 0;
    const r = await fetch(`${base}/api/control-id/manual-punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: 22,
        punchAt: "2026-07-28T12:00:00.000Z",
        direction: "in",
      }),
    });
    assert.equal(r.status, 201);
    assert.equal(calls[0]?.args.direction, "in");
  });

  it("PATCH direction=unknown → 400", async () => {
    const r = await fetch(`${base}/api/control-id/punches/9`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "unknown" }),
    });
    assert.equal(r.status, 400);
  });

  it("métricas registram rejeições manuais", () => {
    const m = getDirectionMetrics();
    assert.ok(m.manualRejectedUnknown >= 2);
  });
});
