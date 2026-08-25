/**
 * Conferência de pedágio na finalização da OS pelo operador.
 * Não altera o fluxo do agente (foto + registro). Ajusta valores e auditoria
 * antes do billing oficial consolidar a cobrança ao cliente.
 *
 * Conceitos separados (de/para):
 * - Estimativa (sistema/Google/manual no formulário) — projeção, tag [ESTIMATIVA_*]
 * - Lançamento do agente — fato operacional (foto/valor)
 * Decisão final de cobrança: operador na finalização.
 */
import { supabaseAdmin } from "../supabase";
import { createAutoTransaction } from "../routes/_helpers";

export type PedagioAjuste = { id: number; amount: number };

export function isPedagioCategory(cat: unknown): boolean {
  const c = String(cat || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return c === "pedagio" || c.includes("pedagio");
}

/** Estimativa do sistema (Google/local/manual) — NÃO é lançamento do agente. */
export function isEstimativaPedagio(
  description: string | null | undefined,
  employeeId?: number | null,
): boolean {
  const d = String(description || "");
  if (/\[ESTIMATIVA_/i.test(d)) return true;
  if (/estimativa/i.test(d) && (employeeId == null || Number(employeeId) === 0)) return true;
  return false;
}

export function buildPedagioDePara(params: {
  expenses: Array<{
    id: number;
    amount: number;
    description?: string | null;
    employeeId?: number | null;
  }>;
  osPedagioEstimado?: number | null;
}): {
  estimado: number;
  agentes: number;
  estimativaIds: number[];
  agenteIds: number[];
  bateu: boolean;
  delta: number;
} {
  const estimativaIds: number[] = [];
  const agenteIds: number[] = [];
  let estimadoFromCosts = 0;
  let agentes = 0;
  for (const e of params.expenses || []) {
    const amt = r2(Number(e.amount) || 0);
    if (isEstimativaPedagio(e.description, e.employeeId)) {
      estimativaIds.push(e.id);
      estimadoFromCosts += amt;
    } else {
      agenteIds.push(e.id);
      agentes += amt;
    }
  }
  const osEst = Number(params.osPedagioEstimado);
  const estimado =
    Number.isFinite(osEst) && osEst > 0 ? r2(osEst) : r2(estimadoFromCosts);
  const agentesR = r2(agentes);
  const delta = r2(agentesR - estimado);
  return {
    estimado,
    agentes: agentesR,
    estimativaIds,
    agenteIds,
    bateu: Math.abs(delta) < 0.01,
    delta,
  };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quando há pedágio do agente, zera estimativas do sistema nos ajustes
 * para não somar duas vezes no faturamento. Mantém as linhas como evidência (valor 0).
 */
export function mergeAjustesZeroEstimativa(params: {
  expenses: Array<{
    id: number;
    amount: number;
    description?: string | null;
    employeeId?: number | null;
  }>;
  ajustes: PedagioAjuste[];
}): PedagioAjuste[] {
  const depara = buildPedagioDePara({ expenses: params.expenses });
  const map = new Map<number, number>();
  for (const a of params.ajustes || []) {
    const id = Number(a.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    map.set(id, r2(Number(a.amount)));
  }
  if (depara.agenteIds.length > 0) {
    for (const id of depara.estimativaIds) {
      if (!map.has(id)) map.set(id, 0);
    }
  }
  return Array.from(map.entries()).map(([id, amount]) => ({ id, amount }));
}

/**
 * Aplica ajustes de valor nos pedágios (despesa) e espelha na receita pareada
 * + financial_transactions. Retorna o total de despesa de pedágio após ajuste.
 */
export async function applyPedagioAjustes(params: {
  serviceOrderId: number;
  ajustes: PedagioAjuste[];
  actorName: string;
}): Promise<{ totalDespesa: number; adjustedIds: number[]; depara: ReturnType<typeof buildPedagioDePara> }> {
  const { serviceOrderId, actorName } = params;
  const { data: costs, error } = await supabaseAdmin
    .from("mission_costs")
    .select("id, service_order_id, category, description, amount, cost_type, employee_id, photo_url")
    .eq("service_order_id", serviceOrderId);
  if (error) throw new Error(error.message);

  const rows = costs || [];
  const expenses = rows.filter(
    (c) => isPedagioCategory(c.category) && String(c.cost_type || "expense") !== "revenue",
  );
  const revenues = rows.filter(
    (c) => isPedagioCategory(c.category) && String(c.cost_type) === "revenue",
  );

  const expenseView = expenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount) || 0,
    description: e.description,
    employeeId: e.employee_id,
  }));
  const depara = buildPedagioDePara({ expenses: expenseView });
  const ajustes = mergeAjustesZeroEstimativa({
    expenses: expenseView,
    ajustes: params.ajustes || [],
  });

  const adjustedIds: number[] = [];
  const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  for (const adj of ajustes) {
    const id = Number(adj.id);
    const amount = r2(Number(adj.amount));
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Valor de pedágio inválido (custo #${id})`);
    }
    const exp = expenses.find((e) => e.id === id);
    if (!exp) throw new Error(`Pedágio #${id} não pertence a esta OS`);

    const prev = r2(Number(exp.amount) || 0);
    if (prev === amount) continue;

    const { error: upErr } = await supabaseAdmin
      .from("mission_costs")
      .update({ amount: amount.toFixed(2) })
      .eq("id", id)
      .eq("service_order_id", serviceOrderId);
    if (upErr) throw new Error(upErr.message);
    adjustedIds.push(id);

    // Espelha receita pareada (mesmo agente + descrição semelhante).
    const pair =
      revenues.find(
        (r) =>
          r.employee_id === exp.employee_id &&
          String(r.description || "") === String(exp.description || ""),
      ) || revenues.find((r) => r2(Number(r.amount) || 0) === prev);

    if (pair) {
      await supabaseAdmin
        .from("mission_costs")
        .update({ amount: amount.toFixed(2) })
        .eq("id", pair.id)
        .eq("service_order_id", serviceOrderId);
      await createAutoTransaction({
        description: String(pair.description || exp.description || "Receita pedágio").toUpperCase().trim(),
        amount,
        type: "INCOME",
        due_date: todayBRT,
        origin_type: "mission_cost",
        origin_id: String(pair.id),
        category_name: "Receitas de Missão",
        created_by: actorName,
      });
    }

    await createAutoTransaction({
      description: String(exp.description || "Pedágio").toUpperCase().trim(),
      amount,
      type: "EXPENSE",
      due_date: todayBRT,
      origin_type: "mission_cost",
      origin_id: String(id),
      category_name: "Custos de Missão",
      created_by: actorName,
    });
  }

  const { data: after } = await supabaseAdmin
    .from("mission_costs")
    .select("amount, category, cost_type, description, employee_id")
    .eq("service_order_id", serviceOrderId);
  const totalDespesa = r2(
    (after || [])
      .filter((c) => isPedagioCategory(c.category) && String(c.cost_type || "expense") !== "revenue")
      .reduce((s, c) => s + (Number(c.amount) || 0), 0),
  );

  // depara = comparação ANTES da consolidação (o que o operador viu).
  return { totalDespesa, adjustedIds, depara };
}

export function buildPedagioConferidoLog(params: {
  actorName: string;
  actorId: number;
  totalDespesa: number;
  adjustedIds: number[];
  expenseCount: number;
  estimado?: number;
  agentes?: number;
}) {
  const deparaBits: string[] = [];
  if (params.estimado != null) deparaBits.push(`estimado R$ ${params.estimado.toFixed(2)}`);
  if (params.agentes != null) deparaBits.push(`agentes R$ ${params.agentes.toFixed(2)}`);
  const deparaStr = deparaBits.length ? ` | de/para: ${deparaBits.join(" vs ")}` : "";
  return {
    step: "pedagio_conferido",
    completedAt: new Date().toISOString(),
    agentName: `ADMIN: ${params.actorName}`,
    agentId: params.actorId,
    geo: null,
    nextStep: "encerrada",
    reason: `Pedágio conferido para cobrança ao cliente — ${params.expenseCount} lançamento(s), total R$ ${params.totalDespesa.toFixed(2)}${params.adjustedIds.length ? `, ajustes: #${params.adjustedIds.join(", #")}` : ""}${deparaStr}`,
  };
}
