import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MapPin, Pencil, Key, Satellite, RefreshCw, Radio,
  ExternalLink, MessageCircle,
  Zap, CalendarClock, Recycle,
  Building2, Navigation, Play, Flag, CircleCheckBig,
  Clock, Truck, CircleDot, Pause, AlertTriangle,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useLocation } from "wouter";

interface GridEmployee {
  name: string;
  phone: string | null;
}

interface GridTracker {
  latitude?: number;
  longitude?: number;
  ignition?: boolean;
  lastPositionTime?: string;
  gpsSignal?: boolean;
  speed?: number;
  address?: string;
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
  tracker: GridTracker | null;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return withCountry;
}

function getLastPositionStatus(lastPositionTime?: string): {
  color: string;
  text: string;
  bgClass: string;
} {
  if (!lastPositionTime) {
    return { color: "text-neutral-400", text: "—", bgClass: "bg-neutral-100" };
  }

  const now = new Date();
  const last = new Date(lastPositionTime);
  const diffMs = now.getTime() - last.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  if (diffMin > 30) {
    return { color: "text-red-700", text: timeStr, bgClass: "bg-red-50 border-red-200" };
  }
  if (diffMin > 5) {
    return { color: "text-amber-700", text: timeStr, bgClass: "bg-amber-50 border-amber-200" };
  }
  return { color: "text-green-700", text: timeStr, bgClass: "bg-green-50 border-green-200" };
}

function IgnitionIcon({ on }: { on?: boolean }) {
  if (on === undefined || on === null) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center justify-center" data-testid="icon-ignition-unknown">
            <Key className="w-5 h-5 text-neutral-300" />
          </div>
        </TooltipTrigger>
        <TooltipContent>Sem dados</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center justify-center" data-testid={`icon-ignition-${on ? "on" : "off"}`}>
          <Key className={`w-5 h-5 ${on ? "text-green-500" : "text-red-500"}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{on ? "Ligada" : "Desligada"}</TooltipContent>
    </Tooltip>
  );
}

function GpsSignalIcon({ signal }: { signal?: boolean }) {
  if (signal === undefined || signal === null) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center justify-center" data-testid="icon-gps-unknown">
            <Satellite className="w-5 h-5 text-neutral-300" />
          </div>
        </TooltipTrigger>
        <TooltipContent>Sem dados</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center justify-center" data-testid={`icon-gps-${signal ? "ok" : "lost"}`}>
          <Satellite className={`w-5 h-5 ${signal ? "text-green-500" : "text-red-500"}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{signal ? "Sinal OK" : "Sem sinal"}</TooltipContent>
    </Tooltip>
  );
}

