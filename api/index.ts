import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { getOrCreateApp } from "../server/create-app.js";

let app: Express | null = null;
let bootError: Error | null = null;

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
    // VercelResponse não implementa res.on() — não usar serverless-http nem runExpress.
    app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
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
