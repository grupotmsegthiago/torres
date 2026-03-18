import MobileLayout from "@/components/mobile/layout";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const STEPS = [
  { key: "aguardando", label: "Dados da Missão" },
  { key: "checkout_armamento", label: "Conferência de Armamento" },
  { key: "checkout_viatura", label: "Check-out da Viatura" },
  { key: "checkout_km", label: "KM de Saída" },
  { key: "em_transito_ida", label: "Em Trânsito (Origem)" },
  { key: "checkin_km", label: "KM Chegada" },
  { key: "checkin_veiculo_escoltado", label: "Veículo Escoltado" },
  { key: "checkin_motorista", label: "Dados do Motorista" },
  { key: "iniciar_missao", label: "Iniciar Missão" },
  { key: "em_transito_destino", label: "Em Trânsito (Destino)" },
  { key: "km_final", label: "KM Final" },
  { key: "viatura_retorno", label: "Viatura Retorno" },
  { key: "finalizada", label: "Missão Finalizada" },
];

export default function MobileChecklistPage() {
  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active"],
  });

  const currentStep = mission?.missionStatus || "aguardando";
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-checklist-page">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider mb-1">Checklist da Missão</h2>
          <p className="text-xs text-neutral-400">Acompanhe o progresso de cada etapa</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
          </div>
        ) : !mission ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
            <p className="text-sm text-neutral-400">Nenhuma missão ativa</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            {STEPS.map((step, idx) => {
              const isDone = idx < currentIdx || currentStep === "finalizada";
              const isCurrent = idx === currentIdx && currentStep !== "finalizada";
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-b-0 ${isCurrent ? "bg-neutral-50" : ""}`}
                  data-testid={`checklist-step-${step.key}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isDone ? "bg-neutral-900" : isCurrent ? "bg-neutral-200" : "bg-neutral-100"}`}>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : (
                      <span className={`text-[10px] font-bold ${isCurrent ? "text-neutral-600" : "text-neutral-400"}`}>{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-xs font-bold uppercase tracking-wider ${isDone ? "text-neutral-900" : isCurrent ? "text-neutral-700" : "text-neutral-400"}`}>
                      {step.label}
                    </p>
                    {isCurrent && <p className="text-[10px] text-neutral-400">Etapa atual</p>}
                  </div>
                  {isDone && <CheckCircle2 className="w-4 h-4 text-neutral-300" />}
                  {isCurrent && <Circle className="w-4 h-4 text-neutral-400 animate-pulse" />}
                </div>
              );
            })}
          </div>
        )}

        {mission && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Resumo</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-neutral-50 rounded-lg p-2 text-center">
                <p className="text-lg font-black text-neutral-900">{Math.max(0, currentIdx)}</p>
                <p className="text-[10px] text-neutral-400 uppercase">Concluídas</p>
              </div>
              <div className="bg-neutral-50 rounded-lg p-2 text-center">
                <p className="text-lg font-black text-neutral-900">{Math.max(0, STEPS.length - currentIdx - 1)}</p>
                <p className="text-[10px] text-neutral-400 uppercase">Pendentes</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
