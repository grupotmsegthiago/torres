import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Car, Radio, Clock, MapPin, Calendar, User, AlertCircle, ChevronRight, Activity, ChevronLeft } from "lucide-react";
import AdminLayout from "@/components/admin/layout";

type GridOs = {
  id: number;
  osNumber: string;
  status: string;
  missionStatus?: string | null;
  missionStartedAt?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicle?: { plate: string; model: string; brand?: string } | null;
  employee1?: { name: string } | null;
  employee2?: { name: string } | null;
  type?: string | null;
};

type Vehicle = {
  id: number;
  plate: string;
  model: string;
  brand?: string;
  status?: string;
  available?: boolean;
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const fmtTimeOnly = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const fmtScheduled = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
    }).formatToParts(d);
    const wdShort = parts.find(p => p.type === "weekday")?.value || "";
    const map: Record<string, string> = { Sun: "Domingo", Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta", Fri: "Sexta", Sat: "Sábado" };
    const dh = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `${map[wdShort] || wdShort} - ${dh}`;
  } catch {
    return iso;
  }
};

const isActive = (o: GridOs) =>
  o.status !== "recusada" &&
  o.status !== "cancelada" &&
  o.missionStatus !== "encerrada" &&
  (o.status === "em_andamento" || (o.status === "agendada" && !!o.missionStartedAt));

const isScheduled = (o: GridOs) =>
  o.status !== "recusada" &&
  o.status !== "cancelada" &&
  o.missionStatus !== "encerrada" &&
  o.status === "agendada" &&
  !o.missionStartedAt;

const isOverdue = (o: GridOs, nowMs: number) => {
  if (!isScheduled(o) || !o.scheduledDate) return false;
  return new Date(o.scheduledDate).getTime() < nowMs - 5 * 60 * 1000;
};

const fmtOverdue = (iso?: string | null, nowMs?: number) => {
  if (!iso || !nowMs) return "";
  const diffMin = Math.floor((nowMs - new Date(iso).getTime()) / 60000);
  if (diffMin < 60) return `${diffMin} min atrasada`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ""} atrasada`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h atrasada`;
};

