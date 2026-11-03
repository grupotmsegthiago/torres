import type { Express } from "express";
import { requireAdminRole, requireAuth } from "../auth";
import { recommendStations, syncAnpReference } from "../lib/anp-onde-abastecer";

function parseCoord(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function registerAnpStationRoutes(app: Express) {
  app.get("/api/mobile/onde-abastecer", requireAuth, async (req, res) => {
    try {
      const lat = parseCoord(req.query.lat, -90, 90);
      const lng = parseCoord(req.query.lng, -180, 180);
      if (lat === null || lng === null) {
        return res.status(400).json({ message: "Latitude e longitude são obrigatórias." });
      }
      const payload = await recommendStations(lat, lng);
      res.json(payload);
    } catch (err: any) {
      console.error("[anp] recomendação:", err?.message || err);
      res.status(500).json({ message: "Erro interno ao processar postos." });
    }
  });

  app.post("/api/admin/anp-stations/sync", requireAdminRole, async (_req, res) => {
    try {
      const result = await syncAnpReference();
      res.json(result);
    } catch (err: any) {
      console.error("[anp] sync:", err?.message || err);
      res.status(500).json({ message: err?.message || "Falha ao carregar a ANP." });
    }
  });
}
