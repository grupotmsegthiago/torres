/**
 * Ciclo de faturamento do cadastro do cliente (FATO: clients.billing_cycle).
 * Uma regra só: quinzenal 1–15 / 16–fim; mensal 1–último dia; diário = o próprio dia.
 * Usado pelo controle da Diretoria, gate do boletim e alertas do Financeiro.
 */

export type BillingCycleKind = "quinzenal" | "mensal" | "diario" | "por_missao" | "indefinido";

export interface CyclePeriod {
  cycle: BillingCycleKind;
  start: string;
  end: string;
  label: string;
  dueBy: string;
  key: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function lastDayOfMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function ymdOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function nextMonthDay(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const last = lastDayOfMonth(`${ny}-${pad(nm)}`);
  return ymdOf(ny, nm, Math.min(day, last));
}

export function normalizeBillingCycle(raw: unknown): BillingCycleKind {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "quinzenal" || s === "quinzena") return "quinzenal";
  if (s === "mensal" || s === "mes") return "mensal";
  if (s === "diario" || s === "daily") return "diario";
  if (s === "por_missao" || s === "por missao" || s === "por-missao") return "por_missao";
  return "indefinido";
}

export function billingCycleLabel(cycle: BillingCycleKind): string {
  switch (cycle) {
    case "quinzenal":
      return "Quinzenal";
    case "mensal":
      return "Mensal";
    case "diario":
      return "Diário";
    case "por_missao":
      return "Por missão";
    default:
      return "Sem ciclo";
  }
}

/** Período comercial que contém a data (YYYY-MM-DD). */
export function periodForDate(cycle: BillingCycleKind, dateStr: string): CyclePeriod {
  const ymd = String(dateStr || "").slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) {
    return { cycle, start: ymd, end: ymd, label: ymd || "—", dueBy: ymd, key: `${cycle}:${ymd}` };
  }
  const ym = `${y}-${pad(m)}`;
  const last = lastDayOfMonth(ym);

  if (cycle === "diario") {
    return {
      cycle,
      start: ymd,
      end: ymd,
      label: `${pad(d)}/${pad(m)}/${y}`,
      dueBy: ymd,
      key: `D:${ymd}`,
    };
  }

  if (cycle === "quinzenal") {
    if (d <= 15) {
      return {
        cycle,
        start: `${ym}-01`,
        end: `${ym}-15`,
        label: `1ª quinzena ${pad(m)}/${y}`,
        dueBy: `${ym}-17`,
        key: `Q1:${ym}`,
      };
    }
    return {
      cycle,
      start: `${ym}-16`,
      end: `${ym}-${pad(last)}`,
      label: `2ª quinzena ${pad(m)}/${y}`,
      dueBy: nextMonthDay(ym, 2),
      key: `Q2:${ym}`,
    };
  }

  if (cycle === "mensal") {
    return {
      cycle,
      start: `${ym}-01`,
      end: `${ym}-${pad(last)}`,
      label: `${pad(m)}/${y}`,
      dueBy: nextMonthDay(ym, 5),
      key: `M:${ym}`,
    };
  }

  return {
    cycle,
    start: ymd,
    end: ymd,
    label: `${pad(d)}/${pad(m)}/${y}`,
    dueBy: ymd,
    key: `${cycle}:${ymd}`,
  };
}

export function periodClosed(period: CyclePeriod, today: string): boolean {
  return today > period.end;
}

export function isRecusadaOs(osStatus?: string | null, billingStatus?: string | null): boolean {
  const os = String(osStatus || "").toLowerCase();
  const bill = String(billingStatus || "").toUpperCase();
  return os === "recusada" || bill === "REJEITADA" || bill === "RECUSADA";
}

/** OS que entra no boletim / precisa ser faturada. Recusada fica de fora (§8.1). */
export function isBillableOs(osStatus?: string | null, billingStatus?: string | null): boolean {
  return !isRecusadaOs(osStatus, billingStatus);
}

const READY = new Set(["APROVADA", "FATURADO", "FATURADA", "PAGO", "CANCELADO", "CANCELADA"]);
const INVOICED = new Set(["FATURADO", "FATURADA", "PAGO"]);

/**
 * Pronta para boletim comercial: APROVADA interna, ou cancelada já calculada,
 * ou já faturada/paga. A_VERIFICAR / sem billing = não.
 */
export function isOsReadyForBoletim(osStatus?: string | null, billingStatus?: string | null): boolean {
  if (isRecusadaOs(osStatus, billingStatus)) return false;
  return READY.has(String(billingStatus || "").toUpperCase());
}

