import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Car, Play, RefreshCw, Square, Clock, ArrowLeftRight, AlertTriangle, User, Gauge, ChevronDown, ChevronUp } from "lucide-react";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}min` : `${m}min`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calc = () => Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    setElapsed(calc());
    const t = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const isAlert = elapsed >= 7200;

  return (
    <div className={`font-mono text-3xl font-black tabular-nums ${isAlert ? "text-red-500 animate-pulse" : "text-emerald-600"}`} data-testid="text-live-timer">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}

export default function MobileControleCondutorPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { data: vehicles = [] } = useQuery<any[]>({ queryKey: ["/api/vehicles"] });
  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  const activeDrivers = useMemo(() =>
    (employees || []).filter((e: any) => e.status === "ativo").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [employees]
  );

  const { data: activeSession, isLoading } = useQuery<any>({
    queryKey: ["/api/driver-sessions/active"],
    refetchInterval: 10000,
  });

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["/api/driver-sessions", { status: "finalizado" }],
    enabled: showHistory,
  });

  const startMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", "/api/driver-sessions/start", payload);
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Condução iniciada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions/active"] });
      setKmStart("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const swapMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const r = await apiRequest("POST", `/api/driver-sessions/${sessionId}/swap`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Direção passada!", description: `Agora: ${data.newShift.driver_name}` });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions/active"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const endMutation = useMutation({
    mutationFn: async ({ sessionId, kmEnd }: { sessionId: number; kmEnd: string }) => {
      const r = await apiRequest("POST", `/api/driver-sessions/${sessionId}/end`, { kmEnd: kmEnd || undefined });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Operação finalizada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions"] });
      setKmEnd("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeShift = activeSession?.shifts?.find((s: any) => s.is_active);
  const isAlert = activeShift && (Date.now() - new Date(activeShift.started_at).getTime()) >= 7200000;

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-neutral-300" />
            <p className="text-sm text-neutral-400">Carregando...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 pb-24" data-testid="mobile-driver-control-page">
        <div className="bg-neutral-900 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Car className="w-5 h-5 text-sky-400" />
            <h1 className="text-lg font-black tracking-wider">CONTROLE DE CONDUTOR</h1>
          </div>
          <p className="text-xs text-neutral-500">Escolta Torres — Rodízio de Direção</p>
        </div>

        {activeSession ? (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  <Play className="w-3 h-3 mr-1" /> EM OPERAÇÃO
                </Badge>
                <span className="text-[10px] text-neutral-400 font-mono">#{activeSession.id}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-50 rounded-xl p-3">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">VTR</p>
                  <p className="text-sm font-bold text-neutral-900" data-testid="text-session-vehicle">{activeSession.vehicle_prefix || activeSession.vehicle_plate}</p>
                  <p className="text-[10px] text-neutral-400">{activeSession.vehicle_plate}</p>
                </div>
                <div className="bg-neutral-50 rounded-xl p-3">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">KM Saída</p>
                  <p className="text-sm font-bold text-neutral-900" data-testid="text-km-start">{activeSession.km_start?.toLocaleString("pt-BR") || "—"}</p>
                </div>
              </div>

              {isAlert && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-bold">ATENÇÃO: Condutor ultrapassou 2h de direção contínua!</p>
                </div>
              )}

              <div className="bg-neutral-50 rounded-xl p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <User className="w-4 h-4 text-neutral-400" />
                  <p className="text-xs text-neutral-500 font-bold uppercase">Conduzindo Agora</p>
                </div>
                <p className="text-lg font-black text-neutral-900" data-testid="text-active-driver">{activeShift?.driver_name || "—"}</p>
                {activeShift && <LiveTimer startedAt={activeShift.started_at} />}
                <p className="text-[10px] text-neutral-400">Início: {activeShift ? formatTime(activeShift.started_at) : "—"}</p>
              </div>

              {activeSession.partner_id && (
                <Button
                  className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white font-black text-base rounded-xl"
                  onClick={() => swapMutation.mutate(activeSession.id)}
                  disabled={swapMutation.isPending}
                  data-testid="button-swap-driver"
                >
                  <ArrowLeftRight className="w-5 h-5 mr-2" />
                  {swapMutation.isPending ? "TROCANDO..." : "PASSAR DIREÇÃO"}
                </Button>
              )}

              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs font-bold text-neutral-700">KM Final (para encerrar)</Label>
                <Input
                  type="number"
                  placeholder="Informe o KM atual"
                  value={kmEnd}
                  onChange={e => setKmEnd(e.target.value)}
                  className="h-11"
                  data-testid="input-km-end"
                />
                <Button
                  className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-black text-base rounded-xl"
                  onClick={() => endMutation.mutate({ sessionId: activeSession.id, kmEnd })}
                  disabled={endMutation.isPending}
                  data-testid="button-end-session"
                >
                  <Square className="w-5 h-5 mr-2" />
                  {endMutation.isPending ? "FINALIZANDO..." : "FINALIZAR OPERAÇÃO"}
                </Button>
              </div>

              {activeSession.shifts && activeSession.shifts.length > 1 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-bold text-neutral-500 uppercase mb-2">Histórico de Turnos</p>
                  <div className="space-y-1.5">
                    {activeSession.shifts.filter((s: any) => !s.is_active).map((s: any, i: number) => (
                      <div key={s.id || i} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs font-bold text-neutral-800">{s.driver_name}</p>
                          <p className="text-[10px] text-neutral-400">{formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : "—"}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="w-2.5 h-2.5 mr-1" />
                          {formatDuration(Number(s.duration_minutes) || 0)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <h2 className="text-sm font-black text-neutral-800 uppercase tracking-wider flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-600" />
              Iniciar Nova Condução
            </h2>

            <div>
              <Label className="text-xs font-bold text-neutral-600">VTR (Veículo) *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="h-11 mt-1" data-testid="select-vehicle">
                  <SelectValue placeholder="Selecione a viatura" />
                </SelectTrigger>
                <SelectContent>
                  {(vehicles || []).filter((v: any) => v.status !== "inativo").map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.frota ? `${v.frota} — ` : ""}{v.plate} ({v.model || v.brand || ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-neutral-600">Condutor Principal *</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="h-11 mt-1" data-testid="select-driver">
                  <SelectValue placeholder="Selecione o condutor" />
                </SelectTrigger>
                <SelectContent>
                  {activeDrivers.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name} {e.matricula ? `(${e.matricula})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-neutral-600">Condutor Parceiro</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger className="h-11 mt-1" data-testid="select-partner">
                  <SelectValue placeholder="Selecione o parceiro (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem parceiro</SelectItem>
                  {activeDrivers.filter((e: any) => String(e.id) !== driverId).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name} {e.matricula ? `(${e.matricula})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-neutral-600">KM de Saída</Label>
              <Input
                type="number"
                placeholder="KM atual do veículo"
                value={kmStart}
                onChange={e => setKmStart(e.target.value)}
                className="h-11 mt-1"
                data-testid="input-km-start"
              />
            </div>

            <Button
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-xl"
              onClick={() => startMutation.mutate({
                vehicleId: parseInt(vehicleId),
                driverId: parseInt(driverId),
                partnerId: partnerId && partnerId !== "none" ? parseInt(partnerId) : undefined,
                kmStart: kmStart || undefined,
              })}
              disabled={startMutation.isPending || !vehicleId || !driverId}
              data-testid="button-start-session"
            >
              <Play className="w-5 h-5 mr-2" />
              {startMutation.isPending ? "INICIANDO..." : "INICIAR CONDUÇÃO"}
            </Button>
          </div>
        )}

        <div className="bg-white rounded-2xl border p-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            <span className="text-sm font-bold text-neutral-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-400" />
              Histórico de Operações
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {(history || []).length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-4">Nenhum registro encontrado.</p>
              ) : (
                (history || []).slice(0, 20).map((s: any) => (
                  <div key={s.id} className="bg-neutral-50 rounded-xl p-3 space-y-1" data-testid={`card-history-${s.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-800">{s.vehicle_prefix || s.vehicle_plate}</span>
                      <span className="text-[10px] text-neutral-400">{formatTime(s.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                      <User className="w-3 h-3" />
                      <span>{s.driver_name}</span>
                      {s.partner_name && <><span>+</span><span>{s.partner_name}</span></>}
                    </div>
                    {s.km_start && s.km_end && (
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                        <Gauge className="w-3 h-3" />
                        <span>{s.km_start.toLocaleString("pt-BR")} → {s.km_end.toLocaleString("pt-BR")} ({(s.km_end - s.km_start).toLocaleString("pt-BR")} km)</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
