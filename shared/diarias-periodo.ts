/** Intervalos do controle de diárias do ponto (mês civil selecionado na tela). */

export const DIARIAS_RANGE_MAX_DAYS = 62;

export type DiariasPreset = "q1" | "q2" | "mes";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calendarDiariasRange(year: number, month: number, preset: DiariasPreset): { from: string; to: string } {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Mês inválido");
  }
  const last = lastDayOfMonth(year, month);
  const ym = `${year}-${pad2(month)}`;
  if (preset === "q1") return { from: `${ym}-01`, to: `${ym}-15` };
  if (preset === "q2") return { from: `${ym}-16`, to: `${ym}-${pad2(last)}` };
  return { from: `${ym}-01`, to: `${ym}-${pad2(last)}` };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dias inclusivos. Para no teto para não montar um intervalo enorme. */
export function daysInclusive(from: string, to: string): string[] {
  if (!ISO.test(from) || !ISO.test(to) || from > to) return [];
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor.getTime() <= end.getTime() && days.length <= DIARIAS_RANGE_MAX_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function rangeFitsDiarias(from: string, to: string): boolean {
  const days = daysInclusive(from, to);
  return days.length > 0 && days.length <= DIARIAS_RANGE_MAX_DAYS && days[days.length - 1] === to;
}

export function formatPeriodoBR(from: string, to: string): string {
  const br = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  return `Período: ${br(from)} a ${br(to)}`;
}

export const DIARIA_PONTO_UNIT = 43;

export type DiariaLancamento = {
  employeeId: number;
  date: string;
  amount?: number | null;
  description?: string | null;
};

/**
 * Uma diária de R$ 43 por agente e por dia.
 * Linha [AUTO-Q] repete as jornadas já marcadas no ponto e não entra de novo.
 * Duas linhas no mesmo dia contam uma vez.
 */
export function acumularDiariaPonto(
  rows: DiariaLancamento[],
  unit = DIARIA_PONTO_UNIT,
): Map<number, { dates: string[]; total: number }> {
  const byEmp = new Map<number, { dates: Set<string>; total: number }>();
  for (const row of rows) {
    const desc = String(row.description || "");
    if (desc.startsWith("[AUTO-Q]")) continue;
    const id = Number(row.employeeId);
    const date = String(row.date || "").slice(0, 10);
    if (!Number.isInteger(id) || id <= 0 || !ISO.test(date)) continue;
    const slot = byEmp.get(id) || { dates: new Set<string>(), total: 0 };
    if (slot.dates.has(date)) continue;
    slot.dates.add(date);
    const amount = Number(row.amount);
    const credit = desc.startsWith("[PONTO]") || !Number.isFinite(amount) || amount === unit
      ? unit
      : Math.round(amount * 100) / 100;
    slot.total = Math.round((slot.total + credit) * 100) / 100;
    byEmp.set(id, slot);
  }
  const out = new Map<number, { dates: string[]; total: number }>();
  for (const [id, slot] of byEmp) {
    out.set(id, { dates: [...slot.dates].sort(), total: slot.total });
  }
  return out;
}
