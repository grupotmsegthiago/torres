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

export type TriState = boolean | "unknown";

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
  horasMensais: number;
  horasMensaisSource: string;
  totalAnteriorMin: number;
  totalNovoMin: number;
  deltaMin: number;
  heAnteriorMin: number;
  heNovoMin: number;
  heDeltaMin: number;
  /** Impacto financeiro estimado; null se taxa indisponível. */
  heImpactBRL: number | null;
  heRateBRL: number | null;
  heRateSource: string;
  heImpactNote: string;
  orphanCount: number;
  duplicateCount: number;
  cappedDays: number;
  daysResponsible: SimDayDelta[];
  hasHistoricoSnapshot: TriState;
  hasLockedPeriod: TriState;
  /**
   * true/false só quando historico e lock foram lidos com sucesso.
   * null = desconhecido (consulta falhou) — NUNCA tratar como aberta.
   */
  competenciaFechada: boolean | null;
  simulacaoIncompleta: boolean;
  incompletaReasons: string[];
};

export type SimFailedEmployee = {
  employeeId: number;
  employeeName: string;
  error: string;
};

export type SimIgnoredEmployee = {
  employeeId: number;
  employeeName: string;
  reason: string;
};

export type SimReport = {
  generatedAt: string;
  monthYear: string;
  employees: SimEmployeeMonth[];
  failedEmployees: SimFailedEmployee[];
  ignoredEmployees: SimIgnoredEmployee[];
  totals: {
    /** Total de funcionários na lista solicitada (antes de comparar). */
    employeesRequested: number;
    /** Comparados com sucesso (tiveram batidas / resultado). */
    employeesCompared: number;
    /** Falharam com exceção (não somam em compared). */
    employeesFailed: number;
    /** Ignorados com motivo documentado (ex.: sem batidas). */
    employeesIgnored: number;
    employeesWithDelta: number;
    sumDeltaMin: number;
    sumHeImpactBRL: number | null;
    /** Falhas + linhas com simulacaoIncompleta. */
    incompleteCount: number;
  };
  simulacaoIncompleta: boolean;
  /** true só quando não há falhas e nenhum item incompleto. */
  conclusaoIntegral: boolean;
  accessNote?: string;
};

function ymdBRT(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

async function loadHorasMensais(employeeId: number, monthYear: string): Promise<{
  horasMensais: number;
  source: string;
}> {
  const [yyyy, mm] = monthYear.split("-").map(Number);
  const monthEndStr = new Date(Date.UTC(yyyy, mm, 0)).toISOString().slice(0, 10);
  const { data: salaryRows, error } = await supabaseAdmin
    .from("employee_salaries")
    .select("horas_mensais, effective_date")
    .eq("employee_id", employeeId)
    .lte("effective_date", monthEndStr)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`employee_salaries: ${error.message}`);
  }
  const hm = salaryRows && salaryRows[0] && (salaryRows[0] as any).horas_mensais != null
    ? Number((salaryRows[0] as any).horas_mensais)
    : NaN;
  if (Number.isFinite(hm) && hm > 0) {
    return { horasMensais: hm, source: "employee_salaries.horas_mensais" };
  }
  return { horasMensais: 220, source: "fallback_220_igual_folha" };
}

async function loadHeRateBRL(employeeId: number): Promise<{
  rate: number | null;
  source: string;
  note: string;
}> {
  try {
    const { data: emp, error } = await supabaseAdmin
      .from("employees")
      .select("role")
      .eq("id", employeeId)
      .limit(1);
    if (error) {
      return {
        rate: null,
        source: "erro",
        note: `estimativa indisponível (employees.role: ${error.message})`,
      };
    }
    const role = (emp && emp[0] && (emp[0] as any).role) || "";
    const { getCctConfigByCargo } = await import("./cct-config");
    const cct = await getCctConfigByCargo(role);
    const rate = Number(cct.horaExtraValor);
    if (!Number.isFinite(rate) || rate <= 0) {
      return {
        rate: null,
        source: "cct_sem_taxa",
        note: "estimativa indisponível (CCT sem horaExtraValor)",
      };
    }
    return {
      rate,
      source: `cct:${(cct as any).label || role || "cargo"}`,
      note: `estimativa com taxa configurada R$ ${rate} (CCT do cargo; não é liquidação oficial)`,
    };
  } catch (e: any) {
    return {
      rate: null,
      source: "erro",
      note: `estimativa indisponível (${e?.message || e})`,
    };
  }
}

