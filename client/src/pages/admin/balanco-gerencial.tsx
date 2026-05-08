import AdminLayout from "@/components/admin/layout";
import { formatDateBRT } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useMetaConfig, calcMeta } from "@/lib/meta-faturamento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  TrendingUp, TrendingDown, DollarSign, Car, Users, Target,
  Calendar, ChevronLeft, ChevronRight, ChevronDown, BarChart3, ArrowUpRight,
  ArrowDownRight, Loader2, RefreshCw, Crosshair, Truck, Clock,
  Trophy, Fuel, MapPin, Activity, Award, Gauge, FileText, ShieldAlert, AlertTriangle,
  Info, Wrench, Building2, UserCog,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { queryClient, apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const fmt = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (val: number) => `${val.toFixed(1)}%`;

const fmtHoras = (val: number) => {
  if (!val || !isFinite(val)) return "0h00";
  const totalMin = Math.round(val * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
};

const META_DIARIA_VIATURA = 2000;
const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

const CCT = {
  salarioBase: 2432.50,
  periculosidadePct: 30,
  get periculosidade() { return this.salarioBase * (this.periculosidadePct / 100); },
  valeRefeicaoDia: 40.00,
  cestaBasica: 208.45,
  diasUteisMes: 22,
  get valeRefeicaoMes() { return this.valeRefeicaoDia * this.diasUteisMes; },
  get totalBruto() { return this.salarioBase + this.periculosidade + this.valeRefeicaoMes + this.cestaBasica; },
  get custoDiario() { return this.totalBruto / 30; },
};

function getMetaColor(pct: number) {
  if (pct >= 100) return { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-100", icon: true };
  if (pct >= 50) return { bar: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-100", icon: false };
  return { bar: "bg-red-400", text: "text-red-600", bg: "bg-red-100", icon: false };
}

type Period = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "SEMESTER" | "YEAR";

const PERIOD_LABELS: Record<Period, string> = {
  DAY: "Diário",
  WEEK: "Semanal",
  MONTH: "Mensal",
  QUARTER: "Trimestral",
  SEMESTER: "Semestral",
  YEAR: "Anual",
};

function getDateRange(period: Period, refDate: Date): { start: Date; end: Date; label: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();

  switch (period) {
    case "DAY":
      return { start: new Date(y, m, d), end: new Date(y, m, d, 23, 59, 59), label: refDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) };
    case "WEEK": {
      const dow = refDate.getDay();
      const start = new Date(y, m, d - dow);
      const end = new Date(y, m, d - dow + 6, 23, 59, 59);
      return { start, end, label: `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}` };
    }
    case "MONTH":
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
    case "QUARTER": {
      const q = Math.floor(m / 3);
      return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0, 23, 59, 59), label: `${q + 1}º Trimestre ${y}` };
    }
    case "SEMESTER": {
      const s = m < 6 ? 0 : 1;
      return { start: new Date(y, s * 6, 1), end: new Date(y, s * 6 + 6, 0, 23, 59, 59), label: `${s + 1}º Semestre ${y}` };
    }
    case "YEAR":
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: String(y) };
  }
}

function getDaysInRange(range: { start: Date; end: Date }): number {
  const s = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function navigatePeriod(period: Period, refDate: Date, direction: number): Date {
  const d = new Date(refDate);
  switch (period) {
    case "DAY": d.setDate(d.getDate() + direction); break;
    case "WEEK": {
      const dow = d.getDay();
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - dow);
      sunday.setDate(sunday.getDate() + 7 * direction);
      d.setTime(sunday.getTime());
      break;
    }
    case "MONTH": d.setMonth(d.getMonth() + direction); break;
    case "QUARTER": d.setMonth(d.getMonth() + 3 * direction); break;
    case "SEMESTER": d.setMonth(d.getMonth() + 6 * direction); break;
    case "YEAR": d.setFullYear(d.getFullYear() + direction); break;
  }
  return d;
}

interface ExpenseTransaction {
  id: string;
  date: string;
  amount: number;
  origin_type: string;
  description: string;
  entity_name: string;
  category_name: string;
  status: string;
}

interface TimesheetEntry {
  employeeId: number;
  date: string;
  hoursWorked: number;
}

interface FuelingEntry {
  driverId: number;
  date: string;
  totalCost: number;
  liters: number;
  vehicleId: number;
  km: number;
}

interface MissionCostEntry {
  agentId: number;
  date: string;
  amount: number;
  category: string;
  serviceOrderId: number;
}

interface DashboardData {
  byVehicle: { plate: string; model: string; fat_total: number; pag_total: number; missions: number; despesas: number }[];
  byAgent: { id: number; name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas: number }[];
  byMission: {
    id: string; data: string; origem: string; destino: string;
    placa_viatura: string; vigilante: string; vigilante_id: number;
    vigilante2?: string | null; vigilante2_id?: number | null;
    fat_total: number;
    pag_total: number; despesas: number; lucro: number; margem: number;
    km_total: number; horas_trabalhadas: number; boletim: string; status: string; client_name: string;
  }[];
  billings: any[];
  expenseTransactions: ExpenseTransaction[];
  timesheetsByAgent: TimesheetEntry[];
  fuelingByAgent: FuelingEntry[];
  missionCostsByAgent: MissionCostEntry[];
  kmByVehicle: Record<string, number>;
  missionsByDay: Record<string, any[]>;
  expensesByDay: Record<string, number>;
  totals: {
    faturamento: number; custos_operacionais: number; despesas_missao: number;
    despesas_gerais: number; receitas_gerais: number; total_missoes: number; total_km: number;
  };
}

type ActiveTab = "BALANCO" | "VEICULOS" | "AGENTES" | "MISSOES" | "METAS" | "ESTATISTICAS";

