import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { getStreamUrl, pingSsx } from "../ssx-client";
import { logSystemAudit } from "../audit";

/**
 * Rotas da integração SSX Tracking.
 *
 * - GET /api/ssx/ping              — diagnóstico (login real, sem expor token).
 * - GET /api/ssx/vehicles          — lista veículos com ssx_integration_code preenchido.
 * - GET /api/ssx/stream            — devolve URL HLS de um canal de uma viatura.
 * - GET /api/ssx/alerts/recent     — últimos N alertas IA (24h por padrão).
 * - POST /api/ssx/webhook/ai-alert — webhook da SSX p/ alertas de IA (fadiga/celular/pânico).
 *   Autenticado por bearer = SSX_TOKEN (sem requireAuth: vem de fora da rede da Torres).
 *
 * NUNCA exponha SSX_EMAIL/SSX_PASSWORD/SSX_TOKEN em respostas. O cliente só recebe
 * a URL HLS final (assinada/temporária pela SSX).
 */

const ALERT_TIPOS = new Set([
  "celular", "fumando", "fadiga", "panico", "blitz",
  "distracao", "telefone", "sonolencia", "colisao",
  // Telemetria de condução (ADAS): a SSX também emite eventos de comportamento.
  "freada_brusca", "frenagem_brusca", "aceleracao_brusca",
  "curva_brusca", "curva_acentuada", "excesso_velocidade",
]);

