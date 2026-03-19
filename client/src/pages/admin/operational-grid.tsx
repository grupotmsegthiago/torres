import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin, Key, Satellite, Signal, RefreshCw, Radio,
  ExternalLink, Zap, CalendarClock, Recycle,
  Building2, Navigation, Play, Flag, CircleCheckBig,
  Clock, Truck, CircleDot, Pause, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Timer,
  Info, Send, Plus, Pencil, Trash2, Copy,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  status: string;
  hasTracker: boolean;
  trackerId: string | null;
  trackerType: string;
  truckscontrolIdentifier?: string | null;
  deviceType?: "vehicle" | "spy";
  batteryLevel?: number;
  coupled?: boolean;
  tracker: {
    latitude?: number;
    longitude?: number;
    ignition?: boolean;
    lastPositionTime?: string;
    gpsSignal?: boolean;
    speed?: number;
    address?: string;
  } | null;
  activeOs: {
    id: number;
    osNumber: string;
    missionStatus: string;
    clientName: string;
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
  if (diffMin > 30) return { text: timeStr, color: "text-red-600", dotColor: "bg-red-500", diffMin };
  if (diffMin > 5) return { text: timeStr, color: "text-amber-600", dotColor: "bg-amber-500", diffMin };
  return { text: timeStr, color: "text-green-600", dotColor: "bg-green-500", diffMin };
}

