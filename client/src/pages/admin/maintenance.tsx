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
import type { VehicleMaintenance, Vehicle } from "@shared/schema";

function MaintenanceForm({ maintenance, vehicles, onClose }: {
  maintenance?: VehicleMaintenance; vehicles: Vehicle[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    vehicleId: maintenance?.vehicleId || 0,
    type: maintenance?.type || "preventiva",
    description: maintenance?.description || "",
    date: maintenance?.date || new Date().toISOString().slice(0, 10),
    cost: maintenance?.cost || "",
    km: maintenance?.km || 0,
    nextMaintenanceKm: maintenance?.nextMaintenanceKm || null,
    nextMaintenanceDate: maintenance?.nextMaintenanceDate || "",
    provider: maintenance?.provider || "",
    status: maintenance?.status || "realizada",
    notes: maintenance?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        vehicleId: Number(data.vehicleId),
        cost: data.cost ? String(data.cost) : null,
        km: data.km ? Number(data.km) : null,
        nextMaintenanceKm: data.nextMaintenanceKm ? Number(data.nextMaintenanceKm) : null,
        nextMaintenanceDate: data.nextMaintenanceDate || null,
      };
      if (maintenance) {
        await apiRequest("PATCH", `/api/maintenance/${maintenance.id}`, payload);
      } else {
        await apiRequest("POST", "/api/maintenance", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({ title: maintenance ? "Manutenção atualizada" : "Manutenção registrada" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-maintenance-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{maintenance ? "Editar Manutenção" : "Nova Manutenção"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Veículo *</label>
          <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-maintenance-vehicle">
            <option value={0}>Selecione...</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Tipo *</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-maintenance-type">
            <option value="preventiva">Preventiva</option>
            <option value="corretiva">Corretiva</option>
            <option value="troca_oleo">Troca de Óleo</option>
            <option value="pneus">Pneus</option>
            <option value="freios">Freios</option>
            <option value="eletrica">Elétrica</option>
            <option value="funilaria">Funilaria</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Data *</label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required data-testid="input-maintenance-date" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Custo (R$)</label>
          <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} data-testid="input-maintenance-cost" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">KM Atual</label>
          <Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: Number(e.target.value) })} data-testid="input-maintenance-km" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Próx. Manutenção (KM)</label>
          <Input type="number" value={form.nextMaintenanceKm || ""} onChange={(e) => setForm({ ...form, nextMaintenanceKm: e.target.value ? Number(e.target.value) : null })} data-testid="input-maintenance-next-km" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Próx. Manutenção (Data)</label>
          <Input type="date" value={form.nextMaintenanceDate} onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })} data-testid="input-maintenance-next-date" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Prestador</label>
          <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} data-testid="input-maintenance-provider" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-maintenance-status">
            <option value="agendada">Agendada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Descrição</label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-maintenance-description" />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-maintenance-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-maintenance">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function MaintenancePage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VehicleMaintenance | undefined>();
  const { toast } = useToast();
  const { data: maintenances = [], isLoading } = useQuery<VehicleMaintenance[]>({ queryKey: ["/api/maintenance"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/maintenance/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] }); toast({ title: "Manutenção removida" }); },
  });

  const getVehiclePlate = (id: number) => (vehicles || []).find((v) => v.id === id)?.plate || "-";

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-maintenance-title">Manutenção de Veículos</h1>
          <p className="text-sm text-neutral-500 mt-1">Controle de manutenções da frota</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-maintenance">
          <Plus className="w-4 h-4 mr-2" /> Nova Manutenção
        </Button>
      </div>

      {showForm && <MaintenanceForm maintenance={editItem} vehicles={vehicles || []} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (maintenances || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma manutenção registrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-maintenance">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Data</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Veículo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Custo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">KM</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(maintenances || []).map((m) => (
                  <tr key={m.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-maintenance-${m.id}`}>
                    <td className="p-3 text-neutral-900">{m.date}</td>
                    <td className="p-3 font-medium text-neutral-900">{getVehiclePlate(m.vehicleId)}</td>
                    <td className="p-3 text-neutral-600">{m.type}</td>
                    <td className="p-3 text-neutral-600">{m.cost ? `R$ ${Number(m.cost).toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-neutral-600">{m.km?.toLocaleString() || "-"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        m.status === "realizada" ? "bg-green-100 text-green-700" :
                        m.status === "agendada" ? "bg-blue-100 text-blue-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{m.status}</span>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(m); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
