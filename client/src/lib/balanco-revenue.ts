/**
 * Resolução de receita de uma OS no Balanço Gerencial (núcleo puro).
 *
 * Regras (governança + §8.1b):
 * - Recusada: não chega aqui (filtrada antes).
 * - Cancelada: SEMPRE snapshot do billing (tabela 100 km via computeCanceladaBilling).
 *   Nunca liveFat/canônico do contrato da OS (infla — caso TOR-0560).
 * - Boletim congelado (APROVADA/FATURADO/FATURADA/PAGO/CANCELADO): snapshot.
 * - Demais: canônico ao vivo (previsão "em aberto").
 */

export const FROZEN_BILLING_STATUSES = new Set([
  "APROVADA",
  "FATURADO",
  "FATURADA",
  "PAGO",
  "CANCELADO",
  "CANCELADA",
]);

export type BalancoRevenueBill = {
  status?: string | null;
  fat_total_boletim?: number | null;
  fat_total?: number | null;
} | null | undefined;

export type BalancoRevenueInput = {
  osStatus: string | null | undefined;
  liveFat: number;
  bill: BalancoRevenueBill;
};

export type BalancoRevenueResult = {
  fat: number;
  /** true = Finalizado (não entra em "OSs em Aberto"). */
  isFrozen: boolean;
  useBoletim: boolean;
  boletimFat: number;
};

export function resolveBalancoOsRevenue(input: BalancoRevenueInput): BalancoRevenueResult {
  const isCancelada = String(input.osStatus || "").toLowerCase() === "cancelada";
  const billStatus = String(input.bill?.status || "").toUpperCase();
  const billFrozen = !!input.bill && FROZEN_BILLING_STATUSES.has(billStatus);
  const boletimFat = Number(input.bill?.fat_total_boletim ?? input.bill?.fat_total) || 0;
  const useBoletim = (isCancelada || billFrozen) && !!input.bill && boletimFat > 0;

  if (useBoletim) {
    return { fat: boletimFat, isFrozen: true, useBoletim: true, boletimFat };
  }

  // Fail-closed: cancelada sem snapshot no byMission NÃO usa canônico (contrato cheio).
  // Evita R$ 4.xxx na lista "em aberto" enquanto o boletim mostra R$ 767,83 (tabela 100 km).
  if (isCancelada) {
    return { fat: 0, isFrozen: true, useBoletim: false, boletimFat };
  }

  return {
    fat: Number(input.liveFat) || 0,
    isFrozen: false,
    useBoletim: false,
    boletimFat,
  };
}
