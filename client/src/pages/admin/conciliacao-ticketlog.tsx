import { useState, useMemo, createContext, useContext, useEffect } from "react";
import { DateInputBR } from "@/components/date-input-br";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Fuel, TrendingDown, TrendingUp, RefreshCw, Calendar, Car, AlertCircle, Eye, Plus,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/lib/queryClient";
import { compressImageFile } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";
import { DetailModal } from "./relatorio-abastecimento";
import type { VehicleFueling, Vehicle, Employee } from "@shared/schema";

const DetailCtx = createContext<((id: number) => void) | null>(null);

interface TicketLogTx {
  code: string; date: string | null; time: string | null; plate: string;
  fuelType: string | null; km: number | null; liters: number | null;
  valor: number | null; driver: string; station: string; city: string; uf: string;
}
interface SystemTx {
  id: number; date: string; plate: string | null; driver: string | null;
  total_cost: number; liters: number; fuel_type: string | null;
  station: string | null; km: number | null; ticketlog_autorizacao: string | null;
}
interface MatchEntry {
  ticketlog: TicketLogTx;
  system: SystemTx;
  diffs: { valor: number; liters: number; km: number | null; fuelMatches: boolean; dateOffsetDays?: number | null };
}
interface Report {
  cutoff: string;
  period: { from: string; to: string };
  summary: {
    ticketlog_count: number; ticketlog_total: number;
    system_count: number; system_total: number;
    diff_total: number; matched: number; value_mismatch: number;
    missing_in_system: number; missing_in_ticketlog: number; unregistered_plates: number;
  };
  matched: MatchEntry[];
  valueMismatch: MatchEntry[];
  missingInSystem: { ticketlog: TicketLogTx }[];
  missingInTicketlog: { system: SystemTx }[];
  unregisteredPlates: { ticketlog: TicketLogTx }[];
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function ConciliacaoTicketlogPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [dateFrom, setDateFrom] = useState("2026-04-09");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState("matched");

  const [detailId, setDetailId] = useState<number | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [createTx, setCreateTx] = useState<TicketLogTx | null>(null);

