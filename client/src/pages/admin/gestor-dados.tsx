// =============================================================================
// GESTOR DE DADOS FINANCEIRO · CENTRO DE INTELIGÊNCIA FINANCEIRA
// O Gestor de Dados é o protagonista: certifica TODOS os números antes de
// exibi-los. Tema escuro (mockup aprovado pela diretoria em 28/07/2026).
// Ordem da tela: KPIs certificados → Validação Inteligente + IA → Custos dos
// Funcionários → Resumo Financeiro / Balanço (consequência, não protagonista).
//
// Nenhum cálculo paralelo: os KPIs usam a MESMA lib do Balanço Gerencial
// (client/src/lib/balanco-calc.ts) e os MESMOS endpoints oficiais. Todo número
// é explicável: cada KPI tem selo (Certificado / Em Conferência / Divergência)
// clicável com o motivo + memória de cálculo completa.
// =============================================================================
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authFetch } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Sparkles, AlertTriangle, CheckCircle2,
  ExternalLink, Loader2, Database, Printer, BadgeCheck,
  Calculator, ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
import { useMetaConfig, calcMeta } from "@/lib/meta-faturamento";
import { buildMissoesPeriodo, buildTotaisBalanco, buildEficiencia, isOsAberta } from "@/lib/balanco-calc";

// ----------------------------- helpers -----------------------------
const brl = (v: any) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: any, d = 0) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const pct = (v: any, d = 1) => `${Number(v || 0).toFixed(d)}%`;

