import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertVehicleSchema, vehicles } from "@shared/schema";
  import * as apibrasil from "../apibrasil";


  export function registerVehicleRoutes(app: Express) {
    app.get("/api/vehicles", requireAuth, async (_req, res) => {
    const data = await storage.getVehicles();
    res.json(data);
  });

  app.get("/api/vehicles/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicle(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.post("/api/vehicles", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicle(parsed.data);
    if (data.plate) {
      apibrasil.autoConsultaVeiculo(data.plate, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/vehicles/:id", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertVehicleSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicle(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.patch("/api/vehicles/:id/km", requireAuth, async (req, res) => {
    const { km, initialKm } = req.body;
    const updates: any = {};
    if (km !== undefined) updates.km = Number(km);
    if (initialKm !== undefined) updates.initialKm = Number(initialKm);
    updates.lastKmUpdate = new Date();
    const vehicle = await storage.getVehicle(Number(req.params.id));
    if (vehicle && km !== undefined) {
      const lastOilKm = (vehicle as any).lastOilChangeKm || 0;
      const kmRodados = Number(km) - lastOilKm;
      if (kmRodados >= 9000 && vehicle.status !== "manutenção") {
        updates.status = "manutenção";
        console.log(`[auto-maint] Vehicle ${vehicle.plate} reached ${kmRodados} km since last oil change, auto-set to manutenção`);
      }
    }
    const data = await storage.updateVehicle(Number(req.params.id), updates);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.delete("/api/vehicles/:id", requireAuth, requireDiretoria, async (req, res) => {
    const vehId = Number(req.params.id);
    try {
      await supabaseAdmin.from("vehicle_assignments").delete().eq("vehicle_id", vehId);
      await storage.deleteVehicle(vehId);
      res.json({ message: "Veículo removido" });
    } catch (err: any) {
      console.error("Erro ao remover veículo:", err.message);
      res.status(500).json({ message: "Erro ao remover. Existem OS vinculadas a este veículo." });
    }
  });


  }
  