import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator, DollarSign, Truck, Clock, Moon, AlertTriangle,
  Save, Loader2, RefreshCw, Download, ChevronRight, MapPin,
  Fuel, Shield, FileText, Users, BarChart3, Plus, X, Eye,
  ArrowDownCircle, ArrowUpCircle, CheckCircle2, Settings,
} from "lucide-react";

const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

type Tab = "CALCULADORA" | "FATURAMENTOS" | "CONTRATOS" | "RELATORIO";

interface EscortContract {
  id: string;
  client_id: number | null;
  client_name: string | null;
  valor_km_carregado: number;
  valor_km_vazio: number;
  franquia_minima_km: number;
  valor_hora_estadia: number;
  valor_diaria: number;
  vrp_base: number;
  adicional_noturno_vrp_pct: number;
  adicional_noturno_km_pct: number;
  adicional_periculosidade_pct: number;
  periculosidade_horas_limite: number;
  status: string;
}

interface EscortBilling {
  id: string;
  service_order_id: number | null;
  client_id: number | null;
  client_name: string | null;
  km_inicial: number;
  km_final: number;
  km_carregado: number;
  km_vazio: number;
  km_total: number;
  horas_missao: number;
  is_noturno: boolean;
  fat_total: number;
  pag_total: number;
  status: string;
  vigilante_name: string | null;
  created_at: string;
}

interface CalcResult {
  km_carregado: number; km_vazio: number; km_total: number; km_faturado: number;
  require_photo: boolean; is_noturno: boolean;
  fat_km: number; fat_estadia: number; fat_pernoite: number; fat_adicional_noturno: number; fat_total: number;
  pag_vrp: number; pag_periculosidade: number; pag_adicional_noturno: number; pag_reembolsos: number; pag_total: number;
}

