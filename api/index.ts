import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getOrCreateApp } from "../server/create-app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getOrCreateApp();
  return app(req, res);
}
