import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play, CheckCircle2, Camera, Car, Crosshair, Gauge, Route, Lock,
  Truck, User, Siren, MapPin, Home, ClipboardCheck, Sparkles,
  Loader2, ArrowRight, RotateCcw, ChevronRight, AlertTriangle, Zap,
  FastForward,
} from "lucide-react";
import type { ServiceOrder, Employee, Vehicle } from "@shared/schema";

const MISSION_STEPS = [
  "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida",
  "em_transito_origem", "checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista",
  "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno",
  "finalizada", "retorno_base", "chegada_base", "encerrada",
] as const;

const STEP_REQUIRED_PHOTOS: Record<string, string[]> = {
  checkout_armamento: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"],
  checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
  checkout_km_saida: ["km_saida"],
  checkin_chegada_km: ["km_chegada", "agente_equipado"],
  checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
  chegada_destino: ["foto_local_destino", "km_final"],
  checkout_km_final: ["km_final"],
  checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
  chegada_base: ["base_viatura_frente", "base_viatura_lateral_esq", "base_viatura_lateral_dir", "base_viatura_traseira", "base_hodometro"],
};

const stepConfig: Record<string, { title: string; subtitle: string; icon: any; color: string; actions: string[] }> = {
  aguardando: { title: "Dados da Missao", subtitle: "Confirmar ciencia", icon: Lock, color: "bg-neutral-500", actions: ["advance"] },
  checkout_armamento: { title: "Armamento", subtitle: "3 fotos obrigatorias", icon: Crosshair, color: "bg-red-500", actions: ["upload_photos", "advance"] },
  checkout_viatura: { title: "Viatura", subtitle: "4 fotos + checklist", icon: Car, color: "bg-blue-500", actions: ["upload_photos", "advance"] },
  checkout_km_saida: { title: "KM de Saida", subtitle: "Foto hodometro + KM", icon: Gauge, color: "bg-amber-500", actions: ["upload_photos", "advance"] },
  em_transito_origem: { title: "Em Transito", subtitle: "Deslocamento ate origem", icon: Route, color: "bg-indigo-500", actions: ["advance"] },
  checkin_chegada_km: { title: "KM Chegada", subtitle: "Foto + KM na origem", icon: Gauge, color: "bg-amber-500", actions: ["upload_photos", "advance"] },
  checkin_veiculo_escoltado: { title: "Veiculo Escoltado", subtitle: "2 fotos do caminhao", icon: Truck, color: "bg-orange-500", actions: ["upload_photos", "advance"] },
  checkin_dados_motorista: { title: "Dados do Motorista", subtitle: "Nome + placa + telefone", icon: User, color: "bg-purple-500", actions: ["escort_data", "advance"] },
  iniciar_missao: { title: "Iniciar Missao", subtitle: "Confirmar inicio", icon: Siren, color: "bg-red-600", actions: ["start_mission", "advance"] },
  em_transito_destino: { title: "Em Transito Destino", subtitle: "Execucao da escolta", icon: Route, color: "bg-indigo-600", actions: ["advance"] },
  chegada_destino: { title: "Chegada no Destino", subtitle: "Foto local + KM", icon: MapPin, color: "bg-green-600", actions: ["upload_photos", "advance"] },
  checkout_km_final: { title: "KM Final", subtitle: "Foto hodometro final", icon: Gauge, color: "bg-amber-600", actions: ["upload_photos", "advance"] },
  checkout_viatura_retorno: { title: "Viatura Retorno", subtitle: "4 fotos retorno", icon: Car, color: "bg-blue-600", actions: ["upload_photos", "advance"] },
  finalizada: { title: "Entregas Finalizadas", subtitle: "Operacao concluida", icon: CheckCircle2, color: "bg-green-500", actions: ["advance"] },
  retorno_base: { title: "Retorno a Base", subtitle: "Deslocamento base", icon: Home, color: "bg-indigo-500", actions: ["advance"] },
  chegada_base: { title: "Chegada na Base", subtitle: "5 fotos + limpeza + KM", icon: ClipboardCheck, color: "bg-neutral-700", actions: ["upload_photos", "base_clean", "advance"] },
  encerrada: { title: "Encerrada", subtitle: "Missao concluida", icon: Sparkles, color: "bg-emerald-600", actions: [] },
};

