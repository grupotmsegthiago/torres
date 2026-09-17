import { supabaseAdmin } from "../supabase";
import { fetchAllSupabaseRows } from "./supabase-page";

/**
 * Período comercial da missão: data agendada/concluída da OS, não o instante
 * em que o billing foi gravado. Cancelada criada depois caía fora da quinzena
 * (TOR-0833/TOR-0845: missão 14–15/09, billing.data_missao 17/09).
 */
export function missionDateYmd(os?: any, billing?: any): string {
  const raw =
    os?.scheduledDate ??
    os?.scheduled_date ??
    os?.completedDate ??
    os?.completed_date ??
    billing?.data_missao ??
    "";
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export function ymdInInclusiveRange(ymd: string, startYmd: string, endYmd: string): boolean {
  if (!ymd || !startYmd || !endYmd) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

function isoDatePrefix(iso: string): string {
  const m = String(iso || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/**
 * Billings cuja data_missao está fora da janela, mas a OS ocorreu nela.
 * Sem isso, cancelada gravada no dia do lançamento some do relatório/fatura.
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
  const fromYmd = isoDatePrefix(opts.fromIso);
  const toYmd = isoDatePrefix(opts.toIso);
  if (!fromYmd || !toYmd) return [];

  const sos = await fetchAllSupabaseRows((offset, limitTo) =>
    supabaseAdmin
      .from("service_orders")
      .select("id, scheduled_date, completed_date")
      .eq("client_id", opts.clientId)
      .gte("scheduled_date", `${fromYmd}T00:00:00-03:00`)
      .lte("scheduled_date", `${toYmd}T23:59:59-03:00`)
      .range(offset, limitTo),
  );

  const missing = sos
    .map((o: any) => Number(o.id))
    .filter((id) => id > 0 && !have.has(id));
  if (missing.length === 0) return [];

  const extra: any[] = [];
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await fetchAllSupabaseRows((offset, limitTo) =>
      supabaseAdmin
        .from("escort_billings")
        .select("*")
        .in("service_order_id", chunk)
        .range(offset, limitTo),
    );
    extra.push(...rows);
  }
  return extra;
}
