import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { insertFixedCostSchema } from "@shared/schema";
import { z } from "zod";
import { countBusinessDays, loadHolidaySet, monthRange } from "./holidays";
import { sumDailyAllowancesForPeriod } from "./daily-allowances";
import { calcularFolha, type PayrollBreakdown } from "../lib/payroll";
import { withSwrCache } from "../lib/swr-cache";
const SWR_TTL_3H = 3 * 60 * 60 * 1000;
import { computeWorkedHours } from "../lib/hours-calc";
import { createLimit } from "../lib/create-limit";

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

// Custo mensal de aluguel por veículo ATIVO da frota.
// Aplicado automaticamente a cada veículo cujo status não seja "baixado",
// "vendido", "alienado" ou "inativo".
export const FLEET_RENT_PER_VEHICLE = 3400;
const INACTIVE_VEHICLE_STATUSES = new Set(["baixado", "vendido", "alienado", "inativo"]);

/**
 * Conta veículos ativos na frota (qualquer status que não seja "baixado/vendido/alienado/inativo").
 */
export async function getActiveVehicleCount(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, status");
  if (error) {
    console.warn("[fixed-costs] erro ao contar veículos ativos:", error.message);
    return 0;
  }
  return (data || []).filter((v: any) => {
    const s = String(v.status || "").toLowerCase().trim();
    return s === "" || !INACTIVE_VEHICLE_STATUSES.has(s);
  }).length;
}

/**
 * Custo mensal de aluguel da frota ativa = N veículos × R$ 3.400.
 */
export async function getFleetRentMonthlyTotal(): Promise<{ count: number; total: number; perVehicle: number }> {
  const count = await getActiveVehicleCount();
  return { count, total: count * FLEET_RENT_PER_VEHICLE, perVehicle: FLEET_RENT_PER_VEHICLE };
}

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
 * Soma o valor mensal de TODOS os custos fixos ativos
 * (custos cadastrados na tabela fixed_costs + aluguel da frota ativa).
 * Esse é o "Custo de Estar Aberto" mensal da operação (CEA), excluindo RH.
 */
