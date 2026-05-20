import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Download, ChevronDown, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TicketLogPedagioRow {
  codigo: string;
  data: string;
  hora: string | null;
  placa: string;
  valor: number;
  estabelecimento: string | null;
  endereco: string | null;
  categoria: string | null;
}
interface OsCandidate {
  id: number;
  osNumber: string | null;
  clientId: number | null;
  vehicleId: number | null;
  placa: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  missionStartedAt: string | null;
  status: string | null;
}
interface MissionCostCandidate {
  id: number;
  serviceOrderId: number;
  amount: number;
  category: string;
  description: string | null;
  createdAt: string | null;
}
interface Conciliado { csv: TicketLogPedagioRow; os: OsCandidate; missionCost: MissionCostCandidate; }
interface FaturaSemOS { csv: TicketLogPedagioRow; motivo: string; osCandidatas: OsCandidate[]; }
interface OsSemFatura { os: OsCandidate; missionCost: MissionCostCandidate; }
interface AuditResult {
  parsed: {
    header: {
      codigoFatura: string | null; cliente: string | null;
      periodoInicio: string | null; periodoFim: string | null;
      vencimento: string | null; mesReferencia: string | null; status: string | null;
    };
    rows: TicketLogPedagioRow[];
    total: number;
  };
  matchedClient: { id: number; name: string; razaoSocial: string | null; nomeFantasia: string | null } | null;
  resolvedClientWarning: string | null;
  window: { dataInicio: string; dataFim: string } | null;
  result: {
    conciliados: Conciliado[];
    faturaSemOS: FaturaSemOS[];
    osSemFatura: OsSemFatura[];
    totais: {
      conciliados: { count: number; total: number };
      faturaSemOS: { count: number; total: number };
      osSemFatura: { count: number; total: number };
    };
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  const ymd = String(iso).slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ConferenciaPedagiosTicketLogPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditResult | null>(null);
  const [showConciliados, setShowConciliados] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const res = await authFetch("/api/auditoria-pedagios-ticketlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvBase64: b64 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar CSV");
      }
      const data = (await res.json()) as AuditResult;
      setReport(data);
      const t = data.result.totais;
      toast({
        title: "Conferência processada",
        description: `${t.conciliados.count} conciliados · ${t.faturaSemOS.count} fatura sem OS · ${t.osSemFatura.count} OS sem fatura`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportDivergencias = () => {
    if (!report) return;
    const rows: string[][] = [];
    rows.push(["Bloco", "Origem", "Data", "Placa", "Valor (R$)", "OS", "Status OS", "Categoria/MC", "Motivo / Detalhe"]);
    for (const f of report.result.faturaSemOS) {
      rows.push([
        "Fatura sem OS no sistema",
        "TicketLog (CSV)",
        fmtDate(f.csv.data),
        f.csv.placa,
        f.csv.valor.toFixed(2).replace(".", ","),
        f.osCandidatas.map((o) => o.osNumber || `#${o.id}`).join(", "),
        f.osCandidatas.map((o) => o.status || "").filter(Boolean).join(", "),
        f.csv.estabelecimento || "",
        f.motivo,
      ]);
    }
    for (const o of report.result.osSemFatura) {
      rows.push([
        "OS sem cobrança na fatura",
        "Sistema (mission_cost)",
        fmtDate(o.os.scheduledDate),
        o.os.placa || "",
        Math.abs(o.missionCost.amount).toFixed(2).replace(".", ","),
        o.os.osNumber || `#${o.os.id}`,
        o.os.status || "",
        o.missionCost.category || "",
        o.missionCost.description || "",
      ]);
    }
    const fat = report.parsed.header.codigoFatura || "sem-codigo";
    downloadCsv(`divergencias-pedagios-fatura-${fat}.csv`, rows);
  };

  const summaryCards = useMemo(() => {
    if (!report) return [];
    const t = report.result.totais;
    return [
      { label: "Conciliados", count: t.conciliados.count, total: t.conciliados.total, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
      { label: "Fatura sem OS", count: t.faturaSemOS.count, total: t.faturaSemOS.total, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
      { label: "OS sem fatura", count: t.osSemFatura.count, total: t.osSemFatura.total, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
    ];
  }, [report]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-start gap-4 flex-col md:flex-row md:items-end">
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold" data-testid="text-page-title">
                  Conferência de Pedágios TicketLog × Sistema
                </h2>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Envie o CSV "Detalhamento da Fatura" da TicketLog. O sistema cruza cada transação de pedágio
                com os lançamentos de custo de pedágio das OS do cliente no período da fatura.
                Cruzamento somente leitura — nenhum dado é alterado.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                    Arquivo CSV da fatura
                  </label>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    data-testid="input-csv-file"
                    className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-amber-100 file:px-2 file:py-1 file:text-amber-700 file:text-sm hover:file:bg-amber-200"
                  />
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={!file || loading}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  data-testid="button-process"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Processar conferência</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {report && (
          <>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-neutral-500">Fatura:</span>{" "}
                    <span className="font-semibold" data-testid="text-fatura">{report.parsed.header.codigoFatura || "—"}</span>
                    {" · "}
                    <span className="text-neutral-500">Status:</span>{" "}
                    <Badge variant="outline">{report.parsed.header.status || "—"}</Badge>
                  </div>
                  <div>
                    <span className="text-neutral-500">Cliente CSV:</span>{" "}
                    <span data-testid="text-cliente-csv">{report.parsed.header.cliente || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Cliente sistema:</span>{" "}
                    {report.matchedClient ? (
                      <span className="text-emerald-700 dark:text-emerald-400" data-testid="text-cliente-sistema">
                        #{report.matchedClient.id} — {report.matchedClient.razaoSocial || report.matchedClient.nomeFantasia || report.matchedClient.name}
                      </span>
                    ) : (
                      <span className="text-rose-600">não localizado</span>
                    )}
                  </div>
                  <div>
                    <span className="text-neutral-500">Período:</span>{" "}
                    <span data-testid="text-periodo">{fmtDate(report.parsed.header.periodoInicio)} → {fmtDate(report.parsed.header.periodoFim)}</span>
                    {" · "}
                    <span className="text-neutral-500">Vencimento:</span> {fmtDate(report.parsed.header.vencimento)}
                  </div>
                  <div>
                    <span className="text-neutral-500">Linhas CSV:</span>{" "}
                    <span data-testid="text-rows-csv">{report.parsed.rows.length}</span>{" · "}
                    <span className="text-neutral-500">Total CSV:</span>{" "}
                    <span className="font-semibold" data-testid="text-total-csv">{brl(report.parsed.total)}</span>
                  </div>
                  {report.resolvedClientWarning && (
                    <div className="text-amber-600 text-xs mt-1" data-testid="text-warning">
                      ⚠ {report.resolvedClientWarning}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={exportDivergencias}
                  disabled={report.result.faturaSemOS.length === 0 && report.result.osSemFatura.length === 0}
                  data-testid="button-export-divergencias"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar divergências (CSV)
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {summaryCards.map((c) => (
                <Card key={c.label} className={`p-4 ${c.bg}`}>
                  <div className="flex items-center gap-3">
                    <c.icon className={`h-6 w-6 ${c.color}`} />
                    <div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">{c.label}</div>
                      <div className="text-xl font-bold" data-testid={`text-summary-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        {c.count} <span className="text-sm font-normal text-neutral-500">· {brl(c.total)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-semibold">Fatura sem OS no sistema</h3>
                <Badge variant="outline" className="ml-2">{report.result.faturaSemOS.length}</Badge>
              </div>
              {report.result.faturaSemOS.length === 0 ? (
                <div className="text-sm text-neutral-500">Nenhuma divergência neste bloco.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-neutral-200 dark:border-neutral-800">
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Placa</th>
                        <th className="py-2 pr-3">Valor</th>
                        <th className="py-2 pr-3">Estabelecimento</th>
                        <th className="py-2 pr-3">OS candidatas</th>
                        <th className="py-2 pr-3">Motivo</th>
                      </tr>
                    </thead>
                    <tbody data-testid="table-fatura-sem-os">
                      {report.result.faturaSemOS.map((f, i) => (
                        <tr key={`${f.csv.codigo}-${i}`} className="border-b border-neutral-100 dark:border-neutral-900">
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(f.csv.data)}</td>
                          <td className="py-2 pr-3 font-mono">{f.csv.placa}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{brl(f.csv.valor)}</td>
                          <td className="py-2 pr-3 text-neutral-600 dark:text-neutral-400">{f.csv.estabelecimento || "—"}</td>
                          <td className="py-2 pr-3">
                            {f.osCandidatas.length === 0
                              ? <span className="text-neutral-400">—</span>
                              : f.osCandidatas.map((o) => o.osNumber || `#${o.id}`).join(", ")}
                          </td>
                          <td className="py-2 pr-3 text-xs text-neutral-600 dark:text-neutral-400">{f.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-semibold">OS sem cobrança correspondente na fatura</h3>
                <Badge variant="outline" className="ml-2">{report.result.osSemFatura.length}</Badge>
              </div>
              {report.result.osSemFatura.length === 0 ? (
                <div className="text-sm text-neutral-500">Nenhuma divergência neste bloco.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-neutral-200 dark:border-neutral-800">
                        <th className="py-2 pr-3">OS</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Data agendada</th>
                        <th className="py-2 pr-3">Placa</th>
                        <th className="py-2 pr-3">Categoria</th>
                        <th className="py-2 pr-3">Valor</th>
                        <th className="py-2 pr-3">Descrição</th>
                      </tr>
                    </thead>
                    <tbody data-testid="table-os-sem-fatura">
                      {report.result.osSemFatura.map((o, i) => (
                        <tr key={`${o.missionCost.id}-${i}`} className="border-b border-neutral-100 dark:border-neutral-900">
                          <td className="py-2 pr-3 font-mono">{o.os.osNumber || `#${o.os.id}`}</td>
                          <td className="py-2 pr-3 text-xs">{o.os.status || "—"}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(o.os.scheduledDate)}</td>
                          <td className="py-2 pr-3 font-mono">{o.os.placa || "—"}</td>
                          <td className="py-2 pr-3 text-xs">{o.missionCost.category}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{brl(Math.abs(o.missionCost.amount))}</td>
                          <td className="py-2 pr-3 text-xs text-neutral-600 dark:text-neutral-400">{o.missionCost.description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowConciliados((v) => !v)}
                data-testid="button-toggle-conciliados"
              >
                {showConciliados ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold">Conciliados</h3>
                <Badge variant="outline" className="ml-2">{report.result.conciliados.length}</Badge>
                <span className="ml-auto text-sm text-neutral-500">
                  {brl(report.result.totais.conciliados.total)}
                </span>
              </button>
              {showConciliados && (
                <div className="mt-3 overflow-x-auto">
                  {report.result.conciliados.length === 0 ? (
                    <div className="text-sm text-neutral-500">Nada conciliado nessa fatura.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-neutral-200 dark:border-neutral-800">
                          <th className="py-2 pr-3">Data CSV</th>
                          <th className="py-2 pr-3">Placa</th>
                          <th className="py-2 pr-3">Valor</th>
                          <th className="py-2 pr-3">OS</th>
                          <th className="py-2 pr-3">MC ID</th>
                          <th className="py-2 pr-3">Categoria</th>
                          <th className="py-2 pr-3">Estabelecimento</th>
                        </tr>
                      </thead>
                      <tbody data-testid="table-conciliados">
                        {report.result.conciliados.map((c, i) => (
                          <tr key={`${c.csv.codigo}-${i}`} className="border-b border-neutral-100 dark:border-neutral-900">
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(c.csv.data)}</td>
                            <td className="py-2 pr-3 font-mono">{c.csv.placa}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{brl(c.csv.valor)}</td>
                            <td className="py-2 pr-3 font-mono">{c.os.osNumber || `#${c.os.id}`}</td>
                            <td className="py-2 pr-3 text-xs text-neutral-500">{c.missionCost.id}</td>
                            <td className="py-2 pr-3 text-xs">{c.missionCost.category}</td>
                            <td className="py-2 pr-3 text-neutral-600 dark:text-neutral-400">{c.csv.estabelecimento || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {!report && !loading && (
          <Card className="p-8 text-center text-neutral-500">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-neutral-400" />
            <div className="text-sm">Envie um CSV da fatura TicketLog para iniciar a conferência.</div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
