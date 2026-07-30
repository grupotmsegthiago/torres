/**
 * Motor canônico de jornada (Control iD / Folha Torres).
 *
 * Pipeline:
 *   batidas brutas
 *   → normalização America/Sao_Paulo
 *   → truncamento de segundos (nunca arredonda)
 *   → deduplicação exata do mesmo minuto
 *   → clusterização de proximidade (≤ 2 minutos)
 *   → pareamento diário (1→2, 3→4…)
 *   → sinalização de órfãs
 *   → cap diário 19:59 (1199 min)
 *   → soma mensal / HE sobre base contratual (padrão 220:00)
 *
 * Não usa first→last. Não inventa direção. Não apaga dados brutos.
 */

export const NORMAL_DAILY_CAP_MIN = 1199; // 19:59
export const CLUSTER_GAP_MIN = 2;
export const DEFAULT_MONTHLY_BASE_MIN = 220 * 60;

export interface JornadaPunchInput {
  id?: number | null;
  punch_at: string | Date;
  source?: string | null;
  is_manual?: boolean | null;
  external_id?: string | null;
  direction?: string | null;
}

export interface NormalizedPunch {
  id: number | null;
  /** Instant truncado ao minuto BRT (segundos=0). */
  at: Date;
  day: string; // yyyy-mm-dd BRT
  hhmm: string;
  source: string | null;
  is_manual: boolean;
  external_id: string | null;
  direction: string | null;
  /** IDs originais colapsados por dedup de minuto (inclui o próprio). */
  dedupIds: number[];
}

export interface PunchCluster {
  day: string;
  punches: NormalizedPunch[];
  /** Representante após regra de papel (entrada=primeira, saída=última). */
  representative: NormalizedPunch;
  role: "entrada" | "saida" | "orphan_cluster";
  /** true se size≥3 (ex.: 00:00/00:01/00:02). */
  ambiguous: boolean;
  /** true se size≥2 (qualquer agrupamento de proximidade). */
  clustered: boolean;
  gapMaxMin: number;
}

export interface JornadaPair {
  day: string;
  entrada: NormalizedPunch;
  saida: NormalizedPunch;
  durationMin: number;
  entradaClusterIds: number[];
  saidaClusterIds: number[];
}

export interface DayJornadaResult {
  day: string;
  rawCount: number;
  normalized: NormalizedPunch[];
  clusters: PunchCluster[];
  pairs: JornadaPair[];
  orphans: NormalizedPunch[];
  workedMinRaw: number;
  workedMin: number; // após cap 19:59
  capped: boolean;
  issues: string[];
}

export interface PeriodJornadaResult {
  days: DayJornadaResult[];
  totalWorkedMin: number;
  totalWorkedHHMM: string;
  heMin: number;
  heHHMM: string;
  baseMin: number;
  clusters: PunchCluster[];
  ambiguousClusters: PunchCluster[];
  safeClusters: PunchCluster[];
  orphans: Array<{ day: string; punch: NormalizedPunch }>;
  pairs: JornadaPair[];
}

export function ymdBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

