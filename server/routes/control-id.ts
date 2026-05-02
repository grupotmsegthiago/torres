import type { Express } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";
import * as ctrl from "../control-id";

export function registerControlIdRoutes(app: Express) {
  // ─────── DEVICES (CRUD) ───────
  app.get("/api/control-id/devices", requireAuth, async (_req, res) => {
    const { data } = await supabaseAdmin
      .from("control_id_devices")
      .select("id,nome,tipo,base_url,login,ativo,notas,last_sync_at,last_sync_status,last_sync_message,created_at")
      .order("id", { ascending: true });
    res.json(data || []);
  });

  app.post("/api/control-id/devices", requireAuth, requireAdminRole, async (req, res) => {
    const { nome, tipo, baseUrl, login, password, ativo, notas } = req.body;
    if (!nome || !baseUrl || !login || !password) return res.status(400).json({ message: "nome, baseUrl, login e password são obrigatórios" });
    const passwordEnc = ctrl.encryptSecret(String(password));
    const { data, error } = await supabaseAdmin.from("control_id_devices").insert({
      nome, tipo: tipo || "idface_cloud", base_url: baseUrl, login,
      password_enc: passwordEnc, ativo: ativo !== false, notas: notas || null,
    }).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json({ ...data, password_enc: undefined });
  });

  app.patch("/api/control-id/devices/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { nome, tipo, baseUrl, login, password, ativo, notas } = req.body;
    const upd: any = {};
    if (nome !== undefined) upd.nome = nome;
    if (tipo !== undefined) upd.tipo = tipo;
    if (baseUrl !== undefined) upd.base_url = baseUrl;
    if (login !== undefined) upd.login = login;
    if (password) {
      upd.password_enc = ctrl.encryptSecret(String(password));
      upd.session_token = null; // invalida cache
      upd.session_expires = null;
    }
    if (ativo !== undefined) upd.ativo = ativo;
    if (notas !== undefined) upd.notas = notas;
    const { data, error } = await supabaseAdmin.from("control_id_devices").update(upd).eq("id", id).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ...data, password_enc: undefined });
  });

  app.delete("/api/control-id/devices/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("control_id_devices").delete().eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // Testar conexão
  app.post("/api/control-id/devices/:id/test", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", id).maybeSingle();
    if (!device) return res.status(404).json({ message: "Device não encontrado" });
    const result = await ctrl.testConnection(device as ctrl.DeviceRow);
    res.json(result);
  });

  // Sincronizar batidas manualmente
  app.post("/api/control-id/devices/:id/sync", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await ctrl.syncDevice(id);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Listar usuários cadastrados no aparelho (pra ajudar mapping)
  app.get("/api/control-id/devices/:id/users", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", id).maybeSingle();
      if (!device) return res.status(404).json({ message: "Device não encontrado" });
      const users = await ctrl.fetchUsers(device as ctrl.DeviceRow);
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── MAPPING FUNCIONÁRIO ↔ APARELHO ───────
  app.get("/api/control-id/mappings", requireAuth, async (req, res) => {
    let q = supabaseAdmin.from("control_id_users_map").select("*").order("id", { ascending: false });
    if (req.query.deviceId) q = q.eq("device_id", Number(req.query.deviceId));
    const { data } = await q;
    res.json(data || []);
  });

  app.post("/api/control-id/mappings", requireAuth, requireAdminRole, async (req, res) => {
    const { deviceId, employeeId, controlIdUserId, controlIdUserName, matricula, ativo } = req.body;
    if (!deviceId || !employeeId || !controlIdUserId) {
      return res.status(400).json({ message: "deviceId, employeeId e controlIdUserId são obrigatórios" });
    }
    const { data, error } = await supabaseAdmin.from("control_id_users_map").insert({
      device_id: Number(deviceId),
      employee_id: Number(employeeId),
      control_id_user_id: String(controlIdUserId),
      control_id_user_name: controlIdUserName || null,
      matricula: matricula || null,
      ativo: ativo !== false,
    }).select().single();
    if (error) return res.status(500).json({ message: error.message });

    // Backfill: associa batidas órfãs deste user_id ao employee
    await supabaseAdmin.from("control_id_punches")
      .update({ employee_id: Number(employeeId) })
      .eq("device_id", Number(deviceId))
      .eq("control_id_user_id", String(controlIdUserId))
      .is("employee_id", null);

    res.status(201).json(data);
  });

  app.patch("/api/control-id/mappings/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { employeeId, controlIdUserId, controlIdUserName, matricula, ativo } = req.body;
    const upd: any = {};
    if (employeeId !== undefined) upd.employee_id = Number(employeeId);
    if (controlIdUserId !== undefined) upd.control_id_user_id = String(controlIdUserId);
    if (controlIdUserName !== undefined) upd.control_id_user_name = controlIdUserName;
    if (matricula !== undefined) upd.matricula = matricula;
    if (ativo !== undefined) upd.ativo = ativo;
    const { data, error } = await supabaseAdmin.from("control_id_users_map").update(upd).eq("id", id).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.delete("/api/control-id/mappings/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("control_id_users_map").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // ─────── BATIDAS (PUNCHES) ───────
  app.get("/api/control-id/punches", requireAuth, async (req, res) => {
    const { employeeId, deviceId, from, to, limit = "200" } = req.query as Record<string, string>;
    let q = supabaseAdmin.from("control_id_punches").select("*").order("punch_at", { ascending: false }).limit(Number(limit));
    if (employeeId) q = q.eq("employee_id", Number(employeeId));
    if (deviceId) q = q.eq("device_id", Number(deviceId));
    if (from) q = q.gte("punch_at", from);
    if (to) q = q.lte("punch_at", to);
    const { data } = await q;
    res.json(data || []);
  });

  // ─────── FOLHA CONSOLIDADA ───────
  app.get("/api/control-id/folha/:employeeId", requireAuth, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const monthYear = String(req.query.month || new Date().toISOString().slice(0, 7));
      const folha = await ctrl.buildFolhaPonto(employeeId, monthYear);
      res.json(folha);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── SYNC GLOBAL (admin) ───────
  app.post("/api/control-id/sync-all", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const r = await ctrl.syncAllDevices();
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
