import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera, CheckCircle2, Car, Crosshair, Truck, User,
  Siren, Gauge, Route, Lock, ArrowRight, MapPin,
  Loader2, AlertCircle, Navigation, ExternalLink, Phone,
  Bell, Shield, Home, ClipboardCheck, Eye, Sparkles,
} from "lucide-react";

const MISSION_STEPS = [
  "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida",
  "em_transito_origem", "checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista",
  "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno",
  "finalizada", "em_prontidao", "retorno_base", "chegada_base", "encerrada",
] as const;

type MissionStep = typeof MISSION_STEPS[number];

const VEHICLE_CHECKLIST_ITEMS = [
  { id: "estepe", label: "Estepe" },
  { id: "chave_roda", label: "Chave de Roda" },
  { id: "macaco", label: "Macaco" },
  { id: "triangulo", label: "Triângulo" },
];

const stepConfig: Record<string, { title: string; subtitle: string; icon: any; photos?: string[]; needsKm?: boolean; needsForm?: boolean; needsChecklist?: boolean }> = {
  aguardando: { title: "Dados da Missão", subtitle: "Revise os dados e confirme ciência", icon: Lock },
  checkout_armamento: { title: "Armamento", subtitle: "Check-out · 1/16", icon: Crosshair, photos: ["Pistola 1", "Pistola 2", "Espingarda 12"] },
  checkout_viatura: { title: "Viatura", subtitle: "Check-out · 2/16", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"], needsChecklist: true },
  checkout_km_saida: { title: "KM de Saída", subtitle: "Check-out · 3/16", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  em_transito_origem: { title: "Em Trânsito", subtitle: "Deslocamento · 4/16", icon: Route },
  checkin_chegada_km: { title: "KM Chegada", subtitle: "Check-in · 5/16", icon: Gauge, needsKm: true, photos: ["Hodômetro", "Agente Equipado"] },
  checkin_veiculo_escoltado: { title: "Veículo Escoltado", subtitle: "Check-in · 6/16", icon: Truck, photos: ["Frente do Caminhão", "Traseira do Caminhão"] },
  checkin_dados_motorista: { title: "Dados do Motorista", subtitle: "Check-in · 7/16", icon: User, needsForm: true },
  iniciar_missao: { title: "Iniciar Missão", subtitle: "Execução · 8/16", icon: Siren },
  em_transito_destino: { title: "Em Trânsito ao Destino", subtitle: "Execução · 9/16", icon: Route },
  chegada_destino: { title: "Chegada no Destino", subtitle: "Entrega · 10/16", icon: MapPin, photos: ["Foto do Local"] },
  checkout_km_final: { title: "KM Final", subtitle: "Finalização · 11/16", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  checkout_viatura_retorno: { title: "Viatura Retorno", subtitle: "Finalização · 12/16", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"] },
  finalizada: { title: "Entregas Finalizadas", subtitle: "Operação · 13/16", icon: CheckCircle2 },
  em_prontidao: { title: "Em Prontidão", subtitle: "Operação · 14/16", icon: Shield },
  retorno_base: { title: "Retorno à Base", subtitle: "Logístico · 15/16", icon: Home },
  chegada_base: { title: "Chegada na Base", subtitle: "Logístico · 16/16", icon: ClipboardCheck },
  encerrada: { title: "Operação Encerrada", subtitle: "Concluída", icon: Sparkles },
};

const PHOTO_STEP_MAP: Record<string, Record<string, string>> = {
  checkout_armamento: {
    "Pistola 1": "arma_pistola_1",
    "Pistola 2": "arma_pistola_2",
    "Espingarda 12": "arma_espingarda",
  },
  checkout_viatura: {
    "Dianteira": "viatura_frente",
    "Lateral Esq.": "viatura_lateral_esq",
    "Lateral Dir.": "viatura_lateral_dir",
    "Traseira": "viatura_traseira",
  },
  checkout_km_saida: {
    "Hodômetro": "km_saida",
  },
  checkin_chegada_km: {
    "Hodômetro": "km_chegada",
    "Agente Equipado": "agente_equipado",
  },
  checkin_veiculo_escoltado: {
    "Frente do Caminhão": "escoltado_frente",
    "Traseira do Caminhão": "escoltado_traseira",
  },
  chegada_destino: {
    "Foto do Local": "foto_local_destino",
  },
  checkout_km_final: {
    "Hodômetro": "km_final",
  },
  checkout_viatura_retorno: {
    "Dianteira": "viatura_retorno_frente",
    "Lateral Esq.": "viatura_retorno_lateral_esq",
    "Lateral Dir.": "viatura_retorno_lateral_dir",
    "Traseira": "viatura_retorno_traseira",
  },
  chegada_base: {
    "Dianteira": "base_viatura_frente",
    "Lateral Esq.": "base_viatura_lateral_esq",
    "Lateral Dir.": "base_viatura_lateral_dir",
    "Traseira": "base_viatura_traseira",
    "Hodômetro": "base_hodometro",
  },
};

function useGeoLocation() {
  const getPosition = useCallback((): Promise<{ lat: string; lng: string } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);
  return { getPosition };
}

function CameraCapture({ label, onCapture, captured, hint }: { label: string; onCapture: (data: string) => void; captured: boolean; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.onload = () => {
        const maxSize = 800;
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        onCapture(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} data-testid={`input-camera-${label.toLowerCase().replace(/\s/g, '-')}`} />
      <button
        onClick={() => inputRef.current?.click()}
        className={`w-full h-14 rounded-xl border-2 flex items-center justify-center gap-3 text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] ${captured ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600"}`}
        data-testid={`button-photo-${label.toLowerCase().replace(/\s/g, '-')}`}
      >
        {captured ? <CheckCircle2 className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
        {label}
      </button>
      {hint && !captured && (
        <p className="text-[10px] text-neutral-400 mt-1 text-center italic">{hint}</p>
      )}
    </div>
  );
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

function RouteInfoCard({ origin, destination, currentStep }: { origin?: string | null; destination?: string | null; currentStep: string }) {
  if (!origin && !destination) return null;

  const isGoingToOrigin = ["aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida", "em_transito_origem"].includes(currentStep);
  const currentTarget = isGoingToOrigin ? origin : destination;

  const encOrigin = encodeURIComponent(origin || "");
  const encDest = encodeURIComponent(destination || "");
  const encTarget = encodeURIComponent(currentTarget || "");

  const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${encTarget}&travelmode=driving`;
  const wazeNavUrl = `https://waze.com/ul?q=${encTarget}&navigate=yes`;
  const googleMapsRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${encOrigin}&destination=${encDest}&travelmode=driving`;

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Navigation className="w-4 h-4 text-neutral-700" />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Rota da Missão</span>
        </div>

        {origin && (
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-0.5">
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-green-600" />
              {destination && <div className="w-0.5 h-6 bg-neutral-200" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Origem</p>
              <p className="text-sm font-semibold text-neutral-800 leading-tight">{origin}</p>
            </div>
          </div>
        )}

        {destination && (
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-0.5">
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Destino</p>
              <p className="text-sm font-semibold text-neutral-800 leading-tight">{destination}</p>
            </div>
          </div>
        )}

        {origin && destination && (
          <a
            href={googleMapsRouteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center pt-1 border-t border-neutral-100"
            data-testid="link-ver-rota-completa"
          >
            <ExternalLink className="w-4 h-4 text-blue-600" />
          </a>
        )}
      </div>

      {currentTarget && (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={googleMapsNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-12 bg-blue-600 text-white rounded-2xl active:scale-[0.98]"
            data-testid="button-navigate-gmaps"
            title="Google Maps"
          >
            <Navigation className="w-5 h-5" />
          </a>
          <a
            href={wazeNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-12 bg-[#33ccff] text-white rounded-2xl active:scale-[0.98]"
            data-testid="button-navigate-waze"
            title="Waze"
          >
            <Navigation className="w-5 h-5" />
          </a>
        </div>
      )}
    </div>
  );
}

function MissionTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const timer = setInterval(() => {
      const diff = Date.now() - start;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-6 text-center" data-testid="text-mission-timer">
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Tempo de Missão</p>
      <p className="font-mono text-2xl font-black text-neutral-900 tracking-wider">{elapsed}</p>
    </div>
  );
}

function HourlyAlertBanner({ startedAt }: { startedAt: string | null }) {
  const [showAlert, setShowAlert] = useState(false);
  const [minutesSince, setMinutesSince] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();

    const check = () => {
      const diff = Date.now() - start;
      const totalMinutes = Math.floor(diff / 60000);
      const minutesSinceLastHour = totalMinutes % 60;
      setMinutesSince(totalMinutes);
      setShowAlert(minutesSinceLastHour >= 55 || totalMinutes < 5);
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!showAlert || !startedAt) return null;

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex items-center gap-3 animate-pulse" data-testid="alert-hourly-update">
      <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
        <Bell className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-amber-800 uppercase tracking-wider">Atualização Obrigatória</p>
        <p className="text-xs text-amber-600">Envie um status atualizado. Ambos os agentes devem reportar a cada 1 hora.</p>
      </div>
    </div>
  );
}

export default function MobileMissaoPage() {
  const { toast } = useToast();
  const { getPosition } = useGeoLocation();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [kmValue, setKmValue] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverPlate, setDriverPlate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cienteConfirmed, setCienteConfirmed] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [baseCleanStatus, setBaseCleanStatus] = useState<"limpa" | "suja" | "">("");
  const [baseCleanNotes, setBaseCleanNotes] = useState("");
  const [baseReturnKm, setBaseReturnKm] = useState("");
  const [baseChecklistOk, setBaseChecklistOk] = useState<Record<string, boolean>>({});
  const [statusUpdate, setStatusUpdate] = useState("");

  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active"],
    refetchInterval: 5000,
  });

  const currentStep = (mission?.missionStatus as MissionStep) || "aguardando";
  const config = stepConfig[currentStep] || stepConfig.aguardando;
  const Icon = config.icon;

  useEffect(() => {
    if (mission && currentStep === "checkin_dados_motorista") {
      if (mission.escortedDriverName && !driverName) setDriverName(mission.escortedDriverName);
      if (mission.escortedDriverPhone && !driverPhone) setDriverPhone(mission.escortedDriverPhone);
      if (mission.escortedVehiclePlate && !driverPlate) setDriverPlate(mission.escortedVehiclePlate);
    }
  }, [mission, currentStep]);

  const resetStepState = useCallback(() => {
    setPhotos({});
    setKmValue("");
    setDriverName("");
    setDriverPhone("");
    setDriverPlate("");
    setCienteConfirmed(false);
    setChecklist({});
    setStatusUpdate("");
  }, []);

  const uploadPhoto = async (step: string, label: string, photoData: string, km?: number) => {
    const pos = await getPosition();
    await apiRequest("POST", "/api/mission/photo", {
      serviceOrderId: mission.serviceOrderId,
      employeeId: mission.employeeId || 1,
      step,
      photoData,
      kmValue: km || null,
      latitude: pos?.lat || null,
      longitude: pos?.lng || null,
      notes: label,
    });
  };

  const advanceMission = async () => {
    await apiRequest("POST", "/api/mission/advance", {
      serviceOrderId: mission.serviceOrderId,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
    resetStepState();
  };

  const handlePhotoStep = async () => {
    if (!config.photos) return;
    const requiredCount = config.photos.length;
    const capturedCount = Object.keys(photos).length;
    if (capturedCount < requiredCount) {
      toast({ title: "Fotos pendentes", description: `Tire todas as ${requiredCount} fotos antes de continuar.`, variant: "destructive" });
      return;
    }

    if (config.needsChecklist) {
      const allChecked = VEHICLE_CHECKLIST_ITEMS.every(item => checklist[item.id]);
      if (!allChecked) {
        toast({ title: "Checklist incompleto", description: "Confirme todos os itens obrigatórios da viatura.", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const stepMap = PHOTO_STEP_MAP[currentStep] || {};
      for (const label of config.photos) {
        const key = label.toLowerCase().replace(/\s/g, '-');
        const backendStep = stepMap[label] || currentStep;
        if (photos[key]) {
          await uploadPhoto(backendStep, label, photos[key], config.needsKm ? parseInt(kmValue) : undefined);
        }
      }
      await advanceMission();
      toast({ title: "Etapa concluída!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKmStep = async () => {
    if (!kmValue || isNaN(parseInt(kmValue))) {
      toast({ title: "Informe o KM", description: "Digite a quilometragem do hodômetro.", variant: "destructive" });
      return;
    }
    const allPhotos = config.photos || [];
    for (const p of allPhotos) {
      const key = p.toLowerCase().replace(/\s/g, '-');
      if (!photos[key]) {
        toast({ title: "Foto obrigatória", description: `Tire a foto: ${p}`, variant: "destructive" });
        return;
      }
    }
    await handlePhotoStep();
  };

  const handleEscortData = async () => {
    if (!driverName.trim() || !driverPlate.trim()) {
      toast({ title: "Preencha todos os campos", description: "Nome do motorista e placa são obrigatórios.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/mission/escort-data", {
        serviceOrderId: mission.serviceOrderId,
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim() || null,
        vehiclePlate: driverPlate.trim().toUpperCase(),
      });
      await advanceMission();
      toast({ title: "Dados salvos!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMission = async () => {
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/mission/start", {
        serviceOrderId: mission.serviceOrderId,
      });
      await advanceMission();
      toast({ title: "Missão iniciada!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNovaEntrega = async () => {
    const allPhotos = config.photos || [];
    for (const p of allPhotos) {
      const key = p.toLowerCase().replace(/\s/g, '-');
      if (!photos[key]) {
        toast({ title: "Foto obrigatória", description: `Tire a foto: ${p}`, variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      if (config.photos) {
        const stepMap = PHOTO_STEP_MAP[currentStep] || {};
        for (const label of config.photos) {
          const key = label.toLowerCase().replace(/\s/g, '-');
          const backendStep = stepMap[label] || currentStep;
          if (photos[key]) {
            await uploadPhoto(backendStep, label, photos[key]);
          }
        }
      }
      await apiRequest("POST", "/api/mission/nova-entrega", {
        serviceOrderId: mission.serviceOrderId,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      resetStepState();
      toast({ title: "Nova entrega registrada!", description: "Prossiga até o próximo destino." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizarEntregas = async () => {
    const allPhotos = config.photos || [];
    for (const p of allPhotos) {
      const key = p.toLowerCase().replace(/\s/g, '-');
      if (!photos[key]) {
        toast({ title: "Foto obrigatória", description: `Tire a foto: ${p}`, variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      if (config.photos) {
        const stepMap = PHOTO_STEP_MAP[currentStep] || {};
        for (const label of config.photos) {
          const key = label.toLowerCase().replace(/\s/g, '-');
          const backendStep = stepMap[label] || currentStep;
          if (photos[key]) {
            await uploadPhoto(backendStep, label, photos[key]);
          }
        }
      }
      await advanceMission();
      toast({ title: "Entregas finalizadas!", description: "Prossiga para a finalização." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitAdvance = async () => {
    setSubmitting(true);
    try {
      await advanceMission();
      toast({ title: "Chegada confirmada!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendStatusUpdate = async () => {
    if (!statusUpdate.trim()) {
      toast({ title: "Informe o status", description: "Digite uma mensagem de atualização.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/audit-log", {
        action: "mission_status_update",
        page: "missao",
        details: { serviceOrderId: mission.serviceOrderId, message: statusUpdate.trim(), step: currentStep },
      });
      toast({ title: "Status enviado!" });
      setStatusUpdate("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimpleAdvance = async (successMsg: string) => {
    setSubmitting(true);
    try {
      await advanceMission();
      toast({ title: successMsg });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBaseCleanSubmit = async () => {
    if (!baseCleanStatus) {
      toast({ title: "Informe o status de limpeza", variant: "destructive" });
      return;
    }
    if (baseCleanStatus === "suja" && !baseCleanNotes.trim()) {
      toast({ title: "Informe o motivo", description: "Motivo obrigatório quando viatura está suja.", variant: "destructive" });
      return;
    }
    if (!baseReturnKm || Number(baseReturnKm) <= 0) {
      toast({ title: "Informe a quilometragem", variant: "destructive" });
      return;
    }
    const allBaseChecked = VEHICLE_CHECKLIST_ITEMS.every(item => baseChecklistOk[item.id]);
    if (!allBaseChecked) {
      toast({ title: "Checklist incompleto", description: "Confirme todos os itens do checklist da viatura.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/mission/base-clean", {
        serviceOrderId: mission.serviceOrderId,
        cleanStatus: baseCleanStatus,
        cleanNotes: baseCleanNotes,
        baseReturnKm,
        checklistConfirmed: true,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
        </div>
      </MobileLayout>
    );
  }

  if (!mission) {
    return (
      <MobileLayout>
        <div className="p-6 text-center min-h-[60vh] flex flex-col items-center justify-center" data-testid="mobile-no-mission">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-neutral-300" />
          </div>
          <h2 className="text-lg font-black text-neutral-800 uppercase tracking-wider mb-1">Nenhuma Missão</h2>
          <p className="text-sm text-neutral-400">Aguarde a atribuição de uma OS pelo admin.</p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-missao-page">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider" data-testid="text-step-title">{config.title}</h2>
              <p className="text-xs text-neutral-400">{config.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MISSION_STEPS.slice(0, -1).map((s, i) => {
              const stepIdx = MISSION_STEPS.indexOf(currentStep);
              return (
                <div
                  key={s}
                  className={`h-1.5 flex-1 min-w-[12px] rounded-full ${i < stepIdx ? "bg-neutral-900" : i === stepIdx ? "bg-neutral-400" : "bg-neutral-200"}`}
                />
              );
            })}
          </div>
        </div>

        {mission.missionStartedAt && !["finalizada", "em_prontidao", "retorno_base", "chegada_base", "encerrada"].includes(currentStep) && (
          <MissionTimer startedAt={mission.missionStartedAt} />
        )}

        {mission.missionStartedAt && ["em_transito_origem", "em_transito_destino"].includes(currentStep) && (
          <HourlyAlertBanner startedAt={mission.missionStartedAt} />
        )}

        <RouteInfoCard origin={mission.origin} destination={mission.destination} currentStep={currentStep} />

        {mission.escortedDriverName && ["em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno"].includes(currentStep) && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-neutral-700" />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Motorista Escoltado</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-800">{mission.escortedDriverName}</p>
                {mission.escortedVehiclePlate && (
                  <p className="text-xs text-neutral-500">Placa: <span className="font-mono font-bold text-neutral-700">{mission.escortedVehiclePlate}</span></p>
                )}
                {mission.escortedDriverPhone && (
                  <p className="text-xs text-neutral-500">{mission.escortedDriverPhone}</p>
                )}
              </div>
              {mission.escortedDriverPhone && (
                <a
                  href={`https://wa.me/55${mission.escortedDriverPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-bold active:scale-[0.98]"
                  data-testid="link-whatsapp-driver-floating"
                >
                  <Phone className="w-4 h-4" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {currentStep === "aguardando" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Crosshair className="w-3.5 h-3.5" />
                <span className="font-bold uppercase tracking-wider">OS {mission.osNumber}</span>
              </div>
              {mission.vehiclePlate && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Car className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Viatura:</strong> {mission.vehiclePlate} · {mission.vehicleModel || ""}</span>
                </div>
              )}
              {mission.employee1Name && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <User className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Agente 1:</strong> {mission.employee1Name}</span>
                </div>
              )}
              {mission.employee2Name && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <User className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Agente 2:</strong> {mission.employee2Name}</span>
                </div>
              )}
              {mission.scheduledDate && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Bell className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Data/Hora:</strong> {new Date(mission.scheduledDate).toLocaleString("pt-BR")}</span>
                </div>
              )}
              {mission.origin && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Origem:</strong> {mission.origin}</span>
                </div>
              )}
              {mission.destination && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Destino:</strong> {mission.destination}</span>
                </div>
              )}
              {mission.description && (
                <p className="text-xs text-neutral-500 border-t border-neutral-100 pt-2 mt-2">{mission.description}</p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4">
              <label className="flex items-start gap-3 cursor-pointer" data-testid="label-ciente">
                <input
                  type="checkbox"
                  checked={cienteConfirmed}
                  onChange={(e) => setCienteConfirmed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-neutral-300 accent-neutral-900"
                  data-testid="checkbox-ciente"
                />
                <div>
                  <p className="text-sm font-bold text-neutral-800">Declaro ciência desta missão</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Confirmo que li e compreendi todos os dados da operação acima.</p>
                </div>
              </label>
            </div>

            <button
              onClick={handleTransitAdvance}
              disabled={submitting || !cienteConfirmed}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-start-checkout"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              Ciente — Iniciar Check-Out
            </button>
          </div>
        )}

        {currentStep === "checkout_armamento" && config.photos && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <Eye className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium">Fotografe cada arma com o número de série visível na imagem.</p>
            </div>
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                    hint="Número de série deve estar visível"
                  />
                );
              })}
            </div>
            <button
              onClick={handlePhotoStep}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Confirmar
            </button>
          </div>
        )}

        {currentStep === "checkout_viatura" && config.photos && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                  />
                );
              })}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck className="w-4 h-4 text-neutral-700" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Itens Obrigatórios da Viatura</span>
              </div>
              <div className="space-y-2">
                {VEHICLE_CHECKLIST_ITEMS.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl cursor-pointer" data-testid={`label-checklist-${item.id}`}>
                    <input
                      type="checkbox"
                      checked={!!checklist[item.id]}
                      onChange={(e) => setChecklist(prev => ({ ...prev, [item.id]: e.target.checked }))}
                      className="w-5 h-5 rounded border-neutral-300 accent-neutral-900"
                      data-testid={`checkbox-${item.id}`}
                    />
                    <span className={`text-sm font-semibold ${checklist[item.id] ? "text-neutral-900" : "text-neutral-500"}`}>{item.label}</span>
                    {checklist[item.id] && <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handlePhotoStep}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Confirmar
            </button>
          </div>
        )}

        {config.photos && !config.needsKm && !config.needsChecklist && currentStep !== "aguardando" && currentStep !== "checkout_armamento" && currentStep !== "checkout_viatura" && currentStep !== "chegada_destino" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                  />
                );
              })}
            </div>
            <button
              onClick={handlePhotoStep}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Confirmar
            </button>
          </div>
        )}

        {config.needsKm && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Quilometragem (KM)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={kmValue}
                  onChange={(e) => setKmValue(e.target.value)}
                  placeholder="Ex: 45230"
                  className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl text-center text-xl font-mono font-bold text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                  data-testid="input-km-value"
                />
              </div>
              {config.photos?.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                const isAgentPhoto = label === "Agente Equipado";
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                    hint={isAgentPhoto ? "Agente posicionado à frente da viatura, devidamente equipado" : undefined}
                  />
                );
              })}
            </div>
            <button
              onClick={handleKmStep}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-km"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {currentStep === "checkout_km_saida" ? "Liberar Viagem" : "Confirmar"}
            </button>
          </div>
        )}

        {(currentStep === "em_transito_origem" || currentStep === "em_transito_destino") && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Car className="w-8 h-8 text-neutral-600" />
              </div>
              <p className="text-sm font-bold text-neutral-800 uppercase tracking-wider">Em deslocamento</p>
              <p className="text-xs text-neutral-400 mt-1">Confirme a chegada ao destino</p>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-neutral-700" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Atualização de Status</span>
              </div>
              <textarea
                value={statusUpdate}
                onChange={(e) => setStatusUpdate(e.target.value)}
                placeholder="Ex: Tráfego intenso na BR-101, previsão de chegada 14h30..."
                className="w-full h-20 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400 resize-none"
                data-testid="input-status-update"
              />
              <button
                onClick={handleSendStatusUpdate}
                disabled={submitting || !statusUpdate.trim()}
                className="w-full h-12 bg-white border-2 border-neutral-900 text-neutral-900 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                data-testid="button-send-status"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Enviar Atualização
              </button>
            </div>

            <button
              onClick={handleTransitAdvance}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-arrival"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
              Confirmar Chegada
            </button>
          </div>
        )}

        {currentStep === "chegada_destino" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Chegou no Destino</h3>
              <p className="text-xs text-neutral-400 mb-1">Registre a foto do local de destino</p>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos?.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                    hint="Fotografia do local de destino/entrega"
                  />
                );
              })}
            </div>

            <p className="text-xs text-neutral-500 text-center">Há mais entregas nesta missão?</p>

            <button
              onClick={handleNovaEntrega}
              disabled={submitting}
              className="w-full h-14 bg-white border-2 border-neutral-900 text-neutral-900 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-nova-entrega"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Route className="w-5 h-5" />}
              Nova Entrega
            </button>

            <button
              onClick={handleFinalizarEntregas}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-finalizar-entregas"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Finalizar Missão
            </button>
          </div>
        )}

        {currentStep === "checkin_dados_motorista" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Nome do Motorista</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                  data-testid="input-driver-name"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Telefone do Motorista</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                  data-testid="input-driver-phone"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Placa do Veículo Escoltado</label>
                <input
                  type="text"
                  value={driverPlate}
                  onChange={(e) => setDriverPlate(e.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  maxLength={7}
                  className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl text-center text-lg font-mono font-bold text-neutral-900 placeholder:text-neutral-300 uppercase focus:outline-none focus:border-neutral-400"
                  data-testid="input-driver-plate"
                />
              </div>
            </div>
            <button
              onClick={handleEscortData}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-save-driver"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              Salvar e Avançar
            </button>
          </div>
        )}

        {currentStep === "iniciar_missao" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-4">
                <Siren className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Pronto para iniciar?</h3>
              <p className="text-xs text-neutral-400">O sistema registrará o horário exato de início</p>

              {(mission.escortedDriverName || mission.escortedVehiclePlate) && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 mt-4 text-left space-y-2">
                  {mission.escortedDriverName && (
                    <p className="text-xs text-neutral-500"><strong className="text-neutral-700">Motorista:</strong> {mission.escortedDriverName}</p>
                  )}
                  {mission.escortedDriverPhone && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-neutral-500"><strong className="text-neutral-700">Telefone:</strong> {mission.escortedDriverPhone}</p>
                      <a
                        href={`https://wa.me/55${mission.escortedDriverPhone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white rounded-full text-[10px] font-bold"
                        data-testid="link-whatsapp-driver"
                      >
                        <Phone className="w-3 h-3" />
                        WhatsApp
                      </a>
                    </div>
                  )}
                  {mission.escortedVehiclePlate && (
                    <p className="text-xs text-neutral-500"><strong className="text-neutral-700">Placa:</strong> {mission.escortedVehiclePlate}</p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleStartMission}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-start-mission"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Siren className="w-5 h-5" />}
              Iniciar Missão
            </button>
          </div>
        )}

        {currentStep === "finalizada" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-mission-complete">
              <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Entregas Finalizadas</h3>
              <p className="text-xs text-neutral-400 mb-4">Prossiga para encerramento logístico.</p>
              {mission.missionStartedAt && <MissionTimer startedAt={mission.missionStartedAt} />}
            </div>
            <button
              onClick={() => handleSimpleAdvance("Em prontidão!")}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-em-prontidao"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              Em Prontidão
            </button>
          </div>
        )}

        {currentStep === "em_prontidao" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-em-prontidao">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Shield className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-green-700 uppercase tracking-wider mb-1">Em Prontidão</h3>
              <p className="text-xs text-neutral-400 mb-4">Equipe disponível. Quando liberados, inicie o retorno à base.</p>
              {mission.missionStartedAt && <MissionTimer startedAt={mission.missionStartedAt} />}
            </div>
            <button
              onClick={() => handleSimpleAdvance("Retorno à base iniciado!")}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-retorno-base"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Home className="w-5 h-5" />}
              Retorno à Base
            </button>
          </div>
        )}

        {currentStep === "retorno_base" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-retorno-base">
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Navigation className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-lg font-black text-blue-700 uppercase tracking-wider mb-1">Retornando à Base</h3>
              <p className="text-xs text-neutral-400 mb-4">Ao chegar na base, registre o encerramento logístico.</p>
              {mission.missionStartedAt && <MissionTimer startedAt={mission.missionStartedAt} />}
            </div>
            <button
              onClick={() => handleSimpleAdvance("Chegada à base registrada!")}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-chegada-base"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardCheck className="w-5 h-5" />}
              Cheguei na Base
            </button>
          </div>
        )}

        {currentStep === "chegada_base" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-base-checklist">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Checklist da Viatura (Base)</p>
              {VEHICLE_CHECKLIST_ITEMS.map(item => (
                <label key={item.id} className="flex items-center gap-3 py-2 border-b border-neutral-100 last:border-0">
                  <input
                    type="checkbox"
                    checked={!!baseChecklistOk[item.id]}
                    onChange={() => setBaseChecklistOk(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                    className="w-5 h-5 rounded border-neutral-300 accent-neutral-900"
                    data-testid={`checkbox-base-${item.id}`}
                  />
                  <span className="text-sm font-semibold text-neutral-700">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fotos da Viatura na Base</p>
              {stepConfig.chegada_base.photos!.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => setPhotos(prev => ({ ...prev, [key]: data }))}
                    captured={!!photos[key]}
                  />
                );
              })}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-base-km">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">KM Retorno à Base</p>
              <input
                type="number"
                inputMode="numeric"
                value={baseReturnKm}
                onChange={(e) => setBaseReturnKm(e.target.value)}
                placeholder="Ex: 145320"
                className="w-full h-12 border border-neutral-200 rounded-xl px-4 text-sm font-bold text-neutral-900 bg-neutral-50"
                data-testid="input-base-km"
              />
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-base-clean">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Status de Limpeza da Viatura</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBaseCleanStatus("limpa")}
                  className={`flex-1 h-14 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-colors ${
                    baseCleanStatus === "limpa"
                      ? "bg-green-50 border-green-500 text-green-700"
                      : "bg-neutral-50 border-neutral-200 text-neutral-400"
                  }`}
                  data-testid="button-clean-limpa"
                >
                  Limpa
                </button>
                <button
                  onClick={() => setBaseCleanStatus("suja")}
                  className={`flex-1 h-14 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-colors ${
                    baseCleanStatus === "suja"
                      ? "bg-red-50 border-red-500 text-red-700"
                      : "bg-neutral-50 border-neutral-200 text-neutral-400"
                  }`}
                  data-testid="button-clean-suja"
                >
                  Suja
                </button>
              </div>
              {baseCleanStatus === "suja" && (
                <textarea
                  value={baseCleanNotes}
                  onChange={(e) => setBaseCleanNotes(e.target.value)}
                  placeholder="Descreva o motivo (obrigatório)"
                  className="w-full mt-3 h-20 border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 bg-neutral-50 resize-none"
                  data-testid="input-clean-notes"
                />
              )}
            </div>

            {(!mission.baseCleanStatus) && (
              <button
                onClick={handleBaseCleanSubmit}
                disabled={submitting}
                className="w-full h-14 bg-neutral-800 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                data-testid="button-save-base-clean"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardCheck className="w-5 h-5" />}
                Salvar Dados Logísticos
              </button>
            )}

            {mission.baseCleanStatus && (
              <button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const config = stepConfig[currentStep];
                    if (config?.photos) {
                      const stepMap = PHOTO_STEP_MAP[currentStep] || {};
                      for (const label of config.photos) {
                        const key = label.toLowerCase().replace(/\s/g, '-');
                        const backendStep = stepMap[label] || currentStep;
                        if (photos[key]) {
                          await uploadPhoto(backendStep, label, photos[key]);
                        }
                      }
                    }
                    await advanceMission();
                    toast({ title: "Operação encerrada com sucesso!" });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                data-testid="button-encerrar-missao"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                Encerrar Operação
              </button>
            )}
          </div>
        )}

        {currentStep === "encerrada" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-encerrada">
              <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Operação Encerrada</h3>
              <p className="text-xs text-neutral-400 mb-4">Todas as etapas foram concluídas com sucesso. Bom trabalho!</p>
              {mission.missionStartedAt && <MissionTimer startedAt={mission.missionStartedAt} />}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Informações da OS</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-neutral-50 rounded-lg p-2">
              <p className="text-neutral-400 text-[10px]">OS</p>
              <p className="font-bold text-neutral-700" data-testid="text-os-number">{mission.osNumber}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-2">
              <p className="text-neutral-400 text-[10px]">Viatura</p>
              <p className="font-bold text-neutral-700" data-testid="text-vehicle">{mission.vehiclePlate || "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
