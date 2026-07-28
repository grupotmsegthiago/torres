// =============================================================================
// GESTOR DE DADOS FINANCEIRO · BALANÇO GERENCIAL CERTIFICADO
// Dashboard que CERTIFICA os KPIs do Balanço Gerencial: os números vêm das
// MESMAS fontes e das MESMAS funções de cálculo (client/src/lib/balanco-calc.ts)
// — nenhuma tabela paralela, nenhum cálculo novo. O que muda é o selo de
// validação ao lado de cada número (motor de auditoria só-leitura).
// Fontes:
//  - /api/financial/dashboard?cached=1        (custos, despesas, abastecimentos)
//  - /api/operational-grid?from&to&cached=1   (receita canônica ao vivo por OS)
//  - /api/fixed-costs/rh-summary?cached=1     (folha oficial — fluxo de caixa)
//  - /api/fixed-costs/summary                 (custos fixos mensais)
//  - /api/gestor-dados/validacao?de&ate       (motor de auditoria, só leitura)
// =============================================================================
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authFetch } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Sparkles, AlertTriangle, CheckCircle2,
  ExternalLink, Loader2, Users, Database, Printer, DollarSign, TrendingDown,
  TrendingUp, Percent, MapPin, Fuel, BadgeCheck,
} from "lucide-react";
import { Link } from "wouter";
import { useMetaConfig, calcMeta } from "@/lib/meta-faturamento";
import { buildMissoesPeriodo, buildTotaisBalanco, buildEficiencia } from "@/lib/balanco-calc";

const brl = (v: any) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlK = (v: any) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl(n);
};
const fmtNum = (v: any, d = 0) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });

const DATA_CORTE = "2026-06-01";
const hojeStr = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SEV_META: Record<string, { label: string; cls: string }> = {
  CRITICA: { label: "Crítica", cls: "bg-red-600 text-white" },
  ALTA: { label: "Alta", cls: "bg-orange-500 text-white" },
  MEDIA: { label: "Média", cls: "bg-amber-400 text-black" },
  BAIXA: { label: "Baixa", cls: "bg-slate-400 text-white" },
};
function SevBadge({ sev }: { sev: string | null }) {
  if (!sev) return null;
  const m = SEV_META[sev] || SEV_META.BAIXA;
  return <Badge className={m.cls}>{m.label}</Badge>;
}

// Selo de certificação do KPI: verde = nenhuma divergência aberta na(s)
// categoria(s) que alimentam o número; âmbar = há achados a conferir.
function Selo({ ok, count }: { ok: boolean; count: number }) {
  return ok ? (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-500" title="Certificado — sem divergências abertas">
      <BadgeCheck className="h-3.5 w-3.5" /> validado
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-500" title={`${count} apontamento(s) em aberto nas verificações relacionadas`}>
      <AlertTriangle className="h-3 w-3" /> {count} a conferir
    </span>
  );
}

const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

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

