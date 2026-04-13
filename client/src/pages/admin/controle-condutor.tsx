import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authFetch } from "@/lib/authFetch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Car, Play, Square, Clock, ArrowLeftRight, User, Gauge, Search,
  AlertTriangle, Trash2, Eye, RefreshCw, Timer, FileText, ChevronDown, ChevronUp
} from "lucide-react";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ControleCondutorPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { data: sessions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/driver-sessions", statusFilter, vehicleFilter, driverFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (vehicleFilter) params.set("vehicleId", vehicleFilter);
      if (driverFilter) params.set("driverId", driverFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await authFetch(`/api/driver-sessions?${params}`);
      if (!r.ok) throw new Error("Erro ao carregar");
      return r.json();
    },
  });

  const { data: vehicles = [] } = useQuery<any[]>({ queryKey: ["/api/vehicles"] });
  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  const activeDrivers = useMemo(() =>
    (employees || []).filter((e: any) => e.status === "ativo").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [employees]
  );

  const activeSessions = sessions.filter(s => s.status === "ativo");
  const finishedSessions = sessions.filter(s => s.status === "finalizado");

  const openDetail = async (session: any) => {
    setDetailLoading(true);
    try {
      const r = await authFetch(`/api/driver-sessions/${session.id}`);
      if (!r.ok) throw new Error("Erro");
      const data = await r.json();
      setSelectedSession(data);
    } catch {
      setSelectedSession(session);
    }
    setDetailLoading(false);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/driver-sessions/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "Sessão excluída" });
      setSelectedSession(null);
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4" data-testid="admin-driver-control-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
              <Car className="w-6 h-6 text-sky-600" />
              Controle de Condutor
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Rodízio de direção das viaturas de escolta</p>
          </div>
          {activeSessions.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-sm px-3 py-1 animate-pulse">
              <Play className="w-3.5 h-3.5 mr-1" />
              {activeSessions.length} em operação
            </Badge>
          )}
        </div>

        {activeSessions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeSessions.map(s => (
              <Card
                key={s.id}
                className="p-4 border-2 border-emerald-200 bg-emerald-50/50 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openDetail(s)}
                data-testid={`card-active-session-${s.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                    <Play className="w-2.5 h-2.5 mr-1" /> ATIVO
                  </Badge>
                  <span className="text-[10px] text-neutral-400 font-mono">#{s.id}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Car className="w-4 h-4 text-sky-600" />
                  <span className="font-bold text-sm text-neutral-900">{s.vehicle_prefix || s.vehicle_plate}</span>
                  <span className="text-[10px] text-neutral-400">{s.vehicle_plate}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-600">
                  <User className="w-3 h-3" />
                  <span>{s.driver_name}</span>
                  {s.partner_name && <><span className="text-neutral-300">|</span><span>{s.partner_name}</span></>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1">
                  <Clock className="w-3 h-3" />
                  <span>Início: {formatTime(s.started_at)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[120px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Veículo</Label>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-vehicle">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(vehicles || []).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.frota || v.plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Condutor</Label>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-driver">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {activeDrivers.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 mt-1 w-36" data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Até</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 mt-1 w-36" data-testid="filter-date-to" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-400">Carregando registros...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <Car className="w-8 h-8 mx-auto text-neutral-200 mb-2" />
              <p className="text-sm text-neutral-400">Nenhuma sessão de condução encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-sessions">
                <thead>
                  <tr className="bg-neutral-50 border-b">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">#</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">VTR</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Condutor</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Parceiro</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Início</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Fim</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">KM</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Status</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-neutral-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => {
                    const kmTotal = s.km_end && s.km_start ? s.km_end - s.km_start : null;
                    return (
                      <tr key={s.id} className="border-b hover:bg-neutral-50 cursor-pointer" onClick={() => openDetail(s)} data-testid={`row-session-${s.id}`}>
                        <td className="px-3 py-2 font-mono text-xs text-neutral-400">{s.id}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-neutral-900">{s.vehicle_prefix || ""}</span>
                          <span className="text-neutral-400 text-xs ml-1">{s.vehicle_plate}</span>
                        </td>
                        <td className="px-3 py-2 font-medium text-neutral-800">{s.driver_name}</td>
                        <td className="px-3 py-2 text-neutral-500">{s.partner_name || "—"}</td>
                        <td className="px-3 py-2 text-xs text-neutral-500">{formatTime(s.started_at)}</td>
                        <td className="px-3 py-2 text-xs text-neutral-500">{s.ended_at ? formatTime(s.ended_at) : "—"}</td>
                        <td className="px-3 py-2 text-xs text-neutral-600 font-mono">
                          {kmTotal !== null ? `${kmTotal.toLocaleString("pt-BR")} km` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {s.status === "ativo" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">
                              <Play className="w-2.5 h-2.5 mr-0.5" /> Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-neutral-500">
                              <Square className="w-2.5 h-2.5 mr-0.5" /> Finalizado
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(s); }} data-testid={`button-view-${s.id}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedSession && (
          <SessionDetailDialog
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
            onDelete={(id) => {
              if (confirm("Tem certeza que deseja excluir esta sessão?")) {
                deleteMutation.mutate(id);
              }
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function SessionDetailDialog({ session, onClose, onDelete }: { session: any; onClose: () => void; onDelete: (id: number) => void }) {
  const shifts = session.shifts || [];
  const kmTotal = session.km_end && session.km_start ? session.km_end - session.km_start : null;

  const driverTotals: Record<string, { name: string; totalMinutes: number; shifts: number }> = {};
  for (const s of shifts) {
    const key = String(s.driver_id);
    if (!driverTotals[key]) driverTotals[key] = { name: s.driver_name, totalMinutes: 0, shifts: 0 };
    driverTotals[key].totalMinutes += Number(s.duration_minutes) || 0;
    driverTotals[key].shifts += 1;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-sky-600" />
            Sessão #{session.id}
          </DialogTitle>
          <DialogDescription>Detalhes da operação de condução</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            {session.status === "ativo" ? (
              <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">
                <Play className="w-3 h-3 mr-1" /> Em Operação
              </Badge>
            ) : (
              <Badge variant="outline" className="font-bold text-neutral-500">
                <Square className="w-3 h-3 mr-1" /> Finalizado
              </Badge>
            )}
          </div>

          <div className="bg-neutral-50 rounded-xl p-4 space-y-2 border">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">VTR / Prefixo</p>
                <p className="text-sm font-bold text-neutral-900">{session.vehicle_prefix || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Placa</p>
                <p className="text-sm font-bold text-neutral-900">{session.vehicle_plate}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Condutor</p>
                <p className="text-sm font-bold text-neutral-800">{session.driver_name}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Parceiro</p>
                <p className="text-sm text-neutral-700">{session.partner_name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Início</p>
                <p className="text-xs text-neutral-700">{formatFullDate(session.started_at)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Fim</p>
                <p className="text-xs text-neutral-700">{session.ended_at ? formatFullDate(session.ended_at) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">KM Saída</p>
                <p className="text-sm font-mono text-neutral-800">{session.km_start?.toLocaleString("pt-BR") || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">KM Final</p>
                <p className="text-sm font-mono text-neutral-800">{session.km_end?.toLocaleString("pt-BR") || "—"}</p>
              </div>
            </div>
            {kmTotal !== null && (
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center mt-2">
                <p className="text-[10px] text-sky-600 font-bold uppercase">KM Total Percorrido</p>
                <p className="text-lg font-black text-sky-700">{kmTotal.toLocaleString("pt-BR")} km</p>
              </div>
            )}
          </div>

          {shifts.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Turnos de Condução ({shifts.length})
              </h3>
              <div className="space-y-1.5">
                {shifts.map((s: any, i: number) => (
                  <div key={s.id || i} className={`rounded-lg px-3 py-2 border ${s.is_active ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50 border-neutral-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${s.is_active ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"}`} />
                        <span className="text-xs font-bold text-neutral-800">{s.driver_name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        <Timer className="w-2.5 h-2.5 mr-0.5" />
                        {s.is_active ? "Em andamento" : formatDuration(Number(s.duration_minutes) || 0)}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5 ml-4">
                      {formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : "agora"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(driverTotals).length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Resumo por Condutor
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(driverTotals).map((d, i) => (
                  <div key={i} className="bg-neutral-50 rounded-lg p-3 border text-center">
                    <p className="text-xs font-bold text-neutral-800 truncate">{d.name}</p>
                    <p className="text-lg font-black text-sky-700">{formatDuration(d.totalMinutes)}</p>
                    <p className="text-[10px] text-neutral-400">{d.shifts} turno(s)</p>
                  </div>
                ))}
              </div>
              <div className="text-center mt-2">
                <p className="text-[10px] text-neutral-400">Total de trocas: <strong>{Math.max(0, shifts.length - 1)}</strong></p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(session.id)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
