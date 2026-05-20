import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Download, ChevronDown, ChevronRight, FileSpreadsheet, DollarSign, Plus,
  MessageSquarePlus, Trash2,
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

type NoteStatus = "pendente" | "justificada" | "contestada";

interface PedagioAuditNote {
  id: number;
  codigoFatura: string;
  scope: "fatura_sem_os" | "os_sem_fatura";
  csvCodigo: string | null;
  missionCostId: number | null;
  serviceOrderId: number | null;
  status: NoteStatus;
  observacao: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

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
  notes: {
    byCsvCodigo: Record<string, PedagioAuditNote>;
    byMissionCostId: Record<string, PedagioAuditNote>;
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

function statusBadge(status: NoteStatus) {
  if (status === "justificada") {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">Justificada</Badge>;
  }
  if (status === "contestada") {
    return <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300">Contestada</Badge>;
  }
  return <Badge variant="outline">Pendente</Badge>;
}

interface NoteDraft {
  scope: "fatura_sem_os" | "os_sem_fatura";
  csvCodigo: string | null;
  missionCostId: number | null;
  serviceOrderId: number | null;
  status: NoteStatus;
  observacao: string;
  existingNoteId: number | null;
  contextLabel: string;
}

export default function ConferenciaPedagiosTicketLogPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [csvBase64, setCsvBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditResult | null>(null);
  const [showConciliados, setShowConciliados] = useState(false);
  const [hideResolved, setHideResolved] = useState(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const [openGerar, setOpenGerar] = useState(false);
  const [modoGerar, setModoGerar] = useState<"unico" | "rateado">("unico");
  const [gerando, setGerando] = useState(false);
  const [resultadoGerar, setResultadoGerar] = useState<
    { criadas: number; ignoradas: number; total_criado: number; total_fatura: number } | null
  >(null);

  const [openCriarMc, setOpenCriarMc] = useState(false);
  const [selecionadosMc, setSelecionadosMc] = useState<Set<string>>(new Set());
  const [criandoMc, setCriandoMc] = useState(false);

  const candidatasParaCriarMc = useMemo(() => {
    if (!report) return [] as AuditResult["result"]["faturaSemOS"];
    return report.result.faturaSemOS.filter((f) => f.osCandidatas.length === 1);
  }, [report]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      setCsvBase64(b64);
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
      if (!data.notes) data.notes = { byCsvCodigo: {}, byMissionCostId: {} };
      setReport(data);
      setResultadoGerar(null);
      setSelecionadosMc(new Set());
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

  const codigoFatura = report?.parsed.header.codigoFatura || null;

  const noteForCsv = (csvCodigo: string): PedagioAuditNote | null =>
    report?.notes?.byCsvCodigo?.[csvCodigo] || null;
  const noteForMc = (mcId: number): PedagioAuditNote | null =>
    report?.notes?.byMissionCostId?.[String(mcId)] || null;

  const isResolved = (n: PedagioAuditNote | null) =>
    !!n && (n.status === "justificada" || n.status === "contestada");

  const openNoteForFatura = (f: FaturaSemOS) => {
    const existing = noteForCsv(f.csv.codigo);
    setNoteDraft({
      scope: "fatura_sem_os",
      csvCodigo: f.csv.codigo,
      missionCostId: null,
      serviceOrderId: null,
      status: existing?.status || "justificada",
      observacao: existing?.observacao || "",
      existingNoteId: existing?.id ?? null,
      contextLabel: `${fmtDate(f.csv.data)} · ${f.csv.placa} · ${brl(f.csv.valor)} — código ${f.csv.codigo}`,
    });
  };

  const openNoteForOs = (o: OsSemFatura) => {
    const existing = noteForMc(o.missionCost.id);
    setNoteDraft({
      scope: "os_sem_fatura",
      csvCodigo: null,
      missionCostId: o.missionCost.id,
      serviceOrderId: o.os.id,
      status: existing?.status || "justificada",
      observacao: existing?.observacao || "",
      existingNoteId: existing?.id ?? null,
      contextLabel: `OS ${o.os.osNumber || `#${o.os.id}`} · ${brl(Math.abs(o.missionCost.amount))} · MC #${o.missionCost.id}`,
    });
  };

  const saveNote = async () => {
    if (!noteDraft || !codigoFatura || !report) return;
    setSavingNote(true);
    try {
      const res = await authFetch("/api/auditoria-pedagios-ticketlog/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoFatura,
          scope: noteDraft.scope,
          csvCodigo: noteDraft.csvCodigo,
          missionCostId: noteDraft.missionCostId,
          serviceOrderId: noteDraft.serviceOrderId,
          status: noteDraft.status,
          observacao: noteDraft.observacao,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao salvar anotação");
      }
      const { note } = await res.json();
      const mapped: PedagioAuditNote = {
        id: note.id,
        codigoFatura: note.codigo_fatura,
        scope: note.scope,
        csvCodigo: note.csv_codigo ?? null,
        missionCostId: note.mission_cost_id ?? null,
        serviceOrderId: note.service_order_id ?? null,
        status: note.status,
        observacao: note.observacao || "",
        createdById: note.created_by_id ?? null,
        createdByName: note.created_by_name ?? null,
        createdAt: note.created_at ?? null,
        updatedAt: note.updated_at ?? null,
      };
      const nextNotes = {
        byCsvCodigo: { ...report.notes.byCsvCodigo },
        byMissionCostId: { ...report.notes.byMissionCostId },
      };
      if (mapped.csvCodigo) nextNotes.byCsvCodigo[mapped.csvCodigo] = mapped;
      if (mapped.missionCostId != null) nextNotes.byMissionCostId[String(mapped.missionCostId)] = mapped;
      setReport({ ...report, notes: nextNotes });
      setNoteDraft(null);
      toast({ title: "Anotação salva", description: `Status: ${mapped.status}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async () => {
    if (!noteDraft?.existingNoteId || !report) return;
    setSavingNote(true);
    try {
      const res = await authFetch(`/api/auditoria-pedagios-ticketlog/notes/${noteDraft.existingNoteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao remover anotação");
      }
      const nextNotes = {
        byCsvCodigo: { ...report.notes.byCsvCodigo },
        byMissionCostId: { ...report.notes.byMissionCostId },
      };
      if (noteDraft.csvCodigo) delete nextNotes.byCsvCodigo[noteDraft.csvCodigo];
      if (noteDraft.missionCostId != null) delete nextNotes.byMissionCostId[String(noteDraft.missionCostId)];
      setReport({ ...report, notes: nextNotes });
      setNoteDraft(null);
      toast({ title: "Anotação removida" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingNote(false);
    }
  };

  const filteredFaturaSemOS = useMemo(() => {
    if (!report) return [] as FaturaSemOS[];
    if (!hideResolved) return report.result.faturaSemOS;
    return report.result.faturaSemOS.filter((f) => !isResolved(noteForCsv(f.csv.codigo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, hideResolved]);

  const filteredOsSemFatura = useMemo(() => {
    if (!report) return [] as OsSemFatura[];
    if (!hideResolved) return report.result.osSemFatura;
    return report.result.osSemFatura.filter((o) => !isResolved(noteForMc(o.missionCost.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, hideResolved]);

  const exportDivergencias = () => {
    if (!report) return;
    const rows: string[][] = [];
    rows.push(["Bloco", "Origem", "Data", "Placa", "Valor (R$)", "OS", "Status OS", "Categoria/MC", "Motivo / Detalhe", "Status anotação", "Observação", "Por", "Em"]);
    for (const f of report.result.faturaSemOS) {
      const n = noteForCsv(f.csv.codigo);
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
        n?.status || "pendente",
        n?.observacao || "",
        n?.createdByName || "",
        n?.updatedAt ? fmtDate(n.updatedAt) : "",
      ]);
    }
    for (const o of report.result.osSemFatura) {
      const n = noteForMc(o.missionCost.id);
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
        n?.status || "pendente",
        n?.observacao || "",
        n?.createdByName || "",
        n?.updatedAt ? fmtDate(n.updatedAt) : "",
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
                <div className="flex flex-col items-end gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={hideResolved}
                      onCheckedChange={(v) => setHideResolved(Boolean(v))}
                      data-testid="checkbox-hide-resolved"
                    />
                    Ocultar resolvidas (justificadas/contestadas)
                  </label>
                  <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={exportDivergencias}
                    disabled={report.result.faturaSemOS.length === 0 && report.result.osSemFatura.length === 0}
                    data-testid="button-export-divergencias"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar divergências (CSV)
                  </Button>
                  <Button
                    onClick={() => { setResultadoGerar(null); setOpenGerar(true); }}
                    disabled={!csvBase64 || !report.parsed.header.codigoFatura}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="button-open-gerar-financeiro"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Gerar contas a pagar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelecionadosMc(new Set(candidatasParaCriarMc.map((f) => f.csv.codigo)));
                      setOpenCriarMc(true);
                    }}
                    disabled={!csvBase64 || candidatasParaCriarMc.length === 0}
                    data-testid="button-open-criar-mission-costs"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Criar mission_costs faltantes ({candidatasParaCriarMc.length})
                  </Button>
                  </div>
                </div>
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
                <Badge variant="outline" className="ml-2">{filteredFaturaSemOS.length}{hideResolved && filteredFaturaSemOS.length !== report.result.faturaSemOS.length ? ` / ${report.result.faturaSemOS.length}` : ""}</Badge>
              </div>
              {filteredFaturaSemOS.length === 0 ? (
                <div className="text-sm text-neutral-500">{hideResolved && report.result.faturaSemOS.length > 0 ? "Todas as divergências deste bloco já estão tratadas." : "Nenhuma divergência neste bloco."}</div>
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
                        <th className="py-2 pr-3">Anotação</th>
                        <th className="py-2 pr-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody data-testid="table-fatura-sem-os">
                      {filteredFaturaSemOS.map((f, i) => {
                        const note = noteForCsv(f.csv.codigo);
                        return (
                          <tr
                            key={`${f.csv.codigo}-${i}`}
                            className={`border-b border-neutral-100 dark:border-neutral-900 ${isResolved(note) ? "bg-neutral-50/60 dark:bg-neutral-900/30" : ""}`}
                            data-testid={`row-fatura-sem-os-${f.csv.codigo}`}
                          >
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
                            <td className="py-2 pr-3">
                              {note ? (
                                <div className="space-y-1">
                                  {statusBadge(note.status)}
                                  {note.observacao && (
                                    <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 max-w-xs" title={note.observacao}>
                                      {note.observacao}
                                    </div>
                                  )}
                                  {note.createdByName && (
                                    <div className="text-[10px] text-neutral-400">{note.createdByName} · {fmtDate(note.updatedAt)}</div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-neutral-500">Pendente</Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openNoteForFatura(f)}
                                data-testid={`button-note-fatura-${f.csv.codigo}`}
                              >
                                <MessageSquarePlus className="h-4 w-4" />
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

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-semibold">OS sem cobrança correspondente na fatura</h3>
                <Badge variant="outline" className="ml-2">{filteredOsSemFatura.length}{hideResolved && filteredOsSemFatura.length !== report.result.osSemFatura.length ? ` / ${report.result.osSemFatura.length}` : ""}</Badge>
              </div>
              {filteredOsSemFatura.length === 0 ? (
                <div className="text-sm text-neutral-500">{hideResolved && report.result.osSemFatura.length > 0 ? "Todas as divergências deste bloco já estão tratadas." : "Nenhuma divergência neste bloco."}</div>
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
                        <th className="py-2 pr-3">Anotação</th>
                        <th className="py-2 pr-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody data-testid="table-os-sem-fatura">
                      {filteredOsSemFatura.map((o, i) => {
                        const note = noteForMc(o.missionCost.id);
                        return (
                          <tr
                            key={`${o.missionCost.id}-${i}`}
                            className={`border-b border-neutral-100 dark:border-neutral-900 ${isResolved(note) ? "bg-neutral-50/60 dark:bg-neutral-900/30" : ""}`}
                            data-testid={`row-os-sem-fatura-${o.missionCost.id}`}
                          >
                            <td className="py-2 pr-3 font-mono">{o.os.osNumber || `#${o.os.id}`}</td>
                            <td className="py-2 pr-3 text-xs">{o.os.status || "—"}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(o.os.scheduledDate)}</td>
                            <td className="py-2 pr-3 font-mono">{o.os.placa || "—"}</td>
                            <td className="py-2 pr-3 text-xs">{o.missionCost.category}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{brl(Math.abs(o.missionCost.amount))}</td>
                            <td className="py-2 pr-3 text-xs text-neutral-600 dark:text-neutral-400">{o.missionCost.description || "—"}</td>
                            <td className="py-2 pr-3">
                              {note ? (
                                <div className="space-y-1">
                                  {statusBadge(note.status)}
                                  {note.observacao && (
                                    <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 max-w-xs" title={note.observacao}>
                                      {note.observacao}
                                    </div>
                                  )}
                                  {note.createdByName && (
                                    <div className="text-[10px] text-neutral-400">{note.createdByName} · {fmtDate(note.updatedAt)}</div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-neutral-500">Pendente</Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openNoteForOs(o)}
                                data-testid={`button-note-os-${o.missionCost.id}`}
                              >
                                <MessageSquarePlus className="h-4 w-4" />
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

        <Dialog open={openGerar} onOpenChange={setOpenGerar}>
          <DialogContent className="max-w-lg" data-testid="dialog-gerar-financeiro">
            <DialogHeader>
              <DialogTitle>Gerar contas a pagar — Fatura TicketLog</DialogTitle>
              <DialogDescription>
                Cria lançamento em <code>financial_transactions</code> (despesa pendente) com referência
                ao código da fatura. Se essa fatura já tiver lançamento (em qualquer modo), a operação
                é bloqueada para evitar duplicidade — desfaça os lançamentos existentes antes de gerar
                de novo.
              </DialogDescription>
            </DialogHeader>
            {report && (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-neutral-500">Fatura:</span>{" "}
                  <span className="font-semibold">{report.parsed.header.codigoFatura || "—"}</span>
                  {" · "}
                  <span className="text-neutral-500">Total:</span>{" "}
                  <span className="font-semibold">{brl(report.parsed.total)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Vencimento da fatura:</span>{" "}
                  <span>{fmtDate(report.parsed.header.vencimento)}</span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Modo de lançamento
                  </label>
                  <Select value={modoGerar} onValueChange={(v) => setModoGerar(v as "unico" | "rateado")}>
                    <SelectTrigger data-testid="select-modo-gerar">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unico">Uma despesa única (valor total)</SelectItem>
                      <SelectItem value="rateado">Rateado por placa (uma despesa por veículo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {resultadoGerar && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-emerald-800 dark:text-emerald-300 text-xs space-y-1" data-testid="text-resultado-gerar">
                    <div><strong>{resultadoGerar.criadas}</strong> lançamento(s) criado(s) — {brl(resultadoGerar.total_criado)}</div>
                    {resultadoGerar.ignoradas > 0 && (
                      <div>{resultadoGerar.ignoradas} lançamento(s) já existiam e foram ignorados.</div>
                    )}
                    <div className="text-neutral-600 dark:text-neutral-400">Total da fatura: {brl(resultadoGerar.total_fatura)}</div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenGerar(false)} data-testid="button-cancel-gerar">
                {resultadoGerar ? "Fechar" : "Cancelar"}
              </Button>
              <Button
                disabled={!csvBase64 || gerando}
                onClick={async () => {
                  if (!csvBase64) return;
                  setGerando(true);
                  try {
                    const res = await authFetch("/api/auditoria-pedagios-ticketlog/gerar-financeiro", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ csvBase64, modo: modoGerar }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || "Falha ao gerar lançamento");
                    setResultadoGerar(data);
                    toast({
                      title: "Lançamento financeiro gerado",
                      description: `${data.criadas} criado(s) · ${data.ignoradas} ignorado(s)`,
                    });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setGerando(false);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-confirm-gerar"
              >
                {gerando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando…</> : "Gerar lançamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openCriarMc} onOpenChange={setOpenCriarMc}>
          <DialogContent className="max-w-2xl" data-testid="dialog-criar-mission-costs">
            <DialogHeader>
              <DialogTitle>Criar mission_costs faltantes</DialogTitle>
              <DialogDescription>
                Cria custo (e receita) de pedágio em <strong>OS conciliadas pelo cruzamento</strong> que
                ficaram sem o lançamento. Idempotente: cada linha embute <code>[TL:&lt;código&gt;]</code> na
                descrição e não é duplicada.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[50vh] overflow-y-auto border rounded text-sm">
              {candidatasParaCriarMc.length === 0 ? (
                <div className="p-4 text-neutral-500">Nenhuma OS conciliada por placa+data sem mission_cost.</div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                    <tr className="text-left border-b">
                      <th className="py-2 px-2 w-8"></th>
                      <th className="py-2 px-2">Data</th>
                      <th className="py-2 px-2">Placa</th>
                      <th className="py-2 px-2">Valor</th>
                      <th className="py-2 px-2">OS</th>
                      <th className="py-2 px-2">Estabelecimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidatasParaCriarMc.map((f) => {
                      const checked = selecionadosMc.has(f.csv.codigo);
                      return (
                        <tr key={f.csv.codigo} className="border-b border-neutral-100 dark:border-neutral-900">
                          <td className="py-1 px-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelecionadosMc((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(f.csv.codigo);
                                  else next.delete(f.csv.codigo);
                                  return next;
                                });
                              }}
                              data-testid={`checkbox-mc-${f.csv.codigo}`}
                            />
                          </td>
                          <td className="py-1 px-2 whitespace-nowrap">{fmtDate(f.csv.data)}</td>
                          <td className="py-1 px-2 font-mono">{f.csv.placa}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{brl(f.csv.valor)}</td>
                          <td className="py-1 px-2 font-mono">
                            {f.osCandidatas[0]?.osNumber || `#${f.osCandidatas[0]?.id}`}
                          </td>
                          <td className="py-1 px-2 text-neutral-600 dark:text-neutral-400">
                            {f.csv.estabelecimento || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCriarMc(false)} data-testid="button-cancel-criar-mc">
                Cancelar
              </Button>
              <Button
                disabled={!csvBase64 || criandoMc || selecionadosMc.size === 0}
                onClick={async () => {
                  if (!csvBase64) return;
                  setCriandoMc(true);
                  try {
                    const res = await authFetch("/api/auditoria-pedagios-ticketlog/criar-mission-costs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ csvBase64, codigosToCreate: Array.from(selecionadosMc) }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || "Falha ao criar mission_costs");
                    toast({
                      title: "Mission_costs processados",
                      description: `${data.criados} criado(s) · ${data.ignorados} ignorado(s) · ${data.erros} erro(s)`,
                    });
                    setOpenCriarMc(false);
                    if (data.criados > 0) handleUpload();
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setCriandoMc(false);
                  }
                }}
                data-testid="button-confirm-criar-mc"
              >
                {criandoMc ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando…</> : `Criar ${selecionadosMc.size} mission_cost(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!noteDraft} onOpenChange={(open) => { if (!open) setNoteDraft(null); }}>
          <DialogContent data-testid="dialog-note">
            <DialogHeader>
              <DialogTitle>Anotação de divergência</DialogTitle>
              <DialogDescription>
                {noteDraft?.contextLabel}
              </DialogDescription>
            </DialogHeader>
            {noteDraft && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                    Status
                  </label>
                  <Select
                    value={noteDraft.status}
                    onValueChange={(v) => setNoteDraft({ ...noteDraft, status: v as NoteStatus })}
                  >
                    <SelectTrigger data-testid="select-note-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="justificada">Justificada (resolvida)</SelectItem>
                      <SelectItem value="contestada">Contestada (em discussão com TicketLog)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                    Observação
                  </label>
                  <Textarea
                    value={noteDraft.observacao}
                    onChange={(e) => setNoteDraft({ ...noteDraft, observacao: e.target.value })}
                    rows={5}
                    placeholder="Ex.: TicketLog confirmou erro de cobrança em 12/05. Aguardando estorno na próxima fatura."
                    data-testid="textarea-note-observacao"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              {noteDraft?.existingNoteId && (
                <Button
                  variant="outline"
                  onClick={deleteNote}
                  disabled={savingNote}
                  className="text-rose-600 hover:text-rose-700 mr-auto"
                  data-testid="button-note-delete"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Remover
                </Button>
              )}
              <Button variant="outline" onClick={() => setNoteDraft(null)} disabled={savingNote} data-testid="button-note-cancel">
                Cancelar
              </Button>
              <Button onClick={saveNote} disabled={savingNote} data-testid="button-note-save">
                {savingNote ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
