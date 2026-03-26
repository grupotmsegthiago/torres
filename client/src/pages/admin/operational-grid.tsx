import { useQuery, useMutation } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin, Power, Satellite, Signal, RefreshCw, Radio, ToggleLeft, ToggleRight,
  ExternalLink, Zap, CalendarClock, Recycle, Car, X,
  Building2, Navigation, Play, Flag, CircleCheckBig,
  Clock, Truck, CircleDot, Pause, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Timer, WifiOff,
  Info, Send, Plus, Pencil, Trash2, Copy, Users, FileText,
  Crosshair, Search, Minus, LocateFixed, ChevronRight,
  Bell, BellOff, MessageSquareText,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type OpNotifStatus = "pending" | "success" | "error";
type OpNotifType = "mirror" | "command";
interface OpNotification {
  id: string;
  type: OpNotifType;
  status: OpNotifStatus;
  plate: string;
  label: string;
  message?: string;
  createdAt: number;
}

interface OpNotifContextType {
  notifications: OpNotification[];
  addNotification: (n: Omit<OpNotification, "id" | "createdAt">) => string;
  updateNotification: (id: string, update: Partial<Pick<OpNotification, "status" | "message">>) => void;
}

const OpNotifContext = createContext<OpNotifContextType>({
  notifications: [],
  addNotification: () => "",
  updateNotification: () => {},
});

function useOpNotifications() {
  return useContext(OpNotifContext);
}

function OpNotifProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<OpNotification[]>([]);

  const addNotification = useCallback((n: Omit<OpNotification, "id" | "createdAt">) => {
    const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications(prev => [{ ...n, id, createdAt: Date.now() }, ...prev]);
    return id;
  }, []);

  const updateNotification = useCallback((id: string, update: Partial<Pick<OpNotification, "status" | "message">>) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...update, createdAt: Date.now() } : n));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications(prev => {
        const updated = prev.map(n => {
          if (n.status === "pending" && Date.now() - n.createdAt > 30000) {
            return { ...n, status: "error" as OpNotifStatus, message: "Tempo limite excedido. Tente novamente.", createdAt: Date.now() };
          }
          return n;
        });
        return updated.filter(n => {
          if (n.status === "pending") return true;
          return Date.now() - n.createdAt < 8000;
        }).slice(0, 10);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <OpNotifContext.Provider value={{ notifications, addNotification, updateNotification }}>
      {children}
    </OpNotifContext.Provider>
  );
}

