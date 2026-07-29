/**
 * Motor canônico de jornada por pares sequenciais (Folha / pagamento).
 *
 * Regras (autorização parcial — PR de desenvolvimento):
 *  - ordenar cronologicamente;
 *  - deduplicar por minuto BRT (regra oficial já usada em helpers);
 *  - formar pares 1→2, 3→4, 5→6…;
 *  - somar somente pares completos;
 *  - batida ímpar restante = órfã (não conta + auditFlag);
 *  - não tratar 00:00 / 23:59 como artificiais;
 *  - não inventar / apagar / modificar registros brutos;
 *  - truncar para minuto;
 *  - teto diário configurável APÓS a soma dos pares;
 *  - noturno (22h–05h BRT) somado por par, não first→last.
 *
 * O motor `first_last` permanece disponível para comparação A×B e é o
 * default em produção até autorização expressa de ativação.
 */
import {
  dedupPunchesByCore,
  minuteKeyBRT,
  truncateToMinuteMs,
  workedMinutesBetween,
} from "./control-id-parsers";

export type FolhaEngine = "first_last" | "pares";

export type JornadaPunchInput = {
  punchAt: string | Date | number;
  id?: number | string | null;
  externalId?: string | null;
  source?: string | null;
  direction?: string | null;
};

export type CompletePair = {
  inMs: number;
  outMs: number;
  workedMin: number;
  nightMin: number;
};

export type OrphanPunch = {
  atMs: number;
  punchAtIso: string;
  id?: number | string | null;
  reason: "unpaired_trailing" | "non_increasing";
};

export type DuplicateEvent = {
  atMs: number;
  punchAtIso: string;
  minuteKey: string;
  id?: number | string | null;
  keptId?: number | string | null;
};

export type AuditFlag =
  | { code: "orphan_punch"; atMs: number; detail: string }
  | { code: "daily_cap_applied"; rawMin: number; cappedMin: number }
  | { code: "minute_duplicate"; minuteKey: string }
  | { code: "non_increasing_punch"; atMs: number };

export type JornadaDayResult = {
  workedMinutes: number;
  nightMinutes: number;
  completePairs: CompletePair[];
  orphanPunches: OrphanPunch[];
  duplicateEvents: DuplicateEvent[];
  /** Minutos descartados pelo teto diário (raw − capped). */
  cappedMinutes: number;
  auditFlags: AuditFlag[];
  /** Soma dos pares antes do teto. */
  rawWorkedMinutes: number;
  /** Eventos efetivamente usados após dedup por minuto. */
  eventsAfterDedup: Array<{ atMs: number; id?: number | string | null }>;
};

export type ComputeJornadaOpts = {
  /** Teto diário em minutos; 0 = sem teto. Default 1199 (19:59). */
  dailyCapMin?: number;
};

const DEFAULT_DAILY_CAP_MIN = 1199;

/** Minutos na faixa noturna 22h–05h BRT entre dois instantes (só HH:MM). */
export function nightMinutesBRT(startMs: number, endMs: number): number {
  const from = truncateToMinuteMs(startMs);
  const to = truncateToMinuteMs(endMs);
  if (!(to > from)) return 0;
  let count = 0;
  for (let t = from; t < to; t += 60_000) {
    const h = Number(
      new Date(t).toLocaleString("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "numeric",
        hour12: false,
      }),
    );
    if (h >= 22 || h < 5) count++;
  }
  return count;
}

function toDate(punchAt: string | Date | number): Date {
  if (typeof punchAt === "number") return new Date(punchAt);
  return new Date(punchAt);
}

/**
 * Resolve qual motor a Folha usa.
 * Produção: sempre `first_last` (sem afetar deploy atual).
 * Dev/test: `FOLHA_ENGINE=pares` ativa o motor novo.
 */
export function resolveFolhaEngine(override?: FolhaEngine | null): FolhaEngine {
  if (override === "pares" || override === "first_last") return override;
  if (process.env.NODE_ENV === "production") return "first_last";
  if (String(process.env.FOLHA_ENGINE || "").toLowerCase() === "pares") return "pares";
  return "first_last";
}

