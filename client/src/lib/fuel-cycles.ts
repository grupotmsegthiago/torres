// Ciclo quinzenal de fechamento de combustível: dia 16 do mês anterior ao
// dia 15 do mês escolhido. Usado em todas as telas de combustível para
// alinhar com o fechamento dos cartões TicketLog/ValeCard.

export type FuelCycle = {
  /** Identificador estável do ciclo (YYYY-MM do mês de fechamento, ex: "2026-05"). */
  value: string;
  /** Data de início (YYYY-MM-DD), dia 16 do mês anterior. */
  startDate: string;
  /** Data de fim (YYYY-MM-DD), dia 15 do mês de fechamento. */
  endDate: string;
  /** Rótulo curto pra dropdown: "Ciclo 15/Mai/2026". */
  label: string;
  /** Rótulo longo pra título: "16/04/2026 → 15/05/2026". */
  rangeLabel: string;
};

const MES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function fmtBR(y: number, m: number, d: number) { return `${pad(d)}/${pad(m)}/${y}`; }

/** Constrói o ciclo a partir do mês/ano de fechamento (ex: 2026, 5 → 16/04 a 15/05). */
export function buildCycle(closingYear: number, closingMonth: number): FuelCycle {
  const startMonth = closingMonth === 1 ? 12 : closingMonth - 1;
  const startYear = closingMonth === 1 ? closingYear - 1 : closingYear;
  const startDate = fmt(startYear, startMonth, 16);
  const endDate = fmt(closingYear, closingMonth, 15);
  const label = `Ciclo 15/${MES_PT[closingMonth - 1]}/${closingYear}`;
  const rangeLabel = `${fmtBR(startYear, startMonth, 16)} → ${fmtBR(closingYear, closingMonth, 15)}`;
  return { value: `${closingYear}-${pad(closingMonth)}`, startDate, endDate, label, rangeLabel };
}

/** Retorna o ciclo que contém a data informada (BRT). */
export function getCycleForDate(date: Date): FuelCycle {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1-12
  const d = date.getDate();
  // Se dia >= 16, o ciclo fecha no mês seguinte; se dia <= 15, fecha no mês corrente.
  if (d >= 16) {
    const closingMonth = m === 12 ? 1 : m + 1;
    const closingYear = m === 12 ? y + 1 : y;
    return buildCycle(closingYear, closingMonth);
  }
  return buildCycle(y, m);
}

/** Ciclo atual (que contém o dia de hoje em BRT). */
export function getCurrentCycle(): FuelCycle {
  return getCycleForDate(new Date());
}

/** Resolve um ciclo a partir do `value` (YYYY-MM do mês de fechamento). */
export function getCycleByValue(value: string): FuelCycle | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  return buildCycle(Number(m[1]), Number(m[2]));
}

/**
 * Lista os ciclos distintos cobertos pelas datas (YYYY-MM-DD) informadas,
 * ordenado do mais recente para o mais antigo, e garante que o ciclo
 * corrente esteja sempre presente.
 */
export function listCyclesFromDates(dates: string[]): FuelCycle[] {
  const seen = new Map<string, FuelCycle>();
  const cur = getCurrentCycle();
  seen.set(cur.value, cur);
  for (const ds of dates) {
    if (!ds) continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds);
    if (!m) continue;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const c = getCycleForDate(dt);
    if (!seen.has(c.value)) seen.set(c.value, c);
  }
  return Array.from(seen.values()).sort((a, b) => b.value.localeCompare(a.value));
}
