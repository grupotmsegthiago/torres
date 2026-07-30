/**
 * Cálculo canônico de horas trabalhadas a partir de batidas do Control iD.
 *
 * Delega ao motor `jornada-calc` (pares diários + cluster ≤2min + cap 19:59).
 * Mantém a API `computeWorkedHours` para Painel, relatórios e jobs.
 */

import {
  computePeriodJornada,
  NORMAL_DAILY_CAP_MIN,
  type JornadaPunchInput,
} from "./jornada-calc.js";

export interface PunchInput {
  punch_at: string | Date;
  id?: number | null;
  source?: string | null;
  is_manual?: boolean | null;
  external_id?: string | null;
  direction?: string | null;
}

export interface WorkedHoursResult {
  /** Total em minutos (soma dos dias, cada um já com cap 19:59). */
  totalMinutes: number;
  /** Total em horas (totalMinutes / 60). */
  totalHours: number;
  /** Minutos trabalhados por dia BRT (yyyy-mm-dd). */
  perDayMinutes: Map<string, number>;
  /** Quantos dias distintos têm jornada > 0. */
  daysWorked: number;
  /** True se há batida órfã (ímpar após clusterização) em algum dia. */
  hasOpenShift: boolean;
  /** Timestamp da órfã mais recente, ou null. */
  openShiftSince: Date | null;
  /** Pares (entrada, saida) — duração REAL do par (sem cap diário). */
  pairs: Array<{ entrada: Date; saida: Date }>;
  /**
   * Minutos descartados pelo cap diário 19:59 (soma workedMinRaw - workedMin).
   * Nome legado `cappedMinutes` preservado para compatibilidade.
   */
  cappedMinutes: number;
  /** Quantos dias tiveram teto 19:59 aplicado. */
  pairsTruncated: number;
}

/** @deprecated Prefer NORMAL_DAILY_CAP_MIN. Mantido p/ jobs de diária (>16h). */
export const MAX_PAIR_MINUTES = 16 * 60;

export { ymdBRT } from "./jornada-calc.js";
export { NORMAL_DAILY_CAP_MIN };

/** Cria a chave de minuto BRT para deduplicação (yyyy-mm-ddTHH:MM). */
export function minuteKeyBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16);
}

/**
 * Cálculo canônico — recebe todas as batidas de UM funcionário em qualquer
 * intervalo e devolve total + breakdown diário.
 */
export function computeWorkedHours(punches: PunchInput[]): WorkedHoursResult {
  const input: JornadaPunchInput[] = punches
    .filter((p) => p && p.punch_at != null)
    .map((p) => ({
      punch_at: p.punch_at,
      id: p.id ?? null,
      source: p.source ?? null,
      is_manual: p.is_manual ?? null,
      external_id: p.external_id ?? null,
      direction: p.direction ?? null,
    }));

  const r = computePeriodJornada(input);
  const perDayMinutes = new Map<string, number>();
  for (const d of r.days) {
    if (d.workedMin > 0) perDayMinutes.set(d.day, d.workedMin);
  }

  let cappedMinutes = 0;
  let pairsTruncated = 0;
  for (const d of r.days) {
    if (d.capped) {
      cappedMinutes += d.workedMinRaw - d.workedMin;
      pairsTruncated++;
    }
  }

  const lastOrphan = r.orphans.length
    ? r.orphans[r.orphans.length - 1].punch.at
    : null;

  return {
    totalMinutes: r.totalWorkedMin,
    totalHours: Math.round((r.totalWorkedMin / 60) * 100) / 100,
    perDayMinutes,
    daysWorked: perDayMinutes.size,
    hasOpenShift: r.orphans.length > 0,
    openShiftSince: lastOrphan,
    pairs: r.pairs.map((p) => ({ entrada: p.entrada.at, saida: p.saida.at })),
    cappedMinutes: Math.round(cappedMinutes),
    pairsTruncated,
  };
}

/**
 * Helper: separa total de horas em "normais" (até 220h/mês) e "extras"
 * (excedente). Usado por folha/custos fixos.
 * Limite mensal CLT padrão = 220h.
 */
export function splitNormalAndOvertime(
  totalHours: number,
  monthlyLimit = 220,
): { horasNormais: number; horasExtras: number } {
  const horasNormais = Math.min(monthlyLimit, totalHours);
  const horasExtras = Math.max(0, totalHours - monthlyLimit);
  return { horasNormais, horasExtras };
}
