import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { insertFixedCostSchema } from "@shared/schema";
import { z } from "zod";
import { countBusinessDays, loadHolidaySet, monthRange } from "./holidays";
import { sumDailyAllowancesForPeriod } from "./daily-allowances";

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
 * Custo total mensal de UM agente (salário + encargos + VR diário + VT + cesta + outros).
 * Usa o registro mais recente de employee_salaries.
 *
 * `opts.businessDays` — quando informado, usa esse número de dias úteis para o VR.
 *                       Senão, calcula com base nos dias úteis do mês corrente
 *                       (descontando feriados informados em opts.holidaySet).
 * `opts.diariasManuais` — soma de diárias de lançamento manual no período (apenas no breakdown).
 */
export async function calculateAgentMonthlyCost(
  employeeId: number,
  opts?: { businessDays?: number; holidaySet?: Set<string>; diariasManuais?: number }
): Promise<{
  total: number;
  breakdown: {
    base: number;
    encargos: number;
    vrDiario: number;
    vrDias: number;
    vrTotal: number;
    vt: number;
    cesta: number;
    outros: number;
    diarias: number;
    horasMensais: number;
    custoHora: number;
  };
}> {
  const { data, error } = await supabaseAdmin
    .from("employee_salaries")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .limit(1);

  // Dias úteis padrão: mês corrente
  let vrDias = opts?.businessDays;
  if (vrDias === undefined) {
    const now = new Date();
    const { from, to } = monthRange(now.getFullYear(), now.getMonth() + 1);
    const set = opts?.holidaySet ?? (await loadHolidaySet(from, to));
    vrDias = countBusinessDays(from, to, set);
  }

  if (error || !data || data.length === 0) {
    return {
      total: 0,
      breakdown: {
        base: 0, encargos: 0,
        vrDiario: 43, vrDias, vrTotal: 0,
        vt: 0, cesta: 0, outros: 0, diarias: opts?.diariasManuais ?? 0,
        horasMensais: 220, custoHora: 0,
      },
    };
  }

  const s: any = data[0];
  const base = Number(s.base_salary || 0);
  const encargosPct = Number(s.encargos_pct ?? 80) / 100;
  const encargos = base * encargosPct;
  const vrDiario = Number(s.vale_refeicao_diario ?? 43);
  // Compat: se o campo legado vale_refeicao_mensal estiver preenchido, usa-o; senão calcula por dia útil.
  const vrLegacy = Number(s.vale_refeicao_mensal || 0);
  const vrTotal = vrLegacy > 0 ? vrLegacy : vrDiario * vrDias;
  const vt = Number(s.vale_transporte_mensal || 0);
  const cesta = Number(s.cesta_basica ?? 200);
  const outros = Number(s.beneficios_outros || 0);
  const diarias = opts?.diariasManuais ?? 0;
  const horasMensais = Number(s.horas_mensais || 220);
  const total = base + encargos + vrTotal + vt + cesta + outros + diarias;
  const custoHora = horasMensais > 0 ? total / horasMensais : 0;
  return {
    total,
    breakdown: { base, encargos, vrDiario, vrDias, vrTotal, vt, cesta, outros, diarias, horasMensais, custoHora },
  };
}

export async function calculateAgentCostPerHour(employeeId: number): Promise<number> {
  const r = await calculateAgentMonthlyCost(employeeId);
  return r.breakdown.custoHora;
}

/**
 * Soma o custo mensal de RH (todos agentes ativos) — mês corrente.
 */
export async function getMonthlyRHCost(): Promise<number> {
  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("id, status");
  if (error || !employees) return 0;
  const ativos = employees.filter((e: any) =>
    !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
  );
  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth() + 1);
  const holidaySet = await loadHolidaySet(from, to);
  const businessDays = countBusinessDays(from, to, holidaySet);
  let total = 0;
  for (const emp of ativos) {
    const r = await calculateAgentMonthlyCost(emp.id, { businessDays, holidaySet });
    total += r.total;
  }
  return total;
}

