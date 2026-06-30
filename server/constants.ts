// Versão da aplicação — incrementar a cada deploy/correção significativa.
// Lida em runtime por GET /api/version (sem cache) para detectar mismatch
// entre cliente PWA e servidor publicado e disparar hard reset automático.
export const APP_VERSION = "3.7.0";
export const APP_BUILD_AT = new Date().toISOString();

// Tamanho TOTAL do disco do banco (Supabase), em MB. Usado para a barra de
// progresso de uso no painel /admin/database. Override via env DB_DISK_LIMIT_MB.
// Instâncias Micro (2 vCPU ARM / 2 GB RAM) vêm com 8 GB de disco por padrão.
const _diskLimitEnv = Number(process.env.DB_DISK_LIMIT_MB);
export const DB_DISK_LIMIT_MB = Number.isFinite(_diskLimitEnv) && _diskLimitEnv > 0 ? _diskLimitEnv : 8192;
