import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Loader2, ArrowRight, RotateCcw,
  AlertTriangle, FastForward, Smartphone, RefreshCw,
} from "lucide-react";
import type { ServiceOrder, Employee, Vehicle } from "@shared/schema";

const MISSION_STEPS = [
  "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida",
  "em_transito_origem", "checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista",
  "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno",
  "finalizada", "retorno_base", "chegada_base", "encerrada",
] as const;

const STEP_LABELS: Record<string, string> = {
  aguardando: "Dados da Missão",
  checkout_armamento: "Armamento",
  checkout_viatura: "Viatura",
  checkout_km_saida: "KM de Saída",
  em_transito_origem: "Em Trânsito Origem",
  checkin_chegada_km: "KM Chegada",
  checkin_veiculo_escoltado: "Veículo Escoltado",
  checkin_dados_motorista: "Dados Motorista",
  iniciar_missao: "Iniciar Missão",
  em_transito_destino: "Em Trânsito Destino",
  chegada_destino: "Chegada Destino",
  checkout_km_final: "KM Final",
  checkout_viatura_retorno: "Viatura Retorno",
  finalizada: "Entregas Finalizadas",
  retorno_base: "Retorno Base",
  chegada_base: "Chegada Base",
  encerrada: "Encerrada",
};

const STEP_ACTIONS: Record<string, string[]> = {
  aguardando: ["advance"],
  checkout_armamento: ["upload_photos", "advance"],
  checkout_viatura: ["upload_photos", "advance"],
  checkout_km_saida: ["upload_photos", "advance"],
  em_transito_origem: ["advance"],
  checkin_chegada_km: ["upload_photos", "advance"],
  checkin_veiculo_escoltado: ["upload_photos", "advance"],
  checkin_dados_motorista: ["escort_data", "advance"],
  iniciar_missao: ["start_mission", "advance"],
  em_transito_destino: ["advance"],
  chegada_destino: ["upload_photos", "advance"],
  checkout_km_final: ["upload_photos", "advance"],
  checkout_viatura_retorno: ["upload_photos", "advance"],
  finalizada: ["advance"],
  retorno_base: ["advance"],
  chegada_base: ["upload_photos", "base_clean", "advance"],
  encerrada: [],
};

