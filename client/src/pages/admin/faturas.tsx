import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, authFetch } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Plus, Search, RefreshCw, Loader2, X, ExternalLink,
  FileText, DollarSign, Calendar, CheckCircle2, XCircle,
  Clock, AlertTriangle, Send, Copy, Eye, Trash2,
  Building2, Download, Receipt,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Invoice {
  id: number;
  client_id: number | null;
  client_name: string;
  client_cpf_cnpj: string | null;
  asaas_customer_id: string | null;
  asaas_payment_id: string | null;
  service_order_id: number | null;
  description: string;
  value: string;
  net_value: string | null;
  due_date: string;
  billing_type: string;
  status: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_copia_e_cola: string | null;
  payment_date: string | null;
  external_reference: string | null;
  notes: string | null;
  created_at: string;
}

interface AsaasStatus {
  connected: boolean;
  message?: string;
  balance?: { balance: number; };
}

const STATUS_MAP: Record<string, { label: string; color: string; badgeCls: string; icon: any }> = {
  PENDING:          { label: "Pendente",     color: "bg-yellow-100 text-yellow-800 border-yellow-200", badgeCls: "bg-yellow-50 text-yellow-700 border border-yellow-200", icon: Clock },
  CONFIRMED:        { label: "Confirmado",   color: "bg-green-100 text-green-800 border-green-200",   badgeCls: "bg-green-50 text-green-700 border border-green-200",   icon: CheckCircle2 },
  RECEIVED:         { label: "Recebido",     color: "bg-emerald-100 text-emerald-800 border-emerald-200", badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: DollarSign },
  OVERDUE:          { label: "Vencido",      color: "bg-red-100 text-red-800 border-red-200",         badgeCls: "bg-red-50 text-red-700 border border-red-200",         icon: AlertTriangle },
  CANCELLED:        { label: "Cancelado",    color: "bg-neutral-100 text-neutral-500 border-neutral-200", badgeCls: "bg-neutral-100 text-neutral-500 border border-neutral-200", icon: XCircle },
  REFUNDED:         { label: "Estornado",    color: "bg-purple-100 text-purple-800 border-purple-200",   badgeCls: "bg-purple-50 text-purple-700 border border-purple-200",   icon: RefreshCw },
  RECEIVED_IN_CASH: { label: "Pago Manual",  color: "bg-emerald-100 text-emerald-800 border-emerald-200", badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: DollarSign },
};

const BILLING_TYPES: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CREDIT_CARD: "Cartão",
  UNDEFINED: "Cliente Escolhe",
};

function fmt(val: string | number | null | undefined): string {
  if (!val) return "R$ 0,00";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function fmtDateFull(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return d; }
}

