import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireDiretoria } from "../auth";
  import { insertClientSchema, vehicles } from "@shared/schema";
  import { eq } from "drizzle-orm";
  import { generateContractPDF } from "../contract-pdf";

  export function registerClientRoutes(app: Express) {
    app.get("/api/clients", requireAuth, async (_req, res) => {
    const data = await storage.getClients();
    res.json(data);
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    const data = await storage.getClient(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
    res.json(data);
  });

  app.get("/api/clients/:id/contrato-pdf", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(Number(req.params.id));
      if (!client) return res.status(404).json({ message: "Cliente não encontrado" });

      const dateParam = req.query.date as string | undefined;
      let contractDate: string | undefined;
      if (dateParam) {
        const d = new Date(dateParam + "T12:00:00");
        if (!isNaN(d.getTime())) {
          contractDate = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
        }
      }

      generateContractPDF(res, {
        clientName: client.name,
        clientCnpj: client.cnpj || "_______________",
        clientAddress: client.address || "_______________",
        clientCity: client.city || "_______________",
        clientState: client.state || "__",
        clientZip: client.zip || "________",
        clientContact: client.contactPerson || "_______________",
        contractDate,
      });
    } catch (err: any) {
      console.error("[Contract PDF] Error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Erro ao gerar contrato" });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createClient(parsed.data);
    const doc = data.cnpj || data.cpf || "";
    if (doc.replace(/\D/g, "").length >= 11) {
      apibrasil.autoConsultaCliente(doc, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/clients/:id", requireAuth, async (req, res) => {
    const parsed = insertClientSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateClient(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
    res.json(data);
  });

  app.delete("/api/clients/:id", requireAuth, requireDiretoria, async (req, res) => {
    const clientId = Number(req.params.id);
    try {
      await supabaseAdmin.from("client_vehicles").delete().eq("client_id", clientId);
      await storage.deleteClient(clientId);
      res.json({ message: "Cliente removido" });
    } catch (err: any) {
      console.error("Erro ao remover cliente:", err.message);
      res.status(500).json({ message: "Erro ao remover. Existem OS ou contratos vinculados a este cliente." });
    }
  });

  app.get("/api/clients/:id/vehicles", requireAuth, async (req, res) => {
    const data = await storage.getClientVehicles(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/clients/:id/vehicles", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    const { plate, model, brand, color, driverName, driverPhone, notes } = req.body;
    if (!plate) return res.status(400).json({ message: "Placa é obrigatória" });
    const existing = await storage.getClientVehicleByPlate(clientId, plate);
    if (existing) return res.status(409).json({ message: "Placa já cadastrada para este cliente", vehicle: existing });
    const data = await storage.createClientVehicle({ clientId, plate: plate.toUpperCase(), model, brand, color, driverName, driverPhone, notes });
    res.status(201).json(data);
  });

  app.patch("/api/client-vehicles/:id", requireAuth, async (req, res) => {
    const existing = await storage.getClientVehicle(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Veículo não encontrado" });
    if (req.body.plate && req.body.plate.toUpperCase() !== existing.plate) {
      const dup = await storage.getClientVehicleByPlate(existing.clientId, req.body.plate.toUpperCase());
      if (dup) return res.status(400).json({ message: "Placa já cadastrada para este cliente" });
    }
    const data = await storage.updateClientVehicle(Number(req.params.id), req.body);
    res.json(data);
  });

  app.delete("/api/client-vehicles/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteClientVehicle(Number(req.params.id));
    res.json({ message: "Veículo removido" });
  });

  app.get("/api/clients/:id/billing-config", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabaseAdmin
        .from("clients")
        .select("billing_cycle, payment_terms_days, billing_cutoff_day")
        .eq("id", id)
        .single();
      if (error) throw error;
      res.json(data || {});
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Escort Routes (Rotas Frequentes) CRUD

  }
  