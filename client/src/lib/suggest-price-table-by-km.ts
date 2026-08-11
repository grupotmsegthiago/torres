/**
 * Sugere a tabela de preços (escort_contracts) mais adequada à distância da rota.
 * SSOT da faixa: franquia_km (fallback franquia_minima_km) — não o nome livre.
 *
 * Regra: menor franquia_km >= km da rota; se a rota passar de todas, usa a maior franquia.
 */

export type PriceTableLike = {
  id: string;
  name?: string | null;
  status?: string | null;
  franquia_km?: number | string | null;
  franquia_minima_km?: number | string | null;
  franquia_horas?: number | string | null;
  valor_acionamento?: number | string | null;
};

export function contractFranquiaKm(c: PriceTableLike): number {
  return Number(c.franquia_km || 0) || Number(c.franquia_minima_km || 0) || 0;
}

export function suggestPriceTableByRouteKm<T extends PriceTableLike>(
  contracts: T[],
  routeKm: number,
): { suggested: T | null; ranked: Array<T & { franquiaKm: number; covers: boolean }> } {
  const km = Math.max(0, Math.round(Number(routeKm) || 0));
  const ranked = (contracts || [])
    .map((c) => {
      const franquiaKm = contractFranquiaKm(c);
      return { ...c, franquiaKm, covers: franquiaKm > 0 && franquiaKm >= km };
    })
    .sort((a, b) => a.franquiaKm - b.franquiaKm || String(a.name || "").localeCompare(String(b.name || "")));

  if (ranked.length === 0 || km <= 0) {
    return { suggested: null, ranked };
  }

  const covering = ranked.filter((c) => c.covers);
  if (covering.length > 0) {
    // Menor franquia que ainda cobre a rota (ex.: 200 km → tabela 200).
    return { suggested: covering[0], ranked };
  }
  // Rota maior que todas as franquias → maior tabela disponível.
  return { suggested: ranked[ranked.length - 1], ranked };
}
