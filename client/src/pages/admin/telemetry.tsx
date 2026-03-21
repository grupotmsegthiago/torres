import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Gauge, Fuel, Clock, AlertTriangle, Trophy, TrendingDown,
  RefreshCw, Loader2, MapPin, Calendar, Filter, Car,
} from "lucide-react";
import { authFetch, queryClient } from "@/lib/queryClient";

interface TelemetryEvent {
  id: number;
  vehicleId: number | null;
  plate: string;
  eventType: string;
  value: number | null;
  duration: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  driverName: string | null;
  details: string | null;
  createdAt: string;
}

interface TelemetrySummary {
  totalSpeedEvents: number;
  totalIdleEvents: number;
  totalIdleMinutes: number;
  idleFuelCostEstimate: number;
  ranking: Array<{
    plate: string;
    speedCount: number;
    maxSpeed: number;
    idleCount: number;
    totalIdleMin: number;
  }>;
  recentSpeed: TelemetryEvent[];
  recentIdle: TelemetryEvent[];
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (period) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "all":
    default:
      from = new Date(2020, 0, 1);
      break;
  }
  return { from: from.toISOString(), to };
}

export default function TelemetryPage() {
  const [period, setPeriod] = useState("week");
  const [filterPlate, setFilterPlate] = useState("");
  const [activeTab, setActiveTab] = useState<"resumo" | "velocidade" | "idle" | "ranking">("resumo");

  const range = getDateRange(period);

  const summaryQuery = useQuery<TelemetrySummary>({
    queryKey: ["/api/telemetry/summary", range.from, range.to],
    queryFn: async () => {
      const r = await authFetch(`/api/telemetry/summary?from=${range.from}&to=${range.to}`);
      if (!r.ok) throw new Error("Erro ao carregar resumo");
      return r.json();
    },
    refetchInterval: 60000,
  });

  const eventsQuery = useQuery<TelemetryEvent[]>({
    queryKey: ["/api/telemetry/events", range.from, range.to, filterPlate, activeTab],
    queryFn: async () => {
      let url = `/api/telemetry/events?from=${range.from}&to=${range.to}&limit=200`;
      if (activeTab === "velocidade") url += "&eventType=excesso_velocidade";
      if (activeTab === "idle") url += "&eventType=idle_excessivo";
      if (filterPlate) url += `&plate=${filterPlate}`;
      const r = await authFetch(url);
      if (!r.ok) throw new Error("Erro ao carregar eventos");
      return r.json();
    },
    enabled: activeTab !== "resumo" && activeTab !== "ranking",
  });

  const s = summaryQuery.data;
  const tabClass = (tab: string) => `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === tab ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 border border-neutral-200"}`;

  return (
    <AdminLayout>
      <div className="p-6 max-w-[1400px] mx-auto space-y-6" data-testid="telemetry-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>Telemetria & Custos</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Controle de infrações, idle excessivo e estimativas de custo</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-period">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">7 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/telemetry/summary"] });
              queryClient.invalidateQueries({ queryKey: ["/api/telemetry/events"] });
            }} data-testid="btn-refresh-telemetry">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {summaryQuery.isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 border-red-200 bg-red-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Exc. Velocidade</span>
                </div>
                <p className="text-3xl font-bold text-red-800" data-testid="stat-speed-count">{s?.totalSpeedEvents || 0}</p>
                <p className="text-xs text-red-500 mt-0.5">acima de 120 km/h</p>
              </Card>

              <Card className="p-4 border-amber-200 bg-amber-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Idle Excessivo</span>
                </div>
                <p className="text-3xl font-bold text-amber-800" data-testid="stat-idle-count">{s?.totalIdleEvents || 0}</p>
                <p className="text-xs text-amber-500 mt-0.5">motor parado &gt; 5 min</p>
              </Card>

              <Card className="p-4 border-blue-200 bg-blue-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Total Idle</span>
                </div>
                <p className="text-3xl font-bold text-blue-800" data-testid="stat-idle-minutes">{s?.totalIdleMinutes || 0}<span className="text-lg ml-1">min</span></p>
                <p className="text-xs text-blue-500 mt-0.5">tempo desperdiçado</p>
              </Card>

              <Card className="p-4 border-green-200 bg-green-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <Fuel className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Custo Estimado</span>
                </div>
                <p className="text-3xl font-bold text-green-800" data-testid="stat-fuel-cost">
                  R$ {(s?.idleFuelCostEstimate || 0).toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-green-500 mt-0.5">combustível em idle</p>
              </Card>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button className={tabClass("resumo")} onClick={() => setActiveTab("resumo")} data-testid="tab-resumo">Resumo</button>
              <button className={tabClass("velocidade")} onClick={() => setActiveTab("velocidade")} data-testid="tab-velocidade">
                <span className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Velocidade</span>
              </button>
              <button className={tabClass("idle")} onClick={() => setActiveTab("idle")} data-testid="tab-idle">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Idle</span>
              </button>
              <button className={tabClass("ranking")} onClick={() => setActiveTab("ranking")} data-testid="tab-ranking">
                <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Ranking</span>
              </button>
            </div>

            {(activeTab === "velocidade" || activeTab === "idle") && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-neutral-400" />
                <Input
                  placeholder="Filtrar por placa..."
                  value={filterPlate}
                  onChange={(e) => setFilterPlate(e.target.value.toUpperCase())}
                  className="max-w-[200px] h-8"
                  data-testid="input-filter-plate"
                />
                {filterPlate && <Button variant="ghost" size="sm" onClick={() => setFilterPlate("")}>Limpar</Button>}
              </div>
            )}

            {activeTab === "resumo" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Gauge className="w-5 h-5 text-red-600" />
                    <h3 className="font-bold text-sm">Últimas Infrações de Velocidade</h3>
                  </div>
                  {(!s?.recentSpeed || s.recentSpeed.length === 0) ? (
                    <p className="text-sm text-neutral-400 text-center py-6">Nenhuma infração registrada no período</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {s.recentSpeed.map((e) => (
                        <div key={e.id} className="flex items-center justify-between border rounded-lg px-3 py-2 hover:bg-red-50/50" data-testid={`speed-event-${e.id}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm">{e.plate}</span>
                              <span className="text-red-600 font-bold text-sm">{e.value} km/h</span>
                            </div>
                            {e.address && <p className="text-xs text-neutral-500 truncate max-w-[280px]">{e.address}</p>}
                            {e.driverName && <p className="text-xs text-neutral-400">Motorista: {e.driverName}</p>}
                          </div>
                          <span className="text-xs text-neutral-400 whitespace-nowrap ml-2">{formatDate(e.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold text-sm">Últimos Eventos de Idle Excessivo</h3>
                  </div>
                  {(!s?.recentIdle || s.recentIdle.length === 0) ? (
                    <p className="text-sm text-neutral-400 text-center py-6">Nenhum idle excessivo registrado</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {s.recentIdle.map((e) => (
                        <div key={e.id} className="flex items-center justify-between border rounded-lg px-3 py-2 hover:bg-amber-50/50" data-testid={`idle-event-${e.id}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm">{e.plate}</span>
                              <span className="text-amber-600 font-bold text-sm">{e.duration} min parado</span>
                            </div>
                            {e.address && <p className="text-xs text-neutral-500 truncate max-w-[280px]">{e.address}</p>}
                            {e.driverName && <p className="text-xs text-neutral-400">Motorista: {e.driverName}</p>}
                          </div>
                          <span className="text-xs text-neutral-400 whitespace-nowrap ml-2">{formatDate(e.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {activeTab === "velocidade" && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h3 className="font-bold text-sm">Infrações de Velocidade ({eventsQuery.data?.length || 0})</h3>
                  {eventsQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
                {eventsQuery.data?.length === 0 && <p className="text-sm text-neutral-400 text-center py-8">Nenhuma infração encontrada</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-neutral-500 uppercase">
                        <th className="py-2 px-2">Data/Hora</th>
                        <th className="py-2 px-2">Placa</th>
                        <th className="py-2 px-2">Velocidade</th>
                        <th className="py-2 px-2">Motorista</th>
                        <th className="py-2 px-2">Local</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsQuery.data?.map((e) => (
                        <tr key={e.id} className="border-b hover:bg-red-50/30" data-testid={`row-speed-${e.id}`}>
                          <td className="py-2 px-2 text-xs">{formatDate(e.createdAt)}</td>
                          <td className="py-2 px-2 font-mono font-bold">{e.plate}</td>
                          <td className="py-2 px-2 font-bold text-red-600">{e.value} km/h</td>
                          <td className="py-2 px-2 text-neutral-600">{e.driverName || "—"}</td>
                          <td className="py-2 px-2 text-xs text-neutral-500 max-w-[200px] truncate">{e.address || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === "idle" && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-sm">Idle Excessivo ({eventsQuery.data?.length || 0})</h3>
                  {eventsQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
                {eventsQuery.data?.length === 0 && <p className="text-sm text-neutral-400 text-center py-8">Nenhum evento de idle encontrado</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-neutral-500 uppercase">
                        <th className="py-2 px-2">Data/Hora</th>
                        <th className="py-2 px-2">Placa</th>
                        <th className="py-2 px-2">Duração</th>
                        <th className="py-2 px-2">Motorista</th>
                        <th className="py-2 px-2">Local</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsQuery.data?.map((e) => (
                        <tr key={e.id} className="border-b hover:bg-amber-50/30" data-testid={`row-idle-${e.id}`}>
                          <td className="py-2 px-2 text-xs">{formatDate(e.createdAt)}</td>
                          <td className="py-2 px-2 font-mono font-bold">{e.plate}</td>
                          <td className="py-2 px-2 font-bold text-amber-600">{e.duration} min</td>
                          <td className="py-2 px-2 text-neutral-600">{e.driverName || "—"}</td>
                          <td className="py-2 px-2 text-xs text-neutral-500 max-w-[200px] truncate">{e.address || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === "ranking" && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-neutral-700" />
                  <h3 className="font-bold text-sm">Ranking de Infrações por Veículo</h3>
                </div>
                {(!s?.ranking || s.ranking.length === 0) ? (
                  <p className="text-sm text-neutral-400 text-center py-8">Sem dados no período selecionado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-neutral-500 uppercase">
                          <th className="py-2 px-2">#</th>
                          <th className="py-2 px-2">Placa</th>
                          <th className="py-2 px-2">Exc. Velocidade</th>
                          <th className="py-2 px-2">Vel. Máxima</th>
                          <th className="py-2 px-2">Idle Excessivo</th>
                          <th className="py-2 px-2">Total Idle (min)</th>
                          <th className="py-2 px-2">Custo Idle Est.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.ranking.map((r, i) => {
                          const fuelCost = r.totalIdleMin * 0.015 * 6.5;
                          return (
                            <tr key={r.plate} className={`border-b ${i === 0 ? "bg-red-50/50" : i === 1 ? "bg-amber-50/30" : "hover:bg-neutral-50"}`} data-testid={`row-ranking-${r.plate}`}>
                              <td className="py-2.5 px-2">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i === 0 ? "bg-red-600 text-white" : i === 1 ? "bg-amber-500 text-white" : i === 2 ? "bg-yellow-400 text-white" : "bg-neutral-200 text-neutral-600"}`}>
                                  {i + 1}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 font-mono font-bold text-sm">{r.plate}</td>
                              <td className="py-2.5 px-2">
                                {r.speedCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                    <AlertTriangle className="w-3 h-3" /> {r.speedCount}x
                                  </span>
                                ) : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="py-2.5 px-2">
                                {r.maxSpeed > 0 ? (
                                  <span className="font-bold text-red-600">{r.maxSpeed} km/h</span>
                                ) : <span className="text-neutral-300">—</span>}
                              </td>
                              <td className="py-2.5 px-2">
                                {r.idleCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                                    <Clock className="w-3 h-3" /> {r.idleCount}x
                                  </span>
                                ) : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="py-2.5 px-2 font-semibold">{r.totalIdleMin > 0 ? `${r.totalIdleMin} min` : "—"}</td>
                              <td className="py-2.5 px-2 font-semibold text-green-700">{fuelCost > 0 ? `R$ ${fuelCost.toFixed(2).replace(".", ",")}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 p-3 bg-neutral-50 rounded-lg border text-xs text-neutral-500 space-y-1">
                  <p className="font-semibold text-neutral-700">Como o custo é calculado:</p>
                  <p>Consumo médio em marcha lenta: ~0,9 L/hora (0,015 L/min)</p>
                  <p>Preço médio do combustível: R$ 6,50/litro</p>
                  <p>Custo = minutos parado x 0,015 L/min x R$ 6,50</p>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