function ContractFormModal({ onClose, editing, clients }: { onClose: () => void; editing: EscortContract | null; clients: any[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    client_id: editing?.client_id?.toString() || "",
    client_name: editing?.client_name || "",
    valor_km_carregado: editing?.valor_km_carregado?.toString() || "2.80",
    valor_km_vazio: editing?.valor_km_vazio?.toString() || "1.40",
    franquia_minima_km: editing?.franquia_minima_km?.toString() || "50",
    valor_hora_estadia: editing?.valor_hora_estadia?.toString() || "50.00",
    valor_diaria: editing?.valor_diaria?.toString() || "200.00",
    vrp_base: editing?.vrp_base?.toString() || "150.00",
    adicional_noturno_vrp_pct: editing?.adicional_noturno_vrp_pct?.toString() || "20",
    adicional_noturno_km_pct: editing?.adicional_noturno_km_pct?.toString() || "15",
    adicional_periculosidade_pct: editing?.adicional_periculosidade_pct?.toString() || "30",
    periculosidade_horas_limite: editing?.periculosidade_horas_limite?.toString() || "8",
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const client = clients.find((c: any) => c.id.toString() === form.client_id);
      const payload = {
        client_id: form.client_id ? parseInt(form.client_id) : null,
        client_name: client?.name || form.client_name || null,
        valor_km_carregado: parseFloat(form.valor_km_carregado),
        valor_km_vazio: parseFloat(form.valor_km_vazio),
        franquia_minima_km: parseInt(form.franquia_minima_km),
        valor_hora_estadia: parseFloat(form.valor_hora_estadia),
        valor_diaria: parseFloat(form.valor_diaria),
        vrp_base: parseFloat(form.vrp_base),
        adicional_noturno_vrp_pct: parseFloat(form.adicional_noturno_vrp_pct),
        adicional_noturno_km_pct: parseFloat(form.adicional_noturno_km_pct),
        adicional_periculosidade_pct: parseFloat(form.adicional_periculosidade_pct),
        periculosidade_horas_limite: parseInt(form.periculosidade_horas_limite),
      };
      if (editing) return apiRequest("PUT", `/api/escort/contracts/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/contracts"] });
      toast({ title: editing ? "Contrato atualizado" : "Contrato criado" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const setField = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-contract">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Contrato" : "Novo Contrato"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cliente</label>
            <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white font-bold" value={form.client_id} onChange={e => setField("client_id", e.target.value)} data-testid="select-contract-client">
              <option value="">Padrão (sem cliente)</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Carregado</label>
              <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_carregado} onChange={e => setField("valor_km_carregado", e.target.value)} data-testid="input-km-carregado" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Vazio (retorno)</label>
              <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_vazio} onChange={e => setField("valor_km_vazio", e.target.value)} data-testid="input-km-vazio" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Franquia Mín. KM</label>
              <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.franquia_minima_km} onChange={e => setField("franquia_minima_km", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Hora Estadia</label>
              <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_hora_estadia} onChange={e => setField("valor_hora_estadia", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$ Diária</label>
              <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_diaria} onChange={e => setField("valor_diaria", e.target.value)} />
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest">Pagamento Operacional</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">VRP Base (R$)</label>
                <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vrp_base} onChange={e => setField("vrp_base", e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Limite Horas (peric.)</label>
                <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.periculosidade_horas_limite} onChange={e => setField("periculosidade_horas_limite", e.target.value)} />
              </div>
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest">Adicionais (%)</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Periculosidade</label>
                <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_periculosidade_pct} onChange={e => setField("adicional_periculosidade_pct", e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno VRP</label>
                <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_vrp_pct} onChange={e => setField("adicional_noturno_vrp_pct", e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno KM</label>
                <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_km_pct} onChange={e => setField("adicional_noturno_km_pct", e.target.value)} />
              </div>
            </div>
          </div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-contract"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Contrato
          </button>
        </form>
      </div>
    </div>
  );
}

export default function EscortBillingPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("CALCULADORA");
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [showContractForm, setShowContractForm] = useState(false);
  const [editingContract, setEditingContract] = useState<EscortContract | null>(null);
  const [reportClientId, setReportClientId] = useState("");
  const [reportData, setReportData] = useState<any>(null);

  const [calc, setCalc] = useState({
    contract_id: "", km_inicial: "", km_final: "", km_vazio: "0",
    horas_missao: "", horas_estadia: "0", teve_pernoite: false,
    horario_inicio: "", horario_fim: "",
    despesas_pedagio: "0", despesas_combustivel: "0", despesas_outras: "0",
    client_name: "", vigilante_name: "",
  });

  const { data: contracts = [] } = useQuery<EscortContract[]>({ queryKey: ["/api/escort/contracts"] });
  const { data: billings = [], isLoading: billingsLoading } = useQuery<EscortBilling[]>({ queryKey: ["/api/escort/billings"] });
  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/clients"] });

  const calcMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/escort/calculate", {
      contract_id: calc.contract_id || undefined,
      km_inicial: parseFloat(calc.km_inicial), km_final: parseFloat(calc.km_final),
      km_vazio: parseFloat(calc.km_vazio || "0"), horas_missao: parseFloat(calc.horas_missao || "0"),
      horas_estadia: parseFloat(calc.horas_estadia || "0"), teve_pernoite: calc.teve_pernoite,
      horario_inicio: calc.horario_inicio || undefined, horario_fim: calc.horario_fim || undefined,
      despesas_pedagio: parseFloat(calc.despesas_pedagio || "0"),
      despesas_combustivel: parseFloat(calc.despesas_combustivel || "0"),
      despesas_outras: parseFloat(calc.despesas_outras || "0"),
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setCalcResult(data);
    },
    onError: (err: Error) => toast({ title: "Erro no cálculo", description: err.message, variant: "destructive" }),
  });

  const saveBillingMutation = useMutation({
    mutationFn: () => {
      if (!calcResult) throw new Error("Calcule primeiro");
      const contract = contracts.find(c => c.id === calc.contract_id);
      return apiRequest("POST", "/api/escort/billings", {
        client_id: contract?.client_id || null,
        client_name: contract?.client_name || calc.client_name || null,
        contract_id: calc.contract_id || null,
        km_inicial: parseFloat(calc.km_inicial), km_final: parseFloat(calc.km_final),
        km_carregado: calcResult.km_carregado, km_vazio: calcResult.km_vazio,
        km_total: calcResult.km_total, km_faturado: calcResult.km_faturado,
        horas_missao: parseFloat(calc.horas_missao || "0"),
        horas_estadia: parseFloat(calc.horas_estadia || "0"),
        teve_pernoite: calc.teve_pernoite,
        horario_inicio: calc.horario_inicio || null, horario_fim: calc.horario_fim || null,
        is_noturno: calcResult.is_noturno,
        despesas_pedagio: parseFloat(calc.despesas_pedagio || "0"),
        despesas_combustivel: parseFloat(calc.despesas_combustivel || "0"),
        despesas_outras: parseFloat(calc.despesas_outras || "0"),
        fat_km: calcResult.fat_km, fat_estadia: calcResult.fat_estadia,
        fat_pernoite: calcResult.fat_pernoite, fat_adicional_noturno: calcResult.fat_adicional_noturno,
        fat_total: calcResult.fat_total,
        pag_vrp: calcResult.pag_vrp, pag_periculosidade: calcResult.pag_periculosidade,
        pag_adicional_noturno: calcResult.pag_adicional_noturno,
        pag_reembolsos: calcResult.pag_reembolsos, pag_total: calcResult.pag_total,
        vigilante_name: calc.vigilante_name || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      toast({ title: "Faturamento registrado com sucesso" });
      setCalcResult(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const loadReport = async () => {
    if (!reportClientId) return;
    try {
      const res = await apiRequest("GET", `/api/escort/relatorio/${reportClientId}`);
      const data = await res.json();
      setReportData(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar relatório", description: err.message, variant: "destructive" });
    }
  };

  const setCalcField = (k: string, v: any) => setCalc(prev => ({ ...prev, [k]: v }));

  const TABS: { id: Tab; label: string; icon: typeof Calculator }[] = [
    { id: "CALCULADORA", label: "Calculadora", icon: Calculator },
    { id: "FATURAMENTOS", label: "Faturamentos", icon: FileText },
    { id: "CONTRATOS", label: "Contratos", icon: Settings },
    { id: "RELATORIO", label: "Relatório", icon: BarChart3 },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-escort-billing">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight uppercase" data-testid="text-page-title">Motor de Cálculo de Escolta</h1>
            <p className="text-sm text-neutral-500">Faturamento, pagamento operacional e adicionais</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
          <div className="flex overflow-x-auto gap-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id.toLowerCase()}`}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap ${
                  activeTab === tab.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}>
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "CALCULADORA" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><MapPin size={14} /> Dados da Missão</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Contrato</label>
                    <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-xs bg-white font-bold" value={calc.contract_id} onChange={e => setCalcField("contract_id", e.target.value)} data-testid="select-calc-contract">
                      <option value="">Valores Padrão</option>
                      {contracts.filter(c => c.status === "Ativo").map(c => <option key={c.id} value={c.id}>{c.client_name || "Contrato Geral"}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Inicial</label>
                      <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_inicial} onChange={e => setCalcField("km_inicial", e.target.value)} data-testid="input-calc-km-ini" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Final</label>
                      <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_final} onChange={e => setCalcField("km_final", e.target.value)} data-testid="input-calc-km-fim" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Vazio</label>
                      <input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_vazio} onChange={e => setCalcField("km_vazio", e.target.value)} data-testid="input-calc-km-vazio" />
                    </div>
                  </div>
                  {parseFloat(calc.km_final || "0") > 0 && parseFloat(calc.km_final || "0") < parseFloat(calc.km_inicial || "0") && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                      <AlertTriangle size={14} className="text-red-600" />
                      <span className="text-[10px] font-bold text-red-700 uppercase">KM final não pode ser menor que KM inicial</span>
                    </div>
                  )}
                  {parseFloat(calc.km_final || "0") - parseFloat(calc.km_inicial || "0") > 500 && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <AlertTriangle size={14} className="text-amber-600" />
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Diferença &gt; 500 KM — Foto do hodômetro obrigatória</span>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><Clock size={14} /> Tempo e Horário</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Missão</label>
                      <input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horas_missao} onChange={e => setCalcField("horas_missao", e.target.value)} data-testid="input-calc-horas" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Estadia</label>
                      <input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horas_estadia} onChange={e => setCalcField("horas_estadia", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horário Início</label>
                      <input type="time" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horario_inicio} onChange={e => setCalcField("horario_inicio", e.target.value)} data-testid="input-calc-hora-ini" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horário Fim</label>
                      <input type="time" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horario_fim} onChange={e => setCalcField("horario_fim", e.target.value)} data-testid="input-calc-hora-fim" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={calc.teve_pernoite} onChange={e => setCalcField("teve_pernoite", e.target.checked)} className="rounded" data-testid="checkbox-pernoite" />
                    <span className="text-xs font-bold text-neutral-700 uppercase">Pernoite (diária)</span>
                  </label>
                </div>
              </Card>

              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><DollarSign size={14} /> Despesas</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Pedágio</label>
                    <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_pedagio} onChange={e => setCalcField("despesas_pedagio", e.target.value)} data-testid="input-calc-pedagio" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Combustível</label>
                    <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_combustivel} onChange={e => setCalcField("despesas_combustivel", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Outras</label>
                    <input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_outras} onChange={e => setCalcField("despesas_outras", e.target.value)} />
                  </div>
                </div>
              </Card>

              <Button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending || !calc.km_inicial || !calc.km_final}
                className="w-full bg-neutral-900 hover:bg-black text-white font-black uppercase text-xs tracking-widest py-6" data-testid="button-calculate">
                {calcMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : <Calculator size={18} className="mr-2" />}
                Calcular Faturamento
              </Button>
            </div>

            <div className="space-y-4">
              {calcResult ? (
                <>
                  <Card className="p-5 border-neutral-200 shadow-sm" data-testid="panel-calc-result">
                    <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><Truck size={14} /> Resumo da Missão</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="p-3 bg-neutral-50 rounded-lg text-center">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p>
                        <p className="text-lg font-black font-mono text-neutral-900">{calcResult.km_total}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg text-center">
                        <p className="text-[9px] font-black text-blue-600 uppercase">Carregado</p>
                        <p className="text-lg font-black font-mono text-blue-700">{calcResult.km_carregado}</p>
                      </div>
                      <div className="p-3 bg-neutral-50 rounded-lg text-center">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">Vazio</p>
                        <p className="text-lg font-black font-mono text-neutral-600">{calcResult.km_vazio}</p>
                      </div>
                      <div className="p-3 bg-neutral-50 rounded-lg text-center">
                        <p className="text-[9px] font-black text-neutral-400 uppercase">Faturado</p>
                        <p className="text-lg font-black font-mono text-neutral-900">{calcResult.km_faturado}</p>
                      </div>
                    </div>
                    {calcResult.is_noturno && (
                      <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200 mb-3">
                        <Moon size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-bold text-indigo-700 uppercase">Missão Noturna — Adicionais aplicados</span>
                      </div>
                    )}
                    {calcResult.pag_periculosidade > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200 mb-3">
                        <Shield size={14} className="text-amber-600" />
                        <span className="text-[10px] font-bold text-amber-700 uppercase">Periculosidade — Missão excedeu limite de horas</span>
                      </div>
                    )}
                    {calcResult.require_photo && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                        <AlertTriangle size={14} className="text-red-600" />
                        <span className="text-[10px] font-bold text-red-700 uppercase">Foto do hodômetro obrigatória (&gt;500 KM)</span>
                      </div>
                    )}
                  </Card>

                  <Card className="p-5 border-green-200 bg-green-50/30 shadow-sm" data-testid="panel-faturamento-cliente">
                    <h3 className="text-xs font-black text-green-700 uppercase mb-4 flex items-center gap-2"><ArrowUpCircle size={14} /> Faturamento ao Cliente</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>KM Faturado</span><span className="font-mono">{formatCurrency(calcResult.fat_km)}</span></div>
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Estadia</span><span className="font-mono">{formatCurrency(calcResult.fat_estadia)}</span></div>
                      {calcResult.fat_pernoite > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Pernoite</span><span className="font-mono">{formatCurrency(calcResult.fat_pernoite)}</span></div>}
                      {calcResult.fat_adicional_noturno > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700"><span>Adicional Noturno (KM +15%)</span><span className="font-mono">{formatCurrency(calcResult.fat_adicional_noturno)}</span></div>}
                      {calcResult.pag_reembolsos > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Reembolsos</span><span className="font-mono">{formatCurrency(calcResult.pag_reembolsos)}</span></div>}
                      <div className="border-t border-green-200 pt-2 flex justify-between text-sm font-black text-green-700"><span>TOTAL FATURAMENTO</span><span className="font-mono text-lg">{formatCurrency(calcResult.fat_total)}</span></div>
                    </div>
                  </Card>

                  <Card className="p-5 border-red-200 bg-red-50/30 shadow-sm" data-testid="panel-pagamento-vigilante">
                    <h3 className="text-xs font-black text-red-700 uppercase mb-4 flex items-center gap-2"><ArrowDownCircle size={14} /> Pagamento Operacional</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>VRP Base</span><span className="font-mono">{formatCurrency(calcResult.pag_vrp)}</span></div>
                      {calcResult.pag_periculosidade > 0 && <div className="flex justify-between text-xs font-bold text-amber-700"><span>Periculosidade (+30%)</span><span className="font-mono">{formatCurrency(calcResult.pag_periculosidade)}</span></div>}
                      {calcResult.pag_adicional_noturno > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700"><span>Adicional Noturno (+20% VRP)</span><span className="font-mono">{formatCurrency(calcResult.pag_adicional_noturno)}</span></div>}
                      {calcResult.pag_reembolsos > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Reembolsos</span><span className="font-mono">{formatCurrency(calcResult.pag_reembolsos)}</span></div>}
                      <div className="border-t border-red-200 pt-2 flex justify-between text-sm font-black text-red-700"><span>TOTAL OPERACIONAL</span><span className="font-mono text-lg">{formatCurrency(calcResult.pag_total)}</span></div>
                    </div>
                  </Card>

                  <Card className={`p-4 border-2 shadow-sm ${calcResult.fat_total - calcResult.pag_total >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-neutral-700 uppercase">Lucro Bruto da Missão</span>
                      <span className={`text-xl font-black font-mono ${calcResult.fat_total - calcResult.pag_total >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatCurrency(calcResult.fat_total - calcResult.pag_total)}
                      </span>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Vigilante</label>
                      <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Nome do vigilante" value={calc.vigilante_name} onChange={e => setCalcField("vigilante_name", e.target.value)} data-testid="input-vigilante" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cliente</label>
                      <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Nome do cliente" value={calc.client_name} onChange={e => setCalcField("client_name", e.target.value)} data-testid="input-client-name" />
                    </div>
                  </div>

                  <Button onClick={() => saveBillingMutation.mutate()} disabled={saveBillingMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs tracking-widest py-4" data-testid="button-save-billing">
                    {saveBillingMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                    Registrar Faturamento
                  </Button>
                </>
              ) : (
                <Card className="p-12 border-neutral-200 shadow-sm text-center">
                  <Calculator size={48} className="mx-auto text-neutral-300 mb-4" />
                  <p className="text-sm font-bold text-neutral-400 uppercase">Preencha os dados e clique em Calcular</p>
                  <p className="text-[10px] text-neutral-400 mt-2">O motor aplica automaticamente: KM carregado/vazio, periculosidade (&gt;8h), adicional noturno (22h-05h)</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "FATURAMENTOS" && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden" data-testid="panel-billings">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">KM</th>
                    <th className="px-4 py-3">Horas</th>
                    <th className="px-4 py-3 text-center">Noturno</th>
                    <th className="px-4 py-3 text-right">Faturamento</th>
                    <th className="px-4 py-3 text-right">Operacional</th>
                    <th className="px-4 py-3 text-right">Lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {billingsLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-neutral-700" /></td></tr>
                  ) : billings.length === 0 ? (
                    <tr><td colSpan={8} className="p-12 text-center text-neutral-400 font-bold uppercase italic text-sm">Nenhum faturamento registrado.</td></tr>
                  ) : billings.map(b => (
                    <tr key={b.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3 text-xs font-bold text-neutral-800 uppercase">{b.client_name || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono font-bold">{b.km_total}</td>
                      <td className="px-4 py-3 text-xs font-mono font-bold">{b.horas_missao}h</td>
                      <td className="px-4 py-3 text-center">{b.is_noturno ? <Moon size={14} className="mx-auto text-indigo-600" /> : <span className="text-neutral-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-black font-mono text-sm text-green-600">{formatCurrency(Number(b.fat_total))}</td>
                      <td className="px-4 py-3 text-right font-black font-mono text-sm text-red-600">{formatCurrency(Number(b.pag_total))}</td>
                      <td className={`px-4 py-3 text-right font-black font-mono text-sm ${Number(b.fat_total) - Number(b.pag_total) >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(Number(b.fat_total) - Number(b.pag_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {billings.length > 0 && (
              <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center text-xs font-bold text-neutral-500 uppercase">
                <span>{billings.length} registro(s)</span>
                <span className="font-mono font-black text-green-600">Total Faturado: {formatCurrency(billings.reduce((a, b) => a + Number(b.fat_total), 0))}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === "CONTRATOS" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setEditingContract(null); setShowContractForm(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-contract">
                <Plus size={14} className="mr-1" /> Novo Contrato
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contracts.map(c => (
                <Card key={c.id} className="p-5 border-neutral-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setEditingContract(c); setShowContractForm(true); }} data-testid={`card-contract-${c.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black text-neutral-800 uppercase">{c.client_name || "Contrato Padrão"}</h4>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${c.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{c.status}</span>
                  </div>
                  <div className="space-y-1 text-[10px] font-bold text-neutral-500">
                    <div className="flex justify-between"><span>KM Carregado</span><span className="font-mono text-neutral-800">{formatCurrency(Number(c.valor_km_carregado))}/km</span></div>
                    <div className="flex justify-between"><span>KM Vazio</span><span className="font-mono text-neutral-800">{formatCurrency(Number(c.valor_km_vazio))}/km</span></div>
                    <div className="flex justify-between"><span>VRP Base</span><span className="font-mono text-neutral-800">{formatCurrency(Number(c.vrp_base))}</span></div>
                    <div className="flex justify-between"><span>Periculosidade</span><span className="font-mono text-neutral-800">{c.adicional_periculosidade_pct}% &gt;{c.periculosidade_horas_limite}h</span></div>
                    <div className="flex justify-between"><span>Noturno</span><span className="font-mono text-neutral-800">{c.adicional_noturno_vrp_pct}% VRP / {c.adicional_noturno_km_pct}% KM</span></div>
                  </div>
                </Card>
              ))}
              {contracts.length === 0 && (
                <Card className="p-8 border-neutral-200 shadow-sm col-span-full text-center">
                  <Settings size={32} className="mx-auto text-neutral-300 mb-3" />
                  <p className="text-sm font-bold text-neutral-400 uppercase">Nenhum contrato cadastrado</p>
                  <p className="text-[10px] text-neutral-400 mt-1">Será utilizado os valores padrão para cálculos</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "RELATORIO" && (
          <div className="space-y-4">
            <Card className="p-5 border-neutral-200 shadow-sm">
              <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><BarChart3 size={14} /> Relatório Mensal por Cliente</h3>
              <div className="flex gap-3">
                <select className="flex-1 p-2.5 border border-neutral-200 rounded-lg text-sm bg-white font-bold" value={reportClientId} onChange={e => setReportClientId(e.target.value)} data-testid="select-report-client">
                  <option value="">Selecione um cliente...</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button onClick={loadReport} disabled={!reportClientId} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-load-report">
                  <Eye size={14} className="mr-1" /> Gerar
                </Button>
              </div>
            </Card>
            {reportData && (
              <Card className="p-6 border-neutral-200 shadow-sm" data-testid="panel-report">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-neutral-900 uppercase">{reportData.client_name}</h3>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase">{reportData.periodo}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-neutral-50 rounded-xl text-center">
                    <p className="text-[9px] font-black text-neutral-400 uppercase">Missões</p>
                    <p className="text-2xl font-black text-neutral-900">{reportData.totais.total_missoes}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-xl text-center">
                    <p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p>
                    <p className="text-xl font-black text-green-700 font-mono">{formatCurrency(reportData.totais.total_faturamento)}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-xl text-center">
                    <p className="text-[9px] font-black text-red-700 uppercase">Operacional</p>
                    <p className="text-xl font-black text-red-700 font-mono">{formatCurrency(reportData.totais.total_pagamento_operacional)}</p>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${reportData.totais.lucro_bruto >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <p className="text-[9px] font-black text-neutral-400 uppercase">Lucro Bruto</p>
                    <p className={`text-xl font-black font-mono ${reportData.totais.lucro_bruto >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(reportData.totais.lucro_bruto)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p>
                    <p className="text-lg font-black font-mono text-neutral-700">{reportData.totais.total_km}</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-[9px] font-black text-neutral-400 uppercase">Pedágios</p>
                    <p className="text-lg font-black font-mono text-neutral-700">{formatCurrency(reportData.totais.total_pedagio)}</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-[9px] font-black text-neutral-400 uppercase">Combustível</p>
                    <p className="text-lg font-black font-mono text-neutral-700">{formatCurrency(reportData.totais.total_combustivel)}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-lg">
                    <p className="text-[9px] font-black text-indigo-700 uppercase">Missões Noturnas</p>
                    <p className="text-lg font-black text-indigo-700">{reportData.totais.missoes_noturnas}</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {showContractForm && (
          <ContractFormModal
            onClose={() => { setShowContractForm(false); setEditingContract(null); }}
            editing={editingContract}
            clients={clients}
          />
        )}
      </div>
    </AdminLayout>
  );
}
