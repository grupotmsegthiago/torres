import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { getOrCreateApp } from "../server/create-app.js";

let app: Express | null = null;
let bootError: Error | null = null;

/**
 * Espera o Express terminar sem usar res.on() —
 * VercelResponse não é Node ServerResponse (res.on is not a function).
 */
function runExpress(appInstance: Express, req: VercelRequest, res: VercelResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const originalEnd = res.end.bind(res);
    (res as { end: (...args: unknown[]) => unknown }).end = (...args: unknown[]) => {
      const out = originalEnd(...args);
      done();
      return out;
    };

    try {
      appInstance(req as Parameters<Express>[0], res as Parameters<Express>[1], (err?: unknown) => {
        if (err) done(err);
        else if (res.headersSent) done();
      });
    } catch (err) {
      done(err);
    }
  });
}

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  const pathOnly = (req.url || "").split("?")[0];
  if (pathOnly === "/healthz" || pathOnly === "/api/healthz") {
    return res.status(200).json({ ok: true, ts: Date.now() });
  }

  try {
    if (bootError) {
      return res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
    }
    if (!app) {
      app = await getOrCreateApp();
    }
    await runExpress(app, req, res);
  } catch (e: unknown) {
    if (!app) {
      bootError = e instanceof Error ? e : new Error(String(e));
      console.error("[Vercel] Falha ao iniciar backend:", bootError);
    } else {
      console.error("[Vercel] Erro no request:", e);
    }
    if (!res.headersSent) {
      const detail = e instanceof Error ? e.message : String(e);
      return res.status(503).json({ error: "Backend indisponivel", detail });
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
