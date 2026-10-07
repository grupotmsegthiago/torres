/** Teto de lançamento de abastecimento. Acima disso o valor não entra no banco. */
export const FUELING_MAX_TOTAL_BRL = 300;
export const FUELING_MAX_LITERS = 55;

/** Canal de broadcast para o aviso obrigatório aparecer na hora em quem está logado. */
export const CRITICAL_ALERT_CHANNEL = "torres-critical-alerts";

export type FuelingLimitViolation = {
  overTotal: boolean;
  overLiters: boolean;
  total: number;
  liters: number;
};

function asNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** `null` quando o lançamento pode ser salvo. "Passar de" = estritamente maior. */
export function fuelingLimitViolation(
  totalCost: number | string | null | undefined,
  liters: number | string | null | undefined,
): FuelingLimitViolation | null {
  const total = asNumber(totalCost);
  const lit = asNumber(liters);
  const overTotal = total > FUELING_MAX_TOTAL_BRL;
  const overLiters = lit > FUELING_MAX_LITERS;
  if (!overTotal && !overLiters) return null;
  return { overTotal, overLiters, total, liters: lit };
}

export function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatLiters(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function fuelingLimitReason(v: FuelingLimitViolation): string {
  const parts: string[] = [];
  if (v.overTotal) parts.push(`o valor R$ ${formatBrl(v.total)} passa de R$ ${formatBrl(FUELING_MAX_TOTAL_BRL)}`);
  if (v.overLiters) parts.push(`${formatLiters(v.liters)} litros passa de ${FUELING_MAX_LITERS} litros`);
  return parts.join(" e ");
}

/** Mensagem devolvida a quem tentou salvar. */
export function fuelingLimitUserMessage(v: FuelingLimitViolation): string {
  return `Abastecimento não foi salvo: ${fuelingLimitReason(v)}. Corrija e lance de novo.`;
}
