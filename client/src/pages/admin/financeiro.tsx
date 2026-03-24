import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowDownCircle, ArrowUpCircle, Plus, Search, Edit, Trash2,
  RefreshCw, Calendar, DollarSign, Download, Printer,
  Loader2, CheckCircle2, X, AlertCircle, ClipboardCheck,
  BarChart3, Lock, Clock, Filter, Save, Tag, Layers,
  Building2, Wallet, ChevronRight,
} from "lucide-react";

type TransactionType = "INCOME" | "EXPENSE";
type TransactionStatus = "PENDING" | "PAID" | "CANCELLED";
type Step = "PAGAR" | "RECEBER" | "CONFERENCIA" | "RELATORIO" | "FECHAMENTO";
type StatusFilter = "ALL" | "PENDING" | "PAID" | "OVERDUE";
type ViewPeriod = "DAY" | "WEEK" | "MONTH" | "CUSTOM" | "ALL";

interface FinancialTransaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  due_date: string;
  payment_date: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  account_name: string | null;
  entity_type: string | null;
  entity_name: string | null;
  notes: string | null;
  status_conciliacao: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_at: string;
  created_by: string | null;
}

interface FinancialCategory {
  id: string;
  name: string;
  type: TransactionType;
  is_deduction: boolean;
  group: string;
  recurrence_type: string | null;
  tag: string | null;
  scope: string | null;
}

interface FinancialAccount {
  id: string;
  name: string;
  initial_balance: number;
  bank_name: string | null;
  account_number: string | null;
  status: string;
}

const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const STEPS: { id: Step; label: string; icon: typeof ArrowDownCircle; description: string; number: number }[] = [
  { id: "PAGAR", label: "Contas a Pagar", icon: ArrowDownCircle, description: "Despesas e pagamentos", number: 1 },
  { id: "RECEBER", label: "Contas a Receber", icon: ArrowUpCircle, description: "Valores a receber", number: 2 },
  { id: "CONFERENCIA", label: "Conferência", icon: ClipboardCheck, description: "Revisar pendências", number: 3 },
  { id: "RELATORIO", label: "Relatório", icon: BarChart3, description: "Controle financeiro", number: 4 },
  { id: "FECHAMENTO", label: "Fechamento", icon: Lock, description: "Fechar período", number: 5 },
];

