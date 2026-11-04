import { supabaseAdmin } from "../supabase";
import { log } from "./logger";
import {
  ANP_FISCAL_XLSX_URL,
  ANP_YEAR_PAGE,
  acceptClientPin,
  addressHouseNumber,
  cepBandBounds,
  cepDigits,
  coordinateOrNull,
  emptyReasonAfterGeo,
  emptyReasonForUnmatchedCity,
  haversineKm,
  latestGasolinaEtanolHref,
  latestPricesByStation,
  MAP_LOCATE_LIMIT,
  maxRadiusStepKm,
  noStationMessage,
  normalizePlace,
  orderCepsByProximity,
  parseAnpPriceCsv,
  parsePinList,
  pickRadiusStep,
  pickUsablePoint,
  rankStations,
  stationGeocodeQuery,
  streetGeocodeQuery,
  type AnpCatalog,
  type AnpPriceRow,
  type ClientPin,
  type OndeAbastecerEmptyReason,
  type RankResult,
  type StationCandidate,
  type StationToLocate,
} from "@shared/anp-onde-abastecer";
import { fiscalFlagsFromXlsx } from "./anp-fiscal-xlsx";

const UA = "TorresSeguranca/onde-abastecer";
const GEO_BUDGET = 8;
const NOMINATIM_BUDGET = 0;

