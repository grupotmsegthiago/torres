import type { Express } from "express";
import { randomUUID } from "crypto";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";
import { storage } from "../storage";
import { logSystemAudit } from "../audit";

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

      const callerIsAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";

      if ((type === "group" || type === "mission") && !callerIsAdmin) {
        return res.status(403).json({ message: "Apenas administradores podem criar grupos" });
      }

      if (type === "direct" && !callerIsAdmin && participantIds?.length === 1) {
        const { data: targetUser } = await supabaseAdmin
          .from("users").select("role").eq("id", participantIds[0]).single();
        if (targetUser && targetUser.role !== "admin" && targetUser.role !== "diretoria") {
          return res.status(403).json({ message: "Funcionários só podem conversar com administradores" });
        }
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
      const baseTypes = ["text", "image", "file", "location", "system"];
      const adminTypes = [...baseTypes, "mission_invite"];
      const allowed = isAdmin ? adminTypes : baseTypes;
      if (!allowed.includes(msgType)) {
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
      const isDiretoria = req.user!.role === "diretoria" || req.user!.role === "admin";

      let parts: { conversation_id: string; last_read_at: string | null }[] = [];

      if (isDiretoria) {
        const { data: allConvs } = await supabaseAdmin
          .from("chat_conversations").select("id");
        const allConvIds = (allConvs || []).map((c: any) => c.id);

        const { data: myParts } = await supabaseAdmin
          .from("chat_participants").select("conversation_id, last_read_at")
          .eq("user_id", userId);
        const myPartsMap = new Map((myParts || []).map((p: any) => [p.conversation_id, p.last_read_at]));

        parts = allConvIds.map(cid => ({
          conversation_id: cid,
          last_read_at: myPartsMap.get(cid) || null,
        }));
      } else {
        const { data: myParts } = await supabaseAdmin
          .from("chat_participants").select("conversation_id, last_read_at")
          .eq("user_id", userId);
        parts = myParts || [];
      }

      if (parts.length === 0) {
        return res.json({ total: 0, unreadCount: 0 });
      }

      const counts = await Promise.all(parts.map(async (p) => {
        let q = supabaseAdmin
          .from("chat_messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .neq("sender_id", userId);
        if (p.last_read_at) {
          q = q.gt("created_at", p.last_read_at);
        }
        const { count } = await q;
        return count || 0;
      }));
      let total = counts.reduce((a, b) => a + b, 0);

      res.json({ unreadCount: total });
    } catch (err: any) {
      console.error("[chat] unread count error:", err.message);
      res.status(500).json({ message: "Erro ao contar não lidas" });
    }
  });

  app.post("/api/chat/presence-beacon", (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const online = body?.online ?? false;
      const userId = (req as any).user?.id || (req as any).session?.passport?.user;
      if (!userId) { res.status(401).json({ message: "Sem sessão" }); return; }
      supabaseAdmin
        .from("chat_presence")
        .upsert({ user_id: userId, online: !!online, last_seen: new Date().toISOString() }, { onConflict: "user_id" })
        .then(({ error: upsertErr }) => {
          if (upsertErr) { console.error("[chat] beacon error:", upsertErr.message); return res.status(500).json({ ok: false }); }
          res.json({ ok: true });
        });
    } catch (err: any) {
      console.error("[chat] presence-beacon error:", err.message);
      res.status(500).json({ message: "Erro" });
    }
  });

  app.get("/api/chat/users", requireAuth, async (req, res) => {
    try {
      const callerIsAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      let query = supabaseAdmin.from("users").select("id, name, email, role, avatar_url, employee_id");
      if (!callerIsAdmin) {
        query = query.in("role", ["admin", "diretoria"]);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("[chat] get users error:", err.message);
      res.status(500).json({ message: "Erro ao listar usuários" });
    }
  });

  app.post("/api/chat/send-mission-invite", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { serviceOrderId, conversationId } = req.body;

      if (!serviceOrderId || !conversationId) {
        return res.status(400).json({ message: "serviceOrderId e conversationId são obrigatórios" });
      }

      const os = await storage.getServiceOrder(Number(serviceOrderId));
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const toBRT = (d: any) => {
        if (!d) return null;
        return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      };

      const missionData = {
        osId: os.id,
        osNumber: os.osNumber,
        scheduledDate: toBRT(os.scheduledDate),
        origin: os.origin || "Não informado",
        destination: os.destination || "Não informado",
        type: os.type || "Escolta",
      };

      const content = JSON.stringify(missionData);

      const { data: msg, error } = await supabaseAdmin
        .from("chat_messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content,
          type: "mission_invite",
          delivered_at: new Date().toISOString(),
        }).select().single();

      if (error) throw error;

      const assignedIds = [os.assignedEmployeeId, os.assignedEmployee2Id].filter(Boolean);
      for (const empId of assignedIds) {
        const { data: existing } = await supabaseAdmin
          .from("mission_acceptances").select("id")
          .eq("service_order_id", os.id)
          .eq("employee_id", empId)
          .single();
        if (!existing) {
          await supabaseAdmin.from("mission_acceptances").insert({
            id: randomUUID(),
            service_order_id: os.id,
            employee_id: empId,
            status: "pendente",
            acceptance_token: randomUUID(),
          });
        }
      }

      await logSystemAudit({
        userId, userName: req.user!.name, userRole: req.user!.role,
        action: "mission_invite_sent",
        targetId: String(os.id), targetType: "service_order",
        details: `OS ${os.osNumber} enviada para chat (conversa ${conversationId})`,
      });

      res.json(msg);
    } catch (err: any) {
      console.error("[chat] send mission invite error:", err.message);
      res.status(500).json({ message: "Erro ao enviar convite de missão" });
    }
  });

  app.post("/api/chat/accept-mission", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userName = req.user!.name || "Agente";
      const { serviceOrderId, conversationId, locationLat, locationLng, deviceInfo } = req.body;

      if (!serviceOrderId || !conversationId) {
        return res.status(400).json({ message: "serviceOrderId e conversationId são obrigatórios" });
      }

      const osId = Number(serviceOrderId);
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      const employeeId = req.user!.employeeId;
      if (!employeeId) return res.status(404).json({ message: "Funcionário não vinculado ao usuário" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const os = await storage.getServiceOrder(osId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });
      if (os.assignedEmployeeId !== emp.id && os.assignedEmployee2Id !== emp.id) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      if (!isAdmin) {
        const { data: part } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", conversationId)
          .eq("user_id", userId)
          .limit(1);
        if (!part?.length) {
          return res.status(403).json({ message: "Sem acesso a esta conversa" });
        }
      }

      let { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", emp.id)
        .eq("status", "pendente")
        .single();

      if (!acceptance) {
        const { data: existing } = await supabaseAdmin
          .from("mission_acceptances").select("status")
          .eq("service_order_id", osId)
          .eq("employee_id", emp.id)
          .single();
        if (existing?.status === "aceito") return res.status(400).json({ message: "Missão já aceita" });

        const { data: created } = await supabaseAdmin.from("mission_acceptances").insert({
          id: randomUUID(),
          service_order_id: osId,
          employee_id: emp.id,
          status: "pendente",
          acceptance_token: randomUUID(),
        }).select().single();
        acceptance = created;
        if (!acceptance) return res.status(500).json({ message: "Erro ao criar registro de aceite" });
      }

      const now = new Date();
      await supabaseAdmin.from("mission_acceptances").update({
        status: "aceito",
        responded_at: now.toISOString(),
        ip_address: ipAddress,
        device_info: deviceInfo || null,
        location_lat: locationLat || null,
        location_lng: locationLng || null,
      }).eq("id", acceptance.id);

      await storage.updateServiceOrder(osId, { missionStatus: "aceita" });

      const timeBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

      await supabaseAdmin.from("chat_messages").insert({
        id: randomUUID(),
        conversation_id: conversationId,
        sender_id: userId,
        type: "system",
        content: `✅ ${emp.name} aceitou a missão ${os.osNumber} — ${timeBRT}`,
      });

      await logSystemAudit({
        userId, userName, userRole: req.user!.role,
        action: "mission_acceptance_accept",
        targetId: String(osId), targetType: "service_order",
        details: JSON.stringify({
          osNumber: os.osNumber, employeeId: emp.id, employeeName: emp.name,
          respondedAt: timeBRT, ipAddress, deviceInfo, locationLat, locationLng,
          acceptanceToken: acceptance.acceptance_token,
        }),
        ipAddress,
      });

      res.json({ ok: true, osNumber: os.osNumber });
    } catch (err: any) {
      console.error("[chat] accept mission error:", err.message);
      res.status(500).json({ message: "Erro ao aceitar missão" });
    }
  });

  app.get("/api/chat/service-orders-available", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const orders = await storage.getServiceOrders();
      const available = orders
        .filter(o => o.status !== "concluida" && o.status !== "concluída" && o.status !== "cancelada" && o.missionStatus !== "encerrada")
        .map(o => ({
          id: o.id,
          osNumber: o.osNumber,
          origin: o.origin || "",
          destination: o.destination || "",
          scheduledDate: o.scheduledDate,
          type: o.type,
          missionStatus: o.missionStatus,
        }));
      res.json(available);
    } catch (err: any) {
      console.error("[chat] list available OS error:", err.message);
      res.status(500).json({ message: "Erro ao listar OS disponíveis" });
    }
  });
}
