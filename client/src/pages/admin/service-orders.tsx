import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, authFetch, queryClient, getQueryFn, invalidateRelatedQueries } from "@/lib/queryClient";
import { titleCase, parseBRL, maskBRL, formatDateBRT } from "@/lib/utils";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, X, Pencil, Trash2, Play, Package, Car, Satellite, Camera, Shield, User, MapPin, Download, FileText, ChevronRight, ChevronLeft, ExternalLink, Navigation, Clock, DollarSign, Eye, Undo2, Check, Timer, Search, Wrench, Save, AlertTriangle, Loader2, Calendar, Filter, RotateCcw, Mail } from "lucide-react";
import { PlacesAutocomplete, calculateRouteInfo, type RouteInfo } from "@/components/places-autocomplete";
import type { ServiceOrder, Client, Employee, Vehicle, WeaponKit, WeaponKitItem, Weapon, MissionCost } from "@shared/schema";

type EnrichedKit = WeaponKit & { items: (WeaponKitItem & { weapon: Weapon | null })[] };

type StepLogEntry = { step: string; completedAt: string; agentName?: string; agentId?: number; geo?: { lat: number; lng: number } | null; nextStep?: string };

function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const safe = ensureUTC(iso) || iso;
  const d = new Date(safe);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "";
  const sp = d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return sp.replace(" ", "T").slice(0, 16);
}

