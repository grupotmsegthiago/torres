/**
 * Cálculo de horas trabalhadas a partir de batidas do Control iD.
 *
 * Com CONTROL_ID_CANONICAL_PAIRING=true → motor canônico (jornada-calc).
 * Com flag false (default no deploy controlado) → legado global pairs + teto 16h/par
 *   (compatível com o comportamento pré-correção do Painel/relatórios).
 *
 * Folha (buildFolhaPonto) usa first_last legado quando a flag está off.
 */

import {
  computePeriodJornada,
  NORMAL_DAILY_CAP_MIN,
  ymdBRT,
  type JornadaPunchInput,
} from "./jornada-calc.js";
import { isCanonicalPairingEnabled } from "./control-id-flags.js";

export interface PunchInput {
  punch_at: string | Date;
  id?: number | null;
  source?: string | null;
  is_manual?: boolean | null;
  external_id?: string | null;
  direction?: string | null;
}

export interface WorkedHoursResult {
  totalMinutes: number;
  totalHours: number;
  perDayMinutes: Map<string, number>;
  daysWorked: number;
  hasOpenShift: boolean;
  openShiftSince: Date | null;
  pairs: Array<{ entrada: Date; saida: Date }>;
  cappedMinutes: number;
  pairsTruncated: number;
}

/** Teto por par no motor legado (diárias / painel pré-flag). */
export const MAX_PAIR_MINUTES = 16 * 60;

export { ymdBRT, NORMAL_DAILY_CAP_MIN };

export function minuteKeyBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16);
}

/** Motor legado: pares globais + clamp 16h (pré-correção). */
function computeWorkedHoursLegacy(punches: PunchInput[]): WorkedHoursResult {
  const sorted = punches
    .filter((p) => p && p.punch_at != null)
    .map((p) => (typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at))
    .sort((a, b) => a.getTime() - b.getTime());

  const seen = new Set<string>();
  const clean: Date[] = [];
  for (const d of sorted) {
    const key = minuteKeyBRT(d);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(d);
  }

  const perDayMinutes = new Map<string, number>();
  const pairs: Array<{ entrada: Date; saida: Date }> = [];
  let totalMinutes = 0;
  let cappedMinutes = 0;
  let pairsTruncated = 0;

  let i = 0;
  for (; i + 1 < clean.length; i += 2) {
    const entrada = clean[i];
    const saida = clean[i + 1];
    const diffMin = (saida.getTime() - entrada.getTime()) / 60000;
    if (diffMin <= 0) continue;
    pairs.push({ entrada, saida });
    let countedMin = diffMin;
    if (diffMin > MAX_PAIR_MINUTES) {
      cappedMinutes += diffMin - MAX_PAIR_MINUTES;
      countedMin = MAX_PAIR_MINUTES;
      pairsTruncated++;
    }
    const dayKey = ymdBRT(entrada);
    perDayMinutes.set(dayKey, (perDayMinutes.get(dayKey) || 0) + countedMin);
    totalMinutes += countedMin;
  }

  const hasOpenShift = i < clean.length;
  const openShiftSince = hasOpenShift ? clean[clean.length - 1] : null;
  let daysWorked = 0;
  for (const min of Array.from(perDayMinutes.values())) {
    if (min > 0) daysWorked++;
  }

  return {
    totalMinutes: Math.round(totalMinutes),
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    perDayMinutes,
    daysWorked,
    hasOpenShift,
    openShiftSince,
    pairs,
    cappedMinutes: Math.round(cappedMinutes),
    pairsTruncated,
  };
}

function computeWorkedHoursCanonical(punches: PunchInput[]): WorkedHoursResult {
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

export function computeWorkedHours(punches: PunchInput[]): WorkedHoursResult {
  if (isCanonicalPairingEnabled()) return computeWorkedHoursCanonical(punches);
  return computeWorkedHoursLegacy(punches);
}

export function splitNormalAndOvertime(
  totalHours: number,
  monthlyLimit = 220,
): { horasNormais: number; horasExtras: number } {
  const horasNormais = Math.min(monthlyLimit, totalHours);
  const horasExtras = Math.max(0, totalHours - monthlyLimit);
  return { horasNormais, horasExtras };
}
