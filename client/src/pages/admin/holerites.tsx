import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Receipt, Plus, Loader2, DollarSign, Calendar, User, FileText,
  Upload, Download, Trash2, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, BarChart3, Eye
} from "lucide-react";

const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

function authFetch(url: string) {
  return fetch(url, { credentials: "include" });
}

export default function HoleritesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [showReport, setShowReport] = useState<number | null>(null);
  const [reportYear, setReportYear] = useState(currentYear);

  const { data: payslips = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/payslips", filterMonth, filterYear],
    queryFn: async () => {
      const r = await authFetch(`/api/payslips?month=${filterMonth}&year=${filterYear}`);
      return r.json();
    },
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const activeEmployees = employees.filter((e: any) => e.status === "ativo");

  const totalBruto = payslips.reduce((s, p) => s + (Number(p.grossSalary) || 0), 0);
  const totalLiquido = payslips.reduce((s, p) => s + (Number(p.netSalary) || 0), 0);
  const totalPago = payslips.filter(p => p.status === "pago").reduce((s, p) => s + (Number(p.netSalary) || 0), 0);
  const pendentes = payslips.filter(p => p.status !== "pago").length;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2" data-testid="text-page-title">
              <Receipt className="w-7 h-7 text-indigo-600" /> Gestão de Holerites
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Folha de pagamento e controle de holerites dos funcionários</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-neutral-900 text-white" data-testid="button-novo-holerite">
            <Plus size={16} className="mr-2" /> Novo Holerite
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 border-neutral-200">
            <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Bruto</p>
            <p className="text-lg font-black text-neutral-900 mt-1" data-testid="text-total-bruto">{BRL(totalBruto)}</p>
          </Card>
          <Card className="p-4 border-neutral-200">
            <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Líquido</p>
            <p className="text-lg font-black text-emerald-700 mt-1" data-testid="text-total-liquido">{BRL(totalLiquido)}</p>
          </Card>
          <Card className="p-4 border-neutral-200">
            <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Pago</p>
            <p className="text-lg font-black text-blue-700 mt-1" data-testid="text-total-pago">{BRL(totalPago)}</p>
          </Card>
          <Card className="p-4 border-neutral-200">
            <p className="text-[10px] font-bold text-neutral-400 uppercase">Pendentes</p>
            <p className="text-lg font-black text-amber-600 mt-1" data-testid="text-pendentes">{pendentes}</p>
          </Card>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-bold" data-testid="select-filter-month">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <Input type="number" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="w-24" data-testid="input-filter-year" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-neutral-300" /></div>
        ) : payslips.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
            <Receipt size={48} className="mx-auto text-neutral-200 mb-4" />
            <p className="text-sm font-black text-neutral-400 uppercase">Nenhum holerite encontrado</p>
            <p className="text-xs text-neutral-300 mt-1">{MESES[filterMonth - 1]} / {filterYear}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {payslips.map((p: any) => (
              <PayslipRow key={p.id} payslip={p} onViewReport={(empId: number) => { setShowReport(empId); setReportYear(filterYear); }} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <NovoHoleriteDialog
          employees={activeEmployees}
          onClose={() => setShowForm(false)}
          filterMonth={filterMonth}
          filterYear={filterYear}
        />
      )}

      {showReport !== null && (
        <RelatorioFuncionarioDialog
          employeeId={showReport}
          year={reportYear}
          onClose={() => setShowReport(null)}
          onYearChange={setReportYear}
        />
      )}
    </AdminLayout>
  );
}

