/**
 * Consulta Google Routes API (Compute Routes + TOLLS) com fallback local.
 * Chave: GOOGLE_MAPS_ROUTES_API_KEY → GOOGLE_MAPS_API_KEY → VITE_GOOGLE_MAPS_API_KEY.
 * Nunca chamar do frontend com a chave privada.
 */
import { estimateTolls, type TollEstimate } from "../toll-engine";
import { nominatimGeocode } from "../db-init";

export type GoogleRoutesTollResult = {
  totalIda: number;
  totalIdaVolta: number;
  count: number;
  distanceMeters: number;
  duration: string | null;
  source: "google" | "local" | "mixed" | "none";
  distanceSource: "google" | "local" | "none";
  tolls: Array<{ name: string; price: number; city?: string; state?: string }>;
  plazas: TollEstimate["plazas"];
  routeDistanceKm: number;
  error?: string;
};

function routesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    undefined
  );
}

function parseMoney(units?: string, nanos?: string | number): number {
  return parseFloat(units || "0") + parseFloat(String(nanos || "0")) / 1e9;
}

/** Soma estimatedPrice preferindo BRL; se não houver BRL, usa a primeira moeda. */
function sumEstimatedPrices(prices: Array<{ currencyCode?: string; units?: string; nanos?: string | number }> | undefined): number {
  if (!prices?.length) return 0;
  const brl = prices.filter((p) => p.currencyCode === "BRL");
  const list = brl.length > 0 ? brl : [prices[0]];
  return list.reduce((s, p) => s + parseMoney(p.units, p.nanos), 0);
}

const _cache = new Map<string, { ts: number; value: GoogleRoutesTollResult }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(origin: string, destination: string, oLat?: number, oLng?: number, dLat?: number, dLng?: number) {
  return [
    origin.trim().toLowerCase(),
    destination.trim().toLowerCase(),
    oLat?.toFixed?.(4) || "",
    oLng?.toFixed?.(4) || "",
    dLat?.toFixed?.(4) || "",
    dLng?.toFixed?.(4) || "",
  ].join("|");
}

