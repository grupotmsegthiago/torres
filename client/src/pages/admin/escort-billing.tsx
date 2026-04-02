import { parseBRL } from "@/lib/utils";
import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, DollarSign, Clock, Moon, AlertTriangle,
  Save, Loader2, MapPin, Shield, BarChart3, Plus, X, Eye,
  Settings, Route, Navigation, ChevronRight, Building2, User,
  Calendar, ChevronLeft, Printer, Edit, Trash2, CheckCircle2,
} from "lucide-react";

const fmt = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

interface EscortContract {
  id: string; client_id: number | null; client_name: string | null;
  valor_km_carregado: number; valor_km_vazio: number; franquia_minima_km: number;
  valor_hora_estadia: number; valor_diaria: number; vrp_base: number;
  adicional_noturno_vrp_pct: number; adicional_noturno_km_pct: number;
  adicional_periculosidade_pct: number; periculosidade_horas_limite: number;
  status: string;
}

interface EscortRoute {
  id: string; client_id: number | null; client_name: string | null;
  name: string; origin: string; destination: string;
  estimated_km: number; estimated_hours: number; is_noturno: boolean;
  notes: string | null; status: string;
}

interface ServiceContract {
  id: string; client_id: number | null; client_name: string | null;
  contract_number: string | null; object: string;
  contratante_razao: string | null; contratante_cnpj: string | null;
  contratante_endereco: string | null; contratante_representante: string | null;
  vigencia_tipo: string; vigencia_inicio: string | null; vigencia_fim: string | null;
  aviso_previo_dias: number; data_assinatura: string | null;
  status: string; num_vigilantes: number;
  armamento_descricao: string | null; equipamentos: string | null;
  multa_mora_pct: number; juros_mora_pct: number; indice_correcao: string;
  observacoes: string | null; created_at: string;
}

interface EscortBilling {
  id: string; client_id: number | null; client_name: string | null;
  km_inicial: number; km_final: number; km_carregado: number; km_vazio: number;
  km_total: number; horas_missao: number; is_noturno: boolean;
  fat_total: number; pag_total: number; status: string;
  vigilante_name: string | null; created_at: string;
  boletim_numero: string | null; boletim_gerado: boolean;
  origem: string | null; destino: string | null;
}

type ClientTab = "CONTRATO" | "TABELA" | "RELATORIO_OS";

function ServiceContractModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: ServiceContract | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    contract_number: editing?.contract_number || "",
    contratante_razao: editing?.contratante_razao || clientName,
    contratante_cnpj: editing?.contratante_cnpj || "",
    contratante_endereco: editing?.contratante_endereco || "",
    contratante_representante: editing?.contratante_representante || "",
    vigencia_tipo: editing?.vigencia_tipo || "indeterminado",
    vigencia_inicio: editing?.vigencia_inicio?.split("T")[0] || new Date().toISOString().split("T")[0],
    vigencia_fim: editing?.vigencia_fim?.split("T")[0] || "",
    data_assinatura: editing?.data_assinatura?.split("T")[0] || new Date().toISOString().split("T")[0],
    aviso_previo_dias: editing?.aviso_previo_dias?.toString() || "30",
    num_vigilantes: editing?.num_vigilantes?.toString() || "2",
    armamento_descricao: editing?.armamento_descricao || "02 Revolver Cal. 38 + 01 Espingarda Cal. 12 Pump",
    equipamentos: editing?.equipamentos || "02 Coletes nível II-A, Viatura identificada com rastreamento",
    multa_mora_pct: editing?.multa_mora_pct?.toString() || "2.00",
    juros_mora_pct: editing?.juros_mora_pct?.toString() || "1.00",
    indice_correcao: editing?.indice_correcao || "INPC",
    observacoes: editing?.observacoes || "",
  });
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        client_id: clientId, client_name: clientName,
        contract_number: form.contract_number || null,
        contratante_razao: form.contratante_razao || null,
        contratante_cnpj: form.contratante_cnpj || null,
        contratante_endereco: form.contratante_endereco || null,
        contratante_representante: form.contratante_representante || null,
        vigencia_tipo: form.vigencia_tipo,
        vigencia_inicio: form.vigencia_inicio || null,
        vigencia_fim: form.vigencia_tipo === "determinado" ? (form.vigencia_fim || null) : null,
        data_assinatura: form.data_assinatura || null,
        aviso_previo_dias: parseInt(form.aviso_previo_dias),
        num_vigilantes: parseInt(form.num_vigilantes),
        armamento_descricao: form.armamento_descricao || null,
        equipamentos: form.equipamentos || null,
        multa_mora_pct: parseBRL(form.multa_mora_pct),
        juros_mora_pct: parseBRL(form.juros_mora_pct),
        indice_correcao: form.indice_correcao,
        observacoes: form.observacoes || null,
        status: "Ativo",
      };
      if (editing) return apiRequest("PUT", `/api/service-contracts/${editing.id}`, payload);
      return apiRequest("POST", "/api/service-contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-contracts"] });
      toast({ title: editing ? "Contrato atualizado" : "Contrato cadastrado" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-service-contract">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Contrato" : "Novo Contrato de Prestação de Serviço"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><FileText size={12} /> Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nº Contrato</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold uppercase" placeholder="CT-2026/001" value={form.contract_number} onChange={e => sf("contract_number", e.target.value)} data-testid="input-contract-number" /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Data Assinatura</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.data_assinatura} onChange={e => sf("data_assinatura", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Building2 size={12} /> Contratante</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Razão Social</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.contratante_razao} onChange={e => sf("contratante_razao", e.target.value)} /></div>
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">CNPJ</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" placeholder="00.000.000/0000-00" value={form.contratante_cnpj} onChange={e => sf("contratante_cnpj", e.target.value)} data-testid="input-contratante-cnpj" /></div>
              </div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Endereço</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.contratante_endereco} onChange={e => sf("contratante_endereco", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Representante Legal</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.contratante_representante} onChange={e => sf("contratante_representante", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Calendar size={12} /> Vigência</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Tipo</label>
                <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold bg-white" value={form.vigencia_tipo} onChange={e => sf("vigencia_tipo", e.target.value)} data-testid="select-vigencia-tipo">
                  <option value="indeterminado">Indeterminado</option>
                  <option value="determinado">Determinado</option>
                </select>
              </div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Início</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vigencia_inicio} onChange={e => sf("vigencia_inicio", e.target.value)} /></div>
              {form.vigencia_tipo === "determinado" && (
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Término</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vigencia_fim} onChange={e => sf("vigencia_fim", e.target.value)} /></div>
              )}
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Aviso Prévio (dias)</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.aviso_previo_dias} onChange={e => sf("aviso_previo_dias", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><Shield size={12} /> Operacional</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nº Vigilantes</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.num_vigilantes} onChange={e => sf("num_vigilantes", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Índice Correção</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.indice_correcao} onChange={e => sf("indice_correcao", e.target.value)} /></div>
            </div>
            <div className="mt-3"><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Armamento</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.armamento_descricao} onChange={e => sf("armamento_descricao", e.target.value)} /></div>
            <div className="mt-3"><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Equipamentos</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.equipamentos} onChange={e => sf("equipamentos", e.target.value)} /></div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <p className="text-[10px] font-black text-red-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Penalidades</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Multa Mora (%)</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.multa_mora_pct} onChange={e => sf("multa_mora_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Juros Mora (% mês)</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.juros_mora_pct} onChange={e => sf("juros_mora_pct", e.target.value)} /></div>
            </div>
          </div>

          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações</label><textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm" rows={3} value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} /></div>

          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-service-contract"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Contrato
          </button>
        </form>
      </div>
    </div>
  );
}

function PriceTableModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: EscortContract | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
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
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const n = (v: string) => parseBRL(v);
      const payload = {
        client_id: clientId, client_name: clientName,
        valor_km_carregado: n(form.valor_km_carregado), valor_km_vazio: n(form.valor_km_vazio),
        franquia_minima_km: n(form.franquia_minima_km), valor_hora_estadia: n(form.valor_hora_estadia),
        valor_diaria: n(form.valor_diaria), vrp_base: n(form.vrp_base),
        adicional_noturno_vrp_pct: n(form.adicional_noturno_vrp_pct), adicional_noturno_km_pct: n(form.adicional_noturno_km_pct),
        adicional_periculosidade_pct: n(form.adicional_periculosidade_pct), periculosidade_horas_limite: n(form.periculosidade_horas_limite),
        status: "Ativo",
      };
      if (editing) return apiRequest("PUT", `/api/escort/contracts/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/contracts"] });
      toast({ title: editing ? "Tabela atualizada" : "Tabela de preços criada" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-price-table">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Tabela de Preços" : "Nova Tabela de Preços"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Faturamento ao Cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Carregado</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_carregado} onChange={e => sf("valor_km_carregado", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Vazio</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_vazio} onChange={e => sf("valor_km_vazio", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Franquia KM</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.franquia_minima_km} onChange={e => sf("franquia_minima_km", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Hora Estadia</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_hora_estadia} onChange={e => sf("valor_hora_estadia", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$ Diária</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_diaria} onChange={e => sf("valor_diaria", e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest flex items-center gap-1"><User size={12} /> Pagamento Vigilante</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">VRP Base (R$)</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vrp_base} onChange={e => sf("vrp_base", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Limite Horas</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.periculosidade_horas_limite} onChange={e => sf("periculosidade_horas_limite", e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest">Adicionais (%)</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Periculosidade</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_periculosidade_pct} onChange={e => sf("adicional_periculosidade_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno VRP</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_vrp_pct} onChange={e => sf("adicional_noturno_vrp_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno KM</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_km_pct} onChange={e => sf("adicional_noturno_km_pct", e.target.value)} /></div>
            </div>
          </div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-price-table"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Tabela de Preços
          </button>
        </form>
      </div>
    </div>
  );
}

function RouteFormModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: EscortRoute | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: editing?.name || "", origin: editing?.origin || "", destination: editing?.destination || "",
    estimated_km: editing?.estimated_km?.toString() || "", estimated_hours: editing?.estimated_hours?.toString() || "0",
    is_noturno: editing?.is_noturno || false, notes: editing?.notes || "",
  });
  const sf = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { client_id: clientId, client_name: clientName, name: form.name, origin: form.origin, destination: form.destination, estimated_km: parseBRL(form.estimated_km), estimated_hours: parseBRL(form.estimated_hours || "0"), is_noturno: form.is_noturno, notes: form.notes || null, status: "Ativo" };
      if (editing) return apiRequest("PUT", `/api/escort/routes/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/routes", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/routes"] });
      toast({ title: editing ? "Rota atualizada" : "Rota cadastrada" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-route">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Rota" : "Nova Rota"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nome da Rota</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Ex: SP-Santos" value={form.name} onChange={e => sf("name", e.target.value)} required data-testid="input-route-name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Origem</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.origin} onChange={e => sf("origin", e.target.value)} required /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Destino</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.destination} onChange={e => sf("destination", e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Estimado</label><input type="text" inputMode="decimal" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_km} onChange={e => sf("estimated_km", e.target.value)} required /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Estimadas</label><input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_hours} onChange={e => sf("estimated_hours", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_noturno} onChange={e => sf("is_noturno", e.target.checked)} className="rounded" /><span className="text-xs font-bold text-neutral-700 uppercase">Rota noturna (22h-05h)</span></label>
          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações</label><textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm" rows={2} value={form.notes} onChange={e => sf("notes", e.target.value)} /></div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-route"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Rota
          </button>
        </form>
      </div>
    </div>
  );
}

