import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Check, ChevronRight, X,
  Shield, Car, Users, MapPin, Clock,
  AlertTriangle, CheckCircle2, Circle,
} from "lucide-react";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";

const MISSION_STEPS = [
  { key: "km_saida", label: "KM Saída", description: "Registre a quilometragem de saída e tire foto do odômetro", screenTitle: "Saída", screenSub: "REGISTRO DE KM" },
  { key: "checklist_saida", label: "Checklist Saída", description: "Tire as 4 fotos do veículo antes de sair", screenTitle: "Checklist", screenSub: "SAÍDA DO VEÍCULO" },
  { key: "em_transito_origem", label: "Em Trânsito", description: "Deslocamento até o cliente", screenTitle: "Em Trânsito", screenSub: "DESLOCAMENTO" },
  { key: "km_chegada_origem", label: "KM Chegada", description: "Registre a quilometragem de chegada ao cliente", screenTitle: "Chegada", screenSub: "NO CLIENTE" },
  { key: "fotos_cliente", label: "Fotos Cliente", description: "Tire as fotos no local do cliente", screenTitle: "Registro", screenSub: "NO CLIENTE" },
  { key: "em_transito_destino", label: "Retorno", description: "Deslocamento de retorno", screenTitle: "Em Trânsito", screenSub: "RETORNO" },
  { key: "km_chegada_destino", label: "KM Destino", description: "Registre a quilometragem de chegada ao destino", screenTitle: "Chegada", screenSub: "NO DESTINO" },
  { key: "checklist_retorno", label: "Checklist Retorno", description: "Tire as 4 fotos do veículo no retorno", screenTitle: "Checklist", screenSub: "RETORNO DO VEÍCULO" },
] as const;

const STEP_PHOTO_SLOTS: Record<string, { key: string; label: string }[]> = {
  km_saida: [{ key: "km_saida", label: "Hodômetro" }],
  checklist_saida: [
    { key: "checklist_saida_frente", label: "Dianteira" },
    { key: "checklist_saida_lateral_esq", label: "Lateral Esq." },
    { key: "checklist_saida_lateral_dir", label: "Lateral Dir." },
    { key: "checklist_saida_traseira", label: "Traseira" },
  ],
  km_chegada_origem: [{ key: "km_chegada_origem", label: "Hodômetro" }],
  fotos_cliente: [
    { key: "foto_viatura_cliente", label: "Viatura no Cliente" },
    { key: "foto_veiculo_cliente_frente", label: "Frente Veículo" },
    { key: "foto_veiculo_cliente_traseira", label: "Traseira Veículo" },
  ],
  km_chegada_destino: [{ key: "km_chegada_destino", label: "Hodômetro" }],
  checklist_retorno: [
    { key: "checklist_retorno_frente", label: "Dianteira" },
    { key: "checklist_retorno_lateral_esq", label: "Lateral Esq." },
    { key: "checklist_retorno_lateral_dir", label: "Lateral Dir." },
    { key: "checklist_retorno_traseira", label: "Traseira" },
  ],
};

const KM_STEPS = ["km_saida", "km_chegada_origem", "km_chegada_destino"];

type ActiveMission = {
  id: number;
  osNumber: string;
  clientName: string;
  vehiclePlate: string;
  vehicleModel: string;
  employee1Name: string;
  employee2Name: string;
  missionStatus: string;
  completedSteps: string[];
  scheduledDate?: string;
  description?: string;
};

function compressImage(file: File, maxDim = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ShieldWatermark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.06]">
      <img src={logoSrc} alt="" className="w-[500px] h-[500px] object-contain" draggable={false} />
    </div>
  );
}

function MissionTimer() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="font-mono text-2xl tracking-widest text-[#8B8B6E] font-bold" data-testid="mission-timer">
      {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );
}