function localInputToUtc(localValue: string): string | null {
  if (!localValue) return null;
  const parts = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (parts) return `${localValue}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(localValue)) return localValue;
  return localValue;
}

function getStepTime(stepLogs: StepLogEntry[] | null | undefined, stepNames: string[]): string | null {
  if (!stepLogs || !Array.isArray(stepLogs)) return null;
  for (const name of stepNames) {
    const entry = stepLogs.find((e: StepLogEntry) => e.step === name);
    if (entry?.completedAt) return entry.completedAt;
  }
  return null;
}

function ensureUTC(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const s = String(ts);
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + "-03:00";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(ensureUTC(iso)!);
    if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "—";
    return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const safe = ensureUTC(iso) || iso;
    const d = new Date(safe);
    if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "—";
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

const MISSION_STATUS_LABELS: Record<string, string> = {
  aguardando: "Missão Agendada",
  checkout_armamento: "Saída da Base",
  checkout_viatura: "Saída da Base",
  checkout_km_saida: "Saída da Base",
  em_transito_origem: "Saída da Base",
  checkin_chegada_km: "Na Origem",
  checkin_veiculo_escoltado: "Na Origem",
  checkin_dados_motorista: "Na Origem",
  iniciar_missao: "Em Missão",
  em_transito_destino: "Em Trânsito Destino",
  chegada_destino: "Chegada no Destino",
  checkout_km_final: "Término de Missão",
  checkout_viatura_retorno: "Término de Missão",
  finalizada: "Entregas Finalizadas",
  retorno_base: "Retorno à Base",
  chegada_base: "Chegada na Base",
  encerrada: "Operação Encerrada",
};

function getMissionStatusColor(status: string | null) {
  if (!status) return "bg-neutral-100 text-neutral-600";
  switch (status) {
    case "aguardando":
    case "checkout_armamento":
    case "checkout_viatura":
    case "checkout_km_saida":
      return "bg-amber-100 text-amber-700";
    case "em_transito_origem":
    case "checkin_chegada_km":
    case "checkin_veiculo_escoltado":
    case "checkin_dados_motorista":
      return "bg-cyan-100 text-cyan-700";
    case "iniciar_missao":
      return "bg-indigo-100 text-indigo-700";
    case "em_transito_destino":
      return "bg-violet-100 text-violet-700";
    case "checkout_km_final":
    case "checkout_viatura_retorno":
      return "bg-emerald-100 text-emerald-700";
    case "finalizada":
      return "bg-green-100 text-green-700";
    case "retorno_base":
      return "bg-sky-100 text-sky-700";
    case "chegada_base":
      return "bg-teal-100 text-teal-700";
    case "encerrada":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function generateNextOsNumber(existingOrders: ServiceOrder[]): string {
  let maxNum = 0;
  for (const o of existingOrders) {
    const match = o.osNumber.match(/TOR-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `TOR-${String(maxNum + 1).padStart(4, "0")}`;
}

const EXPENSE_CATEGORIES = [
  "Pedágio",
  "Combustível",
  "Alimentação",
  "Hospedagem",
  "Estacionamento",
  "Manutenção Emergencial",
  "Outro",
];

const REVENUE_CATEGORIES = [
  "Deslocamento",
  "Pernoite",
  "Hora Extra",
  "Taxa Adicional",
  "Outro",
];

function MissionCostsSection({ orderId }: { orderId: number }) {
  const { toast } = useToast();
  const { user: mcUser } = useAuth();
  const mcIsDiretoria = mcUser?.role === "diretoria";
  const [showForm, setShowForm] = useState(false);
  const [costType, setCostType] = useState<"expense" | "revenue">("expense");
  const categories = costType === "revenue" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const { data: costs = [], isLoading } = useQuery<MissionCost[]>({
    queryKey: ["/api/service-orders", orderId, "costs"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const addMutation = useMutation({
    mutationFn: async (data: { category: string; description: string; amount: string; costType: string }) => {
      return apiRequest("POST", `/api/service-orders/${orderId}/costs`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders", orderId, "costs"] });
      invalidateRelatedQueries("mission-cost");
      setCategory(EXPENSE_CATEGORIES[0]);
      setCostType("expense");
      setDescription("");
      setAmount("");
      setShowForm(false);
      toast({ title: costType === "revenue" ? "Receita adicionada" : "Custo adicionado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao adicionar custo", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (costId: number) => {
      return apiRequest("DELETE", `/api/service-orders/${orderId}/costs/${costId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders", orderId, "costs"] });
      invalidateRelatedQueries("mission-cost");
      toast({ title: "Custo removido" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover custo", description: err.message, variant: "destructive" });
    },
  });

  const totalExpenses = costs.filter(c => (c as any).costType !== "revenue").reduce((sum, c) => sum + parseBRL(c.amount), 0);
  const totalRevenue = costs.filter(c => (c as any).costType === "revenue").reduce((sum, c) => sum + parseBRL(c.amount), 0);

  const handleSubmit = () => {
    const val = parseBRL(amount);
    if (!val || val <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    addMutation.mutate({ category, description, amount: val.toFixed(2), costType });
  };

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3 mt-3" data-testid="section-mission-costs">
      <div className="flex items-center justify-between bg-neutral-900 text-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wider font-bold">Financeiro da OS</span>
        </div>
        <div className="flex items-center gap-3">
          {totalRevenue > 0 && (
            <span className="text-xs font-bold text-emerald-400">
              +R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          )}
          {totalExpenses > 0 && (
            <span className="text-xs font-bold text-red-400">
              -R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          )}
          {totalRevenue === 0 && totalExpenses === 0 && (
            <span className="text-xs text-neutral-400">R$ 0,00</span>
          )}
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md font-semibold transition-colors"
            data-testid="button-add-cost"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-3 bg-blue-50/50 border-b border-neutral-200">
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => { setCostType("expense"); setCategory(EXPENSE_CATEGORIES[0]); }}
              className={`flex-1 text-xs font-bold py-2 rounded-md border transition-colors ${costType === "expense" ? "bg-red-600 text-white border-red-600" : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"}`}
              data-testid="button-type-expense"
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => { setCostType("revenue"); setCategory(REVENUE_CATEGORIES[0]); }}
              className={`flex-1 text-xs font-bold py-2 rounded-md border transition-colors ${costType === "revenue" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"}`}
              data-testid="button-type-revenue"
            >
              Receita
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-sm border border-neutral-300 rounded-md px-2.5 py-1.5 bg-white"
                data-testid="select-cost-category"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Descrição</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                className="text-sm"
                data-testid="input-cost-description"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1 block">Valor (R$)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="text-sm"
                data-testid="input-cost-amount"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={addMutation.isPending}
                onClick={handleSubmit}
                className={`text-xs ${costType === "revenue" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-neutral-900 hover:bg-neutral-800"}`}
                data-testid="button-save-cost"
              >
                {addMutation.isPending ? "..." : "Salvar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                className="text-xs"
                data-testid="button-cancel-cost"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 text-center text-xs text-neutral-400">Carregando...</div>
      ) : costs.length === 0 ? (
        <div className="p-4 text-center text-xs text-neutral-400">Nenhum custo registrado</div>
      ) : (
        <table className="w-full text-xs" data-testid="table-mission-costs">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Tipo</th>
              <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Categoria</th>
              <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Descrição</th>
              <th className="text-right px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Valor</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {costs.map(cost => {
              const isRevenue = (cost as any).costType === "revenue";
              return (
              <tr key={cost.id} data-testid={`row-cost-${cost.id}`} className={isRevenue ? "bg-emerald-50/40" : ""}>
                <td className="px-3.5 py-2.5">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isRevenue ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {isRevenue ? "Receita" : "Despesa"}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 font-semibold text-neutral-900 text-sm">{(cost.category || "").replace("Reembolso de Pedágio", "Pedágio").replace("Pedágio Reembolso", "Pedágio")}</td>
                <td className="px-3.5 py-2.5 text-neutral-600 text-sm">{cost.description || "—"}</td>
                <td className={`px-3.5 py-2.5 text-right font-mono font-semibold text-sm ${isRevenue ? "text-emerald-700" : "text-red-700"}`}>
                  {isRevenue ? "+" : "-"}R$ {parseBRL(cost.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2.5">
                  {mcIsDiretoria && <button
                    type="button"
                    onClick={() => { if (window.confirm("Excluir este custo?")) deleteMutation.mutate(cost.id); }}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    data-testid={`button-delete-cost-${cost.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>}
                </td>
              </tr>
            );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200">
              <td colSpan={3} className="px-3.5 py-2 text-xs font-bold text-neutral-500 uppercase">Total Receitas</td>
              <td className="px-3.5 py-2 text-right font-mono font-bold text-sm text-emerald-700">+R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={3} className="px-3.5 py-2 text-xs font-bold text-neutral-500 uppercase">Total Despesas</td>
              <td className="px-3.5 py-2 text-right font-mono font-bold text-sm text-red-700">-R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
            <tr className="bg-neutral-50 border-t border-neutral-300">
              <td colSpan={3} className="px-3.5 py-2.5 text-sm font-black text-neutral-700 uppercase">Saldo Líquido</td>
              <td className={`px-3.5 py-2.5 text-right font-mono font-black text-sm ${totalRevenue - totalExpenses >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                R$ {(totalRevenue - totalExpenses).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

type StepDataEntry = {
  key: string; label: string; hasKm: boolean; kmStep: string | null;
  timestamp: string | null; km: number | null; agentName: string | null;
};

type StepAdjustmentHandle = {
  hasPendingChanges: () => boolean;
  savePending: () => Promise<{ ok: boolean; changes: number }>;
};

function StepAdjustmentSection({ orderId, osNumber, onRegisterHandle }: { orderId: number; osNumber: string; onRegisterHandle?: (h: StepAdjustmentHandle) => void }) {
  const { toast } = useToast();
  const [editedSteps, setEditedSteps] = useState<Record<string, { timestamp?: string; km?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: stepData, isLoading, refetch } = useQuery<{ steps: StepDataEntry[] }>({
    queryKey: ["/api/service-orders", orderId, "step-data"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const hasChanges = Object.keys(editedSteps).length > 0;

  const buildAdjustments = () => {
    if (!stepData?.steps) return [];
    const adjustments: any[] = [];
    for (const [stepKey, edits] of Object.entries(editedSteps)) {
      const original = stepData.steps.find(s => s.key === stepKey);
      if (!original) continue;
      const adj: any = { stepKey };
      if (edits.timestamp !== undefined) {
        adj.timestamp = edits.timestamp ? localInputToUtc(edits.timestamp) : null;
      }
      if (edits.km !== undefined && original.hasKm && original.kmStep) {
        adj.km = edits.km ? Number(edits.km) : null;
        adj.kmStep = original.kmStep;
      }
      adjustments.push(adj);
    }
    return adjustments;
  };

  const doSave = async (): Promise<{ ok: boolean; changes: number }> => {
    const adjustments = buildAdjustments();
    if (adjustments.length === 0) return { ok: true, changes: 0 };
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/service-orders/${orderId}/step-adjustments`, { adjustments });
      setEditedSteps({});
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      return { ok: true, changes: adjustments.length };
    } catch (err: any) {
      setSaving(false);
      throw err;
    }
  };

  useEffect(() => {
    if (onRegisterHandle) {
      onRegisterHandle({ hasPendingChanges: () => Object.keys(editedSteps).length > 0, savePending: doSave });
    }
  });

  const handleSave = async () => {
    try {
      const result = await doSave();
      if (result.changes > 0) {
        toast({ title: "Ajustes salvos", description: `${result.changes} alteração(ões) registrada(s) com auditoria` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar ajustes", description: err.message, variant: "destructive" });
    }
  };

  const getVal = (stepKey: string, field: "timestamp" | "km", original: string | number | null) => {
    const edited = editedSteps[stepKey];
    if (edited && edited[field] !== undefined) return edited[field]!;
    if (field === "timestamp" && original) {
      return utcToLocalInput(original as string);
    }
    if (field === "km" && original !== null && original !== undefined) return String(original);
    return "";
  };

  const setStepField = (stepKey: string, field: "timestamp" | "km", value: string) => {
    setEditedSteps(prev => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="border-t border-neutral-100 pt-4">
        <div className="flex items-center gap-2 text-neutral-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando etapas...
        </div>
      </div>
    );
  }

  if (!stepData?.steps?.length) return null;

  return (
    <div className="border-t border-neutral-100 pt-4" data-testid="section-step-adjustment">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-600" />
          <span className="text-xs uppercase tracking-wide text-neutral-600 font-bold">Ajuste de Etapas e KMs</span>
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Admin</Badge>
        </div>
        {(hasChanges || saveSuccess) && (
          <Button
            type="button"
            size="sm"
            disabled={saving || saveSuccess}
            onClick={handleSave}
            className={`gap-1.5 text-xs h-7 ${saveSuccess ? "bg-green-600 hover:bg-green-600 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}`}
            data-testid="button-save-step-adjustments"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saveSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {saving ? "Salvando..." : saveSuccess ? "Salvo!" : "Salvar Ajustes"}
          </Button>
        )}
      </div>

      {hasChanges && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-800">
            Alterações manuais serão registradas com auditoria. O faturamento será recalculado automaticamente se houver boletim vinculado.
          </span>
        </div>
      )}

      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs" data-testid="table-step-adjustments">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold w-[180px]">Etapa</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Data / Hora</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold w-[120px]">KM</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold w-[120px]">Agente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {stepData.steps.map(s => {
              const tsVal = getVal(s.key, "timestamp", s.timestamp);
              const kmVal = getVal(s.key, "km", s.km);
              const tsChanged = editedSteps[s.key]?.timestamp !== undefined;
              const kmChanged = editedSteps[s.key]?.km !== undefined;
              return (
                <tr key={s.key} className={tsChanged || kmChanged ? "bg-amber-50/50" : ""}>
                  <td className="px-3 py-2 font-medium text-neutral-800 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.timestamp ? "bg-emerald-500" : "bg-neutral-300"}`} />
                      {s.label}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="datetime-local"
                      value={tsVal}
                      onChange={(e) => setStepField(s.key, "timestamp", e.target.value)}
                      className={`w-full text-xs border rounded px-2 py-1.5 font-mono ${tsChanged ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"}`}
                      data-testid={`input-step-time-${s.key}`}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {s.hasKm ? (
                      <input
                        type="number"
                        value={kmVal}
                        onChange={(e) => setStepField(s.key, "km", e.target.value)}
                        placeholder="—"
                        className={`w-full text-xs border rounded px-2 py-1.5 font-mono text-right ${kmChanged ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"}`}
                        data-testid={`input-step-km-${s.key}`}
                      />
                    ) : (
                      <span className="text-neutral-300 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-neutral-500 truncate max-w-[120px]">
                    {s.agentName || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AcceptanceStatusSection({ orderId }: { orderId: number }) {
  const { data: acceptances = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/missions", orderId, "acceptances"],
  });

  if (isLoading) return <div className="py-2"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;
  if (acceptances.length === 0) return null;

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    aceito: { bg: "bg-green-100", text: "text-green-800", label: "✅ Aceito" },
    recusado: { bg: "bg-red-100", text: "text-red-800", label: "🔴 Recusado" },
    expirado: { bg: "bg-yellow-100", text: "text-yellow-800", label: "⏰ Expirado" },
    pendente: { bg: "bg-neutral-100", text: "text-neutral-600", label: "🟡 Pendente" },
  };

  return (
    <div className="mt-3 border border-neutral-200 rounded-xl p-3 bg-neutral-50/50" data-testid="section-acceptance-status">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-600">Status de Aceite da Missão</span>
      </div>
      <div className="space-y-2">
        {acceptances.map((a: any) => {
          const cfg = statusConfig[a.status] || statusConfig.pendente;
          return (
            <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-neutral-100" data-testid={`acceptance-agent-${a.employee_id}`}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                  {(a.employeeName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900">{a.employeeName}</p>
                  {a.responded_at && (
                    <p className="text-[10px] text-neutral-400">
                      {new Date(a.responded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${cfg.bg} ${cfg.text} hover:${cfg.bg} text-[10px]`}>{cfg.label}</Badge>
                {a.status === "recusado" && a.notes && (
                  <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={a.notes}>{a.notes}</span>
                )}
                {a.status === "aceito" && a.location_lat && (
                  <span className="text-[10px] text-green-500" title={`GPS: ${a.location_lat}, ${a.location_lng}`}>📍</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderForm({ order, clients, employees, vehicles, kits, onClose, allOrders, prefilledVehicleId, prefilledScheduled, billings }: {
  order?: ServiceOrder; clients: Client[]; employees: Employee[]; vehicles: Vehicle[]; kits: EnrichedKit[]; onClose: () => void; allOrders: ServiceOrder[]; prefilledVehicleId?: number | null; prefilledScheduled?: boolean; billings?: any[];
}) {
  const { toast } = useToast();
  const { user: formUser } = useAuth();
  const formIsAdmin = formUser?.role === "admin" || formUser?.role === "diretoria";
  const [step, setStep] = useState(order ? 3 : 1);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [tollInfo, setTollInfo] = useState<{ totalIdaVolta: number; totalIda?: number; count: number; loading: boolean; source?: string; plazas?: Array<{ id: string; name: string; road: string; city: string; state: string; price: number; type: string; distFromOriginKm: number }>; routeDistanceKm?: number } | null>(null);
  const stepAdjHandleRef = useRef<StepAdjustmentHandle | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const nowLocal = () => utcToLocalInput(new Date().toISOString());

  const { data: escortContracts = [] } = useQuery<{ id: string; client_id: number | null; name: string | null; status: string | null }[]>({
    queryKey: ["/api/escort/contracts"],
  });

  const { data: osCosts = [] } = useQuery<MissionCost[]>({
    queryKey: ["/api/service-orders", order?.id, "costs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!order?.id,
  });
  const pedagioAutoSum = osCosts
    .filter(c => {
      const cat = ((c as any).category || "").toLowerCase();
      return (cat.includes("pedágio") || cat.includes("pedagio")) && (c as any).costType !== "revenue";
    })
    .reduce((sum, c) => sum + parseBRL(c.amount), 0);

  const [form, setForm] = useState({
    osNumber: order?.osNumber || generateNextOsNumber(allOrders),
    clientId: order?.clientId || 0,
    escortContractId: (order as any)?.escortContractId || "",
    type: "escolta",
    description: order?.description || "",
    status: (order?.status === "concluida" ? "concluída" : order?.status) || "agendada",
    priority: order?.priority || "agendada",
    scheduledDate: utcToLocalInput(order?.scheduledDate),
    missionStartedAt: utcToLocalInput(order?.missionStartedAt),
    completedDate: utcToLocalInput(order?.completedDate),
    assignedEmployeeId: order?.assignedEmployeeId || null,
    assignedEmployee2Id: order?.assignedEmployee2Id || null,
    vehicleId: order?.vehicleId || prefilledVehicleId || null,
    kitId: order?.kitId || null,
    route: (order as any)?.route || "",
    origin: (order as any)?.origin || "",
    originLat: (order as any)?.originLat || null,
    originLng: (order as any)?.originLng || null,
    destination: (order as any)?.destination || "",
    destinationLat: (order as any)?.destinationLat || null,
    destinationLng: (order as any)?.destinationLng || null,
    requesterName: (order as any)?.requesterName || "",
    escortedDriverName: (order as any)?.escortedDriverName || "",
    escortedDriverPhone: (order as any)?.escortedDriverPhone || "",
    escortedVehiclePlate: (order as any)?.escortedVehiclePlate || "",
    notes: order?.notes || "",
    valorEstimado: (order as any)?.valorEstimado ? Number((order as any).valorEstimado).toFixed(2).replace(".", ",") : "",
    pedagioEstimado: (order as any)?.pedagioEstimado ? Number((order as any).pedagioEstimado).toFixed(2).replace(".", ",") : "",
    pedagioIdaVolta: !!(order as any)?.pedagioIdaVolta,
    waypoints: ((order as any)?.waypoints || []) as Array<{ address: string; lat: number | null; lng: number | null }>,
  });

  const clientContracts = escortContracts.filter(c => c.client_id === form.clientId && c.status === "Ativo");

  useEffect(() => {
    if (!order && form.clientId > 0 && !form.escortContractId) {
      const cc = escortContracts.filter(c => c.client_id === form.clientId && c.status === "Ativo");
      if (cc.length === 1) {
        setForm(prev => ({ ...prev, escortContractId: cc[0].id }));
      }
    }
  }, [form.clientId, escortContracts]);

  useEffect(() => {
    if (form.escortContractId && !form.valorEstimado) {
      const contract = escortContracts.find(c => c.id === form.escortContractId);
      if (contract) {
        const acion = Number(contract.valor_acionamento || 0);
        const kmVal = Number(contract.valor_km_carregado || 0);
        const franquia = Number(contract.franquia_minima_km || contract.franquia_km || 0);
        const estimado = acion + (kmVal * franquia);
        if (estimado > 0) {
          setForm(prev => prev.valorEstimado ? prev : { ...prev, valorEstimado: estimado.toFixed(2).replace(".", ",") });
        }
      }
    }
  }, [form.escortContractId]);

  const handlePriorityChange = (priority: string) => {
    const updates: any = { priority };
    if (priority === "imediata") {
      updates.scheduledDate = nowLocal();
    }
    setForm({ ...form, ...updates });
  };

  const calcTolls = async (orig: string, dest: string) => {
    setTollInfo({ totalIdaVolta: 0, count: 0, loading: true });
    try {
      const resp = await apiRequest("POST", "/api/calculate-tolls", {
        origin: orig,
        destination: dest,
        originLat: originCoords?.lat || null,
        originLng: originCoords?.lng || null,
        destLat: destCoords?.lat || null,
        destLng: destCoords?.lng || null,
      });
      const data = await resp.json();
      const totalIda = Number(data.totalIda || 0);
      const totalIdaVolta = Number(data.totalIdaVolta || 0);
      setTollInfo({
        totalIdaVolta: totalIdaVolta,
        totalIda,
        count: data.count || 0,
        loading: false,
        source: data.source || "unknown",
        plazas: data.plazas || [],
        routeDistanceKm: data.routeDistanceKm || 0,
      });
      if (totalIda > 0) {
        setForm(prev => ({
          ...prev,
          pedagioEstimado: totalIda.toFixed(2).replace(".", ","),
        }));
      }
    } catch {
      setTollInfo({ totalIdaVolta: 0, count: 0, loading: false });
    }
  };

  const calcRoute = async (orig: string, dest: string) => {
    if (!orig.trim() || !dest.trim()) { setRouteInfo(null); setTollInfo(null); return; }
    const routeStr = `${orig.trim()} → ${dest.trim()}`;
    setForm(prev => ({
      ...prev,
      route: routeStr,
      origin: orig.trim(),
      originLat: originCoords?.lat || null,
      originLng: originCoords?.lng || null,
      destination: dest.trim(),
      destinationLat: destCoords?.lat || null,
      destinationLng: destCoords?.lng || null,
    }));
    setCalculatingRoute(true);
    try {
      const [info] = await Promise.all([
        calculateRouteInfo(orig.trim(), dest.trim()),
        calcTolls(orig.trim(), dest.trim()),
      ]);
      setRouteInfo(info);
    } catch {
      setRouteInfo(null);
    }
    setCalculatingRoute(false);
  };

  const handleOriginSelect = (p: { lat: number; lng: number }, address: string) => {
    setOriginCoords({ lat: p.lat, lng: p.lng });
    const newForm = { ...form, origin: address, originLat: p.lat, originLng: p.lng };
    setForm(newForm);
    if (form.destination) calcRoute(address, form.destination);
  };

  const handleDestSelect = (p: { lat: number; lng: number }, address: string) => {
    setDestCoords({ lat: p.lat, lng: p.lng });
    const newForm = { ...form, destination: address, destinationLat: p.lat, destinationLng: p.lng };
    setForm(newForm);
    if (form.origin) calcRoute(form.origin, address);
  };

  useEffect(() => {
    if (order && (order as any).origin && (order as any).destination && !routeInfo) {
      calcRoute((order as any).origin, (order as any).destination);
    }
  }, []);

  const googleMapsUrl = form.route ? `https://www.google.com/maps/dir/${encodeURIComponent(form.route.replace(" → ", "/"))}` : null;

  const buildPayload = (data: any, forceReassign = false) => ({
    ...data,
    clientId: Number(data.clientId),
    assignedEmployeeId: data.assignedEmployeeId ? Number(data.assignedEmployeeId) : null,
    assignedEmployee2Id: data.assignedEmployee2Id ? Number(data.assignedEmployee2Id) : null,
    vehicleId: data.vehicleId ? Number(data.vehicleId) : null,
    kitId: data.kitId ? Number(data.kitId) : null,
    escortContractId: data.escortContractId || null,
    scheduledDate: localInputToUtc(data.scheduledDate),
    ...(data.missionStartedAt && !(order && order.missionStatus && order.missionStatus !== "aguardando" && order.missionStartedAt) ? { missionStartedAt: localInputToUtc(data.missionStartedAt) } : {}),
    ...(data.completedDate ? { completedDate: localInputToUtc(data.completedDate) } : {}),
    valorEstimado: data.valorEstimado ? Number(String(data.valorEstimado).replace(",", ".")) : null,
    pedagioEstimado: pedagioAutoSum > 0 ? pedagioAutoSum : (data.pedagioEstimado ? Number(String(data.pedagioEstimado).replace(",", ".")) : null),  // Always IDA value only
    pedagioIdaVolta: !!data.pedagioIdaVolta,
    ...(forceReassign ? { _forceReassign: true } : {}),
  });

  const [pendingReassignData, setPendingReassignData] = useState<any>(null);

  const invalidateAll = () => {
    invalidateRelatedQueries("service-order");
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (order && stepAdjHandleRef.current?.hasPendingChanges()) {
        try {
          await stepAdjHandleRef.current.savePending();
        } catch (err: any) {
          throw new Error(`Erro ao sincronizar etapas com Supabase: ${err.message}`);
        }
      }
      const forceReassign = data._forceReassign === true;
      const payload = buildPayload(data, forceReassign);
      if (order) {
        const res = await authFetch(`/api/service-orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          const body = await res.json();
          if (body.code === "REASSIGN_IN_PROGRESS") {
            throw { reassignConflict: true, message: body.message, data };
          }
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Erro ao salvar OS");
        }
      } else {
        payload.missionStatus = "aguardando";
        await apiRequest("POST", "/api/service-orders", payload);
      }
    },
    onSuccess: () => {
      invalidateAll();
      setSaveSuccess(true);
      toast({ title: order ? "OS atualizada com sucesso" : "OS criada com sucesso", description: order && stepAdjHandleRef.current ? "Dados de etapas e KMs sincronizados" : undefined });
      setTimeout(() => { setSaveSuccess(false); onClose(); }, 1200);
    },
    onError: (err: any) => {
      if (err.reassignConflict) {
        setPendingReassignData(err.data);
        return;
      }
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const forceReassignMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = buildPayload(data, true);
      if (!order) return;
      const res = await authFetch(`/api/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Erro ao salvar OS");
      }
    },
    onSuccess: () => {
      invalidateAll();
      setPendingReassignData(null);
      setSaveSuccess(true);
      toast({ title: "Equipe reatribuída", description: "Registros de missão migrados para a nova equipe." });
      setTimeout(() => { setSaveSuccess(false); onClose(); }, 1200);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao reatribuir", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!form.vehicleId || order) return;
    const vehicle = vehicles.find(v => v.id === form.vehicleId);
    if (!vehicle) return;
    const plate = vehicle.plate?.toUpperCase().trim();
    if (!plate) return;
    const matchedKit = kits.find(k => {
      const desc = (k.description || "").toUpperCase();
      return desc.includes(plate);
    });
    if (matchedKit && matchedKit.id !== form.kitId) {
      setForm(prev => ({ ...prev, kitId: matchedKit.id }));
    }
  }, [form.vehicleId, kits, vehicles]);

  const emp1 = form.assignedEmployeeId ? employees.find(e => e.id === form.assignedEmployeeId) : null;
  const emp2 = form.assignedEmployee2Id ? employees.find(e => e.id === form.assignedEmployee2Id) : null;
  const sv = form.vehicleId ? vehicles.find(v => v.id === form.vehicleId) : null;
  const selectedKit = form.kitId ? kits.find(k => k.id === form.kitId) : null;
  const photos = sv ? [
    { label: "Dianteira", src: sv.photoFront },
    { label: "Lateral Esq.", src: sv.photoLeft },
    { label: "Traseira", src: sv.photoRear },
    { label: "Lateral Dir.", src: sv.photoRight },
  ].filter(p => p.src) : [];
  const trackerLabel = sv?.trackerType === "truckscontrol" ? "TrucksControl" : sv?.trackerType === "custom" ? "OnixSat" : null;

  const step1Valid = form.clientId > 0;

  function isDocExpiringSoon(dateStr: string | null | undefined): "expired" | "warning" | "ok" {
    if (!dateStr) return "ok";
    const parts = dateStr.split("-");
    const expiryDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return "expired";
    if (diffDays < 30) return "warning";
    return "ok";
  }

  function validateAgentDocs(emp: Employee | null | undefined, label: string): { missing: string[]; expired: string[] } {
    const missing: string[] = [];
    const expired: string[] = [];
    if (!emp) return { missing, expired };
    if (!emp.cnhNumber) missing.push(`CNH (número) de ${label}`);
    if (!emp.cnhExpiry) missing.push(`Validade da CNH de ${label}`);
    if (!emp.cnvNumber) missing.push(`CNV (número) de ${label}`);
    if (!emp.cnvExpiry) missing.push(`Validade da CNV de ${label}`);
    if (isDocExpiringSoon(emp.cnhExpiry) === "expired") expired.push(`CNH de ${label}`);
    if (isDocExpiringSoon(emp.cnvExpiry) === "expired") expired.push(`CNV de ${label}`);
    return { missing, expired };
  }

  const step2Valid = true;

  const SectionHeader = ({ icon: Icon, title, extra }: { icon: any; title: string; extra?: any }) => (
    <div className="bg-neutral-900 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-white/70" />
        <span className="font-bold text-xs text-white tracking-wide uppercase">{title}</span>
      </div>
      {extra}
    </div>
  );
  const InfoCell = ({ label, children, className = "" }: { label: string; children: any; className?: string }) => (
    <div className={`px-3.5 py-3 ${className}`}>
      <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">{label}</span>
      <span className="text-sm font-semibold text-neutral-900">{children}</span>
    </div>
  );
  const FieldLabel = ({ children }: { children: any }) => (
    <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">{children}</label>
  );
  const selectClass = "w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200";

  const StepIndicator = () => (
    <div className="flex items-center gap-1.5 px-5 py-3 bg-neutral-50 border-b border-neutral-200">
      {[
        { n: 1, label: "Dados da OS" },
        { n: 2, label: "Agentes" },
        { n: 3, label: "Equipamento" },
      ].map((s, i) => (
        <div key={s.n} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-300 mx-0.5" />}
          <button
            type="button"
            onClick={() => { if (order || (s.n <= step)) setStep(s.n); }}
            className={`text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg transition-all duration-200 ${
              step === s.n ? "bg-neutral-900 text-white shadow-sm" : s.n < step ? "text-neutral-600 hover:bg-neutral-100 cursor-pointer" : "text-neutral-300 cursor-default"
            }`}
          >
            {s.n}. {s.label}
          </button>
        </div>
      ))}
    </div>
  );

  const AgentSection = ({ emp, label }: { emp: Employee | null | undefined; label: string }) => {
    if (!emp) return null;
    const photoUrl = (emp as any).photoUrl;
    return (
      <div className="border border-neutral-200 rounded-lg overflow-hidden" data-testid={`section-agent-${label.toLowerCase()}`}>
        <SectionHeader icon={User} title={`Agente: ${emp.name.split(" ")[0].toUpperCase()}`} />
        <div className="flex">
          {photoUrl && (
            <div className="w-28 shrink-0 border-r border-neutral-100 bg-neutral-50 flex items-center justify-center p-2">
              <img src={photoUrl} alt={emp.name} className="w-24 h-28 object-cover rounded-lg border border-neutral-200" data-testid={`img-agent-photo-${label}`} />
            </div>
          )}
          <div className="flex-1">
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="Nome" className="md:col-span-2 border-r border-neutral-100">{emp.name}</InfoCell>
              <InfoCell label="CPF" className="border-r border-neutral-100">{emp.cpf || "—"}</InfoCell>
              <InfoCell label="RG">{emp.rg || "—"}</InfoCell>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="Contato" className="border-r border-neutral-100">{emp.phone || "—"}</InfoCell>
              <InfoCell label="CNH" className="border-r border-neutral-100">{emp.cnhNumber || "—"}</InfoCell>
              <InfoCell label="Val. CNH" className="border-r border-neutral-100">
                <span className="flex items-center gap-1.5">
                  {emp.cnhExpiry ? formatDateBRT(emp.cnhExpiry) : "—"}
                  {isDocExpiringSoon(emp.cnhExpiry) === "expired" && <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-cnh-expired-${label}`}>Vencida</Badge>}
                  {isDocExpiringSoon(emp.cnhExpiry) === "warning" && <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[10px] px-1.5 py-0" data-testid={`badge-cnh-warning-${label}`}>Vence em breve</Badge>}
                </span>
              </InfoCell>
              <InfoCell label="Matrícula">{emp.matricula}</InfoCell>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
              <InfoCell label="CNV" className="border-r border-neutral-100">{emp.cnvNumber || "—"}</InfoCell>
              <InfoCell label="Val. CNV" className="border-r border-neutral-100">
                <span className="flex items-center gap-1.5">
                  {emp.cnvExpiry ? formatDateBRT(emp.cnvExpiry) : "—"}
                  {isDocExpiringSoon(emp.cnvExpiry) === "expired" && <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-cnv-expired-${label}`}>Vencida</Badge>}
                  {isDocExpiringSoon(emp.cnvExpiry) === "warning" && <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[10px] px-1.5 py-0" data-testid={`badge-cnv-warning-${label}`}>Vence em breve</Badge>}
                </span>
              </InfoCell>
              <InfoCell label="Colete" className="border-r border-neutral-100">{(emp as any).vestNumber || "—"}</InfoCell>
              <InfoCell label="Proteção / Val.">{(emp as any).vestProtection || "—"}{(emp as any).vestExpiry ? ` · ${formatDateBRT((emp as any).vestExpiry)}` : ""}</InfoCell>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white mb-6" data-testid="card-order-form">
      <div className="bg-neutral-900 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-white/60" />
            <h2 className="text-lg font-bold text-white tracking-wider uppercase">
              {order ? "Editar OS" : "Nova Ordem de Serviço"}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-white/70 font-semibold uppercase tracking-wide">Escolta Armada</span>
            {form.route && (
              <span className="text-xs text-white/50 flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                {form.route}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white/90 tracking-wider">{form.osNumber}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {!order && <StepIndicator />}

      {order && (() => {
        const isConcluida = order.status === "concluida" || order.status === "concluída";
        if (!isConcluida || order.type !== "escolta") return null;
        const bill = billings?.find((b: any) => b.service_order_id === order.id);
        const alerts: string[] = [];
        if (!bill) { alerts.push("Faturamento não gerado para esta OS"); }
        else {
          if (!bill.km_inicial || bill.km_inicial <= 0) alerts.push("KM inicial ausente no faturamento");
          if (!bill.km_final || bill.km_final <= 0) alerts.push("KM final ausente no faturamento");
          if (bill.km_total <= 0 && bill.km_final > 0 && bill.km_inicial > 0) alerts.push("KM total zerado — verificar cálculo");
          if (!bill.horario_inicio) alerts.push("Horário de início ausente");
          if (!bill.horario_fim) alerts.push("Horário de fim ausente");
          if (bill.fat_total <= 0) alerts.push("Valor faturado = R$ 0,00");
        }
        if (alerts.length === 0) return null;
        return (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg" data-testid="alert-os-billing">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Dados incompletos no faturamento</p>
                <ul className="mt-1 space-y-0.5">
                  {alerts.map((a, i) => (
                    <li key={i} className="text-xs text-amber-700 flex items-center gap-1">
                      <span className="w-1 h-1 bg-amber-500 rounded-full flex-shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="p-5 space-y-4">
        {(step === 1 || !!order) && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <FieldLabel>Nº da OS</FieldLabel>
                {order ? (
              <Input value={form.osNumber} readOnly onChange={() => {}} className="text-sm bg-neutral-50 text-neutral-500 cursor-not-allowed" data-testid="input-os-number" />
            ) : (
              <Input value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} className="text-sm" data-testid="input-os-number" />
            )}
              </div>
              <div>
                <FieldLabel>Cliente *</FieldLabel>
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value), escortContractId: "" })} className={selectClass} required data-testid="select-os-client">
                  <option value={0}>Selecione...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{titleCase(c.name)}</option>)}
                </select>
              </div>
              {form.clientId > 0 && clientContracts.length > 0 && (
                <div>
                  <FieldLabel>Tabela de Preços</FieldLabel>
                  <select value={form.escortContractId} onChange={(e) => setForm({ ...form, escortContractId: e.target.value })} className={selectClass} data-testid="select-os-price-table">
                    <option value="">Selecione...</option>
                    {clientContracts.map(c => <option key={c.id} value={c.id}>{c.name || `Tabela ${c.id.slice(0, 8)}`}</option>)}
                  </select>
                </div>
              )}
              <div>
                <FieldLabel>Valor Estimado (R$)</FieldLabel>
                <Input type="text" inputMode="decimal" value={form.valorEstimado} onChange={(e) => setForm({ ...form, valorEstimado: maskBRL(e.target.value) })} placeholder="0,00" className="text-sm font-mono" data-testid="input-os-valor-estimado" />
              </div>
              <div>
                <FieldLabel>Pedágio (R$) {(pedagioAutoSum > 0 || (tollInfo && !tollInfo.loading && tollInfo.count > 0)) ? "✓ Auto" : ""}</FieldLabel>
                <div className="relative">
                  <Input type="text" readOnly value={(() => { const base = pedagioAutoSum > 0 ? pedagioAutoSum : Number(String(form.pedagioEstimado || "0").replace(",", ".")); const val = form.pedagioIdaVolta ? base * 2 : base; return val.toFixed(2).replace(".", ","); })()} className={`text-sm font-mono bg-neutral-100 cursor-not-allowed ${pedagioAutoSum > 0 || (tollInfo?.count || 0) > 0 ? "border-amber-300 bg-amber-50/30" : ""}`} data-testid="input-os-pedagio" />
                  {tollInfo?.loading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-blue-600 font-bold animate-pulse">Calculando...</span>
                  )}
                  {!tollInfo?.loading && (pedagioAutoSum > 0 || (tollInfo?.count || 0) > 0) && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-600 font-bold">{form.pedagioIdaVolta ? "IDA+VOLTA" : "SOMENTE IDA"}</span>
                  )}
                </div>
                <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" data-testid="toggle-pedagio-ida-volta">
                  <input type="checkbox" checked={form.pedagioIdaVolta} onChange={(e) => {
                    setForm({ ...form, pedagioIdaVolta: e.target.checked });
                  }} className="rounded border-neutral-300 text-blue-600 w-3.5 h-3.5" />
                  <span className="text-[10px] text-neutral-500 font-medium">Cobrar pedágio ida e volta</span>
                </label>
                {tollInfo && !tollInfo.loading && (tollInfo.plazas?.length || 0) > 0 && (
                  <div className="mt-2 border border-amber-200 rounded-lg bg-amber-50/50 p-2" data-testid="toll-breakdown">
                    <p className="text-[10px] font-bold text-amber-700 mb-1.5 flex items-center gap-1">
                      <span>PRAÇAS DE PEDÁGIO ({tollInfo.plazas!.length})</span>
                      {tollInfo.source === "google" && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">Google</span>}
                      {tollInfo.source === "local" && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded">Base Local</span>}
                    </p>
                    <div className="space-y-0.5">
                      {tollInfo.plazas!.map((p, i) => (
                        <div key={p.id || i} className="flex items-center justify-between text-[10px]">
                          <span className="text-neutral-700 truncate mr-2">
                            {p.name} <span className="text-neutral-400">({p.city}/{p.state})</span>
                          </span>
                          <span className="font-mono font-bold text-neutral-800 whitespace-nowrap">R$ {p.price.toFixed(2).replace(".", ",")}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-amber-200 flex justify-between text-[10px] font-bold">
                      <span className="text-amber-700">Total Ida</span>
                      <span className="font-mono text-amber-800">R$ {(tollInfo.totalIda || 0).toFixed(2).replace(".", ",")}</span>
                    </div>
                    {tollInfo.routeDistanceKm ? (
                      <p className="text-[9px] text-neutral-400 mt-0.5">Distância estimada: {tollInfo.routeDistanceKm} km</p>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Solicitante</FieldLabel>
                <Input value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} placeholder="Nome do solicitante" className="text-sm" data-testid="input-os-requester" />
              </div>
              <div>
                <FieldLabel>Prioridade</FieldLabel>
                <select value={form.priority} onChange={(e) => handlePriorityChange(e.target.value)} className={selectClass} data-testid="select-os-priority">
                  <option value="imediata">Imediata</option>
                  <option value="agendada">Agendada</option>
                  <option value="reaproveitamento">Reaproveitamento</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {order && (
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass} data-testid="select-os-status">
                    <option value="agendada">Agendada</option>
                    <option value="aberta">Aberta</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluída">Concluída</option>
                    <option value="cancelada">Cancelada</option>
                    <option value="recusada">Recusada</option>
                  </select>
                </div>
              )}
              <div>
                <FieldLabel>Data da Criação</FieldLabel>
                <Input type="datetime-local" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="text-sm" data-testid="input-os-scheduled" />
              </div>
              {order && (
                <div>
                  <FieldLabel>Data do Agendamento</FieldLabel>
                  <Input type="datetime-local" value={form.missionStartedAt} onChange={(e) => setForm({ ...form, missionStartedAt: e.target.value })} className="text-sm" data-testid="input-os-mission-started" />
                </div>
              )}
              {order && (
                <div>
                  <FieldLabel>Data Conclusão</FieldLabel>
                  <Input type="datetime-local" value={form.completedDate} readOnly className="text-sm bg-neutral-50 cursor-not-allowed" data-testid="input-os-completed" />
                </div>
              )}
              <div>
                <FieldLabel>Origem</FieldLabel>
                <PlacesAutocomplete
                  value={form.origin}
                  onChange={(v) => setForm({ ...form, origin: v })}
                  onPlaceSelect={(p) => handleOriginSelect(p, p.address)}
                  placeholder="Ex: Sao Paulo, SP"
                  className="text-sm"
                  theme="light"
                  data-testid="input-route-origin"
                />
              </div>
              <div>
                <FieldLabel>Destino</FieldLabel>
                <PlacesAutocomplete
                  value={form.destination}
                  onChange={(v) => setForm({ ...form, destination: v })}
                  onPlaceSelect={(p) => handleDestSelect(p, p.address)}
                  placeholder="Ex: Campinas, SP"
                  className="text-sm"
                  theme="light"
                  data-testid="input-route-destination"
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <FieldLabel>Pontos de Parada (Entregas Intermediárias)</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, waypoints: [...form.waypoints, { address: "", lat: null, lng: null }] })}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    data-testid="button-add-waypoint"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Parada
                  </button>
                </div>
                {form.waypoints.length === 0 && (
                  <p className="text-xs text-neutral-400 italic">Nenhum ponto de parada — entrega direta origem → destino</p>
                )}
                {form.waypoints.map((wp, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2" data-testid={`waypoint-row-${idx}`}>
                    <span className="text-xs font-bold text-neutral-500 w-5 shrink-0">{idx + 1}.</span>
                    <div className="flex-1">
                      <PlacesAutocomplete
                        value={wp.address}
                        onChange={(v) => {
                          const wps = [...form.waypoints];
                          wps[idx] = { ...wps[idx], address: v };
                          setForm({ ...form, waypoints: wps });
                        }}
                        onPlaceSelect={(p) => {
                          const wps = [...form.waypoints];
                          wps[idx] = { address: p.address, lat: p.lat, lng: p.lng };
                          setForm({ ...form, waypoints: wps });
                        }}
                        placeholder={`Parada ${idx + 1} — endereço de entrega`}
                        className="text-sm"
                        theme="light"
                        data-testid={`input-waypoint-${idx}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const wps = form.waypoints.filter((_, i) => i !== idx);
                        setForm({ ...form, waypoints: wps });
                      }}
                      className="p-1.5 rounded border border-neutral-200 hover:bg-red-50 transition-colors shrink-0"
                      title="Remover parada"
                      data-testid={`button-remove-waypoint-${idx}`}
                    >
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
              {form.route && (
                <div className="md:col-span-2">
                  <FieldLabel>Rota Vinculada</FieldLabel>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border border-neutral-200 rounded px-3 py-2 text-sm bg-neutral-50 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate text-neutral-800 font-medium">{form.route}</span>
                      </div>
                      {googleMapsUrl && (
                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors" title="Ver no Google Maps">
                          <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                        </a>
                      )}
                      <button type="button" onClick={() => { setForm({ ...form, route: "", origin: "", originLat: null, originLng: null, destination: "", destinationLat: null, destinationLng: null }); setRouteInfo(null); setOriginCoords(null); setDestCoords(null); }} className="p-2 rounded border border-neutral-200 hover:bg-red-50 transition-colors" title="Remover rota">
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                    {calculatingRoute && (
                      <div className="text-xs text-neutral-400 flex items-center gap-1.5">
                        <span className="animate-spin w-3 h-3 border border-neutral-300 border-t-neutral-600 rounded-full inline-block" />
                        Calculando distancia...
                      </div>
                    )}
                    {routeInfo && !calculatingRoute && (
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <span className="flex items-center gap-1 text-neutral-600 bg-neutral-100 px-2 py-1 rounded font-medium" data-testid="text-route-distance">
                          <Navigation className="w-3 h-3" />
                          {routeInfo.distanceText}
                        </span>
                        <span className="flex items-center gap-1 text-neutral-600 bg-neutral-100 px-2 py-1 rounded font-medium" data-testid="text-route-duration">
                          <Clock className="w-3 h-3" />
                          {routeInfo.durationText}
                        </span>
                        {tollInfo?.loading && (
                          <span className="flex items-center gap-1 text-neutral-400 bg-neutral-50 px-2 py-1 rounded font-medium" data-testid="text-toll-loading">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Pedágios...
                          </span>
                        )}
                        {tollInfo && !tollInfo.loading && tollInfo.totalIdaVolta > 0 && (
                          <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded font-bold border border-amber-200" data-testid="text-toll-value">
                            <DollarSign className="w-3 h-3" />
                            {tollInfo.count} pedágio(s) — R$ {tollInfo.totalIdaVolta.toFixed(2)} (ida+volta)
                          </span>
                        )}
                        {tollInfo && !tollInfo.loading && tollInfo.totalIdaVolta === 0 && (
                          <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-medium" data-testid="text-toll-free">
                            <Check className="w-3 h-3" />
                            Sem pedágio
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <FieldLabel>Motorista Escoltado</FieldLabel>
                <Input value={form.escortedDriverName} onChange={(e) => setForm({ ...form, escortedDriverName: e.target.value })} placeholder="Nome do motorista" className="text-sm" data-testid="input-os-driver-name" />
              </div>
              <div>
                <FieldLabel>Telefone do Motorista</FieldLabel>
                <Input value={form.escortedDriverPhone} onChange={(e) => setForm({ ...form, escortedDriverPhone: e.target.value })} placeholder="(11) 99999-9999" className="text-sm" data-testid="input-os-driver-phone" />
              </div>
              <div>
                <FieldLabel>Placa do Veículo Escoltado</FieldLabel>
                <Input value={form.escortedVehiclePlate} onChange={(e) => setForm({ ...form, escortedVehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC1D23" className="text-sm" data-testid="input-os-driver-plate" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <FieldLabel>Descrição / Informações Complementares</FieldLabel>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="text-sm" data-testid="input-os-description" />
              </div>
              <div>
                <FieldLabel>Observações</FieldLabel>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" data-testid="input-os-notes" />
              </div>
            </div>
          </>
        )}

        {(step === 2 || !!order) && (
          <div className={order ? "border-t border-neutral-100 pt-4" : ""}>
            {!order && (
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-neutral-500" />
                <span className="text-xs uppercase tracking-wide text-neutral-600 font-bold">Seleção de Agentes</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Agente 1</FieldLabel>
                <select value={form.assignedEmployeeId || ""} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{titleCase(emp.name)}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Agente 2</FieldLabel>
                <select value={form.assignedEmployee2Id || ""} onChange={(e) => setForm({ ...form, assignedEmployee2Id: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-employee2">
                  <option value="">Selecione...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{titleCase(emp.name)}</option>)}
                </select>
              </div>
            </div>
            {emp1 && <div className="mb-3"><AgentSection emp={emp1} label="1" /></div>}
            {emp2 && <div className="mb-3"><AgentSection emp={emp2} label="2" /></div>}
            {order && <AcceptanceStatusSection orderId={order.id} />}
          </div>
        )}

        {(step === 3 || !!order) && (
          <div className={order ? "border-t border-neutral-100 pt-4" : ""}>
            {!order && (
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-neutral-400" />
                <span className="text-xs uppercase tracking-wide text-neutral-600 font-bold">Veículo & Armamento</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Veículo</FieldLabel>
                <select value={form.vehicleId || ""} onChange={(e) => setForm({ ...form, vehicleId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-vehicle">
                  <option value="">Selecione...</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}{v.color ? ` · ${v.color}` : ""}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Kit de Armamento</FieldLabel>
                <select value={form.kitId || ""} onChange={(e) => setForm({ ...form, kitId: e.target.value ? Number(e.target.value) : null })} className={selectClass} data-testid="select-os-kit">
                  <option value="">Sem kit</option>
                  {kits.map((k) => {
                    const linkedPlate = sv?.plate?.toUpperCase().trim();
                    const isLinked = linkedPlate && (k.description || "").toUpperCase().includes(linkedPlate);
                    let emUsoLabel = "";
                    if (k.status === "em_uso" && k.id !== order?.kitId) {
                      const osHoldingKit = allOrders.find(o => o.kitId === k.id && o.id !== order?.id && (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada");
                      if (osHoldingKit) {
                        const sameTeam = form.assignedEmployeeId && osHoldingKit.assignedEmployeeId &&
                          form.assignedEmployeeId === osHoldingKit.assignedEmployeeId &&
                          (form.assignedEmployee2Id || null) === (osHoldingKit.assignedEmployee2Id || null);
                        emUsoLabel = sameTeam ? " — MESMA EQUIPE" : " — EM USO";
                      } else {
                        emUsoLabel = " — EM USO";
                      }
                    }
                    return (
                      <option key={k.id} value={k.id}>
                        {k.name} ({k.items.length} armas){isLinked ? " ★ VTR" : ""}{emUsoLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {sv && (
              <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3" data-testid="section-vehicle-info">
                <SectionHeader icon={Car} title="Viatura" extra={
                  trackerLabel && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-white/10 text-white/80 font-semibold border border-white/20">
                      <Satellite className="w-3 h-3" />
                      {trackerLabel} · {sv.truckscontrolIdentifier || sv.trackerId || sv.plate}
                    </span>
                  )
                } />
                <div className="grid grid-cols-2 md:grid-cols-5 border-b border-neutral-100">
                  <InfoCell label="Placa" className="border-r border-neutral-100">
                    <span className="tracking-[0.1em]">{sv.plate}</span>
                  </InfoCell>
                  <InfoCell label="Modelo" className="border-r border-neutral-100">{sv.brand} {sv.model}</InfoCell>
                  <InfoCell label="Cor" className="border-r border-neutral-100">{sv.color || "—"}</InfoCell>
                  <InfoCell label="Frota" className="border-r border-neutral-100">{(sv as any).frota || "—"}</InfoCell>
                  <InfoCell label="Ano">{sv.year || "—"}</InfoCell>
                </div>
                {photos.length > 0 && (
                  <div className="p-3 bg-neutral-50/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Camera className="w-3 h-3 text-neutral-400" />
                      <span className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Registro Fotográfico</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((p, i) => (
                        <div key={i} className="group">
                          <div className="aspect-[4/3] rounded overflow-hidden border border-neutral-200 bg-white">
                            <img src={p.src!} alt={p.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <span className="block text-center text-[10px] text-neutral-500 font-semibold uppercase tracking-wide mt-1.5">{p.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedKit && (
              <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3" data-testid="section-kit-info">
                <SectionHeader icon={Shield} title={selectedKit.name} extra={
                  <span className="text-xs text-white/50 font-medium">{selectedKit.items.length} arma(s)</span>
                } />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Armamento</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Calibre</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Numeração</th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Marca</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedKit.items.map(item => item.weapon ? (
                      <tr key={item.id}>
                        <td className="px-3.5 py-2.5 font-semibold text-neutral-900 text-sm">{item.weapon.type}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 font-mono text-sm">{item.weapon.caliber}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 font-mono font-semibold text-sm">{item.weapon.serialNumber}</td>
                        <td className="px-3.5 py-2.5 text-neutral-600 text-sm">{item.weapon.brand}</td>
                      </tr>
                    ) : null)}
                  </tbody>
                </table>
              </div>
            )}

            {order && <MissionCostsSection orderId={order.id} />}
            {order && formIsAdmin && <StepAdjustmentSection orderId={order.id} osNumber={order.osNumber} onRegisterHandle={(h) => { stepAdjHandleRef.current = h; }} />}
          </div>
        )}

        <div className="border-t border-neutral-100 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!order && step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="gap-1.5" data-testid="button-prev-step">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
          <div className="flex items-center gap-3">
            {!order && step < 3 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 1 && !step1Valid) {
                    toast({ title: "Selecione o cliente", variant: "destructive" });
                    return;
                  }
                  if (step === 1 && form.scheduledDate) {
                    const selected = new Date(form.scheduledDate);
                    const now = new Date();
                    now.setSeconds(0, 0);
                    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
                    if (selected < fiveMinAgo) {
                      toast({ title: "Data da Criação inválida", description: "Não é permitido criar OS com data anterior ao horário atual.", variant: "destructive" });
                      return;
                    }
                  }
                  if (step === 2) {
                    const agents = [
                      { emp: emp1, label: emp1?.name || "Agente 1" },
                      { emp: emp2, label: emp2?.name || "Agente 2" },
                    ].filter(a => a.emp);
                    const allMissing: string[] = [];
                    const allExpired: string[] = [];
                    for (const a of agents) {
                      const { missing, expired } = validateAgentDocs(a.emp, a.label);
                      allMissing.push(...missing);
                      allExpired.push(...expired);
                    }
                    if (allMissing.length > 0) {
                      toast({ title: "Dados obrigatórios faltando", description: allMissing.join(", "), variant: "destructive" });
                      return;
                    }
                    if (allExpired.length > 0) {
                      toast({ title: "Documentos vencidos", description: `${allExpired.join(", ")} — não é possível criar a OS com documentos vencidos`, variant: "destructive" });
                      return;
                    }
                  }
                  setStep(step + 1);
                }}
                className="bg-neutral-900 hover:bg-neutral-800 gap-1.5"
                data-testid="button-next-step"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" disabled={mutation.isPending || saveSuccess} onClick={() => mutation.mutate(form)} className={saveSuccess ? "bg-green-600 hover:bg-green-600 text-white gap-1.5" : "bg-neutral-900 hover:bg-neutral-800 gap-1.5"} data-testid="button-save-order">
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : null}
                {mutation.isPending ? "Salvando..." : saveSuccess ? "Salvo!" : "Salvar OS"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {pendingReassignData && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" data-testid="dialog-reassign-confirm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-neutral-900">Troca de Equipe em Missão Ativa</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Esta ação migra todos os registros para a nova equipe</p>
              </div>
            </div>
            <p className="text-sm text-neutral-700 leading-relaxed">
              Esta OS já possui registros de etapas, fotos e KM feitos pela equipe atual. 
              Ao trocar a equipe, todos esses registros serão automaticamente reatribuídos para o novo agente principal.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800 font-medium">Os dados de GPS, horários e fotos serão mantidos, apenas a autoria será alterada.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPendingReassignData(null)} data-testid="button-cancel-reassign">
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={forceReassignMutation.isPending}
                onClick={() => forceReassignMutation.mutate(pendingReassignData)}
                data-testid="button-confirm-reassign"
              >
                {forceReassignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Confirmar Troca
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function ServiceOrdersPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ServiceOrder | undefined>();
  const [prefilledVehicleId, setPrefilledVehicleId] = useState<number | null>(null);
  const [prefilledScheduled, setPrefilledScheduled] = useState(false);
  const [filterVehicleId, setFilterVehicleId] = useState<number | null>(null);
  const [searchOS, setSearchOS] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("status") || null;
  });
  const [filterAuthorizer, setFilterAuthorizer] = useState<number | null>(null);
  const [filterClient, setFilterClient] = useState<number | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<string | null>(null);
  const { toast } = useToast();
  const { data: orders = [], isLoading } = useQuery<ServiceOrder[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: kits = [] } = useQuery<EnrichedKit[]>({ queryKey: ["/api/weapon-kits"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: escortContracts = [] } = useQuery<{ id: string; client_id: number | null; name: string | null; status: string | null }[]>({ queryKey: ["/api/escort/contracts"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: allUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({ queryKey: ["/api/users"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: allBillings = [] } = useQuery<any[]>({ queryKey: ["/api/escort/billings"], queryFn: getQueryFn({ on401: "throw" }) });

  const getBillingAlerts = (o: any): string[] => {
    const isConcluida = o.status === "concluida" || o.status === "concluída";
    if (!isConcluida || o.type !== "escolta") return [];
    const alerts: string[] = [];
    const bill = allBillings.find((b: any) => b.service_order_id === o.id);
    if (!bill) { alerts.push("Sem faturamento"); return alerts; }
    if (!bill.km_inicial || bill.km_inicial <= 0) alerts.push("KM inicial ausente");
    if (!bill.km_final || bill.km_final <= 0) alerts.push("KM final ausente");
    if (bill.km_total <= 0 && bill.km_final > 0 && bill.km_inicial > 0) alerts.push("KM total zerado");
    if (!bill.horario_inicio) alerts.push("Hora início ausente");
    if (!bill.horario_fim) alerts.push("Hora fim ausente");
    if (!bill.placa_viatura) alerts.push("Placa viatura ausente");
    if (!bill.placa_escoltado && o.escortedVehiclePlate) alerts.push("Placa escoltado ausente");
    if (bill.fat_total <= 0) alerts.push("Faturamento zerado");
    return alerts;
  };
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const isAdminOrDiretoria = user?.role === "admin" || user?.role === "diretoria";
  const [editingTimeOs, setEditingTimeOs] = useState<number | null>(null);
  const [editInicioMissao, setEditInicioMissao] = useState("");
  const [editFimMissao, setEditFimMissao] = useState("");
  const [chatDispatchOs, setChatDispatchOs] = useState<ServiceOrder | null>(null);
  const [chatConversations, setChatConversations] = useState<any[]>([]);
  const [chatSelectedConv, setChatSelectedConv] = useState<string>("");
  const [chatDispatchLoading, setChatDispatchLoading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/service-orders/${id}`); },
    onSuccess: () => { invalidateRelatedQueries("service-order"); toast({ title: "OS removida" }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const sendReportEmailMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/service-orders/${id}/send-report-email`);
      return res.json();
    },
    onSuccess: (data: any) => { toast({ title: "Email enviado", description: data.message }); },
    onError: (err: Error) => toast({ title: "Erro ao enviar email", description: err.message, variant: "destructive" }),
  });

  const startMissionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/service-orders/${id}`, {
        status: "em_andamento",
        missionStatus: "aguardando",
      });
    },
    onSuccess: () => {
      invalidateRelatedQueries("service-order");
      toast({ title: "Missão iniciada — agente liberado para saída" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });


  const rollbackStepMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", "/api/mission/rollback-step", { serviceOrderId: id });
    },
    onSuccess: () => {
      invalidateRelatedQueries("service-order");
      toast({ title: "Etapa retrocedida", description: "O vigilante foi movido para a etapa anterior." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao voltar etapa", description: err.message, variant: "destructive" });
    },
  });

  const openChatDispatch = async (os: ServiceOrder) => {
    setChatDispatchOs(os);
    setChatSelectedConv("");
    try {
      const res = await authFetch("/api/chat/conversations");
      if (res.ok) {
        const convs = await res.json();
        setChatConversations(convs);
      }
    } catch { setChatConversations([]); }
  };

  const handleChatDispatch = async () => {
    if (!chatDispatchOs || !chatSelectedConv) return;
    setChatDispatchLoading(true);
    try {
      const res = await authFetch("/api/chat/send-mission-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceOrderId: chatDispatchOs.id, conversationId: chatSelectedConv }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ message: "Erro" }));
        throw new Error(d.message || "Erro ao despachar");
      }
      toast({ title: "OS enviada para o chat", description: `OS ${chatDispatchOs.osNumber} despachada com sucesso.` });
      setChatDispatchOs(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setChatDispatchLoading(false);
    }
  };

  const saveTimeMutation = useMutation({
    mutationFn: async ({ id, missionStartedAt, completedDate }: { id: number; missionStartedAt?: string | null; completedDate?: string | null }) => {
      await apiRequest("PATCH", `/api/service-orders/${id}`, { missionStartedAt, completedDate });
    },
    onSuccess: () => {
      invalidateRelatedQueries("service-order");
      setEditingTimeOs(null);
      toast({ title: "Horários atualizados" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const osId = params.get("os");
    const newOs = params.get("newOs");
    const vehicleId = params.get("vehicleId");
    if (osId && orders.length > 0) {
      const found = orders.find((o) => o.id === Number(osId));
      if (found && !editItem) {
        setEditItem(found);
        setShowForm(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    } else if (newOs === "1" && !showForm) {
      if (vehicleId) setPrefilledVehicleId(Number(vehicleId));
      if (params.get("scheduled") === "1") setPrefilledScheduled(true);
      setEditItem(undefined);
      setShowForm(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (vehicleId && !newOs) {
      setFilterVehicleId(Number(vehicleId));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [orders]);

  const getClientName = (id: number) => titleCase((clients || []).find((c) => c.id === id)?.name) || "-";
  const getEmployeeName = (id: number | null) => {
    if (!id) return null;
    const name = (employees || []).find((e) => e.id === id)?.name;
    return name ? titleCase(name) : null;
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-orders-title">Ordens de Serviço</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão completa de OS</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-order">
          <Plus className="w-4 h-4 mr-2" /> Nova OS
        </Button>
      </div>

      {showForm && <OrderForm order={editItem} clients={clients || []} employees={employees || []} vehicles={vehicles || []} kits={kits || []} allOrders={orders || []} prefilledVehicleId={prefilledVehicleId} prefilledScheduled={prefilledScheduled} billings={allBillings} onClose={() => { setShowForm(false); setEditItem(undefined); setPrefilledVehicleId(null); setPrefilledScheduled(false); }} />}

      {filterVehicleId && (() => {
        const fv = vehicles.find(vv => vv.id === filterVehicleId);
        return (
          <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
            <Car className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-800">
              Filtrando OS da viatura: <span className="font-black">{fv?.plate || `#${filterVehicleId}`}</span>
              {fv ? ` — ${fv.brand} ${fv.model}` : ""}
            </span>
            <button onClick={() => setFilterVehicleId(null)} className="ml-auto text-blue-600 hover:text-blue-800 p-0.5" data-testid="button-clear-vehicle-filter">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {(() => {
        const allOrds = orders || [];
        const getOsStatus = (o: ServiceOrder) => {
          if (o.status === "cancelada") return "cancelada";
          if (o.status === "recusada") return "recusada";
          if (o.status === "concluida" || o.status === "concluída") return "concluida";
          if (o.status === "em_andamento") return "em_andamento";
          return "pendente";
        };
        const statusCounts = { pendente: 0, em_andamento: 0, concluida: 0, cancelada: 0, recusada: 0, reaproveitada: 0 };
        allOrds.forEach(o => { statusCounts[getOsStatus(o)]++; if (o.priority === "reaproveitamento") statusCounts.reaproveitada++; });
        const authorizers = [...new Map(allOrds.filter(o => (o as any).createdByUserId).map(o => {
          const uid = (o as any).createdByUserId;
          const u = allUsers.find((u: any) => u.id === uid);
          return [uid, { id: uid, name: u?.name || `User #${uid}` }];
        })).values()];
        const clientsInOrders = [...new Map(allOrds.map(o => [o.clientId, { id: o.clientId, name: getClientName(o.clientId) }])).values()];
        const hasAnyFilter = filterStatus || filterAuthorizer || filterClient || filterPeriod;

        return (
          <div className="mb-3 space-y-2" data-testid="section-filters">
            <div className="flex items-center gap-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Pesquisar por OS, cliente, agente ou autorizado por..."
                value={searchOS}
                onChange={e => setSearchOS(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                data-testid="input-search-os"
              />
              {searchOS && (
                <button onClick={() => setSearchOS("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mr-1">Status:</span>
              {([
                { key: "pendente", label: "Pendentes", color: "bg-amber-100 text-amber-800 border-amber-300", activeColor: "bg-amber-600 text-white border-amber-600" },
                { key: "em_andamento", label: "Em Andamento", color: "bg-blue-100 text-blue-800 border-blue-300", activeColor: "bg-blue-600 text-white border-blue-600" },
                { key: "concluida", label: "Concluídas", color: "bg-emerald-100 text-emerald-800 border-emerald-300", activeColor: "bg-emerald-600 text-white border-emerald-600" },
                { key: "cancelada", label: "Canceladas", color: "bg-red-100 text-red-800 border-red-300", activeColor: "bg-red-600 text-white border-red-600" },
                { key: "reaproveitada", label: "Reaprov.", color: "bg-violet-100 text-violet-800 border-violet-300", activeColor: "bg-violet-600 text-white border-violet-600" },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterStatus(filterStatus === f.key ? null : f.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${filterStatus === f.key ? f.activeColor : f.color} hover:opacity-80`}
                  data-testid={`filter-status-${f.key}`}
                >
                  {f.label}
                  <span className={`text-[10px] font-bold ${filterStatus === f.key ? "bg-white/30 text-white" : "bg-black/5"} rounded-full px-1.5 py-0 min-w-[18px] text-center`}>
                    {statusCounts[f.key]}
                  </span>
                </button>
              ))}

              <div className="w-px h-5 bg-neutral-200 mx-1" />

              <select
                value={filterClient || ""}
                onChange={e => setFilterClient(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10 max-w-[160px]"
                data-testid="filter-client"
              >
                <option value="">Todos Clientes</option>
                {clientsInOrders.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <select
                value={filterAuthorizer || ""}
                onChange={e => setFilterAuthorizer(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10 max-w-[160px]"
                data-testid="filter-authorizer"
              >
                <option value="">Autorizador</option>
                {authorizers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>

              <select
                value={filterPeriod || ""}
                onChange={e => setFilterPeriod(e.target.value || null)}
                className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-black/10"
                data-testid="filter-period"
              >
                <option value="">Período</option>
                <option value="hoje">Hoje</option>
                <option value="ontem">Ontem</option>
                <option value="semana">Esta Semana</option>
                <option value="mes">Este Mês</option>
                <option value="ano">Este Ano</option>
              </select>

              {hasAnyFilter && (
                <button
                  onClick={() => { setFilterStatus(null); setFilterAuthorizer(null); setFilterClient(null); setFilterPeriod(null); }}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 ml-1 transition-colors"
                  data-testid="button-clear-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (orders || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma OS registrada</div>
        ) : (() => {
          const getOsStatusKey = (o: ServiceOrder) => {
            if (o.status === "cancelada") return "cancelada";
            if (o.status === "recusada") return "recusada";
            if (o.status === "concluida" || o.status === "concluída") return "concluida";
            if (o.status === "em_andamento") return "em_andamento";
            return "pendente";
          };
          let filtered = filterVehicleId ? (orders || []).filter(o => o.vehicleId === filterVehicleId) : (orders || []);
          if (filterStatus) {
            if (filterStatus === "reaproveitada") {
              filtered = filtered.filter(o => o.priority === "reaproveitamento");
            } else {
              filtered = filtered.filter(o => getOsStatusKey(o) === filterStatus);
            }
          }
          if (filterClient) {
            filtered = filtered.filter(o => o.clientId === filterClient);
          }
          if (filterAuthorizer) {
            filtered = filtered.filter(o => (o as any).createdByUserId === filterAuthorizer);
          }
          if (filterPeriod) {
            const now = new Date();
            const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
            const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            let periodStart: Date;
            let periodEnd: Date;
            if (filterPeriod === "hoje") {
              periodStart = startOfDay(brNow);
              periodEnd = new Date(periodStart.getTime() + 86400000);
            } else if (filterPeriod === "ontem") {
              periodEnd = startOfDay(brNow);
              periodStart = new Date(periodEnd.getTime() - 86400000);
            } else if (filterPeriod === "semana") {
              const dayOfWeek = brNow.getDay();
              const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              periodStart = new Date(startOfDay(brNow).getTime() - diffToMonday * 86400000);
              periodEnd = new Date(periodStart.getTime() + 7 * 86400000);
            } else if (filterPeriod === "ano") {
              periodStart = new Date(brNow.getFullYear(), 0, 1);
              periodEnd = new Date(brNow.getFullYear() + 1, 0, 1);
            } else {
              periodStart = new Date(brNow.getFullYear(), brNow.getMonth(), 1);
              periodEnd = new Date(brNow.getFullYear(), brNow.getMonth() + 1, 1);
            }
            filtered = filtered.filter(o => {
              const d = o.scheduledDate ? new Date(ensureUTC(o.scheduledDate)!) : o.createdAt ? new Date(ensureUTC(o.createdAt)!) : null;
              return d && d >= periodStart && d < periodEnd;
            });
          }
          const displayOrders = searchOS.trim() ? filtered.filter(o => {
            const s = searchOS.toLowerCase();
            const authorizer = (o as any).createdByUserId ? allUsers.find((u: any) => u.id === (o as any).createdByUserId) : null;
            const authName = authorizer?.name?.toLowerCase() || "";
            const client = getClientName(o.clientId)?.toLowerCase() || "";
            const agent1 = getEmployeeName(o.assignedEmployeeId)?.toLowerCase() || "";
            const agent2 = getEmployeeName(o.assignedEmployee2Id)?.toLowerCase() || "";
            return o.osNumber.toLowerCase().includes(s) || authName.includes(s) || client.includes(s) || agent1.includes(s) || agent2.includes(s);
          }) : filtered;
          displayOrders.sort((a, b) => {
            const numA = parseInt(a.osNumber.replace(/\D/g, ""), 10) || 0;
            const numB = parseInt(b.osNumber.replace(/\D/g, ""), 10) || 0;
            return numB - numA;
          });
          if (displayOrders.length === 0) return (
            <div className="p-8 text-center text-neutral-400">Nenhuma OS encontrada com os filtros selecionados</div>
          );
          return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" data-testid="table-orders">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="w-[5%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">OS</th>
                  <th className="w-[12%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cliente</th>
                  <th className="w-[5%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tipo</th>
                  <th className="w-[7%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Prior.</th>
                  <th className="w-[8%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="w-[7%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Kit</th>
                  <th className="w-[8%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Missão</th>
                  <th className="w-[6%] text-center px-2 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap bg-blue-50">Agendado</th>
                  <th className="w-[10%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Origem</th>
                  <th className="w-[10%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Destino</th>
                  <th className="w-[6%] text-center px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Saída</th>
                  <th className="w-[6%] text-center px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Cheg. Dest.</th>
                  <th className="w-[6%] text-center px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Fim</th>
                  <th className="w-[7%] text-left px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">Autoriz.</th>
                  <th className="w-[8%] text-right px-2 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-order-${o.id}`}>
                    <td className="p-2 font-medium text-neutral-900 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {o.osNumber}
                        {(() => {
                          const alerts = getBillingAlerts(o);
                          if (alerts.length === 0) return null;
                          return (
                            <span title={alerts.join("\n")} className="cursor-help" data-testid={`alert-billing-${o.id}`}>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="p-2 overflow-hidden">
                      <span className="text-neutral-600 text-xs leading-tight line-clamp-2">{getClientName(o.clientId)}</span>
                      {(() => {
                        const cId = (o as any).escortContractId;
                        const ct = cId ? escortContracts.find(c => c.id === cId) : null;
                        return ct ? (
                          <span className="block text-[10px] text-emerald-600 font-medium mt-0.5" data-testid={`text-contract-${o.id}`}>{ct.name || "Tabela Padrão"}</span>
                        ) : (
                          <span className="block text-[10px] text-amber-500 font-medium mt-0.5">Sem tabela</span>
                        );
                      })()}
                    </td>
                    <td className="p-2 text-neutral-600 text-xs">{o.type}</td>
                    <td className="p-2">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        o.priority === "imediata" ? "bg-red-50 text-red-700 border border-red-200" :
                        o.priority === "reaproveitamento" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>{o.priority === "imediata" ? "IMEDIATA" : o.priority === "reaproveitamento" ? "REAPROV." : "AGENDADA"}</span>
                    </td>
                    <td className="p-2">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        o.status === "em_andamento" ? "bg-blue-600 text-white" :
                        o.status === "concluída" || o.status === "concluida" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        o.status === "cancelada" ? "bg-red-50 text-red-700 border border-red-200" :
                        o.status === "recusada" ? "bg-orange-50 text-orange-700 border border-orange-200" :
                        o.status === "agendada" && o.priority === "imediata" ? "bg-blue-600 text-white" :
                        o.status === "agendada" || o.status === "aberta" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }`}>{
                        o.status === "agendada" && o.priority === "imediata" ? "EM ANDAMENTO" :
                        o.status === "agendada" || o.status === "aberta" ? "PENDENTE" :
                        o.status === "em_andamento" ? "EM ANDAMENTO" :
                        o.status === "concluída" || o.status === "concluida" ? "CONCLUÍDA" :
                        o.status === "cancelada" ? "CANCELADA" :
                        o.status === "recusada" ? "RECUSADA" :
                        o.status?.toUpperCase()
                      }</span>
                    </td>
                    <td className="p-2">
                      {o.kitId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-neutral-100 text-neutral-700 rounded px-1.5 py-0.5 font-medium">
                          <Package className="w-3 h-3" />
                          {kits.find(k => k.id === o.kitId)?.name || `Kit #${o.kitId}`}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      {o.missionStatus ? (() => {
                        const displayStatus = o.missionStatus;
                        return (
                          <Badge variant="secondary" className={`text-xs ${getMissionStatusColor(displayStatus)}`} data-testid={`badge-mission-${o.id}`}>
                            {MISSION_STATUS_LABELS[displayStatus] || displayStatus}
                          </Badge>
                        );
                      })() : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center text-xs font-semibold whitespace-nowrap bg-blue-50/50" data-testid={`time-agendado-${o.id}`}>
                      {o.scheduledDate ? (() => {
                        const d = new Date(ensureUTC(o.scheduledDate)!);
                        if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "—";
                        const datePart = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
                        const [yy, mm, dd] = datePart.split("-");
                        const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                        return <div className="leading-tight"><span className="block text-[10px] text-neutral-400">{`${dd}/${mm}/${yy}`}</span><span>{hora}</span></div>;
                      })() : "—"}
                    </td>
                    <td className="p-2 text-xs text-neutral-600 truncate overflow-hidden" title={(o as any).origin || ""} data-testid={`text-origem-${o.id}`}>{(o as any).origin || "—"}</td>
                    <td className="p-2 text-xs text-neutral-600 truncate overflow-hidden" title={(o as any).destination || ""} data-testid={`text-destino-${o.id}`}>
                      {(o as any).destination || "—"}
                      {((o as any).waypoints as any[])?.length > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1" title={((o as any).waypoints as any[]).map((w: any, i: number) => `Parada ${i+1}: ${w.address}`).join("\n")}>
                          +{((o as any).waypoints as any[]).length} parada{((o as any).waypoints as any[]).length > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    {(() => {
                      const logs = o.stepLogs as StepLogEntry[] | null;
                      const tSaida = o.missionStartedAt ? new Date(ensureUTC(o.missionStartedAt)!).toISOString() : getStepTime(logs, ["checkout_km_saida", "aguardando"]);
                      const tChegDestino = getStepTime(logs, ["chegada_destino", "em_transito_destino"]);
                      const tFim = o.completedDate ? new Date(ensureUTC(o.completedDate)!).toISOString() : getStepTime(logs, ["encerrada", "finalizada", "checkout_km_final"]);
                      const isConcluida = o.status === "concluída" || o.status === "concluida" || o.missionStatus === "encerrada" || o.missionStatus === "finalizada";
                      const canEditTimes = isAdminOrDiretoria && isConcluida;
                      const isEditing = editingTimeOs === o.id;
                      return (
                        <>
                          <td className="p-2 text-center text-xs text-neutral-600 whitespace-nowrap" data-testid={`time-saida-${o.id}`}>{formatTime(tSaida)}</td>
                          <td className={`p-2 text-center text-xs whitespace-nowrap ${isEditing ? "bg-amber-50" : "text-neutral-600"}`} data-testid={`time-chegdestino-${o.id}`}>
                            {isEditing ? (
                              <input type="datetime-local" className="text-xs border rounded px-1 py-0.5 w-[140px]" value={editInicioMissao} onChange={e => setEditInicioMissao(e.target.value)} data-testid={`input-chegdestino-${o.id}`} />
                            ) : formatTime(tChegDestino)}
                          </td>
                          <td className={`p-2 text-center text-xs whitespace-nowrap ${isEditing ? "bg-amber-50" : "text-neutral-600"}`} data-testid={`time-fim-${o.id}`}>
                            {isEditing ? (
                              <input type="datetime-local" className="text-xs border rounded px-1 py-0.5 w-[140px]" value={editFimMissao} onChange={e => setEditFimMissao(e.target.value)} data-testid={`input-fim-${o.id}`} />
                            ) : formatTime(tFim)}
                          </td>
                        </>
                      );
                    })()}
                    <td className="p-2 text-left text-xs text-neutral-600 whitespace-nowrap" data-testid={`text-autorizado-${o.id}`}>{(() => {
                      const uid = (o as any).createdByUserId;
                      if (!uid) return <span className="text-neutral-400 italic">—</span>;
                      const u = allUsers.find((u: any) => u.id === uid);
                      if (!u) return <span className="text-neutral-400 italic">—</span>;
                      const isAdmin = u.role === "admin" || u.role === "diretoria";
                      return <span className={isAdmin ? "font-semibold text-neutral-800" : "text-neutral-600"}>{u.name}</span>;
                    })()}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {(o.status === "aberta" || o.status === "agendada") && !o.missionStatus && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startMissionMutation.mutate(o.id)}
                            disabled={startMissionMutation.isPending}
                            title="Iniciar Missão"
                            data-testid={`button-start-mission-${o.id}`}
                          >
                            <Play className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                        {o.missionStatus && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Voltar etapa da OS ${o.osNumber}?\nEtapa atual: ${MISSION_STATUS_LABELS[o.missionStatus] || o.missionStatus}\nO vigilante sera movido para a etapa anterior.`)) {
                                rollbackStepMutation.mutate(o.id);
                              }
                            }}
                            disabled={rollbackStepMutation.isPending}
                            title="Voltar Etapa"
                            data-testid={`button-rollback-step-${o.id}`}
                          >
                            <Undo2 className="w-4 h-4 text-orange-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={async () => {
                          try {
                            const res = await authFetch(`/api/service-orders/${o.id}/pdf`);
                            if (!res.ok) throw new Error("Falha ao gerar PDF");
                            const arrayBuffer = await res.arrayBuffer();
                            const blob = new Blob([arrayBuffer], { type: "application/pdf" });
                            const url = URL.createObjectURL(blob);
                            window.open(url, "_blank");
                            setTimeout(() => URL.revokeObjectURL(url), 10000);
                          } catch {
                            toast({ title: "Erro ao visualizar PDF", variant: "destructive" });
                          }
                        }} title="Visualizar OS" data-testid={`button-view-order-${o.id}`}><Eye className="w-4 h-4 text-blue-500" /></Button>
                        {(o.status === "concluida" || o.status === "em_andamento" || o.missionStatus === "encerrada" || o.missionStatus === "finalizada") && (
                          <Button variant="ghost" size="icon" onClick={async () => {
                            try {
                              const res = await authFetch(`/api/service-orders/${o.id}/relatorio-missao`);
                              if (!res.ok) throw new Error("Falha ao gerar relatório");
                              const arrayBuffer = await res.arrayBuffer();
                              const blob = new Blob([arrayBuffer], { type: "application/pdf" });
                              const url = URL.createObjectURL(blob);
                              window.open(url, "_blank");
                              setTimeout(() => URL.revokeObjectURL(url), 10000);
                            } catch {
                              toast({ title: "Erro ao gerar relatório", variant: "destructive" });
                            }
                          }} title="Relatório Completo da Missão" data-testid={`button-report-order-${o.id}`}><FileText className="w-4 h-4 text-emerald-500" /></Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={async () => {
                          try {
                            const res = await authFetch(`/api/service-orders/${o.id}/pdf`);
                            if (!res.ok) throw new Error("Falha ao gerar PDF");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `OS_${o.osNumber}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Erro ao baixar PDF", variant: "destructive" });
                          }
                        }} title="Baixar PDF" data-testid={`button-pdf-order-${o.id}`}><Download className="w-4 h-4 text-neutral-500" /></Button>
                        {isAdminOrDiretoria && (o.status === "concluída" || o.status === "concluida" || o.missionStatus === "encerrada" || o.missionStatus === "finalizada") && (
                          editingTimeOs === o.id ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => {
                                saveTimeMutation.mutate({
                                  id: o.id,
                                  missionStartedAt: editInicioMissao ? localInputToUtc(editInicioMissao) : undefined,
                                  completedDate: editFimMissao ? localInputToUtc(editFimMissao) : undefined,
                                });
                              }} disabled={saveTimeMutation.isPending} title="Salvar Horários" data-testid={`button-save-times-${o.id}`}><Check className="w-4 h-4 text-green-600" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingTimeOs(null)} title="Cancelar" data-testid={`button-cancel-times-${o.id}`}><X className="w-4 h-4 text-red-500" /></Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditingTimeOs(o.id);
                              const logs = o.stepLogs as StepLogEntry[] | null;
                              const tChegDest = getStepTime(logs, ["chegada_destino", "em_transito_destino"]);
                              const tFimVal = o.completedDate ? ensureUTC(o.completedDate) : getStepTime(logs, ["encerrada", "finalizada", "checkout_km_final"]);
                              setEditInicioMissao(utcToLocalInput(tChegDest));
                              setEditFimMissao(utcToLocalInput(tFimVal));
                            }} title="Editar Horários da Missão" data-testid={`button-edit-times-${o.id}`}><Timer className="w-4 h-4 text-amber-500" /></Button>
                          )
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openChatDispatch(o)} title="Enviar OS para Chat" data-testid={`button-send-chat-${o.id}`}><Shield className="w-4 h-4 text-emerald-600" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (!o.assignedEmployeeId || !o.vehicleId || !o.kitId || !o.origin || !o.destination || !o.scheduledDate) {
                            toast({ title: "Dados incompletos", description: "Preencha agente, viatura, kit, origem, destino e data para enviar o relatório.", variant: "destructive" });
                            return;
                          }
                          if (window.confirm(`Enviar Relatório de Escolta (${o.osNumber}) por email ao cliente?`)) sendReportEmailMutation.mutate(o.id);
                        }} title="Enviar Relatório por Email" data-testid={`button-send-report-${o.id}`}><Mail className="w-4 h-4 text-blue-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(o); setShowForm(true); }} data-testid={`button-edit-order-${o.id}`}><Pencil className="w-4 h-4" /></Button>
                        {isDiretoria && <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Excluir permanentemente OS ${o.osNumber}?`)) deleteMutation.mutate(o.id); }} data-testid={`button-delete-order-${o.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        })()}
      </Card>

      {chatDispatchOs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setChatDispatchOs(null)} data-testid="modal-chat-dispatch">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-600" /> Despachar OS para Chat</h3>
            <p className="text-sm text-muted-foreground mb-4">OS {chatDispatchOs.osNumber} — {chatDispatchOs.type}</p>
            <label className="text-sm font-medium mb-1 block">Selecionar Conversa</label>
            <select
              className="w-full border rounded p-2 mb-4 text-sm bg-white dark:bg-zinc-800"
              value={chatSelectedConv}
              onChange={e => setChatSelectedConv(e.target.value)}
              data-testid="select-chat-conversation"
            >
              <option value="">-- Selecione --</option>
              {chatConversations.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name || c.participantNames?.join(", ") || "Conversa"}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setChatDispatchOs(null)} data-testid="button-cancel-dispatch">Cancelar</Button>
              <Button disabled={!chatSelectedConv || chatDispatchLoading} onClick={handleChatDispatch} data-testid="button-confirm-dispatch">
                {chatDispatchLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Shield className="w-4 h-4 mr-1" />}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
