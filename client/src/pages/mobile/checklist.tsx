import MobileLayout from "@/components/mobile/layout";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";

const STEPS = [
  { key: "aguardando", label: "Dados da Missão" },
  { key: "checkout_armamento", label: "Conferência de Armamento" },
  { key: "checkout_viatura", label: "Check-out da Viatura" },
  { key: "checkout_km_saida", label: "KM de Saída" },
  { key: "em_transito_origem", label: "Em Trânsito (Origem)" },
  { key: "checkin_chegada_km", label: "KM Chegada" },
  { key: "checkin_veiculo_escoltado", label: "Veículo Escoltado" },
  { key: "checkin_dados_motorista", label: "Dados do Motorista" },
  { key: "iniciar_missao", label: "Iniciar Missão" },
  { key: "em_transito_destino", label: "Em Trânsito (Destino)" },
  { key: "checkout_km_final", label: "KM Final" },
  { key: "checkout_viatura_retorno", label: "Viatura Retorno" },
  { key: "finalizada", label: "Missão Finalizada" },
];

const STEP_TO_PHOTO_STEPS: Record<string, string[]> = {
  checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
  checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
  checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
};

export default function MobileChecklistPage() {
  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active"],
  });

  const osId = mission?.serviceOrderId;
  const { data: inspections } = useQuery<any[]>({
    queryKey: ["/api/mission", osId, "photo-inspections"],
    enabled: !!osId,
    refetchInterval: 15000,
  });

  const currentStep = mission?.missionStatus || "aguardando";
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  const getStepInspection = (stepKey: string) => {
    if (!inspections?.length) return null;
    const photoSteps = STEP_TO_PHOTO_STEPS[stepKey];
    if (!photoSteps) return null;
    const relevant = inspections.filter(i => photoSteps.includes(i.step));
    if (!relevant.length) return null;
    const hasDivergent = relevant.some(i => i.ai_inspection_status === "divergente");
    const allApproved = relevant.every(i => i.ai_inspection_status === "aprovado");
    const analyzing = relevant.some(i => i.ai_inspection_status === "analisando");
    if (hasDivergent) return "divergente";
    if (analyzing) return "analisando";
    if (allApproved) return "aprovado";
    return null;
  };

  const inspectionCounts = inspections?.length
    ? {
        total: inspections.length,
        approved: inspections.filter(i => i.ai_inspection_status === "aprovado").length,
        divergent: inspections.filter(i => i.ai_inspection_status === "divergente").length,
        analyzing: inspections.filter(i => i.ai_inspection_status === "analisando").length,
      }
    : null;

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-checklist-page">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider mb-1">Checklist da Missão</h2>
          <p className="text-xs text-neutral-400">Acompanhe o progresso — validação IA ativa</p>
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
              const inspection = getStepInspection(step.key);
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
                    {inspection === "aprovado" && (
                      <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3 h-3" /> IA: Aprovado
                      </p>
                    )}
                    {inspection === "divergente" && (
                      <p className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5">
                        <ShieldAlert className="w-3 h-3" /> IA: Divergência detectada
                      </p>
                    )}
                    {inspection === "analisando" && (
                      <p className="text-[10px] text-amber-600 font-semibold flex items-center gap-1 mt-0.5">
                        <Sparkles className="w-3 h-3 animate-pulse" /> IA: Analisando...
                      </p>
                    )}
                  </div>
                  {isDone && !inspection && <CheckCircle2 className="w-4 h-4 text-neutral-300" />}
                  {isDone && inspection === "aprovado" && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                  {isDone && inspection === "divergente" && <ShieldAlert className="w-4 h-4 text-red-500" />}
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

        {inspectionCounts && inspectionCounts.total > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-neutral-700" />
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Inspeção IA</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-emerald-50 rounded-lg p-2 text-center">
                <p className="text-lg font-black text-emerald-700">{inspectionCounts.approved}</p>
                <p className="text-[10px] text-emerald-600 uppercase">Aprovadas</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${inspectionCounts.divergent > 0 ? "bg-red-50" : "bg-neutral-50"}`}>
                <p className={`text-lg font-black ${inspectionCounts.divergent > 0 ? "text-red-700" : "text-neutral-400"}`}>{inspectionCounts.divergent}</p>
                <p className={`text-[10px] uppercase ${inspectionCounts.divergent > 0 ? "text-red-600" : "text-neutral-400"}`}>Divergentes</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${inspectionCounts.analyzing > 0 ? "bg-amber-50" : "bg-neutral-50"}`}>
                <p className={`text-lg font-black ${inspectionCounts.analyzing > 0 ? "text-amber-700" : "text-neutral-400"}`}>{inspectionCounts.analyzing}</p>
                <p className={`text-[10px] uppercase ${inspectionCounts.analyzing > 0 ? "text-amber-600" : "text-neutral-400"}`}>Analisando</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