export default function SimuladorMissaoPage() {
  const { toast } = useToast();
  const [selectedOS, setSelectedOS] = useState<number | null>(null);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "success" | "error" }[]>([]);
  const [running, setRunning] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
  const currentIdx = MISSION_STEPS.indexOf(currentStep as any);
  const pct = currentIdx >= 0 ? Math.round((currentIdx / (MISSION_STEPS.length - 1)) * 100) : 0;

  const emp1 = selectedOrder?.assignedEmployeeId ? employees.find(e => e.id === selectedOrder.assignedEmployeeId) : null;
  const veh = selectedOrder?.vehicleId ? vehicles.find(v => v.id === selectedOrder.vehicleId) : null;

  const addLog = (msg: string, type: "info" | "success" | "error" = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 100));
  };

  const refreshIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const executeSimAction = async (action: string) => {
    if (!selectedOS || running) return;
    setRunning(true);
    addLog(`Executando: ${action}...`, "info");
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
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders", selectedOS, "updates-history"] });
      setTimeout(refreshIframe, 500);
    } catch (err: any) {
      addLog(`ERRO: ${err.message}`, "error");
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setRunning(false);
  };

  const runAllSteps = async () => {
    if (!selectedOS || autoRunning) return;
    setAutoRunning(true);
    addLog("=== EXECUÇÃO AUTOMÁTICA INICIADA ===", "info");
    let attempts = 0;
    while (attempts < 100) {
      attempts++;
      const r = await authFetch(`/api/service-orders/${selectedOS}`);
      if (!r.ok) break;
      const so = await r.json();
      const step = so.missionStatus as string;
      if (step === "encerrada") {
        addLog("=== MISSÃO ENCERRADA COM SUCESSO ===", "success");
        break;
      }
      const actions = STEP_ACTIONS[step] || [];
      for (const action of actions) {
        if (action === "advance") continue;
        addLog(`[${STEP_LABELS[step] || step}] ${action}...`, "info");
        try {
          const ar = await authFetch("/api/mission/simulate-step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceOrderId: selectedOS, action }),
          });
          const ad = await ar.json();
          if (!ar.ok) throw new Error(ad.message);
          addLog(`[${STEP_LABELS[step] || step}] ${ad.message}`, "success");
        } catch (err: any) {
          addLog(`[${STEP_LABELS[step] || step}] ERRO: ${err.message}`, "error");
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      addLog(`[${STEP_LABELS[step] || step}] Avançando...`, "info");
      try {
        const ar = await authFetch("/api/mission/simulate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceOrderId: selectedOS, action: "advance" }),
        });
        const ad = await ar.json();
        if (!ar.ok) throw new Error(ad.message);
        addLog(`[${STEP_LABELS[step] || step}] ${ad.message}`, "success");
      } catch (err: any) {
        addLog(`[${STEP_LABELS[step] || step}] ERRO: ${err.message}`, "error");
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/service-orders", selectedOS, "updates-history"] });
    setAutoRunning(false);
    setTimeout(refreshIframe, 500);
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="title-simulador">Simulador de Missão</h1>
          <p className="text-sm text-neutral-500">Espelho da tela real do agente — ideal para treinamento</p>
        </div>
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 font-bold">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> MODO SIMULAÇÃO
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-4 border-neutral-200">
            <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-3">Selecionar OS Ativa</h2>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-6">Nenhuma OS ativa com missão</p>
            ) : (
              <div className="space-y-2">
                {activeOrders.map(o => {
                  const step = o.missionStatus as string;
                  const stepIdx = MISSION_STEPS.indexOf(step as any);
                  const p = Math.round((stepIdx / (MISSION_STEPS.length - 1)) * 100);
                  return (
                    <button
                      key={o.id}
                      onClick={() => { setSelectedOS(o.id); setLogs([]); }}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${selectedOS === o.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}
                      data-testid={`button-select-os-${o.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black text-neutral-900">{o.osNumber}</span>
                        <span className="text-[10px] font-bold text-neutral-400">{p}%</span>
                      </div>
                      <div className="w-full bg-neutral-200 rounded-full h-1.5 mb-2">
                        <div className="h-1.5 rounded-full bg-neutral-700 transition-all" style={{ width: `${p}%` }} />
                      </div>
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{STEP_LABELS[step] || step}</p>
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
                <div className="flex justify-between"><span className="text-neutral-400">Etapa:</span><span className="font-bold text-neutral-800">{STEP_LABELS[currentStep] || currentStep}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Progresso:</span><span className="font-bold text-neutral-800">{pct}%</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Agente:</span><span className="font-bold text-neutral-800">{emp1?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Viatura:</span><span className="font-bold text-neutral-800">{veh?.plate || "—"}</span></div>
                {(selectedOrder as any).origin && <div className="flex justify-between"><span className="text-neutral-400">Origem:</span><span className="font-bold text-neutral-800 text-right max-w-[60%] truncate">{(selectedOrder as any).origin}</span></div>}
                {(selectedOrder as any).destination && <div className="flex justify-between"><span className="text-neutral-400">Destino:</span><span className="font-bold text-neutral-800 text-right max-w-[60%] truncate">{(selectedOrder as any).destination}</span></div>}
              </div>
            </Card>
          )}

          {selectedOrder && (
            <Card className="p-4 border-neutral-200 space-y-3">
              <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider">Controles do Simulador</h2>
              <Button
                onClick={() => executeSimAction("advance")}
                disabled={running || autoRunning || currentStep === "encerrada"}
                className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold uppercase tracking-wider text-xs"
                data-testid="button-sim-advance"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                Avançar Etapa
              </Button>
              <Button
                onClick={runAllSteps}
                disabled={running || autoRunning || currentStep === "encerrada"}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black uppercase tracking-widest text-xs"
                data-testid="button-auto-run"
              >
                {autoRunning ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Executando...</>
                ) : (
                  <><FastForward className="w-4 h-4 mr-2" /> Executar Tudo</>
                )}
              </Button>
              <p className="text-[10px] text-neutral-400 text-center">Executa todas as etapas restantes automaticamente</p>
            </Card>
          )}

          {logs.length > 0 && (
            <Card className="border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-neutral-500 uppercase tracking-wider">Log</h2>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLogs([])} data-testid="button-clear-logs">
                  <RotateCcw className="w-3 h-3 mr-1" /> Limpar
                </Button>
              </div>
              <div className="bg-neutral-950 rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-[10px] space-y-0.5" data-testid="log-container">
                {logs.map((l, i) => (
                  <div key={i} className={`${l.type === "success" ? "text-green-400" : l.type === "error" ? "text-red-400" : "text-neutral-400"}`}>
                    <span className="text-neutral-600">[{l.time}]</span> {l.msg}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-8 flex justify-center">
          {selectedOrder ? (
            <div className="w-full max-w-[420px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-neutral-500" />
                  <span className="text-xs font-black text-neutral-500 uppercase tracking-wider">Tela do Agente (Espelho)</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={refreshIframe} data-testid="button-refresh-iframe">
                  <RefreshCw className="w-3 h-3 mr-1" /> Atualizar
                </Button>
              </div>
              <div className="relative bg-neutral-900 rounded-[2.5rem] p-3 shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-neutral-900 rounded-b-2xl z-10" />
                <div className="bg-white rounded-[2rem] overflow-hidden" style={{ height: "75vh", minHeight: "600px" }}>
                  <iframe
                    key={selectedOS}
                    ref={iframeRef}
                    src={`/mobile/missao?osId=${selectedOS}&readOnly=true`}
                    className="w-full h-full border-0"
                    title="Tela do Agente"
                    data-testid="iframe-mobile-mission"
                  />
                </div>
              </div>
            </div>
          ) : (
            <Card className="border-neutral-200 p-12 text-center w-full max-w-lg">
              <Smartphone className="w-16 h-16 text-neutral-200 mx-auto mb-4" />
              <h2 className="text-lg font-black text-neutral-400 uppercase tracking-wider mb-2">Simulador de Missão</h2>
              <p className="text-sm text-neutral-400 max-w-md mx-auto">
                Selecione uma Ordem de Serviço ativa ao lado para ver a tela real do agente.
                O simulador mostra exatamente o que o funcionário vê no celular, incluindo pedágio, atualizações e histórico.
              </p>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
