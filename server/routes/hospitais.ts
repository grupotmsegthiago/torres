import type { Express } from "express";
import { requireAdminRole, requireAuth } from "../auth";
import { recommendHospitals, syncCnesHospitals } from "../lib/hospitais-cnes";

function parseCoord(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function registerHospitalRoutes(app: Express) {
  app.get("/api/mobile/hospitais", requireAuth, async (req, res) => {
    try {
      const lat = parseCoord(req.query.lat, -90, 90);
      const lng = parseCoord(req.query.lng, -180, 180);
      if (lat === null || lng === null) {
        return res.status(400).json({ message: "Latitude e longitude são obrigatórias." });
      }
      const pins = typeof req.query.pins === "string" ? req.query.pins : "";
      res.json(await recommendHospitals(lat, lng, pins));
    } catch (err: any) {
      console.error("[cnes] hospitais:", err?.message || err);
      res.status(500).json({ message: "Erro interno ao processar hospitais." });
    }
  });

  app.post("/api/admin/hospitais-cnes/sync", requireAdminRole, async (_req, res) => {
    try {
      res.json(await syncCnesHospitals());
    } catch (err: any) {
      console.error("[cnes] sync:", err?.message || err);
      res.status(500).json({ message: err?.message || "Falha ao carregar os hospitais." });
    }
  });
}
