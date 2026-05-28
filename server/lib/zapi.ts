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
}): Promise<ZapiSendImageResult> {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API não configurada (ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN)" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };

  const body = {
    phone,
    image: params.imageBase64OrUrl,
    caption: (params.caption || "").slice(0, 1024), // WhatsApp tem limite de ~1024 chars na legenda
  };

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

/**
 * Envia mensagem só de texto (caso não tenha foto).
 */
export async function sendText(params: {
  groupOrPhone: string;
  message: string;
}): Promise<ZapiSendImageResult> {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API não configurada" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };

  try {
    const resp = await fetch(`${BASE}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": CLIENT_TOKEN,
      },
      body: JSON.stringify({ phone, message: params.message }),
      signal: AbortSignal.timeout(15000),
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
