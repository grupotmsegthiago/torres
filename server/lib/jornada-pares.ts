/**
 * Motor canônico de jornada por pares sequenciais (Folha / pagamento).
 *
 * Regras (autorização parcial — PR de desenvolvimento):
 *  - ordenar cronologicamente;
 *  - deduplicar por minuto BRT (somente motor `pares`);
 *  - formar pares 1→2, 3→4, 5→6…;
 *  - somar somente pares completos;
 *  - batida ímpar restante = órfã (não conta + auditFlag);
 *  - não tratar 00:00 / 23:59 como artificiais;
 *  - não inventar / apagar / modificar registros brutos;
 *  - truncar para minuto;
 *  - teto diário configurável APÓS a soma dos pares;
 *  - noturno (22h–05h BRT) somado por par, não first→last.
 *
 * Motor `first_last` (legado): idêntico ao caminho pré-PR —
 * ordena por punch_at, usa [0]/último/−almoço [1]→[2] se ≥4, SEM dedup por minuto.
 * Produção SEMPRE usa `first_last` (ignora env, opts e query).
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

export type PreparedPunch = {
  atMs: number;
  rawMs: number;
  id?: number | string | null;
  date: Date;
};

export type JornadaDayResult = {
  workedMinutes: number;
  nightMinutes: number;
  completePairs: CompletePair[];
  orphanPunches: OrphanPunch[];
  duplicateEvents: DuplicateEvent[];
  /** Minutos descartados pelo teto diário (raw − capped). */
  cappedMinutes: number;
  auditFlags: AuditFlag[];
  /** Soma dos pares / bruto antes do teto. */
  rawWorkedMinutes: number;
  /**
   * Eventos usados no cálculo.
   * - first_last: lista cronológica completa (sem colapsar minuto)
   * - pares: após dedup por minuto BRT
   */
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
 * Preparação comum compatível com o legado: filtra inválidos, ordena por
 * timestamp bruto (igual `sort` de `buildFolhaPonto`), trunca HH:MM por evento.
 * NÃO colapsa eventos do mesmo minuto.
 */
export function preparePunchesChronological(punches: JornadaPunchInput[]): PreparedPunch[] {
  return punches
    .filter((p) => p && p.punchAt != null)
    .map((p) => {
      const date = toDate(p.punchAt);
      const rawMs = date.getTime();
      return {
        atMs: truncateToMinuteMs(rawMs),
        rawMs,
        id: p.id ?? null,
        date,
      };
    })
    .filter((p) => Number.isFinite(p.rawMs) && p.rawMs > 0 && p.atMs > 0)
    .sort(
      (a, b) =>
        a.rawMs - b.rawMs || String(a.id ?? "").localeCompare(String(b.id ?? "")),
    );
}

/**
 * Resolve qual motor a Folha de pagamento usa.
 *
 * PRODUÇÃO: SEMPRE `first_last` — ignora override, FOLHA_ENGINE e qualquer opts.
 * DEV/TEST: `opts` / `FOLHA_ENGINE=pares` podem ativar o motor novo.
 */
export function resolveFolhaEngine(override?: FolhaEngine | null): FolhaEngine {
  if (process.env.NODE_ENV === "production") return "first_last";
  if (override === "pares" || override === "first_last") return override;
  if (String(process.env.FOLHA_ENGINE || "").toLowerCase() === "pares") return "pares";
  return "first_last";
}

/**
 * Interpreta `?engine=` da rota Folha.
 * Em produção retorna sempre `undefined` (rota não pode ativar pares).
 */
export function parseFolhaEngineQuery(raw: unknown): FolhaEngine | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "pares" || s === "first_last") return s;
  return undefined;
}

/**
 * Motor canônico: pares sequenciais completos + dedup por minuto BRT.
 */
