import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireFinanceiro } from "../auth";
import { buildControleFaturamento } from "../lib/faturamento-controle";
import { listVisibleBillingAlerts } from "../lib/billing-alert-live";

const OS_COLS = "id, os_number, status, client_id, scheduled_date, completed_date";
const BILLING_COLS = "id, client_id, service_order_id, data_missao, status, invoice_id, fat_total, fat_acionamento, fat_hora_extra, fat_km, fat_adicional_noturno, fat_estadia, fat_pernoite, despesas_pedagio, despesas_outras, receitas_os";
const INV_COLS = "id, status, value, due_date, payment_date, created_at";
const CHUNK = 200;

async function fetchByIds(table: string, col: string, ids: Array<string | number>, select: string): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin.from(table).select(select).in(col, slice);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
  }
  return all;
}

export function registerControleFaturamentoRoutes(app: Express) {
  app.get("/api/controle-faturamento", requireAuth, requireFinanceiro, async (req: Request, res: Response) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const defaultFrom = today.slice(0, 8) + "01";
      const from = String(req.query.from || defaultFrom).slice(0, 10);
      const to = String(req.query.to || today).slice(0, 10);
      const onlyClient = req.query.clientId ? Number(req.query.clientId) : null;

      let clientsQ = supabaseAdmin.from("clients").select("id, name, billing_cycle, payment_terms_days").order("name");
      if (onlyClient) clientsQ = clientsQ.eq("id", onlyClient);
      const { data: clients, error: cErr } = await clientsQ;
      if (cErr) throw cErr;

      let osQ = supabaseAdmin
        .from("service_orders")
        .select(OS_COLS)
        .gte("scheduled_date", `${from}T00:00:00`)
        .lte("scheduled_date", `${to}T23:59:59`)
        .limit(5000);
      if (onlyClient) osQ = osQ.eq("client_id", onlyClient);
      const { data: osBySchedule, error: osErr } = await osQ;
      if (osErr) throw osErr;

      let billQ = supabaseAdmin
        .from("escort_billings")
        .select(BILLING_COLS)
        .gte("data_missao", from)
        .lte("data_missao", to)
        .limit(5000);
      if (onlyClient) billQ = billQ.eq("client_id", onlyClient);
      const { data: billingsRange, error: bErr } = await billQ;
      if (bErr) throw bErr;

      const osIds = new Set<number>((osBySchedule || []).map((o: any) => Number(o.id)));
      const missingOsIds = Array.from(new Set(
        (billingsRange || []).map((b: any) => Number(b.service_order_id)).filter((id: number) => id && !osIds.has(id)),
      ));
      const extraOs = missingOsIds.length ? await fetchByIds("service_orders", "id", missingOsIds, OS_COLS) : [];
      const orders = [...(osBySchedule || []), ...extraOs];

      const orderIds = orders.map((o: any) => Number(o.id)).filter(Boolean);
      const billingIdsFromRange = new Set((billingsRange || []).map((b: any) => String(b.id)));
      const extraBillings = orderIds.length
        ? (await fetchByIds("escort_billings", "service_order_id", orderIds, BILLING_COLS))
            .filter((b: any) => !billingIdsFromRange.has(String(b.id)))
        : [];
      const billings = [...(billingsRange || []), ...extraBillings];

      const invoiceIds = Array.from(new Set(billings.map((b: any) => b.invoice_id).filter(Boolean)));
      const invoices = invoiceIds.length ? await fetchByIds("invoices", "id", invoiceIds, INV_COLS) : [];

      const { data: alerts } = await supabaseAdmin
        .from("billing_alerts")
        .select("id, client_id, client_name, alert_type, message, os_numbers, period_start, period_end, resolved")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(80);

      const visible = await listVisibleBillingAlerts(alerts || []);

      const payload = buildControleFaturamento({
        today,
        from,
        to,
        clients: clients || [],
        orders,
        billings,
        invoices,
        alerts: visible.map((a) => ({
          id: a.id,
          client_name: a.clientName,
          alert_type: a.alertType,
          message: a.message,
          period_start: a.periodStart,
          period_end: a.periodEnd,
          resolved: false,
        })),
      });

      res.json(payload);
    } catch (err: any) {
      console.error("[controle-faturamento]", err?.message);
      res.status(500).json({ message: err?.message || "Falha ao montar o controle de faturamento" });
    }
  });
}
