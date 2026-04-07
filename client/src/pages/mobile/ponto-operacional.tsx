import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Clock, Play, Square, Timer, AlertCircle } from "lucide-react";

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatDateBR(iso: string) {
  return new Date(_ensureUTC(iso)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MobilePontoOperacionalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [elapsed, setElapsed] = useState(0);
  const [obs, setObs] = useState("");

  const { data: pontoAberto, isLoading } = useQuery<any>({
    queryKey: ["/api/ponto-operacional/aberto"],
    refetchInterval: 30000,
  });

  const { data: historico } = useQuery<any[]>({
    queryKey: ["/api/ponto-operacional/historico", user?.employeeId],
    enabled: !!user?.employeeId,
  });

  useEffect(() => {
    if (!pontoAberto?.entrada) { setElapsed(0); return; }
    const tick = () => setElapsed(Date.now() - new Date(_ensureUTC(pontoAberto.entrada)).getTime());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pontoAberto?.entrada]);

  const entradaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ponto-operacional/entrada", { observacao: obs || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ponto-operacional/aberto"] }); setObs(""); toast({ title: "Ponto registrado", description: "Entrada registrada com sucesso." }); },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const saidaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ponto-operacional/saida", { observacao: obs || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ponto-operacional/aberto"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ponto-operacional/historico"] });
      setObs("");
      toast({ title: "Ponto finalizado", description: "Saída registrada com sucesso." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const recentHistory = (historico || []).filter((p: any) => p.status === "fechado").slice(0, 10);
  const totalMes = recentHistory.reduce((acc: number, p: any) => acc + (Number(p.horas_decimal) || 0), 0);

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-ponto-operacional">
        <div className="bg-neutral-900 rounded-2xl p-5 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Timer className="w-5 h-5 text-neutral-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Ponto Operacional</p>
          </div>
          <p className="text-[10px] text-neutral-500">Jornada de longa duração</p>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center">
            <p className="text-sm text-neutral-400">Carregando...</p>
          </div>
        ) : pontoAberto ? (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden" data-testid="card-ponto-aberto">
            <div className="bg-emerald-50 border-b border-emerald-100 p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Em Serviço</span>
              </div>
              <p className="text-4xl font-black text-neutral-900 tabular-nums" data-testid="text-cronometro">
                {formatDuration(elapsed)}
              </p>
              <p className="text-[10px] text-neutral-400 mt-2">
                Entrada: {formatDateBR(pontoAberto.entrada)}
              </p>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder="Observação de saída (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                data-testid="input-obs-saida"
              />
              <button
                onClick={() => saidaMutation.mutate()}
                disabled={saidaMutation.isPending}
                className="w-full h-14 bg-red-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 active:bg-red-700 disabled:opacity-50"
                data-testid="button-finalizar-ponto"
              >
                <Square className="w-5 h-5" />
                {saidaMutation.isPending ? "Finalizando..." : "Finalizar Ponto"}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden" data-testid="card-ponto-fechado">
            <div className="bg-neutral-50 border-b border-neutral-100 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-8 h-8 text-neutral-300" />
              </div>
              <p className="text-sm font-bold text-neutral-700">Nenhum ponto em aberto</p>
              <p className="text-xs text-neutral-400 mt-1">Registre sua entrada para iniciar a jornada</p>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder="Observação (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                data-testid="input-obs-entrada"
              />
              <button
                onClick={() => entradaMutation.mutate()}
                disabled={entradaMutation.isPending}
                className="w-full h-14 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 active:bg-emerald-700 disabled:opacity-50"
                data-testid="button-iniciar-ponto"
              >
                <Play className="w-5 h-5" />
                {entradaMutation.isPending ? "Registrando..." : "Iniciar Ponto"}
              </button>
            </div>
          </div>
        )}

        {totalMes > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-resumo-mes">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Acumulado do Mês</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-neutral-900">{totalMes.toFixed(1)}h</p>
              <p className="text-xs text-neutral-400">de 220h</p>
            </div>
            <div className="w-full h-2 bg-neutral-100 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${totalMes >= 220 ? "bg-red-500" : totalMes >= 190 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, (totalMes / 220) * 100)}%` }}
              />
            </div>
            {totalMes >= 220 && (
              <div className="flex items-center gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <p className="text-xs text-red-600 font-medium">{(totalMes - 220).toFixed(1)}h extras acumuladas</p>
              </div>
            )}
          </div>
        )}

        {recentHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden" data-testid="card-historico">
            <div className="px-4 py-3 border-b border-neutral-100">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Últimas Jornadas</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {recentHistory.map((p: any) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-neutral-700">{formatDateBR(p.entrada)}</p>
                    <p className="text-[10px] text-neutral-400">até {formatDateBR(p.saida)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-neutral-900">{Number(p.horas_decimal).toFixed(1)}h</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
