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
  Bell, BellOff, MessageSquareText, ClipboardCheck, Camera, Home,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import { authFetch, queryClient } from "@/lib/queryClient";
import { titleCase } from "@/lib/utils";
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
    status: string;
    missionStatus: string;
    lastAgentUpdate?: {
      message: string;
      missionStep: string | null;
      agentName: string | null;
      createdAt: string | null;
      photoUrl?: string | null;
      latitude?: string | null;
      longitude?: string | null;
    } | null;
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
    priority: string;
  } | null;
  upcomingOrders: {
    id: number;
    osNumber: string;
    status: string;
    priority: string;
    scheduledDate: string | null;
    clientName: string;
  }[];
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
  origin?: string | null;
  destination?: string | null;
  escortedDriverName?: string | null;
  escortedDriverPhone?: string | null;
  escortedVehiclePlate?: string | null;
  lastAgentUpdate?: {
    message: string;
    missionStep: string | null;
    agentName: string | null;
    createdAt: string | null;
    photoUrl?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  } | null;
  employee1: (GridEmployee & { fullName?: string }) | null;
  employee2: (GridEmployee & { fullName?: string }) | null;
  vehicle: {
    plate: string;
    model: string;
    brand?: string;
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

function getMissionProgress(missionStatus: string | null): number {
  const steps = [
    "missao_paga", "aguardando", "checkout_armamento", "checkout_viatura", "checkout_km_saida",
    "em_transito_origem", "checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista",
    "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno",
    "finalizada", "em_prontidao", "retorno_base", "chegada_base", "encerrada",
  ];
  if (!missionStatus) return 0;
  const idx = steps.indexOf(missionStatus);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / steps.length) * 100);
}

async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        const maxH = 1280;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png");
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    return true;
  } catch {
    return false;
  }
}

const seenUpdateIds = new Set<number>();

