// =============================================================================
// GESTOR DE MEDIÇÃO SÊNIOR — auditoria de faturamento das OS
// Cada OS é recalculada pelo motor oficial e comparada com o valor cobrado.
// Verde = pode aprovar; vermelho = revisar; amarelo = análise manual.
// =============================================================================
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Loader2, RefreshCw,
  Search, Sparkles, ChevronDown, ChevronUp, ArrowLeft, Scale, FileWarning,
} from "lucide-react";

interface AuditRow {
  id: number;
  service_order_id: number;
  os_number: string | null;
  client_name: string | null;
  data_missao: string | null;
  os_status: string;
  billing_status: string | null;
  analysis_status: string;
  verdict: string;
  recommendation: string;
  risk_level: string | null;
  expected_total: number | null;
  charged_total: number;
  difference: number | null;
  issues: Array<{ type: string; severity: string; message: string }> | null;
  memoria: any;
  analyzed_at: string;
  analyzed_by: string | null;
}

interface Resumo {
  total: number; calculadasOk: number; comDivergencia: number;
  dadosIncompletos: number; atencao: number; aguardandoRevisao: number;
  cobradoAMaior: number; cobradoAMenor: number; totalDivergencias: number;
}

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDia = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "—";
};

function statusBadge(s: string) {
  if (s === "CALCULADO_OK") return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-semibold"><CheckCircle2 className="h-3 w-3" /> Calculado OK</span>;
  if (s === "EXCECAO_JUSTIFICADA") return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-semibold"><Scale className="h-3 w-3" /> Exceção justificada</span>;
  if (s.startsWith("DIVERGENCIA")) {
    const label = s === "DIVERGENCIA_KM" ? "Divergência KM" : s === "DIVERGENCIA_HORAS" ? "Divergência horas" : "Divergência valor";
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold"><XCircle className="h-3 w-3" /> {label}</span>;
  }
  const label = s === "DADOS_INCOMPLETOS" ? "Dados incompletos" : s === "REGRA_NAO_ENCONTRADA" ? "Sem tabela" : "Atenção";
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold"><AlertTriangle className="h-3 w-3" /> {label}</span>;
}

const sevColor: Record<string, string> = {
  CRITICA: "text-red-700", ALTA: "text-red-600", MEDIA: "text-amber-600", BAIXA: "text-slate-500",
};

