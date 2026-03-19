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
import { Plus, X, Pencil, Trash2, Play, Package, Car, Satellite, Camera, Shield, User, MapPin, Download, FileText, ChevronRight, ChevronLeft, ExternalLink, Navigation } from "lucide-react";
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
  const [step, setStep] = useState(order ? 3 : 1);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");
  const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({
    osNumber: order?.osNumber || generateNextOsNumber(allOrders),
    clientId: order?.clientId || 0,
    type: "escolta",
    description: order?.description || "",
    status: order?.status || "agendada",
    priority: order?.priority || "agendada",
    scheduledDate: order?.scheduledDate ? new Date(order.scheduledDate).toISOString().slice(0, 16) : "",
    completedDate: order?.completedDate ? new Date(order.completedDate).toISOString().slice(0, 16) : "",
    assignedEmployeeId: order?.assignedEmployeeId || null,
    assignedEmployee2Id: order?.assignedEmployee2Id || null,
    vehicleId: order?.vehicleId || prefilledVehicleId || null,
    kitId: order?.kitId || null,
    route: (order as any)?.route || "",
    requesterName: (order as any)?.requesterName || "",
    notes: order?.notes || "",
  });

  const handlePriorityChange = (priority: string) => {
    const updates: any = { priority };
    if (priority === "imediata") {
      updates.scheduledDate = nowLocal();
    }
    setForm({ ...form, ...updates });
  };

  const addRoute = () => {
    if (!routeOrigin.trim() || !routeDestination.trim()) return;
    const routeStr = `${routeOrigin.trim()} → ${routeDestination.trim()}`;
    setForm({ ...form, route: routeStr });
    setShowRouteForm(false);
    setRouteOrigin("");
    setRouteDestination("");
  };

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
  const step2Valid = true;

  const SectionHeader = ({ icon: Icon, title, extra }: { icon: any; title: string; extra?: any }) => (
    <div className="bg-neutral-900 px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-white/60" />
        <span className="font-bold text-[11px] text-white tracking-[0.12em] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title}</span>
      </div>
      {extra}
    </div>
  );
  const InfoCell = ({ label, children, className = "" }: { label: string; children: any; className?: string }) => (
    <div className={`px-3 py-2.5 ${className}`}>
      <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-semibold block mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>{label}</span>
      <span className="text-xs font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{children}</span>
    </div>
  );
  const FieldLabel = ({ children }: { children: any }) => (
    <label className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1 block" style={{ fontFamily: "'Montserrat', sans-serif" }}>{children}</label>
  );
  const selectClass = "w-full border border-neutral-200 rounded px-3 py-2 text-sm bg-white focus:border-neutral-400 focus:ring-1 focus:ring-neutral-200 outline-none transition-colors";

  const StepIndicator = () => (
    <div className="flex items-center gap-1 px-5 py-2.5 bg-neutral-50 border-b border-neutral-200">
      {[
        { n: 1, label: "Dados da OS" },
        { n: 2, label: "Agentes" },
        { n: 3, label: "Equipamento" },
      ].map((s, i) => (
        <div key={s.n} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-neutral-300 mx-0.5" />}
          <button
            type="button"
            onClick={() => { if (order || (s.n <= step)) setStep(s.n); }}
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
              step === s.n ? "bg-neutral-900 text-white" : s.n < step ? "text-neutral-600 hover:bg-neutral-100 cursor-pointer" : "text-neutral-300 cursor-default"
            }`}
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            {s.n}. {s.label}
          </button>
        </div>
      ))}
    </div>
  );

  const AgentSection = ({ emp, label }: { emp: Employee | null | undefined; label: string }) => {
    if (!emp) return null;
    return (
      <div className="border border-neutral-200 rounded-lg overflow-hidden" data-testid={`section-agent-${label.toLowerCase()}`}>
        <SectionHeader icon={User} title={`Agente: ${emp.name.split(" ")[0].toUpperCase()}`} />
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
          <InfoCell label="Nome" className="md:col-span-2 border-r border-neutral-100">{emp.name}</InfoCell>
          <InfoCell label="CPF" className="border-r border-neutral-100">{emp.cpf || "—"}</InfoCell>
          <InfoCell label="RG">{emp.rg || "—"}</InfoCell>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
          <InfoCell label="Contato" className="border-r border-neutral-100">{emp.phone || "—"}</InfoCell>
          <InfoCell label="CNH" className="border-r border-neutral-100">{emp.cnhNumber || "—"}</InfoCell>
          <InfoCell label="Val. CNH" className="border-r border-neutral-100">{(emp as any).cnhExpiry ? new Date((emp as any).cnhExpiry).toLocaleDateString("pt-BR") : "—"}</InfoCell>
          <InfoCell label="Matrícula">{emp.matricula}</InfoCell>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
          <InfoCell label="CNV" className="border-r border-neutral-100">{(emp as any).cnvNumber || "—"}</InfoCell>
          <InfoCell label="Val. CNV" className="border-r border-neutral-100">{(emp as any).cnvExpiry ? new Date((emp as any).cnvExpiry).toLocaleDateString("pt-BR") : "—"}</InfoCell>
          <InfoCell label="Colete" className="border-r border-neutral-100">{(emp as any).vestNumber || "—"}</InfoCell>
          <InfoCell label="Proteção / Val.">{(emp as any).vestProtection || "—"}{(emp as any).vestExpiry ? ` · ${new Date((emp as any).vestExpiry).toLocaleDateString("pt-BR")}` : ""}</InfoCell>
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
            <h2 className="text-lg font-bold text-white tracking-wider uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              {order ? "Editar OS" : "Nova Ordem de Serviço"}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-[11px] text-white/70 font-semibold uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>Escolta Armada</span>
            {form.route && (
              <span className="text-[10px] text-white/50 flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                {form.route}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white/90 tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>{form.osNumber}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {!order && <StepIndicator />}

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="p-5 space-y-4">
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
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })} className={selectClass} required data-testid="select-os-client">
                  <option value={0}>Selecione...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
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
              <div className="md:col-span-1">
                <FieldLabel>Rota (Origem → Destino)</FieldLabel>
                {form.route ? (
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
                    <button type="button" onClick={() => setForm({ ...form, route: "" })} className="p-2 rounded border border-neutral-200 hover:bg-red-50 transition-colors" title="Remover rota">
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ) : showRouteForm ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input value={routeOrigin} onChange={(e) => setRouteOrigin(e.target.value)} placeholder="Origem (ex: São Paulo, SP)" className="text-sm flex-1" data-testid="input-route-origin" />
                      <span className="text-neutral-400 text-xs font-bold">→</span>
                      <Input value={routeDestination} onChange={(e) => setRouteDestination(e.target.value)} placeholder="Destino (ex: Rio de Janeiro, RJ)" className="text-sm flex-1" data-testid="input-route-destination" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={addRoute} className="bg-neutral-900 hover:bg-neutral-800 text-xs h-7">Confirmar</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowRouteForm(false)} className="text-xs h-7">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowRouteForm(true)} className="w-full border border-dashed border-neutral-300 rounded px-3 py-2 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-2" data-testid="button-add-route">
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar rota
                  </button>
                )}
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
                <User className="w-4 h-4 text-neutral-400" />
                <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Seleção de Agentes</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Agente 1</FieldLabel>
                <select value={form.assignedEmployeeId || ""} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Agente 2</FieldLabel>
                <select value={form.assignedEmployee2Id || ""} onChange={(e) => setForm({ ...form, assignedEmployee2Id: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee2">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
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
                <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Veículo & Armamento</span>
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
                  {kits.filter(k => k.status === "disponível" || (order?.kitId && k.id === order.kitId)).map((k) => (
                    <option key={k.id} value={k.id}>{k.name} ({k.items.length} armas)</option>
                  ))}
                </select>
              </div>
            </div>

            {sv && (
              <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3" data-testid="section-vehicle-info">
                <SectionHeader icon={Car} title="Viatura" extra={
                  trackerLabel && (
                    <span className="inline-flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded bg-white/10 text-white/80 font-semibold border border-white/20">
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
                      <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Registro Fotográfico</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((p, i) => (
                        <div key={i} className="group">
                          <div className="aspect-[4/3] rounded overflow-hidden border border-neutral-200 bg-white">
                            <img src={p.src!} alt={p.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <span className="block text-center text-[8px] text-neutral-400 font-semibold uppercase tracking-wider mt-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.label}</span>
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
                  <span className="text-[9px] text-white/50 font-medium">{selectedKit.items.length} arma(s)</span>
                } />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Armamento</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Calibre</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Numeração</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-neutral-400 font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Marca</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedKit.items.map(item => item.weapon ? (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-semibold text-neutral-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.weapon.type}</td>
                        <td className="px-3 py-2 text-neutral-600 font-mono">{item.weapon.caliber}</td>
                        <td className="px-3 py-2 text-neutral-600 font-mono font-semibold">{item.weapon.serialNumber}</td>
                        <td className="px-3 py-2 text-neutral-600">{item.weapon.brand}</td>
                      </tr>
                    ) : null)}
                  </tbody>
                </table>
              </div>
            )}
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
                  setStep(step + 1);
                }}
                className="bg-neutral-900 hover:bg-neutral-800 gap-1.5"
                data-testid="button-next-step"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending} className="bg-neutral-900 hover:bg-neutral-800" data-testid="button-save-order">
                {mutation.isPending ? "Salvando..." : "Salvar OS"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
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
                        <Button variant="ghost" size="icon" onClick={async () => {
                          try {
                            const res = await fetch(`/api/service-orders/${o.id}/pdf`, { credentials: "include" });
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
