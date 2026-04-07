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
    price: 4.30,
    bidirectional: true,
    type: "conventional",
    updatedAt: "2025-09-01",
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

export function estimateTolls(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  waypoints?: Array<{ lat: number; lng: number }>,
  corridorWidthKm: number = 15
): TollEstimate {
  const segments: Array<{ aLat: number; aLng: number; bLat: number; bLng: number }> = [];
  const points = [
    { lat: originLat, lng: originLng },
    ...(waypoints || []),
    { lat: destLat, lng: destLng },
  ];

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      aLat: points[i].lat,
      aLng: points[i].lng,
      bLat: points[i + 1].lat,
      bLng: points[i + 1].lng,
    });
  }

  const routeDistanceKm = segments.reduce((sum, s) =>
    sum + haversineDistKm(s.aLat, s.aLng, s.bLat, s.bLng), 0
  );

  const matchedPlazas: TollEstimate["plazas"] = [];

  for (const plaza of TOLL_PLAZAS) {
    let isNear = false;
    for (const seg of segments) {
      if (isPointNearSegment(plaza.lat, plaza.lng, seg.aLat, seg.aLng, seg.bLat, seg.bLng, corridorWidthKm)) {
        isNear = true;
        break;
      }
    }

    if (isNear) {
      const distFromOrigin = haversineDistKm(originLat, originLng, plaza.lat, plaza.lng);
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
  }

  matchedPlazas.sort((a, b) => a.distFromOriginKm - b.distFromOriginKm);

  const totalIda = matchedPlazas.reduce((sum, p) => sum + p.price, 0);
  const totalIdaVolta = matchedPlazas.reduce((sum, p) => {
    const original = TOLL_PLAZAS.find(tp => tp.id === p.id);
    return sum + p.price + (original?.bidirectional ? p.price : 0);
  }, 0);

  return {
    totalIda: Math.round(totalIda * 100) / 100,
    totalIdaVolta: Math.round(totalIdaVolta * 100) / 100,
    plazas: matchedPlazas,
    routeDistanceKm: Math.round(routeDistanceKm * 10) / 10,
  };
}

export function getAllTollPlazas(): TollPlaza[] {
  return TOLL_PLAZAS;
}
