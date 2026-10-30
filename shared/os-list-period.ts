/**
 * Filtro de período da listagem de Ordens de Serviço.
 *
 * Campo (regra já usada na tela): scheduledDate; se vazio, createdAt.
 * Dia calendário: brtDateKey — timestamp sem fuso ou com -03:00 mantém o
 * prefixo; UTC (Z) vira o dia em America/Sao_Paulo. Assim o último dia do
 * mês entra por inteiro, inclusive madrugada.
 *
 * Intervalo: mês civil, dia 01 até o último dia (fevereiro bissexto incluso),
 * via calendarDiariasRange. Não é ciclo de folha nem quinzena de faturamento.
 */
import { brtDateKey } from "./brt-date";
import { calendarDiariasRange, formatPeriodoBR } from "./diarias-periodo";

const YM = /^(\d{4})-(\d{2})$/;

/** Mês civil corrente em America/Sao_Paulo como YYYY-MM (default da listagem de OS). */
export function currentBrtCalendarMonthYm(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

export function osListCalendarMonthRange(ym: string): { from: string; to: string } | null {
  const match = YM.exec(String(ym || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return calendarDiariasRange(year, month, "mes");
}

/** ±1 dia em torno do mês civil. Pré-filtro PostgREST; o corte fino usa osMatchesCalendarMonth. */
export function osListCalendarMonthFetchWindow(ym: string): {
  from: string;
  to: string;
  fromPad: string;
  toPad: string;
} | null {
  const range = osListCalendarMonthRange(ym);
  if (!range) return null;
  const shift = (ymd: string, days: number): string => {
    const d = new Date(`${ymd}T12:00:00-03:00`);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  };
  return {
    from: range.from,
    to: range.to,
    fromPad: shift(range.from, -1),
    toPad: shift(range.to, 1),
  };
}

export function formatOsListPeriodLabel(ym: string): string | null {
  const range = osListCalendarMonthRange(ym);
  return range ? formatPeriodoBR(range.from, range.to) : null;
}

/** scheduledDate preenchido tem prioridade; senão createdAt. Aceita snake_case da API crua. */
export function osListPeriodRaw(order: {
  scheduledDate?: unknown;
  scheduled_date?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
}): unknown {
  const scheduled = order.scheduledDate ?? order.scheduled_date;
  if (scheduled != null && String(scheduled).trim() !== "") return scheduled;
  const created = order.createdAt ?? order.created_at;
  if (created != null && String(created).trim() !== "") return created;
  return null;
}

/** Inclusivo: dia 01 00:00 BRT até o último dia 23:59 BRT. */
export function osMatchesCalendarMonth(
  order: {
    scheduledDate?: unknown;
    scheduled_date?: unknown;
    createdAt?: unknown;
    created_at?: unknown;
  },
  ym: string,
): boolean {
  const range = osListCalendarMonthRange(ym);
  if (!range) return false;
  const day = brtDateKey(osListPeriodRaw(order));
  if (!day) return false;
  return day >= range.from && day <= range.to;
}
