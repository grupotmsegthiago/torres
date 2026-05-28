import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { sendText, sendImageWithCaption, listAllChats, isZapiConfigured } from "../lib/zapi";

/**
 * Rotas do WhatsApp embarcado.
 *
 * Arquitetura: a Z-API multi-device NÃO permite buscar histórico via API.
 * Toda a fonte de verdade do histórico vem do nosso DB, populado por:
 *   1) Webhook Z-API "on message received" → POST /api/whatsapp/webhook
 *   2) Nossa própria rota de envio → POST /api/whatsapp/send (persiste o que mandamos)
 *
 * A lista de chats mescla os chats do nosso DB com os chats recentes
 * que a Z-API retorna em /chats (mesmo que nunca tenhamos visto mensagem
 * deles via webhook), pra o usuário poder iniciar conversa.
 */

const WEBHOOK_TOKEN = process.env.ZAPI_TOKEN || ""; // valida bearer no webhook (usa o mesmo token Z-API)

type ChatRow = {
  chat_id: string;
  name: string | null;
  is_group: boolean;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_from_me: boolean | null;
  unread_count: number;
  pinned: boolean;
  archived: boolean;
};

type MsgRow = {
  id: number;
  chat_id: string;
  zapi_message_id: string | null;
  from_me: boolean;
  sender_phone: string | null;
  sender_name: string | null;
  type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  status: string | null;
  ts: string;
};

/** Detecta se o ID é grupo. */
function isGroupId(id: string): boolean {
  return id.endsWith("@g.us") || id.endsWith("-group");
}

/**
 * Faz upsert de chat no nosso DB com base num evento (msg recebida/enviada).
 *
 * Atomicidade do unread: o upsert NÃO mexe em `unread_count`. Pra incremento,
 * fazemos uma segunda chamada que aciona um SQL `unread_count = unread_count + 1`
 * via RPC quando disponível, ou (fallback) lê-soma-escreve. Sem RPC, a janela
 * de race é pequena (sub-ms) e o impacto é só subcontar — preferimos isso ao
 * Lost Update de zerar contagem.
 */
