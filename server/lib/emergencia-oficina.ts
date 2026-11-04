import {
  OFICINA_PHOTON_QUERIES,
  OFICINA_QUERY_BOXES_KM,
  hasOficinaMixWithin,
  oficinaBbox,
  oficinaFromPhoton,
  oficinasPayload,
  phoneFromOsmTags,
  rankOficinas,
  type OficinaHit,
  type OficinasPayload,
  type PhotonOficinaFeature,
  type RankedOficina,
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

const OSM = "https://api.openstreetmap.org/api/0.6";

async function osmTags(kind: "nodes" | "ways", ids: string[]): Promise<Map<string, Record<string, string>>> {
  const found = new Map<string, Record<string, string>>();
  if (!ids.length) return found;
  const prefix = kind === "nodes" ? "N" : "W";
  try {
    const res = await fetch(`${OSM}/${kind}.json?${kind}=${ids.join(",")}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return found;
    const body = await res.json() as { elements?: { id?: number; tags?: Record<string, string> }[] };
    for (const element of body.elements ?? []) {
      if (element.id == null || !element.tags) continue;
      found.set(`${prefix}:${element.id}`, element.tags);
    }
  } catch {
    /* sem telefone o cartão segue com o Waze */
  }
  return found;
}

async function attachPhones(shops: RankedOficina[]): Promise<RankedOficina[]> {
  const nodes: string[] = [];
  const ways: string[] = [];
  for (const shop of shops) {
    const [type, id] = shop.id.split(":");
    if (!id) continue;
    if (type === "N") nodes.push(id);
    if (type === "W") ways.push(id);
  }
  const [nodeTags, wayTags] = await Promise.all([osmTags("nodes", nodes), osmTags("ways", ways)]);
  return shops.map((shop) => ({
    ...shop,
    phone: phoneFromOsmTags(nodeTags.get(shop.id) ?? wayTags.get(shop.id)) ?? shop.phone,
  }));
}

export async function recommendOficinas(lat: number, lng: number): Promise<OficinasPayload> {
  const seen = new Map<string, OficinaHit>();
  let responded = false;
  const boxes = OFICINA_QUERY_BOXES_KM;
  for (const boxKm of boxes) {
    const box = oficinaBbox(lat, lng, boxKm);
    const batches = await Promise.all(
      OFICINA_PHOTON_QUERIES.map((query) => photonBox(lat, lng, box, query)),
    );
    for (const batch of batches) {
      if (batch.ok) responded = true;
      for (const hit of batch.hits) seen.set(hit.id, hit);
    }
    const rows = Array.from(seen.values());
    const last = boxKm === boxes[boxes.length - 1];
    if (!last && !hasOficinaMixWithin(lat, lng, rows, boxKm)) continue;
    const ranked = rankOficinas(lat, lng, rows);
    if (!ranked) continue;
    if (!last && ranked.radiusKm > boxKm) continue;
    return {
      mode: "nearest",
      emptyReason: null,
      message: null,
      radiusKm: ranked.radiusKm,
      shops: await attachPhones(ranked.shops),
    };
  }
  const payload = oficinasPayload(lat, lng, Array.from(seen.values()), responded);
  if (!payload.shops.length) return payload;
  return { ...payload, shops: await attachPhones(payload.shops) };
}
