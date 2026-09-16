import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertVehicleSchema, vehicles } from "@shared/schema";
  import * as apibrasil from "../apibrasil";
  import { notifyVehicleMaintenance } from "../notifications";
  import {
    insuranceColumn,
    parseInsuranceKind,
    signVehicleInsuranceDoc,
    uploadVehicleInsuranceDoc,
  } from "../lib/vehicle-doc-storage";

function stripInsuranceDataUrls<T extends Record<string, any>>(body: T): T {
  const next = { ...body };
  for (const k of ["insurancePolicyFile", "insuranceContractFile"] as const) {
    if (typeof next[k] === "string" && next[k].startsWith("data:")) delete next[k];
  }
  return next;
}

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
    const parsed = insertVehicleSchema.safeParse(stripInsuranceDataUrls(req.body || {}));
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicle(parsed.data);
    if (data.plate) {
      apibrasil.autoConsultaVeiculo(data.plate, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/vehicles/:id", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertVehicleSchema.partial().safeParse(stripInsuranceDataUrls(req.body || {}));
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const id = Number(req.params.id);
    const previous = await storage.getVehicle(id);
    const data = await storage.updateVehicle(id, parsed.data);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    if (previous && previous.status !== "manutenção" && data.status === "manutenção") {
      const reason = (req.body?.maintenanceReason as string) || "marcado manualmente como em manutenção";
      notifyVehicleMaintenance({ id: data.id, plate: data.plate, model: data.model, km: data.km }, reason).catch((e) => console.error("[notify-maint] async err:", e?.message));
    }
    res.json(data);
  });

  app.patch("/api/vehicles/:id/km", requireAuth, async (req, res) => {
    const { km, initialKm } = req.body;
    const updates: any = {};
    if (km !== undefined) updates.km = Number(km);
    if (initialKm !== undefined) updates.initialKm = Number(initialKm);
    updates.lastKmUpdate = new Date();
    const vehicle = await storage.getVehicle(Number(req.params.id));
    let triggeredAutoMaint = false;
    let kmRodadosCalc = 0;
    if (vehicle && km !== undefined) {
      const lastOilKm = (vehicle as any).lastOilChangeKm || 0;
      const kmRodados = Number(km) - lastOilKm;
      kmRodadosCalc = kmRodados;
      if (kmRodados >= 9000 && vehicle.status !== "manutenção") {
        updates.status = "manutenção";
        triggeredAutoMaint = true;
        console.log(`[auto-maint] Vehicle ${vehicle.plate} reached ${kmRodados} km since last oil change, auto-set to manutenção`);
      }
    }
    const data = await storage.updateVehicle(Number(req.params.id), updates);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    if (triggeredAutoMaint) {
      notifyVehicleMaintenance(
        { id: data.id, plate: data.plate, model: data.model, km: data.km },
        `troca de óleo necessária — ${kmRodadosCalc.toLocaleString("pt-BR")} km desde a última troca`
      ).catch((e) => console.error("[notify-maint] async err:", e?.message));
    }
    res.json(data);
  });

  app.post("/api/vehicles/:id/insurance/:kind", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const kind = parseInsuranceKind(req.params.kind);
      if (!kind) return res.status(400).json({ message: "Tipo inválido. Use policy ou contract." });
      const vehicle = await storage.getVehicle(id);
      if (!vehicle) return res.status(404).json({ message: "Veículo não encontrado" });
      const { fileBase64, fileName, contentType } = req.body || {};
      if (!fileBase64 || !fileName) return res.status(400).json({ message: "fileBase64 e fileName são obrigatórios" });
      const path = await uploadVehicleInsuranceDoc({
        vehicleId: id,
        kind,
        fileBase64: String(fileBase64),
        fileName: String(fileName),
        contentType: contentType ? String(contentType) : null,
      });
      const data = await storage.updateVehicle(id, { [insuranceColumn(kind)]: path } as any);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Falha ao anexar documento de seguro" });
    }
  });

  app.get("/api/vehicles/:id/insurance/:kind/url", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const kind = parseInsuranceKind(req.params.kind);
      if (!kind) return res.status(400).json({ message: "Tipo inválido. Use policy ou contract." });
      const vehicle = await storage.getVehicle(id);
      if (!vehicle) return res.status(404).json({ message: "Veículo não encontrado" });
      const stored = (vehicle as any)[insuranceColumn(kind)];
      if (!stored) return res.status(404).json({ message: "Documento não anexado" });
      const url = await signVehicleInsuranceDoc(String(stored));
      if (!url) return res.status(404).json({ message: "Não foi possível abrir o documento" });
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/vehicles/:id/insurance/:kind", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const kind = parseInsuranceKind(req.params.kind);
    if (!kind) return res.status(400).json({ message: "Tipo inválido. Use policy ou contract." });
    const vehicle = await storage.getVehicle(id);
    if (!vehicle) return res.status(404).json({ message: "Veículo não encontrado" });
    const data = await storage.updateVehicle(id, { [insuranceColumn(kind)]: null } as any);
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
  