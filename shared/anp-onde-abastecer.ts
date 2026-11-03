/**
 * Referência ANP para a tela "Onde abastecer".
 * Satélite: não calcula custo e não grava abastecimento.
 * A nota oficial 0–5 não é inventada. Sem ela, o texto fala só do histórico de infração.
 */

export const ONDE_ABASTECER_STATION_KEY = "torres.ondeAbastecer.stationName";
/** `not_loaded` é a base ainda não sincronizada. Os outros são raio, cidade ou CEP ainda sem coordenada. */
export type EmptyReason = "not_loaded" | "no_city" | "no_station" | "locating";
export type OndeAbastecerEmptyReason = EmptyReason;

/**
 * Âmbar só com resposta vazia e base ainda não sincronizada.
 * `mode === "empty"` sozinho também é cidade, raio ou CEP em localização.
 * Sem `emptyReason` (resposta antiga), cai na frase que a API já usava.
 * Cartão com preço ou posto mais próximo nunca é âmbar.
 */
export function isAnpBaseNotLoaded(payload: {
  mode: "priced" | "nearest" | "empty";
  emptyReason?: EmptyReason | null;
  message?: string | null;
} | null | undefined): boolean {
  if (!payload || payload.mode !== "empty") return false;
  if (payload.emptyReason) return payload.emptyReason === "not_loaded";
  return Boolean(payload.message?.includes("ainda não foi carregado"));
}

/**
 * Cidade sem nenhuma linha.
 * Zero postos com qualidade conhecida no país = a carga ainda não rodou (`not_loaded`).
 * Base já carregada e esta cidade sem posto = `no_station`.
 */
export function emptyReasonForUnmatchedCity(qualityKnownStations: number): "not_loaded" | "no_station" {
  return qualityKnownStations > 0 ? "no_station" : "not_loaded";
}

