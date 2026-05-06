// Cálculo robusto de km/L para um abastecimento, combinando trechos curtos
// consecutivos quando o trecho individual é "suspeito" (tanque parcial,
// hodômetro digitado errado ou abastecimento faltando registrar).
//
// Regra:
//  - Se o trecho individual estiver dentro da faixa esperada (>=100 km e
//    km/L entre 6 e 20), devolve direto.
//  - Caso contrário, soma os trechos anteriores (até 6) até a janela ficar
//    plausível.
//  - Se mesmo combinando o resultado continuar > 30 km/L, marca como
//    "incoerente" (provável dado faltando) e recomenda não exibir o número.

export type AnyFueling = { id: number; vehicleId: number; km: number; liters: any };

export type KmLInfo = {
  /** km/L do trecho individual (current.km - prev.km) / current.liters. */
  kmL: number;
  /** km/L combinado (mesmo valor de kmL quando não foi necessário combinar). */
  kmLCombined: number | null;
  /** True quando o trecho individual exigiu combinação. */
  isSuspect: boolean;
  /** Quantos trechos foram combinados (1 = só o atual). */
  segments: number;
  /** Distância total considerada (km). */
  totalDist: number;
  /** Litros totais considerados. */
  totalLiters: number;
  /**
   * True quando a combinação ainda devolve um número impossível (> 30 km/L
   * ou negativo). Indica dado quebrado: provável abastecimento faltando ou
   * hodômetro digitado errado. UI deve esconder o número e marcar erro.
   */
  isIncoerente: boolean;
};

/** Valor máximo plausível de km/L pra qualquer veículo a combustão da frota. */
export const KMPL_MAX_PLAUSIVEL = 30;

export function calcKmL<T extends AnyFueling>(allFuelings: T[], current: T): KmLInfo | null {
  const sameVehicle = allFuelings
    .filter(x => x.vehicleId === current.vehicleId && (Number(x.liters) || 0) > 0)
    .sort((a, b) => a.km - b.km);
  const idx = sameVehicle.findIndex(x => x.id === current.id);
  if (idx <= 0) return null;
  const prev = sameVehicle[idx - 1];
  const dist = current.km - prev.km;
  const liters = Number(current.liters) || 0;
  if (dist <= 0 || liters <= 0) return null;
  const kmL = dist / liters;

  const isSuspect = kmL < 6 || kmL > 20 || dist < 100;
  if (!isSuspect) {
    return {
      kmL,
      kmLCombined: kmL,
      isSuspect: false,
      segments: 1,
      totalDist: dist,
      totalLiters: liters,
      isIncoerente: false,
    };
  }

  // Acumula pra trás até a janela ficar plausível (máx 6 trechos).
  let totalDist = dist;
  let totalLiters = liters;
  let segments = 1;
  let i = idx;
  while (i > 1 && segments < 6) {
    i--;
    const seg = sameVehicle[i];
    const segPrev = sameVehicle[i - 1];
    const segDist = seg.km - segPrev.km;
    const segLit = Number(seg.liters) || 0;
    if (segDist <= 0 || segLit <= 0) break;
    totalDist += segDist;
    totalLiters += segLit;
    segments++;
    const med = totalDist / totalLiters;
    if (totalDist >= 100 && med >= 6 && med <= 20) break;
  }
  const kmLCombined = totalLiters > 0 ? totalDist / totalLiters : null;
  const isIncoerente = kmLCombined !== null && kmLCombined > KMPL_MAX_PLAUSIVEL;
  return { kmL, kmLCombined, isSuspect: true, segments, totalDist, totalLiters, isIncoerente };
}