export interface OndeAbastecerPayload extends RankResult {
  radiusKm: number;
  city: string | null;
  cityLabel: string | null;
  state: string | null;
  pendingGeo: number;
  emptyReason: OndeAbastecerEmptyReason | null;
  origin: { lat: number; lng: number };
  catalog: AnpCatalog;
  /** Endereços limpos ainda sem coordenada, para o mapa do celular ler. */
  toLocate: StationToLocate[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,text/csv,*/*" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function discoverPriceCsvUrl(year = new Date().getFullYear()): Promise<string> {
  const pages = [0, 20, 40].map((start) =>
    start === 0 ? `${ANP_YEAR_PAGE}/${year}` : `${ANP_YEAR_PAGE}/${year}?b_start:int=${start}`,
  );
  let html = "";
  for (const page of pages) {
    try {
      html += await fetchText(page);
    } catch (err: any) {
      log(`[anp] listagem ${page}: ${err.message}`, "anp");
    }
  }
  const href = latestGasolinaEtanolHref(html, `${ANP_YEAR_PAGE}/${year}/`);
  if (!href) throw new Error(`Nenhum CSV de gasolina e etanol em ${year}`);
  return href;
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function importAnpPrices(csvText: string): Promise<{ prices: number; stations: number }> {
  const rows = parseAnpPriceCsv(csvText);
  const stations = new Map<string, AnpPriceRow>();
  for (const row of rows) stations.set(row.cnpj, row);
  const now = new Date().toISOString();
  await upsertChunks(
    "anp_station_quality",
    [...stations.values()].map((row) => ({
      cnpj: row.cnpj,
      station_name: row.stationName || null,
      address: row.address || null,
      city: row.city || null,
      city_norm: row.cityNorm || null,
      state: row.state || null,
      cep: row.cep || null,
      updated_at: now,
    })),
    "cnpj",
  );
  await upsertChunks(
    "anp_fuel_prices",
    rows.map((row) => ({
      cnpj: row.cnpj,
      fuel_date: row.fuelDate,
      product_name: row.productName,
      price: row.price,
    })),
    "cnpj,fuel_date,product_name",
  );
  return { prices: rows.length, stations: stations.size };
}

export async function importAnpQuality(asOfIso: string, onlyUnknown = false): Promise<{ flagged: number }> {
  const buf = await fetchBuffer(ANP_FISCAL_XLSX_URL);
  const flags = fiscalFlagsFromXlsx(buf, asOfIso);
  if (flags.size === 0) {
    throw new Error("Fiscalização sem eventos reconhecidos. A carga de qualidade foi interrompida.");
  }
  let query = supabaseAdmin.from("anp_station_quality").select("cnpj").limit(20000);
  if (onlyUnknown) query = query.eq("quality_known", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const existing = new Set((data ?? []).map((row: { cnpj: string }) => row.cnpj));
  const now = new Date().toISOString();
  const bad = [...flags.entries()]
    .filter(([cnpj]) => existing.has(cnpj))
    .map(([cnpj, flag]) => ({
      cnpj,
      has_quality_infraction_last_2_years: flag.hasQualityInfraction,
      is_interdicted: flag.isInterdicted,
      quality_known: true,
      updated_at: now,
    }));
  if (bad.length) await upsertChunks("anp_station_quality", bad, "cnpj");
  const badSet = new Set(bad.map((row) => row.cnpj));
  const clean = [...existing]
    .filter((cnpj) => !badSet.has(cnpj))
    .map((cnpj) => ({
      cnpj,
      has_quality_infraction_last_2_years: false,
      is_interdicted: false,
      quality_known: true,
      updated_at: now,
    }));
  if (clean.length) await upsertChunks("anp_station_quality", clean, "cnpj");
  return { flagged: bad.length };
}

export async function syncAnpReference(asOfIso = new Date().toISOString().slice(0, 10)): Promise<{ prices: number; stations: number; flagged: number; csvUrl: string }> {
  const csvUrl = await discoverPriceCsvUrl();
  log(`[anp] baixando preços ${csvUrl}`, "anp");
  const csv = await fetchText(csvUrl);
  const imported = await importAnpPrices(csv);
  log(`[anp] preços=${imported.prices} postos=${imported.stations}`, "anp");
  const quality = await importAnpQuality(asOfIso);
  log(`[anp] qualidade marcada em ${quality.flagged} CNPJs`, "anp");
  return { ...imported, flagged: quality.flagged, csvUrl };
}

interface StationRow {
  cnpj: string;
  station_name: string | null;
  address: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  cep: string | null;
  anp_score: number | null;
  has_quality_infraction_last_2_years: boolean | null;
  is_authorized: boolean | null;
  is_interdicted: boolean | null;
  quality_known: boolean | null;
  city_norm: string | null;
  state: string | null;
}

export async function reverseCity(lat: number, lng: number): Promise<{ city: string; label: string; state: string; cep: string } | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const body = await res.json() as { address?: Record<string, string> };
  const address = body.address ?? {};
  const city = address.city || address.town || address.municipality || address.village || "";
  const iso = address["ISO3166-2-lvl4"] || "";
  const state = iso.includes("-") ? iso.split("-").pop() || "" : "";
  if (!city || !state) return null;
  return { city: normalizePlace(city), label: city, state: state.toUpperCase(), cep: cepDigits(address.postcode) };
}

async function nationalCatalog(): Promise<Pick<AnpCatalog, "stations" | "known" | "withPoint">> {
  const [all, known, pointed] = await Promise.all([
    supabaseAdmin.from("anp_station_quality").select("cnpj", { count: "exact", head: true }),
    supabaseAdmin.from("anp_station_quality").select("cnpj", { count: "exact", head: true }).eq("quality_known", true),
    supabaseAdmin.from("anp_station_quality").select("cnpj", { count: "exact", head: true }).not("latitude", "is", null),
  ]);
  if (all.error) throw new Error(all.error.message);
  if (known.error) throw new Error(known.error.message);
  if (pointed.error) throw new Error(pointed.error.message);
  return { stations: all.count ?? 0, known: known.count ?? 0, withPoint: pointed.count ?? 0 };
}

type FoundPoint = { lat: number; lng: number; houseNumber: string | null; street: string | null; postcode: string | null };

async function photonHits(query: string): Promise<FoundPoint[]> {
  if (!query) return [];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return [];
    const body = await res.json() as {
      features?: {
        geometry?: { coordinates?: number[] };
        properties?: { countrycode?: string; housenumber?: string; street?: string; name?: string; postcode?: string };
      }[];
    };
    const hits: FoundPoint[] = [];
    for (const feature of body.features ?? []) {
      if (feature.properties?.countrycode !== "BR") continue;
      const [lng, lat] = feature.geometry?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const props = feature.properties ?? {};
      hits.push({
        lat,
        lng,
        houseNumber: props.housenumber ?? null,
        street: props.street || props.name || null,
        postcode: props.postcode ?? null,
      });
    }
    return hits;
  } catch {
    return [];
  }
}

async function nominatimPoint(query: string): Promise<FoundPoint | null> {
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&addressdetails=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 429 || res.status >= 500) throw new Error(`nominatim ${res.status}`);
  if (!res.ok) return null;
  const body = await res.json() as { lat?: string; lon?: string; address?: { house_number?: string; road?: string; postcode?: string } }[];
  const hit = body[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    houseNumber: hit.address?.house_number ?? null,
    street: hit.address?.road ?? null,
    postcode: hit.address?.postcode ?? null,
  };
}

type CachedPoint = { precision: "street"; lat: number; lng: number } | { precision: "coarse" };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeCeps(
  ceps: string[],
  queryByCep: Map<string, string>,
  houseByCep: Map<string, string | null>,
  placeByCep: Map<string, { city: string | null; state: string | null }>,
): Promise<Map<string, CachedPoint>> {
  const unique = [...new Set(ceps.filter((cep) => cep.length === 8))];
  const out = new Map<string, CachedPoint>();
  if (!unique.length) return out;
  const { data } = await supabaseAdmin.from("anp_cep_geo").select("cep, latitude, longitude").in("cep", unique);
  const known = new Set<string>();
  for (const row of data ?? []) {
    known.add(row.cep);
    const lat = row.latitude === null || row.latitude === undefined || row.latitude === "" ? null : Number(row.latitude);
    const lng = row.longitude === null || row.longitude === undefined || row.longitude === "" ? null : Number(row.longitude);
    out.set(
      row.cep,
      lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { precision: "street", lat, lng }
        : { precision: "coarse" },
    );
  }
  const missing = unique.filter((cep) => !known.has(cep)).slice(0, GEO_BUDGET);
  const now = new Date().toISOString();
  const looked: Record<string, unknown>[] = [];
  const needStreet: { cep: string; street: string | null }[] = [];
  const remember = (cep: string, point: CachedPoint) => {
    out.set(cep, point);
    looked.push({
      cep,
      latitude: point.precision === "street" ? point.lat : null,
      longitude: point.precision === "street" ? point.lng : null,
      looked_up_at: now,
    });
  };
  for (let i = 0; i < missing.length; i += 8) {
    const slice = missing.slice(i, i + 8);
    await Promise.all(slice.map(async (cep) => {
      try {
        const house = houseByCep.get(cep) ?? null;
        const hits = await photonHits(queryByCep.get(cep) ?? "");
        const chosen = pickUsablePoint({ hits, queryHouseNumber: house, stationCep: cep });
        if (chosen) {
          remember(cep, { precision: "street", lat: chosen.lat, lng: chosen.lng });
          return;
        }
        needStreet.push({ cep, street: hits.find((hit) => hit.street)?.street ?? null });
      } catch {
        /* falha de rede não conta como CEP consultado */
      }
    }));
  }
  let nominatimUsed = 0;
  for (const item of needStreet) {
    if (nominatimUsed >= NOMINATIM_BUDGET) break;
    if (nominatimUsed > 0) await sleep(1100);
    nominatimUsed += 1;
    try {
      const house = houseByCep.get(item.cep) ?? null;
      const place = placeByCep.get(item.cep);
      const query = item.street
        ? streetGeocodeQuery(house, item.street, place?.city, place?.state)
        : (queryByCep.get(item.cep) ?? "");
      const hit = await nominatimPoint(query);
      if (!hit) {
        remember(item.cep, { precision: "coarse" });
        continue;
      }
      const chosen = pickUsablePoint({
        hits: [hit],
        queryHouseNumber: house,
        stationCep: item.cep,
      });
      if (chosen) remember(item.cep, { precision: "street", lat: chosen.lat, lng: chosen.lng });
      else remember(item.cep, { precision: "coarse" });
    } catch {
      /* a próxima abertura tenta de novo */
    }
  }
  if (looked.length) await upsertChunks("anp_cep_geo", looked, "cep");
  return out;
}

