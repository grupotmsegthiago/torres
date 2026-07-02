/**
 * Extrai a DATA-CALENDÁRIO BRT (YYYY-MM-DD) de um timestamp, de forma robusta ao fuso do PROCESSO.
 *
 * Contexto (SYSTEM_BRAIN §1.1): o processo Node roda em TZ=UTC. Um timestamp BRT-nativo SEM sufixo
 * (formato canônico de armazenamento, ex: "2026-06-30T01:00:00") passado por
 * `new Date(...).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })` é interpretado como
 * UTC e, na madrugada (00:00–02:59), ESCORREGA para o dia ANTERIOR — derrubando missões de madrugada
 * do filtro de período do Balanço/Relatório de OS.
 *
 * Hoje os dados de produção vêm com offset `-03:00` (ex: "2026-06-30T01:00:00-03:00"), então o bug não
 * se manifesta. Esta função é a BLINDAGEM: se um timestamp for gravado um dia sem o offset, o corte por
 * dia continua exato.
 *
 * Regra: se o wall-clock já está em BRT (sem sufixo OU offset `-03:00`/`-0300`), o prefixo de data É a
 * data-calendário BRT — basta fatiar. Só convertemos via `Date` quando há `Z` (UTC) ou um offset
 * diferente de BRT, casos em que a data-calendário BRT pode de fato diferir do prefixo.
 */
export function brtDateKey(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  const hasZ = /[Zz]$/.test(s);
  const off = s.match(/([+-]\d{2}):?(\d{2})$/);
  const isBRTOffset = !!off && off[1] === "-03" && off[2] === "00";
  if (hasZ || (off && !isBRTOffset)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? m[1] : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  return m[1];
}

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
