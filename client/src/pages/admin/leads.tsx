import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Target, Plus, Search, Building2, Phone, Mail, MapPin, Globe,
  Send, UserCheck, TrendingUp, ChevronDown, ChevronRight, Star,
  Flame, Snowflake, ThermometerSun, Clock, DollarSign, Filter,
  ArrowRight, Eye, Trash2, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Crosshair, BarChart3, Users, FileText, Zap,
  ExternalLink, History, Award, Shield, Inbox, MailOpen, Reply,
  Play, Pause, Timer, Activity, AlertCircle
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  novo: { label: "Novo", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Plus },
  contatado: { label: "Contatado", color: "text-sky-700", bg: "bg-sky-50 border-sky-200", icon: Phone },
  qualificado: { label: "Qualificado", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Star },
  proposta_enviada: { label: "Proposta Enviada", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: Send },
  negociacao: { label: "Negociação", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: TrendingUp },
  ganho: { label: "Ganho", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  perdido: { label: "Perdido", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
  descartado: { label: "Descartado", color: "text-neutral-500", bg: "bg-neutral-50 border-neutral-200", icon: Trash2 },
};

const TEMP_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  frio: { label: "Frio", icon: Snowflake, color: "text-blue-500" },
  morno: { label: "Morno", icon: ThermometerSun, color: "text-amber-500" },
  quente: { label: "Quente", icon: Flame, color: "text-red-500" },
};

const PIPELINE_STEPS = ["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho"];
const PIPELINE_COLORS = ["bg-blue-500", "bg-sky-500", "bg-amber-500", "bg-orange-500", "bg-purple-500", "bg-emerald-500"];

