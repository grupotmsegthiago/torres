/**
 * Controle de cobertura de faturamento — PROJEÇÃO (camada 11).
 * Lê fatos (OS, clients) + snapshots (escort_billings) + cobrança (invoices).
 * Não grava, não recalcula preço. Valor oficial = billingTotalForBoletim.
 */

import { billingTotalForBoletim, round2 } from "./boletim-totals";
import {
  type BillingCycleKind,
  type CyclePeriod,
  billingCycleLabel,
  daysBetween,
  isBillableOs,
  isOsReadyForBoletim,
  normalizeBillingCycle,
  periodClosed,
  periodForDate,
} from "../../shared/billing-cycle";

const PAID = new Set(["RECEIVED", "CONFIRMED", "PAID", "RECEIVED_IN_CASH"]);
const CANCELLED_INV = new Set(["CANCELLED", "CANCELED"]);

export type Semaforo = "verde" | "amarelo" | "vermelho";
export type RowStatus =
  | "FALTA_OS"
  | "SEM_APROVACAO"
  | "A_FATURAR"
  | "EM_ABERTO"
  | "ATRASADO"
  | "PAGO"
  | "CICLO_ABERTO";

export interface ControleOsItem {
  id: number;
  osNumber: string;
  date: string;
  status: string;
  billingStatus: string | null;
  ready: boolean;
  invoiced: boolean;
  paid: boolean;
  valor: number;
}

export interface ControlePeriodoRow {
  clientId: number;
  clientName: string;
  cycle: BillingCycleKind;
  cycleLabel: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  dueBy: string;
  osTotal: number;
  osReady: number;
  osFaturadas: number;
  osPagas: number;
  osFaltando: number;
  osSemAprovacao: number;
  valorTotal: number;
  valorAberto: number;
  valorPago: number;
  dataFaturamento: string | null;
  dataPagamento: string | null;
  diasAtraso: number | null;
  status: RowStatus;
  semaforo: Semaforo;
  os: ControleOsItem[];
}

export interface ControleKpis {
  semaforo: Semaforo;
  osSemFaturar: number;
  osSemAprovacao: number;
  ciclosAtrasados: number;
  valorAberto: number;
  valorPago: number;
  diasAtrasoMedio: number | null;
  alertasAbertos: number;
}

