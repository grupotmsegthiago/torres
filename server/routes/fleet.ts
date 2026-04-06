import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireDiretoria } from "../auth";
  import { insertTripSchema, insertVehicleMaintenanceSchema, insertVehicleFuelingSchema, insertTimesheetSchema, vehicleFueling } from "@shared/schema";
  import { eq } from "drizzle-orm";
  import { logFinancialAudit } from "./_helpers";

  export function registerFleetRoutes(app: Express) {
    app.get("/api/trips", requireAuth, async (_req, res) => {
    const data = await storage.getTrips();
    res.json(data);
  });

  app.get("/api/trips/:id", requireAuth, async (req, res) => {
    const data = await storage.getTrip(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Viagem não encontrada" });
    res.json(data);
  });

  app.post("/api/trips", requireAuth, async (req, res) => {
    const parsed = insertTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createTrip(parsed.data);
    res.status(201).json(data);
  });

  app.patch("/api/trips/:id", requireAuth, async (req, res) => {
    const parsed = insertTripSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateTrip(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Viagem não encontrada" });
    res.json(data);
  });

  app.delete("/api/trips/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteTrip(Number(req.params.id));
    res.json({ message: "Viagem removida" });
  });

  app.get("/api/maintenance", requireAuth, async (_req, res) => {
    const data = await storage.getVehicleMaintenances();
    res.json(data);
  });

  app.get("/api/maintenance/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicleMaintenance(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Manutenção não encontrada" });
    res.json(data);
  });

  app.post("/api/maintenance", requireAuth, async (req, res) => {
    const parsed = insertVehicleMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicleMaintenance(parsed.data);

    if (data && Number(parsed.data.cost) > 0) {
      const vehicle = parsed.data.vehicleId ? await storage.getVehicle(parsed.data.vehicleId) : null;
      const plateStr = vehicle?.plate || "";
      await createAutoTransaction({
        description: `MANUTENÇÃO ${plateStr} - ${parsed.data.type} ${parsed.data.description || ""}`.toUpperCase().trim(),
        amount: Number(parsed.data.cost),
        type: "EXPENSE",
        due_date: parsed.data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "maintenance",
        origin_id: String(data.id),
        category_name: "Manutenção Veicular",
        entity_name: parsed.data.provider || null,
        created_by: "SISTEMA",
      });
    }

    res.status(201).json(data);
  });

  app.patch("/api/maintenance/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleMaintenanceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicleMaintenance(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Manutenção não encontrada" });

    const newCost = Number(data.cost || 0);
    if (newCost > 0) {
      await removeAutoTransaction("maintenance", String(data.id));
      const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;
      await createAutoTransaction({
        description: `MANUTENÇÃO ${vehicle?.plate || ""} - ${data.type} ${data.description || ""}`.toUpperCase().trim(),
        amount: newCost,
        type: "EXPENSE",
        due_date: data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "maintenance",
        origin_id: String(data.id),
        category_name: "Manutenção Veicular",
        entity_name: data.provider || null,
        created_by: "SISTEMA",
      });
    } else {
      await removeAutoTransaction("maintenance", String(data.id));
    }

    res.json(data);
  });

  app.delete("/api/maintenance/:id", requireAuth, requireDiretoria, async (req, res) => {
    const maintId = Number(req.params.id);
    await storage.deleteVehicleMaintenance(maintId);
    await removeAutoTransaction("maintenance", String(maintId));
    res.json({ message: "Manutenção removida" });
  });

  app.get("/api/fueling", requireAuth, async (_req, res) => {
    const data = await storage.getVehicleFuelings();
    res.json(data);
  });

  app.get("/api/fueling/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicleFueling(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    res.json(data);
  });

  async function syncVehicleKmFromFuelings(vehicleId: number) {
    const allFuelings = await storage.getVehicleFuelings();
    const vehicleFuelings = allFuelings.filter(f => f.vehicleId === vehicleId);
    if (vehicleFuelings.length === 0) return;
    const maxKm = Math.max(...vehicleFuelings.map(f => f.km));
    await storage.updateVehicle(vehicleId, {
      km: maxKm,
      lastKmUpdate: new Date(),
    } as any);
  }

  app.post("/api/fueling", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    if (parsed.data.vehicleId && parsed.data.km) {
      const vehicle = await storage.getVehicle(parsed.data.vehicleId);
      if (vehicle && parsed.data.km < vehicle.km) {
        return res.status(400).json({ message: `KM informado (${parsed.data.km}) é menor que o KM atual do veículo (${vehicle.km}). Verifique o hodômetro.` });
      }
      if (vehicle && vehicle.km > 0) {
        const kmDiff = parsed.data.km - vehicle.km;
        if (kmDiff > 1500) {
          return res.status(400).json({ message: `KM informado (${parsed.data.km}) é ${kmDiff} km a mais que o KM atual (${vehicle.km}). Diferença muito grande — verifique o hodômetro.` });
        }
      }
    }
    parsed.data.createdByUserId = req.user?.id || null;
    const data = await storage.createVehicleFueling(parsed.data);
    if (parsed.data.vehicleId) {
      await syncVehicleKmFromFuelings(parsed.data.vehicleId);
    }

    if (data && Number(parsed.data.totalCost) > 0) {
      const vehicle = parsed.data.vehicleId ? await storage.getVehicle(parsed.data.vehicleId) : null;
      const plateStr = vehicle?.plate || "";
      const driverEmp = parsed.data.driverId ? await storage.getEmployee(parsed.data.driverId) : null;
      const agentStr = driverEmp?.name ? ` - Agente: ${driverEmp.name}` : "";
      const fuelAmount = Number(parsed.data.totalCost);
      await createAutoTransaction({
        description: `ABASTECIMENTO ${plateStr}${agentStr} - ${parsed.data.fuelType || "gasolina"} ${parsed.data.liters}L`.toUpperCase().trim(),
        amount: fuelAmount,
        type: "EXPENSE",
        due_date: parsed.data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(data.id),
        category_name: "Combustível",
        entity_name: [plateStr, driverEmp?.name, parsed.data.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });

      if (parsed.data.vehicleId) {
        const { data: activeOs } = await supabaseAdmin.from("service_orders")
          .select("id, os_number")
          .eq("vehicle_id", parsed.data.vehicleId)
          .in("status", ["ativa", "em_andamento", "em andamento"])
          .order("created_at", { ascending: false })
          .limit(1);
        const linkedOsId = activeOs?.[0]?.id || null;
        if (linkedOsId) {
          await supabaseAdmin.from("mission_costs").insert({
            service_order_id: linkedOsId,
            vehicle_id: parsed.data.vehicleId,
            employee_id: parsed.data.driverId || null,
            category: "Combustível",
            description: `Abastecimento ${plateStr} - ${parsed.data.fuelType || "gasolina"} ${parsed.data.liters}L (${parsed.data.station || "posto"}) [F#${data.id}]`,
            amount: fuelAmount.toFixed(2),
            cost_type: "expense",
          });
          console.log(`[Fueling→DRE] Admin linked fueling #${data.id} R$${fuelAmount.toFixed(2)} to OS #${activeOs[0].os_number}`);
        }
      }
    }

    res.status(201).json(data);
  });

  app.patch("/api/fueling/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const oldFueling = await storage.getVehicleFueling(Number(req.params.id));
    const data = await storage.updateVehicleFueling(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    if (oldFueling) {
      const auditChanges: { field: string; old: any; new_val: any }[] = [];
      for (const f of ["km", "liters", "totalCost", "costPerLiter", "fuelType", "station"]) {
        const ov = (oldFueling as any)[f]; const nv = (data as any)[f];
        if (nv !== undefined && String(ov) !== String(nv)) auditChanges.push({ field: f, old: ov, new_val: nv });
      }
      if (auditChanges.length > 0) await logFinancialAudit("vehicle_fueling", String(data.id), "UPDATE", auditChanges, req.user?.name || "unknown", req.user?.id);
    }
    if (data.vehicleId) {
      await syncVehicleKmFromFuelings(data.vehicleId);
    }

    const newCost = Number(data.totalCost || 0);
    if (newCost > 0) {
      await removeAutoTransaction("fueling", String(data.id));
      const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;
      const driverEmp = data.driverId ? await storage.getEmployee(data.driverId) : null;
      const agentStr = driverEmp?.name ? ` - Agente: ${driverEmp.name}` : "";
      await createAutoTransaction({
        description: `ABASTECIMENTO ${vehicle?.plate || ""}${agentStr} - ${data.fuelType || "diesel"} ${data.liters}L`.toUpperCase().trim(),
        amount: newCost,
        type: "EXPENSE",
        due_date: data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(data.id),
        category_name: "Combustível",
        entity_name: [vehicle?.plate, driverEmp?.name, data.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });
    } else {
      await removeAutoTransaction("fueling", String(data.id));
    }

    res.json(data);
  });

  app.delete("/api/fueling/:id", requireAuth, requireDiretoria, async (req, res) => {
    const fuelingId = Number(req.params.id);
    const existing = await storage.getVehicleFueling(fuelingId);
    if (existing) {
      await logFinancialAudit("vehicle_fueling", String(fuelingId), "DELETE", [
        { field: "km", old: existing.km, new_val: null },
        { field: "liters", old: existing.liters, new_val: null },
        { field: "totalCost", old: existing.totalCost, new_val: null },
      ], req.user?.name || "unknown", req.user?.id, "Exclusão manual");
    }
    await storage.deleteVehicleFueling(fuelingId);
    if (existing?.vehicleId) {
      await syncVehicleKmFromFuelings(existing.vehicleId);
    }
    await removeAutoTransaction("fueling", String(fuelingId));
    res.json({ message: "Abastecimento removido" });
  });

  app.get("/api/timesheets", requireAuth, async (_req, res) => {
    const data = await storage.getTimesheets();
    res.json(data);
  });

  app.get("/api/timesheets/:id", requireAuth, async (req, res) => {
    const data = await storage.getTimesheet(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Ponto não encontrado" });
    res.json(data);
  });

  app.post("/api/timesheets", requireAuth, async (req, res) => {
    const parsed = insertTimesheetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createTimesheet(parsed.data);
    res.status(201).json(data);
  });

  app.patch("/api/timesheets/:id", requireAuth, async (req, res) => {
    const parsed = insertTimesheetSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateTimesheet(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Ponto não encontrado" });
    res.json(data);
  });

  app.delete("/api/timesheets/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteTimesheet(Number(req.params.id));
    res.json({ message: "Ponto removido" });
  });


  }
  