export async function getMonthlyFixedCostsTotal(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("fixed_costs")
    .select("monthly_value")
    .eq("active", true);
  if (error) {
    console.warn("[fixed-costs] erro ao somar custos fixos:", error.message);
  }
  const cadastrados = (data || []).reduce((sum, r: any) => sum + Number(r.monthly_value || 0), 0);
  // Respeita estritamente o que foi lançado em fixed_costs. O aluguel da frota
  // deve ser cadastrado manualmente como custo fixo (ex.: "ALUGUEL CARROS - LDF")
  // pra evitar duplicação com o cálculo automático (#veículos × R$ 3.400).
  return cadastrados;
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
 * Custo total mensal de UM agente (salário + encargos + VR diário + VT + cesta + outros
 * + provisões de férias, 13º e rescisão).
 * Usa o registro mais recente de employee_salaries.
 *
 * `opts.businessDays` — quando informado, usa esse número de dias úteis para o VR.
 *                       Senão, calcula com base nos dias úteis do mês corrente
 *                       (descontando feriados informados em opts.holidaySet).
 * `opts.diariasManuais` — soma de diárias de lançamento manual no período (apenas no breakdown).
 * `opts.rescisaoPct`   — percentual de rescisão sobre a folha bruta (default 8%).
 */
export async function calculateAgentMonthlyCost(
  employeeId: number,
  opts?: {
    businessDays?: number;
    holidaySet?: Set<string>;
    diariasManuais?: number;
    rescisaoPct?: number;
    diasTrabalhados?: number;
    /** Override de horas extras do PERÍODO (decimal). Se fornecido, ignora a média dos 3 últimos meses. */
    horasExtras?: number;
    /** Override de horas noturnas do PERÍODO (decimal). Se fornecido, ignora a média. */
    horasNoturnas?: number;
  }
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
    ferias: number;
    decimoTerceiro: number;
    rescisao: number;
    horaExtra: number;
    adicionalNoturno: number;
    // === Folha 2025 (engine completa) ===
    salarioProporcional: number;
    periculosidade: number;
    dsr: number;
    ajudaCusto: number;
    inss: number;
    irrf: number;
    fgts: number;
    provisaoTercoFerias: number;
    provisaoFGTSsobreFerias13: number;
    provisaoINSSsobreFerias13: number;
    totalBruto: number;
    totalDeducoes: number;
    totalProvisoes: number;
    liquidoFuncionario: number;
  };
}> {
  const { data, error } = await supabaseAdmin
    .from("employee_salaries")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);

  // Dias úteis padrão: mês corrente
  let vrDias = opts?.businessDays;
  if (vrDias === undefined) {
    const now = new Date();
    const { from, to } = monthRange(now.getFullYear(), now.getMonth() + 1);
    const set = opts?.holidaySet ?? (await loadHolidaySet(from, to));
    vrDias = countBusinessDays(from, to, set);
  }

  // Horas extras/noturnas do PERÍODO. Se chamador passou override (rota /rh-summary
  // que já agregou batidas Control iD + jornada_calculos do mês), usa direto.
  // Senão, fallback: média dos 3 últimos meses em jornada_calculos (legado).
  let horasExtrasMedia = opts?.horasExtras;
  let horasNoturnasMedia = opts?.horasNoturnas;
  if (horasExtrasMedia === undefined || horasNoturnasMedia === undefined) {
    const now = new Date();
    const meses: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const { data: jornData, error: jornErr } = await supabaseAdmin
      .from("jornada_calculos")
      .select("horas_extras, horas_noturnas, mes_referencia")
      .eq("employee_id", employeeId)
      .in("mes_referencia", meses);
    if (!jornErr && jornData && jornData.length > 0) {
      const porMes = new Map<string, { extras: number; noturnas: number }>();
      for (const r of jornData) {
        const k = String(r.mes_referencia || "").slice(0, 7);
        if (!porMes.has(k)) porMes.set(k, { extras: 0, noturnas: 0 });
        porMes.get(k)!.extras += Number(r.horas_extras || 0);
        porMes.get(k)!.noturnas += Number(r.horas_noturnas || 0);
      }
      const nMeses = porMes.size;
      let sumE = 0, sumN = 0;
      porMes.forEach((v) => { sumE += v.extras; sumN += v.noturnas; });
      if (horasExtrasMedia === undefined) horasExtrasMedia = sumE / nMeses;
      if (horasNoturnasMedia === undefined) horasNoturnasMedia = sumN / nMeses;
    }
    if (horasExtrasMedia === undefined) horasExtrasMedia = 0;
    if (horasNoturnasMedia === undefined) horasNoturnasMedia = 0;
  }

  if (error || !data || data.length === 0) {
    return {
      total: 0,
      breakdown: {
        base: 0, encargos: 0,
        vrDiario: 43, vrDias, vrTotal: 0,
        vt: 0, cesta: 0, outros: 0, diarias: opts?.diariasManuais ?? 0,
        horasMensais: 220, custoHora: 0,
        ferias: 0, decimoTerceiro: 0, rescisao: 0, horaExtra: 0, adicionalNoturno: 0,
        salarioProporcional: 0, periculosidade: 0, dsr: 0, ajudaCusto: 0,
        inss: 0, irrf: 0, fgts: 0, provisaoTercoFerias: 0,
        provisaoFGTSsobreFerias13: 0, provisaoINSSsobreFerias13: 0,
        totalBruto: 0, totalDeducoes: 0, totalProvisoes: 0, liquidoFuncionario: 0,
      },
    };
  }

  const s: any = data[0];
  const base = Number(s.base_salary || 0);
  const vrDiario = Number(s.vale_refeicao_diario ?? 43);
  const vrLegacy = Number(s.vale_refeicao_mensal || 0);
  const vrTotal = vrLegacy > 0 ? vrLegacy : vrDiario * vrDias;
  const vt = Number(s.vale_transporte_mensal || 0);
  const cesta = Number(s.cesta_basica ?? 200);
  const outros = Number(s.beneficios_outros || 0);
  const diarias = opts?.diariasManuais ?? 0;
  const horasMensais = Number(s.horas_mensais || 220);
  const periculosidadePct = Number(s.periculosidade_pct ?? 30) / 100;
  const ajudaCustoMensal = Number(s.ajuda_custo_mensal || 0);
  const diasTrabalhados = opts?.diasTrabalhados ?? 30; // default mês cheio

  // Dependentes IR: prioriza contagem da tabela `employee_dependents` (com certidão).
  // Fallback para o campo legado `dependentes_ir` do salário se a tabela estiver vazia.
  let dependentesIR = Number(s.dependentes_ir || 0);
  try {
    const { count } = await supabaseAdmin
      .from("employee_dependents")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("deduz_ir", true);
    if (typeof count === "number" && count > 0) dependentesIR = count;
  } catch {
    /* mantém fallback */
  }

  // Regime de contratação: lê tipo_contratacao do funcionário.
  // "fixo" = sem encargos/descontos (PJ, autônomo, freelancer pago por fora).
  const { data: empRowTipo } = await supabaseAdmin
    .from("employees")
    .select("tipo_contratacao")
    .eq("id", employeeId)
    .limit(1);
  const isClt = !empRowTipo || !empRowTipo[0] || (empRowTipo[0] as any).tipo_contratacao !== "fixo";

  // Engine de folha 2025 (CLT brasileira; não-CLT zera encargos e provisões).
  const folha = calcularFolha({
    salarioBaseCheio: base,
    diasTrabalhados,
    horasMensais,
    periculosidadePct,
    horasExtras: horasExtrasMedia,
    horasNoturnas: horasNoturnasMedia,
    diasUteis: vrDias,
    refeicaoDiaria: vrDiario,
    ajudaCustoMensal,
    dependentesIR,
    isClt,
  });

  // Custo total para a empresa = Bruto + FGTS + Provisões + outros benefícios não tributáveis (cesta/VT/outros) + diárias manuais
  const total = folha.custoTotalEmpresa + cesta + vt + outros + diarias;
  const custoHora = horasMensais > 0 ? total / horasMensais : 0;

  // Compat: campos antigos da UI continuam funcionando
  const encargos = folha.inss + folha.irrf + folha.fgts; // soma das deduções/encargos (compatibilidade visual)
  const ferias = folha.provisaoFerias + folha.provisaoTercoFerias;
  const decimoTerceiro = folha.provisaoDecimoTerceiro;
  const rescisao = folha.provisaoFGTSsobreFerias13 + folha.provisaoINSSsobreFerias13;

  return {
    total,
    breakdown: {
      base: folha.salarioProporcional,
      encargos,
      vrDiario, vrDias, vrTotal, vt, cesta, outros, diarias, horasMensais, custoHora,
      ferias, decimoTerceiro, rescisao,
      horaExtra: folha.horasExtrasValor,
      adicionalNoturno: folha.adicionalNoturnoValor,
      // === Folha 2025 ===
      salarioProporcional: folha.salarioProporcional,
      periculosidade: folha.periculosidade,
      dsr: folha.dsr,
      ajudaCusto: folha.ajudaCusto,
      inss: folha.inss,
      irrf: folha.irrf,
      fgts: folha.fgts,
      provisaoTercoFerias: folha.provisaoTercoFerias,
      provisaoFGTSsobreFerias13: folha.provisaoFGTSsobreFerias13,
      provisaoINSSsobreFerias13: folha.provisaoINSSsobreFerias13,
      totalBruto: folha.totalBruto,
      totalDeducoes: folha.totalDeducoes,
      totalProvisoes: folha.totalProvisoes,
      liquidoFuncionario: folha.liquidoFuncionario,
    },
  };
}

