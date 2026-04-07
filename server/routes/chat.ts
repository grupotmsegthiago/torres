import type { Express } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";

export function registerChatRoutes(app: Express) {

  app.get("/api/chat/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";

      let convIds: string[] = [];

      if (isAdmin) {
        const { data: allConvs } = await supabaseAdmin
          .from("chat_conversations").select("id");
        convIds = (allConvs || []).map((c: any) => c.id);
      } else {
        const { data: myParts } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        convIds = (myParts || []).map((p: any) => p.conversation_id);
      }

      if (convIds.length === 0) return res.json([]);

      const { data: convs } = await supabaseAdmin
        .from("chat_conversations").select("*")
        .in("id", convIds)
        .order("created_at", { ascending: false });

      const results: any[] = [];

      for (const conv of (convs || [])) {
        const { data: participants } = await supabaseAdmin
          .from("chat_participants").select("user_id, last_read_at")
          .eq("conversation_id", conv.id);

        const { data: lastMsg } = await supabaseAdmin
          .from("chat_messages").select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const myPart = (participants || []).find((p: any) => p.user_id === userId);
        const lastReadAt = myPart?.last_read_at;

        let unreadCount = 0;
        if (lastReadAt) {
          const { count } = await supabaseAdmin
            .from("chat_messages").select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .gt("created_at", lastReadAt)
            .neq("sender_id", userId);
          unreadCount = count || 0;
        } else {
          const { count } = await supabaseAdmin
            .from("chat_messages").select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId);
          unreadCount = count || 0;
        }

        results.push({
          ...conv,
          participants: participants || [],
          lastMessage: lastMsg?.[0] || null,
          unreadCount,
        });
      }

      results.sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.created_at;
        const bTime = b.lastMessage?.created_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      res.json(results);
    } catch (err: any) {
      console.error("[chat] list conversations error:", err.message);
      res.status(500).json({ message: "Erro ao listar conversas" });
    }
  });

  app.post("/api/chat/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { type, name, missionId, participantIds } = req.body;

      if (!type || !["direct", "group", "mission"].includes(type)) {
        return res.status(400).json({ message: "Tipo inválido" });
      }

      if (type === "direct" && participantIds?.length === 1) {
        const otherId = participantIds[0];
        const { data: myConvs } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        const myConvIds = (myConvs || []).map((p: any) => p.conversation_id);

        if (myConvIds.length > 0) {
          const { data: otherConvs } = await supabaseAdmin
            .from("chat_participants").select("conversation_id")
            .eq("user_id", otherId)
            .in("conversation_id", myConvIds);

          for (const oc of (otherConvs || [])) {
            const { data: conv } = await supabaseAdmin
              .from("chat_conversations").select("*")
              .eq("id", oc.conversation_id)
              .eq("type", "direct")
              .single();
            if (conv) {
              return res.json(conv);
            }
          }
        }
      }

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("chat_conversations").insert({
          type,
          name: name || null,
          mission_id: missionId || null,
          created_by: userId,
        }).select().single();

      if (convErr) throw convErr;

      const allParticipants = new Set<number>([userId, ...(participantIds || [])]);
      const partInserts = [...allParticipants].map(uid => ({
        conversation_id: conv.id,
        user_id: uid,
      }));

      await supabaseAdmin.from("chat_participants").insert(partInserts);

      const { data: sysMsg } = await supabaseAdmin
        .from("chat_messages").insert({
          conversation_id: conv.id,
          sender_id: userId,
          content: "Conversa iniciada",
          type: "system",
        }).select().single();

      res.json({ ...conv, participants: partInserts, lastMessage: sysMsg });
    } catch (err: any) {
      console.error("[chat] create conversation error:", err.message);
      res.status(500).json({ message: "Erro ao criar conversa" });
    }
  });

  app.get("/api/chat/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const convId = req.params.id;
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      const before = req.query.before as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      if (!isAdmin) {
        const { data: part } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", convId)
          .eq("user_id", userId)
          .limit(1);
        if (!part?.length) {
          return res.status(403).json({ message: "Sem acesso a esta conversa" });
        }
      }

      let query = supabaseAdmin
        .from("chat_messages").select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data: messages, error } = await query;
      if (error) throw error;

      res.json((messages || []).reverse());
    } catch (err: any) {
      console.error("[chat] get messages error:", err.message);
      res.status(500).json({ message: "Erro ao buscar mensagens" });
    }
  });

  app.post("/api/chat/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const convId = req.params.id;
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      const { content, type, fileUrl, lat, lng } = req.body;

      if (!isAdmin) {
        const { data: part } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", convId)
          .eq("user_id", userId)
          .limit(1);
        if (!part?.length) {
          return res.status(403).json({ message: "Sem acesso a esta conversa" });
        }
      }

      const msgType = type || "text";
      if (!["text", "image", "file", "location", "system"].includes(msgType)) {
        return res.status(400).json({ message: "Tipo de mensagem inválido" });
      }

      const { data: msg, error } = await supabaseAdmin
        .from("chat_messages").insert({
          conversation_id: convId,
          sender_id: userId,
          content: content || null,
          type: msgType,
          file_url: fileUrl || null,
          lat: lat || null,
          lng: lng || null,
          delivered_at: new Date().toISOString(),
        }).select().single();

      if (error) throw error;

      res.json(msg);
    } catch (err: any) {
      console.error("[chat] send message error:", err.message);
      res.status(500).json({ message: "Erro ao enviar mensagem" });
    }
  });

  app.patch("/api/chat/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const convId = req.params.id;

      const { error } = await supabaseAdmin
        .from("chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", convId)
        .eq("user_id", userId);

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[chat] mark read error:", err.message);
      res.status(500).json({ message: "Erro ao marcar como lido" });
    }
  });

  app.post("/api/chat/presence", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { online } = req.body;

      const { error } = await supabaseAdmin
        .from("chat_presence")
        .upsert({
          user_id: userId,
          online: !!online,
          last_seen: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[chat] presence error:", err.message);
      res.status(500).json({ message: "Erro ao atualizar presença" });
    }
  });

  app.get("/api/chat/presence", requireAuth, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("chat_presence").select("*");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("[chat] get presence error:", err.message);
      res.status(500).json({ message: "Erro ao buscar presença" });
    }
  });

  app.get("/api/chat/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;

      const { data: myParts } = await supabaseAdmin
        .from("chat_participants").select("conversation_id, last_read_at")
        .eq("user_id", userId);

      let total = 0;
      for (const p of (myParts || [])) {
        let q = supabaseAdmin
          .from("chat_messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .neq("sender_id", userId);
        if (p.last_read_at) {
          q = q.gt("created_at", p.last_read_at);
        }
        const { count } = await q;
        total += count || 0;
      }

      res.json({ unreadCount: total });
    } catch (err: any) {
      console.error("[chat] unread count error:", err.message);
      res.status(500).json({ message: "Erro ao contar não lidas" });
    }
  });

  app.get("/api/chat/users", requireAuth, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("users").select("id, name, email, role, avatar_url, employee_id");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("[chat] get users error:", err.message);
      res.status(500).json({ message: "Erro ao listar usuários" });
    }
  });
}
