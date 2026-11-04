import {
  MAP_LOCATE_LIMIT,
  MAP_PIN_MAX_KM,
  acceptMapPoint,
  cepDigits,
  estimateDriveMinutes,
  haversineKm,
  isInsideBrazil,
  isMunicipalCentroid,
  normalizePlace,
  pickRadiusStep,
  stationGeocodeQuery,
  STREET_CLUSTER_MAX_KM,
} from "./anp-onde-abastecer";

/** Hospital geral, especializado e pronto-socorro. Hospital-dia não é porta de urgência. */
export const HOSPITAL_UNIT_TYPES = ["5", "7", "20", "21"] as const;

/**
 * A carga de 3 de novembro de 2026 tinha 6.941 hospitais gerais ativos e desabilitados
 * somados aos outros tipos. Abaixo disto a leitura do arquivo falhou e a lista anterior fica.
 */
export const CNES_HOSPITAL_MIN_ROWS = 4000;

export const CNES_ESTABELECIMENTOS_ZIP =
  "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip";

export type HospitalCare = "publico" | "particular" | "filantropico";

export interface CnesHospitalDraft {
  cnes: string;
  name: string;
  address: string;
  city: string;
  cityNorm: string;
  state: string;
  cep: string;
  phone: string | null;
  care: HospitalCare;
  attendsSus: boolean;
  unitLabel: string;
}

export interface HospitalPin {
  cnes: string;
  lat: number;
  lng: number;
}

export interface HospitalToLocate {
  cnes: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  cep: string;
  query: string;
  phone: string | null;
  care: HospitalCare;
  attendsSus: boolean;
  unitLabel: string;
}

export interface RankedHospital {
  cnes: string;
  name: string;
  address: string | null;
  phone: string | null;
  care: HospitalCare;
  attendsSus: boolean;
  unitLabel: string;
  categoryPhrase: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  driveMinutes: number;
}

const PIN_PART = /^(\d{7}):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/;

export function cnesDigits(value: string | number | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 7) return "";
  return digits.padStart(7, "0");
}

export function hospitalUnitLabel(code: string | null | undefined): string | null {
  switch ((code ?? "").trim()) {
    case "5": return "Hospital geral";
    case "7": return "Hospital especializado";
    case "20": return "Pronto-socorro geral";
    case "21": return "Pronto-socorro especializado";
    default: return null;
  }
}

/** Natureza jurídica do CNES. Esfera municipal não separa público de particular. */
export function hospitalCare(natureza: string | null | undefined): HospitalCare | null {
  const digit = String(natureza ?? "").replace(/\D/g, "")[0];
  if (digit === "1") return "publico";
  if (digit === "2") return "particular";
  if (digit === "3") return "filantropico";
  return null;
}

export function hospitalAttendsSus(flag: string | null | undefined): boolean {
  return String(flag ?? "").trim().toUpperCase() === "SIM";
}

export function hospitalCategoryPhrase(care: HospitalCare, attendsSus: boolean): string {
  const base = care === "publico" ? "Público" : care === "particular" ? "Particular" : "Filantrópico";
  return attendsSus ? `${base} · Atende SUS` : base;
}

export function hospitalPhoneDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
}

export function formatHospitalPhone(raw: string | null | undefined): string | null {
  const digits = hospitalPhoneDigits(raw);
  if (!digits) return null;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
}

export function hospitalAddressLine(
  street: string | null | undefined,
  number: string | null | undefined,
  neighborhood: string | null | undefined,
): string {
  const via = (street ?? "").replace(/\s+/g, " ").trim();
  const num = (number ?? "").replace(/\s+/g, " ").trim();
  const hood = (neighborhood ?? "").replace(/\s+/g, " ").trim();
  const numbered = num && num.toUpperCase() !== "S/N" ? [via, num].filter(Boolean).join(", ") : via;
  return [numbered, hood].filter(Boolean).join(" - ");
}

export function hospitalGeocodeQuery(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  return stationGeocodeQuery(address, city, state);
}

/** Consulta do mapa sem o bairro. O bairro do CNES vem cortado e derruba o número. */
export function hospitalStreetQuery(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  const street = (address ?? "").split(/\s+-\s+/)[0].trim();
  return stationGeocodeQuery(street, city, state);
}

export interface HospitalLookupHit {
  lat: number;
  lng: number;
  houseNumber?: string | null;
  postcode?: string | null;
  name?: string | null;
  street?: string | null;
}

const STREET_PREFIX = new Set(["rua", "avenida", "av", "alameda", "via", "travessa", "praca", "rodovia", "estrada"]);
const NAME_STOP = new Set(["hospital", "hospitais", "pronto", "socorro", "municipal", "maternidade", "regional", "unidade", "geral", "especializado", "santa"]);

