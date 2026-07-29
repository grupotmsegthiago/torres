/**
 * Simulação somente leitura: regra atual (first_last) × regra nova (pares).
 * NÃO grava folha_historico_mensal, NÃO altera batidas, NÃO recalcula competências fechadas.
 */
import { supabaseAdmin } from "../supabase";
import { monthToFechamento } from "./control-id-parsers";
import {
  applyOfficialPunchDedup,
  computeJornadaFirstLast,
  computeJornadaPares,
  hhmmFromMinutes,
  type JornadaPunchInput,
} from "./jornada-pares";
import { getLockedPeriods, isDateLocked } from "./locked-periods";

export type SimDayDelta = {
  date: string;
  anteriorMin: number;
  novoMin: number;
  deltaMin: number;
  orphans: number;
  duplicates: number;
  cappedMin: number;
};

export type SimEmployeeMonth = {
  employeeId: number;
  employeeName: string;
  monthYear: string;
  totalAnteriorMin: number;
  totalNovoMin: number;
  deltaMin: number;
  heAnteriorMin: number;
  heNovoMin: number;
  heDeltaMin: number;
  heImpactBRL: number;
  orphanCount: number;
  duplicateCount: number;
  cappedDays: number;
  daysResponsible: SimDayDelta[];
  hasHistoricoSnapshot: boolean;
  hasLockedPeriod: boolean;
  competenciaFechada: boolean;
};

export type SimReport = {
  generatedAt: string;
  monthYear: string;
  horasMensaisDefault: number;
  heRateBRL: number;
  employees: SimEmployeeMonth[];
  totals: {
    employeesCompared: number;
    employeesWithDelta: number;
    sumDeltaMin: number;
    sumHeImpactBRL: number;
  };
  accessNote?: string;
};

function ymdBRT(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

async function monthHasHistorico(employeeId: number, monthYear: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("folha_historico_mensal")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("month_year", monthYear)
      .limit(1);
    if (error) return false;
    return !!(data && data.length);
  } catch {
    return false;
  }
}