function OperationNotificationsBar() {
  const { notifications } = useOpNotifications();
  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="operation-notifications">
      {notifications.map(n => {
        const isPending = n.status === "pending";
        const isSuccess = n.status === "success";
        const isError = n.status === "error";
        const isMirror = n.type === "mirror";

        const bgClass = isPending
          ? (isMirror ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200")
          : isSuccess
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200";

        const iconColor = isPending
          ? (isMirror ? "text-blue-500" : "text-amber-500")
          : isSuccess
            ? "text-emerald-500"
            : "text-red-500";

        const progressBarColor = isPending
          ? (isMirror ? "bg-blue-500" : "bg-amber-500")
          : isSuccess
            ? "bg-emerald-500"
            : "bg-red-500";

        return (
          <div
            key={n.id}
            className={`relative overflow-hidden rounded-lg border px-4 py-3 flex items-center gap-3 transition-all duration-300 ${bgClass}`}
            data-testid={`op-notif-${n.id}`}
          >
            {isPending && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-neutral-200/50">
                <div className={`h-full ${progressBarColor} animate-progress-bar`} />
              </div>
            )}
            <div className="flex-shrink-0">
              {isPending && <Loader2 className={`w-5 h-5 animate-spin ${iconColor}`} />}
              {isSuccess && <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />}
              {isError && <XCircle className={`w-5 h-5 ${iconColor}`} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-800 font-heading">
                  {isPending ? (isMirror ? "Espelhamento em Processo" : "Comando em Processo") : isSuccess ? (isMirror ? "Espelhamento Concluído" : "Comando Enviado") : (isMirror ? "Falha no Espelhamento" : "Falha no Comando")}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-neutral-900 text-white font-heading">
                  {n.plate}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 truncate">
                {isPending ? n.label : n.message || n.label}
              </p>
            </div>
            {isPending && (
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 animate-pulse">
                Aguarde...
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

declare global {
  interface Window {
    google: any;
    initGridMap: () => void;
  }
}

interface TrackedVehicle {
  id: number;
  plate: string;
  model: string;
  brand: string;
  year?: number | null;
  color: string | null;
  chassi?: string | null;
  renavam?: string | null;
  km?: number | null;
  initialKm?: number | null;
  lastKmUpdate?: string | null;
  status: string;
  hasTracker: boolean;
  trackerId: string | null;
  trackerType: string;
  truckscontrolIdentifier?: string | null;
  iconType?: string | null;
  noSignalSince?: string | null;
  deviceType?: "vehicle" | "spy";
  batteryLevel?: number;
  coupled?: boolean;
  photoFront?: string | null;
  lastAlert?: { eventType: string; value: number | null; details: string | null; createdAt: string | null } | null;
  idleSamePlace?: { count: number; isAlert: boolean } | null;
  tracker: {
    veiID?: number;
    latitude?: number;
    longitude?: number;
    ignition?: boolean;
    lastPositionTime?: string;
    gpsSignal?: boolean;
    speed?: number;
    address?: string;
    stoppedSince?: string | null;
    ignitionOnSince?: string | null;
    isLiveData?: boolean;
    voltage?: number;
  } | null;
  activeOs: {
    id: number;
    osNumber: string;
    missionStatus: string;
    scheduledDate?: string | null;
    clientName: string;
    priority: string;
    employee1: { id: number; name: string; phone: string | null; addressLat?: number | null; addressLng?: number | null } | null;
    employee2: { id: number; name: string; phone: string | null; addressLat?: number | null; addressLng?: number | null } | null;
    originLat?: number | null;
    originLng?: number | null;
    destinationLat?: number | null;
    destinationLng?: number | null;
  } | null;
  scheduledOs: {
    id: number;
    osNumber: string;
    scheduledDate: string | null;
  } | null;
}

interface GridEmployee {
  name: string;
  phone: string | null;
}

interface GridItem {
  id: number;
  osNumber: string;
  scheduledDate: string | null;
  status: string;
  priority: string;
  missionStatus: string;
  clientName: string;
  employee1: GridEmployee | null;
  employee2: GridEmployee | null;
  vehicle: {
    plate: string;
    model: string;
    hasTracker: boolean;
  } | null;
  tracker: {
    latitude?: number;
    longitude?: number;
    ignition?: boolean;
    lastPositionTime?: string;
    gpsSignal?: boolean;
    speed?: number;
    address?: string;
  } | null;
}

interface Gerenciadora {
  id: number;
  name: string;
  cnpj: string | null;
  apiUrl: string | null;
  apiKey: string | null;
  apiType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  active: number | null;
  notes: string | null;
  tcPermissaoComando: number | null;
  tcIE: number | null;
  tcTIE: number | null;
  tcValidade: string | null;
  tcPossoCancelar: number | null;
  tcComandoExclusivo: number | null;
  tcCompartilharDados: number | null;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getLastPositionInfo(lastPositionTime?: string) {
  if (!lastPositionTime) return { text: "—", color: "text-neutral-400", dotColor: "bg-neutral-300", diffMin: -1 };
  const diffMin = Math.floor((Date.now() - new Date(lastPositionTime).getTime()) / 60000);
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  if (diffMin > 30) return { text: timeStr, color: "text-neutral-500", dotColor: "bg-neutral-400", diffMin };
  if (diffMin > 5) return { text: timeStr, color: "text-neutral-600", dotColor: "bg-neutral-500", diffMin };
  return { text: timeStr, color: "text-neutral-800", dotColor: "bg-neutral-700", diffMin };
}

function getMissionLabel(status: string | null) {
  if (!status) return "—";
  switch (status) {
    case "missao_paga":
      return "Missão Paga";
    case "aguardando":
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return "Saída da Base";
    case "em_transito_origem":
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return "Chegada na Origem";
    case "iniciar_missao":
      return "Início de Missão";
    case "em_transito_destino":
      return "Chegada no Destino";
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return "Término de Missão";
    case "finalizada":
      return "Entregas Finalizadas";
    case "em_prontidao":
      return "Em Prontidão";
    case "retorno_base":
      return "Retorno à Base";
    case "chegada_base":
      return "Chegada na Base";
    case "encerrada":
      return "Operação Encerrada";
    default:
      return status;
  }
}

function getHoursUntilMission(scheduledDate: string | null | undefined): number | null {
  if (!scheduledDate) return null;
  const now = new Date();
  const scheduled = new Date(scheduledDate);
  return (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function getViaturaStatus(v: TrackedVehicle): { label: string; className: string; icon: typeof Truck } {
  if (v.activeOs) {
    const ms = v.activeOs.missionStatus;
    if (ms === "encerrada") {
      return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (ms === "missao_paga") {
      const hoursLeft = getHoursUntilMission(v.activeOs.scheduledDate);
      if (hoursLeft !== null && hoursLeft > 6) {
        return { label: "DISPONÍVEL", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      }
      if (hoursLeft !== null && hoursLeft > 5) {
        return { label: "ATENÇÃO", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 border-amber-200" };
      }
      return { label: "EM SERVIÇO", icon: Navigation, className: "bg-red-50 text-red-700 border-red-200" };
    }
    return { label: "EM SERVIÇO", icon: Navigation, className: "bg-red-50 text-red-700 border-red-200" };
  }
  if (v.scheduledOs) {
    const hoursLeft = getHoursUntilMission(v.scheduledOs.scheduledDate);
    if (hoursLeft !== null && hoursLeft > 6) {
      return { label: "DISPONÍVEL", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (hoursLeft !== null && hoursLeft > 5) {
      return { label: "ATENÇÃO", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    return { label: "EM SERVIÇO", icon: Navigation, className: "bg-red-50 text-red-700 border-red-200" };
  }
  return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function getPriorityDisplay(priority: string) {
  switch (priority) {
    case "imediata":
      return { label: "Imediata", icon: Zap, className: "bg-red-50 text-red-700 border-red-200" };
    case "agendada":
      return { label: "Agendada", icon: CalendarClock, className: "bg-blue-50 text-blue-700 border-blue-200" };
    case "reaproveitamento":
      return { label: "Reaproveitamento", icon: Recycle, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    default:
      return { label: priority, icon: CalendarClock, className: "bg-neutral-50 text-neutral-600 border-neutral-200" };
  }
}

function getStatusDisplay(missionStatus: string, osStatus: string) {
  if (osStatus === "aberta" || (osStatus === "agendada" && !missionStatus)) {
    return { label: "Aguardando Despacho", icon: Clock, className: "bg-slate-50 text-slate-600 border-slate-200" };
  }
  switch (missionStatus) {
    case "missao_paga":
      return { label: "Missão Paga", icon: Clock, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "aguardando":
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return { label: "Saída da Base", icon: Building2, className: "bg-amber-50 text-amber-700 border-amber-200" };
    case "em_transito_origem":
      return { label: "Chegada na Origem", icon: Navigation, className: "bg-blue-50 text-blue-700 border-blue-200" };
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return { label: "Chegada na Origem", icon: Navigation, className: "bg-cyan-50 text-cyan-700 border-cyan-200" };
    case "iniciar_missao":
      return { label: "Início de Missão", icon: Play, className: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "em_transito_destino":
      return { label: "Chegada no Destino", icon: Flag, className: "bg-violet-50 text-violet-700 border-violet-200" };
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return { label: "Término de Missão", icon: CircleCheckBig, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "finalizada":
      return { label: "Entregas Finalizadas", icon: CircleCheckBig, className: "bg-green-50 text-green-700 border-green-200" };
    case "em_prontidao":
      return { label: "Em Prontidão", icon: CircleDot, className: "bg-lime-50 text-lime-700 border-lime-200" };
    case "retorno_base":
      return { label: "Retorno à Base", icon: Navigation, className: "bg-sky-50 text-sky-700 border-sky-200" };
    case "chegada_base":
      return { label: "Chegada na Base", icon: Building2, className: "bg-teal-50 text-teal-700 border-teal-200" };
    case "encerrada":
      return { label: "Operação Encerrada", icon: CircleCheckBig, className: "bg-emerald-50 text-emerald-800 border-emerald-300" };
    default:
      return { label: missionStatus || "—", icon: CircleDot, className: "bg-neutral-50 text-neutral-600 border-neutral-200" };
  }
}

function isRodizioSP(plate: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const hour = now.getHours();
  const inWindow = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);
  if (!inWindow) return false;

  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const lastChar = cleanPlate.charAt(cleanPlate.length - 1);
  const lastDigit = parseInt(lastChar, 10);
  if (isNaN(lastDigit)) return false;

  const rodizioMap: Record<number, number[]> = {
    1: [1, 2],
    2: [3, 4],
    3: [5, 6],
    4: [7, 8],
    5: [9, 0],
  };

  return (rodizioMap[dayOfWeek] || []).includes(lastDigit);
}

function formatTimeDiff(since: string): string {
  const diffMin = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (diffMin < 1) return "< 1min";
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

function getIdleTime(v: TrackedVehicle): string | null {
  if (!v.tracker || v.tracker.ignition !== true) return null;
  if ((v.tracker.speed ?? 0) > 2) return null;
  if (v.tracker.stoppedSince) return formatTimeDiff(v.tracker.stoppedSince);
  if (!v.tracker.lastPositionTime) return null;
  return formatTimeDiff(v.tracker.lastPositionTime);
}

function getIdleMinutes(v: TrackedVehicle): number {
  if (!v.tracker || v.tracker.ignition !== true) return 0;
  if ((v.tracker.speed ?? 0) > 2) return 0;
  const since = v.tracker.stoppedSince || v.tracker.lastPositionTime;
  if (!since) return 0;
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000);
}

function getIgnitionOnTime(v: TrackedVehicle): string | null {
  if (!v.tracker || v.tracker.ignition !== true) return null;
  if (v.tracker.ignitionOnSince) return formatTimeDiff(v.tracker.ignitionOnSince);
  return null;
}

function getStoppedTime(v: TrackedVehicle): string | null {
  if (!v.tracker) return null;
  if ((v.tracker.speed ?? 0) > 2) return null;
  if (v.tracker.stoppedSince) return formatTimeDiff(v.tracker.stoppedSince);
  if (!v.tracker.lastPositionTime) return null;
  return formatTimeDiff(v.tracker.lastPositionTime);
}

function getNoSignalTime(v: TrackedVehicle): string | null {
  if (!v.noSignalSince) return null;
  return formatTimeDiff(v.noSignalSince);
}

function VehicleMap({ vehicles, focusVehicleId, onProximityChange }: { vehicles: TrackedVehicle[]; focusVehicleId?: number | null; onProximityChange?: (result: ProximityResult | null) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const carImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const circleRef = useRef<any>(null);
  const geofenceCirclesRef = useRef<any[]>([]);
  const centerMarkerRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<TrackedVehicle | null>(null);
  const [radiusActive, setRadiusActive] = useState(false);
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState(20);

  useEffect(() => {
    const sources: Record<string, string> = { polo: "/polo-icon.webp", kwid: "/kwid-icon.png" };
    Object.entries(sources).forEach(([key, src]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      carImagesRef.current[key] = img;
    });
  }, []);

  const loadGoogleMaps = useCallback(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    if (window.google?.maps?.Map) {
      setMapReady(true);
      return;
    }

    if (document.querySelector('script[src*="maps.googleapis.com/maps/api"]')) {
      const checkLoaded = setInterval(() => {
        if (window.google?.maps?.Map) {
          setMapReady(true);
          clearInterval(checkLoaded);
        }
      }, 200);
      return;
    }

    window.initGridMap = () => setMapReady(true);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=initGridMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: -20.5, lng: -47.5 },
        zoom: 7,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: window.google.maps.ControlPosition.TOP_RIGHT,
        },
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      });
    }

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    let hasPositions = false;

    vehicles.forEach((v) => {
      if (v.tracker?.latitude == null || v.tracker?.longitude == null) return;

      hasPositions = true;
      const position = { lat: v.tracker.latitude, lng: v.tracker.longitude };
      bounds.extend(position);

      const isSpy = v.deviceType === "spy";

      const getCarImageKey = (iconType?: string | null) => {
        if (iconType === "kwid") return "kwid";
        return "polo";
      };

      const buildCarIcon = (statusColor: string, plate: string, iconType?: string | null) => {
        const canvas = document.createElement("canvas");
        const size = 56;
        const labelH = 16;
        canvas.width = size;
        canvas.height = size + labelH;
        const ctx = canvas.getContext("2d")!;

        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 3;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = statusColor;
        ctx.stroke();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        const imgKey = getCarImageKey(iconType);
        const img = carImagesRef.current[imgKey];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
          ctx.clip();
          const imgSize = (r - 2) * 2;
          ctx.drawImage(img, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
          ctx.restore();
        }

        ctx.font = "bold 9px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const bx = cx;
        const by = size + labelH / 2;
        const pw = Math.max(ctx.measureText(plate).width + 10, 38);
        ctx.beginPath();
        ctx.roundRect(bx - pw / 2, size + 1, pw, labelH - 2, 3);
        ctx.fillStyle = statusColor;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(plate, bx, by);

        return canvas.toDataURL("image/png");
      };

      const buildSpyIcon = (coupled: boolean) => {
        const c = coupled ? "#7c3aed" : "#a855f7";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <defs><filter id="sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter></defs>
          <circle cx="14" cy="14" r="11" fill="${c}" stroke="#fff" stroke-width="2.5" filter="url(#sh2)"/>
          <circle cx="14" cy="14" r="4" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
          <circle cx="14" cy="14" r="1.5" fill="#fff"/>
          <line x1="14" y1="3" x2="14" y2="8" stroke="#fff" stroke-width="1" opacity="0.6"/>
          <line x1="14" y1="20" x2="14" y2="25" stroke="#fff" stroke-width="1" opacity="0.6"/>
          <line x1="3" y1="14" x2="8" y2="14" stroke="#fff" stroke-width="1" opacity="0.6"/>
          <line x1="20" y1="14" x2="25" y2="14" stroke="#fff" stroke-width="1" opacity="0.6"/>
        </svg>`;
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
      };

      let markerIcon: any;

      if (isSpy) {
        markerIcon = {
          url: buildSpyIcon(v.coupled || false),
          scaledSize: new window.google.maps.Size(28, 28),
          anchor: new window.google.maps.Point(14, 14),
        };
      } else {
        const isIgnitionOn = v.tracker.ignition === true;
        const isMoving = isIgnitionOn && (v.tracker.speed ?? 0) > 5;
        const hasNoSignal = v.tracker.isLiveData === false && !!v.noSignalSince;
        const statusColor = hasNoSignal ? "#6b7280" : isMoving ? "#22c55e" : isIgnitionOn ? "#f59e0b" : "#ef4444";
        markerIcon = {
          url: buildCarIcon(statusColor, v.plate, v.iconType),
          scaledSize: new window.google.maps.Size(48, 62),
          anchor: new window.google.maps.Point(24, 48),
        };
      }

      const marker = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        icon: markerIcon,
        title: isSpy ? `SPY: ${v.model}` : `${v.plate} - ${v.model}`,
      });

      let infoContent: string;
      if (isSpy) {
        infoContent = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; min-width: 200px; padding: 4px;">
            <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: #7c3aed;">🔍 ${v.model}</div>
            <div style="color: #666; font-size: 13px; margin-bottom: 6px;">${v.plate}</div>
            ${v.tracker.speed !== undefined ? `<div style="font-size: 13px;"><b>Vel:</b> ${v.tracker.speed} km/h</div>` : ""}
            ${v.batteryLevel !== undefined && v.batteryLevel >= 0 ? `<div style="font-size: 13px;"><b>Bateria:</b> ${v.batteryLevel}%</div>` : ""}
            <div style="font-size: 13px;"><b>Acoplado:</b> ${v.coupled ? "Sim ✅" : "Não ❌"}</div>
            ${v.tracker.address ? `<div style="font-size: 13px; color: #888; margin-top: 4px;">${v.tracker.address}</div>` : ""}
          </div>
        `;
      } else {
        const _idleT = getIdleTime(v);
        const _idleMin = getIdleMinutes(v);
        const _ignT = getIgnitionOnTime(v);
        const _stopT = getStoppedTime(v);
        const _noSigT = getNoSignalTime(v);
        const _isLive = v.tracker.isLiveData !== false;
        const _samePlaceAlert = v.idleSamePlace?.isAlert === true;
        const _samePlaceCount = v.idleSamePlace?.count ?? 0;
        const _statusText = _samePlaceAlert
          ? `🚨 ${_samePlaceCount} pos. mesmo lugar c/ motor`
          : _idleMin >= 5
          ? `⚠ Parado c/ motor há ${_idleT}`
          : _idleT
          ? `⏸ Parado c/ motor: ${_idleT}`
          : _stopT && !v.tracker.ignition
          ? `⏹ Parado há ${_stopT}`
          : v.tracker.speed && v.tracker.speed > 0
          ? `🚗 Em movimento`
          : _ignT
          ? `🔑 Motor ligado: ${_ignT}`
          : "—";
        const _statusColor = _samePlaceAlert || _idleMin >= 5 ? "#dc2626" : _idleT ? "#d97706" : _stopT ? "#dc2626" : v.tracker.speed && v.tracker.speed > 0 ? "#16a34a" : "#333";

        infoContent = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 4px; display: flex; gap: 14px; align-items: flex-start; min-width: ${v.photoFront ? '380px' : '240px'};">
            <div style="flex: 1; min-width: 0;">
              ${!_isLive && _noSigT ? `<div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 6px; background: #f3f4f6; padding: 3px 6px; border-radius: 4px; border: 1px solid #d1d5db;">📡 Sem sinal há ${_noSigT}</div>` : ""}
              ${!_isLive && !_noSigT ? `<div style="font-size: 11px; color: #f59e0b; font-weight: 600; margin-bottom: 4px;">⚠ Última posição conhecida</div>` : ""}
              <div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Placa:</span> <b>${v.plate.replace(/^(.{3})(.+)$/, "$1-$2")}</b></div>
              <div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Veículo:</span> <b>${v.brand} ${v.model}</b></div>
              <div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Status:</span> <span style="color: ${_statusColor}; font-weight: 600;">${_statusText}</span></div>
              <div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Ignição:</span> ${v.tracker.ignition ? "<b>Ligada ✅</b>" : "<b>Desligada ❌</b>"}</div>
              <div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Velocidade:</span> <b>${v.tracker.speed ?? 0} km/h</b></div>
              ${v.tracker.voltage != null && v.tracker.voltage > 0 ? `<div style="font-size: 13px; margin-bottom: 3px;"><span style="color: #888;">Bateria:</span> <b>${v.tracker.voltage.toFixed(1)}V</b></div>` : ""}
              ${v.tracker.lastPositionTime ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">🕐 ${new Date(v.tracker.lastPositionTime).toLocaleString("pt-BR")}</div>` : ""}
              ${v.tracker.address ? `<div style="font-size: 11px; color: #888; margin-top: 2px;">📍 ${v.tracker.address}</div>` : ""}
              ${v.activeOs ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 12px;"><b>OS:</b> ${v.activeOs.osNumber} · <b>${v.activeOs.clientName}</b><br/><span style="color: #666;">${getMissionLabel(v.activeOs.missionStatus)}</span></div>` : ""}
            </div>
            ${v.photoFront ? `<div style="flex-shrink: 0; width: 150px;"><img src="${v.photoFront}" style="width: 150px; height: 130px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb;" alt="${v.plate}" /></div>` : ""}
          </div>
        `;
      }

      const infoWindow = new window.google.maps.InfoWindow({ content: infoContent });
      marker.addListener("click", () => {
        infoWindow.open(mapInstanceRef.current, marker);
        setSelectedVehicle(v);
      });

      (marker as any)._vehicleId = v.id;
      markersRef.current.push(marker);
    });

    geofenceCirclesRef.current.forEach((c) => c.setMap(null));
    geofenceCirclesRef.current = [];

    const GEOFENCE_RADIUS = 1000;
    const geofenceColors = [
      { stroke: "#2563eb", fill: "#2563eb", label: "Origem" },
      { stroke: "#dc2626", fill: "#dc2626", label: "Destino" },
      { stroke: "#7c3aed", fill: "#7c3aed", label: "Agente 1" },
      { stroke: "#059669", fill: "#059669", label: "Agente 2" },
    ];

    vehicles.forEach((v) => {
      if (!v.activeOs || v.deviceType === "spy") return;
      const os = v.activeOs;

      const points: { lat: number | null | undefined; lng: number | null | undefined; colorIdx: number }[] = [
        { lat: os.originLat, lng: os.originLng, colorIdx: 0 },
        { lat: os.destinationLat, lng: os.destinationLng, colorIdx: 1 },
        { lat: os.employee1?.addressLat, lng: os.employee1?.addressLng, colorIdx: 2 },
        { lat: os.employee2?.addressLat, lng: os.employee2?.addressLng, colorIdx: 3 },
      ];

      points.forEach((pt) => {
        if (pt.lat == null || pt.lng == null) return;
        const color = geofenceColors[pt.colorIdx];
        const circle = new window.google.maps.Circle({
          center: { lat: pt.lat, lng: pt.lng },
          radius: GEOFENCE_RADIUS,
          map: mapInstanceRef.current,
          strokeColor: color.stroke,
          strokeOpacity: 0.6,
          strokeWeight: 2,
          fillColor: color.fill,
          fillOpacity: 0.08,
          clickable: false,
        });
        geofenceCirclesRef.current.push(circle);

        const labelMarker = new window.google.maps.Marker({
          position: { lat: pt.lat, lng: pt.lng },
          map: mapInstanceRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: color.fill,
            fillOpacity: 0.9,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          title: `${color.label} - ${os.osNumber}`,
          clickable: false,
        });
        geofenceCirclesRef.current.push(labelMarker);
      });
    });

    if (hasPositions && !radiusActive) {
      mapInstanceRef.current.fitBounds(bounds);
      if (markersRef.current.length === 1) {
        mapInstanceRef.current.setZoom(14);
      }
    }
  }, [mapReady, vehicles]);

  useEffect(() => {
    if (!mapReady || !searchInputRef.current || !window.google?.maps?.places) return;
    if (autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(searchInputRef.current, {
      componentRestrictions: { country: "br" },
      fields: ["geometry", "formatted_address", "name"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place?.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const label = place.formatted_address || place.name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setRadiusCenter({ lat, lng, label });
        setRadiusActive(true);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo({ lat, lng });
          const zoom = radiusKm <= 10 ? 12 : radiusKm <= 30 ? 10 : radiusKm <= 60 ? 9 : radiusKm <= 100 ? 8 : 7;
          mapInstanceRef.current.setZoom(zoom);
        }
      }
    });

    autocompleteRef.current = ac;
  }, [mapReady]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (centerMarkerRef.current) { centerMarkerRef.current.setMap(null); centerMarkerRef.current = null; }

    if (radiusActive && radiusCenter) {
      circleRef.current = new window.google.maps.Circle({
        center: { lat: radiusCenter.lat, lng: radiusCenter.lng },
        radius: radiusKm * 1000,
        map: mapInstanceRef.current,
        fillColor: "#2563eb",
        fillOpacity: 0.06,
        strokeColor: "#2563eb",
        strokeOpacity: 0.5,
        strokeWeight: 2,
      });

      const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="%232563eb" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="4" fill="white"/></svg>`;
      centerMarkerRef.current = new window.google.maps.Marker({
        position: { lat: radiusCenter.lat, lng: radiusCenter.lng },
        map: mapInstanceRef.current,
        icon: { url: "data:image/svg+xml;charset=UTF-8," + pinSvg, scaledSize: new window.google.maps.Size(32, 32), anchor: new window.google.maps.Point(16, 16) },
        title: radiusCenter.label,
        zIndex: 9999,
      });

      onProximityChange?.({ lat: radiusCenter.lat, lng: radiusCenter.lng, radiusKm, label: radiusCenter.label });
    } else {
      onProximityChange?.(null);
    }
  }, [radiusActive, radiusCenter, radiusKm]);

  const updateRadiusKm = (newR: number) => {
    setRadiusKm(newR);
    if (mapInstanceRef.current && radiusActive && radiusCenter) {
      const zoom = newR <= 10 ? 12 : newR <= 30 ? 10 : newR <= 60 ? 9 : newR <= 100 ? 8 : 7;
      mapInstanceRef.current.setZoom(zoom);
    }
  };

  const clearRadius = () => {
    setRadiusActive(false);
    setRadiusCenter(null);
    if (searchInputRef.current) searchInputRef.current.value = "";
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (centerMarkerRef.current) { centerMarkerRef.current.setMap(null); centerMarkerRef.current = null; }
    onProximityChange?.(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: -20.5, lng: -47.5 });
      mapInstanceRef.current.setZoom(7);
    }
  };

  const nearbyCount = radiusActive && radiusCenter
    ? vehicles.filter(v => v.deviceType !== "spy" && v.tracker?.latitude != null && v.tracker?.longitude != null && haversineDistance(radiusCenter.lat, radiusCenter.lng, v.tracker!.latitude!, v.tracker!.longitude!) <= radiusKm).length
    : 0;

  const pendingFocusRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focusVehicleId || !mapInstanceRef.current || !mapReady) {
      if (focusVehicleId) pendingFocusRef.current = focusVehicleId;
      return;
    }
    const doFocus = (id: number) => {
      const marker = markersRef.current.find((m: any) => m._vehicleId === id);
      if (marker) {
        mapInstanceRef.current.panTo(marker.getPosition());
        mapInstanceRef.current.setZoom(15);
        window.google.maps.event.trigger(marker, "click");
      }
    };
    doFocus(focusVehicleId);
    pendingFocusRef.current = null;
  }, [focusVehicleId, mapReady, vehicles]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="h-[400px] bg-neutral-100 rounded-lg flex items-center justify-center">
        <div className="text-center text-neutral-400">
          <MapPin className="w-10 h-10 mx-auto mb-2" />
          <p className="font-medium">Google Maps não configurado</p>
          <p className="text-xs mt-1">Configure VITE_GOOGLE_MAPS_API_KEY</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-neutral-200 shadow-sm">
      <div ref={mapRef} id="map-container" className="w-full h-[450px]" data-testid="map-container" />
      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg border border-neutral-200/80">
        <div className="flex items-center gap-4 text-xs font-medium text-neutral-700">
          <span className="flex items-center gap-2">
            <div className="w-5 h-7 rounded-sm border-2 flex items-center justify-center" style={{ borderColor: "#22c55e", background: "#1a1a1a" }}>
              <Car className="w-3 h-3" style={{ color: "#22c55e" }} />
            </div>
            Em movimento
          </span>
          <span className="flex items-center gap-2">
            <div className="w-5 h-7 rounded-sm border-2 flex items-center justify-center" style={{ borderColor: "#f59e0b", background: "#1a1a1a" }}>
              <Car className="w-3 h-3" style={{ color: "#f59e0b" }} />
            </div>
            Parado (ligado)
          </span>
          <span className="flex items-center gap-2">
            <div className="w-5 h-7 rounded-sm border-2 flex items-center justify-center" style={{ borderColor: "#ef4444", background: "#1a1a1a" }}>
              <Car className="w-3 h-3" style={{ color: "#ef4444" }} />
            </div>
            Desligado
          </span>
          <span className="flex items-center gap-2">
            <div className="w-5 h-7 rounded-sm border-2 flex items-center justify-center" style={{ borderColor: "#6b7280", background: "#1a1a1a" }}>
              <WifiOff className="w-3 h-3" style={{ color: "#6b7280" }} />
            </div>
            Sem sinal
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#8b5cf6", border: "2px solid #fff", boxShadow: "0 0 0 1px #8b5cf6" }}>
              <Radio className="w-2 h-2 text-white" />
            </div>
            SPY Tracker
          </span>
        </div>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-10" data-testid="map-radius-controls">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200/80 overflow-hidden" style={{ width: "300px" }}>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar cidade, rua ou endereço..."
              className="w-full h-10 pl-9 pr-3 text-sm border-none outline-none bg-transparent placeholder:text-neutral-400"
              data-testid="input-map-radius-search"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {radiusActive && radiusCenter && (
            <div className="border-t border-neutral-100 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Raio</span>
                <span className="text-sm font-bold text-blue-700 font-heading">{radiusKm} km</span>
              </div>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={radiusKm}
                onChange={(e) => updateRadiusKm(Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                data-testid="input-map-radius-slider"
              />
              <div className="flex gap-1">
                {[10, 25, 50, 100].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateRadiusKm(r)}
                    className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${radiusKm === r ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"}`}
                    data-testid={`button-map-radius-${r}`}
                  >
                    {r}km
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-blue-700 font-semibold">
                  {nearbyCount} {nearbyCount === 1 ? "viatura" : "viaturas"} no raio
                </span>
                <button
                  type="button"
                  onClick={clearRadius}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 transition-colors"
                  data-testid="button-map-clear-radius"
                >
                  <X className="w-3 h-3" />
                  Limpar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeedAlert({ vehicles }: { vehicles: TrackedVehicle[] }) {
  const speeding = vehicles.filter(
    (v) => v.deviceType !== "spy" && v.tracker?.speed !== undefined && v.tracker.speed > 110
  );

  if (speeding.length === 0) return null;

  return (
    <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 flex items-start gap-3" data-testid="alert-speed">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
      <div>
        <p className="font-bold text-red-800 text-sm">ALERTA DE VELOCIDADE</p>
        <div className="mt-1 space-y-0.5">
          {speeding.map((v) => (
            <p key={v.id} className="text-red-700 text-sm">
              <span className="font-mono font-bold">{v.plate}</span>
              <span className="mx-1">—</span>
              <span className="font-bold">{v.tracker!.speed} km/h</span>
              <span className="text-red-500 ml-1">({v.brand} {v.model})</span>
              {v.tracker?.address && <span className="text-red-400 ml-1 text-xs">· {v.tracker.address}</span>}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}


function VehicleBlockButton({ vehicle }: { vehicle: TrackedVehicle }) {
  const { toast } = useToast();
  const { addNotification, updateNotification } = useOpNotifications();
  const [confirming, setConfirming] = useState(false);

  const blockMutation = useMutation({
    mutationFn: async () => {
      const veiID = vehicle.tracker?.veiID || (vehicle.truckscontrolIdentifier ? parseInt(vehicle.truckscontrolIdentifier) : 0);
      if (!veiID) throw new Error("Sem veiID");
      const res = await authFetch(`/api/vehicles/truckscontrol/command/${veiID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "bloquear" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Erro ao bloquear");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Bloqueio enviado", description: `Comando de bloqueio enviado para ${vehicle.plate}` });
      setConfirming(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao bloquear", description: err.message, variant: "destructive" });
      setConfirming(false);
    },
  });

  if (!confirming) {
    return (
      <button
        className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 border border-red-300 rounded px-2 py-0.5 hover:bg-red-200 transition-colors"
        onClick={() => setConfirming(true)}
        data-testid={`btn-quick-block-${vehicle.id}`}
      >
        <Zap className="w-3 h-3" />
        Bloquear
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-600 border border-red-700 rounded px-2 py-0.5 hover:bg-red-700 transition-colors animate-pulse"
        onClick={() => blockMutation.mutate()}
        disabled={blockMutation.isPending}
        data-testid={`btn-confirm-block-${vehicle.id}`}
      >
        {blockMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
        Confirmar
      </button>
      <button
        className="text-xs text-neutral-400 hover:text-neutral-600"
        onClick={() => setConfirming(false)}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function VehicleInfoTooltip({ v }: { v: TrackedVehicle }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-neutral-400 hover:text-neutral-600 transition-colors" data-testid={`btn-info-vehicle-${v.id}`}>
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs p-3 text-xs space-y-1">
        <p className="font-bold text-sm">{v.brand} {v.model} {v.year || ""}</p>
        <p><span className="text-neutral-500">Placa:</span> <span className="font-mono">{v.plate}</span></p>
        {v.color && <p><span className="text-neutral-500">Cor:</span> {v.color}</p>}
        {v.chassi && <p><span className="text-neutral-500">Chassi:</span> <span className="font-mono text-xs">{v.chassi}</span></p>}
        {v.renavam && <p><span className="text-neutral-500">Renavam:</span> <span className="font-mono">{v.renavam}</span></p>}
        {(v.initialKm != null && v.initialKm > 0) && <p><span className="text-neutral-500">KM Inicial:</span> {v.initialKm.toLocaleString("pt-BR")}</p>}
        {v.km != null && v.km > 0 && <p><span className="text-neutral-500">KM Atual:</span> <span className="font-bold">{v.km.toLocaleString("pt-BR")}</span></p>}
        {v.lastKmUpdate && <p><span className="text-neutral-500">Atualizado:</span> {new Date(v.lastKmUpdate).toLocaleDateString("pt-BR")}</p>}
        <hr className="border-neutral-200 my-1" />
        <p><span className="text-neutral-500">Rastreador:</span> {v.trackerType === "truckscontrol" ? "TrucksControl" : v.trackerType === "custom" ? "API Custom" : v.trackerType === "none" ? "Nenhum" : v.trackerType || "Nenhum"}</p>
        {v.trackerId && <p><span className="text-neutral-500">ID:</span> <span className="font-mono">{v.trackerId}</span></p>}
        {v.truckscontrolIdentifier && <p><span className="text-neutral-500">TC ID:</span> <span className="font-mono">{v.truckscontrolIdentifier}</span></p>}
        <p><span className="text-neutral-500">Status:</span> {v.status}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function MirrorAllButton({ vehicles, gerenciadoras }: { vehicles: TrackedVehicle[]; gerenciadoras: Gerenciadora[] }) {
  const { toast } = useToast();
  const { addNotification, updateNotification } = useOpNotifications();
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"cadastro" | "espelhados" | "pendentes">("cadastro");
  const [espelharVeiID, setEspelharVeiID] = useState("");
  const [espelharGerId, setEspelharGerId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: "", cnpj: "", apiUrl: "", apiKey: "", apiType: "webhook",
    contactName: "", contactPhone: "", contactEmail: "", notes: "",
    tcPermissaoComando: 1, tcIE: 0, tcTIE: 0, tcValidade: "",
    tcPossoCancelar: 1, tcComandoExclusivo: 0, tcCompartilharDados: 0,
  });

  const espelhadosQuery = useQuery({
    queryKey: ["/api/truckscontrol/espelhados"],
    queryFn: async () => { const r = await authFetch("/api/truckscontrol/espelhados"); return r.json(); },
    enabled: open && activeTab === "espelhados",
    refetchOnWindowFocus: false,
  });

  const pendentesQuery = useQuery({
    queryKey: ["/api/truckscontrol/espelhamentos-pendentes"],
    queryFn: async () => { const r = await authFetch("/api/truckscontrol/espelhamentos-pendentes"); return r.json(); },
    enabled: open && activeTab === "pendentes",
    refetchOnWindowFocus: false,
  });

  const espelharMutation = useMutation({
    mutationFn: async ({ veiID, cnpj, options }: { veiID: number; cnpj: string; options: any }) => {
      const r = await authFetch("/api/truckscontrol/espelhar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiID, cnpj, ...options }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Espelhamento realizado", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhados"] });
      } else {
        toast({ title: "Falha no espelhamento", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const aceitarMutation = useMutation({
    mutationFn: async (veiID: number) => {
      const r = await authFetch("/api/truckscontrol/espelhamento/aceitar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiID }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "Aceito" : "Falha", description: data.message, variant: data.success ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhamentos-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhados"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const rejeitarMutation = useMutation({
    mutationFn: async (veiID: number) => {
      const r = await authFetch("/api/truckscontrol/espelhamento/rejeitar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiID }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "Rejeitado" : "Falha", description: data.message, variant: data.success ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhamentos-pendentes"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const cancelarMutation = useMutation({
    mutationFn: async ({ veiID, cnpj }: { veiID: number; cnpj: string }) => {
      const r = await authFetch("/api/truckscontrol/espelhamento/cancelar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiID, cnpj }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "Cancelado" : "Falha", description: data.message, variant: data.success ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhados"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const mirrorMutation = useMutation({
    mutationFn: async ({ gerenciadoraId, notifId }: { gerenciadoraId: number; notifId: string }) => {
      const onlyVehicles = vehicles.filter((v) => v.deviceType !== "spy");
      const vehicleData = onlyVehicles.map((v) => ({
        plate: v.plate, model: v.model, brand: v.brand,
        latitude: v.tracker?.latitude, longitude: v.tracker?.longitude,
        speed: v.tracker?.speed, ignition: v.tracker?.ignition,
        gpsSignal: v.tracker?.gpsSignal, address: v.tracker?.address,
        lastPositionTime: v.tracker?.lastPositionTime, activeOs: v.activeOs,
      }));
      const res = await authFetch(`/api/gerenciadoras/${gerenciadoraId}/mirror`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleData }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({ message: "Erro desconhecido" })); throw new Error(data.message); }
      const data = await res.json();
      return { ...data, notifId };
    },
    onSuccess: (data) => updateNotification(data.notifId, { status: "success", message: data.message }),
    onError: (err: Error, variables) => updateNotification(variables.notifId, { status: "error", message: err.message }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await authFetch("/api/gerenciadoras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Erro ao cadastrar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gerenciadoras"] });
      setShowAddForm(false); resetForm();
      toast({ title: "Gerenciadora cadastrada" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await authFetch(`/api/gerenciadoras/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gerenciadoras"] });
      setEditingId(null); resetForm();
      toast({ title: "Gerenciadora atualizada" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/gerenciadoras/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao remover");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gerenciadoras"] });
      toast({ title: "Gerenciadora removida" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", cnpj: "", apiUrl: "", apiKey: "", apiType: "webhook", contactName: "", contactPhone: "", contactEmail: "", notes: "", tcPermissaoComando: 1, tcIE: 0, tcTIE: 0, tcValidade: "", tcPossoCancelar: 1, tcComandoExclusivo: 0, tcCompartilharDados: 0 });
  };

  const startEdit = (g: Gerenciadora) => {
    setEditingId(g.id);
    setFormData({
      name: g.name, cnpj: g.cnpj || "", apiUrl: g.apiUrl || "", apiKey: g.apiKey || "",
      apiType: g.apiType || "webhook", contactName: g.contactName || "",
      contactPhone: g.contactPhone || "", contactEmail: g.contactEmail || "", notes: g.notes || "",
      tcPermissaoComando: g.tcPermissaoComando ?? 1, tcIE: g.tcIE ?? 0, tcTIE: g.tcTIE ?? 0,
      tcValidade: g.tcValidade || "", tcPossoCancelar: g.tcPossoCancelar ?? 1,
      tcComandoExclusivo: g.tcComandoExclusivo ?? 0, tcCompartilharDados: g.tcCompartilharDados ?? 0,
    });
    setShowAddForm(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    if (editingId) updateMutation.mutate({ id: editingId, data: formData });
    else createMutation.mutate(formData);
  };

  const handleEspelhar = () => {
    if (!espelharVeiID || !espelharGerId) return;
    const ger = gerenciadoras.find(g => g.id === Number(espelharGerId));
    if (!ger || !ger.cnpj) { toast({ title: "CNPJ da gerenciadora é obrigatório para espelhamento TC", variant: "destructive" }); return; }
    espelharMutation.mutate({
      veiID: Number(espelharVeiID),
      cnpj: ger.cnpj,
      options: {
        cmd: ger.tcPermissaoComando ?? 1,
        IE: ger.tcIE ?? 0,
        TIE: ger.tcTIE ?? 0,
        validade: ger.tcValidade || undefined,
        possoCancelar: ger.tcPossoCancelar ?? 1,
        comandoExclusivo: ger.tcComandoExclusivo ?? 0,
        compartilharDados: ger.tcCompartilharDados ?? 0,
      },
    });
  };

  const activeGerenciadoras = gerenciadoras.filter((g) => g.active !== 0);
  const tcVehicles = vehicles.filter(v => v.deviceType !== "spy" && v.tracker);

  const tabClass = (tab: string) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeTab === tab ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide text-neutral-300 border border-neutral-600 bg-neutral-800/50 hover:bg-neutral-700 hover:text-white transition-colors" data-testid="button-mirror">
          <Copy className="w-3 h-3" />
          Gerenciadoras
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Espelhamento — Gerenciadoras de Risco</DialogTitle>
          <DialogDescription>Gerencie gerenciadoras e espelhamento TrucksControl de veículos.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-2 mb-3">
          <button className={tabClass("cadastro")} onClick={() => { setActiveTab("cadastro"); setShowAddForm(false); }} data-testid="tab-cadastro">Cadastro</button>
          <button className={tabClass("espelhados")} onClick={() => setActiveTab("espelhados")} data-testid="tab-espelhados">Espelhados</button>
          <button className={tabClass("pendentes")} onClick={() => setActiveTab("pendentes")} data-testid="tab-pendentes">Pendentes</button>
        </div>

        {activeTab === "cadastro" && !showAddForm && (
          <div className="space-y-4">
            {activeGerenciadoras.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">Nenhuma gerenciadora cadastrada</p>
            ) : (
              <div className="space-y-2">
                {activeGerenciadoras.map((g) => (
                  <div key={g.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-neutral-50" data-testid={`gerenciadora-item-${g.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{g.name}</p>
                      {g.cnpj && <p className="text-xs text-neutral-500">{g.cnpj}</p>}
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {g.apiUrl && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono truncate max-w-[160px]">{g.apiType?.toUpperCase()}</span>}
                        <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">CMD: {g.tcPermissaoComando ? "Sim" : "Não"}</span>
                        {g.tcValidade && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">Val: {g.tcValidade}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(g)} data-testid={`btn-edit-gerenciadora-${g.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Remover ${g.name}?`)) deleteMutation.mutate(g.id); }} data-testid={`btn-delete-gerenciadora-${g.id}`}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      {g.apiUrl && (
                        <Button size="sm" onClick={() => {
                          const vCount = vehicles.filter(vv => vv.deviceType !== "spy").length;
                          const notifId = addNotification({ type: "mirror", status: "pending", plate: `${vCount} VTR(s)`, label: `Espelhando para ${g.name}...` });
                          mirrorMutation.mutate({ gerenciadoraId: g.id, notifId });
                        }} disabled={mirrorMutation.isPending} className="gap-1" data-testid={`btn-send-mirror-${g.id}`}>
                          <Send className="w-3.5 h-3.5" /> Webhook
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeGerenciadoras.length > 0 && tcVehicles.length > 0 && (
              <div className="border rounded-lg p-3 bg-neutral-50">
                <p className="text-xs font-semibold text-neutral-700 mb-2">Espelhar veículo via TrucksControl</p>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs text-neutral-500">Veículo (veiID)</Label>
                    <Select value={espelharVeiID} onValueChange={setEspelharVeiID}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-espelhar-vei"><SelectValue placeholder="Veículo" /></SelectTrigger>
                      <SelectContent>
                        {tcVehicles.map(v => (
                          <SelectItem key={v.id} value={String(v.tracker?.veiID || v.id)}>{v.plate} (veiID: {v.tracker?.veiID || "?"})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs text-neutral-500">Gerenciadora</Label>
                    <Select value={espelharGerId} onValueChange={setEspelharGerId}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-espelhar-ger"><SelectValue placeholder="Gerenciadora" /></SelectTrigger>
                      <SelectContent>
                        {activeGerenciadoras.filter(g => g.cnpj).map(g => (
                          <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" className="gap-1 h-8" onClick={handleEspelhar} disabled={!espelharVeiID || !espelharGerId || espelharMutation.isPending} data-testid="btn-espelhar-tc">
                    {espelharMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
                    Espelhar TC
                  </Button>
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full gap-1.5" onClick={() => { resetForm(); setEditingId(null); setShowAddForm(true); }} data-testid="btn-add-gerenciadora">
              <Plus className="w-4 h-4" /> Cadastrar Gerenciadora
            </Button>
          </div>
        )}

        {activeTab === "cadastro" && showAddForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nome *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nome da gerenciadora" data-testid="input-gerenciadora-name" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">CNPJ *</Label>
                <Input value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} placeholder="00.000.000/0001-00" data-testid="input-gerenciadora-cnpj" />
              </div>
            </div>

            <button
              type="button"
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 transition-colors pt-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
              data-testid="btn-toggle-advanced"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Configurações avançadas
            </button>

            {showAdvanced && (
              <>
                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div>
                    <Label className="text-xs">Tipo API</Label>
                    <Select value={formData.apiType} onValueChange={(v) => setFormData({ ...formData, apiType: v })}>
                      <SelectTrigger data-testid="select-gerenciadora-api-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="rest">REST API</SelectItem>
                        <SelectItem value="soap">SOAP / TrucksControl</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Chave/Token</Label>
                    <Input value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} placeholder="Bearer token ou API key" className="h-8" data-testid="input-gerenciadora-api-key" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">URL da API (webhook)</Label>
                    <Input value={formData.apiUrl} onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })} placeholder="https://api.gerenciadora.com/webhook" data-testid="input-gerenciadora-api-url" />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-neutral-700 mb-2">Configurações TrucksControl (Espelhamento)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Permissão de Comando</Label>
                      <Select value={String(formData.tcPermissaoComando)} onValueChange={(v) => setFormData({ ...formData, tcPermissaoComando: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-cmd"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Permitido</SelectItem>
                          <SelectItem value="0">Não permitido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Inteligência Embarcada (IE)</Label>
                      <Select value={String(formData.tcIE)} onValueChange={(v) => setFormData({ ...formData, tcIE: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-ie"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não permitido</SelectItem>
                          <SelectItem value="1">Permitido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Transferir IE no ato (TIE)</Label>
                      <Select value={String(formData.tcTIE)} onValueChange={(v) => setFormData({ ...formData, tcTIE: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-tie"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não transfere</SelectItem>
                          <SelectItem value="1">Transfere</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Validade (DD/MM/AAAA)</Label>
                      <Input value={formData.tcValidade} onChange={(e) => setFormData({ ...formData, tcValidade: e.target.value })} placeholder="21/03/2027" className="h-8" data-testid="input-tc-validade" />
                    </div>
                    <div>
                      <Label className="text-xs">Proprietário pode cancelar</Label>
                      <Select value={String(formData.tcPossoCancelar)} onValueChange={(v) => setFormData({ ...formData, tcPossoCancelar: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-cancelar"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Sim</SelectItem>
                          <SelectItem value="0">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Comando exclusivo</Label>
                      <Select value={String(formData.tcComandoExclusivo)} onValueChange={(v) => setFormData({ ...formData, tcComandoExclusivo: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-exclusivo"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não</SelectItem>
                          <SelectItem value="1">Sim</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Compartilhar dados</Label>
                      <Select value={String(formData.tcCompartilharDados)} onValueChange={(v) => setFormData({ ...formData, tcCompartilharDados: Number(v) })}>
                        <SelectTrigger className="h-8" data-testid="select-tc-compartilhar"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não</SelectItem>
                          <SelectItem value="1">Sim</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-neutral-700 mb-2">Contato</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nome</Label><Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} placeholder="Nome do contato" className="h-8" data-testid="input-gerenciadora-contact" /></div>
                    <div><Label className="text-xs">Telefone</Label><Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="(21) 99999-0000" className="h-8" data-testid="input-gerenciadora-phone" /></div>
                    <div className="col-span-2"><Label className="text-xs">E-mail</Label><Input value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="contato@gerenciadora.com" className="h-8" data-testid="input-gerenciadora-email" /></div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddForm(false); setEditingId(null); resetForm(); setShowAdvanced(false); }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending} data-testid="btn-save-gerenciadora">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        )}

        {activeTab === "espelhados" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs text-neutral-500">Veículos espelhados na conta TrucksControl (proprietário)</p>
              <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhados"] })} data-testid="btn-refresh-espelhados"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
            {espelhadosQuery.isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>}
            {espelhadosQuery.data && !espelhadosQuery.data.success && (
              <p className="text-xs text-red-500 text-center py-3">{espelhadosQuery.data.message}</p>
            )}
            {espelhadosQuery.data?.vehicles?.length === 0 && <p className="text-sm text-neutral-500 text-center py-4">Nenhum veículo espelhado</p>}
            {espelhadosQuery.data?.vehicles?.map((v: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 text-xs space-y-1" data-testid={`espelhado-${v.veiID}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">VeiID: {v.veiID}</p>
                    <p className="text-neutral-500">Cliente: {v.cliente || v.cgccpf}</p>
                  </div>
                  <Button variant="destructive" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { if (confirm(`Cancelar espelhamento do veículo ${v.veiID}?`)) cancelarMutation.mutate({ veiID: Number(v.veiID), cnpj: v.cgccpf }); }}
                    disabled={cancelarMutation.isPending}
                    data-testid={`btn-cancelar-espelhamento-${v.veiID}`}
                  >
                    <XCircle className="w-3 h-3" /> Cancelar
                  </Button>
                </div>
                <div className="flex gap-3 flex-wrap text-neutral-600">
                  <span>CMD: {v.cmd === "1" ? "Sim" : "Não"}</span>
                  <span>IE: {v.IE === "1" ? "Sim" : "Não"}</span>
                  <span>TIE: {v.TIE === "1" ? "Sim" : "Não"}</span>
                  <span>Validade: {v.validade || "—"}</span>
                  <span>Cancelável: {v.possoCancelar === "1" ? "Sim" : "Não"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "pendentes" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs text-neutral-500">Espelhamentos pendentes de aceitação</p>
              <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/truckscontrol/espelhamentos-pendentes"] })} data-testid="btn-refresh-pendentes"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
            {pendentesQuery.isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>}
            {pendentesQuery.data && !pendentesQuery.data.success && (
              <p className="text-xs text-red-500 text-center py-3">{pendentesQuery.data.message}</p>
            )}
            {pendentesQuery.data?.pendentes?.length === 0 && <p className="text-sm text-neutral-500 text-center py-4">Nenhum espelhamento pendente</p>}
            {pendentesQuery.data?.pendentes?.map((p: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 text-xs space-y-2" data-testid={`pendente-${p.veiID}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">Placa: {p.placa} — VeiID: {p.veiID}</p>
                    <p className="text-neutral-500">Proprietário: {p.prop}</p>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap text-neutral-600">
                  <span>CMD: {p.cmd === "1" ? "Sim" : "Não"}</span>
                  <span>IE: {p.IE === "1" ? "Sim" : "Não"}</span>
                  <span>TIE: {p.TIE === "1" ? "Sim" : "Não"}</span>
                  <span>Validade: {p.validade || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => aceitarMutation.mutate(Number(p.veiID))} disabled={aceitarMutation.isPending} data-testid={`btn-aceitar-${p.veiID}`}>
                    <CheckCircle2 className="w-3 h-3" /> Aceitar
                  </Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => rejeitarMutation.mutate(Number(p.veiID))} disabled={rejeitarMutation.isPending} data-testid={`btn-rejeitar-${p.veiID}`}>
                    <XCircle className="w-3 h-3" /> Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VehicleRowActions({ v, vehicles, gerenciadoras }: { v: TrackedVehicle; vehicles: TrackedVehicle[]; gerenciadoras: Gerenciadora[] }) {
  const { toast } = useToast();
  const { addNotification, updateNotification } = useOpNotifications();
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdConfirm, setCmdConfirm] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const [msgTexto, setMsgTexto] = useState("Motor Ligado com carro parado .. desligue o veículo!");

  const cmdLabels: Record<string, string> = { bloquear: "Bloquear", desbloquear: "Desbloquear", sirene: "Sirene/Alerta", aviso_cabine_on: "Aviso Cabine (Ligar)", aviso_cabine_off: "Aviso Cabine (Desligar)", mensagem_texto: "Mensagem de Texto" };

  const commandMutation = useMutation({
    mutationFn: async ({ vehicleId, command, notifId, mensagem }: { vehicleId: number; command: string; notifId: string; mensagem?: string }) => {
      const res = await authFetch("/api/truckscontrol/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, command, mensagem }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Erro ao enviar comando");
      return { ...data, notifId };
    },
    onSuccess: (data) => {
      updateNotification(data.notifId, { status: "success", message: data.message });
      setCmdOpen(false);
      setCmdConfirm(null);
    },
    onError: (err: Error & { notifId?: string }, variables) => {
      updateNotification(variables.notifId, { status: "error", message: err.message });
      setCmdConfirm(null);
    },
  });

  const handleCommand = (command: string) => {
    if (cmdConfirm === command) {
      const notifId = addNotification({
        type: "command",
        status: "pending",
        plate: v.plate,
        label: `Enviando comando "${cmdLabels[command] || command}" para ${v.plate}...`,
      });
      const mensagem = command === "mensagem_texto" ? msgTexto : undefined;
      commandMutation.mutate({ vehicleId: v.id, command, notifId, mensagem });
    } else {
      setCmdConfirm(command);
    }
  };

  const mirrorMutation = useMutation({
    mutationFn: async ({ gerenciadoraId, notifId }: { gerenciadoraId: number; notifId: string }) => {
      const vehicleData = [{
        plate: v.plate, model: v.model, brand: v.brand,
        latitude: v.tracker?.latitude, longitude: v.tracker?.longitude,
        speed: v.tracker?.speed, ignition: v.tracker?.ignition,
        gpsSignal: v.tracker?.gpsSignal, address: v.tracker?.address,
        lastPositionTime: v.tracker?.lastPositionTime, activeOs: v.activeOs,
      }];
      const res = await authFetch(`/api/gerenciadoras/${gerenciadoraId}/mirror`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleData }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Erro");
      const data = await res.json();
      return { ...data, notifId };
    },
    onSuccess: (data) => updateNotification(data.notifId, { status: "success", message: data.message }),
    onError: (err: Error, variables) => updateNotification(variables.notifId, { status: "error", message: err.message }),
  });

  const activeGerenciadoras = gerenciadoras.filter(g => g.active !== 0);

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 transition-colors"
            onClick={() => navigate(`/admin/service-orders?newOs=1&vehicleId=${v.id}`)}
            data-testid={`btn-new-os-${v.id}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Nova OS</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors"
            onClick={() => navigate(`/admin/vehicles?id=${v.id}`)}
            data-testid={`btn-docs-vtr-${v.id}`}
          >
            <FileText className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Docs VTR</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 transition-colors"
            onClick={() => setMirrorOpen(true)}
            data-testid={`btn-mirror-${v.id}`}
          >
            <Copy className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Espelhar</TooltipContent>
      </Tooltip>
      <Dialog open={mirrorOpen} onOpenChange={setMirrorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Espelhar — {v.plate}</DialogTitle>
            <DialogDescription className="text-xs">Enviar posição deste veículo para a gerenciadora.</DialogDescription>
          </DialogHeader>
          {activeGerenciadoras.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-3">Nenhuma gerenciadora cadastrada</p>
          ) : (
            <div className="space-y-2">
              {activeGerenciadoras.map(g => (
                <button
                  key={g.id}
                  className="w-full flex items-center justify-between rounded-lg border p-2.5 hover:bg-neutral-50 transition-colors text-left"
                  onClick={() => {
                    const notifId = addNotification({
                      type: "mirror",
                      status: "pending",
                      plate: v.plate,
                      label: `Espelhando ${v.plate} para ${g.name}...`,
                    });
                    mirrorMutation.mutate({ gerenciadoraId: g.id, notifId });
                    setMirrorOpen(false);
                  }}
                  disabled={mirrorMutation.isPending || !g.apiUrl}
                  data-testid={`btn-mirror-send-${g.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">{g.name}</p>
                    {g.cnpj && <p className="text-xs text-neutral-400">{g.cnpj}</p>}
                  </div>
                  <Send className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 transition-colors"
            onClick={() => setCmdOpen(true)}
            data-testid={`btn-command-${v.id}`}
          >
            <Zap className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Enviar Comando</TooltipContent>
      </Tooltip>
      <Dialog open={cmdOpen} onOpenChange={(open) => { setCmdOpen(open); if (!open) setCmdConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Comando — {v.plate}</DialogTitle>
            <DialogDescription className="text-xs">Enviar comando remoto ao rastreador do veículo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {v.hasTracker ? (
              <>
                <button
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${cmdConfirm === "bloquear" ? "bg-red-50 border-red-300 ring-1 ring-red-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("bloquear")}
                  disabled={commandMutation.isPending}
                  data-testid={`btn-cmd-block-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><XCircle className="w-4 h-4 text-red-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Bloquear</p>
                    <p className="text-xs text-neutral-400">{cmdConfirm === "bloquear" ? "Clique novamente para confirmar" : "Cortar combustível remotamente"}</p>
                  </div>
                  {commandMutation.isPending && cmdConfirm === "bloquear" && <Loader2 className="w-4 h-4 animate-spin text-red-500" />}
                </button>
                <button
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${cmdConfirm === "desbloquear" ? "bg-green-50 border-green-300 ring-1 ring-green-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("desbloquear")}
                  disabled={commandMutation.isPending}
                  data-testid={`btn-cmd-unblock-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Desbloquear</p>
                    <p className="text-xs text-neutral-400">{cmdConfirm === "desbloquear" ? "Clique novamente para confirmar" : "Liberar combustível"}</p>
                  </div>
                  {commandMutation.isPending && cmdConfirm === "desbloquear" && <Loader2 className="w-4 h-4 animate-spin text-green-500" />}
                </button>
                <button
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${cmdConfirm === "sirene" ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("sirene")}
                  disabled={commandMutation.isPending}
                  data-testid={`btn-cmd-siren-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Sirene / Alerta</p>
                    <p className="text-xs text-neutral-400">{cmdConfirm === "sirene" ? "Clique novamente para confirmar" : "Ativar sirene do rastreador"}</p>
                  </div>
                  {commandMutation.isPending && cmdConfirm === "sirene" && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
                </button>

                <div className="border-t border-neutral-100 my-1" />
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-1">Aviso de Cabine</p>

                <button
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${cmdConfirm === "aviso_cabine_on" ? "bg-violet-50 border-violet-300 ring-1 ring-violet-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("aviso_cabine_on")}
                  disabled={commandMutation.isPending}
                  data-testid={`btn-cmd-cabin-on-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center"><Bell className="w-4 h-4 text-violet-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Ligar Aviso de Cabine</p>
                    <p className="text-xs text-neutral-400">{cmdConfirm === "aviso_cabine_on" ? "Clique novamente para confirmar" : "Ativar alerta sonoro na cabine"}</p>
                  </div>
                  {commandMutation.isPending && cmdConfirm === "aviso_cabine_on" && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
                </button>
                <button
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${cmdConfirm === "aviso_cabine_off" ? "bg-neutral-50 border-neutral-300 ring-1 ring-neutral-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("aviso_cabine_off")}
                  disabled={commandMutation.isPending}
                  data-testid={`btn-cmd-cabin-off-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center"><BellOff className="w-4 h-4 text-neutral-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Desligar Aviso de Cabine</p>
                    <p className="text-xs text-neutral-400">{cmdConfirm === "aviso_cabine_off" ? "Clique novamente para confirmar" : "Desativar alerta sonoro"}</p>
                  </div>
                  {commandMutation.isPending && cmdConfirm === "aviso_cabine_off" && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
                </button>

                <div className="border-t border-neutral-100 my-1" />
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-1">Mensagem de Texto</p>

                <div className="rounded-lg border p-3 space-y-2">
                  <textarea
                    className="w-full text-sm border border-neutral-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                    rows={2}
                    value={msgTexto}
                    onChange={(e) => setMsgTexto(e.target.value)}
                    placeholder="Digite a mensagem..."
                    data-testid={`input-msg-texto-${v.id}`}
                  />
                  <button
                    className={`w-full flex items-center gap-3 rounded-lg border p-2.5 transition-colors text-left ${cmdConfirm === "mensagem_texto" ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200" : "hover:bg-neutral-50"}`}
                    onClick={() => handleCommand("mensagem_texto")}
                    disabled={commandMutation.isPending || !msgTexto.trim()}
                    data-testid={`btn-cmd-msg-${v.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><MessageSquareText className="w-4 h-4 text-blue-500" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Enviar Mensagem</p>
                      <p className="text-xs text-neutral-400">{cmdConfirm === "mensagem_texto" ? "Clique novamente para confirmar" : "Enviar texto para display do veículo"}</p>
                    </div>
                    {commandMutation.isPending && cmdConfirm === "mensagem_texto" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-400 text-center py-3">Veículo sem rastreador configurado</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VehicleTable({ vehicles, gridData, gerenciadoras, onFocusVehicle, onSelectOsVehicle }: { vehicles: TrackedVehicle[]; gridData: GridItem[]; gerenciadoras: Gerenciadora[]; onFocusVehicle?: (id: number) => void; onSelectOsVehicle?: (id: number) => void }) {
  const [expanded, setExpanded] = useState(true);

  const onlyVehicles = vehicles.filter(v => v.deviceType !== "spy");

  return (
    <Card className="overflow-hidden shadow-sm border-0 ring-1 ring-neutral-200">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors"
        style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)" }}
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-vehicles-table"
      >
        <div className="flex items-center gap-2.5">
          <Truck className="w-4 h-4 text-neutral-300" />
          <h2 className="font-bold text-sm text-white tracking-wide uppercase font-heading" style={{ letterSpacing: "0.08em" }}>Veículos</h2>
          <span className="text-xs text-neutral-400 font-medium ml-0.5">({onlyVehicles.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <MirrorAllButton vehicles={vehicles} gerenciadoras={gerenciadoras} />
          {expanded
            ? <ChevronUp className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
            : <ChevronDown className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
          }
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="table-vehicles-tracking">
            <thead>
              <tr className="font-heading" style={{ background: "linear-gradient(180deg, #f5f5f5 0%, #ebebeb 100%)" }}>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap w-10">#</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Veículo</th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Ignição</th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">GPS</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Localização</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Última Pos.</th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Velocidade</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Últ. Alerta</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Agentes</th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">OS / Status</th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Viatura</th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {onlyVehicles.map((v, index) => {
                const posInfo = getLastPositionInfo(v.tracker?.lastPositionTime);
                const hasLocation = v.tracker?.latitude != null && v.tracker?.longitude != null;
                const mapsUrl = hasLocation
                  ? `https://www.google.com/maps?q=${v.tracker!.latitude},${v.tracker!.longitude}`
                  : null;
                const rodizio = isRodizioSP(v.plate);
                const idleTime = getIdleTime(v);
                const idleMin = getIdleMinutes(v);
                const ignitionOnTime = getIgnitionOnTime(v);
                const stoppedTime = getStoppedTime(v);
                const noSignalTime = getNoSignalTime(v);
                const isOverSpeed = v.tracker?.speed !== undefined && v.tracker.speed > 110;
                const isIdleAlert = idleMin >= 5;
                const samePlaceAlert = v.idleSamePlace?.isAlert === true;
                const samePlaceCount = v.idleSamePlace?.count ?? 0;
                const isIgnOn = v.tracker?.ignition === true;
                const isMov = isIgnOn && (v.tracker?.speed ?? 0) > 5;
                const statusColor = noSignalTime ? "#6b7280" : isMov ? "#22c55e" : isIgnOn ? "#f59e0b" : "#ef4444";
                const isLive = v.tracker?.isLiveData !== false;

                return (
                  <tr
                    key={v.id}
                    className={`transition-colors ${
                      samePlaceAlert ? "bg-red-50/80 hover:bg-red-50" :
                      isOverSpeed ? "bg-red-50/80 hover:bg-red-50" :
                      isIdleAlert ? "bg-amber-50/60 hover:bg-amber-50" :
                      rodizio ? "bg-red-50/30 hover:bg-red-50/50" :
                      index % 2 === 0 ? "bg-white hover:bg-neutral-50/80" : "bg-neutral-50/30 hover:bg-neutral-50/80"
                    }`}
                    data-testid={`row-vehicle-${v.id}`}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-neutral-900 text-white font-bold text-xs shadow-sm">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </td>

                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0 shadow-sm" style={{ borderColor: statusColor }}>
                          <img src={v.iconType === "kwid" ? "/kwid-icon.png" : "/polo-icon.webp"} alt="VTR" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-extrabold text-sm tracking-wide ${rodizio ? "text-red-600" : "text-neutral-900"}`}>
                              {v.plate}
                            </span>
                            {rodizio && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-xs px-2 py-0.5 bg-red-600 text-white rounded font-bold uppercase animate-pulse shadow-sm">Rodízio SP</span>
                                </TooltipTrigger>
                                <TooltipContent>Veículo em rodízio hoje em São Paulo (7h-10h / 17h-20h)</TooltipContent>
                              </Tooltip>
                            )}
                            {v.trackerType === "truckscontrol" && (
                              <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded font-bold uppercase">TC</span>
                            )}
                            {isOverSpeed && (
                              <span className="text-xs px-2 py-0.5 bg-red-600 text-white rounded font-bold shadow-sm">
                                {v.tracker!.speed} km/h
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5 leading-tight" style={{ fontWeight: 400 }}>
                            {v.brand} {v.model}
                            {v.year ? ` ${v.year}` : ""}
                            {v.color ? <span className="text-neutral-400"> · {v.color}</span> : ""}
                          </p>
                        </div>
                        <VehicleInfoTooltip v={v} />
                      </div>
                    </td>

                    <td className="px-2 py-1.5 text-center">
                      {!v.hasTracker ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <ToggleLeft className="w-5 h-5 mx-auto text-neutral-300" />
                          </TooltipTrigger>
                          <TooltipContent>Sem integração / rastreador</TooltipContent>
                        </Tooltip>
                      ) : v.tracker?.ignition === undefined ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <ToggleLeft className="w-5 h-5 mx-auto text-amber-500" />
                          </TooltipTrigger>
                          <TooltipContent>Sem informação de ignição</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            {v.tracker.ignition
                              ? <ToggleRight className="w-5 h-5 mx-auto text-emerald-600" />
                              : <ToggleLeft className="w-5 h-5 mx-auto text-neutral-400" />
                            }
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.ignition ? "Ignição Ligada" : "Ignição Desligada"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    <td className="px-2 py-1.5 text-center">
                      {!v.hasTracker ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className="w-4 h-4 mx-auto text-neutral-300" />
                          </TooltipTrigger>
                          <TooltipContent>Sem integração / rastreador</TooltipContent>
                        </Tooltip>
                      ) : v.tracker?.gpsSignal === undefined ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className="w-4 h-4 mx-auto text-neutral-400" />
                          </TooltipTrigger>
                          <TooltipContent>Sem informação de GPS</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className={`w-4 h-4 mx-auto ${v.tracker.gpsSignal ? "text-emerald-600" : "text-neutral-400"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.gpsSignal ? "GPS OK" : "GPS sem sinal"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>


                    <td className="px-2 py-1.5 max-w-[200px]">
                      {v.tracker?.address ? (
                        <button
                          type="button"
                          onClick={() => { if (hasLocation && onFocusVehicle) { onFocusVehicle(v.id); document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "center" }); } }}
                          className={`inline-flex items-start gap-1.5 group text-left ${hasLocation ? "cursor-pointer" : "cursor-default"}`}
                          data-testid={`link-map-${v.id}`}
                        >
                          <MapPin className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${hasLocation ? "text-neutral-500 group-hover:text-neutral-700" : "text-neutral-300"}`} />
                          <span className={`text-xs font-medium leading-tight truncate ${hasLocation ? "text-neutral-700 group-hover:text-neutral-900 group-hover:underline" : "text-neutral-500"}`} title={v.tracker.address}>
                            {v.tracker.address}
                          </span>
                        </button>
                      ) : hasLocation ? (
                        <button
                          type="button"
                          onClick={() => { if (onFocusVehicle) { onFocusVehicle(v.id); document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "center" }); } }}
                          className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-700 text-xs font-medium cursor-pointer"
                          data-testid={`link-map-${v.id}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Ver no mapa
                        </button>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5 whitespace-nowrap min-w-[100px]">
                      {v.tracker?.lastPositionTime ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className={`inline-flex items-center gap-1.5 ${posInfo.color}`}>
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span className="text-xs font-semibold tabular-nums">
                                {new Date(v.tracker.lastPositionTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                {" - "}
                                {new Date(v.tracker.lastPositionTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Última posição há {posInfo.text}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {v.tracker?.speed != null ? (
                        <span className={`text-xs font-bold tabular-nums ${isOverSpeed ? "text-red-600" : v.tracker.speed > 0 ? "text-neutral-800" : "text-neutral-400"}`}>
                          {v.tracker.speed} km/h
                        </span>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {v.lastAlert ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              <span className="text-[11px] font-semibold text-neutral-700 tabular-nums">
                                {v.lastAlert.createdAt ? new Date(v.lastAlert.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"}
                                {" "}
                                {v.lastAlert.createdAt ? new Date(v.lastAlert.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-bold">{v.lastAlert.eventType === "excesso_velocidade" ? "Excesso de Velocidade" : v.lastAlert.eventType}</p>
                            <p>{v.lastAlert.details || "—"}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5">
                      {v.activeOs ? (
                        <div className="flex flex-col gap-1.5">
                          {v.activeOs.employee1 && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-neutral-900 flex-shrink-0" />
                              <span className="font-bold text-xs text-neutral-900 leading-tight">
                                {v.activeOs.employee1.name}
                              </span>
                              {v.activeOs.employee1.phone && (
                                <a href={`https://wa.me/${formatPhone(v.activeOs.employee1.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600" data-testid={`btn-whatsapp-agent1-${v.id}`}>
                                  <SiWhatsapp className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <Link href={`/admin/employees?id=${v.activeOs.employee1.id}`} className="text-blue-400 hover:text-blue-600 transition-colors" data-testid={`btn-doc-agent1-${v.id}`}>
                                <FileText className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          )}
                          {v.activeOs.employee2 && (
                            <div className="flex items-center gap-1.5 pl-5 border-l-2 border-neutral-200">
                              <span className="font-semibold text-xs text-neutral-500 leading-tight">
                                {v.activeOs.employee2.name}
                              </span>
                              {v.activeOs.employee2.phone && (
                                <a href={`https://wa.me/${formatPhone(v.activeOs.employee2.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600" data-testid={`btn-whatsapp-agent2-${v.id}`}>
                                  <SiWhatsapp className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <Link href={`/admin/employees?id=${v.activeOs.employee2.id}`} className="text-blue-400 hover:text-blue-600 transition-colors" data-testid={`btn-doc-agent2-${v.id}`}>
                                <FileText className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          )}
                          {!v.activeOs.employee1 && !v.activeOs.employee2 && <span className="text-neutral-300 text-xs">Sem agente</span>}
                        </div>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {v.activeOs ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/service-orders?os=${v.activeOs.id}`} className="font-bold text-neutral-900 text-xs hover:text-blue-700 hover:underline transition-colors cursor-pointer" data-testid={`link-os-vehicle-${v.id}`}>
                              {v.activeOs.osNumber}
                            </Link>
                            {hasLocation && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onFocusVehicle) { onFocusVehicle(v.id); document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
                                      if (onSelectOsVehicle) onSelectOsVehicle(v.id);
                                    }}
                                    className="p-0.5 rounded hover:bg-blue-50 transition-colors"
                                    data-testid={`button-nearby-${v.id}`}
                                  >
                                    <Navigation className="w-3 h-3 text-blue-500 hover:text-blue-700" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Ver veículos próximos</TooltipContent>
                              </Tooltip>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                              getStatusDisplay(v.activeOs.missionStatus, "em_andamento").className
                            }`}>
                              {getMissionLabel(v.activeOs.missionStatus)}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 font-medium truncate max-w-[180px]" title={v.activeOs.clientName}>
                            {v.activeOs.clientName}
                          </p>
                          {v.activeOs.scheduledDate && (
                            <p className="text-xs text-neutral-400 font-medium">
                              {new Date(v.activeOs.scheduledDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      ) : v.scheduledOs ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/service-orders?os=${v.scheduledOs.id}`} className="font-bold text-neutral-600 text-xs hover:text-blue-700 hover:underline transition-colors cursor-pointer" data-testid={`link-os-scheduled-${v.id}`}>
                              {v.scheduledOs.osNumber}
                            </Link>
                            <span className="text-xs px-2 py-0.5 rounded font-bold border bg-slate-50 text-slate-600 border-slate-200">
                              Agendada
                            </span>
                          </div>
                          {v.scheduledOs.scheduledDate && (
                            <p className="text-xs text-neutral-500 font-medium">
                              {new Date(v.scheduledOs.scheduledDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {(() => {
                        const vStatus = getViaturaStatus(v);
                        const VIcon = vStatus.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-bold border ${vStatus.className}`}>
                            <VIcon className="w-3 h-3" />
                            {vStatus.label}
                          </span>
                        );
                      })()}
                    </td>

                    <td className="px-2 py-1.5 text-center">
                      <VehicleRowActions v={v} vehicles={vehicles} gerenciadoras={gerenciadoras} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TrucksControlStatus() {
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/truckscontrol/test");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ success: false, message: "Erro de conexão" });
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (!checked && !loading) return null;

  return (
    <div className="flex items-center gap-2">
      {loading ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          TrucksControl...
        </span>
      ) : status?.success ? (
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full" data-testid="badge-tc-status">
              <CheckCircle2 className="w-3 h-3" />
              TC Online
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{status.message}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" data-testid="badge-tc-status">
              <AlertTriangle className="w-3 h-3" />
              TC Offline
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[350px] text-xs whitespace-normal">{status?.message || "Não conectado"}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

function useCountdown(intervalMs: number, lastFetchTime: number) {
  const [remaining, setRemaining] = useState(intervalMs / 1000);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - lastFetchTime;
      const left = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [intervalMs, lastFetchTime]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return { remaining, display: `${minutes}:${String(seconds).padStart(2, "0")}` };
}

function parseGoogleMapsLink(input: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /maps\?.*ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /dir\/.*\/(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  const coordMatch = input.trim().match(/^(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)$/);
  if (coordMatch) return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
  return null;
}

interface ProximityResult {
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
}

function ProximityResultsBar({ result, vehicles, onClear, onFocusVehicle }: {
  result: ProximityResult;
  vehicles: TrackedVehicle[];
  onClear: () => void;
  onFocusVehicle: (id: number) => void;
}) {
  const nearby = vehicles
    .filter(v => v.deviceType !== "spy" && v.tracker?.latitude != null && v.tracker?.longitude != null)
    .map(v => ({
      ...v,
      distance: haversineDistance(result.lat, result.lng, v.tracker!.latitude!, v.tracker!.longitude!),
    }))
    .filter(v => v.distance <= result.radiusKm)
    .sort((a, b) => a.distance - b.distance);

  return (
    <Card className="border-2 border-blue-400 bg-gradient-to-r from-blue-50 to-white shadow-md" data-testid="proximity-results-bar">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
              <Crosshair className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 font-heading">
                Busca por Raio — {result.radiusKm} km
              </h3>
              <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {result.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
              {nearby.length} {nearby.length === 1 ? "viatura" : "viaturas"}
            </span>
            <Button variant="ghost" size="sm" onClick={onClear} className="h-8 w-8 p-0 hover:bg-red-50" data-testid="button-clear-proximity-results">
              <X className="w-4 h-4 text-neutral-400 hover:text-red-500" />
            </Button>
          </div>
        </div>

        {nearby.length === 0 ? (
          <div className="text-center py-4">
            <MapPin className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-500 font-medium">Nenhuma viatura encontrada no raio de {result.radiusKm} km</p>
            <p className="text-xs text-neutral-400 mt-1">Tente aumentar o raio de busca</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {nearby.map(v => {
              const isIgnOn = v.tracker?.ignition === true;
              const isMov = isIgnOn && (v.tracker?.speed ?? 0) > 5;
              const dotColor = isMov ? "bg-green-500" : isIgnOn ? "bg-amber-500" : "bg-red-500";
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { onFocusVehicle(v.id); document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                  className="flex items-center gap-2.5 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group shadow-sm"
                  data-testid={`proximity-vehicle-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0 shadow-sm" style={{ borderColor: isMov ? "#22c55e" : isIgnOn ? "#f59e0b" : "#ef4444" }}>
                    <img src={v.iconType === "kwid" ? "/kwid-icon.png" : "/polo-icon.webp"} alt="VTR" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-neutral-900 tracking-wide">{v.plate}</span>
                      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    </div>
                    <p className="text-xs text-neutral-500 truncate">{v.brand} {v.model}</p>
                    <p className="text-xs font-bold text-blue-600 mt-0.5">
                      {v.distance < 1 ? `${Math.round(v.distance * 1000)} m` : `${v.distance.toFixed(1)} km`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function NearbyVehiclesPanel({ vehicles, selectedVehicleId, onClose, onFocusVehicle }: { vehicles: TrackedVehicle[]; selectedVehicleId: number; onClose: () => void; onFocusVehicle: (id: number) => void }) {
  const selected = vehicles.find(v => v.id === selectedVehicleId);
  if (!selected || !selected.tracker?.latitude || !selected.tracker?.longitude) return null;

  const lat = selected.tracker.latitude;
  const lon = selected.tracker.longitude;

  const nearby = vehicles
    .filter(v => v.id !== selectedVehicleId && v.deviceType !== "spy" && v.tracker?.latitude != null && v.tracker?.longitude != null)
    .map(v => ({
      ...v,
      distance: haversineDistance(lat, lon, v.tracker!.latitude!, v.tracker!.longitude!),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  return (
    <Card className="border border-blue-200 bg-blue-50/30">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-neutral-900">
              Veículos Próximos — {selected.plate}
            </h3>
            {selected.activeOs && (
              <span className="text-xs px-2 py-0.5 rounded font-bold bg-neutral-900 text-white">
                {selected.activeOs.osNumber}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0" data-testid="button-close-nearby">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {nearby.length === 0 ? (
          <p className="text-xs text-neutral-400">Nenhum veículo com posição disponível.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {nearby.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onFocusVehicle(v.id); document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                data-testid={`nearby-vehicle-${v.id}`}
              >
                <Car className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">{v.plate}</p>
                  <p className="text-xs text-neutral-500 font-medium">{v.distance < 1 ? `${Math.round(v.distance * 1000)}m` : `${v.distance.toFixed(1)}km`}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function OperationalGridPage() {
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [focusVehicleId, setFocusVehicleId] = useState<number | null>(null);
  const [selectedOsVehicleId, setSelectedOsVehicleId] = useState<number | null>(null);
  const [proximityResult, setProximityResult] = useState<ProximityResult | null>(null);

  const { data: vehicles = [], isLoading: loadingVehicles, refetch: refetchVehicles, isFetching: fetchingVehicles, dataUpdatedAt: vehiclesUpdatedAt } = useQuery<TrackedVehicle[]>({
    queryKey: ["/api/vehicle-tracking"],
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const { data: gridData = [], isLoading: loadingGrid, refetch: refetchGrid, isFetching: fetchingGrid, dataUpdatedAt: gridUpdatedAt } = useQuery<GridItem[]>({
    queryKey: ["/api/operational-grid"],
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const { data: gerenciadoras = [] } = useQuery<Gerenciadora[]>({
    queryKey: ["/api/gerenciadoras"],
  });

  useEffect(() => {
    if (vehiclesUpdatedAt || gridUpdatedAt) {
      setLastRefresh(Math.max(vehiclesUpdatedAt || 0, gridUpdatedAt || 0));
    }
  }, [vehiclesUpdatedAt, gridUpdatedAt]);

  const countdown = useCountdown(REFRESH_INTERVAL_MS, lastRefresh);
  const isFetching = fetchingVehicles || fetchingGrid;
  const isLoading = loadingVehicles || loadingGrid;

  const handleRefresh = () => {
    refetchVehicles();
    refetchGrid();
    setLastRefresh(Date.now());
  };

  const onlyVehicles = vehicles.filter((v) => v.deviceType !== "spy");
  const trackedCount = onlyVehicles.filter((v) => v.hasTracker).length;
  const withPositionCount = vehicles.filter((v) => v.tracker?.latitude != null).length;
  const tcCount = onlyVehicles.filter((v) => v.trackerType === "truckscontrol").length;
  const noSignalCount = onlyVehicles.filter((v) => !!v.noSignalSince && v.tracker?.isLiveData === false).length;
  const activeOsCount = gridData.length;

  const lastRefreshStr = new Date(lastRefresh).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <OpNotifProvider>
    <AdminLayout>
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #2C3E50 100%)" }}>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <Radio className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-grid-title">
                    Grid Operacional
                  </h1>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Monitoramento em tempo real
                  </p>
                </div>
                <TrucksControlStatus />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-300 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2" data-testid="countdown-timer">
                  <Timer className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Próxima <span className="font-bold text-white">{countdown.display}</span></span>
                  <span className="text-neutral-500">|</span>
                  <span>Última <span className="font-medium text-neutral-200">{lastRefreshStr}</span></span>
                </div>
                <Button
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-sm rounded-lg gap-2 font-semibold shadow-none"
                  data-testid="button-refresh-grid"
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-5">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Veículos</span>
                </div>
                <p className="text-2xl font-bold text-white font-heading">{onlyVehicles.length}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Satellite className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Rastreados</span>
                </div>
                <p className="text-2xl font-bold text-white font-heading">{trackedCount}{tcCount > 0 && <span className="text-sm text-neutral-400 font-medium ml-1">({tcCount} TC)</span>}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Com Posição</span>
                </div>
                <p className="text-2xl font-bold text-white font-heading">{withPositionCount}</p>
              </div>
              {noSignalCount > 0 && (
                <div className="bg-white/5 backdrop-blur-sm border border-amber-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Sem Sinal</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-300 font-heading">{noSignalCount}</p>
                </div>
              )}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Navigation className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Operações</span>
                </div>
                <p className="text-2xl font-bold text-white font-heading">{activeOsCount}</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <div className="p-12 text-center text-neutral-400">Carregando grid operacional...</div>
          </Card>
        ) : (
          <>
            <SpeedAlert vehicles={vehicles} />
            {proximityResult && (
              <ProximityResultsBar
                result={proximityResult}
                vehicles={vehicles}
                onClear={() => setProximityResult(null)}
                onFocusVehicle={(id) => setFocusVehicleId(id)}
              />
            )}
            <VehicleMap vehicles={vehicles} focusVehicleId={focusVehicleId} onProximityChange={(r) => setProximityResult(r)} />
            {selectedOsVehicleId && (
              <NearbyVehiclesPanel
                vehicles={vehicles}
                selectedVehicleId={selectedOsVehicleId}
                onClose={() => setSelectedOsVehicleId(null)}
                onFocusVehicle={(id) => setFocusVehicleId(id)}
              />
            )}
            <OperationNotificationsBar />
            <VehicleTable vehicles={vehicles} gridData={gridData} gerenciadoras={gerenciadoras} onFocusVehicle={(id) => setFocusVehicleId(id)} onSelectOsVehicle={(id) => setSelectedOsVehicleId(prev => prev === id ? null : id)} />
            <div className="text-xs text-neutral-400 text-right" data-testid="text-grid-count">
              Atualização automática a cada 2 minutos
            </div>
          </>
        )}
      </div>
    </AdminLayout>
    </OpNotifProvider>
  );
}