function EmployeeCell({ emp }: { emp: GridEmployee | null }) {
  if (!emp) return <span className="text-neutral-400">—</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm">{emp.name}</span>
      {emp.phone && (
        <a
          href={`https://wa.me/${formatPhone(emp.phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-500 hover:text-green-600 transition-colors"
          data-testid={`link-whatsapp-${emp.phone}`}
          title={`WhatsApp: ${emp.phone}`}
        >
          <SiWhatsapp className="w-4 h-4" />
        </a>
      )}
    </span>
  );
}

function getPriorityDisplay(priority: string) {
  switch (priority) {
    case "imediata":
      return {
        label: "Imediata",
        icon: Zap,
        className: "bg-red-50 text-red-700 border-red-200",
      };
    case "agendada":
      return {
        label: "Agendada",
        icon: CalendarClock,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "reaproveitamento":
      return {
        label: "Reaproveitamento",
        icon: Recycle,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    default:
      return {
        label: priority,
        icon: CalendarClock,
        className: "bg-neutral-50 text-neutral-600 border-neutral-200",
      };
  }
}

function getStatusDisplay(missionStatus: string, osStatus: string) {
  if (osStatus === "aberta") {
    return {
      label: "Aguardando Despacho",
      icon: Clock,
      className: "bg-slate-50 text-slate-600 border-slate-200",
    };
  }

  switch (missionStatus) {
    case "aguardando":
      return {
        label: "Saída da Base",
        icon: Building2,
        className: "bg-slate-100 text-slate-700 border-slate-300",
      };
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return {
        label: "Saída da Base",
        icon: Building2,
        className: "bg-amber-50 text-amber-700 border-amber-200",
      };
    case "em_transito_origem":
      return {
        label: "Chegada na Origem",
        icon: Navigation,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return {
        label: "Chegada na Origem",
        icon: Navigation,
        className: "bg-cyan-50 text-cyan-700 border-cyan-200",
      };
    case "iniciar_missao":
      return {
        label: "Início de Missão",
        icon: Play,
        className: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    case "em_transito_destino":
      return {
        label: "Chegada no Destino",
        icon: Flag,
        className: "bg-violet-50 text-violet-700 border-violet-200",
      };
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return {
        label: "Término de Missão",
        icon: CircleCheckBig,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "finalizada":
      return {
        label: "Término de Missão",
        icon: CircleCheckBig,
        className: "bg-green-50 text-green-700 border-green-200",
      };
    default:
      return {
        label: missionStatus || "—",
        icon: CircleDot,
        className: "bg-neutral-50 text-neutral-600 border-neutral-200",
      };
  }
}

function getMissionDisplay(missionStatus: string, tracker?: GridTracker | null) {
  const isMoving = tracker?.ignition && (tracker?.speed ?? 0) > 5;
  const isStopped = tracker?.ignition === false;
  const hasTracker = tracker !== null && tracker !== undefined;

  switch (missionStatus) {
    case "aguardando":
      return {
        label: "Aguardando",
        icon: Clock,
        className: "text-slate-600 bg-slate-50 border-slate-200",
      };
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return {
        label: "Preparando Saída",
        icon: Building2,
        className: "text-amber-700 bg-amber-50 border-amber-200",
      };
    case "em_transito_origem":
      if (hasTracker && isMoving) {
        return {
          label: "Em Trânsito",
          icon: Truck,
          className: "text-blue-700 bg-blue-50 border-blue-200",
        };
      }
      if (hasTracker && isStopped) {
        return {
          label: "Parado",
          icon: Pause,
          className: "text-amber-700 bg-amber-50 border-amber-200",
        };
      }
      return {
        label: "Em Trânsito",
        icon: Truck,
        className: "text-blue-700 bg-blue-50 border-blue-200",
      };
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return {
        label: "No Cliente",
        icon: MapPin,
        className: "text-cyan-700 bg-cyan-50 border-cyan-200",
      };
    case "iniciar_missao":
      return {
        label: "Em Escolta",
        icon: Truck,
        className: "text-indigo-700 bg-indigo-50 border-indigo-200",
      };
    case "em_transito_destino":
      if (hasTracker && isMoving) {
        return {
          label: "Em Trânsito",
          icon: Truck,
          className: "text-violet-700 bg-violet-50 border-violet-200",
        };
      }
      if (hasTracker && isStopped) {
        return {
          label: "Parado",
          icon: Pause,
          className: "text-amber-700 bg-amber-50 border-amber-200",
        };
      }
      return {
        label: "Em Trânsito",
        icon: Truck,
        className: "text-violet-700 bg-violet-50 border-violet-200",
      };
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return {
        label: "Finalizando",
        icon: CircleCheckBig,
        className: "text-emerald-700 bg-emerald-50 border-emerald-200",
      };
    case "finalizada":
      return {
        label: "Concluída",
        icon: CircleCheckBig,
        className: "text-green-700 bg-green-50 border-green-200",
      };
    default:
      return {
        label: missionStatus || "—",
        icon: CircleDot,
        className: "text-neutral-600 bg-neutral-50 border-neutral-200",
      };
  }
}

export default function OperationalGridPage() {
  const [, setLocation] = useLocation();

  const { data: gridData, isLoading, refetch, isFetching } = useQuery<GridItem[]>({
    queryKey: ["/api/operational-grid"],
    refetchInterval: 15000,
  });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-grid-title">
              Grid Operacional
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Monitoramento em tempo real das operações ativas
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-grid"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            Atualizado (&lt; 5min)
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Atenção (5-30min)
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            Crítico (&gt; 30min)
          </span>
          <span className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-green-500" /> Ligada
          </span>
          <span className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-red-500" /> Desligada
          </span>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center text-neutral-400">
              Carregando grid operacional...
            </CardContent>
          </Card>
        ) : !gridData || gridData.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center" data-testid="text-grid-empty">
              <Radio className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p className="text-neutral-500 font-medium">Nenhuma operação ativa</p>
              <p className="text-neutral-400 text-sm mt-1">
                As ordens de serviço abertas ou em andamento aparecerão aqui
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-operational-grid">
                <thead>
                  <tr className="border-b bg-neutral-50">
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Nº OS</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Agendamento</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Cliente</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Agentes</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Prioridade</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Status</th>
                    <th className="p-3 text-left font-semibold text-neutral-700 whitespace-nowrap">Missão</th>
                    <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Localização</th>
                    <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Ignição</th>
                    <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Última Pos.</th>
                    <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">GPS</th>
                    <th className="p-3 text-center font-semibold text-neutral-700 whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {gridData.map((item) => {
                    const posStatus = getLastPositionStatus(item.tracker?.lastPositionTime);
                    const hasLocation = item.tracker?.latitude && item.tracker?.longitude;
                    const mapsUrl = hasLocation
                      ? `https://www.google.com/maps?q=${item.tracker!.latitude},${item.tracker!.longitude}`
                      : null;

                    const priorityInfo = getPriorityDisplay(item.priority);
                    const PriorityIcon = priorityInfo.icon;

                    const statusInfo = getStatusDisplay(item.missionStatus, item.status);
                    const StatusIcon = statusInfo.icon;

                    const missionInfo = getMissionDisplay(item.missionStatus, item.tracker);
                    const MissionIcon = missionInfo.icon;

                    return (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-neutral-50 transition-colors"
                        data-testid={`row-grid-${item.id}`}
                      >
                        <td className="p-3 font-mono font-semibold text-neutral-900 whitespace-nowrap" data-testid={`text-os-number-${item.id}`}>
                          {item.osNumber}
                        </td>

                        <td className="p-3 whitespace-nowrap" data-testid={`text-scheduled-${item.id}`}>
                          {item.scheduledDate ? (
                            <div>
                              <div className="font-medium text-neutral-800">
                                {new Date(item.scheduledDate).toLocaleDateString("pt-BR")}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {new Date(item.scheduledDate).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>

                        <td className="p-3" data-testid={`text-client-${item.id}`}>
                          <span className="font-medium text-neutral-800">{item.clientName}</span>
                        </td>

                        <td className="p-3" data-testid={`cell-agents-${item.id}`}>
                          <div className="flex flex-col gap-0.5">
                            <EmployeeCell emp={item.employee1} />
                            {item.employee2 && (
                              <>
                                <span className="text-neutral-300 text-xs">—</span>
                                <EmployeeCell emp={item.employee2} />
                              </>
                            )}
                            {!item.employee1 && !item.employee2 && (
                              <span className="text-neutral-400 text-xs">Sem agentes</span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 whitespace-nowrap" data-testid={`cell-priority-${item.id}`}>
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold border ${priorityInfo.className}`}>
                            <PriorityIcon className="w-3.5 h-3.5" />
                            {priorityInfo.label}
                          </span>
                        </td>

                        <td className="p-3 whitespace-nowrap" data-testid={`cell-status-${item.id}`}>
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${statusInfo.className}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusInfo.label}
                          </span>
                        </td>

                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${missionInfo.className}`}
                            data-testid={`badge-mission-${item.id}`}
                          >
                            <MissionIcon className="w-3.5 h-3.5" />
                            {missionInfo.label}
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          {!item.vehicle?.hasTracker ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-neutral-300 text-xs" data-testid={`text-no-tracker-${item.id}`}>
                                  <MapPin className="w-5 h-5 mx-auto text-neutral-300" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Sem rastreador</TooltipContent>
                            </Tooltip>
                          ) : mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                              data-testid={`link-map-${item.id}`}
                            >
                              <MapPin className="w-5 h-5" />
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                <MapPin className="w-5 h-5 mx-auto text-neutral-300" data-testid={`icon-no-location-${item.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>Aguardando posição</TooltipContent>
                            </Tooltip>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          {!item.vehicle?.hasTracker ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Key className="w-5 h-5 mx-auto text-neutral-300" />
                              </TooltipTrigger>
                              <TooltipContent>Sem rastreador</TooltipContent>
                            </Tooltip>
                          ) : (
                            <IgnitionIcon on={item.tracker?.ignition} />
                          )}
                        </td>

                        <td className="p-3 text-center">
                          {!item.vehicle?.hasTracker ? (
                            <span className="text-neutral-300 text-xs">—</span>
                          ) : (
                            <div
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${posStatus.bgClass} ${posStatus.color}`}
                              data-testid={`text-last-pos-${item.id}`}
                            >
                              {posStatus.text}
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          {!item.vehicle?.hasTracker ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Satellite className="w-5 h-5 mx-auto text-neutral-300" />
                              </TooltipTrigger>
                              <TooltipContent>Sem rastreador</TooltipContent>
                            </Tooltip>
                          ) : (
                            <GpsSignalIcon signal={item.tracker?.gpsSignal} />
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setLocation("/admin/service-orders");
                            }}
                            data-testid={`button-edit-os-${item.id}`}
                            title="Editar OS"
                          >
                            <Pencil className="w-4 h-4 text-neutral-600" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {gridData && gridData.length > 0 && (
          <div className="text-xs text-neutral-400 text-right" data-testid="text-grid-count">
            {gridData.length} operação(ões) ativa(s) · Atualização automática a cada 15s
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