export function registerSsxRoutes(app: Express) {
  // -------- ping (admin) --------
  app.get("/api/ssx/ping", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
    const r = await pingSsx();
    res.json(r);
  });

  // -------- lista veículos integrados --------
  app.get("/api/ssx/vehicles", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data: vehicles, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate, brand, model, frota, ssx_integration_code, last_address, last_latitude, last_longitude, last_speed, last_ignition")
        .not("ssx_integration_code", "is", null)
        .neq("ssx_integration_code", "")
        .order("plate");
      if (error) throw error;

      // Busca OS ativa por veículo pra mostrar agentes alocados no overlay
      const vehIds = (vehicles || []).map((v: any) => v.id);
      const agentsByVehicle = new Map<number, { agent1?: string; agent2?: string }>();
      if (vehIds.length > 0) {
        const { data: oss } = await supabaseAdmin
          .from("service_orders")
          .select("vehicle_id, assigned_employee_id, assigned_employee_2_id, mission_status, status, scheduled_date")
          .in("vehicle_id", vehIds)
          .in("mission_status", ["em_andamento", "aceita", "a_caminho", "no_local"])
          .order("scheduled_date", { ascending: false });

        const empIds = new Set<number>();
        for (const o of (oss || []) as any[]) {
          if (o.assigned_employee_id) empIds.add(Number(o.assigned_employee_id));
          if (o.assigned_employee_2_id) empIds.add(Number(o.assigned_employee_2_id));
        }
        const empMap = new Map<number, string>();
        if (empIds.size > 0) {
          const { data: emps } = await supabaseAdmin
            .from("employees").select("id, name").in("id", Array.from(empIds));
          for (const e of (emps || []) as any[]) empMap.set(Number(e.id), e.name);
        }
        // 1ª OS encontrada por veículo (ordenada por scheduled_date DESC = mais recente primeiro)
        for (const o of (oss || []) as any[]) {
          const vid = Number(o.vehicle_id);
          if (agentsByVehicle.has(vid)) continue;
          agentsByVehicle.set(vid, {
            agent1: o.assigned_employee_id ? empMap.get(Number(o.assigned_employee_id)) : undefined,
            agent2: o.assigned_employee_2_id ? empMap.get(Number(o.assigned_employee_2_id)) : undefined,
          });
        }
      }

      const enriched = (vehicles || []).map((v: any) => ({
        ...v,
        agent1_name: agentsByVehicle.get(Number(v.id))?.agent1 || null,
        agent2_name: agentsByVehicle.get(Number(v.id))?.agent2 || null,
      }));
      res.json({ vehicles: enriched });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // -------- URL de stream HLS (1 canal) --------
  app.get("/api/ssx/stream", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const vehicleId = Number(req.query.vehicleId);
      const channel = Number(req.query.channel || 1);
      if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        return res.status(400).json({ error: "vehicleId obrigatório" });
      }
      const { data: veh, error: vErr } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate, ssx_integration_code")
        .eq("id", vehicleId)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!veh) return res.status(404).json({ error: "Veículo não encontrado" });
      if (!veh.ssx_integration_code) {
        return res.status(409).json({
          error: "Veículo sem código de integração SSX cadastrado",
          plate: veh.plate,
        });
      }
      const r = await getStreamUrl(String(veh.ssx_integration_code), channel);
      res.json({ url: r.url, channel: r.channel, vehicleId, plate: veh.plate });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // câmera offline / sem sinal não é 500 — devolve 503 pro front mostrar "sem sinal"
      const isOffline = /URLStream|offline|sem sinal|204/.test(msg);
      res.status(isOffline ? 503 : 500).json({ error: msg });
    }
  });

  // -------- link externo de câmeras (cliente, sem login) --------
  // Token assinado (HMAC-SHA256 com SESSION_SECRET) com validade embutida:
  // payload = "<vehicleId>.<expiraEmMs>" em base64url + "." + assinatura.
  // Sem tabela no banco: expira sozinho; revogação = esperar expirar.
  const SHARE_SECRET = process.env.SESSION_SECRET || "";

  function signShare(payloadB64: string): string {
    return crypto.createHmac("sha256", SHARE_SECRET).update(payloadB64).digest("base64url");
  }

  function parseShareToken(token: string): { vehicleId: number; expMs: number } | null {
    if (!SHARE_SECRET) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expected = signShare(payloadB64);
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    const raw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const m = raw.match(/^(\d+)\.(\d+)$/);
    if (!m) return null;
    const vehicleId = Number(m[1]);
    const expMs = Number(m[2]);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0 || !Number.isFinite(expMs)) return null;
    if (Date.now() > expMs) return null; // expirado
    return { vehicleId, expMs };
  }

  // Gera o link (admin). body: { vehicleId, hours? } — validade 1..168h, padrão 24h.
  app.post("/api/ssx/share-link", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      if (!SHARE_SECRET) return res.status(503).json({ error: "SESSION_SECRET não configurado no servidor" });
      const vehicleId = Number(req.body?.vehicleId);
      const hours = Math.min(168, Math.max(1, Number(req.body?.hours) || 24));
      if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        return res.status(400).json({ error: "vehicleId obrigatório" });
      }
      const { data: veh, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate, ssx_integration_code")
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      if (!veh) return res.status(404).json({ error: "Veículo não encontrado" });
      if (!veh.ssx_integration_code) {
        return res.status(409).json({ error: "Veículo sem código de integração SSX cadastrado", plate: veh.plate });
      }
      const expMs = Date.now() + hours * 3600_000;
      const payloadB64 = Buffer.from(`${vehicleId}.${expMs}`, "utf8").toString("base64url");
      const token = `${payloadB64}.${signShare(payloadB64)}`;
      const u = (req as any).user;
      logSystemAudit({
        userId: u?.id, userName: u?.name || u?.email, userRole: u?.role,
        action: "camera_share_link_gerado",
        targetId: String(vehicleId), targetType: "vehicle",
        details: `Link externo de câmeras gerado p/ ${veh.plate} — válido ${hours}h (até ${new Date(expMs).toISOString()})`,
        ipAddress: req.ip,
      });
      res.json({
        token,
        path: `/camera/${token}`,
        plate: veh.plate,
        expiresAt: new Date(expMs).toISOString(),
        hours,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Info do link (público — o cliente abre sem login).
  app.get("/api/public/camera-share/:token", async (req: Request, res: Response) => {
    try {
      const parsed = parseShareToken(String(req.params.token || ""));
      if (!parsed) return res.status(401).json({ error: "Link inválido ou expirado" });
      const { data: veh, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate, brand, model, frota, ssx_integration_code")
        .eq("id", parsed.vehicleId)
        .maybeSingle();
      if (error) throw error;
      if (!veh || !veh.ssx_integration_code) return res.status(404).json({ error: "Viatura indisponível" });
      res.json({
        plate: veh.plate,
        brand: veh.brand,
        model: veh.model,
        frota: veh.frota,
        expiresAt: new Date(parsed.expMs).toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Stream de um canal via link público (mesma resposta do /api/ssx/stream).
  app.get("/api/public/camera-share/:token/stream", async (req: Request, res: Response) => {
    try {
      const parsed = parseShareToken(String(req.params.token || ""));
      if (!parsed) return res.status(401).json({ error: "Link inválido ou expirado" });
      const channel = Number(req.query.channel || 1);
      if (channel !== 1 && channel !== 2) return res.status(400).json({ error: "channel deve ser 1 ou 2" });
      const { data: veh, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate, ssx_integration_code")
        .eq("id", parsed.vehicleId)
        .maybeSingle();
      if (error) throw error;
      if (!veh?.ssx_integration_code) return res.status(404).json({ error: "Viatura indisponível" });
      const r = await getStreamUrl(String(veh.ssx_integration_code), channel);
      res.json({ url: r.url, channel: r.channel, plate: veh.plate });
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isOffline = /URLStream|offline|sem sinal|204/.test(msg);
      res.status(isOffline ? 503 : 500).json({ error: msg });
    }
  });

  // -------- alertas recentes --------
  app.get("/api/ssx/alerts/recent", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const sinceHours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
      const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("vehicle_ai_alerts")
        .select("id, vehicle_id, integration_code, tipo, gravidade, ocorrido_em, payload, ack_by, ack_at")
        .gte("ocorrido_em", sinceIso)
        .order("ocorrido_em", { ascending: false })
        .limit(limit);
      if (error) throw error;
      res.json({ alerts: data || [] });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // -------- ack de alerta --------
  app.post("/api/ssx/alerts/:id/ack", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const userName = (req as any).user?.name || (req as any).user?.email || "operador";
      const { error } = await supabaseAdmin
        .from("vehicle_ai_alerts")
        .update({ ack_by: userName, ack_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // -------- webhook IA (vem da SSX, autentica via SSX_TOKEN) --------
  app.post("/api/ssx/webhook/ai-alert", async (req: Request, res: Response) => {
    try {
      const expected = process.env.SSX_TOKEN || "";
      if (!expected) return res.status(503).json({ error: "SSX_TOKEN não configurado" });
      const auth = String(req.headers.authorization || req.headers["x-ssx-token"] || "").trim();
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth;
      if (token !== expected) {
        return res.status(401).json({ error: "Token inválido" });
      }
      // Payload tolerante: aceita variações de nome de campo.
      const p = req.body || {};
      const integrationCode = String(
        p.VehicleIntegrationCode || p.integrationCode || p.IntegrationCode || p.vehicle || ""
      ).trim();
      const tipo = String(p.Type || p.tipo || p.alertType || "").toLowerCase().trim();
      const gravidade = String(p.Severity || p.gravidade || "alta").toLowerCase().trim();
      const ocorridoEm = p.Timestamp || p.timestamp || p.ocorrido_em || new Date().toISOString();
      if (!integrationCode || !tipo) {
        return res.status(400).json({ error: "VehicleIntegrationCode e Type/tipo obrigatórios" });
      }
      if (!ALERT_TIPOS.has(tipo)) {
        // não bloqueia: aceita tipos novos da SSX e armazena bruto
      }
      // resolve veículo a partir do integration_code
      const { data: veh } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate")
        .eq("ssx_integration_code", integrationCode)
        .maybeSingle();
      const insertRow = {
        vehicle_id: veh?.id ?? null,
        integration_code: integrationCode,
        tipo,
        gravidade,
        ocorrido_em: new Date(ocorridoEm).toISOString(),
        payload: p,
        ack_by: null as string | null,
        ack_at: null as string | null,
      };
      const { data: inserted, error } = await supabaseAdmin
        .from("vehicle_ai_alerts")
        .insert(insertRow as any)
        .select("id")
        .single();
      if (error) throw error;
      // broadcast realtime (canal dedicado)
      try {
        await supabaseAdmin.channel("vehicle-ai-alerts").send({
          type: "broadcast",
          event: "new-alert",
          payload: { id: inserted?.id, ...insertRow },
        });
      } catch (_) {/* broadcast best-effort */}
      res.json({ ok: true, id: inserted?.id });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });
}