function ClientDetailView({ client, onBack }: { client: any; onBack: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ClientTab>("CONTRATO");
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingSC, setEditingSC] = useState<ServiceContract | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState<EscortContract | null>(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<EscortRoute | null>(null);
  const [osPeriod, setOsPeriod] = useState<"DAY" | "FORTNIGHT" | "MONTH">("MONTH");

  const { data: serviceContracts = [] } = useQuery<ServiceContract[]>({ queryKey: ["/api/service-contracts", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/service-contracts?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: priceContracts = [] } = useQuery<EscortContract[]>({ queryKey: ["/api/escort/contracts"] });
  const { data: clientRoutes = [] } = useQuery<EscortRoute[]>({ queryKey: ["/api/escort/routes", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/escort/routes?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: allBillings = [] } = useQuery<EscortBilling[]>({ queryKey: ["/api/escort/billings"] });

  const clientPrices = priceContracts.filter(c => c.client_id === client.id);
  const clientBillings = allBillings.filter(b => b.client_id === client.id);

  const filteredOS = (() => {
    const now = new Date();
    return clientBillings.filter(b => {
      const d = new Date(b.created_at);
      if (osPeriod === "DAY") return d.toDateString() === now.toDateString();
      if (osPeriod === "FORTNIGHT") { const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24); return diff <= 15; }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  })();

  const deleteSCMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/service-contracts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/service-contracts"] }); toast({ title: "Contrato excluído" }); },
  });

  const TABS: { id: ClientTab; label: string; icon: typeof FileText }[] = [
    { id: "CONTRATO", label: "Contrato", icon: FileText },
    { id: "TABELA", label: "Preços / Rotas", icon: DollarSign },
    { id: "RELATORIO_OS", label: "Relatório de OS", icon: BarChart3 },
  ];

  const getVigenciaStatus = (sc: ServiceContract) => {
    if (sc.status !== "Ativo") return { label: sc.status, color: "bg-neutral-100 text-neutral-500" };
    if (sc.vigencia_tipo === "indeterminado") return { label: "Vigente (Indeterminado)", color: "bg-green-100 text-green-700" };
    if (sc.vigencia_fim) {
      const fim = new Date(sc.vigencia_fim);
      const now = new Date();
      const diffDays = Math.ceil((fim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { label: "Vencido", color: "bg-red-100 text-red-700" };
      if (diffDays <= 30) return { label: `Vence em ${diffDays}d`, color: "bg-amber-100 text-amber-700" };
      return { label: "Vigente", color: "bg-green-100 text-green-700" };
    }
    return { label: "Vigente", color: "bg-green-100 text-green-700" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" data-testid="button-back-to-clients"><ChevronLeft size={20} className="text-neutral-600" /></button>
        <div>
          <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight" data-testid="text-client-name">{client.name}</h2>
          <p className="text-xs text-neutral-500">{client.cnpj || "CNPJ não cadastrado"} — Pasta do Cliente</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-client-${tab.id.toLowerCase()}`}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap flex-1 justify-center ${
                activeTab === tab.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "CONTRATO" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-neutral-500">Contratos de Prestação de Serviço com validade e controle</p>
            <Button onClick={() => { setEditingSC(null); setShowContractModal(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-service-contract"><Plus size={14} className="mr-1" /> Novo Contrato</Button>
          </div>
          {serviceContracts.length === 0 ? (
            <Card className="p-12 border-neutral-200 shadow-sm text-center"><FileText size={40} className="mx-auto text-neutral-300 mb-3" /><p className="text-sm font-bold text-neutral-400 uppercase">Nenhum contrato cadastrado para este cliente</p></Card>
          ) : serviceContracts.map(sc => {
            const vig = getVigenciaStatus(sc);
            return (
              <Card key={sc.id} className="p-5 border-neutral-200 shadow-sm" data-testid={`card-service-contract-${sc.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-black text-neutral-800 uppercase">{sc.contract_number || "Sem número"}</h4>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${vig.color}`}>{vig.label}</span>
                    </div>
                    <p className="text-[10px] text-neutral-500">Prestação de Serviços de Escolta Armada</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingSC(sc); setShowContractModal(true); }} className="p-1.5 rounded hover:bg-neutral-100"><Edit size={14} className="text-neutral-500" /></button>
                    <button onClick={() => { if (confirm("Excluir contrato?")) deleteSCMutation.mutate(sc.id); }} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Contratante</p><p className="text-xs font-bold text-neutral-800">{sc.contratante_razao || "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">CNPJ</p><p className="text-xs font-mono font-bold text-neutral-800">{sc.contratante_cnpj || "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Assinatura</p><p className="text-xs font-mono font-bold text-neutral-800">{sc.data_assinatura ? new Date(sc.data_assinatura).toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Vigência</p><p className="text-xs font-bold text-neutral-800">{sc.vigencia_tipo === "indeterminado" ? "Indeterminado" : `Até ${sc.vigencia_fim ? new Date(sc.vigencia_fim).toLocaleDateString("pt-BR") : "—"}`}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Vigilantes</p><p className="text-xs font-bold text-neutral-800">{sc.num_vigilantes}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Aviso Prévio</p><p className="text-xs font-bold text-neutral-800">{sc.aviso_previo_dias} dias</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Correção</p><p className="text-xs font-bold text-neutral-800">{sc.indice_correcao}</p></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "TABELA" && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><DollarSign size={16} /> Tabela de Preços</h3>
              <Button onClick={() => { setEditingPrice(null); setShowPriceModal(true); }} size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-price"><Plus size={14} className="mr-1" /> Nova Tabela</Button>
            </div>
            {clientPrices.length === 0 ? (
              <Card className="p-8 border-neutral-200 shadow-sm text-center"><DollarSign size={32} className="mx-auto text-neutral-300 mb-2" /><p className="text-xs font-bold text-neutral-400 uppercase">Nenhuma tabela de preços. Valores padrão serão utilizados.</p></Card>
            ) : clientPrices.map(cp => (
              <Card key={cp.id} className="p-4 border-neutral-200 shadow-sm mb-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setEditingPrice(cp); setShowPriceModal(true); }} data-testid={`card-price-${cp.id}`}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><p className="text-[9px] font-black text-blue-600 uppercase">KM Carregado</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_km_carregado))}/km</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">KM Vazio</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_km_vazio))}/km</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Estadia</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_hora_estadia))}/h</p></div>
                  <div><p className="text-[9px] font-black text-amber-600 uppercase">VRP</p><p className="text-sm font-black font-mono">{fmt(Number(cp.vrp_base))}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Franquia</p><p className="text-sm font-black font-mono">{cp.franquia_minima_km} km</p></div>
                </div>
              </Card>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><Route size={16} /> Rotas Frequentes</h3>
              <Button onClick={() => { setEditingRoute(null); setShowRouteModal(true); }} size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-route"><Plus size={14} className="mr-1" /> Nova Rota</Button>
            </div>
            {clientRoutes.length === 0 ? (
              <Card className="p-8 border-neutral-200 shadow-sm text-center"><Route size={32} className="mx-auto text-neutral-300 mb-2" /><p className="text-xs font-bold text-neutral-400 uppercase">Nenhuma rota cadastrada para este cliente</p></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clientRoutes.map(r => (
                  <Card key={r.id} className="p-4 border-neutral-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setEditingRoute(r); setShowRouteModal(true); }} data-testid={`card-route-${r.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black text-neutral-800 uppercase">{r.name}</h4>
                      {r.is_noturno && <Moon size={14} className="text-indigo-600" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-600">
                      <Navigation size={12} className="text-green-600" /><span>{r.origin}</span><ChevronRight size={12} className="text-neutral-400" /><span>{r.destination}</span>
                    </div>
                    <p className="text-[10px] font-mono font-bold text-neutral-500 mt-1">{r.estimated_km} km · {r.estimated_hours}h</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "RELATORIO_OS" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><BarChart3 size={16} /> Relatório de OS</h3>
            <div className="flex gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
              {([["DAY", "Dia"], ["FORTNIGHT", "Quinzena"], ["MONTH", "Mês"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOsPeriod(k)} data-testid={`button-period-${k.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all ${osPeriod === k ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">OS no Período</p><p className="text-2xl font-black text-neutral-900">{filteredOS.length}</p></Card>
            <Card className="p-4 text-center bg-green-50"><p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p><p className="text-xl font-black text-green-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.fat_total), 0))}</p></Card>
            <Card className="p-4 text-center bg-red-50"><p className="text-[9px] font-black text-red-700 uppercase">Operacional</p><p className="text-xl font-black text-red-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.pag_total), 0))}</p></Card>
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p><p className="text-xl font-black text-neutral-700 font-mono">{filteredOS.reduce((a, b) => a + Number(b.km_total), 0)}</p></Card>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="px-3 py-3">BO</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Rota</th>
                  <th className="px-3 py-3">KM</th>
                  <th className="px-3 py-3 text-center">Not.</th>
                  <th className="px-3 py-3 text-right">Faturamento</th>
                  <th className="px-3 py-3 text-right">Operacional</th>
                  <th className="px-3 py-3 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredOS.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-neutral-400 font-bold uppercase text-sm">Nenhuma OS neste período</td></tr>
                ) : filteredOS.map(b => (
                  <tr key={b.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-3"><span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{b.boletim_numero || "—"}</span></td>
                    <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3 text-[10px] font-bold text-neutral-600">{b.origem && b.destino ? `${b.origem}→${b.destino}` : "—"}</td>
                    <td className="px-3 py-3 text-xs font-mono font-bold">{b.km_total}</td>
                    <td className="px-3 py-3 text-center">{b.is_noturno ? <Moon size={14} className="mx-auto text-indigo-600" /> : <span className="text-neutral-300">—</span>}</td>
                    <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{fmt(Number(b.fat_total))}</td>
                    <td className="px-3 py-3 text-right font-black font-mono text-sm text-red-600">{fmt(Number(b.pag_total))}</td>
                    <td className={`px-3 py-3 text-right font-black font-mono text-sm ${Number(b.fat_total) - Number(b.pag_total) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.fat_total) - Number(b.pag_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showContractModal && <ServiceContractModal onClose={() => { setShowContractModal(false); setEditingSC(null); }} editing={editingSC} clientId={client.id} clientName={client.name} />}
      {showPriceModal && <PriceTableModal onClose={() => { setShowPriceModal(false); setEditingPrice(null); }} editing={editingPrice} clientId={client.id} clientName={client.name} />}
      {showRouteModal && <RouteFormModal onClose={() => { setShowRouteModal(false); setEditingRoute(null); }} editing={editingRoute} clientId={client.id} clientName={client.name} />}
    </div>
  );
}

export default function EscortBillingPage() {
  const { data: clients = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: serviceContracts = [] } = useQuery<ServiceContract[]>({ queryKey: ["/api/service-contracts"] });
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const getClientContractStatus = (clientId: number) => {
    const contracts = serviceContracts.filter(c => c.client_id === clientId && c.status === "Ativo");
    if (contracts.length === 0) return { label: "Sem Contrato", color: "bg-neutral-100 text-neutral-500" };
    const hasExpired = contracts.some(c => c.vigencia_tipo === "determinado" && c.vigencia_fim && new Date(c.vigencia_fim) < new Date());
    if (hasExpired) return { label: "Contrato Vencido", color: "bg-red-100 text-red-700" };
    return { label: "Contrato Ativo", color: "bg-green-100 text-green-700" };
  };

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-escort-billing">
        {!selectedClient ? (
          <>
            <div>
              <h1 className="text-2xl font-black text-neutral-900 tracking-tight uppercase" data-testid="text-page-title">Gestão de Clientes — Escolta</h1>
              <p className="text-sm text-neutral-500">Selecione um cliente para acessar contrato, tabela de preços, rotas e relatório de OS</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <Card className="p-8 col-span-full text-center"><Loader2 className="animate-spin mx-auto text-neutral-700" /></Card>
              ) : clients.length === 0 ? (
                <Card className="p-12 col-span-full text-center border-neutral-200"><Building2 size={40} className="mx-auto text-neutral-300 mb-3" /><p className="text-sm font-bold text-neutral-400 uppercase">Nenhum cliente cadastrado</p></Card>
              ) : clients.map(c => {
                const status = getClientContractStatus(c.id);
                return (
                  <Card key={c.id} onClick={() => setSelectedClient(c)} data-testid={`card-client-${c.id}`}
                    className="p-5 border-neutral-200 shadow-sm hover:shadow-lg transition-all cursor-pointer group hover:border-neutral-400">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-neutral-800 uppercase group-hover:text-black transition-colors">{c.name}</h3>
                      <ChevronRight size={16} className="text-neutral-300 group-hover:text-neutral-600 transition-colors" />
                    </div>
                    <p className="text-[10px] font-mono text-neutral-500 mb-3">{c.cnpj || "CNPJ não cadastrado"}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <ClientDetailView client={selectedClient} onBack={() => setSelectedClient(null)} />
        )}
      </div>
    </AdminLayout>
  );
}
