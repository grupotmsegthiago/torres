import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database, Cpu, MemoryStick, Activity, Network, AlertTriangle,
  ShieldAlert, Clock, HardDrive, Zap, CheckCircle2, XCircle,
  Gauge, PauseCircle, ArrowDownUp, Brain, RefreshCw, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

type Telemetry = {
  realtime: {
    ts: string;
    node: { cpu_pct: number; mem_mb: number; mem_pct: number; heap_used_mb: number; heap_limit_mb: number; uptime_s: number };
    db: {
      latency_ms: number;
      active_connections: number;
      idle_connections: number;
      total_connections: number;
      max_connections: number;
      db_size_mb: number;
      db_size_limit_mb: number;
      cache_hit_ratio: number | null;
      idle_in_transaction: number;
      tuples_read: number;
      tuples_written: number;
      long_queries: Array<{ pid: number; duration_s: number; state: string; query: string; application_name: string | null; client_addr: string | null }>;
    };
    status: "online" | "fallback" | "offline";
  };
  history24h: Array<{
    sampled_at: string;
    latency_ms: number;
    active_connections: number | null;
    total_connections: number | null;
    long_query_count: number | null;
    node_cpu_pct: number | null;
    node_mem_mb: number | null;
    fallback_active: boolean | null;
    db_size_mb: number | null;
    cache_hit_ratio: number | null;
    idle_in_transaction: number | null;
    tuples_read: number | null;
    tuples_written: number | null;
  }>;
  security: {
    token_failures_total: number;
    token_failures_recent: Array<{ id: number; employee_name: string | null; error_message: string | null; ip_address: string | null; user_agent: string | null; created_at: string }>;
    brute_force_suspects: Array<{ ip: string; count: number; last_at: string; last_user: string | null; last_error: string | null }>;
  };
  tableSizes?: Array<{
    table_name: string;
    data_size: string;
    index_size: string;
    total_size: string;
    total_size_bytes: number;
  }>;
  aiReports?: Array<{
    id: number;
    created_at: string;
    status: "good" | "warn" | "bad";
    headline: string;
    analysis: string;
  }>;
  topQueries?: Array<{
    query: string;
    calls: number;
    total_ms: number;
    mean_ms: number;
    rows: number;
    cache_hit_pct: number | null;
  }>;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} min`;
  return `${(ms / 3600000).toFixed(1)} h`;
}

function fmtUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function StatusBadge({ status }: { status: "online" | "fallback" | "offline" }) {
  if (status === "online") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300 gap-1.5" data-testid="status-online">
        <CheckCircle2 className="w-3.5 h-3.5" /> SAUDÁVEL
      </Badge>
    );
  }
  if (status === "fallback") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 gap-1.5" data-testid="status-fallback">
        <AlertTriangle className="w-3.5 h-3.5" /> FALLBACK ATIVO
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/15 text-red-700 border-red-300 gap-1.5" data-testid="status-offline">
      <XCircle className="w-3.5 h-3.5" /> OFFLINE
    </Badge>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent, testId }: {
  icon: any; label: string; value: string | number; sub?: string;
  accent: "blue" | "purple" | "emerald" | "amber" | "rose";
  testId: string;
}) {
  const accents: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-500/5 border-blue-200 text-blue-700",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-200 text-purple-700",
    emerald: "from-emerald-500/25 to-emerald-500/10 border-emerald-300 text-emerald-800",
    amber: "from-amber-500/30 to-amber-500/10 border-amber-300 text-amber-800",
    rose: "from-rose-500/30 to-rose-500/10 border-rose-400 text-rose-800",
  };
  return (
    <Card className={`p-5 border bg-gradient-to-br ${accents[accent]}`} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-3xl font-bold text-neutral-900" data-testid={`${testId}-value`}>{value}</div>
      {sub && <div className="text-xs text-neutral-600 mt-1">{sub}</div>}
    </Card>
  );
}

export default function DatabasePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "diretoria") {
      setLocation("/admin/dashboard");
    }
  }, [user, setLocation]);

  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<Telemetry>({
    queryKey: ["/api/admin/db-telemetry"],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const genReport = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db-telemetry/report");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-telemetry"] });
      toast({ title: "Análise atualizada", description: "A IA gerou um novo relatório da situação." });
    },
    onError: () => {
      toast({
        title: "Não foi possível gerar agora",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  type VacuumState = {
    status: "idle" | "running" | "done" | "error";
    table: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    beforeBytes: number | null;
    afterBytes: number | null;
    durationMs: number | null;
    error: string | null;
  };

  const [confirmVacuum, setConfirmVacuum] = useState(false);
  const prevVacuumStatus = useRef<string | null>(null);

  const vacuum = useQuery<VacuumState>({
    queryKey: ["/api/admin/db-vacuum/status"],
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });

  const startVacuum = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db-vacuum", { table: "mission_updates" });
      return res.json();
    },
    onSuccess: () => {
      setConfirmVacuum(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-vacuum/status"] });
      toast({
        title: "Compactação iniciada",
        description: "Pode levar alguns minutos. Não feche esta página até terminar.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Não foi possível iniciar",
        description: e?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const cur = vacuum.data?.status;
    if (prevVacuumStatus.current === "running" && cur === "done") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-telemetry"] });
      toast({ title: "Banco compactado", description: "Espaço recuperado. O tamanho já foi atualizado." });
    }
    if (prevVacuumStatus.current === "running" && cur === "error") {
      toast({
        title: "Falha na compactação",
        description: vacuum.data?.error || "Veja os logs do servidor.",
        variant: "destructive",
      });
    }
    prevVacuumStatus.current = cur ?? null;
  }, [vacuum.data?.status]);

  const fmtBytes = (b: number) =>
    b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(0)} MB`;

  if (user && user.role !== "admin" && user.role !== "diretoria") return null;

  const rt = data?.realtime;
  const history = data?.history24h ?? [];
  const security = data?.security;
  const tableSizes = data?.tableSizes ?? [];
  const topQueries = data?.topQueries ?? [];
  const maxTableBytes = tableSizes.length > 0 ? tableSizes[0].total_size_bytes : 0;

  const chartData = history.map((h) => ({
    time: fmtTime(h.sampled_at),
    latency: h.latency_ms,
    conexoes: h.active_connections ?? 0,
    cpu: h.node_cpu_pct ?? 0,
    fallback: h.fallback_active ? 1 : 0,
  }));

  // Tuplas lidas/escritas são contadores ACUMULADOS no Postgres. Para mostrar
  // o "perfil de carga ao longo do tempo" calculamos o delta entre amostras
  // (quanto foi lido/escrito naquele intervalo de ~2min). Só geramos um ponto
  // quando a amostra atual E a anterior têm valores não-nulos — amostras antigas
  // (anteriores à criação das colunas) ficam null e NÃO podem virar 0, senão a
  // transição null→valor produziria um pico artificial gigante. Deltas negativos
  // (reset de estatísticas / restart do banco) são zerados.
  const tuplesData = history
    .map((h, i) => {
      const prev = i > 0 ? history[i - 1] : null;
      if (
        !prev ||
        h.tuples_read == null || h.tuples_written == null ||
        prev.tuples_read == null || prev.tuples_written == null
      ) {
        return null;
      }
      return {
        time: fmtTime(h.sampled_at),
        leituras: Math.max(0, h.tuples_read - prev.tuples_read),
        escritas: Math.max(0, h.tuples_written - prev.tuples_written),
      };
    })
    .filter((d): d is { time: string; leituras: number; escritas: number } => d !== null);

  const cacheData = history
    .filter((h) => h.cache_hit_ratio != null)
    .map((h) => ({ time: fmtTime(h.sampled_at), cache: Number(h.cache_hit_ratio) }));

  const cacheHit = rt?.db.cache_hit_ratio;
  const idleInTx = rt?.db.idle_in_transaction ?? 0;

  const connPct = rt && rt.db.max_connections > 0
    ? Math.round((rt.db.total_connections / rt.db.max_connections) * 100)
    : 0;

  // ===== Semáforo: classifica cada métrica em bom / atenção / ruim =====
  type Health = "good" | "warn" | "bad";
  const accentFor = (h: Health): "emerald" | "amber" | "rose" =>
    h === "good" ? "emerald" : h === "warn" ? "amber" : "rose";

  const cpuHealth: Health = !rt ? "good" : rt.node.cpu_pct < 60 ? "good" : rt.node.cpu_pct < 85 ? "warn" : "bad";
  const memHealth: Health = !rt ? "good" : rt.node.mem_pct < 70 ? "good" : rt.node.mem_pct < 90 ? "warn" : "bad";
  const connHealth: Health = connPct < 70 ? "good" : connPct < 90 ? "warn" : "bad";
  const latHealth: Health = !rt ? "good" : rt.db.latency_ms < 300 ? "good" : rt.db.latency_ms < 1500 ? "warn" : "bad";
  const slowHealth: Health = !rt ? "good" : rt.db.long_queries.length === 0 ? "good" : rt.db.long_queries.length < 3 ? "warn" : "bad";
  const authHealth: Health = !security
    ? "good"
    : security.brute_force_suspects.length > 0
    ? "bad"
    : security.token_failures_total > 20
    ? "warn"
    : "good";
  const idleHealth: Health = idleInTx === 0 ? "good" : idleInTx <= 2 ? "warn" : "bad";

  // Visual dos relatórios de IA por status.
  const aiReports = data?.aiReports ?? [];
  const aiMeta: Record<Health, { label: string; dot: string; chip: string; ring: string }> = {
    good: { label: "Tudo bem", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800 border-emerald-300", ring: "border-emerald-300 bg-emerald-50" },
    warn: { label: "Atenção", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800 border-amber-300", ring: "border-amber-300 bg-amber-50" },
    bad: { label: "Crítico", dot: "bg-red-500", chip: "bg-red-100 text-red-800 border-red-300", ring: "border-red-400 bg-red-50" },
  };
  const latestReport = aiReports[0];
  const olderReports = aiReports.slice(1);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6" data-testid="page-database">
        <header className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 flex items-center gap-2">
              <Database className="w-7 h-7 text-blue-600" />
              Banco de Dados — Telemetria
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              Monitoramento em tempo real, histórico de 24h e eventos de segurança. Atualiza a cada 15s.
            </p>
          </div>
          {rt && <StatusBadge status={rt.status} />}
        </header>

        {/* Legenda do semáforo: explica as cores pro dono entender rápido */}
        <Card className="p-4" data-testid="semaforo-legend">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-semibold text-neutral-700">Como ler as cores:</span>
            <span className="flex items-center gap-2" data-testid="legend-good">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-neutral-700"><strong className="text-emerald-700">Verde</strong> = está bom</span>
            </span>
            <span className="flex items-center gap-2" data-testid="legend-warn">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 inline-block" />
              <span className="text-neutral-700"><strong className="text-amber-700">Amarelo</strong> = mais ou menos, ficar de olho</span>
            </span>
            <span className="flex items-center gap-2" data-testid="legend-bad">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 inline-block" />
              <span className="text-neutral-700"><strong className="text-red-700">Vermelho</strong> = ruim, precisa de atenção</span>
            </span>
          </div>
        </Card>

        {/* Painel de Análise da IA */}
        <Card className="p-4 md:p-6" data-testid="ai-analysis-panel">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                Análise da IA
              </h2>
              <p className="text-sm text-neutral-600 mt-0.5">
                Um resumo automático da situação do banco, gerado a cada 10 minutos.
              </p>
            </div>
            <Button
              onClick={() => genReport.mutate()}
              disabled={genReport.isPending}
              variant="outline"
              data-testid="button-generate-report"
            >
              {genReport.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando...</>
                : <><RefreshCw className="w-4 h-4 mr-2" /> Atualizar análise agora</>}
            </Button>
          </div>

          {aiReports.length === 0 ? (
            <div className="mt-4 text-sm text-neutral-500 bg-neutral-50 border rounded-lg p-4" data-testid="ai-empty">
              A primeira análise aparece em instantes. Você também pode clicar em "Atualizar análise agora".
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Último relatório em destaque */}
              <div className={`rounded-xl border p-4 ${aiMeta[latestReport.status].ring}`} data-testid="ai-latest">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${aiMeta[latestReport.status].chip}`}>
                    <span className={`w-2 h-2 rounded-full ${aiMeta[latestReport.status].dot}`} />
                    {aiMeta[latestReport.status].label}
                  </span>
                  <span className="text-xs text-neutral-500">{fmtDateTime(latestReport.created_at)}</span>
                </div>
                <p className="mt-2 font-semibold text-neutral-900" data-testid="ai-latest-headline">{latestReport.headline}</p>
                <p className="mt-1 text-sm text-neutral-700 whitespace-pre-line" data-testid="ai-latest-analysis">{latestReport.analysis}</p>
              </div>

              {/* Histórico (5 anteriores) */}
              {olderReports.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Análises anteriores</p>
                  {olderReports.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 border rounded-lg p-3 bg-white" data-testid={`ai-history-${r.id}`}>
                      <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${aiMeta[r.status].dot}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-neutral-800">{r.headline}</span>
                          <span className="text-xs text-neutral-400">{fmtDateTime(r.created_at)}</span>
                        </div>
                        <p className="text-xs text-neutral-600 mt-0.5 whitespace-pre-line">{r.analysis}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {isLoading && (
          <Card className="p-8 text-center text-neutral-500" data-testid="loading-state">
            Carregando telemetria...
          </Card>
        )}

        {error && (
          <Card className="p-6 border-red-300 bg-red-50 text-red-800" data-testid="error-state">
            Falha ao carregar telemetria. Acesso restrito a administradores.
          </Card>
        )}

        {rt && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" data-testid="metric-cards">
              <MetricCard
                icon={Cpu}
                label="CPU Servidor (Node)"
                value={`${rt.node.cpu_pct}%`}
                sub={`Uptime ${fmtUptime(rt.node.uptime_s)}`}
                accent={accentFor(cpuHealth)}
                testId="card-cpu"
              />
              <MetricCard
                icon={MemoryStick}
                label="Memória Servidor"
                value={`${rt.node.mem_mb} MB`}
                sub={`Heap ${rt.node.heap_used_mb} de ${rt.node.heap_limit_mb} MB (${rt.node.mem_pct}%)`}
                accent={accentFor(memHealth)}
                testId="card-memory"
              />
              <MetricCard
                icon={Network}
                label="Conexões PG"
                value={`${rt.db.total_connections}/${rt.db.max_connections || "?"}`}
                sub={`${rt.db.active_connections} ativas · ${rt.db.idle_connections} idle · ${connPct}%`}
                accent={accentFor(connHealth)}
                testId="card-connections"
              />
              <MetricCard
                icon={Zap}
                label="Latência do Banco"
                value={`${rt.db.latency_ms} ms`}
                sub={rt.db.latency_ms < 300 ? "Resposta saudável" : rt.db.latency_ms < 1500 ? "Latência elevada" : "Lentidão crítica"}
                accent={accentFor(latHealth)}
                testId="card-latency"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {(() => {
                const usedMb = rt.db.db_size_mb;
                const limitMb = rt.db.db_size_limit_mb || 0;
                const pct = limitMb > 0 ? (usedMb / limitMb) * 100 : 0;
                const fmt = (mb: number) => {
                  if (mb >= 1024) {
                    const gb = mb / 1024;
                    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
                  }
                  return `${Math.round(mb)} MB`;
                };
                const barColor = pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-blue-500";
                const cardTone = pct >= 90
                  ? "from-rose-500/10 to-rose-500/5 border-rose-200 text-rose-700"
                  : pct >= 75
                  ? "from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-700"
                  : "from-blue-500/10 to-blue-500/5 border-blue-200 text-blue-700";
                return (
                  <Card className={`p-5 border bg-gradient-to-br ${cardTone}`} data-testid="card-dbsize">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
                      <HardDrive className="w-4 h-4" />
                      <span>Tamanho do Banco</span>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-neutral-900" data-testid="card-dbsize-value">
                      {fmt(usedMb)} <span className="text-neutral-400 font-semibold">/ {limitMb > 0 ? fmt(limitMb) : "—"}</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        data-testid="bar-dbsize"
                      />
                    </div>
                    <div className="text-xs text-neutral-600 mt-1.5" data-testid="text-dbsize-usage">
                      {limitMb > 0
                        ? `${pct.toFixed(1)}% de uso · ${fmt(Math.max(0, limitMb - usedMb))} livres`
                        : "Capacidade não configurada"}
                    </div>
                    <div className="mt-3 border-t border-neutral-200/60 pt-3">
                      {vacuum.data?.status === "running" ? (
                        <div className="flex items-center gap-2 text-xs text-neutral-700" data-testid="status-vacuum-running">
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Compactando {vacuum.data.table}… não feche esta página.</span>
                        </div>
                      ) : confirmVacuum ? (
                        <div className="space-y-2" data-testid="confirm-vacuum">
                          <p className="text-[11px] leading-snug text-neutral-700">
                            Isso vai <b>travar a tabela de missões por alguns minutos</b> enquanto recupera o espaço.
                            Faça de preferência de madrugada. Confirmar agora?
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={startVacuum.isPending}
                              onClick={() => startVacuum.mutate()}
                              data-testid="button-vacuum-confirm"
                            >
                              {startVacuum.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sim, compactar"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmVacuum(false)} data-testid="button-vacuum-cancel">
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setConfirmVacuum(true)}
                          data-testid="button-vacuum"
                        >
                          <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Compactar banco (recuperar espaço)
                        </Button>
                      )}
                      {vacuum.data?.status === "done" && vacuum.data.beforeBytes != null && vacuum.data.afterBytes != null && (
                        <div className="mt-2 text-[11px] text-emerald-700" data-testid="text-vacuum-result">
                          Última compactação ({vacuum.data.table}): {fmtBytes(vacuum.data.beforeBytes)} → {fmtBytes(vacuum.data.afterBytes)}
                          {" "}em {Math.round((vacuum.data.durationMs || 0) / 1000)}s
                        </div>
                      )}
                      {vacuum.data?.status === "error" && (
                        <div className="mt-2 text-[11px] text-rose-600" data-testid="text-vacuum-error">
                          Falha: {vacuum.data.error}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })()}
              <MetricCard
                icon={Clock}
                label="Queries Lentas (>5s)"
                value={rt.db.long_queries.length}
                sub={rt.db.long_queries.length === 0 ? "Nenhuma travada" : "Verifique abaixo"}
                accent={accentFor(slowHealth)}
                testId="card-longqueries"
              />
              <MetricCard
                icon={ShieldAlert}
                label="Falhas Auth (24h)"
                value={security?.token_failures_total ?? 0}
                sub={security && security.brute_force_suspects.length > 0
                  ? `${security.brute_force_suspects.length} IP(s) suspeito(s)`
                  : "Nenhum padrão suspeito"}
                accent={accentFor(authHealth)}
                testId="card-authfails"
              />
              <MetricCard
                icon={Activity}
                label="Amostras (24h)"
                value={history.length}
                sub="1 amostra a cada 2min"
                accent="purple"
                testId="card-samples"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {/* Cache Hit Ratio — card de progresso (ideal > 99%) */}
              <Card
                className={`p-5 border bg-gradient-to-br ${
                  cacheHit == null
                    ? "from-neutral-500/10 to-neutral-500/5 border-neutral-200 text-neutral-700"
                    : cacheHit >= 99
                    ? "from-emerald-500/10 to-emerald-500/5 border-emerald-200 text-emerald-700"
                    : cacheHit >= 95
                    ? "from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-700"
                    : "from-rose-500/10 to-rose-500/5 border-rose-200 text-rose-700"
                }`}
                data-testid="card-cache-hit"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
                  <Gauge className="w-4 h-4" />
                  <span>Cache Hit Ratio</span>
                </div>
                <div className="mt-2 text-3xl font-bold text-neutral-900" data-testid="card-cache-hit-value">
                  {cacheHit == null ? "—" : `${cacheHit.toFixed(2)}%`}
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cacheHit == null ? "bg-neutral-400" : cacheHit >= 99 ? "bg-emerald-500" : cacheHit >= 95 ? "bg-amber-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, cacheHit ?? 0))}%` }}
                  />
                </div>
                <div className="text-xs text-neutral-600 mt-1.5">
                  {cacheHit == null
                    ? "Sem dados de tabelas ainda"
                    : cacheHit >= 99
                    ? "Leitura em memória saudável (ideal ≥ 99%)"
                    : "Abaixo do ideal — muita leitura em disco"}
                </div>
              </Card>

              {/* Idle in Transaction — ideal SEMPRE 0 */}
              <MetricCard
                icon={PauseCircle}
                label="Idle in Transaction"
                value={idleInTx}
                sub={idleInTx === 0 ? "Nenhuma transação presa (ideal)" : "Conexões com transação aberta sem commit/rollback"}
                accent={accentFor(idleHealth)}
                testId="card-idle-in-tx"
              />

              {/* Resumo de tuplas acumuladas (detalhe temporal no gráfico abaixo) */}
              <MetricCard
                icon={ArrowDownUp}
                label="Tuplas Processadas (total)"
                value={`${rt.db.tuples_read.toLocaleString("pt-BR")} L`}
                sub={`${rt.db.tuples_written.toLocaleString("pt-BR")} escritas · acumulado desde reset`}
                accent="blue"
                testId="card-tuples-total"
              />
            </div>

            <Card className="p-4 md:p-6" data-testid="table-space-usage">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-5 h-5 text-neutral-700" />
                <h2 className="text-lg font-semibold text-neutral-900">Uso de Espaço por Tabela</h2>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                As 10 tabelas que mais ocupam espaço no banco (dados + índices). Ordenadas da maior para a menor.
              </p>
              {tableSizes.length === 0 ? (
                <div className="text-center text-neutral-500 py-12">Sem dados de tamanho disponíveis.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                        <th className="py-2 pr-4 font-semibold">Tabela</th>
                        <th className="py-2 pr-4 font-semibold text-right">Dados</th>
                        <th className="py-2 pr-4 font-semibold text-right">Índices</th>
                        <th className="py-2 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableSizes.map((t) => {
                        const pct = maxTableBytes > 0 ? Math.min(100, Math.max(2, (t.total_size_bytes / maxTableBytes) * 100)) : 0;
                        const barColor = pct >= 66 ? "bg-rose-500" : pct >= 33 ? "bg-amber-500" : "bg-emerald-500";
                        return (
                          <tr
                            key={t.table_name}
                            className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                            data-testid={`row-table-${t.table_name}`}
                          >
                            <td className="py-2.5 pr-4">
                              <div className="font-medium text-neutral-900 font-mono text-xs md:text-sm">{t.table_name}</div>
                              <div className="mt-1 h-1.5 w-full max-w-[220px] rounded-full bg-neutral-100 overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right text-neutral-600 whitespace-nowrap" data-testid={`text-data-${t.table_name}`}>{t.data_size}</td>
                            <td className="py-2.5 pr-4 text-right text-neutral-600 whitespace-nowrap" data-testid={`text-index-${t.table_name}`}>{t.index_size}</td>
                            <td className="py-2.5 text-right font-semibold text-neutral-900 whitespace-nowrap" data-testid={`text-total-${t.table_name}`}>{t.total_size}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6" data-testid="table-top-queries">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-5 h-5 text-neutral-700" />
                <h2 className="text-lg font-semibold text-neutral-900">Consultas Mais Pesadas</h2>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                As consultas que mais consomem o banco desde a última reinicialização. <strong>Tempo médio</strong> alto (acima de 1s) costuma indicar falta de índice ou dados pesados (fotos) sendo trazidos. É daqui que a Análise da IA tira a causa.
              </p>
              {topQueries.length === 0 ? (
                <div className="text-center text-neutral-500 py-12">Sem dados de consultas disponíveis ainda.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                        <th className="py-2 pr-4 font-semibold">Consulta (trecho do comando)</th>
                        <th className="py-2 pr-4 font-semibold text-right">Vezes</th>
                        <th className="py-2 pr-4 font-semibold text-right">Tempo médio</th>
                        <th className="py-2 font-semibold text-right">Tempo total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topQueries.map((q, i) => {
                        const meanColor = q.mean_ms >= 1000 ? "text-rose-600" : q.mean_ms >= 100 ? "text-amber-600" : "text-emerald-600";
                        return (
                          <tr
                            key={i}
                            className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 align-top"
                            data-testid={`row-query-${i}`}
                          >
                            <td className="py-2.5 pr-4">
                              <div className="font-mono text-xs text-neutral-800 break-all max-w-[480px]">{q.query}</div>
                              {q.cache_hit_pct != null && q.cache_hit_pct < 95 && (
                                <div className="mt-1 text-[11px] text-amber-600">Cache baixo ({q.cache_hit_pct}%) — lendo bastante do disco.</div>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-neutral-600 whitespace-nowrap" data-testid={`text-calls-${i}`}>{q.calls.toLocaleString("pt-BR")}</td>
                            <td className={`py-2.5 pr-4 text-right font-semibold whitespace-nowrap ${meanColor}`} data-testid={`text-mean-${i}`}>{fmtMs(q.mean_ms)}</td>
                            <td className="py-2.5 text-right text-neutral-700 whitespace-nowrap" data-testid={`text-totalms-${i}`}>{fmtMs(q.total_ms)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6" data-testid="chart-latency-24h">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Latência do Banco — 24 horas</h2>
                  <p className="text-xs text-neutral-500">
                    Linha azul = latência em ms. Picos altos ou pontos vermelhos indicam quedas / chaveamento para fallback.
                  </p>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="text-center text-neutral-500 py-12">Sem amostras nas últimas 24h. O coletor começa a registrar automaticamente.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={11} interval="preserveStartEnd" />
                    <YAxis stroke="#6b7280" fontSize={11} label={{ value: "ms", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <RechartTooltip
                      contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, n: string) => [n === "latency" ? `${v} ms` : v, n === "latency" ? "Latência" : n]}
                    />
                    <ReferenceLine y={1500} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Lentidão crítica", fontSize: 10, fill: "#ef4444" }} />
                    <ReferenceLine y={300} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Atenção", fontSize: 10, fill: "#f59e0b" }} />
                    <Line type="monotone" dataKey="latency" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4 md:p-6" data-testid="chart-connections-24h">
                <h3 className="text-base font-semibold text-neutral-900 mb-1">Conexões ativas — 24h</h3>
                <p className="text-xs text-neutral-500 mb-3">Quantas conexões simultâneas o banco mantém ao longo do dia.</p>
                {chartData.length === 0 ? (
                  <div className="text-center text-neutral-400 py-8 text-sm">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="time" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                      <YAxis stroke="#6b7280" fontSize={10} />
                      <RechartTooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="conexoes" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card className="p-4 md:p-6" data-testid="chart-cpu-24h">
                <h3 className="text-base font-semibold text-neutral-900 mb-1">CPU do Servidor — 24h</h3>
                <p className="text-xs text-neutral-500 mb-3">Uso de CPU do Node.js que serve a aplicação.</p>
                {chartData.length === 0 ? (
                  <div className="text-center text-neutral-400 py-8 text-sm">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="time" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                      <YAxis stroke="#6b7280" fontSize={10} domain={[0, 100]} />
                      <RechartTooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="cpu" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            <Card className="p-4 md:p-6" data-testid="chart-tuples-24h">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                  <ArrowDownUp className="w-5 h-5 text-blue-600" /> Taxa de Escrita vs Leitura — 24h
                </h2>
                <p className="text-xs text-neutral-500">
                  Quantas tuplas (registros) foram lidas e escritas a cada intervalo de amostra (~2min). Ajuda a entender o perfil de carga do banco ao longo do dia.
                </p>
              </div>
              {tuplesData.length === 0 ? (
                <div className="text-center text-neutral-500 py-12">
                  Ainda sem histórico suficiente. O comparativo aparece após pelo menos 2 amostras (o coletor registra a cada 2min).
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={tuplesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={11} interval="preserveStartEnd" />
                    <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} width={70} />
                    <RechartTooltip
                      contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, n: string) => [Number(v).toLocaleString("pt-BR") + " tuplas", n === "leituras" ? "Leituras" : "Escritas"]}
                    />
                    <Line type="monotone" dataKey="leituras" name="leituras" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="escritas" name="escritas" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-neutral-600">
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-blue-600" /> Leituras (seq + índice)</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-amber-500" /> Escritas (insert + update + delete)</span>
              </div>
            </Card>

            <Card className="p-4 md:p-6" data-testid="chart-cache-24h">
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Cache Hit Ratio — 24h</h3>
              <p className="text-xs text-neutral-500 mb-3">Percentual de leituras servidas pela memória ao longo do tempo. O ideal é manter sempre acima de 99% (linha verde).</p>
              {cacheData.length === 0 ? (
                <div className="text-center text-neutral-400 py-8 text-sm">Sem histórico de cache ainda.</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={cacheData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="#6b7280" fontSize={10} domain={[90, 100]} tickFormatter={(v: number) => `${v}%`} />
                    <RechartTooltip
                      contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toFixed(2)}%`, "Cache Hit"]}
                    />
                    <ReferenceLine y={99} stroke="#10b981" strokeDasharray="4 4" label={{ value: "Ideal 99%", fontSize: 10, fill: "#10b981" }} />
                    <Line type="monotone" dataKey="cache" stroke="#059669" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-4 md:p-6" data-testid="long-queries-panel">
              <h2 className="text-lg font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" /> Queries em execução há mais de 5s
              </h2>
              {rt.db.long_queries.length === 0 ? (
                <div className="text-sm text-neutral-500 py-2">Nenhuma query travada no momento.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-neutral-500 uppercase border-b">
                      <tr>
                        <th className="text-left py-2 px-2">PID</th>
                        <th className="text-left py-2 px-2">Duração</th>
                        <th className="text-left py-2 px-2">Estado</th>
                        <th className="text-left py-2 px-2">App</th>
                        <th className="text-left py-2 px-2">IP</th>
                        <th className="text-left py-2 px-2">Query (200 primeiros chars)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rt.db.long_queries.map((q) => (
                        <tr key={q.pid} className="border-b last:border-0" data-testid={`long-query-${q.pid}`}>
                          <td className="py-2 px-2 font-mono text-xs">{q.pid}</td>
                          <td className="py-2 px-2 font-semibold text-amber-700">{q.duration_s}s</td>
                          <td className="py-2 px-2"><Badge variant="outline">{q.state}</Badge></td>
                          <td className="py-2 px-2 text-xs text-neutral-600">{q.application_name || "-"}</td>
                          <td className="py-2 px-2 text-xs font-mono text-neutral-600">{q.client_addr || "-"}</td>
                          <td className="py-2 px-2 text-xs font-mono text-neutral-700 max-w-md truncate">{q.query}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6" data-testid="security-panel">
              <h2 className="text-lg font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" /> Segurança — Tentativas de Acesso Suspeitas
              </h2>
              <p className="text-xs text-neutral-500 mb-4">
                Falhas de autenticação registradas nas últimas 24h. Mesmo IP errando senha 5 vezes ou mais é destacado.
              </p>

              {security && security.brute_force_suspects.length > 0 && (
                <div className="mb-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2">
                    IPs com padrão de força bruta ({security.brute_force_suspects.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-neutral-500 uppercase border-b">
                        <tr>
                          <th className="text-left py-2 px-2">IP</th>
                          <th className="text-left py-2 px-2">Tentativas</th>
                          <th className="text-left py-2 px-2">Última tentativa</th>
                          <th className="text-left py-2 px-2">Último usuário</th>
                          <th className="text-left py-2 px-2">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {security.brute_force_suspects.map((s) => (
                          <tr key={s.ip} className="border-b last:border-0 bg-rose-50/50" data-testid={`bruteforce-${s.ip}`}>
                            <td className="py-2 px-2 font-mono text-xs text-rose-900">{s.ip}</td>
                            <td className="py-2 px-2 font-bold text-rose-700">{s.count}x</td>
                            <td className="py-2 px-2 text-xs">{fmtDateTime(s.last_at)}</td>
                            <td className="py-2 px-2 text-xs text-neutral-700">{s.last_user || "-"}</td>
                            <td className="py-2 px-2 text-xs text-neutral-600 max-w-xs truncate">{s.last_error || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Eventos recentes ({security?.token_failures_recent.length ?? 0})
              </div>
              {security && security.token_failures_recent.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-neutral-500 uppercase border-b">
                      <tr>
                        <th className="text-left py-2 px-2">Quando</th>
                        <th className="text-left py-2 px-2">Usuário</th>
                        <th className="text-left py-2 px-2">IP</th>
                        <th className="text-left py-2 px-2">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {security.token_failures_recent.map((ev) => (
                        <tr key={ev.id} className="border-b last:border-0" data-testid={`security-event-${ev.id}`}>
                          <td className="py-2 px-2 text-xs whitespace-nowrap">{fmtDateTime(ev.created_at)}</td>
                          <td className="py-2 px-2 text-xs">{ev.employee_name || "-"}</td>
                          <td className="py-2 px-2 text-xs font-mono">{ev.ip_address || "-"}</td>
                          <td className="py-2 px-2 text-xs text-neutral-600 max-w-md truncate">{ev.error_message || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-neutral-500 py-2">Nenhuma falha registrada nas últimas 24h.</div>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
