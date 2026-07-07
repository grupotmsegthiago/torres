import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { getOrCreateApp } from "../server/create-app.js";

let app: Express | null = null;
let bootError: Error | null = null;

/** Aguarda o Express terminar de responder (serverless-http trava com Express 5). */
function runExpress(app: Express, req: VercelRequest, res: VercelResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    res.on("finish", done);
    res.on("close", done);
    try {
      app(req as Parameters<Express>[0], res as Parameters<Express>[1], (err?: unknown) => {
        if (err && !settled) {
          settled = true;
          reject(err);
        }
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err);
      }
    }
  });
}

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  try {
    if (bootError) {
      res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
      return;
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
      res.status(503).json({ error: "Backend indisponivel", detail });
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
