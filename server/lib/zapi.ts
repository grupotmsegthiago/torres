/**
 * Cliente Z-API (WhatsApp).
 *
 * Docs: https://developer.z-api.io/
 *
 * Endpoint base: https://api.z-api.io/instances/{INSTANCE_ID}/token/{TOKEN}/{action}
 * Header obrigatório: Client-Token: <ZAPI_CLIENT_TOKEN>
 *
 * Group IDs no WhatsApp têm formato "<criador>-<timestamp>@g.us"
 * (ex.: "5511999999999-1681234567@g.us"). A Z-API também aceita o ID
 * sem o sufixo @g.us — normalizamos pra tolerar os dois formatos.
 */

const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
const TOKEN = process.env.ZAPI_TOKEN || "";
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

const BASE = INSTANCE_ID && TOKEN
  ? `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}`
  : "";

/**
 * Remove o TOKEN da instância (e o CLIENT_TOKEN) de qualquer mensagem
 * que vá pro log ou pra resposta de erro. A Z-API embute o token na URL
 * (`/token/<TOKEN>/...`), então erros de rede/HTTP que repetem a URL
 * vazariam o secret. Aqui mascaramos ANTES de retornar/loggar.
 */
function sanitize(s: string): string {
  let out = s || "";
  if (TOKEN) out = out.split(TOKEN).join("***TOKEN***");
  if (CLIENT_TOKEN) out = out.split(CLIENT_TOKEN).join("***CLIENT_TOKEN***");
  return out;
}

export function isZapiConfigured(): boolean {
  return Boolean(INSTANCE_ID && TOKEN && CLIENT_TOKEN);
}

export interface ZapiConnectionStatus {
  configured: boolean;
  connected: boolean;
  smartphoneConnected: boolean;
  error?: string;
}

/**
 * Consulta o status AO VIVO da instância Z-API (GET /status).
 * `connected:false` significa que o celular não está pareado — nesse estado
 * a Z-API ACEITA envios (HTTP 200) mas NÃO entrega, e tampouco recebe
 * mensagens de entrada (o webhook nunca dispara). Por isso é a verdade única
 * pra saber se o WhatsApp da Central está realmente operante.
 */
export async function getConnectionStatus(): Promise<ZapiConnectionStatus> {
  if (!isZapiConfigured()) {
    return { configured: false, connected: false, smartphoneConnected: false, error: "Z-API não configurada" };
  }
  try {
    const resp = await fetch(`${BASE}/status`, {
      headers: { "Client-Token": CLIENT_TOKEN },
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        configured: true,
        connected: false,
        smartphoneConnected: false,
        error: sanitize(String(data?.error || `HTTP ${resp.status}`)),
      };
    }
    return {
      configured: true,
      connected: data?.connected === true,
      smartphoneConnected: data?.smartphoneConnected === true,
      error: data?.error ? sanitize(String(data.error)) : undefined,
    };
  } catch (e: any) {
    return { configured: true, connected: false, smartphoneConnected: false, error: sanitize(e?.message || "erro de rede") };
  }
}

/** Normaliza um group ID — aceita "X-Y", "X-Y@g.us" ou número solto. */
function normalizePhoneOrGroup(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  // Se já tem @, mantém. Senão, devolve cru — Z-API resolve.
  return trimmed.replace(/^whatsapp:/i, "");
}

export interface ZapiSendImageResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  raw?: any;
}

/**
 * Envia uma imagem (base64 data URL ou URL pública) com legenda.
 * Funciona pra contato individual e pra grupo.
 */
export async function sendImageWithCaption(params: {
  groupOrPhone: string;
  imageBase64OrUrl: string;
  caption: string;
  /** Segundos mostrando "digitando..." antes de enviar (Z-API delayMessage). Humaniza o envio. */
  delayMessageSeconds?: number;
}): Promise<ZapiSendImageResult> {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API não configurada (ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN)" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };

  const body: Record<string, any> = {
    phone,
    image: params.imageBase64OrUrl,
    caption: (params.caption || "").slice(0, 1024), // WhatsApp tem limite de ~1024 chars na legenda
  };
  if (params.delayMessageSeconds && params.delayMessageSeconds > 0) {
    body.delayMessage = Math.min(15, Math.max(1, Math.round(params.delayMessageSeconds)));
  }

  try {
    const resp = await fetch(`${BASE}/send-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": CLIENT_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }
    if (!resp.ok) {
      return { ok: false, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`), raw: parsed };
    }
    return { ok: true, messageId: parsed?.id || parsed?.messageId, raw: parsed };
  } catch (err: any) {
    return { ok: false, error: sanitize(err?.message || String(err)) };
  }
}

export interface ZapiGroup {
  id: string;          // ex: "5511...-1681...@g.us"
  name: string;        // nome do grupo
  participantsCount?: number;
}

/**
 * Lista os grupos do WhatsApp da instância Z-API conectada.
 * Usa o endpoint /chats (paginado) e filtra os que são grupos.
 * Retorna até 500 grupos (10 páginas de 50). Z-API limita pageSize a 50.
 */
