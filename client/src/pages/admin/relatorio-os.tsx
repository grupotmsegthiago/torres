import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  FileText, Search, Download, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, XCircle, Loader2,
  ChevronDown, ChevronUp, ArrowUpDown,
} from "lucide-react";
import { parseUTCDate } from "@/lib/utils";

interface ReportOS {
  id: number;
  osNumber: string;
  status: string;
  missionStatus: string;
  clientName: string;
  escortedVehiclePlate: string | null;
  escortedDriverName: string | null;
  origin: string | null;
  destination: string | null;
  scheduledDate: string | null;
  missionStartedAt: string | null;
  completedDate: string | null;
  vehicle: { plate: string; model: string } | null;
  employee1: { name: string } | null;
  employee2: { name: string } | null;
  liveCost: {
    faturamento: number;
    pagamento: number;
    custo_combustivel: number;
    custo_pedagio: number;
    custo_outros: number;
    custo_total: number;
    resultado: number;
    margem_pct: number;
    km_total: number;
    horas_missao: number;
    fat_acionamento: number;
    fat_hora_extra: number;
    fat_km_extra: number;
    contrato_nome: string | null;
  } | null;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  concluida: { label: "Concluída", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  "concluída": { label: "Concluída", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  em_andamento: { label: "Andamento", color: "text-sky-700", bg: "bg-sky-100", icon: Clock },
  agendada: { label: "Agendada", color: "text-amber-700", bg: "bg-amber-100", icon: AlertTriangle },
  cancelada: { label: "Cancelada", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
  pendente: { label: "Pendente", color: "text-orange-700", bg: "bg-orange-100", icon: Clock },
};

type SortField = "osNumber" | "status" | "clientName" | "scheduledDate" | "faturamento" | "resultado";

function fmtTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseUTCDate(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseUTCDate(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function truncRoute(str: string | null | undefined, max = 25): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export default function RelatorioOSPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("scheduledDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: gridData = [], isLoading, refetch, isFetching } = useQuery<ReportOS[]>({
    queryKey: ["/api/operational-grid"],
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    let items = [...gridData];
    if (statusFilter !== "all") {
      items = items.filter(o => {
        const s = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return s === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(o =>
        (o.osNumber || "").toLowerCase().includes(q) ||
        (o.clientName || "").toLowerCase().includes(q) ||
        (o.vehicle?.plate || "").toLowerCase().includes(q) ||
        (o.employee1?.name || "").toLowerCase().includes(q) ||
        (o.origin || "").toLowerCase().includes(q) ||
        (o.destination || "").toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "osNumber": va = a.osNumber; vb = b.osNumber; break;
        case "status": va = a.status; vb = b.status; break;
        case "clientName": va = a.clientName; vb = b.clientName; break;
        case "scheduledDate": va = a.scheduledDate || ""; vb = b.scheduledDate || ""; break;
        case "faturamento": va = a.liveCost?.faturamento || 0; vb = b.liveCost?.faturamento || 0; break;
        case "resultado": va = a.liveCost?.resultado || 0; vb = b.liveCost?.resultado || 0; break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [gridData, statusFilter, search, sortField, sortDir]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { concluida: 0, em_andamento: 0, agendada: 0, cancelada: 0, pendente: 0 };
    gridData.forEach(o => {
      const s = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (s === "concluida" || s === "concluída") counts.concluida++;
      else if (s === "em_andamento") counts.em_andamento++;
      else if (s === "agendada") counts.agendada++;
      else if (s === "cancelada") counts.cancelada++;
      else counts.pendente++;
    });
    return counts;
  }, [gridData]);

  const totals = useMemo(() => {
    const t = { receita: 0, custo: 0, pedagio: 0, resultado: 0, km: 0 };
    filtered.forEach(o => {
      t.receita += o.liveCost?.faturamento || 0;
      t.custo += o.liveCost?.custo_total || 0;
      t.pedagio += o.liveCost?.custo_pedagio || 0;
      t.resultado += o.liveCost?.resultado || 0;
      t.km += o.liveCost?.km_total || 0;
    });
    return t;
  }, [filtered]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-neutral-300" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-white" /> : <ChevronDown className="w-3 h-3 text-white" />;
  };

  const exportCSV = () => {
    const headers = ["#", "OS", "Status", "Cliente", "Veíc. Escoltado", "Viatura", "Agente 1", "Agente 2", "Origem", "Destino", "Data Inicial", "Hora Inicial", "Data Final", "Hora Final", "Faturamento", "Custo Total", "Pedágio", "Resultado", "% Acerto", "KM Total"];
    const rows = filtered.map((o, i) => [
      i + 1,
      o.osNumber,
      o.status,
      o.clientName,
      o.escortedVehiclePlate || "",
      o.vehicle?.plate || "",
      o.employee1?.name || "",
      o.employee2?.name || "",
      o.origin || "",
      o.destination || "",
      fmtDateShort(o.scheduledDate),
      fmtTime(o.missionStartedAt || o.scheduledDate),
      fmtDateShort(o.completedDate),
      fmtTime(o.completedDate),
      (o.liveCost?.faturamento || 0).toFixed(2),
      (o.liveCost?.custo_total || 0).toFixed(2),
      (o.liveCost?.custo_pedagio || 0).toFixed(2),
      (o.liveCost?.resultado || 0).toFixed(2),
      ((o.liveCost?.margem_pct || 0)).toFixed(1) + "%",
      (o.liveCost?.km_total || 0).toFixed(0),
    ]);
    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_os_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #1e3a5f 100%)" }}>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-report-title">
                    RELATÓRIO DE OS — {filtered.length} missões
                  </h1>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Ordens de Serviço do dia
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(["concluida", "em_andamento", "agendada", "cancelada"] as const).map(s => {
                  const cfg = statusConfig[s];
                  const count = statusCounts[s] || 0;
                  const active = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(active ? "all" : s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${active ? "bg-white/20 border-white/30 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}`}
                      data-testid={`filter-${s}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${active ? "bg-white" : cfg.bg}`} />
                      {cfg.label} {count}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  placeholder="Buscar OS, cliente, placa..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 bg-white/10 border-white/10 text-white placeholder:text-neutral-500 h-9 text-sm"
                  data-testid="input-search-report"
                />
              </div>
              <Button size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/10 hover:bg-white/20 text-white border border-white/10 gap-2" data-testid="button-refresh-report">
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={exportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-export-csv">
                <Download className="w-4 h-4" />
                Exportar CSV
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Receita Total</p>
                <p className="text-lg font-black text-emerald-400" data-testid="text-total-receita">{fmtBRL(totals.receita)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Custo Total</p>
                <p className="text-lg font-black text-red-400" data-testid="text-total-custo">{fmtBRL(totals.custo)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Pedágio Total</p>
                <p className="text-lg font-black text-amber-400" data-testid="text-total-pedagio">{fmtBRL(totals.pedagio)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Resultado</p>
                <p className={`text-lg font-black ${totals.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-total-resultado">{fmtBRL(totals.resultado)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">KM Total</p>
                <p className="text-lg font-black text-blue-400" data-testid="text-total-km">{Math.round(totals.km)} km</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <Card><div className="p-12 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando relatório...</div></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-report-os">
                <thead>
                  <tr className="bg-neutral-900 text-white text-[10px] uppercase tracking-wider">
                    <th className="px-2 py-2.5 text-center w-8">#</th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("osNumber")}>
                      <span className="flex items-center gap-1">OS <SortIcon field="osNumber" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("status")}>
                      <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("clientName")}>
                      <span className="flex items-center gap-1">Cliente <SortIcon field="clientName" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left">Veíc. Escoltado</th>
                    <th className="px-2 py-2.5 text-left">Contrato</th>
                    <th className="px-2 py-2.5 text-left">Viatura</th>
                    <th className="px-2 py-2.5 text-left">Agentes</th>
                    <th className="px-2 py-2.5 text-left">Rota</th>
                    <th className="px-2 py-2.5 text-center cursor-pointer select-none" onClick={() => handleSort("scheduledDate")}>
                      <span className="flex items-center gap-1 justify-center">Data/Hora Inicial <SortIcon field="scheduledDate" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-center">Data Final</th>
                    <th className="px-2 py-2.5 text-center">Hora Final</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer select-none" onClick={() => handleSort("faturamento")}>
                      <span className="flex items-center gap-1 justify-end">Faturamento <SortIcon field="faturamento" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-right">Custo Total</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer select-none" onClick={() => handleSort("resultado")}>
                      <span className="flex items-center gap-1 justify-end">Resultado <SortIcon field="resultado" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-center">% Acerto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={16} className="py-12 text-center text-neutral-400">Nenhuma OS encontrada</td></tr>
                  ) : filtered.map((o, idx) => {
                    const sNorm = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
                    const cfg = statusConfig[sNorm] || statusConfig.pendente;
                    const StatusIcon = cfg.icon;
                    const fat = o.liveCost?.faturamento || 0;
                    const custoT = o.liveCost?.custo_total || 0;
                    const result = o.liveCost?.resultado || 0;
                    const margem = o.liveCost?.margem_pct || 0;
                    const agents = [o.employee1?.name, o.employee2?.name].filter(Boolean).join(" / ") || "—";
                    const route = `${truncRoute(o.origin, 20)} → ${truncRoute(o.destination, 20)}`;
                    return (
                      <tr key={o.id} className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`} data-testid={`row-os-${o.id}`}>
                        <td className="px-2 py-2 text-center text-neutral-400 font-mono">{idx + 1}</td>
                        <td className="px-2 py-2 font-bold text-neutral-900 whitespace-nowrap" data-testid={`text-os-${o.osNumber}`}>{o.osNumber}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color} ${cfg.bg}`} data-testid={`badge-status-${o.id}`}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-semibold text-neutral-800 max-w-[120px] truncate">{o.clientName || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 whitespace-nowrap">{o.escortedVehiclePlate || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 max-w-[100px] truncate">{o.liveCost?.contrato_nome || "—"}</td>
                        <td className="px-2 py-2 font-mono text-neutral-700 whitespace-nowrap">{o.vehicle?.plate || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 max-w-[150px] truncate">{agents}</td>
                        <td className="px-2 py-2 text-neutral-500 max-w-[180px] truncate" title={`${o.origin || ""} → ${o.destination || ""}`}>{route}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <span className="text-neutral-800 font-semibold">{fmtDateShort(o.scheduledDate)}</span>
                          <span className="text-neutral-400 ml-1">{fmtTime(o.missionStartedAt || o.scheduledDate)}</span>
                        </td>
                        <td className="px-2 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtDateShort(o.completedDate)}</td>
                        <td className="px-2 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtTime(o.completedDate)}</td>
                        <td className="px-2 py-2 text-right font-bold text-emerald-700 whitespace-nowrap">{fat > 0 ? fmtBRL(fat) : "—"}</td>
                        <td className="px-2 py-2 text-right text-red-600 whitespace-nowrap">{custoT > 0 ? fmtBRL(custoT) : "—"}</td>
                        <td className={`px-2 py-2 text-right font-black whitespace-nowrap ${result >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fat > 0 ? fmtBRL(result) : "—"}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          {fat > 0 ? (
                            <span className={`font-bold ${margem >= 40 ? "text-emerald-600" : margem >= 20 ? "text-amber-600" : "text-red-600"}`}>
                              {margem.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-neutral-900 text-white font-black text-xs">
                      <td colSpan={12} className="px-2 py-2.5 text-right uppercase tracking-wider">TOTAIS →</td>
                      <td className="px-2 py-2.5 text-right text-emerald-400">{fmtBRL(totals.receita)}</td>
                      <td className="px-2 py-2.5 text-right text-red-400">{fmtBRL(totals.custo)}</td>
                      <td className={`px-2 py-2.5 text-right ${totals.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtBRL(totals.resultado)}</td>
                      <td className="px-2 py-2.5 text-center text-blue-400">{totals.receita > 0 ? ((totals.resultado / totals.receita) * 100).toFixed(1) + "%" : "—"}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}