/**
 * Motor canônico: pares sequenciais completos.
 * Entrada = eventos já selecionados para UMA jornada/dia (ou conjunto a avaliar).
 * Não agrupa por dia — o chamador agrupa.
 */
export function computeJornadaPares(
  punches: JornadaPunchInput[],
  opts: ComputeJornadaOpts = {},
): JornadaDayResult {
  const dailyCapMin = opts.dailyCapMin ?? DEFAULT_DAILY_CAP_MIN;
  const auditFlags: AuditFlag[] = [];
  const duplicateEvents: DuplicateEvent[] = [];

  const sorted = punches
    .filter((p) => p && p.punchAt != null)
    .map((p) => {
      const d = toDate(p.punchAt);
      return { ...p, atMs: truncateToMinuteMs(d.getTime()), date: d };
    })
    .filter((p) => p.atMs > 0)
    .sort((a, b) => a.atMs - b.atMs || String(a.id ?? "").localeCompare(String(b.id ?? "")));

  const seen = new Map<string, { atMs: number; id?: number | string | null }>();
  const clean: Array<{ atMs: number; id?: number | string | null }> = [];
  for (const p of sorted) {
    const key = minuteKeyBRT(p.date);
    const prev = seen.get(key);
    if (prev) {
      duplicateEvents.push({
        atMs: p.atMs,
        punchAtIso: new Date(p.atMs).toISOString(),
        minuteKey: key,
        id: p.id ?? null,
        keptId: prev.id ?? null,
      });
      auditFlags.push({ code: "minute_duplicate", minuteKey: key });
      continue;
    }
    seen.set(key, { atMs: p.atMs, id: p.id ?? null });
    clean.push({ atMs: p.atMs, id: p.id ?? null });
  }

  const completePairs: CompletePair[] = [];
  const orphanPunches: OrphanPunch[] = [];

  for (let i = 0; i < clean.length; ) {
    const a = clean[i];
    const b = clean[i + 1];
    if (b != null && b.atMs > a.atMs) {
      const workedMin = workedMinutesBetween(a.atMs, b.atMs);
      const nightMin = nightMinutesBRT(a.atMs, b.atMs);
      completePairs.push({
        inMs: a.atMs,
        outMs: b.atMs,
        workedMin,
        nightMin,
      });
      i += 2;
      continue;
    }
    if (b != null && b.atMs <= a.atMs) {
      orphanPunches.push({
        atMs: a.atMs,
        punchAtIso: new Date(a.atMs).toISOString(),
        id: a.id ?? null,
        reason: "non_increasing",
      });
      auditFlags.push({
        code: "non_increasing_punch",
        atMs: a.atMs,
      });
      auditFlags.push({
        code: "orphan_punch",
        atMs: a.atMs,
        detail: "batida não crescente em relação à seguinte",
      });
      i += 1;
      continue;
    }
    orphanPunches.push({
      atMs: a.atMs,
      punchAtIso: new Date(a.atMs).toISOString(),
      id: a.id ?? null,
      reason: "unpaired_trailing",
    });
    auditFlags.push({
      code: "orphan_punch",
      atMs: a.atMs,
      detail: "batida ímpar sem par (não contabilizada)",
    });
    i += 1;
  }

  const rawWorkedMinutes = completePairs.reduce((s, p) => s + p.workedMin, 0);
  let nightMinutes = completePairs.reduce((s, p) => s + p.nightMin, 0);
  let workedMinutes = rawWorkedMinutes;
  let cappedMinutes = 0;

  if (dailyCapMin > 0 && workedMinutes > dailyCapMin) {
    cappedMinutes = workedMinutes - dailyCapMin;
    workedMinutes = dailyCapMin;
    auditFlags.push({
      code: "daily_cap_applied",
      rawMin: rawWorkedMinutes,
      cappedMin: dailyCapMin,
    });
    // Noturno não pode exceder o trabalhado contabilizado após o teto.
    nightMinutes = Math.min(nightMinutes, workedMinutes);
  }

  return {
    workedMinutes: Math.round(workedMinutes),
    nightMinutes: Math.max(0, Math.round(nightMinutes)),
    completePairs,
    orphanPunches,
    duplicateEvents,
    cappedMinutes: Math.round(cappedMinutes),
    auditFlags,
    rawWorkedMinutes: Math.round(rawWorkedMinutes),
    eventsAfterDedup: clean,
  };
}

