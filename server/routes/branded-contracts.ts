import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";

export function registerBrandedContractRoutes(app: Express) {
  app.get("/api/branded-contracts", requireAuth, async (req, res) => {
    try {
      const { entity_type, entity_id } = req.query;
      let q = supabaseAdmin.from("branded_contracts").select("*").order("created_at", { ascending: false });
      if (entity_type) q = q.eq("entity_type", String(entity_type));
      if (entity_id) q = q.eq("entity_id", Number(entity_id));
      const { data, error } = await q;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/branded-contracts/:id", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("branded_contracts").select("*").eq("id", req.params.id).single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/branded-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.entity_type || !body.entity_id) {
        return res.status(400).json({ message: "entity_type e entity_id são obrigatórios" });
      }
      const payload = {
        entity_type: body.entity_type,
        entity_id: Number(body.entity_id),
        title: body.title || "CONTRATO",
        fields: body.fields || {},
        clauses: body.clauses || "",
        witnesses: body.witnesses || [],
      };
      const { data, error } = await supabaseAdmin.from("branded_contracts").insert(payload).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/branded-contracts/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const body = req.body || {};
      const update: any = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) update.title = body.title;
      if (body.fields !== undefined) update.fields = body.fields;
      if (body.clauses !== undefined) update.clauses = body.clauses;
      if (body.witnesses !== undefined) update.witnesses = body.witnesses;
      const { data, error } = await supabaseAdmin.from("branded_contracts").update(update).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/branded-contracts/:id/sign", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.signature_data || !body.signed_by_name) {
        return res.status(400).json({ message: "Assinatura e nome são obrigatórios" });
      }
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      const ua = req.headers["user-agent"] || "";
      const update = {
        signature_data: body.signature_data,
        signed_by_name: body.signed_by_name,
        signed_by_doc: body.signed_by_doc || "",
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        signed_user_agent: ua,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from("branded_contracts").update(update).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/branded-contracts/:id/unsign", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const update = {
        signature_data: null, signed_at: null, signed_by_name: null,
        signed_by_doc: null, signed_ip: null, signed_user_agent: null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from("branded_contracts").update(update).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/branded-contracts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("branded_contracts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
