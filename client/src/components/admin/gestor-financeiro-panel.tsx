import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Fuel,
  Gauge,
  Loader2,
  Network,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "wouter";
import { GaugeRing } from "@/components/admin/balanco-executivo";
import {
  buildAiInsights,
  buildAuditLog,
  buildCertificationChecks,
  buildFatBreakdown,
  buildKnowledgeGraph,
  buildMemoriaCustos,
  buildMemoriaEficiencia,
  buildMemoriaFaturamento,
  buildMemoriaKm,
  buildMemoriaLucro,
  buildMemoriaMargem,
  buildModuleGates,
  computeIntegrityScore,
  gatesReady,
  lucroTendencia,
  runGestorValidation,
  type MemoriaCalculo,
  type ValidationFinding,
} from "@/lib/gestor-financeiro";
import { computeProjection } from "@/lib/balanco-projection";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtN = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

type Props = {
  periodLabel: string;
  daysInPeriod: number;
  period: string;
  rangeStart: Date;
  rangeEnd: Date;
  totals: any;
  missions: any[];
  vehicles: any[];
  agents: any[];
  rhSummary: any;
  allEmployees: any[];
  eficiencia: {
    mediaKmL: number;
    totalKm: number;
    totalLiters: number;
    abaixo: { plate: string; model: string; km: number; liters: number; kmL: number }[];
  };
  metaPeriodo: number;
  impostoPct: number;
  custoVarPct: number;
  dataReady: { dashboard: boolean; grid: boolean; rh: boolean; fixedCosts: boolean };
  updatedAt: Date | null;
  onSync: () => void;
  syncing: boolean;
  dailyChart: Array<{ name: string; fat: number; custo: number; lucro: number }>;
  onOpenOsAbertas: () => void;
  onOpenEficiencia: () => void;
  auditUser?: string | null;
};

