import type { Express, Request, Response } from "express";
import { getComissaoIngestConfig, syncAllComissoesToTmSeg } from "../lib/comissao-ingest";

function extractToken(req: Request): string {
  const headers = req.headers || {};
  const rawAuth = String(headers.authorization || headers.Authorization || "");
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : "";
  return String(
    headers["x-comissao-ingest-token"] ||
    headers["x-cron-secret"] ||
    bearer ||
    "",
  ).trim();
}

export function registerComissaoPushRoutes(app: Express): void {
  app.post("/api/comissoes/push-tm-seg", async (req: Request, res: Response) => {
    const cfg = getComissaoIngestConfig();
    const token = extractToken(req);
    if (!cfg.configured || !token || token !== cfg.token) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    try {
      const result = await syncAllComissoesToTmSeg();
      return res.status(200).json({ ok: result.ok !== false, ...result });
    } catch (err: any) {
      return res.status(200).json({ ok: false, error: err?.message || "falha no envio para a TM SEG" });
    }
  });
}
