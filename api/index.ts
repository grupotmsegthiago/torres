import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { getOrCreateApp } from "../server/create-app";

let appPromise: Promise<Express> | null = null;

function loadApp(): Promise<Express> {
  if (!appPromise) appPromise = getOrCreateApp();
  return appPromise;
}

/** Não retornar `app(req, res)` — o Express devolve o próprio app e a Vercel baixa ~4MB. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await loadApp();
  await new Promise<void>((resolve, reject) => {
    app(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
