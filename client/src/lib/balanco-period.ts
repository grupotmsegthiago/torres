/**
 * Filtro de período do Balanço Gerencial — helpers puros (testáveis).
 * Datas em calendário local (inputs type=date); servidor usa BRT nas queries.
 */

export type BalancoPeriod = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "SEMESTER" | "YEAR" | "CUSTOM";

export const PERIOD_LABELS: Record<BalancoPeriod, string> = {
  DAY: "Diário",
  WEEK: "Semanal",
  MONTH: "Mensal",
  QUARTER: "Trimestral",
  SEMESTER: "Semestral",
  YEAR: "Anual",
  CUSTOM: "Personalizado",
};

export const PERIOD_PRESETS = (Object.keys(PERIOD_LABELS) as BalancoPeriod[]).filter((p) => p !== "CUSTOM");

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function fmtYmdLocal(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isYmdString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Normaliza args de "Aplicar período".
 * Importante: onClick={fn} passa MouseEvent como 1º arg — NÃO tratar como data.
 */
export function resolveCustomPeriodArgs(
  fromArg: unknown,
  toArg: unknown,
  draftFrom: string,
  draftTo: string,
): { from: string; to: string } | { error: string } {
  const rawFrom = isYmdString(fromArg) ? fromArg : draftFrom;
  const rawTo = isYmdString(toArg) ? toArg : draftTo;
  if (!rawFrom || !rawTo) return { error: "Informe data inicial e final" };
  if (!isYmdString(rawFrom) || !isYmdString(rawTo)) return { error: "Datas inválidas" };
  const a = parseYmdLocal(rawFrom);
  const b = parseYmdLocal(rawTo);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return { error: "Datas inválidas" };
  const from = a <= b ? rawFrom : rawTo;
  const to = a <= b ? rawTo : rawFrom;
  return { from, to };
}

export function getDateRange(
  period: BalancoPeriod,
  refDate: Date,
  customFrom?: string,
  customTo?: string,
): { start: Date; end: Date; label: string } {
  if (period === "CUSTOM" && customFrom && customTo) {
    const a = parseYmdLocal(customFrom);
    const b = parseYmdLocal(customTo);
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
    };
  }

  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();

  switch (period) {
    case "DAY":
      return {
        start: new Date(y, m, d),
        end: new Date(y, m, d, 23, 59, 59),
        label: refDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
      };
    case "WEEK": {
      const dow = refDate.getDay();
      const offsetToMonday = (dow + 6) % 7;
      const start = new Date(y, m, d - offsetToMonday);
      const end = new Date(y, m, d - offsetToMonday + 6, 23, 59, 59);
      return {
        start,
        end,
        label: `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
      };
    }
    case "MONTH":
      return {
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 0, 23, 59, 59),
        label: refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      };
    case "QUARTER": {
      const q = Math.floor(m / 3);
      return {
        start: new Date(y, q * 3, 1),
        end: new Date(y, q * 3 + 3, 0, 23, 59, 59),
        label: `${q + 1}º Trimestre ${y}`,
      };
    }
    case "SEMESTER": {
      const s = m < 6 ? 0 : 1;
      return {
        start: new Date(y, s * 6, 1),
        end: new Date(y, s * 6 + 6, 0, 23, 59, 59),
        label: `${s + 1}º Semestre ${y}`,
      };
    }
    case "YEAR":
      return {
        start: new Date(y, 0, 1),
        end: new Date(y, 11, 31, 23, 59, 59),
        label: String(y),
      };
    case "CUSTOM":
    default:
      return {
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 0, 23, 59, 59),
        label: refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      };
  }
}

export function getDaysInRange(range: { start: Date; end: Date }): number {
  const s = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function navigatePeriod(period: BalancoPeriod, refDate: Date, direction: number): Date {
  const d = new Date(refDate);
  switch (period) {
    case "DAY":
      d.setDate(d.getDate() + direction);
      break;
    case "WEEK": {
      const dow = d.getDay();
      const offsetToMonday = (dow + 6) % 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - offsetToMonday);
      monday.setDate(monday.getDate() + 7 * direction);
      d.setTime(monday.getTime());
      break;
    }
    case "MONTH":
      d.setMonth(d.getMonth() + direction);
      break;
    case "QUARTER":
      d.setMonth(d.getMonth() + 3 * direction);
      break;
    case "SEMESTER":
      d.setMonth(d.getMonth() + 6 * direction);
      break;
    case "YEAR":
      d.setFullYear(d.getFullYear() + direction);
      break;
    case "CUSTOM":
      break;
  }
  return d;
}

/** Dias comerciais para rateio RH/fixos (MONTH=30). CUSTOM usa dias corridos. */
export function costDaysForPeriod(period: BalancoPeriod, daysInPeriod: number): number {
  if (period === "CUSTOM") return daysInPeriod;
  const FIXED: Record<Exclude<BalancoPeriod, "CUSTOM">, number> = {
    DAY: 1,
    WEEK: 7,
    MONTH: 30,
    QUARTER: 90,
    SEMESTER: 180,
    YEAR: 365,
  };
  return Math.min(daysInPeriod, FIXED[period]);
}