const DATA_CORTE = "2026-06-01";
const hojeStr = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDia = (s: string) => {
  const m = String(s || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(m) ? m.split("-").reverse().join("/") : s;
};

const SEV_META: Record<string, { label: string; cls: string }> = {
  CRITICA: { label: "Crítica", cls: "bg-red-600 text-white" },
  ALTA: { label: "Alta", cls: "bg-orange-500 text-white" },
  MEDIA: { label: "Média", cls: "bg-amber-400 text-black" },
  BAIXA: { label: "Baixa", cls: "bg-zinc-500 text-white" },
};
function SevBadge({ sev }: { sev: string | null }) {
  if (!sev) return null;
  const m = SEV_META[sev] || SEV_META.BAIXA;
  return <Badge className={`${m.cls} text-[10px] px-1.5 py-0`}>{m.label}</Badge>;
}

// Selo de certificação: verde = certificado; âmbar = em conferência (achados
// média/baixa); vermelho = divergência (crítica/alta). Sempre clicável → motivo.
type SeloNivel = "CERT" | "CONF" | "DIVER";
function nivelSelo(achados: any[]): SeloNivel {
  if (!achados.length) return "CERT";
  return achados.some((a) => a.severidade === "CRITICA" || a.severidade === "ALTA") ? "DIVER" : "CONF";
}
function SeloKpi({ nivel, onClick }: { nivel: SeloNivel; onClick: () => void }) {
  const cfg = nivel === "CERT"
    ? { txt: "Certificado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", Icon: BadgeCheck }
    : nivel === "CONF"
    ? { txt: "Em Conferência", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40", Icon: AlertTriangle }
    : { txt: "Divergência", cls: "bg-red-500/15 text-red-400 border-red-500/40", Icon: ShieldAlert };
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.cls} hover:brightness-125 transition`}>
      <cfg.Icon className="h-3 w-3" /> {cfg.txt}
    </button>
  );
}

const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

// linhas do hover / memória de cálculo (tema escuro)
function L({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-xs ${strong ? "font-semibold text-white" : "text-zinc-300"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-400">{children}</div>;
}

// =============================================================================
export default function GestorDadosPage() {
  const [de, setDe] = useState(DATA_CORTE);
  const [ate, setAte] = useState(hojeStr());
  const [cardAberto, setCardAberto] = useState<string | null>(null);
  const [kpiAberto, setKpiAberto] = useState<string | null>(null); // memória de cálculo / motivo
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);
  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // ------------- fontes oficiais (idênticas às do Balanço Gerencial) -------------
  const { data: dash, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/financial/dashboard", "cached"],
    queryFn: async () => {
      const res = await authFetch(`/api/financial/dashboard?cached=1`);
      if (!res.ok) throw new Error("dashboard");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: gridData = [], isLoading: gridLoading } = useQuery<any[]>({
    queryKey: ["/api/operational-grid", de, ate, "cached"],
    queryFn: async () => {
      const res = await authFetch(`/api/operational-grid?from=${de}&to=${ate}&cached=1`);
      if (!res.ok) throw new Error("grid");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: rh } = useQuery<any>({
    queryKey: ["/api/fixed-costs/rh-summary", "cached", de, ate],
    queryFn: async () => {
      const res = await authFetch(`/api/fixed-costs/rh-summary?cached=1&from=${de}&to=${ate}`);
      if (!res.ok) throw new Error("rh");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: fixos } = useQuery<any>({ queryKey: ["/api/fixed-costs/summary"] });
  const { data: allVehicles } = useQuery<any[]>({ queryKey: ["/api/vehicles"] });
  const { data: allEmployees } = useQuery<any[]>({ queryKey: ["/api/employees"] });
  const { data: ind } = useQuery<any>({ queryKey: ["/api/gestor-dados/indicadores-funcionarios"] });
  const { data: val, isLoading: valLoading, isFetching: valFetching } = useQuery<any>({
    queryKey: ["/api/gestor-dados/validacao", de, ate],
    queryFn: async () => {
      const res = await authFetch(`/api/gestor-dados/validacao?de=${de}&ate=${ate}`);
      if (!res.ok) throw new Error("validacao");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // ------------- KPIs — MESMO cálculo do Balanço Gerencial -------------
  const range = useMemo(() => {
    const [y1, m1, d1] = de.split("-").map(Number);
    const [y2, m2, d2] = ate.split("-").map(Number);
    return { start: new Date(y1, m1 - 1, d1), end: new Date(y2, m2 - 1, d2) };
  }, [de, ate]);
  const daysInPeriod = useMemo(
    () => Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1),
    [range],
  );
  // MESMA régua do Balanço (mês comercial): caps fixos por faixa — 30/90/180/365.
  const costDays = useMemo(() => {
    const d = daysInPeriod;
    if (d <= 7) return d;
    if (d <= 31) return Math.min(d, 30);
    if (d <= 92) return Math.min(d, 90);
    if (d <= 184) return Math.min(d, 180);
    return Math.min(d, 365);
  }, [daysInPeriod]);

  const filtered = useMemo(() => buildMissoesPeriodo(dash, gridData, range), [dash, gridData, range]);

  const activeAgentCount = useMemo(() => {
    if (!allEmployees) return 0;
    const prefixos = ["inativo", "desligado", "bloqueado", "afastado", "férias", "ferias", "demitido", "suspenso"];
    return allEmployees.filter((e: any) => {
      const role = String(e.role || "").toLowerCase();
      if (!role.includes("vigil")) return false;
      const s = String(e.status || "").toLowerCase().trim();
      if (!s) return true;
      return !prefixos.some((p) => s === p || s.startsWith(p + "_") || s.startsWith(p + "-") || s.startsWith(p + " "));
    }).length;
  }, [allEmployees]);
  const CCT_CUSTO_DIARIO = (2432.5 + 2432.5 * 0.3 + 40 * 22 + 208.45) / 30; // mesma CCT do Balanço
  const provisaoRH = useMemo(() => {
    const mensalReal = Number(rh?.monthlyOperacional ?? rh?.monthly ?? 0);
    if (mensalReal > 0) return (mensalReal / 30) * costDays;
    return CCT_CUSTO_DIARIO * activeAgentCount * costDays;
  }, [rh, costDays, activeAgentCount]);

  const totals = useMemo(
    () => buildTotaisBalanco(filtered, provisaoRH, Number(fixos?.monthly || 0), costDays),
    [filtered, provisaoRH, fixos, costDays],
  );
  const eficiencia = useMemo(() => buildEficiencia(dash, allVehicles, range), [dash, allVehicles, range]);

  const [metaCfg] = useMetaConfig();
  const viaturasAtivas = useMemo(() => (allVehicles || []).filter(isActiveVehicle).length, [allVehicles]);
  const metaResult = useMemo(
    () => calcMeta(Number(fixos?.monthly || 0), metaCfg, viaturasAtivas),
    [fixos, metaCfg, viaturasAtivas],
  );
  const metaPeriodo = (Number(metaResult?.realista?.valida ? metaResult.realista.mensal : metaResult?.simplificada?.mensal || 0) / 30) * costDays;
  const pctMeta = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;

  // ------------- memória de cálculo do faturamento -------------
  const memFat = useMemo(() => {
    const missoes = filtered.missions;
    const finalizadas = missoes.filter((m: any) => !isOsAberta(m));
    const abertas = missoes.filter((m: any) => isOsAberta(m));
    const recusadas = (gridData || []).filter((o: any) => (o.status || "").toLowerCase() === "recusada").length;
    const canceladas = missoes.filter((m: any) => (m.status || "").toLowerCase() === "cancelada").length;
    const clientes = new Set(missoes.map((m: any) => m.client_name).filter(Boolean)).size;
    return { total: missoes.length, finalizadas: finalizadas.length, abertas: abertas.length, recusadas, canceladas, clientes };
  }, [filtered, gridData]);

  // ------------- selos: liga cada KPI às categorias do motor -------------
  const achados = (val?.achados || []) as any[];
  const porCats = (cats: string[]) => achados.filter((a) => cats.includes(a.categoria));
  // Matriz KPI → categorias do motor (espelha EXATAMENTE server/lib/gestor-dados.ts)
  const aFat = porCats(["billing_duplicado", "os_em_multiplas_faturas", "fatura_duplicada", "nf_repetida", "valor_fora_padrao", "conciliacao_pendente", "inconsistencia_financeira"]);
  const aCusto = porCats(["custo_duplicado", "lancamento_duplicado", "duplicidade_rh", "dado_incompleto_rh"]);
  const aLucro = [...aFat, ...aCusto];
  const somaValor = (list: any[]) => list.reduce((s, a) => s + Number(a.valor || 0), 0);

  // ------------- sincronizar -------------
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      await Promise.all([
        authFetch(`/api/financial/dashboard?cached=1&force=1`),
        authFetch(`/api/fixed-costs/rh-summary?cached=1&force=1&from=${de}&to=${ate}`),
        authFetch(`/api/operational-grid?from=${de}&to=${ate}&cached=1&force=1`),
        authFetch(`/api/gestor-dados/validacao?force=1&de=${de}&ate=${ate}`),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/financial/dashboard", "cached"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary", "cached", de, ate] }),
        queryClient.invalidateQueries({ queryKey: ["/api/operational-grid", de, ate, "cached"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/gestor-dados/validacao", de, ate] }),
      ]);
    } finally {
      setSincronizando(false);
    }
  };

  const perguntar = useMutation({
    mutationFn: async (q: string) => {
      const r = await apiRequest("POST", "/api/gestor-dados/perguntar", { pergunta: q });
      return r.json();
    },
    onSuccess: (d: any) => setResposta(d.resposta),
    onError: (e: any) => setResposta(`Erro: ${e?.message || "falha na IA"}`),
  });

  // ------------- IA: frases em linguagem natural com números reais -------------
  const frasesIA = useMemo(() => {
    const out: { tone: "ok" | "warn" | "bad"; txt: string }[] = [];
    const vImp = somaValor(achados);
    if (vImp > 0) out.push({ tone: "warn", txt: `Detectei ${brl(vImp)} em valores impactados por divergências abertas no período.` });
    const dupFat = porCats(["fatura_duplicada", "nf_repetida"]);
    if (dupFat.length) out.push({ tone: "bad", txt: `${dupFat.length} fatura(s) com possível duplicidade — ${brl(somaValor(dupFat))} em risco de cobrança dupla.` });
    const pend = porCats(["conciliacao_pendente"]);
    if (pend.length) out.push({ tone: "warn", txt: `${pend.length} boletim(ns)/OS aguardando faturamento ou conciliação — ${brl(somaValor(pend))} de receita parada.` });
    if (metaPeriodo > 0) out.push({
      tone: pctMeta >= 100 ? "ok" : pctMeta >= 80 ? "warn" : "bad",
      txt: `Faturamento em ${brl(totals.fat)} = ${pctMeta.toFixed(0)}% da meta do período (${brl(metaPeriodo)}).`,
    });
    out.push({
      tone: totals.margem >= 35 ? "ok" : totals.margem >= 25 ? "warn" : "bad",
      txt: `Margem líquida de ${pct(totals.margem)} — ${totals.margem >= 35 ? "acima da" : "abaixo da"} meta de 35%.`,
    });
    // funcionários com custo acima da média
    const custos = ((rh?.porAgente || []) as any[]).map((a) => Number(a.total || 0)).filter((v) => v > 0);
    if (custos.length > 2) {
      const media = custos.reduce((s, v) => s + v, 0) / custos.length;
      const acima = custos.filter((v) => v > media * 1.25).length;
      if (acima > 0) out.push({ tone: "warn", txt: `${acima} colaborador(es) com custo mais de 25% acima da média da folha (${brl(media)}).` });
    }
    if (eficiencia.abaixo.length > 0) out.push({
      tone: "warn",
      txt: `${eficiencia.abaixo.length} viatura(s) abaixo de 14 km/L: ${eficiencia.abaixo.slice(0, 3).map((v) => v.plate).join(", ")}${eficiencia.abaixo.length > 3 ? "…" : ""}. Recomendo revisar consumo e manutenção.`,
    });
    const criticas = Number(val?.totais?.porSeveridade?.CRITICA || 0);
    if (criticas > 0) out.push({ tone: "bad", txt: `${criticas} divergência(s) CRÍTICA(s) — corrigir antes de fechar o período.` });
    else if (val) out.push({ tone: "ok", txt: `Nenhuma divergência crítica. Integridade dos dados: ${pct(val.integridadePct)}.` });
    return out;
  }, [achados, totals, metaPeriodo, pctMeta, eficiencia, val, rh]);

  // ------------- funcionários (hover inteligente — inalterado) -------------
  const custosTotaisEmpresa = Number(rh?.monthly || 0) + Number(fixos?.monthly || 0);
  const funcionarios = useMemo(() => {
    const lista = (rh?.porAgente || []) as any[];
    const porFunc = ind?.porFuncionario || {};
    const folhaTotal = Number(rh?.monthly || 0);
    return lista.map((a) => {
      const op = porFunc[String(a.id)] || { missoes: 0, receitaGerada: 0 };
      const horas = Number(a.horasNormaisMes || 0) + Number(a.horasExtrasMes || 0);
      const dias = horas > 0 ? Math.max(1, Math.round(horas / 8.8)) : 0;
      return {
        ...a,
        missoes: op.missoes, receitaGerada: op.receitaGerada, horas, dias,
        custoDiario: a.total / 30,
        custoHoraReal: horas > 0 ? a.total / horas : Number(a.custoHora || 0),
        custoPorMissao: op.missoes > 0 ? a.total / op.missoes : null,
        receitaPorMissao: op.missoes > 0 ? op.receitaGerada / op.missoes : null,
        lucroOperacional: op.receitaGerada > 0 ? op.receitaGerada - a.total : null,
        pctFolha: folhaTotal > 0 ? (a.total / folhaTotal) * 100 : 0,
        pctEmpresa: custosTotaisEmpresa > 0 ? (a.total / custosTotaisEmpresa) * 100 : 0,
      };
    }).sort((x, y) => y.total - x.total);
  }, [rh, ind, custosTotaisEmpresa]);
  const totalFolha = funcionarios.reduce((s, f) => s + Number(f.total || 0), 0);

  const achadosDoCard = (categoria: string) => achados.filter((a) => a.categoria === categoria);
  const kpisCarregando = dashLoading || gridLoading;
  const kmMediaDia = totals.km / Math.max(daysInPeriod, 1);
  const kmMediaMissao = totals.total > 0 ? totals.km / totals.total : 0;

  // dados p/ dialog de KPI (motivo + memória de cálculo)
  const KPI_DIALOG: Record<string, { titulo: string; achados: any[] }> = {
    fat: { titulo: "Faturamento — memória de cálculo e certificação", achados: aFat },
    custo: { titulo: "Custos Totais — memória de cálculo e certificação", achados: aCusto },
    lucro: { titulo: "Lucro Líquido — memória de cálculo e certificação", achados: aLucro },
    margem: { titulo: "Margem Líquida — memória de cálculo e certificação", achados: aLucro },
    km: { titulo: "KM Rodado — memória de cálculo", achados: aFat },
    efic: { titulo: "Eficiência km/L — memória de cálculo", achados: [] },
  };

  return (
    <AdminLayout>
      <div className="min-h-full bg-zinc-950 text-zinc-100 p-4 md:p-6 space-y-4 rounded-lg">
        {/* ======================= HEADER ======================= */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Database className="h-6 w-6 text-violet-400" /> GESTOR DE DADOS FINANCEIRO
              <Badge className="bg-violet-600 text-white gap-1"><Sparkles className="h-3 w-3" /> IA ATIVA</Badge>
            </h1>
            <p className="text-xs text-zinc-400">
              Validação, Conciliação e Integridade dos Dados Financeiros — todo número abaixo foi auditado antes de ser exibido.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)}
                className="h-9 w-[145px] bg-zinc-900 border-zinc-700 text-zinc-100" />
              <span className="text-zinc-500">até</span>
              <Input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)}
                className="h-9 w-[145px] bg-zinc-900 border-zinc-700 text-zinc-100" />
            </div>
            <Button variant="outline" size="sm" disabled={sincronizando || valFetching} onClick={sincronizar}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800">
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sincronizar Dados
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800">
              <Printer className="h-4 w-4 mr-1" /> Gerar Relatório
            </Button>
          </div>
        </div>

        {/* status dos dados */}
        {val && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 border border-zinc-800 rounded-md bg-zinc-900/60 px-3 py-1.5">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Integridade: <b className={Number(val.integridadePct) >= 99 ? "text-emerald-400" : Number(val.integridadePct) >= 90 ? "text-amber-400" : "text-red-400"}>{pct(val.integridadePct)}</b>
            </span>
            <span>{Number(val.totais?.registrosAuditados || 0).toLocaleString("pt-BR")} registros auditados</span>
            <span>período: {fmtDia(de)} — {fmtDia(ate)}</span>
            <span>última auditoria: {new Date(val.geradoEm).toLocaleString("pt-BR")}</span>
            <span className="text-zinc-500">fontes: Motor do Balanço · Gestão de Medição · Financeiro · RH</span>
          </div>
        )}

        {/* ======================= KPIs CERTIFICADOS ======================= */}
        {kpisCarregando ? (
          <div className="flex items-center gap-2 text-zinc-400 p-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Auditando e carregando os números do período…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Faturamento */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">Faturamento</span>
                <SeloKpi nivel={nivelSelo(aFat)} onClick={() => setKpiAberto("fat")} />
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-400">{brl(totals.fat)}</div>
              <div className="text-[11px] text-zinc-400">{memFat.total} missões · {memFat.clientes} clientes ativos</div>
              <div className="flex gap-2 text-[11px]">
                <span className="rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5">✓ finalizado {brl(totals.fatCongelado)}</span>
                <span className="rounded bg-amber-500/10 text-amber-400 px-1.5 py-0.5">em aberto {brl(totals.fatAberto)}</span>
              </div>
              {metaPeriodo > 0 && (
                <div className="space-y-0.5">
                  <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                    <div className={`h-full ${pctMeta >= 100 ? "bg-emerald-500" : pctMeta >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, pctMeta)}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-500">meta {brl(metaPeriodo)} · {pctMeta.toFixed(1)}%</div>
                </div>
              )}
              <button onClick={() => setKpiAberto("fat")} className="text-[10px] text-violet-400 hover:underline inline-flex items-center gap-0.5">
                <Calculator className="h-3 w-3" /> Ver memória de cálculo
              </button>
            </div>

            {/* Custos Totais */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">Custos Totais</span>
                <SeloKpi nivel={nivelSelo(aCusto)} onClick={() => setKpiAberto("custo")} />
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-red-400">{brl(totals.custoTotal)}</div>
              {(() => {
                const oper = totals.custoTotal - totals.provisaoRH - totals.custosFixosRateados;
                const p = (v: number) => totals.custoTotal > 0 ? `${((v / totals.custoTotal) * 100).toFixed(1)}%` : "—";
                return (
                  <div className="space-y-0.5 text-[11px] text-zinc-400">
                    <div className="flex justify-between"><span>Operacionais</span><span className="tabular-nums">{p(oper)} · {brl(oper)}</span></div>
                    <div className="flex justify-between"><span>Pessoal (RH)</span><span className="tabular-nums">{p(totals.provisaoRH)} · {brl(totals.provisaoRH)}</span></div>
                    <div className="flex justify-between"><span>Fixos / Gerais</span><span className="tabular-nums">{p(totals.custosFixosRateados)} · {brl(totals.custosFixosRateados)}</span></div>
                  </div>
                );
              })()}
              <button onClick={() => setKpiAberto("custo")} className="text-[10px] text-violet-400 hover:underline inline-flex items-center gap-0.5">
                <Calculator className="h-3 w-3" /> Ver memória de cálculo
              </button>
            </div>

            {/* Lucro Líquido */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">Lucro Líquido</span>
                <SeloKpi nivel={nivelSelo(aLucro)} onClick={() => setKpiAberto("lucro")} />
              </div>
              <div className={`text-2xl font-extrabold tabular-nums ${totals.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {brl(totals.lucro)}
              </div>
              <div className="text-[11px] text-zinc-400">c/ RH + custos fixos rateados</div>
              <button onClick={() => setKpiAberto("lucro")} className="text-[10px] text-violet-400 hover:underline inline-flex items-center gap-0.5">
                <Calculator className="h-3 w-3" /> Ver memória de cálculo
              </button>
            </div>

            {/* Margem */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">Margem Líquida</span>
                <SeloKpi nivel={nivelSelo(aLucro)} onClick={() => setKpiAberto("margem")} />
              </div>
              <div className={`text-2xl font-extrabold tabular-nums ${totals.margem >= 35 ? "text-emerald-400" : totals.margem >= 25 ? "text-amber-400" : "text-red-400"}`}>
                {pct(totals.margem)}
              </div>
              <div className="text-[11px] text-zinc-400">Meta: 35%</div>
              <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                <div className={`h-full ${totals.margem >= 35 ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(100, (totals.margem / 35) * 100)}%` }} />
              </div>
              {totals.margem < 35 && <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/40 text-[10px]">ATENÇÃO</Badge>}
            </div>

            {/* KM */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">KM Rodado (missões)</span>
                <SeloKpi nivel={nivelSelo(aFat)} onClick={() => setKpiAberto("km")} />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{fmtNum(totals.km)} <span className="text-sm font-semibold text-zinc-400">km</span></div>
              <div className="text-[11px] text-zinc-400">Média/dia: {fmtNum(kmMediaDia)} km</div>
              <div className="text-[11px] text-zinc-400">Média/missão: {fmtNum(kmMediaMissao)} km</div>
            </div>

            {/* Eficiência */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">Eficiência</span>
                <SeloKpi nivel={eficiencia.abaixo.length ? "CONF" : "CERT"} onClick={() => setKpiAberto("efic")} />
              </div>
              <div className={`text-2xl font-extrabold tabular-nums ${eficiencia.mediaKmL >= 14 ? "text-emerald-400" : "text-amber-400"}`}>
                {eficiencia.mediaKmL.toFixed(1)} <span className="text-sm font-semibold text-zinc-400">km/L</span>
              </div>
              <div className="text-[11px] text-zinc-400">{fmtNum(eficiencia.totalKm)} km / {fmtNum(eficiencia.totalLiters)} L</div>
              {eficiencia.abaixo.length > 0 && (
                <button onClick={() => setKpiAberto("efic")}
                  className="w-full rounded bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold py-1 inline-flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {eficiencia.abaixo.length} VTR{eficiencia.abaixo.length > 1 ? "S" : ""} ABAIXO DE 14
                </button>
              )}
            </div>
          </div>
        )}

        {/* ======================= VALIDAÇÃO + IA ======================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Painel de Validação Inteligente */}
          <div className="lg:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-bold uppercase tracking-wide">Validação Inteligente de Dados</span>
            </div>
            {valLoading ? (
              <div className="flex items-center gap-2 text-zinc-400 p-4"><Loader2 className="h-5 w-5 animate-spin" /> Auditando dados…</div>
            ) : val ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                {(val.cards as any[]).map((c) => (
                  <button key={c.categoria} disabled={!c.achados} onClick={() => setCardAberto(c.categoria)}
                    className={`text-left rounded-md border p-2.5 transition ${c.achados > 0
                      ? (c.severidadeMax === "CRITICA" || c.severidadeMax === "ALTA"
                        ? "border-red-500/50 bg-red-500/5 hover:bg-red-500/10"
                        : "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10")
                      : "border-zinc-800 bg-zinc-900/50 opacity-80"}`}>
                    <div className="text-[10px] font-bold uppercase text-zinc-400 leading-tight">{c.titulo}</div>
                    <div className={`text-xl font-extrabold ${c.achados > 0 ? "" : "text-emerald-400"}`}>
                      {c.achados > 0 ? `${c.achados}` : "OK"}
                    </div>
                    {c.achados > 0 && Number(c.valorImpactado) > 0 && (
                      <div className="text-[10px] font-semibold text-amber-400 tabular-nums">{brl(c.valorImpactado)}</div>
                    )}
                    {c.achados > 0 && <div className="text-[10px] text-violet-400 mt-0.5">Ver detalhes →</div>}
                  </button>
                ))}
                {/* card síntese: dados válidos */}
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">Dados Válidos</div>
                  <div className="text-xl font-extrabold text-emerald-400">{pct(val.integridadePct)}</div>
                  <div className="text-[10px] text-zinc-400">integridade dos dados</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-400 p-2">Falha ao carregar a validação.</div>
            )}
          </div>

          {/* IA · Análise Financeira */}
          <div className="rounded-lg border border-violet-500/30 bg-zinc-900 p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-bold uppercase tracking-wide">IA · Análise Financeira</span>
            </div>
            <ul className="space-y-1.5 flex-1">
              {frasesIA.slice(0, 6).map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-zinc-300">
                  {b.tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    : b.tone === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    : <ShieldAlert className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />}
                  <span>{b.txt}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => setAnaliseAberta(true)}
              className="mt-2 w-full bg-zinc-950 border-zinc-700 text-zinc-100 hover:bg-zinc-800">
              Ver Análise Completa
            </Button>
          </div>
        </div>

        {/* ======================= CUSTOS DOS FUNCIONÁRIOS ======================= */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold uppercase tracking-wide">Custos Completos dos Funcionários</span>
            <span className="text-[11px] text-zinc-500">(posicione o mouse para ver detalhes)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 font-semibold">Funcionário</th>
                  <th className="text-right py-2 font-semibold">Salário Base</th>
                  <th className="text-right py-2 font-semibold">Custo Total</th>
                  <th className="text-right py-2 font-semibold">Custo Médio Diário</th>
                  <th className="text-right py-2 font-semibold">% sobre Folha</th>
                  <th className="text-left py-2 pl-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f: any) => (
                  <tr key={f.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                    <td className="py-1.5">
                      <HoverCard openDelay={150}>
                        <HoverCardTrigger asChild>
                          <span className="font-medium cursor-help inline-flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${f.semSalario ? "bg-amber-400" : "bg-emerald-400"}`} />
                            {f.name}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" align="start"
                          className="w-96 max-h-[70vh] overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-100 shadow-2xl">
                          <div className="font-bold text-sm text-white mb-1">Custos totais de {f.name}</div>
                          <H>1. Remuneração</H>
                          <L label="Salário Base" value={brl(f.salarioProporcional)} />
                          <L label="Horas Extras" value={brl(f.horaExtra)} />
                          <L label="Adicional Noturno" value={brl(f.adicionalNoturno)} />
                          <L label="Periculosidade" value={brl(f.periculosidade)} />
                          <L label="Total da Remuneração" value={brl(f.totalBruto)} strong />
                          <H>2. Encargos (informativos)</H>
                          <L label={`FGTS (${f.fgtsPct}%)`} value={brl(f.fgts)} />
                          <L label={`INSS Patronal (${f.inssPatronalPct}%)`} value={brl(f.inssPatronal)} />
                          <L label="Seguro de Vida" value={brl(f.seguroVida)} />
                          <H>3. Benefícios</H>
                          <L label={`Vale Refeição (${f.vrDias}d × ${brl(f.vrDiario)})`} value={brl(f.vrTotal)} />
                          <L label="Cesta Básica" value={brl(f.cesta)} />
                          <L label="Diárias" value={brl(f.diarias)} />
                          <H>4. Provisões</H>
                          <L label="Férias / 13º / Rescisão" value="não provisionado (modelo Torres)" />
                          <H>5. Custos Indiretos</H>
                          <L label="Uniformes / EPIs / Treinamentos" value="—" />
                          <H>6. Indicadores Operacionais (mês)</H>
                          <L label="Horas trabalhadas" value={`${f.horas.toFixed(1)} h`} />
                          <L label="Dias trabalhados (aprox.)" value={String(f.dias)} />
                          <L label="Missões executadas" value={String(f.missoes)} />
                          <L label="Receita gerada (quota)" value={brl(f.receitaGerada)} />
                          {f.receitaPorMissao != null && <L label="Valor médio por missão" value={brl(f.receitaPorMissao)} />}
                          {f.custoPorMissao != null && <L label="Custo por missão" value={brl(f.custoPorMissao)} />}
                          {f.lucroOperacional != null && (
                            <L label="Lucro operacional (receita − custo)" value={brl(f.lucroOperacional)} strong />
                          )}
                          <H>7. Resumo Financeiro</H>
                          <L label="Custo Total" value={brl(f.total)} strong />
                          <L label="Custo Médio Diário" value={brl(f.custoDiario)} />
                          <L label="Custo por Hora" value={brl(f.custoHoraReal)} />
                          <L label="% sobre a Folha" value={pct(f.pctFolha)} />
                          <L label="% sobre custos totais da empresa" value={pct(f.pctEmpresa)} />
                        </HoverCardContent>
                      </HoverCard>
                    </td>
                    <td className="text-right tabular-nums text-zinc-300">{brl(f.salarioProporcional)}</td>
                    <td className="text-right tabular-nums font-semibold">{brl(f.total)}</td>
                    <td className="text-right tabular-nums text-zinc-300">{brl(f.custoDiario)}</td>
                    <td className="text-right tabular-nums text-zinc-300">{pct(f.pctFolha)}</td>
                    <td className="pl-4">
                      {f.semSalario
                        ? <Badge className="bg-amber-500 text-black text-[10px]">sem salário</Badge>
                        : <span className="text-emerald-400 text-xs font-semibold">Ativo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="py-2">TOTAL GERAL</td>
                  <td />
                  <td className="text-right tabular-nums">{brl(totalFolha)}</td>
                  <td className="text-right tabular-nums">{brl(totalFolha / 30)}</td>
                  <td className="text-right tabular-nums">{custosTotaisEmpresa > 0 ? pct((totalFolha / custosTotaisEmpresa) * 100) : "—"}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ======================= RESUMO FINANCEIRO + BALANÇO (consequência) ======================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="text-sm font-bold uppercase tracking-wide mb-2">Resumo Financeiro (rota do dinheiro)</div>
            {val ? (
              <div className="space-y-1 text-sm">
                <L label="Faturamento oficial (medição)" value={brl(val.resumoFinanceiro?.faturamentoOficial)} strong />
                <L label="Já faturado (com fatura emitida)" value={brl(val.resumoFinanceiro?.faturamentoFaturado)} />
                <L label="Recebido (faturas ativas)" value={brl(val.resumoFinanceiro?.recebidoTotal)} />
                <L label="Custos de missões" value={brl(val.resumoFinanceiro?.custosMissoes)} />
                <div className="pt-1 text-[11px] text-zinc-500">
                  Cadeia certificada: Contrato → OS → Boletim → Fatura → Recebimento. Divergências aparecem no Painel de Validação acima.
                </div>
              </div>
            ) : <div className="text-zinc-500 text-sm">—</div>}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 flex flex-col justify-between">
            <div>
              <div className="text-sm font-bold uppercase tracking-wide mb-1">Balanço Gerencial completo</div>
              <p className="text-[12px] text-zinc-400">
                Gráficos, rankings por viatura e por agente, missões detalhadas e projeções — com os MESMOS números certificados desta tela.
              </p>
            </div>
            <Link href="/admin/balanco-gerencial">
              <Button variant="outline" size="sm" className="mt-3 bg-zinc-950 border-zinc-700 text-zinc-100 hover:bg-zinc-800 w-fit">
                Abrir Balanço Gerencial <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* ======================= DIALOG: KPI (motivo + memória de cálculo) ======================= */}
        <Dialog open={!!kpiAberto} onOpenChange={(o) => !o && setKpiAberto(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-zinc-100">
                <Calculator className="h-4 w-4 text-violet-400" /> {kpiAberto ? KPI_DIALOG[kpiAberto]?.titulo : ""}
              </DialogTitle>
            </DialogHeader>
            {kpiAberto === "fat" && (
              <div className="space-y-1">
                <H>Base considerada</H>
                <L label="Missões consideradas no período" value={String(memFat.total)} />
                <L label="— com boletim finalizado (congelado)" value={`${memFat.finalizadas} · ${brl(totals.fatCongelado)}`} />
                <L label="— em aberto (recálculo ao vivo)" value={`${memFat.abertas} · ${brl(totals.fatAberto)}`} />
                <L label="Canceladas (cobradas pela tabela 100km)" value={String(memFat.canceladas)} />
                <L label="Recusadas (excluídas — valem R$ 0)" value={String(memFat.recusadas)} />
                <H>Fórmula</H>
                <p className="text-xs text-zinc-300">
                  Para cada OS: boletim APROVADO/FATURADO/PAGO ou OS cancelada → vale o valor CONGELADO do boletim;
                  demais → recálculo ao vivo pelo motor canônico da Gestão de Medição (acionamento + km excedente + adicionais).
                  Soma das {memFat.total} missões = <b className="text-white">{brl(totals.fat)}</b>.
                </p>
                <H>Validações aplicadas</H>
                <L label="Gestão de Medição (motor canônico)" value="✓ mesma fonte" />
                <L label="Regra recusada = R$ 0" value="✓ verificada pela auditoria" />
                <L label="Duplicidade de boletim/fatura" value={aFat.length ? `${aFat.length} apontamento(s) abaixo` : "✓ nenhuma"} />
              </div>
            )}
            {kpiAberto === "custo" && (
              <div className="space-y-1">
                <H>Composição</H>
                <L label="Pagamento de agentes (VRP das missões)" value={brl(totals.pag)} />
                <L label="Despesas operacionais (combustível, pedágio, manutenção)" value={brl(totals.desp_combustivel + totals.desp_pedagio + totals.desp_manutencao)} />
                <L label={`Pessoal (RH — folha rateada ${costDays}d)`} value={brl(totals.provisaoRH)} />
                <L label={`Custos fixos rateados (${costDays}d de ${brl(totals.custosFixosMensal)}/mês)`} value={brl(totals.custosFixosRateados)} />
                <L label="Custo Total" value={brl(totals.custoTotal)} strong />
                <H>Regras anti-dupla contagem</H>
                <p className="text-xs text-zinc-300">
                  Lançamentos manuais de folha, estrutura e categorias sem origem oficial NÃO entram no operacional —
                  já estão cobertos pelo rateio de RH e pelos custos fixos. Reembolsos de missão não entram no VRP.
                </p>
              </div>
            )}
            {(kpiAberto === "lucro" || kpiAberto === "margem") && (
              <div className="space-y-1">
                <H>Fórmula</H>
                <L label="Faturamento certificado" value={brl(totals.fat)} />
                <L label="(−) Custo total certificado" value={brl(totals.custoTotal)} />
                <L label="(=) Lucro líquido" value={brl(totals.lucro)} strong />
                <L label="Margem = lucro ÷ faturamento" value={pct(totals.margem)} strong />
                <L label="Meta de margem" value="35%" />
                <p className="text-xs text-zinc-400 pt-1">O lucro herda a certificação do faturamento e dos custos — qualquer divergência aberta em um deles aparece abaixo.</p>
              </div>
            )}
            {kpiAberto === "km" && (
              <div className="space-y-1">
                <H>Base</H>
                <L label="Missões com KM apurado" value={String(memFat.total)} />
                <L label="KM total (boletins + grid operacional)" value={`${fmtNum(totals.km)} km`} strong />
                <L label="Média por dia" value={`${fmtNum(kmMediaDia)} km (${daysInPeriod} dias)`} />
                <L label="Média por missão" value={`${fmtNum(kmMediaMissao)} km`} />
              </div>
            )}
            {kpiAberto === "efic" && (
              <div className="space-y-1">
                <H>Método tanque-a-tanque</H>
                <p className="text-xs text-zinc-300">
                  km/L por viatura = km rodado entre abastecimentos ÷ litros do abastecimento (descarta saltos de hodômetro &gt; 3.000 km e litragens fora do padrão).
                </p>
                <L label="Frota apurada" value={`${eficiencia.perVehicle.length} viaturas · ${fmtNum(eficiencia.totalKm)} km · ${fmtNum(eficiencia.totalLiters)} L`} />
                <L label="Média da frota" value={`${eficiencia.mediaKmL.toFixed(1)} km/L`} strong />
                <H>Viaturas abaixo de 14 km/L</H>
                {eficiencia.abaixo.length === 0 ? (
                  <p className="text-xs text-emerald-400">Nenhuma — frota toda acima da meta.</p>
                ) : eficiencia.abaixo.map((v) => (
                  <L key={v.plate} label={`${v.plate} ${v.model ? `(${v.model})` : ""}`} value={`${v.kmL.toFixed(1)} km/L · ${fmtNum(v.km)} km / ${fmtNum(v.liters)} L`} />
                ))}
              </div>
            )}
            {/* motivos (achados relacionados) */}
            {kpiAberto && KPI_DIALOG[kpiAberto]?.achados.length > 0 && (
              <div className="space-y-2 border-t border-zinc-700 pt-2">
                <div className="text-xs font-bold uppercase text-amber-400">
                  Por que não está 100% certificado — {KPI_DIALOG[kpiAberto].achados.length} apontamento(s), {brl(somaValor(KPI_DIALOG[kpiAberto].achados))} em jogo
                </div>
                {KPI_DIALOG[kpiAberto].achados.slice(0, 15).map((a: any) => (
                  <div key={a.id} className="rounded border border-zinc-700 bg-zinc-950/60 p-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{a.titulo}</span>
                      <div className="flex items-center gap-1.5">
                        {Number(a.valor) > 0 && <span className="text-[11px] font-semibold text-amber-400 tabular-nums">{brl(a.valor)}</span>}
                        <SevBadge sev={a.severidade} />
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400">{a.detalhe}</p>
                    <Link href={a.origem} className="text-[11px] text-violet-400 inline-flex items-center gap-1 hover:underline">
                      Abrir origem <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
                {KPI_DIALOG[kpiAberto].achados.length > 15 && (
                  <p className="text-[11px] text-zinc-500">… e mais {KPI_DIALOG[kpiAberto].achados.length - 15} no Painel de Validação.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ======================= DIALOG: IA COMPLETA ======================= */}
        <Dialog open={analiseAberta} onOpenChange={setAnaliseAberta}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-zinc-100">
                <Sparkles className="h-4 w-4 text-violet-400" /> IA Auditora — Análise Completa
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {frasesIA.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-zinc-300">
                    {b.tone === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      : b.tone === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      : <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                    <span>{b.txt}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {["Faça uma análise completa da saúde financeira do período.", "Existe algum custo duplicado?", "Existe OS sem faturamento?", "Quais as divergências mais graves e como corrigir?"].map((q) => (
                  <Button key={q} variant="secondary" size="sm" disabled={perguntar.isPending}
                    className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    onClick={() => { setPergunta(q); perguntar.mutate(q); }}>{q}</Button>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pergunta.trim()) perguntar.mutate(pergunta.trim()); }}>
                <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex.: Por que o lucro caiu?"
                  className="bg-zinc-950 border-zinc-700 text-zinc-100" />
                <Button type="submit" disabled={perguntar.isPending || !pergunta.trim()}>
                  {perguntar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
                </Button>
              </form>
              {perguntar.isPending && <div className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Auditando e analisando…</div>}
              {resposta && !perguntar.isPending && (
                <div className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3 text-sm whitespace-pre-wrap">{resposta}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ======================= DIALOG: ACHADOS DO CARD ======================= */}
        <Dialog open={!!cardAberto} onOpenChange={(o) => !o && setCardAberto(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">
                {(val?.cards || []).find((c: any) => c.categoria === cardAberto)?.titulo || "Achados"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {cardAberto && achadosDoCard(cardAberto).map((a: any) => (
                <div key={a.id} className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{a.titulo}</span>
                    <div className="flex items-center gap-2">
                      {Number(a.valor) > 0 && <span className="text-xs font-semibold text-amber-400 tabular-nums">{brl(a.valor)}</span>}
                      <SevBadge sev={a.severidade} />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400">{a.detalhe}</p>
                  <Link href={a.origem} className="text-xs text-violet-400 inline-flex items-center gap-1 hover:underline">
                    Abrir origem <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