const CARGOS_SUGERIDOS = [
  "Gerente de Logística", "Gerente de Operações", "Supervisor de Transportes",
  "Coordenador de GR", "Gerente de Riscos", "Analista de Seguros",
  "Diretor de Operações", "Gerente de Segurança", "Coordenador de Frota",
  "Gerente Comercial", "Supervisor de Expedição", "Contato Geral",
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 10 ? "bg-red-100 text-red-800 border-red-300" : score >= 7 ? "bg-amber-100 text-amber-800 border-amber-300" : score >= 4 ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-neutral-100 text-neutral-600 border-neutral-200";
  const label = score >= 10 ? "ALTO" : score >= 7 ? "MÉDIO" : score >= 4 ? "BAIXO" : "MÍNIMO";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${color}`} data-testid="score-badge">
      <Crosshair size={10} /> {score}pts · {label}
    </span>
  );
}

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"crm" | "email">("crm");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [setorFilter, setSetorFilter] = useState<string>("ALL");
  const [tempFilter, setTempFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [showGoogleSearch, setShowGoogleSearch] = useState(false);
  const [googleSetor, setGoogleSetor] = useState("Transportadora");
  const [googleCidade, setGoogleCidade] = useState("São Paulo");
  const [googleResults, setGoogleResults] = useState<any[]>([]);
  const [googleSearching, setGoogleSearching] = useState(false);
  const [selectedGoogleLeads, setSelectedGoogleLeads] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"pipeline" | "lista">("pipeline");

  const { data: leads = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/leads"] });
  const { data: config } = useQuery<any>({ queryKey: ["/api/leads/setores"] });
  const { data: emailStats } = useQuery<any>({ queryKey: ["/api/leads/email-stats"], refetchInterval: 30000 });
  const { data: emailQueue = [] } = useQuery<any[]>({ queryKey: ["/api/leads/email-queue"], enabled: activeTab === "email", refetchInterval: 15000 });

  const [form, setForm] = useState<any>({
    empresa: "", cnpj: "", contato_nome: "", contato_cargo: "", telefone: "",
    email: "", website: "", endereco: "", cidade: "São Paulo", estado: "SP",
    cep: "", setor: "", origem: "prospecao_ativa", temperatura: "frio",
    valor_estimado: 0, notas: "", proximo_contato: "",
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/leads", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead cadastrado" });
      setShowForm(false);
      resetForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/leads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead atualizado" });
      setEditingLead(null);
      setShowDetail(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead removido" });
      setShowDetail(null);
    },
  });

  const sendPresentationMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/leads/${id}/enviar-apresentacao`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Apresentação enviada por e-mail!" });
    },
    onError: (err: any) => toast({ title: "Erro no envio", description: err.message, variant: "destructive" }),
  });

  const convertMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/leads/${id}/converter`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: data.existing ? "Lead vinculado a cliente existente" : "Cliente criado a partir do lead!" });
      setShowDetail(null);
    },
  });

  const enqueueAllMut = useMutation({
    mutationFn: (filters: any) => apiRequest("POST", "/api/leads/enfileirar-todos", filters),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-queue"] });
      toast({ title: `${data.queued} e-mail(s) enfileirados · ${data.skipped} já enviado(s)` });
    },
    onError: (err: any) => toast({ title: "Erro ao enfileirar", description: err.message, variant: "destructive" }),
  });

  const dispatchNowMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leads/disparar-agora"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lote disparado manualmente!" });
    },
  });

  const clearQueueMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leads/email-queue/limpar-fila"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-queue"] });
      toast({ title: "Fila de pendentes limpa" });
    },
  });

  const autoEnqueueMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leads/auto-enqueue"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Auto-enqueue executado com sucesso!" });
    },
  });

  const sendReportMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leads/enviar-relatorio"),
    onSuccess: () => {
      toast({ title: "Relatório enviado para diretoria!" });
    },
  });

  const markRepliedMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/leads/email-queue/${id}/marcar-respondido`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Marcado como respondido" });
    },
  });

  const importCsvMut = useMutation({
    mutationFn: (leads: any[]) => apiRequest("POST", "/api/leads/import-csv", { leads }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/email-stats"] });
      toast({ title: `${data.imported} leads importados!`, description: data.message });
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => setForm({
    empresa: "", cnpj: "", contato_nome: "", contato_cargo: "", telefone: "",
    email: "", website: "", endereco: "", cidade: "São Paulo", estado: "SP",
    cep: "", setor: "", origem: "prospecao_ativa", temperatura: "frio",
    valor_estimado: 0, notas: "", proximo_contato: "",
  });

  const filtered = useMemo(() => {
    return leads.filter((l: any) => {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (setorFilter !== "ALL" && l.setor !== setorFilter) return false;
      if (tempFilter !== "ALL" && l.temperatura !== tempFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (l.empresa || "").toLowerCase().includes(s) ||
          (l.contato_nome || "").toLowerCase().includes(s) ||
          (l.email || "").toLowerCase().includes(s) ||
          (l.cnpj || "").includes(s);
      }
      return true;
    });
  }, [leads, statusFilter, setorFilter, tempFilter, searchTerm]);

  const pipelineData = useMemo(() => {
    return PIPELINE_STEPS.map(step => ({
      step,
      config: STATUS_CONFIG[step],
      leads: filtered.filter((l: any) => l.status === step).sort((a: any, b: any) => (b.score || 0) - (a.score || 0)),
      total: filtered.filter((l: any) => l.status === step).reduce((acc: number, l: any) => acc + Number(l.valor_estimado || 0), 0),
    }));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = leads.length;
    const ativos = leads.filter((l: any) => !["ganho", "perdido", "descartado"].includes(l.status)).length;
    const quentes = leads.filter((l: any) => l.temperatura === "quente").length;
    const ganhos = leads.filter((l: any) => l.status === "ganho").length;
    const valorPipeline = leads.filter((l: any) => !["ganho", "perdido", "descartado"].includes(l.status)).reduce((a: number, l: any) => a + Number(l.valor_estimado || 0), 0);
    const valorGanho = leads.filter((l: any) => l.status === "ganho").reduce((a: number, l: any) => a + Number(l.valor_estimado || 0), 0);
    const taxaConversao = total > 0 ? ((ganhos / total) * 100).toFixed(1) : "0";
    return { total, ativos, quentes, ganhos, valorPipeline, valorGanho, taxaConversao };
  }, [leads]);

  const handleGoogleSearch = async () => {
    setGoogleSearching(true);
    try {
      const resp = await apiRequest("POST", "/api/leads/buscar-google", { setor: googleSetor, cidade: googleCidade, estado: "SP" });
      const data = await resp.json();
      setGoogleResults(data.results || []);
      if (data.message) toast({ title: data.message });
    } catch (err: any) {
      toast({ title: "Erro na busca", description: err.message, variant: "destructive" });
    }
    setGoogleSearching(false);
  };

  const handleImportSelected = async () => {
    const selected = googleResults.filter((_: any, i: number) => selectedGoogleLeads.has(i));
    if (!selected.length) return toast({ title: "Selecione ao menos uma empresa" });
    try {
      const resp = await apiRequest("POST", "/api/leads/importar-google", { leads: selected, setor: googleSetor, origem: "google_places" });
      const data = await resp.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: `${data.imported} lead(s) importado(s)${data.duplicates > 0 ? ` · ${data.duplicates} duplicado(s)` : ""}` });
      setShowGoogleSearch(false);
      setGoogleResults([]);
      setSelectedGoogleLeads(new Set());
    } catch (err: any) {
      toast({ title: "Erro na importação", variant: "destructive" });
    }
  };

  return (
    <AdminLayout title="Prospecção & Leads">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-lg">
              <Target size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-neutral-900 tracking-tight" data-testid="page-title">Prospecção & Leads</h1>
              <p className="text-xs text-neutral-400 font-medium">CRM Inteligente · Escolta Armada SP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-neutral-200 rounded-lg overflow-hidden mr-2">
              <button onClick={() => setActiveTab("crm")} className={`px-3 py-1.5 text-[10px] font-bold flex items-center gap-1 ${activeTab === "crm" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`} data-testid="tab-crm">
                <Target size={12} /> CRM
              </button>
              <button onClick={() => setActiveTab("email")} className={`px-3 py-1.5 text-[10px] font-bold flex items-center gap-1 ${activeTab === "email" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`} data-testid="tab-email">
                <Mail size={12} /> E-mail Marketing
                {emailStats?.pendentes > 0 && <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[8px] font-black">{emailStats.pendentes}</span>}
              </button>
            </div>
            {activeTab === "crm" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowGoogleSearch(true)} className="gap-1.5" data-testid="btn-google-search">
                  <Search size={14} /> Prospectar Google
                </Button>
                <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-new-lead">
                  <Plus size={14} /> Novo Lead
                </Button>
              </>
            )}
          </div>
        </div>

        {activeTab === "email" && <EmailMarketingTab
          emailStats={emailStats}
          emailQueue={emailQueue}
          leads={leads}
          config={config}
          onEnqueueAll={(f: any) => enqueueAllMut.mutate(f)}
          onDispatchNow={() => dispatchNowMut.mutate(undefined)}
          onClearQueue={() => { if(confirm("Limpar todos os e-mails pendentes da fila?")) clearQueueMut.mutate(undefined); }}
          onMarkReplied={(id: number) => markRepliedMut.mutate(id)}
          onAutoEnqueue={() => autoEnqueueMut.mutate(undefined)}
          onSendReport={() => sendReportMut.mutate(undefined)}
          onImportCsv={(data: any[]) => importCsvMut.mutate(data)}
          isImporting={importCsvMut.isPending}
          isEnqueuing={enqueueAllMut.isPending}
          isDispatching={dispatchNowMut.isPending}
          isAutoEnqueuing={autoEnqueueMut.isPending}
          isSendingReport={sendReportMut.isPending}
        />}

        {activeTab === "crm" && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Users, color: "border-neutral-200", click: "ALL" },
            { label: "Ativos", value: stats.ativos, icon: Target, color: "border-indigo-200", click: "ALL" },
            { label: "Quentes", value: stats.quentes, icon: Flame, color: "border-red-200", click: "ALL" },
            { label: "Ganhos", value: stats.ganhos, icon: CheckCircle2, color: "border-emerald-200", click: "ganho" },
            { label: "Pipeline", value: fmt(stats.valorPipeline), icon: TrendingUp, color: "border-purple-200", click: "ALL", small: true },
            { label: "Faturado", value: fmt(stats.valorGanho), icon: DollarSign, color: "border-emerald-200", click: "ganho", small: true },
            { label: "Conversão", value: `${stats.taxaConversao}%`, icon: Award, color: "border-amber-200", click: "ALL" },
          ].map((s, i) => (
            <button key={i} onClick={() => setStatusFilter(s.click)} className={`text-left bg-white border ${s.color} rounded-xl p-3 hover:shadow-md transition-all cursor-pointer`} data-testid={`stat-${s.label.toLowerCase()}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon size={12} className="text-neutral-400" />
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">{s.label}</span>
              </div>
              <p className={`${s.small ? "text-sm" : "text-lg"} font-black text-neutral-900`}>{s.value}</p>
            </button>
          ))}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
            <ArrowRight size={12} /> Pipeline Comercial
          </div>
          <div className="flex items-center gap-0">
            {PIPELINE_STEPS.map((step, i) => {
              const count = leads.filter((l: any) => l.status === step).length;
              const pct = leads.length > 0 ? Math.max(8, (count / leads.length) * 100) : 16;
              return (
                <div key={step} className="flex items-center" style={{ flex: pct }}>
                  <button
                    onClick={() => setStatusFilter(step)}
                    className={`w-full h-8 ${PIPELINE_COLORS[i]} flex items-center justify-center transition-all hover:opacity-90 cursor-pointer ${i === 0 ? "rounded-l-lg" : ""} ${i === PIPELINE_STEPS.length - 1 ? "rounded-r-lg" : ""} ${statusFilter === step ? "ring-2 ring-offset-1 ring-neutral-900" : ""}`}
                    title={`${STATUS_CONFIG[step].label}: ${count}`}
                    data-testid={`pipeline-${step}`}
                  >
                    <span className="text-white text-[10px] font-black">{count}</span>
                  </button>
                  {i < PIPELINE_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-neutral-300 flex-shrink-0 mx-0.5" />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[9px] font-semibold text-neutral-400">
            <span>Novo → Contatado → Qualificado → Proposta → Negociação → Ganho</span>
            <span>{leads.filter((l: any) => l.status === "perdido").length} perdidos · {leads.filter((l: any) => l.status === "descartado").length} descartados</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Buscar empresa, contato, CNPJ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm"
              data-testid="input-search-leads"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs" data-testid="filter-status-lead">
              <Filter size={12} className="mr-1" /> <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs" data-testid="filter-setor">
              <Building2 size={12} className="mr-1" /> <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os Setores</SelectItem>
              {(config?.setores || []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tempFilter} onValueChange={setTempFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs" data-testid="filter-temp">
              <Flame size={12} className="mr-1" /> <SelectValue placeholder="Temp." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="quente">🔥 Quente</SelectItem>
              <SelectItem value="morno">☀️ Morno</SelectItem>
              <SelectItem value="frio">❄️ Frio</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("pipeline")} className={`px-3 py-1.5 text-[10px] font-bold ${viewMode === "pipeline" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`} data-testid="view-pipeline">Pipeline</button>
            <button onClick={() => setViewMode("lista")} className={`px-3 py-1.5 text-[10px] font-bold ${viewMode === "lista" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`} data-testid="view-lista">Lista</button>
          </div>
        </div>

        {isLoading ? (
          <Card className="p-12 text-center"><RefreshCw size={20} className="animate-spin mx-auto text-neutral-300" /></Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Target size={32} className="mx-auto text-neutral-200 mb-3" />
            <p className="text-sm font-bold text-neutral-400">Nenhum lead encontrado</p>
            <p className="text-xs text-neutral-300 mt-1">Comece prospectando via Google ou cadastre manualmente</p>
          </Card>
        ) : viewMode === "pipeline" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {pipelineData.map(col => (
              <div key={col.step} className="space-y-2">
                <div className={`rounded-lg border p-2 ${col.config.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${col.config.color}`}>{col.config.label}</span>
                    <Badge variant="outline" className={`text-[10px] ${col.config.color}`}>{col.leads.length}</Badge>
                  </div>
                  {col.total > 0 && <p className="text-[10px] font-bold text-neutral-500 mt-0.5">{fmt(col.total)}</p>}
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {col.leads.map((lead: any) => (
                    <LeadCard key={lead.id} lead={lead} onClick={() => setShowDetail(lead)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((lead: any) => (
              <LeadListRow key={lead.id} lead={lead} onClick={() => setShowDetail(lead)} />
            ))}
          </div>
        )}
        </>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus size={18} /> Novo Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            form={form}
            setForm={setForm}
            setores={config?.setores || []}
            onSubmit={() => createMut.mutate(form)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {showDetail && (
        <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <LeadDetail
              lead={showDetail}
              setores={config?.setores || []}
              onUpdate={(data: any) => updateMut.mutate({ id: showDetail.id, ...data })}
              onDelete={() => { if (confirm("Remover lead?")) deleteMut.mutate(showDetail.id); }}
              onSendPresentation={() => sendPresentationMut.mutate(showDetail.id)}
              onConvert={() => convertMut.mutate(showDetail.id)}
              isPending={updateMut.isPending}
              isSending={sendPresentationMut.isPending}
              isConverting={convertMut.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showGoogleSearch} onOpenChange={setShowGoogleSearch}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search size={18} /> Prospecção Google Places</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase">Setor</label>
                <Select value={googleSetor} onValueChange={setGoogleSetor}>
                  <SelectTrigger className="h-9 text-sm" data-testid="google-setor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(config?.setores || []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase">Cidade</label>
                <Input value={googleCidade} onChange={e => setGoogleCidade(e.target.value)} className="h-9 text-sm" data-testid="google-cidade" />
              </div>
            </div>
            <Button onClick={handleGoogleSearch} disabled={googleSearching} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-google-go">
              {googleSearching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              {googleSearching ? "Buscando..." : "Buscar Empresas"}
            </Button>
            {googleResults.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500">{googleResults.length} resultado(s)</span>
                  <Button size="sm" onClick={handleImportSelected} disabled={selectedGoogleLeads.size === 0} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" data-testid="btn-import-google">
                    <Plus size={14} /> Importar {selectedGoogleLeads.size} selecionado(s)
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {googleResults.map((r: any, i: number) => (
                    <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedGoogleLeads.has(i) ? "bg-indigo-50 border-indigo-300" : "bg-white border-neutral-200 hover:bg-neutral-50"}`}>
                      <input type="checkbox" checked={selectedGoogleLeads.has(i)} onChange={e => {
                        const next = new Set(selectedGoogleLeads);
                        e.target.checked ? next.add(i) : next.delete(i);
                        setSelectedGoogleLeads(next);
                      }} className="mt-1 rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-neutral-900 truncate">{r.empresa}</p>
                        <p className="text-[10px] text-neutral-400 truncate">{r.endereco}</p>
                        {r.google_rating && (
                          <span className="text-[10px] text-amber-600 font-semibold">
                            ⭐ {r.google_rating} ({r.google_total_reviews} avaliações)
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function LeadCard({ lead, onClick }: { lead: any; onClick: () => void }) {
  const temp = TEMP_CONFIG[lead.temperatura] || TEMP_CONFIG.frio;
  const followUpOverdue = lead.proximo_contato && new Date(lead.proximo_contato) < new Date();
  return (
    <button onClick={onClick} className={`w-full text-left bg-white border rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group ${followUpOverdue ? "border-red-300 bg-red-50/30" : "border-neutral-200"}`} data-testid={`lead-card-${lead.id}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-bold text-neutral-900 truncate leading-tight">{lead.empresa}</p>
        <temp.icon size={12} className={temp.color} />
      </div>
      {lead.contato_nome && <p className="text-[10px] text-neutral-500 truncate">{lead.contato_nome}{lead.contato_cargo ? ` · ${lead.contato_cargo}` : ""}</p>}
      {lead.setor && <Badge variant="outline" className="text-[9px] mt-1 border-neutral-200">{lead.setor}</Badge>}
      <div className="flex items-center justify-between mt-2">
        <ScoreBadge score={lead.score || 0} />
        {lead.valor_estimado > 0 && <span className="text-[10px] font-bold text-emerald-600">{fmt(lead.valor_estimado)}</span>}
      </div>
      {followUpOverdue && (
        <div className="flex items-center gap-1 mt-1.5 text-[9px] font-bold text-red-500">
          <Clock size={10} /> Follow-up atrasado
        </div>
      )}
      {lead.emails_enviados > 0 && (
        <div className="flex items-center gap-1 mt-1 text-[9px] text-blue-500">
          <Mail size={10} /> {lead.emails_enviados}x enviado
        </div>
      )}
    </button>
  );
}

function LeadListRow({ lead, onClick }: { lead: any; onClick: () => void }) {
  const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.novo;
  const temp = TEMP_CONFIG[lead.temperatura] || TEMP_CONFIG.frio;
  const followUpOverdue = lead.proximo_contato && new Date(lead.proximo_contato) < new Date();
  return (
    <button onClick={onClick} className={`w-full text-left bg-white border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer flex items-center gap-4 ${followUpOverdue ? "border-red-300" : "border-neutral-200"}`} data-testid={`lead-row-${lead.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-bold text-neutral-900 truncate">{lead.empresa}</p>
          <Badge className={`text-[9px] border ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</Badge>
          <temp.icon size={14} className={temp.color} />
          {followUpOverdue && <Badge className="text-[8px] bg-red-100 text-red-700 border-red-200">FOLLOW-UP</Badge>}
          {lead.emails_enviados > 0 && <Badge variant="outline" className="text-[8px] text-blue-600 border-blue-200">{lead.emails_enviados}x email</Badge>}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-neutral-400">
          {lead.contato_nome && <span className="flex items-center gap-1"><Users size={10} /> {lead.contato_nome}{lead.contato_cargo ? ` (${lead.contato_cargo})` : ""}</span>}
          {lead.setor && <span className="flex items-center gap-1"><Building2 size={10} /> {lead.setor}</span>}
          {lead.cidade && <span className="flex items-center gap-1"><MapPin size={10} /> {lead.cidade}/{lead.estado}</span>}
          {lead.email && <span className="flex items-center gap-1"><Mail size={10} /> {lead.email}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <ScoreBadge score={lead.score || 0} />
        {lead.valor_estimado > 0 && <span className="text-sm font-bold text-emerald-600">{fmt(lead.valor_estimado)}</span>}
        <ChevronRight size={16} className="text-neutral-300" />
      </div>
    </button>
  );
}

function LeadForm({ form, setForm, setores, onSubmit, isPending }: any) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Empresa *</label>
          <Input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} className="h-9 text-sm" data-testid="input-empresa" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">CNPJ</label>
          <Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} className="h-9 text-sm" data-testid="input-cnpj" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Contato</label>
          <Input value={form.contato_nome} onChange={e => setForm({ ...form, contato_nome: e.target.value })} className="h-9 text-sm" data-testid="input-contato" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Cargo</label>
          <Select value={form.contato_cargo || ""} onValueChange={v => setForm({ ...form, contato_cargo: v })}>
            <SelectTrigger className="h-9 text-sm" data-testid="select-cargo"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
            <SelectContent>
              {CARGOS_SUGERIDOS.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Telefone</label>
          <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} className="h-9 text-sm" data-testid="input-telefone" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">E-mail</label>
          <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-9 text-sm" data-testid="input-email" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Website</label>
          <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="www.empresa.com.br" className="h-9 text-sm" data-testid="input-website" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Próximo Contato</label>
          <Input type="date" value={form.proximo_contato || ""} onChange={e => setForm({ ...form, proximo_contato: e.target.value })} className="h-9 text-sm" data-testid="input-proximo-contato" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Setor</label>
          <Select value={form.setor} onValueChange={v => setForm({ ...form, setor: v })}>
            <SelectTrigger className="h-9 text-sm" data-testid="select-setor"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {setores.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Temperatura</label>
          <Select value={form.temperatura} onValueChange={v => setForm({ ...form, temperatura: v })}>
            <SelectTrigger className="h-9 text-sm" data-testid="select-temp"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="frio">Frio</SelectItem>
              <SelectItem value="morno">Morno</SelectItem>
              <SelectItem value="quente">Quente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold text-neutral-400 uppercase">Endereço</label>
        <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} className="h-9 text-sm" data-testid="input-endereco" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Cidade</label>
          <Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="h-9 text-sm" data-testid="input-cidade" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Estado</label>
          <Input value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="h-9 text-sm" data-testid="input-estado" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase">Valor Estimado</label>
          <Input type="number" value={form.valor_estimado} onChange={e => setForm({ ...form, valor_estimado: Number(e.target.value) })} className="h-9 text-sm" data-testid="input-valor" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold text-neutral-400 uppercase">Notas</label>
        <Textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2} className="text-sm" data-testid="input-notas" />
      </div>
      <Button onClick={onSubmit} disabled={isPending || !form.empresa} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-save-lead">
        {isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        Cadastrar Lead
      </Button>
    </div>
  );
}

function CountdownTimer({ seconds, label }: { seconds: number; label: string }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => { setRemaining(seconds); }, [seconds]);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining > 0]);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = seconds > 0 ? ((seconds - remaining) / seconds) * 100 : 100;
  return (
    <div className="flex flex-col items-center" data-testid={`countdown-${label}`}>
      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{label}</span>
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e5e5" strokeWidth="4" />
          <circle cx="32" cy="32" r="28" fill="none" stroke={remaining <= 60 ? "#f59e0b" : "#3b82f6"} strokeWidth="4" strokeDasharray={`${pct * 1.759} 175.9`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-black tabular-nums ${remaining <= 60 ? "text-amber-600" : "text-blue-600"}`}>
            {mins}:{secs.toString().padStart(2, "0")}
          </span>
        </div>
      </div>
      {remaining === 0 && <span className="text-[8px] text-emerald-600 font-bold mt-0.5">Processando...</span>}
    </div>
  );
}

function AutoProspectPanel() {
  const { data: prospectStatus, refetch } = useQuery<any>({
    queryKey: ["/api/leads/auto-prospect/status"],
    refetchInterval: 30000,
  });

  const triggerMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leads/auto-prospect/trigger"),
    onSuccess: () => {
      setTimeout(() => refetch(), 3000);
    },
  });

  const ps = prospectStatus || { running: false, totalLeads: 0, autoLeads: 0, leadsWithEmail: 0, totalQueries: 30, currentQuery: "—", hasApiKey: false, state: { query_index: 0, total_found: 0 } };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-indigo-500" />
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Prospecção Automática Google</span>
          <Badge className={`text-[10px] ${ps.running ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ps.hasApiKey ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-red-100 text-red-700 border-red-200"}`}>
            {ps.running ? "EXECUTANDO" : ps.hasApiKey ? "ATIVO" : "SEM API KEY"}
          </Badge>
        </div>
        <Button size="sm" onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending || ps.running || !ps.hasApiKey} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-trigger-prospect">
          {triggerMut.isPending || ps.running ? <RefreshCw size={12} className="animate-spin" /> : <Crosshair size={12} />}
          Buscar Agora
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5">
          <span className="text-[9px] font-bold text-neutral-400 uppercase">Leads Auto</span>
          <p className="text-lg font-black text-indigo-700">{ps.autoLeads}</p>
        </div>
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5">
          <span className="text-[9px] font-bold text-neutral-400 uppercase">Com E-mail</span>
          <p className="text-lg font-black text-emerald-700">{ps.leadsWithEmail}</p>
        </div>
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5">
          <span className="text-[9px] font-bold text-neutral-400 uppercase">Total Leads</span>
          <p className="text-lg font-black text-neutral-700">{ps.totalLeads}</p>
        </div>
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5">
          <span className="text-[9px] font-bold text-neutral-400 uppercase">Buscas</span>
          <p className="text-lg font-black text-purple-700">{ps.state?.query_index || 0}/{ps.totalQueries}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-neutral-500">
        <span><strong>Query atual:</strong> {ps.currentQuery}</span>
        <span>•</span>
        <span>Executa a cada <strong>15 min</strong> (07h–22h)</span>
        <span>•</span>
        <span>Busca empresas → extrai website → gera e-mail → enfileira para disparo</span>
      </div>
    </div>
  );
}

function EmailMarketingTab({ emailStats, emailQueue, leads, config, onEnqueueAll, onDispatchNow, onClearQueue, onMarkReplied, onAutoEnqueue, onSendReport, onImportCsv, isEnqueuing, isDispatching, isAutoEnqueuing, isSendingReport, isImporting }: any) {
  const { toast } = useToast();
  const [queueFilter, setQueueFilter] = useState("ALL");
  const [showLog, setShowLog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const st = emailStats || { total: 0, pendentes: 0, enviados: 0, lidos: 0, respondidos: 0, erros: 0, taxaAbertura: 0, taxaResposta: 0, daily: [], batchSize: 10, intervalMinutes: 5 };

  const handleCsvImport = () => {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      toast({ title: "CSV deve ter cabeçalho + pelo menos 1 linha", variant: "destructive" });
      return;
    }
    const headers = lines[0].split(/[;,\t]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const parsed: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(/[;,\t]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
      if (vals.length < 2) continue;
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
      if (row.empresa || row.company || row.razao_social) {
        parsed.push(row);
      }
    }
    if (parsed.length === 0) {
      toast({ title: "Nenhum lead válido encontrado no CSV", description: "Verifique se o cabeçalho tem 'empresa' e 'email'", variant: "destructive" });
      return;
    }
    onImportCsv(parsed);
    setCsvText("");
    setShowImport(false);
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || "");
    };
    reader.readAsText(file);
  };

  const { data: dispatchLog = [] } = useQuery<any[]>({
    queryKey: ["/api/leads/dispatch-log"],
    enabled: showLog,
  });
  const daily = st.daily || [];

  const maxEnviados = Math.max(...daily.map((d: any) => d.enviados || 0), 1);

  const filteredQueue = useMemo(() => {
    if (queueFilter === "ALL") return emailQueue;
    return emailQueue.filter((e: any) => e.status === queueFilter);
  }, [emailQueue, queueFilter]);

  const leadsComEmail = leads.filter((l: any) => l.email && !["ganho", "perdido", "descartado"].includes(l.status)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Na Fila", value: st.pendentes, icon: Inbox, color: "border-amber-200", bg: "bg-amber-50" },
          { label: "Enviados", value: st.enviados, icon: Send, color: "border-blue-200", bg: "bg-blue-50" },
          { label: "Abertos", value: st.lidos, icon: MailOpen, color: "border-emerald-200", bg: "bg-emerald-50" },
          { label: "Respondidos", value: st.respondidos, icon: Reply, color: "border-purple-200", bg: "bg-purple-50" },
          { label: "Erros", value: st.erros, icon: AlertCircle, color: "border-red-200", bg: "bg-red-50" },
          { label: "Taxa Abertura", value: `${st.taxaAbertura}%`, icon: Eye, color: "border-sky-200", bg: "bg-sky-50" },
          { label: "Taxa Resposta", value: `${st.taxaResposta}%`, icon: Activity, color: "border-violet-200", bg: "bg-violet-50" },
          { label: "Total", value: st.total, icon: Mail, color: "border-neutral-200", bg: "bg-neutral-50" },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} border ${s.color} rounded-xl p-3`}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon size={12} className="text-neutral-400" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-lg font-black text-neutral-900">{s.value}</p>
          </div>
        ))}
      </div>

      <AutoProspectPanel />

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-neutral-400" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Automação de Disparo</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {st.batchSize} e-mails / {st.intervalMinutes}min
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              máx {st.maxEmailsPerLead || 1}/lead
            </Badge>
            <Badge className={`text-[10px] ${st.pendentes > 0 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
              <Activity size={10} className="mr-1" /> {st.pendentes > 0 ? "ATIVO" : "AGUARDANDO"}
            </Badge>
          </div>
        </div>

        <div className="flex items-start gap-6 mb-3">
          <div className="flex gap-4">
            {st.secondsUntilNextDispatch != null && (
              <CountdownTimer seconds={st.secondsUntilNextDispatch} label="Próximo Disparo" />
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                <span className="text-lg font-black text-amber-700">{st.pendentes}</span>
                <p className="text-[8px] font-bold text-amber-500 uppercase">Na Fila</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                <span className="text-lg font-black text-blue-700">{st.enviados}</span>
                <p className="text-[8px] font-bold text-blue-500 uppercase">Enviados</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                <span className="text-lg font-black text-emerald-700">{st.lidos}</span>
                <p className="text-[8px] font-bold text-emerald-500 uppercase">Abertos</p>
              </div>
            </div>
            {st.pendentes === 0 && st.enviados > 0 && (
              <p className="text-[10px] text-neutral-400 text-center italic">
                Todos os leads já atingiram o máximo de {st.maxEmailsPerLead || 5} e-mails. Adicione novos leads para continuar.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onEnqueueAll({})} disabled={isEnqueuing} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" data-testid="btn-enqueue-all">
            {isEnqueuing ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
            Enfileirar Todos ({leadsComEmail})
          </Button>
          <Button size="sm" onClick={onDispatchNow} disabled={isDispatching || st.pendentes === 0} className="gap-1.5 bg-blue-600 hover:bg-blue-700" data-testid="btn-dispatch-now">
            {isDispatching ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
            Disparar Agora (10)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)} disabled={isImporting} className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50" data-testid="btn-import-csv">
            {isImporting ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
            Importar Leads (CSV)
          </Button>
          <Button size="sm" variant="outline" onClick={onClearQueue} disabled={st.pendentes === 0} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" data-testid="btn-clear-queue">
            <Trash2 size={12} /> Limpar Fila
          </Button>
          <Button size="sm" variant="outline" onClick={onAutoEnqueue} disabled={isAutoEnqueuing} className="gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50" data-testid="btn-auto-enqueue">
            {isAutoEnqueuing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            Auto-Enqueue
          </Button>
          <Button size="sm" variant="outline" onClick={onSendReport} disabled={isSendingReport} className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50" data-testid="btn-send-report">
            {isSendingReport ? <RefreshCw size={12} className="animate-spin" /> : <BarChart3 size={12} />}
            Enviar Relatório
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowLog(!showLog)} className="gap-1.5 text-neutral-600 border-neutral-200 hover:bg-neutral-50" data-testid="btn-dispatch-log">
            <History size={12} /> {showLog ? "Ocultar Log" : "Log de Envios"}
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-[10px] text-neutral-400 flex items-center gap-1">
            <Mail size={10} /> Respostas vão para escolta@ e diretoria@
          </span>
          <Badge className={`text-[9px] ${st.autoEnqueueActive ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-50 text-neutral-400 border-neutral-200"}`}>
            <Zap size={9} className="mr-1" /> Auto-enqueue: a cada 5min (07h-21h) {st.autoEnqueueActive ? "● ON" : "○ OFF"}
          </Badge>
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">
            <BarChart3 size={9} className="mr-1" /> Relatório diário: 21h BRT
          </Badge>
          {st.serverTime && (
            <span className="text-[9px] text-neutral-300">
              Servidor: {new Date(st.serverTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {showLog && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-neutral-400" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Relatório de Envios</span>
            <Badge variant="outline" className="text-[10px]">{dispatchLog.length} registros</Badge>
          </div>
          <div className="space-y-1 max-h-[350px] overflow-y-auto">
            {dispatchLog.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-6">Nenhum envio registrado</p>
            ) : dispatchLog.map((log: any) => {
              const statusMap: Record<string, { label: string; dot: string; bg: string }> = {
                pendente: { label: "PENDENTE", dot: "bg-amber-400", bg: "bg-amber-50 text-amber-700 border-amber-200" },
                enviado: { label: "ENVIADO", dot: "bg-blue-400", bg: "bg-blue-50 text-blue-700 border-blue-200" },
                lido: { label: "ABERTO", dot: "bg-emerald-400", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                erro: { label: "ERRO", dot: "bg-red-400", bg: "bg-red-50 text-red-700 border-red-200" },
              };
              const s = statusMap[log.status] || statusMap.pendente;
              return (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg border border-neutral-100 hover:bg-neutral-50" data-testid={`dispatch-log-${log.id}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-neutral-900 truncate">{log.empresa || "—"}</span>
                      <Badge className={`${s.bg} text-[8px] border`}>{s.label}</Badge>
                      {log.replied && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[8px]">RESPONDIDO</Badge>}
                      {log.opened_count > 0 && <span className="text-[9px] text-emerald-600 font-bold">{log.opened_count}x aberto</span>}
                    </div>
                    <p className="text-[10px] text-neutral-400 truncate">{log.to_email}</p>
                    <div className="flex items-center gap-3 text-[9px] text-neutral-300 mt-0.5 flex-wrap">
                      <span>Criado: {log.created_at ? new Date(log.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</span>
                      {log.sent_at && <span className="text-blue-500">Enviado: {new Date(log.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                      {log.opened_at && <span className="text-emerald-500">Aberto: {new Date(log.opened_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                      {log.replied_at && <span className="text-purple-500">Respondido: {new Date(log.replied_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                      {log.error_message && <span className="text-red-500 truncate max-w-[200px]">{log.error_message}</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {(log.status === "enviado" || log.status === "lido") && !log.replied && (
                      <Button size="sm" variant="outline" onClick={() => onMarkReplied(log.id)} className="h-6 text-[9px] gap-1 text-purple-600 border-purple-200" data-testid={`log-replied-${log.id}`}>
                        <Reply size={9} /> Respondeu
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-neutral-400" />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">E-mails por Dia (últimos 30 dias)</span>
        </div>
        {daily.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">Nenhum dado de disparo ainda</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-end gap-1" style={{ height: 160 }}>
              {daily.map((d: any, i: number) => {
                const hEnv = Math.max(4, (d.enviados / maxEnviados) * 140);
                const hLido = d.lidos > 0 ? Math.max(2, (d.lidos / maxEnviados) * 140) : 0;
                const hResp = d.respondidos > 0 ? Math.max(2, (d.respondidos / maxEnviados) * 140) : 0;
                const dateLabel = new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative" title={`${dateLabel}: ${d.enviados} env · ${d.lidos} abertos · ${d.respondidos} resp`}>
                    <div className="absolute -top-6 bg-neutral-900 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {d.enviados} env · {d.lidos} abertos · {d.respondidos} resp
                    </div>
                    <div className="w-full flex flex-col items-center gap-0">
                      {hResp > 0 && <div className="w-full max-w-[20px] bg-purple-400 rounded-t" style={{ height: hResp }} />}
                      {hLido > 0 && <div className="w-full max-w-[20px] bg-emerald-400" style={{ height: hLido }} />}
                      <div className="w-full max-w-[20px] bg-blue-400 rounded-b" style={{ height: hEnv }} />
                    </div>
                    <span className="text-[7px] text-neutral-300 -rotate-45 origin-top-left mt-1 w-8">{dateLabel}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-neutral-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded" /> Enviados</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded" /> Abertos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400 rounded" /> Respondidos</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-neutral-400" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fila de E-mails</span>
            <Badge variant="outline" className="text-[10px]">{filteredQueue.length}</Badge>
          </div>
          <div className="flex gap-1">
            {[
              { val: "ALL", label: "Todos" },
              { val: "pendente", label: "Pendentes" },
              { val: "enviado", label: "Enviados" },
              { val: "lido", label: "Lidos" },
              { val: "erro", label: "Erros" },
            ].map(f => (
              <button key={f.val} onClick={() => setQueueFilter(f.val)}
                className={`px-2 py-1 text-[10px] font-bold rounded ${queueFilter === f.val ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"}`}
                data-testid={`queue-filter-${f.val}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {filteredQueue.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-6">Nenhum e-mail na fila</p>
          ) : filteredQueue.map((email: any) => (
            <div key={email.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${email.status === "pendente" ? "bg-amber-400" : email.status === "enviado" ? "bg-blue-400" : email.status === "lido" ? "bg-emerald-400" : "bg-red-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-neutral-900 truncate">{email.empresa}</p>
                  <Badge variant="outline" className={`text-[8px] ${email.status === "lido" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : email.status === "enviado" ? "bg-blue-50 text-blue-700 border-blue-200" : email.status === "erro" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {email.status === "lido" ? "ABERTO" : email.status === "enviado" ? "ENVIADO" : email.status === "erro" ? "ERRO" : "NA FILA"}
                  </Badge>
                  {email.replied && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[8px]">RESPONDIDO</Badge>}
                  {email.opened_count > 0 && <span className="text-[9px] text-emerald-600 font-semibold">{email.opened_count}x aberto</span>}
                </div>
                <p className="text-[10px] text-neutral-400 truncate">{email.to_email} · {email.to_name}</p>
                <div className="flex items-center gap-3 text-[9px] text-neutral-300 mt-0.5">
                  {email.sent_at && <span>Enviado: {new Date(email.sent_at).toLocaleString("pt-BR")}</span>}
                  {email.opened_at && <span className="text-emerald-500">Aberto: {new Date(email.opened_at).toLocaleString("pt-BR")}</span>}
                  {email.replied_at && <span className="text-purple-500">Respondido: {new Date(email.replied_at).toLocaleString("pt-BR")}</span>}
                  {email.error_message && <span className="text-red-500">{email.error_message}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {email.status === "enviado" || email.status === "lido" ? (
                  !email.replied && (
                    <Button size="sm" variant="outline" onClick={() => onMarkReplied(email.id)} className="h-7 text-[10px] gap-1 text-purple-600 border-purple-200" data-testid={`btn-replied-${email.id}`}>
                      <Reply size={10} /> Respondeu
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showImport && (
        <Dialog open onOpenChange={() => setShowImport(false)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                Importar Leads em Massa (CSV)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 font-medium mb-1">Formato do CSV:</p>
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  O arquivo deve ter cabeçalho na primeira linha. Colunas aceitas:<br/>
                  <strong>empresa</strong> (obrigatório), <strong>email</strong> (obrigatório), contato_nome, telefone, segmento, cnpj, cidade, estado, origem<br/>
                  Separadores aceitos: <code className="bg-blue-100 px-1 rounded">;</code> <code className="bg-blue-100 px-1 rounded">,</code> <code className="bg-blue-100 px-1 rounded">TAB</code>
                </p>
                <div className="mt-2 bg-white border border-blue-200 rounded p-2 text-[10px] font-mono text-blue-900">
                  empresa;email;contato_nome;telefone;segmento;cidade;estado<br/>
                  Logística XYZ;contato@xyz.com.br;João Silva;11999999999;logistica;São Paulo;SP<br/>
                  Transportes ABC;comercial@abc.com.br;Maria;11888888888;transporte;Campinas;SP
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Carregar arquivo CSV:</label>
                <Input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="text-xs" data-testid="input-csv-file" />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Ou cole o conteúdo CSV aqui:</label>
                <Textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="empresa;email;contato_nome;telefone&#10;Empresa ABC;contato@abc.com;João;11999999999"
                  className="min-h-[200px] text-xs font-mono"
                  data-testid="textarea-csv"
                />
              </div>

              {csvText && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                  <p className="text-xs text-neutral-600">
                    <strong>{csvText.split("\n").filter(l => l.trim()).length - 1}</strong> linhas detectadas (excluindo cabeçalho)
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowImport(false)} data-testid="btn-cancel-import">Cancelar</Button>
                <Button onClick={handleCsvImport} disabled={!csvText.trim() || isImporting} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" data-testid="btn-confirm-import">
                  {isImporting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Importar Leads
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function LeadDetail({ lead, setores, onUpdate, onDelete, onSendPresentation, onConvert, isPending, isSending, isConverting }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(lead);
  const [newNote, setNewNote] = useState("");
  const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.novo;
  const temp = TEMP_CONFIG[lead.temperatura] || TEMP_CONFIG.frio;
  const historico = Array.isArray(lead.historico) ? lead.historico : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-black text-neutral-900">{lead.empresa}</h2>
            <Badge className={`border ${statusCfg.bg} ${statusCfg.color} text-[10px]`}>{statusCfg.label}</Badge>
            <temp.icon size={16} className={temp.color} />
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            {lead.setor && <span className="flex items-center gap-1"><Building2 size={12} /> {lead.setor}</span>}
            {lead.cidade && <span className="flex items-center gap-1"><MapPin size={12} /> {lead.cidade}/{lead.estado}</span>}
            <ScoreBadge score={lead.score || 0} />
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} data-testid="btn-edit-lead">
          {editing ? "Cancelar" : "Editar"}
        </Button>
      </div>

      {!editing ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {lead.contato_nome && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Contato</span>
                <p className="text-sm font-bold text-neutral-900">{lead.contato_nome}</p>
                {lead.contato_cargo && <p className="text-[10px] text-neutral-500">{lead.contato_cargo}</p>}
              </div>
            )}
            {lead.telefone && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Telefone</span>
                <p className="text-sm font-bold text-neutral-900">{lead.telefone}</p>
              </div>
            )}
            {lead.email && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">E-mail</span>
                <p className="text-sm font-bold text-neutral-900 break-all">{lead.email}</p>
              </div>
            )}
            {lead.endereco && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Endereço</span>
                <p className="text-sm font-bold text-neutral-900">{lead.endereco}</p>
              </div>
            )}
            {lead.cnpj && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">CNPJ</span>
                <p className="text-sm font-bold text-neutral-900">{lead.cnpj}</p>
              </div>
            )}
            {lead.website && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Website</span>
                <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
                  <Globe size={12} /> {lead.website}
                </a>
              </div>
            )}
            {lead.valor_estimado > 0 && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Valor Estimado</span>
                <p className="text-sm font-black text-emerald-600">{fmt(lead.valor_estimado)}</p>
              </div>
            )}
            {lead.proximo_contato && (
              <div className={`rounded-lg p-3 ${new Date(lead.proximo_contato) < new Date() ? "bg-red-50 border border-red-200" : "bg-blue-50"}`}>
                <span className="text-[9px] font-bold text-neutral-400 uppercase">Próximo Contato</span>
                <p className={`text-sm font-bold ${new Date(lead.proximo_contato) < new Date() ? "text-red-600" : "text-blue-700"}`}>
                  {new Date(lead.proximo_contato).toLocaleDateString("pt-BR")}
                  {new Date(lead.proximo_contato) < new Date() && <span className="text-[9px] ml-1 font-black text-red-500">ATRASADO</span>}
                </p>
              </div>
            )}
            {lead.emails_enviados > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase">E-mails Enviados</span>
                <p className="text-sm font-bold text-blue-700">{lead.emails_enviados}x</p>
              </div>
            )}
          </div>
          {lead.notas && (
            <div className="bg-neutral-50 rounded-lg p-3">
              <span className="text-[9px] font-bold text-neutral-400 uppercase">Notas</span>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{lead.notas}</p>
            </div>
          )}

          <div className="border-t pt-3">
            <label className="text-[10px] font-bold text-neutral-400 uppercase">Alterar Status</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => onUpdate({ status: k })}
                  disabled={lead.status === k || isPending}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${lead.status === k ? `${v.bg} ${v.color} ring-1 ring-offset-1` : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50"} disabled:opacity-40`}
                  data-testid={`status-${k}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="text-[10px] font-bold text-neutral-400 uppercase">Temperatura</label>
            <div className="flex gap-2 mt-1.5">
              {Object.entries(TEMP_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => onUpdate({ temperatura: k })} disabled={isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${lead.temperatura === k ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}
                  data-testid={`temp-${k}`}>
                  <v.icon size={14} className={lead.temperatura === k ? "text-white" : v.color} /> {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1.5 block">Adicionar Nota</label>
            <div className="flex gap-2">
              <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Registrar atividade ou observação..." className="h-9 text-sm flex-1" data-testid="input-new-note" />
              <Button size="sm" onClick={() => { if (newNote.trim()) { onUpdate({ _nota: newNote.trim() }); setNewNote(""); } }} disabled={!newNote.trim() || isPending} data-testid="btn-add-note">
                <Plus size={14} />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            {lead.email && lead.status !== "ganho" && (
              <Button size="sm" onClick={onSendPresentation} disabled={isSending} className="gap-1.5 bg-blue-600 hover:bg-blue-700 flex-1" data-testid="btn-send-presentation">
                {isSending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                Enviar Apresentação
                {lead.emails_enviados > 0 && <Badge className="bg-blue-800 text-white text-[9px] ml-1">{lead.emails_enviados}x</Badge>}
              </Button>
            )}
            {!["ganho", "perdido", "descartado"].includes(lead.status) && (
              <Button size="sm" onClick={onConvert} disabled={isConverting} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 flex-1" data-testid="btn-convert">
                {isConverting ? <RefreshCw size={12} className="animate-spin" /> : <UserCheck size={12} />}
                Converter em Cliente
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onDelete} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" data-testid="btn-delete-lead">
              <Trash2 size={12} />
            </Button>
          </div>

          {historico.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <History size={12} className="text-neutral-400" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Histórico</span>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {[...historico].reverse().map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-neutral-700">{h.acao}</p>
                      {h.detalhes && <p className="text-neutral-400">{h.detalhes}</p>}
                      <p className="text-[9px] text-neutral-300">{h.usuario} · {new Date(h.data).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <LeadForm
          form={form}
          setForm={setForm}
          setores={setores}
          onSubmit={() => { onUpdate(form); setEditing(false); }}
          isPending={isPending}
        />
      )}
    </div>
  );
}
