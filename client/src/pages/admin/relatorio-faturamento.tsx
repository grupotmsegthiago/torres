import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { authFetch, apiRequest, invalidateRelatedQueries, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText, Search, Printer, Loader2, FileSpreadsheet, ChevronDown, ChevronRight,
  Calculator, Calendar, Check, Receipt, Banknote, Send, Mail,
  Clock, AlertTriangle, User as UserIcon, RefreshCw, Eye, Plus, Trash2, ArrowDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { exportFormattedExcel } from "@/lib/excel-export";
import torresLogoPath from "@assets/WhatsApp_Image_2026-03-19_at_18.10.37_1773954659471.jpeg";
import { getRelatorioStatus, getRelatorioBadges } from "@shared/constants/mission-status";
import { OsDetailModal, NumInput } from "./boletim-medicao";

const fmt = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number | null | undefined, d = 0) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const _eu = (ts: string) => /[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z";
const fmtDate = (iso?: string | null) => iso ? new Date(_eu(iso)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtTime = (iso?: string | null) => iso ? new Date(_eu(iso)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
const fmtHHMM = (h: number) => {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};
const fmtDateDisp = (s: string) => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const extractCity = (addr: string) => {
  if (!addr) return "—";
  const upper = addr.toUpperCase().trim();
  const parts = upper.split(/[,\-\/]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts.find(p => !/^\d/.test(p) && p.length > 2 && !/^(SP|RJ|MG|PR|SC|RS|BA|GO|MT|MS|PA|AM|CE|PE|MA|PI|RN|PB|SE|AL|TO|RO|AC|AP|RR|ES|DF)$/.test(p));
    return city || parts[0];
  }
  return parts[0] || upper;
};

export default function RelatorioFaturamentoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";
  const [selectedClient, setSelectedClient] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${(last.getMonth() + 1).toString().padStart(2, "0")}-${last.getDate().toString().padStart(2, "0")}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  });
  const [reportGenerated, setReportGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [billings, setBillings] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [ordersMap, setOrdersMap] = useState<Map<number, any>>(new Map());
  const [vehiclesMap, setVehiclesMap] = useState<Map<number, any>>(new Map());
  const [selectedOs, setSelectedOs] = useState<any>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [overrideKmChegada, setOverrideKmChegada] = useState("");
  const [overrideKmFim, setOverrideKmFim] = useState("");
  const [overrideHoraChegada, setOverrideHoraChegada] = useState("");
  const [overrideHoraFim, setOverrideHoraFim] = useState("");
  const [pedagioValue, setPedagioValue] = useState("");
  const [reembolsoValue, setReembolsoValue] = useState("");
  const [acionamentoValue, setAcionamentoValue] = useState("");
  const [horaExtraValue, setHoraExtraValue] = useState("");
  const [kmExtraValue, setKmExtraValue] = useState("");
  const [adNoturnoValue, setAdNoturnoValue] = useState("");
  const [estadiaValue, setEstadiaValue] = useState("");
  const [pernoiteValue, setPernoiteValue] = useState("");
  const [demaisCustosValue, setDemaisCustosValue] = useState("");
  const [observacoesValue, setObservacoesValue] = useState("");
  const [recalcLoteLoading, setRecalcLoteLoading] = useState(false);
  const [faturaDialog, setFaturaDialog] = useState(false);
  const [faturaBillingType, setFaturaBillingType] = useState("BOLETO");
  const [billingSplits, setBillingSplits] = useState<Array<{ cnpj: string; razao_social: string; valor: string; label: string; profile_id?: number; save_profile: boolean }>>([]);
  const [faturaDueDate, setFaturaDueDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(15);
    return d.toISOString().split("T")[0];
  });
  const [sendDialog, setSendDialog] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [osModalLoading, setOsModalLoading] = useState(false);
  const [mismatchData, setMismatchData] = useState<null | {
    backendTotal: number;
    frontendTotal: number;
    diff: number;
    osCount: number;
    startDate: string;
    endDate: string;
    breakdown: Array<{
      billingId: string;
      serviceOrderId: number;
      osRef: string;
      status: string;
      dataMissao: string | null;
      route: string;
      fatAcionamento: number;
      fatHoraExtra: number;
      fatKm: number;
      despesasPedagio: number;
      fatAdicionalNoturno: number;
      fatTotalSalvo: number;
      fatComponentes: number;
      fatUsado: number;
      suspeito: boolean;
    }>;
  }>(null);
  const [zerandoIds, setZerandoIds] = useState<Set<string>>(new Set());

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => { const r = await authFetch("/api/clients"); return r.json(); },
  });

  const { data: contracts = [] } = useQuery<any[]>({
    queryKey: ["/api/escort/contracts"],
    queryFn: async () => { const r = await authFetch("/api/escort/contracts"); return r.json(); },
  });

  const { data: billingProfiles = [], refetch: refetchProfiles } = useQuery<any[]>({
    queryKey: ["/api/billing-profiles", selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const r = await authFetch(`/api/billing-profiles/${selectedClient}`);
      return r.json();
    },
    enabled: Boolean(selectedClient),
  });

  const billingIdsKey = useMemo(() => billings.map((b: any) => String(b.id)).sort().join(","), [billings]);
  const { data: approvalStatus, refetch: refetchApprovalStatus, isFetching: isCheckingApproval } = useQuery<{ active: any | null; recent: any[] }>({
    queryKey: ["/api/boletim/approval-status", selectedClient, billingIdsKey],
    queryFn: async () => {
      if (!selectedClient || !billingIdsKey) return { active: null, recent: [] };
      const r = await authFetch(`/api/boletim/approval-status?clientId=${selectedClient}&billingIds=${encodeURIComponent(billingIdsKey)}`);
      return r.json();
    },
    enabled: Boolean(selectedClient && billingIdsKey && reportGenerated),
    staleTime: 15000,
  });
  const activeApproval = approvalStatus?.active || null;

  const approvedBillings = useMemo(() => billings.filter(b => b.status === "APROVADA"), [billings]);
  const faturadoBillings = useMemo(() => billings.filter(b => b.status === "FATURADO" || b.status === "FATURADA"), [billings]);
  const approvedTotal = useMemo(() => approvedBillings.reduce((acc, b) => {
    const ct = contracts.find((c: any) => c.id === b.contract_id) || null;
    const n = (v: any) => Number(v) || 0;
    const fatAcio = n(b.fat_acionamento) || n(ct?.valor_acionamento);
    const fatKm = n(b.fat_km);
    const fatHE = n(b.fat_hora_extra);
    const fatPed = n(b.despesas_pedagio);
    const fatAdNot = n(b.fat_adicional_noturno);
    const fatEst = n(b.fat_estadia);
    const fatPer = n(b.fat_pernoite);
    const fatOutras = n(b.despesas_outras);
    const fatReemb = n(b.receitas_os);
    const total = n(b.fat_total) || (fatAcio + fatKm + fatHE + fatPed + fatAdNot + fatEst + fatPer + fatOutras + fatReemb);
    return acc + total;
  }, 0), [approvedBillings, contracts]);

  const liberarRefaturarMutation = useMutation({
    mutationFn: async (billingIds: string[]) => {
      const results = await Promise.allSettled(
        billingIds.map(id => apiRequest("POST", `/api/escort/billings/${id}/liberar-faturamento`))
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      const fail = results.length - ok;
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      invalidateRelatedQueries();
      setBillings(prev => prev.filter(b => b.status !== "FATURADO" && b.status !== "FATURADA"));
      if (fail === 0) toast({ title: "Liberadas", description: `${ok} OS liberada(s) para refaturamento.` });
      else toast({ title: "Liberação parcial", description: `${ok} liberada(s), ${fail} com erro.`, variant: "destructive" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const gerarFaturaMutation = useMutation({
    mutationFn: async ({ clientId, billingType, sendToAsaas, dueDate, startDate: sd, endDate: ed, expectedTotal, splits: sp }: { clientId: number; billingType: string; sendToAsaas: boolean; dueDate: string; startDate: string; endDate: string; expectedTotal: number; splits?: any[] }) => {
      return apiRequest("POST", `/api/boletim-medicao/gerar-fatura/${clientId}`, { billingType, sendToAsaas, dueDate, startDate: sd, endDate: ed, expectedTotal, splits: sp });
    },
    onSuccess: async (response: any) => {
      const data = await response.json?.() || response;
      const count = data?.missionsCount || 0;
      const val = data?.totalValue ? fmt(data.totalValue) : "";
      const splitCount = data?.splitCount || 0;
      const title = splitCount > 1 ? `${splitCount} Faturas Geradas!` : "Fatura Gerada!";
      const desc = splitCount > 1
        ? `${count} missão(ões) dividida(s) em ${splitCount} faturas por CNPJ. Total: ${val}`
        : `${count} missão(ões) consolidada(s). ${val}`;
      toast({ title, description: desc });
      setFaturaDialog(false);
      invalidateRelatedQueries("billing");
      handleGenerate();
    },
    onError: (err: Error) => {
      // apiRequest joga Error("<status>: <body>"). Tenta extrair JSON estruturado
      // (caso TOTAL_MISMATCH) e abrir tela de conferência ao invés do toast.
      const raw = err.message || "";
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.code === "TOTAL_MISMATCH" && Array.isArray(parsed.breakdown)) {
            setFaturaDialog(false);
            setMismatchData({
              backendTotal: Number(parsed.backendTotal) || 0,
              frontendTotal: Number(parsed.frontendTotal) || 0,
              diff: Number(parsed.diff) || 0,
              osCount: Number(parsed.osCount) || parsed.breakdown.length,
              startDate: String(parsed.startDate || ""),
              endDate: String(parsed.endDate || ""),
              breakdown: parsed.breakdown,
            });
            return;
          }
        } catch {}
      }
      toast({ title: "Erro ao gerar fatura", description: err.message, variant: "destructive" });
    },
  });

  const zerarFatTotalMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/zerar-fat-total`);
    },
    onSuccess: (_resp, billingId) => {
      // Atualiza dialog removendo a OS corrigida e recalculando totais.
      setMismatchData(prev => {
        if (!prev) return prev;
        const restantes = prev.breakdown.filter(r => r.billingId !== billingId);
        const novoBackend = restantes.reduce((s, r) => {
          const usado = r.fatTotalSalvo > 0 ? r.fatTotalSalvo : r.fatComponentes;
          return s + usado;
        }, 0);
        return {
          ...prev,
          backendTotal: Number(novoBackend.toFixed(2)),
          diff: Number(Math.abs(novoBackend - prev.frontendTotal).toFixed(2)),
          osCount: restantes.length,
          breakdown: restantes,
        };
      });
      setZerandoIds(prev => {
        const next = new Set(prev);
        next.delete(billingId);
        return next;
      });
      invalidateRelatedQueries("billing");
      toast({ title: "Valor zerado", description: "fat_total da OS foi zerado. Recalcule a OS para gerar valor correto." });
    },
    onError: (err: Error, billingId) => {
      setZerandoIds(prev => {
        const next = new Set(prev);
        next.delete(billingId);
        return next;
      });
      toast({ title: "Erro ao zerar", description: err.message, variant: "destructive" });
    },
  });

  const openSendDialog = () => {
    const cd = clients.find((c: any) => c.id.toString() === selectedClient);
    setSendEmail(cd?.email || cd?.contact_email || "");
    setSendDialog(true);
  };

  const handleSendToClient = async (force = false) => {
    if (!sendEmail || !sendEmail.includes("@")) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido do cliente.", variant: "destructive" });
      return;
    }
    setSendLoading(true);
    try {
      const billingIds = billings.map((b: any) => b.id);
      const cd = clients.find((c: any) => c.id.toString() === selectedClient);
      const resp = await authFetch("/api/boletim/enviar-aprovacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: Number(selectedClient),
          clientName: cd?.name || displayClientName,
          clientEmail: sendEmail,
          periodStart: startDate,
          periodEnd: endDate,
          billingIds,
          totalValue: grandTotal,
          osCount: billingIds.length,
          force,
        }),
      });
      const result = await resp.json();
      if (resp.status === 409 && result?.existing) {
        const ex = result.existing;
        const when = ex.sentAt ? new Date(ex.sentAt).toLocaleString("pt-BR") : "data anterior";
        const who = ex.sentBy ? ` por ${ex.sentBy}` : "";
        const proceed = window.confirm(`${result.message}\n\nÚltimo envio: ${when}${who}\nStatus: ${ex.status}\n\nDeseja FORÇAR um novo envio mesmo assim?`);
        if (proceed) {
          setSendLoading(false);
          await handleSendToClient(true);
          return;
        }
        toast({ title: "Envio cancelado", description: result.message, variant: "destructive" });
        return;
      }
      if (!resp.ok) throw new Error(result.message || "Erro ao enviar");
      if (result.emailError) {
        toast({ title: "Boletim criado, mas e-mail falhou", description: result.emailError, variant: "destructive" });
      } else {
        toast({ title: "Enviado com sucesso!", description: `E-mail com Excel enviado para ${sendEmail}. Aguardando aprovação do cliente.` });
      }
      setSendDialog(false);
      await refetchApprovalStatus();
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSendLoading(false);
    }
  };

  const handleSetMonth = (v: string) => {
    setSelectedMonth(v);
    if (!v) return;
    const [y, m] = v.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    setStartDate(`${y}-${m.toString().padStart(2, "0")}-01`);
    setEndDate(`${y}-${m.toString().padStart(2, "0")}-${last.toString().padStart(2, "0")}`);
  };

  const handleSetFortnight = (p: 1 | 2) => {
    const ref = startDate ? new Date(startDate + "T12:00:00") : new Date();
    const y = ref.getFullYear(), m = ref.getMonth();
    const mm = (m + 1).toString().padStart(2, "0");
    if (p === 1) { setStartDate(`${y}-${mm}-01`); setEndDate(`${y}-${mm}-15`); }
    else { const last = new Date(y, m + 1, 0).getDate(); setStartDate(`${y}-${mm}-16`); setEndDate(`${y}-${mm}-${last}`); }
  };

  const handleGenerate = async () => {
    if (!selectedClient) { alert("Selecione um cliente."); return; }
    setIsLoading(true);
    setReportGenerated(false);
    try {
      const params = new URLSearchParams({ client_id: selectedClient, from: `${startDate}T00:00:00`, to: `${endDate}T23:59:59` });
      const [billingsRes, ordersRes, vehiclesRes] = await Promise.all([
        authFetch(`/api/escort/billings?${params}`),
        authFetch(`/api/service-orders`),
        authFetch(`/api/vehicles`),
      ]);
      const billingsData = await billingsRes.json();
      const ordersData = await ordersRes.json();
      const vehiclesData = await vehiclesRes.json();

      const oMap = new Map<number, any>();
      (ordersData || []).forEach((o: any) => oMap.set(o.id, o));
      const vMap = new Map<number, any>();
      (vehiclesData || []).forEach((v: any) => vMap.set(v.id, v));
      setOrdersMap(oMap);
      setVehiclesMap(vMap);

      const approved = (billingsData || [])
        .filter((b: any) => b.status === "APROVADA" || b.status === "FATURADO" || b.status === "FATURADA" || b.status === "PAGO" || b.status === "CANCELADA" || b.status === "CANCELADO" || b.status === "A_VERIFICAR" || b.status === "PENDENTE" || b.status === "ENVIADA_APROVACAO")
        .map((b: any) => {
          const so = oMap.get(b.service_order_id);
          if (so) {
            if (!b.origem && so.origin) b.origem = so.origin;
            if (!b.destino && so.destination) b.destino = so.destination;
            if (!b.placa_viatura && so.vehicleId) {
              const veh = vMap.get(so.vehicleId);
              if (veh) b.placa_viatura = veh.plate;
            }
            if (!b.placa_escoltado && so.escortedVehiclePlate) b.placa_escoltado = so.escortedVehiclePlate;
            if (!b.os_number && so.osNumber) b.os_number = so.osNumber;
            if (!b.data_missao && so.scheduledDate) b.data_missao = so.scheduledDate;
            if (!b.completed_date && so.completedDate) b.completed_date = so.completedDate;
            b._so_status = so.status;
            b._so_mission_status = so.missionStatus || so.mission_status || "";
            b._so_cancellation_reason = so.cancellationReason || so.cancellation_reason || "";
          }
          return b;
        });

      setBillings(approved);
      setReportGenerated(true);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar relatório.");
    } finally {
      setIsLoading(false);
    }
  };

  const clientData = clients.find((c: any) => c.id.toString() === selectedClient);
  const displayClientName = clientData?.name || "";

  const getContractForBilling = (b: any) => {
    return contracts.find((c: any) => c.id === b.contract_id) || null;
  };

  const invalidateAllRelated = () => {
    invalidateRelatedQueries("billing");
    queryClient.invalidateQueries({ queryKey: ["/api/boletim-medicao/os-concluidas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
  };

  const refreshAfterModalAction = () => {
    invalidateAllRelated();
    handleGenerate();
  };

  const aprovarMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "APROVADA" });
    },
    onSuccess: () => {
      refreshAfterModalAction();
      toast({ title: "OS Aprovada", description: "Boletim aprovado com sucesso." });
      setSelectedOs(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const rejeitarMutation = useMutation({
    mutationFn: async ({ billingId, motivo }: { billingId: string; motivo: string }) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/revisar`, { acao: "REJEITADA", motivo_rejeicao: motivo });
    },
    onSuccess: () => {
      refreshAfterModalAction();
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
      refreshAfterModalAction();
      toast({ title: "Cálculo realizado", description: "Billing recalculado com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro ao calcular", description: err.message, variant: "destructive" }),
  });

  const reabrirMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/reabrir`);
    },
    onSuccess: () => {
      refreshAfterModalAction();
      toast({ title: "Reaberta", description: "OS voltou para 'A Verificar'." });
    },
    onError: (err: Error) => toast({ title: "Erro ao reabrir", description: err.message, variant: "destructive" }),
  });

  const liberarFaturamentoMutation = useMutation({
    mutationFn: async (billingId: string) => {
      return apiRequest("POST", `/api/escort/billings/${billingId}/liberar-faturamento`);
    },
    onSuccess: () => {
      refreshAfterModalAction();
      toast({ title: "Liberada", description: "Nota liberada para refaturamento." });
    },
    onError: (err: Error) => toast({ title: "Erro ao liberar", description: err.message, variant: "destructive" }),
  });

  const salvarBillingMutation = useMutation({
    mutationFn: async ({ billingId, payload }: { billingId: string; payload: Record<string, any> }) => {
      return apiRequest("PATCH", `/api/escort/billings/${billingId}/salvar`, { ...payload, recalcular: false });
    },
    onSuccess: () => {
      refreshAfterModalAction();
      toast({ title: "Salvo", description: "Valores manuais salvos." });
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ osId, data }: { osId: number; data: any }) => {
      return apiRequest("PATCH", `/api/boletim-medicao/os/${osId}/diretoria-override`, data);
    },
    onSuccess: () => {
      refreshAfterModalAction();
      setEditingFields(false);
      toast({ title: "Atualizado", description: "Campos alterados e billing recalculado." });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const getBillingStatus = (os: any) => {
    const b = os.billing;
    if (!b) return { label: "Sem Cálculo", color: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" };
    const info = getRelatorioStatus(os.status || os._so_status || "concluida", b.status);
    return { label: info.label, color: info.badgeClass, dot: info.dotClass };
  };

  const isLiveOs = (os: any) => os.status !== "recusada" && os.status !== "cancelada" && (os.status === "em_andamento" || (os.status === "agendada" && os.missionStartedAt)) && os.missionStatus !== "encerrada";

  const openOsModal = async (billingId: string) => {
    const billing = billings.find((x: any) => x.id === billingId);
    if (!billing) return;

    setOsModalLoading(true);

    let so: any = ordersMap.get(billing.service_order_id) || {};
    let veh: any = null;

    try {
      const freshSoRes = await authFetch(`/api/service-orders/${billing.service_order_id}`);
      const freshSo = freshSoRes.ok ? await freshSoRes.json() : null;

      if (!freshSo) {
        toast({ title: "Aviso", description: "Não foi possível atualizar os dados da OS. Exibindo dados do cache." });
      }

      if (freshSo) {
        so = freshSo;
        const newOrdersMap = new Map(ordersMap);
        newOrdersMap.set(billing.service_order_id, freshSo);
        setOrdersMap(newOrdersMap);
      }

      if (so.vehicleId) {
        try {
          const vRes = await authFetch(`/api/vehicles/${so.vehicleId}`);
          if (vRes.ok) {
            veh = await vRes.json();
            const newVehiclesMap = new Map(vehiclesMap);
            newVehiclesMap.set(so.vehicleId, veh);
            setVehiclesMap(newVehiclesMap);
          }
        } catch (vehErr) {
          console.warn("Error fetching vehicle data:", vehErr);
        }
      }
    } catch (err) {
      console.error("Error fetching fresh OS data:", err);
      toast({ title: "Aviso", description: "Não foi possível atualizar os dados da OS. Exibindo dados do cache.", variant: "destructive" });
    } finally {
      const ct = getContractForBilling(billing);

      const os = {
        id: billing.service_order_id,
        osNumber: billing.os_number || so.osNumber,
        clientName: billing.client_name,
        clientId: billing.client_id,
        status: so.status || billing._so_status || "concluida",
        missionStatus: so.missionStatus || so.mission_status || billing._so_mission_status || "",
        missionStartedAt: so.missionStartedAt || so.mission_started_at,
        scheduledDate: so.scheduledDate || so.scheduled_date || billing.data_missao,
        completedDate: so.completedDate || so.completed_date || billing.completed_date,
        origin: billing.origem || so.origin,
        destination: billing.destino || so.destination,
        km_chegada_origem: so.km_chegada_origem || billing.km_inicial,
        km_inicial: billing.km_inicial,
        km_final: billing.km_final || so.km_final,
        hora_chegada_origem: so.hora_chegada_origem,
        hora_fim_missao: so.hora_fim_missao || so.completedDate,
        vehiclePlate: billing.placa_viatura || (so.vehicleId ? (veh?.plate || vehiclesMap.get(so.vehicleId)?.plate) : null),
        vehicleModel: so.vehicleId ? (veh?.model || vehiclesMap.get(so.vehicleId)?.model) : null,
        employee1Name: billing.vigilante_name,
        employee2Name: billing.vigilante2_name,
        escortedVehiclePlate: billing.placa_escoltado || so.escortedVehiclePlate,
        escortedDriverName: billing.motorista_escoltado || so.escortedDriverName,
        contractName: ct?.name || ct?.contract_name,
        contractValues: ct || {},
        billing: billing,
        pedagioEstimado: so.pedagioEstimado || 0,
        createdAt: so.createdAt || billing.created_at,
        escortContractId: billing.contract_id,
        assignedEmployeeId: so.assignedEmployeeId,
        stepLogs: so.stepLogs || [],
      };

      setSelectedOs(os);
      setPedagioValue(String(billing.despesas_pedagio || so.pedagioEstimado || "0"));
      setReembolsoValue(String(billing.receitas_os || 0));
      setAcionamentoValue(String(billing.fat_acionamento || 0));
      setHoraExtraValue(String(billing.fat_hora_extra || 0));
      setKmExtraValue(String(billing.fat_km || 0));
      setAdNoturnoValue(String(billing.fat_adicional_noturno || 0));
      setEstadiaValue(String(billing.fat_estadia || 0));
      setPernoiteValue(String(billing.fat_pernoite || 0));
      setDemaisCustosValue(String(billing.despesas_outras || 0));
      setObservacoesValue(billing.observacoes || "");
      setEditingFields(false);
      setOverrideKmChegada(so.km_chegada_origem != null ? String(so.km_chegada_origem) : String(billing.km_inicial || ""));
      setOverrideKmFim(so.km_final != null ? String(so.km_final) : String(billing.km_final || ""));
      const fmtDtLocal = (v: string | null) => {
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
      setOverrideHoraChegada(fmtDtLocal(so.missionStartedAt) || fmtDtLocal(so.scheduledDate) || "");
      setOverrideHoraFim(fmtDtLocal(so.hora_fim_missao) || fmtDtLocal(so.completedDate) || "");
      setOsModalLoading(false);
    }
  };

  const handleRecalcLote = async () => {
    const ids = billings
      .filter((b: any) => !["FATURADO", "PAGO"].includes(b.status))
      .map((b: any) => b.id);
    if (ids.length === 0) {
      toast({ title: "Nada para recalcular", description: "Não há billings pendentes neste período." });
      return;
    }
    if (!confirm(`Recalcular ${ids.length} billing(s) usando a fórmula atualizada?\n\nBillings faturados/pagos serão ignorados.`)) return;

    setRecalcLoteLoading(true);
    try {
      const r = await authFetch("/api/escort/billings/recalcular-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing_ids: ids }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message || "Erro");
      toast({
        title: "Recálculo concluído",
        description: `${result.success} recalculado(s), ${result.skipped} ignorado(s), ${result.errors} erro(s).`,
      });
      handleGenerate();
    } catch (err: any) {
      toast({ title: "Erro ao recalcular", description: err.message, variant: "destructive" });
    } finally {
      setRecalcLoteLoading(false);
    }
  };

  const getPeriodLabel = () => {
    if (!startDate || !endDate) return "";
    const sDate = new Date(startDate + "T12:00:00");
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = months[sDate.getMonth()];
    const year = sDate.getFullYear();
    const sDay = sDate.getDate();
    const eDate = new Date(endDate + "T12:00:00");
    const eDay = eDate.getDate();
    const lastDay = new Date(year, sDate.getMonth() + 1, 0).getDate();
    if (sDay === 1 && eDay === lastDay) return `GERAL — ${month}/${year} — MÊS COMPLETO`;
    if (sDay === 1 && eDay === 15) return `GERAL — ${month}/${year} — 1ª QUINZENA`;
    if (sDay === 16) return `GERAL — ${month}/${year} — 2ª QUINZENA`;
    return `GERAL — ${month}/${year} — ${fmtDateDisp(startDate)} A ${fmtDateDisp(endDate)}`;
  };

  const rowsData = useMemo(() => {
    const sorted = [...billings].sort((a, b) => {
      const da = new Date(a.data_missao || a.created_at || 0).getTime();
      const db = new Date(b.data_missao || b.created_at || 0).getTime();
      if (da !== db) return da - db;
      const ta = (a.horario_inicio || "").toString();
      const tb = (b.horario_inicio || "").toString();
      return ta.localeCompare(tb);
    });
    return sorted.map((b) => {
      const ct = getContractForBilling(b);
      const n = (v: any) => Number(v) || 0;
      const franquiaHoras = n(ct?.franquia_horas) || n(b.franquia_horas);
      const franquiaKm = n(ct?.franquia_km) || n(ct?.franquia_minima_km) || n(b.km_franquia);
      const valorHoraExtra = n(ct?.valor_hora_extra) || n(b.valor_hora_extra);
      const valorKmExtra = n(ct?.valor_km_extra) || n(ct?.valor_km_carregado) || n(b.valor_km_extra);
      const valorAcionamento = n(b.fat_acionamento) || n(ct?.valor_acionamento);
      const horasMissao = n(b.horas_missao);
      const kmTotal = n(b.km_total);
      const kmFaturado = n(b.km_faturado);
      const kmExcedente = n(b.km_excedente) || Math.max(0, kmTotal - franquiaKm);
      const hrExcedente = Math.max(0, horasMissao - franquiaHoras);

      // RECUSADA = operacional não atendeu → R$ 0 em tudo
      // CANCELADA = cliente cancelou mas equipe foi acionada → cobra acionamento + extras (hora extra, KM extra, pedágio)
      const isRecusada = b.status === "RECUSADA" || b.status === "REJEITADA" || b._so_status === "recusada";
      const isCancelada = !isRecusada && (b.status === "CANCELADA" || b.status === "CANCELADO" || b._so_status === "cancelada");
      const zeroOut = isRecusada;
      const horaExtraFracionada = ct?.hora_extra_fracionada !== false;
      const fatHoraExtraFallback = horaExtraFracionada
        ? Math.round(hrExcedente * 60) * (Math.floor(valorHoraExtra / 60 * 100) / 100)
        : Math.ceil(hrExcedente) * valorHoraExtra;
      const fatHoraExtra = zeroOut ? 0 : (n(b.fat_hora_extra) || fatHoraExtraFallback);
      const fatKmExtra = zeroOut ? 0 : (n(b.fat_km) || Math.round(kmExcedente * valorKmExtra * 100) / 100);
      const fatPedagio = zeroOut ? 0 : n(b.despesas_pedagio);
      const fatAdNoturno = zeroOut ? 0 : n(b.fat_adicional_noturno);
      const valorAcionamentoFinal = zeroOut ? 0 : valorAcionamento;
      const fatEstadia = zeroOut ? 0 : n(b.fat_estadia);
      const fatPernoite = zeroOut ? 0 : n(b.fat_pernoite);
      const fatOutras = zeroOut ? 0 : n(b.despesas_outras);
      const fatReembolso = zeroOut ? 0 : n(b.receitas_os);
      const fatTotal = zeroOut ? 0 : (isCancelada
        ? (valorAcionamento + fatKmExtra + fatHoraExtra + fatPedagio + fatAdNoturno + fatEstadia + fatPernoite + fatOutras + fatReembolso)
        : (n(b.fat_total) || (valorAcionamento + fatKmExtra + fatHoraExtra + fatPedagio + fatAdNoturno + fatEstadia + fatPernoite + fatOutras + fatReembolso)));

      const osNum = b.os_number || (b.service_order_id ? `OS-${b.service_order_id}` : "—");
      const origem = b.origem || b.origin || "";
      const destino = b.destino || b.destination || "";
      const routeStr = (origem && destino) ? `${extractCity(origem)} × ${extractCity(destino)}` : (origem || destino || "—");
      const viatura = b.placa_viatura || b.vehicle_plate || "—";
      const escoltado = b.placa_escoltado || b.escorted_vehicle_plate || "—";

      // DATA/HORA INÍCIO = sempre o AGENDAMENTO (o que o cliente solicitou),
      // nunca o "início real" (missionStartedAt) nem o "fim".
      // Prioridade: scheduled_date (do snapshot da OS) → data_missao → created_at.
      const sched = b.snapshot_data?.scheduled_date || b.scheduled_date || b.scheduledDate;
      const dataMissao = sched || b.data_missao || b.created_at;
      const dataFimMissao = b.completed_date || b.finished_at || dataMissao;
      const horarioAgendadoStr =
        (b.horario_agendado && b.horario_agendado.toString().substring(0, 5)) ||
        (sched ? fmtTime(sched) : null) ||
        (b.data_missao ? fmtTime(b.data_missao) : null);

      return {
        id: osNum,
        billingId: b.id,
        route: routeStr,
        activationFee: valorAcionamentoFinal,
        franchiseHours: franquiaHoras,
        franchiseKm: franquiaKm,
        unitHr: valorHoraExtra,
        unitKm: valorKmExtra,
        startDate: fmtDate(dataMissao),
        startTime: horarioAgendadoStr || (b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTime(dataMissao)),
        viatura,
        cargoPlate: escoltado,
        endDate: fmtDate(dataFimMissao),
        endTime: b.horario_fim ? b.horario_fim.substring(0, 5) : fmtTime(dataFimMissao),
        kmStart: n(b.km_inicial),
        kmEnd: n(b.km_final),
        kmTotal,
        timeTotal: fmtHHMM(horasMissao),
        kmExtraQtd: kmExcedente,
        kmExtraUnit: valorKmExtra,
        kmExtraTotal: fatKmExtra,
        hrExtraQtd: hrExcedente,
        hrExtraUnit: valorHoraExtra,
        hrExtraTotal: fatHoraExtra,
        tollVal: fatPedagio,
        totalGeral: fatTotal,
        franchiseHoursFmt: fmtHHMM(franquiaHoras),
        status: b.status,
        invoiceId: b.invoice_id || null,
        osStatus: b._so_status || "",
        osMissionStatus: b._so_mission_status || "",
        osCancellationReason: b._so_cancellation_reason || "",
        motivoRejeicao: b.motivo_rejeicao || "",
        observacoesBilling: b.observacoes || "",
        revisadoPor: b.revisado_por || "",
        clientName: b.client_name,
        horasMissaoNum: horasMissao,
        originRaw: origem,
        originCity: origem ? extractCity(origem) : "—",
        destinationCity: destino ? extractCity(destino) : "—",
        _raw: b,
      };
    });
  }, [billings, contracts]);

  const dashboardStats = useMemo(() => {
    if (!rowsData.length) return null;
    const byDay = new Map<string, { count: number; km: number; hours: number; total: number }>();
    const byOrigin = new Map<string, { count: number; km: number; hours: number; total: number }>();
    const byVehicle = new Map<string, { count: number; km: number; hours: number; total: number; routes: Set<string> }>();
    let totalKm = 0;
    let totalHours = 0;
    let totalMissoes = 0;

    // Dashboard exclui RECUSADAS (operacional não atendeu, R$ 0, não conta).
    // Conta apenas APROVADAS + CANCELADAS pelo cliente (que cobram acionamento+extras).
    const dashRows = rowsData.filter(r => r.osStatus !== "recusada");

    for (const r of dashRows) {
      totalKm += r.kmTotal;
      totalHours += r.horasMissaoNum;
      totalMissoes += 1;

      const day = r.startDate || "—";
      const d = byDay.get(day) || { count: 0, km: 0, hours: 0, total: 0 };
      d.count += 1; d.km += r.kmTotal; d.hours += r.horasMissaoNum; d.total += r.totalGeral;
      byDay.set(day, d);

      const origin = r.originCity || "—";
      const o = byOrigin.get(origin) || { count: 0, km: 0, hours: 0, total: 0 };
      o.count += 1; o.km += r.kmTotal; o.hours += r.horasMissaoNum; o.total += r.totalGeral;
      byOrigin.set(origin, o);

      const veic = (r.cargoPlate && r.cargoPlate !== "—") ? r.cargoPlate : "—";
      const v = byVehicle.get(veic) || { count: 0, km: 0, hours: 0, total: 0, routes: new Set<string>() };
      v.count += 1; v.km += r.kmTotal; v.hours += r.horasMissaoNum; v.total += r.totalGeral;
      if (r.route) v.routes.add(r.route);
      byVehicle.set(veic, v);
    }

    const parseDayKey = (s: string) => {
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
    };
    const days = Array.from(byDay.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => parseDayKey(a.day).localeCompare(parseDayKey(b.day)));

    const origins = Array.from(byOrigin.entries())
      .map(([origin, v]) => ({ origin, ...v }))
      .sort((a, b) => b.count - a.count);

    const vehicles = Array.from(byVehicle.entries())
      .map(([veic, v]) => ({ veic, ...v, routes: Array.from(v.routes) }))
      .sort((a, b) => b.count - a.count);

    return { days, origins, vehicles, totalKm, totalHours, totalMissoes };
  }, [rowsData]);

  const grandTotal = useMemo(() => rowsData.reduce((s, r) => s + r.totalGeral, 0), [rowsData]);
  // approvedTotal (fonte única de verdade p/ faturamento) já é declarado
  // na linha ~149 a partir de approvedBillings (status === "APROVADA"),
  // com a mesma fórmula que o banner roxo e o backend usam.

  const openFaturaDialog = () => {
    const cd = clients.find((c: any) => c.id.toString() === selectedClient);
    const ptDays = Number(cd?.payment_terms_days) || 15;
    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + ptDays);
    setFaturaDueDate(suggestedDate.toISOString().split("T")[0]);

    if (billingProfiles.length > 0) {
      setBillingSplits(billingProfiles.map((p: any) => ({
        cnpj: p.cnpj || "",
        razao_social: p.razao_social || "",
        valor: "",
        label: p.label || "",
        profile_id: p.id,
        save_profile: false,
      })));
    } else {
      setBillingSplits([{
        cnpj: cd?.cnpj || "",
        razao_social: cd?.name || "",
        valor: approvedTotal.toFixed(2),
        label: "Principal",
        save_profile: false,
      }]);
    }
    setFaturaDialog(true);
  };

  const splitsTotal = useMemo(() => billingSplits.reduce((s, sp) => s + (Number(sp.valor) || 0), 0), [billingSplits]);
  const splitsRemainder = approvedTotal - splitsTotal;
  const splitsValid = billingSplits.length > 0 && billingSplits.every(sp => sp.cnpj && sp.razao_social && Number(sp.valor) > 0) && Math.abs(splitsRemainder) < 0.01;

  const updateSplit = (index: number, field: string, value: string | boolean) => {
    setBillingSplits(prev => prev.map((sp, i) => i === index ? { ...sp, [field]: value } : sp));
  };
  const addSplit = () => {
    setBillingSplits(prev => [...prev, { cnpj: "", razao_social: "", valor: "", label: "", save_profile: true }]);
  };
  const removeSplit = (index: number) => {
    setBillingSplits(prev => prev.filter((_, i) => i !== index));
  };
  const fillRemainder = (index: number) => {
    const otherSum = billingSplits.reduce((s, sp, i) => i === index ? s : s + (Number(sp.valor) || 0), 0);
    const remainder = Math.max(0, approvedTotal - otherSum);
    updateSplit(index, "valor", remainder.toFixed(2));
  };

  const handlePrint = () => {
    const printArea = document.getElementById("print-area");
    if (!printArea) return;
    const pw = window.open("", "_blank", "width=1400,height=900");
    if (!pw) { window.print(); return; }
    const cloned = printArea.cloneNode(true) as HTMLElement;
    cloned.style.cssText = "width:100%;padding:0;margin:0;overflow:visible;";
    const scrollDiv = cloned.querySelector(".report-table-scroll") as HTMLElement;
    if (scrollDiv) scrollDiv.style.cssText = "overflow:visible;max-height:none;width:100%;";
    const table = cloned.querySelector("table") as HTMLElement;
    if (table) table.style.cssText = "table-layout:auto;width:100%;border-collapse:collapse;";
    const colgroup = cloned.querySelector("colgroup");
    if (colgroup) colgroup.remove();

    const printCSS = `
      @page { size: A4 landscape; margin: 4mm 5mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 6.5pt; color: #374151; letter-spacing: 0.15px; }
      table { table-layout: auto; width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
      td, th { padding: 3px 5px; font-size: 6.5pt; border: 0.5px solid #d1d5db; line-height: 1.4; white-space: nowrap; text-align: center; vertical-align: middle; letter-spacing: 0.2px; }
      td.route-cell { white-space: normal; word-wrap: break-word; text-align: left; min-width: 80px; max-width: 160px; font-weight: 700; font-size: 5.5pt; line-height: 1.25; color: #111; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
      tbody tr:nth-child(odd) { background-color: #ffffff; }
      tbody tr:nth-child(even) { background-color: #f9fafb; }
      .group-hdr th { font-size: 7pt; padding: 4px 4px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 1.5px solid #111; border-top: 1.5px solid #111; }
      .sub-hdr th { font-size: 5.5pt; padding: 3px 4px; font-weight: 800; border-bottom: 1px solid #374151; text-transform: uppercase; letter-spacing: 0.3px; }
      .boletim-header { margin-bottom: 4mm; text-align: center; padding-bottom: 2mm; border-bottom: 1.5px solid #111; }
      .boletim-header h1 { font-size: 13pt; margin: 0; color: #111; letter-spacing: 1px; }
      .subtitle-line { font-size: 9pt; margin: 1.5mm 0 0.5mm; color: #374151; letter-spacing: 0.3px; }
      .ref-line { font-size: 7pt; margin: 0; color: #6b7280; letter-spacing: 0.2px; }
      .sign-section { margin-top: 10mm; break-inside: avoid; display: flex; justify-content: space-between; padding: 0 10mm; border-top: 1px solid #111; padding-top: 4mm; }
      .sign-box { width: 60mm; text-align: center; }
      .digital-signature { font-size: 13pt; font-family: 'Dancing Script', 'Brush Script MT', cursive; font-weight: 700; color: #111; border-bottom: 1.5px solid #374151; padding-bottom: 1px; display: inline-block; }
      .sign-role { font-size: 7pt; font-weight: 900; text-transform: uppercase; color: #111; letter-spacing: 0.8px; margin-top: 1mm; }
      .sign-cnpj { font-size: 6pt; color: #6b7280; }
      .sign-system { font-size: 6pt; color: #9ca3af; }
      .sign-cliente { font-size: 7pt; font-weight: 900; text-transform: uppercase; color: #111; }
      .sign-data { font-size: 6pt; color: #6b7280; margin-top: 1mm; }
      tfoot tr { break-inside: avoid; border-top: 2.5px solid #111; }
      tfoot td { font-size: 7pt; font-weight: 900; padding: 4px 6px; letter-spacing: 0.3px; }
      .print-watermark { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: 300px !important; height: auto !important; opacity: 0.06 !important; pointer-events: none !important; z-index: 0 !important; }
    `;

    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletim de Medição — Torres</title><link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet"><style>${printCSS}</style></head><body></body></html>`);
    const wrapper = pw.document.createElement("div");
    wrapper.appendChild(cloned);
    pw.document.body.appendChild(wrapper);
    pw.document.close();
    setTimeout(() => {
      const pageW = 1045;
      const tbl = pw.document.querySelector("table");
      if (tbl && tbl.scrollWidth > pageW) {
        const scale = Math.max(pageW / tbl.scrollWidth, 0.45);
        wrapper.style.zoom = String(scale);
      }
      setTimeout(() => { pw.focus(); pw.print(); setTimeout(() => pw.close(), 2000); }, 300);
    }, 600);
  };

  const handleExportExcel = useCallback(async () => {
    if (rowsData.length === 0) return;
    const clientLabel = displayClientName || "CLIENTE";
    const isOmega = clientLabel.toUpperCase().includes("OMEGA SOLUTIONS");
    const isLuft = clientLabel.toUpperCase().includes("INTEC") || clientLabel.toUpperCase().includes("LUFT");
    console.log("[Excel] clientLabel:", clientLabel, "isLuft:", isLuft, "isOmega:", isOmega, "rows:", rowsData.length);

    if (isLuft) {
      const filteredRows = rowsData.filter(r => r.osStatus !== "recusada");
      const empIds = [...new Set(filteredRows.flatMap(r => {
        const b = r._raw;
        return [b?.vigilante_id, b?.vigilante2_id].filter(Boolean);
      }))];
      let cpfMap = new Map<number, string>();
      if (empIds.length > 0) {
        try {
          const resp = await authFetch(`/api/employees`);
          const emps: any[] = await resp.json();
          emps.forEach((e: any) => { if (e.cpf) cpfMap.set(e.id, e.cpf); });
        } catch { /* ignore */ }
      }
      const soMap = ordersMap;

      const fmtDtHrLuft = (dateStr: string, timeStr: string) => {
        if (!dateStr || dateStr === "—") return "-";
        return `${dateStr} - ${timeStr || "00:00"}`;
      };

      const luftHeaders = [
        "OS _ LUFT", "OS _ ESCOLTA", "SOLICITANTE",
        "AGENTE 01", "CPF AGENTE 01", "AGENTE 02", "CPF AGENTE 02",
        "PLACA VTR", "PLACA CAVALO", "MOTORISTA", "CPF",
        "ORIGEM", "DESTINO",
        "Data/Hora Inicial", "Data/Hora Saida Origem", "Data/Hora Chegada Destino", "Data/Hora Final",
        "KM Inicio", "KM Final", "Total KM",
        "Franquia KM", "KM excedente", "motivo km excedente",
        "Total Horas", "motivo horas excedentes",
        "Franquia de Horas", "Horas Exc",
        "Custo adicional Km Exc.", "Custo adicional Horas Exc.",
        "franquia (R$)", "Total KM Exc. (R$ )", "Total horas Exc. (R$ )",
        "Valor Pedagio", "Valor Total", "FATURAR",
      ];

      const luftDataRows = filteredRows.map(r => {
        const b = r._raw;
        const so = soMap.get(b?.service_order_id);
        const ag1Name = (b?.vigilante_name || "").split(" ").slice(0, 1).join(" ") || "-";
        const ag1Cpf = cpfMap.get(b?.vigilante_id) || "-";
        const ag2Name = (b?.vigilante2_name || "").split(" ").slice(0, 1).join(" ") || "-";
        const ag2Cpf = cpfMap.get(b?.vigilante2_id) || "-";
        const motorista = b?.motorista_escoltado || so?.escortedDriverName || so?.escorted_driver_name || "-";
        const solicitante = so?.requester_name || so?.requesterName || "-";
        const processoLuft = so?.processo_omega || so?.processoOmega || "";
        const origem = b?.origem || so?.origin || "-";
        const destino = b?.destino || so?.destination || "-";

        const horaFimBilling = b?.horario_fim ? b.horario_fim.substring(0, 5) : "";
        const horaInicioBilling = b?.horario_inicio ? b.horario_inicio.substring(0, 5) : "";
        const dtHrInicial = fmtDtHrLuft(r.startDate, r.startTime);
        const dtHrSaidaOrigem = fmtDtHrLuft(r.startDate, horaInicioBilling || r.startTime);
        const dtHrChegadaDestino = fmtDtHrLuft(r.endDate, horaFimBilling || r.endTime);
        const dtHrFinal = fmtDtHrLuft(r.endDate, horaFimBilling || r.endTime);

        const horasMissaoDecimal = r.horasMissaoNum / 24;
        const franquiaHorasDecimal = r.franchiseHours / 24;
        const hrExcDecimal = r.hrExtraQtd > 0 ? r.hrExtraQtd / 24 : "-";
        const kmExc = r.kmExtraQtd > 0 ? r.kmExtraQtd : r.kmExtraQtd === 0 ? 0 : "-";
        const totalKmExcRS = r.kmExtraTotal > 0 ? Number(r.kmExtraTotal) : (r.kmExtraTotal === 0 ? 0 : "-");
        const totalHorasExcRS = r.hrExtraTotal > 0 ? Number(r.hrExtraTotal) : (r.hrExtraTotal === 0 ? 0 : "-");

        return [
          processoLuft || "", r.id, solicitante,
          ag1Name, ag1Cpf, ag2Name, ag2Cpf,
          r.viatura, r.cargoPlate, motorista, "-",
          origem, destino,
          dtHrInicial, dtHrSaidaOrigem, dtHrChegadaDestino, dtHrFinal,
          r.kmStart > 0 ? r.kmStart : "", r.kmEnd > 0 ? r.kmEnd : "", r.kmTotal > 0 ? r.kmTotal : 0,
          r.franchiseKm, kmExc, "-",
          horasMissaoDecimal, "-",
          franquiaHorasDecimal, hrExcDecimal,
          Number(r.unitKm || 0), Number(r.unitHr || 0),
          Number(r.activationFee || 0), totalKmExcRS, totalHorasExcRS,
          Number(r.tollVal || 0), Number(r.totalGeral || 0), "INTEC",
        ];
      });

      const luftTotals: (string | number)[] = Array(35).fill("");
      luftTotals[33] = Number(grandTotal.toFixed(2));

      const periodShort = `${startDate.replace(/-/g, "")}_${endDate.replace(/-/g, "")}`;
      try {
        await exportFormattedExcel({
          title: "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL",
          subtitle: `REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — INTEC / LUFT LOGISTICS`,
          period: getPeriodLabel(),
          headers: luftHeaders,
          colWidths: [14, 12, 14, 10, 16, 10, 16, 10, 14, 14, 16, 16, 14, 20, 20, 22, 20, 10, 10, 10, 12, 12, 18, 12, 20, 14, 10, 18, 20, 12, 16, 18, 14, 14, 10],
          rows: luftDataRows as any,
          totalsRow: luftTotals,
          currencyColumns: [27, 28, 29, 30, 31, 32, 33],
          fileName: `Boletim_INTEC_LUFT_${periodShort}.xlsx`,
          sheetName: "Boletim de Medição",
          clientName: clientLabel,
          customLogoUrl: "/logo-luft.jpeg",
          customLogoExt: "jpeg",
          dualLogo: true,
        });
      } catch (err) {
        console.error("[Excel LUFT] Erro ao gerar:", err);
        alert("Erro ao gerar Excel LUFT. Verifique o console.");
      }
      return;
    }

    const baseHeaders = ["Nº", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM", "KM INICIAL", "KM FINAL", "KM TOTAL", "HR INÍCIO", "HR FIM", "HR TOTAL", "KM EXC.", "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PEDÁGIO", "TOTAL"];
    const baseDataRows = rowsData.filter(r => r.osStatus !== "recusada").map(r => [
      r.id, r.route, Number(r.activationFee || 0), r.franchiseHoursFmt, r.franchiseKm > 0 ? r.franchiseKm : 0, Number(r.unitHr || 0), Number(r.unitKm || 0),
      r.startDate, r.startTime, r.viatura, r.cargoPlate, r.endDate, r.endTime,
      r.kmStart > 0 ? r.kmStart : 0, r.kmEnd > 0 ? r.kmEnd : 0, r.kmTotal > 0 ? r.kmTotal : 0,
      r.startTime, r.endTime, r.timeTotal,
      r.kmExtraQtd > 0 ? r.kmExtraQtd : 0, r.kmExtraQtd > 0 ? Number(r.kmExtraUnit || 0) : 0, Number(r.kmExtraTotal || 0),
      r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : "0:00", r.hrExtraQtd > 0 ? Number(r.hrExtraUnit || 0) : 0, Number(r.hrExtraTotal || 0),
      Number(r.tollVal || 0), Number(r.totalGeral || 0),
    ]);

    let headers: string[];
    let dataRows: (string | number)[][];
    let colWidths: number[];
    let groupHeaders: { label: string; span: number }[];
    let currencyColumns: number[];
    let totalsCols: number;

    if (isOmega) {
      headers = ["Nº", "ROTA", "PROCESSO", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA R$", "KM EXTRA R$", "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM", "KM INICIAL", "KM FINAL", "KM TOTAL", "HR INÍCIO", "HR FIM", "HR TOTAL", "KM EXC.", "VLR KM", "TOT KM", "HR EXC.", "VLR HR", "TOT HR", "PEDÁGIO", "TOTAL"];
      dataRows = baseDataRows.map(row => {
        const newRow = [...row];
        newRow.splice(2, 0, "");
        return newRow;
      });
      colWidths = [10, 30, 14, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14];
      groupHeaders = [
        { label: "TABELA ACORDADA", span: 8 },
        { label: "INFORMAÇÕES DA VIAGEM", span: 6 },
        { label: "KILOMETRAGEM", span: 3 },
        { label: "HORÁRIOS", span: 3 },
        { label: "KM EXCEDENTE", span: 3 },
        { label: "HORA EXCEDENTE", span: 3 },
        { label: "VALORES", span: 2 },
      ];
      currencyColumns = [3, 6, 7, 21, 22, 24, 25, 26, 27];
      totalsCols = 28;
    } else {
      headers = baseHeaders;
      dataRows = baseDataRows;
      colWidths = [10, 30, 12, 7, 7, 12, 12, 12, 8, 10, 12, 12, 8, 9, 9, 8, 7, 7, 7, 6, 12, 12, 7, 12, 12, 12, 14];
      groupHeaders = [
        { label: "TABELA ACORDADA", span: 7 },
        { label: "INFORMAÇÕES DA VIAGEM", span: 6 },
        { label: "KILOMETRAGEM", span: 3 },
        { label: "HORÁRIOS", span: 3 },
        { label: "KM EXCEDENTE", span: 3 },
        { label: "HORA EXCEDENTE", span: 3 },
        { label: "VALORES", span: 2 },
      ];
      currencyColumns = [2, 5, 6, 20, 21, 23, 24, 25, 26];
      totalsCols = 27;
    }

    const totals: (string | number)[] = Array(totalsCols).fill("");
    totals[0] = "TOTAL";
    totals[totalsCols - 1] = Number(grandTotal.toFixed(2));

    const periodShort = `${startDate.replace(/-/g, "")}_${endDate.replace(/-/g, "")}`;
    try {
      await exportFormattedExcel({
        title: "BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL",
        subtitle: `REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — ${clientLabel}`,
        period: getPeriodLabel(),
        headers,
        groupHeaders,
        colWidths,
        rows: dataRows,
        totalsRow: totals,
        currencyColumns,
        fileName: `Boletim_${clientLabel.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20)}_${periodShort}.xlsx`,
        sheetName: "Boletim",
        clientName: clientLabel,
      });
    } catch (err) {
      console.error("[Excel] Erro ao gerar:", err);
      alert("Erro ao gerar Excel. Verifique o console.");
    }
  }, [rowsData, grandTotal, displayClientName, startDate, endDate, ordersMap]);

  const fontBase = "'Inter', 'Segoe UI', system-ui, sans-serif";
  const fontMono = "'Roboto Mono', 'SF Mono', 'Consolas', monospace";

  const cellStyle: React.CSSProperties = { border: "1px solid #d1d5db", padding: "5px 7px", fontSize: "10px", fontFamily: fontBase, textAlign: "center", whiteSpace: "nowrap", color: "#374151", lineHeight: "1.45", letterSpacing: "0.2px" };
  const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800, color: "#111827" };
  const cellMono: React.CSSProperties = { ...cellStyle, fontFamily: fontMono, fontSize: "9.5px", letterSpacing: "0.3px", color: "#1f2937" };
  const headerStyle: React.CSSProperties = { ...cellStyle, backgroundColor: "#f3f4f6", fontWeight: 800, fontSize: "8.5px", textTransform: "uppercase" as const, color: "#111", padding: "6px 7px", letterSpacing: "0.3px" };
  const groupHeaderStyle: React.CSSProperties = { border: "1px solid #000", backgroundColor: "#111", color: "#fff", fontWeight: 900, fontSize: "9.5px", textTransform: "uppercase" as const, padding: "7px 7px", letterSpacing: "0.6px", fontFamily: fontBase, textAlign: "center", whiteSpace: "nowrap", lineHeight: "1.3" };

  const bgKm = "#f8fafc";
  const bgHr = "#f1f5f9";
  const bgKmExc = "#e2e8f0";
  const bgHrExc = "#cbd5e1";
  const bgVal = "#e2e8f0";

  const hdrKm: React.CSSProperties = { ...headerStyle, backgroundColor: "#e2e8f0" };
  const hdrHr: React.CSSProperties = { ...headerStyle, backgroundColor: "#cbd5e1" };
  const hdrKmExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#94a3b8", color: "#fff" };
  const hdrHrExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#64748b", color: "#fff" };
  const hdrVal: React.CSSProperties = { ...headerStyle, backgroundColor: "#334155", color: "#fff" };

  const grpKm: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#334155" };
  const grpHr: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#1e293b" };
  const grpKmExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#0f172a" };
  const grpHrExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#020617" };
  const grpVal: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#000" };

  return (
    <AdminLayout>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print" data-testid="billing-report-controls">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3" data-testid="heading-billing-report">
              <FileText className="text-gray-700" /> Boletim de Medição — Relatório de Faturamento
            </h2>
            <p className="text-sm text-gray-500 mt-1">Relatório detalhado para conferência e faturamento por cliente.</p>
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Cliente</label>
              <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-black bg-white uppercase font-bold" value={selectedClient} onChange={e => setSelectedClient(e.target.value)} data-testid="select-billing-client">
                <option value="">Selecione...</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.nomeFantasia || c.nome_fantasia || c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-gray-500 uppercase block">Período</label>
                <div className="flex gap-2 items-center">
                  <input type="month" className="text-[11px] font-bold uppercase px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 outline-none cursor-pointer" value={selectedMonth} onChange={e => handleSetMonth(e.target.value)} data-testid="input-billing-month" />
                  <button onClick={() => handleSetFortnight(1)} className="text-[10px] font-black uppercase text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded border border-gray-200" data-testid="btn-fortnight-1">1ª Quinzena</button>
                  <button onClick={() => handleSetFortnight(2)} className="text-[10px] font-black uppercase text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded border border-gray-200" data-testid="btn-fortnight-2">2ª Quinzena</button>
                </div>
              </div>
              <div className="flex gap-2">
                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-billing-start" />
                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-billing-end" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-generate-report">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar
              </button>
              {reportGenerated && (
                <>
                  <button onClick={handleExportExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-export-excel">
                    <FileSpreadsheet size={18} /> Excel
                  </button>
                  <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-print-pdf">
                    <Printer size={18} /> PDF
                  </button>
                  <button onClick={openFaturaDialog} disabled={approvedBillings.length === 0} className={`${approvedBillings.length === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"} text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2`} data-testid="btn-gerar-fatura" title={approvedBillings.length === 0 ? "Todas as OS ja foram faturadas" : ""}>
                    <Receipt size={18} /> Gerar Fatura {approvedBillings.length > 0 ? `(${approvedBillings.length})` : faturadoBillings.length > 0 ? "(Faturadas)" : ""}
                  </button>
                  {(() => {
                    const blocked = !!activeApproval;
                    const blockedByPending = blocked && activeApproval.status === "PENDENTE";
                    const blockedByApproved = blocked && activeApproval.status === "APROVADO";
                    const cls = rowsData.length === 0 ? "bg-gray-400 cursor-not-allowed" : blockedByApproved ? "bg-emerald-600 hover:bg-emerald-700" : blockedByPending ? "bg-gray-400 hover:bg-gray-500" : "bg-blue-600 hover:bg-blue-700";
                    const label = blockedByApproved ? "Cliente aprovou" : blockedByPending ? "Aguardando cliente" : "Enviar para Cliente";
                    const tip = blocked ? `${blockedByApproved ? "Aprovado" : "Enviado"} em ${activeApproval.sent_at ? new Date(activeApproval.sent_at).toLocaleString("pt-BR") : "\u2014"}${activeApproval.sent_by ? " por " + activeApproval.sent_by : ""}. Clique para forçar reenvio.` : "";
                    return (
                      <button
                        onClick={() => {
                          if (rowsData.length === 0) return;
                          if (blocked) {
                            const when = activeApproval.sent_at ? new Date(activeApproval.sent_at).toLocaleString("pt-BR") : "data anterior";
                            const who = activeApproval.sent_by ? ` por ${activeApproval.sent_by}` : "";
                            const ok = window.confirm(blockedByApproved ? `Estas OS já foram APROVADAS pelo cliente em ${when}${who}.\n\nReenviar mesmo assim?` : `Boletim já enviado em ${when}${who} e aguardando resposta do cliente.\n\nReenviar (forçando) mesmo assim?`);
                            if (!ok) return;
                          }
                          openSendDialog();
                        }}
                        disabled={rowsData.length === 0}
                        className={`${cls} text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2`}
                        title={tip}
                        data-testid="btn-enviar-cliente"
                      >
                        {blockedByApproved ? <Check size={18} /> : blockedByPending ? <Clock size={18} /> : <Send size={18} />}
                        {label}
                      </button>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {reportGenerated && activeApproval && (
          <div
            className={`mt-4 no-print rounded-xl p-3 flex items-center gap-3 justify-between border ${
              activeApproval.status === "APROVADO"
                ? "bg-emerald-50 border-emerald-300"
                : "bg-blue-50 border-blue-300"
            }`}
            data-testid="banner-aprovacao-status"
          >
            <div className="flex items-center gap-3">
              {activeApproval.status === "APROVADO" ? (
                <Check size={20} className="text-emerald-600 shrink-0" />
              ) : (
                <Clock size={20} className="text-blue-600 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-bold ${activeApproval.status === "APROVADO" ? "text-emerald-900" : "text-blue-900"}`} data-testid="text-aprovacao-status-title">
                  {activeApproval.status === "APROVADO"
                    ? `Boletim aprovado pelo cliente${activeApproval.approved_by_name ? " (" + activeApproval.approved_by_name + ")" : ""}`
                    : "Boletim já enviado para o cliente — aguardando aprovação"}
                </p>
                <p className={`text-xs ${activeApproval.status === "APROVADO" ? "text-emerald-700" : "text-blue-700"} flex items-center gap-2 flex-wrap`}>
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> {activeApproval.sent_at ? new Date(activeApproval.sent_at).toLocaleDateString("pt-BR") : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {activeApproval.sent_at ? new Date(activeApproval.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserIcon size={12} /> {activeApproval.sent_by || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mail size={12} /> {activeApproval.client_email || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText size={12} /> {activeApproval.os_count || (activeApproval.billing_ids || []).length} OS — {fmt(Number(activeApproval.total_value || 0))}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={() => refetchApprovalStatus()}
              disabled={isCheckingApproval}
              className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              data-testid="btn-refresh-approval-status"
            >
              <RefreshCw size={12} className={isCheckingApproval ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
        )}

        {reportGenerated && rowsData.length === 0 && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mt-4 text-center" data-testid="text-no-results">
          <p className="text-gray-400 font-bold">Nenhum boletim aprovado encontrado para o período selecionado.</p>
        </div>
      )}

      {reportGenerated && faturadoBillings.length > 0 && approvedBillings.length === 0 && (
        <div className="mt-4 no-print bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-3 justify-between" data-testid="banner-todas-faturadas">
          <div className="flex items-center gap-3">
            <Check size={20} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Todas as {faturadoBillings.length} OS neste periodo ja foram faturadas
              </p>
              <p className="text-xs text-amber-600">Para gerar nova fatura, exclua a fatura existente primeiro na tela de Faturas, ou libere as OS abaixo.</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!confirm(`Liberar todas as ${faturadoBillings.length} OS faturadas para refaturamento? O status voltará para 'A Verificar' e a cobrança vinculada deverá ser regerada.`)) return;
              liberarRefaturarMutation.mutate(faturadoBillings.map((b: any) => String(b.id)));
            }}
            disabled={liberarRefaturarMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase shadow-sm flex items-center gap-2 disabled:opacity-50 shrink-0"
            data-testid="btn-liberar-todas-refaturar"
          >
            {liberarRefaturarMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
            Liberar p/ Refaturar ({faturadoBillings.length})
          </button>
        </div>
      )}

      {reportGenerated && faturadoBillings.length > 0 && approvedBillings.length > 0 && (
        <div className="mt-4 no-print bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 justify-between" data-testid="banner-parcial-faturadas">
          <div className="flex items-center gap-3">
            <Check size={16} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">
              <span className="font-bold">{faturadoBillings.length} OS ja faturada{faturadoBillings.length > 1 ? "s" : ""}</span> neste periodo (marcadas em amarelo). Somente as {approvedBillings.length} aprovadas serao incluidas na nova fatura.
            </p>
          </div>
          <button
            onClick={() => {
              if (!confirm(`Liberar as ${faturadoBillings.length} OS faturadas para refaturamento? O status voltará para 'A Verificar' e a cobrança vinculada deverá ser regerada.`)) return;
              liberarRefaturarMutation.mutate(faturadoBillings.map((b: any) => String(b.id)));
            }}
            disabled={liberarRefaturarMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            data-testid="btn-liberar-parcial-refaturar"
          >
            {liberarRefaturarMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}
            Liberar Faturadas
          </button>
        </div>
      )}

      {reportGenerated && approvedBillings.length > 0 && (
        <div className="mt-4 no-print bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between" data-testid="banner-fatura-aprovadas">
          <div className="flex items-center gap-3">
            <Receipt size={20} className="text-indigo-600" />
            <div>
              <p className="text-sm font-bold text-indigo-900">
                {approvedBillings.length} medição{approvedBillings.length > 1 ? "ões" : ""} pronta{approvedBillings.length > 1 ? "s" : ""} para fatura — {fmt(approvedTotal)}
              </p>
              <p className="text-xs text-indigo-600">Clique em "Gerar Fatura" para emitir o boleto + NFS-e dos itens aprovados</p>
            </div>
          </div>
          <button
            onClick={openFaturaDialog}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
            data-testid="btn-gerar-fatura-banner"
          >
            <Banknote size={18} />
            Gerar Fatura
          </button>
        </div>
      )}

      {reportGenerated && rowsData.length > 0 && (() => {
        const effectiveLabel = (r: typeof rowsData[number]) => getRelatorioStatus(r.osStatus, r.status, (r as any).osMissionStatus).label;
        // FONTE ÚNICA DE VERDADE: aprovadas = b.status === "APROVADA" (mesma
        // regra que o backend POST /boletim-medicao/gerar-fatura aplica). Isso
        // garante que o número exibido aqui é EXATAMENTE o que será cobrado.
        const aprovadasRows = rowsData.filter(r => String(r.status || "").toUpperCase() === "APROVADA");
        const canceladasRows = rowsData.filter(r => effectiveLabel(r) === "Cancelada");
        const recusadasRows = rowsData.filter(r => effectiveLabel(r) === "Recusada");
        const faturadasRows = rowsData.filter(r => {
          const st = String(r.status || "").toUpperCase();
          return st === "FATURADO" || st === "FATURADA" || st === "PAGO";
        });
        const pendentesRows = rowsData.filter(r => {
          const lbl = effectiveLabel(r);
          return lbl === "A Verificar" || lbl === "Pendente" || lbl === "Enviada Aprovação";
        });
        const sumTotal = (arr: typeof rowsData) => arr.reduce((s, r) => s + r.totalGeral, 0);
        const aprovadasTotal = sumTotal(aprovadasRows);
        const pendentesTotal = sumTotal(pendentesRows);
        const canceladasTotal = sumTotal(canceladasRows);
        const faturadasTotal = sumTotal(faturadasRows);
        // Total p/ Faturamento = APENAS aprovadas. É o valor que o botão
        // "Gerar Fatura" vai cobrar. Canceladas/Recusadas/A_Verificar/Faturadas
        // são contadas como info, mas NÃO entram nesse total.
        const totalFaturamento = aprovadasTotal;
        const totalCount = aprovadasRows.length;
        const tooltip = "Total p/ Faturamento = soma das OS APROVADAS (mesma base que o botão 'Gerar Fatura' usa). Canceladas, Recusadas e A Verificar não entram.";
        return (
        <div className="mt-4 no-print bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5" data-testid="stat-aprovadas" title="Soma no Total p/ Faturamento">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Aprovadas</p>
              <p className="text-lg font-black text-emerald-900 font-mono">{aprovadasRows.length}</p>
              <p className="text-[10px] font-bold text-emerald-800 font-mono">{fmt(aprovadasTotal)}</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5" data-testid="stat-pendentes" title="Não entra no Total — precisa ser revisada antes">
              <p className="text-[9px] font-black uppercase tracking-wider text-yellow-700">A Verificar</p>
              <p className="text-lg font-black text-yellow-900 font-mono">{pendentesRows.length}</p>
              <p className="text-[10px] font-bold text-yellow-800 font-mono">{fmt(pendentesTotal)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5" data-testid="stat-canceladas" title="Cliente cancelou após acionamento — cobra acionamento + extras">
              <p className="text-[9px] font-black uppercase tracking-wider text-red-700">Canceladas</p>
              <p className="text-lg font-black text-red-900 font-mono">{canceladasRows.length}</p>
              <p className="text-[10px] font-bold text-red-800 font-mono">{fmt(canceladasTotal)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5" data-testid="stat-recusadas" title="Operacional não atendeu — não entra no faturamento">
              <p className="text-[9px] font-black uppercase tracking-wider text-orange-700">Recusadas</p>
              <p className="text-lg font-black text-orange-900 font-mono">{recusadasRows.length}</p>
              <p className="text-[10px] font-bold text-orange-800 font-mono">R$ 0,00</p>
            </div>
            <div className="bg-gray-900 border border-gray-900 rounded-lg px-3 py-2.5" data-testid="stat-total" title={tooltip}>
              <p className="text-[9px] font-black uppercase tracking-wider text-gray-300">Total p/ Faturamento</p>
              <p className="text-lg font-black text-white font-mono">{totalCount} OS</p>
              <p className="text-[10px] font-bold text-white font-mono">{fmt(totalFaturamento)}</p>
              <p className="text-[8px] font-medium text-gray-400 mt-0.5">Apenas Aprovadas</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3" title={tooltip}>
            <Calculator size={18} className="text-gray-700" />
            <span className="text-sm font-bold text-gray-700 flex-1">
              {totalCount} OS aprovada{totalCount === 1 ? "" : "s"} &middot; Total p/ Faturamento: <span className="text-black font-black">{fmt(totalFaturamento)}</span>
              {canceladasRows.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">{canceladasRows.length} cancelada{canceladasRows.length > 1 ? "s" : ""} ({fmt(canceladasTotal)} — não contam)</span>
              )}
              {recusadasRows.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">+ {recusadasRows.length} recusada{recusadasRows.length > 1 ? "s" : ""} (não contam)</span>
              )}
              {pendentesRows.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded">{pendentesRows.length} a verificar (não contam)</span>
              )}
              {faturadasRows.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{faturadasRows.length} já faturada{faturadasRows.length > 1 ? "s" : ""}</span>
              )}
            </span>
            <button
              onClick={handleRecalcLote}
              disabled={recalcLoteLoading || billings.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-lg text-[11px] font-bold uppercase shadow-sm disabled:opacity-50 shrink-0 transition-colors"
              title="Recalcular todos os billings pendentes usando a fórmula atualizada"
              data-testid="button-recalcular-todos"
            >
              {recalcLoteLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Recalcular Todos
            </button>
          </div>
          <div className="space-y-1">
            {rowsData.map((r, i) => {
              const isExpanded = expandedRows.has(r.billingId);
              return (
                <div key={r.billingId} className={`border rounded-lg ${isExpanded ? "border-gray-300 bg-gray-50" : "border-gray-100"}`}>
                  <div className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${r.status === "FATURADO" || r.status === "FATURADA" ? "bg-amber-50/60" : r.status === "REJEITADA" ? "bg-red-50/40" : (r.status === "CANCELADA" || r.status === "CANCELADO") ? "bg-red-50/40" : r.status === "A_VERIFICAR" ? "bg-yellow-50/40" : r.status === "PENDENTE" || r.status === "ENVIADA_APROVACAO" ? "bg-blue-50/30" : ""}`} onClick={() => setExpandedRows(prev => { const n = new Set(prev); n.has(r.billingId) ? n.delete(r.billingId) : n.add(r.billingId); return n; })} data-testid={`row-billing-${i}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isExpanded ? <ChevronDown size={14} className="text-gray-600 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      <span className="text-xs font-black text-black shrink-0">{r.id}</span>
                      {(r.status === "FATURADO" || r.status === "FATURADA" || r.status === "PAGO") && (
                        r.invoiceId ? (
                          <Link
                            href={`/admin/relatorio-nf?invoiceId=${r.invoiceId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] font-mono font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-300 hover:bg-indigo-100 hover:text-indigo-900 px-1.5 py-0.5 rounded shrink-0 transition-colors"
                            title={`Ver fatura #${r.invoiceId} no Relatório de NFs`}
                            data-testid={`link-invoice-${i}`}
                          >
                            FAT #{r.invoiceId} ↗
                          </Link>
                        ) : (
                          <span
                            className="text-[9px] font-black uppercase bg-red-50 text-red-700 border border-red-300 px-1.5 py-0.5 rounded shrink-0"
                            title="OS marcada como faturada, mas sem fatura vinculada no Asaas. Pode ter sido baixa manual incorreta."
                            data-testid={`alert-no-invoice-${i}`}
                          >
                            ⚠ SEM FATURA
                          </span>
                        )
                      )}
                      {(() => {
                        const badges = getRelatorioBadges(r.osStatus, r.status, (r as any).osMissionStatus);
                        return badges.map((info, idx) => (
                          <span key={idx} className={`text-[9px] font-black uppercase ${info.badgeClass} px-1.5 py-0.5 rounded shrink-0`} data-testid={`badge-status-${i}-${idx}`}>
                            {info.label}
                          </span>
                        ));
                      })()}
                      <span className="text-xs font-bold text-gray-500 truncate max-w-[200px]">{r.route}</span>
                      <span className="text-xs text-gray-400 shrink-0">{r.startDate}</span>
                      {r.status === "REJEITADA" && r.motivoRejeicao && (
                        <span className="text-[10px] font-bold text-red-600 truncate" title={`Rejeitado por ${r.revisadoPor || "—"}`} data-testid={`text-motivo-${i}`}>
                          · Motivo: {r.motivoRejeicao}
                        </span>
                      )}
                      {(r.status === "CANCELADA" || r.status === "CANCELADO") && (r.observacoesBilling || r.osCancellationReason) && (
                        <span className={`text-[10px] font-bold truncate ${r.osStatus === "recusada" ? "text-orange-600" : "text-red-600"}`} title={r.observacoesBilling || r.osCancellationReason} data-testid={`text-cancel-${i}`}>
                          · {(r.observacoesBilling || r.osCancellationReason).split("|")[0].trim()}
                        </span>
                      )}
                      {r.status === "A_VERIFICAR" && (
                        <span className="text-[10px] font-bold text-yellow-700 truncate" data-testid={`text-averificar-${i}`}>
                          · Aguardando revisão (não aprovada ainda)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-gray-500">{r.timeTotal}h</span>
                      <span className="text-xs font-bold text-gray-500">{fmtNum(r.kmTotal)} km</span>
                      <span className="text-sm font-black text-black">{fmt(r.totalGeral)}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-200 pt-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-gray-400 font-bold">Acionamento:</span> <span className="font-black">{fmt(r.activationFee)}</span></div>
                        <div><span className="text-gray-400 font-bold">Franquia:</span> <span className="font-black">{r.franchiseHoursFmt}h / {fmtNum(r.franchiseKm)} km</span></div>
                        <div><span className="text-gray-400 font-bold">KM Excedente:</span> <span className="font-black">{fmtNum(r.kmExtraQtd)} km = {fmt(r.kmExtraTotal)}</span></div>
                        <div><span className="text-gray-400 font-bold">Hora Extra:</span> <span className="font-black">{fmtHHMM(r.hrExtraQtd)} = {fmt(r.hrExtraTotal)}</span></div>
                        <div><span className="text-gray-400 font-bold">KM Inicial:</span> <span className="font-black">{fmtNum(r.kmStart)}</span></div>
                        <div><span className="text-gray-400 font-bold">KM Final:</span> <span className="font-black">{fmtNum(r.kmEnd)}</span></div>
                        <div><span className="text-gray-400 font-bold">Pedágio:</span> <span className="font-black">{fmt(r.tollVal)}</span></div>
                        <div><span className="text-gray-400 font-bold">Viatura:</span> <span className="font-black">{r.viatura}</span></div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button onClick={(e) => { e.stopPropagation(); openOsModal(r.billingId); }} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors" data-testid={`button-edit-billing-${i}`}>
                          <Eye size={11} /> Abrir Detalhes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {reportGenerated && rowsData.length > 0 && (
        <div id="print-area" className="mt-4 bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto" style={{ position: "relative" }}>
          <img src={torresLogoPath} alt="" className="print-watermark" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "400px", height: "auto", opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />
          <div className="boletim-header" style={{ marginBottom: "12px", textAlign: "center", paddingBottom: "8px", borderBottom: "2px solid #111", position: "relative", zIndex: 1 }}>
            <h1 style={{ fontSize: "18px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", color: "#111", margin: 0 }}>TORRES — SERVIÇOS TÁTICOS</h1>
            <p className="subtitle-line" style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", color: "#374151", margin: "4px 0 2px" }}>BOLETIM DE MEDIÇÃO — {displayClientName}</p>
            <p className="ref-line" style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
              REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — {getPeriodLabel()}
            </p>
          </div>

          <div className="report-table-scroll" style={{ overflow: "auto", maxHeight: "70vh", position: "relative", zIndex: 1 }}>
            <table style={{ borderCollapse: "collapse", border: "1.5px solid #111", tableLayout: "auto", width: "100%", minWidth: "1500px" }}>
              <thead>
                <tr className="group-hdr">
                  <th rowSpan={2} style={{ ...groupHeaderStyle, backgroundColor: "#111", width: "32px" }}>#</th>
                  <th colSpan={7} style={groupHeaderStyle}>TABELA ACORDADA</th>
                  <th colSpan={6} style={{ ...groupHeaderStyle, backgroundColor: "#1f2937" }}>INFORMAÇÕES DA VIAGEM</th>
                  <th colSpan={3} style={grpKm}>KILOMETRAGEM</th>
                  <th colSpan={3} style={grpHr}>HORÁRIOS</th>
                  <th colSpan={3} style={grpKmExc}>KM EXCEDENTE</th>
                  <th colSpan={3} style={grpHrExc}>HORA EXCEDENTE</th>
                  <th colSpan={2} style={grpVal}>VALORES</th>
                </tr>
                <tr className="sub-hdr">
                  <th style={headerStyle}>Nº</th>
                  <th style={headerStyle}>ROTA</th>
                  <th style={headerStyle}>VALOR</th>
                  <th style={headerStyle}>HR FRANQ</th>
                  <th style={headerStyle}>KM FRANQ</th>
                  <th style={headerStyle}>HR EXTRA</th>
                  <th style={headerStyle}>KM EXTRA</th>
                  <th style={headerStyle}>DATA INÍCIO</th>
                  <th style={headerStyle}>HORA INÍCIO</th>
                  <th style={headerStyle}>VIATURA</th>
                  <th style={headerStyle}>VEÍC. ESCOLT.</th>
                  <th style={headerStyle}>DATA FIM</th>
                  <th style={headerStyle}>HORA FIM</th>
                  <th style={hdrKm}>INICIAL</th>
                  <th style={hdrKm}>FINAL</th>
                  <th style={hdrKm}>TOTAL</th>
                  <th style={hdrHr}>INICIAL</th>
                  <th style={hdrHr}>FINAL</th>
                  <th style={hdrHr}>TOTAL</th>
                  <th style={hdrKmExc}>KM</th>
                  <th style={hdrKmExc}>VALOR</th>
                  <th style={hdrKmExc}>TOTAL</th>
                  <th style={hdrHrExc}>HORA</th>
                  <th style={hdrHrExc}>VALOR</th>
                  <th style={hdrHrExc}>TOTAL</th>
                  <th style={hdrVal}>PEDÁGIO</th>
                  <th style={hdrVal}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rowsData.filter(r => r.osStatus !== "recusada").map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellBold, fontSize: "10.5px", backgroundColor: "#f3f4f6", color: "#111", fontWeight: 900 }}>{i + 1}</td>
                    <td style={{ ...cellBold, fontSize: "10.5px" }}>{r.id}</td>
                    <td className="route-cell" style={{ ...cellStyle, textAlign: "left", whiteSpace: "normal", wordWrap: "break-word", fontWeight: 700, fontSize: "9px", lineHeight: "1.3", color: "#111" }}>{r.route}</td>
                    <td style={{ ...cellMono, fontWeight: 700 }}>{fmt(r.activationFee)}</td>
                    <td style={{ ...cellMono }}>{r.franchiseHoursFmt}</td>
                    <td style={{ ...cellMono }}>{r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : "—"}</td>
                    <td style={{ ...cellMono }}>{fmt(r.unitHr)}</td>
                    <td style={{ ...cellMono }}>{fmt(r.unitKm)}</td>
                    <td style={cellStyle}>{r.startDate}</td>
                    <td style={{ ...cellMono }}>{r.startTime}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: "#111", letterSpacing: "0.5px" }}>{r.viatura}</td>
                    <td style={{ ...cellStyle, letterSpacing: "0.3px" }}>{r.cargoPlate}</td>
                    <td style={cellStyle}>{r.endDate}</td>
                    <td style={{ ...cellMono }}>{r.endTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm }}>{r.kmStart > 0 ? fmtNum(r.kmStart) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm }}>{r.kmEnd > 0 ? fmtNum(r.kmEnd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm, fontWeight: 700 }}>{r.kmTotal > 0 ? fmtNum(r.kmTotal) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.startTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.endTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr, fontWeight: 700 }}>{r.timeTotal}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmt(r.kmExtraUnit) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc, fontWeight: 700 }}>{r.kmExtraTotal > 0 ? fmt(r.kmExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmt(r.hrExtraUnit) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc, fontWeight: 700 }}>{r.hrExtraTotal > 0 ? fmt(r.hrExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgVal }}>{r.tollVal > 0 ? fmt(r.tollVal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgVal, fontWeight: 900, fontSize: "10px", color: "#111" }}>{fmt(r.totalGeral)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2.5px solid #111" }}>
                  <td colSpan={27} style={{ ...cellBold, textAlign: "right", fontSize: "11px", padding: "7px 10px", letterSpacing: "0.5px" }}>TOTAL GERAL</td>
                  <td style={{ ...cellBold, fontSize: "11px", fontFamily: fontMono, backgroundColor: "#111", color: "#fff", padding: "7px 10px", letterSpacing: "0.3px" }}>{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {dashboardStats && (
            <div className="dashboard-section" style={{ marginTop: "30px", paddingTop: "15px", borderTop: "2px solid #111", position: "relative", zIndex: 1 }} data-testid="section-dashboard">
              <h3 style={{ fontSize: "14px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", color: "#111", marginBottom: "12px", paddingBottom: "6px", borderBottom: "1px solid #d1d5db" }}>
                Dashboard Operacional — Resumo do Período
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "16px" }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "10px" }} data-testid="card-total-missoes">
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total de Missões</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111", fontFamily: fontMono }}>{dashboardStats.totalMissoes}</div>
                </div>
                <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "10px" }} data-testid="card-total-km">
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>KM Rodados</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111", fontFamily: fontMono }}>{fmtNum(Math.round(dashboardStats.totalKm))}</div>
                </div>
                <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "6px", padding: "10px" }} data-testid="card-total-horas">
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: "0.5px" }}>Horas de Operação</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111", fontFamily: fontMono }}>{fmtHHMM(dashboardStats.totalHours)}</div>
                </div>
                <div style={{ background: "#fce7f3", border: "1px solid #fbcfe8", borderRadius: "6px", padding: "10px" }} data-testid="card-total-faturado">
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#9d174d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Faturamento</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111", fontFamily: fontMono }}>{fmt(grandTotal)}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Missões por dia */}
                <div data-testid="dashboard-by-day">
                  <h4 style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", color: "#111", marginBottom: "6px" }}>Missões por Dia</h4>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", fontSize: "10px" }}>
                    <thead>
                      <tr style={{ background: "#1f2937", color: "#fff" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700 }}>Data</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Missões</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>KM</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Horas</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>R$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardStats.days.map((d) => (
                        <tr key={d.day} style={{ borderTop: "1px solid #e5e7eb" }} data-testid={`row-day-${d.day}`}>
                          <td style={{ padding: "4px 8px", fontFamily: fontMono, fontWeight: 700 }}>{d.day}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono, fontWeight: 700 }}>{d.count}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtNum(Math.round(d.km))}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtHHMM(d.hours)}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmt(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Missões por origem */}
                <div data-testid="dashboard-by-origin">
                  <h4 style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", color: "#111", marginBottom: "6px" }}>Missões por Origem</h4>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", fontSize: "10px" }}>
                    <thead>
                      <tr style={{ background: "#1f2937", color: "#fff" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700 }}>Origem</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Missões</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>KM</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Horas</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>R$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardStats.origins.map((o) => (
                        <tr key={o.origin} style={{ borderTop: "1px solid #e5e7eb" }} data-testid={`row-origin-${o.origin}`}>
                          <td style={{ padding: "4px 8px", fontWeight: 700 }}>{o.origin}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono, fontWeight: 700 }}>{o.count}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtNum(Math.round(o.km))}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtHHMM(o.hours)}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmt(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ranking de viaturas */}
              <div style={{ marginTop: "16px" }} data-testid="dashboard-by-vehicle">
                <h4 style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", color: "#111", marginBottom: "6px" }}>
                  Veículos Escoltados — Ranking por Volume de Missões
                </h4>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", fontSize: "10px" }}>
                  <thead>
                    <tr style={{ background: "#1f2937", color: "#fff" }}>
                      <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, width: "40px" }}>#</th>
                      <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700 }}>Veículo Escoltado</th>
                      <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Missões</th>
                      <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>KM Rodados</th>
                      <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Horas</th>
                      <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>Faturamento</th>
                      <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700 }}>Rotas Atendidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardStats.vehicles.map((v, i) => (
                      <tr key={v.veic} style={{ borderTop: "1px solid #e5e7eb", background: i === 0 ? "#fef9c3" : i === 1 ? "#fef3c7" : i === 2 ? "#fef3c7" : undefined }} data-testid={`row-vehicle-${v.veic}`}>
                        <td style={{ padding: "4px 8px", fontWeight: 900, fontFamily: fontMono, color: i < 3 ? "#a16207" : "#111" }}>{i + 1}{i === 0 ? "º" : ""}</td>
                        <td style={{ padding: "4px 8px", fontWeight: 900, fontFamily: fontMono, letterSpacing: "0.5px" }}>{v.veic}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono, fontWeight: 900 }}>{v.count}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtNum(Math.round(v.km))}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono }}>{fmtHHMM(v.hours)}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: fontMono, fontWeight: 700 }}>{fmt(v.total)}</td>
                        <td style={{ padding: "4px 8px", fontSize: "9px", color: "#374151" }}>{v.routes.slice(0, 3).join(" · ")}{v.routes.length > 3 ? ` +${v.routes.length - 3}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="sign-section" style={{ marginTop: "30px", display: "flex", justifyContent: "space-between", paddingTop: "15px", borderTop: "1px solid #111", alignItems: "flex-end", position: "relative", zIndex: 1 }}>
            <div className="sign-box" style={{ textAlign: "center", width: "250px" }}>
              <p className="digital-signature" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "20px", fontWeight: 700, color: "#111", borderBottom: "1.5px solid #374151", paddingBottom: "2px", display: "inline-block" }}>Torres Vigilância</p>
              <p className="sign-role" style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", color: "#111", letterSpacing: "0.8px", marginTop: "4px" }}>TORRES VIGILÂNCIA PATRIMONIAL</p>
              <p className="sign-cnpj" style={{ fontSize: "9px", color: "#6b7280" }}>CNPJ: 36.982.392/0001-89</p>
              <p className="sign-system" style={{ fontSize: "9px", color: "#9ca3af" }}>Sistema Torres — Gestão Operacional</p>
            </div>
            <div className="sign-box" style={{ textAlign: "center", width: "250px" }}>
              <p style={{ borderBottom: "1.5px solid #374151", height: "30px", marginBottom: "4px" }}>&nbsp;</p>
              <p className="sign-cliente" style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", color: "#111" }}>{displayClientName}</p>
              <p className="sign-data" style={{ fontSize: "9px", color: "#6b7280", marginTop: "4px" }}>Data: ____/____/________</p>
            </div>
          </div>
        </div>
      )}

      <Dialog open={faturaDialog} onOpenChange={setFaturaDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
              <Receipt className="w-5 h-5 text-indigo-600" /> Gerar Fatura — Divisão Multi-CNPJ
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Divida o valor entre CNPJs diferentes. O sistema memoriza os perfis para próximas faturas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Cliente / Tomador</p>
                  <p className="text-sm font-black text-indigo-900 uppercase" data-testid="text-fatura-client">{displayClientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Valor Total Aprovado</p>
                  <p className="text-xl font-black font-mono text-indigo-800" data-testid="text-fatura-total">{fmt(approvedTotal)}</p>
                  <p className="text-[10px] text-indigo-500">{approvedBillings.length} OS aprovada{approvedBillings.length === 1 ? "" : "s"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Divisão por CNPJ</p>
                <button
                  onClick={addSplit}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase"
                  data-testid="btn-add-cnpj-split"
                >
                  <Plus size={12} /> Adicionar CNPJ
                </button>
              </div>

              {billingSplits.map((sp, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2" data-testid={`split-row-${idx}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                      {sp.label || `CNPJ ${idx + 1}`}
                    </p>
                    {billingSplits.length > 1 && (
                      <button onClick={() => removeSplit(idx)} className="text-red-400 hover:text-red-600" data-testid={`btn-remove-split-${idx}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-gray-500">CNPJ</Label>
                      <Input
                        value={sp.cnpj}
                        onChange={(e) => updateSplit(idx, "cnpj", e.target.value)}
                        placeholder="00.000.000/0000-00"
                        className="text-xs font-mono h-8"
                        data-testid={`input-split-cnpj-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-gray-500">Razão Social</Label>
                      <Input
                        value={sp.razao_social}
                        onChange={(e) => updateSplit(idx, "razao_social", e.target.value)}
                        placeholder="Nome da empresa"
                        className="text-xs h-8"
                        data-testid={`input-split-razao-${idx}`}
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-[10px] font-bold text-gray-500">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sp.valor}
                        onChange={(e) => updateSplit(idx, "valor", e.target.value)}
                        placeholder="0.00"
                        className="text-xs font-mono h-8 font-bold"
                        data-testid={`input-split-valor-${idx}`}
                      />
                    </div>
                    <button
                      onClick={() => fillRemainder(idx)}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1.5 rounded whitespace-nowrap"
                      title="Preencher com o saldo restante para fechar a conta"
                      data-testid={`btn-fill-remainder-${idx}`}
                    >
                      <ArrowDown size={12} /> Usar Saldo Restante
                    </button>
                    {!sp.profile_id && (
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sp.save_profile}
                          onChange={(e) => updateSplit(idx, "save_profile", e.target.checked)}
                          className="rounded border-gray-300"
                          data-testid={`chk-save-profile-${idx}`}
                        />
                        Salvar
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className={`rounded-lg p-3 flex items-center justify-between ${Math.abs(splitsRemainder) < 0.01 ? "bg-emerald-50 border border-emerald-200" : splitsRemainder < 0 ? "bg-red-50 border border-red-300" : "bg-amber-50 border border-amber-200"}`}>
              <div className="flex items-center gap-2">
                {Math.abs(splitsRemainder) < 0.01 ? (
                  <Check size={14} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={14} className={splitsRemainder < 0 ? "text-red-500" : "text-amber-500"} />
                )}
                <span className={`text-xs font-bold ${Math.abs(splitsRemainder) < 0.01 ? "text-emerald-700" : splitsRemainder < 0 ? "text-red-700" : "text-amber-700"}`}>
                  {Math.abs(splitsRemainder) < 0.01
                    ? "Valores conferem com o total aprovado"
                    : splitsRemainder < 0
                    ? `Excedeu o teto em ${fmt(Math.abs(splitsRemainder))}`
                    : `Faltam ${fmt(splitsRemainder)} para fechar o total`}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Soma Parcelas</p>
                <p className="text-sm font-black font-mono" data-testid="text-splits-total">{fmt(splitsTotal)}</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Empresa Emissora</p>
              <p className="text-xs font-bold text-gray-800">TORRES VIGILÂNCIA PATRIMONIAL EIRELI</p>
              <p className="text-[10px] text-gray-500 font-mono">CNPJ 36.982.392/0001-89 &bull; CNAE 7870 — Escolta Armada</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Vencimento</Label>
                <Input type="date" value={faturaDueDate} onChange={(e) => setFaturaDueDate(e.target.value)} className="mt-1 text-xs font-mono" data-testid="input-fatura-due-date" />
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Tipo de Cobrança</Label>
                <Select value={faturaBillingType} onValueChange={setFaturaBillingType}>
                  <SelectTrigger className="mt-1 text-xs" data-testid="select-fatura-billing-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                    <SelectItem value="PIX">PIX (QR Code)</SelectItem>
                    <SelectItem value="UNDEFINED">Boleto + PIX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setFaturaDialog(false)} className="text-xs font-bold uppercase" data-testid="button-cancel-fatura">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                gerarFaturaMutation.mutate({
                  clientId: parseInt(selectedClient),
                  billingType: faturaBillingType,
                  sendToAsaas: true,
                  dueDate: faturaDueDate,
                  startDate,
                  endDate,
                  expectedTotal: approvedTotal,
                  splits: billingSplits.length > 1 ? billingSplits.map(sp => ({
                    cnpj: sp.cnpj,
                    razao_social: sp.razao_social,
                    valor: Number(sp.valor),
                    label: sp.label,
                    profile_id: sp.profile_id,
                    save_profile: sp.save_profile,
                  })) : undefined,
                } as any);
              }}
              disabled={gerarFaturaMutation.isPending || rowsData.length === 0 || !splitsValid}
              className={`text-xs font-black uppercase gap-2 px-6 ${splitsValid ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 cursor-not-allowed"}`}
              data-testid="button-confirm-fatura"
            >
              {gerarFaturaMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              {billingSplits.length > 1 ? `GERAR ${billingSplits.length} FATURAS` : "GERAR FATURA"} {fmt(approvedTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
              <Mail className="w-5 h-5 text-blue-600" /> Enviar Boletim para Cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Envia e-mail com Excel em anexo e link de aprovação digital.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Cliente</p>
                  <p className="text-sm font-black text-blue-900 uppercase" data-testid="text-send-client">{displayClientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Valor Total</p>
                  <p className="text-xl font-black font-mono text-blue-800" data-testid="text-send-total">{fmt(grandTotal)}</p>
                  <p className="text-[10px] text-blue-500">{rowsData.length} OS no período</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Período</p>
              <p className="text-xs font-bold text-gray-800" data-testid="text-send-period">{getPeriodLabel()}</p>
            </div>

            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">E-mail do Cliente</Label>
              <Input
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="email@cliente.com.br"
                className="mt-1 text-sm font-mono"
                data-testid="input-send-email"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">O que será enviado:</p>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <FileSpreadsheet size={14} className="text-blue-600 flex-shrink-0" />
                <span className="font-medium">Boletim de Medição em Excel (protegido)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <Check size={14} className="text-blue-600 flex-shrink-0" />
                <span className="font-medium">Link de aprovação digital com 1 clique</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <Mail size={14} className="text-blue-600 flex-shrink-0" />
                <span className="font-medium">E-mail profissional com resumo financeiro</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] text-amber-700 font-medium">
                Ao aprovar, o cliente autoriza automaticamente a emissão da NFS-e e boleto. Todos os billings do período terão status atualizado para "APROVADA".
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setSendDialog(false)} className="text-xs font-bold uppercase" data-testid="button-cancel-send">
              Cancelar
            </Button>
            <Button
              onClick={() => handleSendToClient(false)}
              disabled={sendLoading || !sendEmail}
              className="bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase gap-2 px-6"
              data-testid="button-confirm-send"
            >
              {sendLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sendLoading ? "Enviando..." : "Enviar E-mail com Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {osModalLoading && (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="max-w-xs flex flex-col items-center justify-center py-12" data-testid="os-modal-loading">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-sm text-gray-600 font-medium">Carregando dados da OS...</p>
          </DialogContent>
        </Dialog>
      )}
      {selectedOs && !osModalLoading && (
        <OsDetailModal
          os={selectedOs}
          onClose={() => { setSelectedOs(null); setEditingFields(false); }}
          isDiretoria={isDiretoria}
          editingFields={editingFields}
          setEditingFields={setEditingFields}
          overrideKmChegada={overrideKmChegada}
          setOverrideKmChegada={setOverrideKmChegada}
          overrideKmFim={overrideKmFim}
          setOverrideKmFim={setOverrideKmFim}
          overrideHoraChegada={overrideHoraChegada}
          setOverrideHoraChegada={setOverrideHoraChegada}
          overrideHoraFim={overrideHoraFim}
          setOverrideHoraFim={setOverrideHoraFim}
          overrideMutation={overrideMutation}
          calcularMutation={calcularMutation}
          aprovarMutation={aprovarMutation}
          rejeitarMutation={rejeitarMutation}
          reabrirMutation={reabrirMutation}
          liberarFaturamentoMutation={liberarFaturamentoMutation}
          salvarBillingMutation={salvarBillingMutation}
          pedagioValue={pedagioValue}
          setPedagioValue={setPedagioValue}
          reembolsoValue={reembolsoValue}
          setReembolsoValue={setReembolsoValue}
          acionamentoValue={acionamentoValue}
          setAcionamentoValue={setAcionamentoValue}
          horaExtraValue={horaExtraValue}
          setHoraExtraValue={setHoraExtraValue}
          kmExtraValue={kmExtraValue}
          setKmExtraValue={setKmExtraValue}
          adNoturnoValue={adNoturnoValue}
          setAdNoturnoValue={setAdNoturnoValue}
          estadiaValue={estadiaValue}
          setEstadiaValue={setEstadiaValue}
          pernoiteValue={pernoiteValue}
          setPernoiteValue={setPernoiteValue}
          demaisCustosValue={demaisCustosValue}
          setDemaisCustosValue={setDemaisCustosValue}
          observacoesValue={observacoesValue}
          setObservacoesValue={setObservacoesValue}
          getBillingStatus={getBillingStatus}
          isLiveOs={isLiveOs}
        />
      )}

      <Dialog open={!!mismatchData} onOpenChange={(o) => { if (!o) setMismatchData(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Conferência de Faturamento — Divergência de Valor
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              O backend somou um valor diferente do que está aparecendo na grade. Isso geralmente acontece quando há OS com valor "fat_total" antigo/corrompido no banco. Revise as OS abaixo, identifique as suspeitas e zere o valor congelado para que o sistema recalcule a partir dos componentes.
            </DialogDescription>
          </DialogHeader>

          {mismatchData && (
            <>
              <div className="grid grid-cols-3 gap-3 py-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Total na Grade (Frontend)</p>
                  <p className="text-lg font-black font-mono text-blue-900" data-testid="text-mismatch-frontend">{fmt(mismatchData.frontendTotal)}</p>
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Total Calculado pelo Backend</p>
                  <p className="text-lg font-black font-mono text-amber-900" data-testid="text-mismatch-backend">{fmt(mismatchData.backendTotal)}</p>
                </div>
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Diferença</p>
                  <p className="text-lg font-black font-mono text-red-900" data-testid="text-mismatch-diff">{fmt(mismatchData.diff)}</p>
                  <p className="text-[10px] text-red-700">{mismatchData.osCount} OS no período</p>
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr className="text-left">
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600">OS</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600">Data</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600">Status</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600 text-right">Componentes</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600 text-right">fat_total Salvo</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600 text-right">Usado na Soma</th>
                      <th className="px-2 py-2 font-bold uppercase tracking-wide text-gray-600 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatchData.breakdown.map((r) => {
                      const naGrade = rowsData.some((rd: any) => rd.billingId === r.billingId);
                      const isZerando = zerandoIds.has(r.billingId);
                      const podeZerar = r.fatTotalSalvo > 0 && !["FATURADO", "FATURADA", "PAGO"].includes(String(r.status).toUpperCase());
                      return (
                        <tr key={r.billingId} className={`border-t border-gray-100 ${r.suspeito ? "bg-red-50" : !naGrade ? "bg-amber-50/50" : ""}`} data-testid={`row-mismatch-${r.billingId}`}>
                          <td className="px-2 py-1.5 font-mono font-bold">{r.osRef}</td>
                          <td className="px-2 py-1.5 font-mono">{r.dataMissao ? new Date(r.dataMissao).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td>
                          <td className="px-2 py-1.5">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px] font-bold uppercase">{r.status || "—"}</span>
                            {!naGrade && <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-bold uppercase">Fora da grade</span>}
                            {r.suspeito && <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-red-200 text-red-900 text-[10px] font-bold uppercase">Suspeito</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-700">{fmt(r.fatComponentes)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono font-bold ${r.suspeito ? "text-red-700" : "text-gray-800"}`}>{fmt(r.fatTotalSalvo)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono font-black ${r.suspeito ? "text-red-700" : "text-gray-900"}`} data-testid={`text-fatusado-${r.billingId}`}>{fmt(r.fatUsado)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {podeZerar ? (
                              <button
                                disabled={isZerando}
                                onClick={() => {
                                  if (!window.confirm(`Zerar fat_total congelado da OS ${r.osRef}?\n\nValor atual: ${fmt(r.fatTotalSalvo)}\nDepois disso a OS usará a soma dos componentes (${fmt(r.fatComponentes)}). Esta ação fica registrada na auditoria.`)) return;
                                  setZerandoIds(prev => { const n = new Set(prev); n.add(r.billingId); return n; });
                                  zerarFatTotalMutation.mutate(r.billingId);
                                }}
                                className="text-[10px] font-bold uppercase bg-red-600 hover:bg-red-700 text-white rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                data-testid={`btn-zerar-${r.billingId}`}
                              >
                                {isZerando ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                Zerar
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900 leading-relaxed">
                <strong className="font-black uppercase tracking-wider text-[10px]">Como corrigir:</strong> linhas em <span className="bg-red-100 px-1 rounded">vermelho</span> têm fat_total acima de R$ 1.000.000 — quase certamente valores corrompidos. Linhas em <span className="bg-amber-100 px-1 rounded">amarelo</span> são OS que o backend está somando mas não aparecem na sua grade (rascunho/em aberto). Clique em "Zerar" nas suspeitas e tente gerar a fatura novamente.
              </div>
            </>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setMismatchData(null)} className="text-xs font-bold uppercase" data-testid="button-close-mismatch">
              Fechar
            </Button>
            <Button
              onClick={() => { setMismatchData(null); handleGenerate(); }}
              className="text-xs font-black uppercase gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="button-recarregar-mismatch"
            >
              <RefreshCw size={14} /> Recarregar Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