export async function computeRouteTolls(params: {
  origin: string;
  destination: string;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  waypoints?: Array<{ lat: number; lng: number }>;
  skipCache?: boolean;
}): Promise<GoogleRoutesTollResult> {
  const origin = String(params.origin || "").trim();
  const destination = String(params.destination || "").trim();
  if (!origin || !destination) {
    return {
      totalIda: 0,
      totalIdaVolta: 0,
      count: 0,
      distanceMeters: 0,
      duration: null,
      source: "none",
      distanceSource: "none",
      tolls: [],
      plazas: [],
      routeDistanceKm: 0,
      error: "Origem e destino são obrigatórios",
    };
  }

  const key = cacheKey(origin, destination, params.originLat || undefined, params.originLng || undefined, params.destLat || undefined, params.destLng || undefined);
  if (!params.skipCache) {
    const hit = _cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;
  }

  let googleTotalIda = 0;
  let googleTolls: Array<{ name: string; price: number }> = [];
  let distanceMeters = 0;
  let duration: string | null = null;
  let googleError: string | undefined;
  let googleDistanceOk = false;

  const apiKey = routesApiKey();
  if (apiKey) {
    try {
      const body: any = {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        extraComputations: ["TOLLS"],
        // Sem tollPasses a API retorna preço em dinheiro; passes BR melhoram cobertura no Brasil.
        routeModifiers: {
          vehicleInfo: { emissionType: "GASOLINE" },
          tollPasses: ["BR_SEM_PARAR", "BR_VELOE", "BR_CONECTCAR"],
        },
      };
      if (params.originLat && params.originLng) {
        body.origin = { location: { latLng: { latitude: Number(params.originLat), longitude: Number(params.originLng) } } };
      }
      if (params.destLat && params.destLng) {
        body.destination = { location: { latLng: { latitude: Number(params.destLat), longitude: Number(params.destLng) } } };
      }
      if (Array.isArray(params.waypoints) && params.waypoints.length > 0) {
        body.intermediates = params.waypoints
          .filter((w) => w.lat && w.lng)
          .map((w) => ({ location: { latLng: { latitude: w.lat, longitude: w.lng } } }));
      }

      const resp = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const route = data.routes?.[0];
        if (route) {
          distanceMeters = route.distanceMeters || 0;
          duration = route.duration || null;
          if (distanceMeters > 0) googleDistanceOk = true;

          // Preferir total da rota (não somar legs — evita double-count).
          const routeToll = sumEstimatedPrices(route.travelAdvisory?.tollInfo?.estimatedPrice);
          if (routeToll > 0) {
            googleTotalIda = routeToll;
            googleTolls = [{ name: "Pedágio (rota)", price: routeToll }];
          } else {
            let legSum = 0;
            for (const leg of route.legs || []) {
              const legPrice = sumEstimatedPrices(leg.travelAdvisory?.tollInfo?.estimatedPrice);
              if (legPrice > 0) {
                legSum += legPrice;
                googleTolls.push({ name: "Pedágio", price: legPrice });
              }
            }
            googleTotalIda = legSum;
          }
        } else {
          googleError = "Routes API sem rotas";
        }
      } else {
        const errText = await resp.text().catch(() => "");
        googleError = `HTTP ${resp.status}${errText ? `: ${errText.slice(0, 180)}` : ""}`;
        console.error("[google-routes-tolls] Routes API error:", googleError);
      }
    } catch (e: any) {
      googleError = e?.message || "timeout/exception";
      console.error("[google-routes-tolls] exception:", googleError);
    }
  } else {
    googleError = "API key ausente (GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY)";
  }

  let localEstimate: TollEstimate | null = null;
  let oLat = Number(params.originLat) || 0;
  let oLng = Number(params.originLng) || 0;
  let dLat = Number(params.destLat) || 0;
  let dLng = Number(params.destLng) || 0;

  if (oLat && oLng && dLat && dLng) {
    localEstimate = estimateTolls(oLat, oLng, dLat, dLng, params.waypoints);
  } else {
    try {
      const oGeo = await nominatimGeocode(origin);
      const dGeo = await nominatimGeocode(destination);
      if (oGeo && dGeo) {
        oLat = oGeo.lat;
        oLng = oGeo.lng;
        dLat = dGeo.lat;
        dLng = dGeo.lng;
        localEstimate = estimateTolls(oLat, oLng, dLat, dLng, params.waypoints);
      }
    } catch (_e) {}
  }

  const totalIda =
    googleTotalIda > 0
      ? Math.round(googleTotalIda * 100) / 100
      : localEstimate?.totalIda || 0;
  const totalIdaVolta =
    googleTotalIda > 0
      ? Math.round(googleTotalIda * 2 * 100) / 100
      : localEstimate?.totalIdaVolta || 0;

  const distanceSource: GoogleRoutesTollResult["distanceSource"] = googleDistanceOk
    ? "google"
    : localEstimate && localEstimate.routeDistanceKm > 0
      ? "local"
      : "none";

  let source: GoogleRoutesTollResult["source"] = "none";
  if (googleTotalIda > 0) source = "google";
  else if (localEstimate && localEstimate.totalIda > 0 && googleDistanceOk) source = "mixed";
  else if (localEstimate && localEstimate.totalIda > 0) source = "local";

  const value: GoogleRoutesTollResult = {
    totalIda,
    totalIdaVolta,
    count: googleTolls.length || localEstimate?.plazas?.length || (totalIda > 0 ? 1 : 0),
    distanceMeters: distanceMeters || Math.round((localEstimate?.routeDistanceKm || 0) * 1000),
    duration,
    source,
    distanceSource,
    tolls:
      googleTolls.length > 0
        ? googleTolls
        : (localEstimate?.plazas || []).map((p) => ({
            name: `${p.name} (${p.road})`,
            price: p.price,
            city: p.city,
            state: p.state,
          })),
    plazas: localEstimate?.plazas || [],
    routeDistanceKm:
      (distanceMeters ? Math.round(distanceMeters / 100) / 10 : 0) ||
      localEstimate?.routeDistanceKm ||
      0,
    error:
      source === "none" && distanceSource === "none"
        ? googleError || "Não foi possível calcular a rota"
        : googleTotalIda <= 0 && googleError
          ? `Pedágio Google indisponível (${googleError}); usando fallback quando possível`
          : undefined,
  };

  _cache.set(key, { ts: Date.now(), value });
  if (_cache.size > 200) {
    const first = _cache.keys().next().value;
    if (first) _cache.delete(first);
  }
  return value;
}