export default function AgendaVtrPage() {
  const { data: gridOrders = [], isLoading: l1 } = useQuery<GridOs[]>({
    queryKey: ["/api/operational-grid"],
    refetchInterval: 30000,
  });

  const { data: vehicles = [], isLoading: l2 } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const isLoading = l1 || l2;
  const nowMs = Date.now();

  const grouped = vehicles.map((v) => {
    const ordersForVehicle = gridOrders.filter((o) => o.vehicle?.plate === v.plate);
    const active = ordersForVehicle.filter(isActive);
    const scheduledAll = ordersForVehicle
      .filter(isScheduled)
      .sort((a, b) => {
        const ta = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
        const tb = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
        return ta - tb;
      });
    const overdue = scheduledAll.filter((o) => isOverdue(o, nowMs));
    const scheduled = scheduledAll.filter((o) => !isOverdue(o, nowMs));
    return { vehicle: v, active, scheduled, overdue };
  });

  const orphanOrders = gridOrders.filter((o) => !o.vehicle?.plate && (isActive(o) || isScheduled(o)));

  const totalActive = grouped.reduce((acc, g) => acc + g.active.length, 0);
  const totalScheduled = grouped.reduce((acc, g) => acc + g.scheduled.length, 0);
  const totalOverdue = grouped.reduce((acc, g) => acc + g.overdue.length, 0);
  const busyVehicles = grouped.filter((g) => g.active.length > 0).length;
  const idleVehicles = grouped.filter((g) => g.active.length === 0 && g.scheduled.length === 0).length;

  return (
    <AdminLayout>
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight" data-testid="text-page-title">Agenda da VTR</h1>
          <p className="text-xs text-neutral-500 mt-1">Visão por viatura · missões em curso e próximos agendamentos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]" data-testid="badge-active-total">
            <Activity className="w-3 h-3 mr-1" /> {totalActive} ativas
          </Badge>
          <Badge className="bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]" data-testid="badge-scheduled-total">
            <Calendar className="w-3 h-3 mr-1" /> {totalScheduled} agendadas
          </Badge>
          {totalOverdue > 0 && (
            <Badge className="bg-red-50 text-red-700 border border-red-300 font-bold text-[10px] animate-pulse" data-testid="badge-overdue-total">
              <AlertCircle className="w-3 h-3 mr-1" /> {totalOverdue} ATRASADA{totalOverdue > 1 ? "S" : ""}
            </Badge>
          )}
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]" data-testid="badge-busy-vehicles">
            <Car className="w-3 h-3 mr-1" /> {busyVehicles} VTR ocupadas
          </Badge>
          <Badge className="bg-neutral-50 text-neutral-700 border border-neutral-200 font-bold text-[10px]" data-testid="badge-idle-vehicles">
            {idleVehicles} VTR livres
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-neutral-300" />
        </div>
      ) : grouped.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
          <Car size={48} className="mx-auto text-neutral-200 mb-4" />
          <p className="text-sm font-black text-neutral-400 uppercase">Nenhuma viatura cadastrada</p>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="flex gap-4 min-w-min">
            {grouped.map(({ vehicle, active, scheduled, overdue }) => {
              const hasActivity = active.length > 0 || scheduled.length > 0 || overdue.length > 0;
              const cardBorder = overdue.length > 0
                ? "border-red-300 ring-2 ring-red-100"
                : active.length > 0
                  ? "border-emerald-300 ring-2 ring-emerald-100"
                  : scheduled.length > 0
                    ? "border-blue-200"
                    : "border-neutral-200";
              return (
                <Card
                  key={vehicle.id}
                  className={`w-[320px] flex-shrink-0 flex flex-col bg-white border-2 ${cardBorder} shadow-sm overflow-hidden`}
                  data-testid={`card-vehicle-${vehicle.id}`}
                >
                  <div className={`px-4 py-3 border-b ${overdue.length > 0 ? "bg-red-50 border-red-200" : active.length > 0 ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50 border-neutral-200"}`}>
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active.length > 0 ? "bg-emerald-600" : "bg-neutral-800"}`}>
                          <Car size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-neutral-900 font-mono uppercase tracking-wider">{vehicle.plate}</p>
                          <p className="text-[10px] text-neutral-500 font-semibold uppercase">{vehicle.brand || ""} {vehicle.model}</p>
                        </div>
                      </div>
                      {overdue.length > 0 ? (
                        <Badge className="bg-red-600 text-white border-0 font-bold text-[9px] animate-pulse">
                          <AlertCircle className="w-2.5 h-2.5 mr-1" /> {overdue.length} ATRASADA{overdue.length > 1 ? "S" : ""}
                        </Badge>
                      ) : active.length > 0 ? (
                        <Badge className="bg-emerald-600 text-white border-0 font-bold text-[9px]">
                          <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" /> EM CURSO
                        </Badge>
                      ) : scheduled.length > 0 ? (
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[9px]">
                          <Calendar className="w-2.5 h-2.5 mr-1" /> {scheduled.length} AGEND.
                        </Badge>
                      ) : (
                        <Badge className="bg-neutral-100 text-neutral-500 border border-neutral-200 font-bold text-[9px]">LIVRE</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 p-3 space-y-2 max-h-[600px] overflow-y-auto">
                    {!hasActivity && (
                      <div className="py-8 text-center">
                        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Sem missões</p>
                        <p className="text-[10px] text-neutral-400 mt-1">Disponível para alocação</p>
                      </div>
                    )}

                    {overdue.map((os) => (
                      <Link key={os.id} href={`/admin/service-orders?os=${os.id}`}>
                        <a
                          className="block bg-red-50 border-2 border-red-300 rounded-lg p-3 hover:bg-red-100 transition-colors cursor-pointer"
                          data-testid={`mission-overdue-${os.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-black text-red-800 font-mono">{os.osNumber}</span>
                            <Badge className="bg-red-600 text-white border-0 font-bold text-[9px] animate-pulse">
                              <AlertCircle className="w-2.5 h-2.5 mr-1" /> ATRASADA
                            </Badge>
                          </div>
                          <p className="text-xs font-bold text-neutral-900 truncate">{os.clientName || "—"}</p>
                          <div className="space-y-0.5 mt-1.5 text-[10px] text-neutral-600">
                            {os.origin && (
                              <div className="flex items-start gap-1">
                                <MapPin className="w-3 h-3 mt-0.5 text-red-600 flex-shrink-0" />
                                <span className="truncate">{os.origin}</span>
                              </div>
                            )}
                            {os.destination && (
                              <div className="flex items-start gap-1">
                                <ChevronRight className="w-3 h-3 mt-0.5 text-red-600 flex-shrink-0" />
                                <span className="truncate">{os.destination}</span>
                              </div>
                            )}
                            {(os.employee1 || os.employee2) && (
                              <div className="flex items-center gap-1 pt-0.5">
                                <User className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                <span className="truncate font-semibold">
                                  {[os.employee1?.name, os.employee2?.name].filter(Boolean).join(" / ")}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-1 pt-1 mt-1 border-t border-red-200">
                              <span className="text-[10px] text-red-700 font-semibold">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Prevista {fmtScheduled(os.scheduledDate)}
                              </span>
                              <span className="text-[10px] font-black text-white bg-red-600 px-1.5 py-0.5 rounded">
                                {fmtOverdue(os.scheduledDate, nowMs)}
                              </span>
                            </div>
                          </div>
                        </a>
                      </Link>
                    ))}

                    {active.map((os) => (
                      <Link key={os.id} href={`/admin/service-orders?os=${os.id}`}>
                        <a
                          className="block bg-emerald-50/70 border-2 border-emerald-300 rounded-lg p-3 hover:bg-emerald-50 transition-colors cursor-pointer"
                          data-testid={`mission-active-${os.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-black text-emerald-800 font-mono">{os.osNumber}</span>
                            <Badge className="bg-emerald-600 text-white border-0 font-bold text-[9px]">
                              <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" /> ATIVA
                            </Badge>
                          </div>
                          <p className="text-xs font-bold text-neutral-900 truncate">{os.clientName || "—"}</p>
                          <div className="space-y-0.5 mt-1.5 text-[10px] text-neutral-600">
                            {os.origin && (
                              <div className="flex items-start gap-1">
                                <MapPin className="w-3 h-3 mt-0.5 text-emerald-600 flex-shrink-0" />
                                <span className="truncate">{os.origin}</span>
                              </div>
                            )}
                            {os.destination && (
                              <div className="flex items-start gap-1">
                                <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-600 flex-shrink-0" />
                                <span className="truncate">{os.destination}</span>
                              </div>
                            )}
                            {(os.employee1 || os.employee2) && (
                              <div className="flex items-center gap-1 pt-0.5">
                                <User className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                <span className="truncate font-semibold">
                                  {[os.employee1?.name, os.employee2?.name].filter(Boolean).join(" / ")}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 pt-0.5">
                              <Clock className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                              <span className="font-bold text-emerald-700">Iniciada {fmtTime(os.missionStartedAt)}</span>
                            </div>
                          </div>
                        </a>
                      </Link>
                    ))}

                    {scheduled.length > 0 && active.length > 0 && (
                      <div className="pt-1 pb-0.5 flex items-center gap-2">
                        <div className="h-px bg-neutral-200 flex-1" />
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Próximas</span>
                        <div className="h-px bg-neutral-200 flex-1" />
                      </div>
                    )}

                    {scheduled.map((os) => (
                      <Link key={os.id} href={`/admin/service-orders?os=${os.id}`}>
                        <a
                          className="block bg-white border border-neutral-200 rounded-lg p-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer"
                          data-testid={`mission-scheduled-${os.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-black text-neutral-700 font-mono">{os.osNumber}</span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              {fmtScheduled(os.scheduledDate)}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-neutral-800 truncate">{os.clientName || "—"}</p>
                          <div className="space-y-0.5 mt-1 text-[10px] text-neutral-500">
                            {os.origin && (
                              <div className="flex items-start gap-1">
                                <MapPin className="w-3 h-3 mt-0.5 text-blue-500 flex-shrink-0" />
                                <span className="truncate">{os.origin}</span>
                              </div>
                            )}
                            {os.destination && (
                              <div className="flex items-start gap-1 text-neutral-400">
                                <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span className="truncate">{os.destination}</span>
                              </div>
                            )}
                            {(os.employee1 || os.employee2) && (
                              <div className="flex items-center gap-1 pt-0.5">
                                <User className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                <span className="truncate">
                                  {[os.employee1?.name, os.employee2?.name].filter(Boolean).join(" / ")}
                                </span>
                              </div>
                            )}
                          </div>
                        </a>
                      </Link>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <OrphanWeekCalendar orders={orphanOrders} />
    </div>
    </AdminLayout>
  );
}

function getMondayBRT(d: Date) {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, day] = ymd.split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const dow = local.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  local.setUTCDate(local.getUTCDate() + diff);
  return local;
}

function ymdToBRT(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDayMonth(d: Date) {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}`;
}

function fmtDayMonthYear(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

function osDateBRT(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function osTimeBRT(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function OrphanWeekCalendar({ orders }: { orders: GridOs[] }) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayBRT(new Date()));

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      return d;
    });
  }, [weekStart]);

  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const undated: GridOs[] = [];
  const byDay: Record<string, GridOs[]> = {};
  for (const d of days) byDay[ymdToBRT(d)] = [];
  for (const o of orders) {
    if (!o.scheduledDate) { undated.push(o); continue; }
    const ymd = osDateBRT(o.scheduledDate);
    if (byDay[ymd]) byDay[ymd].push(o);
  }
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime());
  }

  const weekLabel = `${fmtDayMonth(days[0])} → ${fmtDayMonthYear(days[6])}`;

  const shift = (n: number) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + n * 7);
    setWeekStart(d);
  };

  if (orders.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-white">
      <div className="px-4 py-3 border-b border-amber-200 flex items-center justify-between gap-3 flex-wrap bg-amber-50/40">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <p className="text-xs font-black text-amber-800 uppercase tracking-wider">
            {orders.length} OS sem viatura — agenda semanal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => shift(-1)} data-testid="button-prev-week">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] font-bold" onClick={() => setWeekStart(getMondayBRT(new Date()))} data-testid="button-this-week">
            Esta semana
          </Button>
          <span className="text-[11px] font-bold text-neutral-600 min-w-[160px] text-center" data-testid="text-week-label">{weekLabel}</span>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => shift(1)} data-testid="button-next-week">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[700px] divide-x divide-neutral-200">
          {days.map((d, i) => {
            const ymd = ymdToBRT(d);
            const isToday = ymd === todayYmd;
            const list = byDay[ymd] || [];
            return (
              <div key={ymd} className={`flex flex-col ${isToday ? "bg-amber-50/30" : "bg-white"}`} data-testid={`col-day-${ymd}`}>
                <div className={`px-2 py-2 border-b text-center sticky top-0 ${isToday ? "bg-amber-100 border-amber-300" : "bg-neutral-50 border-neutral-200"}`}>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isToday ? "text-amber-800" : "text-neutral-500"}`}>{dayLabels[i]}</p>
                  <p className={`text-sm font-black ${isToday ? "text-amber-900" : "text-neutral-800"}`}>
                    {fmtDayMonth(d)}
                  </p>
                  {list.length > 0 && (
                    <span className="inline-block mt-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1">
                      {list.length}
                    </span>
                  )}
                </div>
                <div className="p-1.5 space-y-1.5 min-h-[280px]">
                  {list.length === 0 && (
                    <p className="text-[10px] text-neutral-300 text-center pt-6">—</p>
                  )}
                  {list.map((os) => (
                    <Link key={os.id} href={`/admin/service-orders?os=${os.id}`}>
                      <a
                        className="block bg-white border border-amber-300 rounded-md p-1.5 hover:border-amber-500 hover:bg-amber-50 transition-colors shadow-sm"
                        data-testid={`orphan-os-${os.id}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1 py-0.5 rounded">
                            {osTimeBRT(os.scheduledDate!)}
                          </span>
                          <span className="text-[9px] font-black text-neutral-500 font-mono">{os.osNumber}</span>
                        </div>
                        <p className="text-[10px] font-bold text-neutral-800 leading-tight break-words">{os.clientName || "—"}</p>
                        {os.origin && (
                          <p className="text-[9px] text-neutral-600 mt-0.5 flex items-start gap-1 leading-tight">
                            <MapPin className="w-3 h-3 flex-shrink-0 text-emerald-600 mt-0.5" fill="currentColor" />
                            <span className="break-words"><span className="font-bold text-emerald-700">Origem:</span> {os.origin}</span>
                          </p>
                        )}
                        {os.destination && (
                          <p className="text-[9px] text-neutral-600 mt-0.5 flex items-start gap-1 leading-tight">
                            <MapPin className="w-3 h-3 flex-shrink-0 text-red-600 mt-0.5" fill="currentColor" />
                            <span className="break-words"><span className="font-bold text-red-700">Destino:</span> {os.destination}</span>
                          </p>
                        )}
                      </a>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="border-t border-neutral-200 bg-neutral-50/50 p-3">
          <p className="text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-2">{undated.length} sem data agendada</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {undated.map((os) => (
              <Link key={os.id} href={`/admin/service-orders?os=${os.id}`}>
                <a className="block bg-white border border-amber-200 rounded-md p-2 hover:border-amber-400 transition-colors" data-testid={`orphan-undated-${os.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-black text-neutral-700 font-mono">{os.osNumber}</span>
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded">SEM DATA</span>
                  </div>
                  <p className="text-[11px] font-semibold text-neutral-800 truncate">{os.clientName || "—"}</p>
                  <p className="text-[10px] text-neutral-400 truncate">{os.origin} → {os.destination}</p>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