function getMissionLabel(status: string | null) {
  if (!status) return "—";
  switch (status) {
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
      return "Finalizada";
    default:
      return status;
  }
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
  if (osStatus === "aberta") {
    return { label: "Aguardando Despacho", icon: Clock, className: "bg-slate-50 text-slate-600 border-slate-200" };
  }
  switch (missionStatus) {
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
      return { label: "Finalizada", icon: CircleCheckBig, className: "bg-green-50 text-green-700 border-green-200" };
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

function getIdleTime(v: TrackedVehicle): string | null {
  if (!v.tracker || v.tracker.ignition !== true) return null;
  if ((v.tracker.speed ?? 0) > 0) return null;
  if (!v.tracker.lastPositionTime) return null;

  const diffMin = Math.floor((Date.now() - new Date(v.tracker.lastPositionTime).getTime()) / 60000);
  if (diffMin < 1) return "< 1min";
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

function VehicleMap({ vehicles }: { vehicles: TrackedVehicle[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<TrackedVehicle | null>(null);

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&callback=initGridMap`;
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
      if (!v.tracker?.latitude || !v.tracker?.longitude) return;

      hasPositions = true;
      const position = { lat: v.tracker.latitude, lng: v.tracker.longitude };
      bounds.extend(position);

      const isSpy = v.deviceType === "spy";

      let markerColor: string;
      let svgIcon: any;

      if (isSpy) {
        markerColor = v.coupled ? "#8b5cf6" : "#a855f7";
        svgIcon = {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: markerColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 7,
        };
      } else {
        const isIgnitionOn = v.tracker.ignition === true;
        const isMoving = isIgnitionOn && (v.tracker.speed ?? 0) > 5;
        markerColor = isMoving ? "#22c55e" : isIgnitionOn ? "#f59e0b" : "#ef4444";
        svgIcon = {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          fillColor: markerColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 6,
          rotation: 0,
        };
      }

      const marker = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        icon: svgIcon,
        title: isSpy ? `SPY: ${v.model}` : `${v.plate} - ${v.model}`,
      });

      let infoContent: string;
      if (isSpy) {
        infoContent = `
          <div style="font-family: system-ui; min-width: 200px; padding: 4px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #7c3aed;">🔍 ${v.model}</div>
            <div style="color: #666; font-size: 12px; margin-bottom: 6px;">${v.plate}</div>
            ${v.tracker.speed !== undefined ? `<div style="font-size: 12px;"><b>Vel:</b> ${v.tracker.speed} km/h</div>` : ""}
            ${v.batteryLevel !== undefined && v.batteryLevel >= 0 ? `<div style="font-size: 12px;"><b>Bateria:</b> ${v.batteryLevel}%</div>` : ""}
            <div style="font-size: 12px;"><b>Acoplado:</b> ${v.coupled ? "Sim ✅" : "Não ❌"}</div>
            ${v.tracker.address ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">${v.tracker.address}</div>` : ""}
          </div>
        `;
      } else {
        infoContent = `
          <div style="font-family: system-ui; min-width: 200px; padding: 4px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${v.plate}</div>
            <div style="color: #666; font-size: 12px; margin-bottom: 6px;">${v.brand} ${v.model}</div>
            ${v.tracker.speed !== undefined ? `<div style="font-size: 12px;"><b>Vel:</b> ${v.tracker.speed} km/h</div>` : ""}
            ${v.tracker.ignition !== undefined ? `<div style="font-size: 12px;"><b>Ignição:</b> ${v.tracker.ignition ? "Ligada ✅" : "Desligada ❌"}</div>` : ""}
            ${v.tracker.address ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">${v.tracker.address}</div>` : ""}
            ${v.activeOs ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 12px;"><b>OS:</b> ${v.activeOs.osNumber}<br/><b>Cliente:</b> ${v.activeOs.clientName}<br/><b>Status:</b> ${getMissionLabel(v.activeOs.missionStatus)}</div>` : ""}
          </div>
        `;
      }

      const infoWindow = new window.google.maps.InfoWindow({ content: infoContent });
      marker.addListener("click", () => {
        infoWindow.open(mapInstanceRef.current, marker);
        setSelectedVehicle(v);
      });

      markersRef.current.push(marker);
    });

    if (hasPositions) {
      mapInstanceRef.current.fitBounds(bounds);
      if (markersRef.current.length === 1) {
        mapInstanceRef.current.setZoom(14);
      }
    }
  }, [mapReady, vehicles]);

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
      <div ref={mapRef} className="w-full h-[450px]" data-testid="map-container" />
      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-neutral-200">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: "#22c55e" }} />
            Em movimento
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: "#f59e0b" }} />
            Parado (ligado)
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: "#ef4444" }} />
            Desligado
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: "#8b5cf6" }} />
            SPY Tracker
          </span>
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
        {v.chassi && <p><span className="text-neutral-500">Chassi:</span> <span className="font-mono text-[10px]">{v.chassi}</span></p>}
        {v.renavam && <p><span className="text-neutral-500">Renavam:</span> <span className="font-mono">{v.renavam}</span></p>}
        {v.km != null && v.km > 0 && <p><span className="text-neutral-500">KM:</span> {v.km.toLocaleString("pt-BR")}</p>}
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
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "", cnpj: "", apiUrl: "", apiKey: "", apiType: "webhook",
    contactName: "", contactPhone: "", contactEmail: "", notes: "",
  });

  const mirrorMutation = useMutation({
    mutationFn: async (gerenciadoraId: number) => {
      const onlyVehicles = vehicles.filter((v) => v.deviceType !== "spy");
      const vehicleData = onlyVehicles.map((v) => ({
        plate: v.plate,
        model: v.model,
        brand: v.brand,
        latitude: v.tracker?.latitude,
        longitude: v.tracker?.longitude,
        speed: v.tracker?.speed,
        ignition: v.tracker?.ignition,
        gpsSignal: v.tracker?.gpsSignal,
        address: v.tracker?.address,
        lastPositionTime: v.tracker?.lastPositionTime,
        activeOs: v.activeOs,
      }));
      const res = await authFetch(`/api/gerenciadoras/${gerenciadoraId}/mirror`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleData }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Erro desconhecido" }));
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Espelhamento enviado", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Erro no espelhamento", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await authFetch("/api/gerenciadoras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Erro ao cadastrar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gerenciadoras"] });
      setShowAddForm(false);
      resetForm();
      toast({ title: "Gerenciadora cadastrada" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await authFetch(`/api/gerenciadoras/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gerenciadoras"] });
      setEditingId(null);
      resetForm();
      toast({ title: "Gerenciadora atualizada" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
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
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", cnpj: "", apiUrl: "", apiKey: "", apiType: "webhook", contactName: "", contactPhone: "", contactEmail: "", notes: "" });
  };

  const startEdit = (g: Gerenciadora) => {
    setEditingId(g.id);
    setFormData({
      name: g.name,
      cnpj: g.cnpj || "",
      apiUrl: g.apiUrl || "",
      apiKey: g.apiKey || "",
      apiType: g.apiType || "webhook",
      contactName: g.contactName || "",
      contactPhone: g.contactPhone || "",
      contactEmail: g.contactEmail || "",
      notes: g.notes || "",
    });
    setShowAddForm(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const activeGerenciadoras = gerenciadoras.filter((g) => g.active !== 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide text-neutral-300 border border-neutral-600 bg-neutral-800/50 hover:bg-neutral-700 hover:text-white transition-colors" data-testid="button-mirror">
          <Copy className="w-3 h-3" />
          Gerenciadoras
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Espelhamento para Gerenciadora</DialogTitle>
          <DialogDescription>Envie dados de rastreamento em tempo real para a gerenciadora de risco cadastrada.</DialogDescription>
        </DialogHeader>

        {!showAddForm ? (
          <div className="space-y-4">
            {activeGerenciadoras.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">Nenhuma gerenciadora cadastrada</p>
            ) : (
              <div className="space-y-2">
                {activeGerenciadoras.map((g) => (
                  <div key={g.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-neutral-50" data-testid={`gerenciadora-item-${g.id}`}>
                    <div>
                      <p className="font-semibold text-sm">{g.name}</p>
                      {g.cnpj && <p className="text-xs text-neutral-500">{g.cnpj}</p>}
                      {g.apiUrl && <p className="text-xs text-neutral-400 font-mono truncate max-w-[200px]">{g.apiUrl}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(g)}
                        data-testid={`btn-edit-gerenciadora-${g.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { if (confirm(`Remover ${g.name}?`)) deleteMutation.mutate(g.id); }}
                        data-testid={`btn-delete-gerenciadora-${g.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => mirrorMutation.mutate(g.id)}
                        disabled={mirrorMutation.isPending || !g.apiUrl}
                        className="gap-1"
                        data-testid={`btn-send-mirror-${g.id}`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Enviar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full gap-1.5" onClick={() => { resetForm(); setEditingId(null); setShowAddForm(true); }} data-testid="btn-add-gerenciadora">
              <Plus className="w-4 h-4" />
              Cadastrar Gerenciadora
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nome *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nome da gerenciadora" data-testid="input-gerenciadora-name" />
              </div>
              <div>
                <Label className="text-xs">CNPJ</Label>
                <Input value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} placeholder="00.000.000/0001-00" data-testid="input-gerenciadora-cnpj" />
              </div>
              <div>
                <Label className="text-xs">Tipo API</Label>
                <Select value={formData.apiType} onValueChange={(v) => setFormData({ ...formData, apiType: v })}>
                  <SelectTrigger data-testid="select-gerenciadora-api-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="rest">REST API</SelectItem>
                    <SelectItem value="soap">SOAP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">URL da API</Label>
                <Input value={formData.apiUrl} onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })} placeholder="https://api.gerenciadora.com/webhook" data-testid="input-gerenciadora-api-url" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Chave/Token da API</Label>
                <Input value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} placeholder="Bearer token ou API key" data-testid="input-gerenciadora-api-key" />
              </div>
              <div>
                <Label className="text-xs">Contato</Label>
                <Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} placeholder="Nome do contato" data-testid="input-gerenciadora-contact" />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="(21) 99999-0000" data-testid="input-gerenciadora-phone" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">E-mail</Label>
                <Input value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="contato@gerenciadora.com" data-testid="input-gerenciadora-email" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddForm(false); setEditingId(null); resetForm(); }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending} data-testid="btn-save-gerenciadora">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VehicleRowActions({ v, vehicles, gerenciadoras }: { v: TrackedVehicle; vehicles: TrackedVehicle[]; gerenciadoras: Gerenciadora[] }) {
  const { toast } = useToast();
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const mirrorMutation = useMutation({
    mutationFn: async (gerenciadoraId: number) => {
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
      return res.json();
    },
    onSuccess: (data) => toast({ title: "Espelhado", description: data.message }),
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeGerenciadoras = gerenciadoras.filter(g => g.active !== 0);

  return (
    <div className="flex items-center gap-1">
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
                  onClick={() => { mirrorMutation.mutate(g.id); setMirrorOpen(false); }}
                  disabled={mirrorMutation.isPending || !g.apiUrl}
                  data-testid={`btn-mirror-send-${g.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">{g.name}</p>
                    {g.cnpj && <p className="text-[11px] text-neutral-400">{g.cnpj}</p>}
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
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Comando — {v.plate}</DialogTitle>
            <DialogDescription className="text-xs">Enviar comando remoto ao rastreador do veículo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {v.hasTracker ? (
              <>
                <button className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-neutral-50 transition-colors text-left" data-testid={`btn-cmd-block-${v.id}`}>
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><XCircle className="w-4 h-4 text-red-500" /></div>
                  <div><p className="text-sm font-medium">Bloquear</p><p className="text-[11px] text-neutral-400">Cortar combustível remotamente</p></div>
                </button>
                <button className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-neutral-50 transition-colors text-left" data-testid={`btn-cmd-unblock-${v.id}`}>
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>
                  <div><p className="text-sm font-medium">Desbloquear</p><p className="text-[11px] text-neutral-400">Liberar combustível</p></div>
                </button>
                <button className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-neutral-50 transition-colors text-left" data-testid={`btn-cmd-siren-${v.id}`}>
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-500" /></div>
                  <div><p className="text-sm font-medium">Sirene / Alerta</p><p className="text-[11px] text-neutral-400">Ativar sirene do rastreador</p></div>
                </button>
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

function VehicleTable({ vehicles, gridData, gerenciadoras }: { vehicles: TrackedVehicle[]; gridData: GridItem[]; gerenciadoras: Gerenciadora[] }) {
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
          <h2 className="font-bold text-sm text-white tracking-wide uppercase" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.08em" }}>Veículos</h2>
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
          <table className="w-full" data-testid="table-vehicles-tracking" style={{ fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr style={{ background: "linear-gradient(180deg, #f5f5f5 0%, #ebebeb 100%)", fontFamily: "'Montserrat', sans-serif" }}>
                <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap w-10">#</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Veículo</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Ignição</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">GPS</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Localização</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Última Pos.</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Motor Parado</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">OS / Status / Cliente</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {onlyVehicles.map((v, index) => {
                const posInfo = getLastPositionInfo(v.tracker?.lastPositionTime);
                const hasLocation = v.tracker?.latitude && v.tracker?.longitude;
                const mapsUrl = hasLocation
                  ? `https://www.google.com/maps?q=${v.tracker!.latitude},${v.tracker!.longitude}`
                  : null;
                const rodizio = isRodizioSP(v.plate);
                const idleTime = getIdleTime(v);
                const isOverSpeed = v.tracker?.speed !== undefined && v.tracker.speed > 110;

                return (
                  <tr
                    key={v.id}
                    className={`transition-colors ${
                      isOverSpeed ? "bg-red-50/80 hover:bg-red-50" :
                      rodizio ? "bg-red-50/30 hover:bg-red-50/50" :
                      index % 2 === 0 ? "bg-white hover:bg-neutral-50/80" : "bg-neutral-50/30 hover:bg-neutral-50/80"
                    }`}
                    data-testid={`row-vehicle-${v.id}`}
                  >
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-neutral-900 text-white font-bold text-[11px] shadow-sm">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-extrabold text-[13px] tracking-wide ${rodizio ? "text-red-600" : "text-neutral-900"}`} style={{ fontFamily: "'Montserrat', sans-serif" }}>
                              {v.plate}
                            </span>
                            {rodizio && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-[8px] px-1.5 py-0.5 bg-red-600 text-white rounded font-bold uppercase animate-pulse shadow-sm">Rodízio SP</span>
                                </TooltipTrigger>
                                <TooltipContent>Veículo em rodízio hoje em São Paulo (7h-10h / 17h-20h)</TooltipContent>
                              </Tooltip>
                            )}
                            {v.trackerType === "truckscontrol" && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-blue-600 text-white rounded font-bold uppercase">TC</span>
                            )}
                            {isOverSpeed && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-red-600 text-white rounded font-bold shadow-sm">
                                {v.tracker!.speed} km/h
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5 leading-tight" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                            {v.brand} {v.model}
                            {v.year ? ` ${v.year}` : ""}
                            {v.color ? <span className="text-neutral-400"> · {v.color}</span> : ""}
                          </p>
                        </div>
                        <VehicleInfoTooltip v={v} />
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center">
                      {!v.hasTracker ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Key className="w-4 h-4 mx-auto text-amber-600 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]" />
                          </TooltipTrigger>
                          <TooltipContent>Sem integração / rastreador</TooltipContent>
                        </Tooltip>
                      ) : v.tracker?.ignition === undefined ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Key className="w-4 h-4 mx-auto text-amber-600 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]" />
                          </TooltipTrigger>
                          <TooltipContent>Sem informação de ignição</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Key className={`w-4 h-4 mx-auto ${v.tracker.ignition ? "text-green-500" : "text-red-500"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.ignition ? "Ignição Ligada" : "Ignição Desligada"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {!v.hasTracker ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className="w-4 h-4 mx-auto text-amber-600 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]" />
                          </TooltipTrigger>
                          <TooltipContent>Sem integração / rastreador</TooltipContent>
                        </Tooltip>
                      ) : v.tracker?.gpsSignal === undefined ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className="w-4 h-4 mx-auto text-amber-600 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]" />
                          </TooltipTrigger>
                          <TooltipContent>Sem informação de GPS</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Signal className={`w-4 h-4 mx-auto ${v.tracker.gpsSignal ? "text-green-500" : "text-red-500"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.gpsSignal ? "GPS OK" : "GPS sem sinal"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    <td className="px-3 py-3 max-w-[240px]">
                      {v.tracker?.address ? (
                        <a
                          href={mapsUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-start gap-1.5 group ${mapsUrl ? "" : "pointer-events-none"}`}
                          data-testid={`link-map-${v.id}`}
                        >
                          <MapPin className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${mapsUrl ? "text-blue-500 group-hover:text-blue-700" : "text-neutral-300"}`} />
                          <span className={`text-[11px] font-medium leading-tight truncate ${mapsUrl ? "text-blue-600 group-hover:text-blue-800 group-hover:underline" : "text-neutral-500"}`} title={v.tracker.address}>
                            {v.tracker.address}
                          </span>
                        </a>
                      ) : hasLocation ? (
                        <a
                          href={mapsUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 text-[11px] font-medium"
                          data-testid={`link-map-${v.id}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <ExternalLink className="w-3 h-3" />
                          Ver no mapa
                        </a>
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${posInfo.dotColor}`} />
                        <span className={`text-[11px] font-semibold ${posInfo.color}`}>{posInfo.text}</span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {idleTime ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                              <Pause className="w-3 h-3" />
                              <span className="text-[11px] font-bold">{idleTime}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Motor ligado, veículo parado há {idleTime}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {v.activeOs ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-neutral-900 text-[11px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{v.activeOs.osNumber}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                              getStatusDisplay(v.activeOs.missionStatus, "em_andamento").className
                            }`}>
                              {getMissionLabel(v.activeOs.missionStatus)}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-medium truncate max-w-[180px]" title={v.activeOs.clientName}>
                            {v.activeOs.clientName}
                          </p>
                        </div>
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center">
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

function SpyTable({ spyDevices }: { spyDevices: TrackedVehicle[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden shadow-sm border-0 ring-1 ring-neutral-200">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors"
        style={{ background: "linear-gradient(135deg, #2d1b69 0%, #1e1145 50%, #2d1b69 100%)" }}
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-spy-table"
      >
        <div className="flex items-center gap-2.5">
          <Radio className="w-4 h-4 text-violet-300" />
          <h2 className="font-bold text-sm text-white tracking-wide uppercase" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.08em" }}>SPY Trackers</h2>
          <span className="text-xs text-violet-300 font-medium ml-0.5">({spyDevices.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-violet-300 hover:text-white transition-colors" /> : <ChevronDown className="w-4 h-4 text-violet-300 hover:text-white transition-colors" />}
      </div>

      {expanded && (
        spyDevices.length === 0 ? (
          <div className="px-4 py-6 text-center text-neutral-400 text-sm" data-testid="text-spy-empty">
            Nenhum dispositivo SPY encontrado na conta TrucksControl
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-spy-tracking" style={{ fontFamily: "'Inter', sans-serif" }}>
              <thead>
                <tr style={{ background: "linear-gradient(180deg, #f5f5f5 0%, #ebebeb 100%)", fontFamily: "'Montserrat', sans-serif" }}>
                  <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Série</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Descrição</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Bateria</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Acoplado</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Km/h</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">GPS</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Localização</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Última Pos.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {spyDevices.map((s, index) => {
                  const posInfo = getLastPositionInfo(s.tracker?.lastPositionTime);
                  const hasLocation = s.tracker?.latitude && s.tracker?.longitude;
                  const mapsUrl = hasLocation
                    ? `https://www.google.com/maps?q=${s.tracker!.latitude},${s.tracker!.longitude}`
                    : null;

                  return (
                    <tr key={s.id} className={`transition-colors ${index % 2 === 0 ? "bg-white hover:bg-neutral-50/80" : "bg-neutral-50/30 hover:bg-neutral-50/80"}`} data-testid={`row-spy-${s.id}`}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[13px] text-violet-700 tracking-wide" style={{ fontFamily: "'Montserrat', sans-serif" }}>{s.plate}</span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-violet-600 text-white rounded font-bold uppercase">SPY</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[12px] font-medium text-neutral-700">{s.model}</td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {s.batteryLevel !== undefined && s.batteryLevel >= 0 ? (
                          <span className={`font-mono font-bold ${
                            s.batteryLevel > 50 ? "text-green-600" :
                            s.batteryLevel > 20 ? "text-amber-600" : "text-red-600"
                          }`}>
                            {s.batteryLevel}%
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Tooltip>
                          <TooltipTrigger>
                            <div className={`w-3 h-3 rounded-full mx-auto ${s.coupled ? "bg-green-500" : "bg-neutral-300"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{s.coupled ? "Acoplado" : "Desacoplado"}</TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {s.tracker?.speed !== undefined ? (
                          <span className={`font-mono font-bold text-[12px] ${(s.tracker.speed ?? 0) > 0 ? "text-blue-700" : "text-neutral-400"}`}>
                            {s.tracker.speed}
                          </span>
                        ) : (
                          <span className="text-neutral-300 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {s.tracker?.gpsSignal === undefined ? (
                          <Signal className="w-4 h-4 mx-auto text-amber-600 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]" />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger>
                              <Signal className={`w-4 h-4 mx-auto ${s.tracker.gpsSignal ? "text-green-500" : "text-red-500"}`} />
                            </TooltipTrigger>
                            <TooltipContent>{s.tracker.gpsSignal ? "Sinal OK" : "Sem sinal"}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-[240px]">
                        {s.tracker?.address ? (
                          <a
                            href={mapsUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-start gap-1.5 group ${mapsUrl ? "" : "pointer-events-none"}`}
                          >
                            <MapPin className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${mapsUrl ? "text-violet-500 group-hover:text-violet-700" : "text-neutral-300"}`} />
                            <span className={`text-[11px] font-medium leading-tight truncate ${mapsUrl ? "text-violet-600 group-hover:text-violet-800 group-hover:underline" : "text-neutral-500"}`} title={s.tracker.address}>
                              {s.tracker.address}
                            </span>
                          </a>
                        ) : hasLocation ? (
                          <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-500 hover:text-violet-700 text-[11px] font-medium">
                            <MapPin className="w-3.5 h-3.5" />
                            <ExternalLink className="w-3 h-3" />
                            Ver no mapa
                          </a>
                        ) : (
                          <span className="text-neutral-300 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${posInfo.dotColor}`} />
                          <span className={`text-[11px] font-semibold ${posInfo.color}`}>{posInfo.text}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  );
}

function OperationsTable({ gridData }: { gridData: GridItem[] }) {
  const [expanded, setExpanded] = useState(true);

  if (gridData.length === 0) return null;

  return (
    <Card className="overflow-hidden shadow-sm border-0 ring-1 ring-neutral-200">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors"
        style={{ background: "linear-gradient(135deg, #0f4c3a 0%, #1a3a2e 50%, #0f4c3a 100%)" }}
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-operations-table"
      >
        <div className="flex items-center gap-2.5">
          <Radio className="w-4 h-4 text-emerald-300" />
          <h2 className="font-bold text-sm text-white tracking-wide uppercase" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.08em" }}>Operações Ativas</h2>
          <span className="text-xs text-emerald-300 font-medium ml-0.5">({gridData.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-emerald-300 hover:text-white transition-colors" /> : <ChevronDown className="w-4 h-4 text-emerald-300 hover:text-white transition-colors" />}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="table-operational-grid" style={{ fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr style={{ background: "linear-gradient(180deg, #f5f5f5 0%, #ebebeb 100%)", fontFamily: "'Montserrat', sans-serif" }}>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Nº OS</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Cliente</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Agentes</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Veículo</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Prioridade</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold text-neutral-500 uppercase tracking-[0.12em] whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {gridData.map((item, index) => {
                const priorityInfo = getPriorityDisplay(item.priority);
                const PriorityIcon = priorityInfo.icon;
                const statusInfo = getStatusDisplay(item.missionStatus, item.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <tr key={item.id} className={`transition-colors ${index % 2 === 0 ? "bg-white hover:bg-neutral-50/80" : "bg-neutral-50/30 hover:bg-neutral-50/80"}`} data-testid={`row-grid-${item.id}`}>
                    <td className="px-3 py-3 font-bold text-[12px] text-neutral-900 whitespace-nowrap" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.osNumber}</td>
                    <td className="px-3 py-3 text-[12px] font-medium text-neutral-700">{item.clientName}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        {item.employee1 && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-700">
                            {item.employee1.name}
                            {item.employee1.phone && (
                              <a href={`https://wa.me/${formatPhone(item.employee1.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600">
                                <SiWhatsapp className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </span>
                        )}
                        {item.employee2 && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
                            {item.employee2.name}
                            {item.employee2.phone && (
                              <a href={`https://wa.me/${formatPhone(item.employee2.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600">
                                <SiWhatsapp className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </span>
                        )}
                        {!item.employee1 && !item.employee2 && <span className="text-neutral-300 text-[11px]">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {item.vehicle ? (
                        <span className="font-bold text-[12px] text-neutral-700 tracking-wide" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.vehicle.plate}</span>
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold border ${priorityInfo.className}`}>
                        <PriorityIcon className="w-3 h-3" />
                        {priorityInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold border ${statusInfo.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
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

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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

export default function OperationalGridPage() {
  const [lastRefresh, setLastRefresh] = useState(Date.now());

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
  const spyDevices = vehicles.filter((v) => v.deviceType === "spy");
  const trackedCount = onlyVehicles.filter((v) => v.hasTracker).length;
  const withPositionCount = vehicles.filter((v) => v.tracker?.latitude).length;
  const tcCount = onlyVehicles.filter((v) => v.trackerType === "truckscontrol").length;
  const activeOsCount = gridData.length;

  const lastRefreshStr = new Date(lastRefresh).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-grid-title" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                Grid Operacional
              </h1>
              <TrucksControlStatus />
            </div>
            <p className="text-sm text-neutral-500 mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>
              Monitoramento em tempo real · {onlyVehicles.length} veículo(s) · {trackedCount} com rastreador{tcCount > 0 ? ` (${tcCount} TC)` : ""}{spyDevices.length > 0 ? ` · ${spyDevices.length} SPY` : ""} · {withPositionCount} com posição · {activeOsCount} operação(ões)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5" data-testid="countdown-timer">
              <Timer className="w-3.5 h-3.5 text-neutral-400" />
              <span>Próxima: <span className="font-semibold text-neutral-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>{countdown.display}</span></span>
              <span className="text-neutral-300">|</span>
              <span>Última: {lastRefreshStr}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              data-testid="button-refresh-grid"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <div className="p-12 text-center text-neutral-400">Carregando grid operacional...</div>
          </Card>
        ) : (
          <>
            <SpeedAlert vehicles={vehicles} />
            <VehicleMap vehicles={vehicles} />
            <VehicleTable vehicles={vehicles} gridData={gridData} gerenciadoras={gerenciadoras} />
            <SpyTable spyDevices={spyDevices} />
            <OperationsTable gridData={gridData} />
            <div className="text-xs text-neutral-400 text-right" data-testid="text-grid-count">
              Atualização automática a cada 5 minutos (limite API TrucksControl)
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