function severityStyle(s: ValidationFinding["severity"]) {
  if (s === "critico") return { badge: "bg-rose-500/20 text-rose-300 border-rose-500/40", dot: "bg-rose-400" };
  if (s === "atencao") return { badge: "bg-amber-500/20 text-amber-300 border-amber-500/40", dot: "bg-amber-400" };
  return { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-400" };
}

function MemoriaDialog({
  open,
  onOpenChange,
  memoria,
  fatExtra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memoria: MemoriaCalculo | null;
  fatExtra?: ReturnType<typeof buildFatBreakdown> | null;
}) {
  if (!memoria) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-950 border-slate-700 text-slate-100" data-testid="dialog-memoria-calculo">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Memória de Cálculo — {memoria.indicator}</DialogTitle>
          <DialogDescription className="text-slate-400">Rastreabilidade do indicador (fonte única do ERP)</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <p className="font-black uppercase text-slate-500 mb-1">Fórmula</p>
            <p className="text-slate-200 leading-relaxed">{memoria.formula}</p>
          </div>
          <div>
            <p className="font-black uppercase text-slate-500 mb-1">Módulos</p>
            <p className="text-slate-200">{memoria.modules.join(" · ")}</p>
          </div>
          <div>
            <p className="font-black uppercase text-slate-500 mb-1">Tabelas</p>
            <p className="font-mono text-cyan-300/90">{memoria.tables.join(", ")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-700 p-2">
              <p className="text-slate-500 font-bold uppercase">Registros</p>
              <p className="text-lg font-black font-mono text-slate-100">{memoria.recordsConsidered}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-2">
              <p className="text-slate-500 font-bold uppercase">Atualizado</p>
              <p className="font-mono text-slate-200">{memoria.updatedAt || "—"}</p>
              {memoria.lastUser && <p className="text-slate-500 mt-1">Usuário: {memoria.lastUser}</p>}
            </div>
          </div>
          {memoria.recordsExcluded.length > 0 && (
            <div>
              <p className="font-black uppercase text-slate-500 mb-1">Exclusões</p>
              {memoria.recordsExcluded.map((e) => (
                <p key={e.reason} className="text-slate-300">• {e.reason}: <b>{e.count}</b></p>
              ))}
            </div>
          )}
          <div>
            <p className="font-black uppercase text-slate-500 mb-1">Filtros</p>
            {memoria.filters.map((f) => (
              <p key={f} className="text-slate-300">• {f}</p>
            ))}
          </div>
          {memoria.notes?.map((n) => (
            <p key={n} className="text-emerald-300/90 font-mono">{n}</p>
          ))}
          {fatExtra && memoria.indicator === "Faturamento" && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <FatList title="Boletins / OS que entraram" items={fatExtra.incluidos.slice(0, 40)} empty="Nenhum" />
              <FatList title="Ficaram de fora" items={fatExtra.fora.slice(0, 30).map((x) => ({ ...x, status: x.reason }))} empty="Nenhum" />
              <FatList title="Recusados" items={fatExtra.recusados} empty="Nenhum recusado" />
              <FatList title="Cancelados" items={fatExtra.cancelados} empty="Nenhum cancelado" />
              <FatList title="Aguardando faturamento" items={fatExtra.aguardando} empty="Nenhum em aberto" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FatList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string | number; label: string; amount?: number; status?: string; when?: string; reason?: string }>;
  empty: string;
}) {
  return (
    <div>
      <p className="font-black uppercase text-slate-500 mb-1">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {items.map((i) => (
            <div key={String(i.id) + i.label} className="flex justify-between gap-2 border border-slate-800 rounded px-2 py-1">
              <span className="text-slate-200 truncate">{i.label}{i.status ? ` · ${i.status}` : ""}{i.when ? ` · ${i.when}` : ""}</span>
              <span className="font-mono text-slate-300 shrink-0">{i.amount != null ? fmt(i.amount) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GestorFinanceiroPanel(props: Props) {
  const {
    periodLabel, daysInPeriod, totals, missions, vehicles, agents, rhSummary, allEmployees,
    eficiencia, metaPeriodo, impostoPct, custoVarPct, dataReady, updatedAt, onSync, syncing, dailyChart,
    onOpenOsAbertas, onOpenEficiencia, rangeStart, rangeEnd, auditUser,
  } = props;

  const [memoria, setMemoria] = useState<MemoriaCalculo | null>(null);
  const [finding, setFinding] = useState<ValidationFinding | null>(null);
  const [hoverAgentId, setHoverAgentId] = useState<number | null>(null);
  const [showAiFull, setShowAiFull] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<Date | null>(null);
  const [gateReleased, setGateReleased] = useState(false);

  const today = new Date();
  const pad2 = (x: number) => String(x).padStart(2, "0");
  const todayBRT = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const elapsed = Math.max(1, Math.floor((Math.min(today.getTime(), rangeEnd.getTime()) - rangeStart.getTime()) / 86400000) + 1);
  const isPast = today > rangeEnd;
  const realizadoFat = missions.filter((m: any) => !m.data || m.data <= todayBRT).reduce((a: number, m: any) => a + (m.fat_total || 0), 0);
  const { projection } = computeProjection({
    realizadoFat,
    totalFat: totals.fat,
    elapsedDays: elapsed,
    daysInPeriod,
    isPast,
  });
  const metaPct = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;
  const projPct = metaPeriodo > 0 ? (projection / metaPeriodo) * 100 : 0;

  const folhaAgents = useMemo(() => {
    const scale = daysInPeriod / 30;
    const list = (rhSummary?.porAgente || []) as any[];
    const agentFat = new Map<number, { missions: number; fat: number }>();
    for (const a of agents) {
      if (a.id != null) agentFat.set(Number(a.id), { missions: a.missions || 0, fat: a.fat_total || 0 });
    }
    const byName = new Map(agents.map((a: any) => [String(a.name || "").toLowerCase(), a]));
    const folhaTotal = list.reduce((s, a) => s + Number(a.totalOperacional ?? a.total ?? 0) * scale, 0) || 1;
    const custoEmpresa = totals.custoTotal || 1;

    return list
      .map((a) => {
        const emp = (allEmployees || []).find((e: any) => e.id === a.id);
        const ops = agentFat.get(Number(a.id)) || byName.get(String(a.name || "").toLowerCase());
        const custoTotal = Number(a.totalOperacional ?? a.total ?? 0) * scale;
        const missoes = Number(ops?.missions || 0);
        const horas = Number(a.horasTrabalhadas || a.horas || 0);
        return {
          ...a,
          photoUrl: emp?.photoUrl || null,
          role: emp?.role || "Agente",
          custoTotal,
          custoDiario: custoTotal / Math.max(daysInPeriod, 1),
          pctFolha: (custoTotal / folhaTotal) * 100,
          pctEmpresa: (custoTotal / custoEmpresa) * 100,
          missoes,
          custoMissao: missoes > 0 ? custoTotal / missoes : 0,
          custoHora: horas > 0 ? custoTotal / horas : (a.custoHora ?? 0),
          receita: Number(ops?.fat || 0),
          status: emp?.status || (a.semSalario ? "Sem salário" : "Ativo"),
        };
      })
      .sort((a, b) => b.custoTotal - a.custoTotal);
  }, [rhSummary, allEmployees, agents, daysInPeriod, totals.custoTotal]);

  const gestorInput = useMemo(
    () => ({
      totals,
      missions,
      rhMonthly: Number(rhSummary?.monthlyOperacional ?? rhSummary?.monthly ?? 0),
      fixedMonthly: Number(totals.custosFixosMensal || 0),
      agentCount: Number(rhSummary?.agentCount || 0),
      eficienciaAbaixo: eficiencia.abaixo.length,
      mediaKmL: eficiencia.mediaKmL,
      dataReady,
      periodLabel,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      impostoPct,
      custoVarPct,
      agents,
      vehicles,
      folhaAgents: folhaAgents.map((a) => ({ id: a.id, name: a.name, custoTotal: a.custoTotal, missoes: a.missoes, receita: a.receita })),
      dailyChart,
      auditUser: auditUser || null,
    }),
    [totals, missions, rhSummary, eficiencia.abaixo.length, eficiencia.mediaKmL, dataReady, periodLabel, updatedAt, impostoPct, custoVarPct, agents, vehicles, folhaAgents, dailyChart, auditUser],
  );

  const gates = useMemo(() => buildModuleGates(gestorInput), [gestorInput]);
  const modulesOk = gatesReady(gates);

  useEffect(() => {
    if (modulesOk) setGateReleased(true);
  }, [modulesOk]);

  const findings = useMemo(() => runGestorValidation(gestorInput), [gestorInput]);
  const integrity = useMemo(() => computeIntegrityScore(findings), [findings]);
  const aiLines = useMemo(() => buildAiInsights(gestorInput, findings), [gestorInput, findings]);
  const fatBreakdown = useMemo(() => buildFatBreakdown(gestorInput), [gestorInput]);
  const kg = useMemo(() => buildKnowledgeGraph(gestorInput), [gestorInput]);
  const certChecks = useMemo(() => buildCertificationChecks(gestorInput, findings), [gestorInput, findings]);
  const auditLog = useMemo(() => buildAuditLog(gestorInput, findings), [gestorInput, findings]);
  const certified = gateReleased && integrity.pct >= 85 && modulesOk && certChecks.every((c) => c.ok);

  const clientesAtivos = useMemo(() => {
    const s = new Set(missions.map((m: any) => m.client_name).filter(Boolean));
    return s.size;
  }, [missions]);

  const operacional = totals.pag || 0;
  const custoKm = (eficiencia.totalKm || totals.km || 0) > 0
    ? (totals.desp_combustivel || 0) / (eficiencia.totalKm || totals.km)
    : 0;
  const lucroAcumulado = dailyChart.reduce((s, d) => s + d.lucro, 0);
  const tend = lucroTendencia(dailyChart);

  const hoverAgent = folhaAgents.find((a) => a.id === hoverAgentId) || null;

  const rankingVehicles = useMemo(() => {
    return [...(vehicles || [])]
      .map((v: any) => ({
        plate: v.plate,
        model: v.model,
        fat: v.fat_total || 0,
        km: v.km || 0,
      }))
      .sort((a, b) => b.fat - a.fat)
      .slice(0, 3);
  }, [vehicles]);

  const margemHist = useMemo(() => {
    return dailyChart.map((d) => ({
      name: d.name,
      margem: d.fat > 0 ? ((d.lucro / d.fat) * 100) : 0,
      meta: 35,
    }));
  }, [dailyChart]);

  const runValidation = () => {
    setValidating(true);
    setTimeout(() => {
      setLastValidation(new Date());
      if (modulesOk) setGateReleased(true);
      setValidating(false);
      setShowCert(true);
    }, 700);
  };

  const showKpis = gateReleased && modulesOk;

  return (
    <div className="space-y-4" data-testid="panel-gestor-financeiro">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h3 className="text-base md:text-lg font-black uppercase tracking-tight text-slate-50" data-testid="title-gestor">
              Balanço Gerencial • Gestor de Dados Financeiro
            </h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase">{periodLabel}</p>
          </div>
          <Badge
            className="border text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
            data-testid="selo-ia-ativa"
          >
            🟢 IA ATIVA
          </Badge>
          {certified ? (
            <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase" data-testid="selo-dados-certificados">
              <ShieldCheck size={12} className="mr-1" /> Dados Certificados
            </Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase" data-testid="selo-validacao-pendente">
              Validação em andamento
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-100 text-xs font-black uppercase" data-testid="button-periodo-info">
            Período
          </Button>
          <Button size="sm" onClick={onSync} disabled={syncing} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black uppercase" data-testid="button-sincronizar-dados">
            <RefreshCw size={14} className={`mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar Dados
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-100 text-xs font-black uppercase" onClick={() => window.print()} data-testid="button-gerar-relatorio">
            <FileText size={14} className="mr-1.5" /> Gerar Relatório
          </Button>
          <Link href="/admin/custos-fixos">
            <Button size="sm" variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-100 text-xs font-black uppercase" data-testid="button-configuracoes-gestor">
              <Settings size={14} className="mr-1.5" /> Configurações
            </Button>
          </Link>
        </div>
      </div>

      {/* REGRA Nº 1 — gate de módulos */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3" data-testid="gate-modulos">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShieldCheck size={14} className="text-cyan-400" /> Certificação prévia dos módulos
          </h4>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setShowAudit(true)}>
              Auditoria
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setShowCert(true)}>
              Checklist
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {gates.map((g) => (
            <span
              key={g.id}
              title={g.detail}
              className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${
                g.ready
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-800/80 text-slate-500 border-slate-700"
              }`}
            >
              {g.ready ? "✔" : "○"} {g.label}
            </span>
          ))}
        </div>
        {!showKpis && (
          <div className="mt-3 flex items-center gap-2 text-amber-200 text-xs font-bold" data-testid="gate-bloqueio">
            <Loader2 size={14} className="animate-spin" />
            Indicadores liberados somente após validar Banco, Financeiro, Comercial, RH, Operações, OS, Boletins, Faturas, NF, Contas a Receber, Fluxo, DRE e Knowledge Graph.
          </div>
        )}
      </div>

      {/* Knowledge Graph */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 overflow-x-auto" data-testid="knowledge-graph">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-2">
          <Network size={14} className="text-violet-300" /> Knowledge Graph
        </h4>
        <div className="flex items-center gap-1 min-w-max pb-1">
          {kg.map((n, i) => (
            <div key={n.id} className="flex items-center gap-1">
              <div className={`rounded-lg border px-2 py-1.5 min-w-[72px] text-center ${n.ready ? "border-violet-500/40 bg-violet-500/10" : "border-slate-700 bg-slate-900"}`}>
                <p className="text-[9px] font-black uppercase text-slate-300">{n.label}</p>
                {n.valueLabel && <p className="text-[9px] font-mono text-violet-200 truncate max-w-[88px]">{n.valueLabel}</p>}
              </div>
              {i < kg.length - 1 && <span className="text-slate-600 text-[10px]">↓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Linha 1 — 6 KPIs */}
      {showKpis ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3" data-testid="kpi-row-gestor">
        {/* FATURAMENTO */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-2" data-testid="kpi-faturamento">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Faturamento</span>
            <Target size={14} className="text-emerald-400" />
          </div>
          <div className="flex items-center gap-3">
            <GaugeRing pct={metaPct} color={metaPct >= 100 ? "#34d399" : "#fbbf24"} label="Meta" size={72} stroke={7} testId="gauge-kpi-meta" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black font-mono text-emerald-300 truncate">{fmt(totals.fat)}</p>
              <p className="text-[10px] text-slate-500 font-bold">{totals.total} missões · {clientesAtivos} clientes</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-1">
              <p className="text-emerald-400/80 font-bold uppercase">Finalizado</p>
              <p className="font-mono font-black text-emerald-300">{fmt(totals.fatCongelado)}</p>
            </div>
            <button type="button" onClick={onOpenOsAbertas} className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-1.5 py-1 text-left hover:bg-amber-500/20">
              <p className="text-amber-300/80 font-bold uppercase">Em aberto</p>
              <p className="font-mono font-black text-amber-300">{fmt(totals.fatAberto)}</p>
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Meta <b className="text-slate-200 font-mono">{fmt(metaPeriodo)}</b> · {fmtPct(metaPct)}</p>
          <p className="text-[10px] text-slate-400">Projeção <b className="text-slate-200 font-mono">{fmt(projection)}</b> · {fmtPct(projPct)}</p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaFaturamento(gestorInput, fatBreakdown))} data-testid="button-memoria-faturamento">
            Ver memória de cálculo
          </Button>
        </div>

        {/* CUSTOS */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-2" data-testid="kpi-custos">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Custos Totais</span>
            <Activity size={14} className="text-rose-400" />
          </div>
          <p className="text-lg font-black font-mono text-rose-300">{fmt(totals.custoTotal)}</p>
          {[
            ["Mão de obra (sem comb/pedágio)", operacional, "bg-rose-400"],
            ["RH", totals.provisaoRH, "bg-amber-400"],
            ["Fixos", totals.custosFixosRateados, "bg-violet-400"],
            ["Combustível (abastecimento)", totals.desp_combustivel, "bg-orange-400"],
            ["Pedágio", totals.desp_pedagio, "bg-yellow-400"],
            ["Manutenção", totals.desp_manutencao, "bg-pink-400"],
          ].map(([label, val, bar]) => (
            <div key={String(label)} className="space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400 font-bold">{label}</span>
                <span className="font-mono text-slate-200">{fmt(Number(val))}</span>
              </div>
              <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${bar}`} style={{ width: `${totals.custoTotal > 0 ? Math.min(100, (Number(val) / totals.custoTotal) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[9px] text-slate-500">
            Soma destas linhas = custo da DRE. O percentual de imposto da Meta ({impostoPct}%) não aparece aqui — não é custo do período.
          </p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaCustos(gestorInput))} data-testid="button-memoria-custos">
            Ver memória de cálculo
          </Button>
        </div>

        {/* LUCRO */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-2" data-testid="kpi-lucro">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Lucro Líquido</span>
            {totals.lucro >= 0 ? <TrendingUp size={14} className="text-sky-400" /> : <TrendingDown size={14} className="text-rose-400" />}
          </div>
          <p className={`text-xl font-black font-mono ${totals.lucro >= 0 ? "text-sky-300" : "text-rose-400"}`}>{fmt(totals.lucro)}</p>
          <p className="text-[11px] text-slate-400">Margem <b className="text-slate-100">{fmtPct(totals.margem)}</b></p>
          <p className="text-[10px] text-slate-400">Operacional <b className="font-mono text-slate-200">{fmt(totals.lucro)}</b></p>
          <p className="text-[10px] text-slate-500">Financeiro <b className="font-mono text-slate-400">{fmt(0)}</b> <span className="normal-case font-normal">(sem lançamento separado no motor)</span></p>
          <p className="text-[10px] text-slate-400">Acumulado no período <b className="font-mono text-slate-200">{fmt(lucroAcumulado)}</b></p>
          <p className={`text-[10px] font-bold ${tend.delta >= 0 ? "text-emerald-400" : "text-rose-300"}`}>{tend.label}</p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaLucro(gestorInput))}>
            Ver memória de cálculo
          </Button>
        </div>

        {/* MARGEM */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-2" data-testid="kpi-margem">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Margem</span>
            <Gauge size={14} className="text-cyan-400" />
          </div>
          <div className="flex items-center gap-3">
            <GaugeRing pct={Math.max(0, totals.margem)} color={totals.margem >= 35 ? "#34d399" : "#fbbf24"} label="Atual" size={72} stroke={7} />
            <div>
              <p className="text-2xl font-black font-mono text-cyan-300">{fmtPct(totals.margem)}</p>
              <p className="text-[10px] text-slate-500 font-bold">Meta 35%</p>
              <p className={`text-[10px] font-black uppercase ${totals.margem >= 35 ? "text-emerald-400" : "text-amber-300"}`}>
                {totals.margem >= 35 ? "Na meta" : "Abaixo da meta"}
              </p>
              <p className="text-[10px] text-slate-500">Tendência: ver gráfico Margem × Meta</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaMargem(gestorInput))}>
            Ver memória de cálculo
          </Button>
        </div>

        {/* KM */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-1.5" data-testid="kpi-km">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">KM Rodado</span>
            <Fuel size={14} className="text-indigo-300" />
          </div>
          <p className="text-xl font-black font-mono text-indigo-300">{fmtN(totals.km)} <span className="text-sm">km</span></p>
          <p className="text-[10px] text-slate-400">Média/dia <b className="text-slate-200 font-mono">{fmtN(totals.km / Math.max(daysInPeriod, 1))}</b></p>
          <p className="text-[10px] text-slate-400">Média/missão <b className="text-slate-200 font-mono">{fmtN(totals.total > 0 ? totals.km / totals.total : 0)}</b></p>
          <p className="text-[10px] text-slate-400">Custo/KM <b className="text-slate-200 font-mono">{fmt(custoKm)}</b></p>
          <p className="text-[10px] text-slate-400">Combustível <b className="text-orange-300 font-mono">{fmt(totals.desp_combustivel)}</b></p>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaKm(gestorInput))}>
            Ver memória de cálculo
          </Button>
        </div>

        {/* EFICIÊNCIA */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 space-y-1.5" data-testid="kpi-eficiencia">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Eficiência</span>
            <Gauge size={14} className="text-emerald-300" />
          </div>
          <p className="text-xl font-black font-mono text-emerald-300">{eficiencia.mediaKmL.toFixed(1)} <span className="text-sm">km/L</span></p>
          <p className="text-[10px] text-slate-400">Média frota no período</p>
          {eficiencia.abaixo.length > 0 ? (
            <button type="button" onClick={onOpenEficiencia} className="w-full rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-black uppercase py-1.5">
              {eficiencia.abaixo.length} abaixo de 14 km/L
            </button>
          ) : (
            <p className="text-[10px] font-black uppercase text-emerald-400">Todas acima de 14 km/L</p>
          )}
          <div className="space-y-0.5">
            <p className="text-[9px] font-black uppercase text-slate-500">Ranking (fat.)</p>
            {rankingVehicles.length === 0 ? (
              <p className="text-[10px] text-slate-500">Sem viaturas no período</p>
            ) : (
              rankingVehicles.map((v, i) => (
                <p key={v.plate} className="text-[10px] text-slate-300 font-mono truncate">
                  {i + 1}. {v.plate} · {fmt(v.fat)}
                </p>
              ))
            )}
          </div>
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setMemoria(buildMemoriaEficiencia(gestorInput))}>
            Ver memória de cálculo
          </Button>
        </div>
      </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-slate-400 text-sm" data-testid="kpi-aguardando-gate">
          KPIs ocultos até a certificação dos módulos.
        </div>
      )}

      {/* Linha 2 — Validação + IA */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShieldCheck size={14} className="text-cyan-400" /> Validação Inteligente dos Dados
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="validacao-inteligente">
            {findings.map((f) => {
              const st = severityStyle(f.severity);
              return (
                <div key={f.id} className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 space-y-2" data-testid={`card-validacao-${f.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black uppercase text-slate-200 leading-tight">{f.title}</p>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                  </div>
                  <p className="text-2xl font-black font-mono text-slate-50">{f.count}</p>
                  <p className="text-[11px] font-mono text-slate-400">{f.amount > 0 ? fmt(f.amount) : "—"}</p>
                  <Badge className={`border text-[9px] font-black uppercase ${st.badge}`}>
                    {f.severity === "ok" ? "OK" : f.severity === "atencao" ? "Atenção" : "Crítico"}
                  </Badge>
                  <Button size="sm" variant="outline" className="w-full h-7 text-[10px] font-black uppercase border-slate-600" onClick={() => setFinding(f)}>
                    Ver detalhes
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/40 to-slate-950/80 p-4 space-y-3" data-testid="painel-ia-financeira">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-cyan-300" />
            <h4 className="text-xs font-black uppercase tracking-wider text-cyan-200">IA Financeira</h4>
          </div>
          <ul className="space-y-2 text-[12px] text-slate-200 leading-relaxed">
            {aiLines.slice(0, 7).map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-cyan-400 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <Button size="sm" className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-black uppercase" onClick={() => setShowAiFull(true)} data-testid="button-analise-completa">
            Ver análise completa
          </Button>
          <p className="text-[9px] text-slate-500">A IA percorre o Knowledge Graph e usa apenas Operações, Financeiro, RH, Medição e o motor oficial. Não inventa dados.</p>
        </div>
      </div>

      {/* Custos dos funcionários + hover */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 rounded-2xl border border-slate-700/80 bg-slate-950/80 overflow-hidden" data-testid="tabela-custos-funcionarios">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <Users size={14} className="text-amber-300" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Custos dos Funcionários</h4>
            <span className="text-[10px] text-slate-500 font-bold ml-auto">{folhaAgents.length} na folha</span>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[11px] min-w-[800px]">
              <thead className="sticky top-0 bg-slate-900 z-10 text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-black">Colaborador</th>
                  <th className="text-left px-2 py-2 font-bold">Cargo</th>
                  <th className="text-right px-2 py-2 font-bold">Salário Base</th>
                  <th className="text-right px-2 py-2 font-bold">Custo Total</th>
                  <th className="text-right px-2 py-2 font-bold">Custo/Dia</th>
                  <th className="text-right px-2 py-2 font-bold">% Folha</th>
                  <th className="text-right px-2 py-2 font-bold">Missões</th>
                  <th className="text-right px-2 py-2 font-bold">Custo/Missão</th>
                  <th className="text-left px-2 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {folhaAgents.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-slate-500 py-10">Sem dados de RH no período</td></tr>
                ) : (
                  folhaAgents.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-slate-800/80 hover:bg-slate-800/50 cursor-pointer"
                      onMouseEnter={() => setHoverAgentId(a.id)}
                      onFocus={() => setHoverAgentId(a.id)}
                      data-testid={`row-funcionario-${a.id}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {a.photoUrl ? (
                            <img src={a.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-600" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-300">
                              {String(a.name || "?").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="font-bold text-slate-100">{a.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-slate-400">{a.role}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-200">{fmt(Number(a.salarioProporcional || 0))}</td>
                      <td className="px-2 py-2 text-right font-mono font-black text-amber-300">{fmt(a.custoTotal)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-300">{fmt(a.custoDiario)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-300">{fmtPct(a.pctFolha)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-300">{a.missoes}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-300">{a.missoes ? fmt(a.custoMissao) : "—"}</td>
                      <td className="px-2 py-2"><Badge className="bg-slate-800 text-slate-300 border-slate-600 text-[9px]">{a.status}</Badge></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4 min-h-[320px]" data-testid="hover-inteligente">
          {!hoverAgent ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
              <Users size={28} className="mb-2 opacity-40" />
              <p className="text-xs font-bold uppercase">Hover Inteligente</p>
              <p className="text-[11px] mt-1">Passe o mouse sobre um colaborador para ver remuneração, encargos, benefícios e indicadores.</p>
            </div>
          ) : (
            <div className="space-y-3 text-[11px] max-h-[520px] overflow-y-auto" data-testid={`hover-agente-${hoverAgent.id}`}>
              <div className="flex items-center gap-2">
                {hoverAgent.photoUrl ? (
                  <img src={hoverAgent.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-black">{String(hoverAgent.name).slice(0, 2).toUpperCase()}</div>
                )}
                <div>
                  <p className="font-black text-slate-50 text-sm">{hoverAgent.name}</p>
                  <p className="text-slate-400">{hoverAgent.role}</p>
                </div>
              </div>
              <Section title="Remuneração" rows={[
                ["Salário", hoverAgent.salarioProporcional],
                ["Horas Extras", hoverAgent.horaExtra],
                ["Adic. Noturno", hoverAgent.adicionalNoturno],
                ["Periculosidade", hoverAgent.periculosidade],
                ["Insalubridade", hoverAgent.insalubridade ?? 0],
                ["Gratificações", hoverAgent.gratificacoes ?? 0],
                ["Comissões", hoverAgent.comissoes ?? 0],
                ["Premiações", hoverAgent.premiacoes ?? 0],
                ["DSR", hoverAgent.dsr],
              ]} />
              <Section title="Encargos" rows={[
                ["FGTS", hoverAgent.fgts],
                ["INSS", hoverAgent.inss],
                ["INSS Patronal", hoverAgent.inssPatronal],
                ["Seguro", hoverAgent.seguroVida],
                ["RAT", hoverAgent.rat ?? 0],
                ["FAP", hoverAgent.fap ?? 0],
                ["IRRF", hoverAgent.irrf],
              ]} />
              <Section title="Benefícios" rows={[
                ["Vale Refeição", hoverAgent.vrTotal],
                ["Vale Alimentação", hoverAgent.va ?? hoverAgent.valeAlimentacao ?? 0],
                ["Vale Transporte", hoverAgent.vt],
                ["Plano Saúde", hoverAgent.planoSaude ?? 0],
                ["Plano Odontológico", hoverAgent.planoOdonto ?? 0],
                ["Cesta", hoverAgent.cesta],
                ["Diárias", hoverAgent.diarias],
                ["Auxílio", hoverAgent.ajudaCusto],
              ]} />
              <Section title="Provisões" rows={[
                ["Férias", hoverAgent.ferias ?? 0],
                ["13º", hoverAgent.decimoTerceiro ?? 0],
                ["1/3", hoverAgent.provisaoTercoFerias ?? 0],
                ["Rescisão", hoverAgent.rescisao ?? 0],
                ["Encargos s/ prov.", hoverAgent.provisaoFGTSsobreFerias13 ?? 0],
                ["Total provisões", hoverAgent.totalProvisoes ?? 0],
              ]} />
              <Section title="Custos Indiretos" rows={[
                ["Uniformes", hoverAgent.uniformes ?? 0],
                ["EPIs", hoverAgent.epis ?? 0],
                ["Treinamentos", hoverAgent.treinamentos ?? 0],
                ["Equipamentos", hoverAgent.equipamentos ?? 0],
                ["Adm.", hoverAgent.custosAdm ?? 0],
              ]} />
              <Section title="Indicadores Operacionais" rows={[
                ["Missões", hoverAgent.missoes, true],
                ["Receita gerada", hoverAgent.receita],
                ["Custo/hora", hoverAgent.custoHora],
                ["Custo/missão", hoverAgent.custoMissao],
                ["Lucro operacional", hoverAgent.receita - hoverAgent.custoTotal],
              ]} />
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2 space-y-1">
                <p className="font-black uppercase text-cyan-300 text-[10px]">Resumo</p>
                <Row label="Custo total" value={fmt(hoverAgent.custoTotal)} />
                <Row label="Custo diário" value={fmt(hoverAgent.custoDiario)} />
                <Row label="Custo hora" value={fmt(Number(hoverAgent.custoHora || 0))} />
                <Row label="Custo missão" value={hoverAgent.missoes ? fmt(hoverAgent.custoMissao) : "—"} />
                <Row label="% folha" value={fmtPct(hoverAgent.pctFolha)} />
                <Row label="% custos empresa" value={fmtPct(hoverAgent.pctEmpresa)} />
              </div>
              <p className="text-[9px] text-slate-500">Campos zerados = sem lançamento no cadastro/RH do colaborador (não inventados).</p>
            </div>
          )}
        </div>
      </div>

      {/* Gráficos + Integridade */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3">
          <h4 className="text-xs font-black uppercase text-slate-300 mb-2">Faturamento × Custos × Lucro</h4>
          <div className="h-[220px]" data-testid="chart-gestor-fat-custo">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="fat" name="Faturamento" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={22} cursor="pointer" />
                <Bar dataKey="custo" name="Custos" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={22} cursor="pointer" />
                <Bar dataKey="lucro" name="Lucro" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={22} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3">
          <h4 className="text-xs font-black uppercase text-slate-300 mb-2">Margem × Meta · Histórico</h4>
          <div className="h-[220px]" data-testid="chart-gestor-margem">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={margemHist}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 11 }} />
                <Line type="monotone" dataKey="margem" name="Margem" stroke="#22d3ee" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="meta" name="Meta" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 flex flex-col" data-testid="integridade-dados">
          <h4 className="text-xs font-black uppercase text-slate-300 mb-1">Integridade dos Dados</h4>
          <div className="h-[140px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[{ v: integrity.pct }, { v: 100 - integrity.pct }]}
                  dataKey="v"
                  startAngle={210}
                  endAngle={-30}
                  innerRadius="70%"
                  outerRadius="92%"
                  stroke="none"
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowCert(true)}
                >
                  <Cell fill={integrity.pct >= 95 ? "#34d399" : integrity.pct >= 85 ? "#22d3ee" : "#fbbf24"} />
                  <Cell fill="rgba(148,163,184,0.12)" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-3 pointer-events-none">
              <span className="text-2xl font-black font-mono text-slate-50" data-testid="text-integridade-pct">{integrity.pct.toFixed(1).replace(".", ",")}%</span>
              <span className="text-[10px] font-black uppercase text-slate-400">{integrity.label}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center text-[10px] mb-2">
            <button type="button" className="hover:bg-slate-800/60 rounded" onClick={() => setFinding(findings.find((f) => f.id === "dados-validados") || null)}>
              <p className="text-emerald-400 font-black">{integrity.validos}</p><p className="text-slate-500">Válidos</p>
            </button>
            <button type="button" className="hover:bg-slate-800/60 rounded" onClick={() => setFinding(findings.find((f) => f.severity === "atencao" && f.count > 0) || null)}>
              <p className="text-amber-300 font-black">{integrity.atencao}</p><p className="text-slate-500">Atenção</p>
            </button>
            <button type="button" className="hover:bg-slate-800/60 rounded" onClick={() => setFinding(findings.find((f) => f.severity === "critico" && f.count > 0) || null)}>
              <p className="text-rose-400 font-black">{integrity.criticos}</p><p className="text-slate-500">Críticos</p>
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mb-2">
            Última validação: {(lastValidation || updatedAt)?.toLocaleString("pt-BR") || "—"}
          </p>
          <Button size="sm" className="w-full bg-slate-100 text-slate-950 text-[10px] font-black uppercase" onClick={runValidation} disabled={validating} data-testid="button-executar-validacao">
            {validating ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle2 size={12} className="mr-1" />}
            Executar Validação Agora
          </Button>
        </div>
      </div>

      <MemoriaDialog
        open={!!memoria}
        onOpenChange={(v) => !v && setMemoria(null)}
        memoria={memoria}
        fatExtra={memoria?.indicator === "Faturamento" ? fatBreakdown : null}
      />

      <Dialog open={!!finding} onOpenChange={(v) => !v && setFinding(null)}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-700 text-slate-100" data-testid="dialog-validacao-detalhe">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-50">
              <AlertTriangle size={18} className="text-amber-300" /> {finding?.title}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Módulo: {finding?.module} · Tabela: {finding?.table}
            </DialogDescription>
          </DialogHeader>
          {finding && (
            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto">
              <p className="text-slate-300"><b>Como corrigir:</b> {finding.howToFix}</p>
              {finding.userHint && <p className="text-slate-400"><b>Responsável:</b> {finding.userHint}</p>}
              {finding.records.length === 0 ? (
                <p className="text-emerald-300 font-bold">Nenhum registro problemático neste item.</p>
              ) : (
                finding.records.map((r) => (
                  <div key={String(r.id) + r.label} className="rounded-lg border border-slate-700 p-2 space-y-0.5">
                    <p className="font-black text-slate-100">{r.label}</p>
                    {r.amount != null && <p className="font-mono text-amber-300">{fmt(r.amount)}</p>}
                    {r.detail && <p className="text-slate-400">{r.detail}</p>}
                    {r.when && <p className="text-slate-500">Quando: {r.when}</p>}
                    {r.user && <p className="text-slate-500">Usuário: {r.user}</p>}
                    <p className="text-slate-500">Tabela: {finding.table} · Módulo: {finding.module}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAiFull} onOpenChange={setShowAiFull}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-50 flex items-center gap-2"><Sparkles size={16} className="text-cyan-300" /> Análise Completa — IA Financeira</DialogTitle>
            <DialogDescription className="text-slate-400">Gerada percorrendo o Knowledge Graph (Receita → … → Margem → Dashboard)</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-slate-200 max-h-[50vh] overflow-y-auto">
            {aiLines.map((l) => <li key={l}>• {l}</li>)}
          </ul>
          <div className="rounded-lg border border-slate-700 p-3 text-[11px] text-slate-400 space-y-1">
            <p>Integridade: <b className="text-slate-200">{integrity.pct.toFixed(1)}% ({integrity.label})</b></p>
            <p>Faturamento: <b className="text-emerald-300">{fmt(totals.fat)}</b> · Lucro: <b className="text-sky-300">{fmt(totals.lucro)}</b></p>
            <p>Fonte: motor único do Balanço / Medição / DRE — sem cálculo paralelo.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="max-w-2xl bg-slate-950 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Auditoria da Validação</DialogTitle>
            <DialogDescription className="text-slate-400">Data, módulo, registro, impacto e sugestão de correção</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 text-[11px]">
            {auditLog.map((e, i) => (
              <div key={i} className={`rounded-lg border p-2 ${e.result === "ok" ? "border-emerald-500/30" : "border-amber-500/30"}`}>
                <p className="font-black text-slate-100">{e.module} · {e.record}</p>
                <p className="text-slate-400">{new Date(e.at).toLocaleString("pt-BR")} · Usuário: {e.user}</p>
                <p className="text-slate-300">Resultado: {e.result === "ok" ? "OK" : e.problem}</p>
                {e.impact > 0 && <p className="font-mono text-amber-300">Impacto: {fmt(e.impact)}</p>}
                {e.result !== "ok" && <p className="text-cyan-300">Correção: {e.fix}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCert} onOpenChange={setShowCert}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-50 flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-300" /> Certificação dos Cálculos</DialogTitle>
            <DialogDescription className="text-slate-400">Só após todos OK o selo “Dados Certificados” é liberado</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {certChecks.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className={c.ok ? "text-emerald-400" : "text-rose-400"}>{c.ok ? "✔" : "✖"}</span>
                <span className="text-slate-200">{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">
            Integridade {integrity.pct.toFixed(1)}% · {certified ? "Painel certificado" : "Ainda há pendências"}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Array<[string, any, boolean?]> }) {
  return (
    <div>
      <p className="font-black uppercase text-slate-500 text-[10px] mb-1">{title}</p>
      <div className="space-y-0.5">
        {rows.map(([label, value, isCount]) => (
          <Row key={label} label={label} value={isCount ? String(value ?? 0) : fmt(Number(value || 0))} />
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono font-bold text-slate-100">{value}</span>
    </div>
  );
}