export async function getRHCostForPeriod(fromISO: string, toISO: string): Promise<number> {
  const holidaySet = await loadHolidaySet(fromISO, toISO);
  const businessDays = countBusinessDays(fromISO, toISO, holidaySet);
  const totalDias = Math.max(
    1,
    Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const { data: employees } = await supabaseAdmin.from("employees").select("id, status");
  const ativos = (employees || []).filter((e: any) =>
    !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
  );
  const diarias = await sumDailyAllowancesForPeriod(fromISO, toISO);
  let total = 0;
  for (const emp of ativos) {
    // Para período ≠ mês cheio: salário base/encargos rateado por dia corrido,
    // VR pelos dias úteis efetivos do período, diárias somadas integralmente.
    const r = await calculateAgentMonthlyCost(emp.id, {
      businessDays,
      holidaySet,
      diariasManuais: diarias.porAgente[emp.id] || 0,
    });
    // Componentes "mensais" rateados por dia corrido do período (30d como base):
    const mensalRateado = (r.breakdown.base + r.breakdown.encargos + r.breakdown.vt + r.breakdown.cesta + r.breakdown.outros) / 30 * totalDias;
    total += mensalRateado + r.breakdown.vrTotal + r.breakdown.diarias;
  }
  return total;
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
  // Aceita ?from=YYYY-MM-DD&to=YYYY-MM-DD para período custom; default = mês corrente.
  app.get("/api/fixed-costs/rh-summary", requireAuth, requireAdminRole, async (req, res) => {
    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, status");
    if (error) return res.status(500).json({ message: error.message });

    const ativos = (employees || []).filter((e: any) =>
      !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
    );

    // Período: por padrão mês corrente
    const now = new Date();
    const def = monthRange(now.getFullYear(), now.getMonth() + 1);
    const from = (req.query.from as string) || def.from;
    const to = (req.query.to as string) || def.to;
    const holidaySet = await loadHolidaySet(from, to);
    const businessDays = countBusinessDays(from, to, holidaySet);
    const diarias = await sumDailyAllowancesForPeriod(from, to);

    const porAgente: Array<{
      id: number; name: string; total: number;
      base: number; encargos: number;
      vrDiario: number; vrDias: number; vrTotal: number;
      vt: number; cesta: number; outros: number; diarias: number;
      horasMensais: number; custoHora: number;
    }> = [];
    let totalMensal = 0;
    let totalBase = 0;
    let totalEncargos = 0;
    let totalVR = 0;
    let totalVT = 0;
    let totalCesta = 0;
    let totalOutros = 0;
    let totalDiarias = 0;

    for (const emp of ativos) {
      const r = await calculateAgentMonthlyCost(emp.id, {
        businessDays,
        holidaySet,
        diariasManuais: diarias.porAgente[emp.id] || 0,
      });
      totalMensal += r.total;
      totalBase += r.breakdown.base;
      totalEncargos += r.breakdown.encargos;
      totalVR += r.breakdown.vrTotal;
      totalVT += r.breakdown.vt;
      totalCesta += r.breakdown.cesta;
      totalOutros += r.breakdown.outros;
      totalDiarias += r.breakdown.diarias;
      porAgente.push({
        id: emp.id,
        name: emp.name || `Agente ${emp.id}`,
        total: r.total,
        base: r.breakdown.base,
        encargos: r.breakdown.encargos,
        vrDiario: r.breakdown.vrDiario,
        vrDias: r.breakdown.vrDias,
        vrTotal: r.breakdown.vrTotal,
        vt: r.breakdown.vt,
        cesta: r.breakdown.cesta,
        outros: r.breakdown.outros,
        diarias: r.breakdown.diarias,
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
      period: { from, to, businessDays, holidaysCount: holidaySet.size },
      breakdown: {
        base: totalBase,
        encargos: totalEncargos,
        vr: totalVR,
        vt: totalVT,
        cesta: totalCesta,
        outros: totalOutros,
        diarias: totalDiarias,
        beneficios: totalVR + totalVT + totalCesta + totalOutros + totalDiarias,
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
