import { supabaseAdmin } from "../supabase";
import { fetchAllSupabaseRows } from "./supabase-page";
import { missionDateYmd, ymdInInclusiveRange } from "../../shared/billing-cycle";

export { missionDateYmd, ymdInInclusiveRange };

function isoDatePrefix(iso: string): string {
  const m = String(iso || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function brtBounds(fromIso: string, toIso: string): { fromYmd: string; toYmd: string } | null {
  const fromYmd = isoDatePrefix(fromIso);
  const toYmd = isoDatePrefix(toIso);
  if (!fromYmd || !toYmd) return null;
  return { fromYmd, toYmd };
}

/** OS cujo agendamento cai na janela (BRT). Fonte da quinzena comercial. */
export async function fetchServiceOrdersScheduledInWindow(opts: {
  clientId: number;
  fromIso: string;
  toIso: string;
}): Promise<any[]> {
  const bounds = brtBounds(opts.fromIso, opts.toIso);
  if (!bounds) return [];

  return fetchAllSupabaseRows((offset, limitTo) =>
    supabaseAdmin
      .from("service_orders")
      .select("id, os_number, status, scheduled_date, completed_date")
      .eq("client_id", opts.clientId)
      .gte("scheduled_date", `${bounds.fromYmd}T00:00:00-03:00`)
      .lte("scheduled_date", `${bounds.toYmd}T23:59:59-03:00`)
      .range(offset, limitTo),
  );
}

/**
 * Billings das OS agendadas na janela — exclusivos dessa quinzena.
 * Missão 14–15/09 entra na 1ª; billing gravado em 17/09 não a joga para a 2ª.
 */
export async function fetchBillingsByScheduledWindow(opts: {
  clientId: number;
  fromIso: string;
  toIso: string;
}): Promise<any[]> {
  const bounds = brtBounds(opts.fromIso, opts.toIso);
  if (!bounds) return [];

  const sos = await fetchServiceOrdersScheduledInWindow(opts);
  const ids = sos.map((o: any) => Number(o.id)).filter((id) => id > 0);
  if (ids.length === 0) return [];

  const soById = new Map<number, any>(sos.map((o: any) => [Number(o.id), o]));
  const extra: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await fetchAllSupabaseRows((offset, limitTo) =>
      supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("client_id", opts.clientId)
        .in("service_order_id", chunk)
        .range(offset, limitTo),
    );
    extra.push(...rows);
  }

  return extra.filter((b) => {
    const ymd = missionDateYmd(soById.get(Number(b.service_order_id)), b);
    return ymdInInclusiveRange(ymd, bounds.fromYmd, bounds.toYmd);
  });
}

/**
 * Billings cuja data_missao está fora da janela, mas a OS ocorreu nela.
 * Mantido para chamadas antigas; o filtro oficial é fetchBillingsByScheduledWindow.
 */
export async function fetchBillingsForOsScheduledInWindow(opts: {
  clientId: number;
  fromIso: string;
  toIso: string;
  alreadyHaveOsIds: Iterable<number | string | null | undefined>;
}): Promise<any[]> {
  const have = new Set(
    [...opts.alreadyHaveOsIds].map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0),
  );
  const all = await fetchBillingsByScheduledWindow({
    clientId: opts.clientId,
    fromIso: opts.fromIso,
    toIso: opts.toIso,
  });
  return all.filter((b) => {
    const soId = Number(b.service_order_id);
    return soId > 0 && !have.has(soId);
  });
}