export default function GestorMedicaoPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("TODOS");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [confirmAprovar, setConfirmAprovar] = useState(false);
  const [explicacao, setExplicacao] = useState<Record<number, string>>({});
  const [explicandoOs, setExplicandoOs] = useState<number | null>(null);
  const [excecaoOs, setExcecaoOs] = useState<AuditRow | null>(null);
  const [motivoExcecao, setMotivoExcecao] = useState("");
  const [salvandoExcecao, setSalvandoExcecao] = useState(false);

  const { data, isLoading, error: loadError } = useQuery<{ resumo: Resumo; resultados: AuditRow[] }>({
    queryKey: ["/api/gestor-medicao/resultados"],
    queryFn: async () => {
      const r = await authFetch("/api/gestor-medicao/resultados");
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Erro ao carregar");
      return r.json();
    },
  });

  const resultados = data?.resultados || [];
  const resumo = data?.resumo;

  const filtrados = useMemo(() => {
    let rows = resultados;
    if (filtro === "OK") rows = rows.filter((r) => r.analysis_status === "CALCULADO_OK");
    else if (filtro === "DIVERGENCIA") rows = rows.filter((r) => r.analysis_status.startsWith("DIVERGENCIA"));
    else if (filtro === "INCOMPLETO") rows = rows.filter((r) => ["DADOS_INCOMPLETOS", "REGRA_NAO_ENCONTRADA", "ATENCAO"].includes(r.analysis_status));
    else if (filtro === "PENDENTE") rows = rows.filter((r) => r.billing_status === "A_VERIFICAR");
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      rows = rows.filter((r) => (r.os_number || "").toLowerCase().includes(q) || (r.client_name || "").toLowerCase().includes(q));
    }
    return rows;
  }, [resultados, filtro, busca]);

  const aprovaveis = useMemo(
    () => resultados.filter((r) => r.analysis_status === "CALCULADO_OK" && r.billing_status === "A_VERIFICAR" && r.os_status !== "recusada"),
    [resultados],
  );

  const refetch = () => qc.invalidateQueries({ queryKey: ["/api/gestor-medicao/resultados"] });

  const analisarTudo = async () => {
    setAnalisando(true);
    try {
      const r = await authFetch("/api/gestor-medicao/analisar-lote", { method: "POST", body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Erro na análise");
      toast({ title: "Análise concluída", description: `${j.resumo.total} OS auditadas — ${j.resumo.calculadasOk} OK, ${j.resumo.comDivergencia} com divergência.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro na análise", description: e.message, variant: "destructive" });
    } finally { setAnalisando(false); }
  };

  const reanalisar = async (osId: number) => {
    try {
      const r = await authFetch(`/api/gestor-medicao/analisar/${osId}`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Erro");
      toast({ title: "OS reanalisada" });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const explicar = async (osId: number) => {
    setExplicandoOs(osId);
    try {
      const r = await authFetch(`/api/gestor-medicao/explicar/${osId}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Erro");
      setExplicacao((p) => ({ ...p, [osId]: j.explicacao }));
    } catch (e: any) {
      toast({ title: "Erro na explicação", description: e.message, variant: "destructive" });
    } finally { setExplicandoOs(null); }
  };

  const aprovarLote = async () => {
    setAprovando(true);
    setConfirmAprovar(false);
    try {
      const r = await authFetch("/api/gestor-medicao/aprovar-lote", {
        method: "POST",
        body: JSON.stringify({ osIds: aprovaveis.map((a) => a.service_order_id) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Erro");
      toast({
        title: `${j.aprovadas.length} OS aprovadas`,
        description: `Total ${brl(j.totalAprovado)}. ${j.puladas.length ? `${j.puladas.length} puladas (re-análise divergiu ou status mudou).` : ""}`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro na aprovação", description: e.message, variant: "destructive" });
    } finally { setAprovando(false); }
  };

  const salvarExcecao = async () => {
    if (!excecaoOs) return;
    setSalvandoExcecao(true);
    try {
      const r = await authFetch(`/api/gestor-medicao/excecao/${excecaoOs.service_order_id}`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoExcecao }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Erro");
      toast({ title: "Exceção aprovada", description: `Boletim ${j.boletim} — ${brl(j.valor)} (justificativa registrada).` });
      setExcecaoOs(null); setMotivoExcecao("");
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setSalvandoExcecao(false); }
  };

  const memoriaBlock = (r: AuditRow) => {
    const m = r.memoria;
    if (!m) return null;
    const linhas: Array<[string, string]> = [];
    if (m.regra) linhas.push(["Regra aplicada", m.regra]);
    if (m.tabela) linhas.push(["Tabela", `${m.tabela.nome || m.tabela.id || "—"} · acionamento ${brl(m.tabela.acionamento)} · franquia ${m.tabela.franquia_km} km / ${m.tabela.franquia_horas} h · KM exc. ${brl(m.tabela.valor_km_excedente)} · hora exc. ${brl(m.tabela.valor_hora_excedente)} (${m.tabela.regra_hora === "ARREDONDAR_HORA_COMPLETA" ? "hora cheia" : "proporcional"})`]);
    if (m.missao) linhas.push(["Missão", `${m.missao.inicio || "—"} → ${m.missao.fim || "—"} (${m.missao.duracao || "—"}) · KM ${m.missao.km_inicial}→${m.missao.km_final} = ${m.missao.km_executado} km (franquia ${m.missao.km_franquia}, excedente ${m.missao.km_excedente})`]);
    return (
      <div className="space-y-2">
        {linhas.map(([k, v]) => (
          <div key={k} className="text-xs"><span className="font-semibold text-slate-600">{k}:</span> <span className="text-slate-700">{v}</span></div>
        ))}
        {m.calculo_correto && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {(["calculo_correto", "cobrado"] as const).map((lado) => (
              <div key={lado} className="rounded border p-2 bg-white">
                <div className="text-xs font-bold mb-1">{lado === "calculo_correto" ? "✔ Valor correto (motor oficial)" : "Cobrado no boletim"}</div>
                {Object.entries(m[lado] || {}).map(([k, v]) => (
                  <div key={k} className={`flex justify-between text-xs ${k === "total" ? "font-bold border-t mt-1 pt-1" : ""}`}>
                    <span className="capitalize">{k.replace(/_/g, " ")}</span><span>{brl(Number(v))}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/admin/boletim-medicao"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-xl md:text-2xl font-bold">Gestor de Medição Sênior</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-10">Auditoria automática: cada OS recalculada pela tabela do cliente e comparada com o valor cobrado.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={analisarTudo} disabled={analisando} data-testid="button-analisar-lote">
              {analisando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {analisando ? "Analisando…" : "Analisar todas as OS"}
            </Button>
            <Button
              variant="default" className="bg-green-600 hover:bg-green-700"
              disabled={aprovando || aprovaveis.length === 0}
              onClick={() => setConfirmAprovar(true)}
              data-testid="button-aprovar-ok"
            >
              {aprovando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Aprovar todas Calculadas OK ({aprovaveis.length})
            </Button>
          </div>
        </div>

        {resumo && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { l: "OS analisadas", v: String(resumo.total), c: "" },
              { l: "Calculadas OK", v: String(resumo.calculadasOk), c: "text-green-700" },
              { l: "Com divergência", v: String(resumo.comDivergencia), c: "text-red-700" },
              { l: "Dados incompletos", v: String(resumo.dadosIncompletos + resumo.atencao), c: "text-amber-700" },
              { l: "Aguardando revisão", v: String(resumo.aguardandoRevisao), c: "" },
              { l: "Cobrado a maior", v: brl(resumo.cobradoAMaior), c: "text-red-700" },
              { l: "Cobrado a menor", v: brl(resumo.cobradoAMenor), c: "text-amber-700" },
            ].map((c) => (
              <Card key={c.l} className="p-3">
                <div className="text-[11px] text-muted-foreground">{c.l}</div>
                <div className={`text-lg font-bold ${c.c}`}>{c.v}</div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar OS ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8 w-56" />
          </div>
          {[["TODOS", "Todas"], ["OK", "Calculado OK"], ["DIVERGENCIA", "Divergências"], ["INCOMPLETO", "Atenção/Incompletas"], ["PENDENTE", "A verificar"]].map(([k, l]) => (
            <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} onClick={() => setFiltro(k)}>{l}</Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : loadError ? (
          <Card className="p-10 text-center text-red-600">
            <XCircle className="h-10 w-10 mx-auto mb-3" />
            Erro ao carregar as análises: {(loadError as Error).message}
          </Card>
        ) : resultados.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <FileWarning className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhuma análise ainda. Clique em <b>Analisar todas as OS</b> para rodar a auditoria completa.
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-2">OS</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Data</th>
                  <th className="text-right p-2">Cobrado</th>
                  <th className="text-right p-2">Correto</th>
                  <th className="text-right p-2">Diferença</th>
                  <th className="text-left p-2">Status análise</th>
                  <th className="text-left p-2">Boletim</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <Fragment key={r.service_order_id}>
                    <tr className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === r.service_order_id ? null : r.service_order_id)} data-testid={`row-audit-${r.service_order_id}`}>
                      <td className="p-2 font-medium">{r.os_number || `#${r.service_order_id}`}</td>
                      <td className="p-2">{r.client_name || "—"}</td>
                      <td className="p-2 whitespace-nowrap">{fmtDia(r.data_missao)}</td>
                      <td className="p-2 text-right">{brl(r.charged_total)}</td>
                      <td className="p-2 text-right">{brl(r.expected_total)}</td>
                      <td className={`p-2 text-right font-semibold ${!r.difference ? "" : r.difference > 0 ? "text-red-600" : "text-amber-600"}`}>
                        {r.difference == null ? "—" : r.difference === 0 ? "R$ 0,00" : `${r.difference > 0 ? "+" : ""}${brl(r.difference)}`}
                      </td>
                      <td className="p-2">{statusBadge(r.analysis_status)}</td>
                      <td className="p-2 text-xs">{r.billing_status || "—"}{r.os_status !== "concluida" ? ` · ${r.os_status}` : ""}</td>
                      <td className="p-2">{expanded === r.service_order_id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                    </tr>
                    {expanded === r.service_order_id && (
                      <tr className="border-t bg-slate-50/70">
                        <td colSpan={9} className="p-4">
                          <div className={`text-sm font-bold mb-2 ${r.analysis_status === "CALCULADO_OK" ? "text-green-700" : r.analysis_status.startsWith("DIVERGENCIA") ? "text-red-700" : "text-amber-700"}`}>{r.verdict}</div>
                          {(r.issues || []).length > 0 && (
                            <ul className="mb-3 space-y-1">
                              {(r.issues || []).map((i, ix) => (
                                <li key={ix} className={`text-xs flex gap-1 ${sevColor[i.severity] || ""}`}>
                                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span><b>[{i.severity}]</b> {i.message}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {memoriaBlock(r)}
                          {explicacao[r.service_order_id] && (
                            <div className="mt-3 rounded border bg-blue-50 p-3 text-xs whitespace-pre-wrap text-slate-800">
                              <div className="font-bold mb-1 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Explicação do analista (IA)</div>
                              {explicacao[r.service_order_id]}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); reanalisar(r.service_order_id); }}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reanalisar
                            </Button>
                            <Button size="sm" variant="outline" disabled={explicandoOs === r.service_order_id} onClick={(e) => { e.stopPropagation(); explicar(r.service_order_id); }}>
                              {explicandoOs === r.service_order_id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />} Explicar (IA)
                            </Button>
                            {r.billing_status === "A_VERIFICAR" && r.analysis_status !== "CALCULADO_OK" && r.os_status !== "recusada" && (
                              <Button size="sm" variant="outline" className="border-purple-300 text-purple-700" onClick={(e) => { e.stopPropagation(); setExcecaoOs(r); }}>
                                <Scale className="h-3.5 w-3.5 mr-1" /> Aprovar por exceção (diretoria)
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Confirmação da aprovação em lote */}
      <Dialog open={confirmAprovar} onOpenChange={setConfirmAprovar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar {aprovaveis.length} OS Calculadas OK?</DialogTitle>
            <DialogDescription>
              Cada OS será <b>re-verificada na hora</b> e aprovada de verdade (gera boletim, lança receita no financeiro e fica registrada na auditoria) — mesmo efeito do botão Aprovar do Boletim de Medição. OS que divergirem na re-verificação serão puladas.
              <br /><br />Total estimado: <b>{brl(aprovaveis.reduce((s, a) => s + (a.charged_total || 0), 0))}</b>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAprovar(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={aprovarLote} data-testid="button-confirmar-aprovar">Aprovar {aprovaveis.length} OS</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exceção justificada */}
      <Dialog open={!!excecaoOs} onOpenChange={(o) => { if (!o) { setExcecaoOs(null); setMotivoExcecao(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar por exceção — OS {excecaoOs?.os_number || `#${excecaoOs?.service_order_id}`}</DialogTitle>
            <DialogDescription>
              A OS será aprovada <b>mantendo o valor cobrado ({brl(excecaoOs?.charged_total)})</b>, mesmo com a análise apontando {excecaoOs?.expected_total != null ? `valor correto de ${brl(excecaoOs?.expected_total)}` : "pendências"}. Exige perfil diretoria e a justificativa fica gravada na trilha de auditoria.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Justificativa obrigatória (mín. 10 caracteres) — ex.: valor negociado com o cliente em..." value={motivoExcecao} onChange={(e) => setMotivoExcecao(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setExcecaoOs(null); setMotivoExcecao(""); }}>Cancelar</Button>
            <Button disabled={motivoExcecao.trim().length < 10 || salvandoExcecao} onClick={salvarExcecao}>
              {salvandoExcecao ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scale className="h-4 w-4 mr-2" />} Aprovar com justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
