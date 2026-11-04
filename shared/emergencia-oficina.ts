import {
  estimateDriveMinutes,
  haversineKm,
  isInsideBrazil,
  isMunicipalCentroid,
  maxRadiusStepKm,
  pickRadiusStep,
  radiusStepForDistance,
} from "./anp-onde-abastecer";

/** Borracharia ou mecânico. Guincho não entra: a frota já tem seguro. */
export type OficinaKind = "borracharia" | "mecanico";

export interface OficinaHit {
  id: string;
  name: string;
  kind: OficinaKind;
  latitude: number;
  longitude: number;
  address: string | null;
  phone: string | null;
}

export interface RankedOficina extends OficinaHit {
  kindLabel: string;
  distanceKm: number;
  driveMinutes: number;
}

export interface OficinasPayload {
  mode: "nearest" | "empty";
  emptyReason: null | "no_station" | "search_failed";
  message: string | null;
  radiusKm?: number;
  shops: RankedOficina[];
}

/** Caixas da consulta. O degrau de 5 km cabe na de 10. A régua continua 5, 10, 15 e 25. */
export const OFICINA_QUERY_BOXES_KM = [10, 15, 25] as const;

/** Quantos cartões a tela mostra no degrau escolhido. */
export const OFICINA_LIST_LIMIT = 12;

/**
 * Consultas curtas dentro da caixa do GPS.
 * `shop=tyres` é borracharia. No Brasil, mecânico costuma estar em `shop=car_repair`.
 * Autopeças (`shop=car_parts`) não entra nesta lista.
 */
export const OFICINA_PHOTON_QUERIES = [
  { q: "borracharia", osmTag: "shop:tyres" },
  { q: "pneu", osmTag: "shop:tyres" },
  { q: "oficina", osmTag: "shop:car_repair" },
  { q: "mecânica", osmTag: "shop:car_repair" },
  { q: "borracharia", osmTag: "shop:car_repair" },
] as const;

export const OFICINA_SEARCH_FAILED = "A busca não respondeu. Toque de novo.";

const TIRE_NAME = /borrach|pneu/;
const MECH_NAME = /mecan|oficina/;
const TOW_NAME = /\bguincho\b/;
const PARTS_NAME = /auto ?peca/;

export function foldOficinaName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function oficinaKindLabel(kind: OficinaKind): string {
  return kind === "borracharia" ? "Borracharia" : "Mecânico";
}

export function noOficinaMessage(radiusKm: number): string {
  return `Nenhuma borracharia ou mecânico em até ${radiusKm} km.`;
}

/** Liga só quando o número já veio na resposta. Sem telefone, o cartão fica só com o Waze. */
export function oficinaTelHref(phone: string | null): string | null {
  const formatted = formatOficinaPhone(phone);
  if (!formatted) return null;
  const digits = formatted.replace(/\D/g, "");
  return `tel:+55${digits}`;
}

/** Número do cadastro do ponto, no formato (11) 4688-2029. Sem dígito suficiente, fica vazio. */
export function formatOficinaPhone(raw: string | null | undefined): string | null {
  const chunks = String(raw ?? "").split(/[;/|]/);
  for (const chunk of chunks) {
    let digits = chunk.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return null;
}

const PHONE_TAG_KEYS = ["phone", "contact:phone", "mobile", "contact:mobile"] as const;

export function phoneFromOsmTags(tags: Record<string, string | undefined> | null | undefined): string | null {
  if (!tags) return null;
  for (const key of PHONE_TAG_KEYS) {
    const phone = formatOficinaPhone(tags[key]);
    if (phone) return phone;
  }
  return null;
}

export function oficinaBbox(lat: number, lng: number, radiusKm: number): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const reach = Math.max(radiusKm, 0.5);
  const dLat = reach / 111;
  const dLng = reach / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { west: lng - dLng, south: lat - dLat, east: lng + dLng, north: lat + dLat };
}

/**
 * Pneu e borracharia viram borracharia. Oficina e mecânico viram mecânico.
 * Autopeças e guincho isolado ficam de fora. Não marca leve nem pesado: o mapa não traz isso.
 */
export function classifyOficina(input: {
  name: string | null | undefined;
  osmKey?: string | null;
  osmValue?: string | null;
}): OficinaKind | null {
  const name = foldOficinaName(input.name ?? "").trim();
  if (name.length < 2) return null;
  const key = (input.osmKey ?? "").toLowerCase();
  const value = (input.osmValue ?? "").toLowerCase();
  const tireTag = value === "tyres" || value === "tyre";
  const repairTag = value === "car_repair";
  const partsTag = value === "car_parts";
  const tireName = TIRE_NAME.test(name);
  const mechName = MECH_NAME.test(name);
  if (key === "shop" && value === "car" && !tireName && !tireTag) return null;
  if (value === "fuel" && !tireTag && !tireName) return null;
  if (TOW_NAME.test(name) && !tireTag && !tireName && !mechName) return null;
  if (partsTag && !tireTag && !tireName) return null;
  if (PARTS_NAME.test(name) && !tireTag && !tireName && !mechName) return null;
  if (tireTag || tireName) return "borracharia";
  if (repairTag || mechName) return "mecanico";
  return null;
}

export function oficinaAddress(parts: {
  street?: string | null;
  housenumber?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  const place = [parts.street, parts.housenumber].map((item) => (item ?? "").trim()).filter(Boolean).join(", ");
  const city = [parts.city, parts.state].map((item) => (item ?? "").trim()).filter(Boolean).join(" - ");
  const line = [place, city].filter(Boolean).join(" · ");
  return line || null;
}

export interface PhotonOficinaFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    osm_id?: number | string;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    countrycode?: string;
    phone?: string;
  };
}

