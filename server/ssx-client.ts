/**
 * Cliente da API SSX Tracking Integration.
 *
 * Doc Swagger: https://integration.systemsatx.com.br
 * Endpoints usados:
 *   POST /Login (query: Username, Password, Hashcentral?, HashAuth?) → { AccessToken, ExpiresIn }
 *   POST /Tracking/Videotelemetry/GetURLStreamLink (body: { VehicleIntegrationCode, Channel }) → { URLStream }
 *
 * O token é cacheado em memória e renovado quando expira ou quando uma
 * chamada autenticada devolve 401. Credenciais lidas só de env vars
 * (SSX_EMAIL, SSX_PASSWORD, SSX_TOKEN) — nunca expor pro cliente.
 */

const SSX_BASE = process.env.SSX_BASE_URL || "https://integration.systemsatx.com.br";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let inflightLogin: Promise<string> | null = null;

function ssxCredentials() {
  const Username = process.env.SSX_EMAIL || "";
  const Password = process.env.SSX_PASSWORD || "";
  const HashAuth = process.env.SSX_TOKEN || "";
  if (!Username || !Password) {
    throw new Error("SSX não configurada: faltam SSX_EMAIL e/ou SSX_PASSWORD nos secrets.");
  }
  return { Username, Password, HashAuth };
}

async function performLogin(): Promise<string> {
  const { Username, Password, HashAuth } = ssxCredentials();
  const qs = new URLSearchParams({ Username, Password });
  if (HashAuth) qs.set("HashAuth", HashAuth);
  const url = `${SSX_BASE}/Login?${qs.toString()}`;
  const resp = await fetch(url, { method: "POST", headers: { Accept: "application/json" } });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`SSX /Login falhou: HTTP ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { AccessToken?: string; ExpiresIn?: number };
  if (!data.AccessToken) throw new Error("SSX /Login não devolveu AccessToken.");
  // ExpiresIn é segundos. Renova 60s antes pra evitar corrida.
  const ttlMs = Math.max(60_000, ((data.ExpiresIn || 3600) - 60) * 1000);
  tokenCache = { token: data.AccessToken, expiresAt: Date.now() + ttlMs };
  return data.AccessToken;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  if (inflightLogin) return inflightLogin;
  inflightLogin = performLogin().finally(() => {
    inflightLogin = null;
  });
  return inflightLogin;
}

async function ssxFetch(path: string, init: RequestInit & { _retried?: boolean } = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const resp = await fetch(`${SSX_BASE}${path}`, { ...init, headers });
  if (resp.status === 401 && !init._retried) {
    tokenCache = null;
    return ssxFetch(path, { ...init, _retried: true });
  }
  return resp;
}

export type SsxStreamResult = { url: string; channel: number; integrationCode: string };

/**
 * Pede à SSX a URL HLS do canal solicitado.
 * Canais convencionados:
 *   1 = câmera frontal/externa (Street)
 *   2 = câmera interna (motorista — usada para análise de comportamento)
 */
export async function getStreamUrl(integrationCode: string, channel: number): Promise<SsxStreamResult> {
  if (!integrationCode) throw new Error("integrationCode obrigatório");
  const ch = Number(channel);
  if (!Number.isInteger(ch) || ch < 1 || ch > 16) {
    throw new Error("channel deve ser inteiro entre 1 e 16");
  }
  const resp = await ssxFetch("/Tracking/Videotelemetry/GetURLStreamLink", {
    method: "POST",
    body: JSON.stringify({ VehicleIntegrationCode: integrationCode, Channel: ch }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`SSX GetURLStreamLink HTTP ${resp.status} ${body.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { URLStream?: string | null };
  if (!data.URLStream) {
    throw new Error("SSX não retornou URLStream (câmera offline ou canal sem sinal).");
  }
  return { url: data.URLStream, channel: ch, integrationCode };
}

/** Diagnóstico: força login e devolve metadata do token (sem expor o token). */
export async function pingSsx(): Promise<{ ok: true; expiresAt: number } | { ok: false; error: string }> {
  try {
    await getToken(true);
    return { ok: true, expiresAt: tokenCache?.expiresAt || 0 };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}
