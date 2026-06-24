/**
 * Persistência das mensagens SAINTES do bot (Central Torres) em
 * `whatsapp_messages` + `whatsapp_chats`.
 *
 * Motivo (ordem do dono, 24/06/2026): a tela interna de WhatsApp
 * (`client/src/pages/admin/whatsapp.tsx`) é um ESPELHO EM TEMPO REAL —
 * "mandou aparece pra todos, recebeu aparece pra todos". A tela lê só o que
 * está em `whatsapp_messages` (realtime via supabase channel + polling). As
 * mensagens de ENTRADA (webhook) e o envio MANUAL pela tela (`/api/whatsapp/send`)
 * já gravavam; as mensagens que o BOT dispara (cobranças/acks/fotos via
 * `sendText`/`sendImageWithCaption`) NÃO gravavam — só apareceriam se a Z-API
 * mandasse de volta um webhook "enviado por mim", o que não é confiável. Por
 * isso as cobranças sumiam da tela. Este helper fecha esse buraco gravando toda
 * saída do bot no ponto único dos senders.
 *
 * Importante:
 * - FAIL-OPEN: nunca lança. O envio já aconteceu; uma falha de gravação não pode
 *   virar erro de envio nem derrubar o cron/agente.
 * - chat_id usa a MESMA normalização do envio (`normalizePhoneOrGroup` em
 *   zapi.ts), que bate com o `chat_id` do webhook (= `body.phone`), pra a
 *   mensagem do bot cair na conversa certa.
 * - Idempotência por `zapi_message_id`: se a Z-API também estiver configurada pra
 *   disparar o webhook "enviado por mim" com o mesmo id, não duplica.
 */
import { supabaseAdmin } from "../supabase";

function isGroupId(id: string): boolean {
  return id.endsWith("@g.us") || id.endsWith("-group");
}

const TYPE_PREVIEW: Record<string, string> = {
  image: "📷 Foto",
  audio: "🎵 Áudio",
  video: "🎬 Vídeo",
  document: "📄 Documento",
  location: "📍 Localização",
};

export async function persistOutgoingWhatsappMessage(params: {
  /** chat_id já normalizado (telefone do contato ou id do grupo). */
  chatId: string;
  /** id retornado pela Z-API (pra idempotência com o webhook "enviado"). */
  messageId?: string | null;
  type?: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  senderName?: string | null;
  /** ISO; default = agora. */
  ts?: string;
}): Promise<void> {
  try {
    const chatId = (params.chatId || "").trim();
    if (!chatId) return;
    const ts = params.ts || new Date().toISOString();
    const type = params.type || "text";

    // Idempotência: evita gravar 2x se o webhook "enviado por mim" também chegar.
    if (params.messageId) {
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id")
        .eq("zapi_message_id", params.messageId)
        .maybeSingle();
      if (existing) return;
    }

    const { error: insErr } = await supabaseAdmin.from("whatsapp_messages").insert({
      chat_id: chatId,
      zapi_message_id: params.messageId || null,
      from_me: true,
      sender_phone: null,
      sender_name: params.senderName || "Central Torres",
      type,
      body: params.body ?? null,
      media_url: params.mediaUrl ?? null,
      media_mime: params.mediaMime ?? null,
      status: "sent",
      ts,
    });
    // PostgREST pode falhar sem lançar exceção — logamos o contexto p/ não perder
    // o espelho em silêncio (mas seguimos fail-open: o envio já aconteceu).
    if (insErr) {
      console.warn(`[whatsapp-store] insert msg falhou (chat=${chatId} mid=${params.messageId} type=${type}):`, insErr.message);
      return;
    }

    // Preview pra sidebar (mesmo formato do webhook).
    const preview = (params.body && params.body.trim())
      || TYPE_PREVIEW[type]
      || "Mensagem";

    // Preserva nome existente do chat (não rebaixa pra null/id).
    const { data: existingChat } = await supabaseAdmin
      .from("whatsapp_chats")
      .select("name")
      .eq("chat_id", chatId)
      .maybeSingle();

    await supabaseAdmin.from("whatsapp_chats").upsert({
      chat_id: chatId,
      name: (existingChat as any)?.name || null,
      is_group: isGroupId(chatId),
      last_message_at: ts,
      last_message_text: preview.slice(0, 280),
      last_message_from_me: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "chat_id" });
  } catch (e: any) {
    console.warn("[whatsapp-store] persistOutgoing falhou (fail-open):", e?.message);
  }
}
