import { useQuery } from "@tanstack/react-query";
import { getQueryFn, authFetch } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MapPin, Radio, AlertCircle, Users, Car, Clock, Navigation,
  ExternalLink, Loader2, History, Signal, RefreshCw, Eye,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Vehicle } from "@shared/schema";

type AgentLoc = {
  id: number;
  userId: number;
  employeeId: number | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  updatedAt: string;
  employeeName: string | null;
  employeePhone: string | null;
  employeeRole: string | null;
};

type LocHistory = {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  createdAt: string;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}min atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

function isOnline(dateStr: string) {
  return Date.now() - new Date(dateStr).getTime() < 15 * 60 * 1000;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=17&hl=pt-BR`;
}

function AgentCard({ loc }: { loc: AgentLoc }) {
  const [histOpen, setHistOpen] = useState(false);
  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
  const online = isOnline(loc.updatedAt);

  const { data: history = [], isLoading: histLoading } = useQuery<LocHistory[]>({
    queryKey: ["/api/agent/locations", loc.userId, "history", histDate],
    queryFn: () => authFetch(`/api/agent/locations/${loc.userId}/history?date=${histDate}`).then(r => r.json()),
    enabled: histOpen,
  });

  return (
    <>
      <Card className="p-5 bg-white border-neutral-200" data-testid={`card-agent-loc-${loc.userId}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${online ? "bg-green-500 animate-pulse" : "bg-neutral-300"}`} />
            <div>
              <p className="font-bold text-neutral-900 text-sm">{loc.employeeName || `Usuário #${loc.userId}`}</p>
              {loc.employeeRole && (
                <p className="text-[11px] text-neutral-500 uppercase tracking-wide">{loc.employeeRole}</p>
              )}
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
            online
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-neutral-100 text-neutral-500 border border-neutral-200"
          }`}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
            <span>{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>{timeAgo(loc.updatedAt)}</span>
          </div>
          {loc.accuracy && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Signal className="w-3.5 h-3.5 text-neutral-400" />
              <span>Precisão: {Math.round(loc.accuracy)}m</span>
            </div>
          )}
          {loc.speed != null && loc.speed > 0 && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Navigation className="w-3.5 h-3.5 text-neutral-400" />
              <span>{(loc.speed * 3.6).toFixed(0)} km/h</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <a
            href={mapsUrl(loc.latitude, loc.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full text-xs" data-testid={`btn-map-agent-${loc.userId}`}>
              <ExternalLink className="w-3 h-3 mr-1" /> Maps
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setHistOpen(true)}
            data-testid={`btn-history-agent-${loc.userId}`}
          >
            <History className="w-3 h-3 mr-1" /> Histórico
          </Button>
        </div>
      </Card>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider">
              Histórico — {loc.employeeName || `Usuário #${loc.userId}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 items-center mb-3">
            <Input
              type="date"
              value={histDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="text-sm"
              data-testid="input-hist-date"
            />
          </div>
          {histLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-6">Nenhum registro nesta data.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] text-neutral-400 font-medium uppercase mb-2">{history.length} posições registradas</p>
              {history.map((h, idx) => (
                <div key={h.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-neutral-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 flex items-center justify-center bg-neutral-100 rounded text-[10px] font-bold text-neutral-500">{idx + 1}</span>
                    <span className="text-neutral-700">
                      {new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500">{h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</span>
                    {h.accuracy && <span className="text-neutral-400">±{Math.round(h.accuracy)}m</span>}
                    <a
                      href={mapsUrl(h.latitude, h.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TrackerPage() {
  const [tab, setTab] = useState<"agents" | "vehicles">("agents");

  const { data: vehicles = [], isLoading: vLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: agentLocs = [], isLoading: aLoading, refetch: refetchAgents } = useQuery<AgentLoc[]>({
    queryKey: ["/api/agent/locations"],
    queryFn: () => authFetch("/api/agent/locations").then(r => r.json()),
    refetchInterval: 60000,
  });

  const onlineCount = useMemo(() => agentLocs.filter(l => isOnline(l.updatedAt)).length, [agentLocs]);

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-tracker-title">Rastreamento</h1>
          <p className="text-sm text-neutral-500 mt-1">Monitoramento em tempo real de agentes e frota</p>
        </div>
        {tab === "agents" && (
          <Button variant="outline" size="sm" onClick={() => refetchAgents()} data-testid="btn-refresh-agents">
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === "agents" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("agents")}
          className="text-xs font-bold uppercase tracking-wider"
          data-testid="tab-agents"
        >
          <Users className="w-4 h-4 mr-1" />
          Agentes ({onlineCount}/{agentLocs.length})
        </Button>
        <Button
          variant={tab === "vehicles" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("vehicles")}
          className="text-xs font-bold uppercase tracking-wider"
          data-testid="tab-vehicles"
        >
          <Car className="w-4 h-4 mr-1" />
          Veículos ({vehicles.length})
        </Button>
      </div>

      {tab === "agents" && (
        <>
          {aLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : agentLocs.length === 0 ? (
            <Card className="p-8 text-center bg-neutral-50 border-neutral-200">
              <MapPin className="w-8 h-8 mx-auto mb-3 text-neutral-300" />
              <p className="text-sm text-neutral-500">Nenhum agente reportou localização ainda.</p>
              <p className="text-xs text-neutral-400 mt-1">As posições são atualizadas automaticamente a cada 10 minutos.</p>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4 text-xs text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Online ({onlineCount})
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-neutral-300" />
                  Offline ({agentLocs.length - onlineCount})
                </div>
                <span className="text-neutral-400">Atualização automática a cada 10 min</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agentLocs
                  .sort((a, b) => {
                    const aOn = isOnline(a.updatedAt) ? 0 : 1;
                    const bOn = isOnline(b.updatedAt) ? 0 : 1;
                    if (aOn !== bOn) return aOn - bOn;
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                  })
                  .map((loc) => (
                    <AgentCard key={loc.id} loc={loc} />
                  ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "vehicles" && (
        <>
          <Card className="p-6 bg-amber-50 border-amber-200 mb-6" data-testid="card-tracker-notice">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">API de Rastreamento</p>
                <p className="text-sm text-amber-700 mt-1">
                  Configure o ID e URL da API do rastreador em cada veículo para ativar o monitoramento em tempo real.
                </p>
              </div>
            </div>
          </Card>

          {vLoading ? (
            <div className="p-8 text-center text-neutral-400">Carregando...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(vehicles || []).map((vehicle) => (
                <Card key={vehicle.id} className="p-5 bg-white border-neutral-200" data-testid={`card-tracker-${vehicle.id}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-bold text-neutral-900">{vehicle.plate}</p>
                      <p className="text-xs text-neutral-500">{vehicle.brand} {vehicle.model}</p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${
                      vehicle.status === "disponível" ? "bg-green-500" :
                      vehicle.status === "em_uso" ? "bg-amber-500" :
                      "bg-red-500"
                    }`} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-neutral-400" />
                      <span className="text-neutral-600">
                        {vehicle.trackerId ? `ID: ${vehicle.trackerId}` : "Rastreador não configurado"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Radio className="w-4 h-4 text-neutral-400" />
                      <span className="text-neutral-600">
                        {vehicle.trackerApiUrl ? "API configurada" : "API não configurada"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-100">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">KM Atual</span>
                      <span className="font-medium text-neutral-900">{vehicle.km?.toLocaleString() || "0"} km</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-neutral-500">Status</span>
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        vehicle.status === "disponível" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        vehicle.status === "em_uso" ? "bg-neutral-900 text-white" :
                        "bg-red-50 text-red-700 border border-red-200"
                      }`}>{vehicle.status === "em_uso" ? "EM USO" : vehicle.status === "disponível" ? "DISPONÍVEL" : "MANUTENÇÃO"}</span>
                    </div>
                  </div>
                </Card>
              ))}

              {(vehicles || []).length === 0 && (
                <div className="col-span-full p-8 text-center text-neutral-400">
                  Nenhum veículo cadastrado.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
