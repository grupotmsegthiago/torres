import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Calculator, Loader2, Paperclip, Save } from "lucide-react";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBRLInput(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

function brtHoje(): { ano: number; mes: number; dia: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { ano: n("year"), mes: n("month"), dia: n("day") };
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function periodoQuinzena(ano: number, mes: number, qual: 1 | 2): { inicio: string; fim: string } {
  const mm = String(mes).padStart(2, "0");
  if (qual === 1) return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-15` };
  const last = String(ultimoDia(ano, mes)).padStart(2, "0");
  return { inicio: `${ano}-${mm}-16`, fim: `${ano}-${mm}-${last}` };
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtQuando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

interface CalcResult {
  inicio: string;
  fim: string;
  totalCobrado: number;
  qtdOs: number;
  ticketlogValor: number | null;
}

interface HistoricoItem {
  id: string;
  inicio: string;
  fim: string;
  valor: number;
  arquivoNome: string | null;
  temAnexo: boolean;
  createdAt: string | null;
  createdBy: string | null;
}

export default function ConferenciaPedagioPage() {
  const { toast } = useToast();
  const hoje = useMemo(() => brtHoje(), []);
  const [ano, setAno] = useState(hoje.ano);
  const [mes, setMes] = useState(hoje.mes);
  const [quinzena, setQuinzena] = useState<1 | 2>(hoje.dia <= 15 ? 1 : 2);
  const [valorPagoStr, setValorPagoStr] = useState("");
  const [ticketlogStr, setTicketlogStr] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arquivoKey, setArquivoKey] = useState(0);
  const [herdado, setHerdado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const periodo = useMemo(() => periodoQuinzena(ano, mes, quinzena), [ano, mes, quinzena]);
  const { inicio, fim } = periodo;
  const nomeMes = useMemo(
    () => new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    [ano, mes],
  );
  const valorPago = parseBRLInput(valorPagoStr);
  const jaTemAnexo = historico.some((h) => h.inicio === inicio && h.fim === fim && h.temAnexo);

  async function carregarHistorico() {
    const res = await authFetch("/api/controladoria/pedagio-ticketlog/historico");
    if (!res.ok) return;
    const data = await res.json().catch(() => []);
    if (Array.isArray(data)) setHistorico(data);
  }

  useEffect(() => {
    carregarHistorico();
  }, []);

  useEffect(() => {
    let cancel = false;
    setResult(null);
    setArquivo(null);
    setHerdado(false);
    (async () => {
      const res = await authFetch(`/api/controladoria/pedagio-ticketlog?inicio=${inicio}&fim=${fim}`);
      if (!res.ok || cancel) return;
      const data = await res.json().catch(() => null);
      if (cancel || !data) return;
      const bruto = data.valorExato != null ? Number(data.valorExato) : Number(data.valor);
      if (!Number.isFinite(bruto) || bruto <= 0) {
        setTicketlogStr("");
        setHerdado(false);
        return;
      }
      setHerdado(data.valorExato == null);
      setTicketlogStr(bruto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    })();
    return () => { cancel = true; };
  }, [inicio, fim]);

  async function salvar() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        inicio,
        fim,
        valor: parseBRLInput(ticketlogStr),
      };
      if (arquivo) {
        const payload = await new Promise<{ fileBase64: string; contentType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            fileBase64: String(reader.result || ""),
            contentType: arquivo.type || "application/octet-stream",
          });
          reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
          reader.readAsDataURL(arquivo);
        });
        body.fileBase64 = payload.fileBase64;
        body.fileName = arquivo.name;
        body.contentType = payload.contentType;
      }
      const res = await authFetch("/api/controladoria/pedagio-ticketlog", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setArquivo(null);
      setArquivoKey((k) => k + 1);
      setHerdado(false);
      toast({
        title: "Quinzena salva",
        description: `${fmtData(inicio)} a ${fmtData(fim)} entrou no custo de pedágio do Balanço.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/controladoria/pedagio-ticketlog"] });
      await carregarHistorico();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function calcular() {
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ inicio, fim });
      const res = await authFetch(`/api/controladoria/pedagio-cobrado?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setResult((await res.json()) as CalcResult);
    } catch (e: any) {
      toast({ title: "Erro ao calcular", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function abrirAnexo(id: string) {
    setAbrindo(id);
    try {
      const res = await authFetch(`/api/controladoria/pedagio-ticketlog/anexo/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.message || "Não foi possível abrir a fatura");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Anexo", description: e.message, variant: "destructive" });
    } finally {
      setAbrindo(null);
    }
  }

  const diferenca = result ? result.totalCobrado - valorPago : 0;
  const diferencaPositiva = diferenca >= 0;
  const mesValor = `${ano}-${String(mes).padStart(2, "0")}`;

  return (
    <AdminLayout>
      <div className="space-y-4 max-w-5xl">
        <header className="rounded-[1.75rem] bg-primary text-primary-foreground px-6 py-6 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">Controladoria</p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1" data-testid="text-page-title">
            Pedágio: Pago × Cobrado
          </h1>
          <p className="text-sm text-primary-foreground/75 mt-2 max-w-2xl">
            O custo real da Ticketlog é lançado por quinzena, com a fatura anexada.
            Esse valor entra no Balanço Gerencial como custo de pedágio do período.
          </p>
        </header>

        <section className="rounded-[1.75rem] border border-border bg-card p-5 md:p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mes-quinzena">Mês</Label>
              <Input
                id="mes-quinzena"
                type="month"
                value={mesValor}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (!y || !m) return;
                  setAno(y);
                  setMes(m);
                }}
                className="w-[180px]"
                data-testid="input-mes-quinzena"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={quinzena === 1 ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setQuinzena(1)}
                data-testid="button-quinzena-1"
              >
                1ª quinzena · 1 a 15
              </Button>
              <Button
                type="button"
                variant={quinzena === 2 ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setQuinzena(2)}
                data-testid="button-quinzena-2"
              >
                2ª quinzena · 16 a {ultimoDia(ano, mes)}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-periodo-quinzena">
            {nomeMes} · {fmtData(inicio)} a {fmtData(fim)}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
              <Label htmlFor="custo-ticketlog">Custo real Ticketlog (R$)</Label>
              <Input
                id="custo-ticketlog"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={ticketlogStr}
                onChange={(e) => { setTicketlogStr(e.target.value); setHerdado(false); }}
                data-testid="input-custo-ticketlog"
              />
              {herdado && (
                <p className="text-[11px] text-amber-700">
                  Este valor veio de um lançamento anterior dentro da quinzena. Salve com a fatura para ele valer como custo da quinzena.
                </p>
              )}
              <div>
                <Label htmlFor="anexo-fatura" className="text-muted-foreground">Fatura (PDF, JPG ou PNG, até 5 MB)</Label>
                <label
                  htmlFor="anexo-fatura"
                  className="mt-1 flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                >
                  <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{arquivo ? arquivo.name : "Anexar fatura"}</span>
                </label>
                <input
                  key={arquivoKey}
                  id="anexo-fatura"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  className="sr-only"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                  data-testid="input-anexo-fatura"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {arquivo
                    ? arquivo.name
                    : jaTemAnexo
                      ? "Já existe fatura desta quinzena. Anexe outra só se for substituir."
                      : "A primeira gravação da quinzena exige a fatura anexada."}
                </p>
              </div>
              <Button
                type="button"
                onClick={salvar}
                disabled={saving}
                className="rounded-full"
                data-testid="button-salvar-ticketlog"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar quinzena
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
              <Label htmlFor="valor-pago">Valor pago para comparar (R$)</Label>
              <Input
                id="valor-pago"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valorPagoStr}
                onChange={(e) => setValorPagoStr(e.target.value)}
                data-testid="input-valor-pago"
              />
              <p className="text-[11px] text-muted-foreground">
                Compara o que foi pago com o pedágio cobrado nas OS desta quinzena. Não altera o Balanço.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={calcular}
                disabled={loading}
                className="rounded-full"
                data-testid="button-calcular"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                Calcular pago × cobrado
              </Button>
            </div>
          </div>
        </section>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-[1.75rem] border border-border bg-card p-5" data-testid="card-pago">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Pago</div>
              <div className="text-3xl font-black mt-2" data-testid="text-valor-pago">{formatBRL(valorPago)}</div>
              <div className="text-xs text-muted-foreground mt-2">{fmtData(result.inicio)} a {fmtData(result.fim)}</div>
            </div>
            <div className="rounded-[1.75rem] border border-border bg-card p-5" data-testid="card-cobrado">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Cobrado</div>
              <div className="text-3xl font-black mt-2" data-testid="text-valor-cobrado">{formatBRL(result.totalCobrado)}</div>
              <div className="text-xs text-muted-foreground mt-2" data-testid="text-qtd-os">{result.qtdOs} OS com pedágio cobrado</div>
            </div>
            <div
              className={`rounded-[1.75rem] border p-5 ${diferencaPositiva ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
              data-testid="card-diferenca"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Diferença (cobrado − pago)</div>
              <div className={`text-3xl font-black mt-2 ${diferencaPositiva ? "text-emerald-700" : "text-rose-700"}`} data-testid="text-diferenca">
                {formatBRL(diferenca)}
              </div>
              <div className="text-xs mt-2 flex items-start gap-1 text-foreground/80">
                {!diferencaPositiva && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>
                  Cobrado {formatBRL(Math.abs(diferenca))} {diferencaPositiva ? "a mais" : "a menos"} do que o pago.
                </span>
              </div>
            </div>
          </div>
        )}

        {result && result.totalCobrado === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 text-sm p-4">
            Nenhum lançamento de receita de pedágio nesta quinzena.
          </div>
        )}

        <section className="rounded-[1.75rem] border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-bold">Histórico das faturas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Cada gravação fica registrada, com a fatura anexada.</p>
          </div>
          {historico.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground" data-testid="text-historico-vazio">Nenhuma quinzena salva ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-6 py-3 font-medium">Quinzena</th>
                    <th className="px-3 py-3 font-medium">Valor</th>
                    <th className="px-3 py-3 font-medium">Quem</th>
                    <th className="px-3 py-3 font-medium">Quando</th>
                    <th className="px-6 py-3 font-medium">Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id} className="border-b border-border/70 last:border-0" data-testid={`row-historico-${h.id}`}>
                      <td className="px-6 py-3 whitespace-nowrap">{fmtData(h.inicio)} a {fmtData(h.fim)}</td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">{formatBRL(h.valor)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{h.createdBy || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{fmtQuando(h.createdAt)}</td>
                      <td className="px-6 py-3">
                        {h.temAnexo ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                            onClick={() => abrirAnexo(h.id)}
                            disabled={abrindo === h.id}
                            data-testid={`button-anexo-${h.id}`}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            {abrindo === h.id ? "Abrindo..." : (h.arquivoNome || "Abrir fatura")}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