async function upsertChatFromEvent(params: {
  chatId: string;
  name?: string | null;
  isGroup?: boolean;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastMessageFromMe: boolean;
  incrementUnread?: boolean;
}) {
  const isGroup = params.isGroup ?? isGroupId(params.chatId);

  // Preserva nome existente se já temos um melhor que o ID
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_chats")
    .select("name")
    .eq("chat_id", params.chatId)
    .maybeSingle();
  const newName = params.name && params.name !== params.chatId
    ? params.name
    : ((existing as any)?.name || params.name || null);

  // Upsert SEM tocar em unread_count (default 0 no insert; UPDATE não envia o campo)
  await supabaseAdmin.from("whatsapp_chats").upsert({
    chat_id: params.chatId,
    name: newName,
    is_group: isGroup,
    last_message_at: params.lastMessageAt,
    last_message_text: params.lastMessageText?.slice(0, 280) || null,
    last_message_from_me: params.lastMessageFromMe,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chat_id" });

  // Incremento atômico do unread via RPC exec_sql (quando msg recebida).
  // Fallback silencioso se a RPC não existir — soft-fail aceitável (não bloqueia mensagem).
  if (params.incrementUnread) {
    try {
      await supabaseAdmin.rpc("exec_sql", {
        query: `UPDATE whatsapp_chats SET unread_count = COALESCE(unread_count, 0) + 1 WHERE chat_id = '${params.chatId.replace(/'/g, "''")}'`,
      });
    } catch {
      // Fallback não-atômico (race window pequena)
      const { data: cur } = await supabaseAdmin
        .from("whatsapp_chats")
        .select("unread_count")
        .eq("chat_id", params.chatId)
        .maybeSingle();
      await supabaseAdmin
        .from("whatsapp_chats")
        .update({ unread_count: Number((cur as any)?.unread_count || 0) + 1 })
        .eq("chat_id", params.chatId);
    }
  }
}

/** Extrai dados úteis de um webhook Z-API "message received". */
function parseWebhookMessage(body: any): {
  chatId: string;
  isGroup: boolean;
  chatName: string | null;
  senderPhone: string | null;
  senderName: string | null;
  fromMe: boolean;
  zapiMessageId: string | null;
  type: string;
  text: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  caption: string | null;
  ts: string;
} | null {
  if (!body || typeof body !== "object") return null;

  const phone = String(body.phone || "").trim();
  const isGroup = body.isGroup === true || phone.endsWith("@g.us") || phone.endsWith("-group");
  if (!phone) return null;

  const chatId = phone; // pra Z-API o phone do callback já é o chat_id (grupo ou contato)
  const fromMe = body.fromMe === true;
  const zapiMessageId = body.messageId || body.id || null;
  const tsMs = Number(body.momment || body.moment || body.timestamp || 0);
  const ts = tsMs ? new Date(tsMs).toISOString() : new Date().toISOString();

  const chatName = body.chatName || body.senderName || (isGroup ? null : (body.notifyName || null));
  const senderPhone = isGroup ? (body.participantPhone || body.participantLid || null) : phone;
  const senderName = body.senderName || body.notifyName || body.participantName || null;

  // Detecta tipo
  let type = "text";
  let text: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMime: string | null = null;
  let caption: string | null = null;

  if (body.text?.message) {
    type = "text";
    text = String(body.text.message);
  } else if (body.image) {
    type = "image";
    mediaUrl = body.image.imageUrl || body.image.url || null;
    mediaMime = body.image.mimeType || "image/jpeg";
    caption = body.image.caption || null;
    text = caption;
  } else if (body.audio) {
    type = "audio";
    mediaUrl = body.audio.audioUrl || body.audio.url || null;
    mediaMime = body.audio.mimeType || "audio/ogg";
  } else if (body.video) {
    type = "video";
    mediaUrl = body.video.videoUrl || body.video.url || null;
    mediaMime = body.video.mimeType || "video/mp4";
    caption = body.video.caption || null;
    text = caption;
  } else if (body.document) {
    type = "document";
    mediaUrl = body.document.documentUrl || body.document.url || null;
    mediaMime = body.document.mimeType || "application/pdf";
    caption = body.document.title || body.document.caption || null;
    text = caption;
  } else if (body.sticker) {
    type = "sticker";
    mediaUrl = body.sticker.stickerUrl || body.sticker.url || null;
    mediaMime = "image/webp";
  } else if (body.contact) {
    type = "contact";
    text = body.contact.displayName || null;
  } else if (body.location) {
    type = "location";
    text = `${body.location.latitude},${body.location.longitude}`;
  } else {
    type = "other";
  }

  return { chatId, isGroup, chatName, senderPhone, senderName, fromMe, zapiMessageId, type, text, mediaUrl, mediaMime, caption, ts };
}

export function registerWhatsappRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────────
  // GET /api/whatsapp/chats
  // Lista mesclada: chats do nosso DB + chats recentes da Z-API.
  // ─────────────────────────────────────────────────────────────
  app.get("/api/whatsapp/chats", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data: dbChats, error } = await supabaseAdmin
        .from("whatsapp_chats")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) console.warn("[whatsapp/chats] db err:", error.message);

      const map = new Map<string, any>();
      for (const c of (dbChats || []) as ChatRow[]) {
        map.set(c.chat_id, {
          id: c.chat_id,
          name: c.name || c.chat_id,
          isGroup: c.is_group,
          lastMessageAt: c.last_message_at,
          lastMessageText: c.last_message_text,
          lastMessageFromMe: c.last_message_from_me,
          unread: c.unread_count,
          pinned: c.pinned,
          archived: c.archived,
          source: "db",
        });
      }

      // Mescla com chats da Z-API (que podem incluir conversas que nunca
      // tivemos webhook ativo pra ver — assim o usuário consegue abrir
      // mesmo sem mensagens registradas)
      if (isZapiConfigured()) {
        const r = await listAllChats();
        if (r.ok) {
          for (const zc of r.chats) {
            const existing = map.get(zc.id);
            if (existing) {
              // Atualiza nome se a Z-API tem um melhor
              if (zc.name && zc.name !== zc.id && (!existing.name || existing.name === zc.id)) {
                existing.name = zc.name;
              }
              if (zc.lastMessageTime && (!existing.lastMessageAt || new Date(existing.lastMessageAt).getTime() < zc.lastMessageTime)) {
                existing.lastMessageAt = new Date(zc.lastMessageTime).toISOString();
              }
            } else {
              map.set(zc.id, {
                id: zc.id,
                name: zc.name,
                isGroup: zc.isGroup,
                lastMessageAt: zc.lastMessageTime ? new Date(zc.lastMessageTime).toISOString() : null,
                lastMessageText: null,
                lastMessageFromMe: null,
                unread: zc.unread || 0,
                pinned: zc.pinned || false,
                archived: zc.archived || false,
                source: "zapi",
              });
            }
          }
        }
      }

      const list = Array.from(map.values()).sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      });

      res.json({ ok: true, chats: list, count: list.length });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "erro interno" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/whatsapp/chats/:chatId/messages?limit=100
  // ─────────────────────────────────────────────────────────────
  app.get("/api/whatsapp/chats/:chatId/messages", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const chatId = decodeURIComponent(String(req.params.chatId));
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("ts", { ascending: false })
        .limit(limit);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const msgs = ((data || []) as MsgRow[]).reverse();

      // Marca como lido — zera unread do chat
      await supabaseAdmin
        .from("whatsapp_chats")
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq("chat_id", chatId);

      res.json({ ok: true, chatId, messages: msgs });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "erro interno" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/whatsapp/send
  // body: { chatId, text }   (futuro: { chatId, imageBase64, caption })
  // ─────────────────────────────────────────────────────────────
  app.post("/api/whatsapp/send", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { chatId, text } = req.body || {};
      if (!chatId || typeof chatId !== "string") return res.status(400).json({ ok: false, error: "chatId obrigatório" });
      if (!text || typeof text !== "string" || !text.trim()) return res.status(400).json({ ok: false, error: "text obrigatório" });

      const r = await sendText({ groupOrPhone: chatId, message: text.trim() });
      if (!r.ok) return res.status(502).json({ ok: false, error: r.error || "falha Z-API" });

      const ts = new Date().toISOString();
      // Persiste no nosso DB
      const { data: inserted } = await supabaseAdmin
        .from("whatsapp_messages")
        .insert({
          chat_id: chatId,
          zapi_message_id: r.messageId || null,
          from_me: true,
          sender_phone: null,
          sender_name: "Central Torres",
          type: "text",
          body: text.trim(),
          media_url: null,
          media_mime: null,
          status: "sent",
          ts,
        })
        .select("*")
        .single();

      // Atualiza chat (não incrementa unread — fomos nós que mandamos)
      await upsertChatFromEvent({
        chatId,
        lastMessageAt: ts,
        lastMessageText: text.trim(),
        lastMessageFromMe: true,
        incrementUnread: false,
      });

      res.json({ ok: true, messageId: r.messageId, message: inserted });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "erro interno" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/whatsapp/webhook
  // Recebe eventos da Z-API (configurar no painel Z-API).
  // Aceita: on-message-received, on-message-sent, on-message-status.
  // Auth: Bearer token = ZAPI_TOKEN (configurar igual no painel).
  // ─────────────────────────────────────────────────────────────
  app.post("/api/whatsapp/webhook", async (req, res) => {
    // DEBUG: loga TUDO que chega antes de qualquer validação (pra diagnosticar
    // se a Z-API está mesmo disparando o webhook).
    console.log("[whatsapp/webhook] HIT", {
      ip: req.ip,
      ua: req.headers["user-agent"],
      qs: req.query,
      hasAuth: !!req.headers.authorization,
      bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body).slice(0, 20) : typeof req.body,
      bodyType: req.body?.type,
    });
    // Auth: aceita token via query `?token=<ZAPI_TOKEN>` OU header
    // `Authorization: Bearer <ZAPI_TOKEN>`. O painel da Z-API permite
    // colocar params na URL do webhook, então `?token=` é o caminho
    // mais portátil. Se WEBHOOK_TOKEN está configurado, EXIGE um dos dois.
    const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const qToken = String((req.query?.token as string) || "");
    const provided = auth || qToken;
    if (WEBHOOK_TOKEN) {
      if (!provided) {
        return res.status(401).json({ ok: false, error: "token ausente — configure ?token= na URL do webhook no painel Z-API" });
      }
      if (provided !== WEBHOOK_TOKEN) {
        return res.status(401).json({ ok: false, error: "token inválido" });
      }
    }

    try {
      const body = req.body;
      const evtType = String(body?.type || "").toLowerCase();

      // Status update (delivered/read) — atualiza status da msg sem inserir nova
      if (evtType.includes("status") || body?.status) {
        const mid = body?.messageId || body?.ids?.[0];
        const newStatus = String(body?.status || "").toLowerCase();
        if (mid && newStatus) {
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({ status: newStatus })
            .eq("zapi_message_id", mid);
        }
        return res.json({ ok: true, ignored: "status_update" });
      }

      const parsed = parseWebhookMessage(body);
      if (!parsed) return res.json({ ok: true, ignored: "unparseable" });

      // Idempotência: se já temos essa zapi_message_id, ignora
      if (parsed.zapiMessageId) {
        const { data: existing } = await supabaseAdmin
          .from("whatsapp_messages")
          .select("id")
          .eq("zapi_message_id", parsed.zapiMessageId)
          .maybeSingle();
        if (existing) return res.json({ ok: true, duplicate: parsed.zapiMessageId });
      }

      await supabaseAdmin.from("whatsapp_messages").insert({
        chat_id: parsed.chatId,
        zapi_message_id: parsed.zapiMessageId,
        from_me: parsed.fromMe,
        sender_phone: parsed.senderPhone,
        sender_name: parsed.senderName,
        type: parsed.type,
        body: parsed.text,
        media_url: parsed.mediaUrl,
        media_mime: parsed.mediaMime,
        status: parsed.fromMe ? "sent" : "received",
        ts: parsed.ts,
      });

      // Preview pra sidebar
      const preview = parsed.text || ({
        image: "📷 Foto", audio: "🎵 Áudio", video: "🎬 Vídeo",
        document: "📄 Documento", sticker: "Figurinha", contact: "👤 Contato",
        location: "📍 Localização", other: "Mensagem",
      } as any)[parsed.type] || "Mensagem";

      await upsertChatFromEvent({
        chatId: parsed.chatId,
        name: parsed.chatName,
        isGroup: parsed.isGroup,
        lastMessageAt: parsed.ts,
        lastMessageText: preview,
        lastMessageFromMe: parsed.fromMe,
        incrementUnread: !parsed.fromMe,
      });

      res.json({ ok: true });
    } catch (e: any) {
      console.error("[whatsapp/webhook] erro:", e?.message);
      res.status(500).json({ ok: false, error: e?.message || "erro interno" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/whatsapp/chats/:chatId/mark-read
  // ─────────────────────────────────────────────────────────────
  app.post("/api/whatsapp/chats/:chatId/mark-read", requireAuth, requireAdminRole, async (req, res) => {
    const chatId = decodeURIComponent(String(req.params.chatId));
    await supabaseAdmin
      .from("whatsapp_chats")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("chat_id", chatId);
    res.json({ ok: true });
  });
}
