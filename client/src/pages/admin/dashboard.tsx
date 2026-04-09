import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { formatDateBRT } from "@/lib/utils";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Car, FileText, Fuel, Wrench, Route, Clock, AlertTriangle, ShieldAlert, Receipt, Gavel, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import AlertasDashboard from "@/components/admin/AlertasDashboard";
import type { Client, Employee, Vehicle, ServiceOrder, Trip, VehicleFueling, VehicleMaintenance, Timesheet } from "@shared/schema";

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: any; color: string }) {
  return (
    <Card className="p-5 bg-white border-neutral-200" data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          <p className="text-xs text-neutral-500">{title}</p>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: orders = [] } = useQuery<ServiceOrder[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: trips = [] } = useQuery<Trip[]>({ queryKey: ["/api/trips"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: fuelings = [] } = useQuery<VehicleFueling[]>({ queryKey: ["/api/fueling"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: maintenances = [] } = useQuery<VehicleMaintenance[]>({ queryKey: ["/api/maintenance"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const { data: timesheets = [] } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"], queryFn: getQueryFn({ on401: "returnNull" }) });

  const { data: activeMission } = useQuery<any>({
    queryKey: ["/api/mission/active"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: user?.role === "funcionario",
  });

  const { data: apiStats } = useQuery<any>({
    queryKey: ["/api/api-logs/stats"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: user?.role === "admin",
    refetchInterval: 120000,
  });

  const { data: apiLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/api-logs"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: user?.role === "admin",
    refetchInterval: 120000,
  });

  const openOrders = (orders || []).filter((o) => o.status === "aberta" || o.status === "em_andamento").length;
  const activeVehicles = (vehicles || []).filter((v) => v.status === "disponível").length;

  const multaLogs = (apiLogs || []).filter((l: any) => l.endpoint?.includes("multas") && l.responseStatus >= 200 && l.responseStatus < 300);
  const nfLogs = (apiLogs || []).filter((l: any) => l.endpoint?.includes("nfe") || l.endpoint?.includes("emitir"));
  const processosLogs = (apiLogs || []).filter((l: any) => l.endpoint?.includes("processos") || l.endpoint?.includes("judiciais"));

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-dashboard-title">Painel de Controle</h1>
        <p className="text-sm text-neutral-500 mt-1">Visão geral do sistema</p>
      </div>

      <AlertasDashboard />

      {user?.role === "funcionario" && activeMission && (
        <Alert className="mb-6 border-amber-300 bg-amber-50" data-testid="alert-active-mission">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Missão Ativa</AlertTitle>
          <AlertDescription className="text-amber-700">
            Você possui uma missão ativa (OS: {activeMission.osNumber}).{" "}
            <Link href="/admin/mission" className="underline font-medium" data-testid="link-go-to-mission">Clique aqui para acessar</Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Clientes" value={(clients || []).length} icon={Building2} color="bg-blue-600" />
        <StatCard title="Funcionários" value={(employees || []).length} icon={Users} color="bg-green-600" />
        <StatCard title="Veículos Disponíveis" value={activeVehicles} icon={Car} color="bg-purple-600" />
        <StatCard title="OS Abertas" value={openOrders} icon={FileText} color="bg-amber-600" />
        <StatCard title="Viagens" value={(trips || []).length} icon={Route} color="bg-cyan-600" />
        <StatCard title="Abastecimentos" value={(fuelings || []).length} icon={Fuel} color="bg-red-600" />
        <StatCard title="Manutenções" value={(maintenances || []).length} icon={Wrench} color="bg-orange-600" />
        <StatCard title="Registros Ponto" value={(timesheets || []).length} icon={Clock} color="bg-indigo-600" />
      </div>

      {user?.role === "admin" && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 bg-white border-neutral-200" data-testid="card-multas-dia">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-red-600" /></div>
              <h3 className="text-sm font-semibold text-neutral-900">Multas do Dia</h3>
            </div>
            {multaLogs.length === 0 ? (
              <p className="text-xs text-neutral-400">Nenhuma consulta de multas registrada</p>
            ) : (
              <div className="space-y-2">
                {multaLogs.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-xs" data-testid={`row-multa-${l.id}`}>
                    <span className="text-neutral-600 font-mono">{l.requestPreview || "-"}</span>
                    <Badge variant={l.responseStatus === 200 ? "secondary" : "destructive"} className="text-xs">{l.responseStatus}</Badge>
                  </div>
                ))}
                <Link href="/admin/consultas" className="text-xs text-blue-600 hover:underline" data-testid="link-ver-multas">Ver todas &rarr;</Link>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-white border-neutral-200" data-testid="card-nf-status">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"><Receipt className="w-4 h-4 text-green-600" /></div>
              <h3 className="text-sm font-semibold text-neutral-900">Status Notas Fiscais</h3>
            </div>
            {nfLogs.length === 0 ? (
              <p className="text-xs text-neutral-400">Nenhuma NF emitida</p>
            ) : (
              <div className="space-y-2">
                {nfLogs.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-xs" data-testid={`row-nf-${l.id}`}>
                    <span className="text-neutral-600">{l.createdAt ? formatDateBRT(l.createdAt) : "-"}</span>
                    <Badge variant={l.responseStatus === 200 ? "secondary" : "destructive"} className="text-xs">{l.responseStatus === 200 ? "Emitida" : "Erro"}</Badge>
                  </div>
                ))}
                <Link href="/admin/consultas" className="text-xs text-blue-600 hover:underline" data-testid="link-ver-nf">Ver todas &rarr;</Link>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-white border-neutral-200" data-testid="card-processos-alertas">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Gavel className="w-4 h-4 text-amber-600" /></div>
              <h3 className="text-sm font-semibold text-neutral-900">Alertas Processos</h3>
            </div>
            {processosLogs.length === 0 ? (
              <p className="text-xs text-neutral-400">Nenhuma consulta de processos</p>
            ) : (
              <div className="space-y-2">
                {processosLogs.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-xs" data-testid={`row-processo-${l.id}`}>
                    <span className="text-neutral-600">{l.createdAt ? formatDateBRT(l.createdAt) : "-"}</span>
                    <Badge variant={l.responseStatus === 200 ? "secondary" : "destructive"} className="text-xs">{l.responseStatus}</Badge>
                  </div>
                ))}
                <Link href="/admin/consultas" className="text-xs text-blue-600 hover:underline" data-testid="link-ver-processos">Ver todos &rarr;</Link>
              </div>
            )}
          </Card>
        </div>
      )}

      {user?.role === "admin" && apiStats && (
        <div className="mt-4">
          <Card className="p-5 bg-white border-neutral-200" data-testid="card-consumo-api">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center"><Activity className="w-4 h-4 text-white" /></div>
              <h3 className="text-sm font-semibold text-neutral-900">Consumo API Brasil</h3>
              <Badge variant="outline" className="text-xs ml-auto">{apiStats.today} hoje / {apiStats.total} total</Badge>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-green-600 font-medium">{apiStats.byStatus?.success || 0} sucesso</span>
              <span className="text-red-600 font-medium">{apiStats.byStatus?.error || 0} erros</span>
              <Link href="/admin/consultas" className="text-blue-600 hover:underline ml-auto" data-testid="link-ver-logs">Ver logs completos &rarr;</Link>
            </div>
          </Card>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4" data-testid="text-recent-orders">Últimas Ordens de Serviço</h2>
          {(orders || []).length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhuma OS registrada</p>
          ) : (
            <div className="space-y-3">
              {(orders || []).slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-2 py-2 border-b border-neutral-100 last:border-0" data-testid={`row-order-${order.id}`}>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{order.osNumber}</p>
                    <p className="text-xs text-neutral-500">{order.type}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                    order.status === "aberta" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                    order.status === "em_andamento" ? "bg-neutral-900 text-white" :
                    order.status === "concluída" || order.status === "concluida" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    "bg-neutral-100 text-neutral-600 border border-neutral-200"
                  }`}>{order.status === "aberta" ? "ABERTA" : order.status === "em_andamento" ? "EM ANDAMENTO" : order.status === "concluída" || order.status === "concluida" ? "CONCLUÍDA" : order.status?.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-white border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4" data-testid="text-vehicle-status">Status dos Veículos</h2>
          {(vehicles || []).length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhum veículo registrado</p>
          ) : (
            <div className="space-y-3">
              {(vehicles || []).map((vehicle) => (
                <div key={vehicle.id} className="flex items-center justify-between gap-2 py-2 border-b border-neutral-100 last:border-0" data-testid={`row-vehicle-${vehicle.id}`}>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{vehicle.plate}</p>
                    <p className="text-xs text-neutral-500">{vehicle.brand} {vehicle.model}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                    vehicle.status === "disponível" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    vehicle.status === "em_uso" ? "bg-neutral-900 text-white" :
                    "bg-red-50 text-red-700 border border-red-200"
                  }`}>{vehicle.status === "em_uso" ? "EM USO" : vehicle.status === "disponível" ? "DISPONÍVEL" : "MANUTENÇÃO"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