export interface ControleFaturamentoResult {
  fonte: "projecao_cobertura";
  period: { from: string; to: string; today: string };
  kpis: ControleKpis;
  rows: ControlePeriodoRow[];
  alertas: Array<{
    id: number | string;
    clientName: string;
    alertType: string;
    message: string;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
}

export interface ControleClient {
  id: number;
  name: string;
  billing_cycle?: string | null;
  payment_terms_days?: number | null;
}

export interface ControleOs {
  id: number;
  os_number?: string | null;
  status?: string | null;
  client_id: number;
  scheduled_date?: string | null;
  completed_date?: string | null;
}

export interface ControleBilling {
  id: string | number;
  client_id?: number | null;
  service_order_id?: number | null;
  data_missao?: string | null;
  status?: string | null;
  invoice_id?: number | null;
  fat_total?: number | string | null;
  fat_acionamento?: number | string | null;
  fat_hora_extra?: number | string | null;
  fat_km?: number | string | null;
  fat_adicional_noturno?: number | string | null;
  fat_estadia?: number | string | null;
  fat_pernoite?: number | string | null;
  despesas_pedagio?: number | string | null;
  despesas_outras?: number | string | null;
  receitas_os?: number | string | null;
}

export interface ControleInvoice {
  id: number;
  status?: string | null;
  value?: number | string | null;
  due_date?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
}

export interface ControleAlert {
  id: number | string;
  client_name?: string | null;
  alert_type?: string | null;
  message?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  resolved?: boolean | null;
}

function ymd(v: unknown): string {
  const s = String(v || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function invoicePaid(inv: ControleInvoice | undefined): boolean {
  if (!inv) return false;
  return PAID.has(String(inv.status || "").toUpperCase());
}

function invoiceCancelled(inv: ControleInvoice | undefined): boolean {
  if (!inv) return false;
  return CANCELLED_INV.has(String(inv.status || "").toUpperCase());
}

function classifyRow(args: {
  today: string;
  period: CyclePeriod;
  osFaltando: number;
  osSemAprovacao: number;
  osTotal: number;
  osFaturadas: number;
  osPagas: number;
  dueDate: string | null;
  paymentDate: string | null;
}): { status: RowStatus; semaforo: Semaforo; diasAtraso: number | null } {
  const closed = periodClosed(args.period, args.today);
  if (args.osFaltando > 0) {
    return { status: "FALTA_OS", semaforo: "vermelho", diasAtraso: closed ? Math.max(0, daysBetween(args.period.dueBy, args.today)) : null };
  }
  if (args.osSemAprovacao > 0) {
    return { status: "SEM_APROVACAO", semaforo: closed ? "vermelho" : "amarelo", diasAtraso: closed ? Math.max(0, daysBetween(args.period.dueBy, args.today)) : null };
  }
  if (args.osFaturadas < args.osTotal) {
    if (!closed) return { status: "CICLO_ABERTO", semaforo: "amarelo", diasAtraso: null };
    const dias = Math.max(0, daysBetween(args.period.dueBy, args.today));
    return { status: "A_FATURAR", semaforo: dias > 0 ? "vermelho" : "amarelo", diasAtraso: dias || null };
  }
  if (args.osPagas >= args.osTotal && args.osTotal > 0) {
    let dias: number | null = null;
    if (args.paymentDate && args.dueDate && args.paymentDate > args.dueDate) {
      dias = daysBetween(args.dueDate, args.paymentDate);
    }
    return { status: "PAGO", semaforo: "verde", diasAtraso: dias && dias > 0 ? dias : null };
  }
  const due = args.dueDate || args.period.dueBy;
  if (due && args.today > due) {
    return { status: "ATRASADO", semaforo: "vermelho", diasAtraso: daysBetween(due, args.today) };
  }
  return { status: "EM_ABERTO", semaforo: "amarelo", diasAtraso: null };
}

export function buildControleFaturamento(input: {
  today: string;
  from: string;
  to: string;
  clients: ControleClient[];
  orders: ControleOs[];
  billings: ControleBilling[];
  invoices: ControleInvoice[];
  alerts?: ControleAlert[];
}): ControleFaturamentoResult {
  const clientMap = new Map(input.clients.map((c) => [Number(c.id), c]));
  const billingByOs = new Map<number, ControleBilling>();
  for (const b of input.billings) {
    const soId = Number(b.service_order_id || 0);
    if (soId) billingByOs.set(soId, b);
  }
  const invoiceMap = new Map(input.invoices.map((i) => [Number(i.id), i]));

  const groups = new Map<string, { client: ControleClient; period: CyclePeriod; items: ControleOsItem[] }>();

  for (const os of input.orders) {
    const client = clientMap.get(Number(os.client_id));
    if (!client) continue;
    const billing = billingByOs.get(Number(os.id));
    if (!isBillableOs(os.status, billing?.status)) continue;

    const date = ymd(billing?.data_missao) || ymd(os.scheduled_date) || ymd(os.completed_date);
    if (!date || date < input.from || date > input.to) continue;

    const cycle = normalizeBillingCycle(client.billing_cycle);
    const period = periodForDate(cycle === "indefinido" ? "mensal" : cycle, date);
    const key = `${client.id}|${period.key}`;
    const inv = billing?.invoice_id ? invoiceMap.get(Number(billing.invoice_id)) : undefined;
    const liveInv = inv && !invoiceCancelled(inv) ? inv : undefined;
    const item: ControleOsItem = {
      id: Number(os.id),
      osNumber: String(os.os_number || `OS-${os.id}`),
      date,
      status: String(os.status || ""),
      billingStatus: billing?.status ? String(billing.status) : null,
      ready: isOsReadyForBoletim(os.status, billing?.status),
      invoiced: !!liveInv,
      paid: invoicePaid(liveInv),
      valor: billing ? billingTotalForBoletim(billing, os.status || undefined) : 0,
    };
    const g = groups.get(key);
    if (g) g.items.push(item);
    else groups.set(key, { client, period, items: [item] });
  }

  const rows: ControlePeriodoRow[] = [];
  for (const g of groups.values()) {
    const osTotal = g.items.length;
    const osReady = g.items.filter((i) => i.ready).length;
    const osFaturadas = g.items.filter((i) => i.invoiced).length;
    const osPagas = g.items.filter((i) => i.paid).length;
    const semBilling = g.items.filter((i) => !i.billingStatus).length;
    const semAprovacao = g.items.filter((i) => i.billingStatus && !i.ready && !i.invoiced).length;
    const valorTotal = round2(g.items.reduce((s, i) => s + i.valor, 0));
    const valorPago = round2(g.items.filter((i) => i.paid).reduce((s, i) => s + i.valor, 0));
    const valorAberto = round2(g.items.filter((i) => i.invoiced && !i.paid).reduce((s, i) => s + i.valor, 0)
      + g.items.filter((i) => !i.invoiced).reduce((s, i) => s + i.valor, 0));

    const invoicedItems = g.items.filter((i) => i.invoiced);
    const fatDates = invoicedItems
      .map((i) => {
        const bill = billingByOs.get(i.id);
        const inv = bill?.invoice_id ? invoiceMap.get(Number(bill.invoice_id)) : undefined;
        return ymd(inv?.created_at);
      })
      .filter(Boolean)
      .sort();
    const payDates = invoicedItems
      .map((i) => {
        const bill = billingByOs.get(i.id);
        const inv = bill?.invoice_id ? invoiceMap.get(Number(bill.invoice_id)) : undefined;
        return invoicePaid(inv) ? ymd(inv?.payment_date) : "";
      })
      .filter(Boolean)
      .sort();
    const dueDates = invoicedItems
      .map((i) => {
        const bill = billingByOs.get(i.id);
        const inv = bill?.invoice_id ? invoiceMap.get(Number(bill.invoice_id)) : undefined;
        return ymd(inv?.due_date);
      })
      .filter(Boolean)
      .sort();

    const dataFaturamento = fatDates[0] || null;
    const allPaid = osPagas === osTotal && osTotal > 0;
    const dataPagamento = allPaid ? (payDates[payDates.length - 1] || null) : null;
    const dueDate = dueDates[0] || g.period.dueBy;

    const classif = classifyRow({
      today: input.today,
      period: g.period,
      osFaltando: semBilling,
      osSemAprovacao: semAprovacao,
      osTotal,
      osFaturadas,
      osPagas,
      dueDate,
      paymentDate: dataPagamento,
    });

    const cycleKind = normalizeBillingCycle(g.client.billing_cycle);
    rows.push({
      clientId: Number(g.client.id),
      clientName: g.client.name,
      cycle: cycleKind,
      cycleLabel: billingCycleLabel(cycleKind),
      periodStart: g.period.start,
      periodEnd: g.period.end,
      periodLabel: g.period.label,
      dueBy: g.period.dueBy,
      osTotal,
      osReady,
      osFaturadas,
      osPagas,
      osFaltando: semBilling,
      osSemAprovacao: semAprovacao,
      valorTotal,
      valorAberto,
      valorPago,
      dataFaturamento,
      dataPagamento,
      diasAtraso: classif.diasAtraso,
      status: classif.status,
      semaforo: classif.semaforo,
      os: g.items.sort((a, b) => a.date.localeCompare(b.date) || a.osNumber.localeCompare(b.osNumber)),
    });
  }

  rows.sort((a, b) => {
    const rank = { vermelho: 0, amarelo: 1, verde: 2 };
    const d = rank[a.semaforo] - rank[b.semaforo];
    if (d !== 0) return d;
    return a.clientName.localeCompare(b.clientName, "pt-BR") || a.periodStart.localeCompare(b.periodStart);
  });

  const osSemFaturar = rows.reduce((s, r) => s + Math.max(0, r.osTotal - r.osFaturadas), 0);
  const osSemAprovacao = rows.reduce((s, r) => s + r.osSemAprovacao, 0);
  const ciclosAtrasados = rows.filter((r) => r.status === "ATRASADO" || (r.semaforo === "vermelho" && r.status !== "PAGO")).length;
  const valorAberto = round2(rows.reduce((s, r) => s + r.valorAberto, 0));
  const valorPago = round2(rows.reduce((s, r) => s + r.valorPago, 0));
  const atrasos = rows.map((r) => r.diasAtraso).filter((n): n is number => n != null && n > 0);
  const diasAtrasoMedio = atrasos.length ? Math.round(atrasos.reduce((s, n) => s + n, 0) / atrasos.length) : null;
  const alertas = (input.alerts || [])
    .filter((a) => !a.resolved)
    .map((a) => ({
      id: a.id,
      clientName: String(a.client_name || "—"),
      alertType: String(a.alert_type || ""),
      message: String(a.message || ""),
      periodStart: a.period_start ? ymd(a.period_start) : null,
      periodEnd: a.period_end ? ymd(a.period_end) : null,
    }));

  const worst: Semaforo = rows.some((r) => r.semaforo === "vermelho")
    ? "vermelho"
    : rows.some((r) => r.semaforo === "amarelo")
      ? "amarelo"
      : "verde";

  return {
    fonte: "projecao_cobertura",
    period: { from: input.from, to: input.to, today: input.today },
    kpis: {
      semaforo: worst,
      osSemFaturar,
      osSemAprovacao,
      ciclosAtrasados,
      valorAberto,
      valorPago,
      diasAtrasoMedio,
      alertasAbertos: alertas.length,
    },
    rows,
    alertas,
  };
}
