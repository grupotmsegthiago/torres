import type { Express } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { processDiariasJornadaLonga } from "../jobs/diarias-jornada-longa";

export function registerDiariasJornadaLongaRoutes(app: Express) {
  // GET — preview/relatório do que foi (ou seria) gerado num dia.
  // Como o processamento é idempotente, GET pode invocar o processamento
  // direto: chamadas repetidas não duplicam diárias.
  app.get("/api/diarias-jornada-longa", requireAuth, requireAdminRole, async (req, res) => {
    const date = (req.query.date as string) || new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Parâmetro 'date' deve ser YYYY-MM-DD" });
    }
    try {
      const r = await processDiariasJornadaLonga(date);
      res.json(r);
    } catch (e: any) {
      console.error("[diarias-jornada-longa] erro:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // POST — força processamento (mesma idempotência).
  app.post("/api/diarias-jornada-longa", requireAuth, requireAdminRole, async (req, res) => {
    const date = (req.body?.date as string) || (req.query.date as string);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Campo 'date' obrigatório (YYYY-MM-DD)" });
    }
    try {
      const r = await processDiariasJornadaLonga(date);
      res.json(r);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