export function computeJornadaPares(
  punches: JornadaPunchInput[],
  opts: ComputeJornadaOpts = {},
): JornadaDayResult {
  const dailyCapMin = opts.dailyCapMin ?? DEFAULT_DAILY_CAP_MIN;
  const auditFlags: AuditFlag[] = [];
  const duplicateEvents: DuplicateEvent[] = [];
  const prepared = preparePunchesChronological(punches);

  const seen = new Map<string, { atMs: number; id?: number | string | null }>();
  const clean: Array<{ atMs: number; id?: number | string | null }> = [];
  for (const p of prepared) {
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
      auditFlags.push({ code: "non_increasing_punch", atMs: a.atMs });
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
 * Motor legado idêntico ao `buildFolhaPonto` pré-PR:
 *   worked = min(max(0, (última−primeira) − (batida[2]−batida[1] se ≥4)), teto)
 *   noturno = night(first,last) − night(lunch) se ≥4
 *
 * SEM deduplicação por minuto. Apenas ordenação cronológica + truncamento HH:MM
 * (como `truncateToMinuteMs` / `workedMinutesBetween` já faziam no legado).
 */
export function computeJornadaFirstLast(
  punches: JornadaPunchInput[],
  opts: ComputeJornadaOpts = {},
): JornadaDayResult {
  const dailyCapMin = opts.dailyCapMin ?? DEFAULT_DAILY_CAP_MIN;
  const sorted = preparePunchesChronological(punches);
  const eventsUsed = sorted.map((p) => ({ atMs: p.atMs, id: p.id ?? null }));
  const auditFlags: AuditFlag[] = [];

  if (sorted.length < 2) {
    return {
      workedMinutes: 0,
      nightMinutes: 0,
      completePairs: [],
      orphanPunches: [],
      duplicateEvents: [],
      cappedMinutes: 0,
      auditFlags,
      rawWorkedMinutes: 0,
      eventsAfterDedup: eventsUsed,
    };
  }

  const inMs = sorted[0].atMs;
  const outMs = sorted[sorted.length - 1].atMs;
  let workedMin = workedMinutesBetween(inMs, outMs);
  let noturnoMin = nightMinutesBRT(inMs, outMs);

  // Legado: lunchOut/lunchIn só quando length >= 4 (índices 1 e 2).
  if (sorted.length >= 4) {
    workedMin -= workedMinutesBetween(sorted[1].atMs, sorted[2].atMs);
    noturnoMin -= nightMinutesBRT(sorted[1].atMs, sorted[2].atMs);
  }

  const raw = Math.max(0, workedMin);
  let cappedMinutes = 0;
  let workedMinutes = raw;
  if (dailyCapMin > 0) {
    workedMinutes = Math.min(workedMinutes, dailyCapMin);
    if (raw > dailyCapMin) {
      cappedMinutes = raw - dailyCapMin;
      auditFlags.push({
        code: "daily_cap_applied",
        rawMin: raw,
        cappedMin: dailyCapMin,
      });
    }
  }
  const nightMinutes = Math.max(0, Math.min(Math.round(noturnoMin), Math.round(workedMinutes)));

  return {
    workedMinutes: Math.round(workedMinutes),
    nightMinutes,
    completePairs: [
      {
        inMs,
        outMs,
        workedMin: Math.round(workedMinutes),
        nightMin: nightMinutes,
      },
    ],
    orphanPunches: [],
    duplicateEvents: [],
    cappedMinutes: Math.round(cappedMinutes),
    auditFlags,
    rawWorkedMinutes: Math.round(raw),
    eventsAfterDedup: eventsUsed,
  };
}

/**
 * Referência pura do algoritmo legado (cópia fiel do bloco pré-PR) para testes
 * de equivalência — não usar em produção.
 */
export function computeLegacyFirstLastReferenceMin(
  punchAts: Array<string | Date | number>,
  dailyCapMin: number = DEFAULT_DAILY_CAP_MIN,
): { workedMin: number; noturnoMin: number } {
  const sorted = punchAts
    .map((p) => new Date(p))
    .filter((d) => d.getTime() > 0)
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length < 2) return { workedMin: 0, noturnoMin: 0 };
  const inMs = truncateToMinuteMs(sorted[0].getTime());
  const outMs = truncateToMinuteMs(sorted[sorted.length - 1].getTime());
  let workedMin = workedMinutesBetween(inMs, outMs);
  let noturnoMin = nightMinutesBRT(inMs, outMs);
  if (sorted.length >= 4) {
    workedMin -= workedMinutesBetween(
      truncateToMinuteMs(sorted[1].getTime()),
      truncateToMinuteMs(sorted[2].getTime()),
    );
    noturnoMin -= nightMinutesBRT(
      truncateToMinuteMs(sorted[1].getTime()),
      truncateToMinuteMs(sorted[2].getTime()),
    );
  }
  workedMin = Math.min(Math.max(0, workedMin), dailyCapMin);
  noturnoMin = Math.max(0, Math.min(Math.round(noturnoMin), Math.round(workedMin)));
  return { workedMin: Math.round(workedMin), noturnoMin };
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