function num(value: number | string | null | undefined): number | null {
  return coordinateOrNull(value);
}

async function pricesFor(cnpjs: string[]) {
  const unique = [...new Set(cnpjs.filter(Boolean))];
  if (!unique.length) return new Map<string, { gasoline: number | null; ethanol: number | null; researchDate: string | null }>();
  const { data: priceRows, error: priceError } = await supabaseAdmin
    .from("anp_fuel_prices")
    .select("cnpj, fuel_date, product_name, price")
    .in("cnpj", unique)
    .in("product_name", ["GASOLINA", "ETANOL"])
    .order("fuel_date", { ascending: false })
    .limit(8000);
  if (priceError) throw new Error(priceError.message);
  return latestPricesByStation(
    (priceRows ?? []).map((row: { cnpj: string; fuel_date: string; product_name: "GASOLINA" | "ETANOL"; price: number | string }) => ({
      cnpj: row.cnpj,
      fuelDate: String(row.fuel_date).slice(0, 10),
      productName: row.product_name,
      price: Number(row.price),
    })),
  );
}

function stationsToLocate(rows: StationRow[], userCep: string): StationRow[] {
  const byCep = new Map<string, StationRow>();
  for (const row of rows) {
    if (num(row.latitude) !== null && num(row.longitude) !== null) continue;
    const cep = cepDigits(row.cep);
    if (cep.length !== 8 || byCep.has(cep)) continue;
    byCep.set(cep, row);
  }
  return orderCepsByProximity(userCep, byCep.keys())
    .slice(0, MAP_LOCATE_LIMIT)
    .map((cep) => byCep.get(cep) as StationRow);
}