async function monthTouchesLock(monthYear: string): Promise<boolean> {
  try {
    const { start, end } = monthToFechamento(monthYear);
    const periods = await getLockedPeriods(null);
    // Qualquer dia do ciclo dentro de um lock
    for (let t = start.getTime(); t < end.getTime(); t += 24 * 3600_000) {
      if (isDateLocked(new Date(t).toISOString(), periods)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function simulateEmployeeMonth(opts: {
  employeeId: number;
  employeeName?: string;
  monthYear: string;
  horasMensais?: number;
  heRateBRL?: number;
}): Promise<SimEmployeeMonth> {
  const horasMensais = opts.horasMensais ?? 220;
  const heRateBRL = opts.heRateBRL ?? 16;
  const { start, end } = monthToFechamento(opts.monthYear);

  const { data: punchesRaw, error } = await supabaseAdmin
    .from("control_id_punches")
    .select("id, punch_at, direction, source, external_id")
    .eq("employee_id", opts.employeeId)
    .gte("punch_at", start.toISOString())
    .lt("punch_at", end.toISOString())
    .order("punch_at", { ascending: true });

  if (error) throw new Error(error.message);

  const punches = applyOfficialPunchDedup((punchesRaw || []) as any[]);
  const dayMap = new Map<string, JornadaPunchInput[]>();
  for (const p of punches) {
    const day = ymdBRT(p.punch_at);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push({
      punchAt: p.punch_at,
      id: p.id,
      externalId: p.external_id,
      source: p.source,
      direction: p.direction,
    });
  }

  let totalAnteriorMin = 0;
  let totalNovoMin = 0;
  let orphanCount = 0;
  let duplicateCount = 0;
  let cappedDays = 0;
  const daysResponsible: SimDayDelta[] = [];

  for (const [date, dayPunches] of Array.from(dayMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const a = computeJornadaFirstLast(dayPunches);
    const b = computeJornadaPares(dayPunches);
    totalAnteriorMin += a.workedMinutes;
    totalNovoMin += b.workedMinutes;
    orphanCount += b.orphanPunches.length;
    duplicateCount += b.duplicateEvents.length;
    if (b.cappedMinutes > 0) cappedDays++;
    const deltaMin = b.workedMinutes - a.workedMinutes;
    if (deltaMin !== 0 || b.orphanPunches.length > 0 || b.duplicateEvents.length > 0) {
      daysResponsible.push({
        date,
        anteriorMin: a.workedMinutes,
        novoMin: b.workedMinutes,
        deltaMin,
        orphans: b.orphanPunches.length,
        duplicates: b.duplicateEvents.length,
        cappedMin: b.cappedMinutes,
      });
    }
  }

  const heAnteriorMin = Math.max(0, totalAnteriorMin - horasMensais * 60);
  const heNovoMin = Math.max(0, totalNovoMin - horasMensais * 60);
  const heDeltaMin = heNovoMin - heAnteriorMin;
  const hasHistoricoSnapshot = await monthHasHistorico(opts.employeeId, opts.monthYear);
  const hasLockedPeriod = await monthTouchesLock(opts.monthYear);

  return {
    employeeId: opts.employeeId,
    employeeName: opts.employeeName || String(opts.employeeId),
    monthYear: opts.monthYear,
    totalAnteriorMin,
    totalNovoMin,
    deltaMin: totalNovoMin - totalAnteriorMin,
    heAnteriorMin,
    heNovoMin,
    heDeltaMin,
    heImpactBRL: Math.round((heDeltaMin / 60) * heRateBRL * 100) / 100,
    orphanCount,
    duplicateCount,
    cappedDays,
    daysResponsible,
    hasHistoricoSnapshot,
    hasLockedPeriod,
    competenciaFechada: hasHistoricoSnapshot || hasLockedPeriod,
  };
}

export async function simulateAllEmployeesMonth(opts: {
  monthYear: string;
  horasMensais?: number;
  heRateBRL?: number;
  employeeIds?: number[];
}): Promise<SimReport> {
  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, status")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  let list = (employees || []) as Array<{ id: number; name: string; status: string }>;
  if (opts.employeeIds?.length) {
    const set = new Set(opts.employeeIds);
    list = list.filter((e) => set.has(e.id));
  }

  const results: SimEmployeeMonth[] = [];
  for (const emp of list) {
    try {
      const row = await simulateEmployeeMonth({
        employeeId: emp.id,
        employeeName: emp.name,
        monthYear: opts.monthYear,
        horasMensais: opts.horasMensais,
        heRateBRL: opts.heRateBRL,
      });
      if (row.totalAnteriorMin === 0 && row.totalNovoMin === 0 && row.orphanCount === 0) {
        continue; // sem batidas no mês
      }
      results.push(row);
    } catch (e: any) {
      console.warn(`[simular-folha-pares] emp ${emp.id}:`, e?.message || e);
    }
  }

  const withDelta = results.filter((r) => r.deltaMin !== 0);
  return {
    generatedAt: new Date().toISOString(),
    monthYear: opts.monthYear,
    horasMensaisDefault: opts.horasMensais ?? 220,
    heRateBRL: opts.heRateBRL ?? 16,
    employees: results,
    totals: {
      employeesCompared: results.length,
      employeesWithDelta: withDelta.length,
      sumDeltaMin: results.reduce((s, r) => s + r.deltaMin, 0),
      sumHeImpactBRL: Math.round(results.reduce((s, r) => s + r.heImpactBRL, 0) * 100) / 100,
    },
  };
}

export function formatSimReportText(report: SimReport): string {
  const lines: string[] = [];
  lines.push(`# Simulação Folha first_last × pares — ${report.monthYear}`);
  lines.push(`Gerado: ${report.generatedAt}`);
  lines.push(`Funcionários com batidas: ${report.totals.employeesCompared}`);
  lines.push(`Com diferença: ${report.totals.employeesWithDelta}`);
  lines.push(`Σ Δ minutos: ${report.totals.sumDeltaMin} (${hhmmFromMinutes(Math.abs(report.totals.sumDeltaMin))})`);
  lines.push(`Σ impacto HE estimado @ R$${report.heRateBRL}: R$ ${report.totals.sumHeImpactBRL}`);
  if (report.accessNote) lines.push(`Nota: ${report.accessNote}`);
  lines.push("");
  for (const e of report.employees.filter((x) => x.deltaMin !== 0 || x.orphanCount > 0)) {
    lines.push(
      `## ${e.employeeName} (#${e.employeeId})  fechada=${e.competenciaFechada} historico=${e.hasHistoricoSnapshot} lock=${e.hasLockedPeriod}`,
    );
    lines.push(
      `  anterior=${hhmmFromMinutes(e.totalAnteriorMin)} novo=${hhmmFromMinutes(e.totalNovoMin)} Δ=${e.deltaMin} min | HE ${hhmmFromMinutes(e.heAnteriorMin)}→${hhmmFromMinutes(e.heNovoMin)} impacto R$ ${e.heImpactBRL}`,
    );
    lines.push(`  órfãs=${e.orphanCount} duplicatas=${e.duplicateCount} dias_com_teto=${e.cappedDays}`);
    for (const d of e.daysResponsible) {
      lines.push(
        `  - ${d.date}: ${hhmmFromMinutes(d.anteriorMin)} → ${hhmmFromMinutes(d.novoMin)} (Δ ${d.deltaMin}) órfãs=${d.orphans} dup=${d.duplicates} teto=${d.cappedMin}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
