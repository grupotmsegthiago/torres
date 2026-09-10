/**
 * Alerta de faturamento só vale se a OS ainda precisa entrar em boletim/fatura.
 * Recusada, OS já no boletim PENDENTE/APROVADO ou com invoice_id não são pendência.
 */

import { isRecusadaOs } from "../../shared/billing-cycle";

export interface BillingCoverFact {
  id: string;
  osNumber: string;
  osStatus?: string | null;
  billingStatus?: string | null;
  invoiceId?: number | null;
  inActiveBoletim: boolean;
}

export function osNeedsFaturamentoAlert(f: BillingCoverFact): boolean {
  if (!f.osNumber || f.osNumber.toLowerCase() === "null") return false;
  if (isRecusadaOs(f.osStatus, f.billingStatus)) return false;
  if (f.invoiceId) return false;
  if (f.inActiveBoletim) return false;
  return true;
}

export function leftoverOsNumbers(facts: BillingCoverFact[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of facts) {
    if (!osNeedsFaturamentoAlert(f)) continue;
    const n = String(f.osNumber).trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export interface RawBillingAlert {
  id: number | string;
  client_id?: number | null;
  client_name?: string | null;
  alert_type?: string | null;
  message?: string | null;
  os_numbers?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  resolved?: boolean | null;
}

export interface VisibleBillingAlert {
  id: number | string;
  clientName: string;
  alertType: string;
  message: string;
  periodStart: string | null;
  periodEnd: string | null;
}

function parseOsList(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== "null");
}

function ymd(v: unknown): string {
  const s = String(v || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/**
 * leftoverByAlertId: OS que ainda estão fora de boletim/fatura.
 * Sem entrada = alerta de ciclo sem leftover conhecido → some.
 */
export function refineBillingAlerts(
  alerts: RawBillingAlert[],
  leftoverByAlertId: Map<string, string[]>,
): VisibleBillingAlert[] {
  const seenPeriod = new Set<string>();
  const out: VisibleBillingAlert[] = [];

  for (const a of alerts) {
    if (a.resolved) continue;
    const type = String(a.alert_type || "");
    if (!FATURAMENTO_ALERT_TYPES.has(type)) {
      out.push({
        id: a.id,
        clientName: String(a.client_name || "—"),
        alertType: type,
        message: String(a.message || ""),
        periodStart: a.period_start ? ymd(a.period_start) : null,
        periodEnd: a.period_end ? ymd(a.period_end) : null,
      });
      continue;
    }
    const leftover = leftoverByAlertId.get(String(a.id)) || [];
    if (leftover.length === 0) continue;

    const periodStart = a.period_start ? ymd(a.period_start) : null;
    const periodEnd = a.period_end ? ymd(a.period_end) : null;
    if (periodStart && periodEnd) {
      const key = `${a.client_id || a.client_name}|${periodStart}|${periodEnd}`;
      if (seenPeriod.has(key)) continue;
      seenPeriod.add(key);
    }

    const clientName = String(a.client_name || "—");
    const labels = leftover.slice(0, 8).join(", ");
    const extra = leftover.length > 8 ? ` e mais ${leftover.length - 8}` : "";
    const message =
      type === "OS_ESQUECIDA"
        ? `OS ${leftover[0]} não entrou em nenhum boletim nem fatura.`
        : `${leftover.length} OS do ciclo ${periodStart || ""} a ${periodEnd || ""} ainda fora de boletim/fatura: ${labels}${extra}`;

    out.push({
      id: a.id,
      clientName,
      alertType: type,
      message,
      periodStart,
      periodEnd,
    });
  }
  return out;
}

export const FATURAMENTO_ALERT_TYPES = new Set([
  "OS_ESQUECIDA",
  "VENCIMENTO_EMISSAO",
  "PENDENTE_FATURAMENTO",
  "ATRASO_APROVACAO",
  "ANTECIPACAO_APROVACAO",
]);

export function osNumbersFromAlert(alert: RawBillingAlert): string[] {
  return parseOsList(alert.os_numbers);
}
