import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Receipt, FileText, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Search, Calendar,
  Download, RefreshCw, ExternalLink, Eye, MailQuestion, Hourglass, Banknote, Ban, Trash2, FileCheck2, AlertOctagon,
} from "lucide-react";
import { authFetch, queryClient, invalidateRelatedQueries } from "@/lib/queryClient";
import { exportFormattedExcel } from "@/lib/excel-export";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";

type NormalizedStatus =
  | "AGUARDANDO_BOLETIM"
  | "PENDENTE_APROVACAO" | "AUTORIZADO" | "AGUARDANDO_PAGAMENTO" | "NF_PROCESSANDO" | "NF_EMITIDA"
  | "NF_ERRO" | "NF_CANCELADA" | "PAGO" | "VENCIDO" | "OUTRO";

type RelatorioRow = {
  id: string;
  source: "INVOICE" | "BOLETIM" | "BILLING_AVULSO";
  sourceId: number;
  clientId: number | null;
  clientName: string;
  clientFantasia: string | null;
  clientCpfCnpj: string | null;
  description: string | null;
  value: number;
  netValue: number | null;
  dueDate: string | null;
  paymentDate: string | null;
  createdAt: string;
  updatedAt: string | null;
  asaasPaymentId: string | null;
  invoiceUrl: string | null;
  nfseUrl: string | null;
  nfseNumber: string | null;
  osCount: number;
  osList: Array<{ id: number; osNumber: string }>;
  rawStatus: string | null;
  rawNfseStatus: string | null;
  rawBoletimStatus: string | null;
  normalizedStatus: NormalizedStatus;
  invoiceId: number | null;
  approvalToken: string | null;
  approvalUrl: string | null;
  reminderCount: number;
  lastReminderSentAt: string | null;
};

type RelatorioResponse = {
  rows: RelatorioRow[];
  totals: Record<string, { count: number; value: number }> & {
    total: { count: number; value: number };
  };
  lastSync: {
    startedAt: string | null;
    completedAt: string | null;
    processed: number;
    updated: number;
    errors: number;
    lastError: string | null;
    running: boolean;
  };
  period: { from: string; to: string };
};

