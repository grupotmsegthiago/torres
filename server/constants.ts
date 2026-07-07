import fs from "fs";
import path from "path";
import crypto from "crypto";

// Versão da aplicação — incrementar a cada deploy/correção significativa.
// Lida em runtime por GET /api/version (sem cache) para detectar mismatch
// entre cliente PWA e servidor publicado e disparar hard reset automático.
export const APP_VERSION = "3.8.0";
export const APP_BUILD_AT = new Date().toISOString();

// ─── Build ID automático por deploy ───
// Hash do index.html buildado (os nomes dos assets têm hash do Vite, então o
// conteúdo muda a cada build). Elimina a dependência de lembrar de bumpar
// APP_VERSION: todo deploy gera um buildId novo e os clientes PWA detectam
// sozinhos via /api/version. Em dev (sem dist/) fica "dev" — estável, nunca
// dispara reset. IMPORTANTE: precisa ser estável entre instâncias do
// autoscale (mesmo dist ⇒ mesmo hash), por isso NUNCA usar timestamp de boot.
function computeBuildId(): string {
  // Em dev (Vite serve o client, não existe build) o id é fixo — nunca reseta.
  if (process.env.NODE_ENV !== "production") return "dev";
  try {
    // No bundle CJS de prod, __dirname = dist/ ⇒ dist/public/index.html.
    const candidates = [
      typeof __dirname !== "undefined" ? path.resolve(__dirname, "public", "index.html") : "",
      path.resolve(process.cwd(), "dist", "public", "index.html"),
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 12);
      }
    }
  } catch {}
  console.warn("[version] AVISO: NODE_ENV=production mas dist/public/index.html não encontrado — buildId caiu em 'dev' e o auto-update por deploy fica inativo");
  return "dev";
}
export const APP_BUILD_ID = computeBuildId();

// Tamanho TOTAL do disco do banco (Supabase), em MB. Usado para a barra de
// progresso de uso no painel /admin/database. Override via env DB_DISK_LIMIT_MB.
// Instâncias Micro (2 vCPU ARM / 2 GB RAM) vêm com 8 GB de disco por padrão.
const _diskLimitEnv = Number(process.env.DB_DISK_LIMIT_MB);
export const DB_DISK_LIMIT_MB = Number.isFinite(_diskLimitEnv) && _diskLimitEnv > 0 ? _diskLimitEnv : 8192;