export function oficinaFromPhoton(feature: PhotonOficinaFeature): OficinaHit | null {
  const props = feature.properties ?? {};
  if (props.countrycode && props.countrycode !== "BR") return null;
  const kind = classifyOficina({ name: props.name, osmKey: props.osm_key, osmValue: props.osm_value });
  if (!kind || !props.name) return null;
  const osmType = (props.osm_type ?? "").trim();
  const osmId = String(props.osm_id ?? "").trim();
  if (!osmType || !osmId) return null;
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${osmType}:${osmId}`,
    name: props.name.trim(),
    kind,
    latitude: lat,
    longitude: lng,
    address: oficinaAddress(props),
    phone: formatOficinaPhone(props.phone),
  };
}

export interface PlaceOficinaDraft {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  vicinity?: string | null;
  types?: string[];
  businessStatus?: string | null;
}

/** Leitura do mapa do celular quando a consulta do servidor não responde. */
export function oficinaFromPlace(draft: PlaceOficinaDraft): OficinaHit | null {
  if ((draft.businessStatus ?? "").toUpperCase() === "CLOSED_PERMANENTLY") return null;
  const types = (draft.types ?? []).map((item) => item.toLowerCase());
  const repair = types.includes("car_repair");
  const kind = classifyOficina({
    name: draft.name,
    osmKey: repair ? "amenity" : null,
    osmValue: repair ? "car_repair" : null,
  });
  if (!kind) return null;
  const placeId = draft.placeId.trim();
  if (!placeId || !Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) return null;
  return {
    id: `g:${placeId}`,
    name: draft.name.trim(),
    kind,
    latitude: draft.lat,
    longitude: draft.lng,
    address: (draft.vicinity ?? "").trim() || null,
    phone: null,
  };
}

export function rankOficinas(
  originLat: number,
  originLng: number,
  rows: OficinaHit[],
): { radiusKm: number; shops: RankedOficina[] } | null {
  const seenId = new Set<string>();
  const seenPlace = new Set<string>();
  const measured: RankedOficina[] = [];
  for (const row of rows) {
    if (!row.id || seenId.has(row.id)) continue;
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue;
    if (!isInsideBrazil(row.latitude, row.longitude)) continue;
    if (isMunicipalCentroid(row.latitude, row.longitude)) continue;
    const distanceKm = haversineKm(originLat, originLng, row.latitude, row.longitude);
    if (distanceKm > maxRadiusStepKm()) continue;
    const placeKey = `${foldOficinaName(row.name)}|${row.latitude.toFixed(4)}|${row.longitude.toFixed(4)}`;
    if (seenPlace.has(placeKey)) continue;
    seenId.add(row.id);
    seenPlace.add(placeKey);
    measured.push({
      ...row,
      kindLabel: oficinaKindLabel(row.kind),
      distanceKm,
      driveMinutes: estimateDriveMinutes(distanceKm),
    });
  }
  const step = stepForBothKinds(measured) ?? pickRadiusStep(measured.map((row) => row.distanceKm));
  if (step === null) return null;
  let shops = measured
    .filter((row) => row.distanceKm <= step)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (shops.length > OFICINA_LIST_LIMIT) {
    const kept = shops.slice(0, OFICINA_LIST_LIMIT);
    for (const kind of ["borracharia", "mecanico"] as const) {
      if (kept.some((row) => row.kind === kind)) continue;
      const nearest = shops.find((row) => row.kind === kind);
      if (!nearest) continue;
      kept[kept.length - 1] = nearest;
    }
    shops = kept.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  if (!shops.length) return null;
  return { radiusKm: step, shops };
}

/** Os dois serviços dentro desta caixa. A busca segue até achar o par ou esgotar os 25 km. */
export function hasOficinaMixWithin(
  originLat: number,
  originLng: number,
  rows: OficinaHit[],
  radiusKm: number,
): boolean {
  let tire = false;
  let mechanic = false;
  for (const row of rows) {
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue;
    if (!isInsideBrazil(row.latitude, row.longitude) || isMunicipalCentroid(row.latitude, row.longitude)) continue;
    if (haversineKm(originLat, originLng, row.latitude, row.longitude) > radiusKm) continue;
    if (row.kind === "borracharia") tire = true;
    if (row.kind === "mecanico") mechanic = true;
  }
  return tire && mechanic;
}

function stepForBothKinds(measured: RankedOficina[]): number | null {
  let tire = Number.POSITIVE_INFINITY;
  let mechanic = Number.POSITIVE_INFINITY;
  for (const row of measured) {
    if (row.kind === "borracharia") tire = Math.min(tire, row.distanceKm);
    if (row.kind === "mecanico") mechanic = Math.min(mechanic, row.distanceKm);
  }
  if (!Number.isFinite(tire) || !Number.isFinite(mechanic)) return null;
  return radiusStepForDistance(Math.max(tire, mechanic));
}

export function oficinasPayload(
  originLat: number,
  originLng: number,
  rows: OficinaHit[],
  searchResponded: boolean,
): OficinasPayload {
  const ranked = rankOficinas(originLat, originLng, rows);
  if (ranked) {
    return { mode: "nearest", emptyReason: null, message: null, radiusKm: ranked.radiusKm, shops: ranked.shops };
  }
  if (!searchResponded) {
    return { mode: "empty", emptyReason: "search_failed", message: OFICINA_SEARCH_FAILED, shops: [] };
  }
  return {
    mode: "empty",
    emptyReason: "no_station",
    message: noOficinaMessage(maxRadiusStepKm()),
    shops: [],
  };
}
