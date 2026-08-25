export interface TollPlaza {
  id: string;
  name: string;
  road: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  price: number;
  bidirectional: boolean;
  type: "conventional" | "free_flow";
  updatedAt: string;
}

export const TOLL_PLAZAS: TollPlaza[] = [
  {
    id: "dutra-aruja",
    name: "Arujá",
    road: "BR-116 (Via Dutra)",
    city: "Arujá",
    state: "SP",
    lat: -23.3967,
    lng: -46.3217,
    price: 4.50,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "dutra-guararema",
    name: "Guararema",
    road: "BR-116 (Via Dutra)",
    city: "Guararema",
    state: "SP",
    lat: -23.4128,
    lng: -46.0350,
    price: 4.50,
    bidirectional: false,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "dutra-jacarei",
    name: "Jacareí",
    road: "BR-116 (Via Dutra)",
    city: "Jacareí",
    state: "SP",
    lat: -23.3050,
    lng: -45.9669,
    price: 8.10,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "dutra-moreira-cesar",
    name: "Moreira César",
    road: "BR-116 (Via Dutra)",
    city: "Pindamonhangaba",
    state: "SP",
    lat: -22.8547,
    lng: -45.4636,
    price: 16.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "dutra-itatiaia",
    name: "Itatiaia",
    road: "BR-116 (Via Dutra)",
    city: "Itatiaia",
    state: "RJ",
    lat: -22.4897,
    lng: -44.5614,
    price: 14.50,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "dutra-freeflow-sp",
    name: "Free Flow Região Metropolitana SP",
    road: "BR-116 (Via Dutra)",
    city: "Guarulhos/São Paulo",
    state: "SP",
    lat: -23.4800,
    lng: -46.5200,
    price: 4.50,
    bidirectional: false,
    type: "free_flow",
    updatedAt: "2025-12-06",
  },
  {
    id: "anchieta-riachuelo",
    name: "Riacho Grande (Anchieta)",
    road: "SP-150 (Anchieta-Imigrantes)",
    city: "São Bernardo do Campo",
    state: "SP",
    lat: -23.7800,
    lng: -46.5700,
    price: 33.90,
    bidirectional: false,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "bandeirantes-jundiai",
    name: "Jundiaí",
    road: "SP-348 (Bandeirantes)",
    city: "Jundiaí",
    state: "SP",
    lat: -23.1860,
    lng: -46.8841,
    price: 10.00,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "bandeirantes-caieiras",
    name: "Caieiras",
    road: "SP-348 (Bandeirantes)",
    city: "Caieiras",
    state: "SP",
    lat: -23.3600,
    lng: -46.7400,
    price: 5.60,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "anhanguera-valinhos",
    name: "Valinhos",
    road: "SP-330 (Anhanguera)",
    city: "Valinhos",
    state: "SP",
    lat: -22.9700,
    lng: -47.0100,
    price: 9.10,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "fernao-dias-mairipora",
    name: "Mairiporã",
    road: "BR-381 (Fernão Dias)",
    city: "Mairiporã",
    state: "SP",
    lat: -23.3200,
    lng: -46.5900,
    price: 7.40,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "fernao-dias-atibaia",
    name: "Atibaia",
    road: "BR-381 (Fernão Dias)",
    city: "Atibaia",
    state: "SP",
    lat: -23.1170,
    lng: -46.5560,
    price: 4.10,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "raposo-km31",
    name: "Raposo Tavares km 31",
    road: "SP-270 (Raposo Tavares)",
    city: "Cotia",
    state: "SP",
    lat: -23.5950,
    lng: -46.8430,
    price: 4.30,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  {
    id: "castelo-branco-itapevi",
    name: "Itapevi",
    road: "SP-280 (Castelo Branco)",
    city: "Itapevi",
    state: "SP",
    lat: -23.5490,
    lng: -46.9340,
    price: 9.80,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-03-30",
  },
  {
    id: "rio-santos-mangaratiba",
    name: "Mangaratiba",
    road: "BR-101 (Rio-Santos)",
    city: "Mangaratiba",
    state: "RJ",
    lat: -22.9596,
    lng: -44.0409,
    price: 13.00,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
  },
  // —— Corredor SP → Sul (Régis / BR-376 / BR-101 Litoral Sul) ——
  {
    id: "regis-miracatu",
    name: "Miracatu",
    road: "BR-116 (Régis Bittencourt)",
    city: "Miracatu",
    state: "SP",
    lat: -24.2810,
    lng: -47.4600,
    price: 3.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-01-01",
  },
  {
    id: "regis-juquia",
    name: "Juquiá",
    road: "BR-116 (Régis Bittencourt)",
    city: "Juquiá",
    state: "SP",
    lat: -24.3200,
    lng: -47.6350,
    price: 3.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-01-01",
  },
  {
    id: "regis-cajati",
    name: "Cajati",
    road: "BR-116 (Régis Bittencourt)",
    city: "Cajati",
    state: "SP",
    lat: -24.7360,
    lng: -48.1230,
    price: 3.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-01-01",
  },
  {
    id: "regis-jacupiranga",
    name: "Jacupiranga",
    road: "BR-116 (Régis Bittencourt)",
    city: "Jacupiranga",
    state: "SP",
    lat: -24.6920,
    lng: -48.0050,
    price: 3.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-01-01",
  },
  {
    id: "regis-pariquera",
    name: "Pariquera-Açu",
    road: "BR-116 (Régis Bittencourt)",
    city: "Pariquera-Açu",
    state: "SP",
    lat: -24.7150,
    lng: -47.8810,
    price: 3.90,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-01-01",
  },
  {
    id: "br376-sao-jose-pinhais",
    name: "São José dos Pinhais",
    road: "BR-376 / Contorno Leste",
    city: "São José dos Pinhais",
    state: "PR",
    lat: -25.5350,
    lng: -49.1060,
    price: 5.70,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-06-01",
  },
  {
    id: "br101-garuva",
    name: "Garuva",
    road: "BR-101 (Arteris Litoral Sul)",
    city: "Garuva",
    state: "SC",
    lat: -26.0270,
    lng: -48.8520,
    price: 5.70,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-06-01",
  },
  {
    id: "br101-araquari",
    name: "Araquari",
    road: "BR-101 (Arteris Litoral Sul)",
    city: "Araquari",
    state: "SC",
    lat: -26.3750,
    lng: -48.7220,
    price: 5.70,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-06-01",
  },
  {
    id: "br101-porto-belo",
    name: "Porto Belo",
    road: "BR-101 (Arteris Litoral Sul)",
    city: "Porto Belo",
    state: "SC",
    lat: -27.1570,
    lng: -48.5530,
    price: 5.70,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-06-01",
  },
  {
    id: "br101-palhoca",
    name: "Palhoça",
    road: "BR-101 (Arteris Litoral Sul)",
    city: "Palhoça",
    state: "SC",
    lat: -27.6450,
    lng: -48.6700,
    price: 5.70,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2026-06-01",
  },
];

function haversineDistKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointNearSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
  maxDistKm: number
): boolean {
  const dAP = haversineDistKm(aLat, aLng, pLat, pLng);
  const dBP = haversineDistKm(bLat, bLng, pLat, pLng);
  const dAB = haversineDistKm(aLat, aLng, bLat, bLng);

  if (dAP > dAB + maxDistKm || dBP > dAB + maxDistKm) return false;

  const t = Math.max(0, Math.min(1,
    ((pLat - aLat) * (bLat - aLat) + (pLng - aLng) * (bLng - aLng)) /
    ((bLat - aLat) ** 2 + (bLng - aLng) ** 2 || 1)
  ));
  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);
  const distToSegment = haversineDistKm(pLat, pLng, projLat, projLng);

  return distToSegment <= maxDistKm;
}

