import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Wallet, TrendingUp, TrendingDown, Target, AlertTriangle, RefreshCw, ChevronRight, Activity } from "lucide-react";

interface ResumoDiretoria {
  date: string;
  diaSemana: string;
  dataLabel: string;
  generatedAt: string;
  asaas: { connected: boolean; balance?: number; message?: string };
  meta: { diariaPorViatura: number; viaturasAtivas: number; diaria: number; semanal: number; mensal: number; diasNoMes: number };
  dia: {
    fatBilling: number; fatLive: number; fatExtraLive: number;
    receitasAvulsas: number; despesasAvulsas: number;
    custoEscolta: number; custoTotal: number;
    resultado: number; margem: number; kmTotal: number;
    despPedagio: number; despCombustivel: number;
    metaDiaria: number; pctMeta: number;
  };
  semana: { inicio: string; fim: string; fat: number; meta: number; pct: number };
  mes: { inicio: string; fim: string; fat: number; meta: number; pct: number };
  gastosMes: { total: number; porCategoria: { categoria: string; valor: number; pct: number }[] };
  analiseCustoKm: {
    custoPorKmHoje: number; custoPorKmHist: number; variacaoPct: number;
    histKmTotal: number; histCustoTotal: number;
    status: { color: string; bg: string; label: string; msg: string };
  };
  ops: { totalOS: number; escoltas: number; concluidas: number; emAndamento: number; canceladas: number; agentesAtivos: number };
  ordens: { id: number; osNumber: string; clientName: string; status: string; fat: number; fatLive: number; custo: number; kmTotal: number; horasMissao: number; isLive: boolean }[];
}

function fmtBR(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctBarColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 70) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function pctTextColor(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 70) return "text-blue-600";
  if (pct >= 40) return "text-amber-600";
  return "text-rose-600";
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    em_andamento: { bg: "bg-blue-100", color: "text-blue-700", label: "Em Andamento" },
    concluida: { bg: "bg-emerald-100", color: "text-emerald-700", label: "Concluída" },
    "concluída": { bg: "bg-emerald-100", color: "text-emerald-700", label: "Concluída" },
    agendada: { bg: "bg-amber-100", color: "text-amber-700", label: "Agendada" },
    aberta: { bg: "bg-indigo-100", color: "text-indigo-700", label: "Aberta" },
    cancelada: { bg: "bg-rose-100", color: "text-rose-700", label: "Cancelada" },
    recusada: { bg: "bg-rose-100", color: "text-rose-700", label: "Recusada" },
  };
  const s = map[status] || { bg: "bg-neutral-100", color: "text-neutral-600", label: status };
  return <span className={`inline-block ${s.bg} ${s.color} px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap`}>{s.label}</span>;
}

function fmtPeriodo(a: string, b: string) {
  const f = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${f(a)} → ${f(b)}`;
}

function MetaCard({ label, periodo, fat, meta, pct }: { label: string; periodo: string; fat: number; meta: number; pct: number }) {
  const barPct = Math.max(2, Math.min(100, pct));
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-meta-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{label}</span>
        <span className="text-[11px] text-neutral-400">{periodo}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-lg font-black text-neutral-900">R$ {fmtBR(fat)}</span>
        <span className="text-[11px] text-neutral-400">/ R$ {fmtBR(meta)}</span>
      </div>
      <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full ${pctBarColor(pct)}`} style={{ width: `${barPct}%` }} />
      </div>
      <div className={`mt-1 text-right text-xs font-bold ${pctTextColor(pct)}`}>{pct.toFixed(1)}% da meta</div>
    </div>
  );
}

export default function MobileResumoFinanceiroPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user && user.role !== "diretoria" && user.role !== "admin") {
      setLocation("/mobile");
    }
  }, [user, setLocation]);

  const { data, isLoading, refetch, isFetching } = useQuery<ResumoDiretoria>({
    queryKey: ["/api/financeiro/resumo-diretoria"],
    refetchInterval: 3 * 60 * 60 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    enabled: !!user && (user.role === "diretoria" || user.role === "admin"),
  });

  if (!user || (user.role !== "diretoria" && user.role !== "admin")) {
    return null;
  }

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4">
          <div className="h-24 bg-neutral-200 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-neutral-200 rounded-2xl animate-pulse" />)}
          </div>
          <div className="h-32 bg-neutral-200 rounded-2xl animate-pulse" />
          <div className="h-48 bg-neutral-200 rounded-2xl animate-pulse" />
        </div>
      </MobileLayout>
    );
  }

  if (!data) {
    return (
      <MobileLayout>
        <div className="p-4 text-center text-sm text-neutral-500">Sem dados disponíveis</div>
      </MobileLayout>
    );
  }

  const lastUpdate = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 pb-20" data-testid="mobile-resumo-financeiro-page">
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-700 rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[2px] opacity-70">Diretoria</p>
              <h1 className="text-xl font-black uppercase tracking-wider mt-1">Resumo Financeiro</h1>
              <p className="text-xs opacity-80 mt-1">{data.diaSemana}, {data.dataLabel}</p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-white/10 hover:bg-white/20 active:bg-white/25 rounded-xl p-2 transition-colors"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-[10px] text-white/50 mt-3">Gerado em {lastUpdate} (BRT) · Auto a cada 3h</p>
        </div>

        <div className={`rounded-2xl p-4 border-l-4 ${data.asaas.connected ? "bg-emerald-50 border-emerald-500" : "bg-amber-50 border-amber-500"}`} data-testid="card-asaas-balance">
          <div className="flex items-start gap-3">
            <Wallet className={`w-5 h-5 mt-0.5 ${data.asaas.connected ? "text-emerald-600" : "text-amber-600"}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${data.asaas.connected ? "text-emerald-700" : "text-amber-700"}`}>Saldo em Conta — Asaas</p>
              {data.asaas.connected ? (
                <p className="text-2xl font-black text-emerald-700 mt-0.5" data-testid="text-asaas-balance">R$ {fmtBR(Number(data.asaas.balance) || 0)}</p>
              ) : (
                <p className="text-xs text-amber-700 mt-1">{data.asaas.message || "Indisponível"}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-xl p-3" data-testid="kpi-faturamento">
            <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Faturamento</p>
            <p className="text-base font-black text-emerald-700 mt-1 leading-tight">R$ {fmtBR(data.dia.fatLive)}</p>
            {data.dia.fatExtraLive > 0 && (
              <p className="text-[9px] text-blue-600 font-bold mt-1 flex items-center gap-0.5"><Activity className="w-2.5 h-2.5" /> +R$ {fmtBR(data.dia.fatExtraLive)} ao vivo</p>
            )}
          </div>
          <div className="bg-rose-50 border-l-4 border-rose-500 rounded-xl p-3" data-testid="kpi-custos">
            <p className="text-[9px] font-bold text-rose-700 uppercase tracking-wider">Custos</p>
            <p className="text-base font-black text-rose-700 mt-1 leading-tight">R$ {fmtBR(data.dia.custoTotal)}</p>
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-3" data-testid="kpi-resultado">
            <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">Resultado</p>
            <p className={`text-base font-black mt-1 leading-tight ${data.dia.resultado >= 0 ? "text-blue-700" : "text-rose-700"}`}>R$ {fmtBR(data.dia.resultado)}</p>
            <p className={`text-[9px] font-bold mt-1 ${data.dia.margem >= 30 ? "text-emerald-600" : data.dia.margem >= 15 ? "text-amber-600" : "text-rose-600"}`}>Margem {fmtBR(data.dia.margem)}%</p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-neutral-700" />
            <h2 className="text-xs font-black text-neutral-900 uppercase tracking-wider">Faturamento × Meta</h2>
          </div>
          <MetaCard label="Hoje" periodo={data.dataLabel} fat={data.dia.fatLive} meta={data.meta.diaria} pct={data.dia.pctMeta} />
          <MetaCard label="Semana" periodo={fmtPeriodo(data.semana.inicio, data.semana.fim)} fat={data.semana.fat} meta={data.semana.meta} pct={data.semana.pct} />
          <MetaCard label="Mês" periodo={fmtPeriodo(data.mes.inicio, data.mes.fim)} fat={data.mes.fat} meta={data.mes.meta} pct={data.mes.pct} />
          <p className="text-[10px] text-neutral-400 px-1">Meta: R$ {fmtBR(data.meta.diariaPorViatura)} por viatura/dia × {data.meta.viaturasAtivas} ativa(s)</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-analise-km">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: data.analiseCustoKm.status.color }} />
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Análise de Custo por KM</p>
              <p className="text-sm font-black mt-0.5" style={{ color: data.analiseCustoKm.status.color }}>{data.analiseCustoKm.status.label}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-neutral-500">Hoje</span><span className="font-bold text-neutral-900">R$ {fmtBR(data.analiseCustoKm.custoPorKmHoje)}/km</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Média 30 dias</span><span className="font-bold text-neutral-900">R$ {fmtBR(data.analiseCustoKm.custoPorKmHist)}/km</span></div>
            {data.analiseCustoKm.custoPorKmHist > 0 && data.analiseCustoKm.custoPorKmHoje > 0 && (
              <div className="flex justify-between"><span className="text-neutral-500">Variação</span><span className="font-bold" style={{ color: data.analiseCustoKm.status.color }}>{data.analiseCustoKm.variacaoPct >= 0 ? "+" : ""}{data.analiseCustoKm.variacaoPct.toFixed(1)}%</span></div>
            )}
          </div>
          <p className="text-[11px] text-neutral-600 mt-3 leading-snug">{data.analiseCustoKm.status.msg}</p>
        </div>

        {data.gastosMes.total > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-gastos-mes">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                <h2 className="text-xs font-black text-neutral-900 uppercase tracking-wider">Gastos do Mês</h2>
              </div>
              <span className="text-sm font-black text-rose-600">R$ {fmtBR(data.gastosMes.total)}</span>
            </div>
            <div className="space-y-2">
              {data.gastosMes.porCategoria.slice(0, 8).map((g) => (
                <div key={g.categoria} className="space-y-1" data-testid={`gasto-cat-${g.categoria.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-neutral-700 truncate pr-2">{g.categoria}</span>
                    <span className="text-xs font-bold text-rose-600 whitespace-nowrap">R$ {fmtBR(g.valor)} <span className="text-[10px] text-neutral-400 font-normal">· {g.pct.toFixed(1)}%</span></span>
                  </div>
                  <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-400" style={{ width: `${Math.max(2, Math.min(100, g.pct))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-ops">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-neutral-700" />
            <h2 className="text-xs font-black text-neutral-900 uppercase tracking-wider">Operações do Dia</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between bg-neutral-50 rounded-lg p-2"><span className="text-neutral-500">Total OS</span><span className="font-bold text-neutral-900">{data.ops.totalOS}</span></div>
            <div className="flex justify-between bg-neutral-50 rounded-lg p-2"><span className="text-neutral-500">Escoltas</span><span className="font-bold text-neutral-900">{data.ops.escoltas}</span></div>
            <div className="flex justify-between bg-emerald-50 rounded-lg p-2"><span className="text-emerald-700">Concluídas</span><span className="font-bold text-emerald-700">{data.ops.concluidas}</span></div>
            <div className="flex justify-between bg-blue-50 rounded-lg p-2"><span className="text-blue-700">Em Andam.</span><span className="font-bold text-blue-700">{data.ops.emAndamento}</span></div>
            {data.ops.canceladas > 0 && (
              <div className="flex justify-between bg-rose-50 rounded-lg p-2"><span className="text-rose-700">Canc/Recu</span><span className="font-bold text-rose-700">{data.ops.canceladas}</span></div>
            )}
            <div className="flex justify-between bg-neutral-50 rounded-lg p-2"><span className="text-neutral-500">Agentes</span><span className="font-bold text-neutral-900">{data.ops.agentesAtivos}</span></div>
            <div className="flex justify-between bg-neutral-50 rounded-lg p-2 col-span-2"><span className="text-neutral-500">KM Rodados</span><span className="font-bold text-neutral-900">{fmtBR(data.dia.kmTotal)} km</span></div>
          </div>
        </div>

        {data.ordens.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-neutral-700" />
              <h2 className="text-xs font-black text-neutral-900 uppercase tracking-wider">Detalhamento por OS</h2>
            </div>
            {data.ordens.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-neutral-200 p-3" data-testid={`row-os-${o.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-neutral-900">{o.osNumber}</span>
                  {statusBadge(o.status)}
                </div>
                <p className="text-xs text-neutral-600 mt-1 truncate">{o.clientName}</p>
                <div className="flex items-end justify-between mt-2">
                  <div>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Faturamento</p>
                    <p className="text-sm font-bold text-emerald-600">R$ {fmtBR(o.fatLive)}</p>
                    {o.isLive && <p className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5"><Activity className="w-2.5 h-2.5" /> ao vivo</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Custo</p>
                    <p className="text-sm font-bold text-rose-600">R$ {fmtBR(o.custo)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
