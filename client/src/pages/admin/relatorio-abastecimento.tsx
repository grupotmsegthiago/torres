import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Fuel, Search, Download, RefreshCw, Eye, X, Camera, CheckCircle2,
  AlertTriangle, Loader2, ArrowUpDown, CalendarDays, MapPin,
  FileText, Gauge, DollarSign, Droplets, ChevronDown, ChevronUp,
  ShieldCheck, XCircle, ExternalLink
} from "lucide-react";
import { authFetch, queryClient } from "@/lib/queryClient";
import type { VehicleFueling, Vehicle, Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const fuelLabel: Record<string, string> = {
  gasolina: "Gasolina", diesel: "Diesel", diesel_s10: "Diesel S10", etanol: "Etanol", gnv: "GNV",
};

type SortField = "date" | "plate" | "cost" | "station";
type SortDir = "asc" | "desc";

function TicketLogBadge({ fueling }: { fueling: VehicleFueling }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const status = String((fueling as any).ticketlogStatus || "");
  const msg = String((fueling as any).ticketlogMessage || "");
  const valTl = (fueling as any).ticketlogValorTl;
  const diff = (fueling as any).ticketlogDiffValor;

  const revalidate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await authFetch(`/api/fueling/${fueling.id}/validate-ticketlog`, { method: "POST" });
      const d = await r.json();
      toast({ title: d.status === "ok" ? "OK!" : "Resultado", description: d.message || "Validação concluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/fueling"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  let badge: React.ReactNode = null;
  if (status === "ok") {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> OK</span>;
  } else if (status === "divergencia_pequena" || status === "divergencia_grande") {
    badge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700" title={msg}>
        <AlertTriangle className="w-3 h-3" /> Diverg. {diff != null ? `R$ ${Math.abs(Number(diff)).toFixed(2)}` : ""}
      </span>
    );
  } else if (status === "nao_encontrado") {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700" title={msg}><XCircle className="w-3 h-3" /> Não achou</span>;
  } else if (status === "sem_codigo_posto") {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700" title="Cadastre o posto em Abastecimento > aba Postos DE/PARA"><AlertTriangle className="w-3 h-3" /> S/ posto</span>;
  } else if (status === "sem_credenciais") {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-500" title="Configure TICKETLOG_USER/PASS">N/D</span>;
  } else if (status === "erro") {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500" title={msg}><AlertTriangle className="w-3 h-3" /> Erro</span>;
  } else {
    badge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-500"><Loader2 className="w-3 h-3 animate-spin" /> Pend.</span>;
  }

  return (
    <div className="flex items-center justify-center gap-1">
      {badge}
      <Button variant="ghost" size="icon" className="h-5 w-5 text-neutral-400 hover:text-blue-600" disabled={busy} onClick={revalidate} title="Revalidar agora" data-testid={`button-revalidate-tl-${fueling.id}`}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      </Button>
    </div>
  );
}

function formatDateBR(d: string | null) {
  if (!d) return "-";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTimeBR(d: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return ""; }
}

export default function RelatorioAbastecimentoPage() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("detail");
    if (d && /^\d+$/.test(d)) {
      setDetailId(parseInt(d, 10));
    }
  }, []);

  const { data: fuelings = [], isLoading } = useQuery<VehicleFueling[]>({
    queryKey: ["/api/fueling"],
    staleTime: 30_000,
  });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: dashboard } = useQuery<{ byMission: { data: string; km_total: number; status?: string }[] }>({
    queryKey: ["/api/financial/dashboard"],
    staleTime: 60_000,
  });

  const vMap = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const eMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const sorted = useMemo(() => {
    let list = [...fuelings];
    if (dateFrom) list = list.filter(f => f.date >= dateFrom);
    if (dateTo) list = list.filter(f => f.date <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f => {
        const v = vMap.get(f.vehicleId);
        const e = f.driverId ? eMap.get(f.driverId) : null;
        return (
          (v?.plate || "").toLowerCase().includes(q) ||
          (e?.name || "").toLowerCase().includes(q) ||
          (f.station || "").toLowerCase().includes(q) ||
          (f.fuelType || "").toLowerCase().includes(q) ||
          String(f.id).includes(q)
        );
      });
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = (a.createdAt || a.date).localeCompare(b.createdAt || b.date);
      else if (sortField === "plate") {
        const pa = vMap.get(a.vehicleId)?.plate || "";
        const pb = vMap.get(b.vehicleId)?.plate || "";
        cmp = pa.localeCompare(pb);
      } else if (sortField === "cost") cmp = (Number(a.totalCost) || 0) - (Number(b.totalCost) || 0);
      else if (sortField === "station") cmp = (a.station || "").localeCompare(b.station || "");
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [fuelings, search, dateFrom, dateTo, sortField, sortDir, vMap, eMap]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const stats = useMemo(() => {
    const total = sorted.length;
    const gastoTotal = sorted.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);
    const litrosTotal = sorted.reduce((s, f) => s + (Number(f.liters) || 0), 0);
    const gasCount = sorted.filter(f => f.fuelType === "gasolina").length;
    const ethCount = sorted.filter(f => f.fuelType === "etanol").length;
    return { total, gastoTotal, litrosTotal, gasCount, ethCount };
  }, [sorted]);

  // Eficiência REAL (tanque-a-tanque, baseada no hodômetro):
  // Para cada viatura, soma o km rodado entre dois abastecimentos cuja
  // recarga (segundo abastecimento) caiu dentro do período, e divide
  // pelos litros desse abastecimento. Esse é o único método que casa
  // litros consumidos com km efetivamente rodados, eliminando o ruído
  // de "abasteci hoje, mas o combustível vai durar mais 3 dias".
  const eficienciaGeral = useMemo(() => {
    const byVehicle = new Map<number, { date: string; km: number; liters: number }[]>();
    fuelings.forEach((f) => {
      if (!f.vehicleId) return;
      if (!byVehicle.has(f.vehicleId)) byVehicle.set(f.vehicleId, []);
      byVehicle.get(f.vehicleId)!.push({
        date: String(f.date).slice(0, 10),
        km: Number(f.km) || 0,
        liters: Number(f.liters) || 0,
      });
    });

    let kmPeriodo = 0;
    let litrosPeriodo = 0;
    byVehicle.forEach((list) => {
      const sorted = [...list].sort((a, b) => {
        if (a.km !== b.km) return a.km - b.km;
        return a.date.localeCompare(b.date);
      });
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (dateFrom && cur.date < dateFrom) continue;
        if (dateTo && cur.date > dateTo) continue;
        const kmGap = cur.km - prev.km;
        if (kmGap <= 0 || kmGap > 3000) continue;
        if (cur.liters <= 0) continue;
        kmPeriodo += kmGap;
        litrosPeriodo += cur.liters;
      }
    });

    const mediaKmL = kmPeriodo > 0 && litrosPeriodo > 0 ? kmPeriodo / litrosPeriodo : 0;
    return { kmPeriodo, litrosPeriodo, mediaKmL };
  }, [fuelings, dateFrom, dateTo]);

  const detailFueling = detailId ? fuelings.find(f => f.id === detailId) : null;

  const exportCSV = () => {
    const header = "ID,Data,Placa,Agente,Combustível,Litros,R$/L,Valor Total,KM,Posto\n";
    const rows = sorted.map(f => {
      const v = vMap.get(f.vehicleId);
      const e = f.driverId ? eMap.get(f.driverId) : null;
      return `${f.id},${f.date},${v?.plate || ""},${e?.name || ""},"${fuelLabel[f.fuelType] || f.fuelType}",${f.liters},${f.costPerLiter || ""},${f.totalCost || ""},${f.km},"${f.station || ""}"`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-abastecimentos-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-4 p-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Fuel className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-bold text-neutral-900" data-testid="text-page-title">Relatório de Abastecimentos</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/fueling"] })} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} data-testid="button-export">
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3 bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-600 font-medium">Abastecimentos</p>
            <p className="text-2xl font-bold text-blue-900" data-testid="text-total-count">{stats.total}</p>
          </Card>
          <Card className="p-3 bg-red-50 border-red-200">
            <p className="text-xs text-red-600 font-medium">Gasto Total</p>
            <p className="text-2xl font-bold text-red-900" data-testid="text-total-cost">R$ {stats.gastoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </Card>
          <Card className="p-3 bg-emerald-50 border-emerald-200">
            <p className="text-xs text-emerald-600 font-medium">Litros Total</p>
            <p className="text-2xl font-bold text-emerald-900" data-testid="text-total-liters">{stats.litrosTotal.toFixed(1)}L</p>
          </Card>
          <Card className="p-3 bg-amber-50 border-amber-200">
            <p className="text-xs text-amber-600 font-medium">Gasolina</p>
            <p className="text-2xl font-bold text-amber-900" data-testid="text-gas-count">{stats.gasCount}</p>
          </Card>
          <Card className="p-3 bg-purple-50 border-purple-200">
            <p className="text-xs text-purple-600 font-medium">Etanol</p>
            <p className="text-2xl font-bold text-purple-900" data-testid="text-eth-count">{stats.ethCount}</p>
          </Card>
          <Card className="p-3 bg-teal-50 border-teal-200" data-testid="card-eficiencia-geral">
            <p className="text-xs text-teal-600 font-medium">Eficiência Geral</p>
            <p className="text-2xl font-bold text-teal-900" data-testid="text-eficiencia-geral">
              {eficienciaGeral.mediaKmL > 0 ? `${eficienciaGeral.mediaKmL.toFixed(1)} km/L` : "--"}
            </p>
            <p className="text-[10px] text-teal-700 mt-0.5" data-testid="text-eficiencia-geral-base">
              {eficienciaGeral.kmPeriodo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km / {eficienciaGeral.litrosPeriodo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
            </p>
          </Card>
        </div>

        <Card className="p-3 bg-white border-neutral-200">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-neutral-500 mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-neutral-400" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder="Placa, agente, posto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">De</label>
              <Input type="date" className="h-9 text-sm w-[140px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Até</label>
              <Input type="date" className="h-9 text-sm w-[140px]" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-neutral-400">Nenhum abastecimento encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-fueling-report">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="p-2 text-left font-medium text-neutral-600">ID</th>
                  <th className="p-2 text-left font-medium text-neutral-600 cursor-pointer select-none" onClick={() => toggleSort("date")}>
                    <span className="flex items-center gap-1">Data/Hora <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-2 text-left font-medium text-neutral-600 cursor-pointer select-none" onClick={() => toggleSort("plate")}>
                    <span className="flex items-center gap-1">Placa <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-2 text-left font-medium text-neutral-600">Agente</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Combustível</th>
                  <th className="p-2 text-right font-medium text-neutral-600">R$/L Gas</th>
                  <th className="p-2 text-right font-medium text-neutral-600">R$/L Álcool</th>
                  <th className="p-2 text-center font-medium text-neutral-600">%</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Abasteceu</th>
                  <th className="p-2 text-right font-medium text-neutral-600 cursor-pointer select-none" onClick={() => toggleSort("cost")}>
                    <span className="flex items-center gap-1 justify-end">Valor <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-2 text-right font-medium text-neutral-600">Média KM/L</th>
                  <th className="p-2 text-left font-medium text-neutral-600 cursor-pointer select-none" onClick={() => toggleSort("station")}>
                    <span className="flex items-center gap-1">Posto <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="p-2 text-center font-medium text-neutral-600">TicketLog</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, idx) => {
                  const v = vMap.get(f.vehicleId);
                  const e = f.driverId ? eMap.get(f.driverId) : null;
                  const gasP = Number(f.gasolinePrice) || 0;
                  const ethP = Number(f.ethanolPrice) || 0;
                  const ratio = gasP > 0 && ethP > 0 ? ((ethP / gasP) * 100) : null;
                  const prevFueling = fuelings
                    .filter(x => x.vehicleId === f.vehicleId && x.km < f.km)
                    .sort((a, b) => b.km - a.km)[0];
                  const kmL = prevFueling && f.km > prevFueling.km && Number(f.liters) > 0
                    ? ((f.km - prevFueling.km) / Number(f.liters)) : null;

                  return (
                    <tr key={f.id} className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${idx === 0 ? "bg-yellow-50/50" : ""}`} data-testid={`row-fueling-${f.id}`}>
                      <td className="p-2 font-mono text-xs text-neutral-500">#{f.id}</td>
                      <td className="p-2">
                        <div className="text-sm font-medium text-neutral-900">{formatDateBR(f.date)}</div>
                        <div className="text-xs text-neutral-400">{f.createdAt ? formatTimeBR(f.createdAt as any) : ""}</div>
                      </td>
                      <td className="p-2">
                        <span className="font-mono font-bold text-neutral-900 text-sm">{v?.plate || "-"}</span>
                        {v && <div className="text-xs text-neutral-400">{v.model}</div>}
                      </td>
                      <td className="p-2">
                        <span className="text-sm text-neutral-700">{e?.name || "-"}</span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          f.fuelType === "gasolina" ? "bg-amber-100 text-amber-700" :
                          f.fuelType === "etanol" ? "bg-green-100 text-green-700" :
                          f.fuelType === "diesel" || f.fuelType === "diesel_s10" ? "bg-gray-100 text-gray-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          <Droplets className="w-3 h-3" />
                          {fuelLabel[f.fuelType] || f.fuelType}
                        </span>
                      </td>
                      <td className="p-2 text-right text-xs text-neutral-600">{gasP > 0 ? `R$ ${gasP.toFixed(3)}` : "-"}</td>
                      <td className="p-2 text-right text-xs text-neutral-600">{ethP > 0 ? `R$ ${ethP.toFixed(3)}` : "-"}</td>
                      <td className="p-2 text-center">
                        {ratio !== null ? (
                          <span className={`text-xs font-bold ${ratio <= 70 ? "text-green-600" : "text-red-600"}`}>
                            {ratio.toFixed(0)}%
                          </span>
                        ) : <span className="text-xs text-neutral-300">-</span>}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`text-xs font-bold ${
                          f.fuelType === "gasolina" ? "text-amber-600" :
                          f.fuelType === "etanol" ? "text-green-600" : "text-gray-600"
                        }`}>
                          {fuelLabel[f.fuelType] || f.fuelType}
                        </span>
                        {f.recommendationFollowed === false && (
                          <div className="text-[10px] text-red-500">Não seguiu recomendação</div>
                        )}
                      </td>
                      <td className="p-2 text-right font-bold text-neutral-900">
                        R$ {Number(f.totalCost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right">
                        {kmL !== null ? (
                          <span className={`font-bold text-sm ${kmL >= 10 ? "text-green-600" : kmL >= 7 ? "text-amber-600" : "text-red-600"}`}>
                            {kmL.toFixed(1)} km/L
                          </span>
                        ) : <span className="text-xs text-neutral-300">-</span>}
                      </td>
                      <td className="p-2 text-sm text-neutral-600 max-w-[140px] truncate" title={f.station || ""}>
                        {f.station || "-"}
                      </td>
                      <td className="p-2 text-center">
                        <TicketLogBadge fueling={f} />
                      </td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50" onClick={() => setDetailId(f.id)} data-testid={`button-detail-${f.id}`}>
                          <Eye className="w-4 h-4" />
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

      {detailFueling && (
        <DetailModal
          fueling={detailFueling}
          vehicle={vMap.get(detailFueling.vehicleId)}
          driverName={detailFueling.driverId ? eMap.get(detailFueling.driverId)?.name : null}
          fuelings={fuelings}
          onClose={() => setDetailId(null)}
          zoomedPhoto={zoomedPhoto}
          setZoomedPhoto={setZoomedPhoto}
        />
      )}

      {zoomedPhoto && !detailFueling && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setZoomedPhoto(null)}>
          <img src={zoomedPhoto} alt="Zoom" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </AdminLayout>
  );
}

export function DetailModal({ fueling, vehicle, driverName, fuelings, onClose, zoomedPhoto, setZoomedPhoto }: {
  fueling: VehicleFueling;
  vehicle?: Vehicle;
  driverName?: string | null;
  fuelings: VehicleFueling[];
  onClose: () => void;
  zoomedPhoto: string | null;
  setZoomedPhoto: (url: string | null) => void;
}) {
  const { toast } = useToast();
  const [aiResult, setAiResult] = useState<any>(null);

  const prevFueling = fuelings
    .filter(x => x.vehicleId === fueling.vehicleId && x.km < fueling.km)
    .sort((a, b) => b.km - a.km)[0];
  const kmL = prevFueling && fueling.km > prevFueling.km && Number(fueling.liters) > 0
    ? ((fueling.km - prevFueling.km) / Number(fueling.liters)) : null;

  const photos = [
    { label: "Placa do Veículo", url: fueling.platePhoto },
    { label: "Hodômetro", url: fueling.odometerPhoto },
    { label: "Bomba", url: fueling.pumpPhoto },
    { label: "Nota Fiscal / Cupom", url: fueling.receiptPhoto },
  ].filter(p => p.url);

  const aiValidate = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/fueling/${fueling.id}/ai-validate`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao validar");
      return res.json();
    },
    onSuccess: (data) => setAiResult(data),
    onError: (err: any) => toast({ title: "Erro IA", description: err.message, variant: "destructive" }),
  });

  const hasLocation = fueling.latitude && fueling.longitude;
  const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${fueling.latitude},${fueling.longitude}` : null;

  return (
    <>
      {zoomedPhoto && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setZoomedPhoto(null)} data-testid="modal-photo-zoom">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button onClick={() => setZoomedPhoto(null)} className="absolute -top-10 right-0 text-white hover:text-neutral-300">
              <X className="w-6 h-6" />
            </button>
            <img src={zoomedPhoto} alt="Foto ampliada" className="w-full h-full object-contain rounded-lg" />
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto pt-4 pb-4" onClick={onClose} data-testid="modal-fueling-detail">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <Fuel className="w-5 h-5 text-orange-500" />
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Detalhes #{fueling.id}</h2>
                <p className="text-sm text-neutral-500">{formatDateBR(fueling.date)} {fueling.createdAt ? formatTimeBR(fueling.createdAt as any) : ""}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg" data-testid="button-close-detail">
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoBox label="Veículo" value={vehicle?.plate || "-"} sub={vehicle ? `${vehicle.model} ${vehicle.brand || ""}` : undefined} />
              <InfoBox label="Agente" value={driverName || "-"} />
              <InfoBox label="KM Hodômetro" value={`${fueling.km.toLocaleString("pt-BR")} km`} />
              <InfoBox label="Combustível" value={fuelLabel[fueling.fuelType] || fueling.fuelType} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600">Litros</p>
                <p className="font-bold text-blue-900 text-lg">{Number(fueling.liters).toFixed(2)}L</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600">Valor/Litro</p>
                <p className="font-bold text-green-900 text-lg">{fueling.costPerLiter ? `R$ ${Number(fueling.costPerLiter).toFixed(3)}` : "-"}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-600">Valor Total</p>
                <p className="font-bold text-red-900 text-lg">{fueling.totalCost ? `R$ ${Number(fueling.totalCost).toFixed(2)}` : "-"}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600">Média KM/L</p>
                <p className={`font-bold text-lg ${kmL ? (kmL >= 10 ? "text-green-700" : kmL >= 7 ? "text-amber-700" : "text-red-700") : "text-neutral-400"}`}>
                  {kmL ? `${kmL.toFixed(1)} km/L` : "-"}
                </p>
              </div>
            </div>

            {fueling.gasolinePrice || fueling.ethanolPrice ? (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 mb-2">Comparação Gasolina × Etanol</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-amber-600 text-xs">Gasolina</span>
                    <p className="font-bold text-amber-900">R$ {Number(fueling.gasolinePrice || 0).toFixed(3)}</p>
                  </div>
                  <div>
                    <span className="text-green-600 text-xs">Etanol</span>
                    <p className="font-bold text-green-900">R$ {Number(fueling.ethanolPrice || 0).toFixed(3)}</p>
                  </div>
                  <div>
                    <span className="text-neutral-600 text-xs">Razão</span>
                    {Number(fueling.gasolinePrice) > 0 ? (
                      <p className={`font-bold ${(Number(fueling.ethanolPrice) / Number(fueling.gasolinePrice)) <= 0.7 ? "text-green-700" : "text-red-700"}`}>
                        {((Number(fueling.ethanolPrice) / Number(fueling.gasolinePrice)) * 100).toFixed(0)}%
                        <span className="text-xs font-normal ml-1">
                          {(Number(fueling.ethanolPrice) / Number(fueling.gasolinePrice)) <= 0.7 ? "→ Etanol vantajoso" : "→ Gasolina vantajosa"}
                        </span>
                      </p>
                    ) : <p className="text-neutral-400">-</p>}
                  </div>
                </div>
              </div>
            ) : null}

            {fueling.station && (
              <InfoBox label="Posto" value={fueling.station} />
            )}

            {(hasLocation || fueling.address) && (
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">Localização</p>
                </div>
                {fueling.address && <p className="text-sm text-emerald-900 mb-1">{fueling.address}</p>}
                {hasLocation && (
                  <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 underline flex items-center gap-1">
                    Ver no mapa <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {fueling.notes && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">Observações</p>
                <p className="text-sm text-neutral-700">{fueling.notes}</p>
              </div>
            )}

            {photos.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="w-4 h-4 text-neutral-500" />
                  <h3 className="text-sm font-bold text-neutral-900">Fotos ({photos.length})</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative group cursor-pointer" onClick={() => setZoomedPhoto(p.url!)} data-testid={`photo-${i}`}>
                      <img src={p.url!} alt={p.label} className="w-full h-40 object-cover rounded-lg border border-neutral-200" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center">
                        <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-neutral-200 pt-3">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-neutral-900">Validação IA da Nota Fiscal</h3>
              </div>

              {!aiResult && !aiValidate.isPending && (
                <Button
                  size="sm"
                  onClick={() => aiValidate.mutate()}
                  disabled={!fueling.receiptPhoto}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  data-testid="button-ai-validate"
                >
                  <ShieldCheck className="w-4 h-4 mr-1" />
                  {fueling.receiptPhoto ? "Validar com IA" : "Sem foto de NF"}
                </Button>
              )}

              {aiValidate.isPending && (
                <div className="flex items-center gap-2 text-indigo-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analisando nota fiscal...</span>
                </div>
              )}

              {aiResult && (
                <div className={`rounded-lg p-4 border ${aiResult.status === "validado" ? "bg-green-50 border-green-200" : aiResult.status === "sem_foto" ? "bg-neutral-50 border-neutral-200" : "bg-red-50 border-red-200"}`} data-testid="card-ai-result">
                  <div className="flex items-center gap-2 mb-2">
                    {aiResult.status === "validado" ? (
                      <><CheckCircle2 className="w-5 h-5 text-green-600" /><span className="font-bold text-green-700 text-sm">Validado</span></>
                    ) : aiResult.status === "sem_foto" ? (
                      <><FileText className="w-5 h-5 text-neutral-400" /><span className="font-bold text-neutral-600 text-sm">Sem foto</span></>
                    ) : (
                      <><XCircle className="w-5 h-5 text-red-600" /><span className="font-bold text-red-700 text-sm">Verificar</span></>
                    )}
                  </div>

                  {aiResult.observacao && (
                    <p className="text-sm text-neutral-700 mb-2">{aiResult.observacao}</p>
                  )}

                  {aiResult.valor_nf !== undefined && aiResult.valor_nf !== null && (
                    <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                      <div><span className="text-neutral-500">Valor NF:</span> <span className="font-bold">R$ {Number(aiResult.valor_nf).toFixed(2)}</span></div>
                      <div><span className="text-neutral-500">Valor Informado:</span> <span className="font-bold">R$ {Number(fueling.totalCost).toFixed(2)}</span></div>
                      {aiResult.litros_nf && <div><span className="text-neutral-500">Litros NF:</span> <span className="font-bold">{Number(aiResult.litros_nf).toFixed(2)}L</span></div>}
                      {aiResult.combustivel_nf && <div><span className="text-neutral-500">Combustível NF:</span> <span className="font-bold">{aiResult.combustivel_nf}</span></div>}
                      {aiResult.posto_nf && <div className="col-span-2"><span className="text-neutral-500">Posto NF:</span> <span className="font-bold">{aiResult.posto_nf}</span></div>}
                    </div>
                  )}

                  {aiResult.divergencias && aiResult.divergencias.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {aiResult.divergencias.map((d: string, i: number) => (
                        <div key={i} className="flex items-start gap-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setAiResult(null)} data-testid="button-ai-retry">
                    <RefreshCw className="w-3 h-3 mr-1" /> Analisar novamente
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
      <p className="font-bold text-neutral-900 text-sm">{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
