import type { VercelRequest, VercelResponse } from "@vercel/node";
import serverless from "serverless-http";
import { getOrCreateApp } from "../server/create-app";

let handler: ReturnType<typeof serverless> | null = null;
let bootError: Error | null = null;

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!handler) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
      const app = await getOrCreateApp();
      handler = serverless(app, { binary: true });
    }
    return handler(req, res);
  } catch (e: unknown) {
    bootError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao iniciar backend:", bootError);
    res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
