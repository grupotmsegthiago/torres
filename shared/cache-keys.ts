/**
 * Catálogo central de chaves de cache (React Query + SWR servidor).
 *
 * Regra: NÃO espalhar "v6"/"v9" em telas. Bump só `RH_SUMMARY_SCHEMA`
 * quando o payload/regra de negócio da Folha mudar de forma incompatível.
 */

/** Schema técnico do payload rh-summary (única constante versionada). */
export const RH_SUMMARY_SCHEMA = 9;

/** Prefixo SWR / snapshot — derivado do schema (um só lugar). */
export function rhSummarySwrBaseKey(): string {
  return `rh-summary-v${RH_SUMMARY_SCHEMA}`;
}

/** Prefixo legado + atual — bust servidor deve limpar todos. */
export const RH_SUMMARY_SWR_BUST_PREFIXES = [
  "rh-summary",
  "rh-summary-v4",
  "rh-summary-v5",
  "rh-summary-v6",
  "rh-summary-v7",
  "rh-summary-v8",
  "rh-summary-v9",
  rhSummarySwrBaseKey(),
] as const;

/**
 * Janela em que um HIT SWR ainda pode ser apresentado como "atual"
 * sem banner. Acima disso, mount/F5 com validate=1 aguarda recálculo.
 */
export const RH_SUMMARY_FRESH_TTL_MS = 2 * 60 * 1000;

/** Teto duro do SWR (memória/snapshot); STALE além disso. */
export const RH_SUMMARY_HARD_TTL_MS = 3 * 60 * 60 * 1000;

/** Mesma política de frescor p/ dashboard + operational-grid no Balanço. */
export const BALANCO_FRESH_TTL_MS = RH_SUMMARY_FRESH_TTL_MS;
export const BALANCO_HARD_TTL_MS = RH_SUMMARY_HARD_TTL_MS;

export type CacheStatus = "HIT" | "STALE" | "MISS" | "FORCE" | "VALIDATE";

export type CacheMeta = {
  status: CacheStatus;
  ageSec: number;
  computedAt: string | null;
  fresh: boolean;
  schema?: number;
};

/** Chaves React Query tipadas — leitura e invalidação usam as mesmas. */
export const queryKeys = {
  rhSummaryRoot: ["/api/fixed-costs/rh-summary"] as const,
  rhSummary: (from: string, to: string) =>
    [
      "/api/fixed-costs/rh-summary",
      `v${RH_SUMMARY_SCHEMA}`,
      "cached",
      from,
      to,
    ] as const,
  operationalGridRoot: ["/api/operational-grid"] as const,
  operationalGrid: (from: string, to: string) =>
    ["/api/operational-grid", from, to, "cached"] as const,
  financialDashboardRoot: ["/api/financial/dashboard"] as const,
  financialDashboard: () => ["/api/financial/dashboard", "cached"] as const,
};

export function isRhSummaryQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "/api/fixed-costs/rh-summary";
}
