/**
 * Paginação do PostgREST/Supabase (limite default = 1000 linhas por request).
 * Sem isso, listas ordenadas ASC perdem os registros recentes — e DESC perdem os antigos.
 * Já causou divergência Boletim × Balanço (canceladas recentes fora do byMission → liveFat inflado).
 */

export const SUPABASE_PAGE_SIZE = 1000;

export type SupabasePageResult<T> = { data: T[] | null; error: any };

/**
 * Busca todas as páginas de uma query Supabase até esgotar.
 * `fetchPage(from, to)` deve aplicar `.range(from, to)` (inclusivo) na query.
 */
export async function fetchAllSupabaseRows<T = any>(
  fetchPage: (from: number, to: number) => Promise<SupabasePageResult<T>>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  if (pageSize <= 0) throw new Error("pageSize must be > 0");
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
