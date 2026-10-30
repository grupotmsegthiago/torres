import { toDateKey } from "./date-key";

/**
 * Ordem operacional da lista de faturas:
 * 1. em aberto e vencidas (due < hoje), a mais atrasada primeiro
 * 2. em aberto que vencem hoje ou depois, a mais próxima primeiro
 * 3. pagas e canceladas no fim
 *
 * Datas são YYYY-MM-DD. Não usar `new Date("YYYY-MM-DD")` (vira o dia anterior em BRT).
 */
export type FaturaOrdem = {
  dueDate?: string | null;
  normalizedStatus?: string | null;
  rawStatus?: string | null;
};

const RAW_FORA_DA_COBRANCA = new Set([
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "CONFIRMED",
  "CANCELLED",
  "CANCELED",
]);

export function faturaForaDaCobranca(row: FaturaOrdem): boolean {
  const st = String(row.normalizedStatus || "").toUpperCase();
  if (st === "PAGO" || st === "NF_CANCELADA") return true;
  return RAW_FORA_DA_COBRANCA.has(String(row.rawStatus || "").toUpperCase());
}

function dueKey(row: FaturaOrdem): string {
  return toDateKey(row.dueDate) || "";
}

/** 0 vencida em aberto, 1 a vencer, 2 encerrada. */
function faixa(row: FaturaOrdem, hoje: string): number {
  if (faturaForaDaCobranca(row)) return 2;
  const due = dueKey(row);
  if (due && due < hoje) return 0;
  return 1;
}

export function ordenarFaturas<T extends FaturaOrdem>(rows: T[], hoje: string): T[] {
  const today = toDateKey(hoje) || hoje;
  return [...rows].sort((a, b) => {
    const fa = faixa(a, today);
    const fb = faixa(b, today);
    if (fa !== fb) return fa - fb;
    const da = dueKey(a) || "9999-12-31";
    const db = dueKey(b) || "9999-12-31";
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}