/**
 * Motor legado (pagamento atual): (última − primeira) − 1º intervalo (batidas 2–3 se ≥4),
 * teto diário. Mantido para A×B e default de produção.
 */
export function computeJornadaFirstLast(
  punches: JornadaPunchInput[],
  opts: ComputeJornadaOpts = {},
): JornadaDayResult {
  const dailyCapMin = opts.dailyCapMin ?? DEFAULT_DAILY_CAP_MIN;
  const paresProbe = computeJornadaPares(punches, { dailyCapMin: 0 });
  const clean = paresProbe.eventsAfterDedup;
  const auditFlags: AuditFlag[] = [...paresProbe.auditFlags.filter((f) => f.code === "minute_duplicate")];
  const duplicateEvents = paresProbe.duplicateEvents;

  if (clean.length < 2) {
    const orphanPunches: OrphanPunch[] = clean.map((c) => ({
      atMs: c.atMs,
      punchAtIso: new Date(c.atMs).toISOString(),
      id: c.id ?? null,
      reason: "unpaired_trailing" as const,
    }));
    for (const o of orphanPunches) {
      auditFlags.push({
        code: "orphan_punch",
        atMs: o.atMs,
        detail: "menos de 2 batidas (first_last)",
      });
    }
    return {
      workedMinutes: 0,
      nightMinutes: 0,
      completePairs: [],
      orphanPunches,
      duplicateEvents,
      cappedMinutes: 0,
      auditFlags,
      rawWorkedMinutes: 0,
      eventsAfterDedup: clean,
    };
  }

  const inMs = clean[0].atMs;
  const outMs = clean[clean.length - 1].atMs;
  let raw = workedMinutesBetween(inMs, outMs);
  let night = nightMinutesBRT(inMs, outMs);
  if (clean.length >= 4) {
    const lunch = workedMinutesBetween(clean[1].atMs, clean[2].atMs);
    const lunchNight = nightMinutesBRT(clean[1].atMs, clean[2].atMs);
    raw -= lunch;
    night -= lunchNight;
  }
  raw = Math.max(0, raw);
  night = Math.max(0, night);

  let workedMinutes = raw;
  let cappedMinutes = 0;
  if (dailyCapMin > 0 && workedMinutes > dailyCapMin) {
    cappedMinutes = workedMinutes - dailyCapMin;
    workedMinutes = dailyCapMin;
    auditFlags.push({
      code: "daily_cap_applied",
      rawMin: raw,
      cappedMin: dailyCapMin,
    });
  }
  night = Math.min(night, workedMinutes);

  return {
    workedMinutes: Math.round(workedMinutes),
    nightMinutes: Math.max(0, Math.round(night)),
    completePairs: [
      {
        inMs,
        outMs,
        workedMin: Math.round(workedMinutes),
        nightMin: Math.max(0, Math.round(night)),
      },
    ],
    orphanPunches: [],
    duplicateEvents,
    cappedMinutes: Math.round(cappedMinutes),
    auditFlags,
    rawWorkedMinutes: Math.round(raw),
    eventsAfterDedup: clean,
  };
}

export function computeJornadaByEngine(
  punches: JornadaPunchInput[],
  engine: FolhaEngine,
  opts: ComputeJornadaOpts = {},
): JornadaDayResult {
  return engine === "pares"
    ? computeJornadaPares(punches, opts)
    : computeJornadaFirstLast(punches, opts);
}

/** Aplica `dedupPunchesByCore` (POST×AFD) sem mutar o array original. */
export function applyOfficialPunchDedup<
  T extends { punch_at: string | Date; external_id?: string | null },
>(punches: T[]): T[] {
  return dedupPunchesByCore(punches);
}

export function hhmmFromMinutes(min: number): string {
  const t = Math.max(0, Math.round(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
