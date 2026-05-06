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
// Heurística:
//   km_total_calculado ≤ 100 km  → URBANO
//   km_total_calculado >  100 km → RODOVIA
//
// O peso da missão na agregação é o próprio km_total_calculado.

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

const RODOVIA_KM = 100;

export function classifyMission(m: ClassifiableMission): TripCategory | null {
  const km = Number(m.kmTotalCalculado ?? m.km_total_calculado ?? 0);
  if (km <= 0) return null;
  return km > RODOVIA_KM ? "rodovia" : "urbano";
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