function StepProgress({ steps, currentStatus }: {
  steps: typeof MISSION_STEPS;
  currentStatus: string;
}) {
  const allKeys = ["aguardando", ...steps.map(s => s.key), "finalizada"];
  const currentIdx = allKeys.indexOf(currentStatus);

  return (
    <div className="flex items-center justify-center gap-1.5 py-3" data-testid="mission-timeline">
      {steps.map((step, i) => {
        const stepIdx = i + 1;
        const isComplete = currentIdx > stepIdx;
        const isCurrent = currentIdx === stepIdx;

        return (
          <div key={step.key} className="flex items-center gap-1.5">
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                isComplete
                  ? "bg-[#4A5D3A]"
                  : isCurrent
                    ? "bg-[#C9A84C] animate-pulse shadow-[0_0_8px_rgba(201,168,76,0.5)]"
                    : "bg-[#8B8B6E]/30"
              }`}
              title={step.label}
              data-testid={`step-indicator-${step.key}`}
            />
            {i < steps.length - 1 && (
              <div className={`w-4 h-0.5 ${isComplete ? "bg-[#4A5D3A]" : "bg-[#8B8B6E]/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhotoButton({ slot, uploaded, onCapture, onFileSelect, uploading }: {
  slot: { key: string; label: string };
  uploaded: boolean;
  onCapture: () => void;
  onFileSelect: (file: File) => void;
  uploading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div data-testid={`photo-slot-${slot.key}`}>
      {uploaded ? (
        <button
          disabled
          className="w-full py-3 px-4 rounded-xl bg-[#4A5D3A]/20 border-2 border-[#4A5D3A] flex items-center justify-center gap-2 text-[#4A5D3A]"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-bold text-sm uppercase tracking-wide">{slot.label}</span>
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onCapture}
            disabled={uploading}
            className="flex-1 py-3 px-4 rounded-xl bg-white/80 border-2 border-[#2C2C2C] flex items-center justify-center gap-2 hover:bg-white transition-colors disabled:opacity-50 shadow-sm"
            data-testid={`button-capture-${slot.key}`}
          >
            <Camera className="w-5 h-5 text-[#2C2C2C]" />
            <span className="font-bold text-sm uppercase tracking-wide text-[#2C2C2C]">{slot.label}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="py-3 px-3 rounded-xl bg-white/80 border-2 border-[#2C2C2C] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-50 shadow-sm"
            data-testid={`button-upload-${slot.key}`}
          >
            <Camera className="w-5 h-5 text-[#2C2C2C]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileSelect(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}

function MissionDataCard({ mission }: { mission: ActiveMission }) {
  const formatName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[#4A5D3A] flex items-center justify-center mx-auto mb-1">
            <Users className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm font-bold text-[#2C2C2C]" data-testid="text-employee1-name">{formatName(mission.employee1Name)}</p>
        </div>

        <div className="text-[#8B8B6E] font-bold text-xl">X</div>

        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[#4A5D3A] flex items-center justify-center mx-auto mb-1">
            <Users className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm font-bold text-[#2C2C2C]" data-testid="text-employee2-name">{formatName(mission.employee2Name)}</p>
        </div>
      </div>

      <div className="text-center">
        <Car className="w-8 h-8 text-[#8B8B6E] mx-auto mb-1" />
        <p className="text-sm font-bold text-[#2C2C2C]" data-testid="text-vehicle-info">
          {mission.vehiclePlate} ({mission.vehicleModel})
        </p>
      </div>

      <div className="bg-[#C5C9B8]/40 rounded-xl border border-[#8B8B6E]/30 p-4 space-y-2">
        <div className="flex justify-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-[#C9A84C]" />
          <div className="w-2 h-2 rounded-full bg-[#C9A84C]" />
          <div className="w-2 h-2 rounded-full bg-[#C9A84C]" />
        </div>
        <p className="text-sm" data-testid="text-client-name">
          <span className="font-bold">CLIENTE:</span> {mission.clientName}
        </p>
        <p className="text-sm" data-testid="text-os-number">
          <span className="font-bold">OS:</span> {mission.osNumber}
        </p>
        {mission.scheduledDate && (
          <p className="text-sm">
            <span className="font-bold">AGENDAMENTO:</span>{" "}
            {new Date(mission.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {mission.description && (
          <p className="text-sm">
            <span className="font-bold">SERVIÇO:</span> {mission.description}
          </p>
        )}
      </div>
    </div>
  );
}

function MissionWorkflow({ mission }: { mission: ActiveMission }) {
  const { toast } = useToast();
  const [kmValue, setKmValue] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pendingCaptureSlot, setPendingCaptureSlot] = useState<string | null>(null);

  const currentStepDef = MISSION_STEPS.find(s => s.key === mission.missionStatus);
  const photoSlots = STEP_PHOTO_SLOTS[mission.missionStatus] || [];
  const needsKm = KM_STEPS.includes(mission.missionStatus);
  const isTransitStep = mission.missionStatus === "em_transito_origem" || mission.missionStatus === "em_transito_destino";

  const uploadMutation = useMutation({
    mutationFn: async (data: { serviceOrderId: number; step: string; photoData: string; kmValue?: number }) => {
      const res = await apiRequest("POST", "/api/mission/photo", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mission/advance", { serviceOrderId: mission.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      toast({ title: "Etapa avançada com sucesso" });
      setKmValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao avançar", description: err.message, variant: "destructive" });
    },
  });

  const handlePhotoUpload = useCallback(async (slotKey: string, file: File) => {
    setUploadingSlot(slotKey);
    try {
      const compressed = await compressImage(file);
      await uploadMutation.mutateAsync({
        serviceOrderId: mission.id,
        step: slotKey,
        photoData: compressed,
        kmValue: needsKm && kmValue ? Number(kmValue) : undefined,
      });
    } catch {
    } finally {
      setUploadingSlot(null);
    }
  }, [mission.id, needsKm, kmValue, uploadMutation]);

  const handleCapture = useCallback((slotKey: string) => {
    setPendingCaptureSlot(slotKey);
    if (cameraInputRef.current) cameraInputRef.current.click();
  }, []);

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && pendingCaptureSlot) handlePhotoUpload(pendingCaptureSlot, f);
    e.target.value = "";
    setPendingCaptureSlot(null);
  }, [pendingCaptureSlot, handlePhotoUpload]);

  const allPhotosUploaded = photoSlots.length > 0
    ? photoSlots.every(slot => mission.completedSteps.includes(slot.key))
    : true;
  const canAdvance = isTransitStep || (allPhotosUploaded && (!needsKm || (photoSlots.length > 0 && allPhotosUploaded)));

  if (mission.missionStatus === "finalizada") {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#B8BFA8] to-[#A0A88E] relative rounded-2xl overflow-hidden no-print-zone">
        <ShieldWatermark />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-[#4A5D3A] flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-black text-[#2C2C2C] uppercase tracking-wider mb-2" data-testid="text-mission-complete">
            Missão Finalizada
          </h2>
          <p className="text-[#4A5D3A] font-medium">Todas as etapas foram concluídas com sucesso.</p>
        </div>
      </div>
    );
  }

  if (mission.missionStatus === "aguardando") {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#B8BFA8] to-[#A0A88E] relative rounded-2xl overflow-hidden no-print-zone">
        <ShieldWatermark />
        <div className="relative z-10 p-5">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <img src={logoSrc} alt="" className="w-8 h-8 object-contain" />
              <Shield className="w-5 h-5 text-[#4A5D3A]" />
            </div>
            <h1 className="text-2xl font-black text-[#2C2C2C] uppercase tracking-wider leading-tight">
              Dados da Missão
            </h1>
            <p className="text-xs font-bold text-[#8B8B6E] uppercase tracking-[0.2em] mt-1">C.C.O</p>
          </div>

          <MissionDataCard mission={mission} />

          <div className="flex items-center justify-between mt-6 mb-4">
            <MissionTimer />
            <button
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="w-16 h-16 rounded-full bg-[#4CAF50] hover:bg-[#45a049] flex items-center justify-center shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
              data-testid="button-start-mission"
            >
              <CheckCircle2 className="w-9 h-9 text-white" />
            </button>
          </div>

          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="w-full py-4 rounded-full bg-[#C9A84C] hover:bg-[#B8963E] text-[#2C2C2C] font-black text-lg uppercase tracking-wider shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
            data-testid="button-advance-step"
          >
            {advanceMutation.isPending ? "INICIANDO..." : "START"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#B8BFA8] to-[#A0A88E] relative rounded-2xl overflow-hidden no-print-zone">
      <ShieldWatermark />
      <div className="relative z-10 p-5">
        <div className="text-center mb-4">
          <div className="inline-block bg-[#6B6B5A]/80 text-white px-6 py-2 rounded-lg shadow-md mb-1">
            <h2 className="text-xl font-black uppercase tracking-wider" data-testid="text-current-step-label">
              {currentStepDef?.screenTitle || currentStepDef?.label}
            </h2>
          </div>
          <p className="text-xs font-bold text-[#4A5D3A] uppercase tracking-[0.25em] mt-1" data-testid="text-current-step-description">
            {currentStepDef?.screenSub}
          </p>
        </div>

        <StepProgress steps={MISSION_STEPS} currentStatus={mission.missionStatus} />

        <div className="bg-[#C5C9B8]/30 rounded-xl p-3 mb-4 flex items-center justify-between text-xs">
          <span className="font-bold text-[#2C2C2C]">{mission.osNumber}</span>
          <span className="text-[#4A5D3A] font-medium">{mission.clientName}</span>
          <span className="text-[#8B8B6E]">{mission.vehiclePlate}</span>
        </div>

        {needsKm && (
          <div className="mb-5">
            <p className="text-sm font-bold text-[#2C2C2C] uppercase tracking-wider text-center mb-3">
              Digite KM de {mission.missionStatus === "km_saida" ? "Saída" : "Chegada"}
            </p>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Ex: 45230"
              value={kmValue}
              onChange={(e) => setKmValue(e.target.value)}
              className="text-center text-lg font-mono font-bold bg-white/80 border-2 border-[#2C2C2C] rounded-xl h-14"
              data-testid="input-km-value"
            />
          </div>
        )}

        {photoSlots.length > 0 && (
          <div className="space-y-3 mb-5">
            <div className="text-center mb-2">
              <Camera className="w-8 h-8 text-[#6B6B5A] mx-auto mb-1" />
            </div>
            {photoSlots.map(slot => (
              <PhotoButton
                key={slot.key}
                slot={slot}
                uploaded={mission.completedSteps.includes(slot.key)}
                onCapture={() => handleCapture(slot.key)}
                onFileSelect={(file) => handlePhotoUpload(slot.key, file)}
                uploading={uploadingSlot === slot.key}
              />
            ))}
          </div>
        )}

        {isTransitStep && (
          <div className="flex items-center gap-3 p-4 bg-[#C9A84C]/20 rounded-xl border border-[#C9A84C]/40 mb-5">
            <AlertTriangle className="w-8 h-8 text-[#C9A84C] shrink-0" />
            <p className="text-sm font-medium text-[#2C2C2C]">
              Você está em deslocamento. Confirme a chegada ao destino.
            </p>
          </div>
        )}

        <p className="text-xs text-center text-[#8B8B6E] mb-4 italic">
          Localização e horário serão enviados automaticamente após confirmações
        </p>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraChange}
        />

        <button
          onClick={() => advanceMutation.mutate()}
          disabled={!canAdvance || advanceMutation.isPending}
          className="w-full py-4 rounded-full bg-[#C9A84C] hover:bg-[#B8963E] text-[#2C2C2C] font-black text-base uppercase tracking-wider shadow-lg transition-all hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
          data-testid="button-advance-step"
        >
          {advanceMutation.isPending
            ? "PROCESSANDO..."
            : isTransitStep
              ? "CONFIRMAR CHEGADA"
              : `CONFIRMAR ${currentStepDef?.screenTitle?.toUpperCase() || "ETAPA"}`}
        </button>

        <div className="mt-4 flex items-center justify-center">
          <MissionTimer />
        </div>
      </div>
    </div>
  );
}

export default function MissionPage() {
  const { user } = useAuth();

  const { data: mission, isLoading } = useQuery<ActiveMission | null>({
    queryKey: ["/api/mission/active"],
    refetchInterval: 5000,
  });

  return (
    <AdminLayout>
      <div className="max-w-md mx-auto no-print-zone" data-testid="mission-page">
        {isLoading && (
          <div className="min-h-[80vh] bg-gradient-to-b from-[#B8BFA8] to-[#A0A88E] rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-[#4A5D3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#4A5D3A] font-medium">Carregando...</p>
            </div>
          </div>
        )}

        {!isLoading && !mission && (
          <div className="min-h-[80vh] bg-gradient-to-b from-[#B8BFA8] to-[#A0A88E] relative rounded-2xl overflow-hidden no-print-zone">
            <ShieldWatermark />
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
              <div className="inline-flex items-center gap-2 mb-4">
                <img src={logoSrc} alt="" className="w-10 h-10 object-contain" />
              </div>
              <h1 className="text-2xl font-black text-[#2C2C2C] uppercase tracking-wider mb-2">
                Área do Vigilante
              </h1>
              <p className="text-xs font-bold text-[#8B8B6E] uppercase tracking-[0.2em] mb-6">
                Escolta Armada
              </p>
              <div className="w-16 h-16 rounded-full bg-[#8B8B6E]/20 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-[#8B8B6E]" />
              </div>
              <h2 className="text-lg font-bold text-[#2C2C2C] mb-1" data-testid="text-no-mission">
                Nenhuma missão ativa
              </h2>
              <p className="text-sm text-[#4A5D3A]">
                Você não possui nenhuma ordem de serviço em andamento.
              </p>
            </div>
          </div>
        )}

        {!isLoading && mission && <MissionWorkflow mission={mission} />}
      </div>
    </AdminLayout>
  );
}