async function monthHasHistorico(
  employeeId: number,
  monthYear: string,
): Promise<{ value: TriState; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("folha_historico_mensal")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("month_year", monthYear)
      .limit(1);
    if (error) return { value: "unknown", error: error.message };
    return { value: !!(data && data.length) };
  } catch (e: any) {
    return { value: "unknown", error: e?.message || String(e) };
  }
}

async function monthTouchesLock(
  monthYear: string,
): Promise<{ value: TriState; error?: string }> {
  try {
    const { start, end } = monthToFechamento(monthYear);
    const periods = await getLockedPeriods(null);
    for (let t = start.getTime(); t < end.getTime(); t += 24 * 3600_000) {
      if (isDateLocked(new Date(t).toISOString(), periods)) return { value: true };
    }
    return { value: false };
  } catch (e: any) {
    return { value: "unknown", error: e?.message || String(e) };
  }
}

export async function simulateEmployeeMonth(opts: {
  employeeId: number;
  employeeName?: string;
  monthYear: string;
  /** Só override explícito de teste; senão consulta employee_salaries como a Folha. */
  horasMensais?: number;
  heRateBRL?: number;
}): Promise<SimEmployeeMonth> {
  const incompletaReasons: string[] = [];
  const { start, end } = monthToFechamento(opts.monthYear);

  let horasMensais: number;
  let horasMensaisSource: string;
  if (opts.horasMensais != null && opts.horasMensais > 0) {
    horasMensais = opts.horasMensais;
    horasMensaisSource = "override_explicito";
  } else {
    try {
      const hm = await loadHorasMensais(opts.employeeId, opts.monthYear);
      horasMensais = hm.horasMensais;
      horasMensaisSource = hm.source;
    } catch (e: any) {
      horasMensais = 220;
      horasMensaisSource = "fallback_220_apos_erro";
      incompletaReasons.push(`horas_mensais: ${e?.message || e}`);
    }
  }

  let heRateBRL: number | null;
  let heRateSource: string;
  let heImpactNote: string;
  if (opts.heRateBRL != null && opts.heRateBRL > 0) {
    heRateBRL = opts.heRateBRL;
    heRateSource = "override_explicito";
    heImpactNote = `estimativa com taxa configurada R$ ${heRateBRL} (override)`;
  } else {
    const r = await loadHeRateBRL(opts.employeeId);
    heRateBRL = r.rate;
    heRateSource = r.source;
    heImpactNote = r.note;
    if (r.rate == null) incompletaReasons.push(r.note);
  }

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
  const heImpactBRL =
    heRateBRL != null
      ? Math.round((heDeltaMin / 60) * heRateBRL * 100) / 100
      : null;

  const hist = await monthHasHistorico(opts.employeeId, opts.monthYear);
  const lock = await monthTouchesLock(opts.monthYear);
  if (hist.value === "unknown") {
    incompletaReasons.push(`folha_historico_mensal: ${hist.error || "erro"}`);
  }
  if (lock.value === "unknown") {
    incompletaReasons.push(`control_id_locked_periods: ${lock.error || "erro"}`);
  }

  let competenciaFechada: boolean | null;
  if (hist.value === "unknown" || lock.value === "unknown") {
    competenciaFechada = null;
  } else {
    competenciaFechada = hist.value === true || lock.value === true;
  }

  return {
    employeeId: opts.employeeId,
    employeeName: opts.employeeName || String(opts.employeeId),
    monthYear: opts.monthYear,
    horasMensais,
    horasMensaisSource,
    totalAnteriorMin,
    totalNovoMin,
    deltaMin: totalNovoMin - totalAnteriorMin,
    heAnteriorMin,
    heNovoMin,
    heDeltaMin,
    heImpactBRL,
    heRateBRL,
    heRateSource,
    heImpactNote,
    orphanCount,
    duplicateCount,
    cappedDays,
    daysResponsible,
    hasHistoricoSnapshot: hist.value,
    hasLockedPeriod: lock.value,
    competenciaFechada,
    simulacaoIncompleta: incompletaReasons.length > 0,
    incompletaReasons,
  };
}