export async function listGroups(): Promise<{ ok: boolean; groups: ZapiGroup[]; error?: string }> {
  if (!isZapiConfigured()) {
    return { ok: false, groups: [], error: "Z-API não configurada (ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN)" };
  }

  const groups: ZapiGroup[] = [];
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const resp = await fetch(`${BASE}/chats?page=${page}&pageSize=${PAGE_SIZE}`, {
        method: "GET",
        headers: { "Client-Token": CLIENT_TOKEN },
        signal: AbortSignal.timeout(15000),
      });
      const text = await resp.text();
      if (!resp.ok) {
        return { ok: false, groups, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`) };
      }
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      const arr: any[] = Array.isArray(parsed) ? parsed : (parsed?.chats || parsed?.data || []);
      if (!arr || arr.length === 0) break;

      for (const chat of arr) {
        const isGroup = chat?.isGroup === true || String(chat?.phone || chat?.id || "").endsWith("@g.us");
        if (!isGroup) continue;
        const id = String(chat?.phone || chat?.id || "").trim();
        const name = String(chat?.name || chat?.groupName || chat?.subject || id).trim();
        if (!id) continue;
        groups.push({
          id,
          name: name || id,
          participantsCount: chat?.participantsCount || chat?.size,
        });
      }

      if (arr.length < PAGE_SIZE) break; // última página
    }
    // Dedupe por id
    const byId = new Map<string, ZapiGroup>();
    for (const g of groups) if (!byId.has(g.id)) byId.set(g.id, g);
    const list = Array.from(byId.values());

    // O /chats não retorna o subject do grupo — vem como o próprio id.
    // Enriquecer via /group-metadata/{phone} em paralelo (concorrência limitada).
    const CONCURRENCY = 5;
    let idx = 0;
    async function worker() {
      while (idx < list.length) {
        const i = idx++;
        const g = list[i];
        if (g.name && g.name !== g.id) continue; // já tem nome de verdade
        try {
          const resp = await fetch(`${BASE}/group-metadata/${encodeURIComponent(g.id)}`, {
            method: "GET",
            headers: { "Client-Token": CLIENT_TOKEN },
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) continue;
          const meta = await resp.json().catch(() => null) as any;
          const realName = String(meta?.subject || meta?.name || "").trim();
          if (realName) g.name = realName;
          if (typeof meta?.participants?.length === "number") {
            g.participantsCount = meta.participants.length;
          }
        } catch { /* ignora falha individual */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { ok: true, groups: list };
  } catch (err: any) {
    return { ok: false, groups, error: sanitize(err?.message || String(err)) };
  }
}

export interface ZapiChat {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessageTime?: number;
  unread?: number;
  pinned?: boolean;
  archived?: boolean;
}

/**
 * Lista TODOS os chats (grupos + 1:1) ordenados pela última mensagem.
 * Limitação: a Z-API multi-device só expõe chats com atividade recente.
 * Não retorna histórico de mensagens — só metadados pra montar a sidebar.
 */
export async function listAllChats(): Promise<{ ok: boolean; chats: ZapiChat[]; error?: string }> {
  if (!isZapiConfigured()) {
    return { ok: false, chats: [], error: "Z-API não configurada" };
  }
  const chats: ZapiChat[] = [];
  const PAGE_SIZE = 100;
  const MAX_PAGES = 20;
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const resp = await fetch(`${BASE}/chats?page=${page}&pageSize=${PAGE_SIZE}`, {
        method: "GET",
        headers: { "Client-Token": CLIENT_TOKEN },
        signal: AbortSignal.timeout(15000),
      });
      const text = await resp.text();
      if (!resp.ok) return { ok: false, chats, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`) };
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      const arr: any[] = Array.isArray(parsed) ? parsed : (parsed?.chats || parsed?.data || []);
      if (!arr || arr.length === 0) break;
      for (const chat of arr) {
        const id = String(chat?.phone || chat?.id || "").trim();
        if (!id) continue;
        const isGroup = chat?.isGroup === true || id.endsWith("@g.us") || id.endsWith("-group");
        const name = String(chat?.name || chat?.groupName || chat?.subject || id).trim();
        const lastMs = Number(chat?.lastMessageTime || 0) || undefined;
        chats.push({
          id,
          name: name || id,
          isGroup,
          lastMessageTime: lastMs,
          unread: Number(chat?.messagesUnread || chat?.unread || 0) || 0,
          pinned: String(chat?.pinned) === "true",
          archived: String(chat?.archived) === "true",
        });
      }
      if (arr.length < PAGE_SIZE) break;
    }
    // Dedupe + ordena por último msg desc
    const byId = new Map<string, ZapiChat>();
    for (const c of chats) if (!byId.has(c.id)) byId.set(c.id, c);
    const list = Array.from(byId.values());
    list.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    return { ok: true, chats: list };
  } catch (err: any) {
    return { ok: false, chats, error: sanitize(err?.message || String(err)) };
  }
}

/**
 * Envia mensagem só de texto (caso não tenha foto).
 */
export async function sendText(params: {
  groupOrPhone: string;
  message: string;
  /** Segundos mostrando "digitando..." antes de enviar (Z-API delayTyping). Humaniza o envio. */
  delayTypingSeconds?: number;
  /** Segundos de atraso antes do disparo (Z-API delayMessage). */
  delayMessageSeconds?: number;
}): Promise<ZapiSendImageResult> {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API não configurada" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };

  const body: Record<string, any> = { phone, message: params.message };
  // Z-API aceita delayTyping (mostra "digitando...") e delayMessage (atraso antes
  // do disparo). Ambos humanizam o envio — reduzem o "cara de robô" que dispara
  // bloqueio. Limites práticos da Z-API: 1–15s.
  if (params.delayTypingSeconds && params.delayTypingSeconds > 0) {
    body.delayTyping = Math.min(15, Math.max(1, Math.round(params.delayTypingSeconds)));
  }
  if (params.delayMessageSeconds && params.delayMessageSeconds > 0) {
    body.delayMessage = Math.min(15, Math.max(1, Math.round(params.delayMessageSeconds)));
  }

  try {
    const resp = await fetch(`${BASE}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": CLIENT_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!resp.ok) return { ok: false, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`), raw: parsed };
    return { ok: true, messageId: parsed?.id || parsed?.messageId, raw: parsed };
  } catch (err: any) {
    return { ok: false, error: sanitize(err?.message || String(err)) };
  }
}
