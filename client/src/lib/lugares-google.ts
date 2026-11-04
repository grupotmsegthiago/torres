import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { maxRadiusStepKm } from "@shared/anp-onde-abastecer";
import type { RascunhoGoogle } from "@shared/apoio-lista";

export interface PedidoGoogle {
  keyword?: string;
  type?: string;
}

function mapaPronto(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    loadGoogleMapsScript(() => finish(!!window.google?.maps?.places?.PlacesService));
    window.setTimeout(() => finish(!!window.google?.maps?.places?.PlacesService), 5000);
  });
}

function buscarUm(origin: { lat: number; lng: number }, pedido: PedidoGoogle): Promise<RascunhoGoogle[]> {
  return new Promise((resolve) => {
    const Ctor = window.google?.maps?.places?.PlacesService;
    if (!Ctor) {
      resolve([]);
      return;
    }
    const service = new Ctor(document.createElement("div"));
    const timer = window.setTimeout(() => resolve([]), 8000);
    const request: { location: { lat: number; lng: number }; radius: number; keyword?: string; type?: string } = {
      location: origin,
      radius: maxRadiusStepKm() * 1000,
    };
    if (pedido.keyword) request.keyword = pedido.keyword;
    if (pedido.type) request.type = pedido.type;
    service.nearbySearch(
      request,
      (results: Array<{ place_id?: string; name?: string; vicinity?: string; business_status?: string; types?: string[]; geometry?: { location?: { lat: () => number; lng: () => number } } }> | null, status: string) => {
        window.clearTimeout(timer);
        if (status !== "OK" || !results) {
          resolve([]);
          return;
        }
        const hits: RascunhoGoogle[] = [];
        for (const result of results) {
          const loc = result.geometry?.location;
          if (!loc || !result.place_id || !result.name) continue;
          hits.push({
            placeId: result.place_id,
            name: result.name,
            lat: loc.lat(),
            lng: loc.lng(),
            vicinity: result.vicinity ?? null,
            types: result.types ?? [],
            businessStatus: result.business_status ?? null,
          });
        }
        resolve(hits);
      },
    );
  });
}

/** Lugares novos em volta do GPS. Sem a chave do mapa, a lista oficial segue sozinha. */
export async function lugaresGoogle(origin: { lat: number; lng: number }, pedidos: PedidoGoogle[]): Promise<RascunhoGoogle[]> {
  const ready = await mapaPronto();
  if (!ready) return [];
  const batches = await Promise.all(pedidos.map((pedido) => buscarUm(origin, pedido)));
  const seen = new Map<string, RascunhoGoogle>();
  for (const hit of batches.flat()) seen.set(hit.placeId, hit);
  return Array.from(seen.values());
}
