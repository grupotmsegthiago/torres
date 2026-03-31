import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, authFetch } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText, CheckCircle2, X, AlertTriangle, Clock, MapPin,
  Loader2, Eye, ChevronDown, ChevronRight, Truck, Shield,
  Car, User, Calculator, Filter, Lock, Pencil,
} from "lucide-react";

const fmt = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtTime = (d: string | null) => d ? new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtHoras = (val: number | null | undefined) => {
  if (!val) return "0h00";
  const h = Math.floor(val);
  const m = Math.round((val - h) * 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
};

type StatusFilter = "ALL" | "EM_ANDAMENTO" | "PENDENTE" | "APROVADA" | "REJEITADA";

export default function BoletimMedicaoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [selectedOs, setSelectedOs] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [pedagioValue, setPedagioValue] = useState("");
  const [observacoesValue, setObservacoesValue] = useState("");
  const [editingFields, setEditingFields] = useState(false);
  const [overrideKmChegada, setOverrideKmChegada] = useState("");
  const [overrideKmFim, setOverrideKmFim] = useState("");
  const [overrideHoraChegada, setOverrideHoraChegada] = useState("");
  const [overrideHoraFim, setOverrideHoraFim] = useState("");

  const { data: osConcluidas = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/boletim-medicao/os-concluidas"],
    queryFn: async () => {
      const r = await authFetch("/api/boletim-medicao/os-concluidas");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const { data: escortBillings = [] } = useQuery<any[]>({
    queryKey: ["/api/escort/billings"],
    queryFn: async () => {
      const r = await authFetch("/api/escort/billings");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const aprovarMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "APROVADA" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
      toast({ title: "OS Aprovada", description: "Boletim gerado automaticamente." });
      setSelectedOs(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const rejeitarMutation = useMutation({
    mutationFn: async ({ billingId, motivo }: { billingId: string; motivo: string }) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "REJEITADA", motivo_rejeicao: motivo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
      toast({ title: "OS Rejeitada", description: "Correção solicitada." });
      setSelectedOs(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const calcularMutation = useMutation({
    mutationFn: async (osId: number) => {
      return apiRequest("POST", `/api/boletim-medicao/calcular/${osId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      toast({ title: "Cálculo realizado", description: "Billing gerado com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro ao calcular", description: err.message, variant: "destructive" }),
  });

  const salvarBillingMutation = useMutation({
    mutationFn: async ({ billingId, observacoes, pedagio }: { billingId: string; observacoes: string; pedagio: number }) => {
      return apiRequest("PATCH", `/api/escort/billings/${billingId}/salvar`, { observacoes, despesas_pedagio: pedagio });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      toast({ title: "Salvo", description: "Observações e pedágio salvos com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ osId, data }: { osId: number; data: any }) => {
      return apiRequest("PATCH", `/api/boletim-medicao/os/${osId}/diretoria-override`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      setEditingFields(false);
      toast({ title: "Atualizado", description: "Campos alterados e billing recalculado." });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (selectedOs) {
      setOverrideKmChegada(selectedOs.km_chegada_origem != null ? String(selectedOs.km_chegada_origem) : "");
      setOverrideKmFim(selectedOs.km_final != null ? String(selectedOs.km_final) : "");
      const fmtDt = (v: string | null) => {
        if (!v) return "";
        try { return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).split(" ").pop() || ""; } catch { return ""; }
      };
      setOverrideHoraChegada(fmtDt(selectedOs.hora_chegada_origem));
      setOverrideHoraFim(fmtDt(selectedOs.hora_fim_missao));
      setEditingFields(false);
    }
  }, [selectedOs]);

  const clientGroups: Record<number, { clientName: string; orders: any[] }> = {};
  osConcluidas.forEach(os => {
    const cid = os.clientId || 0;
    if (!clientGroups[cid]) clientGroups[cid] = { clientName: os.clientName || "Sem Cliente", orders: [] };
    clientGroups[cid].orders.push(os);
  });

  const filteredGroups = Object.entries(clientGroups).map(([cid, group]) => {
    let orders = group.orders;
    if (statusFilter === "EM_ANDAMENTO") orders = orders.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada");
    else if (statusFilter === "PENDENTE") orders = orders.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR");
    else if (statusFilter === "APROVADA") orders = orders.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado);
    else if (statusFilter === "REJEITADA") orders = orders.filter(o => o.billing?.status === "REJEITADA");
    if (orders.length === 0) return null;
    return { clientId: Number(cid), clientName: group.clientName, orders };
  }).filter(Boolean) as { clientId: number; clientName: string; orders: any[] }[];

  const liveCount = osConcluidas.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada").length;
  const pendingCount = osConcluidas.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR").length;
  const approvedCount = osConcluidas.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado).length;

  const getBillingStatus = (os: any) => {
    if (!os.billing) return { label: "Sem Cálculo", color: "bg-neutral-100 text-neutral-600" };
    switch (os.billing.status) {
      case "ESTIMATIVA": return { label: "Estimativa", color: "bg-blue-100 text-blue-800" };
      case "A_VERIFICAR": return { label: "A Verificar", color: "bg-amber-100 text-amber-800" };
      case "APROVADA": return { label: "Aprovada ✓", color: "bg-green-100 text-green-800" };
      case "REJEITADA": return { label: "Rejeitada", color: "bg-red-100 text-red-800" };
      case "CALCULADO": return { label: "Calculado", color: "bg-blue-100 text-blue-800" };
      case "FATURADO": return { label: "Faturado", color: "bg-indigo-100 text-indigo-800" };
      default: return { label: os.billing.status, color: "bg-neutral-100 text-neutral-600" };
    }
  };

  const isLiveOs = (os: any) => (os.status === "em_andamento" || (os.status === "agendada" && os.missionStartedAt)) && os.missionStatus !== "encerrada";

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-boletim-medicao">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-neutral-900 uppercase tracking-wider" data-testid="heading-boletim">Boletim de Medição</h1>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mt-1">OS em andamento e encerradas — verificacao e aprovacao de faturamento</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-0 font-black text-sm px-3 py-1" data-testid="badge-pendentes">
                <AlertTriangle size={14} className="mr-1" /> {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
              </Badge>
            )}
            <Badge className="bg-green-100 text-green-800 border-0 font-bold text-xs px-2 py-1">
              {approvedCount} aprovada{approvedCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2" data-testid="filter-status">
          {([["ALL", "Todas"], ["EM_ANDAMENTO", `Em Andamento (${liveCount})`], ["PENDENTE", "A Verificar"], ["APROVADA", "Aprovadas"], ["REJEITADA", "Rejeitadas"]] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                statusFilter === val ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
              data-testid={`filter-${val.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-neutral-300" /></div>
        ) : filteredGroups.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText size={48} className="mx-auto text-neutral-200 mb-4" />
            <p className="text-sm font-black text-neutral-400 uppercase">Nenhuma OS encontrada</p>
            <p className="text-xs text-neutral-300 mt-1">As OS em andamento e finalizadas aparecerão aqui para verificação</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => {
              const isExpanded = expandedClient === group.clientId;
              const groupPending = group.orders.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR").length;
              const groupTotal = group.orders.reduce((acc, o) => acc + Number(o.billing?.fat_total || 0), 0);

              return (
                <Card key={group.clientId} className="overflow-hidden border-neutral-200" data-testid={`client-group-${group.clientId}`}>
                  <button
                    onClick={() => setExpandedClient(isExpanded ? null : group.clientId)}
                    className="w-full p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                    data-testid={`toggle-client-${group.clientId}`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={18} className="text-neutral-400" /> : <ChevronRight size={18} className="text-neutral-400" />}
                      <div className="text-left">
                        <p className="text-sm font-black text-neutral-900 uppercase tracking-wider">{group.clientName}</p>
                        <p className="text-[10px] text-neutral-400 font-bold">{group.orders.length} OS · Total Faturamento: {fmt(groupTotal)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {groupPending > 0 && <Badge className="bg-amber-100 text-amber-800 border-0 font-black text-[10px]">{groupPending} pendente{groupPending > 1 ? "s" : ""}</Badge>}
                      {group.orders[0]?.hasContract ? (
                        <Badge className="bg-green-50 text-green-700 border-0 text-[10px] font-bold">Tabela Cadastrada</Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-700 border-0 text-[10px] font-bold">Sem Tabela</Badge>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-neutral-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" data-testid={`table-os-${group.clientId}`}>
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                              <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">OS</th>
                              <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Data</th>
                              <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Rota</th>
                              <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Agente</th>
                              <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Viatura</th>
                              <th className="text-right px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">KM</th>
                              <th className="text-right px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Horas</th>
                              <th className="text-right px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Valor</th>
                              <th className="text-center px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Status</th>
                              <th className="text-center px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.orders.map((os: any) => {
                              const status = getBillingStatus(os);
                              const b = os.billing;
                              return (
                                <tr key={os.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors" data-testid={`row-os-${os.id}`}>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-black text-neutral-800">{os.osNumber}</span>
                                      {isLiveOs(os) && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Em andamento" />}
                                    </div>
                                    {b?.boletim_numero && <p className="text-[9px] text-blue-600 font-mono font-bold mt-0.5">{b.boletim_numero}</p>}
                                    {isLiveOs(os) && <p className="text-[9px] text-green-600 font-bold mt-0.5">EM ANDAMENTO</p>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-bold text-neutral-600">{fmtDate(os.scheduledDate || os.createdAt)}</span>
                                    {os.missionStartedAt && <p className="text-[9px] text-neutral-400">{fmtTime(os.missionStartedAt)} — {os.completedDate ? fmtTime(os.completedDate) : <span className="text-green-600 font-bold">em andamento</span>}</p>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="max-w-[150px]">
                                      {os.origin && <p className="text-[10px] font-bold text-neutral-600 truncate">{os.origin}</p>}
                                      {os.destination && <p className="text-[10px] text-neutral-400 truncate">→ {os.destination}</p>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-bold text-neutral-700">{os.employee1Name || "—"}</span>
                                    {os.employee2Name && <p className="text-[9px] text-neutral-400">{os.employee2Name}</p>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-mono font-bold text-neutral-600">{os.vehiclePlate || "—"}</span>
                                    {os.escortedVehiclePlate && <p className="text-[9px] text-neutral-400">Escolt: {os.escortedVehiclePlate}</p>}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-mono font-bold text-neutral-800">{b ? Number(b.km_total || 0) : os.km_total || 0}</span>
                                    <span className="text-neutral-400 ml-0.5">km</span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-mono font-bold text-neutral-800">{b ? fmtHoras(Number(b.horas_trabalhadas || b.horas_missao || 0)) : "—"}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-mono font-black text-green-700">{b ? fmt(Number(b.fat_total)) : "—"}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Badge className={`${status.color} border-0 font-black text-[9px]`}>{status.label}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {(!b || isLiveOs(os) || b?.status === "REJEITADA") && (
                                        <button
                                          onClick={() => calcularMutation.mutate(os.id)}
                                          disabled={calcularMutation.isPending}
                                          className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                          title={b?.status === "REJEITADA" ? "Recalcular (Rejeitada)" : b && isLiveOs(os) ? "Recalcular Estimativa" : "Calcular Billing"}
                                          data-testid={`button-calc-os-${os.id}`}
                                        >
                                          <Calculator size={16} className={b?.status === "REJEITADA" ? "text-red-500" : isLiveOs(os) && b ? "text-green-500" : "text-blue-500"} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => { setSelectedOs(os); setPedagioValue(b?.despesas_pedagio || "0"); setObservacoesValue(b?.observacoes || ""); }}
                                        className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
                                        data-testid={`button-view-os-${os.id}`}
                                      >
                                        <Eye size={16} className="text-neutral-500" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-neutral-50">
                              <td colSpan={7} className="px-4 py-3 text-right font-black text-neutral-500 uppercase text-[10px]">Total do Cliente:</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-green-700 text-sm">{fmt(groupTotal)}</td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {selectedOs && (() => {
          const os = selectedOs;
          const b = os.billing;
          const status = getBillingStatus(os);
          const isPendente = b?.status === "A_VERIFICAR";

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedOs(null)}>
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="modal-boletim-detalhe">
                <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex justify-between items-center z-10">
                  <div>
                    <h3 className="font-black text-neutral-800 uppercase text-sm tracking-widest flex items-center gap-2">
                      <FileText size={18} /> OS {os.osNumber}
                    </h3>
                    {b?.boletim_numero && <p className="text-[10px] font-mono text-blue-600 font-bold mt-0.5">{b.boletim_numero}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${status.color} border-0 font-black text-xs`}>{status.label}</Badge>
                    <button onClick={() => setSelectedOs(null)} className="p-1 rounded-lg hover:bg-neutral-100"><X size={20} className="text-neutral-400" /></button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase">Cliente</p>
                      <p className="text-sm font-black text-neutral-800">{os.clientName}</p>
                      {os.clientCnpj && <p className="text-[10px] text-neutral-400 font-mono">{os.clientCnpj}</p>}
                    </div>
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase">Data da Missão</p>
                      <p className="text-sm font-bold text-neutral-700">{fmtDate(os.scheduledDate || os.createdAt)}</p>
                      {os.missionStartedAt && <p className="text-[10px] text-neutral-400">{fmtTime(os.missionStartedAt)} — {os.completedDate ? fmtTime(os.completedDate) : "em andamento"}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><User size={10} /> Agente(s)</p>
                      <p className="text-xs font-bold text-neutral-700">{os.employee1Name || "—"}</p>
                      {os.employee2Name && <p className="text-[10px] text-neutral-500">{os.employee2Name}</p>}
                    </div>
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><Car size={10} /> Viatura</p>
                      <p className="text-xs font-mono font-bold text-neutral-700">{os.vehiclePlate || "—"}</p>
                      {os.vehicleModel && <p className="text-[10px] text-neutral-500">{os.vehicleModel}</p>}
                    </div>
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><Shield size={10} /> Kit</p>
                      <p className="text-xs font-bold text-neutral-700">{os.kitName || "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><MapPin size={10} /> Origem</p>
                      <p className="text-xs font-bold text-neutral-700">{os.origin || "—"}</p>
                    </div>
                    <div className="bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><MapPin size={10} /> Destino</p>
                      <p className="text-xs font-bold text-neutral-700">{os.destination || "—"}</p>
                    </div>
                  </div>

                  {os.escortedVehiclePlate && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase flex items-center gap-1"><Truck size={10} /> Veículo Escoltado</p>
                        <p className="text-xs font-mono font-bold text-neutral-700">{os.escortedVehiclePlate}</p>
                      </div>
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">Motorista Escoltado</p>
                        <p className="text-xs font-bold text-neutral-700">{os.escortedDriverName || "—"}</p>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-neutral-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-1"><Clock size={12} /> KM e Horários da Missão</p>
                      {isDiretoria && !editingFields && !(b && ["APROVADA", "FATURADO", "PAGO"].includes(b.status)) && (
                        <button onClick={() => setEditingFields(true)} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors" data-testid="button-editar-campos">
                          <Pencil size={10} /> Editar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">KM Chegada Origem</p>
                        {editingFields ? (
                          <input type="number" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1" value={overrideKmChegada} onChange={e => setOverrideKmChegada(e.target.value)} data-testid="input-km-chegada-origem" />
                        ) : (
                          <p className="text-sm font-black font-mono text-neutral-800">{os.km_chegada_origem != null ? Number(os.km_chegada_origem).toLocaleString("pt-BR") : "—"}</p>
                        )}
                      </div>
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">KM Fim Missão</p>
                        {editingFields ? (
                          <input type="number" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1" value={overrideKmFim} onChange={e => setOverrideKmFim(e.target.value)} data-testid="input-km-fim-missao" />
                        ) : (
                          <p className="text-sm font-black font-mono text-neutral-800">{os.km_final != null ? Number(os.km_final).toLocaleString("pt-BR") : "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">Hora Chegada Origem</p>
                        {editingFields ? (
                          <input type="time" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1" value={overrideHoraChegada} onChange={e => setOverrideHoraChegada(e.target.value)} data-testid="input-hora-chegada-origem" />
                        ) : (
                          <p className="text-sm font-black font-mono text-neutral-800">{os.hora_chegada_origem ? fmtTime(os.hora_chegada_origem) : (os.scheduledDate ? `${fmtTime(os.scheduledDate)} (Agend.)` : "—")}</p>
                        )}
                      </div>
                      <div className="bg-neutral-50 p-3 rounded-xl">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">Hora Fim Missão</p>
                        {editingFields ? (
                          <input type="time" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1" value={overrideHoraFim} onChange={e => setOverrideHoraFim(e.target.value)} data-testid="input-hora-fim-missao" />
                        ) : (
                          <p className="text-sm font-black font-mono text-neutral-800">{os.hora_fim_missao ? fmtTime(os.hora_fim_missao) : "—"}</p>
                        )}
                      </div>
                    </div>

                    {editingFields && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            const payload: any = {};
                            if (overrideKmChegada !== (os.km_chegada_origem != null ? String(os.km_chegada_origem) : "")) {
                              payload.km_chegada_origem = Number(overrideKmChegada) || 0;
                            }
                            if (overrideKmFim !== (os.km_final != null ? String(os.km_final) : "")) {
                              payload.km_fim_missao = Number(overrideKmFim) || 0;
                            }
                            if (overrideHoraFim) {
                              const baseDate = os.completedDate || os.scheduledDate || new Date().toISOString();
                              const [hh, mm] = overrideHoraFim.split(":");
                              const d = new Date(baseDate);
                              d.setHours(Number(hh), Number(mm), 0, 0);
                              payload.completedDate = d.toISOString();
                            }
                            if (overrideHoraChegada) {
                              const baseDate = os.hora_chegada_origem || os.scheduledDate || new Date().toISOString();
                              const [hh, mm] = overrideHoraChegada.split(":");
                              const d = new Date(baseDate);
                              d.setHours(Number(hh), Number(mm), 0, 0);
                              payload.hora_chegada_origem = d.toISOString();
                            }
                            if (Object.keys(payload).length > 0) {
                              overrideMutation.mutate({ osId: os.id, data: payload });
                            } else {
                              setEditingFields(false);
                            }
                          }}
                          disabled={overrideMutation.isPending}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                          data-testid="button-salvar-override"
                        >
                          {overrideMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Salvar Alterações
                        </button>
                        <button
                          onClick={() => setEditingFields(false)}
                          className="px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl transition-colors"
                          data-testid="button-cancelar-override"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {b && (
                    <>
                      <div className="border-t border-neutral-100 pt-4">
                        <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Calculator size={12} /> Cálculo da Missão</p>
                      </div>

                      {b.horario_inicio_considerado && (
                        <div className={`p-3 rounded-xl border ${b.horario_agendado && b.horario_inicio && b.horario_inicio_considerado !== b.horario_agendado ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[9px] font-black text-neutral-500 uppercase">Horário para Cobrança</p>
                              <p className="text-lg font-black font-mono">{b.horario_inicio_considerado}</p>
                            </div>
                            <div className="text-right">
                              {b.horario_agendado && <p className="text-[9px] text-neutral-400">Agendado: <span className="font-mono font-bold">{b.horario_agendado}</span></p>}
                              {b.horario_inicio && <p className="text-[9px] text-neutral-400">Chegada Real: <span className="font-mono font-bold">{b.horario_inicio}</span></p>}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-blue-50 p-3 rounded-xl text-center">
                          <p className="text-[9px] font-black text-blue-600 uppercase">KM Total</p>
                          <p className="text-lg font-black font-mono text-blue-800">{Number(b.km_total || 0)}</p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl text-center">
                          <p className="text-[9px] font-black text-blue-600 uppercase">Franquia</p>
                          <p className="text-lg font-black font-mono text-blue-800">{Number(b.km_franquia || 0)}</p>
                        </div>
                        <div className={`p-3 rounded-xl text-center ${Number(b.km_excedente) > 0 ? "bg-red-50" : "bg-neutral-50"}`}>
                          <p className="text-[9px] font-black uppercase text-neutral-500">KM Excedente</p>
                          <p className={`text-lg font-black font-mono ${Number(b.km_excedente) > 0 ? "text-red-600" : "text-neutral-600"}`}>{Number(b.km_excedente || 0)}</p>
                        </div>
                        <div className="bg-neutral-50 p-3 rounded-xl text-center">
                          <p className="text-[9px] font-black text-neutral-500 uppercase">Horas</p>
                          <p className="text-lg font-black font-mono text-neutral-800">{fmtHoras(Number(b.horas_trabalhadas || b.horas_missao || 0))}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-green-50 p-3 rounded-xl text-center border border-green-100">
                          <p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p>
                          <p className="text-xl font-black font-mono text-green-700">{fmt(Number(b.fat_total))}</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-xl text-center border border-red-100">
                          <p className="text-[9px] font-black text-red-700 uppercase">Pag. Vigilante</p>
                          <p className="text-xl font-black font-mono text-red-700">{fmt(Number(b.pag_total))}</p>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-xl text-center border border-amber-100">
                          <p className="text-[9px] font-black text-amber-700 uppercase">Pedágio</p>
                          <p className="text-xl font-black font-mono text-amber-700">{fmt(Number(b.despesas_pedagio || 0))}</p>
                        </div>
                        <div className={`p-3 rounded-xl text-center border ${Number(b.resultado_liquido) >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                          <p className="text-[9px] font-black text-neutral-500 uppercase">Resultado</p>
                          <p className={`text-xl font-black font-mono ${Number(b.resultado_liquido) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.resultado_liquido))}</p>
                        </div>
                      </div>

                      {isPendente && (
                        <div className="space-y-3">
                          <div className="bg-neutral-50 p-3 rounded-xl">
                            <label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Pedágio (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold"
                              value={pedagioValue}
                              onChange={e => setPedagioValue(e.target.value)}
                              placeholder="0,00"
                              data-testid="input-pedagio"
                            />
                          </div>
                          <div className="bg-neutral-50 p-3 rounded-xl">
                            <label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Observações</label>
                            <textarea
                              className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold resize-none"
                              rows={3}
                              value={observacoesValue}
                              onChange={e => setObservacoesValue(e.target.value)}
                              placeholder="Observações sobre esta OS..."
                              data-testid="input-observacoes"
                            />
                          </div>
                          <button
                            onClick={() => b?.id && salvarBillingMutation.mutate({ billingId: b.id, observacoes: observacoesValue, pedagio: Number(pedagioValue) || 0 })}
                            disabled={salvarBillingMutation.isPending}
                            className="w-full bg-neutral-800 hover:bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            data-testid="button-salvar-billing"
                          >
                            {salvarBillingMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                            Salvar Alterações
                          </button>
                        </div>
                      )}

                      {!isPendente && ["APROVADA", "FATURADO", "PAGO"].includes(b.status) && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 p-3 rounded-xl">
                          <Lock size={14} className="text-green-700" />
                          <p className="text-[11px] font-black text-green-800 uppercase tracking-wide">Valores travados — Boletim aprovado por {b.revisado_por || "admin"}</p>
                        </div>
                      )}

                      {!isPendente && b.observacoes && (
                        <div className="bg-neutral-50 p-3 rounded-xl">
                          <p className="text-[9px] font-black text-neutral-400 uppercase">Observações</p>
                          <p className="text-xs font-bold text-neutral-700 whitespace-pre-wrap">{b.observacoes}</p>
                        </div>
                      )}

                      {b.revisado_por && (
                        <div className="bg-neutral-50 p-3 rounded-xl">
                          <p className="text-[9px] font-black text-neutral-400 uppercase">Revisado por</p>
                          <p className="text-xs font-bold text-neutral-700">{b.revisado_por} em {b.revisado_em ? new Date(b.revisado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</p>
                        </div>
                      )}

                      {b.motivo_rejeicao && (
                        <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                          <p className="text-[9px] font-black text-red-700 uppercase">Motivo da Rejeição</p>
                          <p className="text-xs font-bold text-red-800">{b.motivo_rejeicao}</p>
                        </div>
                      )}
                    </>
                  )}

                  {!b && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
                      <AlertTriangle size={24} className="mx-auto text-amber-500 mb-2" />
                      <p className="text-xs font-black text-amber-700 uppercase">OS sem cálculo de faturamento</p>
                      <p className="text-[10px] text-amber-600 mt-1">Esta OS foi concluída mas não possui dados de KM válidos para gerar o boletim automaticamente.</p>
                    </div>
                  )}

                  {b?.status === "REJEITADA" && (
                    <div className="pt-2">
                      <button
                        onClick={() => { calcularMutation.mutate(os.id); setSelectedOs(null); }}
                        disabled={calcularMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        data-testid="button-recalcular-rejeitada"
                      >
                        {calcularMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                        Recalcular Billing
                      </button>
                    </div>
                  )}

                  {isPendente && (
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => b?.id && aprovarMutation.mutate(b.id)}
                        disabled={aprovarMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        data-testid="button-aprovar-os"
                      >
                        {aprovarMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Aprovar OS
                      </button>
                      <button
                        onClick={() => {
                          const motivo = prompt("Motivo da rejeição:");
                          if (!motivo || !b?.id) return;
                          rejeitarMutation.mutate({ billingId: b.id, motivo });
                        }}
                        disabled={rejeitarMutation.isPending}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        data-testid="button-rejeitar-os"
                      >
                        {rejeitarMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                        Solicitar Correção
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AdminLayout>
  );
}