  const { data: fuelings = [] } = useQuery<VehicleFueling[]>({
    queryKey: ["/api/fueling"],
    enabled: detailId !== null,
    staleTime: 30_000,
  });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: detailId !== null || report !== null,
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: detailId !== null,
  });

  const detailFueling = detailId ? fuelings.find(f => f.id === detailId) : null;
  const detailVehicle = detailFueling ? vehicles.find(v => v.id === detailFueling.vehicleId) : undefined;
  const detailDriver = detailFueling?.driverId ? employees.find(e => e.id === detailFueling.driverId)?.name : null;

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Converte em chunks pra evitar "Maximum call stack" em arquivos grandes.
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const b64 = btoa(bin);
      const res = await authFetch("/api/conciliacao-ticketlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: b64, fileName: file.name, dateFrom }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar arquivo");
      }
      const data = await res.json();
      setReport(data);
      toast({ title: "Conciliação processada", description: `${data.summary.ticketlog_count} transações TicketLog × ${data.summary.system_count} no sistema` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const diffColor = report
    ? report.summary.diff_total > 0.01
      ? "text-amber-600"
      : report.summary.diff_total < -0.01
      ? "text-rose-600"
      : "text-emerald-600"
    : "text-neutral-600";

  const cards = useMemo(() => {
    if (!report) return [];
    return [
      { label: "Bate exato", value: report.summary.matched, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
      { label: "Diverge valor", value: report.summary.value_mismatch, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
      { label: "Falta no sistema", value: report.summary.missing_in_system, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
      { label: "Falta na TicketLog", value: report.summary.missing_in_ticketlog, icon: AlertCircle, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
      { label: "Placa não cadastrada", value: report.summary.unregistered_plates, icon: Car, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    ];
  }, [report]);

  return (
    <>
      <DetailCtx.Provider value={setDetailId}>
      <div className="space-y-6">
        {/* Upload card */}
        <Card className="p-5">
          <div className="flex items-start gap-4 flex-col md:flex-row md:items-end">
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold" data-testid="text-page-title">Conciliação de Abastecimento × TicketLog</h2>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Envie o PDF do Relatório de Faturas Cartão Veículo (RFCV) ou a planilha
                Excel (RFCVTITULO .xls / .xlsx) gerada pela TicketLog. O sistema vai cruzar
                cada transação com os abastecimentos cadastrados, identificar divergências e placas não cadastradas.
                Se não houver lançamento na mesma data, aceita a mesma placa com até 1 dia de diferença, primeiro com o mesmo valor.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                    Arquivo (PDF ou Excel)
                  </label>
                  <Input
                    type="file"
                    accept=".pdf,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    data-testid="input-pdf-file"
                    className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-amber-100 file:px-2 file:py-1 file:text-amber-700 file:text-sm hover:file:bg-amber-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                    Considerar a partir de
                  </label>
                  <DateInputBR
                    
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="input-date-from"
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
                    <><Upload className="h-4 w-4 mr-2" /> Processar conciliação</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {report && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-xs text-neutral-500">TicketLog (PDF)</div>
                <div className="text-2xl font-bold mt-1" data-testid="text-tl-total">{brl(report.summary.ticketlog_total)}</div>
                <div className="text-xs text-neutral-500 mt-1">{report.summary.ticketlog_count} transações · {fmtDate(report.cutoff)} → {fmtDate(report.period.to)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-neutral-500">Sistema (vehicle_fueling)</div>
                <div className="text-2xl font-bold mt-1" data-testid="text-sys-total">{brl(report.summary.system_total)}</div>
                <div className="text-xs text-neutral-500 mt-1">{report.summary.system_count} abastecimentos na conta (período e margem de 1 dia já pareada)</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-neutral-500">Diferença (Sistema − TicketLog)</div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${diffColor}`} data-testid="text-diff-total">
                  {report.summary.diff_total > 0.01 ? <TrendingUp className="h-5 w-5" /> : report.summary.diff_total < -0.01 ? <TrendingDown className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  {brl(Math.abs(report.summary.diff_total))}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {Math.abs(report.summary.diff_total) < 0.01
                    ? "Totais batem exato"
                    : report.summary.diff_total > 0
                    ? "Sistema tem mais que TicketLog"
                    : "TicketLog tem mais que sistema"}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {cards.map((c) => {
                const Icon = c.icon;
                return (
                  <Card key={c.label} className={`p-4 ${c.bg} border-0`} data-testid={`card-${c.label.replace(/ /g, "-").toLowerCase()}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${c.color}`} />
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">{c.label}</div>
                    </div>
                    <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
                  </Card>
                );
              })}
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full h-auto">
                <TabsTrigger value="matched" data-testid="tab-matched">Bate ({report.summary.matched})</TabsTrigger>
                <TabsTrigger value="mismatch" data-testid="tab-mismatch">Diverge ({report.summary.value_mismatch})</TabsTrigger>
                <TabsTrigger value="missing-sys" data-testid="tab-missing-sys">Falta no sistema ({report.summary.missing_in_system})</TabsTrigger>
                <TabsTrigger value="missing-tl" data-testid="tab-missing-tl">Falta na TicketLog ({report.summary.missing_in_ticketlog})</TabsTrigger>
                <TabsTrigger value="unreg" data-testid="tab-unreg">Placa não cad. ({report.summary.unregistered_plates})</TabsTrigger>
              </TabsList>

              <TabsContent value="matched" className="mt-4">
                <ComparisonTable rows={report.matched} mode="match" />
              </TabsContent>
              <TabsContent value="mismatch" className="mt-4">
                <ComparisonTable rows={report.valueMismatch} mode="mismatch" />
              </TabsContent>
              <TabsContent value="missing-sys" className="mt-4">
                <TicketLogOnlyTable
                  rows={report.missingInSystem}
                  title="No PDF da TicketLog mas não há abastecimento equivalente cadastrado no sistema"
                  onCreate={setCreateTx}
                />
              </TabsContent>
              <TabsContent value="missing-tl" className="mt-4">
                <SystemOnlyTable rows={report.missingInTicketlog} />
              </TabsContent>
              <TabsContent value="unreg" className="mt-4">
                <TicketLogOnlyTable rows={report.unregisteredPlates} title="Placas que aparecem no PDF da TicketLog mas NÃO estão cadastradas em /admin/vehicles" warn />
              </TabsContent>
            </Tabs>
          </>
        )}

        {!report && !loading && (
          <Card className="p-12 text-center text-neutral-500">
            <Fuel className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Envie um PDF ou Excel para iniciar a conciliação.</p>
          </Card>
        )}
      </div>
      </DetailCtx.Provider>

      <CreateFuelingDialog
        tx={createTx}
        vehicles={vehicles}
        onClose={() => setCreateTx(null)}
        onCreated={(tx, created) => {
          setReport((prev) => prev ? moveCreatedToMatch(prev, tx, created) : prev);
          setCreateTx(null);
          toast({ title: "Abastecimento criado", description: `${tx.plate} entrou na conciliação sem novo upload.` });
        }}
      />

      {detailFueling && (
        <DetailModal
          fueling={detailFueling}
          vehicle={detailVehicle}
          driverName={detailDriver}
          fuelings={fuelings}
          onClose={() => setDetailId(null)}
          zoomedPhoto={zoomedPhoto}
          setZoomedPhoto={setZoomedPhoto}
        />
      )}
    </>
  );
}

export { ConciliacaoTicketlogPage as ConciliacaoContent };

function ComparisonTable({ rows, mode }: { rows: MatchEntry[]; mode: "match" | "mismatch" }) {
  const openDetail = useContext(DetailCtx);
  if (!rows.length) {
    return (
      <Card className="p-8 text-center text-neutral-500">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhum registro nesta categoria.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Placa</th>
            <th className="px-3 py-2 text-left">Combustível</th>
            <th className="px-3 py-2 text-right">Litros TL</th>
            <th className="px-3 py-2 text-right">Litros Sis</th>
            <th className="px-3 py-2 text-right">Valor TL</th>
            <th className="px-3 py-2 text-right">Valor Sis</th>
            <th className="px-3 py-2 text-right">Δ Valor</th>
            <th className="px-3 py-2 text-left">Motorista (TL)</th>
            <th className="px-3 py-2 text-left">Posto</th>
            <th className="px-3 py-2 text-left">Cód. TL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r, i) => {
            const tl = r.ticketlog;
            const sys = r.system;
            const diffValor = sys.total_cost - (tl.valor || 0);
            const isMismatch = mode === "mismatch";
            return (
              <tr key={`${tl.code}-${i}`} className={isMismatch ? "bg-amber-50/50 dark:bg-amber-950/20" : ""} data-testid={`row-cmp-${tl.code}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {tl.date}
                  <div className="text-xs text-neutral-500">{tl.time}</div>
                  {r.diffs.dateOffsetDays ? (
                    <div className="text-xs text-amber-700" title="Abastecimento do sistema em outra data, dentro da tolerância de 1 dia">
                      sistema {fmtDate(sys.date)} ({r.diffs.dateOffsetDays > 0 ? "+" : ""}{r.diffs.dateOffsetDays}d)
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono">{tl.plate}</td>
                <td className="px-3 py-2">
                  {tl.fuelType}
                  {!r.diffs.fuelMatches && (
                    <Badge variant="outline" className="ml-1 text-xs border-amber-500 text-amber-700">≠ {sys.fuel_type}</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{tl.liters?.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{sys.liters?.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(tl.valor || 0)}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(sys.total_cost)}</td>
                <td className={`px-3 py-2 text-right font-bold ${Math.abs(diffValor) < 0.01 ? "text-emerald-600" : Math.abs(diffValor) < 1 ? "text-amber-600" : "text-rose-600"}`}>
                  {diffValor > 0 ? "+" : ""}{brl(diffValor)}
                </td>
                <td className="px-3 py-2 text-xs">{tl.driver}</td>
                <td className="px-3 py-2 text-xs">{tl.station}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => openDetail?.(sys.id)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                    title="Ver detalhes do abastecimento (NF, foto da placa, hodômetro)"
                    data-testid={`button-detail-${sys.id}`}
                  >
                    {tl.code}
                    <Eye className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function TicketLogOnlyTable({ rows, title, warn, onCreate }: { rows: { ticketlog: TicketLogTx }[]; title: string; warn?: boolean; onCreate?: (tx: TicketLogTx) => void }) {
  if (!rows.length) {
    return (
      <Card className="p-8 text-center text-neutral-500">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30 text-emerald-500" />
        <p className="text-sm">Nenhum registro nesta categoria.</p>
      </Card>
    );
  }
  const total = rows.reduce((s, r) => s + (r.ticketlog.valor || 0), 0);
  return (
    <Card className="overflow-x-auto">
      <div className={`px-4 py-3 text-sm border-b ${warn ? "bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200" : "bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200"} flex items-center gap-2`}>
        {warn ? <Car className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <span>{title}</span>
        <span className="ml-auto font-bold">Total: {brl(total)}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Hora</th>
            <th className="px-3 py-2 text-left">Placa</th>
            <th className="px-3 py-2 text-left">Combustível</th>
            <th className="px-3 py-2 text-right">KM</th>
            <th className="px-3 py-2 text-right">Litros</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-left">Motorista</th>
            <th className="px-3 py-2 text-left">Posto / Cidade</th>
            <th className="px-3 py-2 text-left">Cód. TL</th>
            {onCreate ? <th className="px-3 py-2 text-left">Ações</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r, i) => {
            const t = r.ticketlog;
            return (
              <tr key={`${t.code}-${i}`} data-testid={`row-tl-only-${t.code}`}>
                <td className="px-3 py-2">{t.date}</td>
                <td className="px-3 py-2 text-xs">{t.time}</td>
                <td className="px-3 py-2 font-mono font-semibold">{t.plate}</td>
                <td className="px-3 py-2">{t.fuelType}</td>
                <td className="px-3 py-2 text-right">{t.km?.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right">{t.liters?.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(t.valor || 0)}</td>
                <td className="px-3 py-2 text-xs">{t.driver}</td>
                <td className="px-3 py-2 text-xs">{t.station} {t.city ? `· ${t.city}/${t.uf}` : ""}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                {onCreate ? (
                  <td className="px-3 py-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onCreate(t)} data-testid={`button-criar-abastecimento-${t.code}`}>
                      <Plus className="h-3 w-3 mr-1" />
                      Criar Abastecimento
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function SystemOnlyTable({ rows }: { rows: { system: SystemTx }[] }) {
  const openDetail = useContext(DetailCtx);
  if (!rows.length) {
    return (
      <Card className="p-8 text-center text-neutral-500">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30 text-emerald-500" />
        <p className="text-sm">Nenhum registro nesta categoria.</p>
      </Card>
    );
  }
  const total = rows.reduce((s, r) => s + r.system.total_cost, 0);
  return (
    <Card className="overflow-x-auto">
      <div className="px-4 py-3 text-sm border-b bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>Cadastrados no sistema mas SEM transação correspondente no PDF da TicketLog (possíveis abastecimentos fora do cartão TL ou pendentes de fatura)</span>
        <span className="ml-auto font-bold">Total: {brl(total)}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Placa</th>
            <th className="px-3 py-2 text-left">Combustível</th>
            <th className="px-3 py-2 text-right">KM</th>
            <th className="px-3 py-2 text-right">Litros</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-left">Motorista</th>
            <th className="px-3 py-2 text-left">Posto</th>
            <th className="px-3 py-2 text-left">Aut. TL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r, i) => {
            const s = r.system;
            return (
              <tr key={s.id} data-testid={`row-sys-only-${s.id}`}>
                <td className="px-3 py-2">{fmtDate(s.date)}</td>
                <td className="px-3 py-2 font-mono font-semibold">{s.plate || "?"}</td>
                <td className="px-3 py-2">{s.fuel_type}</td>
                <td className="px-3 py-2 text-right">{s.km?.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right">{s.liters?.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(s.total_cost)}</td>
                <td className="px-3 py-2 text-xs">{s.driver}</td>
                <td className="px-3 py-2 text-xs">{s.station}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => openDetail?.(s.id)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                    title="Ver detalhes do abastecimento (NF, foto da placa, hodômetro)"
                    data-testid={`button-detail-sys-${s.id}`}
                  >
                    {s.ticketlog_autorizacao || "ver detalhes"}
                    <Eye className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function plateKey(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function ticketDateToIso(date: string | null): string {
  if (!date) return "";
  const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : "";
}

function systemFuelType(raw: string | null): string {
  const u = (raw || "").toUpperCase();
  if (u.includes("ETANOL")) return "etanol";
  if (u.includes("DIESEL")) return "diesel";
  return "gasolina";
}

function moveCreatedToMatch(
  report: Report,
  tx: TicketLogTx,
  created: { id: number; totalCost: number; liters: number; fuelType: string; km: number; station: string; date: string },
): Report {
  const valorDiff = Math.abs(created.totalCost - (tx.valor || 0));
  const bate = valorDiff < 5;
  const entry: MatchEntry = {
    ticketlog: tx,
    system: {
      id: created.id,
      date: created.date,
      plate: tx.plate,
      driver: null,
      total_cost: created.totalCost,
      liters: created.liters,
      fuel_type: created.fuelType,
      station: created.station,
      km: created.km,
      ticketlog_autorizacao: tx.code,
    },
    diffs: {
      valor: valorDiff,
      liters: Math.abs(created.liters - (tx.liters || 0)),
      km: tx.km != null ? Math.abs(created.km - tx.km) : null,
      fuelMatches: true,
      dateOffsetDays: 0,
    },
  };
  const systemTotal = report.summary.system_total + created.totalCost;
  return {
    ...report,
    summary: {
      ...report.summary,
      system_count: report.summary.system_count + 1,
      system_total: systemTotal,
      diff_total: systemTotal - report.summary.ticketlog_total,
      matched: report.summary.matched + (bate ? 1 : 0),
      value_mismatch: report.summary.value_mismatch + (bate ? 0 : 1),
      missing_in_system: Math.max(0, report.summary.missing_in_system - 1),
    },
    missingInSystem: report.missingInSystem.filter((r) => r.ticketlog.code !== tx.code),
    matched: bate ? [...report.matched, entry] : report.matched,
    valueMismatch: bate ? report.valueMismatch : [...report.valueMismatch, entry],
  };
}

function CreateFuelingDialog({
  tx,
  vehicles,
  onClose,
  onCreated,
}: {
  tx: TicketLogTx | null;
  vehicles: Vehicle[];
  onClose: () => void;
  onCreated: (tx: TicketLogTx, created: { id: number; totalCost: number; liters: number; fuelType: string; km: number; station: string; date: string }) => void;
}) {
  const { toast } = useToast();
  const [receiptPhoto, setReceiptPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReceiptPhoto("");
  }, [tx?.code]);

  const vehicle = tx ? vehicles.find((v) => plateKey(v.plate) === plateKey(tx.plate)) : undefined;
  const date = ticketDateToIso(tx?.date || null);
  const liters = Number(tx?.liters) || 0;
  const total = Number(tx?.valor) || 0;
  const km = tx?.km ?? null;
  const fuelType = systemFuelType(tx?.fuelType || null);
  const station = [tx?.station, tx?.city, tx?.uf].filter(Boolean).join(" / ");
  const ready = !!tx && !!vehicle && !!date && liters > 0 && total > 0 && km != null && km > 0;

  const confirm = async () => {
    if (!tx || !vehicle || !ready) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/fueling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          date,
          liters: String(liters),
          costPerLiter: String((total / liters).toFixed(3)),
          totalCost: String(total.toFixed(2)),
          km,
          fuelType,
          fullTank: true,
          station: tx.station || station,
          notes: `TicketLog ${tx.code}${tx.time ? ` ${tx.time}` : ""}. ${station}`.trim(),
          receiptPhoto: receiptPhoto || null,
          ticketlogAutorizacao: tx.code,
          allowKmOverride: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Falha ao criar abastecimento");
      onCreated(tx, {
        id: Number(body.id),
        totalCost: total,
        liters,
        fuelType,
        km,
        station: tx.station || station,
        date,
      });
    } catch (err: any) {
      toast({ title: "Erro ao criar abastecimento", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!tx} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-criar-abastecimento">
        <DialogHeader>
          <DialogTitle>Criar abastecimento</DialogTitle>
          <DialogDescription>
            Conferir os dados da TicketLog e confirmar. O lançamento entra no sistema e sai de “Falta no sistema”.
          </DialogDescription>
        </DialogHeader>
        {tx && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Placa</div>
              <div className="font-mono font-semibold">{tx.plate}</div>
              <div className="text-xs text-neutral-500">{vehicle ? vehicle.model : "Viatura não encontrada"}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Data</div>
              <div>{tx.date || "—"} {tx.time || ""}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Valor</div>
              <div className="font-semibold">{brl(total)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Litros</div>
              <div>{liters ? liters.toFixed(3) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Combustível</div>
              <div className="capitalize">{fuelType}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">KM</div>
              <div>{km != null ? km.toLocaleString("pt-BR") : "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-neutral-500">Posto</div>
              <div>{station || "—"}</div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-neutral-500" htmlFor="receipt-ticketlog">Comprovante (opcional)</label>
              <Input
                id="receipt-ticketlog"
                type="file"
                accept="image/*"
                className="mt-1"
                data-testid="input-comprovante-ticketlog"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const { dataUrl } = await compressImageFile(file);
                    setReceiptPhoto(dataUrl);
                  } catch {
                    toast({ title: "Não foi possível ler a foto", variant: "destructive" });
                  }
                }}
              />
              {receiptPhoto ? <p className="text-xs text-emerald-700 mt-1">Foto anexada</p> : null}
            </div>
            {!vehicle ? <p className="col-span-2 text-sm text-rose-700">A placa não está ligada a uma viatura cadastrada.</p> : null}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={!ready || saving} data-testid="button-confirmar-criar-abastecimento">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar cadastro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
