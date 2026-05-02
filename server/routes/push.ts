// Rotas de Push Notifications (Web Push API).
// ANTI-PATTERN: NÃO armazenar subscriptions só em Map na memória do servidor —
// elas se perdem em todo redeploy. Persistir em Supabase (push_subscriptions).
import { type Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth } from "../auth";

export function registerPushRoutes(app: Express) {
  // Registra/atualiza uma subscription do navegador. Idempotente por endpoint.
  app.post("/api/push/subscribe", requireAuth, async (req: any, res) => {
    try {
      const { endpoint, keys, userAgent } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Subscription inválida" });
      }
      const userId = req.user?.id;
      const userEmail = req.user?.email || null;

      const row = {
        endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth,
        user_id: userId || null,
        user_email: userEmail,
        user_agent: userAgent || null,
        updated_at: new Date().toISOString(),
      };

      // Upsert por endpoint
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .upsert(row, { onConflict: "endpoint" });

      if (error) {
        console.error("[push/subscribe] erro:", error.message);
        return res.status(500).json({ message: error.message });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[push/subscribe] exception:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // Desregistra a subscription (chamado no logout).
  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ message: "Endpoint obrigatório" });
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Lista subscriptions do próprio usuário (debug).
  app.get("/api/push/my-subscriptions", requireAuth, async (req: any, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, user_agent, created_at, updated_at")
        .eq("user_id", req.user?.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
