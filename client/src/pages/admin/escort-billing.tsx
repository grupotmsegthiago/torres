import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator, DollarSign, Truck, Clock, Moon, AlertTriangle,
  Save, Loader2, MapPin, Shield, FileText, BarChart3, Plus, X, Eye,
  ArrowDownCircle, ArrowUpCircle, Settings, Route, Printer,
  Navigation, ChevronRight, Building2, User,
} from "lucide-react";

const fmt = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

type Tab = "CALCULADORA" | "FATURAMENTOS" | "CONTRATOS" | "ROTAS" | "RELATORIO";

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

interface EscortBilling {
  id: string; client_id: number | null; client_name: string | null;
  km_inicial: number; km_final: number; km_carregado: number; km_vazio: number;
  km_total: number; horas_missao: number; is_noturno: boolean;
  fat_total: number; pag_total: number; status: string;
  vigilante_name: string | null; created_at: string;
  boletim_numero: string | null; boletim_gerado: boolean;
  origem: string | null; destino: string | null;
  placa_viatura: string | null; placa_escoltado: string | null;
  motorista_escoltado: string | null;
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
      return apiRequest("POST", "/api/escort/contracts", { ...payload, status: "Ativo" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/contracts"] });
      toast({ title: editing ? "Contrato atualizado" : "Contrato criado" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const sf = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-contract">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Contrato" : "Novo Contrato — Tabela de Preços"}</h3>
          <button onClick={onClose} data-testid="button-close-contract"><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cliente</label>
            <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white font-bold" value={form.client_id} onChange={e => { sf("client_id", e.target.value); const c = clients.find((c:any) => c.id.toString() === e.target.value); if(c) sf("client_name", c.name); }} data-testid="select-contract-client">
              <option value="">Padrão (sem cliente)</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Faturamento ao Cliente (Tabela de Preços)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Carregado</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_carregado} onChange={e => sf("valor_km_carregado", e.target.value)} data-testid="input-km-carregado" /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Vazio</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_vazio} onChange={e => sf("valor_km_vazio", e.target.value)} data-testid="input-km-vazio" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Franquia KM</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.franquia_minima_km} onChange={e => sf("franquia_minima_km", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Hora Estadia</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_hora_estadia} onChange={e => sf("valor_hora_estadia", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$ Diária</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_diaria} onChange={e => sf("valor_diaria", e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest flex items-center gap-1"><User size={12} /> Pagamento Operacional (Vigilante)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">VRP Base (R$)</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vrp_base} onChange={e => sf("vrp_base", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Limite Horas (peric.)</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.periculosidade_horas_limite} onChange={e => sf("periculosidade_horas_limite", e.target.value)} /></div>
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
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-contract"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Contrato / Tabela de Preços
          </button>
        </form>
      </div>
    </div>
  );
}

function RouteFormModal({ onClose, editing, clients }: { onClose: () => void; editing: EscortRoute | null; clients: any[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    client_id: editing?.client_id?.toString() || "",
    name: editing?.name || "",
    origin: editing?.origin || "",
    destination: editing?.destination || "",
    estimated_km: editing?.estimated_km?.toString() || "",
    estimated_hours: editing?.estimated_hours?.toString() || "0",
    is_noturno: editing?.is_noturno || false,
    notes: editing?.notes || "",
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const client = clients.find((c: any) => c.id.toString() === form.client_id);
      const payload = {
        client_id: form.client_id ? parseInt(form.client_id) : null,
        client_name: client?.name || null,
        name: form.name,
        origin: form.origin,
        destination: form.destination,
        estimated_km: parseFloat(form.estimated_km),
        estimated_hours: parseFloat(form.estimated_hours || "0"),
        is_noturno: form.is_noturno,
        notes: form.notes || null,
      };
      if (editing) return apiRequest("PUT", `/api/escort/routes/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/routes", { ...payload, status: "Ativo" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/routes"] });
      toast({ title: editing ? "Rota atualizada" : "Rota cadastrada" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const sf = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-route">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Rota" : "Nova Rota Frequente"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cliente</label>
            <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white font-bold" value={form.client_id} onChange={e => sf("client_id", e.target.value)} data-testid="select-route-client">
              <option value="">Todos os clientes</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nome da Rota</label>
            <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Ex: SP-Santos, SP-Campinas" value={form.name} onChange={e => sf("name", e.target.value)} required data-testid="input-route-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Origem</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.origin} onChange={e => sf("origin", e.target.value)} required data-testid="input-route-origin" /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Destino</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.destination} onChange={e => sf("destination", e.target.value)} required data-testid="input-route-destination" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Estimado</label><input type="number" step="0.1" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_km} onChange={e => sf("estimated_km", e.target.value)} required data-testid="input-route-km" /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Estimadas</label><input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_hours} onChange={e => sf("estimated_hours", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_noturno} onChange={e => sf("is_noturno", e.target.checked)} className="rounded" />
            <span className="text-xs font-bold text-neutral-700 uppercase">Rota noturna (22h-05h)</span>
          </label>
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

function BoletimModal({ billing, onClose }: { billing: EscortBilling; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Boletim ${billing.boletim_numero}</title><style>
      body { font-family: 'Inter', Arial, sans-serif; padding: 30px; color: #1a1a1a; }
      h1 { font-size: 18px; text-transform: uppercase; letter-spacing: 3px; border-bottom: 3px solid #000; padding-bottom: 10px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 15px 0; }
      .field { padding: 8px; background: #f5f5f5; border-radius: 4px; }
      .field label { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #888; display: block; }
      .field span { font-size: 14px; font-weight: 700; font-family: monospace; }
      .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
      .section h3 { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #555; margin-bottom: 10px; }
      .total { font-size: 20px; font-weight: 900; font-family: monospace; }
      .green { color: #15803d; } .red { color: #b91c1c; }
      .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 15px; }
      .sig { display: flex; justify-content: space-between; margin-top: 60px; }
      .sig-line { width: 200px; border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      @media print { body { padding: 15px; } }
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-boletim">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">Boletim de Missão — {billing.boletim_numero || "Pendente"}</h3>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-black" data-testid="button-print-boletim"><Printer size={12} /> Imprimir</button>
            <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
          </div>
        </div>
        <div ref={printRef} className="p-6">
          <h1 style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: 3, borderBottom: "3px solid #000", paddingBottom: 10, fontWeight: 900 }}>
            Torres Vigilância Patrimonial — Boletim de Missão
          </h1>
          <p style={{ fontSize: 10, color: "#888", margin: "5px 0 15px" }}>CNPJ: 36.982.392/0001-89 | {billing.boletim_numero} | Emissão: {new Date().toLocaleDateString("pt-BR")}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "15px 0" }}>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Cliente</label><span style={{ fontSize: 14, fontWeight: 700 }}>{billing.client_name || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Vigilante</label><span style={{ fontSize: 14, fontWeight: 700 }}>{billing.vigilante_name || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Origem</label><span style={{ fontSize: 14, fontWeight: 700 }}>{billing.origem || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Destino</label><span style={{ fontSize: 14, fontWeight: 700 }}>{billing.destino || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Placa Viatura</label><span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{billing.placa_viatura || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Placa Escoltado</label><span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{billing.placa_escoltado || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Motorista Escoltado</label><span style={{ fontSize: 14, fontWeight: 700 }}>{billing.motorista_escoltado || "—"}</span></div>
            <div style={{ padding: 8, background: "#f5f5f5", borderRadius: 4 }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Data</label><span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{new Date(billing.created_at).toLocaleDateString("pt-BR")}</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, margin: "15px 0" }}>
            <div style={{ padding: 10, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>KM Inicial</label><span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace" }}>{billing.km_inicial}</span></div>
            <div style={{ padding: 10, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>KM Final</label><span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace" }}>{billing.km_final}</span></div>
            <div style={{ padding: 10, background: "#e0e7ff", borderRadius: 8, textAlign: "center" }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#4338ca", display: "block" }}>KM Total</label><span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "#4338ca" }}>{billing.km_total}</span></div>
            <div style={{ padding: 10, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}><label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#888", display: "block" }}>Horas</label><span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace" }}>{billing.horas_missao}h</span></div>
          </div>

          {billing.is_noturno && <div style={{ padding: 8, background: "#eef2ff", borderRadius: 8, border: "1px solid #c7d2fe", marginBottom: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#4338ca" }}>Missão Noturna — Adicionais aplicados</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, margin: "20px 0" }}>
            <div style={{ padding: 15, border: "2px solid #bbf7d0", borderRadius: 12, background: "#f0fdf4" }}>
              <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, color: "#15803d", marginBottom: 10 }}>Faturamento ao Cliente</h3>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: "#15803d" }}>{fmt(Number(billing.fat_total))}</span>
            </div>
            <div style={{ padding: 15, border: "2px solid #fecaca", borderRadius: 12, background: "#fef2f2" }}>
              <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, color: "#b91c1c", marginBottom: 10 }}>Pagamento Operacional</h3>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: "#b91c1c" }}>{fmt(Number(billing.pag_total))}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 60 }}>
            <div style={{ width: 200, borderTop: "1px solid #000", paddingTop: 5, textAlign: "center", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Responsável Operacional</div>
            <div style={{ width: 200, borderTop: "1px solid #000", paddingTop: 5, textAlign: "center", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Vigilante</div>
          </div>
          <div style={{ marginTop: 30, textAlign: "center", fontSize: 10, color: "#999", borderTop: "1px solid #ddd", paddingTop: 15 }}>
            Torres Vigilância Patrimonial LTDA — CNPJ 36.982.392/0001-89 — Documento gerado automaticamente
          </div>
        </div>
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
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<EscortRoute | null>(null);
  const [reportClientId, setReportClientId] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [viewBoletim, setViewBoletim] = useState<EscortBilling | null>(null);

  const [calc, setCalc] = useState({
    contract_id: "", route_id: "", km_inicial: "", km_final: "", km_vazio: "0",
    horas_missao: "", horas_estadia: "0", teve_pernoite: false,
    horario_inicio: "", horario_fim: "",
    despesas_pedagio: "0", despesas_combustivel: "0", despesas_outras: "0",
    client_name: "", vigilante_name: "",
    origem: "", destino: "", placa_viatura: "", placa_escoltado: "", motorista_escoltado: "",
  });

  const { data: contracts = [] } = useQuery<EscortContract[]>({ queryKey: ["/api/escort/contracts"] });
  const { data: billings = [], isLoading: billingsLoading } = useQuery<EscortBilling[]>({ queryKey: ["/api/escort/billings"] });
  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: routes = [] } = useQuery<EscortRoute[]>({ queryKey: ["/api/escort/routes"] });

  const scf = (k: string, v: any) => setCalc(prev => ({ ...prev, [k]: v }));

  const handleContractSelect = (contractId: string) => {
    scf("contract_id", contractId);
    if (contractId) {
      const contract = contracts.find(c => c.id === contractId);
      if (contract?.client_name) scf("client_name", contract.client_name);
    }
  };

  const handleRouteSelect = (routeId: string) => {
    scf("route_id", routeId);
    if (routeId) {
      const route = routes.find(r => r.id === routeId);
      if (route) {
        setCalc(prev => ({
          ...prev,
          route_id: routeId,
          origem: route.origin,
          destino: route.destination,
          horas_missao: route.estimated_hours?.toString() || prev.horas_missao,
          horario_inicio: route.is_noturno ? "22:00" : prev.horario_inicio,
        }));
        if (route.client_id) {
          const contract = contracts.find(c => c.client_id === route.client_id);
          if (contract) scf("contract_id", contract.id);
        }
      }
    }
  };

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
    onSuccess: async (res) => { const data = await res.json(); setCalcResult(data); },
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
        route_id: calc.route_id || null,
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
        origem: calc.origem || null, destino: calc.destino || null,
        placa_viatura: calc.placa_viatura || null, placa_escoltado: calc.placa_escoltado || null,
        motorista_escoltado: calc.motorista_escoltado || null,
      });
    },
    onSuccess: async (res) => {
      const saved = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      toast({ title: `Boletim ${saved.boletim_numero} gerado com sucesso!` });
      setCalcResult(null);
      setViewBoletim(saved);
      setCalc(prev => ({ ...prev, km_inicial: "", km_final: "", km_vazio: "0", horas_missao: "", horas_estadia: "0", teve_pernoite: false, horario_inicio: "", horario_fim: "", despesas_pedagio: "0", despesas_combustivel: "0", despesas_outras: "0", vigilante_name: "", origem: "", destino: "", placa_viatura: "", placa_escoltado: "", motorista_escoltado: "", route_id: "" }));
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const gerarBoletimMutation = useMutation({
    mutationFn: (billingId: string) => apiRequest("POST", `/api/escort/billings/${billingId}/gerar-boletim`),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/escort/billings"] });
      toast({ title: `Boletim ${data.boletim_numero} gerado!` });
      setViewBoletim(data);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const loadReport = async () => {
    if (!reportClientId) return;
    try {
      const res = await apiRequest("GET", `/api/escort/relatorio/${reportClientId}`);
      const data = await res.json();
      setReportData(data);
    } catch (err: any) { toast({ title: "Erro ao carregar relatório", description: err.message, variant: "destructive" }); }
  };

  const TABS: { id: Tab; label: string; icon: typeof Calculator }[] = [
    { id: "CALCULADORA", label: "Boletim", icon: Calculator },
    { id: "FATURAMENTOS", label: "Histórico", icon: FileText },
    { id: "CONTRATOS", label: "Clientes/Preços", icon: Building2 },
    { id: "ROTAS", label: "Rotas", icon: Route },
    { id: "RELATORIO", label: "Relatório", icon: BarChart3 },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-escort-billing">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight uppercase" data-testid="text-page-title">Motor de Cálculo de Escolta</h1>
            <p className="text-sm text-neutral-500">Boletim de missão, faturamento, tabela de preços por cliente e rotas frequentes</p>
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
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><Building2 size={14} /> Cliente e Rota</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Contrato / Tabela de Preços</label>
                    <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-xs bg-white font-bold" value={calc.contract_id} onChange={e => handleContractSelect(e.target.value)} data-testid="select-calc-contract">
                      <option value="">Valores Padrão</option>
                      {contracts.filter(c => c.status === "Ativo").map(c => <option key={c.id} value={c.id}>{c.client_name || "Contrato Geral"} — {fmt(Number(c.valor_km_carregado))}/km</option>)}
                    </select>
                  </div>
                  {calc.contract_id && (() => { const c = contracts.find(x => x.id === calc.contract_id); return c ? (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-1">
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Tabela do Cliente</p>
                      <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-neutral-600">
                        <span>KM: {fmt(Number(c.valor_km_carregado))}</span>
                        <span>Estadia: {fmt(Number(c.valor_hora_estadia))}/h</span>
                        <span>VRP: {fmt(Number(c.vrp_base))}</span>
                      </div>
                    </div>
                  ) : null; })()}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Rota Frequente (preenche auto)</label>
                    <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-xs bg-white font-bold" value={calc.route_id} onChange={e => handleRouteSelect(e.target.value)} data-testid="select-calc-route">
                      <option value="">Sem rota pré-cadastrada</option>
                      {routes.filter(r => r.status === "Ativo").map(r => <option key={r.id} value={r.id}>{r.name} — {r.origin} → {r.destination} ({r.estimated_km} km)</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Origem</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={calc.origem} onChange={e => scf("origem", e.target.value)} data-testid="input-calc-origem" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Destino</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={calc.destino} onChange={e => scf("destino", e.target.value)} data-testid="input-calc-destino" /></div>
                  </div>
                </div>
              </Card>

              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><MapPin size={14} /> KM e Veículos</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Inicial</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_inicial} onChange={e => scf("km_inicial", e.target.value)} data-testid="input-calc-km-ini" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Final</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_final} onChange={e => scf("km_final", e.target.value)} data-testid="input-calc-km-fim" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Vazio</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.km_vazio} onChange={e => scf("km_vazio", e.target.value)} data-testid="input-calc-km-vazio" /></div>
                  </div>
                  {parseFloat(calc.km_final || "0") > 0 && parseFloat(calc.km_final || "0") < parseFloat(calc.km_inicial || "0") && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200"><AlertTriangle size={14} className="text-red-600" /><span className="text-[10px] font-bold text-red-700 uppercase">KM final não pode ser menor que KM inicial</span></div>
                  )}
                  {parseFloat(calc.km_final || "0") - parseFloat(calc.km_inicial || "0") > 500 && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200"><AlertTriangle size={14} className="text-amber-600" /><span className="text-[10px] font-bold text-amber-700 uppercase">Diferença &gt; 500 KM — Foto do hodômetro obrigatória</span></div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Placa Viatura</label><input type="text" maxLength={8} className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold uppercase" placeholder="ABC1D23" value={calc.placa_viatura} onChange={e => scf("placa_viatura", e.target.value)} data-testid="input-placa-viatura" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Placa Escoltado</label><input type="text" maxLength={8} className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold uppercase" placeholder="XYZ4E56" value={calc.placa_escoltado} onChange={e => scf("placa_escoltado", e.target.value)} data-testid="input-placa-escoltado" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Motorista</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={calc.motorista_escoltado} onChange={e => scf("motorista_escoltado", e.target.value)} data-testid="input-motorista" /></div>
                  </div>
                </div>
              </Card>

              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><Clock size={14} /> Tempo e Horário</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Missão</label><input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horas_missao} onChange={e => scf("horas_missao", e.target.value)} data-testid="input-calc-horas" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Estadia</label><input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horas_estadia} onChange={e => scf("horas_estadia", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horário Início</label><input type="time" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horario_inicio} onChange={e => scf("horario_inicio", e.target.value)} data-testid="input-calc-hora-ini" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horário Fim</label><input type="time" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.horario_fim} onChange={e => scf("horario_fim", e.target.value)} data-testid="input-calc-hora-fim" /></div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={calc.teve_pernoite} onChange={e => scf("teve_pernoite", e.target.checked)} className="rounded" data-testid="checkbox-pernoite" /><span className="text-xs font-bold text-neutral-700 uppercase">Pernoite (diária)</span></label>
                </div>
              </Card>

              <Card className="p-5 border-neutral-200 shadow-sm">
                <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><DollarSign size={14} /> Despesas</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Pedágio</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_pedagio} onChange={e => scf("despesas_pedagio", e.target.value)} data-testid="input-calc-pedagio" /></div>
                  <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Combustível</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_combustivel} onChange={e => scf("despesas_combustivel", e.target.value)} /></div>
                  <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Outras</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={calc.despesas_outras} onChange={e => scf("despesas_outras", e.target.value)} /></div>
                </div>
              </Card>

              <Button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending || !calc.km_inicial || !calc.km_final}
                className="w-full bg-neutral-900 hover:bg-black text-white font-black uppercase text-xs tracking-widest py-6" data-testid="button-calculate">
                {calcMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : <Calculator size={18} className="mr-2" />}
                Calcular Boletim de Missão
              </Button>
            </div>

            <div className="space-y-4">
              {calcResult ? (
                <>
                  <Card className="p-5 border-neutral-200 shadow-sm" data-testid="panel-calc-result">
                    <h3 className="text-xs font-black text-neutral-700 uppercase mb-4 flex items-center gap-2"><Truck size={14} /> Resumo da Missão</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="p-3 bg-neutral-50 rounded-lg text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p><p className="text-lg font-black font-mono text-neutral-900">{calcResult.km_total}</p></div>
                      <div className="p-3 bg-blue-50 rounded-lg text-center"><p className="text-[9px] font-black text-blue-600 uppercase">Carregado</p><p className="text-lg font-black font-mono text-blue-700">{calcResult.km_carregado}</p></div>
                      <div className="p-3 bg-neutral-50 rounded-lg text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">Vazio</p><p className="text-lg font-black font-mono text-neutral-600">{calcResult.km_vazio}</p></div>
                      <div className="p-3 bg-neutral-50 rounded-lg text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">Faturado</p><p className="text-lg font-black font-mono text-neutral-900">{calcResult.km_faturado}</p></div>
                    </div>
                    {calcResult.is_noturno && <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200 mb-3"><Moon size={14} className="text-indigo-600" /><span className="text-[10px] font-bold text-indigo-700 uppercase">Missão Noturna — Adicionais aplicados</span></div>}
                    {calcResult.pag_periculosidade > 0 && <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200 mb-3"><Shield size={14} className="text-amber-600" /><span className="text-[10px] font-bold text-amber-700 uppercase">Periculosidade — Missão excedeu limite de horas</span></div>}
                    {calcResult.require_photo && <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200"><AlertTriangle size={14} className="text-red-600" /><span className="text-[10px] font-bold text-red-700 uppercase">Foto do hodômetro obrigatória (&gt;500 KM)</span></div>}
                  </Card>

                  <Card className="p-5 border-green-200 bg-green-50/30 shadow-sm" data-testid="panel-faturamento-cliente">
                    <h3 className="text-xs font-black text-green-700 uppercase mb-4 flex items-center gap-2"><ArrowUpCircle size={14} /> Faturamento ao Cliente</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>KM Faturado</span><span className="font-mono">{fmt(calcResult.fat_km)}</span></div>
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Estadia</span><span className="font-mono">{fmt(calcResult.fat_estadia)}</span></div>
                      {calcResult.fat_pernoite > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Pernoite</span><span className="font-mono">{fmt(calcResult.fat_pernoite)}</span></div>}
                      {calcResult.fat_adicional_noturno > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700"><span>Adicional Noturno (KM +15%)</span><span className="font-mono">{fmt(calcResult.fat_adicional_noturno)}</span></div>}
                      {calcResult.pag_reembolsos > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Reembolsos</span><span className="font-mono">{fmt(calcResult.pag_reembolsos)}</span></div>}
                      <div className="border-t border-green-200 pt-2 flex justify-between text-sm font-black text-green-700"><span>TOTAL FATURAMENTO</span><span className="font-mono text-lg">{fmt(calcResult.fat_total)}</span></div>
                    </div>
                  </Card>

                  <Card className="p-5 border-red-200 bg-red-50/30 shadow-sm" data-testid="panel-pagamento-vigilante">
                    <h3 className="text-xs font-black text-red-700 uppercase mb-4 flex items-center gap-2"><ArrowDownCircle size={14} /> Pagamento Operacional</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-neutral-600"><span>VRP Base</span><span className="font-mono">{fmt(calcResult.pag_vrp)}</span></div>
                      {calcResult.pag_periculosidade > 0 && <div className="flex justify-between text-xs font-bold text-amber-700"><span>Periculosidade (+30%)</span><span className="font-mono">{fmt(calcResult.pag_periculosidade)}</span></div>}
                      {calcResult.pag_adicional_noturno > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700"><span>Adicional Noturno (+20% VRP)</span><span className="font-mono">{fmt(calcResult.pag_adicional_noturno)}</span></div>}
                      {calcResult.pag_reembolsos > 0 && <div className="flex justify-between text-xs font-bold text-neutral-600"><span>Reembolsos</span><span className="font-mono">{fmt(calcResult.pag_reembolsos)}</span></div>}
                      <div className="border-t border-red-200 pt-2 flex justify-between text-sm font-black text-red-700"><span>TOTAL OPERACIONAL</span><span className="font-mono text-lg">{fmt(calcResult.pag_total)}</span></div>
                    </div>
                  </Card>

                  <Card className={`p-4 border-2 shadow-sm ${calcResult.fat_total - calcResult.pag_total >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-neutral-700 uppercase">Lucro Bruto da Missão</span>
                      <span className={`text-xl font-black font-mono ${calcResult.fat_total - calcResult.pag_total >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(calcResult.fat_total - calcResult.pag_total)}</span>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Vigilante</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Nome do vigilante" value={calc.vigilante_name} onChange={e => scf("vigilante_name", e.target.value)} data-testid="input-vigilante" /></div>
                    <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cliente (nome)</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Nome do cliente" value={calc.client_name} onChange={e => scf("client_name", e.target.value)} data-testid="input-client-name" /></div>
                  </div>

                  <Button onClick={() => saveBillingMutation.mutate()} disabled={saveBillingMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs tracking-widest py-4" data-testid="button-save-billing">
                    {saveBillingMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                    Gerar Boletim de Missão
                  </Button>
                </>
              ) : (
                <Card className="p-12 border-neutral-200 shadow-sm text-center">
                  <Calculator size={48} className="mx-auto text-neutral-300 mb-4" />
                  <p className="text-sm font-bold text-neutral-400 uppercase">Preencha os dados e clique em Calcular</p>
                  <p className="text-[10px] text-neutral-400 mt-2">Selecione um cliente para auto-preencher a tabela de preços.</p>
                  <p className="text-[10px] text-neutral-400">Selecione uma rota frequente para auto-preencher origem/destino.</p>
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
                    <th className="px-3 py-3">Boletim</th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Rota</th>
                    <th className="px-3 py-3">KM</th>
                    <th className="px-3 py-3 text-center">Not.</th>
                    <th className="px-3 py-3 text-right">Fatur.</th>
                    <th className="px-3 py-3 text-right">Oper.</th>
                    <th className="px-3 py-3 text-right">Lucro</th>
                    <th className="px-3 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {billingsLoading ? (
                    <tr><td colSpan={10} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-neutral-700" /></td></tr>
                  ) : billings.length === 0 ? (
                    <tr><td colSpan={10} className="p-12 text-center text-neutral-400 font-bold uppercase italic text-sm">Nenhum boletim registrado.</td></tr>
                  ) : billings.map(b => (
                    <tr key={b.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-3 py-3">
                        {b.boletim_numero ? (
                          <span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{b.boletim_numero}</span>
                        ) : (
                          <span className="text-[10px] font-bold text-neutral-300 uppercase">Pendente</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-3 text-xs font-bold text-neutral-800 uppercase">{b.client_name || "—"}</td>
                      <td className="px-3 py-3 text-[10px] font-bold text-neutral-500">{b.origem && b.destino ? `${b.origem}→${b.destino}` : "—"}</td>
                      <td className="px-3 py-3 text-xs font-mono font-bold">{b.km_total}</td>
                      <td className="px-3 py-3 text-center">{b.is_noturno ? <Moon size={14} className="mx-auto text-indigo-600" /> : <span className="text-neutral-300">—</span>}</td>
                      <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{fmt(Number(b.fat_total))}</td>
                      <td className="px-3 py-3 text-right font-black font-mono text-sm text-red-600">{fmt(Number(b.pag_total))}</td>
                      <td className={`px-3 py-3 text-right font-black font-mono text-sm ${Number(b.fat_total) - Number(b.pag_total) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.fat_total) - Number(b.pag_total))}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!b.boletim_gerado && (
                            <button onClick={() => gerarBoletimMutation.mutate(b.id)} disabled={gerarBoletimMutation.isPending}
                              className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors" data-testid={`button-gerar-bo-${b.id}`}>
                              BO
                            </button>
                          )}
                          {b.boletim_gerado && (
                            <button onClick={() => setViewBoletim(b)} className="text-[10px] font-black text-neutral-600 hover:text-neutral-800 uppercase bg-neutral-100 hover:bg-neutral-200 px-2 py-1 rounded transition-colors" data-testid={`button-view-bo-${b.id}`}>
                              <Eye size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {billings.length > 0 && (
              <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center text-xs font-bold text-neutral-500 uppercase">
                <span>{billings.length} boletim(ns)</span>
                <span className="font-mono font-black text-green-600">Total Faturado: {fmt(billings.reduce((a, b) => a + Number(b.fat_total), 0))}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === "CONTRATOS" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-neutral-500">Cadastre a tabela de preços de cada cliente. Os valores são usados automaticamente ao gerar boletins.</p>
              <Button onClick={() => { setEditingContract(null); setShowContractForm(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-contract"><Plus size={14} className="mr-1" /> Novo Cliente / Tabela</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contracts.map(c => (
                <Card key={c.id} className="p-5 border-neutral-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setEditingContract(c); setShowContractForm(true); }} data-testid={`card-contract-${c.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black text-neutral-800 uppercase">{c.client_name || "Contrato Padrão"}</h4>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${c.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{c.status}</span>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg mb-2">
                    <p className="text-[9px] font-black text-blue-700 uppercase mb-1">Faturamento ao Cliente</p>
                    <div className="space-y-0.5 text-[10px] font-bold text-neutral-600">
                      <div className="flex justify-between"><span>KM Carregado</span><span className="font-mono text-neutral-800">{fmt(Number(c.valor_km_carregado))}/km</span></div>
                      <div className="flex justify-between"><span>KM Vazio</span><span className="font-mono text-neutral-800">{fmt(Number(c.valor_km_vazio))}/km</span></div>
                      <div className="flex justify-between"><span>Franquia</span><span className="font-mono text-neutral-800">{c.franquia_minima_km} km</span></div>
                      <div className="flex justify-between"><span>Estadia</span><span className="font-mono text-neutral-800">{fmt(Number(c.valor_hora_estadia))}/h</span></div>
                    </div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <p className="text-[9px] font-black text-amber-700 uppercase mb-1">Pagamento Vigilante</p>
                    <div className="space-y-0.5 text-[10px] font-bold text-neutral-600">
                      <div className="flex justify-between"><span>VRP Base</span><span className="font-mono text-neutral-800">{fmt(Number(c.vrp_base))}</span></div>
                      <div className="flex justify-between"><span>Periculosidade</span><span className="font-mono text-neutral-800">{c.adicional_periculosidade_pct}% &gt;{c.periculosidade_horas_limite}h</span></div>
                      <div className="flex justify-between"><span>Noturno</span><span className="font-mono text-neutral-800">{c.adicional_noturno_vrp_pct}% VRP / {c.adicional_noturno_km_pct}% KM</span></div>
                    </div>
                  </div>
                </Card>
              ))}
              {contracts.length === 0 && (
                <Card className="p-8 border-neutral-200 shadow-sm col-span-full text-center">
                  <Settings size={32} className="mx-auto text-neutral-300 mb-3" />
                  <p className="text-sm font-bold text-neutral-400 uppercase">Nenhum cliente cadastrado</p>
                  <p className="text-[10px] text-neutral-400 mt-1">Cadastre clientes com suas tabelas de preços. Sem cadastro, valores padrão serão utilizados.</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "ROTAS" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-neutral-500">Rotas frequentes com KM estimado. Selecione no boletim para preencher automaticamente.</p>
              <Button onClick={() => { setEditingRoute(null); setShowRouteForm(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-route"><Plus size={14} className="mr-1" /> Nova Rota</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {routes.map(r => (
                <Card key={r.id} className="p-5 border-neutral-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setEditingRoute(r); setShowRouteForm(true); }} data-testid={`card-route-${r.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black text-neutral-800 uppercase">{r.name}</h4>
                    {r.is_noturno && <Moon size={14} className="text-indigo-600" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-600 mb-2">
                    <Navigation size={12} className="text-green-600" />
                    <span>{r.origin}</span>
                    <ChevronRight size={12} className="text-neutral-400" />
                    <span>{r.destination}</span>
                  </div>
                  <div className="flex gap-4 text-[10px] font-bold text-neutral-500">
                    <span className="font-mono">{r.estimated_km} km</span>
                    {r.estimated_hours > 0 && <span className="font-mono">{r.estimated_hours}h</span>}
                    {r.client_name && <span className="text-blue-600">{r.client_name}</span>}
                  </div>
                </Card>
              ))}
              {routes.length === 0 && (
                <Card className="p-8 border-neutral-200 shadow-sm col-span-full text-center">
                  <Route size={32} className="mx-auto text-neutral-300 mb-3" />
                  <p className="text-sm font-bold text-neutral-400 uppercase">Nenhuma rota cadastrada</p>
                  <p className="text-[10px] text-neutral-400 mt-1">Cadastre rotas frequentes para agilizar a criação de boletins</p>
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
                <Button onClick={loadReport} disabled={!reportClientId} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-load-report"><Eye size={14} className="mr-1" /> Gerar</Button>
              </div>
            </Card>
            {reportData && (
              <Card className="p-6 border-neutral-200 shadow-sm" data-testid="panel-report">
                <div className="flex items-center justify-between mb-4">
                  <div><h3 className="text-sm font-black text-neutral-900 uppercase">{reportData.client_name}</h3><p className="text-[10px] font-bold text-neutral-400 uppercase">{reportData.periodo}</p></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-neutral-50 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">Missões</p><p className="text-2xl font-black text-neutral-900">{reportData.totais.total_missoes}</p></div>
                  <div className="p-4 bg-green-50 rounded-xl text-center"><p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p><p className="text-xl font-black text-green-700 font-mono">{fmt(reportData.totais.total_faturamento)}</p></div>
                  <div className="p-4 bg-red-50 rounded-xl text-center"><p className="text-[9px] font-black text-red-700 uppercase">Operacional</p><p className="text-xl font-black text-red-700 font-mono">{fmt(reportData.totais.total_pagamento_operacional)}</p></div>
                  <div className={`p-4 rounded-xl text-center ${reportData.totais.lucro_bruto >= 0 ? "bg-green-50" : "bg-red-50"}`}><p className="text-[9px] font-black text-neutral-400 uppercase">Lucro Bruto</p><p className={`text-xl font-black font-mono ${reportData.totais.lucro_bruto >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(reportData.totais.lucro_bruto)}</p></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p><p className="text-lg font-black font-mono text-neutral-700">{reportData.totais.total_km}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Pedágios</p><p className="text-lg font-black font-mono text-neutral-700">{fmt(reportData.totais.total_pedagio)}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Combustível</p><p className="text-lg font-black font-mono text-neutral-700">{fmt(reportData.totais.total_combustivel)}</p></div>
                  <div className="p-3 bg-indigo-50 rounded-lg"><p className="text-[9px] font-black text-indigo-700 uppercase">Missões Noturnas</p><p className="text-lg font-black text-indigo-700">{reportData.totais.missoes_noturnas}</p></div>
                </div>
              </Card>
            )}
          </div>
        )}

        {showContractForm && <ContractFormModal onClose={() => { setShowContractForm(false); setEditingContract(null); }} editing={editingContract} clients={clients} />}
        {showRouteForm && <RouteFormModal onClose={() => { setShowRouteForm(false); setEditingRoute(null); }} editing={editingRoute} clients={clients} />}
        {viewBoletim && <BoletimModal billing={viewBoletim} onClose={() => setViewBoletim(null)} />}
      </div>
    </AdminLayout>
  );
}
