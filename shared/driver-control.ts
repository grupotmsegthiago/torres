// Limite de tempo de direção contínua antes do alerta de fadiga.
// Fonte única usada no app do agente (cronômetro/alerta) e no admin.
// Ordem do dono: reduzir de 4h para ~3h. Ajuste aqui para mudar em todo o sistema.
export const DRIVER_ALERT_MINUTES = 180; // 3 horas
export const DRIVER_ALERT_SECONDS = DRIVER_ALERT_MINUTES * 60;
export const DRIVER_ALERT_MS = DRIVER_ALERT_MINUTES * 60 * 1000;
export const DRIVER_ALERT_HOURS = DRIVER_ALERT_MINUTES / 60;
export const DRIVER_ALERT_LABEL =
  DRIVER_ALERT_MINUTES % 60 === 0
    ? `${DRIVER_ALERT_HOURS}h`
    : `${Math.floor(DRIVER_ALERT_HOURS)}h${String(DRIVER_ALERT_MINUTES % 60).padStart(2, "0")}`;
