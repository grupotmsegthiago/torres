// Versão da aplicação — incrementar a cada deploy/correção significativa.
// Lida em runtime por GET /api/version (sem cache) para detectar mismatch
// entre cliente PWA e servidor publicado e disparar hard reset automático.
export const APP_VERSION = "3.5.1";
export const APP_BUILD_AT = new Date().toISOString();
