export { brtDateKey } from "../../shared/brt-date";

/** Data de HOJE em BRT decomposta (ano, mês 1-12, dia, dia-da-semana 0=dom). */
function brtTodayParts(): { y: number; m: number; d: number; dow: number } {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = s.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
}

/**
 * Semana corrente em BRT no padrão do Balanço Gerencial (getDateRange "WEEK"
 * em client/src/pages/admin/balanco-gerencial.tsx): segunda → domingo.
 * Usado pelo warm-up do cache SWR pra aquecer exatamente a chave que o
 * frontend vai pedir.
 */
export function currentBrtWeekRange(): { from: string; to: string } {
  const { y, m, d, dow } = brtTodayParts();
  const offsetToMonday = (dow + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, d - offsetToMonday));
  const end = new Date(Date.UTC(y, m - 1, d - offsetToMonday + 6));
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

/** Dia corrente em BRT (from = to = hoje), padrão do filtro DAY do Balanço. */
export function currentBrtDayRange(): { from: string; to: string } {
  const { y, m, d } = brtTodayParts();
  const p = (n: number) => String(n).padStart(2, "0");
  const key = `${y}-${p(m)}-${p(d)}`;
  return { from: key, to: key };
}

/** Mês civil corrente em BRT (1º → último dia), padrão do filtro MONTH do Balanço. */
export function currentBrtMonthRange(): { from: string; to: string } {
  const { y, m } = brtTodayParts();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}
