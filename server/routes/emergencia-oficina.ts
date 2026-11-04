import type { Express } from "express";
import { requireAuth } from "../auth";
import { recommendOficinas } from "../lib/emergencia-oficina";

function parseCoord(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function registerEmergenciaOficinaRoutes(app: Express) {
  app.get("/api/mobile/emergencia-oficina", requireAuth, async (req, res) => {
    try {
      const lat = parseCoord(req.query.lat, -90, 90);
      const lng = parseCoord(req.query.lng, -180, 180);
      if (lat === null || lng === null) {
        return res.status(400).json({ message: "Latitude e longitude são obrigatórias." });
      }
      res.json(await recommendOficinas(lat, lng));
    } catch (err: any) {
      console.error("[oficina] emergencia:", err?.message || err);
      res.status(500).json({ message: "Erro interno ao processar borracharia e mecânico." });
    }
  });
}