export async function calculateAgentCostPerHour(employeeId: number): Promise<number> {
  const r = await calculateAgentMonthlyCost(employeeId);
  return r.breakdown.custoHora;
}

// Critério de agente ativo: exclui inativo, desligado, bloqueado, afastado, férias,
// demitido, suspenso — e também variantes com sufixo (ex: "bloqueado_definitivo",
// "bloqueado_temporario", "afastado_inss", "ferias_remuneradas").
export function isAtivo(e: any): boolean {
  const s = String(e.status || "").toLowerCase().trim();
  if (!s) return true; // sem status → considera ativo
  const prefixosBloqueados = ["inativo", "desligado", "bloqueado", "afastado", "férias", "ferias", "demitido", "suspenso"];
  return !prefixosBloqueados.some((p) => s === p || s.startsWith(p + "_") || s.startsWith(p + "-") || s.startsWith(p + " "));
}

/**
 * Soma o custo mensal de RH (todos agentes ativos) — mês corrente.
 */
export async function getMonthlyRHCost(): Promise<number> {
  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("id, status");
  if (error || !employees) return 0;
  const ativos = employees.filter(isAtivo);
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
  const ativos = (employees || []).filter(isAtivo);
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
  app.get("/api/fixed-costs/rh-summary", requireAuth, requireAdminRole, withSwrCache({ baseKey: "rh-summary", ttlMs: SWR_TTL_3H }, async (req, res) => {
    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, status, role, tipo_contratacao");
    if (error) return res.status(500).json({ message: error.message });

    const ativos = (employees || []).filter(isAtivo);

    // Período: por padrão mês corrente (CIVIL — 1 a último dia).
    // Decisão (26/05/2026, REVERTIDA): Balanço Gerencial usa mês civil
    // inclusive na seção RH — pra alinhar com DRE, meta e custos fixos.
    const now = new Date();
    const def = monthRange(now.getFullYear(), now.getMonth() + 1);
    const from = (req.query.from as string) || def.from;
    const to = (req.query.to as string) || def.to;
    const holidaySet = await loadHolidaySet(from, to);
    const businessDays = countBusinessDays(from, to, holidaySet);
    const diarias = await sumDailyAllowancesForPeriod(from, to);

    // Horas trabalhadas no mês — agregado por agente.
    // Fonte: control_id_punches (sync Control iD em tempo real). Fallback: timesheets (manual).
    const horasMes = new Map<number, { normais: number; extras: number }>();
    try {
      const fromIso = new Date(from + "T00:00:00-03:00").toISOString();
      const toIso = new Date(to + "T23:59:59-03:00").toISOString();
      const { data: punches } = await supabaseAdmin
        .from("control_id_punches")
        .select("employee_id, punch_at")
        .gte("punch_at", fromIso)
        .lte("punch_at", toIso)
        .order("punch_at", { ascending: true });

      // Agrupa batidas por funcionário e usa o cálculo CANÔNICO
      // (server/lib/hours-calc.ts). Pareia entradas/saídas e atribui ao dia
      // BRT da entrada — turnos cruzando meia-noite contam corretamente.
      const punchesByEmp = new Map<number, any[]>();
      for (const p of (punches || []) as any[]) {
        const empId = p.employee_id;
        if (empId == null) continue;
        if (!punchesByEmp.has(empId)) punchesByEmp.set(empId, []);
        punchesByEmp.get(empId)!.push(p);
      }
      for (const [empId, pl] of Array.from(punchesByEmp.entries())) {
        const calc = computeWorkedHours(pl);
        if (!horasMes.has(empId)) horasMes.set(empId, { normais: 0, extras: 0 });
        // HE só começa a contar quando ultrapassar 220h no mês (jornada CLT mensal).
        // Soma tudo em "normais" — a separação acontece no cap mais abaixo.
        horasMes.get(empId)!.normais += calc.totalHours;
      }

      // Fallback: agentes sem batidas no Control iD usam timesheets manuais (se existirem)
      const { data: ts } = await supabaseAdmin
        .from("timesheets")
        .select("employee_id, hours_worked, overtime")
        .gte("date", from)
        .lte("date", to);
      for (const r of (ts || []) as any[]) {
        const id = Number(r.employee_id);
        if (horasMes.has(id)) continue; // já tem dados do Control iD
        if (!horasMes.has(id)) horasMes.set(id, { normais: 0, extras: 0 });
        const slot = horasMes.get(id)!;
        slot.normais += Number(r.hours_worked || 0);
        slot.extras += Number(r.overtime || 0);
      }
    } catch (e: any) {
      console.warn("[rh-summary] horasMes fallback:", e?.message || e);
    }

    // Horas NOTURNAS do mês — vêm de jornada_calculos (cálculo CCT por missão).
    // Control iD não diferencia turno noturno, então a fonte oficial é jornada_calculos.
    const noturnasMes = new Map<number, number>();
    try {
      const mesRef = String(from).slice(0, 7); // "YYYY-MM"
      const { data: jornMes } = await supabaseAdmin
        .from("jornada_calculos")
        .select("employee_id, horas_noturnas")
        .eq("mes_referencia", mesRef);
      for (const r of (jornMes || []) as any[]) {
        const id = Number(r.employee_id);
        if (!noturnasMes.has(id)) noturnasMes.set(id, 0);
        noturnasMes.set(id, noturnasMes.get(id)! + Number(r.horas_noturnas || 0));
      }
    } catch (e: any) {
      console.warn("[rh-summary] noturnasMes:", e?.message || e);
    }

    const porAgente: any[] = [];
    let totalMensal = 0;
    const acc = {
      base: 0, peric: 0, he: 0, refeicao: 0,
      fgts: 0, inssPatronal: 0, seguroVida: 0,
      cesta: 0, diarias: 0,
    };

    // Alinhado em 25/05/2026 com a tela Ponto Eletrônico (control-id.tsx → buildFolhaStats):
    // mesma fórmula de Custo Real (Vencimentos + Benefícios + Recolhimentos), mantendo o
    // adicional de HE em 60% (CCT) em vez dos 50% legais. Sem provisões, sem DSR, sem
    // adicional noturno — o Balanço Gerencial é fluxo de caixa do mês, não competência CLT.
    const mesRef = String(from).slice(0, 7); // "YYYY-MM"
    const { buildFolhaStats } = await import("../control-id");

    // Calcula a folha de cada agente em PARALELO (limite de concorrência) em vez
    // de um de cada vez. Passa o cadastro já carregado (role/tipo_contratacao)
    // pra evitar reler `employees` por funcionário. A acumulação (somas/breakdown)
    // continua logo abaixo na ordem original de `ativos`, então os totais ficam
    // bit-idênticos ao cálculo serial anterior.
    const limit = createLimit(6);
    const statsByIdx = await Promise.all(
      ativos.map((emp) => limit(async () => {
        try {
          return await buildFolhaStats(emp.id, mesRef, {
            multiplicadorHE: 1.6,
            employee: { role: (emp as any).role, tipo_contratacao: (emp as any).tipo_contratacao },
          });
        } catch (err: any) {
          console.warn(`[rh-summary] buildFolhaStats(${emp.id}) falhou:`, err?.message || err);
          return null;
        }
      })),
    );

    for (let i = 0; i < ativos.length; i++) {
      const emp = ativos[i];
      const s: any = statsByIdx[i];
      if (!s) continue;

      const total = Number(s.custoTotalEstimado || 0);
      totalMensal += total;

      const base = Number(s.baseSalary || 0);
      const peric = Number(s.periculosidade || 0);
      const heVal = Number(s.custoExtra || 0);
      const vrTotal = Number(s.valeRefeicao || 0);
      const cesta = Number(s.cestaBasica || 0);
      // Diárias: usar a mesma fonte que entrou em `custoTotalEstimado` (s.diarias),
      // pra garantir que monthly === soma do breakdown. Se vier 0 do operational_payments,
      // tenta o fallback de agent_daily_allowances pra exibição — mas NÃO altera o total.
      const diariasEmp = Number(s.diarias || 0) > 0
        ? Number(s.diarias)
        : Number(diarias.porAgente[emp.id] || 0);
      const fgts = Number(s.fgts || 0);
      const inssPatronal = Number(s.inssPatronal || 0);
      const seguroVida = Number(s.seguroVida || 0);

      acc.base += base; acc.peric += peric; acc.he += heVal;
      acc.refeicao += vrTotal; acc.cesta += cesta; acc.diarias += diariasEmp;
      acc.fgts += fgts; acc.inssPatronal += inssPatronal; acc.seguroVida += seguroVida;

      const hm = horasMes.get(emp.id) || { normais: 0, extras: 0 };
      const horasNormaisMes = Math.min(220, hm.normais);
      const horasExtrasMes = Number(s.horaExtra || 0);

      porAgente.push({
        id: emp.id,
        name: emp.name || `Agente ${emp.id}`,
        // Total cheio e operacional são iguais — não há provisões no novo cálculo.
        total,
        totalOperacional: total,
        totalProvisoes: 0,
        horasNormaisMes,
        horasExtrasMes,
        // Vencimentos
        salarioProporcional: base,
        periculosidade: peric,
        horaExtra: heVal,
        adicionalNoturno: 0,
        dsr: 0,
        valorHoraExtra: Number(s.valorHoraExtra || 0),
        // Benefícios
        vrDiario: Number(s.vrDiario || 0),
        vrDias: Number(s.diasUteis || 0),
        vrTotal,
        ajudaCusto: 0,
        vt: 0, cesta, outros: 0, diarias: diariasEmp,
        // Recolhimentos (encargos empresa)
        fgts,
        fgtsPct: Number(s.fgtsPct || 8),
        inssPatronal,
        inssPatronalPct: Number(s.inssPatronalPct || 20),
        seguroVida,
        // Compat com UI antiga
        base,
        encargos: fgts + inssPatronal + seguroVida,
        inss: 0, irrf: 0,
        totalBruto: base + peric + heVal,
        totalDeducoes: 0,
        liquidoFuncionario: base + peric + heVal,
        decimoTerceiro: 0,
        ferias: 0,
        provisaoTercoFerias: 0,
        provisaoFGTSsobreFerias13: 0,
        provisaoINSSsobreFerias13: 0,
        rescisao: 0,
        horasMensais: 220,
        custoHora: Number(s.valorHora || 0),
        semSalario: !s.hasSalary,
        // Diagnóstico (mês corrente)
        isMesCorrente: !!s.isMesCorrente,
        diasCorridosElapsed: Number(s.diasCorridosElapsed || 0),
        totalDiasMes: Number(s.totalDiasMes || 0),
      });
    }

    porAgente.sort((a, b) => b.total - a.total);

    // Sem provisões neste cálculo (alinhado ao Ponto Eletrônico). monthlyOperacional = monthly.
    const totalOperacional = totalMensal;
    const encargosTot = acc.fgts + acc.inssPatronal + acc.seguroVida;
    res.json({
      monthly: totalMensal,
      monthlyOperacional: totalOperacional,
      daily: totalMensal / 30,
      dailyOperacional: totalOperacional / 30,
      weekly: (totalMensal / 30) * 7,
      yearly: totalMensal * 12,
      agentCount: ativos.length,
      period: { from, to, businessDays, holidaysCount: holidaySet.size },
      breakdown: {
        // Compat (UI antiga)
        base: acc.base,
        encargos: encargosTot, // FGTS + INSS Patronal + Seguro de Vida
        vr: acc.refeicao,
        vt: 0, cesta: acc.cesta, outros: 0, diarias: acc.diarias,
        ferias: 0,
        decimoTerceiro: 0,
        rescisao: 0,
        horaExtra: acc.he,
        adicionalNoturno: 0,
        beneficios: acc.refeicao + acc.cesta + acc.diarias,
        // Folha (Ponto Eletrônico)
        salarioProporcional: acc.base,
        periculosidade: acc.peric,
        dsr: 0,
        ajudaCusto: 0,
        totalBruto: acc.base + acc.peric + acc.he,
        inss: 0, irrf: 0, fgts: acc.fgts,
        // Novos campos (encargos empresa)
        inssPatronal: acc.inssPatronal,
        seguroVida: acc.seguroVida,
        totalDeducoes: 0,
        liquidoFuncionario: acc.base + acc.peric + acc.he,
        provisaoTercoFerias: 0,
        provisaoFGTSsobreFerias13: 0,
        provisaoINSSsobreFerias13: 0,
        totalProvisoes: 0,
      },
      porAgente,
    });
  }));

  // SUMMARY (rateios prontos)
  app.get("/api/fixed-costs/summary", requireAuth, requireAdminRole, async (_req, res) => {
    const monthly = await getMonthlyFixedCostsTotal();
    const daily = monthly / 30;
    const weekly = daily * 7;
    const yearly = monthly * 12;

    // Agrupa por categoria (cadastrados + categoria sintética "Frota (Aluguel)")
    const { data } = await supabaseAdmin
      .from("fixed_costs")
      .select("category, monthly_value, active")
      .eq("active", true);
    const porCategoria: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      const cat = r.category || "Outros";
      porCategoria[cat] = (porCategoria[cat] || 0) + Number(r.monthly_value || 0);
    });
    // fleetRent.count segue exposto pois é usado na meta de faturamento (viaturas ativas),
    // mas o valor monetário não é somado: o aluguel real deve estar cadastrado em fixed_costs.
    const fleet = await getFleetRentMonthlyTotal();

    res.json({
      monthly,
      daily,
      weekly,
      yearly,
      porCategoria,
      fleetRent: { count: fleet.count, total: 0, perVehicle: fleet.perVehicle },
    });
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

  // === Histórico de % de custos variáveis sobre faturamento ===
  // GET /api/fixed-costs/variable-cost-ratio?months=3
  // Calcula: (custos variáveis dos últimos N meses) / (faturamento dos últimos N meses)
  // Usado para sugerir automaticamente o % de custos variáveis na calculadora de meta.
  app.get("/api/fixed-costs/variable-cost-ratio", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const months = Math.max(1, Math.min(12, Number(req.query.months) || 3));
      const today = new Date();
      // Janela: últimos N meses COMPLETOS (não inclui o mês corrente parcial)
      const start = new Date(today.getFullYear(), today.getMonth() - months, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0); // último dia do mês anterior
      const startISO = start.toISOString().slice(0, 10);
      const endISO = end.toISOString().slice(0, 10);

      // Faturamento: service_orders concluídas, sem recusadas
      const { data: ordens } = await supabaseAdmin
        .from("service_orders")
        .select("fat_total, mission_status, created_at")
        .gte("created_at", startISO + "T00:00:00")
        .lte("created_at", endISO + "T23:59:59");
      const faturamento = (ordens || [])
        .filter((r: any) => r.mission_status !== "RECUSADA")
        .reduce((s: number, r: any) => s + Number(r.fat_total || 0), 0);

      // Custos variáveis: combustível, mission_cost, maintenance, ou categoria CUSTOS_VARIAVEIS
      const { data: txs } = await supabaseAdmin
        .from("financial_transactions")
        .select("amount, type, category, origin_type, date")
        .gte("date", startISO)
        .lte("date", endISO);
      const variaveis = (txs || [])
        .filter((r: any) => {
          const isDespesa = r.type === "despesa" || r.type === "DESPESA";
          const isVar =
            r.category === "CUSTOS_VARIAVEIS" ||
            ["fueling", "mission_cost", "maintenance"].includes(String(r.origin_type || ""));
          return isDespesa && isVar;
        })
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const ratio = faturamento > 0 ? variaveis / faturamento : 0;
      const ratioPct = Math.round(ratio * 1000) / 10; // 1 casa decimal

      res.json({
        months,
        period: { from: startISO, to: endISO },
        faturamento,
        custosVariaveis: variaveis,
        ratio,
        ratioPct,
      });
    } catch (err: any) {
      console.error("[variable-cost-ratio] error:", err);
      res.status(500).json({ message: err.message || "Erro ao calcular ratio" });
    }
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