function foldHospital(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function hospitalStreetPhrase(address: string | null | undefined): string {
  const head = foldHospital(address ?? "").split(/\s+-\s+/)[0];
  const withoutNumber = head.replace(/,?\s*\d+[a-z]?\s*$/, "");
  return withoutNumber.split(/[^a-z0-9]+/).filter((word) => word && !STREET_PREFIX.has(word)).join(" ");
}

function hospitalNameTokens(name: string): string[] {
  return foldHospital(name).split(/[^a-z0-9]+/).filter((word) => word.length >= 6 && !NAME_STOP.has(word));
}

function houseNumberValue(value: string | null | undefined): number | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function lookupText(hit: HospitalLookupHit): string {
  return foldHospital(`${hit.name ?? ""} ${hit.street ?? ""}`);
}

function clusterDiameterKm(hits: HospitalLookupHit[]): number {
  let max = 0;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      max = Math.max(max, haversineKm(hits[i].lat, hits[i].lng, hits[j].lat, hits[j].lng));
    }
  }
  return max;
}

/**
 * Ponto do hospital para o Waze.
 * O nome do estabelecimento ou o número na rua certa entram.
 * Número igual em outra rua, centro do município e avenida espalhada ficam de fora.
 */
export function pickHospitalPoint(input: {
  hits: HospitalLookupHit[];
  address: string | null;
  hospitalName: string;
  cep: string | null;
  originLat: number;
  originLng: number;
}): { lat: number; lng: number } | null {
  const phrase = hospitalStreetPhrase(input.address);
  const wanted = houseNumberValue((input.address ?? "").split(/\s+-\s+/)[0]);
  const tokens = hospitalNameTokens(input.hospitalName);
  const cep = cepDigits(input.cep);
  const usable = input.hits.filter((hit) => {
    if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return false;
    if (!isInsideBrazil(hit.lat, hit.lng) || isMunicipalCentroid(hit.lat, hit.lng)) return false;
    return haversineKm(input.originLat, input.originLng, hit.lat, hit.lng) <= MAP_PIN_MAX_KM;
  });
  const onStreet = (hits: HospitalLookupHit[]) => (
    phrase.length >= 6 ? hits.filter((hit) => lookupText(hit).includes(phrase)) : []
  );
  const named = onStreet(usable).filter((hit) => {
    const text = foldHospital(hit.name ?? "");
    return tokens.some((token) => text.includes(token));
  });
  if (named.length) {
    const exact = wanted === null ? undefined : named.find((hit) => houseNumberValue(hit.houseNumber) === wanted);
    const chosen = exact ?? named[0];
    return { lat: chosen.lat, lng: chosen.lng };
  }
  const street = onStreet(usable);
  const numbered = wanted === null ? undefined : street.find((hit) => houseNumberValue(hit.houseNumber) === wanted);
  if (numbered && (!cep || cepDigits(numbered.postcode) === cep || lookupText(numbered).includes(phrase))) {
    return { lat: numbered.lat, lng: numbered.lng };
  }
  const sameCep = street.filter((hit) => cep && cepDigits(hit.postcode) === cep);
  if (sameCep.length && clusterDiameterKm(sameCep) <= STREET_CLUSTER_MAX_KM) {
    return { lat: sameCep[0].lat, lng: sameCep[0].lng };
  }
  if (street.length && clusterDiameterKm(street) <= STREET_CLUSTER_MAX_KM) {
    const nearestCep = [...street].sort((a, b) => {
      const da = cep ? Math.abs(Number(cepDigits(a.postcode) || "0") - Number(cep)) : 0;
      const db = cep ? Math.abs(Number(cepDigits(b.postcode) || "0") - Number(cep)) : 0;
      return da - db;
    })[0];
    return { lat: nearestCep.lat, lng: nearestCep.lng };
  }
  return null;
}

function splitSemi(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function cell(value: string | undefined): string {
  return (value ?? "").trim().replace(/^"|"$/g, "");
}

export function cnesHeaderIndex(line: string): Map<string, number> {
  return new Map(splitSemi(line.replace(/^\uFEFF/, "")).map((header, i) => [cell(header), i]));
}

export function draftFromCnesLine(
  header: ReadonlyMap<string, number>,
  line: string,
  cities: Readonly<Record<string, readonly [string, string]>>,
): CnesHospitalDraft | null {
  const cols = splitSemi(line);
  return hospitalFromColumns((name) => cell(cols[header.get(name) ?? -1]), cities);
}

/**
 * Lê o CSV de estabelecimentos do CNES e fica só com hospital e pronto-socorro ativos.
 * Latitude do arquivo não entra: o mapa do celular lê o endereço.
 */
export function parseCnesHospitalCsv(
  text: string,
  cities: Readonly<Record<string, readonly [string, string]>>,
): CnesHospitalDraft[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerLine = lines.find((line) => line.trim().length > 0);
  if (!headerLine) return [];
  const header = cnesHeaderIndex(headerLine);
  const out: CnesHospitalDraft[] = [];
  const seen = new Set<string>();
  let started = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!started) {
      started = true;
      continue;
    }
    const draft = draftFromCnesLine(header, line, cities);
    if (!draft || seen.has(draft.cnes)) continue;
    seen.add(draft.cnes);
    out.push(draft);
  }
  return out;
}

