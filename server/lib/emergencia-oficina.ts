import {
  OFICINA_PHOTON_QUERIES,
  OFICINA_QUERY_BOXES_KM,
  oficinaBbox,
  oficinaFromPhoton,
  oficinasPayload,
  rankOficinas,
  type OficinaHit,
  type OficinasPayload,
  type PhotonOficinaFeature,
} from "@shared/emergencia-oficina";

const UA = "TorresSeguranca/emergencia-oficina";
const PHOTON = "https://photon.komoot.io/api/";

/**
 * Busca sob demanda. Não grava tabela e não baixa o cadastro da Receita.
 * A Overpass pública não respondeu nesta rota (502 e tempo esgotado); a caixa no Photon responde.
 */

async function photonBox(
  originLat: number,
  originLng: number,
  box: { west: number; south: number; east: number; north: number },
  query: { q: string; osmTag: string },
): Promise<{ ok: boolean; hits: OficinaHit[] }> {
  const params = new URLSearchParams({
    q: query.q,
    limit: "15",
    osm_tag: query.osmTag,
    bbox: `${box.west},${box.south},${box.east},${box.north}`,
    lat: String(originLat),
    lon: String(originLng),
  });
  try {
    const res = await fetch(`${PHOTON}?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, hits: [] };
    const body = await res.json() as { features?: PhotonOficinaFeature[] };
    const hits: OficinaHit[] = [];
    for (const feature of body.features ?? []) {
      const hit = oficinaFromPhoton(feature);
      if (hit) hits.push(hit);
    }
    return { ok: true, hits };
  } catch {
    return { ok: false, hits: [] };
  }
}

export async function recommendOficinas(lat: number, lng: number): Promise<OficinasPayload> {
  const seen = new Map<string, OficinaHit>();
  let responded = false;
  for (const boxKm of OFICINA_QUERY_BOXES_KM) {
    const box = oficinaBbox(lat, lng, boxKm);
    const batches = await Promise.all(
      OFICINA_PHOTON_QUERIES.map((query) => photonBox(lat, lng, box, query)),
    );
    for (const batch of batches) {
      if (batch.ok) responded = true;
      for (const hit of batch.hits) seen.set(hit.id, hit);
    }
    const ranked = rankOficinas(lat, lng, Array.from(seen.values()));
    if (ranked && ranked.radiusKm <= boxKm) {
      return { mode: "nearest", emptyReason: null, message: null, radiusKm: ranked.radiusKm, shops: ranked.shops };
    }
  }
  return oficinasPayload(lat, lng, Array.from(seen.values()), responded);
}
