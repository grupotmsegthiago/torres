import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { insertFixedCostSchema } from "@shared/schema";
import { z } from "zod";

// Aceita número ou string (form envia número) e normaliza pra string decimal
const fixedCostInputSchema = insertFixedCostSchema.extend({
  monthlyValue: z.union([z.string(), z.number()]).transform((v) => String(v)),
  dueDay: z.union([z.number(), z.string(), z.null()]).optional().transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    return typeof v === "string" ? Number(v) : v;
  }),
  active: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

export const FIXED_COST_CATEGORIES = [
  "Aluguel",
  "Utilidades",
  "Softwares",
  "Veiculos",
  "Telecom",
  "Marketing",
  "Servicos",
  "Outros",
] as const;

// Normaliza linha do Supabase (snake_case) pro tipo FixedCost (camelCase) usado no client.
function toCamelFixedCost(r: any) {
  if (!r) return r;
  return {
    id: r.id,
    description: r.description,
    category: r.category,
    monthlyValue: r.monthly_value,
    dueDay: r.due_day,
    active: r.active,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/**
 * Soma o valor mensal de TODOS os custos fixos ativos.
 * Esse é o "Custo de Estar Aberto" mensal da operação (CEA).
 */
export async function getMonthlyFixedCostsTotal(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("fixed_costs")
    .select("monthly_value")
    .eq("active", true);
  if (error) {
    console.warn("[fixed-costs] erro ao somar custos fixos:", error.message);
    return 0;
  }
  return (data || []).reduce((sum, r: any) => sum + Number(r.monthly_value || 0), 0);
}

/**
 * Custo fixo diário rateado (mês comercial = 30 dias).
 */
export async function calculateDailyOverhead(): Promise<number> {
  const monthly = await getMonthlyFixedCostsTotal();
  return monthly / 30;
}

/**
 * Custo fixo rateado pra um período arbitrário (em dias).
 */
export async function getFixedCostsForPeriod(fromISO: string, toISO: string): Promise<number> {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T23:59:59");
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const daily = await calculateDailyOverhead();
  return daily * days;
}

/**
 * Custo total mensal de UM agente (salário + encargos + benefícios).
 * Usa o registro mais recente de employee_salaries.
 */
export async function calculateAgentMonthlyCost(employeeId: number): Promise<{
  total: number;
  breakdown: { base: number; encargos: number; vr: number; vt: number; outros: number; horasMensais: number; custoHora: number };
}> {
  const { data, error } = await supabaseAdmin
    .from("employee_salaries")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) {
    return { total: 0, breakdown: { base: 0, encargos: 0, vr: 0, vt: 0, outros: 0, horasMensais: 220, custoHora: 0 } };
  }
  const s: any = data[0];
  const base = Number(s.base_salary || 0);
  const encargosPct = Number(s.encargos_pct ?? 80) / 100;
  const encargos = base * encargosPct;
  const vr = Number(s.vale_refeicao_mensal || 0);
  const vt = Number(s.vale_transporte_mensal || 0);
  const outros = Number(s.beneficios_outros || 0);
  const horasMensais = Number(s.horas_mensais || 220);
  const total = base + encargos + vr + vt + outros;
  const custoHora = horasMensais > 0 ? total / horasMensais : 0;
  return { total, breakdown: { base, encargos, vr, vt, outros, horasMensais, custoHora } };
}

export async function calculateAgentCostPerHour(employeeId: number): Promise<number> {
  const r = await calculateAgentMonthlyCost(employeeId);
  return r.breakdown.custoHora;
}

/**
 * Soma o custo mensal de RH (todos agentes ativos).
 */
export async function getMonthlyRHCost(): Promise<number> {
  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("id, status");
  if (error || !employees) return 0;
  const ativos = employees.filter((e: any) =>
    !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
  );
  let total = 0;
  for (const emp of ativos) {
    const r = await calculateAgentMonthlyCost(emp.id);
    total += r.total;
  }
  return total;
}

export async function getRHCostForPeriod(fromISO: string, toISO: string): Promise<number> {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T23:59:59");
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const monthly = await getMonthlyRHCost();
  return (monthly / 30) * days;
}

export function registerFixedCostsRoutes(app: Express) {
  // LIST
  app.get("/api/fixed-costs", requireAuth, requireAdminRole, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("fixed_costs")
      .select("*")
      .order("category", { ascending: true })
      .order("description", { ascending: true });
    if (error) return res.status(500).json({ message: error.message });
    res.json((data || []).map(toCamelFixedCost));
  });

  // === RH SUMMARY (salários + encargos + benefícios de todos agentes ativos) ===
  app.get("/api/fixed-costs/rh-summary", requireAuth, requireAdminRole, async (_req, res) => {
    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, name, status");
    if (error) return res.status(500).json({ message: error.message });

    const ativos = (employees || []).filter((e: any) =>
      !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
    );

    const porAgente: Array<{
      id: number; name: string; total: number;
      base: number; encargos: number; vr: number; vt: number; outros: number;
      horasMensais: number; custoHora: number;
    }> = [];
    let totalMensal = 0;
    let totalBase = 0;
    let totalEncargos = 0;
    let totalBeneficios = 0;

    for (const emp of ativos) {
      const r = await calculateAgentMonthlyCost(emp.id);
      totalMensal += r.total;
      totalBase += r.breakdown.base;
      totalEncargos += r.breakdown.encargos;
      totalBeneficios += r.breakdown.vr + r.breakdown.vt + r.breakdown.outros;
      porAgente.push({
        id: emp.id,
        name: emp.full_name || emp.name || `Agente ${emp.id}`,
        total: r.total,
        base: r.breakdown.base,
        encargos: r.breakdown.encargos,
        vr: r.breakdown.vr,
        vt: r.breakdown.vt,
        outros: r.breakdown.outros,
        horasMensais: r.breakdown.horasMensais,
        custoHora: r.breakdown.custoHora,
      });
    }

    porAgente.sort((a, b) => b.total - a.total);

    res.json({
      monthly: totalMensal,
      daily: totalMensal / 30,
      weekly: (totalMensal / 30) * 7,
      yearly: totalMensal * 12,
      agentCount: ativos.length,
      breakdown: {
        base: totalBase,
        encargos: totalEncargos,
        beneficios: totalBeneficios,
      },
      porAgente,
    });
  });

  // SUMMARY (rateios prontos)
  app.get("/api/fixed-costs/summary", requireAuth, requireAdminRole, async (_req, res) => {
    const monthly = await getMonthlyFixedCostsTotal();
    const daily = monthly / 30;
    const weekly = daily * 7;
    const yearly = monthly * 12;

    // Agrupa por categoria
    const { data } = await supabaseAdmin
      .from("fixed_costs")
      .select("category, monthly_value, active")
      .eq("active", true);
    const porCategoria: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      const cat = r.category || "Outros";
      porCategoria[cat] = (porCategoria[cat] || 0) + Number(r.monthly_value || 0);
    });

    res.json({ monthly, daily, weekly, yearly, porCategoria });
  });

  // CREATE
  app.post("/api/fixed-costs", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = fixedCostInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    }
    const { data, error } = await supabaseAdmin
      .from("fixed_costs")
      .insert({
        description: parsed.data.description,
        category: parsed.data.category,
        monthly_value: parsed.data.monthlyValue,
        due_day: parsed.data.dueDay ?? null,
        active: parsed.data.active ?? true,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json(toCamelFixedCost(data));
  });

  // UPDATE
  app.patch("/api/fixed-costs/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const updates: any = {};
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.monthlyValue !== undefined) {
      updates.monthly_value = String(req.body.monthlyValue);
    }
    if (req.body.dueDay !== undefined) {
      updates.due_day = req.body.dueDay === null || req.body.dueDay === ""
        ? null
        : Number(req.body.dueDay);
    }
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;

    const { data, error } = await supabaseAdmin
      .from("fixed_costs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(toCamelFixedCost(data));
  });

  // DELETE
  app.delete("/api/fixed-costs/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("fixed_costs").delete().eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // === TCO / Balanço ===
  // GET /api/balanco/tco?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/balanco/tco", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const fromISO = (req.query.from as string) || firstDay.toISOString().slice(0, 10);
      const toISO = (req.query.to as string) || lastDay.toISOString().slice(0, 10);

      // Faturamento: soma de service_orders concluídas no período (fat_total)
      // — não conta recusadas (fat_total deve estar zerado nelas)
      const { data: faturamentoRows, error: fatErr } = await supabaseAdmin
        .from("service_orders")
        .select("fat_total, mission_status, created_at, completed_at")
        .gte("created_at", fromISO + "T00:00:00")
        .lte("created_at", toISO + "T23:59:59");
      if (fatErr) console.warn("[tco] faturamento err:", fatErr.message);
      const faturamento = (faturamentoRows || [])
        .filter((r: any) => r.mission_status !== "RECUSADA")
        .reduce((s, r: any) => s + Number(r.fat_total || 0), 0);

      // Custos variáveis: financial_transactions categoria CUSTOS_VARIAVEIS no período
      const { data: varRows } = await supabaseAdmin
        .from("financial_transactions")
        .select("amount, type, category, date")
        .eq("category", "CUSTOS_VARIAVEIS")
        .gte("date", fromISO)
        .lte("date", toISO);
      const custosVariaveis = (varRows || [])
        .filter((r: any) => r.type === "despesa" || r.type === "DESPESA")
        .reduce((s, r: any) => s + Number(r.amount || 0), 0);

      // Custos fixos rateados pelo período
      const custosFixosRateados = await getFixedCostsForPeriod(fromISO, toISO);

      // Custos RH rateados pelo período
      const custosRH = await getRHCostForPeriod(fromISO, toISO);

      const custoTotal = custosVariaveis + custosFixosRateados + custosRH;
      const lucro = faturamento - custoTotal;
      const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
      const META = 35;
      const abaixoMeta = margem < META;

      res.json({
        periodo: { from: fromISO, to: toISO },
        faturamento,
        custosVariaveis,
        custosFixosRateados,
        custosRH,
        custoTotal,
        lucro,
        margem,
        meta: META,
        abaixoMeta,
        status: abaixoMeta ? "ABAIXO DA META" : "Saudável",
      });
    } catch (err: any) {
      console.error("[tco] error:", err);
      res.status(500).json({ message: err.message || "Erro ao calcular TCO" });
    }
  });
}
