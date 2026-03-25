import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Input } from "@/components/ui/input";
import {
  Camera, Check, ChevronRight,
  Shield, Car, Users, Clock, Crosshair,
  AlertTriangle, CheckCircle2, Truck, User, Siren,
  DollarSign, Loader2, MapPin, Wifi, WifiOff, History,
} from "lucide-react";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";

const MISSION_STEPS = [
  { key: "checkout_armamento", label: "Armamento", screenTitle: "Armamento", screenSub: "CONFERÊNCIA DE ARMAS" },
  { key: "checkout_viatura", label: "Viatura", screenTitle: "Viatura", screenSub: "CHECK-OUT DA VIATURA" },
  { key: "checkout_km_saida", label: "KM Saída", screenTitle: "KM Saída", screenSub: "REGISTRO DE ODÔMETRO" },
  { key: "em_transito_origem", label: "Em Trânsito", screenTitle: "Em Trânsito", screenSub: "DESLOCAMENTO AO CLIENTE" },
  { key: "checkin_chegada_km", label: "KM Chegada", screenTitle: "KM Chegada", screenSub: "CHEGADA NO CLIENTE" },
  { key: "checkin_veiculo_escoltado", label: "Veíc. Escoltado", screenTitle: "Veículo Escoltado", screenSub: "REGISTRO DO CAMINHÃO" },
  { key: "checkin_dados_motorista", label: "Dados Motorista", screenTitle: "Dados do Motorista", screenSub: "INFORMAÇÕES DO ESCOLTADO" },
  { key: "iniciar_missao", label: "Iniciar Missão", screenTitle: "Iniciar Missão", screenSub: "EXECUÇÃO DA ESCOLTA" },
  { key: "em_transito_destino", label: "Trânsito Destino", screenTitle: "Em Trânsito", screenSub: "DESLOCAMENTO AO DESTINO" },
  { key: "chegada_destino", label: "Chegada", screenTitle: "Chegada no Destino", screenSub: "ENTREGA / NOVA ENTREGA" },
  { key: "checkout_km_final", label: "KM Final", screenTitle: "KM Final", screenSub: "REGISTRO DE CHEGADA" },
  { key: "checkout_viatura_retorno", label: "Viatura Retorno", screenTitle: "Viatura Retorno", screenSub: "CHECK-OUT FINAL" },
  { key: "finalizada", label: "Entregas Finalizadas", screenTitle: "Entregas Finalizadas", screenSub: "OPERAÇÃO CONCLUÍDA" },
  { key: "em_prontidao", label: "Em Prontidão", screenTitle: "Em Prontidão", screenSub: "EQUIPE DISPONÍVEL" },
  { key: "retorno_base", label: "Retorno à Base", screenTitle: "Retorno à Base", screenSub: "EM DESLOCAMENTO" },
  { key: "chegada_base", label: "Chegada Base", screenTitle: "Chegada na Base", screenSub: "ENCERRAMENTO LOGÍSTICO" },
] as const;

const STEP_PHOTO_SLOTS: Record<string, { key: string; label: string }[]> = {
  checkout_armamento: [
    { key: "arma_pistola_1", label: "Pistola 1" },
    { key: "arma_pistola_2", label: "Pistola 2" },
    { key: "arma_espingarda", label: "Espingarda 12" },
  ],
  checkout_viatura: [
    { key: "viatura_frente", label: "Dianteira" },
    { key: "viatura_lateral_esq", label: "Lateral Esq." },
    { key: "viatura_lateral_dir", label: "Lateral Dir." },
    { key: "viatura_traseira", label: "Traseira" },
  ],
  checkout_km_saida: [{ key: "km_saida", label: "Hodômetro" }],
  checkin_chegada_km: [{ key: "km_chegada", label: "Hodômetro" }],
  checkin_veiculo_escoltado: [
    { key: "escoltado_frente", label: "Frente Caminhão" },
    { key: "escoltado_traseira", label: "Traseira Caminhão" },
  ],
  checkout_km_final: [{ key: "km_final", label: "Hodômetro" }],
  checkout_viatura_retorno: [
    { key: "viatura_retorno_frente", label: "Dianteira" },
    { key: "viatura_retorno_lateral_esq", label: "Lateral Esq." },
    { key: "viatura_retorno_lateral_dir", label: "Lateral Dir." },
    { key: "viatura_retorno_traseira", label: "Traseira" },
  ],
  chegada_base: [
    { key: "base_viatura_frente", label: "Dianteira" },
    { key: "base_viatura_lateral_esq", label: "Lateral Esq." },
    { key: "base_viatura_lateral_dir", label: "Lateral Dir." },
    { key: "base_viatura_traseira", label: "Traseira" },
    { key: "base_hodometro", label: "Hodômetro" },
  ],
};