const actionLabels: Record<string, { label: string; icon: any; color: string }> = {
  upload_photos: { label: "Enviar Fotos", icon: Camera, color: "bg-blue-600 hover:bg-blue-700" },
  escort_data: { label: "Preencher Dados", icon: User, color: "bg-purple-600 hover:bg-purple-700" },
  start_mission: { label: "Iniciar Missao", icon: Siren, color: "bg-red-600 hover:bg-red-700" },
  base_clean: { label: "Registrar Limpeza + KM", icon: ClipboardCheck, color: "bg-neutral-700 hover:bg-neutral-800" },
  advance: { label: "Avancar Etapa", icon: ArrowRight, color: "bg-green-600 hover:bg-green-700" },
};

export default function SimuladorMissaoPage() {
  const { toast } = useToast();
  const [selectedOS, setSelectedOS] = useState<number | null>(null);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "success" | "error" }[]>([]);
  const [running, setRunning] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  const { data: orders = [], isLoading } = useQuery<ServiceOrder[]>({
    queryKey: ["/api/service-orders"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });

  const activeOrders = orders.filter(o =>
    o.missionStatus && o.missionStatus !== "encerrada" &&
    (o.status === "em_andamento" || o.status === "agendada")
  );

  const selectedOrder = orders.find(o => o.id === selectedOS);
  const currentStep = (selectedOrder?.missionStatus as string) || "";
  const currentConfig = stepConfig[currentStep];
  const currentIdx = MISSION_STEPS.indexOf(currentStep as any);

  const addLog = (msg: string, type: "info" | "success" | "error" = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 100));
  };

  const refreshOS = async () => {
    const r = await authFetch(`/api/service-orders/${selectedOS}`);
    if (r.ok) {
      const data = await r.json();
      const idx = orders.findIndex(o => o.id === selectedOS);
      if (idx >= 0) orders[idx] = data;
    }
  };

  const executeAction = async (action: string) => {
    if (!selectedOS || running) return;
    setRunning(true);
    addLog(`Executando: ${actionLabels[action]?.label || action}...`, "info");

    try {
      const r = await authFetch("/api/mission/simulate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceOrderId: selectedOS, action }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      addLog(data.message, "success");
      toast({ title: data.message });

      const { queryClient } = await import("@/lib/queryClient");
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
    } catch (err: any) {
      addLog(`ERRO: ${err.message}`, "error");
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setRunning(false);
  };

  const runAllSteps = async () => {
    if (!selectedOS || autoRunning) return;
    setAutoRunning(true);
    addLog("=== EXECUCAO AUTOMATICA INICIADA ===", "info");

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      attempts++;
      const r = await authFetch(`/api/service-orders/${selectedOS}`);
      if (!r.ok) break;
      const so = await r.json();
      const step = so.missionStatus as string;

      if (step === "encerrada") {
        addLog("=== MISSAO ENCERRADA COM SUCESSO ===", "success");
        break;
      }

      const config = stepConfig[step];
      if (!config) break;

      for (const action of config.actions) {
        if (action === "advance") continue;
        addLog(`[${step}] ${actionLabels[action]?.label}...`, "info");
        try {
          const ar = await authFetch("/api/mission/simulate-step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceOrderId: selectedOS, action }),
          });
          const ad = await ar.json();
          if (!ar.ok) throw new Error(ad.message);
          addLog(`[${step}] ${ad.message}`, "success");
        } catch (err: any) {
          addLog(`[${step}] ERRO: ${err.message}`, "error");
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      addLog(`[${step}] Avancando...`, "info");
      try {
        const ar = await authFetch("/api/mission/simulate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceOrderId: selectedOS, action: "advance" }),
        });
        const ad = await ar.json();
        if (!ar.ok) throw new Error(ad.message);
        addLog(`[${step}] ${ad.message}`, "success");
      } catch (err: any) {
        addLog(`[${step}] ERRO ao avancar: ${err.message}`, "error");
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const { queryClient } = await import("@/lib/queryClient");
    queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
    setAutoRunning(false);
  };

  const emp1 = selectedOrder?.assignedEmployeeId ? employees.find(e => e.id === selectedOrder.assignedEmployeeId) : null;
  const veh = selectedOrder?.vehicleId ? vehicles.find(v => v.id === selectedOrder.vehicleId) : null;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="title-simulador">Simulador de Missao</h1>
          <p className="text-sm text-neutral-500">Teste todas as etapas da missao mobile — ideal para treinamento</p>
        </div>
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 font-bold">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> MODO SIMULACAO
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 border-neutral-200">
            <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-3">Selecionar OS Ativa</h2>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-6">Nenhuma OS ativa com missao</p>
            ) : (
              <div className="space-y-2">
                {activeOrders.map(o => {
                  const step = o.missionStatus as string;
                  const cfg = stepConfig[step];
                  const stepIdx = MISSION_STEPS.indexOf(step as any);
                  const pct = Math.round((stepIdx / (MISSION_STEPS.length - 1)) * 100);
                  return (
                    <button
                      key={o.id}
                      onClick={() => { setSelectedOS(o.id); setLogs([]); }}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${selectedOS === o.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}
                      data-testid={`button-select-os-${o.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black text-neutral-900">{o.osNumber}</span>
                        <span className="text-[10px] font-bold text-neutral-400">{pct}%</span>
                      </div>
                      <div className="w-full bg-neutral-200 rounded-full h-1.5 mb-2">
                        <div className={`h-1.5 rounded-full ${cfg?.color || "bg-neutral-400"} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {cfg && <cfg.icon className="w-3 h-3 text-neutral-500" />}
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{cfg?.title || step}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {selectedOrder && (
            <Card className="p-4 border-neutral-200">
              <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-3">Dados da OS</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-neutral-400">OS:</span><span className="font-bold text-neutral-800">{selectedOrder.osNumber}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Status:</span><span className="font-bold text-neutral-800">{selectedOrder.status}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Agente 1:</span><span className="font-bold text-neutral-800">{emp1?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Viatura:</span><span className="font-bold text-neutral-800">{veh?.plate || "—"}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">KM Atual:</span><span className="font-bold text-neutral-800">{veh?.km || "—"}</span></div>
                {(selectedOrder as any).origin && <div className="flex justify-between"><span className="text-neutral-400">Origem:</span><span className="font-bold text-neutral-800 text-right max-w-[60%] truncate">{(selectedOrder as any).origin}</span></div>}
                {(selectedOrder as any).destination && <div className="flex justify-between"><span className="text-neutral-400">Destino:</span><span className="font-bold text-neutral-800 text-right max-w-[60%] truncate">{(selectedOrder as any).destination}</span></div>}
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedOrder && currentConfig ? (
            <>
              <Card className="border-neutral-200 overflow-hidden">
                <div className={`${currentConfig.color} px-5 py-4 flex items-center gap-3`}>
                  <currentConfig.icon className="w-6 h-6 text-white" />
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">{currentConfig.title}</h2>
                    <p className="text-xs text-white/70">{currentConfig.subtitle}</p>
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs font-black text-white/60 bg-white/20 px-3 py-1 rounded-full">
                      {currentIdx + 1}/{MISSION_STEPS.length}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {MISSION_STEPS.map((s, idx) => {
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      const cfg = stepConfig[s];
                      return (
                        <div
                          key={s}
                          className={`h-2 flex-1 min-w-[12px] rounded-full transition-all ${isCompleted ? "bg-green-500" : isCurrent ? cfg?.color || "bg-neutral-400" : "bg-neutral-200"}`}
                          title={cfg?.title || s}
                        />
                      );
                    })}
                  </div>

                  {STEP_REQUIRED_PHOTOS[currentStep] && (
                    <div className="mb-4 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-2">Fotos Obrigatorias</p>
                      <div className="flex flex-wrap gap-1.5">
                        {STEP_REQUIRED_PHOTOS[currentStep].map(p => (
                          <span key={p} className="text-[10px] bg-white border border-neutral-200 px-2 py-1 rounded font-medium text-neutral-600">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentStep === "checkin_dados_motorista" && (
                    <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-3">
                      <p className="text-[10px] font-black text-purple-400 uppercase tracking-wider mb-1">Dados do Motorista</p>
                      <p className="text-xs text-purple-700">
                        {(selectedOrder as any).escortedDriverName
                          ? `${(selectedOrder as any).escortedDriverName} — ${(selectedOrder as any).escortedVehiclePlate}`
                          : "Sera preenchido automaticamente na simulacao"}
                      </p>
                    </div>
                  )}

                  {currentStep === "chegada_base" && (
                    <div className="mb-4 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Registros da Base</p>
                      <p className="text-xs text-neutral-600">
                        Limpeza: {(selectedOrder as any).baseCleanStatus || "Pendente"} |
                        KM Retorno: {(selectedOrder as any).baseReturnKm || "Pendente"} |
                        Checklist: {(selectedOrder as any).baseChecklistConfirmed ? "OK" : "Pendente"}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {currentConfig.actions.map(action => {
                      const acfg = actionLabels[action];
                      return (
                        <Button
                          key={action}
                          onClick={() => executeAction(action)}
                          disabled={running || autoRunning}
                          className={`w-full h-12 text-white font-bold uppercase tracking-wider ${acfg.color}`}
                          data-testid={`button-sim-${action}`}
                        >
                          {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <acfg.icon className="w-4 h-4 mr-2" />}
                          {acfg.label}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-200">
                    <Button
                      onClick={runAllSteps}
                      disabled={running || autoRunning || currentStep === "encerrada"}
                      className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black uppercase tracking-widest text-sm"
                      data-testid="button-auto-run"
                    >
                      {autoRunning ? (
                        <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Executando Todas as Etapas...</>
                      ) : (
                        <><FastForward className="w-5 h-5 mr-2" /> Executar Tudo Automaticamente</>
                      )}
                    </Button>
                    <p className="text-[10px] text-neutral-400 text-center mt-1.5">Executa todas as etapas restantes sem parar</p>
                  </div>
                </div>
              </Card>

              <Card className="border-neutral-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider">Log de Execucao</h2>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLogs([])} data-testid="button-clear-logs">
                    <RotateCcw className="w-3 h-3 mr-1" /> Limpar
                  </Button>
                </div>
                <div className="bg-neutral-950 rounded-xl p-4 max-h-72 overflow-y-auto font-mono text-xs space-y-1" data-testid="log-container">
                  {logs.length === 0 ? (
                    <p className="text-neutral-600">Aguardando acoes...</p>
                  ) : (
                    logs.map((l, i) => (
                      <div key={i} className={`${l.type === "success" ? "text-green-400" : l.type === "error" ? "text-red-400" : "text-neutral-400"}`}>
                        <span className="text-neutral-600">[{l.time}]</span> {l.msg}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="border-neutral-200 p-4">
                <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-3">Fluxo Completo da Missao</h2>
                <div className="space-y-1">
                  {MISSION_STEPS.map((s, idx) => {
                    const isCompleted = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const cfg = stepConfig[s];
                    const photos = STEP_REQUIRED_PHOTOS[s];
                    return (
                      <div key={s} className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? "bg-neutral-100 border border-neutral-300" : ""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0 ${isCompleted ? "bg-green-500" : isCurrent ? cfg?.color || "bg-neutral-400" : "bg-neutral-200"}`}>
                          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${isCurrent ? "text-neutral-900" : isCompleted ? "text-green-700" : "text-neutral-400"}`}>{cfg?.title || s}</p>
                          {photos && isCurrent && (
                            <p className="text-[10px] text-neutral-400">{photos.length} foto(s) obrigatoria(s)</p>
                          )}
                        </div>
                        {isCurrent && <ChevronRight className="w-4 h-4 text-neutral-400 animate-pulse" />}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          ) : (
            <Card className="border-neutral-200 p-12 text-center">
              <Play className="w-16 h-16 text-neutral-200 mx-auto mb-4" />
              <h2 className="text-lg font-black text-neutral-400 uppercase tracking-wider mb-2">Simulador de Missao</h2>
              <p className="text-sm text-neutral-400 max-w-md mx-auto">
                Selecione uma Ordem de Servico ativa ao lado para iniciar a simulacao. Cada etapa pode ser executada individualmente ou automaticamente.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <Camera className="w-5 h-5 text-blue-500 mb-1" />
                  <p className="text-[10px] font-bold text-neutral-600 uppercase">Fotos Simuladas</p>
                  <p className="text-[10px] text-neutral-400">Gera automaticamente</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <Gauge className="w-5 h-5 text-amber-500 mb-1" />
                  <p className="text-[10px] font-bold text-neutral-600 uppercase">KM Automatico</p>
                  <p className="text-[10px] text-neutral-400">Incrementa valores</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <MapPin className="w-5 h-5 text-green-500 mb-1" />
                  <p className="text-[10px] font-bold text-neutral-600 uppercase">GPS Simulado</p>
                  <p className="text-[10px] text-neutral-400">Coordenadas da sede</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <Zap className="w-5 h-5 text-orange-500 mb-1" />
                  <p className="text-[10px] font-bold text-neutral-600 uppercase">Auto-execucao</p>
                  <p className="text-[10px] text-neutral-400">Todas as etapas</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
