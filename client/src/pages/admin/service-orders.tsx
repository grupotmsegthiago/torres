import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, authFetch, queryClient, getQueryFn } from "@/lib/queryClient";
import { titleCase } from "@/lib/utils";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, X, Pencil, Trash2, Play, Package, Car, Satellite, Camera, Shield, User, MapPin, Download, FileText, ChevronRight, ChevronLeft, ExternalLink, Navigation, Clock, DollarSign, Eye, Undo2 } from "lucide-react";
import { PlacesAutocomplete, calculateRouteInfo, type RouteInfo } from "@/components/places-autocomplete";
import type { ServiceOrder, Client, Employee, Vehicle, WeaponKit, WeaponKitItem, Weapon, MissionCost } from "@shared/schema";

type EnrichedKit = WeaponKit & { items: (WeaponKitItem & { weapon: Weapon | null })[] };

type StepLogEntry = { step: string; completedAt: string; agentName?: string; agentId?: number; geo?: { lat: number; lng: number } | null; nextStep?: string };

function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sp = d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return sp.replace(" ", "T").slice(0, 16);
}

function localInputToUtc(localValue: string): string | null {
  if (!localValue) return null;
  const parts = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parts) return new Date(localValue).toISOString();
  const [, y, mo, da, h, mi] = parts;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "shortOffset" });
  const refDate = new Date(`${y}-${mo}-${da}T12:00:00Z`);
  const offsetMatch = formatter.format(refDate).match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3;
  const sign = offsetHours >= 0 ? "+" : "-";
  const absH = String(Math.abs(offsetHours)).padStart(2, "0");
  return new Date(`${y}-${mo}-${da}T${h}:${mi}:00${sign}${absH}:00`).toISOString();
}

