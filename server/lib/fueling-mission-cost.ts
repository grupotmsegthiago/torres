/**
 * Vínculo abastecimento (FATO vehicle_fueling) → custo da OS (ESPELHO mission_costs).
 * Tag canônica na description: [F#<id>].
 *
 * PostgREST/Supabase limita cada SELECT a 1000 linhas. O sync de boot NÃO pode
 * montar o conjunto de IDs já vinculados com um único .ilike sem paginar —
 * senão abastecimentos recentes somem do conjunto e o mesmo F# é reinserido
 * a cada cold start (TOR-0785 / TOR-0789).
 */

export const FUELING_COST_TAG_RE = /\[F#(\d+)\]/g;

export function collectLinkedFuelingIds(
  rows: Array<{ description?: string | null } | string | null | undefined>,
): Set<number> {
  const ids = new Set<number>();
  for (const row of rows || []) {
    const s = typeof row === "string" ? row : String(row?.description || "");
    const re = new RegExp(FUELING_COST_TAG_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) ids.add(Number(m[1]));
  }
  return ids;
}

/** Regex PostgreSQL `~` para os IDs candidatos desta janela (não usa ILIKE com #). */
export function fuelingTagMatchPattern(fuelingIds: number[]): string | null {
  const ids = Array.from(new Set(fuelingIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0) return null;
  return `\\[F#(${ids.join("|")})\\]`;
}
