/**
 * Helpers de período de folha/RH (ciclo de fechamento Torres).
 *
 * Regra de negócio (decidida pelo dono em 26/05/2026):
 *   A competência da folha de ponto fecha sempre entre o dia 26 do mês
 *   anterior e o dia 25 do mês corrente. Aplica-se SOMENTE a RH:
 *   folha de ponto, espelho, holerite, horas extras, Cesta Básica II,
 *   ranking de horas. Faturamento de cliente e Balanço Gerencial
 *   continuam em mês civil (1 ao último dia).
 *
 * Convenção:
 *   `getPayrollPeriod(year, month)` recebe o mês de FECHAMENTO. Ou seja,
 *   month=5/year=2026 → período de 26/abr/2026 a 25/mai/2026 (inclusive).
 *
 *   `start` é 00:00 BRT do dia 26 do mês anterior.
 *   `end`   é 00:00 BRT do dia 26 do mês informado (EXCLUSIVO) — ou seja,
 *           o último instante do dia 25 está dentro do período.
 *   `startDate` / `endDate` são strings YYYY-MM-DD INCLUSIVAS (26 → 25),
 *   compatíveis com filtros SQL `gte(...) lte(...)`.
 */

const MESES_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_PT_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface PayrollPeriod {
  /** Mês de fechamento (1-12). Ex: 5 = competência fechando em 25/mai. */
  month: number;
  /** Ano de fechamento. */
  year: number;
  /** 00:00 BRT do dia 26 do mês anterior (UTC -3 ⇒ guardamos em UTC). */
  start: Date;
  /** 00:00 BRT do dia 26 do mês corrente — EXCLUSIVO. */
  end: Date;
  /** "YYYY-MM-DD" do dia 26 do mês anterior (INCLUSIVO). */
  startDate: string;
  /** "YYYY-MM-DD" do dia 25 do mês corrente (INCLUSIVO). */
  endDate: string;
  /** Label legível: "26/abr → 25/mai/2026" */
  label: string;
  /** Label curto: "26/abr → 25/mai" */
  labelShort: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function getPayrollPeriod(year: number, month: number): PayrollPeriod {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`getPayrollPeriod: parâmetros inválidos (year=${year}, month=${month})`);
  }
  // start = 26 do mês anterior; end = 26 do mês informado (exclusivo).
  const start = new Date(Date.UTC(year, month - 2, 26));
  const end = new Date(Date.UTC(year, month - 1, 26));
  // endDate INCLUSIVO = dia 25 do mês corrente.
  const lastInclusive = new Date(Date.UTC(year, month - 1, 25));
  const startDate = ymdUtc(start);
  const endDate = ymdUtc(lastInclusive);

  const sMon = MESES_PT_SHORT[start.getUTCMonth()];
  const eMon = MESES_PT_SHORT[lastInclusive.getUTCMonth()];
  const labelShort = `26/${sMon} → 25/${eMon}`;
  const label = `${labelShort}/${year}`;
  return { month, year, start, end, startDate, endDate, label, labelShort };
}

/**
 * Retorna o período de folha que CONTÉM uma data BRT específica.
 * Ex: data 2026-05-10 → competência maio/2026 (26/abr → 25/mai).
 * Ex: data 2026-05-26 → competência junho/2026 (26/mai → 25/jun).
 */
export function getPayrollPeriodForDate(date: Date): PayrollPeriod {
  // Trabalhamos em BRT (UTC-3). Converte para "dia BRT".
  const brt = new Date(date.getTime() - 3 * 3600000);
  const day = brt.getUTCDate();
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth() + 1; // 1-12
  // Dia 1..25 → competência fecha no mês atual.
  // Dia 26..31 → competência fecha no próximo mês.
  if (day <= 25) return getPayrollPeriod(y, m);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return getPayrollPeriod(nextY, nextM);
}

/** Formata um label "Maio/2026 (26/abr → 25/mai)" — útil quando a UI ainda mostra nome do mês. */
export function formatPayrollPeriodWithMonthName(p: PayrollPeriod): string {
  return `${MESES_PT_LONG[p.month - 1]}/${p.year} (${p.labelShort})`;
}
