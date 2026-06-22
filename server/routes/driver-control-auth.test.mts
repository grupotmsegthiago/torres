import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { supabaseAdmin } from "../supabase.js";
import { registerDriverControlRoutes } from "./driver-control.js";

// IDs sintéticos altos para não colidir com dados reais de produção.
const VEHICLE_ID = 990132;
const DRIVER_ID = 990001;
const PARTNER_ID = 990002;
const UNRELATED_ID = 990003;

// Usuários simulados (o que requireAuth normalmente injetaria em req.user).
const userDriver = { id: 1, name: "TESTE Condutor", role: "funcionario", employeeId: DRIVER_ID };
const userPartner = { id: 2, name: "TESTE Parceiro", role: "funcionario", employeeId: PARTNER_ID };
const userUnrelated = { id: 3, name: "TESTE Terceiro", role: "funcionario", employeeId: UNRELATED_ID };
const userAdmin = { id: 4, name: "TESTE Admin", role: "admin", employeeId: 990099 };

// Sobe um Express mínimo: um middleware lê o header x-test-user e popula req.user
// ANTES de requireAuth (que só checa req.user). Assim exercitamos os handlers reais
// (incl. isSessionParticipant) sem precisar de token/JWT do Supabase.
function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const raw = req.headers["x-test-user"];
    if (typeof raw === "string" && raw.length > 0) {
      (req as any).user = JSON.parse(raw);
    }
    next();
  });
  registerDriverControlRoutes(app);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function call(baseUrl: string, path: string, user: any, body: any = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": JSON.stringify(user) },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function seed(sessionId?: number) {
  const ins = await supabaseAdmin.from("driver_sessions").insert({
    vehicle_id: VEHICLE_ID,
    driver_id: DRIVER_ID,
    driver_name: userDriver.name,
    partner_id: PARTNER_ID,
    partner_name: userPartner.name,
    status: "ativo",
    started_at: new Date().toISOString(),
  }).select("id").single();
  if (ins.error) throw new Error(`seed session falhou: ${ins.error.message}`);
  const id = ins.data.id as number;
  const shift = await supabaseAdmin.from("driver_shifts").insert({
    session_id: id,
    driver_id: DRIVER_ID,
    driver_name: userDriver.name,
    started_at: new Date().toISOString(),
    is_active: true,
  });
  if (shift.error) throw new Error(`seed shift falhou: ${shift.error.message}`);
  return id;
}

async function cleanup(id: number) {
  await supabaseAdmin.from("driver_shifts").delete().eq("session_id", id);
  await supabaseAdmin.from("driver_sessions").delete().eq("id", id);
}

test("driver-control swap/end: só condutor/parceiro/admin podem agir (terceiro → 403)", async () => {
  const srv = await startTestServer();
  let id: number | undefined;
  try {
    id = await seed();

    // SWAP — terceiro não relacionado deve receber 403 (sem mutar estado).
    assert.equal(await call(srv.baseUrl, `/api/driver-sessions/${id}/swap`, userUnrelated), 403,
      "terceiro não relacionado deveria receber 403 no swap");

    // SWAP — condutor pode agir (200). Troca o turno ativo para o parceiro.
    assert.equal(await call(srv.baseUrl, `/api/driver-sessions/${id}/swap`, userDriver), 200,
      "condutor deveria conseguir trocar (200)");

    // SWAP — parceiro também participa da sessão e pode agir (200). Volta para o condutor.
    assert.equal(await call(srv.baseUrl, `/api/driver-sessions/${id}/swap`, userPartner), 200,
      "parceiro deveria conseguir trocar (200)");

    // END — terceiro não relacionado deve receber 403 (sessão segue ativa).
    assert.equal(
      await call(srv.baseUrl, `/api/driver-sessions/${id}/end`, userUnrelated, { signatureConfirmed: true }),
      403, "terceiro não relacionado deveria receber 403 no end");

    // END — admin pode encerrar (200).
    assert.equal(
      await call(srv.baseUrl, `/api/driver-sessions/${id}/end`, userAdmin, { signatureConfirmed: true, kmEnd: 0 }),
      200, "admin deveria conseguir encerrar (200)");
  } finally {
    if (id !== undefined) await cleanup(id);
    await srv.close();
  }
});

test("driver-control end: condutor da sessão pode encerrar (200)", async () => {
  const srv = await startTestServer();
  let id: number | undefined;
  try {
    id = await seed();
    assert.equal(
      await call(srv.baseUrl, `/api/driver-sessions/${id}/end`, userDriver, { signatureConfirmed: true, kmEnd: 0 }),
      200, "condutor deveria conseguir encerrar a própria sessão (200)");
  } finally {
    if (id !== undefined) await cleanup(id);
    await srv.close();
  }
});
