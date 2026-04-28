import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { logAuditAction } from "@/hooks/use-audit";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authFetch, invalidateRelatedQueries } from "@/lib/queryClient";
import { titleCase, parseBRL, maskBRL } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect, useCallback } from "react";
import { enqueueAction, getPendingCount, startOfflineSync, isOnline, isNetworkError, forceFlush, subscribeQueue } from "@/lib/offlineQueue";
import { supabase } from "@/lib/supabase";
import {
  Camera, CheckCircle2, Car, Crosshair, Truck, User,
  Siren, Gauge, Route, Lock, ArrowRight, MapPin,
  Loader2, AlertCircle, Navigation, ExternalLink, Phone,
  Bell, Shield, Home, ClipboardCheck, Eye, Sparkles, DollarSign,
  WifiOff, History, ChevronRight, Calendar, Clock, MessageSquare,
  CircleDollarSign, Receipt, RefreshCw, Plus,
} from "lucide-react";

const MISSION_STEPS = [
  "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida",
  "em_transito_origem", "checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista",
  "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno",
  "finalizada", "retorno_base", "chegada_base", "encerrada",
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
  checkout_armamento: { title: "Armamento", subtitle: "Check-out · 1/15", icon: Crosshair, photos: ["Pistola 1", "Pistola 2", "Espingarda 12"] },
  checkout_viatura: { title: "Viatura", subtitle: "Check-out · 2/15", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"], needsChecklist: true },
  checkout_km_saida: { title: "KM de Saída", subtitle: "Check-out · 3/15", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  em_transito_origem: { title: "Em Trânsito", subtitle: "Deslocamento · 4/15", icon: Route },
  checkin_chegada_km: { title: "KM Chegada", subtitle: "Chegada no Cliente · 5/15", icon: Gauge, needsKm: true, photos: ["Hodômetro", "Agente Equipado"] },
  checkin_veiculo_escoltado: { title: "Veículo Escoltado", subtitle: "Check-in · 6/15", icon: Truck, photos: ["Frente do Caminhão", "Traseira do Caminhão"] },
  checkin_dados_motorista: { title: "Dados do Motorista", subtitle: "Check-in · 7/15", icon: User, needsForm: true },
  iniciar_missao: { title: "Iniciar Missão", subtitle: "Execução · 8/15", icon: Siren },
  em_transito_destino: { title: "Em Trânsito ao Destino", subtitle: "Execução · 9/15", icon: Route },
  chegada_destino: { title: "Chegada no Destino", subtitle: "Entrega · 10/15", icon: MapPin, photos: ["Foto do Local", "Hodômetro"], needsKm: true },
  checkout_km_final: { title: "KM Final", subtitle: "Finalização · 11/15", icon: Gauge, needsKm: true, photos: ["Hodômetro"] },
  checkout_viatura_retorno: { title: "Viatura Retorno", subtitle: "Finalização · 12/15", icon: Car, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"] },
  finalizada: { title: "Entregas Finalizadas", subtitle: "Operação · 13/15", icon: CheckCircle2 },
  retorno_base: { title: "Retorno à Base", subtitle: "Logístico · 14/15", icon: Home },
  chegada_base: { title: "Chegada na Base", subtitle: "Logístico · 15/15", icon: ClipboardCheck, photos: ["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira", "Hodômetro"] },
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
    "Hodômetro": "km_final",
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

type AiStatus = "idle" | "uploading" | "analisando" | "aprovado" | "divergente" | "erro";
interface AiPhotoResult {
  status: AiStatus;
  result?: any;
}

function CameraCapture({ label, onCapture, captured, hint, aiStatus, aiResult, onRetake }: {
  label: string;
  onCapture: (data: string) => void;
  captured: boolean;
  hint?: string;
  aiStatus?: AiStatus;
  aiResult?: any;
  onRetake?: () => void;
}) {
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

  const isAnalyzing = aiStatus === "uploading" || aiStatus === "analisando";
  const isApproved = aiStatus === "aprovado";
  const isDivergent = aiStatus === "divergente";

  const handleClick = () => {
    inputRef.current?.click();
  };

  let btnClass = "border-neutral-300 bg-white text-neutral-600";
  if (isAnalyzing) btnClass = "border-amber-400 bg-amber-50 text-amber-700";
  else if (isApproved) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-700";
  else if (isDivergent) btnClass = "border-amber-500 bg-amber-50 text-amber-700";
  else if (captured) btnClass = "border-neutral-900 bg-neutral-900 text-white";

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} data-testid={`input-camera-${label.toLowerCase().replace(/\s/g, '-')}`} />
      <button
        onClick={handleClick}
        disabled={isAnalyzing}
        className={`w-full h-14 rounded-xl border-2 flex items-center justify-center gap-3 text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-70 ${btnClass}`}
        data-testid={`button-photo-${label.toLowerCase().replace(/\s/g, '-')}`}
      >
        {isAnalyzing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isApproved ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isDivergent ? (
          <AlertCircle className="w-5 h-5" />
        ) : captured ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <Camera className="w-5 h-5" />
        )}
        {label}
        {isAnalyzing && <span className="text-[10px] normal-case font-normal ml-1">IA analisando...</span>}
      </button>
      {isApproved && (
        <p className="text-[10px] text-emerald-600 mt-1 text-center font-bold flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> IA Aprovada — {aiResult?.observacao ? aiResult.observacao.substring(0, 60) : "Foto dentro do padrão"}
        </p>
      )}
      {isDivergent && (
        <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1 mb-1">
            <AlertCircle className="w-3 h-3" /> Observação da IA
          </p>
          {aiResult?.divergencias?.length > 0 && (
            <ul className="text-[10px] text-red-600 list-disc list-inside space-y-0.5">
              {aiResult.divergencias.map((d: string, i: number) => <li key={i}>{d}</li>)}
            </ul>
          )}
          {aiResult?.observacao && (
            <p className="text-[10px] text-red-500 mt-1 italic">{aiResult.observacao.substring(0, 80)}</p>
          )}
        </div>
      )}
      {hint && !captured && !isDivergent && (
        <p className="text-[10px] text-neutral-400 mt-1 text-center italic">{hint}</p>
      )}
    </div>
  );
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

function WazeLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="https://www.waze.com/favicon.ico"
      alt="Waze"
      width={size}
      height={size}
      className="rounded"
      style={{ imageRendering: "auto" }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function GoogleMapsLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="https://maps.google.com/favicon.ico"
      alt="Google Maps"
      width={size}
      height={size}
      className="rounded"
      style={{ imageRendering: "auto" }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function parseRouteStops(route?: string | null, origin?: string | null, destination?: string | null) {
  const stops: { label: string; name: string; color: string }[] = [];
  if (route && route.includes("→")) {
    const parts = route.split("→").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      stops.push({ label: "Origem", name: parts[0], color: "green" });
      for (let i = 1; i < parts.length - 1; i++) {
        stops.push({ label: `Parada ${i}`, name: parts[i], color: "amber" });
      }
      stops.push({ label: "Destino", name: parts[parts.length - 1], color: "red" });
      return stops;
    }
  }
  if (origin) stops.push({ label: "Origem", name: origin, color: "green" });
  if (destination) stops.push({ label: "Destino", name: destination, color: "red" });
  return stops;
}

function RouteInfoCard({ origin, destination, route, currentStep }: { origin?: string | null; destination?: string | null; route?: string | null; currentStep: string }) {
  if (!origin && !destination && !route) return null;

  const stops = parseRouteStops(route, origin, destination);
  const finalDest = stops.length > 0 ? stops[stops.length - 1].name : destination;

  const isGoingToOrigin = ["aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida", "em_transito_origem"].includes(currentStep);
  const currentTarget = isGoingToOrigin ? (stops[0]?.name || origin) : finalDest;

  const encOrigin = encodeURIComponent(stops[0]?.name || origin || "");
  const encDest = encodeURIComponent(finalDest || "");
  const encTarget = encodeURIComponent(currentTarget || "");
  const waypoints = stops.slice(1, -1).map(s => encodeURIComponent(s.name)).join("|");

  const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${encTarget}&travelmode=driving`;
  const wazeNavUrl = `https://waze.com/ul?q=${encTarget}&navigate=yes`;
  const googleMapsRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${encOrigin}&destination=${encDest}${waypoints ? `&waypoints=${waypoints}` : ""}&travelmode=driving`;

  const dotColor: Record<string, string> = {
    green: "bg-green-500 border-green-600",
    amber: "bg-amber-500 border-amber-600",
    red: "bg-red-500 border-red-600",
  };
  const labelColor: Record<string, string> = {
    green: "text-green-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Route className="w-4 h-4 text-neutral-700" />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Rota da Missão</span>
        </div>

        {stops.map((stop, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-0.5">
              <div className={`w-3 h-3 rounded-full border-2 ${dotColor[stop.color] || "bg-neutral-400 border-neutral-500"}`} />
              {idx < stops.length - 1 && <div className="w-0.5 h-6 bg-neutral-200" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${labelColor[stop.color] || "text-neutral-500"}`}>{stop.label}</p>
              <p className="text-sm font-semibold text-neutral-800 leading-tight">{stop.name}</p>
            </div>
          </div>
        ))}

        {stops.length >= 2 && (
          <a
            href={googleMapsRouteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 pt-2 border-t border-neutral-100 text-blue-600"
            data-testid="link-ver-rota-completa"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Ver Rota Completa</span>
          </a>
        )}
      </div>

      {currentTarget && (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={googleMapsNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 bg-white border-2 border-neutral-200 rounded-2xl active:scale-[0.98] font-bold text-xs uppercase tracking-wider text-neutral-800"
            data-testid="button-navigate-gmaps"
            title="Google Maps"
          >
            <GoogleMapsLogo size={24} />
            Google Maps
          </a>
          <a
            href={wazeNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 bg-white border-2 border-neutral-200 rounded-2xl active:scale-[0.98] font-bold text-xs uppercase tracking-wider text-neutral-800"
            data-testid="button-navigate-waze"
            title="Waze"
          >
            <WazeLogo size={24} />
            Waze
          </a>
        </div>
      )}
    </div>
  );
}

function parseUTCTimestamp(ts: string): number {
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T");
  const withZ = normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + "Z";
  return new Date(withZ).getTime();
}

function MissionTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!startedAt) return;
    const start = parseUTCTimestamp(startedAt);
    if (isNaN(start)) return;
    const update = () => {
      const diff = Date.now() - start;
      if (diff < 0 || diff > 86400000 * 30) { setElapsed("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const timer = setInterval(update, 1000);
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
    const start = parseUTCTimestamp(startedAt);
    if (isNaN(start)) return;

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
        <p className="text-xs text-amber-600">Envie um status atualizado. Qualquer um dos agentes deve reportar a cada 1 hora.</p>
      </div>
    </div>
  );
}

const MOBILE_STEP_LABELS: Record<string, string> = {
  aguardando: "Ciência da Missão",
  checkout_armamento: "Armamento Conferido",
  checkout_viatura: "Viatura Conferida",
  checkout_km_saida: "KM Saída Registrado",
  em_transito_origem: "Em Trânsito",
  checkin_chegada_km: "Chegada no Cliente",
  checkin_veiculo_escoltado: "Veículo Registrado",
  checkin_dados_motorista: "Dados Motorista",
  iniciar_missao: "Missão Iniciada",
  em_transito_destino: "Em Trânsito Destino",
  chegada_destino: "Chegada Destino",
  checkout_km_final: "KM Final",
  checkout_viatura_retorno: "Viatura Retorno",
  finalizada: "Entregas OK",
  retorno_base: "Retorno Base",
  chegada_base: "Chegada Base",
  encerrada: "Encerrada",
};

function MobileTimeline({ stepLogs }: { stepLogs: any[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!stepLogs || stepLogs.length === 0) return null;

  const _euTl = (s: string) => /[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z";
  const sorted = [...stepLogs].sort((a: any, b: any) => new Date(_euTl(a.completedAt)).getTime() - new Date(_euTl(b.completedAt)).getTime());
  const display = expanded ? sorted : sorted.slice(-2);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="mobile-timeline">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 mb-3 w-full" data-testid="button-toggle-timeline">
        <History size={14} className="text-neutral-500" />
        <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider flex-1 text-left">
          Linha do Tempo ({sorted.length})
        </span>
        <ChevronRight size={12} className={`text-neutral-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      <div className="space-y-0">
        {display.map((log: any, i: number) => {
          const dt = new Date(_euTl(log.completedAt));
          const timeStr = dt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
          const dateStr = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
          const isLast = i === display.length - 1;
          return (
            <div key={`${log.step}-${i}`} className="flex gap-3" data-testid={`timeline-entry-${log.step}-${i}`}>
              <div className="flex flex-col items-center">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isLast ? "bg-neutral-900" : "bg-neutral-300"}`} />
                {!isLast && <div className="w-0.5 h-full bg-neutral-200 min-h-[24px]" />}
              </div>
              <div className="pb-2 flex-1 min-w-0">
                <p className="text-[11px] font-bold text-neutral-800 leading-tight">{MOBILE_STEP_LABELS[log.step] || log.step}</p>
                <p className="text-[10px] text-neutral-500 font-mono">{dateStr} {timeStr} — {titleCase(log.agentName)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {!expanded && sorted.length > 2 && (
        <button onClick={() => setExpanded(true)} className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider ml-5 mt-1" data-testid="button-show-all-timeline">
          Ver todas ({sorted.length})
        </button>
      )}
    </div>
  );
}

function TransitStepView({ currentStep, mission, statusUpdate, setStatusUpdate, submitting, handleSendStatusUpdate, handleTransitAdvance, getPosition, isReadOnly }: {
  currentStep: string;
  mission: any;
  statusUpdate: string;
  setStatusUpdate: (v: string) => void;
  submitting: boolean;
  handleSendStatusUpdate: (photoDataUrl?: string) => Promise<boolean>;
  handleTransitAdvance: () => void;
  getPosition: () => Promise<{ lat: string; lng: string } | null>;
  isReadOnly?: boolean;
}) {
  const { toast } = useToast();
  const [nearOrigin, setNearOrigin] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<string | null>(null);
  const [updateStep, setUpdateStep] = useState<"idle" | "photo" | "message">("idle");
  const [updatePhoto, setUpdatePhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [tollOpen, setTollOpen] = useState(false);
  const [tollAmount, setTollAmount] = useState("");
  const [tollPhoto, setTollPhoto] = useState("");
  const [tollCameraMode, setTollCameraMode] = useState(false);
  const [tollSubmitted, setTollSubmitted] = useState(false);
  const tollVideoRef = useRef<HTMLVideoElement>(null);
  const tollCanvasRef = useRef<HTMLCanvasElement>(null);
  const tollStreamRef = useRef<MediaStream | null>(null);

  const startTollCamera = useCallback(async () => {
    setTollCameraMode(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 } });
      tollStreamRef.current = stream;
      if (tollVideoRef.current) { tollVideoRef.current.srcObject = stream; tollVideoRef.current.play(); }
    } catch {
      toast({ title: "Erro ao acessar câmera", variant: "destructive" });
      setTollCameraMode(false);
    }
  }, [toast]);

  const stopTollCamera = useCallback(() => {
    tollStreamRef.current?.getTracks().forEach(t => t.stop());
    tollStreamRef.current = null;
    setTollCameraMode(false);
  }, []);

  const captureTollPhoto = useCallback(() => {
    if (!tollVideoRef.current || !tollCanvasRef.current) return;
    const cv = tollCanvasRef.current;
    const video = tollVideoRef.current;
    cv.width = Math.min(video.videoWidth, 1280);
    cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    setTollPhoto(cv.toDataURL("image/jpeg", 0.7));
    stopTollCamera();
  }, [stopTollCamera]);

  const tollMutation = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const res = await authFetch("/api/mobile/pedagio-missao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceOrderId: mission.serviceOrderId,
          amount: parseBRL(tollAmount),
          photoUrl: tollPhoto,
          latitude: pos?.lat || null,
          longitude: pos?.lng || null,
        }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { message: text }; }
      if (!res.ok) throw new Error(data.message || "Erro ao registrar pedágio");
      return data;
    },
    onSuccess: (data) => {
      setTollSubmitted(true);
      invalidateRelatedQueries("financial");
      invalidateRelatedQueries("mission-cost");
      toast({ title: `Pedágio R$ ${tollAmount} registrado!`, description: `OS ${data.osNumber} · Custo + Cobrança` });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar pedágio", description: err.message, variant: "destructive" }),
  });

  const resetToll = () => {
    setTollOpen(false);
    setTollAmount("");
    setTollPhoto("");
    setTollSubmitted(false);
    setTollCameraMode(false);
  };

  const isAtDestination = currentStep === "chegada_destino";
  const isGoingToOrigin = currentStep === "em_transito_origem";
  const targetLat = isGoingToOrigin ? mission.originLat : mission.destinationLat;
  const targetLng = isGoingToOrigin ? mission.originLng : mission.destinationLng;
  const targetLabel = isGoingToOrigin ? "origem" : "destino";

  const GEOFENCE_RADIUS_KM = 15;
  const [refreshingGps, setRefreshingGps] = useState(false);

  useEffect(() => {
    setNearOrigin(false);
    setDistanceInfo(null);
  }, [currentStep]);

  const checkProximity = useCallback(async (forceFresh = false) => {
    if (!targetLat || !targetLng) return;
    let pos: { lat: string; lng: string } | null = null;
    if (isReadOnly && mission.agentLocation && !forceFresh) {
      pos = mission.agentLocation;
    } else {
      pos = await getPosition();
    }
    if (!pos) return;

    const lat1 = parseFloat(pos.lat);
    const lng1 = parseFloat(pos.lng);
    const lat2 = parseFloat(targetLat);
    const lng2 = parseFloat(targetLng);

    if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) return;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    setDistanceInfo(dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`);
    setNearOrigin(dist <= GEOFENCE_RADIUS_KM);
    return dist;
  }, [targetLat, targetLng, getPosition, isReadOnly, mission.agentLocation]);

  useEffect(() => {
    if (!targetLat || !targetLng) return;
    checkProximity();
    const interval = setInterval(() => checkProximity(), 30000);
    return () => clearInterval(interval);
  }, [targetLat, targetLng, checkProximity]);

  const handleForceGpsRefresh = async () => {
    setRefreshingGps(true);
    try {
      const dist = await checkProximity(true);
      if (dist === undefined) {
        toast({ title: "GPS indisponível", description: "Não foi possível obter a posição. Verifique se a localização está habilitada.", variant: "destructive" });
      } else {
        const distStr = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
        toast({ title: "GPS atualizado", description: `Distância até a ${targetLabel}: ${distStr}` });
      }
    } finally {
      setRefreshingGps(false);
    }
  };

  const getSuggestions = () => {
    const suggestions: string[] = [];
    if (nearOrigin && isGoingToOrigin) {
      suggestions.push("Na Origem");
    }
    if (nearOrigin && !isGoingToOrigin) {
      suggestions.push("Chegada no Destino");
    }
    suggestions.push("Missão segue padrão, sem novidades");
    suggestions.push("Trânsito intenso na rodovia");
    suggestions.push("Parada para abastecimento");
    suggestions.push("Pernoite");
    suggestions.push("Aguardando liberação");
    return suggestions;
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUpdatePhoto(reader.result as string);
      setUpdateStep("message");
    };
    reader.readAsDataURL(file);
  };

  const handleSkipPhoto = () => {
    setUpdatePhoto(null);
    setUpdateStep("message");
  };

  const handleCancelUpdate = () => {
    setUpdateStep("idle");
    setUpdatePhoto(null);
    setStatusUpdate("");
  };

  const handleSubmitUpdate = async () => {
    const success = await handleSendStatusUpdate(updatePhoto || undefined);
    if (success) {
      setUpdateStep("idle");
      setUpdatePhoto(null);
    }
  };

  return (
    <div className="space-y-4">
      {!isAtDestination && (
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center mx-auto mb-3 animate-pulse">
          <Car className="w-8 h-8 text-neutral-600" />
        </div>
        <p className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
          {isGoingToOrigin ? "Em deslocamento para origem" : "Em deslocamento para destino"}
        </p>
        {distanceInfo && (
          <p className="text-xs text-neutral-400 mt-1">
            Distância até {targetLabel}{isReadOnly ? " (agente)" : ""}: <span className="font-bold text-neutral-700">{distanceInfo}</span>
          </p>
        )}
        {!isReadOnly && targetLat && targetLng && (
          <button
            type="button"
            onClick={handleForceGpsRefresh}
            disabled={refreshingGps}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-60"
            data-testid="button-refresh-gps"
          >
            {refreshingGps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {refreshingGps ? "Atualizando GPS..." : "Atualizar GPS"}
          </button>
        )}
      </div>
      )}

      {nearOrigin && !isAtDestination && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex items-center gap-3" data-testid="alert-near-origin">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-800">Você está próximo da {targetLabel}!</p>
            <p className="text-[10px] text-emerald-600">Confirme a chegada quando estiver no local.</p>
          </div>
        </div>
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
        data-testid="input-update-photo"
      />

      {updateStep === "idle" && (
        <button
          onClick={() => setUpdateStep("photo")}
          disabled={submitting}
          className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          data-testid="button-start-update"
        >
          <Camera className="w-5 h-5" />
          Enviar Atualização
        </button>
      )}

      {updateStep === "photo" && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Camera className="w-4 h-4 text-neutral-700" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Etapa 1 — Foto da Situação</span>
          </div>
          <p className="text-xs text-neutral-500">Tire uma foto do momento atual da operação.</p>
          <button
            onClick={() => photoInputRef.current?.click()}
            className="w-full h-14 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98]"
            data-testid="button-take-photo"
          >
            <Camera className="w-5 h-5" />
            Tirar Foto
          </button>
          <button
            onClick={handleSkipPhoto}
            className="w-full h-10 bg-neutral-100 text-neutral-500 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center active:scale-[0.98]"
            data-testid="button-skip-photo"
          >
            Pular foto
          </button>
          <button
            onClick={handleCancelUpdate}
            className="w-full h-8 text-neutral-400 text-[10px] font-bold uppercase tracking-wider"
            data-testid="button-cancel-update"
          >
            Cancelar
          </button>
        </div>
      )}

      {updateStep === "message" && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-neutral-700" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Etapa 2 — Descreva a Situação</span>
          </div>

          {updatePhoto && (
            <div className="relative">
              <img src={updatePhoto} alt="Foto" className="w-full h-32 object-cover rounded-xl border border-neutral-200" />
              <button
                onClick={() => { setUpdatePhoto(null); setUpdateStep("photo"); }}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs"
                data-testid="button-retake-photo"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {getSuggestions().map((s, i) => (
              <button
                key={i}
                onClick={() => setStatusUpdate(s)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all active:scale-95 ${
                  statusUpdate === s
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-neutral-50 text-neutral-600 border-neutral-200"
                }`}
                data-testid={`suggestion-${i}`}
              >
                {s}
              </button>
            ))}
          </div>

          <textarea
            value={statusUpdate}
            onChange={(e) => setStatusUpdate(e.target.value)}
            placeholder="Ou digite sua mensagem..."
            className="w-full h-16 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400 resize-none"
            data-testid="input-status-update"
          />

          <button
            onClick={handleSubmitUpdate}
            disabled={submitting || !statusUpdate.trim()}
            className="w-full h-12 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            data-testid="button-send-status"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            Enviar Atualização
          </button>

          <button
            onClick={handleCancelUpdate}
            className="w-full h-8 text-neutral-400 text-[10px] font-bold uppercase tracking-wider"
            data-testid="button-cancel-update-msg"
          >
            Cancelar
          </button>
          <p className="text-[10px] text-neutral-400 text-center">Esta mensagem será enviada ao admin. Não avança a etapa.</p>
        </div>
      )}

      {!tollOpen && !tollCameraMode && !tollSubmitted && (
        <button
          onClick={() => setTollOpen(true)}
          className="w-full h-12 bg-amber-500 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] shadow-md shadow-amber-200"
          data-testid="button-open-toll"
        >
          <CircleDollarSign className="w-5 h-5" />
          + Lançar Pedágio
        </button>
      )}

      {tollCameraMode && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 p-4 space-y-3" data-testid="toll-camera-view">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Foto do Comprovante</span>
            <button onClick={stopTollCamera} className="text-xs text-neutral-500 font-bold" data-testid="button-toll-camera-back">Voltar</button>
          </div>
          <div className="bg-black rounded-xl overflow-hidden relative">
            <video ref={tollVideoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <button onClick={captureTollPhoto} className="w-full h-12 bg-white rounded-xl flex items-center justify-center gap-2 font-black text-neutral-900 uppercase tracking-wider text-sm active:bg-neutral-200" data-testid="button-toll-capture">
                <Camera className="w-5 h-5" /> Capturar
              </button>
            </div>
          </div>
          <canvas ref={tollCanvasRef} className="hidden" />
        </div>
      )}

      {tollOpen && !tollCameraMode && (
        <div className="bg-amber-50 rounded-2xl border-2 border-amber-300 p-4 space-y-4" data-testid="toll-modal">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-black text-amber-900 uppercase tracking-wider">Pedágio</span>
            </div>
            <button onClick={resetToll} className="text-xs text-neutral-500 font-bold" data-testid="button-toll-close">Fechar</button>
          </div>
          <div className="bg-white/70 rounded-xl px-3 py-2">
            <p className="text-[11px] text-amber-800">O valor será lançado como <span className="font-bold">Custo + Cobrança</span> nesta missão (repasse ao cliente).</p>
          </div>
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">Valor (R$)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={tollAmount}
                onChange={(e) => setTollAmount(maskBRL(e.target.value))}
                className="w-full h-12 pl-9 pr-4 border border-amber-200 rounded-xl text-lg font-bold text-neutral-900 bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                data-testid="input-toll-amount"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">Comprovante</label>
            {tollPhoto ? (
              <div className="relative">
                <img src={tollPhoto} alt="Comprovante" className="w-full aspect-[4/3] object-cover rounded-xl border border-amber-200" data-testid="img-toll-receipt" />
                <button onClick={() => { setTollPhoto(""); startTollCamera(); }} className="absolute top-2 right-2 bg-white/90 rounded-lg px-2 py-1 text-xs font-bold text-neutral-700 border" data-testid="button-toll-retake">Refazer</button>
              </div>
            ) : (
              <button onClick={startTollCamera} className="w-full h-20 border-2 border-dashed border-amber-300 rounded-xl flex flex-col items-center justify-center gap-1 active:bg-amber-100/50" data-testid="button-toll-camera">
                <Camera className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-bold text-amber-600 uppercase">Tirar Foto</span>
              </button>
            )}
          </div>
          <button
            onClick={() => tollMutation.mutate()}
            disabled={parseBRL(tollAmount) <= 0 || !tollPhoto || tollMutation.isPending}
            className="w-full h-12 bg-amber-600 text-white rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
            data-testid="button-toll-submit"
          >
            {tollMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : <><Receipt className="w-4 h-4" /> Confirmar Pedágio</>}
          </button>
        </div>
      )}

      {tollSubmitted && (
        <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-300 p-4 text-center space-y-3" data-testid="toll-success">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <p className="text-sm font-black text-emerald-900 uppercase tracking-wider">Pedágio Registrado!</p>
          <p className="text-xs text-emerald-700">R$ {tollAmount} · Custo + Cobrança na OS</p>
          <button onClick={resetToll} className="h-10 px-6 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider active:scale-[0.98]" data-testid="button-toll-done">OK</button>
        </div>
      )}

    </div>
  );
}