const STATUS_META: Record<NormalizedStatus, { label: string; cls: string; bg: string; icon: any }> = {
  AGUARDANDO_BOLETIM: { label: "Sem boletim",       cls: "text-sky-700",     bg: "bg-sky-50 border-sky-200",           icon: Hourglass },
  PENDENTE_APROVACAO: { label: "Aguard. cliente",   cls: "text-amber-700",   bg: "bg-amber-50 border-amber-200",       icon: MailQuestion },
  AUTORIZADO:         { label: "NF processando",    cls: "text-blue-700",    bg: "bg-blue-50 border-blue-200",         icon: Hourglass },
  AGUARDANDO_PAGAMENTO: { label: "Aguard. pagto (s/ NF)", cls: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: Banknote },
  NF_PROCESSANDO:     { label: "NF processando",    cls: "text-blue-700",    bg: "bg-blue-50 border-blue-200",         icon: Hourglass },
  NF_EMITIDA:         { label: "NF emitida",        cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",   icon: FileText },
  NF_ERRO:            { label: "NF com erro",       cls: "text-red-700",     bg: "bg-red-50 border-red-200",           icon: AlertTriangle },
  NF_CANCELADA:       { label: "NF cancelada",      cls: "text-neutral-600", bg: "bg-neutral-100 border-neutral-200",  icon: XCircle },
  PAGO:               { label: "Pago",              cls: "text-emerald-800", bg: "bg-emerald-100 border-emerald-300",  icon: Banknote },
  VENCIDO:            { label: "Vencido",           cls: "text-red-700",     bg: "bg-red-50 border-red-300",           icon: AlertOctagon },
  OUTRO:              { label: "Outro",             cls: "text-neutral-600", bg: "bg-neutral-100 border-neutral-200",  icon: Receipt },
};

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtDateTime = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function RelatorioNFPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const [nfModal, setNfModal] = useState<{ id: number; url: string | null; contentType: string | null; htmlText: string | null; loading: boolean; error: string | null } | null>(null);
  const [cancelModal, setCancelModal] = useState<{ invoiceId: number; nfNumber: string | null; clientName: string; value: number; mode: "asaas" | "local"; reason: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ source: "BOLETIM" | "INVOICE"; sourceId: number; clientName: string; value: number; description: string; reason: string } | null>(null);
  const [emitModal, setEmitModal] = useState<{ invoiceId: number; clientName: string; value: number; nfNumber: string; note: string } | null>(null);
  useEffect(() => {
    return () => { if (nfModal?.url) URL.revokeObjectURL(nfModal.url); };
  }, [nfModal?.url]);

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState<NormalizedStatus | "all">("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<RelatorioResponse>({
    queryKey: ["/api/relatorio-nf", from, to],
    queryFn: async () => {
      const r = await authFetch(`/api/relatorio-nf?from=${from}&to=${to}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const reconcileMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const r = await authFetch(`/api/asaas/reconcile-all`, {
        method: "POST",
        body: JSON.stringify({ force, limit: 80 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Sincronização iniciada", description: "Buscando status atualizados no Asaas. A página será atualizada em alguns segundos." });
      // Refetch após 8s para dar tempo do Asaas responder
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/relatorio-nf"] });
      }, 8000);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/relatorio-nf"] });
      }, 25000);
    },
    onError: (e: any) => toast({ title: "Erro ao sincronizar", description: e?.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ invoiceId, localOnly, reason }: { invoiceId: number; localOnly: boolean; reason: string }) => {
      const r = await authFetch(`/api/invoices/${invoiceId}/cancel-nfse`, {
        method: "POST",
        body: JSON.stringify({ localOnly, reason }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
      return json;
    },
    onSuccess: (data) => {
      toast({ title: "NF cancelada", description: data?.message || "Nota fiscal marcada como cancelada." });
      setCancelModal(null);
      invalidateRelatedQueries("invoice");
    },
    onError: (e: any) => toast({ title: "Erro ao cancelar NF", description: e?.message, variant: "destructive" }),
  });

  const deleteRowMutation = useMutation({
    mutationFn: async (payload: { source: "BOLETIM" | "INVOICE"; sourceId: number; reason: string }) => {
      const r = await authFetch(`/api/relatorio-nf/delete-row`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Registro excluído", description: "O registro foi removido do relatório." });
      setDeleteModal(null);
      invalidateRelatedQueries("invoice");
      invalidateRelatedQueries("billing");
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e?.message, variant: "destructive" }),
  });

  const markEmittedMutation = useMutation({
    mutationFn: async (payload: { invoiceId: number; nfNumber: string; note: string }) => {
      const r = await authFetch(`/api/relatorio-nf/mark-emitted`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
      return json;
    },
    onSuccess: () => {
      toast({ title: "NF marcada como emitida", description: "A fatura foi marcada como NF emitida." });
      setEmitModal(null);
      invalidateRelatedQueries("invoice");
    },
    onError: (e: any) => toast({ title: "Erro ao marcar como emitida", description: e?.message, variant: "destructive" }),
  });

  const openNfMirror = async (id: number) => {
    setNfModal({ id, url: null, contentType: null, htmlText: null, loading: true, error: null });
    try {
      const res = await authFetch(`/api/invoices/${id}/nfse-pdf`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      let htmlText: string | null = null;
      if (ct.includes("html")) {
        try { htmlText = await blob.text(); } catch {}
      }
      setNfModal({ id, url, contentType: ct, htmlText, loading: false, error: null });
    } catch (e: any) {
      setNfModal({ id, url: null, contentType: null, htmlText: null, loading: false, error: e?.message || "Erro ao carregar NF" });
    }
  };

  const rows = data?.rows || [];
  const totals = data?.totals;
  const lastSync = data?.lastSync;

  const filtered = useMemo(() => {
    return rows
      .filter(r => statusFilter === "all" || r.normalizedStatus === statusFilter)
      .filter(r => {
        if (!search.trim()) return true;
        const s = search.trim().toLowerCase();
        return [r.clientName, r.clientCpfCnpj, r.nfseNumber, r.asaasPaymentId, String(r.sourceId), r.id]
          .filter(Boolean)
          .some(x => String(x).toLowerCase().includes(s));
      });
  }, [rows, statusFilter, search]);

  const exportXlsx = () => {
    const headers = [
      "Origem", "Cliente", "CPF/CNPJ", "Descrição", "Valor (R$)",
      "Status", "Vencimento", "Dias Atraso", "Pagamento", "Situação Pgto",
      "Status NF (Asaas)", "Status Cobrança (Asaas)", "Status Boletim",
      "Nº NF", "Lembretes Enviados", "Criado em", "Asaas ID",
    ];
    const dataExp = filtered.map(r => {
      const isPago = r.normalizedStatus === "PAGO";
      const diasAtraso = (() => {
        if (!r.dueDate || isPago) return 0;
        const due = new Date(r.dueDate + "T12:00:00");
        const now = new Date(); now.setHours(12, 0, 0, 0);
        const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 0;
      })();
      const situacao = isPago ? "PAGO" : diasAtraso > 0 ? "VENCIDO" : r.dueDate ? "EM ABERTO" : "—";
      return [
        r.source === "INVOICE" ? "Fatura" : r.source === "BILLING_AVULSO" ? "OS sem boletim" : "Boletim",
        r.clientName,
        r.clientCpfCnpj || "",
        r.description || "",
        Number(r.value || 0),
        STATUS_META[r.normalizedStatus]?.label || r.normalizedStatus,
        fmtDate(r.dueDate),
        diasAtraso > 0 ? diasAtraso : "",
        fmtDate(r.paymentDate),
        situacao,
        r.rawNfseStatus || "",
        r.rawStatus || "",
        r.rawBoletimStatus || "",
        r.nfseNumber || "",
        r.reminderCount || "",
        fmtDate(r.createdAt),
        r.asaasPaymentId || "",
      ];
    });
    const colWidths = [10, 28, 18, 32, 14, 18, 14, 12, 14, 14, 22, 22, 18, 14, 14, 14, 22];
    const totalRow: (string | number)[] = ["TOTAL", "", "", "", filtered.reduce((s, r) => s + Number(r.value || 0), 0), "", "", "", "", "", "", "", "", "", "", "", ""];
    exportFormattedExcel({
      title: "RELATÓRIO DE NOTAS FISCAIS — TORRES VIGILÂNCIA PATRIMONIAL",
      subtitle: `Período: ${from} a ${to}`,
      headers,
      colWidths,
      rows: dataExp,
      totalsRow: totalRow,
      currencyColumns: [4],
      fileName: `relatorio-nf-${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.xlsx`,
      sheetName: "Relatório NFs",
    });
  };

  // Cards de resumo
  const cards: Array<{ key: NormalizedStatus | "TOTAL"; label: string; icon: any; cls: string; }> = [
    { key: "TOTAL",              label: "Total no período",  icon: Receipt,        cls: "from-slate-700 to-slate-900 text-white" },
    { key: "AGUARDANDO_BOLETIM", label: "Sem boletim",       icon: Hourglass,      cls: "from-sky-500 to-sky-700 text-white" },
    { key: "PENDENTE_APROVACAO", label: "Aguard. aprov.",    icon: MailQuestion,   cls: "from-amber-500 to-amber-700 text-white" },
    { key: "AUTORIZADO",         label: "NF processando",    icon: Hourglass,      cls: "from-blue-500 to-blue-700 text-white" },
    { key: "AGUARDANDO_PAGAMENTO", label: "Aguard. pagto (s/ NF)", icon: Banknote, cls: "from-indigo-500 to-indigo-700 text-white" },
    { key: "NF_EMITIDA",         label: "NF emitida",        icon: FileText,       cls: "from-emerald-500 to-emerald-700 text-white" },
    { key: "PAGO",               label: "Pago",              icon: Banknote,       cls: "from-emerald-700 to-emerald-900 text-white" },
    { key: "VENCIDO",            label: "Vencido",           icon: AlertOctagon,   cls: "from-red-600 to-red-800 text-white" },
    { key: "NF_ERRO",            label: "Com erro",          icon: AlertTriangle,  cls: "from-red-500 to-red-700 text-white" },
    { key: "NF_CANCELADA",       label: "Cancelada",         icon: XCircle,        cls: "from-neutral-500 to-neutral-700 text-white" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900" data-testid="text-page-title">Relatório de Notas Fiscais</h1>
            <p className="text-xs text-slate-500 mt-1">Visão completa: boletins enviados ao cliente, faturas geradas e status da NFS-e no Asaas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reconcileMutation.mutate(false)}
              disabled={reconcileMutation.isPending || lastSync?.running}
              data-testid="button-sync-asaas"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${(reconcileMutation.isPending || lastSync?.running) ? "animate-spin" : ""}`} />
              {lastSync?.running ? "Sincronizando…" : "Sincronizar c/ Asaas"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!filtered.length} data-testid="button-export-excel">
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar Excel
            </Button>
          </div>
        </div>

        {/* Last sync badge */}
        {lastSync && (lastSync.completedAt || lastSync.startedAt) && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="text-last-sync">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Última sincronização Asaas: <strong className="text-slate-700">{fmtDateTime(lastSync.completedAt || lastSync.startedAt)}</strong>
            </span>
            <span>processadas: <strong>{lastSync.processed}</strong></span>
            <span className="text-emerald-700">atualizadas: <strong>{lastSync.updated}</strong></span>
            {lastSync.errors > 0 && <span className="text-red-700">erros: <strong>{lastSync.errors}</strong></span>}
            {lastSync.lastError && <span className="text-red-600 truncate max-w-[400px]" title={lastSync.lastError}>{lastSync.lastError}</span>}
          </div>
        )}

        {/* Filtros */}
        <Card className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">De</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="pl-8 h-9" data-testid="input-from" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Até</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="pl-8 h-9" data-testid="input-to" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
                <SelectTrigger className="h-9" data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="AGUARDANDO_BOLETIM">Sem boletim</SelectItem>
                  <SelectItem value="PENDENTE_APROVACAO">Aguardando aprovação</SelectItem>
                  <SelectItem value="AUTORIZADO">NF processando</SelectItem>
                  <SelectItem value="AGUARDANDO_PAGAMENTO">Aguard. pagto (sem NF)</SelectItem>
                  <SelectItem value="NF_EMITIDA">NF emitida</SelectItem>
                  <SelectItem value="PAGO">Pago</SelectItem>
                  <SelectItem value="NF_ERRO">Com erro</SelectItem>
                  <SelectItem value="NF_CANCELADA">Cancelada</SelectItem>
                  <SelectItem value="VENCIDO">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Cliente, CPF/CNPJ, Nº NF, ID Asaas…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9"
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          {cards.map(c => {
            const t = c.key === "TOTAL" ? totals?.total : totals?.[c.key];
            const Icon = c.icon;
            const isActive = c.key !== "TOTAL" && statusFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setStatusFilter(c.key === "TOTAL" ? "all" : (c.key as NormalizedStatus))}
                className={`text-left p-3 rounded-lg bg-gradient-to-br ${c.cls} shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${isActive ? "ring-2 ring-offset-1 ring-slate-900" : ""}`}
                data-testid={`card-${c.key.toLowerCase()}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-[11px] uppercase tracking-wide opacity-90">{c.label}</span>
                  <Icon className="h-3.5 w-3.5 opacity-90" />
                </div>
                <div className="text-base sm:text-lg font-bold mt-1.5 leading-tight" data-testid={`value-${c.key.toLowerCase()}`}>
                  {fmtBRL(t?.value || 0)}
                </div>
                <div className="text-[11px] opacity-90 mt-0.5">{t?.count || 0} registro(s)</div>
              </button>
            );
          })}
        </div>

        {/* Tabela */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs text-slate-600">
                  <th className="text-left px-3 py-2 font-semibold">Origem</th>
                  <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  <th className="text-left px-3 py-2 font-semibold">Criado em</th>
                  <th className="text-left px-3 py-2 font-semibold">Data do Venc.</th>
                  <th className="text-center px-3 py-2 font-semibold">Dias</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Pagamento</th>
                  <th className="text-left px-3 py-2 font-semibold">Nº NF</th>
                  <th className="text-center px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-slate-400">Nenhum registro no período</td></tr>
                ) : filtered.map(r => {
                  const meta = STATUS_META[r.normalizedStatus] || STATUS_META.OUTRO;
                  const Icon = meta.icon;
                  const asaasParts: string[] = [];
                  if (r.rawBoletimStatus) asaasParts.push(`Boletim: ${r.rawBoletimStatus}`);
                  if (r.rawStatus) asaasParts.push(`Cobrança: ${r.rawStatus}`);
                  if (r.rawNfseStatus) asaasParts.push(`NF: ${r.rawNfseStatus}`);
                  const isPago = r.normalizedStatus === "PAGO";
                  const isCancelada = r.normalizedStatus === "NF_CANCELADA"
                    || String(r.rawStatus || "").toUpperCase() === "CANCELLED"
                    || String(r.rawStatus || "").toUpperCase() === "CANCELED";
                  const diasInfo = (() => {
                    if (!r.dueDate || isPago || isCancelada) return { atraso: 0, restantes: 0, hoje: false };
                    const due = new Date(r.dueDate + "T12:00:00");
                    const now = new Date();
                    now.setHours(12, 0, 0, 0);
                    const diffMs = due.getTime() - now.getTime();
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return { atraso: -diffDays, restantes: 0, hoje: false };
                    if (diffDays === 0) return { atraso: 0, restantes: 0, hoje: true };
                    return { atraso: 0, restantes: diffDays, hoje: false };
                  })();
                  const diasAtraso = diasInfo.atraso;
                  const isOverdue = diasAtraso > 0 || r.normalizedStatus === "VENCIDO";
                  const rowBg = isOverdue ? "bg-red-50/70 hover:bg-red-100/70" : isPago ? "bg-emerald-50/40 hover:bg-emerald-50/80" : diasInfo.hoje ? "bg-amber-50/50 hover:bg-amber-100/60" : "hover:bg-slate-50/60";
                  return (
                    <tr key={r.id} className={rowBg} data-testid={`row-${r.id}`}>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.source === "INVOICE"
                            ? "bg-blue-100 text-blue-700"
                            : r.source === "BILLING_AVULSO"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.source === "INVOICE"
                            ? `FAT #${r.sourceId}`
                            : r.source === "BILLING_AVULSO"
                              ? `OS #${r.sourceId}`
                              : `BOL #${r.sourceId}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800 max-w-[260px] truncate" title={r.clientName} data-testid={`text-client-${r.id}`}>
                          {r.clientFantasia || r.clientName}
                        </div>
                        {r.clientFantasia && r.clientFantasia !== r.clientName && (
                          <div className="text-[11px] text-slate-500 max-w-[260px] truncate" title={r.clientName}>
                            {r.clientName}
                          </div>
                        )}
                        {r.clientCpfCnpj && <div className="text-[11px] text-slate-400">{r.clientCpfCnpj}</div>}
                        <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-1 gap-y-0.5 items-center" data-testid={`os-list-${r.id}`}>
                          {r.osList && r.osList.length > 0 ? (
                            <>
                              {r.osList.map((o, idx) => (
                                <span key={o.id} className="inline-flex items-center">
                                  <Link
                                    href={`/admin/service-orders?os=${o.id}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                    data-testid={`link-os-${o.id}`}
                                    title={`Abrir ${o.osNumber}`}
                                  >
                                    {o.osNumber}
                                  </Link>
                                  {idx < r.osList.length - 1 && <span className="text-slate-300 mx-0.5">·</span>}
                                </span>
                              ))}
                            </>
                          ) : r.osCount > 0 ? (
                            <span className="text-slate-400">{r.osCount} OS</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid={`text-value-${r.id}`}>
                        {fmtBRL(r.value)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {!r.dueDate ? (
                          <span className="text-slate-300">—</span>
                        ) : isCancelada ? (
                          <span className="text-neutral-500 line-through">{fmtDate(r.dueDate)}</span>
                        ) : (
                          <span className="text-slate-700 font-medium tabular-nums">{fmtDate(r.dueDate)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-center whitespace-nowrap">
                        {!r.dueDate || isCancelada ? (
                          <span className="text-slate-300">—</span>
                        ) : isPago ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Pago
                          </span>
                        ) : isOverdue ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-red-700"
                            title={`Vencido há ${diasAtraso} dia${diasAtraso === 1 ? "" : "s"}`}
                          >
                            <AlertOctagon className="h-3 w-3" /> {diasAtraso}d atraso
                          </span>
                        ) : diasInfo.hoje ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-amber-500" title="Vence hoje">
                            <AlertTriangle className="h-3 w-3" /> hoje
                          </span>
                        ) : diasInfo.restantes <= 3 ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-400"
                            title={`Vence em ${diasInfo.restantes} dia${diasInfo.restantes === 1 ? "" : "s"}`}
                          >
                            <Clock className="h-3 w-3" /> {diasInfo.restantes}d
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200"
                            title={`Faltam ${diasInfo.restantes} dia${diasInfo.restantes === 1 ? "" : "s"}`}
                          >
                            <Calendar className="h-3 w-3" /> {diasInfo.restantes}d
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.bg} ${meta.cls}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.normalizedStatus === "NF_CANCELADA" || String(r.rawStatus || "").toUpperCase() === "CANCELLED" || String(r.rawStatus || "").toUpperCase() === "CANCELED" ? (
                          <span className="text-neutral-500 text-[11px] italic">Cancelado</span>
                        ) : isPago && r.paymentDate ? (
                          <div className="text-emerald-700 font-medium">
                            {fmtDate(r.paymentDate)}
                            <div className="text-[10px] text-emerald-600 mt-0.5">Pago</div>
                          </div>
                        ) : isOverdue ? (
                          <div className="text-red-600 font-semibold text-[11px]">
                            Em aberto
                            {r.reminderCount > 0 && (
                              <div className="text-[10px] text-red-500 mt-0.5" title={r.lastReminderSentAt ? `Último: ${fmtDateTime(r.lastReminderSentAt)}` : ""}>
                                {r.reminderCount}x cobrado
                              </div>
                            )}
                          </div>
                        ) : r.dueDate ? (
                          <span className="text-amber-600 text-[11px]">Aguardando</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {r.nfseNumber || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-sm">
                          {r.source === "BOLETIM" && r.approvalUrl && (
                            <Link
                              href={r.approvalUrl}
                              className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                              title="Ver boletim"
                              data-testid={`button-open-boletim-${r.id}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {r.source === "INVOICE" && r.invoiceUrl && (
                            <a
                              href={r.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                              title="Abrir fatura"
                              data-testid={`button-open-fatura-${r.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {r.source === "INVOICE" && r.invoiceId && (r.normalizedStatus === "NF_EMITIDA" || r.nfseUrl) && (
                            <button
                              type="button"
                              onClick={() => openNfMirror(r.invoiceId!)}
                              className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                              title="Ver espelho da NF"
                              data-testid={`button-open-nf-${r.id}`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isDiretoria && r.source === "INVOICE" && r.invoiceId && r.normalizedStatus !== "NF_EMITIDA" && r.normalizedStatus !== "PAGO" && r.normalizedStatus !== "NF_CANCELADA" && (
                            <button
                              type="button"
                              onClick={() => setEmitModal({ invoiceId: r.invoiceId!, clientName: r.clientName, value: Number(r.value || 0), nfNumber: r.nfseNumber || "", note: "" })}
                              className="h-7 w-7 inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                              title="Marcar como NF emitida"
                              data-testid={`button-mark-emitted-${r.id}`}
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isDiretoria && r.source === "INVOICE" && r.invoiceId && r.rawNfseStatus && r.normalizedStatus !== "NF_CANCELADA" && (
                            <button
                              type="button"
                              onClick={() => setCancelModal({ invoiceId: r.invoiceId!, nfNumber: r.nfseNumber, clientName: r.clientName, value: Number(r.value || 0), mode: "asaas", reason: "" })}
                              className="h-7 w-7 inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                              title="Cancelar NF"
                              data-testid={`button-cancel-nf-${r.id}`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isDiretoria && (
                            <button
                              type="button"
                              onClick={() => setDeleteModal({
                                source: r.source as any,
                                sourceId: r.source === "INVOICE" ? (r.invoiceId || r.sourceId) : r.sourceId,
                                clientName: r.clientName,
                                value: Number(r.value || 0),
                                description: r.description || "",
                                reason: "",
                              })}
                              className="h-7 w-7 inline-flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                              title="Excluir registro"
                              data-testid={`button-delete-row-${r.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal NF */}
      <Dialog open={!!nfModal} onOpenChange={open => { if (!open) setNfModal(null); }}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col" aria-describedby={undefined}>
          <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between gap-2 space-y-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-700" />
              Espelho da Nota Fiscal
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              {nfModal?.url && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => window.open(nfModal.url!, "_blank", "noopener,noreferrer")}
                    data-testid="button-nf-open-new-tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Nova aba
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = nfModal.url!;
                      const ext = (nfModal.contentType || "").includes("pdf") ? "pdf" : "html";
                      a.download = `nfse-${nfModal.id}.${ext}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    data-testid="button-nf-download"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Baixar
                  </Button>
                </>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-slate-50">
            {nfModal?.loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin" />
                <span className="text-xs">Carregando espelho da NF…</span>
              </div>
            )}
            {nfModal?.error && (
              <div className="flex flex-col items-center justify-center h-full p-6 gap-3">
                <AlertOctagon className="h-8 w-8 text-red-500" />
                <div className="text-sm text-red-700 text-center max-w-md">{nfModal.error}</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openNfMirror(nfModal.id)}
                  data-testid="button-nf-retry"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
                </Button>
              </div>
            )}
            {nfModal?.url && !nfModal.loading && !nfModal.error && (
              <>
                {(nfModal.contentType || "").includes("pdf") ? (
                  <object
                    data={nfModal.url}
                    type="application/pdf"
                    className="w-full h-full"
                    aria-label="Espelho da NFS-e"
                  >
                    <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
                      <FileText className="h-10 w-10 text-slate-400" />
                      <div className="text-sm text-slate-600">
                        Seu navegador não consegue exibir o PDF dentro da página.
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" onClick={() => window.open(nfModal.url!, "_blank")}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir em nova aba
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={nfModal.url!} download={`nfse-${nfModal.id}.pdf`}>
                            <Download className="h-3.5 w-3.5 mr-1" /> Baixar PDF
                          </a>
                        </Button>
                      </div>
                    </div>
                  </object>
                ) : nfModal.htmlText ? (
                  <iframe
                    srcDoc={nfModal.htmlText}
                    className="w-full h-full border-0 bg-white"
                    title="Espelho NF"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                ) : (
                  <iframe
                    src={nfModal.url}
                    className="w-full h-full border-0 bg-white"
                    title="Espelho NF"
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal cancelar NF */}
      <Dialog open={!!cancelModal} onOpenChange={open => { if (!open && !cancelMutation.isPending) setCancelModal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Ban className="h-4 w-4" /> Cancelar Nota Fiscal
            </DialogTitle>
            <DialogDescription>
              Esta ação remove a NF dos cálculos de faturamento e balanço. Apenas a diretoria pode realizar este cancelamento.
            </DialogDescription>
          </DialogHeader>
          {cancelModal && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm space-y-1">
                <div><span className="text-slate-500">Cliente:</span> <strong>{cancelModal.clientName}</strong></div>
                <div><span className="text-slate-500">Nº NF:</span> <strong>{cancelModal.nfNumber || "—"}</strong></div>
                <div><span className="text-slate-500">Valor:</span> <strong>{fmtBRL(cancelModal.value)}</strong></div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">Tipo de cancelamento</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer ${cancelModal.mode === "asaas" ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input
                      type="radio"
                      checked={cancelModal.mode === "asaas"}
                      onChange={() => setCancelModal({ ...cancelModal, mode: "asaas" })}
                      className="mt-0.5"
                      data-testid="radio-cancel-asaas"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-800">Cancelar no Asaas + local</div>
                      <div className="text-slate-600">Tenta cancelar a NF no Asaas e marca como cancelada no sistema. Use quando a NF ainda está ativa no Asaas/prefeitura.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer ${cancelModal.mode === "local" ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input
                      type="radio"
                      checked={cancelModal.mode === "local"}
                      onChange={() => setCancelModal({ ...cancelModal, mode: "local" })}
                      className="mt-0.5"
                      data-testid="radio-cancel-local"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-800">Apenas marcar como cancelada (cancelamento já feito na prefeitura)</div>
                      <div className="text-slate-600">Não chama o Asaas. Use quando a NF já foi cancelada diretamente no portal da prefeitura e precisa ser refletida aqui.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Motivo (registrado no log)</label>
                <Textarea
                  value={cancelModal.reason}
                  onChange={e => setCancelModal({ ...cancelModal, reason: e.target.value })}
                  placeholder="Ex.: cancelada na prefeitura por erro de tomador"
                  className="min-h-[60px] text-xs"
                  maxLength={500}
                  data-testid="input-cancel-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelModal(null)} disabled={cancelMutation.isPending} data-testid="button-cancel-cancel">
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelModal && cancelMutation.mutate({ invoiceId: cancelModal.invoiceId, localOnly: cancelModal.mode === "local", reason: cancelModal.reason })}
              disabled={cancelMutation.isPending || !cancelModal}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Cancelando…</> : <>Confirmar cancelamento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal excluir registro */}
      <Dialog open={!!deleteModal} onOpenChange={open => { if (!open && !deleteRowMutation.isPending) setDeleteModal(null); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
          <div className="px-6 pt-6 pb-4 border-b border-slate-200 bg-gradient-to-br from-red-50 to-rose-50">
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <DialogTitle className="text-lg font-bold text-red-900 m-0">Excluir registro</DialogTitle>
              </div>
              <DialogDescription className="text-sm text-slate-600 leading-relaxed">
                {deleteModal?.source === "BOLETIM"
                  ? "O boletim será removido permanentemente. As ordens de serviço associadas voltam a ficar pendentes de aprovação."
                  : "A fatura será removida permanentemente. As ordens de serviço vinculadas serão desvinculadas e poderão ser refaturadas."}
                <span className="block mt-1.5 text-xs font-semibold text-red-700">⚠ Apenas a diretoria pode realizar esta exclusão.</span>
              </DialogDescription>
            </DialogHeader>
          </div>

          {deleteModal && (
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {deleteModal.source === "BOLETIM" ? "Boletim de medição" : "Fatura"}
                  </span>
                  <span className="text-sm font-bold text-slate-900">{fmtBRL(deleteModal.value)}</span>
                </div>
                <div className="px-3 py-2.5 space-y-1.5 text-sm">
                  <div className="font-semibold text-slate-900 truncate" title={deleteModal.clientName}>
                    {deleteModal.clientName}
                  </div>
                  {deleteModal.description && (
                    <div className="text-xs text-slate-600 leading-relaxed line-clamp-2" title={deleteModal.description}>
                      {deleteModal.description}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                  Motivo da exclusão <span className="text-slate-400 font-normal">(registrado no log)</span>
                </label>
                <Textarea
                  value={deleteModal.reason}
                  onChange={e => setDeleteModal({ ...deleteModal, reason: e.target.value })}
                  placeholder="Ex.: boletim duplicado, gerado por engano…"
                  className="min-h-[80px] text-sm resize-none"
                  maxLength={500}
                  data-testid="input-delete-reason"
                />
                <div className="text-[10px] text-slate-400 mt-1 text-right">{deleteModal.reason.length}/500</div>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-200 sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setDeleteModal(null)} disabled={deleteRowMutation.isPending} data-testid="button-cancel-delete" className="min-w-[90px]">
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteModal && deleteRowMutation.mutate({ source: deleteModal.source, sourceId: deleteModal.sourceId, reason: deleteModal.reason })}
              disabled={deleteRowMutation.isPending || !deleteModal}
              data-testid="button-confirm-delete"
              className="font-semibold"
            >
              {deleteRowMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Excluindo…</> : <><Trash2 className="h-4 w-4 mr-1.5" /> Excluir definitivamente</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal marcar como NF emitida */}
      <Dialog open={!!emitModal} onOpenChange={open => { if (!open && !markEmittedMutation.isPending) setEmitModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <FileCheck2 className="h-4 w-4" /> Marcar como NF emitida
            </DialogTitle>
            <DialogDescription>
              Use quando a NF foi emitida manualmente (fora do sistema, na prefeitura ou outro emissor) e precisa ser refletida aqui.
              A fatura passa a contar como NF EMITIDA no relatório e nos faturamentos. Apenas a diretoria pode fazer esta operação.
            </DialogDescription>
          </DialogHeader>
          {emitModal && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm space-y-1">
                <div><span className="text-slate-500">Cliente:</span> <strong>{emitModal.clientName}</strong></div>
                <div><span className="text-slate-500">Valor:</span> <strong>{fmtBRL(emitModal.value)}</strong></div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Número da NF (opcional)</label>
                <Input
                  value={emitModal.nfNumber}
                  onChange={e => setEmitModal({ ...emitModal, nfNumber: e.target.value })}
                  placeholder="Ex.: 245"
                  className="text-xs"
                  maxLength={60}
                  data-testid="input-emit-nf-number"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Observação (opcional)</label>
                <Textarea
                  value={emitModal.note}
                  onChange={e => setEmitModal({ ...emitModal, note: e.target.value })}
                  placeholder="Ex.: NF emitida diretamente no portal da prefeitura em 28/04"
                  className="min-h-[60px] text-xs"
                  maxLength={500}
                  data-testid="input-emit-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitModal(null)} disabled={markEmittedMutation.isPending} data-testid="button-cancel-emit">
              Voltar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => emitModal && markEmittedMutation.mutate({ invoiceId: emitModal.invoiceId, nfNumber: emitModal.nfNumber, note: emitModal.note })}
              disabled={markEmittedMutation.isPending || !emitModal}
              data-testid="button-confirm-emit"
            >
              {markEmittedMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Marcando…</> : <><FileCheck2 className="h-4 w-4 mr-1" /> Confirmar como emitida</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
