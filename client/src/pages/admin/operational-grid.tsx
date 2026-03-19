import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MapPin, Key, Satellite, RefreshCw, Radio,
  ExternalLink, Zap, CalendarClock, Recycle,
  Building2, Navigation, Play, Flag, CircleCheckBig,
  Clock, Truck, CircleDot, Pause, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Timer,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";

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
  color: string | null;
  status: string;
  hasTracker: boolean;
  trackerId: string | null;
  trackerType: string;
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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getLastPositionInfo(lastPositionTime?: string) {
  if (!lastPositionTime) return { text: "—", color: "text-neutral-400", dotColor: "bg-neutral-300" };
  const diffMin = Math.floor((Date.now() - new Date(lastPositionTime).getTime()) / 60000);
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  if (diffMin > 30) return { text: timeStr, color: "text-red-600", dotColor: "bg-red-500" };
  if (diffMin > 5) return { text: timeStr, color: "text-amber-600", dotColor: "bg-amber-500" };
  return { text: timeStr, color: "text-green-600", dotColor: "bg-green-500" };
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

function SpyTable({ spyDevices }: { spyDevices: TrackedVehicle[] }) {
  const [expanded, setExpanded] = useState(true);

  if (spyDevices.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-violet-50 border-b cursor-pointer hover:bg-violet-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-spy-table"
      >
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-600" />
          <h2 className="font-semibold text-sm text-violet-800">SPY Trackers</h2>
          <span className="text-xs text-violet-500 ml-1">({spyDevices.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-violet-400" /> : <ChevronDown className="w-4 h-4 text-violet-400" />}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-spy-tracking">
            <thead>
              <tr className="border-b bg-neutral-50/50">
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Série</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Descrição</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Bateria</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Acoplado</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Km/h</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">GPS</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Localização</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Última Pos.</th>
              </tr>
            </thead>
            <tbody>
              {spyDevices.map((s) => {
                const posInfo = getLastPositionInfo(s.tracker?.lastPositionTime);
                const hasLocation = s.tracker?.latitude && s.tracker?.longitude;
                const mapsUrl = hasLocation
                  ? `https://www.google.com/maps?q=${s.tracker!.latitude},${s.tracker!.longitude}`
                  : null;

                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-neutral-50 transition-colors" data-testid={`row-spy-${s.id}`}>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-violet-700">{s.plate}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-violet-50 text-violet-600 border border-violet-200 rounded font-medium">SPY</span>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-neutral-800">{s.model}</td>
                    <td className="p-3 text-center whitespace-nowrap">
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
                    <td className="p-3 text-center">
                      <Tooltip>
                        <TooltipTrigger>
                          <div className={`w-3 h-3 rounded-full mx-auto ${s.coupled ? "bg-green-500" : "bg-neutral-300"}`} />
                        </TooltipTrigger>
                        <TooltipContent>{s.coupled ? "Acoplado" : "Desacoplado"}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {s.tracker?.speed !== undefined ? (
                        <span className={`font-mono font-bold ${(s.tracker.speed ?? 0) > 0 ? "text-blue-700" : "text-neutral-400"}`}>
                          {s.tracker.speed}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {s.tracker?.gpsSignal === undefined ? (
                        <Satellite className="w-4 h-4 mx-auto text-neutral-300" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Satellite className={`w-4 h-4 mx-auto ${s.tracker.gpsSignal ? "text-green-500" : "text-red-500"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{s.tracker.gpsSignal ? "Sinal OK" : "Sem sinal"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="p-3 max-w-[250px]">
                      {s.tracker?.address ? (
                        <div className="flex items-start gap-1.5">
                          {mapsUrl ? (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-800 flex-shrink-0 mt-0.5">
                              <MapPin className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <MapPin className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="text-xs text-neutral-600 truncate" title={s.tracker.address}>{s.tracker.address}</span>
                        </div>
                      ) : hasLocation ? (
                        <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 text-xs">
                          <MapPin className="w-3.5 h-3.5" />
                          <ExternalLink className="w-3 h-3" />
                          Ver no mapa
                        </a>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${posInfo.dotColor}`} />
                        <span className={`text-xs font-medium ${posInfo.color}`}>{posInfo.text}</span>
                      </div>
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

function VehicleTable({ vehicles, gridData }: { vehicles: TrackedVehicle[]; gridData: GridItem[] }) {
  const [expanded, setExpanded] = useState(true);

  const onlyVehicles = vehicles.filter(v => v.deviceType !== "spy");

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b cursor-pointer hover:bg-neutral-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-vehicles-table"
      >
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-neutral-600" />
          <h2 className="font-semibold text-sm text-neutral-800">Veículos</h2>
          <span className="text-xs text-neutral-500 ml-1">({onlyVehicles.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-vehicles-tracking">
            <thead>
              <tr className="border-b bg-neutral-50/50">
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Placa</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Veículo</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Status</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Km/h</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Ignição</th>
                <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">GPS</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Localização</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Última Pos.</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">OS / Missão</th>
              </tr>
            </thead>
            <tbody>
              {onlyVehicles.map((v) => {
                const posInfo = getLastPositionInfo(v.tracker?.lastPositionTime);
                const hasLocation = v.tracker?.latitude && v.tracker?.longitude;
                const mapsUrl = hasLocation
                  ? `https://www.google.com/maps?q=${v.tracker!.latitude},${v.tracker!.longitude}`
                  : null;

                return (
                  <tr
                    key={v.id}
                    className={`border-b last:border-0 hover:bg-neutral-50 transition-colors ${v.activeOs ? "" : "opacity-60"}`}
                    data-testid={`row-vehicle-${v.id}`}
                  >
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-neutral-900">{v.plate}</span>
                        {v.trackerType === "truckscontrol" && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium">TC</span>
                        )}
                        {v.trackerType === "custom" && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-neutral-50 text-neutral-500 border border-neutral-200 rounded font-medium">API</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <div>
                        <span className="text-neutral-800">{v.brand} {v.model}</span>
                        {v.color && <span className="text-neutral-400 text-xs ml-1.5">({v.color})</span>}
                      </div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                        v.status === "disponível" ? "bg-green-50 text-green-700" :
                        v.status === "em_uso" || v.status === "em uso" ? "bg-blue-50 text-blue-700" :
                        v.status === "manutenção" ? "bg-amber-50 text-amber-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{v.status}</span>
                    </td>

                    <td className="p-3 text-center whitespace-nowrap">
                      {v.hasTracker && v.tracker?.speed !== undefined ? (
                        <span className={`font-mono font-bold ${(v.tracker.speed ?? 0) > 0 ? "text-blue-700" : "text-neutral-400"}`}>
                          {v.tracker.speed}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {!v.hasTracker ? (
                        <Key className="w-4 h-4 mx-auto text-neutral-200" />
                      ) : v.tracker?.ignition === undefined ? (
                        <Key className="w-4 h-4 mx-auto text-neutral-300" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Key className={`w-4 h-4 mx-auto ${v.tracker.ignition ? "text-green-500" : "text-red-500"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.ignition ? "Ligada" : "Desligada"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {!v.hasTracker ? (
                        <Satellite className="w-4 h-4 mx-auto text-neutral-200" />
                      ) : v.tracker?.gpsSignal === undefined ? (
                        <Satellite className="w-4 h-4 mx-auto text-neutral-300" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Satellite className={`w-4 h-4 mx-auto ${v.tracker.gpsSignal ? "text-green-500" : "text-red-500"}`} />
                          </TooltipTrigger>
                          <TooltipContent>{v.tracker.gpsSignal ? "Sinal OK" : "Sem sinal"}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    <td className="p-3 max-w-[250px]">
                      {v.tracker?.address ? (
                        <div className="flex items-start gap-1.5">
                          {mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex-shrink-0 mt-0.5"
                              data-testid={`link-map-${v.id}`}
                            >
                              <MapPin className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <MapPin className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="text-xs text-neutral-600 truncate" title={v.tracker.address}>
                            {v.tracker.address}
                          </span>
                        </div>
                      ) : hasLocation ? (
                        <a
                          href={mapsUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                          data-testid={`link-map-${v.id}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <ExternalLink className="w-3 h-3" />
                          Ver no mapa
                        </a>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${posInfo.dotColor}`} />
                        <span className={`text-xs font-medium ${posInfo.color}`}>{posInfo.text}</span>
                      </div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {v.activeOs ? (
                        <div>
                          <span className="font-mono font-semibold text-neutral-800 text-xs">{v.activeOs.osNumber}</span>
                          <span className="text-neutral-400 mx-1">·</span>
                          <span className="text-xs text-neutral-500">{getMissionLabel(v.activeOs.missionStatus)}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
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

function OperationsTable({ gridData }: { gridData: GridItem[] }) {
  const [expanded, setExpanded] = useState(true);

  if (gridData.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b cursor-pointer hover:bg-neutral-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid="toggle-operations-table"
      >
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-neutral-600" />
          <h2 className="font-semibold text-sm text-neutral-800">Operações Ativas</h2>
          <span className="text-xs text-neutral-500 ml-1">({gridData.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-operational-grid">
            <thead>
              <tr className="border-b bg-neutral-50/50">
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Nº OS</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Cliente</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Agentes</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Veículo</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Prioridade</th>
                <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {gridData.map((item) => {
                const priorityInfo = getPriorityDisplay(item.priority);
                const PriorityIcon = priorityInfo.icon;
                const statusInfo = getStatusDisplay(item.missionStatus, item.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-neutral-50 transition-colors" data-testid={`row-grid-${item.id}`}>
                    <td className="p-3 font-mono font-semibold text-neutral-900 whitespace-nowrap">{item.osNumber}</td>
                    <td className="p-3 text-neutral-700">{item.clientName}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        {item.employee1 && (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {item.employee1.name}
                            {item.employee1.phone && (
                              <a href={`https://wa.me/${formatPhone(item.employee1.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600">
                                <SiWhatsapp className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </span>
                        )}
                        {item.employee2 && (
                          <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
                            {item.employee2.name}
                            {item.employee2.phone && (
                              <a href={`https://wa.me/${formatPhone(item.employee2.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600">
                                <SiWhatsapp className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </span>
                        )}
                        {!item.employee1 && !item.employee2 && <span className="text-neutral-400 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {item.vehicle ? (
                        <span className="font-mono text-neutral-700">{item.vehicle.plate}</span>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold border ${priorityInfo.className}`}>
                        <PriorityIcon className="w-3.5 h-3.5" />
                        {priorityInfo.label}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${statusInfo.className}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
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
      const { authFetch } = await import("@/lib/queryClient");
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
              <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-grid-title">
                Grid Operacional
              </h1>
              <TrucksControlStatus />
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              Monitoramento em tempo real · {onlyVehicles.length} veículo(s) · {trackedCount} com rastreador{tcCount > 0 ? ` (${tcCount} TC)` : ""}{spyDevices.length > 0 ? ` · ${spyDevices.length} SPY` : ""} · {withPositionCount} com posição · {activeOsCount} operação(ões)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5" data-testid="countdown-timer">
              <Timer className="w-3.5 h-3.5 text-neutral-400" />
              <span>Próxima: <span className="font-mono font-semibold text-neutral-700">{countdown.display}</span></span>
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
            <VehicleMap vehicles={vehicles} />
            <VehicleTable vehicles={vehicles} gridData={gridData} />
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
