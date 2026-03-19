import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import type { Trip, Vehicle, Employee, ServiceOrder } from "@shared/schema";

function TripForm({ trip, vehicles, employees, orders, onClose }: {
  trip?: Trip; vehicles: Vehicle[]; employees: Employee[]; orders: ServiceOrder[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    serviceOrderId: trip?.serviceOrderId || null,
    vehicleId: trip?.vehicleId || 0,
    driverId: trip?.driverId || 0,
    origin: trip?.origin || "",
    destination: trip?.destination || "",
    startDate: trip?.startDate ? new Date(trip.startDate).toISOString().slice(0, 16) : "",
    endDate: trip?.endDate ? new Date(trip.endDate).toISOString().slice(0, 16) : "",
    kmStart: trip?.kmStart || 0,
    kmEnd: trip?.kmEnd || 0,
    status: trip?.status || "planejada",
    notes: trip?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        vehicleId: Number(data.vehicleId),
        driverId: Number(data.driverId),
        serviceOrderId: data.serviceOrderId ? Number(data.serviceOrderId) : null,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
      };
      if (trip) {
        await apiRequest("PATCH", `/api/trips/${trip.id}`, payload);
      } else {
        await apiRequest("POST", "/api/trips", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: trip ? "Viagem atualizada" : "Viagem registrada" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-trip-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{trip ? "Editar Viagem" : "Nova Viagem"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Ordem de Serviço</label>
          <select value={form.serviceOrderId || ""} onChange={(e) => setForm({ ...form, serviceOrderId: e.target.value ? Number(e.target.value) : null })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-trip-os">
            <option value="">Nenhuma</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.osNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Veículo *</label>
          <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" required data-testid="select-trip-vehicle">
            <option value={0}>Selecione...</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Motorista *</label>
          <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: Number(e.target.value) })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" required data-testid="select-trip-driver">
            <option value={0}>Selecione...</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Origem *</label>
          <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} required data-testid="input-trip-origin" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Destino *</label>
          <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required data-testid="input-trip-destination" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-trip-status">
            <option value="planejada">Planejada</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluída">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data/Hora Saída</label>
          <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-trip-start" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data/Hora Chegada</label>
          <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-trip-end" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">KM Saída</label>
          <Input type="number" value={form.kmStart} onChange={(e) => setForm({ ...form, kmStart: Number(e.target.value) })} data-testid="input-trip-km-start" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">KM Chegada</label>
          <Input type="number" value={form.kmEnd} onChange={(e) => setForm({ ...form, kmEnd: Number(e.target.value) })} data-testid="input-trip-km-end" />
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-trip-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-trip">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function TripsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Trip | undefined>();
  const { toast } = useToast();
  const { data: trips = [], isLoading } = useQuery<Trip[]>({ queryKey: ["/api/trips"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: orders = [] } = useQuery<ServiceOrder[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/trips/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trips"] }); toast({ title: "Viagem removida" }); },
  });

  const getVehiclePlate = (id: number) => (vehicles || []).find((v) => v.id === id)?.plate || "-";
  const getDriverName = (id: number) => (employees || []).find((e) => e.id === id)?.name || "-";

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-trips-title">Controle de Viagens</h1>
          <p className="text-sm text-neutral-500 mt-1">Registro e acompanhamento de viagens</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-trip">
          <Plus className="w-4 h-4 mr-2" /> Nova Viagem
        </Button>
      </div>

      {showForm && <TripForm trip={editItem} vehicles={vehicles || []} employees={employees || []} orders={orders || []} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (trips || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma viagem registrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-trips">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Veículo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Motorista</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Origem</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Destino</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">KM</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(trips || []).map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-trip-${t.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{getVehiclePlate(t.vehicleId)}</td>
                    <td className="p-3 text-neutral-600">{getDriverName(t.driverId)}</td>
                    <td className="p-3 text-neutral-600">{t.origin}</td>
                    <td className="p-3 text-neutral-600">{t.destination}</td>
                    <td className="p-3 text-neutral-600">{t.kmEnd && t.kmStart ? (t.kmEnd - t.kmStart).toLocaleString() : "-"}</td>
                    <td className="p-3">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        t.status === "planejada" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        t.status === "em_andamento" ? "bg-neutral-900 text-white" :
                        t.status === "concluída" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }`}>{t.status === "planejada" ? "PLANEJADA" : t.status === "em_andamento" ? "EM ANDAMENTO" : t.status === "concluída" ? "CONCLUÍDA" : t.status?.toUpperCase()}</span>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(t); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
