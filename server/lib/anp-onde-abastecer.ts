import { supabaseAdmin } from "../supabase";
import { log } from "./logger";
import {
  ANP_FISCAL_XLSX_URL,
  ANP_YEAR_PAGE,
  ONDE_ABASTECER_RADIUS_KM,
  haversineKm,
  latestGasolinaEtanolHref,
  latestPricesByStation,
  normalizePlace,
  parseAnpPriceCsv,
  rankStations,
  type AnpPriceRow,
  type RankResult,
  type StationCandidate,
} from "@shared/anp-onde-abastecer";
import { fiscalFlagsFromXlsx } from "./anp-fiscal-xlsx";

const UA = "TorresSeguranca/onde-abastecer";
const GEO_BUDGET = 40;

export interface OndeAbastecerPayload extends RankResult {
  radiusKm: number;
  city: string | null;
  state: string | null;
  pendingGeo: number;
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

export async function importAnpQuality(asOfIso: string): Promise<{ flagged: number }> {
  const buf = await fetchBuffer(ANP_FISCAL_XLSX_URL);
  const flags = fiscalFlagsFromXlsx(buf, asOfIso);
  if (flags.size === 0) {
    throw new Error("Fiscalização sem eventos reconhecidos. A carga de qualidade foi interrompida.");
  }
  const { data, error } = await supabaseAdmin.from("anp_station_quality").select("cnpj").limit(20000);
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

async function reverseCity(lat: number, lng: number): Promise<{ city: string; state: string } | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const body = await res.json() as { address?: Record<string, string> };
  const address = body.address ?? {};
  const city = address.city || address.town || address.municipality || address.village || "";
  const iso = address["ISO3166-2-lvl4"] || "";
  const state = iso.includes("-") ? iso.split("-").pop() || "" : "";
  if (!city || !state) return null;
  return { city: normalizePlace(city), state: state.toUpperCase() };
}

async function geocodeCeps(ceps: string[]): Promise<Map<string, { lat: number; lng: number } | null>> {
  const unique = [...new Set(ceps.filter((cep) => cep.length === 8))].slice(0, GEO_BUDGET);
  const out = new Map<string, { lat: number; lng: number } | null>();
  if (!unique.length) return out;
  const { data } = await supabaseAdmin.from("anp_cep_geo").select("cep, latitude, longitude").in("cep", unique);
  const known = new Set<string>();
  for (const row of data ?? []) {
    known.add(row.cep);
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    out.set(row.cep, Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
  }
  const missing = unique.filter((cep) => !known.has(cep));
  const now = new Date().toISOString();
  const looked: Record<string, unknown>[] = [];
  for (let i = 0; i < missing.length; i += 8) {
    const slice = missing.slice(i, i + 8);
    await Promise.all(slice.map(async (cep) => {
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { headers: { "User-Agent": UA } });
        if (!res.ok) {
          out.set(cep, null);
          looked.push({ cep, latitude: null, longitude: null, looked_up_at: now });
          return;
        }
        const body = await res.json() as { location?: { coordinates?: { latitude?: string; longitude?: string } } };
        const lat = Number(body.location?.coordinates?.latitude);
        const lng = Number(body.location?.coordinates?.longitude);
        const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        out.set(cep, point);
        looked.push({ cep, latitude: point?.lat ?? null, longitude: point?.lng ?? null, looked_up_at: now });
      } catch {
        out.set(cep, null);
      }
    }));
  }
  if (looked.length) await upsertChunks("anp_cep_geo", looked, "cep");
  return out;
}