export type SimulateEmployeeRunner = (opts: {
  employeeId: number;
  employeeName?: string;
  monthYear: string;
  horasMensais?: number;
  heRateBRL?: number;
}) => Promise<SimEmployeeMonth>;

/**
 * Agrega resultados da simulação (puro — testável sem banco).
 * Identidade: requested = compared + failed + ignored.
 */
export function aggregateSimEmployees(opts: {
  monthYear: string;
  requested: Array<{ id: number; name: string }>;
  compared: SimEmployeeMonth[];
  failed: SimFailedEmployee[];
  ignored: SimIgnoredEmployee[];
  accessNote?: string;
}): SimReport {
  const employeesRequested = opts.requested.length;
  const employeesCompared = opts.compared.length;
  const employeesFailed = opts.failed.length;
  const employeesIgnored = opts.ignored.length;
  if (employeesRequested !== employeesCompared + employeesFailed + employeesIgnored) {
    throw new Error(
      `invariante simulação quebrada: requested(${employeesRequested}) != compared(${employeesCompared})+failed(${employeesFailed})+ignored(${employeesIgnored})`,
    );
  }
  const withDelta = opts.compared.filter((r) => r.deltaMin !== 0);
  const impacts = opts.compared.map((r) => r.heImpactBRL);
  const anyNullImpact = impacts.some((v) => v == null) || employeesFailed > 0;
  const sumHeImpactBRL = anyNullImpact
    ? null
    : Math.round(impacts.reduce((s: number, v) => s + (v as number), 0) * 100) / 100;
  const incompleteFromRows = opts.compared.filter((r) => r.simulacaoIncompleta).length;
  const incompleteCount = incompleteFromRows + employeesFailed;
  const simulacaoIncompleta = incompleteCount > 0;
  return {
    generatedAt: new Date().toISOString(),
    monthYear: opts.monthYear,
    employees: opts.compared,
    failedEmployees: opts.failed,
    ignoredEmployees: opts.ignored,
    totals: {
      employeesRequested,
      employeesCompared,
      employeesFailed,
      employeesIgnored,
      employeesWithDelta: withDelta.length,
      sumDeltaMin: opts.compared.reduce((s, r) => s + r.deltaMin, 0),
      sumHeImpactBRL,
      incompleteCount,
    },
    simulacaoIncompleta,
    conclusaoIntegral: !simulacaoIncompleta,
    accessNote: opts.accessNote,
  };
}

/** Loop de comparação por funcionário (testável sem listar employees no banco). */
export async function runSimEmployeeList(opts: {
  monthYear: string;
  list: Array<{ id: number; name: string }>;
  runEmployee: SimulateEmployeeRunner;
  horasMensais?: number;
  heRateBRL?: number;
}): Promise<SimReport> {
  const compared: SimEmployeeMonth[] = [];
  const failed: SimFailedEmployee[] = [];
  const ignored: SimIgnoredEmployee[] = [];

  for (const emp of opts.list) {
    try {
      const row = await opts.runEmployee({
        employeeId: emp.id,
        employeeName: emp.name,
        monthYear: opts.monthYear,
        horasMensais: opts.horasMensais,
        heRateBRL: opts.heRateBRL,
      });
      if (row.totalAnteriorMin === 0 && row.totalNovoMin === 0 && row.orphanCount === 0) {
        ignored.push({
          employeeId: emp.id,
          employeeName: emp.name,
          reason: "sem_batidas_no_periodo",
        });
        continue;
      }
      compared.push(row);
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn(`[simular-folha-pares] emp ${emp.id}:`, msg);
      failed.push({
        employeeId: emp.id,
        employeeName: emp.name,
        error: msg,
      });
    }
  }

  return aggregateSimEmployees({
    monthYear: opts.monthYear,
    requested: opts.list.map((e) => ({ id: e.id, name: e.name })),
    compared,
    failed,
    ignored,
  });
}

