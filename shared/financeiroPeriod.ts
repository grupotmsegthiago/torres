export type ViewPeriod = "DAY" | "WEEK" | "MONTH" | "CUSTOM" | "ALL";

export interface PeriodFilterable {
  status: string;
  due_date: string;
}

/**
 * Data de hoje em BRT (America/Sao_Paulo) no formato YYYY-MM-DD.
 * Nunca usar toISOString() para limites de dia (gotcha de timezone).
 */
export function brtTodayStr(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Calcula o intervalo [start, end] (YYYY-MM-DD, BRT) para um período.
 * Retorna null quando não há recorte de data (ALL).
 */
export function periodRange(
  viewPeriod: ViewPeriod,
  customStartDate: string,
  customEndDate: string,
  today: string = brtTodayStr(),
): { start: string; end: string } | null {
  if (viewPeriod === "ALL") return null;
  if (viewPeriod === "DAY") return { start: today, end: today };
  if (viewPeriod === "CUSTOM") return { start: customStartDate, end: customEndDate };
  if (viewPeriod === "WEEK") {
    // Semana BR: segunda → domingo. Meio-dia evita salto de fuso ao calcular o dia da semana.
    const base = new Date(`${today}T12:00:00`);
    const offsetToMonday = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - offsetToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday.toLocaleDateString("en-CA"), end: sunday.toLocaleDateString("en-CA") };
  }
  // MONTH
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${today.slice(0, 7)}-01`,
    end: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Filtra lançamentos pelo período selecionado APENAS pela data de vencimento.
 * Decidido com o dono (jun/2026): o filtro de data deve funcionar normalmente —
 * mostra exatamente o que cai no período escolhido, independente do status. Não
 * há mais exceção de "pendente sempre visível"; um pendente vencido fora do
 * período só aparece quando o período abrange a data dele (ou em "Tudo"/ALL).
 */
export function filterTransactionsByPeriod<T extends PeriodFilterable>(
  list: T[],
  viewPeriod: ViewPeriod,
  customStartDate: string,
  customEndDate: string,
  today: string = brtTodayStr(),
): T[] {
  const range = periodRange(viewPeriod, customStartDate, customEndDate, today);
  if (!range) return [...list];
  return list.filter(t => {
    const d = t.due_date.split("T")[0];
    return d >= range.start && d <= range.end;
  });
}
