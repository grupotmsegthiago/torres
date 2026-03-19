import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Play, Package, Car, Truck, Satellite, Camera, Shield } from "lucide-react";
import type { ServiceOrder, Client, Employee, Vehicle, WeaponKit, WeaponKitItem, Weapon } from "@shared/schema";

type EnrichedKit = WeaponKit & { items: (WeaponKitItem & { weapon: Weapon | null })[] };

const MISSION_STATUS_LABELS: Record<string, string> = {
  aguardando: "Saída da Base",
  checkout_armamento: "Saída da Base",
  checkout_viatura: "Saída da Base",
  checkout_km_saida: "Saída da Base",
  em_transito_origem: "Chegada na Origem",
  checkin_chegada_km: "Chegada na Origem",
  checkin_veiculo_escoltado: "Chegada na Origem",
  checkin_dados_motorista: "Chegada na Origem",
  iniciar_missao: "Início de Missão",
  em_transito_destino: "Chegada no Destino",
  checkout_km_final: "Término de Missão",
  checkout_viatura_retorno: "Término de Missão",
  finalizada: "Finalizada",
};

function getMissionStatusColor(status: string | null) {
  if (!status) return "bg-neutral-100 text-neutral-600";
  switch (status) {
    case "aguardando":
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return "bg-amber-100 text-amber-700";
    case "em_transito_origem":
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return "bg-cyan-100 text-cyan-700";
    case "iniciar_missao":
      return "bg-indigo-100 text-indigo-700";
    case "em_transito_destino":
      return "bg-violet-100 text-violet-700";
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return "bg-emerald-100 text-emerald-700";
    case "finalizada":
      return "bg-green-100 text-green-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function generateNextOsNumber(existingOrders: ServiceOrder[]): string {
  let maxNum = 0;
  for (const o of existingOrders) {
    const match = o.osNumber.match(/TOR-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `TOR-${String(maxNum + 1).padStart(4, "0")}`;
}

function OrderForm({ order, clients, employees, vehicles, kits, onClose, allOrders, prefilledVehicleId, prefilledScheduled }: {
  order?: ServiceOrder; clients: Client[]; employees: Employee[]; vehicles: Vehicle[]; kits: EnrichedKit[]; onClose: () => void; allOrders: ServiceOrder[]; prefilledVehicleId?: number | null; prefilledScheduled?: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    osNumber: order?.osNumber || generateNextOsNumber(allOrders),
    clientId: order?.clientId || 0,
    type: "escolta",
    description: order?.description || "",
    status: order?.status || (prefilledScheduled ? "agendada" : "aberta"),
    priority: order?.priority || "agendada",
    scheduledDate: order?.scheduledDate ? new Date(order.scheduledDate).toISOString().slice(0, 16) : "",
    completedDate: order?.completedDate ? new Date(order.completedDate).toISOString().slice(0, 16) : "",
    assignedEmployeeId: order?.assignedEmployeeId || null,
    assignedEmployee2Id: order?.assignedEmployee2Id || null,
    vehicleId: order?.vehicleId || prefilledVehicleId || null,
    kitId: order?.kitId || null,
    notes: order?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        clientId: Number(data.clientId),
        assignedEmployeeId: data.assignedEmployeeId ? Number(data.assignedEmployeeId) : null,
        assignedEmployee2Id: data.assignedEmployee2Id ? Number(data.assignedEmployee2Id) : null,
        vehicleId: data.vehicleId ? Number(data.vehicleId) : null,
        kitId: data.kitId ? Number(data.kitId) : null,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate).toISOString() : null,
        completedDate: data.completedDate ? new Date(data.completedDate).toISOString() : null,
      };
      if (order) {
        await apiRequest("PATCH", `/api/service-orders/${order.id}`, payload);
      } else {
        await apiRequest("POST", "/api/service-orders", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weapon-kits"] });
      toast({ title: order ? "OS atualizada" : "OS criada" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-order-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{order ? "Editar OS" : "Nova Ordem de Serviço"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Número da OS</label>
          <Input value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} required data-testid="input-os-number" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Cliente *</label>
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-os-client">
            <option value={0}>Selecione...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Tipo de Serviço *</label>
          <Input value="Escolta Armada" readOnly className="bg-neutral-50 text-neutral-700 cursor-default" data-testid="input-os-type" />
          <input type="hidden" name="type" value="escolta" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Prioridade</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-priority">
            <option value="imediata">Imediata</option>
            <option value="agendada">Agendada</option>
            <option value="reaproveitamento">Reaproveitamento</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-status">
            <option value="aberta">Aberta</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluída">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Data Agendada</label>
          <Input type="datetime-local" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} data-testid="input-os-scheduled" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Funcionário 1</label>
          <select value={form.assignedEmployeeId || ""} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value ? Number(e.target.value) : null })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-employee">
            <option value="">Selecione...</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Funcionário 2</label>
          <select value={form.assignedEmployee2Id || ""} onChange={(e) => setForm({ ...form, assignedEmployee2Id: e.target.value ? Number(e.target.value) : null })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-employee2">
            <option value="">Selecione...</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Veículo</label>
          <select value={form.vehicleId || ""} onChange={(e) => setForm({ ...form, vehicleId: e.target.value ? Number(e.target.value) : null })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-vehicle">
            <option value="">Selecione...</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}{v.color ? ` · ${v.color}` : ""}</option>)}
          </select>
        </div>
        {form.vehicleId && (() => {
          const sv = vehicles.find(v => v.id === form.vehicleId);
          if (!sv) return null;
          const photos = [
            { label: "Dianteira", src: sv.photoFront },
            { label: "Lateral Esq.", src: sv.photoLeft },
            { label: "Traseira", src: sv.photoRear },
            { label: "Lateral Dir.", src: sv.photoRight },
          ].filter(p => p.src);
          const trackerLabel = sv.trackerType === "truckscontrol" ? "TrucksControl" : sv.trackerType === "custom" ? "OnixSat" : null;
          const trackerId = sv.truckscontrolIdentifier || sv.trackerId || sv.plate;
          return (
            <div className="md:col-span-3 border border-neutral-200 rounded-lg overflow-hidden bg-white" data-testid="section-vehicle-info">
              <div className="bg-neutral-900 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-white/70" />
                  <span className="font-bold text-[17px] text-white tracking-[0.15em] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {sv.plate}
                  </span>
                </div>
                {trackerLabel && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded bg-white/10 text-white/90 font-semibold border border-white/20">
                    <Satellite className="w-3 h-3" />
                    {trackerLabel} · {trackerId}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
                <div className="px-4 py-3 border-r border-neutral-100">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Marca</span>
                  <span className="text-sm font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{sv.brand || "—"}</span>
                </div>
                <div className="px-4 py-3 border-r border-neutral-100">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Modelo</span>
                  <span className="text-sm font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{sv.model || "—"}</span>
                </div>
                <div className="px-4 py-3 border-r border-neutral-100">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Cor</span>
                  <span className="text-sm font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{sv.color || "—"}</span>
                </div>
                <div className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Ano</span>
                  <span className="text-sm font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{sv.year || "—"}</span>
                </div>
              </div>
              {(sv.chassi || sv.renavam || sv.km) && (
                <div className="grid grid-cols-3 border-b border-neutral-100">
                  <div className="px-4 py-3 border-r border-neutral-100">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Chassi</span>
                    <span className="text-xs font-medium text-neutral-700 font-mono">{sv.chassi || "—"}</span>
                  </div>
                  <div className="px-4 py-3 border-r border-neutral-100">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Renavam</span>
                    <span className="text-xs font-medium text-neutral-700 font-mono">{sv.renavam || "—"}</span>
                  </div>
                  <div className="px-4 py-3">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>KM Atual</span>
                    <span className="text-xs font-medium text-neutral-700 font-mono">{sv.km ? sv.km.toLocaleString("pt-BR") : "—"}</span>
                  </div>
                </div>
              )}
              {photos.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Camera className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Registro Fotográfico</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="group relative">
                        <div className="aspect-[4/3] rounded-md overflow-hidden border border-neutral-200 bg-neutral-50">
                          <img src={p.src!} alt={p.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        </div>
                        <span className="block text-center text-[9px] text-neutral-400 font-semibold uppercase tracking-wider mt-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <div>
          <label className="text-xs text-neutral-500 mb-1 flex items-center gap-1"><Package className="w-3 h-3" /> Kit de Armamento</label>
          <select value={form.kitId || ""} onChange={(e) => setForm({ ...form, kitId: e.target.value ? Number(e.target.value) : null })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-os-kit">
            <option value="">Sem kit</option>
            {kits.filter(k => k.status === "disponível" || (order?.kitId && k.id === order.kitId)).map((k) => (
              <option key={k.id} value={k.id}>{k.name} ({k.items.length} armas)</option>
            ))}
          </select>
        </div>
        {form.kitId && (() => {
          const selectedKit = kits.find(k => k.id === form.kitId);
          if (!selectedKit) return null;
          return (
            <div className="md:col-span-3 border border-neutral-200 rounded-lg overflow-hidden bg-white" data-testid="section-kit-info">
              <div className="bg-neutral-800 px-5 py-2.5 flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-white/70" />
                <span className="font-bold text-[13px] text-white tracking-wider uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {selectedKit.name}
                </span>
                <span className="text-[10px] text-white/50 font-medium ml-1">{selectedKit.items.length} arma(s)</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Tipo</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Marca</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Calibre</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Nº Série</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {selectedKit.items.map(item => item.weapon ? (
                    <tr key={item.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2 font-medium text-neutral-900">{item.weapon.type}</td>
                      <td className="px-4 py-2 text-neutral-600">{item.weapon.brand}</td>
                      <td className="px-4 py-2 text-neutral-600 font-mono">{item.weapon.caliber}</td>
                      <td className="px-4 py-2 text-neutral-600 font-mono font-semibold">{item.weapon.serialNumber}</td>
                    </tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
          );
        })()}
        {form.status === "concluída" && (
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Data de Conclusão</label>
            <Input type="datetime-local" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} data-testid="input-os-completed" />
          </div>
        )}
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Descrição</label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} data-testid="input-os-description" />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-os-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-order">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function ServiceOrdersPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ServiceOrder | undefined>();
  const [prefilledVehicleId, setPrefilledVehicleId] = useState<number | null>(null);
  const [prefilledScheduled, setPrefilledScheduled] = useState(false);
  const { toast } = useToast();
  const { data: orders = [], isLoading } = useQuery<ServiceOrder[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: kits = [] } = useQuery<EnrichedKit[]>({ queryKey: ["/api/weapon-kits"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/service-orders/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/weapon-kits"] }); toast({ title: "OS removida" }); },
  });

  const startMissionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/service-orders/${id}`, {
        status: "em_andamento",
        missionStatus: "aguardando",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      toast({ title: "Missão iniciada" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const osId = params.get("os");
    const newOs = params.get("newOs");
    const vehicleId = params.get("vehicleId");
    if (osId && orders.length > 0) {
      const found = orders.find((o) => o.id === Number(osId));
      if (found && !editItem) {
        setEditItem(found);
        setShowForm(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    } else if (newOs === "1" && !showForm) {
      if (vehicleId) setPrefilledVehicleId(Number(vehicleId));
      if (params.get("scheduled") === "1") setPrefilledScheduled(true);
      setEditItem(undefined);
      setShowForm(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [orders]);

  const getClientName = (id: number) => (clients || []).find((c) => c.id === id)?.name || "-";
  const getEmployeeName = (id: number | null) => {
    if (!id) return null;
    return (employees || []).find((e) => e.id === id)?.name || null;
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-orders-title">Ordens de Serviço</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão completa de OS</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-order">
          <Plus className="w-4 h-4 mr-2" /> Nova OS
        </Button>
      </div>

      {showForm && <OrderForm order={editItem} clients={clients || []} employees={employees || []} vehicles={vehicles || []} kits={kits || []} allOrders={orders || []} prefilledVehicleId={prefilledVehicleId} prefilledScheduled={prefilledScheduled} onClose={() => { setShowForm(false); setEditItem(undefined); setPrefilledVehicleId(null); setPrefilledScheduled(false); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (orders || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma OS registrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-orders">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">OS</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Cliente</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Prioridade</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Kit</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Missão</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(orders || []).map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-order-${o.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{o.osNumber}</td>
                    <td className="p-3 text-neutral-600">{getClientName(o.clientId)}</td>
                    <td className="p-3 text-neutral-600">{o.type}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        o.priority === "imediata" ? "bg-red-100 text-red-700" :
                        o.priority === "reaproveitamento" ? "bg-emerald-100 text-emerald-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{o.priority === "imediata" ? "Imediata" : o.priority === "reaproveitamento" ? "Reaproveitamento" : "Agendada"}</span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        o.status === "aberta" ? "bg-blue-100 text-blue-700" :
                        o.status === "em_andamento" ? "bg-amber-100 text-amber-700" :
                        o.status === "concluída" || o.status === "concluida" ? "bg-green-100 text-green-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{o.status}</span>
                    </td>
                    <td className="p-3">
                      {o.kitId ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-neutral-100 text-neutral-700 rounded px-2 py-0.5 font-medium">
                          <Package className="w-3 h-3" />
                          {kits.find(k => k.id === o.kitId)?.name || `Kit #${o.kitId}`}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {o.missionStatus ? (
                        <Badge variant="secondary" className={`text-xs ${getMissionStatusColor(o.missionStatus)}`} data-testid={`badge-mission-${o.id}`}>
                          {MISSION_STATUS_LABELS[o.missionStatus] || o.missionStatus}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {o.status === "aberta" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startMissionMutation.mutate(o.id)}
                            disabled={startMissionMutation.isPending}
                            title="Iniciar Missão"
                            data-testid={`button-start-mission-${o.id}`}
                          >
                            <Play className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(o); setShowForm(true); }} data-testid={`button-edit-order-${o.id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(o.id)} data-testid={`button-delete-order-${o.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
