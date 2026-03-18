import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera, CheckCircle2, Car, Crosshair, Truck, User,
  Siren, Gauge, Route, Lock, ArrowRight, MapPin,
  Loader2, AlertCircle,
} from "lucide-react";

const MISSION_STEPS = [
  "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km",
  "em_transito_ida", "checkin_km", "checkin_veiculo_escoltado", "checkin_motorista",
  "iniciar_missao", "em_transito_destino", "km_final", "viatura_retorno", "finalizada",
] as const;

type MissionStep = typeof MISSION_STEPS[number];

const stepConfig: Record<string, { title: string; subtitle: string; icon: any; photos?: string[]; needsKm?: boolean; needsForm?: boolean }> = {
  aguardando: { title: "Dados da Missão", subtitle: "Revise os dados e inicie", icon: Lock },
  checkout_armamento: { title: "Armamento", subtitle: "Check-out · 1/11", icon: Crosshair, photos: ["Pistola 1", "Pistola 2", "Espingarda 12"] },
  checkout_viatura: { title: "Viatura", subtitle: "Check-out · 2/11", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"] },
  checkout_km: { title: "KM de Saída", subtitle: "Check-out · 3/11", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  em_transito_ida: { title: "Em Trânsito", subtitle: "Deslocamento · 4/11", icon: Route },
  checkin_km: { title: "KM Chegada", subtitle: "Check-in · 5/11", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  checkin_veiculo_escoltado: { title: "Veículo Escoltado", subtitle: "Check-in · 6/11", icon: Truck, photos: ["Frente do Caminhão", "Traseira do Caminhão"] },
  checkin_motorista: { title: "Dados do Motorista", subtitle: "Check-in · 7/11", icon: User, needsForm: true },
  iniciar_missao: { title: "Iniciar Missão", subtitle: "Execução · 8/11", icon: Siren },
  em_transito_destino: { title: "Em Trânsito", subtitle: "Execução · 9/11", icon: Route },
  km_final: { title: "KM Final", subtitle: "Finalização · 10/11", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  viatura_retorno: { title: "Viatura Retorno", subtitle: "Finalização · 11/11", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"] },
  finalizada: { title: "Missão Finalizada", subtitle: "Concluída", icon: CheckCircle2 },
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

function CameraCapture({ label, onCapture, captured }: { label: string; onCapture: (data: string) => void; captured: boolean }) {
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

export default function MobileMissaoPage() {
  const { toast } = useToast();
  const { getPosition } = useGeoLocation();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [kmValue, setKmValue] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPlate, setDriverPlate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active"],
    refetchInterval: 5000,
  });

  const currentStep = (mission?.missionStatus as MissionStep) || "aguardando";
  const config = stepConfig[currentStep] || stepConfig.aguardando;
  const Icon = config.icon;

  const resetStepState = useCallback(() => {
    setPhotos({});
    setKmValue("");
    setDriverName("");
    setDriverPlate("");
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

    setSubmitting(true);
    try {
      for (const label of config.photos) {
        const key = label.toLowerCase().replace(/\s/g, '-');
        if (photos[key]) {
          await uploadPhoto(currentStep, label, photos[key], config.needsKm ? parseInt(kmValue) : undefined);
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
    if (config.photos && !photos[config.photos[0].toLowerCase().replace(/\s/g, '-')]) {
      toast({ title: "Foto obrigatória", description: "Tire a foto do hodômetro.", variant: "destructive" });
      return;
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
      queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      toast({ title: "Missão iniciada!" });
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

        {mission.missionStartedAt && currentStep !== "finalizada" && (
          <MissionTimer startedAt={mission.missionStartedAt} />
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
              {mission.description && (
                <p className="text-xs text-neutral-500 border-t border-neutral-100 pt-2 mt-2">{mission.description}</p>
              )}
            </div>

            <button
              onClick={handleTransitAdvance}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-start-checkout"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              Iniciar Check-Out
            </button>
          </div>
        )}

        {config.photos && !config.needsKm && currentStep !== "aguardando" && (
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
              onClick={handleKmStep}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-km"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {currentStep === "checkout_km" ? "Liberar Viagem" : "Confirmar"}
            </button>
          </div>
        )}

        {(currentStep === "em_transito_ida" || currentStep === "em_transito_destino") && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Car className="w-8 h-8 text-neutral-600" />
              </div>
              <p className="text-sm font-bold text-neutral-800 uppercase tracking-wider">Em deslocamento</p>
              <p className="text-xs text-neutral-400 mt-1">Confirme a chegada ao destino</p>
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

        {currentStep === "checkin_motorista" && (
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
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 mt-4 text-left space-y-1">
                  {mission.escortedDriverName && (
                    <p className="text-xs text-neutral-500"><strong className="text-neutral-700">Motorista:</strong> {mission.escortedDriverName}</p>
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
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-mission-complete">
            <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Missão Finalizada</h3>
            <p className="text-xs text-neutral-400 mb-4">Todas as etapas foram concluídas com sucesso.</p>

            {mission.missionStartedAt && <MissionTimer startedAt={mission.missionStartedAt} />}
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