async function rememberClientPins(rows: StationRow[], pins: ClientPin[]) {
  if (!pins.length) return;
  const byCep = new Map(pins.map((pin) => [pin.cep, pin]));
  const now = new Date().toISOString();
  const stationUpdates: Record<string, unknown>[] = [];
  const cepUpdates: Record<string, unknown>[] = [];
  const seenCep = new Set<string>();
  for (const row of rows) {
    const pin = byCep.get(cepDigits(row.cep));
    if (!pin || (num(row.latitude) !== null && num(row.longitude) !== null)) continue;
    row.latitude = pin.lat;
    row.longitude = pin.lng;
    stationUpdates.push({ cnpj: row.cnpj, latitude: pin.lat, longitude: pin.lng, updated_at: now });
    if (!seenCep.has(pin.cep)) {
      seenCep.add(pin.cep);
      cepUpdates.push({ cep: pin.cep, latitude: pin.lat, longitude: pin.lng, looked_up_at: now });
    }
  }
  if (cepUpdates.length) await upsertChunks("anp_cep_geo", cepUpdates, "cep");
  if (stationUpdates.length) await upsertChunks("anp_station_quality", stationUpdates, "cnpj").catch(() => {});
}

export async function recommendStations(lat: number, lng: number, pinText = ""): Promise<OndeAbastecerPayload> {
  const base = await nationalCatalog();
  const origin = { lat, lng };
  const empty = (
    emptyReason: OndeAbastecerEmptyReason,
    message: string,
    city: string | null = null,
    state: string | null = null,
    pendingGeo = 0,
    radiusKm = maxRadiusStepKm(),
    cityLabel: string | null = null,
    inPlace = 0,
    clean = 0,
    inCity = 0,
    toLocate: StationToLocate[] = [],
  ): OndeAbastecerPayload => ({
    mode: "empty",
    emptyReason,
    message,
    stations: [],
    radiusKm,
    city,
    cityLabel,
    state,
    pendingGeo,
    origin,
    catalog: { ...base, inCity, inPlace, clean },
    toLocate,
  });

  const place = await reverseCity(lat, lng);
  if (!place) return empty("no_city", "Não foi possível identificar a cidade desta localização.");

  const stationColumns = "cnpj, station_name, address, city, latitude, longitude, cep, anp_score, has_quality_infraction_last_2_years, is_authorized, is_interdicted, quality_known, city_norm, state";
  const { data: cityRows, error } = await supabaseAdmin
    .from("anp_station_quality")
    .select(stationColumns)
    .eq("state", place.state)
    .eq("city_norm", place.city)
    .limit(5000);
  if (error) throw new Error(error.message);
  const bounds = cepBandBounds(place.cep);
  let bandRows: StationRow[] = [];
  if (bounds) {
    const { data: bandData, error: bandError } = await supabaseAdmin
      .from("anp_station_quality")
      .select(stationColumns)
      .eq("state", place.state)
      .gte("cep", bounds.from)
      .lte("cep", bounds.to)
      .limit(500);
    if (bandError) throw new Error(bandError.message);
    bandRows = (bandData ?? []) as StationRow[];
  }
  const inCity = ((cityRows ?? []) as StationRow[]).length;
  const neighborCities = [...new Set(
    bandRows
      .map((row) => row.city_norm)
      .filter((city): city is string => Boolean(city) && city !== place.city),
  )];
  let neighborRows: StationRow[] = [];
  if (neighborCities.length) {
    const { data: neighborData, error: neighborError } = await supabaseAdmin
      .from("anp_station_quality")
      .select(stationColumns)
      .eq("state", place.state)
      .in("city_norm", neighborCities)
      .limit(500);
    if (neighborError) throw new Error(neighborError.message);
    neighborRows = (neighborData ?? []) as StationRow[];
  }
  const pool = new Map<string, StationRow>();
  for (const row of (cityRows ?? []) as StationRow[]) pool.set(row.cnpj, row);
  for (const row of bandRows) pool.set(row.cnpj, row);
  for (const row of neighborRows) pool.set(row.cnpj, row);
  if (pool.size === 0) {
    const reason = emptyReasonForUnmatchedCity(base.known);
    const message = reason === "not_loaded"
      ? "O histórico de qualidade da ANP ainda não foi carregado."
      : noStationMessage(maxRadiusStepKm());
    return empty(reason, message, place.city, place.state, 0, maxRadiusStepKm(), place.label, 0, 0, inCity);
  }
  if ([...pool.values()].every((row) => !row.quality_known)) {
    return empty("not_loaded", "O histórico de qualidade da ANP ainda não foi carregado.", place.city, place.state, 0, maxRadiusStepKm(), place.label, pool.size, 0, inCity);
  }

  const searchKm = maxRadiusStepKm();
  const dLat = searchKm / 111;
  const dLng = searchKm / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const { data: boxRows } = await supabaseAdmin
    .from("anp_station_quality")
    .select("cnpj, station_name, address, city, latitude, longitude, cep, anp_score, has_quality_infraction_last_2_years, is_authorized, is_interdicted, quality_known, city_norm, state")
    .eq("quality_known", true)
    .eq("is_authorized", true)
    .eq("is_interdicted", false)
    .eq("has_quality_infraction_last_2_years", false)
    .gte("latitude", lat - dLat)
    .lte("latitude", lat + dLat)
    .gte("longitude", lng - dLng)
    .lte("longitude", lng + dLng)
    .limit(500);

  const clean = (row: StationRow) =>
    row.quality_known === true &&
    row.is_authorized !== false &&
    row.is_interdicted !== true &&
    row.has_quality_infraction_last_2_years !== true;

  const merged = new Map<string, StationRow>();
  for (const row of pool.values()) if (clean(row)) merged.set(row.cnpj, row);
  for (const row of (boxRows ?? []) as StationRow[]) merged.set(row.cnpj, row);

  const acceptedPins = parsePinList(pinText)
    .map((pin) => acceptClientPin({
      pin,
      originLat: lat,
      originLng: lng,
      allowedCeps: [...merged.values()].map((row) => row.cep),
    }))
    .filter((pin): pin is ClientPin => pin !== null);
  await rememberClientPins([...merged.values()], acceptedPins);

  const streetDistances = () => {
    const distances: number[] = [];
    for (const row of merged.values()) {
      const latitude = num(row.latitude);
      const longitude = num(row.longitude);
      if (latitude === null || longitude === null) continue;
      distances.push(haversineKm(lat, lng, latitude, longitude));
    }
    return distances;
  };

  const pending = [...merged.values()].filter((row) => num(row.latitude) === null || num(row.longitude) === null);
  if (pickRadiusStep(streetDistances()) !== null) {
    pending.length = 0;
  }
  const queryByCep = new Map<string, string>();
  const houseByCep = new Map<string, string | null>();
  const placeByCep = new Map<string, { city: string | null; state: string | null }>();
  const blocking: string[] = [];
  for (const row of pending) {
    const cep = cepDigits(row.cep);
    if (!cep || queryByCep.has(cep)) continue;
    blocking.push(cep);
    queryByCep.set(cep, stationGeocodeQuery(row.address, row.city || row.city_norm, row.state));
    houseByCep.set(cep, addressHouseNumber(row.address));
    placeByCep.set(cep, { city: row.city || row.city_norm, state: row.state });
  }
  const ordered = orderCepsByProximity(place.cep, blocking);
  const geo = await geocodeCeps(ordered, queryByCep, houseByCep, placeByCep);
  const locatedUpdates: Record<string, unknown>[] = [];
  for (const row of pending) {
    const point = geo.get(cepDigits(row.cep));
    if (!point || point.precision !== "street") continue;
    row.latitude = point.lat;
    row.longitude = point.lng;
    locatedUpdates.push({ cnpj: row.cnpj, latitude: point.lat, longitude: point.lng, updated_at: new Date().toISOString() });
  }
  if (locatedUpdates.length) await upsertChunks("anp_station_quality", locatedUpdates, "cnpj").catch(() => {});
  const pendingLeft = ordered.filter((cep) => !geo.has(cep)).length;

  const located: StationRow[] = [];
  for (const row of merged.values()) {
    let latitude = num(row.latitude);
    let longitude = num(row.longitude);
    if (latitude === null || longitude === null) {
      const point = geo.get(cepDigits(row.cep));
      if (!point || point.precision !== "street") continue;
      latitude = point.lat;
      longitude = point.lng;
      row.latitude = latitude;
      row.longitude = longitude;
    }
    located.push(row);
  }

  const measured = located.map((row) => ({
    row,
    distanceKm: haversineKm(lat, lng, num(row.latitude) as number, num(row.longitude) as number),
  }));
  const step = pickRadiusStep(measured.map((item) => item.distanceKm));
  if (step === null) {
    const reason = emptyReasonAfterGeo(pendingLeft);
    const waiting = stationsToLocate([...merged.values()], place.cep);
    const waitingPrices = await pricesFor(waiting.map((row) => row.cnpj));
    const toLocate: StationToLocate[] = waiting.map((row) => {
      const price = waitingPrices.get(row.cnpj);
      const cep = cepDigits(row.cep);
      return {
        cnpj: row.cnpj,
        name: row.station_name || "Posto",
        address: row.address,
        city: row.city || row.city_norm,
        state: row.state,
        cep,
        query: stationGeocodeQuery(row.address, row.city || row.city_norm, row.state),
        houseNumber: addressHouseNumber(row.address),
        anpScore: row.anp_score,
        gasolinePrice: price?.gasoline ?? null,
        ethanolPrice: price?.ethanol ?? null,
        researchDate: price?.researchDate ?? null,
      };
    });
    return empty(
      reason,
      reason === "locating"
        ? "Abrindo a régua de 5 até 25 km para achar um posto."
        : noStationMessage(searchKm),
      place.city,
      place.state,
      pendingLeft,
      searchKm,
      place.label,
      pool.size,
      merged.size,
      inCity,
      toLocate,
    );
  }
  const near = measured.filter((item) => item.distanceKm <= step);
  const prices = await pricesFor(near.map((item) => item.row.cnpj));

  const candidates: StationCandidate[] = near.map(({ row, distanceKm }) => {
    const price = prices.get(row.cnpj);
    return {
      cnpj: row.cnpj,
      name: row.station_name || "Posto",
      address: row.address,
      latitude: num(row.latitude) as number,
      longitude: num(row.longitude) as number,
      distanceKm,
      anpScore: row.anp_score,
      gasolinePrice: price?.gasoline ?? null,
      ethanolPrice: price?.ethanol ?? null,
      researchDate: price?.researchDate ?? null,
    };
  });

  const ranked = rankStations(candidates, step);
  return {
    ...ranked,
    radiusKm: step,
    city: place.city,
    cityLabel: place.label,
    state: place.state,
    pendingGeo: pendingLeft,
    emptyReason: null,
    origin,
    catalog: { ...base, inCity, inPlace: pool.size, clean: merged.size },
    toLocate: [],
  };
}
