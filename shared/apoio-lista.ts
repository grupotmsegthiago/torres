import {
  estimateDriveMinutes,
  haversineKm,
  isInsideBrazil,
  maxRadiusStepKm,
  pickRadiusStep,
  radiusStepForDistance,
} from "./anp-onde-abastecer";
import { oficinaFromPlace, type OficinaHit, type OficinaKind, type PlaceOficinaDraft, type RankedOficina } from "./emergencia-oficina";

/** De onde o cartão veio. ANP e CNES são as listas oficiais. Google completa. Mapa é o cadastro aberto. */
export type FonteApoio = "ANP" | "Google" | "CNES" | "Mapa";

export interface PontoNome {
  name: string;
  latitude: number;
  longitude: number;
}

export function textoFonte(fonte: string | null | undefined, padrao: FonteApoio): string {
  const nome = (fonte || padrao).trim() || padrao;
  return `Fonte: ${nome}`;
}

function dobrar(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** O mesmo lugar no Google e na lista oficial não entra duas vezes. */
export function mesmoEstabelecimento(a: PontoNome, b: PontoNome, km = 0.25): boolean {
  const distancia = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  if (distancia <= km) return true;
  const esquerda = dobrar(a.name);
  const direita = dobrar(b.name);
  if (esquerda.length < 6 || direita.length < 6) return false;
  const parecido = esquerda.includes(direita) || direita.includes(esquerda);
  return parecido && distancia <= 0.8;
}

/**
 * A lista oficial fica na frente. O Google entra depois, no menor degrau que ainda alcança um lugar novo.
 * Sem lista oficial, o degrau sai só do Google.
 */
export function faixaDaLista(raioOficial: number | null, distanciasNovas: number[]): number | null {
  const novas = distanciasNovas.filter((km) => Number.isFinite(km) && km >= 0 && km <= maxRadiusStepKm());
  if (raioOficial !== null && Number.isFinite(raioOficial)) {
    if (novas.some((km) => km <= raioOficial) || novas.length === 0) return raioOficial;
    return radiusStepForDistance(Math.min(...novas)) ?? raioOficial;
  }
  return pickRadiusStep(novas);
}

export function juntarApoio<T extends PontoNome & { distanceKm: number }>(
  oficiais: T[],
  novos: T[],
  raioOficial: number | null,
  limiteNovos = 8,
): { itens: T[]; radiusKm: number | null } {
  const extras = novos.filter((item) => !oficiais.some((oficial) => mesmoEstabelecimento(oficial, item)));
  const radiusKm = faixaDaLista(raioOficial, extras.map((item) => item.distanceKm));
  const acrescentados = extras
    .filter((item) => radiusKm !== null && item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limiteNovos);
  return { itens: [...oficiais, ...acrescentados], radiusKm: radiusKm ?? raioOficial };
}

export interface RascunhoGoogle {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  vicinity?: string | null;
  types?: string[];
  businessStatus?: string | null;
}

function pontoValido(draft: RascunhoGoogle): boolean {
  if ((draft.businessStatus ?? "").toUpperCase() === "CLOSED_PERMANENTLY") return false;
  if (!draft.placeId.trim() || !draft.name.trim()) return false;
  return isInsideBrazil(draft.lat, draft.lng);
}

export interface PostoGoogle {
  cnpj: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  driveMinutes: number;
  gasolinePrice: null;
  ethanolPrice: null;
  researchLabel: null;
  qualityPhrase: string;
  priced: false;
  source: "Google";
}

export function postoFromGoogle(draft: RascunhoGoogle, originLat: number, originLng: number): PostoGoogle | null {
  if (!pontoValido(draft)) return null;
  const distanceKm = haversineKm(originLat, originLng, draft.lat, draft.lng);
  if (distanceKm > maxRadiusStepKm()) return null;
  return {
    cnpj: `g:${draft.placeId.trim()}`,
    name: draft.name.trim(),
    address: (draft.vicinity ?? "").trim() || null,
    latitude: draft.lat,
    longitude: draft.lng,
    distanceKm,
    driveMinutes: estimateDriveMinutes(distanceKm),
    gasolinePrice: null,
    ethanolPrice: null,
    researchLabel: null,
    qualityPhrase: "Visto no Google. Sem nota da ANP nesta lista.",
    priced: false,
    source: "Google",
  };
}

export interface HospitalGoogle {
  cnes: string;
  name: string;
  address: string | null;
  phone: null;
  care: "particular";
  attendsSus: false;
  unitLabel: string;
  categoryPhrase: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  driveMinutes: number;
  source: "Google";
}

export function hospitalFromGoogle(draft: RascunhoGoogle, originLat: number, originLng: number): HospitalGoogle | null {
  if (!pontoValido(draft)) return null;
  const distanceKm = haversineKm(originLat, originLng, draft.lat, draft.lng);
  if (distanceKm > maxRadiusStepKm()) return null;
  return {
    cnes: `g:${draft.placeId.trim()}`,
    name: draft.name.trim(),
    address: (draft.vicinity ?? "").trim() || null,
    phone: null,
    care: "particular",
    attendsSus: false,
    unitLabel: "Hospital",
    categoryPhrase: "Visto no Google. Fora da lista do Ministério da Saúde.",
    latitude: draft.lat,
    longitude: draft.lng,
    distanceKm,
    driveMinutes: estimateDriveMinutes(distanceKm),
    source: "Google",
  };
}

export function oficinaGoogle(draft: RascunhoGoogle, kind: OficinaKind, originLat: number, originLng: number): (RankedOficina & { source: "Google" }) | null {
  const hit: OficinaHit | null = oficinaFromPlace(draft as PlaceOficinaDraft, kind);
  if (!hit) return null;
  const distanceKm = haversineKm(originLat, originLng, hit.latitude, hit.longitude);
  if (distanceKm > maxRadiusStepKm()) return null;
  return {
    ...hit,
    kindLabel: kind === "borracharia" ? "Borracharia" : "Mecânico",
    distanceKm,
    driveMinutes: estimateDriveMinutes(distanceKm),
    source: "Google",
  };
}
