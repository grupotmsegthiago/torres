import { splitMissionCostsForBilling } from "../billing-calc";

export type BillingMargemInput = {
  fat_total?: number | null;
  pag_vrp?: number | null;
  pag_periculosidade?: number | null;
  pag_adicional_noturno?: number | null;
  pag_reembolsos?: number | null;
  pag_total?: number | null;
  despesas_combustivel?: number | null;
  despesas_pedagio?: number | null;
  despesas_outras?: number | null;
  desp_total?: number | null;
  resultado_liquido?: number | null;
};

export type BillingMargemResult = {
  fatTotal: number;
  pagLabor: number;
  despesas: number;
  combustivel: number;
  pedagio: number;
  outras: number;
  margemLiquida: number;
  usedMissionCosts: boolean;
  billingCombustivelInflado: boolean;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Margem atribuível ao agente a partir do billing + fatos de mission_costs.
 *
 * Problema histórico (TOR-0783): `escort_billings.despesas_combustivel` /
 * `pag_reembolsos` / `resultado_liquido` podem carregar combustível fantasma
 * (herança de abastecimentos de outras missões / freeze errado). O Ponto
 * (Control iD) lia `resultado_liquido` e mostrava prejuízo de dezenas de milhares
 * em missão já faturada corretamente ao cliente.
 *
 * Regra: custo de combustível/pedágio/outras para margem gerencial do agente
 * vem de `splitMissionCostsForBilling(mission_costs)` quando há fatos; labor
 * vem dos campos pag_* do billing (sem reembolso). `fat_total` comercial
 * permanece o do billing (boletim/SSOT comercial).
 */
export function computeMargemAgenteFromBilling(
  billing: BillingMargemInput,
  missionCosts: Array<any> | null | undefined,
): BillingMargemResult {
  const fatTotal = r2(n(billing.fat_total));
  const pagVrp = n(billing.pag_vrp);
  const pagPeric = n(billing.pag_periculosidade);
  const pagNoturno = n(billing.pag_adicional_noturno);
  let pagLabor = r2(pagVrp + pagPeric + pagNoturno);
  if (pagLabor <= 0) {
    // Fallback: pag_total menos reembolsos (quando só o total veio preenchido)
    const pagTotal = n(billing.pag_total);
    const reemb = n(billing.pag_reembolsos);
    if (pagTotal > 0 && pagTotal >= reemb) {
      pagLabor = r2(pagTotal - reemb);
    }
  }

  const split = splitMissionCostsForBilling(missionCosts || []);
  const billingComb = n(billing.despesas_combustivel);
  const hasMissionCostRows = Array.isArray(missionCosts) && missionCosts.length > 0;
  const billingCombustivelInflado =
    hasMissionCostRows &&
    billingComb > 0 &&
    (split.despesas_combustivel + 1) * 5 < billingComb; // billing ≥ 5× o fato

  const usedMissionCosts = hasMissionCostRows;
  const combustivel = usedMissionCosts ? split.despesas_combustivel : billingComb;
  const pedagio = usedMissionCosts
    ? split.despesas_pedagio
    : n(billing.despesas_pedagio);
  const outras = usedMissionCosts
    ? split.despesas_outras
    : n(billing.despesas_outras);
  const despesas = r2(combustivel + pedagio + outras);

  // Preferir margem recalculada; só cai no resultado_liquido persistido se não
  // houver fatos de custo e o billing não trouxer componentes.
  let margemLiquida = r2(fatTotal - pagLabor - despesas);
  if (!usedMissionCosts && !billingCombustivelInflado && fatTotal <= 0) {
    margemLiquida = r2(n(billing.resultado_liquido));
  }

  return {
    fatTotal,
    pagLabor,
    despesas,
    combustivel: r2(combustivel),
    pedagio: r2(pedagio),
    outras: r2(outras),
    margemLiquida,
    usedMissionCosts,
    billingCombustivelInflado,
  };
}

/**
 * Valores de custo a gravar no billing quando há combustível fantasma.
 * NÃO altera fat_* / despesas_pedagio cobrado ao cliente (SSOT comercial).
 */
export function buildCostSideRepairFromMissionCosts(
  billing: BillingMargemInput,
  missionCosts: Array<any>,
): {
  despesas_combustivel: number;
  despesas_outras: number;
  desp_total: number;
  pag_reembolsos: number;
  pag_total: number;
  resultado_bruto: number;
  resultado_liquido: number;
  margem_percentual: number;
} {
  const m = computeMargemAgenteFromBilling(billing, missionCosts);
  const fatTotal = m.fatTotal;
  const pagLabor = m.pagLabor;
  const pagReembolsos = m.despesas;
  const pagTotal = r2(pagLabor + pagReembolsos);
  const resultado = r2(fatTotal - pagTotal);
  const margemPct = fatTotal > 0 ? r2((resultado / fatTotal) * 100) : 0;
  return {
    despesas_combustivel: m.combustivel,
    despesas_outras: m.outras,
    desp_total: pagReembolsos,
    pag_reembolsos: pagReembolsos,
    pag_total: pagTotal,
    resultado_bruto: resultado,
    resultado_liquido: resultado,
    margem_percentual: margemPct,
  };
}
