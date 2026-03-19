import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Pencil, Trash2, Gauge, Search, Loader2, Link2, Unlink, History } from "lucide-react";
import type { Vehicle, VehicleFueling, VehicleAssignment, Employee } from "@shared/schema";

function VehicleForm({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const { toast } = useToast();
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tcTestLoading, setTcTestLoading] = useState(false);
  const [tcTestResult, setTcTestResult] = useState<{ success: boolean; message: string } | null>(null);
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
    trackerType: (vehicle as any)?.trackerType || "none",
    truckscontrolIdentifier: (vehicle as any)?.truckscontrolIdentifier || "",
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
        <div className="md:col-span-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-neutral-600" />
            <span className="text-sm font-medium text-neutral-800">Rastreador</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Tipo de Rastreador</label>
              <select value={form.trackerType} onChange={(e) => setForm({ ...form, trackerType: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-tracker-type">
                <option value="truckscontrol">TrucksControl</option>
                <option value="custom">API Customizada</option>
                <option value="none">Sem Rastreador</option>
              </select>
            </div>
            {form.trackerType === "truckscontrol" && (
              <>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Identificador TrucksControl</label>
                  <Input value={form.truckscontrolIdentifier} onChange={(e) => setForm({ ...form, truckscontrolIdentifier: e.target.value })} placeholder="Usa placa se vazio" data-testid="input-tc-identifier" />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={tcTestLoading}
                    onClick={async () => {
                      setTcTestLoading(true);
                      setTcTestResult(null);
                      try {
                        const { authFetch } = await import("@/lib/queryClient");
                        const res = await authFetch("/api/truckscontrol/test");
                        const data = await res.json();
                        setTcTestResult(data);
                      } catch {
                        setTcTestResult({ success: false, message: "Erro de conexão" });
                      } finally {
                        setTcTestLoading(false);
                      }
                    }}
                    data-testid="button-test-truckscontrol"
                  >
                    {tcTestLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Testando...</> : "Testar Conexão"}
                  </Button>
                </div>
                {tcTestResult && (
                  <div className={`md:col-span-3 text-xs px-3 py-2 rounded ${tcTestResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} data-testid="text-tc-test-result">
                    {tcTestResult.message}
                  </div>
                )}
              </>
            )}
            {form.trackerType === "custom" && (
              <>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">ID Rastreador</label>
                  <Input value={form.trackerId} onChange={(e) => setForm({ ...form, trackerId: e.target.value })} placeholder="ID do dispositivo" data-testid="input-vehicle-tracker" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-neutral-500 mb-1 block">URL API Rastreador</label>
                  <Input value={form.trackerApiUrl} onChange={(e) => setForm({ ...form, trackerApiUrl: e.target.value })} placeholder="https://api.rastreador.com/..." data-testid="input-vehicle-tracker-url" />
                </div>
              </>
            )}
          </div>
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

function VehicleAssignmentModal({ vehicle, open, onClose }: { vehicle: Vehicle; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }), enabled: open });
  const { data: history = [], isLoading: histLoading } = useQuery<VehicleAssignment[]>({
    queryKey: ["/api/vehicle-assignments", vehicle.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/vehicle-assignments/${vehicle.id}`);
      return res.json();
    },
    enabled: open,
  });

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [kmAtAction, setKmAtAction] = useState(String(vehicle.km || 0));
  const [notes, setNotes] = useState("");

  const latestAction = history.length > 0 ? history[0] : null;
  const isCurrentlyAssigned = latestAction?.action === "vincular";
  const currentEmployee = isCurrentlyAssigned ? employees.find(e => e.id === latestAction!.employeeId) : null;

  const assignMutation = useMutation({
    mutationFn: async (action: "vincular" | "desvincular") => {
      const empId = action === "vincular" ? parseInt(selectedEmployee) : latestAction!.employeeId;
      await apiRequest("POST", "/api/vehicle-assignments", {
        vehicleId: vehicle.id,
        employeeId: empId,
        action,
        kmAtAction: parseInt(kmAtAction) || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-assignments", vehicle.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setSelectedEmployee("");
      setNotes("");
      toast({ title: "Operação registrada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeEmployees = employees.filter(e => e.status === "ativo");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Viatura {vehicle.plate} - Vinculação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCurrentlyAssigned && currentEmployee ? (
            <div className="bg-neutral-50 rounded-lg p-3 border">
              <p className="text-sm text-neutral-600 mb-2">
                Vinculado a: <strong className="text-neutral-900">{currentEmployee.name}</strong>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={kmAtAction} onChange={(e) => setKmAtAction(e.target.value)} placeholder="KM atual" data-testid="input-unlink-km" />
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo" data-testid="input-unlink-vehicle-notes" />
              </div>
              <Button variant="destructive" size="sm" className="mt-2" onClick={() => assignMutation.mutate("desvincular")} disabled={assignMutation.isPending} data-testid="button-unlink-vehicle">
                <Unlink className="w-4 h-4 mr-1" /> Desvincular
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Selecione o Agente *</label>
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-assign-vehicle-employee">
                  <option value="">Selecione...</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.matricula} - {e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={kmAtAction} onChange={(e) => setKmAtAction(e.target.value)} placeholder="KM atual" data-testid="input-link-vehicle-km" />
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" data-testid="input-link-vehicle-notes" />
              </div>
              <Button onClick={() => assignMutation.mutate("vincular")} disabled={assignMutation.isPending || !selectedEmployee} data-testid="button-link-vehicle">
                <Link2 className="w-4 h-4 mr-1" /> Vincular ao Agente
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-1">
              <History className="w-4 h-4" /> Histórico de Vinculações
            </h4>
            {histLoading ? (
              <p className="text-xs text-neutral-400 text-center py-4">Carregando...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhum registro</p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-vehicle-history-${h.id}`}>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.action === "vincular" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {h.action === "vincular" ? "Vinculado" : "Desvinculado"}
                      </span>
                      <span className="text-xs text-neutral-600 ml-2">
                        {employees.find(e => e.id === h.employeeId)?.name || `ID ${h.employeeId}`}
                      </span>
                      {h.kmAtAction && <span className="text-xs text-neutral-400 ml-2">{h.kmAtAction.toLocaleString()} km</span>}
                      {h.notes && <span className="text-xs text-neutral-400 ml-1">- {h.notes}</span>}
                    </div>
                    <span className="text-[10px] text-neutral-400 shrink-0">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString("pt-BR") + " " + new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Vehicle | undefined>();
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);
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

      {assignVehicle && (
        <VehicleAssignmentModal vehicle={assignVehicle} open={!!assignVehicle} onClose={() => setAssignVehicle(null)} />
      )}

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
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setAssignVehicle(v)} title="Vincular/Desvincular Agente" data-testid={`button-assign-vehicle-${v.id}`}>
                          <Link2 className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(v); setShowForm(true); }} data-testid={`button-edit-vehicle-${v.id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(v.id)} data-testid={`button-delete-vehicle-${v.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
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
