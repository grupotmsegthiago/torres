import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Receipt, FileText, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Search, Calendar,
  Download, RefreshCw, ExternalLink, Eye, MailQuestion, Hourglass, Banknote,
} from "lucide-react";
import { authFetch, queryClient } from "@/lib/queryClient";
import { exportFormattedExcel } from "@/lib/excel-export";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";

type NormalizedStatus =
  | "PENDENTE_APROVACAO" | "AUTORIZADO" | "NF_PROCESSANDO" | "NF_EMITIDA"
  | "NF_ERRO" | "NF_CANCELADA" | "PAGO" | "VENCIDO" | "OUTRO";

type RelatorioRow = {
  id: string;
  source: "INVOICE" | "BOLETIM";
  sourceId: number;
  clientId: number | null;
  clientName: string;
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
  rawStatus: string | null;
  rawNfseStatus: string | null;
  rawBoletimStatus: string | null;
  normalizedStatus: NormalizedStatus;
  invoiceId: number | null;
  approvalToken: string | null;
  approvalUrl: string | null;
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
  PENDENTE_APROVACAO: { label: "Aguard. cliente",   cls: "text-amber-700",   bg: "bg-amber-50 border-amber-200",       icon: MailQuestion },
  AUTORIZADO:         { label: "Autorizado",        cls: "text-violet-700",  bg: "bg-violet-50 border-violet-200",     icon: CheckCircle2 },
  NF_PROCESSANDO:     { label: "NF processando",    cls: "text-blue-700",    bg: "bg-blue-50 border-blue-200",         icon: Hourglass },
  NF_EMITIDA:         { label: "NF emitida",        cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",   icon: FileText },
  NF_ERRO:            { label: "NF com erro",       cls: "text-red-700",     bg: "bg-red-50 border-red-200",           icon: AlertTriangle },
  NF_CANCELADA:       { label: "NF cancelada",      cls: "text-neutral-600", bg: "bg-neutral-100 border-neutral-200",  icon: XCircle },
  PAGO:               { label: "Pago",              cls: "text-emerald-800", bg: "bg-emerald-100 border-emerald-300",  icon: Banknote },
  VENCIDO:            { label: "Vencido",           cls: "text-orange-700",  bg: "bg-orange-50 border-orange-200",     icon: Clock },
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
  const [nfModal, setNfModal] = useState<{ id: number; url: string | null; loading: boolean; error: string | null } | null>(null);
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

  const openNfMirror = async (id: number) => {
    setNfModal({ id, url: null, loading: true, error: null });
    try {
      const res = await authFetch(`/api/invoices/${id}/nfse-pdf`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setNfModal({ id, url, loading: false, error: null });
    } catch (e: any) {
      setNfModal({ id, url: null, loading: false, error: e?.message || "Erro ao carregar NF" });
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
      "Status", "Status NF (Asaas)", "Status Cobrança (Asaas)", "Status Boletim",
      "Nº NF", "Vencimento", "Pagamento", "Criado em", "Asaas ID",
    ];
    const dataExp = filtered.map(r => [
      r.source === "INVOICE" ? "Fatura" : "Boletim",
      r.clientName,
      r.clientCpfCnpj || "",
      r.description || "",
      Number(r.value || 0),
      STATUS_META[r.normalizedStatus]?.label || r.normalizedStatus,
      r.rawNfseStatus || "",
      r.rawStatus || "",
      r.rawBoletimStatus || "",
      r.nfseNumber || "",
      fmtDate(r.dueDate),
      fmtDate(r.paymentDate),
      fmtDate(r.createdAt),
      r.asaasPaymentId || "",
    ]);
    const colWidths = [10, 28, 18, 32, 14, 18, 22, 22, 18, 14, 14, 14, 14, 22];
    const totalRow: (string | number)[] = ["TOTAL", "", "", "", filtered.reduce((s, r) => s + Number(r.value || 0), 0), "", "", "", "", "", "", "", "", ""];
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
    { key: "PENDENTE_APROVACAO", label: "Aguard. aprov.",    icon: MailQuestion,   cls: "from-amber-500 to-amber-700 text-white" },
    { key: "AUTORIZADO",         label: "Autorizado",        icon: CheckCircle2,   cls: "from-violet-500 to-violet-700 text-white" },
    { key: "NF_EMITIDA",         label: "NF emitida",        icon: FileText,       cls: "from-emerald-500 to-emerald-700 text-white" },
    { key: "PAGO",               label: "Pago",              icon: Banknote,       cls: "from-emerald-700 to-emerald-900 text-white" },
    { key: "NF_ERRO",            label: "Com erro",          icon: AlertTriangle,  cls: "from-red-500 to-red-700 text-white" },
    { key: "NF_CANCELADA",       label: "Cancelada",         icon: XCircle,        cls: "from-neutral-500 to-neutral-700 text-white" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-4 px-3 sm:px-4 lg:px-6 py-4">
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
                  <SelectItem value="PENDENTE_APROVACAO">Aguardando aprovação</SelectItem>
                  <SelectItem value="AUTORIZADO">Autorizado</SelectItem>
                  <SelectItem value="NF_PROCESSANDO">NF processando</SelectItem>
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
                  <th className="text-left px-3 py-2 font-semibold">Descrição</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Status Asaas</th>
                  <th className="text-left px-3 py-2 font-semibold">Nº NF</th>
                  <th className="text-left px-3 py-2 font-semibold">Criado em</th>
                  <th className="text-center px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400">Nenhum registro no período</td></tr>
                ) : filtered.map(r => {
                  const meta = STATUS_META[r.normalizedStatus] || STATUS_META.OUTRO;
                  const Icon = meta.icon;
                  const asaasParts: string[] = [];
                  if (r.rawBoletimStatus) asaasParts.push(`Boletim: ${r.rawBoletimStatus}`);
                  if (r.rawStatus) asaasParts.push(`Cobrança: ${r.rawStatus}`);
                  if (r.rawNfseStatus) asaasParts.push(`NF: ${r.rawNfseStatus}`);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60" data-testid={`row-${r.id}`}>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.source === "INVOICE" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.source === "INVOICE" ? `FAT #${r.sourceId}` : `BOL #${r.sourceId}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800 max-w-[240px] truncate" title={r.clientName} data-testid={`text-client-${r.id}`}>
                          {r.clientName}
                        </div>
                        {r.clientCpfCnpj && <div className="text-[11px] text-slate-400">{r.clientCpfCnpj}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-slate-600 max-w-[260px] truncate" title={r.description || ""}>
                          {r.description || "—"}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{r.osCount} OS</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid={`text-value-${r.id}`}>
                        {fmtBRL(r.value)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.bg} ${meta.cls}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-500">
                        {asaasParts.length ? asaasParts.map((p, i) => <div key={i}>{p}</div>) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {r.nfseNumber || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {r.source === "BOLETIM" && r.approvalUrl && (
                            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]" data-testid={`button-open-boletim-${r.id}`}>
                              <Link href={r.approvalUrl}>
                                <Eye className="h-3 w-3 mr-1" /> Ver boletim
                              </Link>
                            </Button>
                          )}
                          {r.source === "INVOICE" && r.invoiceUrl && (
                            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]" data-testid={`button-open-fatura-${r.id}`}>
                              <a href={r.invoiceUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" /> Fatura
                              </a>
                            </Button>
                          )}
                          {r.source === "INVOICE" && r.invoiceId && (r.normalizedStatus === "NF_EMITIDA" || r.nfseUrl) && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openNfMirror(r.invoiceId!)} data-testid={`button-open-nf-${r.id}`}>
                              <FileText className="h-3 w-3 mr-1" /> NF
                            </Button>
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
        <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-sm">Espelho da Nota Fiscal</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {nfModal?.loading && <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
            {nfModal?.error && <div className="p-6 text-sm text-red-600">{nfModal.error}</div>}
            {nfModal?.url && <iframe src={nfModal.url} className="w-full h-full border-0" title="Espelho NF" />}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