export function hospitalFromColumns(
  at: (name: string) => string,
  cities: Readonly<Record<string, readonly [string, string]>>,
): CnesHospitalDraft | null {
  const unitLabel = hospitalUnitLabel(at("TP_UNIDADE"));
  if (!unitLabel) return null;
  if (at("CO_MOTIVO_DESAB")) return null;
  const care = hospitalCare(at("CO_NATUREZA_JUR"));
  if (!care) return null;
  const cnes = cnesDigits(at("CO_CNES"));
  if (!cnes) return null;
  const ibge = at("CO_IBGE").replace(/\D/g, "").slice(0, 6);
  const city = cities[ibge];
  if (!city) return null;
  const address = hospitalAddressLine(at("NO_LOGRADOURO"), at("NU_ENDERECO"), at("NO_BAIRRO"));
  if (!address) return null;
  const name = (at("NO_FANTASIA") || at("NO_RAZAO_SOCIAL") || "Hospital").replace(/\s+/g, " ").trim();
  return {
    cnes,
    name,
    address,
    city: city[0],
    cityNorm: normalizePlace(city[0]),
    state: city[1],
    cep: cepDigits(at("CO_CEP")),
    phone: hospitalPhoneDigits(at("NU_TELEFONE")),
    care,
    attendsSus: hospitalAttendsSus(at("CO_AMBULATORIAL_SUS")),
    unitLabel,
  };
}

export function parseHospitalPinList(raw: string | null | undefined, limit = MAP_LOCATE_LIMIT): HospitalPin[] {
  const out: HospitalPin[] = [];
  const seen = new Set<string>();
  for (const part of String(raw ?? "").split(",")) {
    const match = PIN_PART.exec(part.trim());
    if (!match || seen.has(match[1])) continue;
    const lat = Number(match[2]);
    const lng = Number(match[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    seen.add(match[1]);
    out.push({ cnes: match[1], lat, lng });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatHospitalPinList(pins: HospitalPin[]): string {
  return pins
    .slice(0, MAP_LOCATE_LIMIT)
    .map((pin) => `${cnesDigits(pin.cnes)}:${pin.lat}:${pin.lng}`)
    .filter((part) => PIN_PART.test(part))
    .join(",");
}

/** CNES da lista, dentro do Brasil, fora do centro do município e a até 30 km do GPS. */
export function acceptHospitalPin(input: {
  pin: HospitalPin;
  originLat: number;
  originLng: number;
  allowed: Iterable<string>;
}): HospitalPin | null {
  const cnes = cnesDigits(input.pin.cnes);
  if (!cnes) return null;
  let allowed = false;
  for (const item of input.allowed) {
    if (cnesDigits(item) === cnes) {
      allowed = true;
      break;
    }
  }
  if (!allowed) return null;
  const point = acceptMapPoint({ lat: input.pin.lat, lng: input.pin.lng, locationType: "ROOFTOP" });
  if (!point) return null;
  if (haversineKm(input.originLat, input.originLng, point.lat, point.lng) > MAP_PIN_MAX_KM) return null;
  return { cnes, lat: point.lat, lng: point.lng };
}

export function rankHospitals(
  originLat: number,
  originLng: number,
  rows: Array<Omit<RankedHospital, "distanceKm" | "driveMinutes" | "categoryPhrase">>,
): { radiusKm: number; hospitals: RankedHospital[] } | null {
  const measured = rows
    .filter((row) =>
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude) &&
      !isMunicipalCentroid(row.latitude, row.longitude))
    .map((row) => {
      const distanceKm = haversineKm(originLat, originLng, row.latitude, row.longitude);
      return {
        ...row,
        categoryPhrase: hospitalCategoryPhrase(row.care, row.attendsSus),
        distanceKm,
        driveMinutes: estimateDriveMinutes(distanceKm),
      };
    });
  const step = pickRadiusStep(measured.map((row) => row.distanceKm));
  if (step === null) return null;
  const hospitals = measured
    .filter((row) => row.distanceKm <= step)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!hospitals.length) return null;
  return { radiusKm: step, hospitals };
}

export function hospitalCatalogPhrase(total: number, inCity: number, cityLabel: string | null): string {
  const shown = Math.max(0, Math.round(total)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (total <= 0) return "A lista de hospitais ainda não está no sistema.";
  const where = (cityLabel ?? "").trim();
  if (!where) return `Lista no sistema: ${shown} hospitais.`;
  if (inCity <= 0) return `Lista no sistema: ${shown} hospitais. ${where} não tem hospital nesta lista.`;
  return `Lista no sistema: ${shown} hospitais, ${inCity} em ${where}.`;
}

export function noHospitalMessage(radiusKm: number): string {
  return `Nenhum hospital em até ${radiusKm} km.`;
}
