import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { insertFixedCostSchema } from "@shared/schema";
import { z } from "zod";
import { countBusinessDays, loadHolidaySet, monthRange } from "./holidays";
import { sumDailyAllowancesForPeriod } from "./daily-allowances";
import {
  calcularFolha,
  resolveCestaAjudaTorres,
  selectSalaryVigenteFromHistory,
  VR_DIAS_UTEIS_CCT,
  type PayrollBreakdown,
} from "../lib/payroll";
import { resolveHorasExtrasNoturnasBulk } from "../lib/employee-monthly-cost";
import { isCltContrato, normalizeTipoContratacao } from "@shared/contratacao";
import { withSwrCache } from "../lib/swr-cache";
import { currentBrtDayRange, currentBrtWeekRange, currentBrtMonthRange } from "../lib/brt-date";
import {
  RH_SUMMARY_FRESH_TTL_MS,
  RH_SUMMARY_HARD_TTL_MS,
  RH_SUMMARY_SCHEMA,
  rhSummarySwrBaseKey,
} from "@shared/cache-keys";

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
 * Usa o salário vigente em `opts.referenceDate` (effective_date <= referência).
 * Mesma regra do cadastro (salary-summary) e do Ponto (buildFolhaStats).
 *
 * `opts.businessDays` — legado; VR mensal é FIXO em diasUteisMes CCT (22 → R$ 946).
 *                       Ignorado no cálculo de VR (decisão dono 29/07/2026).
 * `opts.diariasManuais` — soma de diárias de lançamento manual no período (apenas no breakdown).
 * `opts.rescisaoPct`   — percentual de rescisão sobre a folha bruta (default 8%).
 * `opts.referenceDate` — YYYY-MM-DD; vigência salarial (default = hoje BRT aproximado).
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
    /** Cargo do funcionário — usado no fallback Kit CCT (mesmo do cadastro). */
    role?: string | null;
    /** tipo_contratacao já carregado (evita re-query). */
    tipoContratacao?: string | null;
    /** Data de referência da vigência salarial (YYYY-MM-DD). */
    referenceDate?: string;
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
    valeAlimentacao: number;
    assiduidade: number;
    horasMensais: number;
    custoHora: number;
    ferias: number;
    decimoTerceiro: number;
    rescisao: number;
    horaExtra: number;
    adicionalNoturno: number;
    // === Folha 2025 (engine completa) ===
    salarioProporcional: number;
    /** Salário base contratual vigente (não rateado por calendário). */
    salarioBaseCheio: number;
    effectiveDate: string | null;
    salaryRecordId: number | null;
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
    semSalario: boolean;
  };
}> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const referenceDate =
    (opts?.referenceDate && String(opts.referenceDate).slice(0, 10)) ||
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Busca candidatos com vigência <= referência (evita salário futuro).
  // Determinístico: ordenação + selectSalaryVigenteFromHistory.
  const { data, error } = await supabaseAdmin
    .from("employee_salaries")
    .select("*")
    .eq("employee_id", employeeId)
    .lte("effective_date", referenceDate)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);

  // VR mensal FIXO = diário × 22 dias CCT (43 × 22 = 946). Não varia com feriados.
  const vrDias = VR_DIAS_UTEIS_CCT;

  // Horas extras/noturnas do PERÍODO. Se chamador passou override (rota /rh-summary
  // que já agregou batidas Control iD + jornada_calculos do mês), usa direto.
  // Senão, fallback: média dos 3 últimos meses em jornada_calculos (legado).
  let horasExtrasMedia = opts?.horasExtras;
  let horasNoturnasMedia = opts?.horasNoturnas;
  if (horasExtrasMedia === undefined || horasNoturnasMedia === undefined) {
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

  // Regime: CLT ou PJ (legado "fixo" = PJ) — resolve antes do fallback de salário.
  let tipoContratacao = opts?.tipoContratacao;
  if (tipoContratacao === undefined) {
    const { data: empRowTipo } = await supabaseAdmin
      .from("employees")
      .select("tipo_contratacao")
      .eq("id", employeeId)
      .limit(1);
    tipoContratacao = empRowTipo?.[0] ? (empRowTipo[0] as any).tipo_contratacao : null;
  }
  const isClt = isCltContrato(tipoContratacao);

  // Sem salário na vigência: CLT → kit CCT; PJ → zera (não inventa CCT+peric).
  const vigente = selectSalaryVigenteFromHistory(data || [], referenceDate);
  const semSalario = !!(error || !vigente);
  let s: any = vigente || null;
  if (semSalario) {
    if (isClt) {
      const { getCctConfigByCargo } = await import("../lib/cct-config");
      const cct = await getCctConfigByCargo(opts?.role || null);
      const benKit = resolveCestaAjudaTorres(Number(cct.cestaBasica || 0), Number((cct as any).ajudaCustoMensal || 0));
      s = {
        base_salary: cct.salarioBase,
        periculosidade_pct: cct.periculosidadePct,
        vale_refeicao_diario: cct.valeRefeicaoDia,
        cesta_basica: benKit.cesta,
        vale_transporte_mensal: 0,
        beneficios_outros: 0,
        horas_mensais: 220,
        ajuda_custo_mensal: benKit.ajudaCusto,
        vale_alimentacao_mensal: 0,
        assiduidade_mensal: 0,
        dependentes_ir: 0,
      };
    } else {
      s = {
        base_salary: 0,
        periculosidade_pct: 0,
        vale_refeicao_diario: 0,
        cesta_basica: 0,
        vale_transporte_mensal: 0,
        beneficios_outros: 0,
        horas_mensais: 220,
        ajuda_custo_mensal: 0,
        vale_alimentacao_mensal: 0,
        assiduidade_mensal: 0,
        dependentes_ir: 0,
      };
    }
  }

  const base = Number(s.base_salary || 0);
  const vrDiario = isClt ? Number(s.vale_refeicao_diario ?? 43) : 0;
  const vrLegacy = isClt ? Number(s.vale_refeicao_mensal || 0) : 0;
  const vrTotal = vrLegacy > 0 ? vrLegacy : vrDiario * vrDias;
  const vt = isClt ? Number(s.vale_transporte_mensal || 0) : 0;
  // Kit legado: cesta 200 → ajuda de custo (não cesta básica).
  const ben = resolveCestaAjudaTorres(
    isClt ? Number(s.cesta_basica ?? 0) : 0,
    Number(s.ajuda_custo_mensal || 0),
  );
  const cesta = isClt ? ben.cesta : 0;
  const ajudaCustoMensal = ben.ajudaCusto;
  const outros = isClt ? Number(s.beneficios_outros || 0) : 0;
  const valeAlimentacao = isClt ? Number(s.vale_alimentacao_mensal || 0) : 0;
  const assiduidade = isClt ? Number(s.assiduidade_mensal || 0) : 0;
  const diarias = isClt ? (opts?.diariasManuais ?? 0) : 0;
  const horasMensais = Number(s.horas_mensais || 220);
  // PJ: nunca herda 30% CCT — valor fixo = base_salary cadastrado.
  const periculosidadePct = isClt ? Number(s.periculosidade_pct ?? 30) / 100 : 0;
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

  // Taxas HE CCT (diurna 16 / noturna 16,50) — não inventar multiplicador do salário.
  const { getCctConfigByCargo } = await import("../lib/cct-config");
  const cctRates = await getCctConfigByCargo(opts?.role || null);
  const heDiurnaFixo = isClt ? Number(cctRates.horaExtraValor || 0) : 0;
  const heNoturnaFixo = isClt ? Number((cctRates as any).horaExtraNoturnaValor || 0) : 0;

  // Engine de folha 2025 — MESMA do cadastro (salary-summary → calcularFolha).
  // PJ: valor fixo = base (sem peric/HE/VR/impostos).
  const folha = calcularFolha({
    salarioBaseCheio: base,
    diasTrabalhados,
    horasMensais,
    periculosidadePct,
    horasExtras: isClt ? horasExtrasMedia : 0,
    horasNoturnas: isClt ? horasNoturnasMedia : 0,
    diasUteis: isClt ? vrDias : 0,
    refeicaoDiaria: isClt ? vrDiario : 0,
    ajudaCustoMensal,
    dependentesIR,
    isClt,
    valorHoraExtraFixo: heDiurnaFixo,
    valorHoraNoturnaFixo: heNoturnaFixo,
  });

  // Custo Empresa: CLT = folha + benefícios CCT + diárias; PJ = só valor fixo.
  const total = isClt
    ? +(folha.custoTotalEmpresa + cesta + vt + outros + valeAlimentacao + assiduidade + diarias).toFixed(2)
    : +folha.custoTotalEmpresa.toFixed(2);
  const custoHora = horasMensais > 0 ? total / horasMensais : 0;

  // Compat: campos antigos da UI continuam funcionando
  const encargos = folha.inss + folha.irrf + folha.fgts; // soma das deduções/encargos (compatibilidade visual)
  const ferias = folha.provisaoFerias + folha.provisaoTercoFerias;
  const decimoTerceiro = folha.provisaoDecimoTerceiro;
  const rescisao = folha.provisaoFGTSsobreFerias13 + folha.provisaoINSSsobreFerias13;

  const effectiveDate = s?.effective_date
    ? String(s.effective_date).slice(0, 10)
    : null;
  const salaryRecordId = s?.id != null && !semSalario ? Number(s.id) : null;

  return {
    total,
    breakdown: {
      base: folha.salarioProporcional,
      encargos,
      vrDiario: isClt ? vrDiario : 0,
      vrDias: isClt ? vrDias : 0,
      vrTotal: isClt ? vrTotal : 0,
      vt: isClt ? vt : 0,
      cesta: isClt ? cesta : 0,
      outros: isClt ? outros : 0,
      diarias: isClt ? diarias : 0,
      valeAlimentacao: isClt ? valeAlimentacao : 0,
      assiduidade: isClt ? assiduidade : 0,
      horasMensais, custoHora,
      ferias, decimoTerceiro, rescisao,
      horaExtra: folha.horasExtrasValor,
      adicionalNoturno: folha.adicionalNoturnoValor,
      // === Folha 2025 ===
      salarioProporcional: folha.salarioProporcional,
      salarioBaseCheio: base,
      effectiveDate,
      salaryRecordId,
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
      semSalario,
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
  // baseKey/schema: shared/cache-keys.ts (única fonte — sem vN espalhado).
  app.get("/api/fixed-costs/rh-summary", requireAuth, requireAdminRole, withSwrCache({
    baseKey: rhSummarySwrBaseKey(),
    ttlMs: RH_SUMMARY_HARD_TTL_MS,
    freshTtlMs: RH_SUMMARY_FRESH_TTL_MS,
    attachCacheMeta: true,
    schema: RH_SUMMARY_SCHEMA,
    // Warm-up: dia (filtro Diário), semana (filtro padrão do Balanço) e mês correntes em BRT.
    warmQueries: () => [currentBrtDayRange(), currentBrtWeekRange(), currentBrtMonthRange()],
  }, async (req, res) => {
    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, status, role, tipo_contratacao, hire_date");
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
    // Competência RH (ciclo 26→25): se o filtro começa no dia 26, o mês de
    // referência é o do `to` (ex.: 26/06→25/07 → mesRef=2026-07). Senão usa `from`.
    const fromDay = Number(String(from).slice(8, 10));
    const mesRef = (fromDay === 26 ? String(to).slice(0, 7) : String(from).slice(0, 7));
    const yearRef = Number(mesRef.slice(0, 4));
    const monthRef = Number(mesRef.slice(5, 7));

    // HE / noturno: ponto_operacional → jornada_calculos → batidas Control iD.
    // Não trava em ponto com HE=0 (vigilantes batem no Control iD, não no app).
    const heByEmp = new Map<number, number>();
    const notByEmp = new Map<number, number>();
    const heFonteByEmp = new Map<number, string>();
    try {
      const horasMap = await resolveHorasExtrasNoturnasBulk({
        employeeIds: ativos.map((e) => Number(e.id)),
        from,
        to,
        mesRef,
      });
      for (const [id, h] of horasMap) {
        heByEmp.set(id, h.horasExtras);
        notByEmp.set(id, h.horasNoturnas);
        heFonteByEmp.set(id, h.fonte);
      }
    } catch (e: any) {
      console.warn("[rh-summary] horas ponto/jornada/batidas:", e?.message || e);
    }

    const porAgente: any[] = [];
    let totalMensal = 0;
    const acc = {
      base: 0, peric: 0, he: 0, noturno: 0, refeicao: 0,
      fgts: 0, vt: 0, cesta: 0, outros: 0, diarias: 0,
      ajudaCusto: 0, valeAlimentacao: 0, assiduidade: 0,
      inssFunc: 0, irrfFunc: 0, liquidoFunc: 0,
      ferias: 0, decimoTerceiro: 0, provisaoTerco: 0,
      provisaoFgts: 0, provisaoInss: 0, totalProvisoes: 0,
    };

    // Alinhado com o CADASTRO do funcionário (salary-summary → calcularFolha → Custo Empresa):
    // bruto + FGTS + provisões (13º/férias/1/3) + cesta/VT/outros/VA/assiduidade.
    // Mesma engine CCT do Kit do funcionário — NÃO usa buildFolhaStats (Ponto).
    const limit = createLimit(6);
    const statsByIdx = await Promise.all(
      ativos.map((emp) => limit(async () => {
        try {
          // Proporcional na admissão (mesma regra do salary-summary)
          let diasTrabalhados = 30;
          const hireRaw = (emp as any).hire_date || (emp as any).hireDate;
          if (hireRaw) {
            const hire = new Date(hireRaw);
            if (hire.getFullYear() === yearRef && hire.getMonth() + 1 === monthRef) {
              const daysInMonth = new Date(yearRef, monthRef, 0).getDate();
              diasTrabalhados = Math.max(1, daysInMonth - hire.getDate() + 1);
            }
          }
          return await calculateAgentMonthlyCost(emp.id, {
            businessDays,
            holidaySet,
            diariasManuais: Number(diarias.porAgente[emp.id] || 0),
            diasTrabalhados,
            horasExtras: Math.round((heByEmp.get(emp.id) || 0) * 100) / 100,
            horasNoturnas: Math.round((notByEmp.get(emp.id) || 0) * 100) / 100,
            role: (emp as any).role,
            tipoContratacao: (emp as any).tipo_contratacao,
            // Vigência: último salário com effective_date <= fim do período filtrado.
            referenceDate: to,
          });
        } catch (err: any) {
          console.warn(`[rh-summary] calculateAgentMonthlyCost(${emp.id}) falhou:`, err?.message || err);
          return null;
        }
      })),
    );

    for (let i = 0; i < ativos.length; i++) {
      const emp = ativos[i];
      const r = statsByIdx[i];
      if (!r) continue;

      const b = r.breakdown;
      const total = Number(r.total || 0);
      totalMensal += total;

      const base = Number(b.salarioProporcional || 0);
      const peric = Number(b.periculosidade || 0);
      const heVal = Number(b.horaExtra || 0);
      const noturnoVal = Number(b.adicionalNoturno || 0);
      const inssFuncVal = Number(b.inss || 0);
      const irrfFuncVal = Number(b.irrf || 0);
      const liquidoFuncVal = Number(b.liquidoFuncionario || 0);
      const vrTotal = Number(b.vrTotal || 0);
      const cesta = Number(b.cesta || 0);
      const vt = Number(b.vt || 0);
      const outros = Number(b.outros || 0);
      const diariasEmp = Number(b.diarias || 0);
      const ajudaCusto = Number(b.ajudaCusto || 0);
      const valeAlimentacao = Number(b.valeAlimentacao || 0);
      const assiduidade = Number(b.assiduidade || 0);
      const fgts = Number(b.fgts || 0);
      const totalProvisoes = Number(b.totalProvisoes || 0);
      const ferias = Number(b.ferias || 0);
      const decimoTerceiro = Number(b.decimoTerceiro || 0);

      acc.base += base; acc.peric += peric; acc.he += heVal; acc.noturno += noturnoVal;
      acc.refeicao += vrTotal; acc.cesta += cesta; acc.vt += vt; acc.outros += outros;
      acc.diarias += diariasEmp; acc.ajudaCusto += ajudaCusto;
      acc.valeAlimentacao += valeAlimentacao; acc.assiduidade += assiduidade;
      acc.fgts += fgts;
      acc.inssFunc += inssFuncVal; acc.irrfFunc += irrfFuncVal; acc.liquidoFunc += liquidoFuncVal;
      acc.ferias += ferias; acc.decimoTerceiro += decimoTerceiro;
      acc.provisaoTerco += Number(b.provisaoTercoFerias || 0);
      acc.provisaoFgts += Number(b.provisaoFGTSsobreFerias13 || 0);
      acc.provisaoInss += Number(b.provisaoINSSsobreFerias13 || 0);
      acc.totalProvisoes += totalProvisoes;

      porAgente.push({
        id: emp.id,
        name: emp.name || `Agente ${emp.id}`,
        // Custo Empresa CCT (cadastro) — inclui FGTS + provisões
        total,
        totalOperacional: total,
        totalProvisoes,
        horasNormaisMes: 0,
        horasExtrasMes: Number(heByEmp.get(emp.id) || 0),
        horasExtrasFonte: heFonteByEmp.get(emp.id) || "nenhuma",
        // Vencimentos — salário base contratual ≠ proporcional (não ratear por calendário)
        salarioBaseCheio: Number(b.salarioBaseCheio || base),
        effectiveDate: b.effectiveDate || null,
        salaryRecordId: b.salaryRecordId ?? null,
        salarioProporcional: base,
        periculosidade: peric,
        horaExtra: heVal,
        adicionalNoturno: noturnoVal,
        dsr: Number(b.dsr || 0),
        valorHoraExtra: 0,
        // Benefícios
        vrDiario: Number(b.vrDiario || 0),
        vrDias: Number(b.vrDias || 0),
        vrTotal,
        ajudaCusto,
        vt, cesta, outros, diarias: diariasEmp,
        valeAlimentacao, assiduidade,
        // Encargos empresa (entram no Custo Empresa do cadastro)
        fgts,
        fgtsPct: 8,
        inssPatronal: 0,
        inssPatronalPct: 0,
        seguroVida: 0,
        // Compat com UI
        base,
        encargos: Number(b.encargos || 0),
        inss: inssFuncVal, irrf: irrfFuncVal,
        totalBruto: Number(b.totalBruto || 0),
        totalDeducoes: Number(b.totalDeducoes || 0),
        liquidoFuncionario: liquidoFuncVal,
        decimoTerceiro,
        ferias,
        provisaoTercoFerias: Number(b.provisaoTercoFerias || 0),
        provisaoFGTSsobreFerias13: Number(b.provisaoFGTSsobreFerias13 || 0),
        provisaoINSSsobreFerias13: Number(b.provisaoINSSsobreFerias13 || 0),
        rescisao: Number(b.rescisao || 0),
        horasMensais: Number(b.horasMensais || 220),
        custoHora: Number(b.custoHora || 0),
        semSalario: !!b.semSalario,
        fonte: "cct-cadastro",
      });
    }

    porAgente.sort((a, b) => b.total - a.total);

    // monthly = Custo Empresa CCT (soma dos cadastros). monthlyOperacional = mesmo valor.
    const totalOperacional = totalMensal;
    res.json({
      monthly: totalMensal,
      monthlyOperacional: totalOperacional,
      daily: totalMensal / 30,
      dailyOperacional: totalOperacional / 30,
      weekly: (totalMensal / 30) * 7,
      yearly: totalMensal * 12,
      agentCount: ativos.length,
      period: { from, to, businessDays, holidaysCount: holidaySet.size },
      fonte: "cct-cadastro",
      breakdown: {
        base: acc.base,
        // Encargos no custo = FGTS (provisões 13º/férias são só informativas)
        encargos: acc.fgts,
        vr: acc.refeicao,
        vt: acc.vt, cesta: acc.cesta, outros: acc.outros + acc.valeAlimentacao + acc.assiduidade,
        diarias: acc.diarias,
        ferias: acc.ferias,
        decimoTerceiro: acc.decimoTerceiro,
        rescisao: acc.provisaoFgts + acc.provisaoInss,
        horaExtra: acc.he,
        adicionalNoturno: acc.noturno,
        beneficios: acc.refeicao + acc.cesta + acc.vt + acc.outros + acc.diarias + acc.valeAlimentacao + acc.assiduidade + acc.ajudaCusto,
        salarioProporcional: acc.base,
        periculosidade: acc.peric,
        dsr: 0,
        ajudaCusto: acc.ajudaCusto,
        // Remuneração apenas (VR/ajuda ficam em benefícios) — alinhado a calcularFolha.totalBruto
        totalBruto: acc.base + acc.peric + acc.he + acc.noturno,
        inss: +acc.inssFunc.toFixed(2), irrf: +acc.irrfFunc.toFixed(2), fgts: acc.fgts,
        inssPatronal: 0,
        seguroVida: 0,
        totalDeducoes: +(acc.inssFunc + acc.irrfFunc).toFixed(2),
        liquidoFuncionario: +acc.liquidoFunc.toFixed(2),
        provisaoTercoFerias: acc.provisaoTerco,
        provisaoFGTSsobreFerias13: acc.provisaoFgts,
        provisaoINSSsobreFerias13: acc.provisaoInss,
        totalProvisoes: acc.totalProvisoes,
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
