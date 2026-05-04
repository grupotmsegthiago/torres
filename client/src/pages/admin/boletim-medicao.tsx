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
  CircleDot, Timer, Download, Send, Mail, Camera, Search,
} from "lucide-react";
import { exportFormattedExcel } from "@/lib/excel-export";
import { getRelatorioStatus, getBillingStatusInfo, getOsStatusInfo } from "@shared/constants/mission-status";
import { CancelReasonBadge } from "@/components/cancel-reason-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const fmt = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const _eu = (ts: string) => /[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z";
const fmtDate = (d: string | null) => d ? new Date(_eu(d)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtTime = (d: string | null) => d ? new Date(_eu(d)).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";
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

type StatusFilter = "ALL" | "EM_ANDAMENTO" | "PENDENTE" | "ENVIADA_APROVACAO" | "APROVADA" | "REJEITADA" | "FORA_CICLO" | "A_FATURAR" | "FATURADA" | "CANCELADA";

export default function BoletimMedicaoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [selectedOs, setSelectedOs] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && ["ALL", "EM_ANDAMENTO", "PENDENTE", "ENVIADA_APROVACAO", "APROVADA", "REJEITADA", "FORA_CICLO", "A_FATURAR", "FATURADA", "CANCELADA"].includes(s)) return s as StatusFilter;
    return "PENDENTE";
  });
  const [osSearch, setOsSearch] = useState("");
  const [checkedOsIds, setCheckedOsIds] = useState<Set<number>>(new Set());
  const [aprovarFaturarDialog, setAprovarFaturarDialog] = useState<{ clientId: number; clientName: string; osIds: number[]; billingIds: string[]; total: number; minDate: string; maxDate: string } | null>(null);
  const [aprovarFaturarLoading, setAprovarFaturarLoading] = useState(false);
  const [pedagioValue, setPedagioValue] = useState("");
  const [observacoesValue, setObservacoesValue] = useState("");
  const [editingFields, setEditingFields] = useState(false);
  const [overrideKmChegada, setOverrideKmChegada] = useState("");
  const [overrideKmFim, setOverrideKmFim] = useState("");
  const [overrideHoraChegada, setOverrideHoraChegada] = useState("");
  const [overrideHoraFim, setOverrideHoraFim] = useState("");
  const [periodFilter, setPeriodFilter] = useState<string | null>("mes");
  const [enviarAprovacaoDialog, setEnviarAprovacaoDialog] = useState<{ clientId: number; clientName: string; clientEmail: string; billingIds: number[]; total: number; osCount: number; minDate: string; maxDate: string } | null>(null);
  const [enviarAprovacaoEmail, setEnviarAprovacaoEmail] = useState("");
  const [enviarAprovacaoLoading, setEnviarAprovacaoLoading] = useState(false);
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);
  const [editBilling, setEditBilling] = useState<{
    km_inicial: string; km_final: string; fat_acionamento: string;
    despesas_pedagio: string; horario_inicio: string; horario_termino: string;
    despesas_outras: string;
  }>({ km_inicial: "", km_final: "", fat_acionamento: "", despesas_pedagio: "", horario_inicio: "", horario_termino: "", despesas_outras: "" });

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

  const { data: boletimApprovals = [] } = useQuery<any[]>({
    queryKey: ["/api/boletim/aprovacoes"],
    queryFn: async () => {
      const r = await authFetch("/api/boletim/aprovacoes");
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    refetchInterval: 60000,
  });

  const sentBillingIds = new Set<number>();
  const approvedByClientBillingIds = new Set<number>();
  for (const ba of boletimApprovals) {
    const ids: number[] = ba.billing_ids || [];
    for (const bid of ids) {
      if (ba.status === "APROVADO" || ba.status === "CONFIRMADO") {
        approvedByClientBillingIds.add(bid);
      } else if (ba.status === "PENDENTE") {
        sentBillingIds.add(bid);
      }
    }
  }

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
      toast({ title: "OS Recusada", description: "Correção solicitada." });
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

  const liberarFaturamentoMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/liberar-faturamento`);
    },
    onSuccess: () => {
      invalidateAllRelated();
      toast({ title: "Liberada", description: "Nota liberada para refaturamento. Status voltou para 'A Verificar'." });
    },
    onError: (err: Error) => toast({ title: "Erro ao liberar", description: err.message, variant: "destructive" }),
  });

  const liberarFaturamentoBulkMutation = useMutation({
    mutationFn: async (billingIds: string[]) => {
      const results = await Promise.allSettled(
        billingIds.map(id => apiRequest("POST", `/api/escort/billings/${id}/liberar-faturamento`))
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      const fail = results.length - ok;
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      invalidateAllRelated();
      if (fail === 0) {
        toast({ title: "Liberadas", description: `${ok} nota(s) liberada(s) para refaturamento.` });
      } else {
        toast({ title: "Liberação parcial", description: `${ok} liberada(s), ${fail} com erro.`, variant: fail > 0 ? "destructive" : "default" });
      }
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
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
      return apiRequest("PATCH", `/api/escort/billings/${billingId}/salvar`, { observacoes, despesas_pedagio: pedagio, recalcular: true });
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
        const fb = fresh.billing;
        if (fb) {
          setPedagioValue(String(fb.despesas_pedagio || 0));
          setObservacoesValue(fb.observacoes || "");
        }
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
        try {
          const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(_eu(v)));
          const get = (t: string) => parts.find(p => p.type === t)?.value || "";
          const yyyy = get("year"); const mm = get("month"); const dd = get("day");
          const hh = get("hour") === "24" ? "00" : get("hour"); const mi = get("minute");
          if (!yyyy || !mm || !dd) return "";
          return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
        } catch { return ""; }
      };
      const fallbackFromScheduled = () => {
        const sd = selectedOs.scheduledDate;
        if (!sd) return "";
        return fmtDt(sd);
      };
      setOverrideHoraChegada(fmtDt(selectedOs.missionStartedAt) || fallbackFromScheduled());
      setOverrideHoraFim(fmtDt(selectedOs.hora_fim_missao) || fmtDt(selectedOs.completedDate) || fallbackFromScheduled());
      setEditingFields(false);
    }
  }, [selectedOs]);

  const clientGroups: Record<number, { clientName: string; clientCnpj: string | null; clientEmail: string | null; orders: any[] }> = {};
  osConcluidas.forEach(os => {
    const cid = os.clientId || 0;
    if (!clientGroups[cid]) clientGroups[cid] = { clientName: os.clientName || "Sem Cliente", clientCnpj: os.clientCnpj || null, clientEmail: os.clientEmail || null, orders: [] };
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
    if (period === "quinzena1") {
      return { start: new Date(brNow.getFullYear(), brNow.getMonth(), 1), end: new Date(brNow.getFullYear(), brNow.getMonth(), 16) };
    }
    if (period === "quinzena2") {
      return { start: new Date(brNow.getFullYear(), brNow.getMonth(), 16), end: new Date(brNow.getFullYear(), brNow.getMonth() + 1, 1) };
    }
    return { start: new Date(brNow.getFullYear(), 0, 1), end: new Date(brNow.getFullYear() + 1, 0, 1) };
  };

  const filteredGroups = Object.entries(clientGroups).map(([cid, group]) => {
    let orders = group.orders;
    if (statusFilter === "EM_ANDAMENTO") orders = orders.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada");
    else if (statusFilter === "PENDENTE") orders = orders.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR");
    else if (statusFilter === "ENVIADA_APROVACAO") orders = orders.filter(o => o.billing?.id && sentBillingIds.has(Number(o.billing.id)) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO");
    else if (statusFilter === "APROVADA") orders = orders.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado);
    else if (statusFilter === "A_FATURAR") orders = orders.filter(o => (o.billing?.status === "APROVADA" || o.billing?.boletim_gerado) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO");
    else if (statusFilter === "FATURADA") orders = orders.filter(o => o.billing?.status === "FATURADO" || o.billing?.status === "PAGO");
    else if (statusFilter === "REJEITADA") orders = orders.filter(o => o.billing?.status === "REJEITADA");
    else if (statusFilter === "CANCELADA") orders = orders.filter(o => o.status === "cancelada" || o.status === "recusada" || o.billing?.status === "CANCELADA" || o.billing?.status === "CANCELADO");
    else if (statusFilter === "FORA_CICLO") {
      orders = orders.filter(o => {
        if (!o.clientBillingCycle || o.clientBillingCycle === "por_missao") return false;
        const bStatus = o.billing?.status;
        if (bStatus === "FATURADO" || bStatus === "PAGO") return false;
        if (!o.billing?.data_missao && !o.completedDate) return false;
        const mDate = new Date(_eu(o.billing?.data_missao || o.completedDate));
        const daysSince = Math.floor((Date.now() - mDate.getTime()) / (1000 * 60 * 60 * 24));
        const prazoAprovacao = Number(o.clientPrazoAprovacaoDias) || 10;
        return daysSince > prazoAprovacao;
      });
    }
    if (periodFilter) {
      const { start, end } = getPeriodRange(periodFilter);
      orders = orders.filter(o => {
        const d = o.scheduledDate ? new Date(_eu(o.scheduledDate)) : o.createdAt ? new Date(_eu(o.createdAt)) : null;
        return d && d >= start && d < end;
      });
    }
    if (osSearch.trim()) {
      const q = osSearch.trim().toLowerCase().replace(/^tor[-\s]?/i, "").replace(/^0+/, "");
      orders = orders.filter(o => {
        const num = (o.osNumber || `TOR-${String(o.id).padStart(4, "0")}`).toLowerCase();
        const numNorm = num.replace(/^tor[-\s]?/i, "").replace(/^0+/, "");
        return num.includes(osSearch.trim().toLowerCase()) || numNorm.includes(q) || numNorm === q;
      });
    }
    if (orders.length === 0) return null;
    return { clientId: Number(cid), clientName: group.clientName, clientCnpj: group.clientCnpj, clientEmail: group.clientEmail, orders };
  }).filter(Boolean) as { clientId: number; clientName: string; clientCnpj: string | null; clientEmail: string | null; orders: any[] }[];

  const periodFilteredOs = periodFilter
    ? (() => {
        const { start, end } = getPeriodRange(periodFilter);
        return osConcluidas.filter(o => {
          const d = o.scheduledDate ? new Date(_eu(o.scheduledDate)) : o.createdAt ? new Date(_eu(o.createdAt)) : null;
          return d && d >= start && d < end;
        });
      })()
    : osConcluidas;

  const totalOs = periodFilteredOs.length;
  const liveCount = periodFilteredOs.filter(o => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt)) && o.missionStatus !== "encerrada").length;
  const pendingCount = periodFilteredOs.filter(o => !o.billing || o.billing?.status === "A_VERIFICAR").length;
  const sentForApprovalCount = periodFilteredOs.filter(o => o.billing?.id && sentBillingIds.has(Number(o.billing.id)) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO").length;
  const approvedCount = periodFilteredOs.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado).length;
  const faturadoCount = periodFilteredOs.filter(o => o.billing?.status === "FATURADO" || o.billing?.status === "PAGO").length;
  const aFaturarCount = periodFilteredOs.filter(o => (o.billing?.status === "APROVADA" || o.billing?.boletim_gerado) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO").length;
  const canceladasCount = periodFilteredOs.filter(o => o.status === "cancelada" || o.status === "recusada" || o.billing?.status === "CANCELADA" || o.billing?.status === "CANCELADO").length;
  const foraCicloCount = periodFilteredOs.filter(o => {
    if (!o.clientBillingCycle || o.clientBillingCycle === "por_missao") return false;
    const bStatus = o.billing?.status;
    if (bStatus === "FATURADO" || bStatus === "PAGO") return false;
    if (!o.billing?.data_missao && !o.completedDate) return false;
    const mDate = new Date(_eu(o.billing?.data_missao || o.completedDate));
    const daysSince = Math.floor((Date.now() - mDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > (Number(o.clientPrazoAprovacaoDias) || 10);
  }).length;
  const getBillingTotal = (o: any) => {
    if (o.status === "recusada" || o.status === "cancelada") return 0;
    const b = o.billing;
    if (!b) return 0;
    const fatTotal = Number(b.fat_total || 0);
    if (fatTotal > 0) return fatTotal;
    return Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.fat_adicional_noturno || 0) + Number(b.despesas_pedagio || 0) + Number(b.despesas_outras || 0) + Number(b.fat_estadia || 0) + Number(b.fat_pernoite || 0);
  };
  const totalFaturamento = periodFilteredOs.reduce((acc, o) => acc + getBillingTotal(o), 0);
  const totalFaturado = periodFilteredOs.filter(o => o.billing?.status === "FATURADO" || o.billing?.status === "PAGO").reduce((acc, o) => acc + getBillingTotal(o), 0);
  const totalAFaturar = periodFilteredOs.filter(o => (o.billing?.status === "APROVADA" || o.billing?.boletim_gerado) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO").reduce((acc, o) => acc + getBillingTotal(o), 0);

  const getBillingStatus = (os: any) => {
    if (!os.billing) return { label: "Sem Cálculo", color: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" };
    const info = getRelatorioStatus(os.status, os.billing.status);
    return { label: info.label, color: info.badgeClass, dot: info.dotClass };
  };

  const isLiveOs = (os: any) => os.status !== "recusada" && os.status !== "cancelada" && (os.status === "em_andamento" || (os.status === "agendada" && os.missionStartedAt)) && os.missionStatus !== "encerrada";

  const exportBoletimExcel = () => {
    if (periodFilteredOs.length === 0) return;
    const headers = ["#", "OS", "Cliente", "Rota", "Viatura", "Agente", "Data", "Hora Início", "Hora Fim", "KM Inicial", "KM Final", "KM Total", "Franquia KM", "KM Excedente", "Horas", "Acionamento", "Hora Extra", "KM Extra", "Pedágio", "Ad. Noturno", "Total", "Status"];
    const rows = periodFilteredOs.map((os: any, i: number) => {
      const b = os.billing;
      const route = [os.origin, os.destination].filter(Boolean).join(" → ");
      return [
        i + 1,
        os.osNumber || `TOR-${String(os.id).padStart(4, "0")}`,
        os.clientName || "",
        route.substring(0, 50) || "",
        os.vehiclePlate || "",
        os.employee1Name || "",
        os.scheduledDate ? new Date(_eu(os.scheduledDate)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
        b?.horario_inicio || "",
        b?.horario_fim || "",
        Number(b?.km_inicial || 0),
        Number(b?.km_final || 0),
        Number(b?.km_total || 0),
        Number(b?.km_franquia || 0),
        Number(b?.km_excedente || 0),
        fmtHoras(Number(b?.horas_trabalhadas || 0)),
        Number(b?.fat_acionamento || 0),
        Number(b?.fat_hora_extra || 0),
        Number(b?.fat_km || 0),
        Number(b?.despesas_pedagio || 0),
        Number(b?.fat_adicional_noturno || 0),
        Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.fat_adicional_noturno || 0) + Number(b?.despesas_pedagio || 0),
        b?.status === "A_VERIFICAR" ? "A Verificar" : b?.status === "APROVADA" ? "Aprovada" : b?.status === "FATURADO" ? "Faturado" : b?.status || "—",
      ];
    });
    const totals: (string | number)[] = Array(22).fill("");
    totals[0] = "TOTAL";
    totals[14] = `${periodFilteredOs.length} OS`;
    totals[15] = Number(periodFilteredOs.reduce((s: number, o: any) => s + Number(o.billing?.fat_acionamento || 0), 0).toFixed(2));
    totals[16] = Number(periodFilteredOs.reduce((s: number, o: any) => s + Number(o.billing?.fat_hora_extra || 0), 0).toFixed(2));
    totals[17] = Number(periodFilteredOs.reduce((s: number, o: any) => s + Number(o.billing?.fat_km || 0), 0).toFixed(2));
    totals[18] = Number(periodFilteredOs.reduce((s: number, o: any) => s + Number(o.billing?.despesas_pedagio || 0), 0).toFixed(2));
    totals[19] = Number(periodFilteredOs.reduce((s: number, o: any) => s + Number(o.billing?.fat_adicional_noturno || 0), 0).toFixed(2));
    totals[20] = Number(totalFaturamento.toFixed(2));
    const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    exportFormattedExcel({
      title: "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL",
      subtitle: "CNPJ 36.982.392/0001-89 — Serviço de Escolta Armada Caracterizada",
      period: `Gerado em ${today}`,
      headers,
      colWidths: [5, 12, 25, 30, 12, 20, 12, 10, 10, 10, 10, 9, 9, 9, 8, 13, 13, 13, 12, 12, 12, 14, 12],
      rows,
      totalsRow: totals,
      currencyColumns: [15, 16, 17, 18, 19, 20, 21],
      fileName: `Boletim_Medicao_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}.xlsx`,
      sheetName: "Boletim",
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-3" data-testid="page-boletim-medicao">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-black text-neutral-900 uppercase tracking-wider" data-testid="heading-boletim">Boletim de Medição</h1>
            <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">Verificação e aprovação de faturamento das ordens de serviço</p>
          </div>
          <Button size="sm" onClick={exportBoletimExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-export-boletim-excel">
            <Download className="w-4 h-4" />
            Exportar Excel
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button onClick={() => setStatusFilter("ALL")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "ALL" ? "ring-2 ring-neutral-900 border-neutral-900" : "border-neutral-200"}`} data-testid="stat-total">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><FileText size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total OS</span>
            </div>
            <p className="text-xl font-black text-neutral-900 mt-1">{totalOs}</p>
          </button>
          <button onClick={() => setStatusFilter("PENDENTE")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "PENDENTE" ? "ring-2 ring-amber-500 border-amber-500" : "border-amber-200"}`} data-testid="stat-pendentes">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><AlertTriangle size={14} className="text-amber-600" /></div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pendentes</span>
            </div>
            <p className="text-xl font-black text-amber-700 mt-1">{pendingCount}</p>
          </button>
          <button onClick={() => setStatusFilter("ENVIADA_APROVACAO")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "ENVIADA_APROVACAO" ? "ring-2 ring-blue-500 border-blue-500" : "border-blue-200"}`} data-testid="stat-enviadas">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Send size={14} className="text-blue-600" /></div>
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Enviadas</span>
            </div>
            <p className="text-xl font-black text-blue-700 mt-1">{sentForApprovalCount}</p>
            <p className="text-[9px] text-blue-400 font-semibold mt-0.5">p/ aprovação cliente</p>
          </button>
          <button onClick={() => setStatusFilter("APROVADA")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "APROVADA" ? "ring-2 ring-emerald-500 border-emerald-500" : "border-emerald-200"}`} data-testid="stat-aprovadas">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-600" /></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Aprovadas</span>
            </div>
            <p className="text-xl font-black text-emerald-700 mt-1">{approvedCount}</p>
            <p className="text-[9px] text-emerald-400 font-semibold mt-0.5">pelo cliente</p>
          </button>
          <button onClick={() => setStatusFilter("A_FATURAR")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "A_FATURAR" ? "ring-2 ring-orange-500 border-orange-500" : "border-orange-200"}`} data-testid="stat-a-faturar">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center"><Clock size={14} className="text-orange-600" /></div>
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">A Faturar</span>
            </div>
            <p className="text-lg font-black text-orange-700 mt-1">{fmt(totalAFaturar)}</p>
            <p className="text-[9px] text-orange-400 font-semibold mt-0.5">{aFaturarCount} OS</p>
          </button>
          <button onClick={() => setStatusFilter("FATURADA")} className={`text-left bg-white border rounded-xl p-3 transition-all cursor-pointer hover:shadow-md ${statusFilter === "FATURADA" ? "ring-2 ring-indigo-500 border-indigo-500" : "border-indigo-200"}`} data-testid="stat-faturado">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center"><DollarSign size={14} className="text-indigo-600" /></div>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Faturado</span>
            </div>
            <p className="text-lg font-black text-indigo-700 mt-1">{fmt(totalFaturado)}</p>
            <p className="text-[9px] text-indigo-400 font-semibold mt-0.5">{faturadoCount} OS</p>
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
            <Route size={12} /> Pipeline de Faturamento
          </div>
          <div className="flex items-center gap-0">
            {[
              { label: "Pendentes", count: pendingCount, value: null, color: "bg-amber-500", filter: "PENDENTE" as StatusFilter },
              { label: "Enviadas", count: sentForApprovalCount, value: null, color: "bg-blue-500", filter: "ENVIADA_APROVACAO" as StatusFilter },
              { label: "Aprovadas", count: approvedCount, value: null, color: "bg-emerald-500", filter: "APROVADA" as StatusFilter },
              { label: "A Faturar", count: aFaturarCount, value: totalAFaturar, color: "bg-orange-500", filter: "A_FATURAR" as StatusFilter },
              { label: "Faturado", count: faturadoCount, value: totalFaturado, color: "bg-indigo-600", filter: "FATURADA" as StatusFilter },
            ].map((step, i, arr) => {
              const pct = totalOs > 0 ? Math.max(8, (step.count / totalOs) * 100) : 20;
              return (
                <div key={step.label} className="flex items-center" style={{ flex: pct }}>
                  <button
                    onClick={() => setStatusFilter(step.filter)}
                    className={`w-full h-8 ${step.color} flex items-center justify-center gap-1 transition-all hover:opacity-90 cursor-pointer ${i === 0 ? "rounded-l-lg" : ""} ${i === arr.length - 1 ? "rounded-r-lg" : ""} ${statusFilter === step.filter ? "ring-2 ring-offset-1 ring-neutral-900" : ""}`}
                    title={`${step.label}: ${step.count} OS${step.value != null ? ` · ${fmt(step.value)}` : ""}`}
                    data-testid={`pipeline-${step.filter.toLowerCase()}`}
                  >
                    <span className="text-white text-[10px] font-black">{step.count}</span>
                  </button>
                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-neutral-300 flex-shrink-0 mx-0.5" />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[9px] font-semibold text-neutral-400">
            <span>Pendente → Enviado → Aprovado → A Faturar → Faturado</span>
            <span>Total: {fmt(totalFaturamento)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-status">
          {([
            ["ALL", "Todas"],
            ["EM_ANDAMENTO", `Em Andamento (${liveCount})`],
            ["PENDENTE", `A Verificar (${pendingCount})`],
            ["ENVIADA_APROVACAO", `Enviadas (${sentForApprovalCount})`],
            ["APROVADA", `Aprovadas (${approvedCount})`],
            ["A_FATURAR", `A Faturar (${aFaturarCount})`],
            ["FATURADA", `Faturadas (${faturadoCount})`],
            ["REJEITADA", "Recusadas"],
            ["CANCELADA", `Canceladas (${canceladasCount})`],
            ...(foraCicloCount > 0 ? [["FORA_CICLO", `⚠ Fora do Ciclo (${foraCicloCount})`]] : []),
          ] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                statusFilter === val && val === "FORA_CICLO" ? "bg-red-600 text-white shadow-sm"
                : statusFilter === val && val === "ENVIADA_APROVACAO" ? "bg-blue-600 text-white shadow-sm"
                : statusFilter === val && val === "A_FATURAR" ? "bg-orange-600 text-white shadow-sm"
                : statusFilter === val && val === "FATURADA" ? "bg-indigo-600 text-white shadow-sm"
                : statusFilter === val ? "bg-neutral-900 text-white shadow-sm"
                : val === "FORA_CICLO" ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                : val === "ENVIADA_APROVACAO" ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                : val === "A_FATURAR" ? "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
                : val === "FATURADA" ? "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                : "bg-white text-neutral-500 hover:bg-neutral-100 border border-neutral-200"
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
            <option value="quinzena1">1ª Quinzena (1 a 15)</option>
            <option value="quinzena2">2ª Quinzena (16 a 31)</option>
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
          <div className="h-6 w-px bg-neutral-200 mx-1" />
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={osSearch}
              onChange={e => {
                const v = e.target.value;
                setOsSearch(v);
                if (v.trim() && statusFilter !== "ALL") setStatusFilter("ALL");
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const q = osSearch.trim().toLowerCase().replace(/^tor[-\s]?/i, "").replace(/^0+/, "");
                  if (!q) return;
                  const match = osConcluidas.find((o: any) => {
                    const num = (o.osNumber || `TOR-${String(o.id).padStart(4, "0")}`).toLowerCase();
                    const numNorm = num.replace(/^tor[-\s]?/i, "").replace(/^0+/, "");
                    return numNorm === q;
                  });
                  if (match) {
                    setSelectedOs(match);
                    setPedagioValue(match.billing?.despesas_pedagio || (match as any).pedagioEstimado || "0");
                    setObservacoesValue(match.billing?.observacoes || "");
                  }
                }
              }}
              placeholder="Buscar OS (ex: 59 ou TOR-0059)"
              className="text-xs font-bold border border-neutral-200 rounded-lg pl-8 pr-8 py-2 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10 uppercase tracking-wider w-56"
              data-testid="input-search-os"
            />
            {osSearch && (
              <button
                onClick={() => setOsSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                data-testid="button-clear-search-os"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
              const groupSent = group.orders.filter(o => o.billing?.id && sentBillingIds.has(Number(o.billing.id)) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO").length;
              const groupApproved = group.orders.filter(o => o.billing?.status === "APROVADA" || o.billing?.boletim_gerado).length;
              const groupFaturado = group.orders.filter(o => o.billing?.status === "FATURADO" || o.billing?.status === "PAGO").length;
              const groupAFaturar = group.orders.filter(o => (o.billing?.status === "APROVADA" || o.billing?.boletim_gerado) && o.billing?.status !== "FATURADO" && o.billing?.status !== "PAGO").length;
              const groupTotal = group.orders.reduce((acc, o) => acc + getBillingTotal(o), 0);

              const cycleQuinzenal = group.orders[0]?.clientBillingCycle === "quinzenal";
              const brToday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
              const dayBR = brToday.getDate();
              let closedQuinzenaRange: { start: Date; end: Date; label: string } | null = null;
              if (cycleQuinzenal) {
                if (dayBR >= 16) {
                  closedQuinzenaRange = {
                    start: new Date(brToday.getFullYear(), brToday.getMonth(), 1),
                    end: new Date(brToday.getFullYear(), brToday.getMonth(), 16),
                    label: `1ª Quinzena (1-15/${String(brToday.getMonth() + 1).padStart(2, "0")})`,
                  };
                } else {
                  const prev = new Date(brToday.getFullYear(), brToday.getMonth() - 1, 1);
                  closedQuinzenaRange = {
                    start: new Date(prev.getFullYear(), prev.getMonth(), 16),
                    end: new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    label: `2ª Quinzena (16-31/${String(prev.getMonth() + 1).padStart(2, "0")})`,
                  };
                }
              }
              const quinzenaPendentes = closedQuinzenaRange
                ? group.orders.filter(o => {
                    const status = o.billing?.status;
                    if (status === "APROVADA" || status === "FATURADO" || status === "FATURADA" || status === "PAGO" || status === "RECUSADA" || status === "CANCELADA") return false;
                    const ref = o.billing?.data_missao || o.scheduledDate || o.completedDate;
                    if (!ref) return false;
                    const d = new Date(_eu(ref));
                    return d >= closedQuinzenaRange!.start && d < closedQuinzenaRange!.end;
                  })
                : [];

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
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {groupPending > 0 && <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">{groupPending} pendente{groupPending > 1 ? "s" : ""}</Badge>}
                      {groupSent > 0 && <Badge className="bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">{groupSent} enviada{groupSent > 1 ? "s" : ""}</Badge>}
                      {groupApproved > 0 && <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">{groupApproved} aprovada{groupApproved > 1 ? "s" : ""}</Badge>}
                      {groupAFaturar > 0 && <Badge className="bg-orange-50 text-orange-700 border border-orange-200 font-bold text-[10px]">{groupAFaturar} a faturar</Badge>}
                      {groupFaturado > 0 && <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]">{groupFaturado} faturada{groupFaturado > 1 ? "s" : ""}</Badge>}
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
                      {quinzenaPendentes.length > 0 && (
                        <Badge className="bg-red-100 text-red-800 border border-red-300 font-bold text-[10px] animate-pulse" data-testid={`badge-quinzena-pendente-${group.clientId}`}>
                          ⚠ {quinzenaPendentes.length} OS pendente{quinzenaPendentes.length > 1 ? "s" : ""} da quinzena fechada
                        </Badge>
                      )}
                    </div>
                  </button>

                  {quinzenaPendentes.length > 0 && closedQuinzenaRange && (
                    <div className="bg-red-50 border-t border-b border-red-200 px-5 py-3" data-testid={`alert-quinzena-${group.clientId}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-red-800 uppercase tracking-wider">
                            Quinzena fechada com {quinzenaPendentes.length} OS sem aprovação — {closedQuinzenaRange.label}
                          </p>
                          <p className="text-[11px] text-red-700 mt-1">
                            O sistema bloqueará a geração de fatura desta quinzena enquanto houver OS pendentes. Aprove ou recuse cada OS abaixo:
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {quinzenaPendentes.slice(0, 20).map((os: any) => (
                              <span key={os.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-red-300 rounded text-[10px] font-mono text-red-700">
                                {os.osNumber || `TOR-${String(os.id).padStart(4, "0")}`}
                                <span className="text-red-400">·</span>
                                <span className="text-red-600">{os.billing?.status || "sem cálculo"}</span>
                              </span>
                            ))}
                            {quinzenaPendentes.length > 20 && (
                              <span className="text-[10px] text-red-600 font-bold">+{quinzenaPendentes.length - 20} OS</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
                              const isOsRecusadaOuCancelada = os.status === "recusada" || os.status === "cancelada";
                              const canEdit = b && !["FATURADO", "PAGO"].includes(b.status) && !isOsRecusadaOuCancelada;
                              return (
                                <Fragment key={os.id}>
                                <tr className={`border-b hover:bg-neutral-50/50 transition-colors ${os.status === "cancelada" ? "bg-red-50/30" : ""} ${os.status === "recusada" ? "bg-orange-50/30" : ""} ${isEditing ? "bg-blue-50/40" : ""}`} data-testid={`row-os-${os.id}`}>
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
                                      <CancelReasonBadge status={os.status} reason={(os as any).cancellationReason} />
                                    </div>
                                    {b?.boletim_numero && <p className="text-[9px] text-blue-600 font-mono font-bold mt-0.5">{b.boletim_numero}</p>}
                                    {isLiveOs(os) && <p className="text-[9px] text-green-600 font-bold mt-0.5">EM ANDAMENTO</p>}
                                    {os.status === "cancelada" && <p className="text-[9px] text-red-600 font-bold mt-0.5">{(os as any).cancellationReason || (b?.observacoes ? b.observacoes.split("|")[0].trim() : "Cancelada")}</p>}
                                    {os.status === "recusada" && <p className="text-[9px] text-orange-600 font-bold mt-0.5">{(os as any).cancellationReason || (b?.observacoes ? b.observacoes.split("|")[0].trim() : "Recusada")} — Faturamento Zerado</p>}
                                    {os.status !== "cancelada" && os.status !== "recusada" && b?.status === "REJEITADA" && (
                                      <p className="text-[9px] text-red-600 font-bold mt-0.5" title={`Rejeitado por ${b.revisado_por || "—"}${b.revisado_em ? " em " + fmtDate(b.revisado_em) : ""}`}>
                                        REJEITADA: {b.motivo_rejeicao || "Sem motivo informado"}
                                      </p>
                                    )}
                                    {os.status !== "cancelada" && os.status !== "recusada" && (b?.status === "CANCELADA" || b?.status === "CANCELADO") && (
                                      <p className="text-[9px] text-red-600 font-bold mt-0.5">
                                        CANCELADA: {b?.observacoes ? b.observacoes.split("|")[0].trim() : "Sem motivo informado"}
                                      </p>
                                    )}
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
                                    {isOsRecusadaOuCancelada ? (
                                      <span className="font-mono font-black text-red-500">R$ 0,00</span>
                                    ) : (
                                      <span className="font-mono font-black text-emerald-700">{b ? fmt(Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.fat_adicional_noturno || 0) + Number(b.despesas_pedagio || 0)) : "—"}</span>
                                    )}
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
                                          title={b?.status === "REJEITADA" ? "Recalcular (Recusada)" : b && isLiveOs(os) ? "Recalcular Estimativa" : "Calcular Billing"}
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
                                                despesas_outras: String(b.despesas_outras || 0),
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
                                      {isDiretoria && b && ["FATURADO", "PAGO"].includes(b.status) && (
                                        <button
                                          onClick={() => { if (confirm("Liberar esta nota faturada para refaturamento? O status voltará para 'A Verificar'.")) liberarFaturamentoMutation.mutate(b.id); }}
                                          disabled={liberarFaturamentoMutation.isPending}
                                          className="p-1.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all"
                                          title="Liberar para Refaturamento"
                                          data-testid={`button-liberar-faturamento-${os.id}`}
                                        >
                                          <RotateCcw size={15} className="text-indigo-500" />
                                        </button>
                                      )}
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
                                              <label className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Desp. Outras</label>
                                              <input type="number" step="0.01" value={editBilling.despesas_outras} onChange={e => setEditBilling(p => ({ ...p, despesas_outras: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-blue-200 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-300 outline-none" data-testid="input-edit-despesas-outras" />
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
                                                    despesas_outras: Number(editBilling.despesas_outras) || 0,
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
                                if (o.status === "recusada" || o.status === "cancelada") return acc;
                                const b = o.billing;
                                return acc + Number(b?.fat_acionamento || 0) + Number(b?.fat_hora_extra || 0) + Number(b?.fat_km || 0) + Number(b?.fat_adicional_noturno || 0) + Number(b?.despesas_pedagio || 0);
                              }, 0);
                              return checkedCount > 0 ? (
                                <tr className="bg-blue-50/80 border-b">
                                  <td colSpan={11} className="px-4 py-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <span className="text-xs font-bold text-blue-800" data-testid={`text-selected-${group.clientId}`}>
                                        {checkedCount} OS selecionada{checkedCount > 1 ? "s" : ""} — Total: {fmt(checkedTotal)}
                                      </span>
                                      {isDiretoria && (
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              const billingIds = checkedInGroup.map(o => o.billing?.id).filter(Boolean);
                                              const dates = checkedInGroup.map(o => o.billing?.data_missao || o.scheduledDate || o.completedDate || o.createdAt).filter(Boolean).map(d => d.split("T")[0]).sort();
                                              setEnviarAprovacaoEmail(group.clientEmail || "");
                                              setEnviarAprovacaoDialog({
                                                clientId: group.clientId,
                                                clientName: group.clientName,
                                                clientEmail: group.clientEmail || "",
                                                billingIds: billingIds.map(Number),
                                                total: checkedTotal,
                                                osCount: checkedInGroup.length,
                                                minDate: dates[0] || new Date().toISOString().split("T")[0],
                                                maxDate: dates[dates.length - 1] || new Date().toISOString().split("T")[0],
                                              });
                                            }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
                                            data-testid={`button-enviar-aprovacao-${group.clientId}`}
                                          >
                                            <Mail size={12} />
                                            Enviar p/ Cliente
                                          </button>
                                          {(() => {
                                            const liberables = checkedInGroup.filter(o => {
                                              const st = (o.billing?.status || "").toUpperCase();
                                              return st === "FATURADO" || st === "FATURADA" || st === "PAGO";
                                            });
                                            if (liberables.length === 0) return null;
                                            return (
                                              <button
                                                onClick={() => {
                                                  if (!confirm(`Liberar ${liberables.length} OS faturada(s) para refaturamento? O status voltará para 'A Verificar' e a cobrança vinculada precisará ser regerada.`)) return;
                                                  const ids = liberables.map(o => String(o.billing!.id));
                                                  liberarFaturamentoBulkMutation.mutate(ids);
                                                }}
                                                disabled={liberarFaturamentoBulkMutation.isPending}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
                                                data-testid={`button-liberar-refaturar-bulk-${group.clientId}`}
                                              >
                                                {liberarFaturamentoBulkMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                                Liberar p/ Refaturar ({liberables.length})
                                              </button>
                                            );
                                          })()}
                                          <button
                                            onClick={() => {
                                              const billingIds = checkedInGroup.map(o => o.billing?.id).filter(Boolean);
                                              const dates = checkedInGroup.map(o => o.billing?.data_missao || o.scheduledDate || o.completedDate || o.createdAt).filter(Boolean).map(d => d.split("T")[0]).sort();
                                              setAprovarFaturarDialog({
                                                clientId: group.clientId,
                                                clientName: group.clientName,
                                                osIds: checkedInGroup.map(o => o.id),
                                                billingIds,
                                                total: checkedTotal,
                                                minDate: dates[0] || new Date().toISOString().split("T")[0],
                                                maxDate: dates[dates.length - 1] || new Date().toISOString().split("T")[0],
                                              });
                                            }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm"
                                            data-testid={`button-aprovar-faturar-${group.clientId}`}
                                          >
                                            <CheckCircle2 size={12} />
                                            Aprovar e Faturar
                                          </button>
                                        </div>
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
                disabled={aprovarFaturarLoading}
                onClick={async () => {
                  if (!aprovarFaturarDialog || aprovarFaturarLoading) return;
                  setAprovarFaturarLoading(true);
                  try {
                    for (const billingId of aprovarFaturarDialog.billingIds) {
                      await apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "APROVADA" });
                    }
                    await apiRequest("POST", `/api/boletim-medicao/gerar-fatura/${aprovarFaturarDialog.clientId}`, {
                      billingType: "UNDEFINED",
                      sendToAsaas: true,
                      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
                      startDate: aprovarFaturarDialog.minDate,
                      endDate: aprovarFaturarDialog.maxDate,
                    });
                    invalidateAllRelated();
                    setCheckedOsIds(new Set());
                    toast({ title: "Sucesso", description: `${aprovarFaturarDialog.billingIds.length} fatura(s) gerada(s) no Asaas com sucesso` });
                    setAprovarFaturarDialog(null);
                  } catch (err: any) {
                    const isQuinzenaBlock = err?.message?.includes("QUINZENA_INCOMPLETA") || err?.message?.includes("BLOQUEADO") || err?.message?.includes("quinzena");
                    toast({
                      title: isQuinzenaBlock ? "⛔ Quinzena incompleta" : "Erro",
                      description: err.message,
                      variant: "destructive",
                      duration: isQuinzenaBlock ? 12000 : 6000,
                    });
                  } finally {
                    setAprovarFaturarLoading(false);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold uppercase gap-2"
                data-testid="button-confirm-aprovar-faturar"
              >
                {aprovarFaturarLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Processando...</>
                ) : (
                  <><CheckCircle2 size={14} /> Confirmar</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!enviarAprovacaoDialog} onOpenChange={(open) => { if (!open) setEnviarAprovacaoDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase">
                <Mail className="w-5 h-5 text-blue-600" /> Enviar para Aprovação do Cliente
              </DialogTitle>
              <DialogDescription className="text-xs">
                Um e-mail será enviado ao cliente com um link exclusivo para revisar e aprovar o boletim de medição.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-bold text-blue-900 uppercase">{enviarAprovacaoDialog?.clientName}</p>
              <p className="text-xs text-blue-700"><strong>{enviarAprovacaoDialog?.osCount}</strong> OS selecionada(s)</p>
              <p className="text-lg font-black font-mono text-blue-800">{fmt(enviarAprovacaoDialog?.total || 0)}</p>
              <p className="text-[10px] text-blue-600">
                Período: {enviarAprovacaoDialog?.minDate ? fmtDate(enviarAprovacaoDialog.minDate) : ""} a {enviarAprovacaoDialog?.maxDate ? fmtDate(enviarAprovacaoDialog.maxDate) : ""}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider">E-mail do cliente *</label>
              <Input
                data-testid="input-email-aprovacao"
                type="email"
                value={enviarAprovacaoEmail}
                onChange={(e) => setEnviarAprovacaoEmail(e.target.value)}
                placeholder="email@cliente.com.br"
                className="text-sm"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEnviarAprovacaoDialog(null)} className="text-xs font-bold uppercase" data-testid="button-cancel-enviar-aprovacao">
                Cancelar
              </Button>
              <Button
                disabled={enviarAprovacaoLoading || !enviarAprovacaoEmail.includes("@")}
                onClick={async () => {
                  if (!enviarAprovacaoDialog || enviarAprovacaoLoading) return;
                  setEnviarAprovacaoLoading(true);
                  try {
                    const resp = await apiRequest("POST", "/api/boletim/enviar-aprovacao", {
                      clientId: enviarAprovacaoDialog.clientId,
                      clientName: enviarAprovacaoDialog.clientName,
                      clientEmail: enviarAprovacaoEmail,
                      periodStart: enviarAprovacaoDialog.minDate,
                      periodEnd: enviarAprovacaoDialog.maxDate,
                      billingIds: enviarAprovacaoDialog.billingIds,
                      totalValue: enviarAprovacaoDialog.total,
                      osCount: enviarAprovacaoDialog.osCount,
                    });
                    const result = await resp.json();
                    if (result.emailError) {
                      toast({ title: "Aprovação criada", description: `Link gerado mas houve erro no e-mail: ${result.emailError}. Link: ${result.approvalUrl}`, variant: "destructive" });
                    } else {
                      toast({ title: "E-mail enviado!", description: `Link de aprovação enviado para ${enviarAprovacaoEmail}` });
                    }
                    setEnviarAprovacaoDialog(null);
                    setCheckedOsIds(new Set());
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setEnviarAprovacaoLoading(false);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-xs font-bold uppercase gap-2"
                data-testid="button-confirm-enviar-aprovacao"
              >
                {enviarAprovacaoLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                ) : (
                  <><Send size={14} /> Enviar E-mail</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedOs && <OsDetailModal os={selectedOs} onClose={() => setSelectedOs(null)} isDiretoria={isDiretoria} editingFields={editingFields} setEditingFields={setEditingFields} overrideKmChegada={overrideKmChegada} setOverrideKmChegada={setOverrideKmChegada} overrideKmFim={overrideKmFim} setOverrideKmFim={setOverrideKmFim} overrideHoraChegada={overrideHoraChegada} setOverrideHoraChegada={setOverrideHoraChegada} overrideHoraFim={overrideHoraFim} setOverrideHoraFim={setOverrideHoraFim} overrideMutation={overrideMutation} calcularMutation={calcularMutation} aprovarMutation={aprovarMutation} rejeitarMutation={rejeitarMutation} reabrirMutation={reabrirMutation} liberarFaturamentoMutation={liberarFaturamentoMutation} salvarBillingMutation={salvarBillingMutation} pedagioValue={pedagioValue} setPedagioValue={setPedagioValue} observacoesValue={observacoesValue} setObservacoesValue={setObservacoesValue} getBillingStatus={getBillingStatus} isLiveOs={isLiveOs} />}
      </div>
    </AdminLayout>
  );
}

function OsDetailModal({ os, onClose, isDiretoria, editingFields, setEditingFields, overrideKmChegada, setOverrideKmChegada, overrideKmFim, setOverrideKmFim, overrideHoraChegada, setOverrideHoraChegada, overrideHoraFim, setOverrideHoraFim, overrideMutation, calcularMutation, aprovarMutation, rejeitarMutation, reabrirMutation, liberarFaturamentoMutation, salvarBillingMutation, pedagioValue, setPedagioValue, observacoesValue, setObservacoesValue, getBillingStatus, isLiveOs }: any) {
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
    try { return new Date(_eu(v)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).split(" ").pop() || null; } catch { return null; }
  };
  const ini = b?.horario_inicio_considerado || b?.horario_inicio;
  const fimReal = fmtToHHMM(os.hora_fim_missao) || b?.horario_fim;

  const billingInicio = b?.horario_inicio_considerado || b?.horario_inicio;
  const billingFim = fmtToHHMM(os.hora_fim_missao) || b?.horario_fim;
  let hCalc = Number(b?.horas_trabalhadas || b?.horas_missao || 0);
  if (billingInicio && billingFim) {
    let diff = toMin(billingFim) - toMin(billingInicio);
    if (diff < 0) diff += 24 * 60;
    hCalc = diff / 60;
  }

  const acionamento = Number(b?.fat_acionamento || 0);
  const horaExtra = Number(b?.fat_hora_extra || 0);
  const kmExtraVal = Number(b?.fat_km || 0);
  const pedagio = pedagioValue !== undefined && pedagioValue !== "" ? Number(pedagioValue) || 0 : (Number(b?.despesas_pedagio || 0) || Number((os as any).pedagioEstimado || 0));
  const adNoturno = Number(b?.fat_adicional_noturno || 0);
  const demaisCustos = Number(b?.despesas_outras || 0) + Number(b?.fat_estadia || 0) + Number(b?.fat_pernoite || 0);
  const resultado = acionamento + horaExtra + kmExtraVal + pedagio + adNoturno + demaisCustos;

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
              <a href={`/admin/photo-inspection/${os.id}`} target="_blank" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-amber-400" title="Fotos / Inspeção IA" data-testid="link-photo-inspection"><Camera size={18} /></a>
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
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">Início de Missão (Agendamento)</p>
                      <input type="datetime-local" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideHoraChegada} onChange={(e: any) => setOverrideHoraChegada(e.target.value)} data-testid="input-inicio-missao" />
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase">Data e Hora — Fim Missão</p>
                      <input type="datetime-local" className="w-full p-1.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold mt-1 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={overrideHoraFim} onChange={(e: any) => setOverrideHoraFim(e.target.value)} data-testid="input-hora-fim-missao" />
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
                        const brToIso = (v: string) => {
                          if (!v) return null;
                          const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
                          if (!m) return null;
                          return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`).toISOString();
                        };
                        if (overrideHoraFim) {
                          const iso = brToIso(overrideHoraFim);
                          if (iso) payload.completedDate = iso;
                        }
                        if (overrideHoraChegada) {
                          const iso = brToIso(overrideHoraChegada);
                          if (iso) {
                            payload.mission_started_at = iso;
                            payload.scheduled_date = iso;
                          }
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
                  <div className="space-y-1">
                    {(() => {
                      const horaInicial = os.hora_chegada_origem || os.missionStartedAt || os.scheduledDate;
                      const horaFinal = os.hora_fim_missao || os.completedDate;
                      const fmtDtHr = (v: string | null) => {
                        if (!v) return "—";
                        try {
                          const d = new Date(_eu(v));
                          return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
                        } catch { return "—"; }
                      };
                      const franquiaHoras = Number(b?.franquia_horas || os.contractValues?.franquia_horas || 0);
                      const horasExtras = hCalc > franquiaHoras && franquiaHoras > 0 ? hCalc - franquiaHoras : 0;
                      const fmtH = (h: number) => h > 0 ? `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}min` : "0h00";
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <FieldRow label="Data / Hora Inicial" value={fmtDtHr(horaInicial)} />
                            <FieldRow label="Data / Hora Final" value={fmtDtHr(horaFinal)} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FieldRow label="Total de Horas" value={fmtH(hCalc)} accent="blue" />
                            <FieldRow label="Total de Extras" value={horasExtras > 0 ? fmtH(horasExtras) : "—"} accent={horasExtras > 0 ? "amber" : undefined} />
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="border-t border-neutral-100 pt-3 space-y-1">
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="KM Inicial" value={kmChegada > 0 ? kmChegada.toLocaleString("pt-BR") : "—"} mono />
                      <FieldRow label="KM Final" value={kmFim > 0 ? kmFim.toLocaleString("pt-BR") : "—"} mono />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Total de KM Rodado" value={kmTotalCalc > 0 ? `${kmTotalCalc.toLocaleString("pt-BR")} km` : "—"} accent="blue" />
                      <FieldRow label="Total de KM Extra" value={kmExcCalc > 0 ? `${kmExcCalc.toLocaleString("pt-BR")} km` : "—"} accent={kmExcCalc > 0 ? "red" : undefined} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {b && (
              <>
                <div className="border-t border-neutral-100 pt-3 space-y-1">
                  <FieldRow label="Valor do Acionamento" value={fmt(acionamento)} accent="blue" bold />
                  {horaExtra > 0 && <FieldRow label="Valor Hora Extra" value={fmt(horaExtra)} accent="amber" bold />}
                  {kmExtraVal > 0 && <FieldRow label="Valor KM Excedente" value={fmt(kmExtraVal)} accent="violet" bold />}
                  <FieldRow label="Valor do Pedágio" value={fmt(pedagio)} bold />
                  {demaisCustos > 0 && <FieldRow label="Demais Custos" value={fmt(demaisCustos)} bold />}
                  {adNoturno > 0 && <FieldRow label="Adicional Noturno" value={fmt(adNoturno)} accent="violet" bold />}
                </div>

                <div className={`rounded-xl p-4 text-center border-2 ${resultado >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Valor Total da Missão</p>
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
                    {isDiretoria && (b.status === "FATURADO" || b.status === "PAGO") && (
                      <button
                        onClick={() => { if (confirm("Liberar esta nota faturada para refaturamento? O status voltará para 'A Verificar'.")) liberarFaturamentoMutation.mutate(b.id); }}
                        disabled={liberarFaturamentoMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                        data-testid="button-liberar-faturamento"
                      >
                        {liberarFaturamentoMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Liberar para Refaturamento
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
                    <p className="text-xs font-semibold text-neutral-700">{b.revisado_por} em {b.revisado_em ? new Date(_eu(b.revisado_em)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</p>
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

function FieldRow({ label, value, accent, mono, bold }: { label: string; value: string; accent?: "blue" | "amber" | "red" | "violet" | "green"; mono?: boolean; bold?: boolean }) {
  const accentColors: Record<string, string> = {
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-600",
    violet: "text-violet-700",
    green: "text-emerald-700",
  };
  const valColor = accent ? accentColors[accent] : "text-neutral-900";
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg border border-neutral-100" data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-black ${mono ? "font-mono" : ""} ${bold ? "font-black" : "font-bold"} ${valColor}`}>{value}</span>
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
