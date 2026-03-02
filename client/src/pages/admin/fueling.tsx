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
import type { VehicleFueling, Vehicle, Employee } from "@shared/schema";

function FuelingForm({ fueling, vehicles, employees, onClose }: {
  fueling?: VehicleFueling; vehicles: Vehicle[]; employees: Employee[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    vehicleId: fueling?.vehicleId || 0,
    driverId: fueling?.driverId || null,
    date: fueling?.date || new Date().toISOString().slice(0, 10),
    liters: fueling?.liters || "",
    costPerLiter: fueling?.costPerLiter || "",
    totalCost: fueling?.totalCost || "",
    km: fueling?.km || 0,
    fuelType: fueling?.fuelType || "diesel",
    station: fueling?.station || "",
    notes: fueling?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        vehicleId: Number(data.vehicleId),
        driverId: data.driverId ? Number(data.driverId) : null,
        liters: String(data.liters),
        costPerLiter: data.costPerLiter ? String(data.costPerLiter) : null,
        totalCost: data.totalCost ? String(data.totalCost) : null,
        km: Number(data.km),
      };
      if (fueling) {
        await apiRequest("PATCH", `/api/fueling/${fueling.id}`, payload);
      } else {
        await apiRequest("POST", "/api/fueling", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fueling"] });
      toast({ title: fueling ? "Abastecimento atualizado" : "Abastecimento registrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-fueling-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{fueling ? "Editar Abastecimento" : "Novo Abastecimento"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Veículo *</label>
          <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-fueling-vehicle">
            <option value={0}>Selecione...</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Motorista</label>
          <select value={form.driverId || ""} onChange={(e) => setForm({ ...form, driverId: e.target.value ? Number(e.target.value) : null })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-fueling-driver">
            <option value="">Selecione...</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Data *</label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required data-testid="input-fueling-date" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Litros *</label>
          <Input type="number" step="0.01" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} required data-testid="input-fueling-liters" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Valor/Litro (R$)</label>
          <Input type="number" step="0.01" value={form.costPerLiter} onChange={(e) => setForm({ ...form, costPerLiter: e.target.value })} data-testid="input-fueling-cost-per-liter" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Valor Total (R$)</label>
          <Input type="number" step="0.01" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} data-testid="input-fueling-total" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">KM Atual *</label>
          <Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: Number(e.target.value) })} required data-testid="input-fueling-km" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Combustível</label>
          <select value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-fueling-type">
            <option value="diesel">Diesel</option>
            <option value="diesel_s10">Diesel S10</option>
            <option value="gasolina">Gasolina</option>
            <option value="etanol">Etanol</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Posto</label>
          <Input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} data-testid="input-fueling-station" />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-fueling-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-fueling">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function FuelingPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VehicleFueling | undefined>();
  const { toast } = useToast();
  const { data: fuelings = [], isLoading } = useQuery<VehicleFueling[]>({ queryKey: ["/api/fueling"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/fueling/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fueling"] }); toast({ title: "Abastecimento removido" }); },
  });

  const getVehiclePlate = (id: number) => (vehicles || []).find((v) => v.id === id)?.plate || "-";

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-fueling-title">Abastecimento</h1>
          <p className="text-sm text-neutral-500 mt-1">Controle de abastecimento da frota</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-fueling">
          <Plus className="w-4 h-4 mr-2" /> Novo Abastecimento
        </Button>
      </div>

      {showForm && <FuelingForm fueling={editItem} vehicles={vehicles || []} employees={employees || []} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (fuelings || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum abastecimento registrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-fueling">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Data</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Veículo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Litros</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Valor Total</th>
                  <th className="text-left p-3 font-medium text-neutral-600">KM</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Combustível</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(fuelings || []).map((f) => (
                  <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-fueling-${f.id}`}>
                    <td className="p-3 text-neutral-900">{f.date}</td>
                    <td className="p-3 font-medium text-neutral-900">{getVehiclePlate(f.vehicleId)}</td>
                    <td className="p-3 text-neutral-600">{f.liters}L</td>
                    <td className="p-3 text-neutral-600">{f.totalCost ? `R$ ${Number(f.totalCost).toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-neutral-600">{f.km.toLocaleString()}</td>
                    <td className="p-3 text-neutral-600">{f.fuelType}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(f); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(f.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