export function isOsInvoicedStatus(billingStatus?: string | null): boolean {
  return INVOICED.has(String(billingStatus || "").toUpperCase());
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${toYmd.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export interface CoverageOs {
  id: number;
  osNumber: string;
  status: string;
  date: string;
  billingId?: string | number | null;
  billingStatus?: string | null;
}

export interface BoletimCoverageResult {
  ok: boolean;
  code?: "BOLETIM_CICLOS_MISTURADOS" | "BOLETIM_COBERTURA_INCOMPLETA" | "BOLETIM_OS_NAO_APROVADA";
  message?: string;
  period: CyclePeriod | null;
  missing: CoverageOs[];
  notApproved: CoverageOs[];
  recusadas: CoverageOs[];
}

/**
 * Gate do envio de boletim: o lote tem que cobrir TODAS as OS faturáveis do
 * ciclo do cliente e cada uma precisa estar APROVADA (cancelada calculada vale).
 */
export function assessBoletimCoverage(opts: {
  cycle: BillingCycleKind;
  selectedOsIds: number[];
  allOsInWindow: CoverageOs[];
}): BoletimCoverageResult {
  const selected = new Set(opts.selectedOsIds.map(Number));
  const recusadas = opts.allOsInWindow.filter((o) => isRecusadaOs(o.status, o.billingStatus));
  const billable = opts.allOsInWindow.filter((o) => isBillableOs(o.status, o.billingStatus));

  const selectedOs = billable.filter((o) => selected.has(Number(o.id)));
  const dates = selectedOs.map((o) => o.date).filter(Boolean);
  if (dates.length === 0 && opts.cycle !== "por_missao" && opts.cycle !== "indefinido") {
    const anySelected = opts.allOsInWindow.filter((o) => selected.has(Number(o.id)));
    const fallbackDates = anySelected.map((o) => o.date).filter(Boolean);
    if (fallbackDates.length === 0) {
      return {
        ok: false,
        code: "BOLETIM_OS_NAO_APROVADA",
        message: "Nenhuma OS faturável selecionada para o boletim.",
        period: null,
        missing: [],
        notApproved: [],
        recusadas,
      };
    }
  }

  const cycle = opts.cycle;
  const periodDates = (dates.length ? dates : billable.filter((o) => selected.has(Number(o.id))).map((o) => o.date)).filter(Boolean);
  const periods = [...new Set(periodDates.map((d) => periodForDate(cycle, d).key))];
  if (cycle !== "por_missao" && cycle !== "indefinido" && periods.length > 1) {
    return {
      ok: false,
      code: "BOLETIM_CICLOS_MISTURADOS",
      message: "As OS selecionadas pertencem a ciclos diferentes. Gere um boletim por quinzena/mês/dia.",
      period: null,
      missing: [],
      notApproved: [],
      recusadas,
    };
  }

  const period = periodDates[0] ? periodForDate(cycle, periodDates[0]) : null;
  const inPeriod = cycle === "por_missao" || cycle === "indefinido"
    ? billable.filter((o) => selected.has(Number(o.id)))
    : billable.filter((o) => o.date >= period!.start && o.date <= period!.end);

  const missing = inPeriod.filter((o) => !selected.has(Number(o.id)));
  const selectedInPeriod = inPeriod.filter((o) => selected.has(Number(o.id)));
  const notApproved = selectedInPeriod.filter((o) => !isOsReadyForBoletim(o.status, o.billingStatus));
  const missingNotReady = missing; // missing already implies not in lote

  if (missing.length > 0) {
    const labels = missing.slice(0, 8).map((o) => o.osNumber).join(", ");
    const extra = missing.length > 8 ? ` e mais ${missing.length - 8}` : "";
    return {
      ok: false,
      code: "BOLETIM_COBERTURA_INCOMPLETA",
      message: `Não é possível gerar o boletim: faltam ${missing.length} OS do ciclo ${period?.label || ""} (${labels}${extra}). Inclua todas as OS do período.`,
      period,
      missing,
      notApproved,
      recusadas,
    };
  }

  if (notApproved.length > 0) {
    const labels = notApproved.slice(0, 8).map((o) => o.osNumber).join(", ");
    const extra = notApproved.length > 8 ? ` e mais ${notApproved.length - 8}` : "";
    return {
      ok: false,
      code: "BOLETIM_OS_NAO_APROVADA",
      message: `Não é possível gerar o boletim: ${notApproved.length} OS ainda não estão APROVADAS (${labels}${extra}). Aprove internamente antes de enviar ao cliente.`,
      period,
      missing: missingNotReady,
      notApproved,
      recusadas,
    };
  }

  return { ok: true, period, missing: [], notApproved: [], recusadas };
}
