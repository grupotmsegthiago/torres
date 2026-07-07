import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

let handler: Handler | null = null;
let loadError: Error | null = null;

/**
 * Entrada leve versionada no git.
 * O backend pesado está em api/index.js (bundle esbuild gerado no build).
 * Healthcheck responde sem carregar o bundle.
 */
export default async function vercelEntry(req: VercelRequest, res: VercelResponse) {
  const pathOnly = (req.url || "").split("?")[0];
  if (pathOnly === "/healthz" || pathOnly === "/api/healthz") {
    return res.status(200).json({ ok: true, ts: Date.now() });
  }

  try {
    if (loadError) {
      return res.status(503).json({ error: "Backend indisponivel", detail: loadError.message });
    }
    if (!handler) {
      const bundleUrl = new URL("./index.js", import.meta.url).href;
      const mod = await import(bundleUrl);
      handler = mod.default as Handler;
    }
    return handler(req, res);
  } catch (e: unknown) {
    loadError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao carregar api/index.js:", loadError);
    return res.status(503).json({
      error: "Backend indisponivel",
      detail: loadError.message,
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
