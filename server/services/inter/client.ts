/**
 * Cliente HTTP base para Banco Inter — APIs Cobrança v3 e Banking v2.
 *
 * Usa mTLS (certificado .crt + chave .key) + OAuth2 client_credentials.
 * Não depende de pacotes externos — só `https` nativo do Node.
 *
 * Variáveis de ambiente esperadas:
 *  - INTER_CLIENT_ID         (UUID da aplicação no IB PJ)
 *  - INTER_CLIENT_SECRET     (segredo gerado no IB PJ)
 *  - INTER_CONTA_CORRENTE    (número da conta sem hífen, ex: "12345678")
 *  - INTER_CERT_CRT          (conteúdo PEM do certificado .crt)
 *  - INTER_CERT_KEY          (conteúdo PEM da chave privada .key)
 *  - INTER_AMBIENTE          ('prod' | 'sandbox', default sandbox)
 */
import https from "https";

const BASE_URLS = {
  prod: "https://cdpj.partners.bancointer.com.br",
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
};

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

function normalizePem(s: string): string {
  // Aceita tanto \n literal quanto quebras reais (alguns gerenciadores de secret
  // escapam \n na hora de salvar). Garante que o certificado tenha quebras de linha
  // de verdade pro Node.
  return s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;
}

function loadCertKey(): { cert: string; key: string } {
  const cert = process.env.INTER_CERT_CRT;
  const key = process.env.INTER_CERT_KEY;
  if (!cert || !key) {
    throw new Error("INTER_CERT_CRT e INTER_CERT_KEY são obrigatórios para mTLS");
  }
  return { cert: normalizePem(cert), key: normalizePem(key) };
}

class InterClient {
  private tokens = new Map<string, TokenCache>();

  isConfigured(): boolean {
    return !!(
      process.env.INTER_CLIENT_ID &&
      process.env.INTER_CLIENT_SECRET &&
      process.env.INTER_CERT_CRT &&
      process.env.INTER_CERT_KEY
    );
  }

  getBaseUrl(): string {
    return process.env.INTER_AMBIENTE === "prod" ? BASE_URLS.prod : BASE_URLS.sandbox;
  }

  getAmbiente(): "prod" | "sandbox" {
    return process.env.INTER_AMBIENTE === "prod" ? "prod" : "sandbox";
  }

  getContaCorrente(): string {
    return process.env.INTER_CONTA_CORRENTE || "";
  }

  /** Request HTTPS com mTLS. Resolve com JSON parsed, texto ou Buffer. */
  private rawRequest<T>(opts: {
    method: string;
    path: string;
    body?: string;
    contentType?: string;
    headers?: Record<string, string>;
    rawBuffer?: boolean;
  }): Promise<T> {
    const { method, path, body, contentType, headers = {}, rawBuffer } = opts;
    const { cert, key } = loadCertKey();
    const url = new URL(this.getBaseUrl() + path);

    const finalHeaders: Record<string, string> = { ...headers };
    if (body != null) {
      finalHeaders["Content-Type"] = contentType || "application/json";
      finalHeaders["Content-Length"] = Buffer.byteLength(body).toString();
    }

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        {
          method,
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          cert,
          key,
          headers: finalHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              if (rawBuffer) return resolve(buf as any);
              const txt = buf.toString("utf8");
              if (!txt) return resolve(undefined as any);
              try {
                resolve(JSON.parse(txt));
              } catch {
                resolve(txt as any);
              }
            } else {
              const txt = buf.toString("utf8");
              const err: any = new Error(`Inter API ${status} ${method} ${path}: ${txt.slice(0, 500)}`);
              err.status = status;
              err.body = txt;
              reject(err);
            }
          });
        }
      );
      req.on("error", reject);
      if (body != null) req.write(body);
      req.end();
    });
  }

  /** Obtém token OAuth2 com cache por escopo. Renova automaticamente. */
  async getToken(scopes: string): Promise<string> {
    const cached = this.tokens.get(scopes);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

    const clientId = process.env.INTER_CLIENT_ID!;
    const clientSecret = process.env.INTER_CLIENT_SECRET!;
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes,
      grant_type: "client_credentials",
    }).toString();

    const data = await this.rawRequest<{ access_token: string; expires_in: number; scope: string; token_type: string }>({
      method: "POST",
      path: "/oauth/v2/token",
      body: form,
      contentType: "application/x-www-form-urlencoded",
    });

    this.tokens.set(scopes, {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  }

  /** Chamada autenticada às APIs Inter. */
  async call<T = any>(opts: {
    method: string;
    path: string;
    scopes: string;
    body?: any;
    query?: Record<string, any>;
    useContaCorrente?: boolean;
    rawBuffer?: boolean;
  }): Promise<T> {
    const { method, path, scopes, body, query, useContaCorrente, rawBuffer } = opts;
    if (!this.isConfigured()) {
      throw new Error(
        "Banco Inter não configurado. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CONTA_CORRENTE, INTER_CERT_CRT, INTER_CERT_KEY."
      );
    }

    const token = await this.getToken(scopes);

    let fullPath = path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query)
          .filter(([_, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString();
      if (qs) fullPath += (path.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (useContaCorrente && this.getContaCorrente()) {
      headers["x-conta-corrente"] = this.getContaCorrente();
    }

    return this.rawRequest<T>({
      method,
      path: fullPath,
      body: body == null ? undefined : JSON.stringify(body),
      headers,
      rawBuffer,
    });
  }

  /** Limpa cache de tokens (útil após troca de credenciais). */
  resetTokens() {
    this.tokens.clear();
  }
}

let _instance: InterClient | null = null;
export function getInterClient(): InterClient {
  if (!_instance) _instance = new InterClient();
  return _instance;
}

export function isInterConfigured(): boolean {
  return getInterClient().isConfigured();
}
