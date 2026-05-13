import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications/critical", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user?.id;
      const role = user?.role;
      const isFuncionario = role === "funcionario";
      const targetRoles = isFuncionario ? ["all", "funcionario"] : ["all", "admin"];

      const nowIso = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("system_notifications")
        .select("*")
        .eq("require_ack", true)
        .in("target_role", targetRoles)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const unacked = (data || []).filter((n: any) => !(n.acked_by_user_ids || []).includes(userId));
      res.json(unacked);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/:id/ack", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user;
      const userId = user?.id;
      const { data: notif, error: getErr } = await supabaseAdmin
        .from("system_notifications").select("acked_by_user_ids").eq("id", id).single();
      if (getErr || !notif) return res.status(404).json({ message: "Notificação não encontrada" });
      const current: number[] = notif.acked_by_user_ids || [];
      if (current.includes(userId)) return res.json({ success: true, alreadyAcked: true });
      const updated = [...current, userId];
      const { error: updErr } = await supabaseAdmin
        .from("system_notifications").update({ acked_by_user_ids: updated }).eq("id", id);
      if (updErr) throw updErr;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notifications", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("system_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