export interface TollEstimate {
  totalIda: number;
  totalIdaVolta: number;
  plazas: Array<{
    id: string;
    name: string;
    road: string;
    city: string;
    state: string;
    price: number;
    type: string;
    distFromOriginKm: number;
  }>;
  routeDistanceKm: number;
}

/**
 * Estima pedágios ao longo de uma polilinha real (Directions/OSRM).
 * Usa corredor estreito — bem mais preciso que origem→destino em linha reta.
 */
export function estimateTollsAlongPath(
  path: Array<{ lat: number; lng: number }>,
  opts?: { corridorWidthKm?: number; routeDistanceKm?: number },
): TollEstimate {
  const corridorWidthKm = opts?.corridorWidthKm ?? 4;
  const raw = (path || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (raw.length < 2) {
    return { totalIda: 0, totalIdaVolta: 0, plazas: [], routeDistanceKm: 0 };
  }

  // Downsample para performance (máx. ~400 segmentos).
  const step = Math.max(1, Math.ceil(raw.length / 400));
  const points = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);

  const segments: Array<{ aLat: number; aLng: number; bLat: number; bLng: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      aLat: points[i].lat,
      aLng: points[i].lng,
      bLat: points[i + 1].lat,
      bLng: points[i + 1].lng,
    });
  }

  const pathDistanceKm = segments.reduce(
    (sum, s) => sum + haversineDistKm(s.aLat, s.aLng, s.bLat, s.bLng),
    0,
  );
  const routeDistanceKm = opts?.routeDistanceKm && opts.routeDistanceKm > 0
    ? opts.routeDistanceKm
    : pathDistanceKm;

  const matchedPlazas: TollEstimate["plazas"] = [];
  const origin = points[0];

  for (const plaza of TOLL_PLAZAS) {
    let isNear = false;
    for (const seg of segments) {
      if (isPointNearSegment(plaza.lat, plaza.lng, seg.aLat, seg.aLng, seg.bLat, seg.bLng, corridorWidthKm)) {
        isNear = true;
        break;
      }
    }
    if (!isNear) continue;
    const distFromOrigin = haversineDistKm(origin.lat, origin.lng, plaza.lat, plaza.lng);
    matchedPlazas.push({
      id: plaza.id,
      name: plaza.name,
      road: plaza.road,
      city: plaza.city,
      state: plaza.state,
      price: plaza.price,
      type: plaza.type,
      distFromOriginKm: Math.round(distFromOrigin * 10) / 10,
    });
  }

  matchedPlazas.sort((a, b) => a.distFromOriginKm - b.distFromOriginKm);
  const totalIda = matchedPlazas.reduce((sum, p) => sum + p.price, 0);
  const totalIdaVolta = matchedPlazas.reduce((sum, p) => {
    const original = TOLL_PLAZAS.find((tp) => tp.id === p.id);
    return sum + p.price + (original?.bidirectional ? p.price : 0);
  }, 0);

  return {
    totalIda: Math.round(totalIda * 100) / 100,
    totalIdaVolta: Math.round(totalIdaVolta * 100) / 100,
    plazas: matchedPlazas,
    routeDistanceKm: Math.round(routeDistanceKm * 10) / 10,
  };
}

export function estimateTolls(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  waypoints?: Array<{ lat: number; lng: number }>,
  corridorWidthKm: number = 15
): TollEstimate {
  const points = [
    { lat: originLat, lng: originLng },
    ...(waypoints || []),
    { lat: destLat, lng: destLng },
  ];
  return estimateTollsAlongPath(points, { corridorWidthKm });
}

export function getAllTollPlazas(): TollPlaza[] {
  return TOLL_PLAZAS;
}
