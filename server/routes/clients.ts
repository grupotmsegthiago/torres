import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria, requireComercial, requireRoles } from "../auth";
  import { insertClientSchema, vehicles } from "@shared/schema";
  import * as apibrasil from "../apibrasil";
  import { validateContactFields } from "../lib/normalize-contact";
  import {
    allowedClientIdsFromRequest,
    applyComercialCreateClientPayload,
    applyComercialPatchClientPayload,
    denyIfComercialClientOutOfScope,
    filterComerciaisForUser,
  } from "../lib/comercial-scope";

  import { generateContractPDF } from "../contract-pdf";
import { listGroups as listZapiGroups } from "../lib/zapi";

function hasWhoPaysEmail(raw: string | null | undefined): boolean {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(raw || ""));
}

function coerceComercialId(body: Record<string, any>): Record<string, any> {
  const raw = body.responsavelComercialId ?? body.responsavel_comercial_id;
  if (raw === "") {
    return { ...body, responsavelComercialId: null, responsavel_comercial_id: null };
  }
  return body;
}

  export function registerClientRoutes(app: Express) {
    let comerciaisCache: { ts: number; payload: any } | null = null;
    const COMERCIAIS_CACHE_TTL_MS = 60_000;

    app.get("/api/comerciais", requireAuth, requireRoles("financeiro", "comercial"), async (req, res) => {
      try {
        const bypass = req.query.refresh === "1" || req.query.refresh === "true";
        const cacheHit = !bypass && comerciaisCache && Date.now() - comerciaisCache.ts < COMERCIAIS_CACHE_TTL_MS;
        let payload = cacheHit ? comerciaisCache!.payload : null;
        if (!payload) {
          const { fetchComerciaisAtivos } = await import("../lib/comissao-ingest");
          payload = await fetchComerciaisAtivos();
          if (payload.ok) comerciaisCache = { ts: Date.now(), payload };
        }
        const comerciais = filterComerciaisForUser(payload.comerciais || [], req.user as any);
        res.json({ ...payload, comerciais, cached: !!cacheHit });
      } catch (e: any) {
        res.json({ ok: false, comerciais: [], error: e?.message || "TM SEG indisponível" });
      }
    });

    app.get("/api/clients", requireAuth, requireRoles("financeiro", "comercial"), async (req, res) => {
    const allowed = await allowedClientIdsFromRequest(req);
    const data = await storage.getClients();
    if (allowed == null) return res.json(data);
    const set = new Set(allowed);
    res.json(data.filter((c: any) => set.has(Number(c.id))));
  });

  // Lista grupos do WhatsApp via Z-API pra popular o select no cadastro
  // de cliente. Cache leve in-memory de 60s pra não bater na Z-API toda hora.
  let groupsCache: { ts: number; payload: any } | null = null;
  const GROUPS_CACHE_TTL_MS = 60_000;
  app.get("/api/whatsapp/groups", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const bypassCache = req.query.refresh === "1" || req.query.refresh === "true";
      if (!bypassCache && groupsCache && Date.now() - groupsCache.ts < GROUPS_CACHE_TTL_MS) {
        return res.json({ ...groupsCache.payload, cached: true });
      }
      const r = await listZapiGroups();
      const payload = {
        ok: r.ok,
        groups: r.groups,
        error: r.error || null,
        count: r.groups.length,
      };
      console.log(`[whatsapp/groups] listGroups -> ok=${r.ok} count=${r.groups.length} error=${r.error || "-"} names=[${r.groups.slice(0,5).map(g=>g.name).join(", ")}]`);
      if (r.ok) groupsCache = { ts: Date.now(), payload };
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ ok: false, groups: [], error: e?.message || "erro interno" });
    }
  });

  app.get("/api/clients/:id", requireAuth, requireRoles("financeiro", "comercial"), async (req, res) => {
    if (await denyIfComercialClientOutOfScope(req, res, req.params.id)) return;
    const data = await storage.getClient(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
    res.json(data);
  });

  app.get("/api/clients/:id/contrato-pdf", requireAuth, async (req, res) => {
    try {
      if (await denyIfComercialClientOutOfScope(req, res, req.params.id)) return;
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

  app.post("/api/clients", requireAuth, requireComercial, async (req, res) => {
    const parsed = insertClientSchema.safeParse(coerceComercialId(req.body || {}));
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const contactErrors = validateContactFields(parsed.data, { phones: ["phone"], zips: ["zip"] });
    if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
    if (!hasWhoPaysEmail(parsed.data.emailFinanceiro)) {
      return res.status(400).json({ message: "E-mail de quem paga (recebimento financeiro) é obrigatório." });
    }
    const data = await storage.createClient(
      applyComercialCreateClientPayload(req.user as any, parsed.data) as any,
    );
    const doc = data.cnpj || data.cpf || "";
    if (doc.replace(/\D/g, "").length >= 11) {
      apibrasil.autoConsultaCliente(doc, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/clients/:id", requireAuth, requireRoles("financeiro", "comercial"), async (req, res) => {
    const parsed = insertClientSchema.partial().safeParse(coerceComercialId(req.body || {}));
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const contactErrors = validateContactFields(parsed.data, { phones: ["phone"], zips: ["zip"] });
    if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
    if ("emailFinanceiro" in parsed.data && !hasWhoPaysEmail(parsed.data.emailFinanceiro)) {
      return res.status(400).json({ message: "E-mail de quem paga (recebimento financeiro) é obrigatório." });
    }
    if (await denyIfComercialClientOutOfScope(req, res, req.params.id)) return;
    try {
      const data = await storage.updateClient(
        Number(req.params.id),
        applyComercialPatchClientPayload(req.user as any, parsed.data) as any,
      );
      if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
      res.json(data);
    } catch (err: any) {
      console.error(`[clients PATCH ${req.params.id}] erro ao salvar:`, err.message);
      res.status(500).json({ message: err.message || "Erro ao salvar cliente" });
    }
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

  app.get("/api/clients/:id/vehicles", requireAuth, requireComercial, async (req, res) => {
    if (await denyIfComercialClientOutOfScope(req, res, req.params.id)) return;
    const data = await storage.getClientVehicles(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/clients/:id/vehicles", requireAuth, requireComercial, async (req, res) => {
    const clientId = Number(req.params.id);
    if (await denyIfComercialClientOutOfScope(req, res, clientId)) return;
    const { plate, model, brand, color, driverName, driverPhone, notes } = req.body;
    if (!plate) return res.status(400).json({ message: "Placa é obrigatória" });
    const existing = await storage.getClientVehicleByPlate(clientId, plate);
    if (existing) return res.status(409).json({ message: "Placa já cadastrada para este cliente", vehicle: existing });
    const data = await storage.createClientVehicle({ clientId, plate: plate.toUpperCase(), model, brand, color, driverName, driverPhone, notes });
    res.status(201).json(data);
  });

  app.patch("/api/client-vehicles/:id", requireAuth, requireComercial, async (req, res) => {
    const existing = await storage.getClientVehicle(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Veículo não encontrado" });
    if (await denyIfComercialClientOutOfScope(req, res, existing.clientId, "Veículo não encontrado")) return;
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

  app.get("/api/clients/:id/billing-config", requireAuth, requireComercial, async (req, res) => {
    try {
      if (await denyIfComercialClientOutOfScope(req, res, req.params.id)) return;
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
  