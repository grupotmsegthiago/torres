import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

let handler: Handler | null = null;
let loadError: Error | null = null;

/** Entrada versionada no git; o bundle pesado é gerado em api/index.js no build. */
export default async function vercelEntry(req: VercelRequest, res: VercelResponse) {
  try {
    if (loadError) {
      return res.status(503).json({ error: "Backend indisponivel", detail: loadError.message });
    }
    if (!handler) {
      const mod = await import("./index.js");
      handler = mod.default as Handler;
    }
    return handler(req, res);
  } catch (e: unknown) {
    loadError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao carregar api/index.js:", loadError);
    return res.status(503).json({ error: "Backend indisponivel", detail: loadError.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