export default function FaturasPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [monthFilter, setMonthFilter] = useState("");

  const { data: asaasStatus } = useQuery<AsaasStatus>({
    queryKey: ["/api/asaas/status"],
  });

  const { data: invoices = [], isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices", statusFilter, monthFilter],
    queryFn: async () => {
      let url = `/api/invoices?status=${statusFilter}`;
      if (monthFilter) url += `&month=${monthFilter}`;
      const r = await authFetch(url);
      if (!r.ok) throw new Error("Erro ao buscar faturas");
      return r.json();
    },
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const filtered = useMemo(() => {
    if (!searchTerm) return invoices;
    const q = searchTerm.toLowerCase();
    return invoices.filter(inv =>
      inv.client_name.toLowerCase().includes(q) ||
      inv.description.toLowerCase().includes(q) ||
      (inv.asaas_payment_id && inv.asaas_payment_id.toLowerCase().includes(q)) ||
      String(inv.id).includes(q)
    );
  }, [invoices, searchTerm]);

  const totals = useMemo(() => {
    const emAberto = invoices.filter(i => i.status === "PENDING").reduce((s, i) => s + parseFloat(i.value || "0"), 0);
    const emAbertoCount = invoices.filter(i => i.status === "PENDING").length;
    const pagas = invoices.filter(i => ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(i.status)).reduce((s, i) => s + parseFloat(i.net_value || i.value || "0"), 0);
    const pagasCount = invoices.filter(i => ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(i.status)).length;
    const vencidas = invoices.filter(i => i.status === "OVERDUE" || (i.status === "PENDING" && new Date(i.due_date + "T23:59:59") < new Date())).length;
    const vencidasTotal = invoices.filter(i => i.status === "OVERDUE" || (i.status === "PENDING" && new Date(i.due_date + "T23:59:59") < new Date())).reduce((s, i) => s + parseFloat(i.value || "0"), 0);
    const canceladas = invoices.filter(i => i.status === "CANCELLED").length;
    return { emAberto, emAbertoCount, pagas, pagasCount, vencidas, vencidasTotal, canceladas, total: invoices.length };
  }, [invoices]);

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/invoices/${id}/sync`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Fatura sincronizada com Asaas" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const resendMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/invoices/${id}/resend`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => toast({ title: "Notificação reenviada ao cliente" }),
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Fatura excluída" });
      setShowDetail(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RECEIVED_IN_CASH", payment_date: new Date().toISOString().split("T")[0] }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Fatura marcada como paga — baixa automática realizada" });
      setShowDetail(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Fatura cancelada" });
      setShowDetail(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const getDisplayStatus = (inv: Invoice) => {
    const isOverdue = inv.status === "PENDING" && new Date(inv.due_date + "T23:59:59") < new Date();
    return isOverdue ? STATUS_MAP.OVERDUE : (STATUS_MAP[inv.status] || STATUS_MAP.PENDING);
  };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6" data-testid="faturas-page">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2" data-testid="text-page-title">
                <Receipt className="w-7 h-7 text-indigo-600" />
                Controle de Faturas / NF
              </h1>
              <div className="text-sm text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>Gerencie cobranças, NFs e faturamento — CNAE 7870</span>
                {asaasStatus?.connected && (
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Asaas Online
                  </Badge>
                )}
                {asaasStatus && !asaasStatus.connected && (
                  <Badge className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px]">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Asaas: configure API Key
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold text-xs"
                data-testid="button-sync-all"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
              </Button>
              <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs" data-testid="button-new-invoice">
                <Plus className="w-4 h-4 mr-1.5" /> Nova Fatura
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 bg-white shadow-sm border-l-4 border-l-yellow-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider">Em Aberto</p>
                  <p className="text-xl font-black text-yellow-700" data-testid="text-pending-total">{fmt(totals.emAberto)}</p>
                  <p className="text-[10px] text-neutral-400">{totals.emAbertoCount} fatura{totals.emAbertoCount !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white shadow-sm border-l-4 border-l-emerald-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider">Pagas</p>
                  <p className="text-xl font-black text-emerald-700" data-testid="text-received-total">{fmt(totals.pagas)}</p>
                  <p className="text-[10px] text-neutral-400">{totals.pagasCount} fatura{totals.pagasCount !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white shadow-sm border-l-4 border-l-red-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider">Vencidas</p>
                  <p className="text-xl font-black text-red-700" data-testid="text-overdue-count">{fmt(totals.vencidasTotal)}</p>
                  <p className="text-[10px] text-neutral-400">{totals.vencidas} fatura{totals.vencidas !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white shadow-sm border-l-4 border-l-neutral-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-neutral-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider">Canceladas</p>
                  <p className="text-xl font-black text-neutral-600" data-testid="text-cancelled-count">{totals.canceladas}</p>
                  <p className="text-[10px] text-neutral-400">fatura{totals.canceladas !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="bg-white shadow-sm">
            <div className="p-4 border-b border-neutral-100">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <Input
                      placeholder="Buscar por cliente, NF, ID Asaas..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10 h-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <div className="w-40">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos os Status</SelectItem>
                      <SelectItem value="PENDING">Pendente</SelectItem>
                      <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                      <SelectItem value="RECEIVED">Recebido</SelectItem>
                      <SelectItem value="OVERDUE">Vencido</SelectItem>
                      <SelectItem value="CANCELLED">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Input
                    type="month"
                    value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)}
                    className="h-10"
                    data-testid="input-month-filter"
                  />
                </div>
                {(statusFilter !== "ALL" || monthFilter || searchTerm) && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("ALL"); setMonthFilter(""); setSearchTerm(""); }} className="h-10" data-testid="button-clear-filters">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center">
                <Receipt className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500 font-medium">Nenhuma fatura encontrada</p>
                <p className="text-sm text-neutral-400 mt-1">Clique em "Nova Fatura" para criar ou ajuste os filtros</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-neutral-50/80">
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>NF / ID</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor (R$)</TableHead>
                      <TableHead className="hidden md:table-cell">Emissão</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="hidden lg:table-cell">Tipo</TableHead>
                      <TableHead className="hidden lg:table-cell">Asaas</TableHead>
                      <TableHead className="w-[80px] text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(inv => {
                      const ds = getDisplayStatus(inv);
                      const DsIcon = ds.icon;
                      return (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer group"
                          onClick={() => setShowDetail(inv)}
                          data-testid={`row-invoice-${inv.id}`}
                        >
                          <TableCell>
                            <Badge className={`text-[10px] font-bold ${ds.badgeCls} whitespace-nowrap`}>
                              <DsIcon className="w-3 h-3 mr-1" />
                              {ds.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-xs font-mono font-bold text-neutral-700">NF-{String(inv.id).padStart(4, "0")}</p>
                              {inv.asaas_payment_id && (
                                <p className="text-[10px] text-indigo-500 font-mono truncate max-w-[140px]">{inv.asaas_payment_id}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-bold text-neutral-900 uppercase truncate max-w-[200px]">{inv.client_name}</p>
                            {inv.client_cpf_cnpj && (
                              <p className="text-[10px] text-neutral-400 font-mono">{inv.client_cpf_cnpj}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="text-sm font-black text-neutral-900 tabular-nums">{fmt(inv.value)}</p>
                            {inv.net_value && inv.net_value !== inv.value && (
                              <p className="text-[10px] text-emerald-600 font-semibold">Liq: {fmt(inv.net_value)}</p>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs text-neutral-500 tabular-nums">{fmtDateFull(inv.created_at)}</span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium tabular-nums ${
                              inv.status === "PENDING" && new Date(inv.due_date + "T23:59:59") < new Date() ? "text-red-600 font-bold" : "text-neutral-600"
                            }`}>
                              {fmtDate(inv.due_date)}
                            </span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-xs text-neutral-500">{BILLING_TYPES[inv.billing_type] || inv.billing_type}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {inv.asaas_payment_id ? (
                              <Badge className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200">
                                {inv.status}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-neutral-400">Local</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowDetail(inv); }}
                                className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-indigo-600 transition-colors"
                                title="Ver detalhes"
                                data-testid={`button-view-${inv.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {inv.asaas_payment_id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); syncMutation.mutate(inv.id); }}
                                  className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-emerald-600 transition-colors"
                                  title="Sincronizar com Asaas"
                                  data-testid={`button-sync-${inv.id}`}
                                >
                                  <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50/50 text-xs text-neutral-500 flex items-center justify-between">
                  <span>{filtered.length} fatura{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}</span>
                  <span className="font-semibold text-neutral-700">Total: {fmt(filtered.reduce((s, i) => s + parseFloat(i.value || "0"), 0))}</span>
                </div>
              </>
            )}
          </Card>

          {showCreate && (
            <CreateInvoiceDialog
              clients={clients}
              asaasConnected={!!asaasStatus?.connected}
              onClose={() => setShowCreate(false)}
            />
          )}

          {showDetail && (
            <InvoiceDetailDialog
              invoice={showDetail}
              onClose={() => setShowDetail(null)}
              onSync={() => syncMutation.mutate(showDetail.id)}
              onResend={() => resendMutation.mutate(showDetail.id)}
              onDelete={() => { if (confirm("Excluir esta fatura?")) deleteMutation.mutate(showDetail.id); }}
              onMarkPaid={() => markPaidMutation.mutate(showDetail.id)}
              onCancel={() => { if (confirm("Cancelar esta fatura?")) cancelMutation.mutate(showDetail.id); }}
              syncing={syncMutation.isPending}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function CreateInvoiceDialog({ clients, asaasConnected, onClose }: { clients: any[]; asaasConnected: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    clientName: "",
    clientCpfCnpj: "",
    clientId: "",
    description: "",
    value: "",
    dueDate: "",
    billingType: "BOLETO",
    notes: "",
    sendToAsaas: true,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          clientId: form.clientId ? parseInt(form.clientId) : null,
          sendToAsaas: true,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Fatura criada com sucesso" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c: any) => String(c.id) === clientId);
    if (client) {
      setForm(prev => ({
        ...prev,
        clientId,
        clientName: client.name,
        clientCpfCnpj: client.cnpj || client.cpf || "",
      }));
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" /> Nova Fatura
          </DialogTitle>
          <DialogDescription>Preencha os dados para gerar uma nova cobrança</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs font-bold">Cliente</Label>
            <Select value={form.clientId} onValueChange={handleClientSelect}>
              <SelectTrigger data-testid="select-client">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">Nome do Cliente</Label>
              <Input
                value={form.clientName}
                onChange={e => setForm(prev => ({ ...prev, clientName: e.target.value }))}
                placeholder="Razão Social"
                data-testid="input-client-name"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">CPF/CNPJ</Label>
              <Input
                value={form.clientCpfCnpj}
                onChange={e => setForm(prev => ({ ...prev, clientCpfCnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
                data-testid="input-cpf-cnpj"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold">Descrição</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Ref. ao Serviço de Escolta Armada — OS TOR-0019"
              rows={2}
              data-testid="input-description"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-bold">Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.value}
                onChange={e => setForm(prev => ({ ...prev, value: e.target.value }))}
                placeholder="0,00"
                data-testid="input-value"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">Vencimento</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))}
                data-testid="input-due-date"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">Forma</Label>
              <Select value={form.billingType} onValueChange={v => setForm(prev => ({ ...prev, billingType: v }))}>
                <SelectTrigger data-testid="select-billing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="CREDIT_CARD">Cartão</SelectItem>
                  <SelectItem value="UNDEFINED">Cliente Escolhe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold">Observações</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas internas (não vai para o cliente)"
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-[11px] text-emerald-700 font-medium">Cobrança gerada automaticamente via Asaas com NFS-e (CNAE 7870). Baixa automática ao confirmar pagamento.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-create">Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.clientName || !form.value || !form.dueDate || !form.description}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-submit-invoice"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
              Criar Fatura
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({ invoice, onClose, onSync, onResend, onDelete, onMarkPaid, onCancel, syncing }: {
  invoice: Invoice;
  onClose: () => void;
  onSync: () => void;
  onResend: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  syncing: boolean;
}) {
  const { toast } = useToast();
  const st = STATUS_MAP[invoice.status] || STATUS_MAP.PENDING;
  const StIcon = st.icon;
  const isPaid = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(invoice.status);
  const isCancelled = invoice.status === "CANCELLED";

  const copyPix = () => {
    if (invoice.pix_copia_e_cola) {
      navigator.clipboard.writeText(invoice.pix_copia_e_cola);
      toast({ title: "PIX Copia e Cola copiado!" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Fatura NF-{String(invoice.id).padStart(4, "0")}
          </DialogTitle>
          <DialogDescription>Detalhes e ações da cobrança</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <Badge className={`${st.badgeCls} font-bold`}>
              <StIcon className="w-3 h-3 mr-1" />
              {st.label}
            </Badge>
            {invoice.asaas_payment_id && (
              <span className="text-[10px] text-neutral-400 font-mono">{invoice.asaas_payment_id}</span>
            )}
          </div>

          <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border">
            <div className="flex justify-between items-start">
              <span className="text-xs text-neutral-500">Cliente</span>
              <div className="text-right">
                <span className="text-sm font-bold text-neutral-900 uppercase">{invoice.client_name}</span>
                {invoice.client_cpf_cnpj && (
                  <p className="text-[10px] text-neutral-400 font-mono">{invoice.client_cpf_cnpj}</p>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Descrição</span>
              <span className="text-xs text-right max-w-[60%] text-neutral-600">{invoice.description}</span>
            </div>
            <div className="border-t border-neutral-200 pt-3 flex justify-between items-baseline">
              <span className="text-xs text-neutral-500">Valor Total</span>
              <span className="text-2xl font-black text-neutral-900">{fmt(invoice.value)}</span>
            </div>
            {invoice.net_value && invoice.net_value !== invoice.value && (
              <div className="flex justify-between">
                <span className="text-xs text-neutral-500">Valor Líquido</span>
                <span className="text-sm font-bold text-emerald-700">{fmt(invoice.net_value)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-200">
              <div>
                <p className="text-[10px] text-neutral-400">Emissão</p>
                <p className="text-xs font-semibold">{fmtDateFull(invoice.created_at)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400">Vencimento</p>
                <p className="text-xs font-semibold">{fmtDate(invoice.due_date)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400">Forma</p>
                <p className="text-xs font-semibold">{BILLING_TYPES[invoice.billing_type] || invoice.billing_type}</p>
              </div>
              {invoice.payment_date && (
                <div>
                  <p className="text-[10px] text-neutral-400">Data Pagamento</p>
                  <p className="text-xs font-bold text-emerald-700">{fmtDate(invoice.payment_date)}</p>
                </div>
              )}
            </div>
            {invoice.service_order_id && (
              <div className="flex justify-between pt-2 border-t border-neutral-200">
                <span className="text-xs text-neutral-500">Ordem de Serviço</span>
                <Badge variant="outline" className="text-indigo-600 border-indigo-200 text-xs">OS #{invoice.service_order_id}</Badge>
              </div>
            )}
            {invoice.notes && (
              <div className="pt-2 border-t border-neutral-200">
                <p className="text-[10px] text-neutral-400 mb-1">Observações</p>
                <p className="text-xs text-neutral-600 bg-white p-2 rounded border">{invoice.notes}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {invoice.invoice_url && (
              <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" data-testid="button-view-invoice">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> Ver NF
                </Button>
              </a>
            )}
            {invoice.bank_slip_url && (
              <a href={invoice.bank_slip_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" data-testid="button-view-boleto">
                  <Download className="w-3.5 h-3.5 mr-1" /> Boleto
                </Button>
              </a>
            )}
            {invoice.pix_copia_e_cola && (
              <Button variant="outline" size="sm" onClick={copyPix} data-testid="button-copy-pix">
                <Copy className="w-3.5 h-3.5 mr-1" /> Copiar PIX
              </Button>
            )}
          </div>

          {invoice.pix_qr_code && (
            <div className="text-center bg-white border rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-2 font-bold">QR Code PIX</p>
              <img src={`data:image/png;base64,${invoice.pix_qr_code}`} alt="PIX QR Code" className="w-48 h-48 mx-auto" data-testid="img-pix-qrcode" />
            </div>
          )}

          {isPaid && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 font-medium">Pagamento confirmado — baixa automática realizada no sistema.</p>
            </div>
          )}

          <div className="border-t pt-4 flex flex-wrap gap-2">
            {invoice.asaas_payment_id && (
              <>
                <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} data-testid="button-sync">
                  {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Sincronizar
                </Button>
                {!isPaid && !isCancelled && (
                  <Button variant="outline" size="sm" onClick={onResend} data-testid="button-resend">
                    <Send className="w-3.5 h-3.5 mr-1" /> Reenviar
                  </Button>
                )}
              </>
            )}
            {!isPaid && !isCancelled && (
              <>
                <Button variant="outline" size="sm" onClick={onMarkPaid} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" data-testid="button-mark-paid">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar Pgto
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel} className="text-red-600 border-red-200 hover:bg-red-50" data-testid="button-cancel-invoice">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-500 hover:bg-red-50 ml-auto" data-testid="button-delete-invoice">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
