// Situação financeira por OS — Etapa 1 do Vínculo OS↔Fatura (Task #161).
//
// FONTE ÚNICA: o status financeiro de uma OS é uma PROJEÇÃO calculada dos
// registros reais (escort_billings.invoice_id → invoices.status/due_date/nfse_*),
// nunca uma flag manual. O status do billing (FATURADO/PAGO) entra apenas como
// evidência para detectar divergência — não como fonte do status exibido.
//
// Este módulo NUNCA grava nada — é visão de leitura, irmão de billing-display.ts.

import { brtDateKey } from "./brt-date";

/** Status financeiro padronizado de uma OS. */
export type SituacaoFinanceiraStatus =
  | "NAO_FATURADA"          // sem fatura vinculada
  | "AGUARDANDO_PAGAMENTO"  // fatura emitida, em aberto, dentro do vencimento
  | "VENCIDA"               // fatura em aberto com vencimento ultrapassado
  | "PAGA"                  // fatura recebida/confirmada (ou baixa em dinheiro)
  | "PARCIALMENTE_PAGA"     // recebimento parcial — valor alocado não quita a OS
  | "ESTORNADA"             // pagamento estornado no gateway
  | "FATURA_CANCELADA"      // fatura cancelada no gateway
  | "SEM_COBRANCA"          // OS recusada — R$ 0, não há o que cobrar (§8.1)
  | "DIVERGENCIA";          // evidências conflitam — precisa de análise

export interface SituacaoFinanceiraOS {
  status: SituacaoFinanceiraStatus;
  /** explicação curta para o usuário (ex.: "Vencida há 8 dias") */
  detalhe: string | null;
  /** causa quando status = DIVERGENCIA */
  causaDivergencia: string | null;
  faturaId: number | null;
  faturaStatus: string | null;
  faturaValor: number | null;
  faturaLiquido: number | null;
  /** nº de OSs/billings vinculados à mesma fatura (fatura agrupada quando > 1) */
  faturaQtdOs: number | null;
  vencimento: string | null;      // YYYY-MM-DD
  diasAtraso: number | null;      // só quando VENCIDA
  dataPagamento: string | null;
  gateway: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  nfNumero: string | null;
  nfStatus: string | null;
  nfUrl: string | null;
  billingStatus: string | null;
  /** valor oficial da OS (fat_total congelado / soma canônica) — vem do caller */
  valorOs: number | null;
  // ---- Etapa 2: rateio do recebimento por OS ----
  /** valor já recebido/alocado para ESTA OS dentro da fatura */
  valorAlocado: number | null;
  /** saldo em aberto desta OS (valor do item - alocado) */
  saldoOs: number | null;
  /** participação % desta OS no total da fatura */
  participacaoPct: number | null;
  /** % da fatura já recebido (todas as OSs) */
  percentualFaturaRecebido: number | null;
}

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const OPEN = new Set(["PENDING", "OVERDUE", "AWAITING_PAYMENT", "AWAITING_RISK_ANALYSIS"]);
const CANCELLED = new Set(["CANCELLED", "CANCELED"]); // gateway usa as duas grafias

