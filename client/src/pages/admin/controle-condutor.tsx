import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Car, Play, Square, Clock, User, Gauge, Search,
  AlertTriangle, Trash2, Eye, RefreshCw, Timer, ChevronDown, ChevronUp, ShieldAlert,
  Users, PenLine, FileText, FileSpreadsheet
} from "lucide-react";
import jsPDF from "jspdf";
import { exportFormattedExcel } from "@/lib/excel-export";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function normalizeSignature(sig: string | null | undefined): string | null {
  if (!sig) return null;
  if (sig === "CONFIRMADO") return null;
  return sig.startsWith("data:") ? sig : `data:image/png;base64,${sig}`;
}

function exportSessionPdf(session: any) {
  const shifts = (session.shifts || []) as any[];
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Controle de Condutor — Escolta Torres", pw / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Sessão #${session.id}`, pw / 2, y, { align: "center" });
  y += 10;

  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", 55, y);
    y += 6;
  };

  line("Viatura (VTR)", `${session.vehicle_prefix ? session.vehicle_prefix + " — " : ""}${session.vehicle_plate || "—"}`);
  line("Veículo", `${session.vehicle_model || ""} ${session.vehicle_year ? "(" + session.vehicle_year + ")" : ""}`.trim());
  line("Condutor principal", session.driver_name || "—");
  if (session.partner_name) line("Parceiro", session.partner_name);
  line("KM Saída", session.km_start != null ? String(session.km_start) : "—");
  line("KM Final", session.km_end != null ? String(session.km_end) : "—");
  line("Início", session.started_at ? formatFullDate(session.started_at) : "—");
  line("Fim", session.ended_at ? formatFullDate(session.ended_at) : "Em andamento");
  line("Trocas de direção", String(Math.max(0, shifts.length - 1)));
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Turnos / Trocas de Direção", 14, y);
  y += 6;
  doc.setFontSize(9);

  const cols = [
    { t: "Condutor", x: 14 },
    { t: "Início", x: 90 },
    { t: "Fim", x: 130 },
    { t: "Duração", x: 170 },
  ];
  doc.setFont("helvetica", "bold");
  cols.forEach(c => doc.text(c.t, c.x, y));
  y += 1;
  doc.line(14, y, pw - 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  shifts.forEach((s: any) => {
    if (y > 270) { doc.addPage(); y = 16; }
    doc.text(String(s.driver_name || "—").slice(0, 34), 14, y);
    doc.text(s.started_at ? formatTime(s.started_at) : "—", 90, y);
    doc.text(s.ended_at ? formatTime(s.ended_at) : "Ativo", 130, y);
    doc.text(formatDuration(Number(s.duration_minutes) || 0), 170, y);
    y += 6;
  });

  y += 6;
  const sig = normalizeSignature(session.driver_signature);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Visto / Assinatura do condutor:", 14, y);
  y += 4;
  if (sig) {
    try { doc.addImage(sig, "PNG", 14, y, 70, 30); } catch { /* ignore */ }
    y += 32;
  } else if (session.driver_signature === "CONFIRMADO") {
    doc.setFont("helvetica", "normal");
    doc.text("CONFIRMADO (sem desenho de assinatura)", 14, y + 5);
    y += 10;
  } else {
    doc.line(14, y + 12, 90, y + 12);
    y += 16;
  }

  doc.save(`controle-condutor-sessao-${session.id}.pdf`);
}