const KM_STEPS = ["checkout_km_saida", "checkin_chegada_km", "checkout_km_final"];

type StepLogEntry = {
  step: string;
  completedAt: string;
  agentName: string;
  agentId: number;
  geo?: { lat: string; lng: string } | null;
  nextStep: string;
};

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
  stepLogs?: StepLogEntry[];
  scheduledDate?: string;
  description?: string;
  escortedDriverName?: string | null;
  escortedVehiclePlate?: string | null;
  missionStartedAt?: string | null;
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

function getGeoLocation(): Promise<{ latitude: string; longitude: string } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function ShieldWatermark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.04]">
      <img src={logoSrc} alt="" className="w-[500px] h-[500px] object-contain" draggable={false} />
    </div>
  );
}

function MissionTimer({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  if (startedAt) {
    const start = new Date(startedAt).getTime();
    const diff = Math.max(0, Math.floor((now.getTime() - start) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return (
      <div className="font-mono text-2xl tracking-widest text-foreground font-bold" data-testid="mission-timer">
        {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </div>
    );
  }

  return (
    <div className="font-mono text-2xl tracking-widest text-muted-foreground font-bold" data-testid="mission-timer">
      {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );
}

function StepProgress({ currentStatus }: { currentStatus: string }) {
  const allKeys = ["aguardando", ...MISSION_STEPS.map(s => s.key), "encerrada"];
  const currentIdx = allKeys.indexOf(currentStatus);

  return (
    <div className="flex items-center justify-center gap-1 py-3 flex-wrap" data-testid="mission-timeline">
      {MISSION_STEPS.map((step, i) => {
        const stepIdx = i + 1;
        const isComplete = currentIdx > stepIdx;
        const isCurrent = currentIdx === stepIdx;

        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isComplete
                  ? "bg-foreground"
                  : isCurrent
                    ? "bg-foreground animate-pulse shadow-[0_0_6px_rgba(0,0,0,0.3)]"
                    : "bg-muted-foreground/25"
              }`}
              title={step.label}
              data-testid={`step-indicator-${step.key}`}
            />
            {i < MISSION_STEPS.length - 1 && (
              <div className={`w-3 h-0.5 ${isComplete ? "bg-foreground" : "bg-muted-foreground/15"}`} />
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
          className="w-full py-3 px-4 rounded-xl bg-foreground/10 border-2 border-foreground flex items-center justify-center gap-2 text-foreground"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-bold text-sm uppercase tracking-wide">{slot.label}</span>
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onCapture}
            disabled={uploading}
            className="flex-1 py-3 px-4 rounded-xl bg-background border-2 border-foreground flex items-center justify-center gap-2 hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
            data-testid={`button-capture-${slot.key}`}
          >
            <Camera className="w-5 h-5 text-foreground" />
            <span className="font-bold text-sm uppercase tracking-wide text-foreground">{slot.label}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="py-3 px-3 rounded-xl bg-background border-2 border-foreground flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
            data-testid={`button-upload-${slot.key}`}
          >
            <Camera className="w-5 h-5 text-foreground" />
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
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  const formatName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center mx-auto mb-1">
            <Users className="w-7 h-7 text-background" />
          </div>
          <p className="text-sm font-bold text-foreground" data-testid="text-employee1-name">{formatName(mission.employee1Name)}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Agente 1</p>
        </div>

        <div className="text-muted-foreground font-bold text-xl">+</div>

        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center mx-auto mb-1">
            <Users className="w-7 h-7 text-background" />
          </div>
          <p className="text-sm font-bold text-foreground" data-testid="text-employee2-name">{formatName(mission.employee2Name)}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Agente 2</p>
        </div>
      </div>

      <div className="text-center">
        <Car className="w-8 h-8 text-muted-foreground mx-auto mb-1" />
        <p className="text-sm font-bold text-foreground" data-testid="text-vehicle-info">
          {mission.vehiclePlate} ({mission.vehicleModel})
        </p>
      </div>

      <div className="bg-muted/60 rounded-xl border border-border p-4 space-y-2">
        {!isVigilante && (
          <p className="text-sm text-foreground" data-testid="text-client-name">
            <span className="font-bold">CLIENTE:</span> {mission.clientName}
          </p>
        )}
        <p className="text-sm text-foreground" data-testid="text-os-number">
          <span className="font-bold">OS:</span> {mission.osNumber}
        </p>
        {mission.scheduledDate && (
          <p className="text-sm text-foreground">
            <span className="font-bold">AGENDAMENTO:</span>{" "}
            {new Date(mission.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {mission.description && (
          <p className="text-sm text-foreground">
            <span className="font-bold">SERVIÇO:</span> {mission.description}
          </p>
        )}
      </div>
    </div>
  );
}

const STEP_LABELS: Record<string, string> = {
  missao_paga: "Pagamento Confirmado",
  aguardando: "Ciência da Missão",
  checkout_armamento: "Armamento Conferido",
  checkout_viatura: "Viatura Conferida",
  checkout_km_saida: "KM Saída Registrado",
  em_transito_origem: "Em Trânsito ao Cliente",
  checkin_chegada_km: "Chegada no Cliente",
  checkin_veiculo_escoltado: "Veículo Escoltado Registrado",
  checkin_dados_motorista: "Dados do Motorista Registrados",
  iniciar_missao: "Missão Iniciada",
  em_transito_destino: "Em Trânsito ao Destino",
  chegada_destino: "Chegada no Destino",
  checkout_km_final: "KM Final Registrado",
  checkout_viatura_retorno: "Viatura Retorno Conferida",
  finalizada: "Entregas Finalizadas",
  em_prontidao: "Em Prontidão",
  retorno_base: "Retorno à Base",
  chegada_base: "Chegada na Base",
  encerrada: "Missão Encerrada",
};

function MissionTimeline({ stepLogs }: { stepLogs: StepLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!stepLogs || stepLogs.length === 0) return null;

  const sorted = [...stepLogs].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  const display = expanded ? sorted : sorted.slice(-3);

  return (
    <div className="mt-4 mb-2">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 mb-3 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider" data-testid="button-toggle-timeline">
        <History size={14} />
        Linha do Tempo ({sorted.length} etapas)
        <ChevronRight size={12} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      <div className="space-y-0">
        {display.map((log, i) => {
          const dt = new Date(log.completedAt);
          const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const isLast = i === display.length - 1;
          return (
            <div key={`${log.step}-${log.completedAt}`} className="flex gap-3" data-testid={`timeline-entry-${log.step}`}>
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${isLast ? "bg-foreground border-foreground" : "bg-muted border-foreground/40"}`} />
                {!isLast && <div className="w-0.5 h-full bg-foreground/15 min-h-[32px]" />}
              </div>
              <div className="pb-3 flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground leading-tight">{STEP_LABELS[log.step] || log.step}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-mono">{dateStr} {timeStr}</span>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground font-medium">{log.agentName}</span>
                  {log.geo && (
                    <>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <a
                        href={`https://www.google.com/maps?q=${log.geo.lat},${log.geo.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
                        data-testid={`link-geo-${log.step}`}
                      >
                        <MapPin size={9} /> GPS
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!expanded && sorted.length > 3 && (
        <button onClick={() => setExpanded(true)} className="text-[10px] text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider ml-6" data-testid="button-show-all-timeline">
          Ver todas as {sorted.length} etapas
        </button>
      )}
    </div>
  );
}

function StepIcon({ stepKey }: { stepKey: string }) {
  const iconClass = "w-8 h-8 text-muted-foreground mx-auto mb-1";
  switch (stepKey) {
    case "checkout_armamento": return <Crosshair className={iconClass} />;
    case "checkout_viatura":
    case "checkout_viatura_retorno": return <Car className={iconClass} />;
    case "checkout_km_saida":
    case "checkin_chegada_km":
    case "checkout_km_final": return <Clock className={iconClass} />;
    case "checkin_veiculo_escoltado": return <Truck className={iconClass} />;
    case "checkin_dados_motorista": return <User className={iconClass} />;
    case "iniciar_missao": return <Siren className={iconClass} />;
    default: return <Shield className={iconClass} />;
  }
}

function MissionWorkflow({ mission }: { mission: ActiveMission }) {
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  const { toast } = useToast();
  const [kmValue, setKmValue] = useState("");
  const [driverName, setDriverName] = useState(mission.escortedDriverName || "");
  const [escortedPlate, setEscortedPlate] = useState(mission.escortedVehiclePlate || "");
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pendingCaptureSlot, setPendingCaptureSlot] = useState<string | null>(null);

  const currentStepDef = MISSION_STEPS.find(s => s.key === mission.missionStatus);
  const photoSlots = STEP_PHOTO_SLOTS[mission.missionStatus] || [];
  const needsKm = KM_STEPS.includes(mission.missionStatus);
  const isTransitStep = mission.missionStatus === "em_transito_origem" || mission.missionStatus === "em_transito_destino";
  const isDriverDataStep = mission.missionStatus === "checkin_dados_motorista";
  const isStartMissionStep = mission.missionStatus === "iniciar_missao";

  const uploadMutation = useMutation({
    mutationFn: async (data: { serviceOrderId: number; step: string; photoData: string; kmValue?: number; latitude?: string; longitude?: string }) => {
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

  const escortDataMutation = useMutation({
    mutationFn: async (data: { serviceOrderId: number; driverName: string; vehiclePlate: string }) => {
      const res = await apiRequest("POST", "/api/mission/escort-data", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      toast({ title: "Dados salvos com sucesso" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar dados", description: err.message, variant: "destructive" });
    },
  });

  const startMissionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mission/start", { serviceOrderId: mission.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao iniciar missão", description: err.message, variant: "destructive" });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mission/advance", { serviceOrderId: mission.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      if (mission.missionStatus === "checkout_km_saida") {
        toast({ title: "OK, Viagem Liberada!", description: "Boa viagem! Dirija com segurança." });
      } else {
        toast({ title: "Etapa avançada com sucesso" });
      }
      setKmValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao avançar", description: err.message, variant: "destructive" });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/service-orders/${mission.id}`, {
        missionStatus: "aguardando",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      toast({ title: "Pagamento confirmado!", description: "Missão liberada para os agentes." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const handlePhotoUpload = useCallback(async (slotKey: string, file: File) => {
    setUploadingSlot(slotKey);
    try {
      const [compressed, geo] = await Promise.all([compressImage(file), getGeoLocation()]);
      await uploadMutation.mutateAsync({
        serviceOrderId: mission.id,
        step: slotKey,
        photoData: compressed,
        kmValue: needsKm && kmValue ? Number(kmValue) : undefined,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
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

  const canAdvance = (() => {
    if (isTransitStep) return true;
    if (isDriverDataStep) return !!(driverName.trim() && escortedPlate.trim());
    if (isStartMissionStep) return true;
    if (photoSlots.length > 0 && !allPhotosUploaded) return false;
    return true;
  })();

  const handleAdvance = async () => {
    if (isDriverDataStep) {
      await escortDataMutation.mutateAsync({
        serviceOrderId: mission.id,
        driverName: driverName.trim(),
        vehiclePlate: escortedPlate.trim().toUpperCase(),
      });
    }
    if (isStartMissionStep) {
      await startMissionMutation.mutateAsync();
    }
    advanceMutation.mutate();
  };

  if (mission.missionStatus === "encerrada") {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted relative rounded-2xl overflow-hidden border border-border no-print-zone">
        <ShieldWatermark />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-foreground flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-background" />
          </div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-wider mb-2" data-testid="text-mission-complete">
            Operação Encerrada
          </h2>
          <p className="text-muted-foreground font-medium">Todas as etapas foram concluídas com sucesso.</p>
          {mission.missionStartedAt && (
            <div className="mt-4 bg-muted/60 rounded-xl border border-border px-6 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Tempo de Missão</p>
              <MissionTimer startedAt={mission.missionStartedAt} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mission.missionStatus === "missao_paga") {
    const isAdmin = user?.role === "admin" || user?.role === "diretoria";
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted relative rounded-2xl overflow-hidden border border-border no-print-zone">
        <ShieldWatermark />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center mb-4">
            <DollarSign className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-foreground uppercase tracking-wider mb-2" data-testid="text-awaiting-payment">
            Aguardando Pagamento
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
            {isAdmin
              ? "Confirme o recebimento do pagamento para liberar a missão aos agentes."
              : "Aguarde a confirmação de pagamento pela administração."}
          </p>

          <div className="bg-muted/60 rounded-xl border border-border p-4 w-full mb-6 space-y-2">
            <p className="text-sm text-foreground"><span className="font-bold">OS:</span> {mission.osNumber}</p>
            <p className="text-sm text-foreground"><span className="font-bold">Cliente:</span> {mission.clientName}</p>
            <p className="text-sm text-foreground"><span className="font-bold">Viatura:</span> {mission.vehiclePlate}</p>
          </div>

          {isAdmin ? (
            <button
              onClick={() => confirmPaymentMutation.mutate()}
              disabled={confirmPaymentMutation.isPending}
              className="w-full py-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base uppercase tracking-wider shadow-lg transition-all disabled:opacity-50"
              data-testid="button-confirm-payment"
            >
              {confirmPaymentMutation.isPending
                ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                : "CONFIRMAR PAGAMENTO"}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Atualizando automaticamente...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mission.missionStatus === "aguardando") {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted relative rounded-2xl overflow-hidden border border-border no-print-zone">
        <ShieldWatermark />
        <div className="relative z-10 p-5">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <img src={logoSrc} alt="" className="w-8 h-8 object-contain" />
              <Shield className="w-5 h-5 text-foreground" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-wider leading-tight">
              Dados da Missão
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">ESCOLTA ARMADA</p>
          </div>

          <MissionDataCard mission={mission} />

          <div className="flex items-center justify-between mt-6 mb-4">
            <MissionTimer startedAt={null} />
            <button
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="w-16 h-16 rounded-full bg-foreground hover:bg-foreground/90 flex items-center justify-center shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
              data-testid="button-start-mission"
            >
              <CheckCircle2 className="w-9 h-9 text-background" />
            </button>
          </div>

          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="w-full py-4 rounded-full bg-foreground hover:bg-foreground/90 text-background font-black text-lg uppercase tracking-wider shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
            data-testid="button-advance-step"
          >
            {advanceMutation.isPending ? "INICIANDO..." : "INICIAR CHECK-OUT"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted relative rounded-2xl overflow-hidden border border-border no-print-zone">
      <ShieldWatermark />
      <div className="relative z-10 p-5">
        <div className="text-center mb-4">
          <div className="inline-block bg-foreground text-background px-6 py-2 rounded-lg shadow-md mb-1">
            <h2 className="text-xl font-black uppercase tracking-wider" data-testid="text-current-step-label">
              {currentStepDef?.screenTitle || currentStepDef?.label}
            </h2>
          </div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.25em] mt-1" data-testid="text-current-step-description">
            {currentStepDef?.screenSub}
          </p>
        </div>

        <StepProgress currentStatus={mission.missionStatus} />

        {mission.stepLogs && mission.stepLogs.length > 0 && (
          <MissionTimeline stepLogs={mission.stepLogs} />
        )}

        <div className="bg-muted/50 rounded-xl p-3 mb-4 flex items-center justify-between text-xs border border-border">
          <span className="font-bold text-foreground">{mission.osNumber}</span>
          {!isVigilante && <span className="text-foreground font-medium">{mission.clientName}</span>}
          <span className="text-muted-foreground">{mission.vehiclePlate}</span>
        </div>

        {needsKm && (
          <div className="mb-5">
            <p className="text-sm font-bold text-foreground uppercase tracking-wider text-center mb-3">
              Digite a Quilometragem
            </p>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Ex: 45230"
              value={kmValue}
              onChange={(e) => setKmValue(e.target.value)}
              className="text-center text-lg font-mono font-bold bg-background border-2 border-foreground rounded-xl h-14"
              data-testid="input-km-value"
            />
          </div>
        )}

        {photoSlots.length > 0 && (
          <div className="space-y-3 mb-5">
            <div className="text-center mb-2">
              <StepIcon stepKey={mission.missionStatus} />
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
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-20 h-20 rounded-full bg-muted border-2 border-border flex items-center justify-center animate-pulse">
              <Car className="w-10 h-10 text-foreground" />
            </div>
            <p className="text-lg font-bold text-foreground uppercase tracking-wider">
              Em deslocamento
            </p>
            <p className="text-sm text-muted-foreground text-center">
              {mission.missionStatus === "em_transito_origem"
                ? "Deslocamento até o cliente. Confirme a chegada ao chegar no local."
                : "Deslocamento ao destino final. Confirme a chegada."}
            </p>
            <MissionTimer startedAt={mission.missionStartedAt} />
          </div>
        )}

        {isDriverDataStep && (
          <div className="space-y-4 mb-5">
            <div className="text-center mb-2">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-1" />
              <p className="text-sm font-bold text-foreground uppercase tracking-wider">
                Dados do veículo escoltado
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Nome do Motorista
              </label>
              <Input
                type="text"
                placeholder="Nome completo do motorista"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="bg-background border-2 border-foreground rounded-xl h-12 font-medium"
                data-testid="input-driver-name"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Placa do Veículo Escoltado
              </label>
              <Input
                type="text"
                placeholder="Ex: ABC1D23"
                value={escortedPlate}
                onChange={(e) => setEscortedPlate(e.target.value.toUpperCase())}
                className="bg-background border-2 border-foreground rounded-xl h-12 font-mono font-bold text-center uppercase"
                maxLength={7}
                data-testid="input-escorted-plate"
              />
            </div>
          </div>
        )}

        {isStartMissionStep && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-24 h-24 rounded-full bg-foreground flex items-center justify-center shadow-xl">
              <Siren className="w-12 h-12 text-background" />
            </div>
            <p className="text-lg font-black text-foreground uppercase tracking-wider text-center">
              Pronto para iniciar?
            </p>
            <p className="text-sm text-muted-foreground text-center max-w-[280px]">
              Ao confirmar, o sistema registrará o horário de início da escolta e iniciará o monitoramento.
            </p>
            {mission.escortedDriverName && (
              <div className="bg-muted/60 rounded-xl border border-border p-3 w-full text-sm space-y-1">
                <p><span className="font-bold">Motorista:</span> {mission.escortedDriverName}</p>
                <p><span className="font-bold">Placa Escoltado:</span> {mission.escortedVehiclePlate}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mb-4 italic">
          GPS e horário registrados automaticamente
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
          onClick={handleAdvance}
          disabled={!canAdvance || advanceMutation.isPending || escortDataMutation.isPending || startMissionMutation.isPending}
          className="w-full py-4 rounded-full bg-foreground hover:bg-foreground/90 text-background font-black text-base uppercase tracking-wider shadow-lg transition-all hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
          data-testid="button-advance-step"
        >
          {(advanceMutation.isPending || escortDataMutation.isPending || startMissionMutation.isPending)
            ? "PROCESSANDO..."
            : isTransitStep
              ? "CONFIRMAR CHEGADA"
              : isStartMissionStep
                ? "INICIAR MISSÃO"
                : isDriverDataStep
                  ? "SALVAR E AVANÇAR"
                  : mission.missionStatus === "checkout_km_saida"
                    ? "LIBERAR VIAGEM"
                    : `CONFIRMAR ${currentStepDef?.screenTitle?.toUpperCase() || "ETAPA"}`}
        </button>

        <div className="mt-4 flex items-center justify-center">
          <MissionTimer startedAt={mission.missionStartedAt} />
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
          <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted rounded-2xl border border-border flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
            </div>
          </div>
        )}

        {!isLoading && !mission && (
          <div className="min-h-[80vh] bg-gradient-to-b from-card to-muted relative rounded-2xl overflow-hidden border border-border no-print-zone">
            <ShieldWatermark />
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
              <div className="inline-flex items-center gap-2 mb-4">
                <img src={logoSrc} alt="" className="w-10 h-10 object-contain" />
              </div>
              <h1 className="text-2xl font-black text-foreground uppercase tracking-wider mb-2">
                Área do Vigilante
              </h1>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-6">
                Escolta Armada
              </p>
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
                <Shield className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1" data-testid="text-no-mission">
                Nenhuma missão ativa
              </h2>
              <p className="text-sm text-muted-foreground">
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