const n = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function diffDias(hoje: string, venc: string): number {
  const a = new Date(hoje + "T12:00:00Z").getTime();
  const b = new Date(venc + "T12:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

export interface DerivarInput {
  billing: any | null;        // linha de escort_billings (snake_case) ou null
  invoice: any | null;        // linha de invoices ou null
  osStatus?: string | null;   // status da service_order
  /** nº de billings vinculados à mesma invoice (default 1) */
  invoiceBillingCount?: number;
  /** data de hoje BRT YYYY-MM-DD (injetável p/ teste) */
  hoje?: string;
  /** valor oficial da OS já resolvido pelo caller (oficialBillingView.total) */
  valorOs?: number | null;
  /** item da fatura desta OS (invoice_billing_items) — Etapa 2 */
  item?: { valorItem: number; valorAlocado: number; participacaoPct?: number | null } | null;
  /** valor já recebido acumulado na fatura (invoices.valor_recebido) */
  invoiceValorRecebido?: number | null;
}

const TOL = 0.05; // tolerância de centavos p/ considerar OS quitada

export function derivarSituacaoFinanceira(inp: DerivarInput): SituacaoFinanceiraOS {
  const { billing, invoice, osStatus } = inp;
  const hoje = inp.hoje || brtDateKey(new Date().toISOString())!;

  const base: SituacaoFinanceiraOS = {
    status: "NAO_FATURADA",
    detalhe: null,
    causaDivergencia: null,
    faturaId: invoice?.id ?? billing?.invoice_id ?? null,
    faturaStatus: invoice?.status ?? null,
    faturaValor: n(invoice?.value),
    faturaLiquido: n(invoice?.net_value),
    faturaQtdOs: invoice ? Math.max(1, inp.invoiceBillingCount || 1) : null,
    vencimento: invoice?.due_date ? String(invoice.due_date).slice(0, 10) : null,
    diasAtraso: null,
    dataPagamento: invoice?.payment_date ? String(invoice.payment_date).slice(0, 10) : null,
    gateway: invoice?.gateway ?? null,
    invoiceUrl: invoice?.invoice_url ?? null,
    bankSlipUrl: invoice?.bank_slip_url ?? null,
    nfNumero: invoice?.nfse_number ?? null,
    nfStatus: invoice?.nfse_status ?? null,
    nfUrl: invoice?.nfse_url ?? null,
    billingStatus: billing?.status ?? null,
    valorOs: inp.valorOs ?? null,
    valorAlocado: inp.item ? n(inp.item.valorAlocado) : null,
    saldoOs: inp.item ? Math.max(0, Math.round(((inp.item.valorItem || 0) - (inp.item.valorAlocado || 0)) * 100) / 100) : null,
    participacaoPct: inp.item?.participacaoPct != null ? n(inp.item.participacaoPct) : null,
    percentualFaturaRecebido: (() => {
      const fv = n(invoice?.value);
      const rec = n(inp.invoiceValorRecebido);
      if (fv == null || fv <= 0 || rec == null) return null;
      return Math.min(100, Math.round((rec / fv) * 100));
    })(),
  };

  // §8.1 — recusada = R$ 0, nunca há cobrança.
  const isRecusada = osStatus === "recusada" || billing?.status === "RECUSADA" || billing?.status === "REJEITADA";
  if (isRecusada) {
    // Se mesmo assim existe fatura vinculada, é divergência (cobrança indevida).
    if (billing?.invoice_id != null) {
      return { ...base, status: "DIVERGENCIA", detalhe: "OS recusada com fatura vinculada", causaDivergencia: "OS recusada (R$ 0 obrigatório) está vinculada à fatura — cobrança indevida ou vínculo errado." };
    }
    return { ...base, status: "SEM_COBRANCA", detalhe: "OS recusada — R$ 0" };
  }

  // Sem fatura vinculada.
  if (!billing || billing.invoice_id == null) {
    if (billing?.status === "PAGO") {
      return { ...base, status: "DIVERGENCIA", detalhe: "Marcada PAGO sem fatura", causaDivergencia: "Billing está PAGO mas não há fatura vinculada — pagamento sem evidência rastreável." };
    }
    return { ...base, status: "NAO_FATURADA", detalhe: billing?.status === "APROVADA" ? "Aprovada — pronta p/ faturar" : null };
  }

  // invoice_id preenchido mas a fatura não existe mais.
  if (!invoice) {
    return { ...base, status: "DIVERGENCIA", detalhe: "Fatura vinculada não encontrada", causaDivergencia: `Billing aponta fatura #${billing.invoice_id}, que não existe — registro órfão.` };
  }

  const st = String(invoice.status || "").toUpperCase();

  // PARTIAL = recebimento parcial confirmado pelo gateway (Inter).
  if (PAID.has(st) || st === "PARTIAL") {
    const it = inp.item;
    // Etapa 2: com item de rateio, a OS só é PAGA se o alocado quita o item.
    if (it && it.valorItem > TOL) {
      const quitada = (it.valorAlocado || 0) >= it.valorItem - TOL;
      if (!quitada) {
        const pct = base.percentualFaturaRecebido;
        return {
          ...base, status: "PARCIALMENTE_PAGA",
          detalhe: `Parcialmente paga${pct != null ? ` — ${pct}% da fatura recebido` : ""}`,
        };
      }
    } else if (st === "PARTIAL") {
      return { ...base, status: "PARCIALMENTE_PAGA", detalhe: "Recebimento parcial (sem rateio por OS)" };
    }
    return { ...base, status: "PAGA", detalhe: st === "RECEIVED_IN_CASH" ? "Baixa manual — não conciliada" : null };
  }

  if (st === "REFUNDED") {
    return {
      ...base, status: "ESTORNADA", detalhe: "Pagamento estornado",
      causaDivergencia: billing.status === "PAGO"
        ? "Fatura estornada no gateway mas a OS continua marcada PAGO — reversão pendente."
        : null,
    };
  }

  if (CANCELLED.has(st)) {
    if (billing.status === "PAGO") {
      return { ...base, status: "DIVERGENCIA", detalhe: "Fatura cancelada, OS ainda PAGO", causaDivergencia: "A fatura foi cancelada no gateway mas a OS continua marcada como PAGA." };
    }
    return { ...base, status: "FATURA_CANCELADA", detalhe: "Fatura cancelada — refaturar" };
  }

  if (OPEN.has(st) || st === "") {
    // Billing marcado PAGO com fatura em aberto = divergência.
    if (billing.status === "PAGO") {
      return { ...base, status: "DIVERGENCIA", detalhe: "PAGO com fatura em aberto", causaDivergencia: "OS marcada PAGA mas a fatura vinculada ainda está em aberto no gateway." };
    }
    const venc = base.vencimento;
    const atraso = venc ? diffDias(hoje, venc) : 0;
    if (st === "OVERDUE" || (venc && atraso > 0)) {
      const dias = Math.max(1, atraso);
      return { ...base, status: "VENCIDA", diasAtraso: dias, detalhe: `Vencida há ${dias} dia${dias > 1 ? "s" : ""}` };
    }
    return { ...base, status: "AGUARDANDO_PAGAMENTO", detalhe: venc ? `Vence em ${venc.slice(8, 10)}/${venc.slice(5, 7)}` : "Em aberto" };
  }

  // Status desconhecido do gateway — não inventar: sinalizar p/ análise.
  return { ...base, status: "DIVERGENCIA", detalhe: `Status de fatura desconhecido (${st})`, causaDivergencia: `Fatura com status não reconhecido "${st}" — verificar no gateway.` };
}

/** Metadados de exibição (label/cor) — compartilhados com o frontend via API. */
export const SITUACAO_FINANCEIRA_META: Record<SituacaoFinanceiraStatus, { label: string; color: string }> = {
  NAO_FATURADA: { label: "Não faturada", color: "gray" },
  AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", color: "blue" },
  VENCIDA: { label: "Vencida", color: "red" },
  PAGA: { label: "Paga", color: "emerald" },
  PARCIALMENTE_PAGA: { label: "Parcialmente paga", color: "amber" },
  ESTORNADA: { label: "Estornada", color: "orange" },
  FATURA_CANCELADA: { label: "Fatura cancelada", color: "amber" },
  SEM_COBRANCA: { label: "Sem cobrança", color: "gray" },
  DIVERGENCIA: { label: "Divergência financeira", color: "red" },
};