function PayslipRow({ payslip: p, onViewReport }: { payslip: any; onViewReport: (id: number) => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);

  const statusColors: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-800",
    agendado: "bg-blue-100 text-blue-800",
    pago: "bg-emerald-100 text-emerald-800",
  };
  const statusLabels: Record<string, string> = {
    pendente: "Pendente",
    agendado: "Agendado",
    pago: "Pago",
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/payslips/${p.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
      toast({ title: "Holerite atualizado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/payslips/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
      toast({ title: "Holerite excluído" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await updateMutation.mutateAsync({ documentUrl: base64 });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleMarkPago = () => {
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    updateMutation.mutate({ status: "pago", dataPagamento: brDate });
  };

  return (
    <Card className="border border-neutral-200 overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-neutral-50" onClick={() => setExpanded(!expanded)} data-testid={`row-payslip-${p.id}`}>
        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
          <User size={14} className="text-neutral-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900 truncate">{p.employeeName}</p>
          <p className="text-[10px] text-neutral-400">{p.employeeRole} · {MESES[(p.month || 1) - 1]}/{p.year}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-neutral-900">{BRL(Number(p.netSalary) || 0)}</p>
          <Badge className={`text-[9px] ${statusColors[p.status] || statusColors.pendente}`} data-testid={`badge-status-${p.id}`}>
            {statusLabels[p.status] || "Pendente"}
          </Badge>
        </div>
        {expanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50/50 p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Salário Base</p>
              <p className="font-bold text-neutral-800">{BRL(Number(p.salarioBase) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Periculosidade</p>
              <p className="font-bold text-neutral-800">{BRL(Number(p.periculosidade) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Horas Extras</p>
              <p className="font-bold text-emerald-700">{BRL(Number(p.horasExtras) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Adicional Noturno</p>
              <p className="font-bold text-indigo-700">{BRL(Number(p.adicionalNoturno) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Benefícios</p>
              <p className="font-bold text-blue-700">{BRL(Number(p.beneficios) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Descontos</p>
              <p className="font-bold text-red-600">- {BRL(Number(p.descontos) || 0)}</p>
            </div>
            <div className="border-t border-neutral-200 pt-2">
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Total Bruto</p>
              <p className="font-black text-neutral-900">{BRL(Number(p.grossSalary) || 0)}</p>
            </div>
            <div className="border-t border-neutral-200 pt-2">
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Total Líquido</p>
              <p className="font-black text-emerald-700">{BRL(Number(p.netSalary) || 0)}</p>
            </div>
            {p.dataPagamento && (
              <div className="border-t border-neutral-200 pt-2">
                <p className="text-neutral-400 font-bold uppercase text-[10px]">Data Pagamento</p>
                <p className="font-bold text-neutral-800">{p.dataPagamento}</p>
              </div>
            )}
          </div>

          {p.notes && <p className="text-xs text-neutral-500 italic">{p.notes}</p>}

          {p.documentUrl && (
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-emerald-600" />
              <span className="text-xs text-emerald-700 font-bold">Comprovante anexado</span>
              <a href={p.documentUrl} download={`holerite-${p.id}.pdf`} className="text-xs text-blue-600 underline ml-2" data-testid={`link-download-${p.id}`}>
                <Download size={12} className="inline mr-1" />Baixar
              </a>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-neutral-200">
            {p.status !== "pago" && (
              <>
                <Button size="sm" variant="outline" className="text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={handleMarkPago} disabled={updateMutation.isPending} data-testid={`button-pagar-${p.id}`}>
                  <CheckCircle2 size={12} className="mr-1" /> Marcar como Pago
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => updateMutation.mutate({ status: "agendado" })} disabled={updateMutation.isPending} data-testid={`button-agendar-${p.id}`}>
                  <Clock size={12} className="mr-1" /> Agendar
                </Button>
              </>
            )}

            <label className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-700 cursor-pointer px-2 py-1 rounded border border-neutral-200 h-8" data-testid={`button-upload-${p.id}`}>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {p.documentUrl ? "Substituir" : "Comprovante"}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUpload} />
            </label>

            <Button size="sm" variant="ghost" className="text-xs h-8 text-neutral-400 hover:text-neutral-700" onClick={() => onViewReport(p.employeeId)} data-testid={`button-relatorio-${p.id}`}>
              <BarChart3 size={12} className="mr-1" /> Relatório
            </Button>

            <Button size="sm" variant="ghost" className="text-xs h-8 text-red-400 hover:text-red-600 ml-auto" onClick={() => { if (confirm("Excluir holerite?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} data-testid={`button-excluir-${p.id}`}>
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function NovoHoleriteDialog({ employees, onClose, filterMonth, filterYear }: { employees: any[]; onClose: () => void; filterMonth: number; filterYear: number }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    employeeId: "",
    month: String(filterMonth),
    year: String(filterYear),
    salarioBase: "",
    horasExtras: "",
    adicionalNoturno: "",
    periculosidade: "",
    beneficios: "",
    descontos: "",
    status: "pendente",
    dataPagamento: "",
    notes: "",
  });
  const [suggestion, setSuggestion] = useState<any>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

  const fetchSuggestion = async () => {
    if (!form.employeeId || !form.month || !form.year) return;
    setLoadingSuggestion(true);
    try {
      const r = await authFetch(`/api/payslips/suggestion?employeeId=${form.employeeId}&month=${form.month}&year=${form.year}`);
      const data = await r.json();
      setSuggestion(data);
      setForm(f => ({
        ...f,
        salarioBase: String(data.salarioBase || ""),
        periculosidade: String(data.periculosidade || ""),
        horasExtras: String(data.horasExtras || ""),
        adicionalNoturno: String(data.adicionalNoturno || ""),
        descontos: String(data.descontos || ""),
      }));
    } catch { }
    setLoadingSuggestion(false);
  };

  useEffect(() => {
    if (form.employeeId && form.month && form.year) fetchSuggestion();
  }, [form.employeeId, form.month, form.year]);

  const salarioBase = Number(form.salarioBase) || 0;
  const horasExtras = Number(form.horasExtras) || 0;
  const adicionalNoturno = Number(form.adicionalNoturno) || 0;
  const periculosidade = Number(form.periculosidade) || 0;
  const beneficios = Number(form.beneficios) || 0;
  const descontos = Number(form.descontos) || 0;
  const totalBruto = salarioBase + horasExtras + adicionalNoturno + periculosidade + beneficios;
  const totalLiquido = totalBruto - descontos;

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/employees/${form.employeeId}/payslips`, {
        ...form,
        month: Number(form.month),
        year: Number(form.year),
        salarioBase, horasExtras, adicionalNoturno, periculosidade, beneficios, descontos,
        documentUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
      toast({ title: "Holerite criado com sucesso" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar holerite", description: err.message, variant: "destructive" });
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentUrl(reader.result as string);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt size={18} className="text-indigo-600" /> Novo Holerite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-neutral-700 mb-1 block">Funcionário</label>
            <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm" data-testid="select-employee">
              <option value="">Selecione...</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-neutral-700 mb-1 block">Mês</label>
              <select value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm" data-testid="select-month">
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold text-neutral-700 mb-1 block">Ano</label>
              <Input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} data-testid="input-year" />
            </div>
          </div>

          {loadingSuggestion && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Loader2 size={12} className="animate-spin" /> Calculando sugestão...
            </div>
          )}

          {suggestion && !loadingSuggestion && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
              <p className="font-bold text-blue-800 flex items-center gap-1"><AlertTriangle size={12} /> Dados do Grid / Ponto</p>
              <p className="text-blue-700">{suggestion.diasTrabalhados} dias trabalhados · {suggestion.missoes} missão(ões) · {suggestion.horasExtrasHoras}h extras</p>
              {suggestion.discountsDetail?.length > 0 && (
                <p className="text-blue-600">Descontos: {suggestion.discountsDetail.map((d: any) => `${d.description} (${BRL(d.amount)})`).join(", ")}</p>
              )}
            </div>
          )}

          <div className="border-t border-neutral-200 pt-3">
            <p className="text-xs font-bold text-neutral-500 uppercase mb-2">Composição de Valores</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Salário Base</label>
                <Input type="number" step="0.01" value={form.salarioBase} onChange={e => setForm({ ...form, salarioBase: e.target.value })} placeholder="2432.50" data-testid="input-salario-base" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Periculosidade</label>
                <Input type="number" step="0.01" value={form.periculosidade} onChange={e => setForm({ ...form, periculosidade: e.target.value })} placeholder="729.75" data-testid="input-periculosidade" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Horas Extras</label>
                <Input type="number" step="0.01" value={form.horasExtras} onChange={e => setForm({ ...form, horasExtras: e.target.value })} placeholder="0.00" data-testid="input-horas-extras" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Adicional Noturno</label>
                <Input type="number" step="0.01" value={form.adicionalNoturno} onChange={e => setForm({ ...form, adicionalNoturno: e.target.value })} placeholder="0.00" data-testid="input-adicional-noturno" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Benefícios</label>
                <Input type="number" step="0.01" value={form.beneficios} onChange={e => setForm({ ...form, beneficios: e.target.value })} placeholder="0.00" data-testid="input-beneficios" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Descontos</label>
                <Input type="number" step="0.01" value={form.descontos} onChange={e => setForm({ ...form, descontos: e.target.value })} placeholder="0.00" data-testid="input-descontos" />
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-lg p-3 flex items-center justify-between text-white">
            <div>
              <p className="text-[10px] font-bold uppercase text-neutral-400">Total Bruto</p>
              <p className="text-lg font-black">{BRL(totalBruto)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-emerald-400">Total Líquido</p>
              <p className="text-lg font-black text-emerald-400">{BRL(totalLiquido)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm" data-testid="select-status">
                <option value="pendente">Pendente</option>
                <option value="agendado">Agendado</option>
                <option value="pago">Pago</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Data de Pagamento</label>
              <Input type="date" value={form.dataPagamento} onChange={e => setForm({ ...form, dataPagamento: e.target.value })} data-testid="input-data-pagamento" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Comprovante (PDF/Imagem)</label>
            <label className="flex items-center gap-2 border border-dashed border-neutral-300 rounded-lg p-3 cursor-pointer hover:bg-neutral-50 transition-colors" data-testid="button-upload-comprovante">
              {uploading ? <Loader2 size={16} className="animate-spin text-neutral-400" /> : documentUrl ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Upload size={16} className="text-neutral-400" />}
              <span className="text-sm text-neutral-600">{documentUrl ? "Comprovante anexado" : "Clique para anexar"}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUpload} />
            </label>
          </div>

          <div>
            <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Observações</label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Observações opcionais..." data-testid="input-notes" />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">Cancelar</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!form.employeeId || createMutation.isPending} className="bg-neutral-900 text-white" data-testid="button-salvar">
            {createMutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <CheckCircle2 size={14} className="mr-2" />}
            Salvar Holerite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RelatorioFuncionarioDialog({ employeeId, year, onClose, onYearChange }: { employeeId: number; year: number; onClose: () => void; onYearChange: (y: number) => void }) {
  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/payslips/employee-report", employeeId, year],
    queryFn: async () => {
      const r = await authFetch(`/api/payslips/employee-report/${employeeId}?year=${year}`);
      return r.json();
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 size={18} className="text-indigo-600" /> Relatório Anual
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-neutral-300" /></div>
        ) : report ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-black text-neutral-900">{report.employee?.name}</p>
                <p className="text-xs text-neutral-500">{report.employee?.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onYearChange(year - 1)}>←</Button>
                <span className="text-sm font-bold">{year}</span>
                <Button size="sm" variant="outline" onClick={() => onYearChange(year + 1)}>→</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Bruto Ano</p>
                <p className="text-lg font-black text-neutral-900">{BRL(report.totals?.bruto || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Líquido Ano</p>
                <p className="text-lg font-black text-emerald-700">{BRL(report.totals?.liquido || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Descontos</p>
                <p className="text-lg font-black text-red-600">{BRL(report.totals?.descontos || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Horas Extras</p>
                <p className="text-lg font-black text-blue-700">{BRL(report.totals?.horasExtras || 0)}</p>
              </Card>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-neutral-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-neutral-600">Mês</th>
                    <th className="text-right px-3 py-2 font-bold text-neutral-600">Bruto</th>
                    <th className="text-right px-3 py-2 font-bold text-neutral-600">Líquido</th>
                    <th className="text-center px-3 py-2 font-bold text-neutral-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((mes, i) => {
                    const ps = report.payslips?.find((p: any) => p.month === i + 1);
                    return (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="px-3 py-2 font-bold text-neutral-700">{mes}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{ps ? BRL(Number(ps.grossSalary) || 0) : "—"}</td>
                        <td className="px-3 py-2 text-right font-bold text-neutral-900">{ps ? BRL(Number(ps.netSalary) || 0) : "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {ps ? (
                            <Badge className={`text-[9px] ${ps.status === "pago" ? "bg-emerald-100 text-emerald-800" : ps.status === "agendado" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                              {ps.status === "pago" ? "Pago" : ps.status === "agendado" ? "Agendado" : "Pendente"}
                            </Badge>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 text-center py-8">Nenhum dado encontrado</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