function exportSessionExcel(session: any) {
  const shifts = (session.shifts || []) as any[];
  const kmTotal = session.km_end != null && session.km_start != null ? session.km_end - session.km_start : null;

  const driverTotals: Record<string, { name: string; totalMinutes: number; shifts: number }> = {};
  for (const s of shifts) {
    const key = String(s.driver_id);
    if (!driverTotals[key]) driverTotals[key] = { name: s.driver_name, totalMinutes: 0, shifts: 0 };
    driverTotals[key].totalMinutes += Number(s.duration_minutes) || 0;
    driverTotals[key].shifts += 1;
  }

  const rows: (string | number)[][] = [];
  // Bloco de metadados da sessão
  rows.push(["DADOS DA SESSÃO", "", "", ""]);
  rows.push(["Viatura (VTR)", `${session.vehicle_prefix ? session.vehicle_prefix + " — " : ""}${session.vehicle_plate || "—"}`, "Ano", session.vehicle_year ?? "—"]);
  rows.push(["Condutor principal", session.driver_name || "—", "Parceiro", session.partner_name || "—"]);
  rows.push(["Início", session.started_at ? formatFullDate(session.started_at) : "—", "Fim", session.ended_at ? formatFullDate(session.ended_at) : "Em andamento"]);
  rows.push(["KM Saída", session.km_start ?? "—", "KM Final", session.km_end ?? "—"]);
  rows.push(["KM Total", kmTotal != null ? `${kmTotal} km` : "—", "Total de trocas", Math.max(0, shifts.length - 1)]);
  rows.push(["", "", "", ""]);

  // Turnos / trocas de direção
  rows.push(["TURNOS / TROCAS DE DIREÇÃO", "", "", ""]);
  rows.push(["Condutor", "Início", "Fim", "Duração"]);
  for (const s of shifts) {
    rows.push([
      s.driver_name || "—",
      s.started_at ? formatFullDate(s.started_at) : "—",
      s.ended_at ? formatFullDate(s.ended_at) : "Em andamento",
      formatDuration(Number(s.duration_minutes) || 0),
    ]);
  }
  rows.push(["", "", "", ""]);

  // Tempo por condutor
  rows.push(["TEMPO POR CONDUTOR", "", "", ""]);
  rows.push(["Condutor", "Tempo total", "Turnos", ""]);
  for (const d of Object.values(driverTotals)) {
    rows.push([d.name, formatDuration(d.totalMinutes), d.shifts, ""]);
  }

  return exportFormattedExcel({
    fileName: `controle-condutor-sessao-${session.id}`,
    sheetName: `Sessão ${session.id}`,
    title: `Controle de Condutor — Sessão #${session.id}`,
    subtitle: `VTR ${session.vehicle_plate || "—"} • ${session.driver_name || "—"}${session.partner_name ? " / " + session.partner_name : ""}`,
    period: session.started_at ? `Início: ${formatFullDate(session.started_at)}${session.ended_at ? "  •  Fim: " + formatFullDate(session.ended_at) : ""}` : undefined,
    headers: ["Item", "Valor", "Item", "Valor"],
    colWidths: [28, 26, 22, 18],
    rows,
  });
}