function num(value: number | string | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function recommendStations(lat: number, lng: number): Promise<OndeAbastecerPayload> {
  const empty = (message: string, city: string | null = null, state: string | null = null): OndeAbastecerPayload => ({
    mode: "empty",
    message,
    stations: [],
    radiusKm: ONDE_ABASTECER_RADIUS_KM,
    city,
    state,
    pendingGeo: 0,
  });

  const place = await reverseCity(lat, lng);
  if (!place) return empty("Não foi possível identificar a cidade desta localização.");

  const { data: cityRows, error } = await supabaseAdmin
    .from("anp_station_quality")
    .select("cnpj, station_name, address, latitude, longitude, cep, anp_score, has_quality_infraction_last_2_years, is_authorized, is_interdicted, quality_known, city_norm, state")
    .eq("state", place.state)
    .eq("city_norm", place.city)
    .limit(5000);
  if (error) throw new Error(error.message);
  const inCity = (cityRows ?? []) as StationRow[];
  if (inCity.length === 0) return empty("Nenhum posto com histórico limpo neste raio.", place.city, place.state);
  if (inCity.every((row) => !row.quality_known)) {
    return empty("O histórico de qualidade da ANP ainda não foi carregado.", place.city, place.state);
  }

  const dLat = ONDE_ABASTECER_RADIUS_KM / 111;
  const dLng = ONDE_ABASTECER_RADIUS_KM / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const { data: boxRows } = await supabaseAdmin
    .from("anp_station_quality")
    .select("cnpj, station_name, address, latitude, longitude, cep, anp_score, has_quality_infraction_last_2_years, is_authorized, is_interdicted, quality_known, city_norm, state")
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
  for (const row of inCity.filter(clean)) merged.set(row.cnpj, row);
  for (const row of (boxRows ?? []) as StationRow[]) merged.set(row.cnpj, row);

  const pending = [...merged.values()].filter((row) => num(row.latitude) === null || num(row.longitude) === null);
  const geo = await geocodeCeps(pending.map((row) => (row.cep ?? "").replace(/\D/g, "")));
  const locatedUpdates: Record<string, unknown>[] = [];
  for (const row of pending) {
    const cep = (row.cep ?? "").replace(/\D/g, "");
    const point = geo.get(cep);
    if (!point) continue;
    row.latitude = point.lat;
    row.longitude = point.lng;
    locatedUpdates.push({ cnpj: row.cnpj, latitude: point.lat, longitude: point.lng, updated_at: new Date().toISOString() });
  }
  if (locatedUpdates.length) await upsertChunks("anp_station_quality", locatedUpdates, "cnpj").catch(() => {});
  const pendingLeft = pending.filter((row) => {
    const cep = (row.cep ?? "").replace(/\D/g, "");
    return cep.length === 8 && !geo.has(cep);
  }).length;

  const located: StationRow[] = [];
  for (const row of merged.values()) {
    let latitude = num(row.latitude);
    let longitude = num(row.longitude);
    if (latitude === null || longitude === null) {
      const point = geo.get((row.cep ?? "").replace(/\D/g, ""));
      if (!point) continue;
      latitude = point.lat;
      longitude = point.lng;
      row.latitude = latitude;
      row.longitude = longitude;
    }
    located.push(row);
  }

  const near = located
    .map((row) => ({ row, distanceKm: haversineKm(lat, lng, num(row.latitude) as number, num(row.longitude) as number) }))
    .filter((item) => item.distanceKm <= ONDE_ABASTECER_RADIUS_KM);

  if (near.length === 0) {
    return {
      ...empty(
        pendingLeft > 0
          ? "Localizando os postos desta cidade. Abra de novo em instantes."
          : "Nenhum posto com histórico limpo neste raio.",
        place.city,
        place.state,
      ),
      pendingGeo: pendingLeft,
    };
  }

  const cnpjs = near.map((item) => item.row.cnpj);
  const { data: priceRows, error: priceError } = await supabaseAdmin
    .from("anp_fuel_prices")
    .select("cnpj, fuel_date, product_name, price")
    .in("cnpj", cnpjs)
    .in("product_name", ["GASOLINA", "ETANOL"])
    .order("fuel_date", { ascending: false })
    .limit(8000);
  if (priceError) throw new Error(priceError.message);
  const prices = latestPricesByStation(
    (priceRows ?? []).map((row: { cnpj: string; fuel_date: string; product_name: "GASOLINA" | "ETANOL"; price: number | string }) => ({
      cnpj: row.cnpj,
      fuelDate: String(row.fuel_date).slice(0, 10),
      productName: row.product_name,
      price: Number(row.price),
    })),
  );

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

  const ranked = rankStations(candidates);
  return {
    ...ranked,
    radiusKm: ONDE_ABASTECER_RADIUS_KM,
    city: place.city,
    state: place.state,
    pendingGeo: pendingLeft,
  };
}
