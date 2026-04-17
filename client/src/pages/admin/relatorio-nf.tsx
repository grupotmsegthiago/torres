import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, FileText, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Search, Calendar,
  Download, RefreshCw, ExternalLink, Eye,
} from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { exportFormattedExcel } from "@/lib/excel-export";
import AdminLayout from "@/components/admin/layout";

type Invoice = {
  id: number;
  client_id: number | null;
  client_name: string;
  client_cpf_cnpj: string | null;
  asaas_payment_id: string | null;
  service_order_id: number | null;
  description: string;
  value: string;
  net_value: string | null;
  due_date: string;
  billing_type: string;
  status: string;
  invoice_url: string | null;
  payment_date: string | null;
  created_at: string;
  nfse_status: string | null;
  nfse_url: string | null;
  nfse_number: string | null;
  emite_nf?: boolean;
};

const NF_STATUS: Record<string, { label: string; cls: string; bg: string; icon: any }> = {
  AUTHORIZED:   { label: "Autorizada",  cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  SYNCHRONIZED: { label: "Autorizada",  cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  SCHEDULED:    { label: "Agendada",    cls: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     icon: Clock },
  PROCESSING:   { label: "Processando", cls: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       icon: Loader2 },
  WAITING_MUNICIPAL_PROCESSING: { label: "Aguard. Prefeitura", cls: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Loader2 },
  CANCELED:     { label: "Cancelada",   cls: "text-neutral-500", bg: "bg-neutral-100 border-neutral-200", icon: XCircle },
  CANCELLED:    { label: "Cancelada",   cls: "text-neutral-500", bg: "bg-neutral-100 border-neutral-200", icon: XCircle },
  ERROR:        { label: "Erro",        cls: "text-red-700",     bg: "bg-red-50 border-red-200",         icon: AlertTriangle },
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default function RelatorioNFPage() {
  const [, setLocation] = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading, refetch, isFetching } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    return invoices
      .filter(i => i.nfse_status)
      .filter(i => {
        const d = (i.created_at || "").slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .filter(i => {
        if (statusFilter === "all") return true;
        const st = (i.nfse_status || "").toUpperCase();
        if (statusFilter === "AUTHORIZED") return st === "AUTHORIZED" || st === "SYNCHRONIZED";
        if (statusFilter === "CANCELED") return st === "CANCELED" || st === "CANCELLED";
        return st === statusFilter;
      })
      .filter(i => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (i.client_name || "").toLowerCase().includes(q)
          || (i.nfse_number || "").toLowerCase().includes(q)
          || (i.asaas_payment_id || "").toLowerCase().includes(q)
          || String(i.id).includes(q);
      })
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [invoices, from, to, statusFilter, search]);

  const totals = useMemo(() => {
    const sum = (arr: Invoice[]) => arr.reduce((s, i) => s + parseFloat(i.value || "0"), 0);
    const inRange = invoices.filter(i => i.nfse_status).filter(i => {
      const d = (i.created_at || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    const auth = inRange.filter(i => ["AUTHORIZED", "SYNCHRONIZED"].includes((i.nfse_status || "").toUpperCase()));
    const canc = inRange.filter(i => ["CANCELED", "CANCELLED"].includes((i.nfse_status || "").toUpperCase()));
    const proc = inRange.filter(i => ["PROCESSING", "WAITING_MUNICIPAL_PROCESSING", "SCHEDULED"].includes((i.nfse_status || "").toUpperCase()));
    const err = inRange.filter(i => (i.nfse_status || "").toUpperCase() === "ERROR");
    return {
      total: inRange.length, totalValue: sum(inRange),
      authCount: auth.length, authValue: sum(auth),
      cancCount: canc.length, cancValue: sum(canc),
      procCount: proc.length, procValue: sum(proc),
      errCount: err.length, errValue: sum(err),
    };
  }, [invoices, from, to]);

  const handleExport = () => {
    const rows = filtered.map(i => {
      const st = (i.nfse_status || "").toUpperCase();
      const cfg = NF_STATUS[st] || { label: st };
      return {
        "ID Fatura": i.id,
        "Nº NFS-e": i.nfse_number && !i.nfse_number.startsWith("inv_") ? i.nfse_number : "",
        "ID Asaas": i.asaas_payment_id || "",
        "Cliente": i.client_name,
        "CPF/CNPJ": i.client_cpf_cnpj || "",
        "Status NF": cfg.label,
        "Valor (R$)": Number(parseFloat(i.value || "0").toFixed(2)),
        "Emissão": fmtDate(i.created_at),
        "Vencimento": fmtDate(i.due_date),
        "Pagamento": fmtDate(i.payment_date),
        "URL NFS-e": i.nfse_url || "",
      };
    });
    exportFormattedExcel(rows, `relatorio-nf-${from}-a-${to}`, "Notas Fiscais");
  };

  const cards = [
    { key: "all", label: "Total NFs", value: totals.totalValue, count: totals.total, color: "from-indigo-600 to-indigo-700", text: "text-white", iconColor: "text-white", icon: Receipt, dark: true },
    { key: "AUTHORIZED", label: "Autorizadas", value: totals.authValue, count: totals.authCount, color: "border-l-emerald-400", text: "text-emerald-700", iconColor: "text-emerald-600", icon: CheckCircle2 },
    { key: "PROCESSING", label: "Processando", value: totals.procValue, count: totals.procCount, color: "border-l-blue-400", text: "text-blue-700", iconColor: "text-blue-600", icon: Loader2 },
    { key: "CANCELED", label: "Canceladas", value: totals.cancValue, count: totals.cancCount, color: "border-l-neutral-300", text: "text-neutral-600", iconColor: "text-neutral-400", icon: XCircle },
    { key: "ERROR", label: "Com Erro", value: totals.errValue, count: totals.errCount, color: "border-l-red-400", text: "text-red-700", iconColor: "text-red-500", icon: AlertTriangle },
  ];

  return (
    <AdminLayout>
    <div className="p-4 sm:p-6 space-y-5">
      <div className="rounded-2xl bg-neutral-900 text-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight" data-testid="text-page-title">
              <Receipt className="inline w-6 h-6 mr-2 text-emerald-400" /> Relatório de Notas Fiscais
            </h1>
            <p className="text-xs text-neutral-400 mt-1">NFS-e emitidas via Asaas — período {fmtDate(from)} a {fmtDate(to)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-neutral-800 rounded-md px-2 py-1">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-7 w-32 text-xs bg-transparent border-none text-white" data-testid="input-date-from" />
              <span className="text-neutral-500 text-xs">até</span>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-7 w-32 text-xs bg-transparent border-none text-white" data-testid="input-date-to" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 text-xs bg-transparent border-neutral-600 text-white hover:bg-neutral-800" data-testid="button-refresh">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={handleExport} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" data-testid="button-export">
              <Download className="w-3.5 h-3.5 mr-1" /> Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          const active = (statusFilter === c.key) || (statusFilter === "all" && c.key === "all");
          return (
            <Card
              key={c.key}
              onClick={() => setStatusFilter(c.key)}
              className={`p-3 cursor-pointer transition-all ${c.dark ? `bg-gradient-to-br ${c.color} border-0 shadow-md ${active ? "ring-2 ring-indigo-300" : ""}` : `bg-white border-l-4 ${c.color} ${active ? "ring-2 ring-neutral-300 shadow-md" : "shadow-sm hover:shadow-md"}`}`}
              data-testid={`card-${c.key}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-full ${c.dark ? "bg-white/20" : "bg-neutral-50"} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${c.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] uppercase font-bold tracking-wider truncate ${c.dark ? "text-indigo-100" : "text-neutral-500"}`}>{c.label}</p>
                  <p className={`text-base font-black truncate ${c.text}`}>{fmtBRL(c.value)}</p>
                  <p className={`text-[9px] font-semibold truncate ${c.dark ? "text-indigo-100" : "text-neutral-400"}`}>{c.count} {c.count === 1 ? "nota" : "notas"}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="bg-white shadow-sm">
        <div className="p-4 border-b border-neutral-100 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Buscar por cliente, nº da NF, ID Asaas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 h-9 text-xs" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="AUTHORIZED">Autorizadas</SelectItem>
              <SelectItem value="PROCESSING">Em Processamento</SelectItem>
              <SelectItem value="SCHEDULED">Agendadas</SelectItem>
              <SelectItem value="CANCELED">Canceladas</SelectItem>
              <SelectItem value="ERROR">Com Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-nf">
              <thead>
                <tr className="bg-neutral-900 text-white text-[10px] uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left">Status NF</th>
                  <th className="px-3 py-2.5 text-left">Nº NFS-e</th>
                  <th className="px-3 py-2.5 text-left">Cliente</th>
                  <th className="px-3 py-2.5 text-left">CPF/CNPJ</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-center">Emissão</th>
                  <th className="px-3 py-2.5 text-center">Vencimento</th>
                  <th className="px-3 py-2.5 text-center">Cobrança</th>
                  <th className="px-3 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-neutral-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                      Nenhuma NF encontrada no período
                    </td>
                  </tr>
                ) : filtered.map((i, idx) => {
                  const st = (i.nfse_status || "").toUpperCase();
                  const cfg = NF_STATUS[st] || { label: st, cls: "text-neutral-600", bg: "bg-neutral-50 border-neutral-200", icon: FileText };
                  const StIcon = cfg.icon;
                  const nfNum = i.nfse_number && !i.nfse_number.startsWith("inv_") ? i.nfse_number : null;
                  const invStatus = (i.status || "").toUpperCase();
                  const invStMap: Record<string, { label: string; cls: string }> = {
                    PENDING: { label: "Em Aberto", cls: "text-yellow-700 bg-yellow-50 border-yellow-200" },
                    CONFIRMED: { label: "Recebido", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                    RECEIVED: { label: "Recebido", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                    OVERDUE: { label: "Vencido", cls: "text-red-700 bg-red-50 border-red-200" },
                    CANCELLED: { label: "Cancelado", cls: "text-neutral-500 bg-neutral-100 border-neutral-200" },
                  };
                  const invCfg = invStMap[invStatus] || { label: invStatus, cls: "text-blue-700 bg-blue-50 border-blue-200" };
                  return (
                    <tr key={i.id} className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`} data-testid={`row-nf-${i.id}`}>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls} ${cfg.bg}`}>
                          <StIcon className={`w-3 h-3 ${st === "PROCESSING" ? "animate-spin" : ""}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-neutral-700 whitespace-nowrap">
                        {nfNum || <span className="text-neutral-300">—</span>}
                        <span className="text-neutral-400 ml-1 text-[10px]">#{i.id}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-neutral-800 max-w-[200px] truncate" title={i.client_name}>{i.client_name}</td>
                      <td className="px-3 py-2 text-neutral-500 font-mono text-[10px] whitespace-nowrap">{i.client_cpf_cnpj || "—"}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-800 whitespace-nowrap">{fmtBRL(parseFloat(i.value || "0"))}</td>
                      <td className="px-3 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtDate(i.created_at)}</td>
                      <td className="px-3 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtDate(i.due_date)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${invCfg.cls}`}>{invCfg.label}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          {i.nfse_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-emerald-600 hover:bg-emerald-50"
                              title="Ver espelho da NF"
                              onClick={() => window.open(`/api/invoices/${i.id}/nfse-pdf`, "_blank", "noopener,noreferrer")}
                              data-testid={`button-view-nf-${i.id}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-indigo-600 hover:bg-indigo-50"
                            title="Abrir fatura"
                            onClick={() => setLocation("/admin/faturas")}
                            data-testid={`button-open-invoice-${i.id}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-neutral-50 border-t-2 border-neutral-200 font-bold">
                    <td colSpan={4} className="px-3 py-2.5 text-right text-neutral-600 uppercase text-[10px] tracking-wider">Total ({filtered.length} {filtered.length === 1 ? "NF" : "NFs"})</td>
                    <td className="px-3 py-2.5 text-right text-neutral-900">{fmtBRL(filtered.reduce((s, i) => s + parseFloat(i.value || "0"), 0))}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
    </AdminLayout>
  );
}
