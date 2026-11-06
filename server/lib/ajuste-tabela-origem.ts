/**
 * Seleção pura: missões TM SEG que iniciaram em Florianópolis/Palhoça.
 * Não calcula preço — só classifica quem entra no ajuste de tabela.
 */
import { extractCity } from "../routes/conferencia-tmseg";
import { brtDateKey } from "./brt-date";
import {
  isInvoicedBillingStatus,
  normalizeBillingStatus,
} from "./billing-frozen";

export const TARGET_TABLE_NAME = "OP. DEDICADA SUL";
export const PERIOD_START = "2026-08-01";
export const PERIOD_END = "2026-08-31";

export function foldPt(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactAlnum(value: unknown): string {
  return foldPt(value).replace(/[^A-Z0-9]/g, "");
}

export function isTmSegClientName(name: unknown): boolean {
  return foldPt(name).includes("TM SEG");
}

export function isDhlClientName(name: unknown): boolean {
  return foldPt(name).includes("DHL");
}

export function isOriginFlorianopolisOrPalhoca(origin: unknown): boolean {
  const city = compactAlnum(extractCity(String(origin || "")));
  const raw = compactAlnum(origin);
  if (city.includes("FLORIANOPOLIS") || raw.includes("FLORIANOPOLIS")) return true;
  if (city === "FLN" || city === "FLORIPA") return true;
  if (city.includes("PALHOCA") || raw.includes("PALHOCA")) return true;
  return false;
}

export function missionStartDateBrt(so: {
  mission_started_at?: string | null;
  scheduled_date?: string | null;
}): string | null {
  return brtDateKey(so.mission_started_at) || brtDateKey(so.scheduled_date);
}

export function isInInclusivePeriod(
  dateKey: string | null,
  start = PERIOD_START,
  end = PERIOD_END,
): boolean {
  if (!dateKey) return false;
  return dateKey >= start && dateKey <= end;
}

export function isTargetTableName(name: unknown): boolean {
  return foldPt(name) === foldPt(TARGET_TABLE_NAME);
}

export type AjusteDecision =
  | "already_ok"
  | "recalc_open"
  | "recalc_aprovada"
  | "recalc_cancelada"
  | "pointer_recusada"
  | "skip_faturado_snapshot"
  | "skip_dhl"
  | "skip_not_tmseg"
  | "out_of_scope";

export function classifyAjuste(input: {
  clientName: string;
  origin: string | null | undefined;
  startDateBrt: string | null;
  soStatus: string | null | undefined;
  currentTableName: string | null | undefined;
  billingStatus: string | null | undefined;
  hasApprovedBoletimSnapshot: boolean;
}): AjusteDecision {
  if (isDhlClientName(input.clientName)) return "skip_dhl";
  if (!isTmSegClientName(input.clientName)) return "skip_not_tmseg";
  if (!isOriginFlorianopolisOrPalhoca(input.origin)) return "out_of_scope";
  if (!isInInclusivePeriod(input.startDateBrt)) return "out_of_scope";
  if (isTargetTableName(input.currentTableName)) return "already_ok";

  const soSt = foldPt(input.soStatus);
  const billSt = normalizeBillingStatus(input.billingStatus);

  if (soSt === "RECUSADA") return "pointer_recusada";
  if (isInvoicedBillingStatus(billSt) || input.hasApprovedBoletimSnapshot) {
    return "skip_faturado_snapshot";
  }
  if (soSt === "CANCELADA" || billSt === "CANCELADO" || billSt === "CANCELADA") {
    return "recalc_cancelada";
  }
  if (billSt === "APROVADA") return "recalc_aprovada";
  if (!billSt || billSt === "A_VERIFICAR" || billSt === "REJEITADA") {
    return "recalc_open";
  }
  return "skip_faturado_snapshot";
}

export function estimadoFromAcionamento(contrato: { valor_acionamento?: unknown }): number | null {
  const acion = Number(contrato?.valor_acionamento || 0);
  return acion > 0 ? acion : null;
}
