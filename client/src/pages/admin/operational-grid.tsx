import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MapPin, Pencil, Key, Satellite, RefreshCw, Radio,
  ExternalLink, MessageCircle
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

const MISSION_STATUS_LABELS: Record<string, string> = {
  aguardando: "Aguardando",
  km_saida: "KM Saída",
  checklist_saida: "Checklist Saída",
  em_transito_origem: "Em Trânsito",
  km_chegada_origem: "KM Chegada",
  fotos_cliente: "Fotos Cliente",
  em_transito_destino: "Retornando",
  km_chegada_destino: "KM Destino",
  checklist_retorno: "Checklist Retorno",
  finalizada: "Finalizada",
};

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

                        <td className="p-3 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              item.missionStatus === "finalizada"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : item.status === "em_andamento"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-neutral-50 text-neutral-600 border-neutral-200"
                            }`}
                            data-testid={`badge-mission-${item.id}`}
                          >
                            {MISSION_STATUS_LABELS[item.missionStatus] || item.missionStatus}
                          </Badge>
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