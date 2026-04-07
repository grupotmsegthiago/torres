import { useState, useEffect, Fragment } from "react";
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
  CircleDot, Timer, Receipt, Banknote,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

type StatusFilter = "ALL" | "EM_ANDAMENTO" | "PENDENTE" | "APROVADA" | "REJEITADA" | "FORA_CICLO" | "FATURADA";

export default function BoletimMedicaoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [selectedOs, setSelectedOs] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && ["ALL", "EM_ANDAMENTO", "PENDENTE", "APROVADA", "REJEITADA", "FORA_CICLO", "FATURADA"].includes(s)) return s as StatusFilter;
    return "PENDENTE";
  });
  const [checkedOsIds, setCheckedOsIds] = useState<Set<number>>(new Set());
  const [aprovarFaturarDialog, setAprovarFaturarDialog] = useState<{ clientId: number; clientName: string; osIds: number[]; billingIds: string[]; total: number } | null>(null);
  const [pedagioValue, setPedagioValue] = useState("");
  const [observacoesValue, setObservacoesValue] = useState("");
  const [editingFields, setEditingFields] = useState(false);
  const [overrideKmChegada, setOverrideKmChegada] = useState("");
  const [overrideKmFim, setOverrideKmFim] = useState("");
  const [overrideHoraChegada, setOverrideHoraChegada] = useState("");
  const [overrideHoraFim, setOverrideHoraFim] = useState("");
  const [periodFilter, setPeriodFilter] = useState<string | null>(null);
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);
  const [editBilling, setEditBilling] = useState<{
    km_inicial: string; km_final: string; fat_acionamento: string;
    despesas_pedagio: string; horario_inicio: string; horario_termino: string;
    receitas_os: string;
  }>({ km_inicial: "", km_final: "", fat_acionamento: "", despesas_pedagio: "", horario_inicio: "", horario_termino: "", receitas_os: "" });
  const [faturaDialog, setFaturaDialog] = useState<{ clientId: number; clientName: string; approvedCount: number; total: number; billingIds: string[] } | null>(null);
  const [faturaBillingType, setFaturaBillingType] = useState("BOLETO");
  const [faturaDueDate, setFaturaDueDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(15);
    return d.toISOString().split("T")[0];
  });
  const [faturaSendAsaas, setFaturaSendAsaas] = useState(false);

  const { data: billingAlerts = [] } = useQuery<any[]>({
    queryKey: ["/api/billing-alerts"],
    queryFn: async () => {
      const r = await authFetch("/api/billing-alerts?resolved=false");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    refetchInterval: 60000,
  });

  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: number) => {
      return apiRequest("PATCH", `/api/billing-alerts/${alertId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-alerts"] });
      toast({ title: "Alerta resolvido" });
    },
  });

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

  const salvarMedicaoMutation = useMutation({
    mutationFn: async (payload: { billingId: string; [key: string]: any }) => {
      const { billingId, ...data } = payload;
      return apiRequest("PATCH", `/api/escort/billings/${billingId}/salvar`, { ...data, recalcular: true });
    },
    onSuccess: () => {
      invalidateAllRelated();
      toast({ title: "Medição Salva", description: "Valores recalculados e salvos no banco." });
      setEditingBillingId(null);
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar medição", description: err.message, variant: "destructive" }),
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

  const gerarFaturaMutation = useMutation({
    mutationFn: async ({ clientId, billingType, sendToAsaas, dueDate }: { clientId: number; billingType: string; sendToAsaas: boolean; dueDate: string }) => {
      return apiRequest("POST", `/api/boletim-medicao/gerar-fatura/${clientId}`, { billingType, sendToAsaas, dueDate });
    },
    onSuccess: async (response: any) => {
      invalidateAllRelated();
      const data = await response.json?.() || response;
      const count = data?.missionsCount || 0;
      const val = data?.totalValue ? fmt(data.totalValue) : "";
      toast({ title: "Fatura Gerada!", description: `${count} missão(ões) consolidada(s). ${val}` });
      setFaturaDialog(null);
    },
    onError: (err: Error) => toast({ title: "Erro ao gerar fatura", description: err.message, variant: "destructive" }),
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
    else if (statusFilter === "FATURADA") orders = orders.filter(o => o.billing?.status === "FATURADO" || o.billing?.status === "PAGO");
    else if (statusFilter === "REJEITADA") orders = orders.filter(o => o.billing?.status === "REJEITADA");
    else if (statusFilter === "FORA_CICLO") {
      orders = orders.filter(o => {
        if (!o.clientBillingCycle || o.clientBillingCycle === "por_missao") return false;
        const bStatus = o.billing?.status;
        if (bStatus === "FATURADO" || bStatus === "PAGO") return false;
        if (!o.billing?.data_missao && !o.completedDate) return false;
        const mDate = new Date(o.billing?.data_missao || o.completedDate);
        const daysSince = Math.floor((Date.now() - mDate.getTime()) / (1000 * 60 * 60 * 24));
        const prazoAprovacao = Number(o.clientPrazoAprovacaoDias) || 10;
        return daysSince > prazoAprovacao;
      });
    }
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
  const foraCicloCount = osConcluidas.filter(o => {
    if (!o.clientBillingCycle || o.clientBillingCycle === "por_missao") return false;
    const bStatus = o.billing?.status;
    if (bStatus === "FATURADO" || bStatus === "PAGO") return false;
    if (!o.billing?.data_missao && !o.completedDate) return false;
    const mDate = new Date(o.billing?.data_missao || o.completedDate);
    const daysSince = Math.floor((Date.now() - mDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > (Number(o.clientPrazoAprovacaoDias) || 10);
  }).length;
  const totalFaturamento = osConcluidas.reduce((acc, o) => {
    const b = o.billing;
    return acc + Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.despesas_pedagio || 0) + Number(b?.receitas_os || 0);
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
          <button onClick={() => setStatusFilter("ALL")} className={`text-left bg-white border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${statusFilter === "ALL" ? "ring-2 ring-neutral-900 border-neutral-900" : "border-neutral-200"}`} data-testid="stat-total">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><FileText size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total OS</span>
            </div>
            <p className="text-2xl font-black text-neutral-900 mt-1">{totalOs}</p>
          </button>
          <button onClick={() => setStatusFilter("PENDENTE")} className={`text-left bg-white border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${statusFilter === "PENDENTE" ? "ring-2 ring-amber-500 border-amber-500" : "border-amber-200"}`} data-testid="stat-pendentes">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><AlertTriangle size={14} className="text-amber-600" /></div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pendentes</span>
            </div>
            <p className="text-2xl font-black text-amber-700 mt-1">{pendingCount}</p>
          </button>
          <button onClick={() => setStatusFilter("APROVADA")} className={`text-left bg-white border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${statusFilter === "APROVADA" ? "ring-2 ring-emerald-500 border-emerald-500" : "border-emerald-200"}`} data-testid="stat-aprovadas">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-600" /></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Aprovadas</span>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-1">{approvedCount}</p>
          </button>
          <button onClick={() => setStatusFilter("FATURADA")} className={`text-left bg-white border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${statusFilter === "FATURADA" ? "ring-2 ring-neutral-900 border-neutral-900" : "border-neutral-200"}`} data-testid="stat-faturamento">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><DollarSign size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Faturamento</span>
            </div>
            <p className="text-lg font-black text-neutral-900 mt-1">{fmt(totalFaturamento)}</p>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-status">
          {([["ALL", "Todas"], ["EM_ANDAMENTO", `Em Andamento (${liveCount})`], ["PENDENTE", "A Verificar"], ["APROVADA", "Aprovadas"], ["REJEITADA", "Rejeitadas"], ...(foraCicloCount > 0 ? [["FORA_CICLO", `⚠ Fora do Ciclo (${foraCicloCount})`]] : [])] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === val && val === "FORA_CICLO" ? "bg-red-600 text-white shadow-sm" : statusFilter === val ? "bg-neutral-900 text-white shadow-sm" : val === "FORA_CICLO" ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" : "bg-white text-neutral-500 hover:bg-neutral-100 border border-neutral-200"
              }`}
              data-testid={`filter-${val.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
          <div className="h-6 w-px bg-neutral-200 mx-1" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs font-bold border border-neutral-200 rounded-lg px-3 py-2 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10 uppercase tracking-wider"
            data-testid="filter-status-select"
          >
            <option value="ALL">Todas</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="APROVADA">Aprovadas</option>
            <option value="FATURADA">Faturadas</option>
          </select>
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

        {billingAlerts.length > 0 && (
          <div className="space-y-2 mb-4">
            {billingAlerts.map((alert: any) => {
              const isRed = ["ATRASO_APROVACAO", "VENCIMENTO_EMISSAO", "OS_ESQUECIDA"].includes(alert.alert_type);
              const isAmber = ["ANTECIPACAO_APROVACAO", "PENDENTE_FATURAMENTO"].includes(alert.alert_type);
              const bg = isRed ? "bg-red-50 border-red-200" : isAmber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
              const iconColor = isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-blue-600";
              const textColor = isRed ? "text-red-800" : isAmber ? "text-amber-800" : "text-blue-800";
              return (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`} data-testid={`billing-alert-${alert.id}`}>
                  <AlertTriangle size={16} className={`${iconColor} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${textColor}`}>{alert.message}</p>
                    {alert.period_start && <p className="text-[10px] text-neutral-500 mt-0.5">Período: {alert.period_start} a {alert.period_end}</p>}
                  </div>
                  <button onClick={() => resolveAlertMutation.mutate(alert.id)} className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700 whitespace-nowrap px-2 py-1 rounded hover:bg-white/50" data-testid={`resolve-alert-${alert.id}`}>
                    Resolver
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
              const groupTotal = group.orders.reduce((acc, o) => acc + Number(o.billing?.fat_acionamento || 0) + Number(o.billing?.fat_hora_extra || 0) + Number(o.billing?.fat_km || 0) + Number(o.billing?.despesas_pedagio || 0) + Number(o.billing?.receitas_os || 0), 0);

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
                      {group.orders[0]?.clientBillingCycle && (
                        <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]">
                          {group.orders[0].clientBillingCycle === "quinzenal" ? "Quinzenal" : group.orders[0].clientBillingCycle === "mensal" ? "Mensal" : "Por Missão"}
                          {group.orders[0].clientPaymentTermsDays ? ` · D+${group.orders[0].clientPaymentTermsDays}` : ""}
                        </Badge>
                      )}
                      {groupApproved > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const approvedOrders = group.orders.filter(o => o.billing?.status === "APROVADA");
                            const total = approvedOrders.reduce((acc, o) => {
                              const b = o.billing;
                              return acc + Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.despesas_pedagio || 0) + Number(b?.receitas_os || 0);
                            }, 0);
                            const firstOs = approvedOrders[0] || group.orders[0];
                            const ptDays = Number(firstOs?.clientPaymentTermsDays) || 15;
                            const suggestedDate = new Date();
                            suggestedDate.setDate(suggestedDate.getDate() + ptDays);
                            setFaturaDueDate(suggestedDate.toISOString().split("T")[0]);
                            setFaturaDialog({
                              clientId: group.clientId,
                              clientName: group.clientName,
                              approvedCount: approvedOrders.length,
                              total,
                              billingIds: approvedOrders.map(o => o.billing?.id).filter(Boolean),
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-sm"
                          data-testid={`button-gerar-fatura-${group.clientId}`}
                        >
                          <Receipt size={12} />
                          Gerar Fatura
                        </button>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-neutral-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" data-testid={`table-os-${group.clientId}`}>
                          <thead>
                            <tr className="bg-neutral-50/80">
                              <th className="px-2 py-3 w-8">
                                <input
                                  type="checkbox"
                                  className="rounded border-neutral-300"
                                  checked={group.orders.length > 0 && group.orders.every(o => checkedOsIds.has(o.id))}
                                  onChange={e => {
                                    const next = new Set(checkedOsIds);
                                    group.orders.forEach(o => e.target.checked ? next.add(o.id) : next.delete(o.id));
                                    setCheckedOsIds(next);
                                  }}
                                  data-testid={`checkbox-select-all-${group.clientId}`}
                                />
                              </th>
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
                              const isEditing = editingBillingId === b?.id;
                              const canEdit = b && !["FATURADO", "PAGO"].includes(b.status);
                              return (
                                <Fragment key={os.id}>
                                <tr className={`border-b hover:bg-neutral-50/50 transition-colors ${os.status === "cancelada" ? "bg-red-50/30" : ""} ${isEditing ? "bg-blue-50/40" : ""}`} data-testid={`row-os-${os.id}`}>
                                  <td className="px-2 py-3.5">
                                    <input
                                      type="checkbox"
                                      className="rounded border-neutral-300"
                                      checked={checkedOsIds.has(os.id)}
                                      onChange={e => {
                                        const next = new Set(checkedOsIds);
                                        e.target.checked ? next.add(os.id) : next.delete(os.id);
                                        setCheckedOsIds(next);
                                      }}
                                      data-testid={`checkbox-os-${os.id}`}
                                    />
                                  </td>
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
                                    <span className="font-mono font-black text-emerald-700">{b ? fmt(Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0)) : "—"}</span>
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
                                      {canEdit && (
                                        <button
                                          onClick={() => {
                                            if (isEditing) {
                                              setEditingBillingId(null);
                                            } else {
                                              setEditingBillingId(b.id);
                                              setEditBilling({
                                                km_inicial: String(b.km_inicial || 0),
                                                km_final: String(b.km_final || 0),
                                                fat_acionamento: String(b.fat_acionamento || 0),
                                                despesas_pedagio: String(b.despesas_pedagio || 0),
                                                horario_inicio: b.horario_inicio || "",
                                                horario_termino: b.horario_fim || "",
                                                receitas_os: String(b.receitas_os || 0),
                                              });
                                            }
                                          }}
                                          className={`p-1.5 rounded-lg border border-transparent transition-all ${isEditing ? "bg-blue-100 border-blue-300 text-blue-700" : "hover:bg-amber-50 hover:border-amber-200"}`}
                                          title="Editar Medição"
                                          data-testid={`button-editar-medicao-${os.id}`}
                                        >
                                          <Pencil size={15} className={isEditing ? "text-blue-600" : "text-amber-500"} />
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
                                {b && (
                                  <tr className={`border-b ${isEditing ? "bg-blue-50/60" : "bg-neutral-50/60"}`}>
                                    <td colSpan={11} className="px-4 py-2">
                                      {isEditing ? (
                                        <div className="space-y-3" data-testid={`edit-billing-${os.id}`}>
                                          <div className="grid grid-cols-7 gap-2">
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Acionamento (R$)</label>
                                              <input type="number" step="0.01" value={editBilling.fat_acionamento} onChange={e => setEditBilling(p => ({ ...p, fat_acionamento: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-acionamento" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">KM Inicial</label>
                                              <input type="number" value={editBilling.km_inicial} onChange={e => setEditBilling(p => ({ ...p, km_inicial: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-km-inicial" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">KM Final</label>
                                              <input type="number" value={editBilling.km_final} onChange={e => setEditBilling(p => ({ ...p, km_final: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-km-final" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Pedágio (R$)</label>
                                              <input type="number" step="0.01" value={editBilling.despesas_pedagio} onChange={e => setEditBilling(p => ({ ...p, despesas_pedagio: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-pedagio" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Hora Início</label>
                                              <input type="time" value={editBilling.horario_inicio} onChange={e => setEditBilling(p => ({ ...p, horario_inicio: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-hora-inicio" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Hora Fim</label>
                                              <input type="time" value={editBilling.horario_termino} onChange={e => setEditBilling(p => ({ ...p, horario_termino: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-hora-fim" />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Receitas OS</label>
                                              <input type="number" step="0.01" value={editBilling.receitas_os} onChange={e => setEditBilling(p => ({ ...p, receitas_os: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-receitas-os" />
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-bold text-neutral-400 uppercase">Franquia: {b.km_franquia || 0} km</span>
                                              <span className="text-[9px] text-neutral-300">|</span>
                                              <span className="text-[9px] font-bold text-neutral-400 uppercase">Viatura: {os.vehiclePlate}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button variant="outline" size="sm" onClick={() => setEditingBillingId(null)} className="text-[10px] font-bold uppercase h-8" data-testid="button-cancelar-medicao">
                                                Cancelar
                                              </Button>
                                              <Button
                                                size="sm"
                                                onClick={() => {
                                                  salvarMedicaoMutation.mutate({
                                                    billingId: b.id,
                                                    km_inicial: Number(editBilling.km_inicial) || 0,
                                                    km_final: Number(editBilling.km_final) || 0,
                                                    fat_acionamento: Number(editBilling.fat_acionamento) || 0,
                                                    despesas_pedagio: Number(editBilling.despesas_pedagio) || 0,
                                                    horario_inicio: editBilling.horario_inicio || undefined,
                                                    horario_termino: editBilling.horario_termino || undefined,
                                                    receitas_os: Number(editBilling.receitas_os) || 0,
                                                  });
                                                }}
                                                disabled={salvarMedicaoMutation.isPending}
                                                className="bg-blue-600 hover:bg-blue-700 text-[10px] font-bold uppercase h-8 gap-1.5"
                                                data-testid="button-salvar-medicao"
                                              >
                                                {salvarMedicaoMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                                Salvar Medição
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3 text-[10px] text-neutral-500 flex-wrap">
                                          <span><strong className="text-neutral-700">Acionamento:</strong> {fmt(Number(b.fat_acionamento || 0))}</span>
                                          <span className="text-neutral-300">|</span>
                                          <span><strong className="text-neutral-700">Franquia:</strong> {Number(b.km_franquia || 0).toLocaleString("pt-BR")} / {Number(b.km_faturado || b.km_franquia || 0).toLocaleString("pt-BR")} km</span>
                                          <span className="text-neutral-300">|</span>
                                          <span><strong className="text-neutral-700">KM Excedente:</strong> {Number(b.km_excedente || 0)} km — {fmt(Number(b.fat_km || 0))}</span>
                                          {Number(b.fat_hora_extra || 0) > 0 && (<><span className="text-neutral-300">|</span><span><strong className="text-neutral-700">Hora Extra:</strong> {fmtHoras(Number(b.horas_trabalhadas || 0))} — {fmt(Number(b.fat_hora_extra || 0))}</span></>)}
                                          {Number(b.despesas_pedagio || 0) > 0 && (<><span className="text-neutral-300">|</span><span><strong className="text-neutral-700">Pedágio:</strong> {fmt(Number(b.despesas_pedagio || 0))}</span></>)}
                                          <span className="text-neutral-300">|</span>
                                          <span><strong className="text-neutral-700">KM Inicial:</strong> {Number(b.km_inicial || 0).toLocaleString("pt-BR")}</span>
                                          <span><strong className="text-neutral-700">KM Total:</strong> {Number(b.km_total || 0).toLocaleString("pt-BR")}</span>
                                          <span className="text-neutral-300">|</span>
                                          <span><strong className="text-neutral-700">Viatura:</strong> {os.vehiclePlate || "—"}</span>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const checkedInGroup = group.orders.filter(o => checkedOsIds.has(o.id));
                              const checkedCount = checkedInGroup.length;
                              const checkedTotal = checkedInGroup.reduce((acc, o) => {
                                const b = o.billing;
                                return acc + Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.despesas_pedagio || 0) + Number(b?.receitas_os || 0);
                              }, 0);
                              return checkedCount > 0 ? (
                                <tr className="bg-blue-50/80 border-b">
                                  <td colSpan={11} className="px-4 py-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <span className="text-xs font-bold text-blue-800" data-testid={`text-selected-${group.clientId}`}>
                                        {checkedCount} OS selecionada{checkedCount > 1 ? "s" : ""} — Total: {fmt(checkedTotal)}
                                      </span>
                                      {isDiretoria && (
                                        <button
                                          onClick={() => {
                                            const billingIds = checkedInGroup.map(o => o.billing?.id).filter(Boolean);
                                            setAprovarFaturarDialog({
                                              clientId: group.clientId,
                                              clientName: group.clientName,
                                              osIds: checkedInGroup.map(o => o.id),
                                              billingIds,
                                              total: checkedTotal,
                                            });
                                          }}
                                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm"
                                          data-testid={`button-aprovar-faturar-${group.clientId}`}
                                        >
                                          <CheckCircle2 size={12} />
                                          Aprovar e Faturar
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ) : null;
                            })()}
                            <tr className="bg-neutral-50/80">
                              <td colSpan={8} className="px-4 py-3 text-right font-bold text-neutral-400 uppercase text-[10px] tracking-wider">Total do Cliente:</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-emerald-700 text-sm">{fmt(groupTotal)}</td>
                              <td colSpan={3}></td>
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

        <Dialog open={!!aprovarFaturarDialog} onOpenChange={(open) => { if (!open) setAprovarFaturarDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Aprovar e Faturar
              </DialogTitle>
              <DialogDescription className="text-xs">
                Aprovar e faturar {aprovarFaturarDialog?.osIds.length} OS no valor total de {fmt(aprovarFaturarDialog?.total || 0)} para {aprovarFaturarDialog?.clientName}? Essa ação gerará cobrança no Asaas.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-bold text-emerald-900 uppercase">{aprovarFaturarDialog?.clientName}</p>
              <p className="text-xs text-emerald-700"><strong>{aprovarFaturarDialog?.osIds.length}</strong> OS selecionada(s)</p>
              <p className="text-lg font-black font-mono text-emerald-800">{fmt(aprovarFaturarDialog?.total || 0)}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAprovarFaturarDialog(null)} className="text-xs font-bold uppercase" data-testid="button-cancel-aprovar-faturar">
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  if (!aprovarFaturarDialog) return;
                  try {
                    for (const billingId of aprovarFaturarDialog.billingIds) {
                      await apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "APROVADA" });
                    }
                    await apiRequest("POST", `/api/boletim-medicao/gerar-fatura/${aprovarFaturarDialog.clientId}`, {
                      billingType: "BOLETO",
                      sendToAsaas: false,
                      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
                    });
                    invalidateAllRelated();
                    setCheckedOsIds(new Set());
                    toast({ title: "Sucesso", description: `${aprovarFaturarDialog.billingIds.length} faturas geradas no Asaas com sucesso` });
                    setAprovarFaturarDialog(null);
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold uppercase gap-2"
                data-testid="button-confirm-aprovar-faturar"
              >
                <CheckCircle2 size={14} />
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!faturaDialog} onOpenChange={(open) => { if (!open) setFaturaDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase">
                <Receipt className="w-5 h-5 text-indigo-600" /> Gerar Fatura Consolidada
              </DialogTitle>
              <DialogDescription className="text-xs">
                Consolidar todas as OS aprovadas de <strong>{faturaDialog?.clientName}</strong> em uma única fatura.
              </DialogDescription>
            </DialogHeader>
            {faturaDialog && (
              <div className="space-y-4 py-2">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-bold text-indigo-900 uppercase">{faturaDialog.clientName}</p>
                  <p className="text-xs text-indigo-700"><strong>{faturaDialog.approvedCount}</strong> missão(ões) aprovada(s)</p>
                  <p className="text-lg font-black font-mono text-indigo-800">{fmt(faturaDialog.total)}</p>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase">Data de Vencimento</Label>
                  <Input type="date" value={faturaDueDate} onChange={(e) => setFaturaDueDate(e.target.value)} className="mt-1" data-testid="input-fatura-due-date" />
                  {(() => {
                    const firstOs = osConcluidas.find((o: any) => o.clientId === faturaDialog?.clientId);
                    const ptDays = Number(firstOs?.clientPaymentTermsDays);
                    return ptDays ? <p className="text-[10px] text-indigo-500 mt-1">Prazo cadastrado: D+{ptDays} (sugerido automaticamente)</p> : null;
                  })()}
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase">Tipo de Cobrança</Label>
                  <Select value={faturaBillingType} onValueChange={setFaturaBillingType}>
                    <SelectTrigger className="mt-1" data-testid="select-fatura-billing-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOLETO">Boleto</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                      <SelectItem value="UNDEFINED">Indefinido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between bg-neutral-50 rounded-lg p-3 border">
                  <div>
                    <p className="text-xs font-bold text-neutral-700">Enviar cobrança via Asaas</p>
                    <p className="text-[10px] text-neutral-400">Gera boleto/PIX automaticamente</p>
                  </div>
                  <Switch checked={faturaSendAsaas} onCheckedChange={setFaturaSendAsaas} data-testid="switch-send-asaas" />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setFaturaDialog(null)} className="text-xs font-bold uppercase" data-testid="button-cancel-fatura">
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (faturaDialog) {
                    gerarFaturaMutation.mutate({
                      clientId: faturaDialog.clientId,
                      billingType: faturaBillingType,
                      sendToAsaas: faturaSendAsaas,
                      dueDate: faturaDueDate,
                    });
                  }
                }}
                disabled={gerarFaturaMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold uppercase gap-2"
                data-testid="button-confirm-fatura"
              >
                {gerarFaturaMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
                Gerar Fatura {faturaDialog ? fmt(faturaDialog.total) : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
  const receitasOs = Number(b?.receitas_os || 0);
  const resultado = acionamento + horaExtra + kmExtraVal + pedagio + receitasOs;

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
                      <p className="text-[9px] font-bold text-emerald-400 uppercase">Na Origem</p>
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
                  {receitasOs > 0 && <ValueCard label="Receitas OS" value={fmt(receitasOs)} color="green" />}
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
