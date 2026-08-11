/**
 * Google Routes API (Compute Routes + TOLLS) no browser.
 * Usa VITE_GOOGLE_MAPS_API_KEY (já usada em Places) — chave com restrição por
 * HTTP referrer funciona aqui e costuma falhar no backend (Vercel sem referrer).
 */

export type BrowserRouteTollsResult = {
  totalIda: number;
  totalIdaVolta: number;
  count: number;
  distanceMeters: number;
  routeDistanceKm: number;
  duration: string | null;
  source: "google" | "none";
  distanceSource: "google" | "none";
  error?: string;
};

function parseMoney(units?: string, nanos?: string | number): number {
  return parseFloat(units || "0") + parseFloat(String(nanos || "0")) / 1e9;
}

function sumEstimatedPrices(
  prices: Array<{ currencyCode?: string; units?: string; nanos?: string | number }> | undefined,
): number {
  if (!prices?.length) return 0;
  const brl = prices.filter((p) => p.currencyCode === "BRL");
  const list = brl.length > 0 ? brl : [prices[0]];
  return list.reduce((s, p) => s + parseMoney(p.units, p.nanos), 0);
}

export async function computeRouteTollsBrowser(params: {
  origin: string;
  destination: string;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
}): Promise<BrowserRouteTollsResult> {
  const origin = String(params.origin || "").trim();
  const destination = String(params.destination || "").trim();
  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

  if (!origin || !destination) {
    return {
      totalIda: 0,
      totalIdaVolta: 0,
      count: 0,
      distanceMeters: 0,
      routeDistanceKm: 0,
      duration: null,
      source: "none",
      distanceSource: "none",
      error: "Origem e destino são obrigatórios",
    };
  }
  if (!apiKey) {
    return {
      totalIda: 0,
      totalIdaVolta: 0,
      count: 0,
      distanceMeters: 0,
      routeDistanceKm: 0,
      duration: null,
      source: "none",
      distanceSource: "none",
      error: "VITE_GOOGLE_MAPS_API_KEY ausente",
    };
  }

  const body: any = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    extraComputations: ["TOLLS"],
    routeModifiers: {
      vehicleInfo: { emissionType: "GASOLINE" },
      tollPasses: ["BR_SEM_PARAR", "BR_VELOE", "BR_CONECTCAR"],
    },
  };
  if (params.originLat && params.originLng) {
    body.origin = {
      location: { latLng: { latitude: Number(params.originLat), longitude: Number(params.originLng) } },
    };
  }
  if (params.destLat && params.destLng) {
    body.destination = {
      location: { latLng: { latitude: Number(params.destLat), longitude: Number(params.destLng) } },
    };
  }

  try {
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

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        totalIda: 0,
        totalIdaVolta: 0,
        count: 0,
        distanceMeters: 0,
        routeDistanceKm: 0,
        duration: null,
        source: "none",
        distanceSource: "none",
        error: `Routes HTTP ${resp.status}${errText ? `: ${errText.slice(0, 160)}` : ""}`,
      };
    }

    const data = await resp.json();
    const route = data.routes?.[0];
    if (!route) {
      return {
        totalIda: 0,
        totalIdaVolta: 0,
        count: 0,
        distanceMeters: 0,
        routeDistanceKm: 0,
        duration: null,
        source: "none",
        distanceSource: "none",
        error: "Routes API sem rotas",
      };
    }

    const distanceMeters = Number(route.distanceMeters || 0);
    let totalIda = sumEstimatedPrices(route.travelAdvisory?.tollInfo?.estimatedPrice);
    let count = totalIda > 0 ? 1 : 0;
    if (totalIda <= 0) {
      let legSum = 0;
      let legCount = 0;
      for (const leg of route.legs || []) {
        const legPrice = sumEstimatedPrices(leg.travelAdvisory?.tollInfo?.estimatedPrice);
        if (legPrice > 0) {
          legSum += legPrice;
          legCount += 1;
        }
      }
      totalIda = legSum;
      count = legCount;
    }

    totalIda = Math.round(totalIda * 100) / 100;
    return {
      totalIda,
      totalIdaVolta: Math.round(totalIda * 2 * 100) / 100,
      count,
      distanceMeters,
      routeDistanceKm: distanceMeters ? Math.round(distanceMeters / 100) / 10 : 0,
      duration: route.duration || null,
      source: totalIda > 0 ? "google" : "none",
      distanceSource: distanceMeters > 0 ? "google" : "none",
      error:
        totalIda <= 0
          ? "Google retornou a rota, mas sem preço de pedágio (TOLLS). Verifique se a Routes API (Preferred) está habilitada na chave."
          : undefined,
    };
  } catch (e: any) {
    return {
      totalIda: 0,
      totalIdaVolta: 0,
      count: 0,
      distanceMeters: 0,
      routeDistanceKm: 0,
      duration: null,
      source: "none",
      distanceSource: "none",
      error: e?.message || "Falha ao consultar Google Routes",
    };
  }
}