export function fmtHHMMBRT(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function minutesToHHMM(min: number): string {
  const t = Math.max(0, Math.floor(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Trunca ao minuto BRT (descarta segundos; nunca arredonda). */
export function truncateToMinuteBRT(iso: string | Date): Date {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const day = ymdBRT(d);
  const hhmm = fmtHHMMBRT(d);
  return new Date(`${day}T${hhmm}:00-03:00`);
}

function parsePunch(p: JornadaPunchInput): NormalizedPunch {
  const at = truncateToMinuteBRT(p.punch_at);
  const id = p.id == null ? null : Number(p.id);
  return {
    id,
    at,
    day: ymdBRT(at),
    hhmm: fmtHHMMBRT(at),
    source: p.source ?? null,
    is_manual: !!p.is_manual || p.source === "admin_manual" || p.source === "self_manual",
    external_id: p.external_id ?? null,
    direction: p.direction ?? null,
    dedupIds: id != null ? [id] : [],
  };
}

/** Dedup exata por minuto BRT — mantém a primeira ocorrência. */
export function dedupExactMinute(punches: NormalizedPunch[]): NormalizedPunch[] {
  const seen = new Map<string, NormalizedPunch>();
  const order: string[] = [];
  for (const p of punches) {
    const key = `${p.day}T${p.hhmm}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, { ...p, dedupIds: [...p.dedupIds] });
      order.push(key);
    } else if (p.id != null) {
      prev.dedupIds.push(p.id);
    }
  }
  return order.map((k) => seen.get(k)!);
}

/**
 * Agrupa batidas consecutivas do mesmo dia com intervalo ≤ CLUSTER_GAP_MIN.
 * Não altera registros brutos — só produz clusters para o cálculo.
 */
export function clusterProximity(
  punches: NormalizedPunch[],
  gapMin = CLUSTER_GAP_MIN,
): NormalizedPunch[][] {
  if (punches.length === 0) return [];
  const sorted = [...punches].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || (a.id ?? 0) - (b.id ?? 0),
  );
  const clusters: NormalizedPunch[][] = [];
  let cur: NormalizedPunch[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = cur[cur.length - 1];
    const next = sorted[i];
    const gap = (next.at.getTime() - prev.at.getTime()) / 60000;
    if (gap <= gapMin) {
      cur.push(next);
    } else {
      clusters.push(cur);
      cur = [next];
    }
  }
  clusters.push(cur);
  return clusters;
}

function clusterGapMax(c: NormalizedPunch[]): number {
  if (c.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < c.length; i++) {
    max = Math.max(max, (c[i].at.getTime() - c[i - 1].at.getTime()) / 60000);
  }
  return max;
}

/**
 * Calcula a jornada de UM dia BRT.
 * Pareamento só após clusterização; órfãs não inventam direção.
 */
export function computeDayJornada(
  dayPunches: JornadaPunchInput[],
  dayHint?: string,
): DayJornadaResult {
  const normalizedAll = dayPunches.map(parsePunch);
  const day =
    dayHint ||
    (normalizedAll[0]?.day ?? "");
  const sameDay = normalizedAll.filter((p) => !day || p.day === day);
  const normalized = dedupExactMinute(sameDay);
  const rawGroups = clusterProximity(normalized);

  const clusters: PunchCluster[] = rawGroups.map((punches, idx) => {
    const role: PunchCluster["role"] =
      idx % 2 === 0 ? "entrada" : "saida";
    const representative = role === "entrada" ? punches[0] : punches[punches.length - 1];
    return {
      day: day || punches[0].day,
      punches,
      representative,
      role,
      ambiguous: punches.length >= 3,
      clustered: punches.length >= 2,
      gapMaxMin: clusterGapMax(punches),
    };
  });

  const pairs: JornadaPair[] = [];
  const orphans: NormalizedPunch[] = [];
  const issues: string[] = [];

  for (let i = 0; i < clusters.length; ) {
    const a = clusters[i];
    const b = clusters[i + 1];
    if (b) {
      const ent = a.representative;
      const sai = b.representative;
      const dur = Math.floor((sai.at.getTime() - ent.at.getTime()) / 60000);
      if (dur > 0) {
        pairs.push({
          day: a.day,
          entrada: ent,
          saida: sai,
          durationMin: dur,
          entradaClusterIds: a.punches.map((p) => p.id).filter((x): x is number => x != null),
          saidaClusterIds: b.punches.map((p) => p.id).filter((x): x is number => x != null),
        });
        if (a.ambiguous) {
          issues.push(
            `Cluster de entrada ambíguo (${a.punches.map((p) => p.hhmm).join("/")}) — revisar`,
          );
        }
        if (b.ambiguous) {
          issues.push(
            `Cluster de saída ambíguo (${b.punches.map((p) => p.hhmm).join("/")}) — revisar`,
          );
        }
        i += 2;
      } else {
        orphans.push(ent);
        issues.push(`Par inválido (duração≤0) a partir de ${ent.hhmm}`);
        i += 1;
      }
    } else {
      orphans.push(a.representative);
      issues.push(`Batida órfã: ${a.representative.hhmm}`);
      // marca cluster sem par
      a.role = "orphan_cluster";
      i += 1;
    }
  }

  const workedMinRaw = pairs.reduce((s, p) => s + p.durationMin, 0);
  const workedMin = Math.min(workedMinRaw, NORMAL_DAILY_CAP_MIN);
  const capped = workedMinRaw > NORMAL_DAILY_CAP_MIN;
  if (capped) {
    issues.push(`Cap diário 19:59 aplicado (bruto ${minutesToHHMM(workedMinRaw)})`);
  }

  return {
    day: day || normalized[0]?.day || "",
    rawCount: dayPunches.length,
    normalized,
    clusters,
    pairs,
    orphans,
    workedMinRaw,
    workedMin,
    capped,
    issues,
  };
}

/**
 * Calcula jornada de um período (vários dias). Agrupa por dia BRT primeiro.
 */
export function computePeriodJornada(
  punches: JornadaPunchInput[],
  opts: { baseMin?: number } = {},
): PeriodJornadaResult {
  const baseMin = opts.baseMin ?? DEFAULT_MONTHLY_BASE_MIN;
  const byDay = new Map<string, JornadaPunchInput[]>();
  for (const p of punches) {
    if (!p?.punch_at) continue;
    const day = ymdBRT(typeof p.punch_at === "string" ? p.punch_at : p.punch_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }

  const days: DayJornadaResult[] = [];
  for (const day of [...byDay.keys()].sort()) {
    days.push(computeDayJornada(byDay.get(day)!, day));
  }

  const totalWorkedMin = days.reduce((s, d) => s + d.workedMin, 0);
  const heMin = Math.max(0, totalWorkedMin - baseMin);
  const clusters = days.flatMap((d) => d.clusters);
  const ambiguousClusters = clusters.filter((c) => c.ambiguous);
  const safeClusters = clusters.filter((c) => c.clustered && !c.ambiguous);
  const orphans = days.flatMap((d) => d.orphans.map((punch) => ({ day: d.day, punch })));
  const pairs = days.flatMap((d) => d.pairs);

  return {
    days,
    totalWorkedMin,
    totalWorkedHHMM: minutesToHHMM(totalWorkedMin),
    heMin,
    heHHMM: minutesToHHMM(heMin),
    baseMin,
    clusters,
    ambiguousClusters,
    safeClusters,
    orphans,
    pairs,
  };
}

/** Minutos noturnos (22h–05h BRT) somados nos pares do dia. */
export function nightMinutesFromPairs(pairs: JornadaPair[]): number {
  let count = 0;
  for (const p of pairs) {
    const startMs = p.entrada.at.getTime();
    const endMs = p.saida.at.getTime();
    for (let t = startMs; t < endMs; t += 60000) {
      const h = Number(
        new Date(t).toLocaleString("en-US", {
          timeZone: "America/Sao_Paulo",
          hour: "numeric",
          hour12: false,
        }),
      );
      if (h >= 22 || h < 5) count++;
    }
  }
  return count;
}
