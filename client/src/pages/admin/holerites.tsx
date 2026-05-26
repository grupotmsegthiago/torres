import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authFetch } from "@/lib/queryClient";
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
  ChevronDown, ChevronUp, BarChart3, Eye, ScanLine, ShieldCheck, ShieldAlert
} from "lucide-react";

import { getPayrollPeriod } from "@shared/payroll-period";
const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

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
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: pendingSignatures = [] } = useQuery<any[]>({
    queryKey: ["/api/payslips/pending-signatures"],
    queryFn: async () => {
      const r = await authFetch(`/api/payslips/pending-signatures?sinceMonth=4&sinceYear=2026`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 180000,
  });

  const filteredPayslips = payslips.filter((p: any) => p.assinaturaStatus === "assinado" || !pendingSignatures.find((x: any) => x.id === p.id));

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
          <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-1 rounded" data-testid="text-payroll-period">
            Competência {getPayrollPeriod(filterYear, filterMonth).labelShort}/{filterYear}
          </span>
        </div>

        {pendingSignatures.length > 0 && (
          <Card className="border-2 border-amber-300 bg-amber-50/60 p-4" data-testid="card-pending-signatures">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={18} className="text-amber-600" />
              <h2 className="text-sm font-black text-amber-900 uppercase tracking-wide">Pendentes de Assinatura (desde Abril/2026)</h2>
              <Badge className="bg-amber-600 text-white text-[10px]">{pendingSignatures.length}</Badge>
            </div>
            <p className="text-[11px] text-amber-700 mb-3">Estes holerites ainda não foram assinados pelos funcionários. Aparecem aqui independente do filtro de mês.</p>
            <div className="space-y-2">
              {pendingSignatures.map((p: any) => (
                <PayslipRow key={`pending-${p.id}`} payslip={p} onViewReport={(empId: number) => { setShowReport(empId); setReportYear(p.year || filterYear); }} />
              ))}
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-neutral-300" /></div>
        ) : filteredPayslips.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
            <Receipt size={48} className="mx-auto text-neutral-200 mb-4" />
            <p className="text-sm font-black text-neutral-400 uppercase">Nenhum holerite encontrado</p>
            <p className="text-xs text-neutral-300 mt-1">{MESES[filterMonth - 1]} / {filterYear}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredPayslips.map((p: any) => (
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
  const [showSig, setShowSig] = useState(false);

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
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="text-sm font-black text-neutral-900">{BRL(Number(p.netSalary) || 0)}</p>
          <Badge className={`text-[9px] ${statusColors[p.status] || statusColors.pendente}`} data-testid={`badge-status-${p.id}`}>
            {statusLabels[p.status] || "Pendente"}
          </Badge>
          {p.assinaturaStatus === "assinado" ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5" data-testid={`badge-assinatura-${p.id}`}>
              <ShieldCheck size={9} /> ASSINADO
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
              <ShieldAlert size={9} /> NÃO ASSINADO
            </span>
          )}
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
              <p className="text-neutral-400 font-bold uppercase text-[10px]">DSR</p>
              <p className="font-bold text-purple-700">{BRL(Number(p.dsr) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Vale Refeição</p>
              <p className="font-bold text-blue-700">{BRL(Number(p.valeRefeicao) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Ajuda de Custo</p>
              <p className="font-bold text-blue-700">{BRL(Number(p.ajudaCusto) || 0)}</p>
            </div>
            <div>
              <p className="text-neutral-400 font-bold uppercase text-[10px]">Outros Benefícios</p>
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

            {p.assinaturaStatus === "assinado" && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setShowSig(true)} data-testid={`button-ver-assinatura-${p.id}`}>
                <ShieldCheck size={12} className="mr-1" /> Ver Assinatura
              </Button>
            )}

            <Button size="sm" variant="ghost" className="text-xs h-8 text-red-400 hover:text-red-600 ml-auto" onClick={() => { if (confirm("Excluir holerite?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} data-testid={`button-excluir-${p.id}`}>
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      )}

      {showSig && <SignatureEvidenceModal payslipId={p.id} payslipLabel={`${p.employeeName} · ${MESES[(p.month||1)-1]}/${p.year}`} onClose={() => setShowSig(false)} />}
    </Card>
  );
}

function SignatureEvidenceModal({ payslipId, payslipLabel, onClose }: { payslipId: number; payslipLabel: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/payslips", payslipId, "signature"],
    queryFn: async () => {
      const r = await authFetch(`/api/payslips/${payslipId}/signature`);
      return r.json();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={20} /> Evidência de Assinatura Digital
          </DialogTitle>
          <p className="text-xs text-neutral-500">{payslipLabel}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-neutral-400" /></div>
        ) : !data ? (
          <p className="text-sm text-neutral-500 py-4">Sem dados de assinatura.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Reconhecimento Facial</p>
                {data.assinaturaFacialFoto ? (
                  <img src={data.assinaturaFacialFoto} alt="Foto facial" className="w-full rounded border border-neutral-300" data-testid="img-evidence-facial" />
                ) : <p className="text-xs text-neutral-400 italic">Sem foto</p>}
              </div>
              <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Assinatura Digital</p>
                {data.assinaturaDesenho ? (
                  <img src={data.assinaturaDesenho} alt="Assinatura" className="w-full bg-white rounded border border-neutral-300" data-testid="img-evidence-signature" />
                ) : <p className="text-xs text-neutral-400 italic">Sem assinatura</p>}
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
              <p className="font-bold text-emerald-800 mb-1">Termo aceito pelo funcionário:</p>
              <p className="text-neutral-700 whitespace-pre-line leading-relaxed">{data.assinaturaTermo || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg p-3">
              <div>
                <p className="font-black uppercase text-neutral-400">Assinado em</p>
                <p className="text-neutral-800 font-bold">{data.assinadoEm ? new Date(data.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</p>
              </div>
              <div>
                <p className="font-black uppercase text-neutral-400">Status</p>
                <p className="text-emerald-700 font-bold uppercase">{data.assinaturaStatus || "—"}</p>
              </div>
              <div>
                <p className="font-black uppercase text-neutral-400">Endereço IP</p>
                <p className="text-neutral-800 font-mono">{data.assinaturaIp || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="font-black uppercase text-neutral-400">Dispositivo (User-Agent)</p>
                <p className="text-neutral-700 text-[10px] break-all">{data.assinaturaUserAgent || "—"}</p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} variant="outline" data-testid="button-close-evidence">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    dsr: "",
    valeRefeicao: "",
    ajudaCusto: "",
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
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);

  const handleOcrImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrProcessing(true);
    setOcrResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setDocumentUrl(base64);
      try {
        const r = await apiRequest("POST", "/api/payslips/ocr", { imageData: base64 });
        const data = await r.json();
        setOcrResult(data);

        const filled = {
          employeeId: data.matchedEmployeeId ? String(data.matchedEmployeeId) : "",
          month: data.month ? String(data.month) : "",
          year: data.year ? String(data.year) : "",
          salarioBase: data.salarioBase ? String(data.salarioBase) : "0",
          periculosidade: data.periculosidade ? String(data.periculosidade) : "0",
          horasExtras: data.horasExtras ? String(data.horasExtras) : "0",
          adicionalNoturno: data.adicionalNoturno ? String(data.adicionalNoturno) : "0",
          dsr: data.dsr ? String(data.dsr) : "0",
          valeRefeicao: data.valeRefeicao ? String(data.valeRefeicao) : "0",
          ajudaCusto: data.ajudaCusto ? String(data.ajudaCusto) : "0",
          beneficios: data.beneficios ? String(data.beneficios) : "0",
          descontos: data.descontos ? String(data.descontos) : "0",
        };
        setForm(f => ({ ...f, ...filled }));

        // Auto-save quando OCR identificou funcionário + competência
        if (filled.employeeId && filled.month && filled.year) {
          try {
            const sb = Number(filled.salarioBase) || 0;
            const he = Number(filled.horasExtras) || 0;
            const an = Number(filled.adicionalNoturno) || 0;
            const pe = Number(filled.periculosidade) || 0;
            const ds = Number(filled.dsr) || 0;
            const vr = Number(filled.valeRefeicao) || 0;
            const ac = Number(filled.ajudaCusto) || 0;
            const be = Number(filled.beneficios) || 0;
            const de = Number(filled.descontos) || 0;
            await apiRequest("POST", `/api/employees/${filled.employeeId}/payslips`, {
              employeeId: filled.employeeId,
              month: Number(filled.month),
              year: Number(filled.year),
              salarioBase: sb, horasExtras: he, adicionalNoturno: an, periculosidade: pe,
              dsr: ds, valeRefeicao: vr, ajudaCusto: ac, beneficios: be, descontos: de,
              documentUrl: base64,
              status: "pendente",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
            toast({ title: "Holerite importado e salvo!", description: `${data.employeeName || ""} · ${data.competencia || ""}` });
            onClose();
            setOcrProcessing(false);
            return;
          } catch (saveErr: any) {
            toast({ title: "OCR OK, mas falhou ao salvar", description: saveErr.message + ". Revise os dados e clique em Salvar.", variant: "destructive" });
          }
        } else {
          toast({ title: "Holerite lido com sucesso!", description: `Revise${!filled.employeeId ? " e selecione o funcionário" : ""} antes de salvar.` });
        }
      } catch (err: any) {
        toast({ title: "Erro no OCR", description: err.message || "Não foi possível ler o documento", variant: "destructive" });
      }
      setOcrProcessing(false);
    };
    reader.readAsDataURL(file);
  };

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
  const dsr = Number(form.dsr) || 0;
  const valeRefeicao = Number(form.valeRefeicao) || 0;
  const ajudaCusto = Number(form.ajudaCusto) || 0;
  const beneficios = Number(form.beneficios) || 0;
  const descontos = Number(form.descontos) || 0;
  const totalBruto = salarioBase + horasExtras + adicionalNoturno + periculosidade + dsr + valeRefeicao + ajudaCusto + beneficios;
  const totalLiquido = totalBruto - descontos;

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/employees/${form.employeeId}/payslips`, {
        ...form,
        month: Number(form.month),
        year: Number(form.year),
        salarioBase, horasExtras, adicionalNoturno, periculosidade, dsr, valeRefeicao, ajudaCusto, beneficios, descontos,
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
          <div className="relative">
            <input type="file" accept="image/*,application/pdf" onChange={handleOcrImport} className="hidden" id="ocr-upload" data-testid="input-ocr-upload" />
            <label htmlFor="ocr-upload" className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all ${ocrProcessing ? "border-indigo-400 bg-indigo-50" : ocrResult ? "border-emerald-400 bg-emerald-50" : "border-neutral-300 bg-neutral-50 hover:border-indigo-400 hover:bg-indigo-50"}`}>
              {ocrProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-700">Lendo holerite com OCR...</span>
                </>
              ) : ocrResult ? (
                <>
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700">
                    Importado: {ocrResult.employeeName || "Doc lido"} {ocrResult.competencia ? `· ${ocrResult.competencia}` : ""}
                  </span>
                </>
              ) : (
                <>
                  <ScanLine size={18} className="text-indigo-600" />
                  <span className="text-sm font-bold text-neutral-700">Importar Holerite (OCR)</span>
                  <span className="text-xs text-neutral-400 ml-1">PDF ou foto</span>
                </>
              )}
            </label>
          </div>

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
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">DSR</label>
                <Input type="number" step="0.01" value={form.dsr} onChange={e => setForm({ ...form, dsr: e.target.value })} placeholder="0.00" data-testid="input-dsr" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Vale Refeição</label>
                <Input type="number" step="0.01" value={form.valeRefeicao} onChange={e => setForm({ ...form, valeRefeicao: e.target.value })} placeholder="0.00" data-testid="input-vale-refeicao" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Ajuda de Custo</label>
                <Input type="number" step="0.01" value={form.ajudaCusto} onChange={e => setForm({ ...form, ajudaCusto: e.target.value })} placeholder="0.00" data-testid="input-ajuda-custo" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Outros Benefícios</label>
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
  const [fromMonth, setFromMonth] = useState(1);
  const [fromYear, setFromYear] = useState(year);
  const [toMonth, setToMonth] = useState(12);
  const [toYear, setToYear] = useState(year);
  const [includeSig, setIncludeSig] = useState(true);
  const [includeTermo, setIncludeTermo] = useState(true);
  const [includeDetalhes, setIncludeDetalhes] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/payslips/employee-report", employeeId, fromMonth, fromYear, toMonth, toYear],
    queryFn: async () => {
      const r = await authFetch(`/api/payslips/employee-report/${employeeId}?fromMonth=${fromMonth}&fromYear=${fromYear}&toMonth=${toMonth}&toYear=${toYear}`);
      return r.json();
    },
  });

  const payslipsList: any[] = report?.payslips || [];
  const allSelected = payslipsList.length > 0 && payslipsList.every(p => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(payslipsList.map(p => p.id)));
  };
  const toggleOne = (id: number) => {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedIds(n);
  };

  const handlePrint = () => {
    const toPrint = payslipsList.filter(p => selectedIds.size === 0 || selectedIds.has(p.id));
    if (toPrint.length === 0) { alert("Selecione ao menos um holerite ou deixe nenhum selecionado para imprimir todos."); return; }
    printPayslips({
      employee: report.employee,
      payslips: toPrint,
      includeSig, includeTermo, includeDetalhes,
      periodo: `${MESES[fromMonth-1]}/${fromYear} a ${MESES[toMonth-1]}/${toYear}`,
    });
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 size={18} className="text-indigo-600" /> Relatório Completo do Funcionário
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-neutral-300" /></div>
        ) : report ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <p className="text-lg font-black text-neutral-900" data-testid="text-relatorio-funcionario">{report.employee?.name}</p>
                <p className="text-xs text-neutral-500">{report.employee?.role}{report.employee?.cpf ? ` · CPF ${report.employee.cpf}` : ""}</p>
              </div>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-3">
              <p className="text-[10px] font-black uppercase text-neutral-500">Período</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <select value={fromMonth} onChange={e => setFromMonth(Number(e.target.value))} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs font-bold" data-testid="select-from-month">
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <Input type="number" value={fromYear} onChange={e => setFromYear(Number(e.target.value))} className="h-8 text-xs" data-testid="input-from-year" />
                <select value={toMonth} onChange={e => setToMonth(Number(e.target.value))} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs font-bold" data-testid="select-to-month">
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <Input type="number" value={toYear} onChange={e => setToYear(Number(e.target.value))} className="h-8 text-xs" data-testid="input-to-year" />
              </div>
              <div className="flex items-center gap-4 flex-wrap text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={includeDetalhes} onChange={e => setIncludeDetalhes(e.target.checked)} data-testid="check-include-detalhes" /> Detalhes do holerite</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={includeSig} onChange={e => setIncludeSig(e.target.checked)} data-testid="check-include-sig" /> Selfie + assinatura</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={includeTermo} onChange={e => setIncludeTermo(e.target.checked)} data-testid="check-include-termo" /> Termo aceito</label>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Bruto</p>
                <p className="text-base font-black text-neutral-900">{BRL(report.totals?.bruto || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Total Líquido</p>
                <p className="text-base font-black text-emerald-700">{BRL(report.totals?.liquido || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Descontos</p>
                <p className="text-base font-black text-red-600">{BRL(report.totals?.descontos || 0)}</p>
              </Card>
              <Card className="p-3 border-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Horas Extras</p>
                <p className="text-base font-black text-blue-700">{BRL(report.totals?.horasExtras || 0)}</p>
              </Card>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-neutral-100 px-3 py-2">
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="check-select-all" />
                  Selecionar todos
                </label>
                <span className="text-[10px] text-neutral-500">{payslipsList.length} mes(es) no período · {selectedIds.size} selecionado(s)</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left px-3 py-2 font-bold text-neutral-600">Mês/Ano</th>
                    <th className="text-right px-3 py-2 font-bold text-neutral-600">Bruto</th>
                    <th className="text-right px-3 py-2 font-bold text-neutral-600">Líquido</th>
                    <th className="text-center px-3 py-2 font-bold text-neutral-600">Pagto</th>
                    <th className="text-center px-3 py-2 font-bold text-neutral-600">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {payslipsList.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-neutral-400 italic">Nenhum holerite no período selecionado</td></tr>
                  ) : payslipsList.map((ps: any) => (
                    <tr key={ps.id} className="border-t border-neutral-100" data-testid={`row-relatorio-${ps.id}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.has(ps.id)} onChange={() => toggleOne(ps.id)} data-testid={`check-row-${ps.id}`} /></td>
                      <td className="px-3 py-2 font-bold text-neutral-700">{MESES[(ps.month||1)-1]}/{ps.year}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{BRL(Number(ps.grossSalary) || 0)}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-900">{BRL(Number(ps.netSalary) || 0)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={`text-[9px] ${ps.status === "pago" ? "bg-emerald-100 text-emerald-800" : ps.status === "agendado" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                          {ps.status === "pago" ? "Pago" : ps.status === "agendado" ? "Agendado" : "Pendente"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ps.assinaturaStatus === "assinado" ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700"><ShieldCheck size={10}/> Assinado</span>
                        ) : (
                          <span className="text-[9px] text-amber-600 font-bold">Pendente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-neutral-400 italic">Dica: marque apenas os meses que quer imprimir, ou deixe nada selecionado para imprimir todos do período.</p>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 text-center py-8">Nenhum dado encontrado</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handlePrint} className="bg-indigo-600 text-white hover:bg-indigo-700" data-testid="button-imprimir-relatorio">
            <FileText size={14} className="mr-1.5" /> Imprimir / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function printPayslips({ employee, payslips, includeSig, includeTermo, includeDetalhes, periodo }: { employee: any; payslips: any[]; includeSig: boolean; includeTermo: boolean; includeDetalhes: boolean; periodo: string }) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Permita pop-ups para imprimir."); return; }
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtDt = (d: any) => d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

  const pages = payslips.map((p: any) => {
    const rubricas: Array<[string, number]> = [
      ["Salário Base", Number(p.salarioBase) || 0],
      ["Periculosidade", Number(p.periculosidade) || 0],
      ["Horas Extras", Number(p.horasExtras) || 0],
      ["Adicional Noturno", Number(p.adicionalNoturno) || 0],
      ["DSR", Number(p.dsr) || 0],
      ["Vale Refeição", Number(p.valeRefeicao) || 0],
      ["Ajuda de Custo", Number(p.ajudaCusto) || 0],
      ["Outros Benefícios", Number(p.beneficios) || 0],
    ];
    return `
      <section class="page">
        <header class="hdr">
          <div>
            <h1>Holerite — ${MESES[(p.month||1)-1]} / ${p.year}</h1>
            <p class="sub">${employee?.name || "—"} · ${employee?.role || ""}${employee?.cpf ? " · CPF " + employee.cpf : ""}</p>
          </div>
          <div class="badge-print ${p.assinaturaStatus === "assinado" ? "ok" : "pend"}">
            ${p.assinaturaStatus === "assinado" ? "✔ ASSINADO DIGITALMENTE" : "⚠ NÃO ASSINADO"}
          </div>
        </header>

        ${includeDetalhes ? `
          <table class="rubricas">
            <thead><tr><th>Rubrica</th><th class="r">Valor</th></tr></thead>
            <tbody>
              ${rubricas.filter(([_,v]) => v > 0).map(([k,v]) => `<tr><td>${k}</td><td class="r">${fmtBRL(v)}</td></tr>`).join("")}
              <tr class="tot"><td>Total Bruto</td><td class="r">${fmtBRL(Number(p.grossSalary)||0)}</td></tr>
              <tr><td>Descontos</td><td class="r neg">- ${fmtBRL(Number(p.descontos)||0)}</td></tr>
              <tr class="tot final"><td>Total Líquido</td><td class="r">${fmtBRL(Number(p.netSalary)||0)}</td></tr>
              ${p.dataPagamento ? `<tr><td>Data Pagamento</td><td class="r">${p.dataPagamento}</td></tr>` : ""}
            </tbody>
          </table>
        ` : ""}

        ${p.assinaturaStatus === "assinado" ? `
          <div class="sig-block">
            <h2>Evidência de Assinatura Digital</h2>
            ${includeSig ? `
              <div class="sig-grid">
                <div>
                  <p class="lbl">Reconhecimento Facial</p>
                  ${p.assinaturaFacialFoto ? `<img src="${p.assinaturaFacialFoto}" alt="facial" />` : `<p class="muted">Sem foto</p>`}
                </div>
                <div>
                  <p class="lbl">Assinatura Manuscrita</p>
                  ${p.assinaturaDesenho ? `<img src="${p.assinaturaDesenho}" alt="assinatura" class="white-bg" />` : `<p class="muted">Sem assinatura</p>`}
                </div>
              </div>
            ` : ""}
            ${includeTermo && p.assinaturaTermo ? `
              <div class="termo">
                <p class="lbl">Termo de Ciência aceito pelo funcionário:</p>
                <pre>${p.assinaturaTermo.replace(/[<>&]/g, (c: string) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" } as any)[c])}</pre>
              </div>
            ` : ""}
            <table class="meta">
              <tr><td><b>Assinado em:</b></td><td>${fmtDt(p.assinadoEm)}</td><td><b>IP:</b></td><td>${p.assinaturaIp || "—"}</td></tr>
              <tr><td colspan="4"><b>Dispositivo:</b> <span class="ua">${p.assinaturaUserAgent || "—"}</span></td></tr>
            </table>
          </div>
        ` : `<div class="sig-block pend"><p>⚠ Holerite ainda não assinado pelo funcionário.</p></div>`}

        <footer>
          <p>Documento gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Torres Vigilância Patrimonial</p>
        </footer>
      </section>
    `;
  }).join("");

  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Holerites — ${employee?.name || ""}</title>
  <style>
    *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
    body{margin:0;color:#111;background:#f5f5f5}
    .page{background:#fff;padding:24px;max-width:780px;margin:16px auto;page-break-after:always;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .page:last-child{page-break-after:auto}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
    .hdr h1{margin:0;font-size:18px}
    .hdr .sub{margin:4px 0 0;font-size:11px;color:#666}
    .badge-print{font-size:10px;font-weight:900;padding:6px 10px;border-radius:6px;border:2px solid}
    .badge-print.ok{background:#dcfce7;color:#166534;border-color:#86efac}
    .badge-print.pend{background:#fef3c7;color:#92400e;border-color:#fcd34d}
    table.rubricas{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
    table.rubricas th,table.rubricas td{border:1px solid #ddd;padding:6px 8px}
    table.rubricas th{background:#f3f4f6;text-align:left}
    table.rubricas .r{text-align:right}
    table.rubricas .neg{color:#b91c1c}
    table.rubricas .tot td{font-weight:900;background:#fafafa}
    table.rubricas .final td{background:#ecfdf5;color:#065f46}
    .sig-block{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-top:8px}
    .sig-block.pend{background:#fffbeb;border-color:#fcd34d;color:#92400e;text-align:center;font-weight:700}
    .sig-block h2{margin:0 0 10px;font-size:13px;color:#065f46}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .sig-grid img{width:100%;border:1px solid #d1d5db;border-radius:4px;display:block}
    .sig-grid img.white-bg{background:#fff}
    .lbl{font-size:9px;font-weight:900;text-transform:uppercase;color:#6b7280;margin:0 0 4px}
    .muted{color:#9ca3af;font-style:italic;font-size:11px}
    .termo{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;margin:8px 0}
    .termo pre{font-family:inherit;white-space:pre-wrap;font-size:10px;line-height:1.5;margin:0;color:#374151}
    table.meta{width:100%;font-size:10px;margin-top:8px;border-collapse:collapse}
    table.meta td{padding:3px 6px;border:1px solid #e5e7eb}
    .ua{font-family:monospace;font-size:9px;word-break:break-all}
    footer{margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center}
    .head-rel{max-width:780px;margin:16px auto;padding:12px 24px;background:#fff;border-radius:6px}
    .head-rel h1{margin:0;font-size:16px}
    .head-rel p{margin:4px 0 0;font-size:11px;color:#666}
    @media print { body{background:#fff} .page,.head-rel{box-shadow:none;margin:0;max-width:100%} }
  </style></head><body>
    <div class="head-rel"><h1>Relatório de Holerites — ${employee?.name || ""}</h1><p>Período: ${periodo} · ${payslips.length} holerite(s)</p></div>
    ${pages}
    <script>window.onload=()=>{setTimeout(()=>window.print(),400)};</script>
  </body></html>`);
  w.document.close();
}
