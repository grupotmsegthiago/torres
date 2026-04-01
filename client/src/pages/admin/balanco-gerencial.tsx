import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, DollarSign, Car, Users, Target,
  Calendar, ChevronLeft, ChevronRight, ChevronDown, BarChart3, ArrowUpRight,
  ArrowDownRight, Loader2, RefreshCw, Crosshair, Truck, Clock,
  Trophy,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

const META_DIARIA_VIATURA = 1800;
const hasTracker = (v: any) => !!(v.trackerId || v.truckscontrolIdentifier);

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
      const start = new Date(y, m, d - 6);
      const end = new Date(y, m, d, 23, 59, 59);
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
    case "WEEK": d.setDate(d.getDate() + 7 * direction); break;
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
  missionsByDay: Record<string, any[]>;
  expensesByDay: Record<string, number>;
  totals: {
    faturamento: number; custos_operacionais: number; despesas_missao: number;
    despesas_gerais: number; receitas_gerais: number; total_missoes: number; total_km: number;
  };
}

type ActiveTab = "BALANCO" | "VEICULOS" | "AGENTES" | "MISSOES" | "METAS";

export default function BalancoGerencialPage() {
  const [period, setPeriod] = useState<Period>("MONTH");
  const [refDate, setRefDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<ActiveTab>("BALANCO");
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/financial/dashboard"],
    refetchInterval: 30 * 60 * 1000,
  });

  const { data: allVehicles } = useQuery<any[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const activeAgentCount = useMemo(() => {
    if (!allEmployees) return 0;
    return allEmployees.filter((e: any) =>
      e.status !== "inativo" && e.status !== "desligado"
    ).length;
  }, [allEmployees]);

  const range = useMemo(() => getDateRange(period, refDate), [period, refDate]);
  const daysInPeriod = useMemo(() => getDaysInRange(range), [range]);

  const filtered = useMemo(() => {
    if (!data) return {
      missions: [] as any[], vehicles: [] as any[], agents: [] as any[], missionDetails: [] as any[],
      expenses: { fueling: 0, mission_cost: 0, maintenance: 0, other: 0, total: 0 },
      expensesByVehicle: {} as Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }>,
      periodExpenses: [] as ExpenseTransaction[],
    };

    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${range.start.getFullYear()}-${pad(range.start.getMonth() + 1)}-${pad(range.start.getDate())}`;
    const endStr = `${range.end.getFullYear()}-${pad(range.end.getMonth() + 1)}-${pad(range.end.getDate())}`;

    const missions = data.byMission.filter(m => {
      if (!m.data) return false;
      const raw = String(m.data);
      const d = raw.includes("T") ? raw.split("T")[0] : (() => {
        const dt = new Date(raw);
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      })();
      return d >= startStr && d <= endStr;
    });

    const periodExpenses = (data.expenseTransactions || []).filter(t => {
      if (!t.date) return false;
      return t.date >= startStr && t.date <= endStr;
    });

    const expenseSums = { fueling: 0, mission_cost: 0, maintenance: 0, payroll: 0, other: 0, total: 0 };
    const expensesByVehicle: Record<string, { fueling: number; mission_cost: number; maintenance: number; total: number }> = {};

    periodExpenses.forEach(t => {
      const amt = t.amount;
      if (t.origin_type === "fueling") expenseSums.fueling += amt;
      else if (t.origin_type === "mission_cost") expenseSums.mission_cost += amt;
      else if (t.origin_type === "maintenance") expenseSums.maintenance += amt;
      else if (t.origin_type === "payroll") expenseSums.payroll += amt;
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

  const provisaoRH = useMemo(() => {
    return CCT.custoDiario * activeAgentCount * daysInPeriod;
  }, [activeAgentCount, daysInPeriod]);

  const provisaoDiaria = useMemo(() => {
    return CCT.custoDiario * activeAgentCount;
  }, [activeAgentCount]);

  const totals = useMemo(() => {
    const fat = filtered.missions.reduce((a, m) => a + m.fat_total, 0);
    const pag = filtered.missions.reduce((a, m) => a + m.pag_total, 0);
    const despFin = filtered.expenses;
    const despReais = despFin.total;
    const custoTotal = pag + despReais + provisaoRH;
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
      custoTotal,
    };
  }, [filtered, provisaoRH]);

  const TABS: { id: ActiveTab; label: string; icon: typeof BarChart3 }[] = [
    { id: "BALANCO", label: "Balanço", icon: BarChart3 },
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
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/financial/dashboard"] })} data-testid="button-refresh-dashboard">
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const activeVehicles = (allVehicles || []).filter(hasTracker);
            const totalViaturas = activeVehicles.length;
            const metaPeriodo = META_DIARIA_VIATURA * daysInPeriod * totalViaturas;
            const metaPct = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;
            const mc = getMetaColor(metaPct);
            return (
              <Card className={`p-4 border-neutral-200 ${mc.icon ? "ring-2 ring-green-400" : ""}`} data-testid="card-faturamento">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mc.bg}`}>
                    {mc.icon ? <Trophy size={16} className="text-green-600" /> : <ArrowUpRight size={16} className="text-green-700" />}
                  </div>
                  <span className="text-xs font-black text-neutral-400 uppercase">Faturamento</span>
                  {mc.icon && <Badge className="bg-green-600 text-white text-[10px] font-black px-1.5 py-0 border-0">META BATIDA</Badge>}
                </div>
                <p className="text-2xl font-black text-green-700 font-mono">{fmt(totals.fat)}</p>
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
              </Card>
            );
          })()}
          <Card className="p-4 border-neutral-200" data-testid="card-custos">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <ArrowDownRight size={16} className="text-red-700" />
              </div>
              <span className="text-xs font-black text-neutral-400 uppercase">Custos Totais</span>
            </div>
            <p className="text-2xl font-black text-red-700 font-mono">{fmt(totals.custoTotal)}</p>
            <div className="text-xs font-bold mt-1 space-y-1">
              {(totals.pag > 0 || totals.desp > 0) && (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Custos Reais</p>
                  {totals.pag > 0 && <p className="text-neutral-600">VRP: {fmt(totals.pag)}</p>}
                  {totals.desp_combustivel > 0 && <p className="text-neutral-600">Combustível: {fmt(totals.desp_combustivel)}</p>}
                  {totals.desp_pedagio > 0 && <p className="text-neutral-600">Pedágio/Missão: {fmt(totals.desp_pedagio)}</p>}
                  {totals.desp_manutencao > 0 && <p className="text-neutral-600">Manutenção: {fmt(totals.desp_manutencao)}</p>}
                  {totals.desp_outras > 0 && <p className="text-neutral-600">Outras: {fmt(totals.desp_outras)}</p>}
                </div>
              )}
              {totals.provisaoRH > 0 && (
                <div className="space-y-0.5 border-t border-neutral-100 pt-1">
                  <p className="text-[10px] text-amber-600 uppercase tracking-wide">Provisão RH</p>
                  <p className="text-amber-700">Folha ({activeAgentCount} ag. × {daysInPeriod}d): {fmt(totals.provisaoRH)}</p>
                </div>
              )}
              {totals.custoTotal === 0 && <p className="text-neutral-500">Sem despesas no período</p>}
            </div>
          </Card>
          <Card className="p-4 border-neutral-200" data-testid="card-lucro">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <DollarSign size={16} className="text-blue-700" />
              </div>
              <span className="text-xs font-black text-neutral-400 uppercase">Lucro Bruto</span>
            </div>
            <p className={`text-2xl font-black font-mono ${totals.lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(totals.lucro)}</p>
            <p className="text-xs text-neutral-500 font-bold mt-1">{totals.km.toLocaleString("pt-BR")} km | c/ provisão RH</p>
          </Card>
          <Card className="p-4 border-neutral-200" data-testid="card-margem">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totals.margem >= 30 ? "bg-green-100" : totals.margem >= 15 ? "bg-amber-100" : "bg-red-100"}`}>
                {totals.margem >= 15
                  ? <TrendingUp size={16} className={totals.margem >= 30 ? "text-green-700" : "text-amber-700"} />
                  : <TrendingDown size={16} className="text-red-700" />}
              </div>
              <span className="text-xs font-black text-neutral-400 uppercase">Margem</span>
            </div>
            <p className={`text-2xl font-black font-mono ${totals.margem >= 30 ? "text-green-700" : totals.margem >= 15 ? "text-amber-700" : "text-red-700"}`}>
              {fmtPct(totals.margem)}
            </p>
            <p className="text-xs text-neutral-500 font-bold mt-1">
              {totals.margem >= 30 ? "Saudável" : totals.margem >= 15 ? "Atenção" : "Crítico"}
            </p>
          </Card>
        </div>

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
                        <p className="text-xs font-bold text-neutral-400 font-mono">{fmt(lucro)}</p>
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
                        <p className="text-xs font-bold text-neutral-400 font-mono">{fmt(a.fat_total)}</p>
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
  const activeVehicles = useMemo(() => allVehicles.filter(hasTracker), [allVehicles]);
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
                        {m.data ? new Date(m.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "-"}
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
                          <p className="font-bold text-neutral-700">{m.data ? new Date(m.data).toLocaleDateString("pt-BR") : "-"}</p>
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
