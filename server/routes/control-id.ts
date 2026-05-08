import type { Express } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";
import * as ctrl from "../control-id";
import { isAtivo } from "./fixed-costs";

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

  // Backfill total: puxa TODO o histórico de batidas (ignora filtro de data)
  app.post("/api/control-id/devices/:id/backfill", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await ctrl.syncDevice(id, { fullBackfill: true });
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Progresso de sincronização: compara totais RHID vs local
  app.get("/api/control-id/devices/:id/sync-progress", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await ctrl.getDeviceSyncProgress(id);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Auto-import: importa funcionários do aparelho e tenta auto-mapear por nome
  app.post("/api/control-id/devices/:id/auto-import", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await ctrl.autoImportPersons(id);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Atualizar funcionário no RHID (write-back)
  app.put("/api/control-id/devices/:id/persons/:rhidPersonId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const personId = String(req.params.rhidPersonId);
      const r = await ctrl.updateRhidPerson(id, personId, req.body);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Criar batida no RHID (write-back)
  app.post("/api/control-id/devices/:id/punches", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rhidPersonId, dateTime, tipo } = req.body;
      if (!rhidPersonId || !dateTime) return res.status(400).json({ message: "rhidPersonId e dateTime são obrigatórios" });
      const r = await ctrl.createRhidPunch(id, String(rhidPersonId), new Date(dateTime), tipo || 3);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Atualizar batida no RHID (write-back)
  app.put("/api/control-id/devices/:id/punches/:rhidPunchId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const punchId = String(req.params.rhidPunchId);
      const body: any = { ...req.body };
      if (body.dateTime) body.dateTime = new Date(body.dateTime);
      const r = await ctrl.updateRhidPunch(id, punchId, body);
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
    if (from) {
      // se vier só YYYY-MM-DD, considera 00:00:00 do dia (início)
      const fromIso = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from;
      q = q.gte("punch_at", fromIso);
    }
    if (to) {
      // se vier só YYYY-MM-DD, inclui o dia inteiro (até 23:59:59.999)
      const toIso = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;
      q = q.lte("punch_at", toIso);
    }
    const { data } = await q;
    res.json(data || []);
  });

  // Bater ponto manualmente: cria local + envia ao RHID
  app.post("/api/control-id/manual-punch", requireAuth, async (req: any, res) => {
    try {
      const { employeeId, punchAt, direction, deviceId } = req.body;
      // Funcionário comum só pode bater pra si mesmo
      const isAdmin = ["diretoria", "admin", "rh"].includes(req.user?.role);
      const targetEmployeeId = isAdmin && employeeId ? Number(employeeId) : Number(req.user?.employeeId);
      if (!targetEmployeeId) return res.status(400).json({ message: "employeeId não identificado" });
      if (!punchAt) return res.status(400).json({ message: "punchAt obrigatório" });

      const r = await ctrl.createManualPunch({
        employeeId: targetEmployeeId,
        punchAt: new Date(punchAt),
        direction: direction || "unknown",
        source: isAdmin && employeeId !== req.user?.employeeId ? "admin_manual" : "self_manual",
        deviceId: deviceId ? Number(deviceId) : undefined,
      });
      res.status(201).json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Editar batida local (sincroniza com RHID se tem external_id)
  app.patch("/api/control-id/punches/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { punchAt, direction } = req.body;
      const fields: any = {};
      if (punchAt) fields.punchAt = new Date(punchAt);
      if (direction !== undefined) fields.direction = direction;
      const r = await ctrl.updateLocalPunch(id, fields);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Deletar batida local (mantém no RHID por segurança)
  app.delete("/api/control-id/punches/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const r = await ctrl.deleteLocalPunch(Number(req.params.id));
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── FOLGAS / FERIADOS / ATESTADOS / FALTAS ───────
  app.get("/api/employee-absences", requireAuth, async (req, res) => {
    const { employeeId, from, to } = req.query as Record<string, string>;
    let q = supabaseAdmin.from("employee_absences").select("*").order("start_date", { ascending: false });
    if (employeeId) q = q.eq("employee_id", Number(employeeId));
    if (from) q = q.gte("start_date", from);
    if (to) q = q.lte("start_date", to);
    const { data } = await q;
    res.json(data || []);
  });

  app.post("/api/employee-absences", requireAuth, requireAdminRole, async (req, res) => {
    const { employeeId, type, startDate, endDate, reason, status } = req.body;
    if (!employeeId || !type || !startDate) return res.status(400).json({ message: "employeeId, type e startDate obrigatórios" });
    const validTypes = ["folga", "feriado", "atestado", "falta", "ferias", "licenca"];
    if (!validTypes.includes(type)) return res.status(400).json({ message: `type deve ser um de: ${validTypes.join(", ")}` });
    const { data, error } = await supabaseAdmin.from("employee_absences").insert({
      employee_id: Number(employeeId),
      type,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      reason: reason || null,
      status: status || "aprovado",
    }).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/employee-absences/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { type, startDate, endDate, reason, status } = req.body;
    const upd: any = {};
    if (type !== undefined) upd.type = type;
    if (startDate !== undefined) upd.start_date = new Date(startDate).toISOString();
    if (endDate !== undefined) upd.end_date = endDate ? new Date(endDate).toISOString() : null;
    if (reason !== undefined) upd.reason = reason;
    if (status !== undefined) upd.status = status;
    const { data, error } = await supabaseAdmin.from("employee_absences").update(upd).eq("id", id).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.delete("/api/employee-absences/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("employee_absences").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
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

  // ─────── ESPELHO RHID OFICIAL (formato Control iD Cloud) ───────
  app.get("/api/control-id/espelho-rhid/:employeeId", requireAuth, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      let from = String(req.query.from || "");
      let to = String(req.query.to || "");
      if (!from || !to) {
        // default: fechamento RHID = dia 26 do mês anterior até dia 25 do mês informado
        const month = String(req.query.month || new Date().toISOString().slice(0, 7));
        const [yyyy, mm] = month.split("-").map(Number);
        const fromD = new Date(Date.UTC(yyyy, mm - 2, 26));
        const toD = new Date(Date.UTC(yyyy, mm - 1, 25));
        from = fromD.toISOString().slice(0, 10);
        to = toD.toISOString().slice(0, 10);
      }
      const data = await ctrl.buildEspelhoRhid(employeeId, from, to);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── VISÃO GERAL DA FOLHA (todos funcionários do mês) ───────
  app.get("/api/control-id/folha-overview", requireAuth, async (req, res) => {
    try {
      const monthYear = String(req.query.month || new Date().toISOString().slice(0, 7));
      const { data: employees } = await supabaseAdmin
        .from("employees")
        .select("id, name, role, matricula, status")
        .order("name");
      const activeEmps = (employees || []).filter(isAtivo);
      const rows = await Promise.all(activeEmps.map(async (e: any) => {
        const stats = await ctrl.buildFolhaStats(e.id, monthYear);
        return {
          employeeId: e.id,
          name: e.name,
          role: e.role,
          matricula: e.matricula,
          hoursWorked: stats.hoursWorked,
          hoursLimit: stats.hoursLimit,
          horaExtra: stats.horaExtra,
          horasRestantes: stats.horasRestantes,
          percentUsed: stats.percentUsed,
          daysWorked: stats.daysWorked,
          baseSalary: stats.baseSalary,
          custoBase: stats.custoBase,
          custoExtra: stats.custoExtra,
          custoTotalEstimado: stats.custoTotalEstimado,
          custoComEncargos: stats.custoComEncargos,
          hasSalary: stats.hasSalary,
        };
      }));
      // Ordena: quem mais trabalhou primeiro
      rows.sort((a, b) => b.hoursWorked - a.hoursWorked);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── ESTATÍSTICAS DA FOLHA (horas, hora extra, custo estimado) ───────
  app.get("/api/control-id/folha-stats/:employeeId", requireAuth, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const monthYear = String(req.query.month || new Date().toISOString().slice(0, 7));
      const stats = await ctrl.buildFolhaStats(employeeId, monthYear);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── PAINEL DO MÊS (status hoje + horas mês) ───────
  app.get("/api/control-id/painel-mes", requireAuth, async (req, res) => {
    try {
      const monthYear = String(req.query.month || new Date().toISOString().slice(0, 7));
      const data = await ctrl.buildPainelMes(monthYear);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────── DIAGNÓSTICO DE SINCRONIZAÇÃO ───────
  app.get("/api/control-id/sync-diagnostic", requireAuth, async (_req, res) => {
    try {
      const data = await ctrl.buildSyncDiagnostic();
      res.json(data);
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