function getStepTime(stepLogs: StepLogEntry[] | null | undefined, stepNames: string[]): string | null {
  if (!stepLogs || !Array.isArray(stepLogs)) return null;
  for (const name of stepNames) {
    const entry = stepLogs.find((e: StepLogEntry) => e.step === name);
    if (entry?.completedAt) return entry.completedAt;
  }
  return null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

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
  em_transito_destino: "Em Trânsito ao Destino",
  chegada_destino: "Chegada no Destino",
  checkout_km_final: "Término de Missão",
  checkout_viatura_retorno: "Término de Missão",
  finalizada: "Entregas Finalizadas",
  retorno_base: "Retorno à Base",
  chegada_base: "Chegada na Base",
  encerrada: "Operação Encerrada",
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
    case "retorno_base":
      return "bg-sky-100 text-sky-700";
    case "chegada_base":
      return "bg-teal-100 text-teal-700";
    case "encerrada":
      return "bg-emerald-100 text-emerald-800";
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

const COST_CATEGORIES = [
  "Pedágio",
  "Combustível",
  "Alimentação",
  "Hospedagem",
  "Estacionamento",
  "Manutenção Emergencial",
  "Outro",
];

function MissionCostsSection({ orderId }: { orderId: number }) {
  const { toast } = useToast();
  const { user: mcUser } = useAuth();
  const mcIsDiretoria = mcUser?.role === "diretoria";
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState(COST_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const { data: costs = [], isLoading } = useQuery<MissionCost[]>({
    queryKey: ["/api/service-orders", orderId, "costs"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const addMutation = useMutation({
    mutationFn: async (data: { category: string; description: string; amount: string }) => {
      return apiRequest("POST", `/api/service-orders/${orderId}/costs`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders", orderId, "costs"] });
      setCategory(COST_CATEGORIES[0]);
      setDescription("");
      setAmount("");
      setShowForm(false);
      toast({ title: "Custo adicionado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao adicionar custo", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (costId: number) => {
      return apiRequest("DELETE", `/api/service-orders/${orderId}/costs/${costId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders", orderId, "costs"] });
      toast({ title: "Custo removido" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover custo", description: err.message, variant: "destructive" });
    },
  });

  const total = costs.reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);

  const handleSubmit = () => {
    const val = parseFloat(amount.replace(",", "."));
    if (!val || val <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    addMutation.mutate({ category, description, amount: val.toFixed(2) });
  };

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3 mt-3" data-testid="section-mission-costs">
      <div className="flex items-center justify-between bg-neutral-900 text-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wider font-bold">Custos Operacionais</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-400">
            R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md font-semibold transition-colors"
            data-testid="button-add-cost"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-3 bg-blue-50/50 border-b border-neutral-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-sm border border-neutral-300 rounded-md px-2.5 py-1.5 bg-white"
                data-testid="select-cost-category"
              >
                {COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Descrição</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                className="text-sm"
                data-testid="input-cost-description"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Valor (R$)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="text-sm"
                data-testid="input-cost-amount"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={addMutation.isPending}
                onClick={handleSubmit}
                className="bg-neutral-900 hover:bg-neutral-800 text-xs"
                data-testid="button-save-cost"
              >
                {addMutation.isPending ? "..." : "Salvar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                className="text-xs"
                data-testid="button-cancel-cost"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 text-center text-xs text-neutral-400">Carregando...</div>
      ) : costs.length === 0 ? (
        <div className="p-4 text-center text-xs text-neutral-400">Nenhum custo registrado</div>
      ) : (
        <table className="w-full text-xs" data-testid="table-mission-costs">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Categoria</th>
              <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Descrição</th>
              <th className="text-right px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Valor</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {costs.map(cost => (
              <tr key={cost.id} data-testid={`row-cost-${cost.id}`}>
                <td className="px-3.5 py-2.5 font-semibold text-neutral-900 text-sm">{cost.category}</td>
                <td className="px-3.5 py-2.5 text-neutral-600 text-sm">{cost.description || "—"}</td>
                <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-neutral-900 text-sm">
                  R$ {parseFloat(cost.amount || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2.5">
                  {mcIsDiretoria && <button
                    type="button"
                    onClick={() => { if (window.confirm("Excluir este custo?")) deleteMutation.mutate(cost.id); }}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    data-testid={`button-delete-cost-${cost.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-neutral-50 border-t border-neutral-200">
              <td colSpan={2} className="px-3.5 py-2.5 text-sm font-bold text-neutral-700 uppercase">Total</td>
              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-neutral-900 text-sm">
                R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function OrderForm({ order, clients, employees, vehicles, kits, onClose, allOrders, prefilledVehicleId, prefilledScheduled }: {
  order?: ServiceOrder; clients: Client[]; employees: Employee[]; vehicles: Vehicle[]; kits: EnrichedKit[]; onClose: () => void; allOrders: ServiceOrder[]; prefilledVehicleId?: number | null; prefilledScheduled?: boolean;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(order ? 3 : 1);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const nowLocal = () => utcToLocalInput(new Date().toISOString());

  const { data: escortContracts = [] } = useQuery<{ id: string; client_id: number | null; name: string | null; status: string | null }[]>({
    queryKey: ["/api/escort/contracts"],
  });

  const [form, setForm] = useState({
    osNumber: order?.osNumber || generateNextOsNumber(allOrders),
    clientId: order?.clientId || 0,
    escortContractId: (order as any)?.escortContractId || "",
    type: "escolta",
    description: order?.description || "",
    status: order?.status || "agendada",
    priority: order?.priority || "agendada",
    scheduledDate: utcToLocalInput(order?.scheduledDate),
    completedDate: utcToLocalInput(order?.completedDate),
    assignedEmployeeId: order?.assignedEmployeeId || null,
    assignedEmployee2Id: order?.assignedEmployee2Id || null,
    vehicleId: order?.vehicleId || prefilledVehicleId || null,
    kitId: order?.kitId || null,
    route: (order as any)?.route || "",
    origin: (order as any)?.origin || "",
    originLat: (order as any)?.originLat || null,
    originLng: (order as any)?.originLng || null,
    destination: (order as any)?.destination || "",
    destinationLat: (order as any)?.destinationLat || null,
    destinationLng: (order as any)?.destinationLng || null,
    requesterName: (order as any)?.requesterName || "",
    escortedDriverName: (order as any)?.escortedDriverName || "",
    escortedDriverPhone: (order as any)?.escortedDriverPhone || "",
    escortedVehiclePlate: (order as any)?.escortedVehiclePlate || "",
    notes: order?.notes || "",
  });

  const clientContracts = escortContracts.filter(c => c.client_id === form.clientId && c.status === "Ativo");

  useEffect(() => {
    if (!order && form.clientId > 0 && !form.escortContractId) {
      const cc = escortContracts.filter(c => c.client_id === form.clientId && c.status === "Ativo");
      if (cc.length === 1) {
        setForm(prev => ({ ...prev, escortContractId: cc[0].id }));
      }
    }
  }, [form.clientId, escortContracts]);

  const handlePriorityChange = (priority: string) => {
    const updates: any = { priority };
    if (priority === "imediata") {
      updates.scheduledDate = nowLocal();
    }
    setForm({ ...form, ...updates });
  };

  const calcRoute = async (orig: string, dest: string) => {
    if (!orig.trim() || !dest.trim()) { setRouteInfo(null); return; }
    const routeStr = `${orig.trim()} → ${dest.trim()}`;
    setForm(prev => ({
      ...prev,
      route: routeStr,
      origin: orig.trim(),
      originLat: originCoords?.lat || null,
      originLng: originCoords?.lng || null,
      destination: dest.trim(),
      destinationLat: destCoords?.lat || null,
      destinationLng: destCoords?.lng || null,
    }));
    setCalculatingRoute(true);
    try {
      const info = await calculateRouteInfo(orig.trim(), dest.trim());
      setRouteInfo(info);
    } catch {
      setRouteInfo(null);
    }
    setCalculatingRoute(false);
  };

  const handleOriginSelect = (p: { lat: number; lng: number }, address: string) => {
    setOriginCoords({ lat: p.lat, lng: p.lng });
    const newForm = { ...form, origin: address, originLat: p.lat, originLng: p.lng };
    setForm(newForm);
    if (form.destination) calcRoute(address, form.destination);
  };

  const handleDestSelect = (p: { lat: number; lng: number }, address: string) => {
    setDestCoords({ lat: p.lat, lng: p.lng });
    const newForm = { ...form, destination: address, destinationLat: p.lat, destinationLng: p.lng };
    setForm(newForm);
    if (form.origin) calcRoute(form.origin, address);
  };

  useEffect(() => {
    if (order && (order as any).origin && (order as any).destination && !routeInfo) {
      calcRoute((order as any).origin, (order as any).destination);
    }
  }, []);

  const googleMapsUrl = form.route ? `https://www.google.com/maps/dir/${encodeURIComponent(form.route.replace(" → ", "/"))}` : null;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        clientId: Number(data.clientId),
        assignedEmployeeId: data.assignedEmployeeId ? Number(data.assignedEmployeeId) : null,
        assignedEmployee2Id: data.assignedEmployee2Id ? Number(data.assignedEmployee2Id) : null,
        vehicleId: data.vehicleId ? Number(data.vehicleId) : null,
        kitId: data.kitId ? Number(data.kitId) : null,
        escortContractId: data.escortContractId || null,
        scheduledDate: localInputToUtc(data.scheduledDate),
        completedDate: localInputToUtc(data.completedDate),
      };
      if (order) {
        await apiRequest("PATCH", `/api/service-orders/${order.id}`, payload);
      } else {
        payload.missionStatus = "aguardando";
        await apiRequest("POST", "/api/service-orders", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weapon-kits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operational-grid"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-tracking"] });
      toast({ title: order ? "OS atualizada" : "OS criada" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const emp1 = form.assignedEmployeeId ? employees.find(e => e.id === form.assignedEmployeeId) : null;
  const emp2 = form.assignedEmployee2Id ? employees.find(e => e.id === form.assignedEmployee2Id) : null;
  const sv = form.vehicleId ? vehicles.find(v => v.id === form.vehicleId) : null;
  const selectedKit = form.kitId ? kits.find(k => k.id === form.kitId) : null;
  const photos = sv ? [
    { label: "Dianteira", src: sv.photoFront },
    { label: "Lateral Esq.", src: sv.photoLeft },
    { label: "Traseira", src: sv.photoRear },
    { label: "Lateral Dir.", src: sv.photoRight },
  ].filter(p => p.src) : [];
  const trackerLabel = sv?.trackerType === "truckscontrol" ? "TrucksControl" : sv?.trackerType === "custom" ? "OnixSat" : null;

  const step1Valid = form.clientId > 0;

  function isDocExpiringSoon(dateStr: string | null | undefined): "expired" | "warning" | "ok" {
    if (!dateStr) return "ok";
    const parts = dateStr.split("-");
    const expiryDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return "expired";
    if (diffDays < 30) return "warning";
    return "ok";
  }

  function validateAgentDocs(emp: Employee | null | undefined, label: string): { missing: string[]; expired: string[] } {
    const missing: string[] = [];
    const expired: string[] = [];
    if (!emp) return { missing, expired };
    if (!emp.cnhNumber) missing.push(`CNH (número) de ${label}`);
    if (!emp.cnhExpiry) missing.push(`Validade da CNH de ${label}`);
    if (!emp.cnvNumber) missing.push(`CNV (número) de ${label}`);
    if (!emp.cnvExpiry) missing.push(`Validade da CNV de ${label}`);
    if (isDocExpiringSoon(emp.cnhExpiry) === "expired") expired.push(`CNH de ${label}`);
    if (isDocExpiringSoon(emp.cnvExpiry) === "expired") expired.push(`CNV de ${label}`);
    return { missing, expired };
  }

  const step2Valid = true;

  const SectionHeader = ({ icon: Icon, title, extra }: { icon: any; title: string; extra?: any }) => (
    <div className="bg-neutral-900 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-white/70" />
        <span className="font-bold text-xs text-white tracking-wide uppercase">{title}</span>
      </div>
      {extra}
    </div>
  );
  const InfoCell = ({ label, children, className = "" }: { label: string; children: any; className?: string }) => (
    <div className={`px-3.5 py-3 ${className}`}>
      <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">{label}</span>
      <span className="text-sm font-semibold text-neutral-900">{children}</span>
    </div>
  );
  const FieldLabel = ({ children }: { children: any }) => (
    <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">{children}</label>
  );
  const selectClass = "w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200";

  const StepIndicator = () => (
    <div className="flex items-center gap-1.5 px-5 py-3 bg-neutral-50 border-b border-neutral-200">
      {[
        { n: 1, label: "Dados da OS" },
        { n: 2, label: "Agentes" },
        { n: 3, label: "Equipamento" },
      ].map((s, i) => (
        <div key={s.n} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-300 mx-0.5" />}
          <button
            type="button"
            onClick={() => { if (order || (s.n <= step)) setStep(s.n); }}
            className={`text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg transition-all duration-200 ${
              step === s.n ? "bg-neutral-900 text-white shadow-sm" : s.n < step ? "text-neutral-600 hover:bg-neutral-100 cursor-pointer" : "text-neutral-300 cursor-default"
            }`}
          >
            {s.n}. {s.label}
          </button>
        </div>
      ))}
    </div>
  );

  const AgentSection = ({ emp, label }: { emp: Employee | null | undefined; label: string }) => {
    if (!emp) return null;
    const photoUrl = (emp as any).photoUrl;
    return (
      <div className="border border-neutral-200 rounded-lg overflow-hidden" data-testid={`section-agent-${label.toLowerCase()}`}>
        <SectionHeader icon={User} title={`Agente: ${emp.name.split(" ")[0].toUpperCase()}`} />
        <div className="flex">
          {photoUrl && (
            <div className="w-28 shrink-0 border-r border-neutral-100 bg-neutral-50 flex items-center justify-center p-2">
              <img src={photoUrl} alt={emp.name} className="w-24 h-28 object-cover rounded-lg border border-neutral-200" data-testid={`img-agent-photo-${label}`} />
            </div>
          )}
          <div className="flex-1">
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="Nome" className="md:col-span-2 border-r border-neutral-100">{emp.name}</InfoCell>
              <InfoCell label="CPF" className="border-r border-neutral-100">{emp.cpf || "—"}</InfoCell>
              <InfoCell label="RG">{emp.rg || "—"}</InfoCell>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="Contato" className="border-r border-neutral-100">{emp.phone || "—"}</InfoCell>
              <InfoCell label="CNH" className="border-r border-neutral-100">{emp.cnhNumber || "—"}</InfoCell>
              <InfoCell label="Val. CNH" className="border-r border-neutral-100">
                <span className="flex items-center gap-1.5">
                  {emp.cnhExpiry ? new Date(emp.cnhExpiry).toLocaleDateString("pt-BR") : "—"}
                  {isDocExpiringSoon(emp.cnhExpiry) === "expired" && <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-cnh-expired-${label}`}>Vencida</Badge>}
                  {isDocExpiringSoon(emp.cnhExpiry) === "warning" && <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[10px] px-1.5 py-0" data-testid={`badge-cnh-warning-${label}`}>Vence em breve</Badge>}
                </span>
              </InfoCell>
              <InfoCell label="Matrícula">{emp.matricula}</InfoCell>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="CNV" className="border-r border-neutral-100">{emp.cnvNumber || "—"}</InfoCell>
              <InfoCell label="Val. CNV" className="border-r border-neutral-100">
                <span className="flex items-center gap-1.5">
                  {emp.cnvExpiry ? new Date(emp.cnvExpiry).toLocaleDateString("pt-BR") : "—"}
                  {isDocExpiringSoon(emp.cnvExpiry) === "expired" && <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-cnv-expired-${label}`}>Vencida</Badge>}
                  {isDocExpiringSoon(emp.cnvExpiry) === "warning" && <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[10px] px-1.5 py-0" data-testid={`badge-cnv-warning-${label}`}>Vence em breve</Badge>}
                </span>
              </InfoCell>
              <InfoCell label="Colete" className="border-r border-neutral-100">{(emp as any).vestNumber || "—"}</InfoCell>
              <InfoCell label="Proteção / Val.">{(emp as any).vestProtection || "—"}{(emp as any).vestExpiry ? ` · ${new Date((emp as any).vestExpiry).toLocaleDateString("pt-BR")}` : ""}</InfoCell>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white mb-6" data-testid="card-order-form">
      <div className="bg-neutral-900 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-white/60" />
            <h2 className="text-lg font-bold text-white tracking-wider uppercase">
              {order ? "Editar OS" : "Nova Ordem de Serviço"}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-white/70 font-semibold uppercase tracking-wide">Escolta Armada</span>
            {form.route && (
              <span className="text-xs text-white/50 flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                {form.route}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white/90 tracking-wider">{form.osNumber}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {!order && <StepIndicator />}

      <div className="p-5 space-y-4">
        {(step === 1 || !!order) && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <FieldLabel>Nº da OS</FieldLabel>
                {order ? (
              <Input value={form.osNumber} readOnly onChange={() => {}} className="text-sm bg-neutral-50 text-neutral-500 cursor-not-allowed" data-testid="input-os-number" />
            ) : (
              <Input value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} className="text-sm" data-testid="input-os-number" />
            )}
              </div>
              <div>
                <FieldLabel>Cliente *</FieldLabel>
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value), escortContractId: "" })} className={selectClass} required data-testid="select-os-client">
                  <option value={0}>Selecione...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{titleCase(c.name)}</option>)}
                </select>
              </div>
              {form.clientId > 0 && clientContracts.length > 0 && (
                <div>
                  <FieldLabel>Tabela de Preços</FieldLabel>
                  <select value={form.escortContractId} onChange={(e) => setForm({ ...form, escortContractId: e.target.value })} className={selectClass} data-testid="select-os-price-table">
                    <option value="">Selecione...</option>
                    {clientContracts.map(c => <option key={c.id} value={c.id}>{c.name || `Tabela ${c.id.slice(0, 8)}`}</option>)}
                  </select>
                </div>
              )}
              <div>
                <FieldLabel>Solicitante</FieldLabel>
                <Input value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} placeholder="Nome do solicitante" className="text-sm" data-testid="input-os-requester" />
              </div>
              <div>
                <FieldLabel>Prioridade</FieldLabel>
                <select value={form.priority} onChange={(e) => handlePriorityChange(e.target.value)} className={selectClass} data-testid="select-os-priority">
                  <option value="imediata">Imediata</option>
                  <option value="agendada">Agendada</option>
                  <option value="reaproveitamento">Reaproveitamento</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {order && (
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass} data-testid="select-os-status">
                    <option value="agendada">Agendada</option>
                    <option value="aberta">Aberta</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluída">Concluída</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
              )}
              <div>
                <FieldLabel>Data/Hora Início</FieldLabel>
                <Input type="datetime-local" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="text-sm" data-testid="input-os-scheduled" />
              </div>
              {form.status === "concluída" && (
                <div>
                  <FieldLabel>Data Conclusão</FieldLabel>
                  <Input type="datetime-local" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} className="text-sm" data-testid="input-os-completed" />
                </div>
              )}
              <div>
                <FieldLabel>Origem</FieldLabel>
                <PlacesAutocomplete
                  value={form.origin}
                  onChange={(v) => setForm({ ...form, origin: v })}
                  onPlaceSelect={(p) => handleOriginSelect(p, p.address)}
                  placeholder="Ex: Sao Paulo, SP"
                  className="text-sm"
                  theme="light"
                  data-testid="input-route-origin"
                />
              </div>
              <div>
                <FieldLabel>Destino</FieldLabel>
                <PlacesAutocomplete
                  value={form.destination}
                  onChange={(v) => setForm({ ...form, destination: v })}
                  onPlaceSelect={(p) => handleDestSelect(p, p.address)}
                  placeholder="Ex: Campinas, SP"
                  className="text-sm"
                  theme="light"
                  data-testid="input-route-destination"
                />
              </div>
              {form.route && (
                <div className="md:col-span-2">
                  <FieldLabel>Rota Vinculada</FieldLabel>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border border-neutral-200 rounded px-3 py-2 text-sm bg-neutral-50 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate text-neutral-800 font-medium">{form.route}</span>
                      </div>
                      {googleMapsUrl && (
                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors" title="Ver no Google Maps">
                          <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                        </a>
                      )}
                      <button type="button" onClick={() => { setForm({ ...form, route: "", origin: "", originLat: null, originLng: null, destination: "", destinationLat: null, destinationLng: null }); setRouteInfo(null); setOriginCoords(null); setDestCoords(null); }} className="p-2 rounded border border-neutral-200 hover:bg-red-50 transition-colors" title="Remover rota">
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                    {calculatingRoute && (
                      <div className="text-xs text-neutral-400 flex items-center gap-1.5">
                        <span className="animate-spin w-3 h-3 border border-neutral-300 border-t-neutral-600 rounded-full inline-block" />
                        Calculando distancia...
                      </div>
                    )}
                    {routeInfo && !calculatingRoute && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-neutral-600 bg-neutral-100 px-2 py-1 rounded font-medium" data-testid="text-route-distance">
                          <Navigation className="w-3 h-3" />
                          {routeInfo.distanceText}
                        </span>
                        <span className="flex items-center gap-1 text-neutral-600 bg-neutral-100 px-2 py-1 rounded font-medium" data-testid="text-route-duration">
                          <Clock className="w-3 h-3" />
                          {routeInfo.durationText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <FieldLabel>Motorista Escoltado</FieldLabel>
                <Input value={form.escortedDriverName} onChange={(e) => setForm({ ...form, escortedDriverName: e.target.value })} placeholder="Nome do motorista" className="text-sm" data-testid="input-os-driver-name" />
              </div>
              <div>
                <FieldLabel>Telefone do Motorista</FieldLabel>
                <Input value={form.escortedDriverPhone} onChange={(e) => setForm({ ...form, escortedDriverPhone: e.target.value })} placeholder="(11) 99999-9999" className="text-sm" data-testid="input-os-driver-phone" />
              </div>
              <div>
                <FieldLabel>Placa do Veículo Escoltado</FieldLabel>
                <Input value={form.escortedVehiclePlate} onChange={(e) => setForm({ ...form, escortedVehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC1D23" className="text-sm" data-testid="input-os-driver-plate" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <FieldLabel>Descrição / Informações Complementares</FieldLabel>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="text-sm" data-testid="input-os-description" />
              </div>
              <div>
                <FieldLabel>Observações</FieldLabel>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" data-testid="input-os-notes" />
              </div>
            </div>
          </>
        )}

        {(step === 2 || !!order) && (
          <div className={order ? "border-t border-neutral-100 pt-4" : ""}>
            {!order && (
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-neutral-500" />
                <span className="text-xs uppercase tracking-wide text-neutral-600 font-bold">Seleção de Agentes</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Agente 1</FieldLabel>
                <select value={form.assignedEmployeeId || ""} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{titleCase(emp.name)}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Agente 2</FieldLabel>
                <select value={form.assignedEmployee2Id || ""} onChange={(e) => setForm({ ...form, assignedEmployee2Id: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee2">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{titleCase(emp.name)}</option>)}
                </select>
              </div>
            </div>
            {emp1 && <div className="mb-3"><AgentSection emp={emp1} label="1" /></div>}
            {emp2 && <div className="mb-3"><AgentSection emp={emp2} label="2" /></div>}
          </div>
        )}

        {(step === 3 || !!order) && (
          <div className={order ? "border-t border-neutral-100 pt-4" : ""}>
            {!order && (
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-neutral-400" />
                <span className="text-xs uppercase tracking-wide text-neutral-600 font-bold">Veículo & Armamento</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Veículo</FieldLabel>
                <select value={form.vehicleId || ""} onChange={(e) => setForm({ ...form, vehicleId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-vehicle">
                  <option value="">Selecione...</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}{v.color ? ` · ${v.color}` : ""}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Kit de Armamento</FieldLabel>
                <select value={form.kitId || ""} onChange={(e) => setForm({ ...form, kitId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-kit">
                  <option value="">Sem kit</option>
                  {kits.map((k) => (
                    <option key={k.id} value={k.id}>{k.name} ({k.items.length} armas){k.status === "em_uso" && k.id !== order?.kitId ? " — EM USO" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            {sv && (
              <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3" data-testid="section-vehicle-info">
                <SectionHeader icon={Car} title="Viatura" extra={
                  trackerLabel && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-white/10 text-white/80 font-semibold border border-white/20">
                      <Satellite className="w-3 h-3" />
                      {trackerLabel} · {sv.truckscontrolIdentifier || sv.trackerId || sv.plate}
                    </span>
                  )
                } />
                <div className="grid grid-cols-2 md:grid-cols-5 border-b border-neutral-100">
                  <InfoCell label="Placa" className="border-r border-neutral-100">
                    <span className="tracking-[0.1em]">{sv.plate}</span>
                  </InfoCell>
                  <InfoCell label="Modelo" className="border-r border-neutral-100">{sv.brand} {sv.model}</InfoCell>
                  <InfoCell label="Cor" className="border-r border-neutral-100">{sv.color || "—"}</InfoCell>
                  <InfoCell label="Frota" className="border-r border-neutral-100">{(sv as any).frota || "—"}</InfoCell>
                  <InfoCell label="Ano">{sv.year || "—"}</InfoCell>
                </div>
                {photos.length > 0 && (
                  <div className="p-3 bg-neutral-50/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Camera className="w-3 h-3 text-neutral-400" />
                      <span className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Registro Fotográfico</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((p, i) => (
                        <div key={i} className="group">
                          <div className="aspect-[4/3] rounded overflow-hidden border border-neutral-200 bg-white">
                            <img src={p.src!} alt={p.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <span className="block text-center text-[10px] text-neutral-500 font-semibold uppercase tracking-wide mt-1.5">{p.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedKit && (
              <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3" data-testid="section-kit-info">
                <SectionHeader icon={Shield} title={selectedKit.name} extra={
                  <span className="text-xs text-white/50 font-medium">{selectedKit.items.length} arma(s)</span>
                } />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Armamento</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Calibre</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Numeração</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Marca</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedKit.items.map(item => item.weapon ? (
                      <tr key={item.id}>
                        <td className="px-3.5 py-2.5 font-semibold text-neutral-900 text-sm">{item.weapon.type}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 font-mono text-sm">{item.weapon.caliber}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 font-mono font-semibold text-sm">{item.weapon.serialNumber}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 text-sm">{item.weapon.brand}</td>
                      </tr>
                    ) : null)}
                  </tbody>
                </table>
              </div>
            )}

            {order && <MissionCostsSection orderId={order.id} />}
          </div>
        )}

        <div className="border-t border-neutral-100 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!order && step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="gap-1.5" data-testid="button-prev-step">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
          <div className="flex items-center gap-3">
            {!order && step < 3 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 1 && !step1Valid) {
                    toast({ title: "Selecione o cliente", variant: "destructive" });
                    return;
                  }
                  if (step === 2) {
                    const agents = [
                      { emp: emp1, label: emp1?.name || "Agente 1" },
                      { emp: emp2, label: emp2?.name || "Agente 2" },
                    ].filter(a => a.emp);
                    const allMissing: string[] = [];
                    const allExpired: string[] = [];
                    for (const a of agents) {
                      const { missing, expired } = validateAgentDocs(a.emp, a.label);
                      allMissing.push(...missing);
                      allExpired.push(...expired);
                    }
                    if (allMissing.length > 0) {
                      toast({ title: "Dados obrigatórios faltando", description: allMissing.join(", "), variant: "destructive" });
                      return;
                    }
                    if (allExpired.length > 0) {
                      toast({ title: "Documentos vencidos", description: `${allExpired.join(", ")} — não é possível criar a OS com documentos vencidos`, variant: "destructive" });
                      return;
                    }
                  }
                  setStep(step + 1);
                }}
                className="bg-neutral-900 hover:bg-neutral-800 gap-1.5"
                data-testid="button-next-step"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(form)} className="bg-neutral-900 hover:bg-neutral-800" data-testid="button-save-order">
                {mutation.isPending ? "Salvando..." : "Salvar OS"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServiceOrdersPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ServiceOrder | undefined>();
  const [prefilledVehicleId, setPrefilledVehicleId] = useState<number | null>(null);
  const [prefilledScheduled, setPrefilledScheduled] = useState(false);
  const [filterVehicleId, setFilterVehicleId] = useState<number | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState("");
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!pdfViewerUrl) { setPdfPages([]); return; }
    let cancelled = false;
    (async () => {
      setPdfLoading(true);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
        const response = await fetch(pdfViewerUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 2;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          pages.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPdfPages(pages);
      } catch (e) {
        console.error("PDF render error:", e);
      }
      if (!cancelled) setPdfLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pdfViewerUrl]);
  const { toast } = useToast();
  const { data: orders = [], isLoading } = useQuery<ServiceOrder[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: kits = [] } = useQuery<EnrichedKit[]>({ queryKey: ["/api/weapon-kits"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: escortContracts = [] } = useQuery<{ id: string; client_id: number | null; name: string | null; status: string | null }[]>({ queryKey: ["/api/escort/contracts"], queryFn: getQueryFn({ on401: "throw" }) });
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/service-orders/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/weapon-kits"] }); toast({ title: "OS removida" }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
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
      toast({ title: "Missão iniciada — agente liberado para saída" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });


  const rollbackStepMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", "/api/mission/rollback-step", { serviceOrderId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      toast({ title: "Etapa retrocedida", description: "O vigilante foi movido para a etapa anterior." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao voltar etapa", description: err.message, variant: "destructive" });
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
    } else if (vehicleId && !newOs) {
      setFilterVehicleId(Number(vehicleId));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [orders]);

  const getClientName = (id: number) => titleCase((clients || []).find((c) => c.id === id)?.name) || "-";
  const getEmployeeName = (id: number | null) => {
    if (!id) return null;
    const name = (employees || []).find((e) => e.id === id)?.name;
    return name ? titleCase(name) : null;
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

      {filterVehicleId && (() => {
        const fv = vehicles.find(vv => vv.id === filterVehicleId);
        return (
          <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
            <Car className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-800">
              Filtrando OS da viatura: <span className="font-black">{fv?.plate || `#${filterVehicleId}`}</span>
              {fv ? ` — ${fv.brand} ${fv.model}` : ""}
            </span>
            <button onClick={() => setFilterVehicleId(null)} className="ml-auto text-blue-600 hover:text-blue-800 p-0.5" data-testid="button-clear-vehicle-filter">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (orders || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma OS registrada</div>
        ) : (() => {
          const displayOrders = filterVehicleId ? (orders || []).filter(o => o.vehicleId === filterVehicleId) : (orders || []);
          if (displayOrders.length === 0) return (
            <div className="p-8 text-center text-neutral-400">Nenhuma OS encontrada para esta viatura</div>
          );
          return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-orders">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">OS</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Prioridade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Kit</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Missão</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Saída Base</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Cheg. Cliente</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Início Missão</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Cheg. Destino</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Fim Missão</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">KM Saída</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">KM Origem</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">KM Destino</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">KM Final</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-900 uppercase tracking-wider whitespace-nowrap bg-neutral-100">KM Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-order-${o.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{o.osNumber}</td>
                    <td className="p-3">
                      <span className="text-neutral-600">{getClientName(o.clientId)}</span>
                      {(() => {
                        const cId = (o as any).escortContractId;
                        const ct = cId ? escortContracts.find(c => c.id === cId) : null;
                        return ct ? (
                          <span className="block text-[10px] text-emerald-600 font-medium mt-0.5" data-testid={`text-contract-${o.id}`}>{ct.name || "Tabela Padrão"}</span>
                        ) : (
                          <span className="block text-[10px] text-amber-500 font-medium mt-0.5">Sem tabela</span>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-neutral-600">{o.type}</td>
                    <td className="p-3">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        o.priority === "imediata" ? "bg-red-50 text-red-700 border border-red-200" :
                        o.priority === "reaproveitamento" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>{o.priority === "imediata" ? "IMEDIATA" : o.priority === "reaproveitamento" ? "REAPROV." : "AGENDADA"}</span>
                    </td>
                    <td className="p-3">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        o.status === "aberta" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        o.status === "em_andamento" ? "bg-neutral-900 text-white" :
                        o.status === "concluída" || o.status === "concluida" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        o.status === "cancelada" ? "bg-red-50 text-red-700 border border-red-200" :
                        o.status === "agendada" && o.priority === "imediata" ? "bg-red-50 text-red-700 border border-red-200" :
                        o.status === "agendada" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }`}>{
                        o.status === "agendada" && o.priority === "imediata" ? "EM SERVIÇO" :
                        o.status === "agendada" ? "AGENDAMENTO" :
                        o.status === "aberta" ? "ABERTA" :
                        o.status === "em_andamento" ? "EM ANDAMENTO" :
                        o.status === "concluída" || o.status === "concluida" ? "CONCLUÍDA" :
                        o.status === "cancelada" ? "CANCELADA" :
                        o.status?.toUpperCase()
                      }</span>
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
                      {o.missionStatus ? (() => {
                        const displayStatus = o.missionStatus;
                        return (
                          <Badge variant="secondary" className={`text-xs ${getMissionStatusColor(displayStatus)}`} data-testid={`badge-mission-${o.id}`}>
                            {MISSION_STATUS_LABELS[displayStatus] || displayStatus}
                          </Badge>
                        );
                      })() : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                    </td>
                    {(() => {
                      const logs = o.stepLogs as StepLogEntry[] | null;
                      const mk = (o as any).missionKm as { saida_base: number | null; chegada_origem: number | null; chegada_destino: number | null; fim_missao: number | null } | null;
                      const tSaida = getStepTime(logs, ["checkout_km_saida", "aguardando"]);
                      const tChegCliente = getStepTime(logs, ["checkin_chegada_km", "em_transito_origem"]);
                      const tInicioMissao = getStepTime(logs, ["iniciar_missao"]);
                      const tChegDestino = getStepTime(logs, ["chegada_destino", "em_transito_destino"]);
                      const tFim = getStepTime(logs, ["encerrada", "finalizada", "checkout_km_final"]);
                      return (
                        <>
                          <td className="p-3 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-saida-${o.id}`}>{formatTime(tSaida)}</td>
                          <td className="p-3 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-chegcliente-${o.id}`}>{formatTime(tChegCliente)}</td>
                          <td className="p-3 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-iniciomissao-${o.id}`}>{formatTime(tInicioMissao)}</td>
                          <td className="p-3 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-chegdestino-${o.id}`}>{formatTime(tChegDestino)}</td>
                          <td className="p-3 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-fim-${o.id}`}>{formatTime(tFim)}</td>
                          <td className="p-3 text-center text-xs font-mono text-neutral-600 whitespace-nowrap" data-testid={`km-saida-${o.id}`}>{mk?.saida_base != null ? mk.saida_base.toLocaleString("pt-BR") : "—"}</td>
                          <td className="p-3 text-center text-xs font-mono text-neutral-600 whitespace-nowrap" data-testid={`km-origem-${o.id}`}>{mk?.chegada_origem != null ? mk.chegada_origem.toLocaleString("pt-BR") : "—"}</td>
                          <td className="p-3 text-center text-xs font-mono text-neutral-600 whitespace-nowrap" data-testid={`km-destino-${o.id}`}>{mk?.chegada_destino != null ? mk.chegada_destino.toLocaleString("pt-BR") : "—"}</td>
                          <td className="p-3 text-center text-xs font-mono text-neutral-600 whitespace-nowrap" data-testid={`km-final-${o.id}`}>{mk?.fim_missao != null ? mk.fim_missao.toLocaleString("pt-BR") : "—"}</td>
                          <td className="p-3 text-center text-xs font-mono font-bold whitespace-nowrap bg-neutral-50" data-testid={`km-total-${o.id}`}>{
                            mk?.saida_base != null && mk?.fim_missao != null
                              ? (mk.fim_missao - mk.saida_base).toLocaleString("pt-BR")
                              : "—"
                          }</td>
                        </>
                      );
                    })()}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {(o.status === "aberta" || o.status === "agendada") && !o.missionStatus && (
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
                        {o.missionStatus && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Voltar etapa da OS ${o.osNumber}?\nEtapa atual: ${MISSION_STATUS_LABELS[o.missionStatus] || o.missionStatus}\nO vigilante sera movido para a etapa anterior.`)) {
                                rollbackStepMutation.mutate(o.id);
                              }
                            }}
                            disabled={rollbackStepMutation.isPending}
                            title="Voltar Etapa"
                            data-testid={`button-rollback-step-${o.id}`}
                          >
                            <Undo2 className="w-4 h-4 text-orange-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={async () => {
                          try {
                            const res = await authFetch(`/api/service-orders/${o.id}/pdf`);
                            if (!res.ok) throw new Error("Falha ao gerar PDF");
                            const rawBlob = await res.blob();
                            const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
                            const url = URL.createObjectURL(pdfBlob);
                            setPdfViewerUrl(url);
                            setPdfViewerTitle(`OS ${o.osNumber}`);
                          } catch {
                            toast({ title: "Erro ao visualizar PDF", variant: "destructive" });
                          }
                        }} title="Visualizar OS" data-testid={`button-view-order-${o.id}`}><Eye className="w-4 h-4 text-blue-500" /></Button>
                        {(o.status === "concluida" || o.status === "em_andamento" || o.missionStatus === "encerrada" || o.missionStatus === "finalizada") && (
                          <Button variant="ghost" size="icon" onClick={async () => {
                            try {
                              const res = await authFetch(`/api/service-orders/${o.id}/relatorio-missao`);
                              if (!res.ok) throw new Error("Falha ao gerar relatório");
                              const rawBlob = await res.blob();
                              const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
                              const url = URL.createObjectURL(pdfBlob);
                              setPdfViewerUrl(url);
                              setPdfViewerTitle(`Relatório Missão ${o.osNumber}`);
                            } catch {
                              toast({ title: "Erro ao gerar relatório", variant: "destructive" });
                            }
                          }} title="Relatório Completo da Missão" data-testid={`button-report-order-${o.id}`}><FileText className="w-4 h-4 text-emerald-500" /></Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={async () => {
                          try {
                            const res = await authFetch(`/api/service-orders/${o.id}/pdf`);
                            if (!res.ok) throw new Error("Falha ao gerar PDF");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `OS_${o.osNumber}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Erro ao baixar PDF", variant: "destructive" });
                          }
                        }} title="Baixar PDF" data-testid={`button-pdf-order-${o.id}`}><Download className="w-4 h-4 text-neutral-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(o); setShowForm(true); }} data-testid={`button-edit-order-${o.id}`}><Pencil className="w-4 h-4" /></Button>
                        {isDiretoria && <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Excluir permanentemente OS ${o.osNumber}?`)) deleteMutation.mutate(o.id); }} data-testid={`button-delete-order-${o.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        })()}
      </Card>

      {pdfViewerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { URL.revokeObjectURL(pdfViewerUrl); setPdfViewerUrl(null); }} data-testid="overlay-pdf-viewer">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-[95vw] max-w-5xl h-[92vh] flex flex-col overflow-hidden border border-neutral-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white" data-testid="text-pdf-viewer-title">{pdfViewerTitle}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  const a = document.createElement("a");
                  a.href = pdfViewerUrl;
                  a.download = `${pdfViewerTitle.replace(/\s+/g, "_")}.pdf`;
                  a.click();
                }} data-testid="button-download-from-viewer">
                  <Download className="w-3.5 h-3.5 mr-1" /> Baixar
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  window.open(pdfViewerUrl, "_blank");
                }} data-testid="button-open-new-tab">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> Nova Aba
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { URL.revokeObjectURL(pdfViewerUrl); setPdfViewerUrl(null); }} data-testid="button-close-pdf-viewer">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-neutral-100 p-4" id="pdf-canvas-container" data-testid="iframe-pdf-viewer">
              {pdfLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-8 h-8 border-2 border-neutral-300 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-500">Renderizando PDF...</p>
                </div>
              )}
              {!pdfLoading && pdfPages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <FileText className="w-16 h-16 text-neutral-300" />
                  <p className="text-sm text-neutral-500">Nao foi possivel renderizar o PDF.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      const a = document.createElement("a");
                      a.href = pdfViewerUrl!;
                      a.download = `${pdfViewerTitle.replace(/\s+/g, "_")}.pdf`;
                      a.click();
                    }}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Baixar PDF
                    </Button>
                  </div>
                </div>
              )}
              {!pdfLoading && pdfPages.length > 0 && (
                <div className="flex flex-col items-center gap-4">
                  {pdfPages.map((src, idx) => (
                    <img key={idx} src={src} alt={`Pagina ${idx + 1}`} className="w-full max-w-3xl shadow-lg rounded bg-white" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