function TransactionFormModal({ onClose, editingTransaction, categories, accounts }: {
  onClose: () => void;
  editingTransaction: FinancialTransaction | null;
  categories: FinancialCategory[];
  accounts: FinancialAccount[];
}) {
  const { toast } = useToast();
  const [type, setType] = useState<TransactionType>(editingTransaction?.type || "EXPENSE");
  const [description, setDescription] = useState(editingTransaction?.description || "");
  const [amount, setAmount] = useState(editingTransaction?.amount?.toString() || "");
  const [dueDate, setDueDate] = useState(editingTransaction?.due_date?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || "");
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || "");
  const [entityName, setEntityName] = useState(editingTransaction?.entity_name || "");
  const [status, setStatus] = useState<TransactionStatus>(editingTransaction?.status || "PENDING");
  const [notes, setNotes] = useState(editingTransaction?.notes || "");
  const [recurrence, setRecurrence] = useState<"SINGLE" | "INSTALLMENT">("SINGLE");
  const [installments, setInstallments] = useState(2);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cat = categories.find(c => c.id === categoryId);
      const acc = accounts.find(a => a.id === accountId);
      const payload = {
        description, amount: parseFloat(amount), type, status, due_date: dueDate,
        payment_date: status === "PAID" ? dueDate : null,
        category_id: categoryId || null, category_name: cat?.name || null,
        account_id: accountId || null, account_name: acc?.name || null,
        entity_name: entityName || null, notes: notes || null,
        ...((!editingTransaction && recurrence === "INSTALLMENT") ? { installments } : {}),
      };
      if (editingTransaction) {
        return apiRequest("PUT", `/api/financial/transactions/${editingTransaction.id}`, payload);
      }
      return apiRequest("POST", "/api/financial/transactions", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial/transactions"] });
      toast({ title: editingTransaction ? "Lançamento atualizado" : "Lançamento criado" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-transaction-form">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest" data-testid="text-form-title">
            {editingTransaction ? "Editar Lançamento" : "Novo Lançamento"}
          </h3>
          <button onClick={onClose} data-testid="button-close-form"><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div className="flex bg-neutral-100 p-1 rounded-lg">
            <button type="button" onClick={() => setType("INCOME")} data-testid="button-type-income"
              className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${type === "INCOME" ? "bg-green-600 text-white shadow-sm" : "text-neutral-500"}`}>Receita</button>
            <button type="button" onClick={() => setType("EXPENSE")} data-testid="button-type-expense"
              className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${type === "EXPENSE" ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500"}`}>Despesa</button>
          </div>
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Tag size={12} /> Descrição</label>
            <input required type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase bg-white" placeholder="Ex: Pagamento Fornecedor" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><DollarSign size={12} /> Valor</label>
              <input required type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold bg-white" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} data-testid="input-amount" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Calendar size={12} /> Vencimento</label>
              <input required type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold bg-white" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid="input-due-date" />
            </div>
          </div>
          {!editingTransaction && (
            <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-neutral-700 uppercase">
                  <input type="radio" name="recurrence" checked={recurrence === "SINGLE"} onChange={() => setRecurrence("SINGLE")} data-testid="radio-single" /> Único
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-neutral-700 uppercase">
                  <input type="radio" name="recurrence" checked={recurrence === "INSTALLMENT"} onChange={() => setRecurrence("INSTALLMENT")} data-testid="radio-installment" /> Parcelado
                </label>
              </div>
              {recurrence === "INSTALLMENT" && (
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-neutral-500" />
                  <span className="text-xs font-bold text-neutral-600">Parcelas:</span>
                  <select className="p-1 border border-neutral-300 rounded text-sm bg-white font-bold" value={installments} onChange={e => setInstallments(parseInt(e.target.value))} data-testid="select-installments">
                    {[2,3,4,5,6,7,8,9,10,11,12,18,24,36].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase">Categoria</label>
                <button type="button" onClick={() => setShowCategoryModal(true)} className="text-[9px] font-bold text-green-600 hover:text-green-700 uppercase" data-testid="button-new-category">+ Nova</button>
              </div>
              <select required className="w-full p-2.5 border border-neutral-200 rounded-lg text-xs bg-white uppercase font-bold" value={categoryId} onChange={e => setCategoryId(e.target.value)} data-testid="select-category">
                <option value="">Selecione...</option>
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Conta Bancária</label>
              <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-xs bg-white uppercase font-bold" value={accountId} onChange={e => setAccountId(e.target.value)} data-testid="select-account">
                <option value="">Opcional</option>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Building2 size={12} /> Favorecido/Pagador</label>
            <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase bg-white" placeholder="Nome do fornecedor ou cliente" value={entityName} onChange={e => setEntityName(e.target.value)} data-testid="input-entity" />
          </div>
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Status</label>
            <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white uppercase font-bold" value={status} onChange={e => setStatus(e.target.value as TransactionStatus)} data-testid="select-status">
              <option value="PENDING">Pendente (Agendado)</option>
              <option value="PAID">Liquidado (Pago/Recebido)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações</label>
            <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-notes" />
          </div>
          <button disabled={saveMutation.isPending} type="submit" data-testid="button-save-transaction"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {editingTransaction ? "Salvar Alteração" : "Confirmar Lançamento"}
          </button>
        </form>
      </div>
      {showCategoryModal && (
        <QuickCategoryModal
          initialType={type}
          onClose={() => setShowCategoryModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] });
            setShowCategoryModal(false);
          }}
        />
      )}
    </div>
  );
}

function QuickCategoryModal({ onClose, onSuccess, initialType = "EXPENSE" }: {
  onClose: () => void;
  onSuccess: () => void;
  initialType?: TransactionType;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>(initialType);
  const [group, setGroup] = useState("CUSTOS_VARIAVEIS");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/financial/categories", {
      name, type, group, recurrence_type: "VARIAVEL", tag: "OPERACIONAL", scope: "EMPRESA", is_deduction: group === "DEDUCOES",
    }),
    onSuccess: () => {
      toast({ title: "Categoria criada" });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-category">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-neutral-200">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 text-sm flex items-center gap-2"><Tag size={16} className="text-green-600" /> Nova Categoria</h3>
          <button onClick={onClose} data-testid="button-close-category"><X size={18} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; saveMutation.mutate(); }} className="p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">Nome</label>
            <input autoFocus type="text" required className="w-full p-2 border border-neutral-200 rounded-lg text-sm" placeholder="Ex: Material de Escritório" value={name} onChange={e => setName(e.target.value)} data-testid="input-category-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">Tipo</label>
              <select className="w-full p-2 border border-neutral-200 rounded-lg text-xs bg-white" value={type} onChange={e => setType(e.target.value as TransactionType)} data-testid="select-category-type">
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase mb-1 block">Grupo DRE</label>
              <select className="w-full p-2 border border-neutral-200 rounded-lg text-xs bg-white" value={group} onChange={e => setGroup(e.target.value)} data-testid="select-category-group">
                <option value="CUSTOS_VARIAVEIS">Custos Variáveis</option>
                <option value="DESPESAS_FIXAS">Despesas Fixas</option>
                <option value="RECEITA_BRUTA">Receita</option>
                <option value="DEDUCOES">Impostos/Deduções</option>
                <option value="INVESTIMENTOS">Investimentos</option>
                <option value="NAO_OPERACIONAL">Não Operacional</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-category"
            className="w-full py-2.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar e Usar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function FinanceiroPage() {
  const { toast } = useToast();
  const [activeStep, setActiveStep] = useState<Step>("PAGAR");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("MONTH");
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [closingNotes, setClosingNotes] = useState("");
  const [closingConfirmed, setClosingConfirmed] = useState(false);

  const { data: transactions = [], isLoading } = useQuery<FinancialTransaction[]>({
    queryKey: ["/api/financial/transactions"],
  });

  const { data: categories = [] } = useQuery<FinancialCategory[]>({
    queryKey: ["/api/financial/categories"],
  });

  const { data: accounts = [] } = useQuery<FinancialAccount[]>({
    queryKey: ["/api/financial/accounts"],
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/financial/transactions/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial/transactions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/financial/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial/transactions"] });
      toast({ title: "Lançamento excluído" });
    },
  });

  const periodFilteredTransactions = useMemo(() => {
    let list = [...transactions];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    if (viewPeriod === "DAY") {
      list = list.filter(t => t.due_date.split("T")[0] === todayStr);
    } else if (viewPeriod === "WEEK") {
      const day = now.getDay();
      const sunday = new Date(now); sunday.setDate(now.getDate() - day);
      const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
      list = list.filter(t => { const d = t.due_date.split("T")[0]; return d >= sunday.toISOString().split("T")[0] && d <= saturday.toISOString().split("T")[0]; });
    } else if (viewPeriod === "MONTH") {
      list = list.filter(t => { const d = new Date(t.due_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    } else if (viewPeriod === "CUSTOM") {
      list = list.filter(t => { const d = t.due_date.split("T")[0]; return d >= customStartDate && d <= customEndDate; });
    }
    return list;
  }, [transactions, viewPeriod, customStartDate, customEndDate]);

  const filteredByStep = useMemo(() => {
    const typeFilter = activeStep === "PAGAR" ? "EXPENSE" : activeStep === "RECEBER" ? "INCOME" : null;
    if (!typeFilter && activeStep !== "CONFERENCIA" && activeStep !== "RELATORIO") return [];
    let list = typeFilter ? periodFilteredTransactions.filter(t => t.type === typeFilter) : periodFilteredTransactions;
    const todayStr = new Date().toISOString().split("T")[0];
    if (statusFilter === "PENDING") list = list.filter(t => t.status === "PENDING");
    else if (statusFilter === "PAID") list = list.filter(t => t.status === "PAID");
    else if (statusFilter === "OVERDUE") list = list.filter(t => t.status === "PENDING" && t.due_date.split("T")[0] < todayStr);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(t => t.description.toLowerCase().includes(term) || (t.entity_name || "").toLowerCase().includes(term) || (t.category_name || "").toLowerCase().includes(term));
    }
    return list;
  }, [periodFilteredTransactions, activeStep, statusFilter, searchTerm]);

  const summaryPagar = useMemo(() => {
    const expenses = periodFilteredTransactions.filter(t => t.type === "EXPENSE");
    return {
      total: expenses.reduce((a, t) => a + Number(t.amount), 0),
      paid: expenses.filter(t => t.status === "PAID").reduce((a, t) => a + Number(t.amount), 0),
      pending: expenses.filter(t => t.status === "PENDING").reduce((a, t) => a + Number(t.amount), 0),
      count: expenses.length,
      paidCount: expenses.filter(t => t.status === "PAID").length,
    };
  }, [periodFilteredTransactions]);

  const summaryReceber = useMemo(() => {
    const incomes = periodFilteredTransactions.filter(t => t.type === "INCOME");
    return {
      total: incomes.reduce((a, t) => a + Number(t.amount), 0),
      paid: incomes.filter(t => t.status === "PAID").reduce((a, t) => a + Number(t.amount), 0),
      pending: incomes.filter(t => t.status === "PENDING").reduce((a, t) => a + Number(t.amount), 0),
      count: incomes.length,
      paidCount: incomes.filter(t => t.status === "PAID").length,
    };
  }, [periodFilteredTransactions]);

  const overduePagar = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return periodFilteredTransactions.filter(t => t.type === "EXPENSE" && t.status === "PENDING" && t.due_date.split("T")[0] < today);
  }, [periodFilteredTransactions]);

  const overdueReceber = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return periodFilteredTransactions.filter(t => t.type === "INCOME" && t.status === "PENDING" && t.due_date.split("T")[0] < today);
  }, [periodFilteredTransactions]);

  const handleDelete = (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    deleteMutation.mutate(id);
  };

  const exportToCSV = () => {
    if (filteredByStep.length === 0) return;
    const headers = ["Data", "Descrição", "Favorecido", "Categoria", "Valor", "Status"];
    const rows = filteredByStep.map(t => [
      new Date(t.due_date).toLocaleDateString("pt-BR"),
      t.description,
      t.entity_name || "Geral",
      t.category_name || "",
      Number(t.amount).toFixed(2),
      t.status === "PAID" ? "Pago" : "Pendente",
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FINANCEIRO_${activeStep}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const renderFilters = () => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end" data-testid="filters-panel">
      <div className="lg:col-span-5">
        <label className="text-[10px] font-black text-neutral-400 uppercase mb-1.5 block tracking-widest">Período</label>
        <div className="flex gap-1 bg-neutral-50 p-1 rounded-lg border border-neutral-100">
          {([["DAY", "Dia"], ["WEEK", "Semana"], ["MONTH", "Mês"], ["CUSTOM", "Custom"], ["ALL", "Tudo"]] as [ViewPeriod, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setViewPeriod(id)} data-testid={`button-period-${id.toLowerCase()}`}
              className={`flex-1 px-2 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${viewPeriod === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {viewPeriod === "CUSTOM" && (
        <div className="lg:col-span-3 flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-neutral-400 mb-1 block">Início</label>
            <input type="date" className="w-full p-2 border border-neutral-200 rounded-lg text-xs" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} data-testid="input-custom-start" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-bold text-neutral-400 mb-1 block">Fim</label>
            <input type="date" className="w-full p-2 border border-neutral-200 rounded-lg text-xs" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} data-testid="input-custom-end" />
          </div>
        </div>
      )}
      <div className={`relative ${viewPeriod === "CUSTOM" ? "lg:col-span-1" : "lg:col-span-4"}`}>
        <label className="text-[10px] font-black text-neutral-400 uppercase mb-1.5 block tracking-widest">Buscar</label>
        <input type="text" placeholder="Fornecedor, cliente..." className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:border-neutral-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} data-testid="input-search" />
        <Search size={18} className="absolute left-3 bottom-2.5 text-neutral-400" />
      </div>
      <div className="lg:col-span-3 flex gap-1 bg-neutral-100 p-1 rounded-lg">
        {([["ALL", "Tudo"], ["PENDING", "Pendente"], ["PAID", "Pago"], ["OVERDUE", "Vencido"]] as [StatusFilter, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setStatusFilter(id)} data-testid={`button-status-${id.toLowerCase()}`}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded transition-all ${
              statusFilter === id
                ? id === "PAID" ? "bg-green-500 text-white shadow-sm"
                : id === "OVERDUE" ? "bg-red-500 text-white shadow-sm"
                : id === "PENDING" ? "bg-amber-500 text-white shadow-sm"
                : "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500"
            }`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTable = (list: FinancialTransaction[]) => (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden" data-testid="transactions-table">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Favorecido</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-neutral-700" /></td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} className="p-12 text-center text-neutral-400 font-bold uppercase italic text-sm" data-testid="text-empty-table">Nenhum lançamento encontrado.</td></tr>
            ) : list.map(t => {
              const isOverdue = t.status === "PENDING" && t.due_date.split("T")[0] < new Date().toISOString().split("T")[0];
              return (
                <tr key={t.id} className={`hover:bg-neutral-50 transition-colors ${isOverdue ? "bg-red-50/50" : ""}`} data-testid={`row-transaction-${t.id}`}>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono font-bold ${isOverdue ? "text-red-600" : "text-neutral-500"}`}>
                      {new Date(t.due_date).toLocaleDateString("pt-BR")}
                    </span>
                    {isOverdue && <span className="block text-[8px] font-black text-red-500 uppercase">Vencido</span>}
                    {t.installment_total && t.installment_total > 1 && (
                      <span className="block text-[8px] font-bold text-neutral-400">{t.installment_number}/{t.installment_total}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-neutral-800 text-sm uppercase">{t.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-neutral-600 uppercase">{t.entity_name || "Geral"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 uppercase">
                      {t.category_name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleMutation.mutate(t.id)} data-testid={`button-toggle-${t.id}`}
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${
                        t.status === "PAID" ? "bg-green-100 text-green-800 border-green-200" : isOverdue ? "bg-red-100 text-red-700 border-red-200 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                      {t.status === "PAID" ? "Pago" : isOverdue ? "Vencido" : "Pendente"}
                    </button>
                  </td>
                  <td className={`px-4 py-3 text-right font-black font-mono text-sm ${t.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(Number(t.amount))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditingTransaction(t); setIsFormOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" data-testid={`button-edit-${t.id}`}><Edit size={14} /></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" data-testid={`button-delete-${t.id}`}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center text-xs font-bold text-neutral-500 uppercase">
        <span>{list.length} registro(s)</span>
        <span className="font-mono font-black text-neutral-900">Total: {formatCurrency(list.reduce((a, t) => a + Number(t.amount), 0))}</span>
      </div>
    </div>
  );

  const renderPagarReceber = () => {
    const isPagar = activeStep === "PAGAR";
    const summary = isPagar ? summaryPagar : summaryReceber;
    const overdue = isPagar ? overduePagar : overdueReceber;
    return (
      <div className="space-y-4">
        <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">
          Visão Geral ({viewPeriod === "DAY" ? "Hoje" : viewPeriod === "WEEK" ? "Semana Atual" : viewPeriod === "MONTH" ? "Mês Atual" : viewPeriod === "CUSTOM" ? "Período Personalizado" : "Todos os Registros"})
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3 border-neutral-200 shadow-sm" data-testid="card-total">
            <div className={`p-2.5 rounded-full ${isPagar ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
              {isPagar ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
            </div>
            <div>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Total {isPagar ? "a Pagar" : "a Receber"}</p>
              <p className={`text-lg font-black font-mono ${isPagar ? "text-red-600" : "text-green-600"}`}>{formatCurrency(summary.total)}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3 border-neutral-200 shadow-sm" data-testid="card-paid">
            <div className="p-2.5 bg-green-50 text-green-600 rounded-full"><CheckCircle2 size={18} /></div>
            <div>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">{isPagar ? "Pago" : "Recebido"}</p>
              <p className="text-lg font-black font-mono text-green-600">{formatCurrency(summary.paid)}</p>
              <p className="text-[9px] text-neutral-400 font-bold">{summary.paidCount} título(s)</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3 border-neutral-200 shadow-sm" data-testid="card-pending">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-full"><Clock size={18} /></div>
            <div>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Pendente</p>
              <p className="text-lg font-black font-mono text-amber-600">{formatCurrency(summary.pending)}</p>
              <p className="text-[9px] text-neutral-400 font-bold">{summary.count - summary.paidCount} título(s)</p>
            </div>
          </Card>
          <Card className={`p-4 flex items-center gap-3 shadow-sm ${overdue.length > 0 ? "bg-red-50 border-red-200" : "border-neutral-200"}`} data-testid="card-overdue">
            <div className={`p-2.5 rounded-full ${overdue.length > 0 ? "bg-red-100 text-red-600" : "bg-neutral-200 text-neutral-400"}`}><AlertCircle size={18} /></div>
            <div>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Vencidos</p>
              <p className={`text-lg font-black font-mono ${overdue.length > 0 ? "text-red-600" : "text-neutral-400"}`}>{overdue.length}</p>
              <p className="text-[9px] text-red-500 font-bold">{formatCurrency(overdue.reduce((a, t) => a + Number(t.amount), 0))}</p>
            </div>
          </Card>
        </div>
        {renderFilters()}
        {renderTable(filteredByStep)}
      </div>
    );
  };

  const renderConferencia = () => (
    <div className="space-y-4">
      {renderFilters()}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-5 rounded-xl border-2 ${overduePagar.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`} data-testid="panel-overdue-pagar">
          <div className="flex items-center gap-2 mb-3">
            {overduePagar.length > 0 ? <AlertCircle size={20} className="text-red-600" /> : <CheckCircle2 size={20} className="text-green-600" />}
            <h4 className="text-sm font-black text-neutral-900 uppercase">Contas a Pagar</h4>
          </div>
          {overduePagar.length > 0 ? (
            <div>
              <p className="text-xs text-red-700 font-bold mb-2">{overduePagar.length} título(s) vencido(s) — {formatCurrency(overduePagar.reduce((a, t) => a + Number(t.amount), 0))}</p>
              {overduePagar.slice(0, 5).map(t => (
                <div key={t.id} className="flex justify-between items-center py-1 border-b border-red-200 last:border-0">
                  <span className="text-[10px] font-bold text-neutral-700 uppercase truncate max-w-[60%]">{t.description}</span>
                  <span className="text-[10px] font-black text-red-600 font-mono">{formatCurrency(Number(t.amount))}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-green-700 font-bold">Nenhum título vencido. Tudo em dia!</p>}
        </div>
        <div className={`p-5 rounded-xl border-2 ${overdueReceber.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`} data-testid="panel-overdue-receber">
          <div className="flex items-center gap-2 mb-3">
            {overdueReceber.length > 0 ? <AlertCircle size={20} className="text-red-600" /> : <CheckCircle2 size={20} className="text-green-600" />}
            <h4 className="text-sm font-black text-neutral-900 uppercase">Contas a Receber</h4>
          </div>
          {overdueReceber.length > 0 ? (
            <div>
              <p className="text-xs text-red-700 font-bold mb-2">{overdueReceber.length} título(s) vencido(s) — {formatCurrency(overdueReceber.reduce((a, t) => a + Number(t.amount), 0))}</p>
              {overdueReceber.slice(0, 5).map(t => (
                <div key={t.id} className="flex justify-between items-center py-1 border-b border-red-200 last:border-0">
                  <span className="text-[10px] font-bold text-neutral-700 uppercase truncate max-w-[60%]">{t.description}</span>
                  <span className="text-[10px] font-black text-red-600 font-mono">{formatCurrency(Number(t.amount))}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-green-700 font-bold">Nenhum título vencido. Tudo em dia!</p>}
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm" data-testid="panel-conferencia-resumo">
        <h4 className="text-sm font-black text-neutral-900 uppercase mb-3 flex items-center gap-2"><ClipboardCheck size={16} /> Resumo da Conferência</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Total Pagar</p><p className="text-lg font-black text-red-600 font-mono">{formatCurrency(summaryPagar.total)}</p></div>
          <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Total Receber</p><p className="text-lg font-black text-green-600 font-mono">{formatCurrency(summaryReceber.total)}</p></div>
          <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Despesas Pagas</p><p className="text-lg font-black text-neutral-700">{summaryPagar.paidCount}</p></div>
          <div className={`p-3 rounded-lg ${summaryReceber.total - summaryPagar.total >= 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className="text-[9px] font-black text-neutral-400 uppercase">Saldo Líquido</p>
            <p className={`text-lg font-black font-mono ${summaryReceber.total - summaryPagar.total >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(summaryReceber.total - summaryPagar.total)}</p>
          </div>
        </div>
      </div>
      {renderTable(filteredByStep)}
    </div>
  );

  const renderRelatorio = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const paidExpenses = transactions.filter(t => t.type === "EXPENSE" && t.status === "PAID");
    const paidIncomes = transactions.filter(t => t.type === "INCOME" && t.status === "PAID");
    const overdueExpenses = transactions.filter(t => t.type === "EXPENSE" && t.status === "PENDING" && t.due_date.split("T")[0] < todayStr);
    const overdueIncomes = transactions.filter(t => t.type === "INCOME" && t.status === "PENDING" && t.due_date.split("T")[0] < todayStr);
    return (
      <div className="space-y-4" data-testid="panel-relatorio">
        <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
          <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2"><BarChart3 size={16} /> Relatório de Controle Financeiro</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
              <p className="text-[9px] font-black text-green-700 uppercase mb-1">Despesas Pagas</p>
              <p className="text-xl font-black text-green-700 font-mono">{formatCurrency(paidExpenses.reduce((a, t) => a + Number(t.amount), 0))}</p>
              <p className="text-[9px] text-green-600 font-bold">{paidExpenses.length} título(s)</p>
            </div>
            <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
              <p className="text-[9px] font-black text-green-700 uppercase mb-1">Receitas Recebidas</p>
              <p className="text-xl font-black text-green-700 font-mono">{formatCurrency(paidIncomes.reduce((a, t) => a + Number(t.amount), 0))}</p>
              <p className="text-[9px] text-green-600 font-bold">{paidIncomes.length} título(s)</p>
            </div>
            <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
              <p className="text-[9px] font-black text-red-700 uppercase mb-1">Despesas Vencidas</p>
              <p className="text-xl font-black text-red-700 font-mono">{formatCurrency(overdueExpenses.reduce((a, t) => a + Number(t.amount), 0))}</p>
              <p className="text-[9px] text-red-600 font-bold">{overdueExpenses.length} título(s)</p>
            </div>
            <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
              <p className="text-[9px] font-black text-red-700 uppercase mb-1">Recebíveis Vencidos</p>
              <p className="text-xl font-black text-red-700 font-mono">{formatCurrency(overdueIncomes.reduce((a, t) => a + Number(t.amount), 0))}</p>
              <p className="text-[9px] text-red-600 font-bold">{overdueIncomes.length} título(s)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-xs font-black text-neutral-700 uppercase mb-3">Despesas por Categoria</h5>
              {(() => {
                const catMap = new Map<string, number>();
                transactions.filter(t => t.type === "EXPENSE").forEach(t => {
                  const cat = t.category_name || "Sem categoria";
                  catMap.set(cat, (catMap.get(cat) || 0) + Number(t.amount));
                });
                const sorted = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
                const max = sorted[0]?.[1] || 1;
                return sorted.slice(0, 8).map(([cat, val]) => (
                  <div key={cat} className="mb-2">
                    <div className="flex justify-between text-[10px] font-bold text-neutral-600 mb-0.5">
                      <span className="uppercase truncate max-w-[70%]">{cat}</span>
                      <span className="font-mono text-neutral-900">{formatCurrency(val)}</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div className="bg-neutral-900 h-2 rounded-full transition-all" style={{ width: `${(val / max) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div>
              <h5 className="text-xs font-black text-neutral-700 uppercase mb-3">Receitas por Categoria</h5>
              {(() => {
                const catMap = new Map<string, number>();
                transactions.filter(t => t.type === "INCOME").forEach(t => {
                  const cat = t.category_name || "Sem categoria";
                  catMap.set(cat, (catMap.get(cat) || 0) + Number(t.amount));
                });
                const sorted = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
                const max = sorted[0]?.[1] || 1;
                return sorted.slice(0, 8).map(([cat, val]) => (
                  <div key={cat} className="mb-2">
                    <div className="flex justify-between text-[10px] font-bold text-neutral-600 mb-0.5">
                      <span className="uppercase truncate max-w-[70%]">{cat}</span>
                      <span className="font-mono text-green-600">{formatCurrency(val)}</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(val / max) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFechamento = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const pendingCount = transactions.filter(t => t.status === "PENDING").length;
    const overdueCount = transactions.filter(t => t.status === "PENDING" && t.due_date.split("T")[0] < todayStr).length;
    const hasPendencies = pendingCount > 0 || overdueCount > 0;
    return (
      <div className="space-y-4" data-testid="panel-fechamento">
        <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
          <h4 className="text-sm font-black text-neutral-900 uppercase mb-4 flex items-center gap-2"><Lock size={16} /> Fechamento do Período</h4>
          <div className="space-y-3 mb-6">
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${pendingCount === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              {pendingCount === 0 ? <CheckCircle2 size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-amber-600" />}
              <span className="text-xs font-bold text-neutral-700 uppercase">Lançamentos pendentes: <span className="font-black">{pendingCount}</span></span>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${overdueCount === 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              {overdueCount === 0 ? <CheckCircle2 size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-red-600" />}
              <span className="text-xs font-bold text-neutral-700 uppercase">Títulos vencidos: <span className="font-black">{overdueCount}</span></span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 bg-neutral-50">
              <DollarSign size={18} className="text-neutral-600" />
              <span className="text-xs font-bold text-neutral-700 uppercase">
                Saldo: <span className={`font-black font-mono ${summaryReceber.paid - summaryPagar.paid >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(summaryReceber.paid - summaryPagar.paid)}</span>
              </span>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações do Fechamento</label>
            <textarea className="w-full p-3 border border-neutral-200 rounded-lg text-sm" rows={3} placeholder="Observações sobre o período..." value={closingNotes} onChange={e => setClosingNotes(e.target.value)} data-testid="textarea-closing-notes" />
          </div>
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={closingConfirmed} onChange={e => setClosingConfirmed(e.target.checked)} className="rounded" data-testid="checkbox-closing-confirm" />
            <span className="text-xs font-bold text-neutral-700 uppercase">Confirmo que todos os lançamentos foram revisados</span>
          </label>
          <button disabled={!closingConfirmed || hasPendencies}
            onClick={() => { toast({ title: "Período fechado", description: "O fechamento financeiro foi concluído." }); setClosingConfirmed(false); setClosingNotes(""); }}
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="button-close-period">
            <Lock size={18} /> Fechar Período
          </button>
          {hasPendencies && (
            <p className="text-[10px] text-red-500 font-bold text-center mt-2 uppercase">Resolva todas as pendências antes de fechar o período</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-financeiro">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight uppercase" data-testid="text-page-title">Financeiro</h1>
            <p className="text-sm text-neutral-500">Contas a Pagar e Receber — Torres Vigilância</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} data-testid="button-export-csv" className="text-xs font-bold uppercase">
              <Download size={14} className="mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print" className="text-xs font-bold uppercase">
              <Printer size={14} className="mr-1" /> Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/financial/transactions"] }); queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] }); queryClient.invalidateQueries({ queryKey: ["/api/financial/accounts"] }); }} data-testid="button-refresh" className="text-xs font-bold uppercase">
              <RefreshCw size={14} />
            </Button>
            {(activeStep === "PAGAR" || activeStep === "RECEBER") && (
              <Button onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }} data-testid="button-new-transaction" className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase">
                <Plus size={14} className="mr-1" /> Novo Lançamento
              </Button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
          <div className="flex overflow-x-auto gap-1">
            {STEPS.map(step => (
              <button key={step.id} onClick={() => setActiveStep(step.id)} data-testid={`tab-${step.id.toLowerCase()}`}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap ${
                  activeStep === step.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}>
                <step.icon size={16} />
                <span className="hidden md:inline">{step.label}</span>
                <span className="md:hidden">{step.number}</span>
              </button>
            ))}
          </div>
        </div>

        {(activeStep === "PAGAR" || activeStep === "RECEBER") && renderPagarReceber()}
        {activeStep === "CONFERENCIA" && renderConferencia()}
        {activeStep === "RELATORIO" && renderRelatorio()}
        {activeStep === "FECHAMENTO" && renderFechamento()}

        {isFormOpen && (
          <TransactionFormModal
            onClose={() => { setIsFormOpen(false); setEditingTransaction(null); }}
            editingTransaction={editingTransaction}
            categories={categories}
            accounts={accounts}
          />
        )}
      </div>
    </AdminLayout>
  );
}
