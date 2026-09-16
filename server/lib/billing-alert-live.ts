import { supabaseAdmin } from "../supabase";
import {
  FATURAMENTO_ALERT_TYPES,
  leftoverOsNumbers,
  osNeedsFaturamentoAlert,
  refineBillingAlerts,
  type BillingCoverFact,
  type RawBillingAlert,
  type VisibleBillingAlert,
} from "./billing-alert-coverage";

const CHUNK = 200;

async function fetchIn(table: string, col: string, ids: Array<string | number>, select: string): Promise<any[]> {
  const all: any[] = [];
  const uniq = Array.from(new Set(ids.map((x) => x as any))).filter((x) => x !== undefined && x !== null && x !== "");
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin.from(table).select(select).in(col, slice);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
  }
  return all;
}

export async function loadActiveBoletimBillingIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("boletim_approvals")
    .select("billing_ids")
    .in("status", ["PENDENTE", "APROVADO"]);
  if (error) throw new Error(`boletim_approvals: ${error.message}`);
  const set = new Set<string>();
  for (const row of data || []) {
    for (const id of row.billing_ids || []) set.add(String(id));
  }
  return set;
}

function factsFromBillings(
  bills: any[],
  osById: Map<number, { status?: string | null; os_number?: string | null }>,
  inBoletim: Set<string>,
): BillingCoverFact[] {
  return (bills || []).map((b) => {
    const so = osById.get(Number(b.service_order_id));
    return {
      id: String(b.id),
      osNumber: String(b.os_number || so?.os_number || ""),
      osStatus: so?.status ?? null,
      billingStatus: b.status ?? null,
      invoiceId: b.invoice_id ? Number(b.invoice_id) : null,
      inActiveBoletim: inBoletim.has(String(b.id)),
    };
  });
}

async function osMapForBillings(bills: any[]): Promise<Map<number, { status?: string | null; os_number?: string | null }>> {
  const soIds = bills.map((b) => Number(b.service_order_id)).filter(Boolean);
  const orders = soIds.length ? await fetchIn("service_orders", "id", soIds, "id, os_number, status") : [];
  return new Map(orders.map((o: any) => [Number(o.id), o]));
}

export async function leftoverOsForBillings(bills: any[], inBoletim: Set<string>): Promise<string[]> {
  const osById = await osMapForBillings(bills);
  return leftoverOsNumbers(factsFromBillings(bills, osById, inBoletim));
}

export function billingStillNeedsAlert(b: any, osStatus: string | null | undefined, inBoletim: Set<string>): boolean {
  return osNeedsFaturamentoAlert({
    id: String(b.id || ""),
    osNumber: String(b.os_number || ""),
    osStatus: osStatus ?? null,
    billingStatus: b.status ?? null,
    invoiceId: b.invoice_id ? Number(b.invoice_id) : null,
    inActiveBoletim: inBoletim.has(String(b.id)),
  });
}

export async function leftoverMapForAlerts(alerts: RawBillingAlert[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const open = alerts.filter((a) => !a.resolved);
  if (open.length === 0) return map;

  const inBoletim = await loadActiveBoletimBillingIds();
  const osNums = Array.from(new Set(
    open
      .filter((a) => String(a.alert_type || "") === "OS_ESQUECIDA" && FATURAMENTO_ALERT_TYPES.has(String(a.alert_type || "")))
      .flatMap((a) => String(a.os_numbers || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)),
  ));

  const billsByOs = new Map<string, any[]>();
  if (osNums.length) {
    const bills = await fetchIn("escort_billings", "os_number", osNums, "id, os_number, status, invoice_id, service_order_id");
    for (const b of bills) {
      const n = String(b.os_number || "");
      const arr = billsByOs.get(n) || [];
      arr.push(b);
      billsByOs.set(n, arr);
    }
  }

  const periodKeys = new Map<string, RawBillingAlert[]>();
  for (const a of open) {
    const type = String(a.alert_type || "");
    if (!FATURAMENTO_ALERT_TYPES.has(type) || type === "OS_ESQUECIDA") continue;
    if (!a.period_start || !a.period_end || !a.client_id) {
      map.set(String(a.id), []);
      continue;
    }
    const key = `${a.client_id}|${String(a.period_start).slice(0, 10)}|${String(a.period_end).slice(0, 10)}`;
    const arr = periodKeys.get(key) || [];
    arr.push(a);
    periodKeys.set(key, arr);
  }

  const osByIdCache = new Map<number, { status?: string | null; os_number?: string | null }>();
  for (const [, bills] of billsByOs) {
    const extra = await osMapForBillings(bills);
    for (const [k, v] of extra) osByIdCache.set(k, v);
  }

  for (const a of open) {
    if (String(a.alert_type || "") !== "OS_ESQUECIDA") continue;
    const nums = String(a.os_numbers || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const bills = nums.flatMap((n) => billsByOs.get(n) || []);
    map.set(String(a.id), leftoverOsNumbers(factsFromBillings(bills, osByIdCache, inBoletim)));
  }

  for (const [key, group] of periodKeys) {
    const [clientId, start, end] = key.split("|");
    const { data: bills, error } = await supabaseAdmin
      .from("escort_billings")
      .select("id, os_number, status, invoice_id, service_order_id, data_missao")
      .eq("client_id", Number(clientId))
      .gte("data_missao", start)
      .lte("data_missao", `${end}T23:59:59`);
    if (error) throw new Error(`escort_billings period: ${error.message}`);
    const inWindow = (bills || []).filter((b: any) => {
      const d = String(b.data_missao || "").slice(0, 10);
      return d >= start && d <= end;
    });
    const leftover = await leftoverOsForBillings(inWindow, inBoletim);
    for (const a of group) map.set(String(a.id), leftover);
  }

  return map;
}

export async function listVisibleBillingAlerts(raw: RawBillingAlert[]): Promise<VisibleBillingAlert[]> {
  const leftover = await leftoverMapForAlerts(raw);
  return refineBillingAlerts(raw, leftover);
}
