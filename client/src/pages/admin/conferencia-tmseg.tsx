import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
  XCircle, FileQuestion, ArrowRightLeft,
} from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FieldCmp { ext: number; sys: number; diff: number; diverge: boolean }
interface MatchedRow {
  osNumber: string; extNumero: string; data: string | null; placa: string;
  rotaSistema: string; rotaPlanilha: string; status: string; matchScore: number;
  matchType?: "km" | "rota"; matchConfidence?: "alta" | "média";
  fields: { kmTotal: FieldCmp; pedagio: FieldCmp; kmFranq: FieldCmp; total: FieldCmp };
  hasDivergence: boolean; revenueValue: number; custoFornecedor: number;
}
interface Report {
  period: { from: string; to: string };
  summary: {
    ext_count: number; sys_count: number; matched: number; divergent: number;
    missing_in_system: number; missing_in_sheet: number;
    ext_total: number; sys_total_matched: number; diff_total: number;
  };
  matched: MatchedRow[];
  missingInSystem: { numero: string; data: string | null; placa: string; rota: string; total: number }[];
  missingInSheet: { osNumber: string; data: string | null; placa: string; rota: string; total: number; status: string }[];
}
interface Client { id: number; name: string }

const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKm = (n: number) => (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function ConferenciaTmsegPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState("divergentes");

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const defaultClientId = useMemo(() => {
    const tm = clients.find(c => c.name?.toUpperCase().includes("TM SEG"));
    return tm ? String(tm.id) : "";
  }, [clients]);

  const effectiveClient = clientId || defaultClientId;

  const handleUpload = async () => {
    if (!file) { toast({ title: "Selecione a planilha", variant: "destructive" }); return; }
    if (!effectiveClient) { toast({ title: "Selecione o cliente", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const b64 = btoa(bin);
      const res = await authFetch("/api/conferencia-tmseg/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: b64, fileName: file.name, clientId: Number(effectiveClient) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar planilha");
      }
      const data: Report = await res.json();
      setReport(data);
      setTab(data.summary.divergent > 0 ? "divergentes" : "conferem");
      toast({
        title: "Conferência concluída",
        description: `${data.summary.matched} OS conciliadas · ${data.summary.divergent} divergência(s)`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const divergentes = report?.matched.filter(r => r.hasDivergence) ?? [];
  const conferem = report?.matched.filter(r => !r.hasDivergence) ?? [];

  const cards = useMemo(() => {
    if (!report) return [];
    const s = report.summary;
    return [
      { label: "OS conciliadas", value: s.matched, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
      { label: "Com divergência", value: s.divergent, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
      { label: "Na planilha, fora do sistema", value: s.missing_in_system, icon: FileQuestion, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
      { label: "No sistema, fora da planilha", value: s.missing_in_sheet, icon: XCircle, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/30" },
    ];
  }, [report]);

  return (
    <AdminLayout>
      <div className="space-y-6 p-1">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FileSpreadsheet className="h-6 w-6 text-primary" /> Conferência TM SEG
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suba o boletim externo (mesmo layout do boletim do sistema) para conferir contra o faturamento do banco.
            Conferência <strong>somente leitura</strong> — nada é gravado. Divergências aparecem em <span className="text-rose-600 font-medium">vermelho</span>; valores do cliente em <span className="text-sky-600 font-medium">azul</span>.
          </p>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cliente</label>
              <Select value={effectiveClient} onValueChange={setClientId}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Planilha (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                data-testid="input-file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleUpload} disabled={loading || !file} className="w-full" data-testid="button-conciliar">
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Conferindo…</> : <><Upload className="h-4 w-4 mr-2" /> Conferir</>}
              </Button>
            </div>
          </div>
          {report && (
            <p className="text-xs text-muted-foreground">
              Período da planilha: {fmtDate(report.period.from)} a {fmtDate(report.period.to)} ·
              {" "}{report.summary.ext_count} linhas na planilha × {report.summary.sys_count} no sistema
            </p>
          )}
        </Card>

        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => (
                <Card key={c.label} className={`p-4 ${c.bg}`} data-testid={`card-${c.label}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
                </Card>
              ))}
            </div>

            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Total planilha (matched + extras): <strong className="text-sky-600">{brl(report.summary.ext_total)}</strong></span>
                <span>Total sistema (conciliado): <strong>{brl(report.summary.sys_total_matched)}</strong></span>
                <span>
                  Diferença:{" "}
                  <strong className={Math.abs(report.summary.diff_total) > 0.01 ? "text-rose-600" : "text-emerald-600"}>
                    {brl(report.summary.diff_total)}
                  </strong>
                </span>
              </div>
            </Card>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="divergentes" data-testid="tab-divergentes">Divergências ({divergentes.length})</TabsTrigger>
                <TabsTrigger value="conferem" data-testid="tab-conferem">Conferem ({conferem.length})</TabsTrigger>
                <TabsTrigger value="missing-system" data-testid="tab-missing-system">Fora do sistema ({report.missingInSystem.length})</TabsTrigger>
                <TabsTrigger value="missing-sheet" data-testid="tab-missing-sheet">Fora da planilha ({report.missingInSheet.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="divergentes">
                <MatchedTable rows={divergentes} emptyText="Nenhuma divergência encontrada — tudo bate." />
              </TabsContent>
              <TabsContent value="conferem">
                <MatchedTable rows={conferem} emptyText="Nenhuma OS conferida." />
              </TabsContent>

              <TabsContent value="missing-system">
                <Card className="p-0 overflow-x-auto">
                  {report.missingInSystem.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground text-center">Nada na planilha que não esteja no sistema.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Nº</th>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Placa</th>
                          <th className="px-3 py-2 text-left">Rota</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.missingInSystem.map((r, i) => (
                          <tr key={i} className="border-t" data-testid={`row-missing-system-${i}`}>
                            <td className="px-3 py-2 font-medium">{r.numero || "—"}</td>
                            <td className="px-3 py-2">{fmtDate(r.data)}</td>
                            <td className="px-3 py-2">{r.placa || "—"}</td>
                            <td className="px-3 py-2">{r.rota || "—"}</td>
                            <td className="px-3 py-2 text-right text-sky-600">{brl(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="missing-sheet">
                <Card className="p-0 overflow-x-auto">
                  {report.missingInSheet.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground text-center">Tudo do sistema está na planilha.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">OS</th>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Placa</th>
                          <th className="px-3 py-2 text-left">Rota</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.missingInSheet.map((r, i) => (
                          <tr key={i} className="border-t" data-testid={`row-missing-sheet-${i}`}>
                            <td className="px-3 py-2 font-medium">{r.osNumber}</td>
                            <td className="px-3 py-2">{fmtDate(r.data)}</td>
                            <td className="px-3 py-2">{r.placa || "—"}</td>
                            <td className="px-3 py-2">{r.rota || "—"}</td>
                            <td className="px-3 py-2"><Badge variant="outline">{r.status || "—"}</Badge></td>
                            <td className="px-3 py-2 text-right">{brl(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {!report && !loading && (
          <Card className="p-10 text-center text-muted-foreground">
            <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Selecione o cliente e suba a planilha do boletim para iniciar a conferência.</p>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function Cmp({ f, kind }: { f: FieldCmp; kind: "money" | "km" }) {
  const fmt = kind === "money" ? brl : fmtKm;
  return (
    <div className={`flex flex-col ${f.diverge ? "text-rose-600 font-semibold" : ""}`}>
      <span className="text-[11px] text-muted-foreground">plan.</span>
      <span className="text-sky-600">{fmt(f.ext)}</span>
      <span className="text-[11px] text-muted-foreground mt-0.5">sist.</span>
      <span>{fmt(f.sys)}</span>
      {f.diverge && <span className="text-[11px] mt-0.5">Δ {fmt(f.diff)}</span>}
    </div>
  );
}

function MatchedTable({ rows, emptyText }: { rows: MatchedRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground text-center">{emptyText}</Card>;
  }
  return (
    <Card className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">OS</th>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Placa</th>
            <th className="px-3 py-2 text-left">Rota (sist. × plan.)</th>
            <th className="px-3 py-2 text-center">KM rodado</th>
            <th className="px-3 py-2 text-center">Pedágio</th>
            <th className="px-3 py-2 text-center">Franquia KM</th>
            <th className="px-3 py-2 text-center">Valor final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t ${r.hasDivergence ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}`} data-testid={`row-matched-${r.osNumber}`}>
              <td className="px-3 py-2 align-top">
                <div className="font-medium">{r.osNumber}</div>
                {r.extNumero && r.extNumero !== r.osNumber && (
                  <div className="text-[11px] text-muted-foreground">plan.: {r.extNumero}</div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">{r.status || "—"}</Badge>
                  {r.matchType && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${r.matchType === "km"
                        ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-300 text-amber-700 dark:text-amber-400"}`}
                      title={r.matchType === "km"
                        ? "Casado por data + placa + KM (confiança alta)"
                        : "Casado por data + placa + rota, pois o KM não estava disponível (confiança média — confira o valor)"}
                      data-testid={`badge-match-${r.osNumber}`}
                    >
                      {r.matchType === "km" ? "✓ KM" : "≈ rota"}
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 align-top">{fmtDate(r.data)}</td>
              <td className="px-3 py-2 align-top">{r.placa || "—"}</td>
              <td className="px-3 py-2 align-top">
                <div>{r.rotaSistema || "—"}</div>
                <div className="text-[11px] text-muted-foreground">{r.rotaPlanilha || "—"}</div>
              </td>
              <td className="px-3 py-2 align-top text-center"><Cmp f={r.fields.kmTotal} kind="km" /></td>
              <td className="px-3 py-2 align-top text-center"><Cmp f={r.fields.pedagio} kind="money" /></td>
              <td className="px-3 py-2 align-top text-center"><Cmp f={r.fields.kmFranq} kind="km" /></td>
              <td className="px-3 py-2 align-top text-center"><Cmp f={r.fields.total} kind="money" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
