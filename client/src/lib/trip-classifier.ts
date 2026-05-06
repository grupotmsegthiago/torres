// Classifica missões (service orders) entre URBANO e RODOVIA
// usando a melhor heurística disponível pra cada missão.
//
// Por que faz sentido:
//   • Consumo (km/L) muda muito entre cidade e estrada (na cidade um
//     Polo faz ~9 km/L, na estrada ~14 km/L). Saber o split ajuda a
//     entender por que um veículo está com média baixa: se rodou 80%
//     urbano, a média baixa é normal e não indica problema.
//   • A operação mistura PRESERVAÇÃO (parado num cliente, urbano puro)
//     com escolta de cargas pra outros estados (rodovia pura), e tudo
//     no meio. Olhar só "média geral" engana.
//
// Heurística (em ordem de preferência):
//   1. Se a missão tem origin_lat/lng E destination_lat/lng:
//        → calcula distância em linha reta (haversine).
//        → Se haversine ≥ 40 km, classifica como RODOVIA
//          (40 km de raio cobre toda a região metropolitana de SP).
//        → Caso contrário, URBANO.
//   2. Sem coordenadas: usa só o km_total_calculado:
//        → < 50 km → URBANO    (trajeto curto, predominantemente cidade)
//        → ≥ 50 km → RODOVIA   (intermunicipal/interestadual)
//
// O peso da missão na agregação é o km_total_calculado (km efetivamente
// rodado, não o haversine). Ou seja: uma missão de 364 km classificada
// como RODOVIA contribui com 364 km pro total de rodovia daquele veículo.

export type ClassifiableMission = {
  vehicleId?: number | null;
  scheduledDate?: string | Date | null;
  completedDate?: string | Date | null;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  /** Não está tipado em shared/schema.ts mas vem do banco. */
  kmTotalCalculado?: number | null;
  km_total_calculado?: number | null;
};

export type TripCategory = "urbano" | "rodovia";

const HAVERSINE_RODOVIA_KM = 40;
const FALLBACK_RODOVIA_KM = 50;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function classifyMission(m: ClassifiableMission): TripCategory | null {
  const km = Number(m.kmTotalCalculado ?? m.km_total_calculado ?? 0);
  if (km <= 0) return null;
  const oLat = m.originLat, oLng = m.originLng;
  const dLat = m.destinationLat, dLng = m.destinationLng;
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    const hav = haversineKm(oLat, oLng, dLat, dLng);
    return hav >= HAVERSINE_RODOVIA_KM ? "rodovia" : "urbano";
  }
  return km >= FALLBACK_RODOVIA_KM ? "rodovia" : "urbano";
}

export type TripShare = {
  kmUrbano: number;
  kmRodovia: number;
  kmTotal: number;
  pctUrbano: number;
  pctRodovia: number;
  countUrbano: number;
  countRodovia: number;
};

const EMPTY: TripShare = {
  kmUrbano: 0, kmRodovia: 0, kmTotal: 0,
  pctUrbano: 0, pctRodovia: 0,
  countUrbano: 0, countRodovia: 0,
};

/**
 * Agrega missões em % urbano vs rodovia.
 * @param missions  Lista (já filtrada por veículo e período se desejado).
 */
export function computeUrbanHighwayShare(missions: ClassifiableMission[]): TripShare {
  let kmU = 0, kmR = 0, cU = 0, cR = 0;
  for (const m of missions) {
    const cat = classifyMission(m);
    if (!cat) continue;
    const km = Number(m.kmTotalCalculado ?? m.km_total_calculado ?? 0);
    if (cat === "urbano") { kmU += km; cU++; }
    else { kmR += km; cR++; }
  }
  const total = kmU + kmR;
  if (total <= 0) return EMPTY;
  return {
    kmUrbano: kmU,
    kmRodovia: kmR,
    kmTotal: total,
    pctUrbano: (kmU / total) * 100,
    pctRodovia: (kmR / total) * 100,
    countUrbano: cU,
    countRodovia: cR,
  };
}

/**
 * Aplica filtro de período (data de execução = scheduledDate ou completedDate).
 * Aceita strings YYYY-MM-DD pra from/to (lex-comparable).
 */
export function filterMissionsByPeriod<T extends ClassifiableMission>(
  missions: T[],
  from?: string,
  to?: string,
): T[] {
  if (!from && !to) return missions;
  return missions.filter(m => {
    const raw = m.completedDate ?? m.scheduledDate;
    if (!raw) return false;
    const d = String(raw).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
