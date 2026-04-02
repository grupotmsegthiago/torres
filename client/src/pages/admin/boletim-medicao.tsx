import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, authFetch, invalidateRelatedQueries } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText, CheckCircle2, X, AlertTriangle, Clock, MapPin,
  Loader2, Eye, ChevronDown, ChevronRight, Truck, Shield,
  Car, User, Calculator, Lock, Pencil, RotateCcw, Navigation,
  Hash, Calendar, Route, Gauge, DollarSign, ArrowRight,
  CircleDot, Timer,
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

const computeKm = (os: any) => {
  const b = os.billing;
  const kmChegada = Number(os.km_chegada_origem || os.km_inicial || b?.km_inicial || 0);
  const kmFim = Number(os.km_final || b?.km_final || 0);
  return Math.max(0, kmFim - kmChegada);
};

type StatusFilter = "ALL" | "EM_ANDAMENTO" | "PENDENTE" | "APROVADA" | "REJEITADA";

export default function BoletimMedicaoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";
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
  const [periodFilter, setPeriodFilter] = useState<string | null>(null);

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

  const invalidateAllRelated = () => {
    invalidateRelatedQueries("billing");
  };

  const aprovarMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "APROVADA" });
    },
    onSuccess: () => {
      invalidateAllRelated();
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
      invalidateAllRelated();
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
      invalidateAllRelated();
      toast({ title: "Cálculo realizado", description: "Billing gerado com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro ao calcular", description: err.message, variant: "destructive" }),
  });

  const reabrirMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/reabrir`);
    },
    onSuccess: () => {
      invalidateAllRelated();
      toast({ title: "Reaberta", description: "OS voltou para 'A Verificar'. Agora pode ser editada." });
    },
    onError: (err: Error) => toast({ title: "Erro ao reabrir", description: err.message, variant: "destructive" }),
  });

  const salvarBillingMutation = useMutation({
    mutationFn: async ({ billingId, observacoes, pedagio }: { billingId: string; observacoes: string; pedagio: number }) => {
      return apiRequest("PATCH", `/api/escort/billings/${billingId}/salvar`, { observacoes, despesas_pedagio: pedagio });
    },
    onSuccess: () => {
      invalidateAllRelated();
      toast({ title: "Salvo", description: "Observações e pedágio salvos com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ osId, data }: { osId: number; data: any }) => {
      return apiRequest("PATCH", `/api/boletim-medicao/os/${osId}/diretoria-override`, data);
    },
    onSuccess: () => {
      invalidateAllRelated();
      setEditingFields(false);
      toast({ title: "Atualizado", description: "Campos alterados e billing recalculado." });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (selectedOs && osConcluidas.length > 0) {
      const fresh = osConcluidas.find((o: any) => o.id === selectedOs.id);
      if (fresh && fresh !== selectedOs) {
        setSelectedOs(fresh);
        return;
      }
    }
  }, [osConcluidas]);

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

  const clientGroups: Record<number, { clientName: string; clientCnpj: string | null; orders: any[] }> = {};
  osConcluidas.forEach(os => {
    const cid = os.clientId || 0;
    if (!clientGroups[cid]) clientGroups[cid] = { clientName: os.clientName || "Sem Cliente", clientCnpj: os.clientCnpj || null, orders: [] };
    clientGroups[cid].orders.push(os);
  });

  const getPeriodRange = (period: string) => {
    const now = new Date();
    const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (period === "hoje") {
      const s = startOfDay(brNow);
      return { start: s, end: new Date(s.getTime() + 86400000) };
    }
    if (period === "semana") {
      const dow = brNow.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      const s = new Date(startOfDay(brNow).getTime() - diff * 86400000);
      return { start: s, end: new Date(s.getTime() + 7 * 86400000) };
    }
    if (period === "mes") {
      return { start: new Date(brNow.getFullYear(), brNow.getMonth(), 1), end: new Date(brNow.getFullYear(), brNow.getMonth() + 1, 1) };
    }
    return { start: new Date(brNow.getFullYear(), 0, 1), end: new Date(brNow.getFullYear() + 1, 0, 1) };
  };

  const filteredGroups = Object.entries(clientGroups).map(([cid, group]) => {
    let orders = group.orders;
    if (statusFilter === "EM_ANDAMENTO") orders = orders.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada");
    else if (statusFilter === "PENDENTE") orders = orders.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR");
    else if (statusFilter === "APROVADA") orders = orders.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado);
    else if (statusFilter === "REJEITADA") orders = orders.filter(o => o.billing?.status === "REJEITADA");
    if (periodFilter) {
      const { start, end } = getPeriodRange(periodFilter);
      orders = orders.filter(o => {
        const d = o.scheduledDate ? new Date(o.scheduledDate) : o.createdAt ? new Date(o.createdAt) : null;
        return d && d >= start && d < end;
      });
    }
    if (orders.length === 0) return null;
    return { clientId: Number(cid), clientName: group.clientName, clientCnpj: group.clientCnpj, orders };
  }).filter(Boolean) as { clientId: number; clientName: string; clientCnpj: string | null; orders: any[] }[];

  const totalOs = osConcluidas.length;
  const liveCount = osConcluidas.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada").length;
  const pendingCount = osConcluidas.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR").length;
  const approvedCount = osConcluidas.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado).length;
  const totalFaturamento = osConcluidas.reduce((acc, o) => {
    const b = o.billing;
    return acc + Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.despesas_pedagio || 0);
  }, 0);

  const getBillingStatus = (os: any) => {
    if (!os.billing) return { label: "Sem Cálculo", color: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" };
    switch (os.billing.status) {
      case "ESTIMATIVA": return { label: "Estimativa", color: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-500" };
      case "A_VERIFICAR": return { label: "A Verificar", color: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-500" };
      case "APROVADA": return { label: "Aprovada", color: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" };
      case "REJEITADA": return { label: "Rejeitada", color: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" };
      case "CALCULADO": return { label: "Calculado", color: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-500" };
      case "FATURADO": return { label: "Faturado", color: "bg-indigo-50 text-indigo-700 border border-indigo-200", dot: "bg-indigo-500" };
      case "CANCELADO": return { label: "Cancelada", color: "bg-red-600 text-white", dot: "bg-red-300" };
      default: return { label: os.billing.status, color: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" };
    }
  };

  const isLiveOs = (os: any) => (os.status === "em_andamento" || (os.status === "agendada" && os.missionStartedAt)) && os.missionStatus !== "encerrada";

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-boletim-medicao">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="heading-boletim">Boletim de Medição</h1>
            <p className="text-xs text-neutral-400 font-semibold mt-1">Verificação e aprovação de faturamento das ordens de serviço</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-neutral-200 rounded-xl p-4" data-testid="stat-total">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><FileText size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total OS</span>
            </div>
            <p className="text-2xl font-black text-neutral-900 mt-1">{totalOs}</p>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4" data-testid="stat-pendentes">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><AlertTriangle size={14} className="text-amber-600" /></div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pendentes</span>
            </div>
            <p className="text-2xl font-black text-amber-700 mt-1">{pendingCount}</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl p-4" data-testid="stat-aprovadas">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-600" /></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Aprovadas</span>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-1">{approvedCount}</p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl p-4" data-testid="stat-faturamento">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><DollarSign size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Faturamento</span>
            </div>
            <p className="text-lg font-black text-neutral-900 mt-1">{fmt(totalFaturamento)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-status">
          {([["ALL", "Todas"], ["EM_ANDAMENTO", `Em Andamento (${liveCount})`], ["PENDENTE", "A Verificar"], ["APROVADA", "Aprovadas"], ["REJEITADA", "Rejeitadas"]] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === val ? "bg-neutral-900 text-white shadow-sm" : "bg-white text-neutral-500 hover:bg-neutral-100 border border-neutral-200"
              }`}
              data-testid={`filter-${val.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
          <div className="h-6 w-px bg-neutral-200 mx-1" />
          <select
            value={periodFilter || ""}
            onChange={e => setPeriodFilter(e.target.value || null)}
            className="text-xs font-bold border border-neutral-200 rounded-lg px-3 py-2 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10 uppercase tracking-wider"
            data-testid="filter-period-boletim"
          >
            <option value="">Período</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Esta Semana</option>
            <option value="mes">Este Mês</option>
            <option value="ano">Este Ano</option>
          </select>
          {periodFilter && (
            <button
              onClick={() => setPeriodFilter(null)}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
              data-testid="button-clear-period"
            >
              <RotateCcw className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-neutral-300" /></div>
        ) : filteredGroups.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
            <FileText size={48} className="mx-auto text-neutral-200 mb-4" />
            <p className="text-sm font-black text-neutral-400 uppercase">Nenhuma OS encontrada</p>
            <p className="text-xs text-neutral-300 mt-1">As OS em andamento e finalizadas aparecerão aqui para verificação</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => {
              const isExpanded = expandedClient === group.clientId;
              const groupPending = group.orders.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR").length;
              const groupApproved = group.orders.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado).length;
              const groupTotal = group.orders.reduce((acc, o) => acc + Number(o.billing?.fat_acionamento || 0) + Number(o.billing?.fat_hora_extra || 0) + Number(o.billing?.fat_km || 0) + Number(o.billing?.despesas_pedagio || 0), 0);

              return (
                <div key={group.clientId} className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm" data-testid={`client-group-${group.clientId}`}>
                  <button
                    onClick={() => setExpandedClient(isExpanded ? null : group.clientId)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-neutral-50/50 transition-colors"
                    data-testid={`toggle-client-${group.clientId}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center flex-shrink-0">
                        {isExpanded ? <ChevronDown size={18} className="text-white" /> : <ChevronRight size={18} className="text-white" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-neutral-900 uppercase tracking-wider">{group.clientName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-neutral-400 font-semibold">{group.orders.length} OS</span>
                          <span className="text-[10px] text-neutral-300">|</span>
                          <span className="text-[10px] font-bold text-neutral-500">Faturamento: <span className="text-emerald-600">{fmt(groupTotal)}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {groupPending > 0 && <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">{groupPending} pendente{groupPending > 1 ? "s" : ""}</Badge>}
                      {groupApproved > 0 && <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">{groupApproved} aprovada{groupApproved > 1 ? "s" : ""}</Badge>}
                      {group.orders[0]?.hasContract ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">Tabela Cadastrada</Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">Sem Tabela</Badge>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-neutral-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" data-testid={`table-os-${group.clientId}`}>
                          <thead>
                            <tr className="bg-neutral-50/80">
                              <th className="text-left px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">OS</th>
                              <th className="text-left px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Data</th>
                              <th className="text-left px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Rota</th>
                              <th className="text-left px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Agente</th>
                              <th className="text-left px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Viatura</th>
                              <th className="text-right px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">KM</th>
                              <th className="text-right px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Horas</th>
                              <th className="text-right px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Valor</th>
                              <th className="text-center px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Status</th>
                              <th className="text-center px-4 py-3 font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.orders.map((os: any) => {
                              const status = getBillingStatus(os);
                              const b = os.billing;
                              const kmTotal = computeKm(os);
                              return (
                                <tr key={os.id} className={`border-b hover:bg-neutral-50/50 transition-colors ${os.status === "cancelada" ? "bg-red-50/30" : ""}`} data-testid={`row-os-${os.id}`}>
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-black text-neutral-800 text-[13px]">{os.osNumber}</span>
                                      {isLiveOs(os) && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Em andamento" />}
                                    </div>
                                    {b?.boletim_numero && <p className="text-[9px] text-blue-600 font-mono font-bold mt-0.5">{b.boletim_numero}</p>}
                                    {isLiveOs(os) && <p className="text-[9px] text-green-600 font-bold mt-0.5">EM ANDAMENTO</p>}
                                    {os.status === "cancelada" && <p className="text-[9px] text-red-600 font-bold mt-0.5">{b?.observacoes ? b.observacoes.split("|")[0].trim() : "Cancelada"}</p>}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="font-semibold text-neutral-700">{fmtDate(os.scheduledDate || os.createdAt)}</span>
                                    {os.missionStartedAt && <p className="text-[9px] text-neutral-400 mt-0.5">{fmtTime(os.missionStartedAt)} — {os.completedDate ? fmtTime(os.completedDate) : <span className="text-green-600 font-bold">em andamento</span>}</p>}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <div className="max-w-[160px]">
                                      {os.origin && <p className="text-[10px] font-semibold text-neutral-600 truncate">{os.origin}</p>}
                                      {os.destination && <p className="text-[10px] text-neutral-400 truncate flex items-center gap-0.5"><ArrowRight size={8} className="flex-shrink-0" /> {os.destination}</p>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="font-semibold text-neutral-700">{os.employee1Name || "—"}</span>
                                    {os.employee2Name && <p className="text-[9px] text-neutral-400">{os.employee2Name}</p>}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="font-mono font-bold text-neutral-600">{os.vehiclePlate || "—"}</span>
                                    {os.escortedVehiclePlate && <p className="text-[9px] text-neutral-400">Escolt: {os.escortedVehiclePlate}</p>}
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <span className={`font-mono font-black text-[13px] ${kmTotal > 0 ? "text-neutral-900" : "text-neutral-300"}`}>{kmTotal > 0 ? kmTotal.toLocaleString("pt-BR") : "—"}</span>
                                    {kmTotal > 0 && <span className="text-neutral-400 text-[10px] ml-0.5">km</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <span className="font-mono font-bold text-neutral-700">{b ? fmtHoras(Number(b.horas_trabalhadas || b.horas_missao || 0)) : "—"}</span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <span className="font-mono font-black text-emerald-700">{b ? fmt(Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.despesas_pedagio || 0)) : "—"}</span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold ${status.color}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                      {status.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {(!b || isLiveOs(os) || b?.status === "REJEITADA") && (
                                        <button
                                          onClick={() => calcularMutation.mutate(os.id)}
                                          disabled={calcularMutation.isPending}
                                          className="p-1.5 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"
                                          title={b?.status === "REJEITADA" ? "Recalcular (Rejeitada)" : b && isLiveOs(os) ? "Recalcular Estimativa" : "Calcular Billing"}
                                          data-testid={`button-calc-os-${os.id}`}
                                        >
                                          <Calculator size={15} className={b?.status === "REJEITADA" ? "text-red-500" : isLiveOs(os) && b ? "text-green-500" : "text-blue-500"} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => { setSelectedOs(os); setPedagioValue(b?.despesas_pedagio || (os as any).pedagioEstimado || "0"); setObservacoesValue(b?.observacoes || ""); }}
                                        className="p-1.5 rounded-lg hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-all"
                                        data-testid={`button-view-os-${os.id}`}
                                      >
                                        <Eye size={15} className="text-neutral-500" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-neutral-50/80">
                              <td colSpan={7} className="px-4 py-3 text-right font-bold text-neutral-400 uppercase text-[10px] tracking-wider">Total do Cliente:</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-emerald-700 text-sm">{fmt(groupTotal)}</td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedOs && <OsDetailModal os={selectedOs} onClose={() => setSelectedOs(null)} isDiretoria={isDiretoria} editingFields={editingFields} setEditingFields={setEditingFields} overrideKmChegada={overrideKmChegada} setOverrideKmChegada={setOverrideKmChegada} overrideKmFim={overrideKmFim} setOverrideKmFim={setOverrideKmFim} overrideHoraChegada={overrideHoraChegada} setOverrideHoraChegada={setOverrideHoraChegada} overrideHoraFim={overrideHoraFim} setOverrideHoraFim={setOverrideHoraFim} overrideMutation={overrideMutation} calcularMutation={calcularMutation} aprovarMutation={aprovarMutation} rejeitarMutation={rejeitarMutation} reabrirMutation={reabrirMutation} salvarBillingMutation={salvarBillingMutation} pedagioValue={pedagioValue} setPedagioValue={setPedagioValue} observacoesValue={observacoesValue} setObservacoesValue={setObservacoesValue} getBillingStatus={getBillingStatus} isLiveOs={isLiveOs} />}
      </div>
    </AdminLayout>
  );
}

function OsDetailModal({ os, onClose, isDiretoria, editingFields, setEditingFields, overrideKmChegada, setOverrideKmChegada, overrideKmFim, setOverrideKmFim, overrideHoraChegada, setOverrideHoraChegada, overrideHoraFim, setOverrideHoraFim, overrideMutation, calcularMutation, aprovarMutation, rejeitarMutation, reabrirMutation, salvarBillingMutation, pedagioValue, setPedagioValue, observacoesValue, setObservacoesValue, getBillingStatus, isLiveOs }: any) {
  const b = os.billing;
  const status = getBillingStatus(os);
  const isPendente = b?.status === "A_VERIFICAR";
  const isApproved = b && ["APROVADA", "FATURADO", "PAGO"].includes(b.status);

  const kmChegada = Number(os.km_chegada_origem || os.km_inicial || b?.km_inicial || 0);
  const kmFim = Number(os.km_final || b?.km_final || 0);
  const kmTotalCalc = Math.max(0, kmFim - kmChegada);
  const franquia = Number(b?.km_franquia || 0);
  const kmExcCalc = Math.max(0, kmTotalCalc - franquia);

  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const fmtToHHMM = (v: string | null) => {
    if (!v) return null;
    try { return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).split(" ").pop() || null; } catch { return null; }
  };
  const ini = b?.horario_inicio_considerado || b?.horario_inicio;
  const fimReal = fmtToHHMM(os.hora_fim_missao) || b?.horario_fim;

  const billingInicio = b?.horario_inicio_considerado || b?.horario_inicio;
  const billingFim = fmtToHHMM(os.hora_fim_missao) || b?.horario_fim;
  let hCalc = Number(b?.horas_trabalhadas || b?.horas_missao || 0);
  if (billingInicio && billingFim) {
    let diff = toMin(billingFim) - toMin(billingInicio);
    if (diff < 0) diff += 24 * 60;
    hCalc = Math.round((diff / 60) * 100) / 100;
  }

  const acionamento = Number(b?.fat_acionamento || 0);
  const horaExtra = Number(b?.fat_hora_extra || 0);
  const kmExtraVal = Number(b?.fat_km || 0);
  const pedagio = Number(b?.despesas_pedagio || 0) || Number((os as any).pedagioEstimado || 0);
  const resultado = acionamento + horaExtra + kmExtraVal + pedagio;

  const schedTime = os.scheduledDate ? fmtTime(os.scheduledDate) : null;
  const startTime = os.missionStartedAt ? fmtTime(os.missionStartedAt) : null;
  const endTime = os.completedDate ? fmtTime(os.completedDate) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-3" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e: any) => e.stopPropagation()} data-testid="modal-boletim-detalhe">
        <div className="bg-neutral-900 text-white px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Hash size={16} className="text-neutral-400" />
                <h3 className="text-lg font-black tracking-wider uppercase">OS {os.osNumber}</h3>
              </div>
              {b?.boletim_numero && <p className="text-[11px] font-mono text-neutral-400 mt-1">{b.boletim_numero}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black ${
                isApproved ? "bg-emerald-500 text-white" : isPendente ? "bg-amber-400 text-neutral-900" : b?.status === "REJEITADA" ? "bg-red-500 text-white" : "bg-white/20 text-white"
              }`}>
                {isApproved && <CheckCircle2 size={12} />}
                {status.label}
              </span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X size={18} /></button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1"><User size={12} /> {os.clientName}</span>
            <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(os.scheduledDate || os.createdAt)}</span>
            {startTime && <span className="flex items-center gap-1"><Clock size={12} /> {startTime}{endTime ? ` — ${endTime}` : " (em andamento)"}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <InfoCard icon={<User size={13} />} label="Agente(s)" value={os.employee1Name || "—"} sub={os.employee2Name} />
              <InfoCard icon={<Car size={13} />} label="Viatura" value={os.vehiclePlate || "—"} sub={os.vehicleModel} mono />
              <InfoCard icon={<Shield size={13} />} label="Kit" value={os.kitName || "—"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                <CircleDot size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase">Origem</p>
                  <p className="text-xs font-semibold text-neutral-800 leading-snug mt-0.5">{os.origin || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                <MapPin size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase">Destino</p>
                  <p className="text-xs font-semibold text-neutral-800 leading-snug mt-0.5">{os.destination || "—"}</p>
                </div>
              </div>
            </div>

            {os.escortedVehiclePlate && (
              <div className="grid grid-cols-2 gap-3">
                <InfoCard icon={<Truck size={13} />} label="Veículo Escoltado" value={os.escortedVehiclePlate} mono />
                <InfoCard icon={<User size={13} />} label="Motorista Escoltado" value={os.escortedDriverName || "—"} />
              </div>
            )}

            {os.contractName && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                <FileText size={14} className="text-amber-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-amber-500 uppercase">Tabela de Preços</p>
                  <p className="text-xs font-bold text-amber-800 mt-0.5">{os.contractName}</p>
                </div>
              </div>
            )}

            <div className="border-t border-neutral-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={<Gauge size={14} />} title="KM e Horários" />
                {isDiretoria && !editingFields && !(b && ["APROVADA", "FATURADO", "PAGO"].includes(b.status)) && (
                  <button onClick={() => setEditingFields(true)} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50" data-testid="button-editar-campos">
                    <Pencil size={10} /> Editar
                  </button>
                )}
              </div>

              {editingFields ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">KM Chegada Origem</p>
                      <input type="number" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideKmChegada} onChange={(e: any) => setOverrideKmChegada(e.target.value)} data-testid="input-km-chegada-origem" />
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">KM Fim Missão</p>
                      <input type="number" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideKmFim} onChange={(e: any) => setOverrideKmFim(e.target.value)} data-testid="input-km-fim-missao" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">Hora Chegada Origem</p>
                      <input type="time" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideHoraChegada} onChange={(e: any) => setOverrideHoraChegada(e.target.value)} data-testid="input-hora-chegada-origem" />
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">Hora Fim Missão</p>
                      <input type="time" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideHoraFim} onChange={(e: any) => setOverrideHoraFim(e.target.value)} data-testid="input-hora-fim-missao" />
                    </div>
                  </div>
                  <div className="flex gap-2">
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
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs tracking-wider py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      data-testid="button-salvar-override"
                    >
                      {overrideMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Salvar Alterações
                    </button>
                    <button
                      onClick={() => setEditingFields(false)}
                      className="px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-bold text-xs rounded-xl transition-colors"
                      data-testid="button-cancelar-override"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 text-center">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">KM Chegada Origem</p>
                      <p className="text-lg font-black font-mono text-neutral-900 mt-0.5">{kmChegada > 0 ? kmChegada.toLocaleString("pt-BR") : "—"}</p>
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 text-center">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">KM Fim Missão</p>
                      <p className="text-lg font-black font-mono text-neutral-900 mt-0.5">{kmFim > 0 ? kmFim.toLocaleString("pt-BR") : "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                      <p className="text-[9px] font-bold text-blue-400 uppercase">Total KM Rodado</p>
                      <p className="text-lg font-black font-mono text-blue-800 mt-0.5">{kmTotalCalc > 0 ? kmTotalCalc.toLocaleString("pt-BR") : "—"} <span className="text-xs font-bold text-blue-500">km</span></p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 text-center">
                      <p className="text-[9px] font-bold text-purple-400 uppercase">Total Horas Missão</p>
                      <p className="text-lg font-black font-mono text-purple-800 mt-0.5">{hCalc > 0 ? `${Math.floor(hCalc)}h${String(Math.round((hCalc % 1) * 60)).padStart(2, "0")}min` : "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                      <p className="text-[9px] font-bold text-emerald-400 uppercase">Chegada na Origem</p>
                      <p className="text-lg font-black font-mono text-emerald-800 mt-0.5">{os.hora_chegada_origem ? fmtTime(os.hora_chegada_origem) : (schedTime || "—")}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
                      <p className="text-[9px] font-bold text-red-400 uppercase">Fim de Missão</p>
                      <p className="text-lg font-black font-mono text-red-800 mt-0.5">{os.hora_fim_missao ? fmtTime(os.hora_fim_missao) : (endTime || "—")}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {b && (
              <>
                <div className="border-t border-neutral-100 pt-4">
                  <SectionTitle icon={<Calculator size={14} />} title="Cálculo da Missão" />
                </div>

                {b.horario_inicio_considerado && (
                  <div className="bg-neutral-900 text-white rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Horário para Cobrança</p>
                      <p className="text-2xl font-black font-mono tracking-tight mt-0.5">{b.horario_inicio_considerado}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      {b.horario_agendado && <p className="text-[10px] text-neutral-400">Agendado: <span className="font-mono font-bold text-neutral-300">{b.horario_agendado}</span></p>}
                      {b.horario_inicio && <p className="text-[10px] text-neutral-400">Chegada Real: <span className="font-mono font-bold text-neutral-300">{b.horario_inicio}</span></p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <MetricCard label="KM Total" value={String(kmTotalCalc)} accent="blue" />
                  <MetricCard label="Franquia" value={String(franquia)} accent="neutral" />
                  <MetricCard label="KM Excedente" value={String(kmExcCalc)} accent={kmExcCalc > 0 ? "red" : "neutral"} />
                  <MetricCard label="Horas" value={fmtHoras(hCalc)} accent="neutral" />
                </div>

                <div className={`grid gap-2 ${[acionamento, horaExtra, kmExtraVal, pedagio].filter(v => v > 0 || v === acionamento).length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  <ValueCard label="Acionamento" value={fmt(acionamento)} color="blue" />
                  {horaExtra > 0 && <ValueCard label="Hora Extra" value={fmt(horaExtra)} color="amber" />}
                  {kmExtraVal > 0 && <ValueCard label="KM Excedente" value={fmt(kmExtraVal)} color="violet" />}
                  <ValueCard label="Pedágio" value={fmt(pedagio)} color="neutral" />
                </div>

                <div className={`rounded-xl p-4 text-center border-2 ${resultado >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Resultado</p>
                  <p className={`text-3xl font-black font-mono ${resultado >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(resultado)}</p>
                </div>

                {isPendente && (
                  <div className="space-y-3 border-t border-neutral-100 pt-4">
                    <SectionTitle icon={<Pencil size={14} />} title="Ajustes" />
                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase mb-1.5 block">Pedágio (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full p-2.5 border border-neutral-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-neutral-50"
                        value={pedagioValue}
                        onChange={(e: any) => setPedagioValue(e.target.value)}
                        placeholder="0,00"
                        data-testid="input-pedagio"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase mb-1.5 block">Observações</label>
                      <textarea
                        className="w-full p-2.5 border border-neutral-200 rounded-xl text-sm font-semibold resize-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-neutral-50"
                        rows={3}
                        value={observacoesValue}
                        onChange={(e: any) => setObservacoesValue(e.target.value)}
                        placeholder="Observações sobre esta OS..."
                        data-testid="input-observacoes"
                      />
                    </div>
                    <button
                      onClick={() => b?.id && salvarBillingMutation.mutate({ billingId: b.id, observacoes: observacoesValue, pedagio: Number(pedagioValue) || 0 })}
                      disabled={salvarBillingMutation.isPending}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold uppercase text-xs tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      data-testid="button-salvar-billing"
                    >
                      {salvarBillingMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      Salvar Alterações
                    </button>
                  </div>
                )}

                {isApproved && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
                      <Lock size={14} className="text-emerald-600 flex-shrink-0" />
                      <p className="text-[11px] font-bold text-emerald-700">Valores travados — Boletim aprovado por {b.revisado_por || "admin"}</p>
                    </div>
                    {isDiretoria && b.status === "APROVADA" && (
                      <button
                        onClick={() => { if (confirm("Tem certeza que deseja reabrir esta OS? Ela voltará para 'A Verificar' e poderá ser editada.")) reabrirMutation.mutate(b.id); }}
                        disabled={reabrirMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                        data-testid="button-reabrir-os"
                      >
                        {reabrirMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Reabrir para Revisão
                      </button>
                    )}
                  </div>
                )}

                {!isPendente && b.observacoes && (
                  <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                    <p className="text-[9px] font-bold text-neutral-400 uppercase mb-1">Observações</p>
                    <p className="text-xs font-semibold text-neutral-700 whitespace-pre-wrap leading-relaxed">{b.observacoes}</p>
                  </div>
                )}

                {b.revisado_por && (
                  <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                    <p className="text-[9px] font-bold text-neutral-400 uppercase mb-1">Revisado por</p>
                    <p className="text-xs font-semibold text-neutral-700">{b.revisado_por} em {b.revisado_em ? new Date(b.revisado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</p>
                  </div>
                )}

                {b.motivo_rejeicao && (
                  <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                    <p className="text-[9px] font-bold text-red-600 uppercase mb-1">Motivo da Rejeição</p>
                    <p className="text-xs font-semibold text-red-800">{b.motivo_rejeicao}</p>
                  </div>
                )}
              </>
            )}

            {!b && (
              <div className="bg-amber-50 p-5 rounded-xl border border-amber-200 text-center">
                <AlertTriangle size={28} className="mx-auto text-amber-400 mb-2" />
                <p className="text-xs font-bold text-amber-700 uppercase">OS sem cálculo de faturamento</p>
                <p className="text-[10px] text-amber-600 mt-1">Esta OS foi concluída mas não possui dados de KM válidos para gerar o boletim automaticamente.</p>
              </div>
            )}
          </div>
        </div>

        {(isPendente || (b?.status === "REJEITADA") || (b?.status === "A_VERIFICAR")) && (
          <div className="flex-shrink-0 border-t border-neutral-100 bg-neutral-50 p-4">
            {(b?.status === "REJEITADA" || b?.status === "A_VERIFICAR") && !isPendente && (
              <button
                onClick={() => { calcularMutation.mutate(os.id); onClose(); }}
                disabled={calcularMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                data-testid="button-recalcular-rejeitada"
              >
                {calcularMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                Recalcular Billing
              </button>
            )}
            {isPendente && (
              <div className="flex gap-3">
                <button
                  onClick={() => b?.id && aprovarMutation.mutate(b.id)}
                  disabled={aprovarMutation.isPending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase text-xs tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  data-testid="button-aprovar-os"
                >
                  {aprovarMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Aprovar
                </button>
                <button
                  onClick={() => {
                    const motivo = prompt("Motivo da rejeição:");
                    if (!motivo || !b?.id) return;
                    rejeitarMutation.mutate({ billingId: b.id, motivo });
                  }}
                  disabled={rejeitarMutation.isPending}
                  className="flex-1 bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 font-bold uppercase text-xs tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  data-testid="button-rejeitar-os"
                >
                  {rejeitarMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Rejeitar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, sub, mono }: { icon: any; label: string; value: string; sub?: string | null; mono?: boolean }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
      <p className="text-[9px] font-bold text-neutral-400 uppercase flex items-center gap-1 mb-1">{icon} {label}</p>
      <p className={`text-xs font-bold text-neutral-800 ${mono ? "font-mono" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center text-white">{icon}</div>
      <p className="text-[11px] font-black text-neutral-700 uppercase tracking-wider">{title}</p>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: "blue" | "red" | "neutral" }) {
  const colors = {
    blue: "bg-blue-50 border-blue-100 text-blue-800",
    red: "bg-red-50 border-red-100 text-red-700",
    neutral: "bg-neutral-50 border-neutral-100 text-neutral-800",
  };
  const labelColors = {
    blue: "text-blue-500",
    red: "text-red-500",
    neutral: "text-neutral-400",
  };
  return (
    <div className={`rounded-xl p-3 text-center border ${colors[accent]}`}>
      <p className={`text-[8px] font-bold uppercase tracking-wider ${labelColors[accent]}`}>{label}</p>
      <p className="text-xl font-black font-mono mt-0.5">{value}</p>
    </div>
  );
}

function ValueCard({ label, value, color }: { label: string; value: string; color: "blue" | "amber" | "violet" | "neutral" }) {
  const styles: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    neutral: "bg-neutral-50 border-neutral-200 text-neutral-700",
  };
  return (
    <div className={`rounded-xl p-3 text-center border ${styles[color]}`}>
      <p className="text-[9px] font-bold uppercase">{label}</p>
      <p className="text-lg font-black font-mono mt-0.5">{value}</p>
    </div>
  );
}
