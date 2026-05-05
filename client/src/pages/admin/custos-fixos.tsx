import AdminLayout from "@/components/admin/layout";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMetaConfig, calcMeta } from "@/lib/meta-faturamento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Edit, Trash2, Calendar, DollarSign, Loader2,
  AlertCircle, Calculator, TrendingDown, Users, Briefcase, Layers,
  Target, TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import type { FixedCost } from "@shared/schema";

const CATEGORIES = [
  "Aluguel",
  "Utilidades",
  "Softwares",
  "Veiculos",
  "Telecom",
  "Marketing",
  "Servicos",
  "Outros",
];

const CATEGORY_COLORS: Record<string, string> = {
  Aluguel: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Utilidades: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Softwares: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Veiculos: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Telecom: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Marketing: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  Servicos: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Outros: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Summary {
  monthly: number;
  daily: number;
  weekly: number;
  yearly: number;
  porCategoria: Record<string, number>;
  fleetRent?: { count: number; total: number; perVehicle: number };
}

interface RHSummary {
  monthly: number;
  daily: number;
  weekly: number;
  yearly: number;
  agentCount: number;
  period: { from: string; to: string; businessDays: number; holidaysCount: number };
  breakdown: {
    base: number; encargos: number;
    vr: number; vt: number; cesta: number; outros: number; diarias: number;
    ferias: number; decimoTerceiro: number; rescisao: number; horaExtra: number; adicionalNoturno: number;
    beneficios: number;
    // Folha 2025
    salarioProporcional: number; periculosidade: number; dsr: number; ajudaCusto: number;
    totalBruto: number; inss: number; irrf: number; fgts: number;
    totalDeducoes: number; liquidoFuncionario: number;
    provisaoTercoFerias: number; provisaoFGTSsobreFerias13: number; provisaoINSSsobreFerias13: number;
    totalProvisoes: number;
  };
  porAgente: Array<{
    id: number; name: string; total: number;
    base: number; encargos: number;
    vrDiario: number; vrDias: number; vrTotal: number;
    vt: number; cesta: number; outros: number; diarias: number;
    horasMensais: number; custoHora: number;
    ferias: number; decimoTerceiro: number; rescisao: number; horaExtra: number; adicionalNoturno: number;
    semSalario?: boolean;
    // Folha 2025
    salarioProporcional: number; periculosidade: number; dsr: number; ajudaCusto: number;
    totalBruto: number; inss: number; irrf: number; fgts: number;
    totalDeducoes: number; liquidoFuncionario: number;
    provisaoTercoFerias: number; provisaoFGTSsobreFerias13: number; provisaoINSSsobreFerias13: number;
    totalProvisoes: number;
  }>;
}

interface DailyAllowance {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  amount: number;
  description: string | null;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  national: boolean;
}

interface EmployeeLite { id: number; name: string; status?: string | null; }

export default function CustosFixosPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: list = [], isLoading } = useQuery<FixedCost[]>({
    queryKey: ["/api/fixed-costs"],
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/fixed-costs/summary"],
  });

  const { data: rhSummary, isLoading: rhLoading } = useQuery<RHSummary>({
    queryKey: ["/api/fixed-costs/rh-summary"],
  });

  const totalMensal = (summary?.monthly ?? 0) + (rhSummary?.monthly ?? 0);
  const totalDiario = totalMensal / 30;
  const totalSemanal = totalDiario * 7;
  const totalAnual = totalMensal * 12;

  // === META DE FATURAMENTO (configuração compartilhada com Balanço Gerencial) ===
  const [metaCfg, setMetaCfg] = useMetaConfig();
  const meta = useMemo(() => calcMeta(totalMensal, metaCfg), [totalMensal, metaCfg]);

  // Sugestão de % de custos variáveis a partir do histórico (últimos 3 meses completos)
  const { data: varRatio } = useQuery<{
    months: number;
    period: { from: string; to: string };
    faturamento: number;
    custosVariaveis: number;
    ratio: number;
    ratioPct: number;
  }>({
    queryKey: ["/api/fixed-costs/variable-cost-ratio"],
    queryFn: async () => {
      const r = await fetch("/api/fixed-costs/variable-cost-ratio?months=3", { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao calcular histórico de custos variáveis");
      return r.json();
    },
    staleTime: 30 * 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/fixed-costs/${id}`),
    onSuccess: () => {
      toast({ title: "Custo fixo excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
    },
    onError: (err: any) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/fixed-costs/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
    },
  });

  const handleEdit = (fc: FixedCost) => {
    setEditing(fc);
    setShowForm(true);
  };
  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Building2 className="h-6 w-6" />
              Custos Fixos da Operação
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Todas as saídas mensais</strong> (estrutura + folha de RH + benefícios) — base do "Custo de Estar Aberto".
            </p>
          </div>
          <Button onClick={handleNew} data-testid="button-new-fixed-cost">
            <Plus className="h-4 w-4 mr-2" /> Novo Custo Fixo
          </Button>
        </div>

        {/* Cards de rateio — TOTAL (custos fixos + RH) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Mensal
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-monthly-total">
              {rhLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : fmtBRL(totalMensal)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Estrutura {fmtBRL(summary?.monthly ?? 0)} + RH {fmtBRL(rhSummary?.monthly ?? 0)}
              {summary?.fleetRent && summary.fleetRent.count > 0 && (
                <div className="text-[10px] mt-0.5 text-orange-700 dark:text-orange-400">
                  Inclui frota: {summary.fleetRent.count} carro(s) × {fmtBRL(summary.fleetRent.perVehicle)} = {fmtBRL(summary.fleetRent.total)}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-l-orange-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calculator className="h-4 w-4" /> Diário (÷30)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-daily-total">
              {fmtBRL(totalDiario)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Custo de estar aberto por dia</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-purple-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Semanal (×7)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-weekly-total">
              {fmtBRL(totalSemanal)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Projeção semanal</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4" /> Anual (×12)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-yearly-total">
              {fmtBRL(totalAnual)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Compromisso anual</div>
          </Card>
        </div>

        {/* === META DE FATURAMENTO — calculadora REALISTA com impostos e custos variáveis === */}
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-2 border-emerald-300 dark:border-emerald-800">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-6 w-6 text-emerald-700" />
            <div>
              <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                Meta de Faturamento — para ter {metaCfg.lucroPct}% de lucro REAL
              </h2>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Quanto a empresa precisa faturar para cobrir <strong>TODOS os custos + impostos + custos variáveis</strong> e ainda sobrar {metaCfg.lucroPct}% de lucro líquido.
              </p>
            </div>
          </div>

          {/* Inputs configuráveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-white/60 dark:bg-black/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <div>
              <Label htmlFor="margem-pct" className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Lucro mínimo alvo
              </Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  id="margem-pct"
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={metaCfg.lucroPct}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n < 100) setMetaCfg({ lucroPct: n });
                  }}
                  className="h-9 text-center font-bold flex-1"
                  data-testid="input-margem-pct"
                />
                <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">sobre o faturamento</p>
            </div>

            <div>
              <Label htmlFor="imposto-pct" className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Impostos sobre faturamento
              </Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  id="imposto-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={metaCfg.impostoPct}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n < 100) setMetaCfg({ impostoPct: n });
                  }}
                  className="h-9 text-center font-bold flex-1"
                  data-testid="input-imposto-pct"
                />
                <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Lucro Presumido vigilância: ~16% · Simples Anexo IV: 11–22%
              </p>
            </div>

            <div>
              <Label htmlFor="cv-pct" className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Custos variáveis
              </Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  id="cv-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={metaCfg.custoVarPct}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n < 100) setMetaCfg({ custoVarPct: n });
                  }}
                  className="h-9 text-center font-bold flex-1"
                  data-testid="input-cv-pct"
                />
                <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">%</span>
                {varRatio && varRatio.faturamento > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2 text-[10px] font-bold whitespace-nowrap"
                    onClick={() => setMetaCfg({ custoVarPct: varRatio.ratioPct })}
                    data-testid="button-use-historic-cv"
                    title={`Histórico ${varRatio.period.from} a ${varRatio.period.to}: ${fmtBRL(varRatio.custosVariaveis)} de variáveis sobre ${fmtBRL(varRatio.faturamento)} de faturamento`}
                  >
                    Usar {varRatio.ratioPct}%
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Combustível + pedágio + manutenção / faturamento
                {varRatio && varRatio.faturamento > 0 && (
                  <> · histórico 3m: <strong className="text-emerald-700">{varRatio.ratioPct}%</strong></>
                )}
              </p>
            </div>
          </div>

          {/* Validação: soma dos % não pode passar de 100 */}
          {!meta.realista.valida && (
            <div className="mb-3 p-3 rounded-lg bg-red-100 border border-red-300 dark:bg-red-950/40 dark:border-red-800">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Configuração inviável: imposto ({metaCfg.impostoPct}%) + custos variáveis ({metaCfg.custoVarPct}%) + lucro alvo ({metaCfg.lucroPct}%) = {(metaCfg.impostoPct + metaCfg.custoVarPct + metaCfg.lucroPct).toFixed(1)}% ≥ 100%.
                Reduza algum dos valores.
              </p>
            </div>
          )}

          {/* Cards de meta REALISTA */}
          {meta.realista.valida && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-3 bg-white/80 dark:bg-black/30 border-emerald-300 dark:border-emerald-700">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Diária
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1" data-testid="text-meta-daily">
                    {fmtBRL(meta.realista.diaria)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">por dia corrido</div>
                </Card>

                <Card className="p-3 bg-white/80 dark:bg-black/30 border-emerald-300 dark:border-emerald-700">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Semanal
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1" data-testid="text-meta-weekly">
                    {fmtBRL(meta.realista.semanal)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">7 dias</div>
                </Card>

                <Card className="p-3 bg-white/80 dark:bg-black/30 border-emerald-300 dark:border-emerald-700">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Mensal
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1" data-testid="text-meta-monthly">
                    {fmtBRL(meta.realista.mensal)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Lucro: <strong className="text-emerald-600">{fmtBRL(meta.realista.decomposicao.lucro)}</strong>
                  </div>
                </Card>

                <Card className="p-3 bg-white/80 dark:bg-black/30 border-emerald-300 dark:border-emerald-700">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Anual
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1" data-testid="text-meta-yearly">
                    {fmtBRL(meta.realista.anual)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">12 meses</div>
                </Card>
              </div>

              {/* Decomposição do faturamento meta */}
              <div className="mt-4 p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[11px] font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide mb-2">
                  Para onde vão os {fmtBRL(meta.realista.mensal)}/mês:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Impostos ({metaCfg.impostoPct}%)</span>
                    <span className="font-bold text-red-600 dark:text-red-400">−{fmtBRL(meta.realista.decomposicao.impostos)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Custos variáveis ({metaCfg.custoVarPct}%)</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">−{fmtBRL(meta.realista.decomposicao.custosVariaveis)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Custos fixos + RH</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">−{fmtBRL(meta.realista.decomposicao.custosFixos)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Lucro líquido ({metaCfg.lucroPct}%)</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">+{fmtBRL(meta.realista.decomposicao.lucro)}</span>
                  </div>
                </div>
              </div>

              {/* Comparativo: Simplificada vs Realista */}
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold text-emerald-800 dark:text-emerald-200 hover:underline">
                  Por que essa meta é maior que a "simplificada"? (clique para ver)
                </summary>
                <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                  <p className="text-amber-900 dark:text-amber-100">
                    A fórmula <strong>simplificada</strong> (custo ÷ (1 − {metaCfg.lucroPct}%)) ignora impostos e custos variáveis.
                    Daria meta mensal de <strong>{fmtBRL(meta.simplificada.mensal)}</strong> — mas, descontando impostos
                    ({metaCfg.impostoPct}%) e variáveis ({metaCfg.custoVarPct}%), o lucro REAL cairia para apenas
                    <strong> {fmtBRL(meta.simplificada.mensal * (1 - metaCfg.impostoPct/100 - metaCfg.custoVarPct/100) - totalMensal)}</strong>
                    {" "}
                    ({((meta.simplificada.mensal * (1 - metaCfg.impostoPct/100 - metaCfg.custoVarPct/100) - totalMensal) / meta.simplificada.mensal * 100).toFixed(1)}% de margem real).
                  </p>
                  <p className="text-amber-900 dark:text-amber-100">
                    A fórmula <strong>completa</strong> usada aqui:
                    <br />
                    <code className="text-[11px] bg-white/60 dark:bg-black/30 px-1.5 py-0.5 rounded font-mono">
                      Faturamento = Custo Fixo ÷ (1 − {metaCfg.impostoPct}% − {metaCfg.custoVarPct}% − {metaCfg.lucroPct}%) = {fmtBRL(totalMensal)} ÷ {meta.realista.fator.toFixed(3)} = {fmtBRL(meta.realista.mensal)}
                    </code>
                  </p>
                </div>
              </details>
            </>
          )}
        </Card>

        {/* Por Categoria */}
        {summary && Object.keys(summary.porCategoria).length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Distribuição por Categoria
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(summary.porCategoria).map(([cat, val]) => (
                <div
                  key={cat}
                  className="flex items-center justify-between p-2 rounded border"
                  data-testid={`category-summary-${cat}`}
                >
                  <Badge className={CATEGORY_COLORS[cat] || ""}>{cat}</Badge>
                  <span className="text-sm font-semibold">{fmtBRL(val)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* === CUSTOS DE RH (salários + benefícios) === */}
        <div className="border-t pt-4 mt-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Custos de RH (Salários + Benefícios)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Custo real mensal por agente (salário cadastrado + encargos + benefícios + provisões de férias/13º/rescisão + médias de hora extra e adicional noturno). Distinto da Provisão CCT usada no Balanço.
              </p>
            </div>
            <Link href="/admin/employees">
              <Button variant="outline" size="sm" data-testid="link-employees">
                <Briefcase className="h-3.5 w-3.5 mr-1.5" /> Gerir Salários
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card className="p-4 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> Folha Mensal
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="text-rh-monthly">
                {rhLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : fmtBRL(rhSummary?.monthly ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {rhSummary?.agentCount ?? 0} agente(s) ativo(s)
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-orange-500">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calculator className="h-4 w-4" /> Diário (÷30)
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="text-rh-daily">
                {fmtBRL(rhSummary?.daily ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Custo de RH por dia</div>
            </Card>

            <Card className="p-4 border-l-4 border-l-purple-500">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" /> Salário Base
              </div>
              <div className="text-2xl font-bold mt-1">
                {fmtBRL(rhSummary?.breakdown.base ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Encargos: {fmtBRL(rhSummary?.breakdown.encargos ?? 0)}
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-cyan-500">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" /> Benefícios
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="text-rh-beneficios">
                {fmtBRL(rhSummary?.breakdown.beneficios ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                VR {fmtBRL(rhSummary?.breakdown.vr ?? 0)} · Cesta {fmtBRL(rhSummary?.breakdown.cesta ?? 0)}
                {(rhSummary?.breakdown.diarias ?? 0) > 0 && <> · Diárias {fmtBRL(rhSummary?.breakdown.diarias ?? 0)}</>}
              </div>
            </Card>
          </div>

          {rhSummary?.period && (
            <p className="text-[11px] text-muted-foreground mt-2 ml-1">
              Período: {rhSummary.period.from} → {rhSummary.period.to} ·
              <strong> {rhSummary.period.businessDays} dias úteis</strong>
              {rhSummary.period.holidaysCount > 0 && <> ({rhSummary.period.holidaysCount} feriado(s) descontado(s))</>}
              · VR pago por dia útil
            </p>
          )}

          {/* Provisões Automáticas */}
          {rhSummary && (rhSummary.breakdown.ferias > 0 || rhSummary.breakdown.decimoTerceiro > 0 || rhSummary.breakdown.rescisao > 0 || rhSummary.breakdown.horaExtra > 0 || rhSummary.breakdown.adicionalNoturno > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
              <Card className="p-3 border-l-4 border-l-yellow-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Provisão Férias
                </div>
                <div className="text-lg font-bold mt-1" data-testid="text-rh-ferias">
                  {fmtBRL(rhSummary.breakdown.ferias ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">(base+enc) × 4/3 ÷ 12</div>
              </Card>
              <Card className="p-3 border-l-4 border-l-green-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Provisão 13º
                </div>
                <div className="text-lg font-bold mt-1" data-testid="text-rh-decimo-terceiro">
                  {fmtBRL(rhSummary.breakdown.decimoTerceiro ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">(base+enc) ÷ 12</div>
              </Card>
              <Card className="p-3 border-l-4 border-l-red-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Provisão Rescisão
                </div>
                <div className="text-lg font-bold mt-1" data-testid="text-rh-rescisao">
                  {fmtBRL(rhSummary.breakdown.rescisao ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">8% folha bruta (FGTS+multa)</div>
              </Card>
              <Card className="p-3 border-l-4 border-l-indigo-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Hora Extra (média)
                </div>
                <div className="text-lg font-bold mt-1" data-testid="text-rh-hora-extra">
                  {fmtBRL(rhSummary.breakdown.horaExtra ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Média 3 meses × 150%</div>
              </Card>
              <Card className="p-3 border-l-4 border-l-violet-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Adic. Noturno (média)
                </div>
                <div className="text-lg font-bold mt-1" data-testid="text-rh-adicional-noturno">
                  {fmtBRL(rhSummary.breakdown.adicionalNoturno ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Média 3 meses × 20%/h</div>
              </Card>
            </div>
          )}

          {rhSummary && rhSummary.porAgente.length > 0 && (
            <Card className="p-4 mt-3">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Custo Real por Agente — Folha 2025 (CLT) · Linha por funcionário
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" data-testid="table-custo-agente-completo">
                  <thead>
                    <tr className="border-b-2 text-left text-[9px] text-muted-foreground uppercase">
                      <th className="py-2 px-1 sticky left-0 bg-background z-10 min-w-[160px]">Agente</th>
                      {/* VENCIMENTOS */}
                      <th className="py-2 px-1 text-right" title="Salário Proporcional (cheio ÷ 30 × dias trab.)">Sal.Prop</th>
                      <th className="py-2 px-1 text-right text-orange-700" title="Periculosidade 30%">Peric</th>
                      <th className="py-2 px-1 text-right text-indigo-700" title="Horas Extras (sal/h × 1,6 × horas Ponto iD)">H.Extra</th>
                      <th className="py-2 px-1 text-right text-violet-700" title="Adicional Noturno (sal/h × 1,2)">Adic.Not</th>
                      <th className="py-2 px-1 text-right text-blue-700" title="DSR sobre HE+AdicNot">DSR</th>
                      <th className="py-2 px-1 text-right text-cyan-700" title="Vale Refeição R$/dia × dias úteis">VR</th>
                      <th className="py-2 px-1 text-right text-teal-700" title="Ajuda de Custo (cadastro Salário)">Ajuda</th>
                      <th className="py-2 px-1 text-right text-emerald-700" title="Cesta Básica (CCT)">Cesta</th>
                      <th className="py-2 px-1 text-right text-sky-700" title="Vale Transporte">VT</th>
                      <th className="py-2 px-1 text-right text-stone-600" title="Outros benefícios">Outros</th>
                      <th className="py-2 px-1 text-right text-fuchsia-700" title="Diárias do mês (lançamento manual)">Diárias</th>
                      <th className="py-2 px-1 text-right font-bold border-l-2 bg-emerald-50/40 dark:bg-emerald-950/20">Bruto</th>
                      {/* DEDUÇÕES */}
                      <th className="py-2 px-1 text-right text-rose-700 border-l" title="INSS progressivo">INSS</th>
                      <th className="py-2 px-1 text-right text-rose-700" title="IRRF progressivo">IRRF</th>
                      <th className="py-2 px-1 text-right text-amber-700" title="FGTS 8% (custo empresa, não desconta)">FGTS</th>
                      <th className="py-2 px-1 text-right font-bold bg-rose-50/40 dark:bg-rose-950/20" title="Líquido recebido pelo funcionário">Líquido</th>
                      {/* PROVISÕES */}
                      <th className="py-2 px-1 text-right text-green-700 border-l" title="Provisão 13º (sal cheio ÷ 12)">13º</th>
                      <th className="py-2 px-1 text-right text-yellow-700" title="Provisão Férias">Férias</th>
                      <th className="py-2 px-1 text-right text-yellow-700" title="Provisão 1/3 Férias">1/3</th>
                      <th className="py-2 px-1 text-right text-amber-700" title="FGTS sobre 13º+Férias+1/3">FGTS-P</th>
                      <th className="py-2 px-1 text-right text-rose-600" title="INSS sobre 13º+Férias+1/3">INSS-P</th>
                      {/* CUSTO */}
                      <th className="py-2 px-1 text-right font-bold border-l-2 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200">CUSTO TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rhSummary.porAgente.map((a) => {
                      const cell = (v: number, color = "") => (v ?? 0) > 0
                        ? <span className={`tabular-nums ${color}`}>{fmtBRL(v)}</span>
                        : <span className="text-neutral-300 dark:text-neutral-600 tabular-nums">R$ 0,00</span>;
                      return (
                        <tr key={a.id} className={`border-b hover:bg-muted/30 ${a.semSalario ? "opacity-60" : ""}`} data-testid={`row-agent-${a.id}`}>
                          <td className="py-2 px-1 font-medium sticky left-0 bg-background z-10 truncate max-w-[180px]">
                            {a.name}
                            {a.semSalario && <span className="ml-1 text-[9px] text-amber-600 font-semibold">(s/ salário)</span>}
                          </td>
                          <td className="py-2 px-1 text-right tabular-nums">{fmtBRL(a.salarioProporcional ?? a.base)}</td>
                          <td className="py-2 px-1 text-right">{cell(a.periculosidade, "text-orange-700 dark:text-orange-400")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.horaExtra, "text-indigo-700 dark:text-indigo-400")}</td>
                          <td className="py-2 px-1 text-right" data-testid={`text-agent-noturno-${a.id}`}>{cell(a.adicionalNoturno, "text-violet-700 dark:text-violet-400")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.dsr, "text-blue-700 dark:text-blue-400")}</td>
                          <td className="py-2 px-1 text-right text-cyan-700 dark:text-cyan-400 tabular-nums">
                            {fmtBRL(a.vrTotal)}
                            <div className="text-[9px] text-muted-foreground">{fmtBRL(a.vrDiario)}×{a.vrDias}</div>
                          </td>
                          <td className="py-2 px-1 text-right">{cell(a.ajudaCusto, "text-teal-700 dark:text-teal-400")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.cesta, "text-emerald-700 dark:text-emerald-400")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.vt, "text-sky-700 dark:text-sky-400")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.outros, "text-stone-600 dark:text-stone-300")}</td>
                          <td className="py-2 px-1 text-right">{cell(a.diarias, "text-fuchsia-700 dark:text-fuchsia-400")}</td>
                          <td className="py-2 px-1 text-right font-bold border-l-2 bg-emerald-50/30 dark:bg-emerald-950/15 tabular-nums">{fmtBRL(a.totalBruto ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-rose-700 dark:text-rose-400 border-l tabular-nums">{fmtBRL(a.inss ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-rose-700 dark:text-rose-400 tabular-nums">{fmtBRL(a.irrf ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-amber-700 dark:text-amber-400 tabular-nums">{fmtBRL(a.fgts ?? 0)}</td>
                          <td className="py-2 px-1 text-right font-bold bg-rose-50/30 dark:bg-rose-950/15 tabular-nums">{fmtBRL(a.liquidoFuncionario ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-green-700 dark:text-green-400 border-l tabular-nums">{fmtBRL(a.decimoTerceiro ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-yellow-700 dark:text-yellow-400 tabular-nums">{fmtBRL(a.ferias ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-yellow-700 dark:text-yellow-400 tabular-nums">{fmtBRL(a.provisaoTercoFerias ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-amber-700 dark:text-amber-400 tabular-nums">{fmtBRL(a.provisaoFGTSsobreFerias13 ?? 0)}</td>
                          <td className="py-2 px-1 text-right text-rose-600 dark:text-rose-400 tabular-nums">{fmtBRL(a.provisaoINSSsobreFerias13 ?? 0)}</td>
                          <td className="py-2 px-1 text-right font-bold border-l-2 bg-indigo-50/50 dark:bg-indigo-950/25 text-indigo-800 dark:text-indigo-200 tabular-nums">{fmtBRL(a.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-bold text-[11px]">
                      <td className="py-2 px-1 sticky left-0 bg-muted/40 z-10">TOTAIS</td>
                      <td className="py-2 px-1 text-right tabular-nums">{fmtBRL(rhSummary.breakdown.salarioProporcional ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-orange-700 tabular-nums">{fmtBRL(rhSummary.breakdown.periculosidade ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-indigo-700 tabular-nums">{fmtBRL(rhSummary.breakdown.horaExtra ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-violet-700 tabular-nums">{fmtBRL(rhSummary.breakdown.adicionalNoturno ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-blue-700 tabular-nums">{fmtBRL(rhSummary.breakdown.dsr ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-cyan-700 tabular-nums">{fmtBRL(rhSummary.breakdown.vr ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-teal-700 tabular-nums">{fmtBRL(rhSummary.breakdown.ajudaCusto ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-emerald-700 tabular-nums">{fmtBRL(rhSummary.breakdown.cesta ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-sky-700 tabular-nums">{fmtBRL(rhSummary.breakdown.vt ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-stone-600 tabular-nums">{fmtBRL(rhSummary.breakdown.outros ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-fuchsia-700 tabular-nums">{fmtBRL(rhSummary.breakdown.diarias ?? 0)}</td>
                      <td className="py-2 px-1 text-right border-l-2 bg-emerald-50/50 dark:bg-emerald-950/25 tabular-nums">{fmtBRL(rhSummary.breakdown.totalBruto ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-rose-700 border-l tabular-nums">{fmtBRL(rhSummary.breakdown.inss ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-rose-700 tabular-nums">{fmtBRL(rhSummary.breakdown.irrf ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-amber-700 tabular-nums">{fmtBRL(rhSummary.breakdown.fgts ?? 0)}</td>
                      <td className="py-2 px-1 text-right bg-rose-50/50 dark:bg-rose-950/25 tabular-nums">{fmtBRL(rhSummary.breakdown.liquidoFuncionario ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-green-700 border-l tabular-nums">{fmtBRL(rhSummary.breakdown.decimoTerceiro ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-yellow-700 tabular-nums">{fmtBRL((rhSummary.breakdown.ferias ?? 0) - (rhSummary.breakdown.provisaoTercoFerias ?? 0))}</td>
                      <td className="py-2 px-1 text-right text-yellow-700 tabular-nums">{fmtBRL(rhSummary.breakdown.provisaoTercoFerias ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-amber-700 tabular-nums">{fmtBRL(rhSummary.breakdown.provisaoFGTSsobreFerias13 ?? 0)}</td>
                      <td className="py-2 px-1 text-right text-rose-600 tabular-nums">{fmtBRL(rhSummary.breakdown.provisaoINSSsobreFerias13 ?? 0)}</td>
                      <td className="py-2 px-1 text-right border-l-2 bg-indigo-100/70 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100 tabular-nums">{fmtBRL(rhSummary.monthly ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Diagnóstico de cadastros faltantes */}
              {(() => {
                const semAjuda = rhSummary.porAgente.filter((a: any) => !a.semSalario && (a.ajudaCusto ?? 0) === 0).length;
                const semHE = rhSummary.porAgente.filter((a: any) => !a.semSalario && (a.horaExtra ?? 0) === 0 && (a.adicionalNoturno ?? 0) === 0).length;
                const semVT = rhSummary.porAgente.filter((a: any) => !a.semSalario && (a.vt ?? 0) === 0).length;
                const totalAtivos = rhSummary.porAgente.filter((a: any) => !a.semSalario).length;
                if (semAjuda + semHE + semVT === 0) return null;
                return (
                  <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-[11px] text-amber-900 dark:text-amber-200">
                    <div className="font-bold mb-1 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" /> Campos não cadastrados (zerados):
                    </div>
                    <ul className="ml-5 list-disc space-y-0.5">
                      {semAjuda > 0 && <li><b>Ajuda de Custo:</b> {semAjuda}/{totalAtivos} agentes — cadastre em <i>Funcionários → Salário → Ajuda de Custo Mensal</i></li>}
                      {semVT > 0 && <li><b>Vale Transporte:</b> {semVT}/{totalAtivos} agentes — cadastre em <i>Funcionários → Salário → VT Mensal</i></li>}
                      {semHE > 0 && <li><b>Horas Extras / Adicional Noturno:</b> {semHE}/{totalAtivos} agentes sem registro nos últimos 3 meses no Ponto iD/jornada</li>}
                    </ul>
                  </div>
                );
              })()}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 bg-muted/40 rounded">
                  <div className="text-muted-foreground uppercase font-semibold">Total Bruto</div>
                  <div className="font-bold tabular-nums" data-testid="text-rh-bruto">{fmtBRL(rhSummary.breakdown.totalBruto ?? 0)}</div>
                </div>
                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded">
                  <div className="text-rose-700 uppercase font-semibold">Deduções (INSS+IRRF)</div>
                  <div className="font-bold text-rose-800 dark:text-rose-300 tabular-nums" data-testid="text-rh-deducoes">{fmtBRL(rhSummary.breakdown.totalDeducoes ?? 0)}</div>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                  <div className="text-amber-700 uppercase font-semibold">FGTS Mensal</div>
                  <div className="font-bold text-amber-800 dark:text-amber-300 tabular-nums" data-testid="text-rh-fgts">{fmtBRL(rhSummary.breakdown.fgts ?? 0)}</div>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                  <div className="text-green-700 uppercase font-semibold">Provisões 13º+Férias</div>
                  <div className="font-bold text-green-800 dark:text-green-300 tabular-nums" data-testid="text-rh-provisoes">{fmtBRL(rhSummary.breakdown.totalProvisoes ?? 0)}</div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                <strong>Engine de Folha 2025:</strong> Sal.Prop = (cheio ÷ 30) × dias trab. · Peric = 30% · HE = sal/h × 1,6 · AdicNot = sal/h × 1,2 · DSR = (HE+AdicNot) × descanso/úteis ·
                INSS progressivo 7,5%-14% (teto R$ 8.157,41) · IRRF progressivo (R$ 189,59/dependente) · FGTS 8% · Provisões = sal cheio ÷ 12.
                HE/AdicNot são médias dos últimos 3 meses (jornada). Cadastre salário e periculosidade em <strong>Funcionários → Salário</strong>.
              </p>
            </Card>
          )}

          {/* === DIÁRIAS (LANÇAMENTO MANUAL) === */}
          <DailyAllowancesSection />

          {/* === FERIADOS (CALENDÁRIO) === */}
          <HolidaysSection />
        </div>

        {/* === CUSTO TOTAL DA OPERAÇÃO === */}
        <Card className="p-5 mt-2 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-6 w-6 text-indigo-700" />
            <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
              Custo Total da Operação
            </h2>
            <Badge className="bg-indigo-600 text-white border-0">TCO</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold">Custos Fixos</div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-total-fixed">
                {fmtBRL(summary?.monthly ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">Estrutura + softwares</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold">Custos de RH</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="text-total-rh">
                {fmtBRL(rhSummary?.monthly ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">Folha + benefícios</div>
            </div>
            <div className="border-l-2 border-indigo-300 pl-4">
              <div className="text-xs text-muted-foreground uppercase font-bold">Total Mensal</div>
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300" data-testid="text-total-operacao">
                {fmtBRL(totalMensal)}
              </div>
              <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {fmtBRL(totalDiario)}/dia • {fmtBRL(totalMensal * 12)}/ano
              </div>
            </div>
          </div>
        </Card>

        {/* Lista */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Custos Cadastrados</h3>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum custo fixo cadastrado.</p>
              <p className="text-xs mt-1">Clique em "Novo Custo Fixo" para começar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 px-2">Descrição</th>
                    <th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-right">Valor Mensal</th>
                    <th className="py-2 px-2 text-right">Diário (÷30)</th>
                    <th className="py-2 px-2 text-center">Vencimento</th>
                    <th className="py-2 px-2 text-center">Ativo</th>
                    <th className="py-2 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((fc) => {
                    const monthly = Number(fc.monthlyValue || 0);
                    return (
                      <tr key={fc.id} className="border-b hover:bg-muted/30" data-testid={`row-fixed-cost-${fc.id}`}>
                        <td className="py-2 px-2 font-medium" data-testid={`text-desc-${fc.id}`}>
                          {fc.description}
                          {fc.notes && (
                            <div className="text-xs text-muted-foreground mt-0.5">{fc.notes}</div>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <Badge className={CATEGORY_COLORS[fc.category] || ""}>{fc.category}</Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-semibold" data-testid={`text-monthly-${fc.id}`}>
                          {fmtBRL(monthly)}
                        </td>
                        <td className="py-2 px-2 text-right text-orange-700 dark:text-orange-400">
                          {fmtBRL(monthly / 30)}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {fc.dueDay ? `Dia ${fc.dueDay}` : "—"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Switch
                            checked={fc.active}
                            onCheckedChange={(v) => toggleMut.mutate({ id: fc.id, active: v })}
                            data-testid={`switch-active-${fc.id}`}
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(fc)} data-testid={`button-edit-${fc.id}`}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Excluir "${fc.description}"?`)) deleteMut.mutate(fc.id);
                            }}
                            data-testid={`button-delete-${fc.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {showForm && (
        <FixedCostForm
          editing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </AdminLayout>
  );
}

function FixedCostForm({ editing, onClose }: { editing: FixedCost | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!editing;

  const [description, setDescription] = useState(editing?.description || "");
  const [category, setCategory] = useState(editing?.category || "Outros");
  const [monthlyValue, setMonthlyValue] = useState(editing?.monthlyValue?.toString() || "");
  const [dueDay, setDueDay] = useState(editing?.dueDay?.toString() || "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [notes, setNotes] = useState(editing?.notes || "");

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        description: description.trim(),
        category,
        monthlyValue: Number(monthlyValue.replace(",", ".")) || 0,
        dueDay: dueDay ? Number(dueDay) : null,
        active,
        notes: notes.trim() || null,
      };
      if (isEdit) {
        return apiRequest("PATCH", `/api/fixed-costs/${editing.id}`, payload);
      }
      return apiRequest("POST", "/api/fixed-costs", payload);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Custo atualizado" : "Custo cadastrado" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !monthlyValue) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    saveMut.mutate();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Custo Fixo" : "Novo Custo Fixo"}</DialogTitle>
          <DialogDescription>
            Despesas mensais recorrentes da operação (aluguel, internet, software etc.)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="desc">Descrição *</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel da sede, Internet fibra..."
              data-testid="input-description"
              required
            />
          </div>

          <div>
            <Label htmlFor="cat">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="cat" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="val">Valor Mensal *</Label>
              <Input
                id="val"
                type="number"
                step="0.01"
                min="0"
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                placeholder="0,00"
                data-testid="input-monthly-value"
                required
              />
              {monthlyValue && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {fmtBRL((Number(monthlyValue.replace(",", ".")) || 0) / 30)}/dia
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="due">Dia Vencimento</Label>
              <Input
                id="due"
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="Ex: 10"
                data-testid="input-due-day"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="flex items-center justify-between border rounded p-2">
            <Label htmlFor="active" className="cursor-pointer">Custo ativo (entra no rateio)</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} data-testid="switch-active" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMut.isPending} data-testid="button-save">
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DIÁRIAS — Lançamento Manual (plantões extras, ajudas pontuais)
// ============================================================
function DailyAllowancesSection() {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const { data: employees = [] } = useQuery<EmployeeLite[]>({
    queryKey: ["/api/employees"],
  });
  const ativos = employees.filter((e) =>
    !e.status || ["ativo", "ATIVO", "Ativo"].includes(e.status)
  );

  const { data: list = [], isLoading } = useQuery<DailyAllowance[]>({
    queryKey: ["/api/daily-allowances", from, to],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const r = await authFetch(`/api/daily-allowances?from=${from}&to=${to}`);
      return r.json();
    },
  });

  const totalPeriodo = list.reduce((s, r) => s + Number(r.amount || 0), 0);

  const createMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/daily-allowances", {
        employeeId: Number(employeeId),
        date,
        amount: amount.replace(",", "."),
        description: description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      setAmount(""); setDescription("");
      toast({ title: "Diária lançada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/daily-allowances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      toast({ title: "Diária removida" });
    },
  });

  return (
    <Card className="p-4 mt-3" data-testid="section-daily-allowances">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-violet-600" />
          Diárias (Lançamento Manual)
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" data-testid="input-allow-from" />
          <Label className="text-xs">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" data-testid="input-allow-to" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3 p-3 bg-violet-50/40 dark:bg-violet-950/20 rounded">
        <div>
          <Label className="text-xs">Agente *</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-9" data-testid="select-allow-employee">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {ativos.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Data *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" data-testid="input-allow-date" />
        </div>
        <div>
          <Label className="text-xs">Valor (R$) *</Label>
          <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="h-9" data-testid="input-allow-amount" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Descrição</Label>
          <div className="flex gap-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Plantão extra noturno" className="h-9" data-testid="input-allow-desc" />
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={!employeeId || !amount || !date || createMut.isPending}
              data-testid="button-add-allowance"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Lançar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-muted-foreground">{list.length} lançamento(s) no período</span>
        <span className="font-semibold text-violet-700 dark:text-violet-300" data-testid="text-allow-total">
          Total: {fmtBRL(totalPeriodo)}
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Carregando...</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Nenhuma diária lançada no período.</p>
      ) : (
        <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2 px-2">Data</th>
                <th className="py-2 px-2">Agente</th>
                <th className="py-2 px-2">Descrição</th>
                <th className="py-2 px-2 text-right">Valor</th>
                <th className="py-2 px-2 text-right w-12">—</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/30" data-testid={`row-allowance-${r.id}`}>
                  <td className="py-1.5 px-2">{r.date}</td>
                  <td className="py-1.5 px-2 font-medium">{r.employeeName}</td>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs">{r.description || "—"}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-violet-700 dark:text-violet-300">{fmtBRL(r.amount)}</td>
                  <td className="py-1.5 px-2 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(r.id)} data-testid={`button-del-allowance-${r.id}`}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// FERIADOS — descontados no cálculo de dias úteis (VR)
// ============================================================
function HolidaysSection() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const { data: holidays = [], isLoading } = useQuery<Holiday[]>({
    queryKey: ["/api/holidays", year],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const r = await authFetch(`/api/holidays?year=${year}`);
      return r.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/holidays", { date, name, national: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      setDate(""); setName("");
      toast({ title: "Feriado adicionado" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      toast({ title: "Feriado removido" });
    },
  });

  return (
    <Card className="p-4 mt-3" data-testid="section-holidays">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-rose-600" />
            Feriados {year}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Descontados do cálculo de dias úteis para VR. Adicione feriados estaduais/municipais conforme necessário.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Ano</Label>
          <Input type="number" min="2024" max="2030" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-24" data-testid="input-holiday-year" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 p-3 bg-rose-50/40 dark:bg-rose-950/20 rounded">
        <div>
          <Label className="text-xs">Data *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" data-testid="input-holiday-date" />
        </div>
        <div>
          <Label className="text-xs">Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aniversário da cidade" className="h-9" data-testid="input-holiday-name" />
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={!date || !name || createMut.isPending}
            className="w-full"
            data-testid="button-add-holiday"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Carregando...</p>
      ) : holidays.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Nenhum feriado cadastrado em {year}.</p>
      ) : (
        <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2 px-2">Data</th>
                <th className="py-2 px-2">Nome</th>
                <th className="py-2 px-2">Tipo</th>
                <th className="py-2 px-2 text-right w-12">—</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-b hover:bg-muted/30" data-testid={`row-holiday-${h.id}`}>
                  <td className="py-1.5 px-2">{h.date}</td>
                  <td className="py-1.5 px-2 font-medium">{h.name}</td>
                  <td className="py-1.5 px-2">
                    <Badge variant={h.national ? "default" : "outline"} className="text-[10px]">
                      {h.national ? "Nacional" : "Local"}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {!h.national && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(h.id)} data-testid={`button-del-holiday-${h.id}`}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