/** Endereço da pesquisa ANP para achar o ponto do posto. O CEP sozinho, em cidade grande, cai no centro do município. */
export function stationGeocodeQuery(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  return [address, city, state, "Brasil"]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

/** Segunda busca, com o nome de rua que o primeiro geocoder reconheceu e o número da ANP. */
export function streetGeocodeQuery(
  houseNumber: string | null | undefined,
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  const line = [houseNumber, street]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  return [line, city, state, "Brasil"].filter(Boolean).join(", ");
}

/** Número no endereço da ANP (`RUA X, 100 - BAIRRO`). Sem número, a busca não prova o ponto. */
export function addressHouseNumber(address: string | null | undefined): string | null {
  const head = (address ?? "").split(" - ")[0] ?? "";
  const match = head.match(/(\d{1,6})\s*$/);
  return match ? match[1] : null;
}

export function cepDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

/**
 * Coordenada gravada. `null` e string vazia não são número:
 * `Number(null)` e `Number("")` valem 0, o Golfo da Guiné, e fariam o posto parecer a milhares de km.
 */
export function coordinateOrNull(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Faixa numérica de CEP em volta do usuário. Não é quilometragem: só escolhe quem localizar primeiro. */
export const ONDE_ABASTECER_CEP_BAND = 80_000;

export function cepDistance(userCep: string, stationCep: string): number {
  const user = cepDigits(userCep);
  const station = cepDigits(stationCep);
  if (!user || !station) return Number.POSITIVE_INFINITY;
  return Math.abs(Number(user) - Number(station));
}

export function isCepInBand(userCep: string, stationCep: string, band = ONDE_ABASTECER_CEP_BAND): boolean {
  const distance = cepDistance(userCep, stationCep);
  return Number.isFinite(distance) && distance <= band;
}

export function cepBandBounds(userCep: string, band = ONDE_ABASTECER_CEP_BAND): { from: string; to: string } | null {
  const cep = cepDigits(userCep);
  if (!cep) return null;
  const n = Number(cep);
  const from = Math.max(0, n - band);
  const to = Math.min(99_999_999, n + band);
  return {
    from: String(from).padStart(8, "0"),
    to: String(to).padStart(8, "0"),
  };
}

export function orderCepsByProximity(userCep: string, ceps: Iterable<string>): string[] {
  return [...new Set(ceps)].sort((a, b) => cepDistance(userCep, a) - cepDistance(userCep, b) || a.localeCompare(b));
}

/**
 * `no_station` só quando não sobrou CEP da faixa para localizar.
 * CEP ainda sem consulta fica em `locating`.
 */
export function emptyReasonAfterGeo(unresolvedCeps: number): "locating" | "no_station" {
  return unresolvedCeps > 0 ? "locating" : "no_station";
}

/** Centro que a BrasilAPI repete para vários CEPs de São Paulo. Não é o posto. */
export const SAO_PAULO_MUNICIPAL_CENTROID = { lat: -23.5475, lng: -46.63611 };

export function isMunicipalCentroid(lat: number, lng: number): boolean {
  return Math.abs(lat - SAO_PAULO_MUNICIPAL_CENTROID.lat) < 0.0002
    && Math.abs(lng - SAO_PAULO_MUNICIPAL_CENTROID.lng) < 0.0002;
}

export type GeoPrecision = "street" | "coarse";

/**
 * Ponto com o número da ANP pode entrar no raio.
 * Photon sem número cola a avenida inteira num extremo e não serve para excluir o posto.
 * O centro do município também não.
 */
export function classifyFoundPoint(input: {
  queryHouseNumber: string | null;
  foundHouseNumber: string | null;
  lat: number;
  lng: number;
}): GeoPrecision | "reject" {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return "reject";
  if (isMunicipalCentroid(input.lat, input.lng)) return "reject";
  if (!input.queryHouseNumber) return "street";
  const found = (input.foundHouseNumber ?? "").replace(/\D/g, "");
  const wanted = input.queryHouseNumber.replace(/\D/g, "");
  if (found && Number(found) === Number(wanted)) return "street";
  return "coarse";
}

/** Primeiro degrau. A régua sobe só quando este raio não tem posto localizado. */
export const ONDE_ABASTECER_RADIUS_KM = 5;
/** Degraus da régua, em km. O último é o teto da busca. */
export const ONDE_ABASTECER_RADIUS_STEPS_KM = [5, 10, 15, 25] as const;

export function maxRadiusStepKm(steps: readonly number[] = ONDE_ABASTECER_RADIUS_STEPS_KM): number {
  return steps[steps.length - 1] ?? ONDE_ABASTECER_RADIUS_KM;
}

/** Menor degrau que ainda alcança esta distância. Passou do teto, null. */
export function radiusStepForDistance(distanceKm: number, steps: readonly number[] = ONDE_ABASTECER_RADIUS_STEPS_KM): number | null {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  for (const step of steps) {
    if (distanceKm <= step) return step;
  }
  return null;
}

/** Menor degrau que já contém algum posto. Sem posto na régua, null. */
export function pickRadiusStep(distancesKm: number[], steps: readonly number[] = ONDE_ABASTECER_RADIUS_STEPS_KM): number | null {
  let best: number | null = null;
  for (const distance of distancesKm) {
    const step = radiusStepForDistance(distance, steps);
    if (step === null) continue;
    if (best === null || step < best) best = step;
  }
  return best;
}

export function noStationMessage(radiusKm: number): string {
  return `Nenhum posto com histórico limpo em até ${radiusKm} km.`;
}

/** Contagem da lista ANP já gravada. Satélite: não é custo de abastecimento. */
export interface AnpCatalog {
  stations: number;
  known: number;
  withPoint: number;
  /** Postos cujo município é o do GPS. A faixa de CEP vizinha não entra aqui. */
  inCity: number;
  inPlace: number;
  clean: number;
}

function ptInt(value: number): string {
  return Math.max(0, Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Frase que confirma que a lista está no sistema. O recorte é a cidade do GPS, não a faixa de CEP. */
export function catalogPhrase(
  catalog: Pick<AnpCatalog, "stations" | "known" | "inCity">,
  cityLabel: string | null,
): string {
  const total = ptInt(catalog.stations);
  if (catalog.stations <= 0) return "A lista de postos ainda não está no sistema.";
  if (catalog.known <= 0) return `Lista no sistema: ${total} postos. Histórico de qualidade ainda não entrou.`;
  const where = (cityLabel ?? "").trim();
  if (!where) return `Lista no sistema: ${total} postos.`;
  if (catalog.inCity <= 0) return `Lista no sistema: ${total} postos. ${where} não tem posto na pesquisa da ANP.`;
  return `Lista no sistema: ${total} postos, ${ptInt(catalog.inCity)} em ${where}.`;
}
export const ANP_YEAR_PAGE = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan";
export const ANP_FISCAL_XLSX_URL =
  "https://www.gov.br/anp/pt-br/centrais-de-conteudo/paineis-dinamicos-da-anp/arquivos-dados-brutos-do-painel-dinamico-da-fiscalizacao-do-abastecimento-da-sfi/dados-fisc-a-partir-2019.xlsx";

export type AnpProduct = "GASOLINA" | "ETANOL";

export interface AnpPriceRow {
  cnpj: string;
  fuelDate: string;
  productName: AnpProduct;
  price: number;
  stationName: string;
  address: string;
  city: string;
  cityNorm: string;
  state: string;
  cep: string;
}

export interface StationCandidate {
  cnpj: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  anpScore: number | null;
  gasolinePrice: number | null;
  ethanolPrice: number | null;
  researchDate: string | null;
}

export interface RankedStation extends StationCandidate {
  driveMinutes: number;
  minPrice: number | null;
  researchLabel: string | null;
  qualityPhrase: string;
  priced: boolean;
}

export interface RankResult {
  mode: "priced" | "nearest" | "empty";
  message: string | null;
  stations: RankedStation[];
}

export interface FiscalEvent {
  cnpj: string;
  date: string;
  procedure: string;
}

export interface FiscalFlags {
  hasQualityInfraction: boolean;
  isInterdicted: boolean;
}

export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizePlace(value: string): string {
  return fold(value).toUpperCase();
}

/** CNPJ com 14 dígitos. CPF (11) fica de fora. Planilha numérica perde o zero à esquerda. */
export function digitsCnpj(value: string | number | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return null;
  if (digits.length >= 12 && digits.length <= 14) return digits.padStart(14, "0");
  return null;
}

export function productKey(raw: string): AnpProduct | null {
  const p = fold(raw).toUpperCase();
  if (!p || p.includes("ADITIV")) return null;
  if (p === "GASOLINA" || p.startsWith("GASOLINA ")) return "GASOLINA";
  if (p === "ETANOL" || p.startsWith("ETANOL ") || p === "ETANOL") return "ETANOL";
  return null;
}

export function parseBrDecimal(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

export function parseFlexibleDate(raw: string): string | null {
  const text = raw.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d+(\.\d+)?$/.test(text)) return excelSerialToIso(Number(text));
  return null;
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function addYearsIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCFullYear(dt.getUTCFullYear() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Semana da pesquisa ANP: domingo a sábado da data da coleta. */
export function researchWeekLabel(isoDate: string): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(dt);
  start.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (x: Date) => `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)} a ${fmt(end)}`;
}

/** Estimativa urbana a 25 km/h. A tela diz "cerca de". Não é trânsito ao vivo. */
export function estimateDriveMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 2;
  return Math.max(2, Math.round((distanceKm / 25) * 60));
}

export function qualityPhrase(anpScore: number | null): string {
  if (anpScore === 5) return "Nota ANP 5. Sem infração de qualidade nos últimos 2 anos.";
  return "Sem infração de qualidade registrada nos últimos 2 anos.";
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoHit {
  lat: number;
  lng: number;
  houseNumber?: string | null;
  postcode?: string | null;
}

/**
 * Diâmetro máximo, em km, para aceitar um grupo de pontos do mesmo CEP.
 * Avenida longa espalha os acertos por vários quilômetros e não vira destino.
 */
export const STREET_CLUSTER_MAX_KM = 1.5;

function houseNumberValue(value: string | null | undefined): number | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function clusterDiameterKm(hits: GeoHit[]): number {
  let max = 0;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      max = Math.max(max, haversineKm(hits[i].lat, hits[i].lng, hits[j].lat, hits[j].lng));
    }
  }
  return max;
}

/**
 * Ponto que pode ir para o Waze.
 * Número igual ao da ANP entra.
 * Sem esse número, só entra um grupo do mesmo CEP com diâmetro curto: o número mais próximo.
 * Centro do município e avenida espalhada ficam de fora.
 */
export function pickUsablePoint(input: {
  hits: GeoHit[];
  queryHouseNumber: string | null;
  stationCep: string | null;
}): { lat: number; lng: number } | null {
  const hits = input.hits.filter((hit) =>
    Number.isFinite(hit.lat) && Number.isFinite(hit.lng) && !isMunicipalCentroid(hit.lat, hit.lng));
  const wanted = houseNumberValue(input.queryHouseNumber);
  if (wanted !== null) {
    const exact = hits.find((hit) => houseNumberValue(hit.houseNumber) === wanted);
    if (exact) return { lat: exact.lat, lng: exact.lng };
  }
  const cep = cepDigits(input.stationCep);
  if (!cep) return null;
  const sameCep = hits.filter((hit) => cepDigits(hit.postcode) === cep);
  if (!sameCep.length) return null;
  const numbered = sameCep.filter((hit) => houseNumberValue(hit.houseNumber) !== null);
  const cluster = numbered.length ? numbered : sameCep;
  if (clusterDiameterKm(cluster) > STREET_CLUSTER_MAX_KM) return null;
  if (wanted !== null && numbered.length) {
    const nearest = [...numbered].sort((a, b) => {
      const da = Math.abs((houseNumberValue(a.houseNumber) as number) - wanted);
      const db = Math.abs((houseNumberValue(b.houseNumber) as number) - wanted);
      return da - db;
    })[0];
    return { lat: nearest.lat, lng: nearest.lng };
  }
  return { lat: cluster[0].lat, lng: cluster[0].lng };
}

/** Brasil continental, com folga. Ponto fora daqui não é posto da ANP. */
export function isInsideBrazil(lat: number, lng: number): boolean {
  return lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28;
}

/**
 * Ponto que o mapa do celular leu a partir do endereço.
 * Telhado e interpolação de quadra entram.
 * Centro geométrico ou resultado parcial só entram se a janela do mapa tiver até 1,5 km.
 * Aproximado e o centro do município ficam de fora. Modelo de texto não inventa coordenada.
 */
export function acceptMapPoint(input: {
  lat: number;
  lng: number;
  locationType: string | null | undefined;
  partialMatch?: boolean;
  viewportDiagonalKm?: number | null;
}): { lat: number; lng: number } | null {
  const { lat, lng } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInsideBrazil(lat, lng)) return null;
  if (isMunicipalCentroid(lat, lng)) return null;
  const type = String(input.locationType ?? "").trim().toUpperCase();
  const diagonal = input.viewportDiagonalKm;
  const tight = diagonal != null && Number.isFinite(diagonal) && diagonal >= 0 && diagonal <= STREET_CLUSTER_MAX_KM;
  if (type === "ROOFTOP" || type === "RANGE_INTERPOLATED") {
    if (input.partialMatch && !tight) return null;
    return { lat, lng };
  }
  if (type === "GEOMETRIC_CENTER" && tight) return { lat, lng };
  return null;
}

/** O pino do mapa precisa estar perto do GPS. A régua continua em 25 km. */
export const MAP_PIN_MAX_KM = 30;
/** Endereços que o celular lê numa abertura. O mesmo CEP guarda um pino só. */
export const MAP_LOCATE_LIMIT = 8;

export interface StationToLocate {
  cnpj: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  cep: string;
  query: string;
  houseNumber: string | null;
  anpScore: number | null;
  gasolinePrice: number | null;
  ethanolPrice: number | null;
  researchDate: string | null;
}

export interface ClientPin {
  cep: string;
  lat: number;
  lng: number;
}

const PIN_PART = /^(\d{8}):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/;

export function parsePinList(raw: string | null | undefined, limit = MAP_LOCATE_LIMIT): ClientPin[] {
  const out: ClientPin[] = [];
  const seen = new Set<string>();
  for (const part of String(raw ?? "").split(",")) {
    const match = PIN_PART.exec(part.trim());
    if (!match || seen.has(match[1])) continue;
    const lat = Number(match[2]);
    const lng = Number(match[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    seen.add(match[1]);
    out.push({ cep: match[1], lat, lng });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatPinList(pins: ClientPin[]): string {
  return pins
    .slice(0, MAP_LOCATE_LIMIT)
    .map((pin) => `${cepDigits(pin.cep)}:${pin.lat}:${pin.lng}`)
    .filter((part) => PIN_PART.test(part))
    .join(",");
}

/** CEP da lista limpa, dentro do Brasil, fora do centro do município e a até 30 km do GPS. */
export function acceptClientPin(input: {
  pin: ClientPin;
  originLat: number;
  originLng: number;
  allowedCeps: Iterable<string>;
}): ClientPin | null {
  const cep = cepDigits(input.pin.cep);
  if (cep.length !== 8) return null;
  let allowed = false;
  for (const item of input.allowedCeps) {
    if (cepDigits(item) === cep) {
      allowed = true;
      break;
    }
  }
  if (!allowed) return null;
  const point = acceptMapPoint({ lat: input.pin.lat, lng: input.pin.lng, locationType: "ROOFTOP" });
  if (!point) return null;
  if (haversineKm(input.originLat, input.originLng, point.lat, point.lng) > MAP_PIN_MAX_KM) return null;
  return { cep, lat: point.lat, lng: point.lng };
}

/** Régua em cima de coordenadas já aceitas. Sem posto até 25 km, null. */
export function rankFromCoordinates(
  originLat: number,
  originLng: number,
  rows: Array<Omit<StationCandidate, "distanceKm">>,
): (RankResult & { radiusKm: number }) | null {
  const measured = rows
    .filter((row) =>
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude) &&
      !isMunicipalCentroid(row.latitude, row.longitude))
    .map((row) => ({
      ...row,
      distanceKm: haversineKm(originLat, originLng, row.latitude, row.longitude),
    }));
  const step = pickRadiusStep(measured.map((row) => row.distanceKm));
  if (step === null) return null;
  return { ...rankStations(measured, step), radiusKm: step };
}

function splitCsvLine(line: string): string[] {
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

function headerIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[fold(h)] = i;
  });
  return idx;
}

function cell(cols: string[], idx: Record<string, number>, name: string): string {
  const i = idx[name];
  return i === undefined ? "" : (cols[i] ?? "").trim();
}

export function parseAnpPriceCsv(text: string): AnpPriceRow[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const idx = headerIndex(splitCsvLine(lines[0]));
  const rows: AnpPriceRow[] = [];
  const seen = new Set<string>();
  for (let n = 1; n < lines.length; n++) {
    const cols = splitCsvLine(lines[n]);
    const product = productKey(cell(cols, idx, "produto"));
    const cnpj = digitsCnpj(cell(cols, idx, "cnpj da revenda"));
    const fuelDate = parseFlexibleDate(cell(cols, idx, "data da coleta"));
    const price = parseBrDecimal(cell(cols, idx, "valor de venda"));
    if (!product || !cnpj || !fuelDate || price === null) continue;
    const key = `${cnpj}|${fuelDate}|${product}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const city = cell(cols, idx, "municipio");
    const street = cell(cols, idx, "nome da rua");
    const number = cell(cols, idx, "numero rua");
    const neighborhood = cell(cols, idx, "bairro");
    const address = [street, number].filter(Boolean).join(", ") + (neighborhood ? ` - ${neighborhood}` : "");
    rows.push({
      cnpj,
      fuelDate,
      productName: product,
      price,
      stationName: cell(cols, idx, "revenda"),
      address: address.trim(),
      city,
      cityNorm: normalizePlace(city),
      state: cell(cols, idx, "estado - sigla").toUpperCase(),
      cep: cell(cols, idx, "cep").replace(/\D/g, "").slice(0, 8),
    });
  }
  return rows;
}

export function latestPricesByStation(rows: Pick<AnpPriceRow, "cnpj" | "fuelDate" | "productName" | "price">[]): Map<string, { gasoline: number | null; ethanol: number | null; researchDate: string | null }> {
  const latest = new Map<string, { gasoline: number | null; ethanol: number | null; gasDate: string; ethDate: string }>();
  const sorted = [...rows].sort((a, b) => a.fuelDate.localeCompare(b.fuelDate));
  for (const row of sorted) {
    const cur = latest.get(row.cnpj) ?? { gasoline: null, ethanol: null, gasDate: "", ethDate: "" };
    if (row.productName === "GASOLINA" && row.fuelDate >= cur.gasDate) {
      cur.gasoline = row.price;
      cur.gasDate = row.fuelDate;
    }
    if (row.productName === "ETANOL" && row.fuelDate >= cur.ethDate) {
      cur.ethanol = row.price;
      cur.ethDate = row.fuelDate;
    }
    latest.set(row.cnpj, cur);
  }
  const out = new Map<string, { gasoline: number | null; ethanol: number | null; researchDate: string | null }>();
  for (const [cnpj, cur] of latest) {
    const dates = [cur.gasDate, cur.ethDate].filter(Boolean).sort();
    out.set(cnpj, {
      gasoline: cur.gasoline,
      ethanol: cur.ethanol,
      researchDate: dates.length ? dates[dates.length - 1] : null,
    });
  }
  return out;
}

export function rankStations(list: StationCandidate[], radiusKm = ONDE_ABASTECER_RADIUS_KM): RankResult {
  const stations = list
    .filter((s) => Number.isFinite(s.distanceKm) && s.distanceKm <= radiusKm)
    .map((s): RankedStation => {
      const priced = s.gasolinePrice !== null && s.ethanolPrice !== null;
      return {
        ...s,
        priced,
        minPrice: priced ? Math.min(s.gasolinePrice as number, s.ethanolPrice as number) : null,
        driveMinutes: estimateDriveMinutes(s.distanceKm),
        researchLabel: s.researchDate ? researchWeekLabel(s.researchDate) : null,
        qualityPhrase: qualityPhrase(s.anpScore),
      };
    })
    .sort((a, b) => {
      if (a.minPrice !== null && b.minPrice !== null) {
        if (a.minPrice !== b.minPrice) return a.minPrice - b.minPrice;
        return a.distanceKm - b.distanceKm;
      }
      if (a.minPrice !== null) return -1;
      if (b.minPrice !== null) return 1;
      return a.distanceKm - b.distanceKm;
    });

  if (stations.length === 0) {
    return { mode: "empty", message: noStationMessage(radiusKm), stations: [] };
  }
  return {
    mode: stations[0].priced ? "priced" : "nearest",
    message: stations[0].priced ? null : "Preço desta semana ainda não pesquisado.",
    stations,
  };
}

export function isFuelQualityProcedure(procedure: string): boolean {
  const t = fold(procedure);
  if (!t) return false;
  if (t.includes("lubrificante") || t.includes("aviacao")) return false;
  if (t.includes("coleta de amostra") && !t.includes("reprov")) return false;
  const aboutFuel = /gasolina|etanol|diesel|biodiesel|qualidade dos combust|marcador|solvente/.test(t);
  if (!aboutFuel) return false;
  return /reprov|fora das especific|qualidade dos combust|marcador|solvente/.test(t);
}

export function isDesinterdiction(procedure: string): boolean {
  return fold(procedure).includes("desinterdicao");
}

export function isTotalInterdiction(procedure: string): boolean {
  const t = fold(procedure);
  if (t.includes("desinterdicao")) return false;
  return t.includes("interdicao total") || t.includes("reinterdicao total");
}

export function summarizeFiscal(events: FiscalEvent[], asOfIso: string): Map<string, FiscalFlags> {
  const cutoff = addYearsIso(asOfIso, -2);
  const acc = new Map<string, { quality: boolean; interdict: string; clear: string }>();
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.cnpj.localeCompare(b.cnpj));
  for (const ev of ordered) {
    const cur = acc.get(ev.cnpj) ?? { quality: false, interdict: "", clear: "" };
    if (ev.date >= cutoff && isFuelQualityProcedure(ev.procedure)) cur.quality = true;
    if (isTotalInterdiction(ev.procedure) && ev.date >= cur.interdict) cur.interdict = ev.date;
    if (isDesinterdiction(ev.procedure) && ev.date >= cur.clear) cur.clear = ev.date;
    if (cur.quality || cur.interdict || cur.clear) acc.set(ev.cnpj, cur);
  }
  const out = new Map<string, FiscalFlags>();
  for (const [cnpj, cur] of acc) {
    const isInterdicted = Boolean(cur.interdict) && (!cur.clear || cur.interdict >= cur.clear);
    if (!cur.quality && !isInterdicted) continue;
    out.set(cnpj, { hasQualityInfraction: cur.quality, isInterdicted });
  }
  return out;
}

export function latestGasolinaEtanolHref(html: string, pageUrl: string): string | null {
  const hrefs = html.match(/href="([^"]*gasolina[^"]*etanol[^"]*)"/gi) ?? [];
  let best: { month: number; href: string } | null = null;
  for (const raw of hrefs) {
    const href = raw.replace(/^href="/i, "").replace(/"$/, "").replace(/&amp;/g, "&");
    const base = href.split("/").pop() ?? href;
    const monthMatch = /^(\d{2})-/.exec(base.replace(/\/view\/?$/, ""));
    const month = monthMatch ? Number(monthMatch[1]) : 0;
    if (!best || month >= best.month) best = { month, href };
  }
  if (!best) return null;
  const absolute = best.href.startsWith("http") ? best.href : new URL(best.href, pageUrl).toString();
  const clean = absolute.replace(/\/view\/?$/, "");
  return clean.endsWith("/@@download/file") ? clean : `${clean}/@@download/file`;
}

export function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
