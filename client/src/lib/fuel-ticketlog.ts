// Cálculo de estatísticas de combustível no MESMO formato da TicketLog.
//
// Lógica TicketLog:
//   • Litros do período  = soma dos litros das abastecidas com data dentro
//     do período (independente de ter abastecida anterior ou não).
//   • Custo do período   = soma dos R$ totais das abastecidas no período.
//   • Km rodados período = pra cada abastecida no período, calcula
//     (km_dela − km_da_abastecida_imediatamente_anterior_do_mesmo_veículo,
//      independente da data anterior estar fora do período). Soma tudo.
//     Abastecidas que não têm anterior (1ª da história do veículo) ou
//     com gap inválido (≤0 ou >3000 km, indica hodômetro digitado errado)
//     NÃO contribuem com km, mas SEU LITROS/CUSTO contam normalmente.
//   • Km/L do período    = Km rodados / Litros do período.
//   • R$/Km do período   = Custo do período / Km rodados.
//
// É a única lógica que casa com o relatório oficial da operadora do cartão
// e portanto a única que serve pra conciliar contra a fatura.

export type AnyFueling = {
  id: number;
  vehicleId: number;
  km: number;
  liters: any;
  totalCost?: any;
  date?: string | null;
  fuelType?: string | null;
};

export type VehicleStats = {
  vehicleId: number;
  count: number;
  liters: number;
  cost: number;
  kmRodados: number;
  kmL: number;       // 0 se não dá pra calcular
  costPerKm: number; // 0 se não dá pra calcular
};

export type TicketlogStats = {
  totalFuelings: number;
  totalLiters: number;
  totalCost: number;
  totalKmRodados: number;
  avgKmPerLiter: number;
  avgCostPerKm: number;
  perVehicle: VehicleStats[];
  bestAvg: { vehicleId: number; avg: number } | null;
  worstAvg: { vehicleId: number; avg: number } | null;
};

const KM_GAP_MAX = 3000;

/**
 * Calcula estatísticas no estilo TicketLog.
 *
 * @param allFuelings  Lista COMPLETA de abastecidas (todas as datas).
 *                     A função precisa do histórico inteiro pra achar a
 *                     abastecida imediatamente anterior de cada uma do
 *                     período (mesmo que essa anterior esteja fora dele).
 * @param inPeriod     Predicado que indica se uma abastecida está dentro
 *                     do período avaliado.
 */
export function computeTicketlogStats<T extends AnyFueling>(
  allFuelings: T[],
  inPeriod: (f: T) => boolean,
): TicketlogStats {
  // Agrupa por veículo
  const byVehicle = new Map<number, T[]>();
  for (const f of allFuelings) {
    if (!f.vehicleId) continue;
    if (!byVehicle.has(f.vehicleId)) byVehicle.set(f.vehicleId, []);
    byVehicle.get(f.vehicleId)!.push(f);
  }

  const perVehicle: VehicleStats[] = [];
  let totalFuelings = 0;
  let totalLiters = 0;
  let totalCost = 0;
  let totalKmRodados = 0;

  byVehicle.forEach((list, vehicleId) => {
    // Ordena por km (proxy de ordem temporal — abastecida só sobe hodômetro)
    const sorted = [...list].sort((a, b) => {
      if (a.km !== b.km) return a.km - b.km;
      const da = String(a.date || "");
      const db = String(b.date || "");
      return da.localeCompare(db);
    });

    let vCount = 0;
    let vLiters = 0;
    let vCost = 0;
    let vKm = 0;

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (!inPeriod(cur)) continue;
      vCount++;
      vLiters += Number(cur.liters) || 0;
      vCost += Number(cur.totalCost) || 0;

      if (i > 0) {
        const prev = sorted[i - 1];
        const gap = cur.km - prev.km;
        if (gap > 0 && gap <= KM_GAP_MAX) {
          vKm += gap;
        }
      }
    }

    if (vCount === 0) return;

    const kmL = vKm > 0 && vLiters > 0 ? vKm / vLiters : 0;
    const costPerKm = vKm > 0 && vCost > 0 ? vCost / vKm : 0;
    perVehicle.push({
      vehicleId,
      count: vCount,
      liters: vLiters,
      cost: vCost,
      kmRodados: vKm,
      kmL,
      costPerKm,
    });

    totalFuelings += vCount;
    totalLiters += vLiters;
    totalCost += vCost;
    totalKmRodados += vKm;
  });

  const avgKmPerLiter = totalKmRodados > 0 && totalLiters > 0 ? totalKmRodados / totalLiters : 0;
  const avgCostPerKm = totalKmRodados > 0 && totalCost > 0 ? totalCost / totalKmRodados : 0;

  let bestAvg: TicketlogStats["bestAvg"] = null;
  let worstAvg: TicketlogStats["worstAvg"] = null;
  const withAvg = perVehicle.filter(v => v.kmL > 0);
  if (withAvg.length > 0) {
    const best = withAvg.reduce((a, b) => (b.kmL > a.kmL ? b : a));
    const worst = withAvg.reduce((a, b) => (b.kmL < a.kmL ? b : a));
    bestAvg = { vehicleId: best.vehicleId, avg: best.kmL };
    worstAvg = { vehicleId: worst.vehicleId, avg: worst.kmL };
  }

  return {
    totalFuelings,
    totalLiters,
    totalCost,
    totalKmRodados,
    avgKmPerLiter,
    avgCostPerKm,
    perVehicle: perVehicle.sort((a, b) => b.count - a.count),
    bestAvg,
    worstAvg,
  };
}