function getFirstLastName(fullName: string | null | undefined): string {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function generateReport(v: TrackedVehicle, gridItem?: GridItem | null): string {
  const os = v.activeOs || (gridItem ? { osNumber: gridItem.osNumber, status: gridItem.status, missionStatus: gridItem.missionStatus, clientName: gridItem.clientName, scheduledDate: gridItem.scheduledDate, employee1: gridItem.employee1, employee2: gridItem.employee2, lastAgentUpdate: gridItem.lastAgentUpdate } as any : null);
  if (!os) return "";

  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const statusLabel = os.lastAgentUpdate?.missionStep
    ? getMissionLabel(os.lastAgentUpdate.missionStep)
    : getMissionLabel(os.missionStatus);

  const pick = (...vals: (string | null | undefined)[]) => vals.find(v => v && v.trim()) || "—";
  const origin = pick(gridItem?.origin, os.origin, v.activeOs?.origin);
  const destination = pick(gridItem?.destination, os.destination, v.activeOs?.destination);
  const driverName = pick(gridItem?.escortedDriverName, os.escortedDriverName, v.activeOs?.escortedDriverName);
  const driverPhone = pick(gridItem?.escortedDriverPhone, os.escortedDriverPhone, v.activeOs?.escortedDriverPhone);
  const driverPlate = pick(gridItem?.escortedVehiclePlate, os.escortedVehiclePlate, v.activeOs?.escortedVehiclePlate);
  const vehiclePlate = gridItem?.vehicle?.plate || v.plate || "—";
  const agent1 = getFirstLastName(os.employee1?.fullName || os.employee1?.name);
  const agent2 = getFirstLastName(os.employee2?.fullName || os.employee2?.name);
  const progress = getMissionProgress(os.missionStatus);
  const occurrence = os.lastAgentUpdate?.message || "Sem ocorrência";
  const locationAddr = v.tracker?.address || "—";

  return `*TORRES VIGILÂNCIA PATRIMONIAL*
*OS* ${os.osNumber} | *STATUS:* ${statusLabel}

🗓 *DATA:* ${date}    *HORA:* ${time}
🛡 *OPERAÇÃO:* CARACTERIZADA
🏢 *CLIENTE:* ${os.clientName?.toUpperCase() || "—"}

📍 *ORIGEM:* ${origin?.toUpperCase() || "—"}
🏁 *DESTINO:* ${destination?.toUpperCase() || "—"}

🚛 *VEÍCULO:* ${driverPlate}
👤 *MOTORISTA:* ${driverName?.toUpperCase() || "—"}
📞 *CONTATO:* ${driverPhone}

🚔 *VIATURA:* ${vehiclePlate}
👮 *AGENTE 01:* ${agent1?.toUpperCase()}
👮 *AGENTE 02:* ${agent2?.toUpperCase()}

📈*PROGRESSO DA MISSÃO:* ${progress}%
📣 *OCORRÊNCIA:* ${occurrence?.toUpperCase()}
🏙️ *LOCALIZAÇÃO:* ${locationAddr}`;
}

function getViaturaStatus(v: TrackedVehicle): { label: string; className: string; icon: typeof Truck } {
  if (v.activeOs) {
    const ms = v.activeOs.missionStatus;
    const osStatus = v.activeOs.status;

    if (ms === "encerrada") {
      return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }

    const isImediata = v.activeOs.priority === "imediata";

    if (osStatus === "agendada") {
      if (isImediata) {
        return { label: "EM SERVIÇO", icon: Zap, className: "bg-red-50 text-red-700 border-red-200" };
      }
      const hoursLeft = getHoursUntilMission(v.activeOs.scheduledDate);
      if (hoursLeft !== null && hoursLeft > 6) {
        return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      }
      return { label: "AGENDAMENTO", icon: CalendarClock, className: "bg-blue-50 text-blue-700 border-blue-200" };
    }

    if (osStatus === "em_andamento") {
      if (ms === "missao_paga") {
        if (isImediata) {
          return { label: "EM SERVIÇO", icon: Zap, className: "bg-red-50 text-red-700 border-red-200" };
        }
        const hoursLeft = getHoursUntilMission(v.activeOs.scheduledDate);
        if (hoursLeft !== null && hoursLeft > 6) {
          return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
        }
        return { label: "AGENDAMENTO", icon: CalendarClock, className: "bg-blue-50 text-blue-700 border-blue-200" };
      }
      return { label: "EM SERVIÇO", icon: Navigation, className: "bg-red-50 text-red-700 border-red-200" };
    }

    return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (v.scheduledOs) {
    if (v.scheduledOs.priority === "imediata") {
      return { label: "EM SERVIÇO", icon: Zap, className: "bg-red-50 text-red-700 border-red-200" };
    }
    const hoursLeft = getHoursUntilMission(v.scheduledOs.scheduledDate);
    if (hoursLeft !== null && hoursLeft > 6) {
      return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    return { label: "AGENDAMENTO", icon: CalendarClock, className: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  return { label: "LIVRE", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function getPriorityDisplay(priority: string) {
  switch (priority) {
    case "imediata":
      return { label: "EM SERVIÇO", icon: Zap, className: "bg-red-50 text-red-700 border-red-200" };
    case "agendada":
      return { label: "Agendamento", icon: CalendarClock, className: "bg-blue-50 text-blue-700 border-blue-200" };
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

        const _movTime = _ignT || "";
        const _agent1 = v.activeOs?.employee1?.name || "—";
        const _agent2 = v.activeOs?.employee2?.name || "—";
        const _dateStr = v.tracker.lastPositionTime ? new Date(v.tracker.lastPositionTime).toLocaleDateString("pt-BR") : "—";
        const _timeStr = v.tracker.lastPositionTime ? new Date(v.tracker.lastPositionTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

        infoContent = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 6px; display: flex; gap: 14px; align-items: flex-start; min-width: ${v.photoFront ? '400px' : '280px'};">
            <div style="flex: 1; min-width: 0; line-height: 1.6;">
              ${!_isLive && _noSigT ? `<div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 6px; background: #f3f4f6; padding: 3px 6px; border-radius: 4px; border: 1px solid #d1d5db;">📡 Sem sinal há ${_noSigT}</div>` : ""}
              ${!_isLive && !_noSigT ? `<div style="font-size: 11px; color: #f59e0b; font-weight: 600; margin-bottom: 4px;">⚠ Última posição conhecida</div>` : ""}
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Placa:</b> ${v.plate.replace(/^(.{3})(.+)$/, "$1-$2")}</div>
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Veículo:</b> ${v.brand} ${v.model}</div>
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Status:</b> <span style="color: ${_statusColor};">${_statusText}</span></div>
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Ignição:</b> ${v.tracker.ignition ? "Ligada ✅" : "Desligada ❌"}</div>
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Velocidade:</b> ${v.tracker.speed ?? 0} km/h</div>
              ${v.tracker.voltage != null && v.tracker.voltage > 0 ? `<div style="font-size: 13px; margin-bottom: 2px;"><b>Bateria:</b> ${v.tracker.voltage.toFixed(1)}V</div>` : ""}
              <div style="font-size: 13px; margin-bottom: 2px;"><b>Data:</b> ${_dateStr} &nbsp;&nbsp; <b>Hora:</b> ${_timeStr}</div>
              ${v.tracker.address ? `<div style="font-size: 13px; margin-bottom: 2px;"><b>Localização:</b> 📍 ${v.tracker.address}</div>` : ""}
              <div style="border-top: 1px solid #e5e7eb; margin: 6px 0; padding-top: 6px;">
                <div style="font-size: 13px; margin-bottom: 2px;"><b>Tempo em Movimento:</b> ${_movTime || "—"}</div>
                <div style="font-size: 13px; margin-bottom: 2px;"><b>Espelhamento:</b> ${v.trackerType === "truckscontrol" ? "TrucksControl" : "—"}</div>
                <div style="font-size: 13px; margin-bottom: 2px;"><b>Agente 01:</b> ${_agent1}</div>
                <div style="font-size: 13px; margin-bottom: 2px;"><b>Agente 02:</b> ${_agent2}</div>
              </div>
              ${v.activeOs ? `<div style="border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 6px; font-size: 12px;"><b>OS:</b> ${v.activeOs.osNumber} · <b>${v.activeOs.clientName}</b><br/><span style="color: #666;">${v.activeOs.status === "agendada" ? (v.activeOs.priority === "imediata" ? "EM SERVIÇO" : "Agendamento") : getMissionLabel(v.activeOs.lastAgentUpdate?.missionStep || v.activeOs.missionStatus)}</span>${v.activeOs.lastAgentUpdate ? `<br/><span style="color: #2563eb; font-size: 11px;">"${v.activeOs.lastAgentUpdate.message}"</span>` : ""}</div>` : ""}
              ${v.trackerType === "truckscontrol" ? `<div style="border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 6px;"><button onclick="window.dispatchEvent(new CustomEvent('mirror-vehicle', {detail: ${v.id}}))" style="display: inline-flex; align-items: center; gap: 6px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 600; color: #333; font-family: Inter, sans-serif;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background='#f5f5f5'">📡 Espelhar</button></div>` : ""}
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


function getValidade31Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 31);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function MirrorVehicleDialog({ vehicle, open, onOpenChange, gerenciadoras }: { vehicle: TrackedVehicle | null; open: boolean; onOpenChange: (o: boolean) => void; gerenciadoras: Gerenciadora[] }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const espelharTcMutation = useMutation({
    mutationFn: async ({ gerenciadora }: { gerenciadora: Gerenciadora }) => {
      if (!vehicle) throw new Error("Veículo não selecionado");
      const veiID = vehicle.tracker?.veiID || (vehicle.truckscontrolIdentifier ? parseInt(vehicle.truckscontrolIdentifier) : null);
      if (!veiID) throw new Error("Veículo sem ID TrucksControl");
      const r = await authFetch("/api/truckscontrol/espelhar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veiID,
          cnpj: gerenciadora.cnpj,
          cmd: 1,
          IE: 0,
          TIE: 0,
          validade: getValidade31Days(),
          possoCancelar: 1,
          comandoExclusivo: gerenciadora.tcComandoExclusivo ?? 0,
          compartilharDados: 1,
        }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Espelhamento enviado", description: data.message });
        setLastError(null);
        onOpenChange(false);
      } else {
        setLastError(data.message || "Erro desconhecido");
        toast({ title: "Falha no espelhamento", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => { setLastError(err.message); toast({ title: "Erro", description: err.message, variant: "destructive" }); },
  });

  useEffect(() => {
    if (open) { setLastError(null); setSearchQuery(""); setTimeout(() => searchInputRef.current?.focus(), 100); }
  }, [open]);

  if (!vehicle) return null;

  const activeGerenciadoras = gerenciadoras.filter(g => g.active === 1);
  const filtered = activeGerenciadoras.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.cnpj || "").toLowerCase().includes(q);
  });

  const veiID = vehicle.tracker?.veiID || vehicle.truckscontrolIdentifier || null;
  const isTc = vehicle.trackerType === "truckscontrol" && !!veiID;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" data-testid="dialog-mirror-vehicle">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Espelhar — {vehicle.plate}</DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            Selecione a gerenciadora para espelhar este veículo.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gerenciadora..."
            className="pl-8 h-8 text-sm"
            data-testid="input-search-gerenciadora"
          />
        </div>

        {lastError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5" data-testid="mirror-error-detail">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Falha no espelhamento</p>
                <p className="text-xs text-red-600 mt-0.5">{lastError}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">
              {activeGerenciadoras.length === 0 ? "Nenhuma gerenciadora cadastrada." : "Nenhum resultado encontrado."}
            </p>
          ) : (
            filtered.map((g) => (
              <div key={g.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5 hover:bg-neutral-50 transition-colors" data-testid={`mirror-ger-${g.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{g.name}</p>
                  {g.cnpj && <p className="text-xs text-neutral-500">{g.cnpj}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={espelharTcMutation.isPending || !isTc || !g.cnpj}
                  onClick={() => {
                    setLastError(null);
                    if (isTc && g.cnpj) {
                      espelharTcMutation.mutate({ gerenciadora: g });
                    } else {
                      toast({ title: "Erro", description: !isTc ? "Veículo sem rastreador TrucksControl" : "Gerenciadora sem CNPJ", variant: "destructive" });
                    }
                  }}
                  data-testid={`btn-mirror-send-${g.id}`}
                >
                  {espelharTcMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-neutral-500" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="text-[10px] text-neutral-400 border-t pt-2 space-y-0.5">
          <p><b>Veículo:</b> {vehicle.plate} | <b>TC veiID:</b> {veiID || "N/A"}</p>
          <p><b>Padrão:</b> CMD: Permitido | IE: Não | TIE: Não | Validade: 31 dias</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VehicleBlockButton({ vehicle }: { vehicle: TrackedVehicle }) {
  const { toast } = useToast();
  const { addNotification, updateNotification } = useOpNotifications();
  const [confirming, setConfirming] = useState(false);
  const vStatus = getViaturaStatus(vehicle);
  const isEmServico = vStatus.label === "EM SERVIÇO";

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

  if (!isEmServico) return null;

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
        setDiagResult(null);
      } else {
        toast({ title: "Falha no espelhamento", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const [diagResult, setDiagResult] = useState<{ results: Array<{ test: string; success: boolean; message: string }>; summary: string } | null>(null);
  const diagMutation = useMutation({
    mutationFn: async ({ veiID, cnpj }: { veiID: number; cnpj: string }) => {
      const r = await authFetch("/api/truckscontrol/espelhar/diagnostico", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiID, cnpj }),
      });
      if (!r.ok) throw new Error(`Erro HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (data) => setDiagResult(data),
    onError: (err: Error) => toast({ title: "Erro no diagnóstico", description: err.message, variant: "destructive" }),
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
        cmd: 1,
        IE: 0,
        TIE: 0,
        validade: getValidade5Days(),
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
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => {
                    if (!espelharVeiID || !espelharGerId) return;
                    const ger = gerenciadoras.find(g => g.id === Number(espelharGerId));
                    if (!ger?.cnpj) return;
                    diagMutation.mutate({ veiID: Number(espelharVeiID), cnpj: ger.cnpj });
                  }} disabled={!espelharVeiID || !espelharGerId || diagMutation.isPending} data-testid="btn-diagnostico-tc">
                    {diagMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Diagnóstico
                  </Button>
                </div>

                {diagResult && (
                  <div className="mt-3 border rounded-lg p-3 bg-white space-y-2" data-testid="diagnostico-result">
                    <p className="text-xs font-bold text-neutral-800">Resultado do Diagnóstico</p>
                    {diagResult.results.map((r: any, i: number) => (
                      <div key={i} className={`text-xs px-2 py-1.5 rounded ${r.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        <span className="font-semibold">{r.test}:</span> {r.message}
                      </div>
                    ))}
                    <div className="text-xs mt-2 p-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                      <span className="font-semibold">Conclusão:</span> {diagResult.summary}
                    </div>
                  </div>
                )}
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
                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-neutral-700 mb-2">Configurações TrucksControl (Espelhamento)</p>
                  <div className="grid grid-cols-2 gap-3">
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
                  <p className="text-[10px] text-neutral-400 mt-2">Padrão ao espelhar: CMD Permitido, IE Não, TIE Não, Validade 31 dias, Compartilhar dados Sim</p>
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

function VehicleRowActions({ v, vehicles, gerenciadoras, gridData }: { v: TrackedVehicle; vehicles: TrackedVehicle[]; gerenciadoras: Gerenciadora[]; gridData?: GridItem[] }) {
  const { toast } = useToast();
  const { addNotification, updateNotification } = useOpNotifications();
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdConfirm, setCmdConfirm] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const [preAlertLoading, setPreAlertLoading] = useState(false);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const lastUpdateId = v.activeOs?.lastAgentUpdate?.id ?? null;
  const hasNewUpdate = !!(lastUpdateId && !seenUpdateIds.has(lastUpdateId));

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

  const viaturaStatus = getViaturaStatus(v);
  const isEmServico = viaturaStatus.label === "EM SERVIÇO";

  const handleCommand = (command: string) => {
    if (command === "bloquear" && !isEmServico) {
      toast({ title: "Bloqueio não permitido", description: "O bloqueio só pode ser enviado quando a viatura estiver EM SERVIÇO.", variant: "destructive" });
      return;
    }
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

  void gerenciadoras;

  const handlePreAlert = async () => {
    const osId = v.activeOs?.id || v.scheduledOs?.id;
    if (!osId) {
      toast({ title: "Sem OS vinculada", description: "Esta viatura não possui OS ativa ou agendada para gerar o pré-alerta.", variant: "destructive" });
      return;
    }
    setPreAlertLoading(true);
    try {
      const res = await authFetch(`/api/service-orders/${osId}/pdf`);
      if (!res.ok) throw new Error("Falha ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `PreAlerta_OS_${v.activeOs?.osNumber || v.scheduledOs?.osNumber}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: "Pré-Alerta gerado", description: `OS ${v.activeOs?.osNumber || v.scheduledOs?.osNumber} aberta em nova aba.` });
    } catch (err: any) {
      toast({ title: "Erro ao gerar pré-alerta", description: err.message, variant: "destructive" });
    } finally {
      setPreAlertLoading(false);
    }
  };

  const hasOs = !!(v.activeOs || v.scheduledOs);

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${hasOs ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-600 hover:text-amber-800" : "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed"}`}
            onClick={handlePreAlert}
            disabled={!hasOs || preAlertLoading}
            data-testid={`btn-pre-alert-${v.id}`}
          >
            {preAlertLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{hasOs ? "Pré-Alerta (Gerar OS)" : "Sem OS para pré-alerta"}</TooltipContent>
      </Tooltip>
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
      <MirrorVehicleDialog vehicle={v as any} open={mirrorOpen} onOpenChange={setMirrorOpen} gerenciadoras={gerenciadoras} />

      {v.activeOs && ["finalizada", "em_prontidao", "retorno_base"].includes(v.activeOs.missionStatus) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-green-400 bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-800 transition-colors animate-pulse"
              onClick={async () => {
                try {
                  await authFetch(`/api/service-orders/${v.activeOs!.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ missionStatus: "chegada_base" }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/vehicle-tracking"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/operational-grid"] });
                  toast({ title: "Retorno liberado!", description: "O agente foi direcionado para checklist da base." });
                } catch {
                  toast({ title: "Erro", description: "Não foi possível liberar retorno.", variant: "destructive" });
                }
              }}
              data-testid={`btn-liberar-retorno-${v.id}`}
            >
              <Home className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Liberar Retorno à Base</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${
              hasNewUpdate
                ? "border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-800 animate-pulse"
                : v.activeOs?.lastAgentUpdate
                  ? "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                  : "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed"
            }`}
            disabled={!v.activeOs?.lastAgentUpdate}
            onClick={(e) => {
              e.stopPropagation();
              setPhotoModalUrl(v.activeOs?.lastAgentUpdate?.photoUrl || "__no_photo__");
              if (lastUpdateId) { seenUpdateIds.add(lastUpdateId); forceUpdate(n => n + 1); }
            }}
            data-testid={`btn-copy-report-${v.id}`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{hasNewUpdate ? "Atualização Recente — Copiar Relatório" : v.activeOs?.lastAgentUpdate ? "Copiar Relatório" : "Sem atualização recente"}</TooltipContent>
      </Tooltip>

      <Dialog open={!!photoModalUrl} onOpenChange={() => {}}>
        <DialogContent
          className={`p-0 overflow-hidden border-0 [&>button]:hidden ${photoModalUrl && photoModalUrl !== "__no_photo__" ? "max-w-2xl bg-black/95" : "max-w-md bg-white"}`}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 pt-4 pb-2 relative">
            <DialogTitle className={`text-sm font-bold flex items-center gap-2 ${photoModalUrl && photoModalUrl !== "__no_photo__" ? "text-white" : "text-neutral-900"}`}>
              {photoModalUrl && photoModalUrl !== "__no_photo__" ? "📷" : "📋"} Atualização — {v.activeOs?.osNumber || ""}
            </DialogTitle>
            <button
              className={`absolute top-3 right-3 p-1 rounded-full transition-colors ${photoModalUrl && photoModalUrl !== "__no_photo__" ? "text-white/60 hover:text-white hover:bg-white/10" : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"}`}
              onClick={() => {
                setPhotoModalUrl(null);
                if (lastUpdateId) {
                  authFetch("/api/mission/updates/mark-read", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: [lastUpdateId] }),
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/mission/updates"] });
                  }).catch(() => {});
                }
              }}
              data-testid={`btn-close-photo-modal-${v.id}`}
            >
              <X className="w-4 h-4" />
            </button>
          </DialogHeader>
          {photoModalUrl && photoModalUrl !== "__no_photo__" && (
            <div className="flex items-center justify-center px-4">
              <img
                src={photoModalUrl}
                alt="Foto da atualização do agente"
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
                data-testid={`photo-modal-img-${v.id}`}
              />
            </div>
          )}
          {v.activeOs?.lastAgentUpdate && (
            <div className={`px-4 py-2 ${photoModalUrl && photoModalUrl !== "__no_photo__" ? "text-neutral-300" : "text-neutral-600"}`}>
              <p className="text-sm font-medium">"{v.activeOs.lastAgentUpdate.message}"</p>
              <p className="text-[10px] mt-1 opacity-60">
                {titleCase(v.activeOs.lastAgentUpdate.agentName)} · {v.activeOs.lastAgentUpdate.createdAt ? new Date(v.activeOs.lastAgentUpdate.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
            </div>
          )}
          <div className="px-4 pb-4 flex flex-col items-center gap-3">
            <div className="flex justify-center gap-3">
              {photoModalUrl && photoModalUrl !== "__no_photo__" && (
                <button
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors bg-amber-500 text-white hover:bg-amber-600"
                  onClick={async () => {
                    const ok = await copyImageToClipboard(photoModalUrl);
                    toast(ok
                      ? { title: "Foto copiada!", description: "Cole no WhatsApp com Ctrl+V." }
                      : { title: "Erro", description: "Não foi possível copiar a foto.", variant: "destructive" }
                    );
                  }}
                  data-testid={`btn-copy-photo-modal-${v.id}`}
                >
                  <Camera className="w-4 h-4" />
                  Copiar Foto
                </button>
              )}
              <button
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${
                  photoModalUrl && photoModalUrl !== "__no_photo__"
                    ? "bg-white text-neutral-900 hover:bg-neutral-100"
                    : "bg-neutral-900 text-white hover:bg-neutral-800"
                }`}
                onClick={async () => {
                  const gridItem = gridData?.find((g: GridItem) => g.osNumber === v.activeOs?.osNumber);
                  const reportText = generateReport(v, gridItem || null);
                  try {
                    await navigator.clipboard.writeText(reportText);
                    toast({ title: "Formulário copiado!", description: "Texto copiado para a área de transferência." });
                  } catch {
                    toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
                  }
                }}
                data-testid={`btn-copy-form-modal-${v.id}`}
              >
                <Copy className="w-4 h-4" />
                Copiar Formulário
              </button>
            </div>
            <button
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs transition-colors bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setPhotoModalUrl(null);
                if (lastUpdateId) {
                  authFetch("/api/mission/updates/mark-read", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: [lastUpdateId] }),
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/mission/updates"] });
                  }).catch(() => {});
                }
              }}
              data-testid={`btn-finalize-alert-${v.id}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizar Aviso
            </button>
          </div>
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
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${!isEmServico ? "opacity-40 cursor-not-allowed" : cmdConfirm === "bloquear" ? "bg-red-50 border-red-300 ring-1 ring-red-200" : "hover:bg-neutral-50"}`}
                  onClick={() => handleCommand("bloquear")}
                  disabled={commandMutation.isPending || !isEmServico}
                  data-testid={`btn-cmd-block-${v.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><XCircle className="w-4 h-4 text-red-500" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Bloquear</p>
                    <p className="text-xs text-neutral-400">{!isEmServico ? "Disponível apenas com viatura EM SERVIÇO" : cmdConfirm === "bloquear" ? "Clique novamente para confirmar" : "Cortar combustível remotamente"}</p>
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

function UpcomingOrdersModal({ vehicle, open, onClose }: { vehicle: TrackedVehicle | null; open: boolean; onClose: () => void }) {
  if (!vehicle) return null;
  const allOrders = [
    ...(vehicle.activeOs ? [{
      id: vehicle.activeOs.id,
      osNumber: vehicle.activeOs.osNumber,
      status: vehicle.activeOs.status,
      priority: vehicle.activeOs.priority,
      scheduledDate: vehicle.activeOs.scheduledDate || null,
      clientName: vehicle.activeOs.clientName,
      isCurrent: true,
    }] : []),
    ...(vehicle.upcomingOrders || []).map(u => ({ ...u, isCurrent: false })),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Agendamentos — {vehicle.plate}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {allOrders.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">Nenhum agendamento</p>
          ) : allOrders.map((o) => (
            <div key={o.id} className={`rounded-lg border p-3 space-y-1.5 ${o.isCurrent ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/service-orders?os=${o.id}`} className="font-bold text-sm text-neutral-800 hover:text-blue-700 hover:underline cursor-pointer">
                    {o.osNumber}
                  </Link>
                  {o.isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-neutral-900 text-white">ATUAL</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                    o.priority === "imediata" ? "bg-red-100 text-red-700 border-red-200" :
                    "bg-blue-50 text-blue-600 border-blue-200"
                  }`}>
                    {o.priority === "imediata" ? "IMEDIATA" : "AGENDADA"}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                    o.status === "em_andamento" ? "bg-neutral-900 text-white border-neutral-900" :
                    o.status === "agendada" ? "bg-blue-50 text-blue-700 border-blue-200" :
                    "bg-neutral-100 text-neutral-600 border-neutral-200"
                  }`}>
                    {o.status === "agendada" ? (o.priority === "imediata" ? "EM SERVIÇO" : "AGENDAMENTO") : o.status?.toUpperCase()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 font-medium">{o.clientName}</p>
              {o.scheduledDate && (
                <p className="text-xs text-neutral-400">
                  <CalendarClock className="w-3 h-3 inline mr-1" />
                  {new Date(o.scheduledDate).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="pt-2">
          <Button variant="outline" onClick={onClose} className="w-full">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VehicleTable({ vehicles, gridData, gerenciadoras, onFocusVehicle, onSelectOsVehicle }: { vehicles: TrackedVehicle[]; gridData: GridItem[]; gerenciadoras: Gerenciadora[]; onFocusVehicle?: (id: number) => void; onSelectOsVehicle?: (id: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [upcomingVehicle, setUpcomingVehicle] = useState<TrackedVehicle | null>(null);

  const onlyVehicles = vehicles.filter(v => v.deviceType !== "spy");

  return (
    <>
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
                                {titleCase(v.activeOs.employee1.name)}
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
                                {titleCase(v.activeOs.employee2.name)}
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
                            {v.activeOs.priority === "imediata" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-black border bg-red-600 text-white border-red-700 animate-pulse">
                                IMEDIATA
                              </span>
                            )}
                            {v.activeOs.lastAgentUpdate ? (
                              <span className="text-xs px-2 py-0.5 rounded font-bold border bg-blue-50 text-blue-700 border-blue-200">
                                {getMissionLabel(v.activeOs.lastAgentUpdate.missionStep || v.activeOs.missionStatus)}
                              </span>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                                getStatusDisplay(v.activeOs.status === "agendada" ? "missao_paga" : v.activeOs.missionStatus, v.activeOs.status).className
                              }`}>
                                {v.activeOs.status === "agendada" ? "Missão Paga" : getMissionLabel(v.activeOs.missionStatus)}
                              </span>
                            )}
                            {v.activeOs.lastAgentUpdate && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="w-3.5 h-3.5 text-blue-500 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[250px]">
                                  <p className="font-bold text-xs">"{v.activeOs.lastAgentUpdate.message}"</p>
                                  <p className="text-[10px] text-neutral-400 mt-0.5">
                                    {titleCase(v.activeOs.lastAgentUpdate.agentName)} · {v.activeOs.lastAgentUpdate.createdAt ? new Date(v.activeOs.lastAgentUpdate.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                                    {v.activeOs.lastAgentUpdate.photoUrl ? " · 📷 Foto" : ""}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 font-medium truncate max-w-[180px]" title={v.activeOs.clientName}>
                            {v.activeOs.clientName}
                          </p>
                          {v.activeOs.scheduledDate && (
                            <p className="text-xs text-neutral-400 font-medium">
                              {new Date(v.activeOs.scheduledDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                          {v.upcomingOrders && v.upcomingOrders.length > 0 && (
                            <button
                              onClick={() => setUpcomingVehicle(v)}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer transition-colors"
                              data-testid={`button-upcoming-${v.id}`}
                            >
                              <CalendarClock className="w-3 h-3" />
                              +{v.upcomingOrders.length} agendamento{v.upcomingOrders.length > 1 ? "s" : ""}
                            </button>
                          )}
                        </div>
                      ) : v.scheduledOs ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/service-orders?os=${v.scheduledOs.id}`} className="font-bold text-neutral-600 text-xs hover:text-blue-700 hover:underline transition-colors cursor-pointer" data-testid={`link-os-scheduled-${v.id}`}>
                              {v.scheduledOs.osNumber}
                            </Link>
                            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${v.scheduledOs.priority === "imediata" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                              {v.scheduledOs.priority === "imediata" ? "EM SERVIÇO" : "Agendamento"}
                            </span>
                          </div>
                          {v.scheduledOs.scheduledDate && (
                            <p className="text-xs text-neutral-500 font-medium">
                              {new Date(v.scheduledOs.scheduledDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                          {v.upcomingOrders && v.upcomingOrders.filter(u => u.id !== v.scheduledOs!.id).length > 0 && (
                            <button
                              onClick={() => setUpcomingVehicle(v)}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer transition-colors"
                              data-testid={`button-upcoming-scheduled-${v.id}`}
                            >
                              <CalendarClock className="w-3 h-3" />
                              +{v.upcomingOrders.filter(u => u.id !== v.scheduledOs!.id).length} agendamento{v.upcomingOrders.filter(u => u.id !== v.scheduledOs!.id).length > 1 ? "s" : ""}
                            </button>
                          )}
                        </div>
                      ) : v.upcomingOrders && v.upcomingOrders.length > 0 ? (
                        <button
                          onClick={() => setUpcomingVehicle(v)}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer transition-colors"
                          data-testid={`button-upcoming-only-${v.id}`}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          {v.upcomingOrders.length} agendamento{v.upcomingOrders.length > 1 ? "s" : ""}
                        </button>
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
                      <VehicleRowActions v={v} vehicles={vehicles} gerenciadoras={gerenciadoras} gridData={gridData} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    <UpcomingOrdersModal vehicle={upcomingVehicle} open={!!upcomingVehicle} onClose={() => setUpcomingVehicle(null)} />
    </>
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

function MissionUpdatesAlert({ vehicles, gridData }: { vehicles: TrackedVehicle[]; gridData: GridItem[] }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [forwardUpdate, setForwardUpdate] = useState<any>(null);

  const { data: updates = [] } = useQuery<any[]>({
    queryKey: ["/api/mission/updates", "unread"],
    queryFn: async () => {
      const res = await authFetch("/api/mission/updates?unread=true");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids?: number[]) => {
      await authFetch("/api/mission/updates/mark-read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission/updates", "unread"] });
    },
  });

  if (updates.length === 0) return null;

  const displayUpdates = expanded ? updates : updates.slice(0, 3);

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden animate-pulse-slow" data-testid="mission-updates-alert">
      <div className="px-4 py-3 flex items-center justify-between bg-amber-100/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center">
            <MessageSquareText className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900">
              {updates.length} atualização{updates.length > 1 ? "ões" : ""} dos agentes
            </p>
            <p className="text-[10px] text-amber-600">Mensagens em tempo real das missões em andamento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100 h-7"
            onClick={() => markReadMutation.mutate()}
            disabled={markReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Marcar lidas
          </Button>
        </div>
      </div>
      <div className="divide-y divide-amber-200">
        {displayUpdates.map((u: any) => (
          <div key={u.id} className="px-4 py-3 flex items-start gap-3 hover:bg-amber-50/80" data-testid={`update-${u.id}`}>
            <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bell className="w-3.5 h-3.5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-amber-900">{titleCase(u.employeeName)}</span>
                {u.osNumber && (
                  <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">{u.osNumber}</span>
                )}
                <span className="text-[10px] text-amber-500">
                  {new Date(u.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {new Date(u.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
              </div>
              <p className="text-sm text-amber-800 mt-0.5">{u.message}</p>
              {u.photoUrl && (
                <div className="mt-1.5">
                  <a href={u.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <img src={u.photoUrl} alt="Foto da atualização" className="w-20 h-20 rounded-lg object-cover border-2 border-amber-300 shadow-sm hover:shadow-md transition-shadow cursor-pointer" />
                  </a>
                </div>
              )}
              {u.latitude && u.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${u.latitude},${u.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                  data-testid={`link-location-${u.id}`}
                >
                  <MapPin className="w-3 h-3" />
                  Ver localização
                </a>
              )}
              <button
                onClick={() => setForwardUpdate(u)}
                className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700 transition-colors"
                data-testid={`btn-forward-client-${u.id}`}
              >
                <Send className="w-3 h-3" />
                Encaminhar para o Cliente
              </button>
            </div>
            <button
              onClick={() => markReadMutation.mutate([u.id])}
              className="text-amber-400 hover:text-amber-600 flex-shrink-0 mt-1"
              title="Marcar como lida"
              data-testid={`button-dismiss-${u.id}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {updates.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-center text-xs font-bold text-amber-700 hover:bg-amber-100 border-t border-amber-200"
          data-testid="button-toggle-updates"
        >
          {expanded ? "Mostrar menos" : `Ver todas (${updates.length})`}
        </button>
      )}

      <Dialog open={!!forwardUpdate} onOpenChange={() => {}}>
        <DialogContent
          className={`p-0 overflow-hidden border-0 [&>button]:hidden ${forwardUpdate?.photoUrl ? "max-w-2xl bg-black/95" : "max-w-md bg-white"}`}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 pt-4 pb-2 relative">
            <DialogTitle className={`text-sm font-bold flex items-center gap-2 ${forwardUpdate?.photoUrl ? "text-white" : "text-neutral-900"}`}>
              {forwardUpdate?.photoUrl ? "📷" : "📋"} Encaminhar — {forwardUpdate?.osNumber || ""}
            </DialogTitle>
            <button
              className={`absolute top-3 right-3 p-1 rounded-full transition-colors ${forwardUpdate?.photoUrl ? "text-white/60 hover:text-white hover:bg-white/10" : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"}`}
              onClick={() => {
                const uid = forwardUpdate?.id;
                setForwardUpdate(null);
                if (uid) markReadMutation.mutate([uid]);
              }}
              data-testid="btn-close-forward-modal"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogHeader>
          {forwardUpdate?.photoUrl && (
            <div className="flex items-center justify-center px-4">
              <img
                src={forwardUpdate.photoUrl}
                alt="Foto da atualização do agente"
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
                data-testid="forward-photo-modal-img"
              />
            </div>
          )}
          {forwardUpdate && (
            <div className={`px-4 py-2 ${forwardUpdate.photoUrl ? "text-neutral-300" : "text-neutral-600"}`}>
              <p className="text-sm font-medium">"{forwardUpdate.message}"</p>
              <p className="text-[10px] mt-1 opacity-60">
                {titleCase(forwardUpdate.employeeName)} · {forwardUpdate.createdAt ? new Date(forwardUpdate.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
            </div>
          )}
          <div className="px-4 pb-4 flex flex-col items-center gap-3">
            <div className="flex justify-center gap-3">
              {forwardUpdate?.photoUrl && (
                <button
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors bg-amber-500 text-white hover:bg-amber-600"
                  onClick={async () => {
                    const ok = await copyImageToClipboard(forwardUpdate.photoUrl);
                    toast(ok
                      ? { title: "Foto copiada!", description: "Cole no WhatsApp com Ctrl+V." }
                      : { title: "Erro", description: "Não foi possível copiar a foto.", variant: "destructive" }
                    );
                  }}
                  data-testid="btn-forward-copy-photo"
                >
                  <Camera className="w-4 h-4" />
                  Copiar Foto
                </button>
              )}
              <button
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${
                  forwardUpdate?.photoUrl
                    ? "bg-white text-neutral-900 hover:bg-neutral-100"
                    : "bg-neutral-900 text-white hover:bg-neutral-800"
                }`}
                onClick={async () => {
                  if (!forwardUpdate) return;
                  const matchedVehicle = vehicles.find((veh: TrackedVehicle) => veh.activeOs?.osNumber === forwardUpdate.osNumber);
                  const gridItem = gridData.find((g: GridItem) => g.osNumber === forwardUpdate.osNumber);
                  let reportText = "";
                  if (matchedVehicle) {
                    reportText = generateReport(matchedVehicle, gridItem || null);
                  } else {
                    reportText = `*TORRES VIGILÂNCIA PATRIMONIAL*\n*OS* ${forwardUpdate.osNumber}\n\n📣 *OCORRÊNCIA:* ${forwardUpdate.message?.toUpperCase()}`;
                  }
                  try {
                    await navigator.clipboard.writeText(reportText);
                    toast({ title: "Formulário copiado!", description: "Texto copiado para a área de transferência." });
                  } catch {
                    toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
                  }
                }}
                data-testid="btn-forward-copy-form"
              >
                <Copy className="w-4 h-4" />
                Copiar Formulário
              </button>
            </div>
            <button
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs transition-colors bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                const uid = forwardUpdate?.id;
                setForwardUpdate(null);
                if (uid) markReadMutation.mutate([uid]);
              }}
              data-testid="btn-forward-finalize"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizar Aviso
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OperationalGridPage() {
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [focusVehicleId, setFocusVehicleId] = useState<number | null>(null);
  const [selectedOsVehicleId, setSelectedOsVehicleId] = useState<number | null>(null);
  const [proximityResult, setProximityResult] = useState<ProximityResult | null>(null);
  const [mirrorVehicle, setMirrorVehicle] = useState<TrackedVehicle | null>(null);
  const [mirrorDialogOpen, setMirrorDialogOpen] = useState(false);

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

  const handleMirrorVehicle = useCallback((vehicleId: number) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    if (v) {
      setMirrorVehicle(v);
      setMirrorDialogOpen(true);
    }
  }, [vehicles]);

  useEffect(() => {
    const handler = (e: Event) => {
      const vehicleId = (e as CustomEvent).detail;
      if (vehicleId) handleMirrorVehicle(vehicleId);
    };
    window.addEventListener("mirror-vehicle", handler);
    return () => window.removeEventListener("mirror-vehicle", handler);
  }, [handleMirrorVehicle]);

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
            <MissionUpdatesAlert vehicles={vehicles} gridData={gridData} />
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
      <MirrorVehicleDialog
        vehicle={mirrorVehicle}
        open={mirrorDialogOpen}
        onOpenChange={setMirrorDialogOpen}
        gerenciadoras={gerenciadoras}
      />
    </AdminLayout>
    </OpNotifProvider>
  );
}
