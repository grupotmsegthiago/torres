import AdminLayout from "@/components/admin/layout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Cpu, MemoryStick, Activity, Network, AlertTriangle,
  ShieldAlert, Clock, HardDrive, Zap, CheckCircle2, XCircle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

type Telemetry = {
  realtime: {
    ts: string;
    node: { cpu_pct: number; mem_mb: number; mem_pct: number; uptime_s: number };
    db: {
      latency_ms: number;
      active_connections: number;
      idle_connections: number;
      total_connections: number;
      max_connections: number;
      db_size_mb: number;
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
  }>;
  security: {
    token_failures_total: number;
    token_failures_recent: Array<{ id: number; employee_name: string | null; error_message: string | null; ip_address: string | null; user_agent: string | null; created_at: string }>;
    brute_force_suspects: Array<{ ip: string; count: number; last_at: string; last_user: string | null; last_error: string | null }>;
  };
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 text-emerald-700",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-700",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-200 text-rose-700",
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

  const { data, isLoading, error } = useQuery<Telemetry>({
    queryKey: ["/api/admin/db-telemetry"],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  if (user && user.role !== "admin" && user.role !== "diretoria") return null;

  const rt = data?.realtime;
  const history = data?.history24h ?? [];
  const security = data?.security;

  const chartData = history.map((h) => ({
    time: fmtTime(h.sampled_at),
    latency: h.latency_ms,
    conexoes: h.active_connections ?? 0,
    cpu: h.node_cpu_pct ?? 0,
    fallback: h.fallback_active ? 1 : 0,
  }));

  const connPct = rt && rt.db.max_connections > 0
    ? Math.round((rt.db.total_connections / rt.db.max_connections) * 100)
    : 0;

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
                accent="blue"
                testId="card-cpu"
              />
              <MetricCard
                icon={MemoryStick}
                label="Memória Servidor"
                value={`${rt.node.mem_mb} MB`}
                sub={`Heap ${rt.node.mem_pct}% usado`}
                accent="purple"
                testId="card-memory"
              />
              <MetricCard
                icon={Network}
                label="Conexões PG"
                value={`${rt.db.total_connections}/${rt.db.max_connections || "?"}`}
                sub={`${rt.db.active_connections} ativas · ${rt.db.idle_connections} idle · ${connPct}%`}
                accent="emerald"
                testId="card-connections"
              />
              <MetricCard
                icon={Zap}
                label="Latência do Banco"
                value={`${rt.db.latency_ms} ms`}
                sub={rt.db.latency_ms < 300 ? "Resposta saudável" : rt.db.latency_ms < 1500 ? "Latência elevada" : "Lentidão crítica"}
                accent={rt.db.latency_ms < 300 ? "emerald" : rt.db.latency_ms < 1500 ? "amber" : "rose"}
                testId="card-latency"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <MetricCard
                icon={HardDrive}
                label="Tamanho do Banco"
                value={`${rt.db.db_size_mb} MB`}
                accent="blue"
                testId="card-dbsize"
              />
              <MetricCard
                icon={Clock}
                label="Queries Lentas (>5s)"
                value={rt.db.long_queries.length}
                sub={rt.db.long_queries.length === 0 ? "Nenhuma travada" : "Verifique abaixo"}
                accent={rt.db.long_queries.length === 0 ? "emerald" : "amber"}
                testId="card-longqueries"
              />
              <MetricCard
                icon={ShieldAlert}
                label="Falhas Auth (24h)"
                value={security?.token_failures_total ?? 0}
                sub={security && security.brute_force_suspects.length > 0
                  ? `${security.brute_force_suspects.length} IP(s) suspeito(s)`
                  : "Nenhum padrão suspeito"}
                accent={security && security.brute_force_suspects.length > 0 ? "rose" : "emerald"}
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
