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

export const ONDE_ABASTECER_RADIUS_KM = 5;
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

export function rankStations(list: StationCandidate[]): RankResult {
  const stations = list
    .filter((s) => Number.isFinite(s.distanceKm) && s.distanceKm <= ONDE_ABASTECER_RADIUS_KM)
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
    return { mode: "empty", message: "Nenhum posto com histórico limpo neste raio.", stations: [] };
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
