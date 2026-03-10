import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Gauge, Search, Loader2 } from "lucide-react";
import type { Vehicle, VehicleFueling } from "@shared/schema";

function VehicleForm({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const { toast } = useToast();
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    plate: vehicle?.plate || "",
    model: vehicle?.model || "",
    brand: vehicle?.brand || "",
    year: vehicle?.year || new Date().getFullYear(),
    color: vehicle?.color || "",
    chassi: vehicle?.chassi || "",
    renavam: vehicle?.renavam || "",
    status: vehicle?.status || "disponível",
    trackerId: vehicle?.trackerId || "",
    trackerApiUrl: vehicle?.trackerApiUrl || "",
    km: vehicle?.km || 0,
    notes: vehicle?.notes || "",
  });

  const lookupPlate = useCallback(async (plate: string) => {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 7) return;

    setLookupLoading(true);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/plate-lookup/${clean}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Consulta de placa", description: err.message || "Erro na consulta", variant: "destructive" });
        return;
      }
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        brand: data.brand || prev.brand,
        model: data.model || prev.model,
        year: data.year || prev.year,
        color: data.color || prev.color,
        chassi: data.chassi || prev.chassi,
        notes: prev.notes || [data.fuel, data.type, data.city && data.state ? `${data.city}/${data.state}` : ""].filter(Boolean).join(" | "),
      }));
      toast({ title: "Dados do veículo preenchidos automaticamente" });
    } catch {
      toast({ title: "Erro ao consultar placa", variant: "destructive" });
    } finally {
      setLookupLoading(false);
    }
  }, [toast]);

  const handlePlateChange = useCallback((value: string) => {
    const upper = value.toUpperCase();
    setForm(prev => ({ ...prev, plate: upper }));
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    const clean = upper.replace(/[^A-Z0-9]/g, "");
    if (clean.length === 7 && !vehicle) {
      lookupTimeout.current = setTimeout(() => lookupPlate(clean), 500);
    }
  }, [lookupPlate, vehicle]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (vehicle) {
        await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, data);
      } else {
        await apiRequest("POST", "/api/vehicles", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: vehicle ? "Veículo atualizado" : "Veículo cadastrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-vehicle-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{vehicle ? "Editar Veículo" : "Novo Veículo"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Placa *</label>
          <div className="relative">
            <Input
              value={form.plate}
              onChange={(e) => handlePlateChange(e.target.value)}
              required
              placeholder="ABC1D23"
              maxLength={8}
              className="pr-10 uppercase font-mono font-bold tracking-wider"
              data-testid="input-vehicle-plate"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {lookupLoading ? (
                <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={() => lookupPlate(form.plate)}
                  className="p-1 hover:bg-neutral-100 rounded"
                  title="Consultar placa"
                  data-testid="button-lookup-plate"
                >
                  <Search className="w-4 h-4 text-neutral-400" />
                </button>
              )}
            </div>
          </div>
          {!vehicle && <p className="text-[10px] text-neutral-400 mt-1">Digite a placa completa para buscar automaticamente</p>}
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Marca *</label>
          <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required data-testid="input-vehicle-brand" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Modelo *</label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required data-testid="input-vehicle-model" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Ano</label>
          <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} data-testid="input-vehicle-year" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Cor</label>
          <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="input-vehicle-color" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">KM Atual</label>
          <Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: Number(e.target.value) })} data-testid="input-vehicle-km" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Chassi</label>
          <Input value={form.chassi} onChange={(e) => setForm({ ...form, chassi: e.target.value })} data-testid="input-vehicle-chassi" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">RENAVAM</label>
          <Input value={form.renavam} onChange={(e) => setForm({ ...form, renavam: e.target.value })} data-testid="input-vehicle-renavam" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-vehicle-status">
            <option value="disponível">Disponível</option>
            <option value="em_uso">Em Uso</option>
            <option value="manutenção">Manutenção</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">ID Rastreador</label>
          <Input value={form.trackerId} onChange={(e) => setForm({ ...form, trackerId: e.target.value })} placeholder="Configurar futuramente" data-testid="input-vehicle-tracker" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">URL API Rastreador</label>
          <Input value={form.trackerApiUrl} onChange={(e) => setForm({ ...form, trackerApiUrl: e.target.value })} placeholder="Configurar futuramente" data-testid="input-vehicle-tracker-url" />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-vehicle-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-vehicle">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

function calcAverage(fuelings: VehicleFueling[], vehicleId: number): string {
  const vf = fuelings.filter((f) => f.vehicleId === vehicleId).sort((a, b) => a.km - b.km);
  if (vf.length < 2) return "-";
  const totalKm = vf[vf.length - 1].km - vf[0].km;
  const totalLiters = vf.slice(1).reduce((sum, f) => sum + Number(f.liters), 0);
  if (totalLiters === 0) return "-";
  return (totalKm / totalLiters).toFixed(2) + " km/l";
}

export default function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Vehicle | undefined>();
  const { toast } = useToast();
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: fuelings = [] } = useQuery<VehicleFueling[]>({ queryKey: ["/api/fueling"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/vehicles/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] }); toast({ title: "Veículo removido" }); },
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-vehicles-title">Veículos</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão da frota</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-vehicle">
          <Plus className="w-4 h-4 mr-2" /> Novo Veículo
        </Button>
      </div>

      {showForm && <VehicleForm vehicle={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (vehicles || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum veículo cadastrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-vehicles">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Placa</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Veículo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">KM</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Média</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(vehicles || []).map((v) => (
                  <tr key={v.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-vehicle-${v.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{v.plate}</td>
                    <td className="p-3 text-neutral-600">{v.brand} {v.model} {v.year}</td>
                    <td className="p-3 text-neutral-600">{v.km?.toLocaleString() || "0"}</td>
                    <td className="p-3 text-neutral-600">
                      <span className="flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5" />
                        {calcAverage(fuelings || [], v.id)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        v.status === "disponível" ? "bg-green-100 text-green-700" :
                        v.status === "em_uso" ? "bg-amber-100 text-amber-700" :
                        v.status === "manutenção" ? "bg-red-100 text-red-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{v.status}</span>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(v); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(v.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