export default function GestorDadosPage() {
  const [de, setDe] = useState(DATA_CORTE);
  const [ate, setAte] = useState(hojeStr());
  const [cardAberto, setCardAberto] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);
  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // ---------------- Fontes oficiais (idênticas às do Balanço Gerencial) ----------------
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

  // ---------------- KPIs — MESMO cálculo do Balanço Gerencial ----------------
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
  // Fallback CCT idêntico ao do Balanço quando o rh-summary não traz mensal válido.
  const { data: allEmployees } = useQuery<any[]>({ queryKey: ["/api/employees"] });
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

  // ---------------- Selos: liga cada KPI às categorias do motor ----------------
  const achadosCat = (cats: string[]) =>
    ((val?.achados || []) as any[]).filter((a) => cats.includes(a.categoria)).length;
  const seloFat = achadosCat(["billing_duplicado", "os_em_multiplas_faturas", "valor_fora_padrao", "conciliacao_pendente"]);
  const seloCusto = achadosCat(["custo_duplicado", "lancamento_duplicado", "rh_inconsistente"]);
  const seloLucro = seloFat + seloCusto;
  const seloRecebimento = achadosCat(["fatura_duplicada", "inconsistencia_financeira", "nf_repetida"]);

  // ---------------- Sincronizar (força as fontes + auditoria) ----------------
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

  // ---------------- Bullets da análise (derivados dos dados, sem IA) ----------------
  const bullets = useMemo(() => {
    const out: { tone: "ok" | "warn" | "bad"; txt: string }[] = [];
    if (totals.fat > 0) {
      const pctMeta = metaPeriodo > 0 ? (totals.fat / metaPeriodo) * 100 : 0;
      out.push({
        tone: pctMeta >= 100 ? "ok" : pctMeta >= 80 ? "warn" : "bad",
        txt: `Faturamento em ${brlK(totals.fat)} — ${pctMeta > 0 ? `${pctMeta.toFixed(0)}% da meta do período (${brlK(metaPeriodo)})` : "meta não configurada"}.`,
      });
      out.push({
        tone: totals.margem >= 35 ? "ok" : totals.margem >= 25 ? "warn" : "bad",
        txt: `Margem líquida de ${totals.margem.toFixed(1)}% ${totals.margem >= 35 ? "acima" : "abaixo"} da meta de 35%.`,
      });
    }
    if (totals.fatAberto > 0) {
      out.push({ tone: "warn", txt: `${brlK(totals.fatAberto)} ainda em aberto (boletins não aprovados) — valor sujeito a ajuste na medição.` });
    }
    if (eficiencia.abaixo.length > 0) {
      out.push({ tone: "warn", txt: `${eficiencia.abaixo.length} viatura(s) abaixo de 14 km/L: ${eficiencia.abaixo.slice(0, 3).map((v) => v.plate).join(", ")}${eficiencia.abaixo.length > 3 ? "…" : ""}.` });
    }
    const criticas = Number(val?.totais?.porSeveridade?.CRITICA || 0);
    if (criticas > 0) out.push({ tone: "bad", txt: `${criticas} divergência(s) CRÍTICA(s) na auditoria — corrigir antes de fechar o período.` });
    else if (val) out.push({ tone: "ok", txt: `Auditoria sem divergências críticas — integridade ${Number(val.integridadePct).toFixed(1)}%.` });
    return out;
  }, [totals, metaPeriodo, eficiencia, val]);

  // ---------------- Tabela de funcionários (inalterada) ----------------
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
    });
  }, [rh, ind, custosTotaisEmpresa]);

  const achadosDoCard = (categoria: string) =>
    ((val?.achados || []) as any[]).filter((a) => a.categoria === categoria);

  const kpisCarregando = dashLoading || gridLoading;
  const kmMediaDia = totals.km / Math.max(daysInPeriod, 1);
  const kmMediaMissao = totals.total > 0 ? totals.km / totals.total : 0;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* ================= HEADER ================= */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6 text-violet-500" /> Gestor de Dados Financeiro
              <Badge className="bg-violet-600 text-white gap-1"><Sparkles className="h-3 w-3" /> IA ATIVA</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Balanço Gerencial certificado — mesmos números, com selo de auditoria em cada indicador.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} className="h-9 w-[150px]" />
              <span className="text-muted-foreground">até</span>
              <Input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} className="h-9 w-[150px]" />
            </div>
            <Button variant="outline" size="sm" disabled={sincronizando || valFetching} onClick={sincronizar}>
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sincronizar Dados
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Gerar Relatório
            </Button>
          </div>
        </div>

        {/* ================= LINHA DE KPIs CERTIFICADOS ================= */}
        {kpisCarregando ? (
          <div className="flex items-center gap-2 text-muted-foreground p-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando o Balanço do período…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Faturamento</span>
                  <Selo ok={seloFat === 0} count={seloFat} />
                </div>
                <div className="text-xl font-bold tabular-nums">{brlK(totals.fat)}</div>
                <div className="text-[11px] text-muted-foreground">
                  finalizado {brlK(totals.fatCongelado)} · em aberto {brlK(totals.fatAberto)}
                </div>
                {metaPeriodo > 0 && (
                  <div className="text-[11px] text-muted-foreground">meta período: {brlK(metaPeriodo)}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" /> Custos Totais</span>
                  <Selo ok={seloCusto === 0} count={seloCusto} />
                </div>
                <div className="text-xl font-bold tabular-nums text-red-500">{brlK(totals.custoTotal)}</div>
                <div className="text-[11px] text-muted-foreground">
                  operacional {brlK(totals.custoTotal - totals.provisaoRH - totals.custosFixosRateados)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  RH {brlK(totals.provisaoRH)} · fixos {brlK(totals.custosFixosRateados)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Lucro Líquido</span>
                  <Selo ok={seloLucro === 0} count={seloLucro} />
                </div>
                <div className={`text-xl font-bold tabular-nums ${totals.lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {brlK(totals.lucro)}
                </div>
                <div className="text-[11px] text-muted-foreground">{totals.total} missões no período</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Percent className="h-3.5 w-3.5" /> Margem Líquida</span>
                  <Selo ok={seloLucro === 0} count={seloLucro} />
                </div>
                <div className={`text-xl font-bold tabular-nums ${totals.margem >= 35 ? "text-emerald-500" : totals.margem >= 25 ? "text-amber-500" : "text-red-500"}`}>
                  {totals.margem.toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground">meta: 35%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> KM Rodado</span>
                  <Selo ok={seloFat === 0} count={seloFat} />
                </div>
                <div className="text-xl font-bold tabular-nums">{fmtNum(totals.km)} km</div>
                <div className="text-[11px] text-muted-foreground">
                  {fmtNum(kmMediaDia)} km/dia · {fmtNum(kmMediaMissao)} km/missão
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Fuel className="h-3.5 w-3.5" /> Eficiência km/L</span>
                  <Selo ok={eficiencia.abaixo.length === 0} count={eficiencia.abaixo.length} />
                </div>
                <div className={`text-xl font-bold tabular-nums ${eficiencia.mediaKmL >= 14 ? "text-emerald-500" : "text-amber-500"}`}>
                  {eficiencia.mediaKmL.toFixed(1)} km/L
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {eficiencia.abaixo.length > 0
                    ? `${eficiencia.abaixo.length} VTR abaixo de 14: ${eficiencia.abaixo.slice(0, 2).map((v) => v.plate).join(", ")}${eficiencia.abaixo.length > 2 ? "…" : ""}`
                    : "frota toda acima de 14 km/L"}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ================= IA · ANÁLISE FINANCEIRA ================= */}
        <Card className="border-violet-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> IA · Análise Financeira</span>
              <Button variant="ghost" size="sm" className="text-violet-500" onClick={() => setAnaliseAberta(true)}>
                Ver Análise Completa
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {b.tone === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    : b.tone === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    : <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                  <span>{b.txt}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ================= PAINEL DE VALIDAÇÃO ================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Painel de Validação de Dados
              {val && (
                <span className="text-xs font-normal text-muted-foreground">
                  integridade {Number(val.integridadePct).toFixed(1)}% · {Number(val.totais?.registrosAuditados || 0).toLocaleString("pt-BR")} registros ·{" "}
                  {new Date(val.geradoEm).toLocaleString("pt-BR")}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {valLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground p-4"><Loader2 className="h-5 w-5 animate-spin" /> Auditando dados…</div>
            ) : val ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(val.cards as any[]).map((c) => (
                  <Card
                    key={c.categoria}
                    className={`cursor-pointer transition hover:shadow-md ${c.achados > 0 ? "border-l-4 " + (c.severidadeMax === "CRITICA" ? "border-l-red-600" : c.severidadeMax === "ALTA" ? "border-l-orange-500" : "border-l-amber-400") : "opacity-80"}`}
                    onClick={() => c.achados > 0 && setCardAberto(c.categoria)}>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        {c.titulo} <SevBadge sev={c.severidadeMax} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <div className={`text-2xl font-bold ${c.achados > 0 ? "" : "text-emerald-500"}`}>
                        {c.achados > 0 ? c.achados : <span className="flex items-center gap-1 text-base"><CheckCircle2 className="h-5 w-5" /> OK</span>}
                      </div>
                      {c.achados > 0 && Number(c.valorImpactado) > 0 && (
                        <div className="text-xs font-semibold text-amber-600 tabular-nums">
                          {brl(c.valorImpactado)} em jogo
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-sm text-red-500 p-2">Falha ao carregar a validação.</div>
            )}
          </CardContent>
        </Card>

        {/* ================= CUSTOS COMPLETOS DOS FUNCIONÁRIOS ================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Custos Completos dos Funcionários</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mesmos números da folha oficial (Ponto Eletrônico). Passe o mouse sobre um funcionário para o detalhamento completo.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Salário Base</TableHead>
                    <TableHead className="text-right">Custo Total</TableHead>
                    <TableHead className="text-right">Custo Médio Diário</TableHead>
                    <TableHead className="text-right">% da Folha</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funcionarios.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <HoverCard openDelay={150}>
                          <HoverCardTrigger asChild>
                            <span className="font-medium cursor-help underline decoration-dotted underline-offset-4">{f.name}</span>
                          </HoverCardTrigger>
                          <HoverCardContent side="right" align="start"
                            className="w-96 max-h-[70vh] overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-100 shadow-2xl">
                            <div className="font-bold text-sm text-white mb-1">{f.name}</div>
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
                            <H>5. Outros Custos</H>
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
                            <L label="% sobre a Folha" value={`${f.pctFolha.toFixed(1)}%`} />
                            <L label="% sobre custos totais da empresa" value={`${f.pctEmpresa.toFixed(1)}%`} />
                          </HoverCardContent>
                        </HoverCard>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{brl(f.salarioProporcional)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{brl(f.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(f.custoDiario)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.pctFolha.toFixed(1)}%</TableCell>
                      <TableCell>
                        {f.semSalario
                          ? <Badge className="bg-amber-500 text-black">sem salário</Badge>
                          : <Badge className="bg-emerald-600 text-white">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ================= DIALOG: ANÁLISE COMPLETA (IA) ================= */}
        <Dialog open={analiseAberta} onOpenChange={setAnaliseAberta}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" /> IA Auditora — Análise Completa
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {["Faça uma análise completa da saúde financeira do período.", "Existe algum custo duplicado?", "Existe OS sem faturamento?", "Quais as divergências mais graves e como corrigir?"].map((q) => (
                  <Button key={q} variant="secondary" size="sm" disabled={perguntar.isPending}
                    onClick={() => { setPergunta(q); perguntar.mutate(q); }}>{q}</Button>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pergunta.trim()) perguntar.mutate(pergunta.trim()); }}>
                <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex.: Por que o lucro caiu?" />
                <Button type="submit" disabled={perguntar.isPending || !pergunta.trim()}>
                  {perguntar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
                </Button>
              </form>
              {perguntar.isPending && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Auditando e analisando…</div>}
              {resposta && !perguntar.isPending && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{resposta}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ================= DIALOG: ACHADOS DO CARD ================= */}
        <Dialog open={!!cardAberto} onOpenChange={(o) => !o && setCardAberto(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {(val?.cards || []).find((c: any) => c.categoria === cardAberto)?.titulo || "Achados"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {cardAberto && achadosDoCard(cardAberto).map((a: any) => (
                <div key={a.id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{a.titulo}</span>
                    <div className="flex items-center gap-2">
                      {Number(a.valor) > 0 && <span className="text-xs font-semibold text-amber-600 tabular-nums">{brl(a.valor)}</span>}
                      <SevBadge sev={a.severidade} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.detalhe}</p>
                  <Link href={a.origem} className="text-xs text-blue-500 inline-flex items-center gap-1 hover:underline">
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