export default function BalancoGerencialPage() {
  const [period, setPeriod] = useState<Period>("WEEK");
  const [refDate, setRefDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<ActiveTab>("BALANCO");
  const [showEficienciaModal, setShowEficienciaModal] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/financial/dashboard"],
    refetchInterval: 600_000,
  });

  const { data: allVehicles } = useQuery<any[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  // Custos Fixos da operação (Aluguel, Internet, Softwares etc.)
  // Usado pra ratear o "Custo de Estar Aberto" no balanço.
  const { data: fixedCostsSummary } = useQuery<{ monthly: number; daily: number; weekly: number; yearly: number }>({
    queryKey: ["/api/fixed-costs/summary"],
    refetchInterval: 600_000,
  });

  // Custos de RH (folha real, mesmo cálculo da tela "Custos Fixos") — engine calcularFolha
  const { data: rhSummary } = useQuery<{ monthly: number; daily: number; agentCount: number }>({
    queryKey: ["/api/fixed-costs/rh-summary"],
    refetchInterval: 600_000,
  });

  // Configuração da Meta de Faturamento (compartilhada com tela "Custos Fixos")
  const [metaCfg] = useMetaConfig();
  const custoFixoTotalMensal = (fixedCostsSummary?.monthly || 0) + (rhSummary?.monthly || 0);
  const viaturasAtivasGlobal = useMemo(() => (allVehicles || []).filter(isActiveVehicle).length, [allVehicles]);
  const metaResult = useMemo(() => calcMeta(custoFixoTotalMensal, metaCfg, viaturasAtivasGlobal), [custoFixoTotalMensal, metaCfg, viaturasAtivasGlobal]);

  // Mesma regra do backend (server/routes/fixed-costs.ts isAtivo) +
  // filtro por role "Vigilante" (agentes operacionais, não Adm/Operador).
  // Usa match por prefixo p/ pegar variantes ("bloqueado_definitivo", etc.).
  const activeAgentCount = useMemo(() => {
    if (!allEmployees) return 0;
    const prefixos = ["inativo", "desligado", "bloqueado", "afastado", "férias", "ferias", "demitido", "suspenso"];
    return allEmployees.filter((e: any) => {
      const role = String(e.role || "").toLowerCase();
      if (!role.includes("vigil")) return false;
      const s = String(e.status || "").toLowerCase().trim();
      if (!s) return true;
      return !prefixos.some((p) => s === p || s.startsWith(p + "_") || s.startsWith(p + "-") || s.startsWith(p + " "));
    }).length;
  }, [allEmployees]);

  const range = useMemo(() => getDateRange(period, refDate), [period, refDate]);
  const daysInPeriod = useMemo(() => getDaysInRange(range), [range]);

  const filtered = useMemo(() => {
    if (!data) return {
      missions: [] as any[], vehicles: [] as any[], agents: [] as any[], missionDetails: [] as any[],
      expenses: { fueling: 0, mission_cost: 0, maintenance: 0, payroll: 0, fixed: 0, other: 0, total: 0 },
      expensesByVehicle: {} as Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }>,
      periodExpenses: [] as ExpenseTransaction[],
    };

    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${range.start.getFullYear()}-${pad(range.start.getMonth() + 1)}-${pad(range.start.getDate())}`;
    const endStr = `${range.end.getFullYear()}-${pad(range.end.getMonth() + 1)}-${pad(range.end.getDate())}`;

    const missions = data.byMission.filter(m => {
      if (!m.data) return false;
      if (m.status === "RECUSADA" || (m.status || "").toLowerCase() === "recusada") return false;
      const raw = String(m.data);
      const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.includes("T") ? raw.split("T")[0] : (() => {
        const dt = new Date(raw + "T12:00:00");
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      })();
      return d >= startStr && d <= endStr;
    });

    const periodExpenses = (data.expenseTransactions || []).filter(t => {
      if (!t.date) return false;
      return t.date >= startStr && t.date <= endStr;
    });

    const expenseSums = { fueling: 0, mission_cost: 0, maintenance: 0, payroll: 0, fixed: 0, other: 0, total: 0 };
    const expensesByVehicle: Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }> = {};

    // Categorias que JÁ são contabilizadas em outros lugares (RH provisão / Custos Fixos rateados).
    // Lançamentos manuais nestas categorias NÃO podem entrar em Operacional, senão dobra.
    const RH_CATS = new Set(["folha de pagamento", "recursos humanos", "vale refeição", "vale refeicao", "vale alimentação", "vale alimentacao", "salário", "salario", "salarios", "salários"]);
    const FIXED_CATS = new Set(["aluguel", "frota (aluguel)", "infraestrutura/tecnologia", "infraestrutura", "tecnologia", "internet", "energia", "telefone", "softwares", "serviços", "servicos"]);

    periodExpenses.forEach(t => {
      const amt = t.amount;
      const cat = (t.category_name || "").toLowerCase().trim();
      if (t.origin_type === "fueling") expenseSums.fueling += amt;
      else if (t.origin_type === "mission_cost") expenseSums.mission_cost += amt;
      else if (t.origin_type === "maintenance") expenseSums.maintenance += amt;
      else if (t.origin_type === "payroll" || RH_CATS.has(cat)) expenseSums.payroll += amt;
      else if (FIXED_CATS.has(cat)) expenseSums.fixed += amt;
      else expenseSums.other += amt;
      expenseSums.total += amt;

      if (t.origin_type === "fueling" || t.origin_type === "mission_cost" || t.origin_type === "maintenance") {
        const plateMatch = t.entity_name?.match(/^([A-Z0-9]{7})/);
        const descPlate = t.description?.match(/(?:ABASTECIMENTO|MANUTENÇÃO|PEDÁGIO)\s+([A-Z0-9]{7})/i);
        const plate = plateMatch?.[1] || descPlate?.[1] || null;
        if (plate) {
          if (!expensesByVehicle[plate]) expensesByVehicle[plate] = { fueling: 0, mission_cost: 0, maintenance: 0, total: 0 };
          if (t.origin_type === "fueling") expensesByVehicle[plate].fueling += amt;
          else if (t.origin_type === "mission_cost") expensesByVehicle[plate].mission_cost += amt;
          else if (t.origin_type === "maintenance") expensesByVehicle[plate].maintenance += amt;
          expensesByVehicle[plate].total += amt;
        }
      }
    });

    const vehicleMap: Record<string, typeof data.byVehicle[0] & { desp_combustivel: number; desp_pedagio: number; desp_manutencao: number }> = {};
    missions.forEach(m => {
      const plate = m.placa_viatura || "SEM PLACA";
      if (!vehicleMap[plate]) {
        const orig = data.byVehicle.find(v => v.plate === plate);
        const vExpenses = expensesByVehicle[plate];
        vehicleMap[plate] = {
          plate, model: orig?.model || "", fat_total: 0, pag_total: 0, missions: 0,
          despesas: vExpenses?.total || 0,
          desp_combustivel: vExpenses?.fueling || 0,
          desp_pedagio: vExpenses?.mission_cost || 0,
          desp_manutencao: vExpenses?.maintenance || 0,
        };
      }
      vehicleMap[plate].fat_total += m.fat_total;
      vehicleMap[plate].pag_total += m.pag_total;
      vehicleMap[plate].missions += 1;
    });

    const timesheetHoursInPeriod: Record<number, number> = {};
    (data.timesheetsByAgent || []).forEach(ts => {
      if (!ts.date || !ts.employeeId) return;
      if (ts.date >= startStr && ts.date <= endStr) {
        timesheetHoursInPeriod[ts.employeeId] = (timesheetHoursInPeriod[ts.employeeId] || 0) + (ts.hoursWorked || 0);
      }
    });

    const agentMap: Record<string, { id: number; name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas: number }> = {};
    missions.forEach(m => {
      const name = m.vigilante || "SEM AGENTE";
      const agentKey = m.vigilante_id ? String(m.vigilante_id) : name;
      if (!agentMap[agentKey]) agentMap[agentKey] = { id: m.vigilante_id || 0, name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
      agentMap[agentKey].fat_total += m.fat_total;
      agentMap[agentKey].pag_total += m.pag_total;
      agentMap[agentKey].missions += 1;

      if (m.vigilante2_id && m.vigilante2) {
        const key2 = String(m.vigilante2_id);
        if (!agentMap[key2]) agentMap[key2] = { id: m.vigilante2_id, name: m.vigilante2, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
        agentMap[key2].fat_total += m.fat_total;
        agentMap[key2].pag_total += m.pag_total;
        agentMap[key2].missions += 1;
      }
    });

    Object.values(agentMap).forEach(agent => {
      agent.horas_trabalhadas = timesheetHoursInPeriod[agent.id] || 0;
    });

    return {
      missions,
      vehicles: Object.values(vehicleMap).sort((a, b) => b.fat_total - a.fat_total),
      agents: Object.values(agentMap).sort((a, b) => b.fat_total - a.fat_total),
      missionDetails: missions.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
      expenses: expenseSums,
      expensesByVehicle,
      periodExpenses,
    };
  }, [data, range]);

  // RH usa a MESMA folha real da tela "Custos Fixos" (engine calcularFolha
  // que considera salário cadastrado, INSS/IRRF/FGTS, 13º, férias, provisões).
  // Rateia o mensal pelo período. Fallback: fórmula CCT antiga se a API não respondeu.
  const provisaoRH = useMemo(() => {
    const mensalReal = Number(rhSummary?.monthly || 0);
    if (mensalReal > 0) return (mensalReal / 30) * daysInPeriod;
    return CCT.custoDiario * activeAgentCount * daysInPeriod;
  }, [rhSummary, activeAgentCount, daysInPeriod]);

  const provisaoDiaria = useMemo(() => {
    const mensalReal = Number(rhSummary?.monthly || 0);
    if (mensalReal > 0) return mensalReal / 30;
    return CCT.custoDiario * activeAgentCount;
  }, [rhSummary, activeAgentCount]);

  const totals = useMemo(() => {
    const fat = filtered.missions.reduce((a, m) => a + m.fat_total, 0);
    const pag = filtered.missions.reduce((a, m) => a + m.pag_total, 0);
    const despFin = filtered.expenses;
    const despReais = despFin.total;
    // Lançamentos com categoria de RH (folha automática + manuais "Folha de Pagamento",
    // "Vale Refeição" etc.) e categoria de estrutura ("Aluguel", "Infraestrutura" etc.)
    // NÃO entram no custoTotal para evitar dupla contagem com a Provisão de RH e os
    // Custos Fixos rateados — esses já cobrem o mensal completo desses itens.
    const despReaisOperacional = despReais - despFin.payroll - despFin.fixed;
    // Custos fixos rateados pelo período (Aluguel, Internet, Softwares etc.)
    const custosFixosMensal = Number(fixedCostsSummary?.monthly || 0);
    const custosFixosRateados = (custosFixosMensal / 30) * daysInPeriod;
    const custoTotal = pag + despReaisOperacional + provisaoRH + custosFixosRateados;
    const lucro = fat - custoTotal;
    const margem = fat > 0 ? (lucro / fat) * 100 : 0;
    const km = filtered.missions.reduce((a, m) => a + m.km_total, 0);
    const horas = filtered.agents.reduce((a, ag) => a + (ag.horas_trabalhadas || 0), 0);
    return {
      fat, pag, desp: despReais, lucro, margem, km, horas, total: filtered.missions.length,
      desp_combustivel: despFin.fueling,
      desp_pedagio: despFin.mission_cost,
      desp_manutencao: despFin.maintenance,
      desp_folha: despFin.payroll,
      desp_outras: despFin.other,
      provisaoRH,
      custosFixosMensal,
      custosFixosRateados,
      custoTotal,
    };
  }, [filtered, provisaoRH, fixedCostsSummary, daysInPeriod]);

  const eficiencia = useMemo(() => {
    if (!data) return { mediaKmL: 0, totalKm: 0, totalLiters: 0, perVehicle: [] as { plate: string; model: string; km: number; liters: number; kmL: number }[], abaixo: [] as { plate: string; model: string; km: number; liters: number; kmL: number }[] };

    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${range.start.getFullYear()}-${pad(range.start.getMonth() + 1)}-${pad(range.start.getDate())}`;
    const endStr = `${range.end.getFullYear()}-${pad(range.end.getMonth() + 1)}-${pad(range.end.getDate())}`;

    const idToPlate: Record<number, string> = {};
    const plateToModel: Record<string, string> = {};
    (allVehicles || []).forEach((v: any) => {
      if (v.id != null && v.plate) {
        idToPlate[v.id] = v.plate;
        plateToModel[v.plate] = v.model || "";
      }
    });

    // Agrupa TODOS os abastecimentos (sem filtro de data) por viatura.
    // O abastecimento ANTERIOR ao período é necessário para calcular
    // o km rodado entre tanques cuja recarga caiu dentro do período.
    const byVehicle = new Map<number, { date: string; km: number; liters: number }[]>();
    (data.fuelingByAgent || []).forEach((f) => {
      if (!f.vehicleId || !f.date) return;
      if (!byVehicle.has(f.vehicleId)) byVehicle.set(f.vehicleId, []);
      byVehicle.get(f.vehicleId)!.push({
        date: String(f.date).slice(0, 10),
        km: Number(f.km) || 0,
        liters: Number(f.liters) || 0,
      });
    });

    const perVehicle: { plate: string; model: string; km: number; liters: number; kmL: number }[] = [];
    let totalKm = 0;
    let totalLiters = 0;

    byVehicle.forEach((list, vehicleId) => {
      const plate = idToPlate[vehicleId];
      if (!plate) return;
      // Ordena por km ascendente (hodômetro). Em empate de km, usa data.
      const sorted = [...list].sort((a, b) => {
        if (a.km !== b.km) return a.km - b.km;
        return a.date.localeCompare(b.date);
      });
      let vKm = 0;
      let vLiters = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        // Considera só intervalos cuja recarga (cur) caiu no período.
        if (cur.date < startStr || cur.date > endStr) continue;
        const kmGap = cur.km - prev.km;
        // Sanidade: km deve ser positivo e razoável; descarta hodômetro
        // zerado, troca de viatura ou erro de digitação (>3000 km).
        if (kmGap <= 0 || kmGap > 3000) continue;
        if (cur.liters <= 0) continue;
        vKm += kmGap;
        vLiters += cur.liters;
      }
      if (vKm > 0 && vLiters > 0) {
        perVehicle.push({ plate, model: plateToModel[plate] || "", km: vKm, liters: vLiters, kmL: vKm / vLiters });
        totalKm += vKm;
        totalLiters += vLiters;
      }
    });

    perVehicle.sort((a, b) => a.kmL - b.kmL);
    const mediaKmL = totalKm > 0 && totalLiters > 0 ? totalKm / totalLiters : 0;
    const abaixo = perVehicle.filter((v) => v.kmL < 14);

    return { mediaKmL, totalKm, totalLiters, perVehicle, abaixo };
  }, [data, allVehicles, range]);

  const TABS: { id: ActiveTab; label: string; icon: typeof BarChart3 }[] = [
    { id: "BALANCO", label: "Balanço", icon: BarChart3 },
    { id: "ESTATISTICAS", label: "Estatísticas", icon: TrendingUp },
    { id: "METAS", label: "Metas", icon: Target },
    { id: "VEICULOS", label: "Viaturas", icon: Car },
    { id: "AGENTES", label: "Agentes", icon: Users },
    { id: "MISSOES", label: "Missões", icon: Crosshair },
  ];

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96" data-testid="loading-dashboard">
          <Loader2 className="animate-spin text-neutral-400" size={32} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-4" data-testid="page-balanco-gerencial">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight" data-testid="title-balanco">Balanço Gerencial</h2>
            <p className="text-xs text-neutral-500 font-bold uppercase">Controle de faturamento, custos e lucratividade</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => invalidateRelatedQueries("financial")} data-testid="button-refresh-dashboard">
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex gap-1 overflow-x-auto">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} data-testid={`period-${p.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide whitespace-nowrap transition-all ${
                    period === p ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-50"
                  }`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setRefDate(navigatePeriod(period, refDate, -1))} data-testid="button-prev-period">
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-black text-neutral-700 uppercase min-w-[180px] text-center" data-testid="text-period-label">
                {range.label}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setRefDate(navigatePeriod(period, refDate, 1))} data-testid="button-next-period">
                <ChevronRight size={16} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRefDate(new Date())} className="text-xs font-black uppercase" data-testid="button-today">
                Hoje
              </Button>
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-2 gap-3 ${isDiretoria ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-4"}`}>
          {(() => {
            const activeVehicles = (allVehicles || []).filter(isActiveVehicle);
            const totalViaturas = activeVehicles.length;
            const metaPeriodo = META_DIARIA_VIATURA * daysInPeriod * totalViaturas;
            const metaPct = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;
            const mc = getMetaColor(metaPct);

            const today = new Date();
            const periodStart = range.start;
            const periodEnd = range.end;
            const elapsed = Math.max(1, Math.floor((Math.min(today.getTime(), periodEnd.getTime()) - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            const isPast = today > periodEnd;
            const dailyAvg = totals.fat / elapsed;
            const projection = isPast ? totals.fat : dailyAvg * daysInPeriod;
            const chancePct = metaPeriodo > 0 ? (projection / metaPeriodo) * 100 : 0;
            const chanceColor = chancePct >= 100 ? "text-green-700" : chancePct >= 80 ? "text-amber-600" : "text-red-600";
            const chanceBg = chancePct >= 100 ? "bg-green-50 border-green-200" : chancePct >= 80 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
            const showProjection = period !== "DAY" && totals.fat > 0 && !isPast;

            return (
              <Card className={`p-4 border-neutral-200 ${mc.icon ? "ring-2 ring-green-400" : ""}`} data-testid="card-faturamento">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mc.bg}`}>
                    {mc.icon ? <Trophy size={16} className="text-green-600" /> : <ArrowUpRight size={16} className="text-green-700" />}
                  </div>
                  <span className="text-xs font-black text-neutral-400 uppercase">Faturamento</span>
                  {mc.icon && <Badge className="bg-green-600 text-white text-[10px] font-black px-1.5 py-0 border-0">META BATIDA</Badge>}
                </div>
                <p className="text-xl font-black text-green-700 font-mono">{fmt(totals.fat)}</p>
                <p className="text-xs text-neutral-500 font-bold mt-1">{totals.total} missões | {totalViaturas} viat. ativas</p>
                {metaPeriodo > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-neutral-400">Meta: {fmt(metaPeriodo)}</span>
                      <span className={`text-[10px] font-black ${mc.text}`}>{fmtPct(metaPct)}</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${mc.bar}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    </div>
                  </div>
                )}
                {showProjection && (
                  <div className={`mt-2 rounded-lg border p-2 ${chanceBg}`} data-testid="projection-box">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase mb-0.5">Projeção para fim do mês</p>
                    <p className="text-sm font-black font-mono text-neutral-800">{fmt(projection)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <ShieldAlert size={12} className={chanceColor} />
                      <span className={`text-[10px] font-black ${chanceColor}`}>
                        Chance de atingir a meta: {fmtPct(chancePct)}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}
          {(() => {
            const operacional =
              (totals.pag || 0) +
              (totals.desp_combustivel || 0) +
              (totals.desp_pedagio || 0) +
              (totals.desp_manutencao || 0) +
              (totals.desp_outras || 0);
            const fixos = totals.custosFixosRateados || 0;
            const TipRow = ({ label, value, color = "neutral" }: { label: string; value: string; color?: string }) => (
              <div className="flex justify-between items-baseline gap-3 py-0.5">
                <span className="text-[11px] text-neutral-300">{label}</span>
                <span className={`text-[11px] font-mono font-bold ${color === "red" ? "text-red-300" : color === "amber" ? "text-amber-300" : color === "blue" ? "text-blue-300" : "text-neutral-100"}`}>{value}</span>
              </div>
            );

            type Cat = {
              key: string; label: string; value: number; color: "red" | "amber" | "blue";
              icon: any; bg: string; text: string; bar: string;
              tipTitle: string; tipDesc: string; rows: Array<{ label: string; value: number }>;
            };
            const cats: Cat[] = [];
            if (operacional > 0) cats.push({
              key: "op", label: "Operacional", value: operacional, color: "red",
              icon: Truck, bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500",
              tipTitle: "Custos Operacionais",
              tipDesc: "Despesas variáveis ligadas diretamente à execução das missões: pagamento variável aos agentes (VRP), combustível, pedágios, manutenção de viaturas e outras despesas registradas no período.",
              rows: [
                { label: "VRP (agentes)", value: totals.pag },
                { label: "Combustível", value: totals.desp_combustivel },
                { label: "Pedágio", value: totals.desp_pedagio },
                { label: "Manutenção", value: totals.desp_manutencao },
                { label: "Outras despesas", value: totals.desp_outras },
              ].filter(r => r.value > 0),
            });
            const PERIOD_BASE_DAYS: Record<Period, number> = { DAY: 1, WEEK: 7, MONTH: 30, QUARTER: 90, SEMESTER: 180, YEAR: 365 };
            const PERIOD_FOLHA_LABEL: Record<Period, string> = {
              DAY: "Folha diária real",
              WEEK: "Folha semanal real",
              MONTH: "Folha mensal real",
              QUARTER: "Folha trimestral real",
              SEMESTER: "Folha semestral real",
              YEAR: "Folha anual real",
            };
            const PERIOD_ESTRUTURA_LABEL: Record<Period, string> = {
              DAY: "Custo diário fixo",
              WEEK: "Base semanal fixa",
              MONTH: "Base mensal fixa",
              QUARTER: "Base trimestral fixa",
              SEMESTER: "Base semestral fixa",
              YEAR: "Base anual fixa",
            };
            const PERIOD_ADJ: Record<Period, string> = {
              DAY: "diário", WEEK: "semanal", MONTH: "mensal", QUARTER: "trimestral", SEMESTER: "semestral", YEAR: "anual",
            };
            const baseDays = PERIOD_BASE_DAYS[period];
            const monthlyFolha = Number(rhSummary?.monthly || 0) > 0
              ? Number(rhSummary?.monthly || 0)
              : (totals.provisaoRH / Math.max(daysInPeriod, 1)) * 30;
            const baseFolha = (monthlyFolha / 30) * baseDays;
            const baseEstrutura = (totals.custosFixosMensal / 30) * baseDays;
            const sameAsBase = daysInPeriod === baseDays;

            if (totals.provisaoRH > 0) {
              const rhRows: Array<{ label: string; value: number }> = [
                { label: `${PERIOD_FOLHA_LABEL[period]} (${rhSummary?.agentCount ?? activeAgentCount} ag.)`, value: baseFolha },
              ];
              if (!sameAsBase) {
                rhRows.push({ label: `÷ ${baseDays} × ${daysInPeriod} dia(s)`, value: totals.provisaoRH });
              }
              cats.push({
                key: "rh", label: "RH · Folha Real", value: totals.provisaoRH, color: "amber",
                icon: UserCog, bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500",
                tipTitle: "RH — Folha Real Rateada",
                tipDesc: `Custo real de pessoal calculado pelo mesmo motor da tela Custos Fixos: salário cadastrado + periculosidade + INSS/IRRF/FGTS + provisões de 13º e férias. Rateado conforme o período selecionado (${PERIOD_ADJ[period]}).`,
                rows: rhRows,
              });
            }
            if (fixos > 0) {
              const fxRows: Array<{ label: string; value: number }> = [
                { label: PERIOD_ESTRUTURA_LABEL[period], value: baseEstrutura },
              ];
              if (!sameAsBase) {
                fxRows.push({ label: `÷ ${baseDays} × ${daysInPeriod} dia(s)`, value: fixos });
              }
              fxRows.push({ label: "Custo por dia", value: totals.custosFixosMensal / 30 });
              cats.push({
                key: "fx", label: "Estrutura (rateado)", value: fixos, color: "blue",
                icon: Building2, bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-500",
                tipTitle: "Custos de Estrutura",
                tipDesc: `Custo de "estar aberto": aluguel, contas, sistemas, tributos administrativos e demais custos fixos. Rateados conforme o período selecionado (${PERIOD_ADJ[period]}).`,
                rows: fxRows,
              });
            }

            return (
              <TooltipProvider delayDuration={150}>
                <Card className="p-4 border-neutral-200" data-testid="card-custos">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <ArrowDownRight size={16} className="text-red-700" />
                    </div>
                    <span className="text-xs font-black text-neutral-400 uppercase">Custos Totais</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="ml-auto text-neutral-300 hover:text-neutral-500" aria-label="Como é calculado" data-testid="info-custos-totais">
                          <Info size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                        Soma de tudo que custa para operar no período: despesas operacionais reais + folha real rateada + custos fixos rateados. Passe o mouse em cada categoria para ver o detalhe.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xl font-black text-red-700 font-mono" data-testid="text-custo-total">{fmt(totals.custoTotal)}</p>

                  {totals.custoTotal === 0 ? (
                    <p className="text-xs text-neutral-500 mt-2">Sem despesas no período</p>
                  ) : (
                    <>
                      <div className="mt-3 h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden flex" data-testid="bar-custos-mix">
                        {cats.map(c => (
                          <Tooltip key={`bar-${c.key}`}>
                            <TooltipTrigger asChild>
                              <div className={`${c.bar} h-full`} style={{ width: `${(c.value / totals.custoTotal) * 100}%` }} />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <b>{c.label}</b> · {fmt(c.value)} ({fmtPct((c.value / totals.custoTotal) * 100)})
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {cats.map(c => {
                          const Icon = c.icon;
                          const pct = (c.value / totals.custoTotal) * 100;
                          return (
                            <Tooltip key={c.key}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 text-left transition-colors`}
                                  data-testid={`row-cat-${c.key}`}
                                >
                                  <span className={`w-6 h-6 rounded ${c.bg} flex items-center justify-center shrink-0`}>
                                    <Icon size={12} className={c.text} />
                                  </span>
                                  <span className="text-[11px] font-bold text-neutral-700 flex-1 truncate">{c.label}</span>
                                  <span className="text-[10px] text-neutral-400 font-mono tabular-nums">{fmtPct(pct)}</span>
                                  <span className={`text-xs font-mono font-black ${c.text} tabular-nums`}>{fmt(c.value)}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm p-3 bg-neutral-900 text-neutral-100 border-neutral-700">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Icon size={13} className={c.text} />
                                  <span className="text-xs font-black uppercase tracking-wide">{c.tipTitle}</span>
                                </div>
                                <p className="text-[11px] text-neutral-300 leading-relaxed mb-2">{c.tipDesc}</p>
                                <div className="border-t border-neutral-700 pt-2">
                                  {c.rows.map((r, i) => (
                                    <TipRow key={i} label={r.label} value={fmt(r.value)} color={c.color} />
                                  ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-neutral-700 flex items-baseline justify-between">
                                  <span className="text-[10px] uppercase font-black text-neutral-400">% do total</span>
                                  <span className={`text-xs font-mono font-black ${c.color === "red" ? "text-red-300" : c.color === "amber" ? "text-amber-300" : "text-blue-300"}`}>{fmtPct(pct)}</span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Card>
              </TooltipProvider>
            );
          })()}
          <Card className="p-4 border-neutral-200" data-testid="card-lucro">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <DollarSign size={16} className="text-blue-700" />
              </div>
              <span className="text-xs font-black text-neutral-400 uppercase">Lucro Líquido</span>
            </div>
            <p className={`text-xl font-black font-mono ${totals.lucro >= 0 ? "text-blue-700" : "text-red-700"}`} data-testid="text-lucro">{fmt(totals.lucro)}</p>
            <p className="text-xs text-neutral-500 font-bold mt-1" title="Faturamento − (custos reais + provisão RH + custos fixos rateados)">
              c/ RH + custos fixos
            </p>
          </Card>
          {(() => {
            const META = 35; // meta de margem líquida (%)
            const ok = totals.margem >= META;
            const atencao = totals.margem >= 25 && totals.margem < META;
            const tone = ok ? "green" : atencao ? "amber" : "red";
            const labelMap: Record<string, string> = { green: "Saudável", amber: "Atenção", red: "ABAIXO DA META" };
            return (
              <Card
                className={`p-4 border-2 ${ok ? "border-green-200" : atencao ? "border-amber-300" : "border-red-400"}`}
                data-testid="card-margem"
                title={`Meta: margem líquida ≥ ${META}% (Faturamento − custo total) ÷ Faturamento`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ok ? "bg-green-100" : atencao ? "bg-amber-100" : "bg-red-100"}`}>
                    {ok || atencao
                      ? <TrendingUp size={16} className={ok ? "text-green-700" : "text-amber-700"} />
                      : <TrendingDown size={16} className="text-red-700" />}
                  </div>
                  <span className="text-xs font-black text-neutral-400 uppercase">Margem Líquida</span>
                  {!ok && (
                    <Badge className={`text-[10px] font-black px-1.5 py-0 border-0 ${atencao ? "bg-amber-500" : "bg-red-600"} text-white`}>
                      {atencao ? "ATENÇÃO" : "ABAIXO DA META"}
                    </Badge>
                  )}
                </div>
                <p className={`text-xl font-black font-mono ${ok ? "text-green-700" : atencao ? "text-amber-700" : "text-red-700"}`} data-testid="text-margem">
                  {fmtPct(totals.margem)}
                </p>
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-neutral-400">Meta: {META}%</span>
                    <span className={`text-[10px] font-black ${ok ? "text-green-700" : atencao ? "text-amber-700" : "text-red-700"}`}>
                      {labelMap[tone]}
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ok ? "bg-green-500" : atencao ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(Math.max(totals.margem, 0) / META * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })()}
          {isDiretoria && (() => {
            const kmTotal = totals.km || 0;
            const kmDia = daysInPeriod > 0 ? kmTotal / daysInPeriod : 0;
            const kmMissao = totals.total > 0 ? kmTotal / totals.total : 0;
            const combTotal = totals.desp_combustivel || 0;
            const combDia = daysInPeriod > 0 ? combTotal / daysInPeriod : 0;
            // Combustível é gasto rodando o TOTAL de quilômetros do hodômetro,
            // não apenas o KM faturado em missões. Usamos a leitura de hodômetro
            // (eficiencia.totalKm) quando disponível para um custo/km realista.
            const kmHodometro = eficiencia.totalKm || 0;
            const kmParaCusto = kmHodometro > 0 ? kmHodometro : kmTotal;
            const custoPorKm = kmParaCusto > 0 ? combTotal / kmParaCusto : 0;
            const usaHodometro = kmHodometro > 0;
            const fmtKm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
            const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
            const fmtBRL2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <Card className="p-4 border-neutral-200" data-testid="card-km">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Gauge size={16} className="text-indigo-700" />
                  </div>
                  <span
                    className="text-xs font-black text-neutral-400 uppercase cursor-help"
                    title="KM declarado nas missões (faturado). Para o KM total rodado pelas viaturas (hodômetro), veja o card Eficiência."
                  >
                    KM Rodado (missões)
                  </span>
                </div>
                <p className="text-xl font-black text-indigo-700 font-mono" data-testid="text-km-total">
                  {fmtKm(kmTotal)} <span className="text-sm">km</span>
                </p>
                <div className="text-xs font-bold mt-1 space-y-0.5">
                  <p className="text-neutral-600" data-testid="text-km-dia">
                    Média/dia: <span className="font-mono text-neutral-800">{fmtKm(kmDia)} km</span>
                  </p>
                  <p className="text-neutral-600" data-testid="text-km-missao">
                    Média/missão: <span className="font-mono text-neutral-800">{fmtKm(kmMissao)} km</span>
                  </p>
                </div>
                <div className="text-xs font-bold mt-2 pt-2 border-t border-neutral-100 space-y-0.5">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-0.5">Combustível</p>
                  <p className="text-neutral-600" data-testid="text-combustivel-dia">
                    Média/dia: <span className="font-mono text-neutral-800">{fmtBRL(combDia)}</span>
                  </p>
                  <p
                    className="text-neutral-600"
                    data-testid="text-combustivel-km"
                    title={
                      usaHodometro
                        ? `Calculado sobre ${fmtKm(kmHodometro)} km de hodômetro (todos os km rodados pelas viaturas no período).`
                        : `Sem leituras de hodômetro no período — usando ${fmtKm(kmTotal)} km de missões.`
                    }
                  >
                    Custo/km: <span className="font-mono text-neutral-800">{fmtBRL2(custoPorKm)}</span>
                    <span className="text-[10px] text-neutral-400 ml-1">{usaHodometro ? "(hodômetro)" : "(missões)"}</span>
                  </p>
                </div>
              </Card>
            );
          })()}
          {isDiretoria && (() => {
            const media = eficiencia.mediaKmL;
            const hasData = eficiencia.totalKm > 0 && eficiencia.totalLiters > 0;
            const status = !hasData ? "sem_dados" : media >= 15 ? "excelente" : media >= 14 ? "otimo" : "atencao";
            const statusCfg = {
              excelente: { label: "Excelente", cardBg: "border-green-300 bg-green-50", iconBg: "bg-green-100", iconColor: "text-green-700", textColor: "text-green-700", subColor: "text-green-700" },
              otimo:     { label: "Ótimo",     cardBg: "border-blue-300 bg-blue-50",   iconBg: "bg-blue-100",  iconColor: "text-blue-700",  textColor: "text-blue-700",  subColor: "text-blue-700"  },
              atencao:   { label: "Atenção",   cardBg: "border-red-300 bg-red-50",     iconBg: "bg-red-100",   iconColor: "text-red-700",   textColor: "text-red-700",   subColor: "text-red-700"   },
              sem_dados: { label: "Sem dados", cardBg: "border-neutral-200",            iconBg: "bg-neutral-100", iconColor: "text-neutral-500", textColor: "text-neutral-500", subColor: "text-neutral-500" },
            }[status];
            const abaixoCount = eficiencia.abaixo.length;
            return (
              <Card className={`p-4 ${statusCfg.cardBg}`} data-testid="card-eficiencia">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusCfg.iconBg}`}>
                    <Fuel size={16} className={statusCfg.iconColor} />
                  </div>
                  <span className="text-xs font-black text-neutral-400 uppercase">Eficiência</span>
                </div>
                <p className={`text-xl font-black font-mono ${statusCfg.textColor}`} data-testid="text-eficiencia-media">
                  {hasData ? media.toFixed(1) : "--"} <span className="text-sm">km/L</span>
                </p>
                <p className={`text-xs font-bold mt-1 ${statusCfg.subColor}`}>
                  {statusCfg.label}{hasData ? ` · ${eficiencia.totalKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km / ${eficiencia.totalLiters.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L` : ""}
                </p>
                {abaixoCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowEficienciaModal(true)}
                    data-testid="button-eficiencia-abaixo"
                    className="mt-2 w-full flex items-center justify-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase px-2 py-1.5 transition-colors"
                  >
                    <AlertTriangle size={12} />
                    {abaixoCount} {abaixoCount === 1 ? "VTR abaixo" : "VTRs abaixo"} de 14
                  </button>
                )}
              </Card>
            );
          })()}
        </div>

        {/* === META DE FATURAMENTO REAL (configurada em "Custos Fixos") === */}
        {isDiretoria && custoFixoTotalMensal > 0 && metaResult.realista.valida && (() => {
          const metaPeriodo = metaResult.realista.diaria * daysInPeriod;
          const metaPct = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;
          const tone = metaPct >= 100 ? "green" : metaPct >= 70 ? "amber" : "red";
          const toneCfg = {
            green: { text: "text-green-700", bar: "bg-green-500", icon: "text-green-700" },
            amber: { text: "text-amber-700", bar: "bg-amber-500", icon: "text-amber-700" },
            red:   { text: "text-red-700",   bar: "bg-red-500",   icon: "text-red-700"   },
          }[tone];

          return (
            <Card className="p-4 border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50" data-testid="card-meta-faturamento">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-black text-emerald-900 uppercase tracking-tight flex items-center gap-2">
                    <Target size={16} /> Meta de Faturamento — {metaCfg.lucroPct}% lucro REAL
                  </h3>
                  <p className="text-[11px] text-emerald-700/80 font-bold">
                    Cobre custos fixos+RH ({fmt(custoFixoTotalMensal)}/mês) · impostos {metaCfg.impostoPct}% · custos variáveis {metaCfg.custoVarPct}%
                  </p>
                  {metaResult.pisoAplicado && (
                    <p className="text-[10px] text-amber-700 font-bold mt-0.5" data-testid="text-piso-aplicado">
                      Piso operacional aplicado: {fmt(metaResult.pisoDiario)}/dia (R$ 2.000 × {viaturasAtivasGlobal} viatura{viaturasAtivasGlobal !== 1 ? "s" : ""}, mín. R$ 6.000)
                    </p>
                  )}
                </div>
                <Link to="/admin/custos-fixos">
                  <Button variant="outline" size="sm" className="text-[10px] font-black uppercase" data-testid="button-meta-configurar">
                    Configurar
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <Card className="p-2 bg-white/70 border-emerald-200" data-testid="meta-card-diaria">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">Diária</div>
                  <div className="text-sm font-black text-emerald-700 font-mono">{fmt(metaResult.realista.diaria)}</div>
                </Card>
                <Card className="p-2 bg-white/70 border-emerald-200" data-testid="meta-card-semanal">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">Semanal</div>
                  <div className="text-sm font-black text-emerald-700 font-mono">{fmt(metaResult.realista.semanal)}</div>
                </Card>
                <Card className="p-2 bg-white/70 border-emerald-200" data-testid="meta-card-mensal">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">Mensal</div>
                  <div className="text-sm font-black text-emerald-700 font-mono">{fmt(metaResult.realista.mensal)}</div>
                </Card>
                <Card className="p-2 bg-white/70 border-emerald-200" data-testid="meta-card-anual">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">Anual</div>
                  <div className="text-sm font-black text-emerald-700 font-mono">{fmt(metaResult.realista.anual)}</div>
                </Card>
              </div>

              {/* Comparativo: período selecionado */}
              <div className="p-3 bg-white/70 rounded-lg border border-emerald-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-neutral-600 uppercase">
                    Meta no período ({range.label}, {daysInPeriod}d):
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-800" data-testid="text-meta-periodo">
                    {fmt(metaPeriodo)}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-neutral-600 uppercase">Faturamento real:</span>
                  <span className={`text-sm font-black font-mono ${toneCfg.text}`} data-testid="text-meta-progresso">
                    {fmt(totals.fat)} ({fmtPct(metaPct)})
                  </span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${toneCfg.bar}`}
                    style={{ width: `${Math.min(metaPct, 100)}%` }}
                  />
                </div>
                {metaPct < 100 ? (
                  <p className={`text-[11px] font-bold mt-1.5 ${toneCfg.text}`}>
                    Faltam <strong>{fmt(metaPeriodo - totals.fat)}</strong> ({(100 - metaPct).toFixed(1)}%) para bater a meta neste período.
                  </p>
                ) : (
                  <p className="text-[11px] font-bold mt-1.5 text-green-700">
                    Meta batida! Sobra de <strong>{fmt(totals.fat - metaPeriodo)}</strong> acima do alvo.
                  </p>
                )}
              </div>
            </Card>
          );
        })()}

        {isDiretoria && <Dialog open={showEficienciaModal} onOpenChange={setShowEficienciaModal}>
          <DialogContent className="max-w-2xl" data-testid="modal-eficiencia">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-600" />
                Viaturas com baixa eficiência (abaixo de 14 km/L)
              </DialogTitle>
              <DialogDescription>
                Período: {range.label}. Estas viaturas precisam de tratativas e correções para melhorar o consumo de combustível.
              </DialogDescription>
            </DialogHeader>
            {eficiencia.abaixo.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">
                Nenhuma viatura abaixo de 14 km/L no período selecionado.
              </p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {eficiencia.abaixo.map((v) => (
                  <div
                    key={v.plate}
                    className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                    data-testid={`row-eficiencia-${v.plate}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <Truck size={18} className="text-red-700" />
                      </div>
                      <div>
                        <p className="font-black text-sm text-neutral-800" data-testid={`text-plate-${v.plate}`}>{v.plate}</p>
                        {v.model && <p className="text-xs text-neutral-500 font-medium">{v.model}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black font-mono text-red-700" data-testid={`text-kml-${v.plate}`}>
                        {v.kmL.toFixed(1)} <span className="text-xs">km/L</span>
                      </p>
                      <p className="text-[10px] font-bold text-neutral-500">
                        {v.km.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km · {v.liters.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>}

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
          <div className="flex overflow-x-auto gap-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id.toLowerCase()}`}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wide whitespace-nowrap transition-all ${
                  activeTab === tab.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}>
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "BALANCO" && <BalancoTab missions={filtered.missions} vehicles={filtered.vehicles} agents={filtered.agents} totals={totals} range={range} period={period} expenses={filtered.expenses} periodExpenses={filtered.periodExpenses} daysInPeriod={daysInPeriod} allVehicles={allVehicles || []} provisaoDiaria={provisaoDiaria} />}
        {activeTab === "ESTATISTICAS" && <EstatisticasTab missions={filtered.missions} vehicles={filtered.vehicles} agents={filtered.agents} daysInPeriod={daysInPeriod} period={period} range={range} data={data!} allEmployees={allEmployees || []} allVehicles={allVehicles || []} />}
        {activeTab === "METAS" && <MetasTab vehicles={filtered.vehicles} agents={filtered.agents} daysInPeriod={daysInPeriod} period={period} totals={totals} allVehicles={allVehicles || []} />}
        {activeTab === "VEICULOS" && <VeiculosTab vehicles={filtered.vehicles} daysInPeriod={daysInPeriod} period={period} />}
        {activeTab === "AGENTES" && <AgentesTab agents={filtered.agents} daysInPeriod={daysInPeriod} period={period} />}
        {activeTab === "MISSOES" && <MissoesTab missions={filtered.missionDetails} />}
      </div>
    </AdminLayout>
  );
}

function BalancoTab({ missions, vehicles, agents, totals, range, period, expenses, periodExpenses, daysInPeriod, allVehicles, provisaoDiaria }: {
  missions: any[]; vehicles: any[]; agents: any[];
  totals: {
    fat: number; pag: number; desp: number; lucro: number; margem: number; km: number; horas: number; total: number;
    desp_combustivel: number; desp_pedagio: number; desp_manutencao: number; desp_outras: number;
    provisaoRH: number; custoTotal: number;
  };
  expenses: { fueling: number; mission_cost: number; maintenance: number; other: number; total: number };
  periodExpenses: ExpenseTransaction[];
  range: { start: Date; end: Date; label: string }; period: Period;
  daysInPeriod: number; allVehicles: any[]; provisaoDiaria: number;
}) {
  const metaPeriodoViatura = META_DIARIA_VIATURA * daysInPeriod;
  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; fat: number; custoReal: number; custoRH: number; custo: number; missions: number }> = {};
    missions.forEach(m => {
      const d = m.data?.split("T")[0];
      if (!d) return;
      if (!map[d]) map[d] = { date: d, fat: 0, custoReal: 0, custoRH: provisaoDiaria, custo: provisaoDiaria, missions: 0 };
      map[d].fat += m.fat_total;
      map[d].custoReal += m.pag_total;
      map[d].custo += m.pag_total;
      map[d].missions += 1;
    });
    (periodExpenses || []).forEach(t => {
      const d = t.date?.split("T")[0];
      if (!d) return;
      if (!map[d]) map[d] = { date: d, fat: 0, custoReal: 0, custoRH: provisaoDiaria, custo: provisaoDiaria, missions: 0 };
      map[d].custoReal += t.amount;
      map[d].custo += t.amount;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [missions, periodExpenses, provisaoDiaria]);

  const maxVal = useMemo(() => Math.max(...dailyData.map(d => Math.max(d.fat, d.custo)), 1), [dailyData]);

  return (
    <div className="space-y-4" data-testid="panel-balanco">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2">
          <Calendar size={16} /> Balanço {period === "DAY" ? "do Dia" : "por Dia"}
        </h4>
        <div className="flex gap-4 mb-3 text-[10px] font-bold uppercase text-neutral-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Faturamento</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Custos Reais</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Provisão RH</span>
        </div>
        {dailyData.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase">Nenhuma missão no período</p>
            <p className="text-xs mt-1">Selecione outro período ou aguarde novos dados</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {dailyData.map(d => {
              const lucro = d.fat - d.custo;
              const pct = d.fat > 0 ? (lucro / d.fat) * 100 : 0;
              return (
                <div key={d.date} className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50" data-testid={`row-day-${d.date}`}>
                  <span className="text-xs font-black text-neutral-500 w-20 shrink-0">
                    {new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </span>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex gap-1 items-center h-5">
                      <div className="bg-green-500 rounded h-full transition-all" style={{ width: `${(d.fat / maxVal) * 100}%` }} />
                      <span className="text-xs font-bold text-green-700 font-mono shrink-0">{fmt(d.fat)}</span>
                    </div>
                    <div className="flex gap-1 items-center h-5">
                      <div className="flex rounded h-full overflow-hidden transition-all" style={{ width: `${(d.custo / maxVal) * 100}%` }}>
                        <div className="bg-red-400 h-full" style={{ width: d.custo > 0 ? `${(d.custoReal / d.custo) * 100}%` : "0%" }} />
                        <div className="bg-amber-400 h-full" style={{ width: d.custo > 0 ? `${(d.custoRH / d.custo) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-xs font-bold text-red-600 font-mono shrink-0">{fmt(d.custo)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-28">
                    <p className={`text-sm font-black font-mono ${lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucro)}</p>
                    <p className="text-xs font-bold text-neutral-400">{fmtPct(pct)} | {d.missions} OS</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2">
            <Car size={16} /> Top Viaturas
          </h4>
          {vehicles.length === 0 ? (
            <p className="text-xs text-neutral-400 font-bold text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {vehicles.slice(0, 5).map((v, i) => {
                const lucro = v.fat_total - v.pag_total - v.despesas;
                const pct = v.fat_total > 0 ? (lucro / v.fat_total) * 100 : 0;
                const metaPct = metaPeriodoViatura > 0 ? (v.fat_total / metaPeriodoViatura) * 100 : 0;
                const mc = getMetaColor(metaPct);
                return (
                  <div key={v.plate} className="space-y-1" data-testid={`top-vehicle-${i}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-neutral-300 w-6">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                          {v.plate} <span className="text-neutral-400 font-bold">{v.model}</span>
                          {mc.icon && <Trophy size={14} className="text-green-600" />}
                        </p>
                        <p className="text-xs font-bold text-neutral-500">{v.missions} missões | {fmt(v.fat_total)} fat.</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black font-mono ${mc.text}`}>{fmtPct(metaPct)}</p>
                        <p className="text-xs font-bold font-mono text-green-700">{fmt(v.fat_total)}</p>
                      </div>
                    </div>
                    <div className="ml-9 w-auto bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${mc.bar}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2">
            <Users size={16} /> Top Agentes
          </h4>
          {agents.length === 0 ? (
            <p className="text-xs text-neutral-400 font-bold text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {agents.slice(0, 5).map((a: any, i: number) => {
                const lucro = a.fat_total - a.pag_total;
                const metaPct = metaPeriodoViatura > 0 ? (a.fat_total / metaPeriodoViatura) * 100 : 0;
                const mc = getMetaColor(metaPct);
                return (
                  <div key={a.name} className="space-y-1" data-testid={`top-agent-${i}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-neutral-300 w-6">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                          {a.name}
                          {mc.icon && <Trophy size={14} className="text-green-600" />}
                        </p>
                        <p className="text-xs font-bold text-neutral-500">{a.missions} missões | {fmtHoras(a.horas_trabalhadas || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black font-mono ${mc.text}`}>{fmtPct(metaPct)}</p>
                        <p className="text-xs font-bold font-mono text-green-700">{fmt(a.fat_total)}</p>
                      </div>
                    </div>
                    <div className="ml-9 w-auto bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${mc.bar}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetasTab({ vehicles, agents, daysInPeriod, period, totals, allVehicles }: {
  vehicles: any[]; agents: any[]; daysInPeriod: number; period: Period;
  totals: { fat: number; pag: number; desp: number; lucro: number; margem: number; km: number; horas: number; total: number };
  allVehicles: any[];
}) {
  const metaPeriodoViatura = META_DIARIA_VIATURA * daysInPeriod;
  const activeVehicles = useMemo(() => allVehicles.filter(isActiveVehicle), [allVehicles]);
  const totalViaturas = activeVehicles.length;

  const mergedVehicles = useMemo(() => {
    const periodMap: Record<string, any> = {};
    vehicles.forEach(v => { periodMap[v.plate] = v; });

    const result: any[] = [];
    const seen = new Set<string>();

    activeVehicles.forEach(v => {
      const plate = v.plate;
      seen.add(plate);
      const periodData = periodMap[plate];
      result.push({
        plate,
        model: v.model || periodData?.model || "",
        fat_total: periodData?.fat_total || 0,
        pag_total: periodData?.pag_total || 0,
        missions: periodData?.missions || 0,
        despesas: periodData?.despesas || 0,
      });
    });

    vehicles.forEach(v => {
      if (!seen.has(v.plate)) result.push(v);
    });

    return result.sort((a, b) => b.fat_total - a.fat_total);
  }, [vehicles, activeVehicles]);

  const metaGlobal = metaPeriodoViatura * totalViaturas;
  const metaGlobalPct = metaGlobal > 0 ? (totals.fat / metaGlobal) * 100 : 0;

  return (
    <div className="space-y-4" data-testid="panel-metas">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <h4 className="text-sm font-black text-neutral-900 uppercase mb-2 flex items-center gap-2">
          <Target size={16} /> Resumo de Metas
        </h4>
        <p className="text-xs text-neutral-500 font-bold mb-4">Meta diária por viatura: {fmt(META_DIARIA_VIATURA)} | {totalViaturas} viatura{totalViaturas !== 1 ? "s" : ""} com rastreador | Meta do período ({daysInPeriod}d): {fmt(metaPeriodoViatura)}/viat.</p>

        {totalViaturas === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Target size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase">Sem dados para calcular meta global</p>
            <p className="text-xs mt-1">Nenhuma viatura com missões no período selecionado</p>
          </div>
        ) : (
          <>
            {(() => {
              const mc = getMetaColor(metaGlobalPct);
              return (
                <>
                  {metaGlobalPct >= 100 && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 mb-4" data-testid="badge-meta-batida">
                      <Trophy size={28} className="text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-black text-green-800 uppercase">Meta do Período Batida! {fmtPct(metaGlobalPct)}</p>
                        <p className="text-xs font-bold text-green-600">Faturamento de {fmt(totals.fat)} superou a meta de {fmt(metaGlobal)}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <Card className={`p-4 border-neutral-200 ${mc.icon ? "bg-green-50 ring-1 ring-green-300" : "bg-neutral-50"}`}>
                      <p className="text-xs font-black text-neutral-500 uppercase mb-1">Meta Global</p>
                      <p className="text-xl font-black text-neutral-900 font-mono">{fmt(metaGlobal)}</p>
                      <p className="text-xs text-neutral-400 font-bold">{totalViaturas} viat. ativas × {daysInPeriod}d</p>
                    </Card>
                    <Card className="p-4 bg-neutral-50 border-neutral-200">
                      <p className="text-xs font-black text-neutral-500 uppercase mb-1">Realizado</p>
                      <p className="text-xl font-black text-green-700 font-mono">{fmt(totals.fat)}</p>
                      <p className="text-xs text-neutral-400 font-bold">{totals.total} missões</p>
                    </Card>
                    <Card className="p-4 bg-neutral-50 border-neutral-200">
                      <p className="text-xs font-black text-neutral-500 uppercase mb-1">% da Meta</p>
                      <p className={`text-xl font-black font-mono ${mc.text}`}>{fmtPct(metaGlobalPct)}</p>
                      <p className="text-xs text-neutral-400 font-bold">{mc.icon ? "Meta superada!" : `Falta ${fmt(Math.max(0, metaGlobal - totals.fat))}`}</p>
                    </Card>
                    <Card className="p-4 bg-neutral-50 border-neutral-200">
                      <p className="text-xs font-black text-neutral-500 uppercase mb-1">Horas Totais</p>
                      <p className="text-xl font-black text-neutral-900 font-mono">{fmtHoras(totals.horas)}</p>
                      <p className="text-xs text-neutral-400 font-bold">{totals.total} missões</p>
                    </Card>
                  </div>

                  <div className="w-full bg-neutral-100 rounded-full h-5 mb-2 overflow-hidden">
                    <div className={`h-full rounded-full transition-all flex items-center justify-center ${mc.bar}`}
                      style={{ width: `${Math.min(metaGlobalPct, 100)}%` }}>
                      {metaGlobalPct >= 20 && <span className="text-xs font-black text-white">{fmtPct(metaGlobalPct)}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 font-bold text-center">Progresso geral da frota no período</p>
                </>
              );
            })()}
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2">
          <Car size={16} /> Meta por Viatura
        </h4>
        <div className="space-y-4">
          {mergedVehicles.length === 0 ? (
            <p className="text-sm text-neutral-400 font-bold text-center py-8">Sem dados de viaturas no período</p>
          ) : mergedVehicles.map(v => {
            const metaPct = metaPeriodoViatura > 0 ? (v.fat_total / metaPeriodoViatura) * 100 : 0;
            const mc = getMetaColor(metaPct);
            return (
              <div key={v.plate} className="p-4 rounded-xl border border-neutral-200" data-testid={`meta-vehicle-${v.plate}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${mc.bg}`}>
                      {mc.icon ? <Trophy size={20} className="text-green-600" /> : <Car size={20} className="text-neutral-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                        {v.plate} <span className="text-neutral-400 font-bold">{v.model}</span>
                        {mc.icon && <Badge className="bg-green-600 text-white text-[10px] font-black px-1.5 py-0 border-0">META BATIDA</Badge>}
                      </p>
                      <p className="text-xs font-bold text-neutral-500">{v.missions} missões</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black font-mono ${mc.text}`}>{fmtPct(metaPct)}</p>
                    <p className="text-xs font-bold text-neutral-400">{fmt(v.fat_total)} / {fmt(metaPeriodoViatura)}</p>
                  </div>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${mc.bar}`}
                    style={{ width: `${Math.min(metaPct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2">
          <Users size={16} /> Meta por Agente
        </h4>
        <div className="space-y-4">
          {agents.length === 0 ? (
            <p className="text-sm text-neutral-400 font-bold text-center py-8">Sem dados de agentes no período</p>
          ) : agents.map((a: any) => {
            const metaPct = metaPeriodoViatura > 0 ? (a.fat_total / metaPeriodoViatura) * 100 : 0;
            const mc = getMetaColor(metaPct);
            return (
              <div key={a.name} className="p-4 rounded-xl border border-neutral-200" data-testid={`meta-agent-${a.name}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${mc.bg} ${mc.text}`}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                        {a.name}
                        {mc.icon && <Badge className="bg-green-600 text-white text-[10px] font-black px-1.5 py-0 border-0">META BATIDA</Badge>}
                      </p>
                      <p className="text-xs font-bold text-neutral-500">{a.missions} missões | {fmtHoras(a.horas_trabalhadas || 0)} trabalhadas</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black font-mono ${mc.text}`}>{fmtPct(metaPct)}</p>
                    <p className="text-xs font-bold text-neutral-400">{fmt(a.fat_total)} / {fmt(metaPeriodoViatura)}</p>
                  </div>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${mc.bar}`}
                    style={{ width: `${Math.min(metaPct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VeiculosTab({ vehicles, daysInPeriod, period }: { vehicles: any[]; daysInPeriod: number; period: Period }) {
  const metaPeriodo = META_DIARIA_VIATURA * daysInPeriod;

  return (
    <div className="space-y-4" data-testid="panel-veiculos">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black text-neutral-900 uppercase flex items-center gap-2">
            <Target size={16} /> Desempenho por Viatura
          </h4>
          <Badge variant="outline" className="text-xs font-black uppercase" data-testid="badge-meta">
            Meta: {fmt(metaPeriodo)} / {PERIOD_LABELS[period].toLowerCase()}
          </Badge>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase">Nenhuma viatura com dados no período</p>
          </div>
        ) : (
          <div className="space-y-4">
            {vehicles.map(v => {
              const lucro = v.fat_total - v.pag_total - v.despesas;
              const pct = v.fat_total > 0 ? (lucro / v.fat_total) * 100 : 0;
              const metaPct = metaPeriodo > 0 ? (v.fat_total / metaPeriodo) * 100 : 0;
              const mc = getMetaColor(metaPct);

              return (
                <div key={v.plate} className="p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-all" data-testid={`vehicle-card-${v.plate}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${mc.bg}`}>
                        {mc.icon ? <Trophy size={20} className="text-green-600" /> : <Car size={20} className="text-neutral-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-neutral-900">{v.plate}</p>
                        <p className="text-xs font-bold text-neutral-400 uppercase">{v.model} | {v.missions} missões</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`text-xs font-black uppercase ${mc.icon ? "bg-green-100 text-green-800 hover:bg-green-100" : metaPct >= 50 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                        {mc.icon ? "META ATINGIDA" : `${fmtPct(metaPct)} da meta`}
                      </Badge>
                    </div>
                  </div>

                  <div className="w-full bg-neutral-100 rounded-full h-3 mb-3 relative overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${mc.bar}`}
                      style={{ width: `${Math.min(metaPct, 100)}%` }} />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Faturamento</p>
                      <p className="text-sm font-black text-green-700 font-mono">{fmt(v.fat_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Custos</p>
                      <p className="text-sm font-black text-red-600 font-mono">{fmt(v.pag_total + v.despesas)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Lucro</p>
                      <p className={`text-sm font-black font-mono ${lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucro)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Margem</p>
                      <p className={`text-sm font-black font-mono ${pct >= 30 ? "text-green-700" : pct >= 15 ? "text-amber-600" : "text-red-600"}`}>{fmtPct(pct)}</p>
                    </div>
                  </div>
                  {(v.desp_combustivel > 0 || v.desp_pedagio > 0 || v.desp_manutencao > 0) && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap gap-3">
                      {v.desp_combustivel > 0 && (
                        <span className="text-xs font-bold text-neutral-500">Combustível: <span className="text-red-600 font-mono">{fmt(v.desp_combustivel)}</span></span>
                      )}
                      {v.desp_pedagio > 0 && (
                        <span className="text-xs font-bold text-neutral-500">Pedágio: <span className="text-red-600 font-mono">{fmt(v.desp_pedagio)}</span></span>
                      )}
                      {v.desp_manutencao > 0 && (
                        <span className="text-xs font-bold text-neutral-500">Manutenção: <span className="text-red-600 font-mono">{fmt(v.desp_manutencao)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentesTab({ agents, daysInPeriod, period }: { agents: any[]; daysInPeriod: number; period: Period }) {
  const metaPeriodo = META_DIARIA_VIATURA * daysInPeriod;

  return (
    <div className="space-y-4" data-testid="panel-agentes">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black text-neutral-900 uppercase flex items-center gap-2">
            <Users size={16} /> Desempenho por Agente
          </h4>
          <Badge variant="outline" className="text-xs font-black uppercase" data-testid="badge-meta-agente">
            Meta: {fmt(metaPeriodo)} / {PERIOD_LABELS[period].toLowerCase()}
          </Badge>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase">Nenhum agente com dados no período</p>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((a: any) => {
              const lucro = a.fat_total - a.pag_total;
              const pct = a.fat_total > 0 ? (lucro / a.fat_total) * 100 : 0;
              const metaPct = (a.fat_total / metaPeriodo) * 100;
              const atingiuMeta = a.fat_total >= metaPeriodo;

              return (
                <div key={a.name} className="p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-all" data-testid={`agent-card-${a.name}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${atingiuMeta ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-400"}`}>
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-neutral-900">{a.name}</p>
                        <p className="text-xs font-bold text-neutral-400 uppercase">{a.missions} missões | {fmtHoras(a.horas_trabalhadas || 0)} trabalhadas</p>
                      </div>
                    </div>
                    <Badge className={`text-xs font-black uppercase ${atingiuMeta ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}`}>
                      {atingiuMeta ? "META ATINGIDA" : `${fmtPct(metaPct)} da meta`}
                    </Badge>
                  </div>

                  <div className="w-full bg-neutral-100 rounded-full h-3 mb-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${atingiuMeta ? "bg-green-500" : metaPct >= 70 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${Math.min(metaPct, 100)}%` }} />
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Faturamento</p>
                      <p className="text-sm font-black text-green-700 font-mono">{fmt(a.fat_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">VRP Pago</p>
                      <p className="text-sm font-black text-red-600 font-mono">{fmt(a.pag_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Lucro</p>
                      <p className={`text-sm font-black font-mono ${lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucro)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Margem</p>
                      <p className={`text-sm font-black font-mono ${pct >= 30 ? "text-green-700" : pct >= 15 ? "text-amber-600" : "text-red-600"}`}>{fmtPct(pct)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black text-neutral-400 uppercase">Horas</p>
                      <p className="text-sm font-black font-mono text-neutral-700">{fmtHoras(a.horas_trabalhadas || 0)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RankingBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatSection({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6" data-testid={`stat-section-${title.toLowerCase().replace(/\s/g,"-")}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-wide">{title}</h4>
      </div>
      {subtitle && <p className="text-xs text-neutral-400 font-bold mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function EstatisticasTab({ missions, vehicles, agents, daysInPeriod, period, range, data, allEmployees, allVehicles }: {
  missions: any[]; vehicles: any[]; agents: any[]; daysInPeriod: number; period: Period;
  range: { start: Date; end: Date; label: string }; data: DashboardData; allEmployees: any[]; allVehicles: any[];
}) {
  const metaDiariaViatura = META_DIARIA_VIATURA;
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${range.start.getFullYear()}-${pad(range.start.getMonth() + 1)}-${pad(range.start.getDate())}`;
  const endStr = `${range.end.getFullYear()}-${pad(range.end.getMonth() + 1)}-${pad(range.end.getDate())}`;

  const empName = (id: number) => allEmployees.find((e: any) => e.id === id)?.name || `Agente #${id}`;
  const vehPlate = (id: number) => allVehicles.find((v: any) => v.id === id)?.plate || `Veículo #${id}`;

  const vehicleMetaByDay = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    missions.forEach(m => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(m.data) ? m.data : m.data?.split("T")[0];
      if (!d || !m.placa_viatura) return;
      if (!map[d]) map[d] = {};
      map[d][m.placa_viatura] = (map[d][m.placa_viatura] || 0) + m.fat_total;
    });
    const result: { date: string; total: number; atingiram: number; plates: string[] }[] = [];
    Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).forEach(([date, plates]) => {
      const atingiram = Object.entries(plates).filter(([,v]) => v >= metaDiariaViatura);
      result.push({ date, total: Object.keys(plates).length, atingiram: atingiram.length, plates: atingiram.map(([p]) => p) });
    });
    return result;
  }, [missions, metaDiariaViatura]);

  const agentMetaByDay = useMemo(() => {
    const map: Record<string, Record<string, { name: string; fat: number }>> = {};
    missions.forEach(m => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(m.data) ? m.data : m.data?.split("T")[0];
      if (!d) return;
      if (!map[d]) map[d] = {};
      if (m.vigilante_id) {
        const key = String(m.vigilante_id);
        if (!map[d][key]) map[d][key] = { name: m.vigilante || "—", fat: 0 };
        map[d][key].fat += m.fat_total;
      }
      if (m.vigilante2_id) {
        const key = String(m.vigilante2_id);
        if (!map[d][key]) map[d][key] = { name: m.vigilante2 || "—", fat: 0 };
        map[d][key].fat += m.fat_total;
      }
    });
    const result: { date: string; total: number; atingiram: number; names: string[] }[] = [];
    Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).forEach(([date, agts]) => {
      const hit = Object.entries(agts).filter(([,v]) => v.fat >= metaDiariaViatura);
      result.push({ date, total: Object.keys(agts).length, atingiram: hit.length, names: hit.map(([,v]) => v.name) });
    });
    return result;
  }, [missions, metaDiariaViatura]);

  const agentAvgKm = useMemo(() => {
    const map: Record<string, { name: string; totalKm: number; missions: number }> = {};
    missions.forEach(m => {
      const addAgent = (id: number, name: string) => {
        const key = String(id);
        if (!map[key]) map[key] = { name, totalKm: 0, missions: 0 };
        map[key].totalKm += m.km_total || 0;
        map[key].missions += 1;
      };
      if (m.vigilante_id) addAgent(m.vigilante_id, m.vigilante);
      if (m.vigilante2_id) addAgent(m.vigilante2_id, m.vigilante2);
    });
    return Object.values(map).map(a => ({ ...a, avg: a.missions > 0 ? a.totalKm / a.missions : 0 })).sort((a,b) => b.avg - a.avg);
  }, [missions]);

  const agentRegistros = useMemo(() => {
    const map: Record<string, { name: string; missoes: number; timesheets: number; fueling: number; missionCosts: number; total: number }> = {};
    missions.forEach(m => {
      const add = (id: number, name: string) => {
        const key = String(id);
        if (!map[key]) map[key] = { name, missoes: 0, timesheets: 0, fueling: 0, missionCosts: 0, total: 0 };
        map[key].missoes += 1;
      };
      if (m.vigilante_id) add(m.vigilante_id, m.vigilante);
      if (m.vigilante2_id) add(m.vigilante2_id, m.vigilante2);
    });
    (data.timesheetsByAgent || []).filter(ts => ts.date >= startStr && ts.date <= endStr).forEach(ts => {
      const key = String(ts.employeeId);
      if (!map[key]) map[key] = { name: empName(ts.employeeId), missoes: 0, timesheets: 0, fueling: 0, missionCosts: 0, total: 0 };
      map[key].timesheets += 1;
    });
    (data.fuelingByAgent || []).filter(f => f.date >= startStr && f.date <= endStr).forEach(f => {
      const key = String(f.driverId);
      if (!map[key]) map[key] = { name: empName(f.driverId), missoes: 0, timesheets: 0, fueling: 0, missionCosts: 0, total: 0 };
      map[key].fueling += 1;
    });
    (data.missionCostsByAgent || []).filter(mc => mc.date >= startStr && mc.date <= endStr).forEach(mc => {
      const key = String(mc.agentId);
      if (!map[key]) map[key] = { name: empName(mc.agentId), missoes: 0, timesheets: 0, fueling: 0, missionCosts: 0, total: 0 };
      map[key].missionCosts += 1;
    });
    Object.values(map).forEach(a => { a.total = a.missoes + a.timesheets + a.fueling + a.missionCosts; });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [missions, data, startStr, endStr]);

  const agentFuelPedagio = useMemo(() => {
    const map: Record<string, { name: string; fueling: number; pedagio: number; total: number; count: number }> = {};
    (data.fuelingByAgent || []).filter(f => f.date >= startStr && f.date <= endStr).forEach(f => {
      const key = String(f.driverId);
      if (!map[key]) map[key] = { name: empName(f.driverId), fueling: 0, pedagio: 0, total: 0, count: 0 };
      map[key].fueling += f.totalCost;
      map[key].count += 1;
    });
    (data.missionCostsByAgent || []).filter(mc => mc.date >= startStr && mc.date <= endStr && (mc.category.toLowerCase().includes("pedágio") || mc.category.toLowerCase().includes("pedagio"))).forEach(mc => {
      const key = String(mc.agentId);
      if (!map[key]) map[key] = { name: empName(mc.agentId), fueling: 0, pedagio: 0, total: 0, count: 0 };
      map[key].pedagio += mc.amount;
      map[key].count += 1;
    });
    Object.values(map).forEach(a => { a.total = a.fueling + a.pedagio; });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [data, startStr, endStr]);

  const vehicleKmRanking = useMemo(() => {
    const map: Record<string, { plate: string; model: string; km: number; missions: number }> = {};
    missions.forEach(m => {
      if (!m.placa_viatura) return;
      if (!map[m.placa_viatura]) {
        const v = allVehicles.find((v: any) => v.plate === m.placa_viatura);
        map[m.placa_viatura] = { plate: m.placa_viatura, model: v?.model || "", km: 0, missions: 0 };
      }
      map[m.placa_viatura].km += m.km_total || 0;
      map[m.placa_viatura].missions += 1;
    });
    return Object.values(map).sort((a,b) => b.km - a.km);
  }, [missions, allVehicles]);

  const agentHorasRanking = useMemo(() => {
    const map: Record<string, { name: string; horas: number; missoes: number }> = {};
    (data.timesheetsByAgent || []).filter(ts => ts.date >= startStr && ts.date <= endStr).forEach(ts => {
      const key = String(ts.employeeId);
      if (!map[key]) map[key] = { name: empName(ts.employeeId), horas: 0, missoes: 0 };
      map[key].horas += ts.hoursWorked || 0;
    });
    agents.forEach(a => {
      const key = String(a.id);
      if (map[key]) map[key].missoes = a.missions;
    });
    return Object.values(map).sort((a,b) => b.horas - a.horas);
  }, [data, agents, startStr, endStr]);

  const fmtDateBR = (d: string) => {
    try { return new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); }
    catch { return d; }
  };

  const noData = (label: string) => (
    <div className="text-center py-10 text-neutral-300">
      <Activity size={36} className="mx-auto mb-2 opacity-40" />
      <p className="text-xs font-bold uppercase">{label}</p>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="panel-estatisticas">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatSection icon={<Car size={16} className="text-blue-600" />} title="Viaturas que Bateram Meta por Dia" subtitle={`Meta diária: ${fmt(metaDiariaViatura)} por viatura`}>
          {vehicleMetaByDay.length === 0 ? noData("Sem dados no período") : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {vehicleMetaByDay.map(d => {
                const pct = d.total > 0 ? (d.atingiram / d.total) * 100 : 0;
                return (
                  <div key={d.date} className="p-3 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors" data-testid={`stat-veh-meta-${d.date}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black text-neutral-600">{fmtDateBR(d.date)}</span>
                      <div className="flex items-center gap-2">
                        {d.atingiram > 0 && <Trophy size={12} className="text-green-600" />}
                        <Badge className={`text-[10px] font-black px-1.5 py-0 border-0 ${d.atingiram > 0 ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-100"}`}>
                          {d.atingiram}/{d.total}
                        </Badge>
                      </div>
                    </div>
                    <RankingBar value={d.atingiram} maxValue={d.total} color={d.atingiram > 0 ? "bg-green-500" : "bg-neutral-300"} />
                    {d.plates.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {d.plates.map(p => <span key={p} className="text-[9px] bg-green-50 text-green-700 font-bold rounded px-1.5 py-0.5">{p}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </StatSection>

        <StatSection icon={<Users size={16} className="text-purple-600" />} title="Agentes que Bateram Meta por Dia" subtitle={`Meta diária: ${fmt(metaDiariaViatura)} por agente`}>
          {agentMetaByDay.length === 0 ? noData("Sem dados no período") : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {agentMetaByDay.map(d => {
                return (
                  <div key={d.date} className="p-3 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors" data-testid={`stat-agt-meta-${d.date}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black text-neutral-600">{fmtDateBR(d.date)}</span>
                      <div className="flex items-center gap-2">
                        {d.atingiram > 0 && <Award size={12} className="text-purple-600" />}
                        <Badge className={`text-[10px] font-black px-1.5 py-0 border-0 ${d.atingiram > 0 ? "bg-purple-100 text-purple-800 hover:bg-purple-100" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-100"}`}>
                          {d.atingiram}/{d.total}
                        </Badge>
                      </div>
                    </div>
                    <RankingBar value={d.atingiram} maxValue={d.total} color={d.atingiram > 0 ? "bg-purple-500" : "bg-neutral-300"} />
                    {d.names.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {d.names.map(n => <span key={n} className="text-[9px] bg-purple-50 text-purple-700 font-bold rounded px-1.5 py-0.5">{n.split(" ").slice(0,2).join(" ")}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </StatSection>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatSection icon={<Gauge size={16} className="text-cyan-600" />} title="Agentes com Maior Média KM" subtitle="Média de quilômetros rodados por missão">
          {agentAvgKm.length === 0 ? noData("Sem dados") : (
            <div className="space-y-3">
              {agentAvgKm.slice(0, 10).map((a, i) => (
                <div key={a.name} className="flex items-center gap-3" data-testid={`stat-avg-km-${i}`}>
                  <span className={`text-lg font-black w-7 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-300"}`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i+1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-neutral-800 truncate">{a.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RankingBar value={a.avg} maxValue={agentAvgKm[0]?.avg || 1} color="bg-cyan-500" />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-cyan-700 font-mono">{Math.round(a.avg)} km</p>
                    <p className="text-[10px] text-neutral-400 font-bold">{a.missions} missões · {a.totalKm.toLocaleString("pt-BR")} km</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatSection>

        <StatSection icon={<Activity size={16} className="text-indigo-600" />} title="Agentes com Mais Registros" subtitle="Total de registros no sistema (missões, timesheets, abastecimentos, custos)">
          {agentRegistros.length === 0 ? noData("Sem registros") : (
            <div className="space-y-3">
              {agentRegistros.slice(0, 10).map((a, i) => (
                <div key={a.name} className="flex items-center gap-3" data-testid={`stat-registros-${i}`}>
                  <span className={`text-lg font-black w-7 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-300"}`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i+1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-neutral-800 truncate">{a.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RankingBar value={a.total} maxValue={agentRegistros[0]?.total || 1} color="bg-indigo-500" />
                    </div>
                    <div className="flex gap-2 mt-1 text-[9px] font-bold text-neutral-400">
                      <span>{a.missoes} missões</span>
                      <span>{a.timesheets} folhas</span>
                      <span>{a.fueling} abast.</span>
                      <span>{a.missionCosts} custos</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-indigo-700 font-mono">{a.total}</p>
                    <p className="text-[10px] text-neutral-400 font-bold">registros</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatSection>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatSection icon={<Fuel size={16} className="text-orange-600" />} title="Agentes - Gasolina & Pedágio" subtitle="Quem mais incluiu despesas de combustível e pedágio">
          {agentFuelPedagio.length === 0 ? noData("Sem dados") : (
            <div className="space-y-3">
              {agentFuelPedagio.slice(0, 8).map((a, i) => (
                <div key={a.name} className="flex items-center gap-3" data-testid={`stat-fuel-${i}`}>
                  <span className={`text-lg font-black w-7 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-300"}`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i+1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-neutral-800 truncate">{a.name}</p>
                    <RankingBar value={a.total} maxValue={agentFuelPedagio[0]?.total || 1} color="bg-orange-500" />
                    <div className="flex gap-3 mt-1 text-[9px] font-bold">
                      {a.fueling > 0 && <span className="text-orange-600">Combustível: {fmt(a.fueling)}</span>}
                      {a.pedagio > 0 && <span className="text-amber-600">Pedágio: {fmt(a.pedagio)}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-orange-700 font-mono">{fmt(a.total)}</p>
                    <p className="text-[10px] text-neutral-400 font-bold">{a.count} lanç.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatSection>

        <StatSection icon={<MapPin size={16} className="text-emerald-600" />} title="Veículo que Mais Rodou" subtitle="Ranking de quilometragem total no período">
          {vehicleKmRanking.length === 0 ? noData("Sem dados") : (
            <div className="space-y-3">
              {vehicleKmRanking.slice(0, 8).map((v, i) => (
                <div key={v.plate} className="flex items-center gap-3" data-testid={`stat-veh-km-${i}`}>
                  <span className={`text-lg font-black w-7 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-300"}`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i+1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-neutral-800">{v.plate} <span className="text-neutral-400 font-bold">{v.model}</span></p>
                    <RankingBar value={v.km} maxValue={vehicleKmRanking[0]?.km || 1} color="bg-emerald-500" />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-emerald-700 font-mono">{v.km.toLocaleString("pt-BR")} km</p>
                    <p className="text-[10px] text-neutral-400 font-bold">{v.missions} missões</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatSection>

        <StatSection icon={<Clock size={16} className="text-rose-600" />} title="Agente que Mais Trabalhou" subtitle="Total de horas registradas em timesheet no período">
          {agentHorasRanking.length === 0 ? noData("Sem dados") : (
            <div className="space-y-3">
              {agentHorasRanking.slice(0, 8).map((a, i) => (
                <div key={a.name} className="flex items-center gap-3" data-testid={`stat-hours-${i}`}>
                  <span className={`text-lg font-black w-7 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-300"}`}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i+1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-neutral-800 truncate">{a.name}</p>
                    <RankingBar value={a.horas} maxValue={agentHorasRanking[0]?.horas || 1} color="bg-rose-500" />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-rose-700 font-mono">{fmtHoras(a.horas)}</p>
                    <p className="text-[10px] text-neutral-400 font-bold">{a.missoes} missões</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatSection>
      </div>
    </div>
  );
}

function MissoesTab({ missions }: { missions: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canceladas = missions.filter(m => m.status === "CANCELADO");
  const fmtH = (v: number) => { const h = Math.floor(v); const m = Math.round((v - h) * 60); return `${h}h${m.toString().padStart(2, "0")}`; };
  return (
    <div className="space-y-4" data-testid="panel-missoes">
      {canceladas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <ArrowUpRight size={16} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-black text-red-800 uppercase">Receita de Cancelamento</p>
            <p className="text-xs font-bold text-red-600">{canceladas.length} OS cancelada{canceladas.length > 1 ? "s" : ""} gerando ressarcimento de {fmt(canceladas.reduce((a: number, m: any) => a + m.fat_total, 0))}</p>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-200">
          <h4 className="text-sm font-black text-neutral-900 uppercase flex items-center gap-2">
            <Crosshair size={16} /> Relatório Detalhado por Missão
          </h4>
          <p className="text-xs text-neutral-400 font-bold uppercase mt-1">{missions.length} missões no período · Clique em uma linha para expandir</p>
        </div>

        {missions.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            <Crosshair size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase">Nenhuma missão no período</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {missions.map(m => {
              const custoTotal = m.pag_total + m.despesas;
              const isCancelada = m.status === "CANCELADO";
              const isExpanded = expandedId === m.id;
              return (
                <div key={m.id} data-testid={`row-mission-${m.id}`}>
                  <button
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${isCancelada ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-neutral-50"}`}
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isExpanded ? <ChevronDown size={14} className="text-neutral-400 shrink-0" /> : <ChevronRight size={14} className="text-neutral-400 shrink-0" />}
                      <span className="text-xs font-black text-neutral-900 shrink-0">{m.os_number || m.boletim || "-"}</span>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        {m.data ? new Date((/[Zz]$/.test(m.data) || /[+-]\d{2}:\d{2}$/.test(m.data)) ? m.data : m.data + "Z").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "-"}
                      </span>
                      {isCancelada ? (
                        <Badge className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0 border-0 hover:bg-red-600 shrink-0">CANCELADA</Badge>
                      ) : m.status === "APROVADA" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0 border-0 hover:bg-emerald-100 shrink-0">APROVADA</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0 border-0 hover:bg-amber-100 shrink-0">{m.status || "CALC"}</Badge>
                      )}
                      <span className="text-xs text-neutral-500 truncate">{m.client_name || "-"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-neutral-500">{m.placa_viatura || "-"}</span>
                      <span className={`text-xs font-black font-mono ${isCancelada ? "text-red-700" : "text-green-700"}`}>{fmt(m.fat_total)}</span>
                      <span className="text-xs font-black font-mono text-red-600">{fmt(custoTotal)}</span>
                      <span className={`text-xs font-black font-mono ${m.lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(m.lucro)}</span>
                      <Badge className={`text-[10px] font-black ${m.margem >= 30 ? "bg-green-100 text-green-800 hover:bg-green-100" : m.margem >= 15 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                        {fmtPct(m.margem)}
                      </Badge>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className={`px-6 pb-4 pt-1 ${isCancelada ? "bg-red-50/30" : "bg-neutral-50/50"}`}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">OS / Boletim</p>
                          <p className="font-black text-neutral-800">{m.os_number || "-"} {m.boletim ? `· ${m.boletim}` : ""}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Data</p>
                          <p className="font-bold text-neutral-700">{m.data ? formatDateBRT(m.data) : "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Cliente</p>
                          <p className="font-bold text-neutral-700">{m.client_name || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Viatura</p>
                          <p className="font-black text-neutral-800">{m.placa_viatura || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Agente 01</p>
                          <p className="font-bold text-neutral-700">{m.vigilante || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Agente 02</p>
                          <p className="font-bold text-neutral-700">{m.vigilante2 || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Origem</p>
                          <p className="font-bold text-neutral-700 truncate max-w-[200px]" title={m.origem}>{m.origem || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Destino</p>
                          <p className="font-bold text-neutral-700 truncate max-w-[200px]" title={m.destino}>{m.destino || "-"}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">KM Total</p>
                          <p className="font-black text-neutral-800">{m.km_total?.toLocaleString("pt-BR")} km</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">KM Franquia / Excedente</p>
                          <p className="font-bold text-neutral-700">{m.km_franquia || 0} / {m.km_excedente || 0} km</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Horas Missão</p>
                          <p className="font-black text-neutral-800">{fmtH(m.horas_missao || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Horas Trabalhadas</p>
                          <p className="font-bold text-neutral-700">{fmtH(m.horas_trabalhadas || 0)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg border border-neutral-200 p-3">
                          <p className="text-[10px] font-black text-green-700 uppercase tracking-wide mb-2">Faturamento</p>
                          <div className="space-y-1 text-xs">
                            {m.fat_acionamento > 0 && <div className="flex justify-between"><span className="text-neutral-500">Acionamento</span><span className="font-bold text-neutral-800">{fmt(m.fat_acionamento)}</span></div>}
                            {m.fat_km > 0 && <div className="flex justify-between"><span className="text-neutral-500">KM Extra</span><span className="font-bold text-neutral-800">{fmt(m.fat_km)}</span></div>}
                            {m.fat_hora_extra > 0 && <div className="flex justify-between"><span className="text-neutral-500">Hora Extra</span><span className="font-bold text-neutral-800">{fmt(m.fat_hora_extra)}</span></div>}
                            {m.fat_adicional_noturno > 0 && <div className="flex justify-between"><span className="text-neutral-500">Adic. Noturno</span><span className="font-bold text-neutral-800">{fmt(m.fat_adicional_noturno)}</span></div>}
                            {m.fat_estadia > 0 && <div className="flex justify-between"><span className="text-neutral-500">Estadia</span><span className="font-bold text-neutral-800">{fmt(m.fat_estadia)}</span></div>}
                            {m.fat_pernoite > 0 && <div className="flex justify-between"><span className="text-neutral-500">Pernoite</span><span className="font-bold text-neutral-800">{fmt(m.fat_pernoite)}</span></div>}
                            <div className="flex justify-between border-t border-neutral-200 pt-1 mt-1"><span className="font-black text-green-700">TOTAL FATURAMENTO</span><span className="font-black text-green-700">{fmt(m.fat_total)}</span></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border border-neutral-200 p-3">
                          <p className="text-[10px] font-black text-red-700 uppercase tracking-wide mb-2">Custos</p>
                          <div className="space-y-1 text-xs">
                            {m.pag_vrp > 0 && <div className="flex justify-between"><span className="text-neutral-500">VRP Agentes</span><span className="font-bold text-neutral-800">{fmt(m.pag_vrp)}</span></div>}
                            {m.pag_total > 0 && m.pag_total !== m.pag_vrp && <div className="flex justify-between"><span className="text-neutral-500">Pagamento Total</span><span className="font-bold text-neutral-800">{fmt(m.pag_total)}</span></div>}
                            {m.despesas_pedagio > 0 && <div className="flex justify-between"><span className="text-neutral-500">Pedágio</span><span className="font-bold text-neutral-800">{fmt(m.despesas_pedagio)}</span></div>}
                            {m.despesas_combustivel > 0 && <div className="flex justify-between"><span className="text-neutral-500">Combustível</span><span className="font-bold text-neutral-800">{fmt(m.despesas_combustivel)}</span></div>}
                            {m.despesas > 0 && m.despesas !== (m.despesas_pedagio || 0) + (m.despesas_combustivel || 0) && <div className="flex justify-between"><span className="text-neutral-500">Outras Despesas</span><span className="font-bold text-neutral-800">{fmt(m.despesas - (m.despesas_pedagio || 0) - (m.despesas_combustivel || 0))}</span></div>}
                            <div className="flex justify-between border-t border-neutral-200 pt-1 mt-1"><span className="font-black text-red-700">TOTAL CUSTOS</span><span className="font-black text-red-700">{fmt(custoTotal)}</span></div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-4 bg-white rounded-lg border border-neutral-200 p-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span className={`font-black ${m.lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>RESULTADO LÍQUIDO</span>
                            <span className={`font-black text-sm ${m.lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(m.lucro)}</span>
                          </div>
                        </div>
                        <Badge className={`text-xs font-black ${m.margem >= 30 ? "bg-green-100 text-green-800 hover:bg-green-100" : m.margem >= 15 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                          Margem {fmtPct(m.margem)}
                        </Badge>
                      </div>
                      {m.observacoes && (
                        <div className="mt-2 text-xs text-neutral-500 italic">Obs: {m.observacoes}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="bg-neutral-50 border-t-2 border-neutral-300 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-black text-neutral-700 uppercase">
                Total ({missions.length} missões{canceladas.length > 0 ? ` · ${canceladas.length} cancelada${canceladas.length > 1 ? "s" : ""}` : ""})
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs font-black text-green-700 font-mono">{fmt(missions.reduce((a: number, m: any) => a + m.fat_total, 0))}</span>
                <span className="text-xs font-black text-red-600 font-mono">{fmt(missions.reduce((a: number, m: any) => a + m.pag_total + m.despesas, 0))}</span>
                <span className="text-xs font-black text-blue-700 font-mono">{fmt(missions.reduce((a: number, m: any) => a + m.lucro, 0))}</span>
                {(() => {
                  const totalFat = missions.reduce((a: number, m: any) => a + m.fat_total, 0);
                  const totalLucro = missions.reduce((a: number, m: any) => a + m.lucro, 0);
                  const avgMargem = totalFat > 0 ? (totalLucro / totalFat) * 100 : 0;
                  return (
                    <Badge className={`text-xs font-black ${avgMargem >= 30 ? "bg-green-100 text-green-800 hover:bg-green-100" : avgMargem >= 15 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                      {fmtPct(avgMargem)}
                    </Badge>
                  );
                })()}
                <span className="text-xs font-black text-neutral-500 font-mono">{missions.reduce((a: number, m: any) => a + m.km_total, 0).toLocaleString("pt-BR")} km</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
