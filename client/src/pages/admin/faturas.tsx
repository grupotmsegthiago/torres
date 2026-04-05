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
  Plus, Search, RefreshCw, Loader2, X, ExternalLink,
  FileText, DollarSign, Calendar, CheckCircle2, XCircle,
  Clock, AlertTriangle, Send, Copy, Eye, Trash2,
  Building2, Filter, Download, Receipt,
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

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmado", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  RECEIVED: { label: "Recebido", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: DollarSign },
  OVERDUE: { label: "Vencido", color: "bg-red-100 text-red-800 border-red-200", icon: AlertTriangle },
  CANCELLED: { label: "Cancelado", color: "bg-neutral-100 text-neutral-500 border-neutral-200", icon: XCircle },
  REFUNDED: { label: "Estornado", color: "bg-purple-100 text-purple-800 border-purple-200", icon: RefreshCw },
  RECEIVED_IN_CASH: { label: "Recebido em Dinheiro", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: DollarSign },
};

const BILLING_TYPES: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de Crédito",
  UNDEFINED: "Definido pelo Cliente",
};

function formatCurrency(val: string | number | null | undefined): string {
  if (!val) return "R$ 0,00";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
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

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
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
      (inv.asaas_payment_id && inv.asaas_payment_id.toLowerCase().includes(q))
    );
  }, [invoices, searchTerm]);

  const totals = useMemo(() => {
    const pending = filtered.filter(i => i.status === "PENDING" || i.status === "OVERDUE").reduce((s, i) => s + parseFloat(i.value || "0"), 0);
    const received = filtered.filter(i => i.status === "CONFIRMED" || i.status === "RECEIVED" || i.status === "RECEIVED_IN_CASH").reduce((s, i) => s + parseFloat(i.net_value || i.value || "0"), 0);
    const overdue = filtered.filter(i => i.status === "OVERDUE").length;
    return { pending, received, overdue, total: filtered.length };
  }, [filtered]);

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
      toast({ title: "Fatura marcada como paga" });
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

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6" data-testid="faturas-page">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2" data-testid="text-page-title">
              <Receipt className="w-7 h-7 text-indigo-600" />
              Controle de Faturas
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Gerencie cobranças e faturas
              {asaasStatus?.connected && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Asaas conectado
                </span>
              )}
              {asaasStatus && !asaasStatus.connected && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Asaas offline
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="button-new-invoice">
            <Plus className="w-4 h-4 mr-2" /> Nova Fatura
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-neutral-500 uppercase font-bold">Total Faturas</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1" data-testid="text-total-count">{totals.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-amber-600 uppercase font-bold">A Receber</p>
            <p className="text-2xl font-bold text-amber-700 mt-1" data-testid="text-pending-total">{formatCurrency(totals.pending)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-emerald-600 uppercase font-bold">Recebido</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1" data-testid="text-received-total">{formatCurrency(totals.received)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-red-600 uppercase font-bold">Vencidos</p>
            <p className="text-2xl font-bold text-red-700 mt-1" data-testid="text-overdue-count">{totals.overdue}</p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  placeholder="Cliente, descrição..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
            <div className="w-40">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                  <SelectItem value="RECEIVED">Recebido</SelectItem>
                  <SelectItem value="OVERDUE">Vencido</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs">Mês</Label>
              <Input
                type="month"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                data-testid="input-month-filter"
              />
            </div>
            {(statusFilter !== "ALL" || monthFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("ALL"); setMonthFilter(""); }} data-testid="button-clear-filters">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-16 text-center">
            <Receipt className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 font-medium">Nenhuma fatura encontrada</p>
            <p className="text-sm text-neutral-400 mt-1">Clique em "Nova Fatura" para criar</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => {
              const st = STATUS_MAP[inv.status] || STATUS_MAP.PENDING;
              const StIcon = st.icon;
              const isOverdue = inv.status === "PENDING" && new Date(inv.due_date + "T23:59:59") < new Date();
              const displayStatus = isOverdue ? STATUS_MAP.OVERDUE : st;
              const DisplayIcon = displayStatus.icon;
              return (
                <Card
                  key={inv.id}
                  className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setShowDetail(inv)}
                  data-testid={`card-invoice-${inv.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                        <span className="font-semibold text-sm text-neutral-900 truncate">{inv.client_name}</span>
                        {inv.asaas_payment_id && (
                          <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-600 flex-shrink-0">ASAAS</Badge>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 truncate">{inv.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Venc: {formatDate(inv.due_date)}
                        </span>
                        <span>{BILLING_TYPES[inv.billing_type] || inv.billing_type}</span>
                        {inv.service_order_id && (
                          <span className="text-indigo-500">OS #{inv.service_order_id}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-neutral-900">{formatCurrency(inv.value)}</p>
                      <Badge className={`text-[10px] ${displayStatus.color} border mt-1`}>
                        <DisplayIcon className="w-3 h-3 mr-1" />
                        {displayStatus.label}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

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
    sendToAsaas: asaasConnected,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          clientId: form.clientId ? parseInt(form.clientId) : null,
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
              placeholder="Ex: Escolta realizada em 01/04/2026 — OS TOR-0019"
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

          {asaasConnected && (
            <label className="flex items-center gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100 cursor-pointer" data-testid="label-send-asaas">
              <input
                type="checkbox"
                checked={form.sendToAsaas}
                onChange={e => setForm(prev => ({ ...prev, sendToAsaas: e.target.checked }))}
                className="rounded border-indigo-300"
              />
              <div>
                <p className="text-sm font-bold text-indigo-800">Gerar cobrança no Asaas</p>
                <p className="text-[11px] text-indigo-600">Boleto/PIX será gerado automaticamente e enviado ao cliente</p>
              </div>
            </label>
          )}

          {!asaasConnected && (
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Asaas não conectado — fatura será registrada apenas localmente.
                Configure a ASAAS_API_KEY nos Secrets para ativar cobranças.
              </p>
            </div>
          )}

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
            Fatura #{invoice.id}
          </DialogTitle>
          <DialogDescription>Detalhes e ações da cobrança</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <Badge className={`${st.color} border`}>
              <StIcon className="w-3 h-3 mr-1" />
              {st.label}
            </Badge>
            {invoice.asaas_payment_id && (
              <span className="text-[10px] text-neutral-400">ID Asaas: {invoice.asaas_payment_id}</span>
            )}
          </div>

          <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Cliente</span>
              <span className="text-sm font-semibold text-right">{invoice.client_name}</span>
            </div>
            {invoice.client_cpf_cnpj && (
              <div className="flex justify-between">
                <span className="text-xs text-neutral-500">CPF/CNPJ</span>
                <span className="text-sm">{invoice.client_cpf_cnpj}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Descrição</span>
              <span className="text-sm text-right max-w-[60%]">{invoice.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Valor</span>
              <span className="text-lg font-bold text-neutral-900">{formatCurrency(invoice.value)}</span>
            </div>
            {invoice.net_value && invoice.net_value !== invoice.value && (
              <div className="flex justify-between">
                <span className="text-xs text-neutral-500">Valor Líquido</span>
                <span className="text-sm font-semibold text-emerald-700">{formatCurrency(invoice.net_value)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Vencimento</span>
              <span className="text-sm">{formatDate(invoice.due_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-neutral-500">Forma de Pagamento</span>
              <span className="text-sm">{BILLING_TYPES[invoice.billing_type] || invoice.billing_type}</span>
            </div>
            {invoice.payment_date && (
              <div className="flex justify-between">
                <span className="text-xs text-neutral-500">Data Pagamento</span>
                <span className="text-sm text-emerald-700 font-semibold">{formatDate(invoice.payment_date)}</span>
              </div>
            )}
            {invoice.service_order_id && (
              <div className="flex justify-between">
                <span className="text-xs text-neutral-500">Ordem de Serviço</span>
                <span className="text-sm text-indigo-600 font-semibold">OS #{invoice.service_order_id}</span>
              </div>
            )}
            {invoice.notes && (
              <div>
                <span className="text-xs text-neutral-500">Observações</span>
                <p className="text-sm text-neutral-700 mt-1 bg-white p-2 rounded border">{invoice.notes}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {invoice.invoice_url && (
              <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" data-testid="button-view-invoice">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> Ver Fatura
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
            <div className="text-center bg-white border rounded-lg p-4">
              <p className="text-xs text-neutral-500 mb-2 font-bold">QR Code PIX</p>
              <img src={`data:image/png;base64,${invoice.pix_qr_code}`} alt="PIX QR Code" className="w-48 h-48 mx-auto" data-testid="img-pix-qrcode" />
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
