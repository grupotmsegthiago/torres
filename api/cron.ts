import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

let handler: Handler | null = null;

export default async function vercelCronEntry(req: VercelRequest, res: VercelResponse) {
  if (!handler) {
    const bundleUrl = new URL("./cron.js", import.meta.url).href;
    const mod = await import(bundleUrl);
    handler = mod.default as Handler;
  }
  return handler(req, res);
}
