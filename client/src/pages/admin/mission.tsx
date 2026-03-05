import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera, Upload, Check, Clock, ChevronRight,
  AlertCircle, FileText, Car, Users, MapPin,
} from "lucide-react";

const MISSION_STEPS = [
  { key: "km_saida", label: "KM Saída", description: "Registre a quilometragem de saída e tire foto do odômetro" },
  { key: "checklist_saida", label: "Checklist Saída", description: "Tire as 4 fotos do veículo antes de sair" },
  { key: "em_transito_origem", label: "Em Trânsito (Ida)", description: "Deslocamento até o cliente" },
  { key: "km_chegada_origem", label: "KM Chegada Cliente", description: "Registre a quilometragem de chegada ao cliente" },
  { key: "fotos_cliente", label: "Fotos no Cliente", description: "Tire as fotos no local do cliente" },
  { key: "em_transito_destino", label: "Em Trânsito (Volta)", description: "Deslocamento de retorno" },
  { key: "km_chegada_destino", label: "KM Chegada Destino", description: "Registre a quilometragem de chegada ao destino" },
  { key: "checklist_retorno", label: "Checklist Retorno", description: "Tire as 4 fotos do veículo no retorno" },
] as const;

const STEP_PHOTO_SLOTS: Record<string, { key: string; label: string }[]> = {
  km_saida: [{ key: "km_saida", label: "Foto do Odômetro" }],
  checklist_saida: [
    { key: "checklist_saida_frente", label: "Dianteira" },
    { key: "checklist_saida_lateral_esq", label: "Lateral Esq." },
    { key: "checklist_saida_lateral_dir", label: "Lateral Dir." },
    { key: "checklist_saida_traseira", label: "Traseira" },
  ],
  km_chegada_origem: [{ key: "km_chegada_origem", label: "Foto do Odômetro" }],
  fotos_cliente: [
    { key: "foto_viatura_cliente", label: "Viatura no Cliente" },
    { key: "foto_veiculo_cliente_frente", label: "Frente Veículo Cliente" },
    { key: "foto_veiculo_cliente_traseira", label: "Traseira Veículo Cliente" },
  ],
  km_chegada_destino: [{ key: "km_chegada_destino", label: "Foto do Odômetro" }],
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
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
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

function StepTimeline({ steps, currentStatus, completedSteps }: {
  steps: typeof MISSION_STEPS;
  currentStatus: string;
  completedSteps: string[];
}) {
  const allStepKeys = ["aguardando", ...steps.map(s => s.key), "finalizada"];
  const currentIdx = allStepKeys.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2" data-testid="mission-timeline">
      {steps.map((step, i) => {
        const stepIdx = i + 1;
        const isComplete = currentIdx > stepIdx;
        const isCurrent = currentIdx === stepIdx;
        const isPending = currentIdx < stepIdx;

        return (
          <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                isComplete
                  ? "bg-green-600 text-white"
                  : isCurrent
                    ? "bg-yellow-500 text-white animate-pulse"
                    : "bg-neutral-300 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
              }`}
              title={step.label}
              data-testid={`step-indicator-${step.key}`}
            >
              {isComplete ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs hidden md:inline whitespace-nowrap ${
              isCurrent ? "font-semibold text-yellow-700 dark:text-yellow-400" : isComplete ? "text-green-700 dark:text-green-400" : "text-neutral-400"
            }`}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isComplete ? "text-green-500" : "text-neutral-300 dark:text-neutral-600"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhotoSlot({ slot, uploaded, onCapture, onFileSelect, uploading }: {
  slot: { key: string; label: string };
  uploaded: boolean;
  onCapture: () => void;
  onFileSelect: (file: File) => void;
  uploading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`border-2 rounded-md p-3 flex flex-col items-center gap-2 transition-colors ${
        uploaded
          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
          : "border-dashed border-neutral-300 dark:border-neutral-600"
      }`}
      data-testid={`photo-slot-${slot.key}`}
    >
      <p className="text-xs font-medium text-center">{slot.label}</p>
      {uploaded ? (
        <div className="flex items-center gap-1 text-green-600">
          <Check className="w-4 h-4" />
          <span className="text-xs">Enviada</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onCapture}
            disabled={uploading}
            data-testid={`button-capture-${slot.key}`}
          >
            <Camera className="w-3.5 h-3.5 mr-1" />
            Câmera
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid={`button-upload-${slot.key}`}
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            Arquivo
          </Button>
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
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  }, []);

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && pendingCaptureSlot) {
      handlePhotoUpload(pendingCaptureSlot, f);
    }
    e.target.value = "";
    setPendingCaptureSlot(null);
  }, [pendingCaptureSlot, handlePhotoUpload]);

  const allPhotosUploaded = photoSlots.length > 0
    ? photoSlots.every(slot => mission.completedSteps.includes(slot.key))
    : true;

  const canAdvance = isTransitStep || (allPhotosUploaded && (!needsKm || (photoSlots.length > 0 && allPhotosUploaded)));

  if (mission.missionStatus === "finalizada") {
    return (
      <Card className="p-6 text-center">
        <Check className="w-12 h-12 text-green-600 mx-auto mb-3" />
        <h2 className="text-xl font-bold mb-1" data-testid="text-mission-complete">Missão Finalizada</h2>
        <p className="text-sm text-neutral-500">Todas as etapas foram concluídas com sucesso.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-semibold" data-testid="text-os-number">OS {mission.osNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-neutral-500" />
            <span className="text-sm" data-testid="text-client-name">{mission.clientName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-neutral-500" />
            <span className="text-sm" data-testid="text-vehicle-info">{mission.vehiclePlate} - {mission.vehicleModel}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span data-testid="text-employee1-name">Func. 1: {mission.employee1Name}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span data-testid="text-employee2-name">Func. 2: {mission.employee2Name}</span>
          </div>
        </div>
      </Card>

      <StepTimeline steps={MISSION_STEPS} currentStatus={mission.missionStatus} completedSteps={mission.completedSteps} />

      {currentStepDef && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              Etapa Atual
            </Badge>
            <h3 className="font-semibold" data-testid="text-current-step-label">{currentStepDef.label}</h3>
          </div>
          <p className="text-sm text-neutral-500 mb-4" data-testid="text-current-step-description">{currentStepDef.description}</p>

          {needsKm && (
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block">Quilometragem (KM)</label>
              <Input
                type="number"
                placeholder="Ex: 45230"
                value={kmValue}
                onChange={(e) => setKmValue(e.target.value)}
                data-testid="input-km-value"
              />
            </div>
          )}

          {photoSlots.length > 0 && (
            <div className={`grid gap-3 mb-4 ${photoSlots.length === 1 ? "grid-cols-1" : photoSlots.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
              {photoSlots.map(slot => (
                <PhotoSlot
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
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md mb-4">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-blue-700 dark:text-blue-300">Você está em deslocamento. Clique em "Avançar" ao chegar no destino.</p>
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraChange}
          />

          <Button
            className="w-full"
            onClick={() => advanceMutation.mutate()}
            disabled={!canAdvance || advanceMutation.isPending}
            data-testid="button-advance-step"
          >
            {advanceMutation.isPending ? "Avançando..." : "Avançar"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Card>
      )}

      {mission.missionStatus === "aguardando" && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <h3 className="font-semibold">Aguardando Início</h3>
          </div>
          <p className="text-sm text-neutral-500 mb-4">Clique em "Avançar" para iniciar a missão registrando o KM de saída.</p>
          <Button
            className="w-full"
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            data-testid="button-start-mission"
          >
            {advanceMutation.isPending ? "Iniciando..." : "Iniciar Missão"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Card>
      )}
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
      <div className="max-w-2xl mx-auto" data-testid="mission-page">
        <h1 className="text-2xl font-bold mb-4" data-testid="text-mission-title">Missão Ativa</h1>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!isLoading && !mission && (
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-1" data-testid="text-no-mission">Nenhuma missão ativa</h2>
            <p className="text-sm text-neutral-500">Você não possui nenhuma ordem de serviço em andamento no momento.</p>
          </Card>
        )}

        {!isLoading && mission && <MissionWorkflow mission={mission} />}
      </div>
    </AdminLayout>
  );
}
