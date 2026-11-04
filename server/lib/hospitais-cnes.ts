import { createReadStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import AdmZip from "adm-zip";
import { supabaseAdmin } from "../supabase";
import { log } from "./logger";
import { reverseCity } from "./anp-onde-abastecer";
import { IBGE_MUNICIPIOS } from "@shared/ibge-municipios";
import {
  cepBandBounds,
  coordinateOrNull,
  emptyReasonAfterGeo,
  MAP_LOCATE_LIMIT,
  maxRadiusStepKm,
  orderCepsByProximity,
  type OndeAbastecerEmptyReason,
} from "@shared/anp-onde-abastecer";
import {
  CNES_ESTABELECIMENTOS_ZIP,
  CNES_HOSPITAL_MIN_ROWS,
  acceptHospitalPin,
  cnesDigits,
  cnesHeaderIndex,
  draftFromCnesLine,
  hospitalGeocodeQuery,
  noHospitalMessage,
  parseHospitalPinList,
  rankHospitals,
  type CnesHospitalDraft,
  type HospitalCare,
  type HospitalPin,
  type HospitalToLocate,
  type RankedHospital,
} from "@shared/hospitais-cnes";

export interface HospitaisPayload {
  mode: "nearest" | "empty";
  message: string | null;
  hospitals: RankedHospital[];
  radiusKm: number;
  city: string | null;
  cityLabel: string | null;
  state: string | null;
  pendingGeo: number;
  emptyReason: OndeAbastecerEmptyReason | null;
  origin: { lat: number; lng: number };
  catalog: { hospitals: number; inCity: number; inPlace: number };
  toLocate: HospitalToLocate[];
}

interface HospitalRow {
  cnes: string;
  name: string;
  address: string | null;
  city: string | null;
  city_norm: string | null;
  state: string | null;
  cep: string | null;
  phone: string | null;
  care: HospitalCare;
  attends_sus: boolean;
  unit_label: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

const UA = "TorresSeguranca/hospitais";
const COLUMNS = "cnes, name, address, city, city_norm, state, cep, phone, care, attends_sus, unit_label, latitude, longitude";

function num(value: number | string | null | undefined): number | null {
  return coordinateOrNull(value);
}

async function upsertChunks(rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const { error } = await supabaseAdmin.from("cnes_hospital").upsert(chunk, { onConflict: "cnes" });
    if (error) throw new Error(`cnes_hospital: ${error.message}`);
  }
}

async function countHospitals(): Promise<number> {
  const { count, error } = await supabaseAdmin.from("cnes_hospital").select("cnes", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function syncCnesHospitals(): Promise<{ hospitals: number }> {
  const res = await fetch(CNES_ESTABELECIMENTOS_ZIP, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CNES HTTP ${res.status}`);
  const zipPath = path.join(os.tmpdir(), `cnes-${Date.now()}.zip`);
  const csvPath = path.join(os.tmpdir(), `cnes-${Date.now()}.csv`);
  await fs.writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find((item) => item.entryName.toLowerCase().endsWith(".csv"));
    if (!entry) throw new Error("CSV do CNES ausente");
    await fs.writeFile(csvPath, entry.getData());
    const drafts = await readHospitalCsv(csvPath);
    if (drafts.length < CNES_HOSPITAL_MIN_ROWS) {
      throw new Error(`CNES devolveu ${drafts.length} hospitais; a lista anterior foi mantida`);
    }
    const now = new Date().toISOString();
    await upsertChunks(drafts.map((row) => ({
      cnes: row.cnes,
      name: row.name,
      address: row.address,
      city: row.city,
      city_norm: row.cityNorm,
      state: row.state,
      cep: row.cep || null,
      phone: row.phone,
      care: row.care,
      attends_sus: row.attendsSus,
      unit_label: row.unitLabel,
      updated_at: now,
    })));
    await deleteMissing(new Set(drafts.map((row) => row.cnes)));
    log(`[cnes] hospitais=${drafts.length}`, "cnes");
    return { hospitals: drafts.length };
  } finally {
    await fs.unlink(zipPath).catch(() => {});
    await fs.unlink(csvPath).catch(() => {});
  }
}

async function readHospitalCsv(csvPath: string): Promise<CnesHospitalDraft[]> {
  const stream = readline.createInterface({
    input: createReadStream(csvPath, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });
  let header: Map<string, number> | null = null;
  const out: CnesHospitalDraft[] = [];
  const seen = new Set<string>();
  for await (const line of stream) {
    if (!line.trim()) continue;
    if (!header) {
      header = cnesHeaderIndex(line);
      continue;
    }
    const draft = draftFromCnesLine(header, line, IBGE_MUNICIPIOS);
    if (!draft || seen.has(draft.cnes)) continue;
    seen.add(draft.cnes);
    out.push(draft);
  }
  return out;
}

async function deleteMissing(keep: Set<string>) {
  const stale: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from("cnes_hospital").select("cnes").range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (!keep.has(row.cnes)) stale.push(row.cnes);
    }
    if (rows.length < 1000) break;
  }
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200);
    const { error } = await supabaseAdmin.from("cnes_hospital").delete().in("cnes", chunk);
    if (error) throw new Error(error.message);
  }
}

async function rememberPins(rows: HospitalRow[], pins: HospitalPin[]) {
  if (!pins.length) return;
  const byCnes = new Map(pins.map((pin) => [pin.cnes, pin]));
  const now = new Date().toISOString();
  const updates: Record<string, unknown>[] = [];
  for (const row of rows) {
    const pin = byCnes.get(cnesDigits(row.cnes));
    if (!pin || (num(row.latitude) !== null && num(row.longitude) !== null)) continue;
    row.latitude = pin.lat;
    row.longitude = pin.lng;
    updates.push({ cnes: row.cnes, latitude: pin.lat, longitude: pin.lng, updated_at: now });
  }
  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from("cnes_hospital")
      .update({ latitude: update.latitude, longitude: update.longitude, updated_at: update.updated_at })
      .eq("cnes", update.cnes);
    if (error) throw new Error(error.message);
  }
}

function toLocate(rows: HospitalRow[], userCep: string): HospitalToLocate[] {
  const byCep = new Map<string, HospitalRow>();
  for (const row of rows) {
    if (num(row.latitude) !== null && num(row.longitude) !== null) continue;
    const cep = (row.cep ?? "").replace(/\D/g, "").slice(0, 8);
    if (cep.length !== 8 || byCep.has(cep)) continue;
    byCep.set(cep, row);
  }
  return orderCepsByProximity(userCep, byCep.keys()).slice(0, MAP_LOCATE_LIMIT).map((cep) => {
    const row = byCep.get(cep) as HospitalRow;
    return {
      cnes: row.cnes,
      name: row.name,
      address: row.address,
      city: row.city,
      state: row.state,
      cep,
      query: hospitalGeocodeQuery(row.address, row.city, row.state),
      phone: row.phone,
      care: row.care,
      attendsSus: row.attends_sus === true,
      unitLabel: row.unit_label || "Hospital",
    };
  });
}

function rankedFrom(rows: HospitalRow[], lat: number, lng: number): { radiusKm: number; hospitals: RankedHospital[] } | null {
  return rankHospitals(lat, lng, rows.flatMap((row) => {
    const latitude = num(row.latitude);
    const longitude = num(row.longitude);
    if (latitude === null || longitude === null) return [];
    const care = row.care;
    if (care !== "publico" && care !== "particular" && care !== "filantropico") return [];
    return [{
      cnes: row.cnes,
      name: row.name || "Hospital",
      address: row.address,
      phone: row.phone,
      care,
      attendsSus: row.attends_sus === true,
      unitLabel: row.unit_label || "Hospital",
      latitude,
      longitude,
    }];
  }));
}

export async function recommendHospitals(lat: number, lng: number, pinText = ""): Promise<HospitaisPayload> {
  const total = await countHospitals();
  const origin = { lat, lng };
  const empty = (
    emptyReason: OndeAbastecerEmptyReason,
    message: string,
    city: string | null = null,
    state: string | null = null,
    cityLabel: string | null = null,
    inPlace = 0,
    inCity = 0,
    pendingGeo = 0,
    locate: HospitalToLocate[] = [],
  ): HospitaisPayload => ({
    mode: "empty",
    emptyReason,
    message,
    hospitals: [],
    radiusKm: maxRadiusStepKm(),
    city,
    cityLabel,
    state,
    pendingGeo,
    origin,
    catalog: { hospitals: total, inCity, inPlace },
    toLocate: locate,
  });

  if (total <= 0) {
    return empty("not_loaded", "A lista de hospitais do Ministério da Saúde ainda não foi carregada.");
  }

  const place = await reverseCity(lat, lng);
  if (!place) return empty("no_city", "Não foi possível identificar a cidade desta localização.");

  const { data: cityRows, error } = await supabaseAdmin
    .from("cnes_hospital")
    .select(COLUMNS)
    .eq("state", place.state)
    .eq("city_norm", place.city)
    .limit(2000);
  if (error) throw new Error(error.message);
  const bounds = cepBandBounds(place.cep);
  let bandRows: HospitalRow[] = [];
  if (bounds) {
    const { data, error: bandError } = await supabaseAdmin
      .from("cnes_hospital")
      .select(COLUMNS)
      .eq("state", place.state)
      .gte("cep", bounds.from)
      .lte("cep", bounds.to)
      .limit(500);
    if (bandError) throw new Error(bandError.message);
    bandRows = (data ?? []) as HospitalRow[];
  }
  const inCity = ((cityRows ?? []) as HospitalRow[]).length;
  const neighborCities = [...new Set(
    bandRows.map((row) => row.city_norm).filter((city): city is string => Boolean(city) && city !== place.city),
  )];
  let neighborRows: HospitalRow[] = [];
  if (neighborCities.length) {
    const { data, error: neighborError } = await supabaseAdmin
      .from("cnes_hospital")
      .select(COLUMNS)
      .eq("state", place.state)
      .in("city_norm", neighborCities)
      .limit(500);
    if (neighborError) throw new Error(neighborError.message);
    neighborRows = (data ?? []) as HospitalRow[];
  }
  const pool = new Map<string, HospitalRow>();
  for (const row of (cityRows ?? []) as HospitalRow[]) pool.set(row.cnes, row);
  for (const row of bandRows) pool.set(row.cnes, row);
  for (const row of neighborRows) pool.set(row.cnes, row);
  if (pool.size === 0) {
    return empty("no_station", noHospitalMessage(maxRadiusStepKm()), place.city, place.state, place.label, 0, inCity);
  }

  const merged = [...pool.values()];
  const accepted = parseHospitalPinList(pinText)
    .map((pin) => acceptHospitalPin({ pin, originLat: lat, originLng: lng, allowed: merged.map((row) => row.cnes) }))
    .filter((pin): pin is HospitalPin => pin !== null);
  await rememberPins(merged, accepted);

  const opened = rankedFrom(merged, lat, lng);
  if (opened) {
    return {
      mode: "nearest",
      message: null,
      hospitals: opened.hospitals,
      radiusKm: opened.radiusKm,
      city: place.city,
      cityLabel: place.label,
      state: place.state,
      pendingGeo: merged.filter((row) => num(row.latitude) === null).length,
      emptyReason: null,
      origin,
      catalog: { hospitals: total, inCity, inPlace: pool.size },
      toLocate: [],
    };
  }

  const locate = toLocate(merged, place.cep);
  const reason = emptyReasonAfterGeo(locate.length);
  return empty(
    reason,
    reason === "locating" ? "Lendo o endereço dos hospitais no mapa." : noHospitalMessage(maxRadiusStepKm()),
    place.city,
    place.state,
    place.label,
    pool.size,
    inCity,
    locate.length,
    locate,
  );
}