export default function MobileMissaoPage() {
  const { toast } = useToast();
  const { getPosition } = useGeoLocation();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [aiResults, setAiResults] = useState<Record<string, AiPhotoResult>>({});
  const [kmValue, setKmValue] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverPlate, setDriverPlate] = useState("");
  const [extraDrivers, setExtraDrivers] = useState<Array<{ name: string; phone: string; plate: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bypassAiRejection, setBypassAiRejection] = useState(false);
  const [cienteConfirmed, setCienteConfirmed] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [baseCleanStatus, setBaseCleanStatus] = useState<"limpa" | "suja" | "">("");
  const [baseCleanNotes, setBaseCleanNotes] = useState("");
  const [baseReturnKm, setBaseReturnKm] = useState("");
  const [baseChecklistOk, setBaseChecklistOk] = useState<Record<string, boolean>>({});
  const [statusUpdate, setStatusUpdate] = useState("");
  const [activeTab, setActiveTab] = useState<"missao" | "agendamentos">("missao");

  const urlParams = new URLSearchParams(window.location.search);
  const simulateOsId = urlParams.get("osId");
  const isReadOnly = urlParams.get("readOnly") === "true";

  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active", simulateOsId || "self"],
    queryFn: async () => {
      const url = simulateOsId ? `/api/mission/active?osId=${simulateOsId}` : "/api/mission/active";
      const r = await authFetch(url);
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 30000,
  });

  const { data: scheduledList = [] } = useQuery<any[]>({
    queryKey: ["/api/mission/scheduled"],
    enabled: activeTab === "agendamentos",
  });

  const currentStep = (mission?.missionStatus as MissionStep) || "aguardando";
  const config = stepConfig[currentStep] || stepConfig.aguardando;
  const Icon = config.icon;

  useEffect(() => {
    if (mission && currentStep === "checkin_dados_motorista") {
      if (mission.escortedDriverName && !driverName) setDriverName(mission.escortedDriverName);
      if (mission.escortedDriverPhone && !driverPhone) setDriverPhone(mission.escortedDriverPhone);
      if (mission.escortedVehiclePlate && !driverPlate) setDriverPlate(mission.escortedVehiclePlate);
      if (Array.isArray((mission as any).extraDrivers) && (mission as any).extraDrivers.length > 0 && extraDrivers.length === 0) {
        setExtraDrivers((mission as any).extraDrivers.map((d: any) => ({
          name: d?.name || "",
          phone: d?.phone || "",
          plate: d?.plate || "",
        })));
      }
    }
  }, [mission, currentStep]);

  const resetStepState = useCallback(() => {
    setPhotos({});
    setAiResults({});
    setKmValue("");
    setDriverName("");
    setDriverPhone("");
    setDriverPlate("");
    setExtraDrivers([]);
    setCienteConfirmed(false);
    setChecklist({});
    setStatusUpdate("");
    setBypassAiRejection(false);
  }, []);

  const [offlinePending, setOfflinePending] = useState(getPendingCount());
  const [online, setOnline] = useState(isOnline());
  const [reconnecting, setReconnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "pending" | "failed">("idle");
  const [manualRetrying, setManualRetrying] = useState(false);

  useEffect(() => {
    const updateOnline = () => {
      const isOn = navigator.onLine;
      setOnline(isOn);
      if (isOn) {
        setReconnecting(false);
        queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    let lastSeenEventId = 0;
    let wasIdle = true;
    const unsubscribe = subscribeQueue((info) => {
      setOfflinePending(info.pendingCount);
      setSyncStatus(info.status);
      if (info.status !== "syncing") {
        setManualRetrying(false);
      }
      if (info.status === "syncing" && wasIdle && info.pendingCount > 0) {
        toast({ title: "Enviando...", description: `${info.pendingCount} ação(ões) sendo sincronizada(s).` });
      }
      wasIdle = info.status !== "syncing";
      if (info.flushResult && info.flushResult.eventId > lastSeenEventId) {
        lastSeenEventId = info.flushResult.eventId;
        if (info.flushResult.sent > 0) {
          toast({ title: `${info.flushResult.sent} atualização(ões) enviada(s)!`, description: "Sincronizado com sucesso." });
          queryClient.invalidateQueries({ queryKey: ["/api/mission/active"] });
        }
        if (info.flushResult.failed > 0) {
          toast({ title: "Falha no envio", description: `${info.flushResult.failed} ação(ões) não puderam ser enviadas. Tente novamente.`, variant: "destructive" });
        }
      }
    });

    startOfflineSync();

    let reconnectTimer: ReturnType<typeof setInterval> | null = null;
    const startReconnectWatchdog = () => {
      if (reconnectTimer) return;
      setReconnecting(true);
      reconnectTimer = setInterval(async () => {
        if (navigator.onLine) {
          setReconnecting(false);
          if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
          try {
            await supabase.auth.refreshSession();
          } catch {}
          queryClient.invalidateQueries();
          return;
        }
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 4000);
          await fetch("/api/health", { signal: ctrl.signal });
          setOnline(true);
          setReconnecting(false);
          if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
          queryClient.invalidateQueries();
        } catch {}
      }, 5000);
    };

    const handleOffline = () => startReconnectWatchdog();
    window.addEventListener("offline", handleOffline);
    if (!navigator.onLine) startReconnectWatchdog();

    const tokenRefreshTimer = setInterval(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            fetch("/api/auth/token-failure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ error: error.message, trigger: "proactive_45min" }),
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        fetch("/api/auth/token-failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: err?.message || "unknown", trigger: "proactive_45min" }),
        }).catch(() => {});
      }
    }, 45 * 60 * 1000);

    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      if (wakeLock) return;
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
          wakeLock?.addEventListener("release", () => { wakeLock = null; });
        }
      } catch {}
    };
    requestWakeLock();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 4000);
          const res = await fetch("/api/health", { signal: ctrl.signal });
          if (res.ok) {
            setOnline(true);
            setReconnecting(false);
            if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
          }
        } catch {}
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            const { error } = await supabase.auth.refreshSession();
            if (error) {
              fetch("/api/auth/token-failure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: error.message, trigger: "visibility_change" }),
              }).catch(() => {});
            }
          }
        } catch {}
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimer) clearInterval(reconnectTimer);
      clearInterval(tokenRefreshTimer);
      if (wakeLock) { wakeLock.release().catch(() => {}); }
      unsubscribe();
    };
  }, []);

  const uploadPhoto = async (step: string, label: string, photoData: string, km?: number): Promise<AiPhotoResult | null> => {
    const pos = await getPosition();
    const payload = {
      serviceOrderId: mission.serviceOrderId,
      employeeId: mission.employeeId || 1,
      step,
      photoData,
      kmValue: km || null,
      latitude: pos?.lat || null,
      longitude: pos?.lng || null,
      notes: label,
    };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const res = await apiRequest("POST", "/api/mission/photo", payload);
      const data = await res.json();
      logAuditAction("photo_captured", "/mobile/missao", `Foto: ${label} | Etapa: ${step} | OS #${mission.serviceOrderId}${km ? ` | KM: ${km}` : ""}`);
      if (data.ai_inspection_status) {
        return { status: data.ai_inspection_status, result: data.ai_inspection_result };
      }
      return null;
    } catch (err) {
      if (isNetworkError(err)) {
        enqueueAction("/api/mission/photo", "POST", payload);
        toast({ title: "Foto salva localmente", description: "Será reenviada automaticamente quando o servidor responder." });
        logAuditAction("photo_captured", "/mobile/missao", `Foto: ${label} | Etapa: ${step} | OS #${mission.serviceOrderId}${km ? ` | KM: ${km}` : ""} (offline)`);
        return null;
      } else {
        throw err;
      }
    }
  };

  const uploadPhotoImmediate = async (label: string, photoData: string) => {
    if (!mission) return;
    setBypassAiRejection(false);
    const key = label.toLowerCase().replace(/\s/g, '-');
    const stepMap = PHOTO_STEP_MAP[currentStep] || {};
    const backendStep = stepMap[label] || currentStep;
    const km = config.needsKm ? parseInt(kmValue) : undefined;

    setAiResults(prev => ({ ...prev, [key]: { status: "uploading" } }));

    try {
      const aiResult = await uploadPhoto(backendStep, label, photoData, km);
      if (aiResult) {
        setAiResults(prev => ({ ...prev, [key]: aiResult }));
        if (aiResult.status === "aprovado") {
          toast({ title: `${label} — IA Aprovada`, description: aiResult.result?.observacao?.substring(0, 60) || "Foto dentro do padrão." });
        } else if (aiResult.status === "divergente") {
          toast({
            title: `${label} — Observação IA`,
            description: aiResult.result?.divergencias?.[0] || "A IA registrou uma observação.",
          });
        }
      } else {
        setAiResults(prev => ({ ...prev, [key]: { status: "aprovado" } }));
      }
    } catch (err: any) {
      setAiResults(prev => ({ ...prev, [key]: { status: "erro" } }));
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    }
  };

  const advanceMission = async () => {
    const fromStep = currentStep;
    const geo = await getPosition();
    const payload = {
      serviceOrderId: mission.serviceOrderId,
      latitude: geo?.lat || null,
      longitude: geo?.lng || null,
    };
    try {
      if (!navigator.onLine) throw new Error("offline");
      await apiRequest("POST", "/api/mission/advance", payload);
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (errMsg.includes("DRIVER_REQUIRED") || errMsg.includes("CONDUTOR_OBRIGATORIO")) {
        setDriverRequired(true);
        throw err;
      }
      if (isNetworkError(err)) {
        enqueueAction("/api/mission/advance", "POST", payload);
        toast({ title: "Avanço salvo localmente", description: "Será reenviado automaticamente quando o servidor responder." });
      } else {
        throw err;
      }
    }
    logAuditAction("mission_step_advance", "/mobile/missao", `Avançou de ${fromStep} | OS #${mission.serviceOrderId}`);
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

    const anyAnalyzing = Object.values(aiResults).some(r => r.status === "uploading" || r.status === "analisando");
    if (anyAnalyzing) {
      toast({ title: "Aguarde", description: "A IA ainda está analisando suas fotos.", variant: "destructive" });
      return;
    }

    const divergentPhotos = config.photos.filter(label => {
      const key = label.toLowerCase().replace(/\s/g, '-');
      return aiResults[key]?.status === "divergente";
    });
    if (divergentPhotos.length > 0 && !bypassAiRejection) {
      setBypassAiRejection(true);
      toast({
        title: "Fotos com divergência da IA",
        description: `Toque novamente em "Avançar" para prosseguir mesmo assim, ou tire novas fotos.`,
        variant: "destructive",
      });
      return;
    }
    if (bypassAiRejection) {
      setBypassAiRejection(false);
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
      await advanceMission();
      toast({ title: "Etapa concluída!" });
    } catch (err: any) {
      const msg = err.message || "Erro ao processar etapa";
      toast({ title: "Erro ao avançar", description: msg.includes("Fotos obrigatórias") ? "Envie todas as fotos obrigatórias antes de continuar." : msg, variant: "destructive" });
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
    const cleanedExtras = extraDrivers
      .map(d => ({
        name: d.name.trim(),
        phone: d.phone.trim() || null,
        plate: d.plate.trim().toUpperCase() || null,
      }))
      .filter(d => d.name.length > 0);
    const incompleteExtra = extraDrivers.some(d => d.name.trim() && !d.plate.trim());
    if (incompleteExtra) {
      toast({ title: "Comboio incompleto", description: "Informe a placa de cada motorista adicional ou remova-o.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/mission/escort-data", {
        serviceOrderId: mission.serviceOrderId,
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim() || null,
        vehiclePlate: driverPlate.trim().toUpperCase(),
        extraDrivers: cleanedExtras,
      });
      await advanceMission();
      toast({ title: "Dados salvos!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const [driverRequired, setDriverRequired] = useState(false);

  const handleStartMission = async () => {
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/mission/start", {
        serviceOrderId: mission.serviceOrderId,
      });
      await advanceMission();
      toast({ title: "Missão iniciada!" });
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("DRIVER_REQUIRED") || msg.includes("CONDUTOR_OBRIGATORIO")) {
        setDriverRequired(true);
      } else {
        toast({ title: "Erro", description: msg, variant: "destructive" });
      }
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
    if (config.needsKm && !kmValue.trim()) {
      toast({ title: "KM obrigatório", description: "Informe a quilometragem atual.", variant: "destructive" });
      return;
    }

    const anyAnalyzing = Object.values(aiResults).some(r => r.status === "uploading" || r.status === "analisando");
    if (anyAnalyzing) {
      toast({ title: "Aguarde", description: "A IA ainda está analisando suas fotos.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
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
    if (config.needsKm && !kmValue.trim()) {
      toast({ title: "KM obrigatório", description: "Informe a quilometragem atual.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (config.photos) {
        const stepMap = PHOTO_STEP_MAP[currentStep] || {};
        for (const label of config.photos) {
          const key = label.toLowerCase().replace(/\s/g, '-');
          const backendStep = stepMap[label] || currentStep;
          if (photos[key]) {
            const isKmPhoto = label === "Hodômetro";
            await uploadPhoto(backendStep, label, photos[key], isKmPhoto && config.needsKm ? parseInt(kmValue) : undefined);
          }
        }
      }
      await advanceMission();
      toast({ title: "Missão finalizada!", description: "Aguarde informações da base." });
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
      toast({ title: "Etapa avançada!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendStatusUpdate = async (photoDataUrl?: string): Promise<boolean> => {
    if (!statusUpdate.trim()) {
      toast({ title: "Informe o status", description: "Digite uma mensagem de atualização.", variant: "destructive" });
      return false;
    }
    setSubmitting(true);
    try {
      const pos = await getPosition();
      const payload = {
        serviceOrderId: mission.serviceOrderId,
        message: statusUpdate.trim(),
        missionStep: currentStep,
        latitude: pos?.lat || null,
        longitude: pos?.lng || null,
        photoUrl: photoDataUrl || null,
      };
      if (!navigator.onLine) throw new Error("offline");
      await apiRequest("POST", "/api/mission/update", payload);
      logAuditAction("mission_status_update", "/mobile/missao", `Status: ${statusUpdate.trim()} | Etapa: ${currentStep} | OS #${mission.serviceOrderId}`);
      toast({ title: "Atualização enviada!", description: "A central foi notificada, obrigado." });
      setStatusUpdate("");
      return true;
    } catch (err: any) {
      if (isNetworkError(err)) {
        const pos = await getPosition().catch(() => null);
        enqueueAction("/api/mission/update", "POST", {
          serviceOrderId: mission.serviceOrderId,
          message: statusUpdate.trim(),
          missionStep: currentStep,
          latitude: pos?.lat || null,
          longitude: pos?.lng || null,
          photoUrl: photoDataUrl || null,
        });
        toast({ title: "Atualização salva localmente", description: "Será reenviada automaticamente quando o servidor responder." });
        setStatusUpdate("");
        return true;
      }
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
      return false;
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

  const scheduledCount = (mission?.scheduledMissions?.length || 0) + scheduledList.length;

  if (!mission && activeTab === "missao") {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4">
          <div className="flex bg-neutral-100 rounded-2xl p-1">
            <button
              onClick={() => setActiveTab("missao")}
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-white text-neutral-900 shadow-sm"
              data-testid="tab-missao"
            >
              <Crosshair className="w-4 h-4 inline mr-1.5" />
              Missão
            </button>
            <button
              onClick={() => setActiveTab("agendamentos")}
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400"
              data-testid="tab-agendamentos"
            >
              <Calendar className="w-4 h-4 inline mr-1.5" />
              Agendamentos
            </button>
          </div>
          <div className="text-center min-h-[50vh] flex flex-col items-center justify-center" data-testid="mobile-no-mission">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-neutral-300" />
            </div>
            <h2 className="text-lg font-black text-neutral-800 uppercase tracking-wider mb-1">Nenhuma Missão</h2>
            <p className="text-sm text-neutral-400">Aguarde a atribuição de uma OS pelo admin.</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (activeTab === "agendamentos") {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4" data-testid="mobile-agendamentos-page">
          <div className="flex bg-neutral-100 rounded-2xl p-1">
            <button
              onClick={() => setActiveTab("missao")}
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400"
              data-testid="tab-missao"
            >
              <Crosshair className="w-4 h-4 inline mr-1.5" />
              Missão
            </button>
            <button
              onClick={() => setActiveTab("agendamentos")}
              className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-white text-neutral-900 shadow-sm"
              data-testid="tab-agendamentos"
            >
              <Calendar className="w-4 h-4 inline mr-1.5" />
              Agendamentos
            </button>
          </div>

          {scheduledList.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-7 h-7 text-neutral-300" />
              </div>
              <p className="text-sm font-bold text-neutral-500">Nenhum agendamento</p>
              <p className="text-xs text-neutral-400 mt-1">Você não tem missões agendadas no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider px-1">
                {scheduledList.length} agendamento{scheduledList.length > 1 ? "s" : ""}
              </p>
              {scheduledList.map((s: any) => (
                <div key={s.id} className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-2" data-testid={`scheduled-card-${s.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                        <Crosshair className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-neutral-900 uppercase tracking-wider">{s.osNumber}</p>
                        <p className="text-[10px] text-neutral-400">{s.scheduledDate ? new Date(parseUTCTimestamp(s.scheduledDate)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Agendada"}</p>
                      </div>
                    </div>
                    {s.priority === "imediata" && (
                      <span className="bg-red-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse">Imediata</span>
                    )}
                  </div>

                  {s.scheduledDate && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="font-semibold text-neutral-700">
                        {new Date(parseUTCTimestamp(s.scheduledDate)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" às "}
                        {new Date(parseUTCTimestamp(s.scheduledDate)).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}

                  {s.origin && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <MapPin className="w-3.5 h-3.5 text-green-500" />
                      <span className="truncate">{s.origin}</span>
                    </div>
                  )}
                  {s.destination && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <MapPin className="w-3.5 h-3.5 text-red-500" />
                      <span className="truncate">{s.destination}</span>
                    </div>
                  )}
                  {s.route && !s.origin && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Navigation className="w-3.5 h-3.5" />
                      <span className="truncate">{s.route}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </MobileLayout>
    );
  }

  if (!mission) {
    return (
      <MobileLayout>
        <div className="p-4">
          <div className="text-center min-h-[50vh] flex flex-col items-center justify-center" data-testid="mobile-no-mission">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-neutral-300" />
            </div>
            <h2 className="text-lg font-black text-neutral-800 uppercase tracking-wider mb-1">Nenhuma Missão</h2>
            <p className="text-sm text-neutral-400">Aguarde a atribuição de uma OS pelo admin.</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className={`p-4 space-y-4 ${isReadOnly ? "missao-readonly" : ""}`} data-testid="mobile-missao-page">
        {isReadOnly && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-2 flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Modo Observador — Somente Leitura</span>
          </div>
        )}
        <style>{`
          .missao-readonly button:not([data-testid="tab-missao"]):not([data-testid="tab-agendamentos"]),
          .missao-readonly input,
          .missao-readonly textarea,
          .missao-readonly select {
            pointer-events: none !important;
            opacity: 0.45 !important;
            cursor: not-allowed !important;
          }
          .missao-readonly a[href*="maps"],
          .missao-readonly a[href*="waze"] {
            pointer-events: auto !important;
            opacity: 1 !important;
          }
        `}</style>
        <div className="flex bg-neutral-100 rounded-2xl p-1">
          <button
            onClick={() => setActiveTab("missao")}
            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-white text-neutral-900 shadow-sm"
            data-testid="tab-missao"
          >
            <Crosshair className="w-4 h-4 inline mr-1.5" />
            Missão
          </button>
          <button
            onClick={() => setActiveTab("agendamentos")}
            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400 relative"
            data-testid="tab-agendamentos"
          >
            <Calendar className="w-4 h-4 inline mr-1.5" />
            Agendamentos
            {mission?.scheduledMissions?.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {mission.scheduledMissions.length}
              </span>
            )}
          </button>
        </div>
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

        {!online && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-3" data-testid="alert-offline">
            {reconnecting ? (
              <Loader2 className="w-5 h-5 text-red-500 shrink-0 animate-spin" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500 shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold text-red-700 uppercase">
                {reconnecting ? "Reconectando..." : "Sem conexão"}
              </p>
              <p className="text-[10px] text-red-500">
                {reconnecting
                  ? "Tentando reconectar a cada 5 segundos. Ações ficam salvas localmente."
                  : "Ações serão salvas e enviadas quando o sinal voltar."}
              </p>
            </div>
            {offlinePending > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{offlinePending}</span>
            )}
          </div>
        )}

        {online && offlinePending > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-3" data-testid="alert-syncing">
            {syncStatus === "syncing" || manualRetrying ? (
              <Loader2 className="w-5 h-5 text-amber-500 shrink-0 animate-spin" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-700 uppercase">
                {syncStatus === "syncing" || manualRetrying ? "Sincronizando..." : "Envio pendente"}
              </p>
              <p className="text-[10px] text-amber-500">
                {offlinePending} ação(ões) · será reenviado automaticamente
              </p>
            </div>
            {syncStatus !== "syncing" && !manualRetrying && (
              <button
                onClick={() => { setManualRetrying(true); forceFlush(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shrink-0 active:scale-95 transition-transform"
                data-testid="button-retry-sync"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reenviar
              </button>
            )}
          </div>
        )}

        <MobileTimeline stepLogs={mission.stepLogs || []} />

        {mission.missionStartedAt && !["finalizada", "retorno_base", "chegada_base", "encerrada"].includes(currentStep) && (
          <MissionTimer startedAt={mission.missionStartedAt} />
        )}

        {mission.missionStartedAt && ["em_transito_origem", "em_transito_destino"].includes(currentStep) && (
          <HourlyAlertBanner startedAt={mission.missionStartedAt} />
        )}

        <RouteInfoCard origin={mission.origin} destination={mission.destination} route={mission.route} currentStep={currentStep} />

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
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <p className="text-sm font-black text-emerald-800 uppercase tracking-wider">Missão Liberada</p>
              <p className="text-xs text-emerald-600">Inicie o check-in para começar a operação.</p>
            </div>

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
                  <span><strong className="text-neutral-700">Agente 1:</strong> {titleCase(mission.employee1Name)}</span>
                </div>
              )}
              {mission.employee2Name && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <User className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Agente 2:</strong> {titleCase(mission.employee2Name)}</span>
                </div>
              )}
              {mission.scheduledDate && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Bell className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Data/Hora:</strong> {new Date(parseUTCTimestamp(mission.scheduledDate)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
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

            <button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await advanceMission();
                  toast({ title: "Check-in iniciado!" });
                } catch (err: any) {
                  toast({ title: "Erro", description: err.message, variant: "destructive" });
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 shadow-lg"
              data-testid="button-iniciar-checkin"
            >
              {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6" />}
              Iniciar Check-in
            </button>
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
                  <span><strong className="text-neutral-700">Agente 1:</strong> {titleCase(mission.employee1Name)}</span>
                </div>
              )}
              {mission.employee2Name && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <User className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Agente 2:</strong> {titleCase(mission.employee2Name)}</span>
                </div>
              )}
              {mission.scheduledDate && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Bell className="w-3.5 h-3.5" />
                  <span><strong className="text-neutral-700">Data/Hora:</strong> {new Date(parseUTCTimestamp(mission.scheduledDate)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
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
              Iniciar Missão
            </button>
          </div>
        )}

        {currentStep === "checkout_armamento" && config.photos && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-emerald-700 font-medium">Validação IA ativa — cada foto será analisada automaticamente. Observações serão registradas no relatório.</p>
            </div>
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
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
                    hint="Número de série deve estar visível"
                  />
                );
              })}
            </div>
            <button
              onClick={handlePhotoStep}
              disabled={submitting}
              className={`w-full h-14 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 ${bypassAiRejection ? "bg-amber-600 text-white animate-pulse" : "bg-neutral-900 text-white"}`}
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {bypassAiRejection ? "Prosseguir mesmo assim" : "Confirmar"}
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
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
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
              className={`w-full h-14 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 ${bypassAiRejection ? "bg-amber-600 text-white animate-pulse" : "bg-neutral-900 text-white"}`}
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {bypassAiRejection ? "Prosseguir mesmo assim" : "Confirmar"}
            </button>
          </div>
        )}

        {config.photos && !config.needsKm && !config.needsChecklist && currentStep !== "aguardando" && currentStep !== "checkout_armamento" && currentStep !== "checkout_viatura" && currentStep !== "chegada_destino" && currentStep !== "chegada_base" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
                  />
                );
              })}
            </div>
            <button
              onClick={handlePhotoStep}
              disabled={submitting}
              className={`w-full h-14 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 ${bypassAiRejection ? "bg-amber-600 text-white animate-pulse" : "bg-neutral-900 text-white"}`}
              data-testid="button-confirm-photos"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {bypassAiRejection ? "Prosseguir mesmo assim" : "Confirmar"}
            </button>
          </div>
        )}

        {config.needsKm && currentStep !== "chegada_destino" && (
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
              {config.photos && config.photos.length > 0 && (
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Fotos Obrigatórias ({Object.keys(photos).length}/{config.photos.length})</label>
              )}
              {config.photos?.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                const isAgentPhoto = label === "Agente Equipado";
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
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
              {currentStep === "checkout_km_saida" ? "Liberar Viagem" : `Confirmar KM ${currentStep === "checkin_chegada_km" ? "Chegada" : ""}`}
            </button>
          </div>
        )}

        {(currentStep === "em_transito_origem" || currentStep === "em_transito_destino" || currentStep === "chegada_destino") && (
          <TransitStepView
            currentStep={currentStep}
            mission={mission}
            statusUpdate={statusUpdate}
            setStatusUpdate={setStatusUpdate}
            submitting={submitting}
            handleSendStatusUpdate={handleSendStatusUpdate}
            handleTransitAdvance={handleTransitAdvance}
            getPosition={getPosition}
            isReadOnly={isReadOnly}
          />
        )}

        {currentStep === "chegada_destino" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Chegou no Destino</h3>
              <p className="text-xs text-neutral-400 mb-1">Registre a foto do local, KM e hodômetro</p>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
              {config.photos?.map((label) => {
                const key = label.toLowerCase().replace(/\s/g, '-');
                return (
                  <CameraCapture
                    key={key}
                    label={label}
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
                    hint={label === "Hodômetro" ? "Foto do hodômetro com KM visível" : "Fotografia do local de destino/entrega"}
                  />
                );
              })}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">KM Final (Hodômetro)</p>
              <input
                type="number"
                inputMode="numeric"
                value={kmValue}
                onChange={(e) => setKmValue(e.target.value)}
                placeholder="Ex: 145320"
                className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-center text-lg font-mono font-bold text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                data-testid="input-km-final-destino"
              />
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
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Motorista 1 (principal)</span>
              </div>
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

            {extraDrivers.map((d, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4" data-testid={`card-extra-driver-${idx}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Motorista {idx + 2} (comboio)</span>
                  <button
                    type="button"
                    onClick={() => setExtraDrivers(prev => prev.filter((_, i) => i !== idx))}
                    className="text-[11px] font-bold text-red-600 hover:text-red-700 active:scale-95"
                    data-testid={`button-remove-extra-driver-${idx}`}
                  >
                    Remover
                  </button>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Nome do Motorista</label>
                  <input
                    type="text"
                    value={d.name}
                    onChange={(e) => setExtraDrivers(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                    placeholder="Nome completo"
                    className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                    data-testid={`input-extra-driver-name-${idx}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Telefone do Motorista</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={d.phone}
                    onChange={(e) => setExtraDrivers(prev => prev.map((x, i) => i === idx ? { ...x, phone: e.target.value } : x))}
                    placeholder="(11) 99999-9999"
                    className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400"
                    data-testid={`input-extra-driver-phone-${idx}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Placa do Veículo Escoltado</label>
                  <input
                    type="text"
                    value={d.plate}
                    onChange={(e) => setExtraDrivers(prev => prev.map((x, i) => i === idx ? { ...x, plate: e.target.value.toUpperCase() } : x))}
                    placeholder="ABC1D23"
                    maxLength={7}
                    className="w-full h-14 bg-neutral-50 border border-neutral-200 rounded-xl text-center text-lg font-mono font-bold text-neutral-900 placeholder:text-neutral-300 uppercase focus:outline-none focus:border-neutral-400"
                    data-testid={`input-extra-driver-plate-${idx}`}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setExtraDrivers(prev => [...prev, { name: "", phone: "", plate: "" }])}
              className="w-full h-12 bg-white border-2 border-dashed border-neutral-300 text-neutral-700 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] hover:border-neutral-400"
              data-testid="button-add-extra-driver"
            >
              <Plus className="w-4 h-4" />
              Adicionar Motorista (Comboio)
            </button>

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
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-1">Entregas Finalizadas</h3>
              <p className="text-sm text-neutral-500 mt-2">Aguarde a liberação da central para retornar à base.</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">Aguardando Liberação</p>
                <p className="text-[10px] text-amber-600">O admin irá liberar o retorno à base. Aguarde.</p>
              </div>
            </div>
          </div>
        )}

        {currentStep === "retorno_base" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Home className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">Retorno à Base Liberado</p>
                <p className="text-[10px] text-blue-600">Dirija-se à base. Ao chegar, clique no botão abaixo.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await advanceMission();
                  toast({ title: "Chegada registrada!", description: "Prossiga com o checklist da base." });
                } catch (err: any) {
                  toast({ title: "Erro", description: err.message, variant: "destructive" });
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-cheguei-base"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Home className="w-5 h-5" />}
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
                    onCapture={(data) => { setPhotos(prev => ({ ...prev, [key]: data })); uploadPhotoImmediate(label, data); }}
                    captured={!!photos[key]}
                    aiStatus={aiResults[key]?.status}
                    aiResult={aiResults[key]?.result}
                    onRetake={() => { setPhotos(prev => { const n = { ...prev }; delete n[key]; return n; }); setAiResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
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
                          const isBaseHodo = backendStep === "base_hodometro";
                          await uploadPhoto(backendStep, label, photos[key], isBaseHodo && baseReturnKm ? parseInt(baseReturnKm) : undefined);
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

      {driverRequired && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-6" data-testid="dialog-driver-required">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                <Car className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Condutor Obrigatório</h3>
              <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                Antes de iniciar a missão, você precisa registrar-se como condutor da viatura.
              </p>
            </div>
            <button
              onClick={() => { window.location.href = "/mobile/controle-condutor"; }}
              className="w-full h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98]"
              data-testid="button-go-driver-control"
            >
              <Car className="w-5 h-5" />
              Registrar Condutor
            </button>
            <button
              onClick={() => setDriverRequired(false)}
              className="w-full h-10 bg-neutral-100 text-neutral-600 rounded-2xl font-semibold text-xs uppercase tracking-wider"
              data-testid="button-dismiss-driver-required"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