export async function simulateAllEmployeesMonth(opts: {
  monthYear: string;
  horasMensais?: number;
  heRateBRL?: number;
  employeeIds?: number[];
  /** Injeta runner (testes) — default: simulateEmployeeMonth. */
  runEmployee?: SimulateEmployeeRunner;
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

  return runSimEmployeeList({
    monthYear: opts.monthYear,
    list: list.map((e) => ({ id: e.id, name: e.name })),
    runEmployee: opts.runEmployee || simulateEmployeeMonth,
    horasMensais: opts.horasMensais,
    heRateBRL: opts.heRateBRL,
  });
}

export function formatSimReportText(report: SimReport): string {
  const lines: string[] = [];
  lines.push(`# Simulação Folha first_last × pares — ${report.monthYear}`);
  lines.push(`Gerado: ${report.generatedAt}`);
  lines.push(
    `Solicitados=${report.totals.employeesRequested} | comparados=${report.totals.employeesCompared} | falhas=${report.totals.employeesFailed} | ignorados=${report.totals.employeesIgnored}`,
  );
  lines.push(
    `Identidade: ${report.totals.employeesRequested} = ${report.totals.employeesCompared}+${report.totals.employeesFailed}+${report.totals.employeesIgnored}`,
  );
  lines.push(`Com diferença: ${report.totals.employeesWithDelta}`);
  lines.push(`Σ Δ minutos: ${report.totals.sumDeltaMin} (${hhmmFromMinutes(Math.abs(report.totals.sumDeltaMin))})`);
  lines.push(
    `Σ impacto HE: ${
      report.totals.sumHeImpactBRL == null
        ? "incompleto (taxa, falha ou consulta)"
        : `R$ ${report.totals.sumHeImpactBRL} (estimativa com taxa configurada)`
    }`,
  );
  lines.push(
    `Simulação incompleta: ${report.simulacaoIncompleta} (incompleteCount=${report.totals.incompleteCount}) | conclusão integral: ${report.conclusaoIntegral}`,
  );
  if (!report.conclusaoIntegral) {
    lines.push("ATENÇÃO: relatório NÃO declara conclusão integral — há falhas ou itens incompletos.");
  }
  if (report.accessNote) lines.push(`Nota: ${report.accessNote}`);
  if (report.failedEmployees?.length) {
    lines.push("");
    lines.push("## Falhas (não comparados)");
    for (const f of report.failedEmployees) {
      lines.push(`- #${f.employeeId} ${f.employeeName}: ${f.error}`);
    }
  }
  if (report.ignoredEmployees?.length) {
    lines.push("");
    lines.push("## Ignorados (motivo documentado)");
    for (const ig of report.ignoredEmployees) {
      lines.push(`- #${ig.employeeId} ${ig.employeeName}: ${ig.reason}`);
    }
  }
  lines.push("");
  for (const e of report.employees.filter((x) => x.deltaMin !== 0 || x.orphanCount > 0 || x.simulacaoIncompleta)) {
    const fechadaLabel =
      e.competenciaFechada === null ? "DESCONHECIDA" : String(e.competenciaFechada);
    lines.push(
      `## ${e.employeeName} (#${e.employeeId})  fechada=${fechadaLabel} historico=${e.hasHistoricoSnapshot} lock=${e.hasLockedPeriod}`,
    );
    lines.push(
      `  horas_mensais=${e.horasMensais} (${e.horasMensaisSource}) | taxa_HE=${e.heRateBRL ?? "n/d"} (${e.heRateSource})`,
    );
    lines.push(
      `  anterior=${hhmmFromMinutes(e.totalAnteriorMin)} novo=${hhmmFromMinutes(e.totalNovoMin)} Δ=${e.deltaMin} min | HE ${hhmmFromMinutes(e.heAnteriorMin)}→${hhmmFromMinutes(e.heNovoMin)} impacto ${e.heImpactBRL == null ? "n/d" : `R$ ${e.heImpactBRL}`}`,
    );
    lines.push(`  ${e.heImpactNote}`);
    if (e.simulacaoIncompleta) {
      lines.push(`  INCOMPLETA: ${e.incompletaReasons.join("; ")}`);
    }
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