export default function ControleCondutorPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [lookupPlate, setLookupPlate] = useState("");
  const [lookupDatetime, setLookupDatetime] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [showLookup, setShowLookup] = useState(false);

  const { data: sessions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/driver-sessions", statusFilter, vehicleFilter, driverFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (vehicleFilter) params.set("vehicleId", vehicleFilter);
      if (driverFilter) params.set("driverId", driverFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await authFetch(`/api/driver-sessions?${params}`);
      if (!r.ok) throw new Error("Erro ao carregar");
      return r.json();
    },
  });

  const { data: vehicles = [] } = useQuery<any[]>({ queryKey: ["/api/vehicles"] });
  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  const activeDrivers = useMemo(() =>
    (employees || []).filter((e: any) => e.status === "ativo").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [employees]
  );

  const doLookup = async () => {
    if (!lookupPlate || !lookupDatetime) {
      toast({ title: "Informe a placa e a data/hora da infração", variant: "destructive" });
      return;
    }
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const params = new URLSearchParams({ plate: lookupPlate, datetime: lookupDatetime });
      const r = await authFetch(`/api/driver-sessions/lookup?${params}`);
      if (!r.ok) throw new Error("Erro na consulta");
      const data = await r.json();
      setLookupResult(data);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setLookupLoading(false);
  };

  const activeSessions = sessions.filter(s => s.status === "ativo");
  const finishedSessions = sessions.filter(s => s.status === "finalizado");

  const openDetail = async (session: any) => {
    setDetailLoading(true);
    try {
      const r = await authFetch(`/api/driver-sessions/${session.id}`);
      if (!r.ok) throw new Error("Erro");
      const data = await r.json();
      setSelectedSession(data);
    } catch {
      setSelectedSession(session);
    }
    setDetailLoading(false);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/driver-sessions/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "Sessão excluída" });
      setSelectedSession(null);
      queryClient.invalidateQueries({ queryKey: ["/api/driver-sessions"] });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4" data-testid="admin-driver-control-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
              <Car className="w-6 h-6 text-sky-600" />
              Controle de Condutor
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Rodízio de direção das viaturas de escolta</p>
          </div>
          <div className="flex items-center gap-2">
            {activeSessions.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-sm px-3 py-1 animate-pulse">
                <Play className="w-3.5 h-3.5 mr-1" />
                {activeSessions.length} em operação
              </Badge>
            )}
            <Button
              variant={showLookup ? "default" : "outline"}
              size="sm"
              className={showLookup ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50"}
              onClick={() => setShowLookup(!showLookup)}
              data-testid="button-toggle-lookup"
            >
              <ShieldAlert className="w-4 h-4 mr-1" />
              Consulta de Multa
            </Button>
          </div>
        </div>

        {showLookup && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              Identificar Condutor — Consulta de Multa
            </h2>
            <p className="text-xs text-amber-700">Informe a placa do veículo e a data/hora da infração para descobrir quem estava na condução.</p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-[10px] font-bold text-amber-700 uppercase">Placa do Veículo</Label>
                <Input
                  placeholder="Ex: ABC1D23"
                  value={lookupPlate}
                  onChange={e => setLookupPlate(e.target.value.toUpperCase())}
                  className="h-10 mt-1 w-40 uppercase font-mono font-bold border-amber-300"
                  data-testid="input-lookup-plate"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-amber-700 uppercase">Data/Hora da Infração</Label>
                <Input
                  type="datetime-local"
                  value={lookupDatetime}
                  onChange={e => setLookupDatetime(e.target.value)}
                  className="h-10 mt-1 w-52 border-amber-300"
                  data-testid="input-lookup-datetime"
                />
              </div>
              <Button
                className="h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                onClick={doLookup}
                disabled={lookupLoading || !lookupPlate || !lookupDatetime}
                data-testid="button-do-lookup"
              >
                <Search className="w-4 h-4 mr-1" />
                {lookupLoading ? "Buscando..." : "Consultar"}
              </Button>
            </div>

            {lookupResult && (
              <div className="mt-3">
                {lookupResult.found ? (
                  <div className="space-y-3">
                    {lookupResult.sessions.map((s: any) => (
                      <div key={s.id} className="bg-white border-2 border-amber-300 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className="bg-amber-600 text-white font-bold">CONDUTOR IDENTIFICADO</Badge>
                          <span className="text-[10px] text-neutral-400 font-mono">Sessão #{s.id}</span>
                        </div>
                        <div className="bg-amber-100 rounded-lg p-3 text-center">
                          <p className="text-[10px] text-amber-600 font-bold uppercase">Condutor no momento da infração</p>
                          <p className="text-xl font-black text-amber-900" data-testid="text-lookup-driver">{s.driverAtTime}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase">VTR</p>
                            <p className="font-bold text-neutral-800">{s.vehicle_prefix || ""} {s.vehicle_plate}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase">KM</p>
                            <p className="font-mono text-neutral-700">{s.km_start?.toLocaleString("pt-BR") || "—"} → {s.km_end?.toLocaleString("pt-BR") || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase">Início da sessão</p>
                            <p className="text-neutral-700">{formatFullDate(s.started_at)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase">Fim da sessão</p>
                            <p className="text-neutral-700">{s.ended_at ? formatFullDate(s.ended_at) : "Em andamento"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="w-5 h-5" />
                      <p className="text-sm font-bold">{lookupResult.message}</p>
                    </div>
                    {lookupResult.closest && lookupResult.closest.length > 0 && (
                      <div>
                        <p className="text-xs text-neutral-500 mb-2">Sessões mais próximas encontradas:</p>
                        {lookupResult.closest.map((s: any) => (
                          <div key={s.id} className="bg-neutral-50 rounded-lg p-2 mb-1 text-xs">
                            <span className="font-bold">{s.driver_name}</span> — {s.vehicle_plate} — {formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : "ativo"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeSessions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeSessions.map(s => (
              <Card
                key={s.id}
                className="p-4 border-2 border-emerald-200 bg-emerald-50/50 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openDetail(s)}
                data-testid={`card-active-session-${s.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                    <Play className="w-2.5 h-2.5 mr-1" /> ATIVO
                  </Badge>
                  <span className="text-[10px] text-neutral-400 font-mono">#{s.id}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Car className="w-4 h-4 text-sky-600" />
                  <span className="font-bold text-sm text-neutral-900">{s.vehicle_prefix || s.vehicle_plate}</span>
                  <span className="text-[10px] text-neutral-400">{s.vehicle_plate}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-600">
                  <User className="w-3 h-3" />
                  <span>{s.driver_name}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1">
                  <Clock className="w-3 h-3" />
                  <span>Início: {formatTime(s.started_at)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[120px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Veículo</Label>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-vehicle">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(vehicles || []).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.frota || v.plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Condutor</Label>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="h-9 mt-1" data-testid="filter-driver">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {activeDrivers.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 mt-1 w-36" data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Até</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 mt-1 w-36" data-testid="filter-date-to" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-400">Carregando registros...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <Car className="w-8 h-8 mx-auto text-neutral-200 mb-2" />
              <p className="text-sm text-neutral-400">Nenhuma sessão de condução encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-sessions">
                <thead>
                  <tr className="bg-neutral-50 border-b">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">#</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">VTR</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Condutor</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Início</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Fim</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">KM</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-500 uppercase">Status</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-neutral-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => {
                    const kmTotal = s.km_end && s.km_start ? s.km_end - s.km_start : null;
                    return (
                      <tr key={s.id} className="border-b hover:bg-neutral-50 cursor-pointer" onClick={() => openDetail(s)} data-testid={`row-session-${s.id}`}>
                        <td className="px-3 py-2 font-mono text-xs text-neutral-400">{s.id}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-neutral-900">{s.vehicle_prefix || ""}</span>
                          <span className="text-neutral-400 text-xs ml-1">{s.vehicle_plate}</span>
                        </td>
                        <td className="px-3 py-2 font-medium text-neutral-800">
                          <button
                            type="button"
                            className="text-sky-700 hover:underline font-medium text-left"
                            onClick={(e) => { e.stopPropagation(); setDriverFilter(String(s.driver_id)); }}
                            data-testid={`link-driver-${s.id}`}
                          >
                            {s.driver_name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-500">{formatTime(s.started_at)}</td>
                        <td className="px-3 py-2 text-xs text-neutral-500">{s.ended_at ? formatTime(s.ended_at) : "—"}</td>
                        <td className="px-3 py-2 text-xs text-neutral-600 font-mono">
                          {kmTotal !== null ? `${kmTotal.toLocaleString("pt-BR")} km` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {s.status === "ativo" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">
                              <Play className="w-2.5 h-2.5 mr-0.5" /> Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-neutral-500">
                              <Square className="w-2.5 h-2.5 mr-0.5" /> Finalizado
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(s); }} data-testid={`button-view-${s.id}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedSession && (
          <SessionDetailDialog
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
            onDelete={(id) => {
              if (confirm("Tem certeza que deseja excluir esta sessão?")) {
                deleteMutation.mutate(id);
              }
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function SessionDetailDialog({ session, onClose, onDelete }: { session: any; onClose: () => void; onDelete: (id: number) => void }) {
  const shifts = session.shifts || [];
  const kmTotal = session.km_end && session.km_start ? session.km_end - session.km_start : null;

  const driverTotals: Record<string, { name: string; totalMinutes: number; shifts: number }> = {};
  for (const s of shifts) {
    const key = String(s.driver_id);
    if (!driverTotals[key]) driverTotals[key] = { name: s.driver_name, totalMinutes: 0, shifts: 0 };
    driverTotals[key].totalMinutes += Number(s.duration_minutes) || 0;
    driverTotals[key].shifts += 1;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-sky-600" />
            Sessão #{session.id}
          </DialogTitle>
          <DialogDescription>Detalhes da operação de condução</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            {session.status === "ativo" ? (
              <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">
                <Play className="w-3 h-3 mr-1" /> Em Operação
              </Badge>
            ) : (
              <Badge variant="outline" className="font-bold text-neutral-500">
                <Square className="w-3 h-3 mr-1" /> Finalizado
              </Badge>
            )}
          </div>

          <div className="bg-neutral-50 rounded-xl p-4 space-y-2 border">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">VTR / Prefixo</p>
                <p className="text-sm font-bold text-neutral-900">{session.vehicle_prefix || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Placa</p>
                <p className="text-sm font-bold text-neutral-900">{session.vehicle_plate}</p>
              </div>
              <div className={session.partner_name ? "" : "col-span-2"}>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Condutor</p>
                <p className="text-sm font-bold text-neutral-800">{session.driver_name}</p>
              </div>
              {session.partner_name && (
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase flex items-center gap-1"><Users className="w-3 h-3" /> Parceiro</p>
                  <p className="text-sm font-bold text-neutral-800">{session.partner_name}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Início</p>
                <p className="text-xs text-neutral-700">{formatFullDate(session.started_at)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">Fim</p>
                <p className="text-xs text-neutral-700">{session.ended_at ? formatFullDate(session.ended_at) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">KM Saída</p>
                <p className="text-sm font-mono text-neutral-800">{session.km_start?.toLocaleString("pt-BR") || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-bold uppercase">KM Final</p>
                <p className="text-sm font-mono text-neutral-800">{session.km_end?.toLocaleString("pt-BR") || "—"}</p>
              </div>
            </div>
            {kmTotal !== null && (
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center mt-2">
                <p className="text-[10px] text-sky-600 font-bold uppercase">KM Total Percorrido</p>
                <p className="text-lg font-black text-sky-700">{kmTotal.toLocaleString("pt-BR")} km</p>
              </div>
            )}
          </div>

          {shifts.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Turnos de Condução ({shifts.length})
              </h3>
              <div className="space-y-1.5">
                {shifts.map((s: any, i: number) => (
                  <div key={s.id || i} className={`rounded-lg px-3 py-2 border ${s.is_active ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50 border-neutral-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${s.is_active ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"}`} />
                        <span className="text-xs font-bold text-neutral-800">{s.driver_name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        <Timer className="w-2.5 h-2.5 mr-0.5" />
                        {s.is_active ? "Em andamento" : formatDuration(Number(s.duration_minutes) || 0)}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5 ml-4">
                      {formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : "agora"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(driverTotals).length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Resumo por Condutor
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(driverTotals).map((d, i) => (
                  <div key={i} className="bg-neutral-50 rounded-lg p-3 border text-center">
                    <p className="text-xs font-bold text-neutral-800 truncate">{d.name}</p>
                    <p className="text-lg font-black text-sky-700">{formatDuration(d.totalMinutes)}</p>
                    <p className="text-[10px] text-neutral-400">{d.shifts} turno(s)</p>
                  </div>
                ))}
              </div>
              <div className="text-center mt-2">
                <p className="text-[10px] text-neutral-400">Total de trocas: <strong>{Math.max(0, shifts.length - 1)}</strong></p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
              <PenLine className="w-3.5 h-3.5" /> Visto / Assinatura do Condutor
            </h3>
            {normalizeSignature(session.driver_signature) ? (
              <div className="bg-white border rounded-lg p-2 flex items-center justify-center">
                <img
                  src={normalizeSignature(session.driver_signature)!}
                  alt="Assinatura do condutor"
                  className="max-h-32 object-contain"
                  data-testid="img-signature"
                />
              </div>
            ) : session.driver_signature === "CONFIRMADO" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-sm font-bold text-emerald-700">CONFIRMADO</p>
                <p className="text-[10px] text-neutral-500">Encerramento confirmado pelo condutor (sem desenho)</p>
              </div>
            ) : (
              <div className="bg-neutral-50 border rounded-lg p-3 text-center">
                <p className="text-xs text-neutral-400">Sem assinatura registrada</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => exportSessionPdf(session)} data-testid="button-export-pdf">
              <FileText className="w-3.5 h-3.5 mr-1" /> Exportar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportSessionExcel(session)} data-testid="button-export-excel">
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Planilha
            </Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 ml-auto" onClick={() => onDelete(session.id)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
