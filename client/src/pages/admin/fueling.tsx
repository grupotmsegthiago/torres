import { useState, useMemo, useEffect, useRef } from "react";
import { parseBRL, maskBRL, formatDateBRT } from "@/lib/utils";
import { listCyclesFromDates, getCycleByValue, getCurrentCycle } from "@/lib/fuel-cycles";
import { calcKmL } from "@/lib/fuel-kml";
import { computeTicketlogStats } from "@/lib/fuel-ticketlog";
import { computeUrbanHighwayShare, filterMissionsByPeriod, type ClassifiableMission, type TripShare } from "@/lib/trip-classifier";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn, invalidateRelatedQueries } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, X, Pencil, Trash2, Fuel, TrendingDown, TrendingUp,
  DollarSign, Gauge, BarChart3, AlertTriangle, Filter, ChevronDown, ChevronUp,
  MapPin, Camera, Eye, ArrowLeft, ExternalLink, Ticket, FileText, Upload, CheckCircle2, Loader2, ShieldCheck, XCircle
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConciliacaoContent } from "./conciliacao-ticketlog";
import { PostosContent } from "./ticketlog-postos";
import type { VehicleFueling, Vehicle, Employee } from "@shared/schema";

interface FuelingStats {
  totalLiters: number;
  totalCost: number;
  avgKmPerLiter: number;
  avgCostPerKm: number;
  totalFuelings: number;
  bestAvg: { plate: string; avg: number } | null;
  worstAvg: { plate: string; avg: number } | null;
}

function computeValidIntervals(sorted: VehicleFueling[]) {
  const intervals: { km: number; liters: number; cost: number }[] = [];
  let accLiters = 0;
  let accCost = 0;
  let lastFullTankKm: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    if (i === 0) {
      if (f.fullTank !== false) lastFullTankKm = f.km;
      continue;
    }
    accLiters += Number(f.liters) || 0;
    accCost += Number(f.totalCost) || 0;

    if (f.fullTank !== false && lastFullTankKm !== null) {
      const dist = f.km - lastFullTankKm;
      if (dist > 0 && accLiters > 0) {
        intervals.push({ km: dist, liters: accLiters, cost: accCost });
      }
      lastFullTankKm = f.km;
      accLiters = 0;
      accCost = 0;
    } else if (f.fullTank !== false) {
      lastFullTankKm = f.km;
      accLiters = 0;
      accCost = 0;
    }
  }
  return intervals;
}

// computeStats e computePerVehicleData agora usam a lógica TicketLog
// (ver client/src/lib/fuel-ticketlog.ts):
//  • Litros/Custo do período = soma do que está no período.
//  • Km rodados do período = pra cada abastecida no período, soma o gap
//    de hodômetro contra a abastecida imediatamente anterior do veículo,
//    mesmo que essa anterior esteja FORA do período. É a única forma
//    cujos números casam com o relatório oficial da TicketLog.
//  • Km/L = Km rodados / Litros.

function computeStats(
  filteredFuelings: VehicleFueling[],
  allFuelings: VehicleFueling[],
  vehicles: Vehicle[],
): FuelingStats {
  const inPeriod = new Set(filteredFuelings.map(f => f.id));
  const tl = computeTicketlogStats(allFuelings, f => inPeriod.has(f.id));
  const getPlate = (vid: number) => vehicles.find(v => v.id === vid)?.plate || "?";

  return {
    totalLiters: tl.totalLiters,
    totalCost: tl.totalCost,
    avgKmPerLiter: tl.avgKmPerLiter,
    avgCostPerKm: tl.avgCostPerKm,
    totalFuelings: tl.totalFuelings,
    bestAvg: tl.bestAvg ? { plate: getPlate(tl.bestAvg.vehicleId), avg: tl.bestAvg.avg } : null,
    worstAvg: tl.worstAvg ? { plate: getPlate(tl.worstAvg.vehicleId), avg: tl.worstAvg.avg } : null,
  };
}

function computePerVehicleData(
  filteredFuelings: VehicleFueling[],
  allFuelings: VehicleFueling[],
  vehicles: Vehicle[],
) {
  const inPeriod = new Set(filteredFuelings.map(f => f.id));
  const tl = computeTicketlogStats(allFuelings, f => inPeriod.has(f.id));
  const statsByVehicle = new Map(tl.perVehicle.map(s => [s.vehicleId, s]));

  // Pra "Último KM" e "Última data" mostramos da história inteira do veículo
  // (independente do período), porque é informação de estado, não de período.
  const histByVehicle: Record<number, VehicleFueling[]> = {};
  for (const f of allFuelings) {
    if (!histByVehicle[f.vehicleId]) histByVehicle[f.vehicleId] = [];
    histByVehicle[f.vehicleId].push(f);
  }

  return vehicles.map(v => {
    const stats = statsByVehicle.get(v.id);
    const hist = histByVehicle[v.id] || [];
    const sortedKm = [...hist].sort((a, b) => a.km - b.km);
    const sortedDate = [...hist].sort((a, b) => b.date.localeCompare(a.date));
    return {
      vehicle: v,
      count: stats?.count ?? 0,
      totalLiters: stats?.liters ?? 0,
      totalCost: stats?.cost ?? 0,
      avgKmL: stats?.kmL ?? 0,
      kmDriven: stats?.kmRodados ?? 0,
      costPerKm: stats?.costPerKm ?? 0,
      lastKm: sortedKm.length > 0 ? sortedKm[sortedKm.length - 1].km : 0,
      lastDate: sortedDate.length > 0 ? sortedDate[0].date : null,
    };
  }).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
}

function computeConsumptionHistory(fuelings: VehicleFueling[]) {
  const sorted = [...fuelings].sort((a, b) => a.km - b.km);
  const results: { id: number; date: string; km: number; liters: number; kmL: number | null; costPerKm: number | null }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    let kmL: number | null = null;
    let costPerKm: number | null = null;

    if (i > 0) {
      const prev = sorted[i - 1];
      const dist = f.km - prev.km;
      const liters = Number(f.liters) || 0;
      if (dist > 0 && liters > 0) {
        kmL = dist / liters;
        const cost = Number(f.totalCost) || 0;
        if (cost > 0) costPerKm = cost / dist;
      }
    }

    results.push({
      id: f.id,
      date: f.date,
      km: f.km,
      liters: Number(f.liters),
      kmL,
      costPerKm,
    });
  }

  return results;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="p-4 bg-white border-neutral-200">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
          <p className="text-xl font-bold text-neutral-900 mt-0.5">{value}</p>
          {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function FuelingForm({ fueling, vehicles, employees, onClose }: {
  fueling?: VehicleFueling; vehicles: Vehicle[]; employees: Employee[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    vehicleId: fueling?.vehicleId || 0,
    driverId: fueling?.driverId || null as number | null,
    date: fueling?.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    liters: fueling?.liters ? maskBRL(String(fueling.liters)) : "",
    costPerLiter: fueling?.costPerLiter ? maskBRL(String(fueling.costPerLiter)) : "",
    totalCost: fueling?.totalCost ? maskBRL(String(fueling.totalCost)) : "",
    km: fueling?.km || 0,
    fuelType: fueling?.fuelType || "gasolina",
    fullTank: fueling?.fullTank !== false,
    station: fueling?.station || "",
    notes: fueling?.notes || "",
    gasolinePrice: fueling?.gasolinePrice ? maskBRL(String(fueling.gasolinePrice), 3) : "",
    ethanolPrice: fueling?.ethanolPrice ? maskBRL(String(fueling.ethanolPrice), 3) : "",
  });

  const gasParsed = parseBRL(form.gasolinePrice);
  const ethParsed = parseBRL(form.ethanolPrice);
  const pricesReady = gasParsed > 0 && ethParsed > 0;
  const ratio = pricesReady ? ethParsed / gasParsed : null;
  const recommendation: "etanol" | "gasolina" | null = ratio !== null ? (ratio <= 0.7 ? "etanol" : "gasolina") : null;

  const autoCalcTotal = (liters: string, costPerLiter: string) => {
    const l = parseBRL(liters);
    const c = parseBRL(costPerLiter);
    if (l > 0 && c > 0) return maskBRL((l * c).toFixed(2));
    return form.totalCost;
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const followed = recommendation ? data.fuelType === recommendation : null;
      const payload = {
        ...data,
        vehicleId: Number(data.vehicleId),
        driverId: data.driverId ? Number(data.driverId) : null,
        liters: String(parseBRL(data.liters)),
        costPerLiter: data.costPerLiter ? String(parseBRL(data.costPerLiter)) : null,
        totalCost: data.totalCost ? String(parseBRL(data.totalCost)) : null,
        km: Number(data.km),
        fullTank: data.fullTank,
        gasolinePrice: data.gasolinePrice ? String(parseBRL(data.gasolinePrice)) : null,
        ethanolPrice: data.ethanolPrice ? String(parseBRL(data.ethanolPrice)) : null,
        fuelRecommendation: recommendation,
        recommendationFollowed: followed,
      };
      if (fueling) {
        await apiRequest("PATCH", `/api/fueling/${fueling.id}`, payload);
      } else {
        await apiRequest("POST", "/api/fueling", payload);
      }
    },
    onSuccess: () => {
      invalidateRelatedQueries("vehicle");
      invalidateRelatedQueries("financial");
      invalidateRelatedQueries("mission-cost");
      toast({ title: fueling ? "Abastecimento atualizado" : "Abastecimento registrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const selectedVehicle = vehicles.find(v => v.id === Number(form.vehicleId));

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-fueling-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{fueling ? "Editar Abastecimento" : "Novo Abastecimento"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {selectedVehicle && selectedVehicle.km > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Gauge className="w-4 h-4 inline mr-1" />
          KM atual registrado para <strong>{selectedVehicle.plate}</strong>: <strong>{selectedVehicle.km.toLocaleString("pt-BR")} km</strong>
          {form.km > 0 && form.km < selectedVehicle.km && (
            <span className="ml-2 text-red-600 font-semibold">
              <AlertTriangle className="w-3 h-3 inline" /> KM informado é menor que o atual!
            </span>
          )}
        </div>
      )}

      <form onSubmit={(e) => {
        e.preventDefault();
        // Validação de >0 só no cadastro novo. Edição de registros antigos
        // zerados continua liberada (escopo da tarefa #35) para que o
        // gestor possa corrigi-los sem bloqueio.
        if (!fueling) {
          const litersNum = parseBRL(form.liters);
          const totalNum = parseBRL(form.totalCost);
          if (litersNum <= 0) {
            toast({ title: "Litros deve ser maior que zero", variant: "destructive" });
            return;
          }
          if (totalNum <= 0) {
            toast({ title: "Valor total deve ser maior que zero", variant: "destructive" });
            return;
          }
        }
        mutation.mutate(form);
      }} className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Preço no Posto (obrigatório)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-amber-900 mb-1.5 block">Preço Gasolina (R$/L) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">R$</span>
                <Input type="text" inputMode="numeric" value={form.gasolinePrice || "0,000"} onChange={(e) => setForm({ ...form, gasolinePrice: maskBRL(e.target.value, 3) })} placeholder="0,000" className="bg-white pl-10" required data-testid="input-gasoline-price" />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-amber-900 mb-1.5 block">Preço Álcool (R$/L) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">R$</span>
                <Input type="text" inputMode="numeric" value={form.ethanolPrice || "0,000"} onChange={(e) => setForm({ ...form, ethanolPrice: maskBRL(e.target.value, 3) })} placeholder="0,000" className="bg-white pl-10" required data-testid="input-ethanol-price" />
              </div>
            </div>
          </div>
        </div>

        {pricesReady && recommendation && (
          <div className={`p-4 rounded-lg border-2 ${recommendation === "etanol" ? "bg-green-50 border-green-400" : "bg-blue-50 border-blue-400"}`} data-testid="fuel-recommendation-banner">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${recommendation === "etanol" ? "bg-green-500" : "bg-blue-500"}`}>
                <Fuel className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-bold ${recommendation === "etanol" ? "text-green-800" : "text-blue-800"}`}>
                  Recomendação: Abastecer com {recommendation === "etanol" ? "ÁLCOOL" : "GASOLINA"}
                </p>
                <p className={`text-xs mt-0.5 ${recommendation === "etanol" ? "text-green-600" : "text-blue-600"}`}>
                  Relação Álcool/Gasolina: <strong>{(ratio! * 100).toFixed(1)}%</strong> — {ratio! <= 0.7 ? "Álcool compensa (≤ 70%)" : "Gasolina compensa (> 70%)"}
                </p>
              </div>
              <div className={`text-2xl font-black ${recommendation === "etanol" ? "text-green-600" : "text-blue-600"}`}>
                {(ratio! * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Veículo *</label>
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" required data-testid="select-fueling-vehicle">
              <option value={0}>Selecione...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Motorista</label>
            <select value={form.driverId || ""} onChange={(e) => setForm({ ...form, driverId: e.target.value ? Number(e.target.value) : null })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-fueling-driver">
              <option value="">Selecione...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data *</label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required data-testid="input-fueling-date" />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">KM no Hodômetro *</label>
            <Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: Number(e.target.value) })} required data-testid="input-fueling-km" />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Combustível</label>
            <select value={form.fuelType} onChange={(e) => {
              const fuelType = e.target.value;
              const costPerLiter = fuelType === "etanol" ? String(form.ethanolPrice) : fuelType === "gasolina" ? String(form.gasolinePrice) : form.costPerLiter;
              const totalCost = autoCalcTotal(String(form.liters), String(costPerLiter));
              setForm({ ...form, fuelType, costPerLiter, totalCost: totalCost || form.totalCost });
            }} className={`w-full h-10 border rounded-lg px-3.5 py-2.5 text-sm shadow-sm outline-none transition-all duration-200 ${!pricesReady ? "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-white border-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"}`} disabled={!pricesReady} data-testid="select-fueling-type">
              <option value="gasolina">Gasolina</option>
              <option value="etanol">Etanol</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-full-tank">
              <input type="checkbox" checked={form.fullTank} onChange={(e) => setForm({ ...form, fullTank: e.target.checked })} className="w-4 h-4 rounded border-neutral-300" />
              <span className="text-sm font-medium text-neutral-700">Tanque Cheio</span>
            </label>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Litros *</label>
            <Input type="text" inputMode="numeric" value={form.liters || "0,00"} onChange={(e) => {
              const liters = maskBRL(e.target.value);
              setForm({ ...form, liters, totalCost: autoCalcTotal(liters, String(form.costPerLiter)) });
            }} required disabled={!pricesReady} placeholder="0,00" className={!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""} data-testid="input-fueling-liters" />
            {!pricesReady && <p className="text-[10px] text-amber-600 mt-1">Preencha os preços acima para liberar</p>}
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Valor/Litro</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">R$</span>
              <Input type="text" inputMode="numeric" value={form.costPerLiter || "0,000"} onChange={(e) => {
                const costPerLiter = maskBRL(e.target.value, 3);
                setForm({ ...form, costPerLiter, totalCost: autoCalcTotal(String(form.liters), costPerLiter) });
              }} disabled={!pricesReady} placeholder="0,000" className={`pl-10 ${!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""}`} data-testid="input-fueling-cost-per-liter" />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Valor Total</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">R$</span>
              <Input type="text" inputMode="numeric" value={form.totalCost || "0,00"} onChange={(e) => setForm({ ...form, totalCost: maskBRL(e.target.value) })} disabled={!pricesReady} placeholder="0,00" className={`pl-10 ${!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""}`} data-testid="input-fueling-total" />
            </div>
            {!pricesReady && <p className="text-[10px] text-amber-600 mt-1">Preencha os preços acima para liberar</p>}
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Posto</label>
            <Input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} placeholder="Nome do posto" data-testid="input-fueling-station" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-fueling-notes" />
          </div>
        </div>

        {pricesReady && recommendation && form.fuelType && form.fuelType !== recommendation && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center gap-2" data-testid="recommendation-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Você está abastecendo com <strong>{form.fuelType === "etanol" ? "Álcool" : "Gasolina"}</strong>, mas a recomendação é <strong>{recommendation === "etanol" ? "Álcool" : "Gasolina"}</strong>. Essa decisão será registrada.</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {(() => {
            const reasons: string[] = [];
            if (!pricesReady) reasons.push("Informe os preços de gasolina e etanol");
            // Em edição, só avisa (não bloqueia) sobre litros/valor zerados.
            if (!fueling && parseBRL(form.liters) <= 0) reasons.push("Litros deve ser maior que zero");
            if (!fueling && parseBRL(form.totalCost) <= 0) reasons.push("Valor total deve ser maior que zero");
            return reasons.length > 0 ? (
              <p className="text-xs text-amber-700 flex items-center gap-1" data-testid="text-save-disabled-reason">
                <AlertTriangle className="w-3 h-3" /> {reasons.join(" · ")}
              </p>
            ) : null;
          })()}
          <div className="flex gap-3">
            <Button type="submit" disabled={mutation.isPending || !pricesReady || (!fueling && (parseBRL(form.liters) <= 0 || parseBRL(form.totalCost) <= 0))} data-testid="button-save-fueling">
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function TicketLogPanel({ fueling }: { fueling: VehicleFueling }) {
  const { toast } = useToast();
  const [codigoEstab, setCodigoEstab] = useState((fueling as any).ticketlogCodigoEstab || "");
  const [loading, setLoading] = useState<string | null>(null);
  const [tlStatus, setTlStatus] = useState<string | null>((fueling as any).ticketlogStatus || null);
  const [tlAuth, setTlAuth] = useState<string | null>((fueling as any).ticketlogAutorizacao || null);
  const [nfeData, setNfeData] = useState<any>((fueling as any).ticketlogNfeData || null);

  const { data: tlConfig } = useQuery<{ configured: boolean; env: string }>({ queryKey: ["/api/ticketlog/status"], queryFn: getQueryFn({ on401: "throw" }) });

  const buscarAutorizacao = async () => {
    if (!codigoEstab) { toast({ title: "Informe o código do estabelecimento TicketLog", variant: "destructive" }); return; }
    setLoading("autorizacao");
    try {
      const res = await apiRequest("POST", "/api/ticketlog/buscar-autorizacao", { fuelingId: fueling.id, codigoEstabelecimento: Number(codigoEstab) });
      const body = await res.json();
      setTlAuth(String(body.codigoAutorizacao));
      setTlStatus("autorizado");
      invalidateRelatedQueries("fueling");
      toast({ title: "Autorização TicketLog obtida", description: `Código: ${body.codigoAutorizacao}` });
    } catch (err: any) {
      const msg = err.message || "Erro ao buscar autorização";
      toast({ title: "Erro TicketLog", description: msg, variant: "destructive" });
    } finally { setLoading(null); }
  };

  const consultarNfe = async () => {
    setLoading("nfe");
    try {
      const res = await apiRequest("POST", "/api/ticketlog/consultar-nfe", { fuelingId: fueling.id });
      const body = await res.json();
      setNfeData(body.nfeData);
      setTlStatus("nfe_consultada");
      invalidateRelatedQueries("fueling");
      toast({ title: "Dados NF-e obtidos com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao consultar NF-e", description: err.message, variant: "destructive" });
    } finally { setLoading(null); }
  };

  if (!tlConfig?.configured) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <Ticket className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-bold text-amber-800">Integração TicketLog</p>
        </div>
        <p className="text-xs text-amber-700">Não configurada. Adicione <code className="bg-amber-100 px-1 rounded">TICKETLOG_USER</code> e <code className="bg-amber-100 px-1 rounded">TICKETLOG_PASS</code> nas variáveis de ambiente.</p>
      </div>
    );
  }

  const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
    autorizado: { label: "Autorizado", color: "text-blue-700 bg-blue-50 border-blue-200", icon: ShieldCheck },
    nfe_consultada: { label: "NF-e Consultada", color: "text-green-700 bg-green-50 border-green-200", icon: FileText },
    nfe_enviada: { label: "NF-e Enviada", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
    erro: { label: "Erro", color: "text-red-700 bg-red-50 border-red-200", icon: XCircle },
  };
  const statusInfo = tlStatus ? STATUS_MAP[tlStatus] : null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-bold text-purple-800">Integração TicketLog</p>
        </div>
        {statusInfo && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full border flex items-center gap-1 ${statusInfo.color}`} data-testid="badge-ticketlog-status">
            <statusInfo.icon className="w-3 h-3" /> {statusInfo.label}
          </span>
        )}
      </div>

      {tlAuth && (
        <div className="bg-white rounded-lg p-2.5 border border-purple-100">
          <p className="text-xs text-purple-500">Código de Autorização</p>
          <p className="font-bold text-purple-900 text-lg" data-testid="text-ticketlog-auth">{tlAuth}</p>
        </div>
      )}

      {!tlAuth && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-purple-700 mb-1 block">Código Estabelecimento TicketLog</label>
            <Input
              type="number"
              value={codigoEstab}
              onChange={(e) => setCodigoEstab(e.target.value)}
              placeholder="Ex: 12345"
              className="h-9 text-sm"
              data-testid="input-ticketlog-estab"
            />
          </div>
          <Button
            size="sm"
            onClick={buscarAutorizacao}
            disabled={loading === "autorizacao"}
            className="bg-purple-600 hover:bg-purple-700 text-white h-9"
            data-testid="button-ticketlog-autorizar"
          >
            {loading === "autorizacao" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            Buscar Autorização
          </Button>
        </div>
      )}

      {tlAuth && !nfeData && (
        <Button
          size="sm"
          variant="outline"
          onClick={consultarNfe}
          disabled={loading === "nfe"}
          className="border-purple-300 text-purple-700 hover:bg-purple-100"
          data-testid="button-ticketlog-nfe"
        >
          {loading === "nfe" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
          Consultar Dados NF-e
        </Button>
      )}

      {nfeData && (
        <div className="bg-white rounded-lg p-3 border border-purple-100 space-y-2">
          <p className="text-xs font-bold text-purple-700 flex items-center gap-1"><FileText className="w-3 h-3" /> Dados para Emissão NF-e</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(nfeData).map(([key, val]) => (
              <div key={key}>
                <span className="text-purple-500 font-medium">{key}:</span>{" "}
                <span className="text-purple-900">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-purple-400">Ambiente: {tlConfig.env === "homologacao" ? "Homologação" : "Produção"}</p>
    </div>
  );
}

function AiValidationBadge({ fueling }: { fueling: VehicleFueling }) {
  const st = (fueling as any).aiValidationStatus;
  const result = (fueling as any).aiValidationResult as any;
  const { toast } = useToast();

  const revalidate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/fueling/${fueling.id}/ai-validate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fueling"] });
      toast({ title: "Validação IA atualizada" });
    },
    onError: (err: any) => toast({ title: "Erro IA", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border-t border-neutral-200 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-neutral-900">Validação IA da Nota Fiscal</h3>
      </div>

      {st === "pendente" && (
        <div className="flex items-center gap-2 text-indigo-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analisando nota fiscal...</span>
        </div>
      )}

      {st === "validado" && result && (
        <div className="rounded-lg p-4 border bg-green-50 border-green-200" data-testid="card-ai-result">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="font-bold text-green-700 text-sm">Validado</span>
          </div>
          {result.observacao && <p className="text-sm text-neutral-700 mb-2">{result.observacao}</p>}
          {result.valor_nf !== undefined && result.valor_nf !== null && (
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><span className="text-neutral-500">Valor NF:</span> <span className="font-bold">R$ {Number(result.valor_nf).toFixed(2)}</span></div>
              <div><span className="text-neutral-500">Valor Informado:</span> <span className="font-bold">R$ {Number(fueling.totalCost).toFixed(2)}</span></div>
              {result.litros_nf && <div><span className="text-neutral-500">Litros NF:</span> <span className="font-bold">{Number(result.litros_nf).toFixed(2)}L</span></div>}
              {result.combustivel_nf && <div><span className="text-neutral-500">Combustível NF:</span> <span className="font-bold">{result.combustivel_nf}</span></div>}
              {result.posto_nf && <div className="col-span-2"><span className="text-neutral-500">Posto NF:</span> <span className="font-bold">{result.posto_nf}</span></div>}
            </div>
          )}
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => revalidate.mutate()} disabled={revalidate.isPending} data-testid="button-ai-retry">
            {revalidate.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />} Analisar novamente
          </Button>
        </div>
      )}

      {st === "verificar" && result && (
        <div className="rounded-lg p-4 border bg-red-50 border-red-200" data-testid="card-ai-result">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="font-bold text-red-700 text-sm">Verificar</span>
          </div>
          {result.observacao && <p className="text-sm text-neutral-700 mb-2">{result.observacao}</p>}
          {result.valor_nf !== undefined && result.valor_nf !== null && (
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><span className="text-neutral-500">Valor NF:</span> <span className="font-bold">R$ {Number(result.valor_nf).toFixed(2)}</span></div>
              <div><span className="text-neutral-500">Valor Informado:</span> <span className="font-bold">R$ {Number(fueling.totalCost).toFixed(2)}</span></div>
              {result.litros_nf && <div><span className="text-neutral-500">Litros NF:</span> <span className="font-bold">{Number(result.litros_nf).toFixed(2)}L</span></div>}
              {result.combustivel_nf && <div><span className="text-neutral-500">Combustível NF:</span> <span className="font-bold">{result.combustivel_nf}</span></div>}
            </div>
          )}
          {result.divergencias && result.divergencias.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.divergencias.map((d: string, i: number) => (
                <div key={i} className="flex items-start gap-1 text-xs text-red-600">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => revalidate.mutate()} disabled={revalidate.isPending} data-testid="button-ai-retry">
            {revalidate.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />} Analisar novamente
          </Button>
        </div>
      )}

      {(!st || st === "sem_foto") && (
        <div className="text-sm text-neutral-400">
          {!fueling.receiptPhoto ? "Sem foto de NF para validar." : (
            <Button variant="outline" size="sm" onClick={() => revalidate.mutate()} disabled={revalidate.isPending} data-testid="button-ai-validate">
              {revalidate.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />} Validar com IA
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FuelingDetail({ fueling, vehicle, driverName, onClose }: { fueling: VehicleFueling; vehicle?: Vehicle; driverName?: string | null; onClose: () => void }) {
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  const fuelTypeLabel: Record<string, string> = {
    gasolina: "Gasolina", diesel: "Diesel", diesel_s10: "Diesel S10", etanol: "Etanol", gnv: "GNV",
  };

  const photos = [
    { label: "Placa do Veículo", url: fueling.platePhoto },
    { label: "Hodômetro", url: fueling.odometerPhoto },
    { label: "Bomba", url: fueling.pumpPhoto },
    { label: "Nota Fiscal / Cupom", url: fueling.receiptPhoto },
  ].filter(p => p.url);

  const hasLocation = fueling.latitude && fueling.longitude;
  const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${fueling.latitude},${fueling.longitude}` : null;

  return (
    <>
      {zoomedPhoto && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setZoomedPhoto(null)} data-testid="modal-photo-zoom">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button onClick={() => setZoomedPhoto(null)} className="absolute -top-10 right-0 text-white hover:text-neutral-300 transition-colors" data-testid="button-close-zoom">
              <X className="w-6 h-6" />
            </button>
            <img src={zoomedPhoto} alt="Foto ampliada" className="w-full h-full object-contain rounded-lg" />
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto pt-8 pb-8" onClick={onClose} data-testid="modal-fueling-detail">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors" data-testid="button-back-detail">
                <ArrowLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Detalhes do Abastecimento</h2>
                <p className="text-sm text-neutral-500">{new Date(fueling.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors" data-testid="button-close-detail">
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">Veículo</p>
                <p className="font-bold text-neutral-900 text-sm">{vehicle?.plate || "-"}</p>
                <p className="text-xs text-neutral-400">{vehicle?.model} {vehicle?.brand}</p>
              </div>
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">Motorista</p>
                <p className="font-bold text-neutral-900 text-sm">{driverName || "-"}</p>
              </div>
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">KM Hodômetro</p>
                <p className="font-bold text-neutral-900 text-sm">{fueling.km.toLocaleString("pt-BR")} km</p>
              </div>
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">Combustível</p>
                <p className="font-bold text-neutral-900 text-sm">{fuelTypeLabel[fueling.fuelType] || fueling.fuelType}</p>
                {fueling.fullTank && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Tanque Cheio</span>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600 mb-0.5">Litros</p>
                <p className="font-bold text-blue-900 text-lg">{Number(fueling.liters).toFixed(2)}L</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 mb-0.5">Valor/Litro</p>
                <p className="font-bold text-green-900 text-lg">{fueling.costPerLiter ? `R$ ${Number(fueling.costPerLiter).toFixed(3)}` : "-"}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-600 mb-0.5">Valor Total</p>
                <p className="font-bold text-red-900 text-lg">{fueling.totalCost ? `R$ ${Number(fueling.totalCost).toFixed(2)}` : "-"}</p>
              </div>
            </div>

            {fueling.station && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-0.5">Posto</p>
                <p className="font-semibold text-neutral-900 text-sm">{fueling.station}</p>
              </div>
            )}

            {(hasLocation || fueling.address) && (
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">Localização do Abastecimento</p>
                </div>
                {fueling.address && <p className="text-sm text-emerald-900 mb-1">{fueling.address}</p>}
                {hasLocation && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-600">GPS: {Number(fueling.latitude).toFixed(6)}, {Number(fueling.longitude).toFixed(6)}</span>
                    <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 underline flex items-center gap-1 hover:text-emerald-900" data-testid="link-maps">
                      Ver no mapa <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {fueling.notes && (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600 mb-0.5">Observações</p>
                <p className="text-sm text-amber-900">{fueling.notes}</p>
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
                    <div key={i} className="relative group cursor-pointer" onClick={() => setZoomedPhoto(p.url!)} data-testid={`photo-fueling-${i}`}>
                      <img src={p.url!} alt={p.label} className="w-full h-48 object-cover rounded-lg border border-neutral-200" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center">
                        <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {photos.length === 0 && !hasLocation && (
              <div className="text-center py-6 text-neutral-400 text-sm">
                Nenhuma foto ou localização registrada para este abastecimento.
              </div>
            )}

            <TicketLogPanel fueling={fueling} />

            <AiValidationBadge fueling={fueling} />

            <div className="text-xs text-neutral-400 pt-2 border-t border-neutral-100">
              Registrado em {fueling.createdAt ? new Date((/[Zz]$/.test(fueling.createdAt) || /[+-]\d{2}:\d{2}$/.test(fueling.createdAt)) ? fueling.createdAt : fueling.createdAt + "Z").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"} · ID #{fueling.id}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BatchValidateButton() {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/fueling/ai-validate-batch");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Validação em lote iniciada" });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/fueling"] }), 5000);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-batch-validate">
      {mutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
      Validar NFs
    </Button>
  );
}

export default function FuelingPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VehicleFueling | undefined>();
  const [detailItem, setDetailItem] = useState<VehicleFueling | null>(null);
  const [filterVehicle, setFilterVehicle] = useState<number | "all">("all");
  const [periodMode, setPeriodMode] = useState<"cycle" | "month">("cycle");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [expandedVehicle, setExpandedVehicle] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"dashboard" | "history">("dashboard");
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";

  const { data: fuelings = [], isLoading } = useQuery<VehicleFueling[]>({ queryKey: ["/api/fueling"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: allUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({ queryKey: ["/api/users"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: serviceOrders = [] } = useQuery<any[]>({ queryKey: ["/api/service-orders"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/fueling/${id}`); },
    onSuccess: () => {
      invalidateRelatedQueries("vehicle");
      invalidateRelatedQueries("financial");
      invalidateRelatedQueries("mission-cost");
      toast({ title: "Abastecimento removido" });
    },
  });

  const [searchFueling, setSearchFueling] = useState("");
  const filteredFuelings = useMemo(() => {
    let list = fuelings || [];
    if (filterVehicle !== "all") list = list.filter(f => f.vehicleId === filterVehicle);
    if (filterMonth) {
      if (periodMode === "cycle") {
        const cyc = getCycleByValue(filterMonth);
        if (cyc) list = list.filter(f => f.date && f.date >= cyc.startDate && f.date <= cyc.endDate);
      } else {
        list = list.filter(f => f.date?.startsWith(filterMonth));
      }
    }
    if (searchFueling.trim()) {
      const s = searchFueling.toLowerCase();
      list = list.filter(f => {
        const v = vehicles.find(vv => vv.id === f.vehicleId);
        const plate = v?.plate?.toLowerCase() || "";
        const driver = (f.driverId ? employees.find(e => e.id === f.driverId)?.name?.toLowerCase() : "") || "";
        const station = f.station?.toLowerCase() || "";
        const au = (f as any).createdByUserId ? allUsers.find((u: any) => u.id === (f as any).createdByUserId) : null;
        const authName = au?.name?.toLowerCase() || "";
        return plate.includes(s) || driver.includes(s) || station.includes(s) || authName.includes(s);
      });
    }
    return list;
  }, [fuelings, filterVehicle, filterMonth, periodMode, searchFueling, vehicles, employees, allUsers]);

  const stats = useMemo(() => computeStats(filteredFuelings, fuelings, vehicles), [filteredFuelings, fuelings, vehicles]);
  const perVehicle = useMemo(() => computePerVehicleData(filteredFuelings, fuelings, vehicles || []), [filteredFuelings, fuelings, vehicles]);

  // Faixa de datas do período atual (pra filtrar missões coerentemente
  // com o filtro de combustível em cima da tela).
  const periodRange = useMemo(() => {
    if (!filterMonth) return { from: undefined as string | undefined, to: undefined as string | undefined };
    if (periodMode === "cycle") {
      const c = getCycleByValue(filterMonth);
      return c ? { from: c.startDate, to: c.endDate } : { from: undefined, to: undefined };
    }
    const [y, m] = filterMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [filterMonth, periodMode]);

  // % urbano vs rodovia por veículo, baseado nas missões executadas
  // dentro do período do filtro.
  const tripShareByVehicle = useMemo(() => {
    const missionsInPeriod = filterMissionsByPeriod(serviceOrders as ClassifiableMission[], periodRange.from, periodRange.to);
    const map = new Map<number, TripShare>();
    const byV = new Map<number, ClassifiableMission[]>();
    for (const m of missionsInPeriod) {
      const vid = (m as any).vehicleId;
      if (!vid) continue;
      if (!byV.has(vid)) byV.set(vid, []);
      byV.get(vid)!.push(m);
    }
    byV.forEach((list, vid) => map.set(vid, computeUrbanHighwayShare(list)));
    return map;
  }, [serviceOrders, periodRange.from, periodRange.to]);

  // Participação de cada viatura nas OSs do período (% por contagem e por km)
  const osShareByVehicle = useMemo(() => {
    const missionsInPeriod = filterMissionsByPeriod(serviceOrders as ClassifiableMission[], periodRange.from, periodRange.to);
    const map = new Map<number, { count: number; km: number; pctCount: number; pctKm: number }>();
    let totalCount = 0, totalKm = 0;
    for (const m of missionsInPeriod) {
      const vid = (m as any).vehicleId;
      if (!vid) continue;
      const km = Number((m as any).kmTotalCalculado ?? (m as any).km_total_calculado ?? 0);
      const cur = map.get(vid) || { count: 0, km: 0, pctCount: 0, pctKm: 0 };
      cur.count += 1;
      cur.km += km > 0 ? km : 0;
      map.set(vid, cur);
      totalCount += 1;
      if (km > 0) totalKm += km;
    }
    map.forEach(v => {
      v.pctCount = totalCount > 0 ? (v.count / totalCount) * 100 : 0;
      v.pctKm = totalKm > 0 ? (v.km / totalKm) * 100 : 0;
    });
    return { map, totalCount, totalKm };
  }, [serviceOrders, periodRange.from, periodRange.to]);

  // % álcool vs gasolina por veículo (peso = litros) no período filtrado
  const fuelTypeShareByVehicle = useMemo(() => {
    const map = new Map<number, { litAlcool: number; litGasolina: number; total: number; pctAlcool: number; pctGasolina: number }>();
    for (const f of filteredFuelings) {
      const ft = String((f as any).fuelType || "").toLowerCase();
      if (ft !== "etanol" && ft !== "alcool" && ft !== "álcool" && ft !== "gasolina") continue;
      const lit = Number(f.liters || 0);
      if (lit <= 0) continue;
      const cur = map.get(f.vehicleId) || { litAlcool: 0, litGasolina: 0, total: 0, pctAlcool: 0, pctGasolina: 0 };
      if (ft === "gasolina") cur.litGasolina += lit;
      else cur.litAlcool += lit;
      map.set(f.vehicleId, cur);
    }
    map.forEach(v => {
      v.total = v.litAlcool + v.litGasolina;
      if (v.total > 0) {
        v.pctAlcool = (v.litAlcool / v.total) * 100;
        v.pctGasolina = (v.litGasolina / v.total) * 100;
      }
    });
    return map;
  }, [filteredFuelings]);

  const getVehicle = (id: number) => vehicles.find(v => v.id === id);
  const getDriver = (id: number | null) => id ? employees.find(e => e.id === id)?.name : null;

  const fuelTypeLabel: Record<string, string> = {
    gasolina: "Gasolina", diesel: "Diesel", diesel_s10: "Diesel S10", etanol: "Etanol", gnv: "GNV",
  };

  const cycles = useMemo(
    () => listCyclesFromDates((fuelings || []).map(f => f.date).filter(Boolean) as string[]),
    [fuelings]
  );
  const months = useMemo(() => {
    const set = new Set<string>();
    const today = new Date();
    set.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
    (fuelings || []).forEach(f => { if (f.date) set.add(f.date.slice(0, 7)); });
    return Array.from(set).sort().reverse();
  }, [fuelings]);
  const filterMonthTouched = useRef(false);
  // Default: ciclo/mês corrente já selecionado quando a tela abre.
  useEffect(() => {
    if (filterMonth === "" && !filterMonthTouched.current) {
      if (periodMode === "cycle" && cycles.length > 0) {
        setFilterMonth(getCurrentCycle().value);
      } else if (periodMode === "month" && months.length > 0) {
        const today = new Date();
        setFilterMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
      }
    }
  }, [cycles, months, filterMonth, periodMode]);
  const currentCycleInfo = filterMonth && periodMode === "cycle" ? getCycleByValue(filterMonth) : null;
  const currentMonthLabel = filterMonth && periodMode === "month"
    ? (() => { const [y, m] = filterMonth.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); })()
    : null;

  const [mainTab, setMainTab] = useState("registros");

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-fueling-title">Controle de Abastecimento</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão completa de combustível da frota</p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="mb-4 h-auto flex-wrap" data-testid="tabs-fueling-main">
          <TabsTrigger value="registros" data-testid="tab-registros">
            <Fuel className="w-4 h-4 mr-1.5" /> Registros
          </TabsTrigger>
          <TabsTrigger value="conciliacao" data-testid="tab-conciliacao">
            <FileText className="w-4 h-4 mr-1.5" /> Conciliação TicketLog
          </TabsTrigger>
          <TabsTrigger value="postos" data-testid="tab-postos">
            <MapPin className="w-4 h-4 mr-1.5" /> Postos DE/PARA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registros">
      <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <Button variant={viewMode === "dashboard" ? "default" : "outline"} size="sm" onClick={() => setViewMode("dashboard")} data-testid="button-view-dashboard">
            <BarChart3 className="w-4 h-4 mr-1" /> Dashboard
          </Button>
          <Button variant={viewMode === "history" ? "default" : "outline"} size="sm" onClick={() => setViewMode("history")} data-testid="button-view-history">
            <Fuel className="w-4 h-4 mr-1" /> Histórico
          </Button>
          {isDiretoria && (
            <BatchValidateButton />
          )}
          <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-fueling">
            <Plus className="w-4 h-4 mr-2" /> Novo Abastecimento
          </Button>
        </div>
      </div>

      {showForm && <FuelingForm fueling={editItem} vehicles={vehicles || []} employees={employees || []} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value === "all" ? "all" : Number(e.target.value))} className="h-9 border border-neutral-300 rounded-lg px-3 text-sm bg-white" data-testid="select-filter-vehicle">
            <option value="all">Todos os veículos</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}
          </select>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-300 overflow-hidden" data-testid="toggle-period-mode">
          <button
            type="button"
            onClick={() => { filterMonthTouched.current = false; setFilterMonth(""); setPeriodMode("cycle"); }}
            className={`h-9 px-3 text-xs font-medium transition-colors ${periodMode === "cycle" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}
            data-testid="button-mode-cycle"
            title="Ciclo de fechamento do cartão (16 → 15)"
          >Ciclo (16→15)</button>
          <button
            type="button"
            onClick={() => { filterMonthTouched.current = false; setFilterMonth(""); setPeriodMode("month"); }}
            className={`h-9 px-3 text-xs font-medium transition-colors border-l border-neutral-300 ${periodMode === "month" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}
            data-testid="button-mode-month"
            title="Mês civil (dia 01 → último dia do mês)"
          >Mês civil</button>
        </div>
        <select
          value={filterMonth}
          onChange={e => { filterMonthTouched.current = true; setFilterMonth(e.target.value); }}
          className="h-9 border border-neutral-300 rounded-lg px-3 text-sm bg-white"
          data-testid="select-filter-month"
          title={currentCycleInfo ? currentCycleInfo.rangeLabel : (periodMode === "cycle" ? "Período de fechamento (16 → 15)" : "Mês civil")}
        >
          <option value="">Todo período</option>
          {periodMode === "cycle"
            ? cycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
            : months.map(m => {
                const [y, mo] = m.split("-").map(Number);
                return <option key={m} value={m}>{new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</option>;
              })}
        </select>
        {currentCycleInfo && (
          <span className="text-xs text-neutral-500 hidden md:inline" data-testid="text-cycle-range">
            ({currentCycleInfo.rangeLabel})
          </span>
        )}
        {currentMonthLabel && (
          <span className="text-xs text-neutral-500 hidden md:inline" data-testid="text-month-range">
            (mês civil: {currentMonthLabel})
          </span>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Pesquisar placa, motorista, posto ou autorizado por..."
            value={searchFueling}
            onChange={e => setSearchFueling(e.target.value)}
            className="w-full h-9 pl-8 pr-8 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
            data-testid="input-search-fueling"
          />
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          {searchFueling && <button onClick={() => setSearchFueling("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={Fuel} label="Abastecimentos" value={stats.totalFuelings.toString()} color="bg-blue-600" />
        <StatCard icon={Fuel} label="Litros Total" value={`${stats.totalLiters.toFixed(1)}L`} color="bg-cyan-600" />
        <StatCard icon={DollarSign} label="Gasto Total" value={`R$ ${stats.totalCost.toFixed(2)}`} color="bg-red-600" />
        <StatCard icon={Gauge} label="Média km/L" value={stats.avgKmPerLiter > 0 ? `${stats.avgKmPerLiter.toFixed(2)} km/L` : "-"} color="bg-green-600" />
        <StatCard icon={DollarSign} label="Custo/km" value={stats.avgCostPerKm > 0 ? `R$ ${stats.avgCostPerKm.toFixed(2)}` : "-"} color="bg-orange-600" />
        <StatCard
          icon={stats.bestAvg ? TrendingUp : BarChart3}
          label="Melhor Média"
          value={stats.bestAvg ? `${stats.bestAvg.avg.toFixed(2)} km/L` : "-"}
          sub={stats.bestAvg?.plate}
          color="bg-emerald-600"
        />
      </div>

      {viewMode === "dashboard" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900">Consumo por Veículo</h2>
          {perVehicle.length === 0 ? (
            <Card className="p-8 bg-white border-neutral-200 text-center text-neutral-400">
              Nenhum abastecimento registrado ainda
            </Card>
          ) : (
            <div className="space-y-3">
              {(() => {
                const leaderId = perVehicle.reduce<{ id: number | null; avg: number }>((acc, p) => p.avgKmL > acc.avg ? { id: p.vehicle.id, avg: p.avgKmL } : acc, { id: null, avg: 0 }).id;
                return perVehicle.map(pv => {
                const isExpanded = expandedVehicle === pv.vehicle.id;
                const vehicleFuelings = (fuelings || []).filter(f => f.vehicleId === pv.vehicle.id);
                const history = computeConsumptionHistory(vehicleFuelings);
                const isLeader = leaderId === pv.vehicle.id && pv.avgKmL > 0;
                const belowGlobal = pv.avgKmL > 0 && stats.avgKmPerLiter > 0 && pv.avgKmL < stats.avgKmPerLiter * 0.9;
                return (
                  <Card key={pv.vehicle.id} className="bg-white border-neutral-200 overflow-hidden" data-testid={`card-vehicle-consumption-${pv.vehicle.id}`}>
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition-colors"
                      onClick={() => setExpandedVehicle(isExpanded ? null : pv.vehicle.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-neutral-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-neutral-900">{pv.vehicle.plate}</p>
                            {isLeader && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 border border-emerald-300 rounded px-1.5 py-0.5" data-testid={`badge-leader-${pv.vehicle.id}`}>
                                <TrendingUp className="w-3 h-3" /> Líder de Eficiência
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">{pv.vehicle.model} {pv.vehicle.brand}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Abastecimentos</p>
                          <p className="font-bold text-neutral-900">{pv.count}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Total Litros</p>
                          <p className="font-bold text-neutral-900">{pv.totalLiters.toFixed(1)}L</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Gasto Total</p>
                          <p className="font-bold text-neutral-900">R$ {pv.totalCost.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Média</p>
                          <p className={`font-bold flex items-center gap-1 ${pv.avgKmL > 0 ? (belowGlobal ? "text-red-600" : isLeader ? "text-emerald-600" : "text-green-600") : "text-neutral-400"}`} data-testid={`text-avg-${pv.vehicle.id}`}>
                            {pv.avgKmL > 0 ? (
                              <>
                                {belowGlobal && <AlertTriangle className="w-3 h-3" />}
                                {pv.avgKmL.toFixed(2)} km/L
                              </>
                            ) : "-"}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Custo/KM</p>
                          <p className="font-bold text-neutral-900" data-testid={`text-cost-per-km-${pv.vehicle.id}`}>{pv.costPerKm > 0 ? `R$ ${pv.costPerKm.toFixed(2)}` : "-"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Último KM</p>
                          <p className="font-bold text-neutral-900">{pv.lastKm.toLocaleString("pt-BR")}</p>
                        </div>
                        {(() => {
                          const fs = fuelTypeShareByVehicle.get(pv.vehicle.id);
                          return (
                            <div className="text-center min-w-[120px]" data-testid={`fuel-share-${pv.vehicle.id}`} title={fs && fs.total > 0 ? `Álcool ${fs.litAlcool.toFixed(1)}L · Gasolina ${fs.litGasolina.toFixed(1)}L` : "sem abastecimentos"}>
                              <p className="text-xs text-neutral-400">Álcool / Gasolina</p>
                              {fs && fs.total > 0 ? (
                                <>
                                  <div className="flex h-2 rounded overflow-hidden bg-neutral-100 mt-1">
                                    <div className="bg-green-500" style={{ width: `${fs.pctAlcool}%` }} />
                                    <div className="bg-blue-600" style={{ width: `${fs.pctGasolina}%` }} />
                                  </div>
                                  <p className="text-[11px] font-bold mt-0.5">
                                    <span className="text-green-700">{fs.pctAlcool.toFixed(0)}%</span>
                                    <span className="text-neutral-300 mx-1">/</span>
                                    <span className="text-blue-700">{fs.pctGasolina.toFixed(0)}%</span>
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-neutral-300 mt-1">-</p>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const os = osShareByVehicle.map.get(pv.vehicle.id);
                          return (
                            <div className="text-center min-w-[120px]" data-testid={`os-share-${pv.vehicle.id}`} title={os ? `${os.count} de ${osShareByVehicle.totalCount} OSs · ${os.km.toFixed(0)} de ${osShareByVehicle.totalKm.toFixed(0)} km` : "sem missões"}>
                              <p className="text-xs text-neutral-400">% das OSs</p>
                              {os && os.count > 0 ? (
                                <>
                                  <div className="flex h-2 rounded overflow-hidden bg-neutral-100 mt-1" title={`${os.pctKm.toFixed(0)}% do km rodado total`}>
                                    <div className="bg-violet-600" style={{ width: `${os.pctKm}%` }} />
                                  </div>
                                  <p className="text-[11px] font-bold mt-0.5">
                                    <span className="text-violet-700">{os.pctCount.toFixed(0)}%</span>
                                    <span className="text-neutral-300 mx-1">·</span>
                                    <span className="text-violet-500">{os.pctKm.toFixed(0)}% km</span>
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-neutral-300 mt-1">-</p>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const ts = tripShareByVehicle.get(pv.vehicle.id);
                          return (
                            <div className="text-center min-w-[120px]" data-testid={`trip-share-${pv.vehicle.id}`} title={ts && ts.kmTotal > 0 ? `${ts.countUrbano} urb (${ts.kmUrbano.toFixed(0)} km) · ${ts.countRodovia} rod (${ts.kmRodovia.toFixed(0)} km)` : "sem missões"}>
                              <p className="text-xs text-neutral-400">Urbano / Rodovia</p>
                              {ts && ts.kmTotal > 0 ? (
                                <>
                                  <div className="flex h-2 rounded overflow-hidden bg-neutral-100 mt-1">
                                    <div className="bg-amber-500" style={{ width: `${ts.pctUrbano}%` }} />
                                    <div className="bg-sky-600" style={{ width: `${ts.pctRodovia}%` }} />
                                  </div>
                                  <p className="text-[11px] font-bold mt-0.5">
                                    <span className="text-amber-700">{ts.pctUrbano.toFixed(0)}%</span>
                                    <span className="text-neutral-300 mx-1">/</span>
                                    <span className="text-sky-700">{ts.pctRodovia.toFixed(0)}%</span>
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-neutral-300 mt-1">-</p>
                              )}
                            </div>
                          );
                        })()}
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-neutral-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-neutral-50">
                              <tr>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Data</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">KM</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Litros</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Valor</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">R$/L</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">km/L</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">R$/km</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Motorista</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Posto</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Autorizado por</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500 uppercase">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((h, idx) => {
                                const orig = vehicleFuelings.find(f => f.id === h.id)!;
                                const authUser = (orig as any).createdByUserId ? allUsers.find((u: any) => u.id === (orig as any).createdByUserId) : null;
                                return (
                                  <tr key={h.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                                    <td className="px-4 py-2.5 text-neutral-900">{formatDateBRT(h.date + "T12:00:00")}</td>
                                    <td className="px-4 py-2.5 text-neutral-900 font-medium">{h.km.toLocaleString("pt-BR")}</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{h.liters.toFixed(2)}L</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{orig.totalCost ? `R$ ${Number(orig.totalCost).toFixed(2)}` : "-"}</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{orig.costPerLiter ? `R$ ${Number(orig.costPerLiter).toFixed(3)}` : "-"}</td>
                                    <td className="px-4 py-2.5">
                                      {(() => {
                                        const info = calcKmL(vehicleFuelings, orig);
                                        if (!info) return idx === 0 ? <span className="text-xs text-neutral-400 italic">1º reg.</span> : <span className="text-neutral-300">-</span>;
                                        if (info.isIncoerente) {
                                          return (
                                            <span
                                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                                              title={`Trecho de ${info.totalDist} km com ${info.totalLiters.toFixed(2)}L → ${(info.kmLCombined ?? info.kmL).toFixed(1)} km/L (impossível). Provável abastecimento não registrado ou hodômetro digitado errado.`}
                                              data-testid={`kml-incoerente-${h.id}`}
                                            >
                                              ⚠ incoerente
                                              <span className="text-[10px] text-neutral-400 line-through font-normal">{info.kmL.toFixed(1)}</span>
                                            </span>
                                          );
                                        }
                                        if (info.isSuspect && info.kmLCombined !== null && info.segments > 1) {
                                          const v = info.kmLCombined;
                                          return (
                                            <span className="inline-flex items-center gap-1" title={`Trecho curto / tanque parcial: ${info.totalDist} km com ${info.totalLiters.toFixed(2)}L em ${info.segments} abastecimentos consecutivos. Média individual ${info.kmL.toFixed(1)} km/L é enganosa — a real combinada é ${v.toFixed(1)} km/L.`}>
                                              <span className={`font-semibold ${v >= 12 ? "text-emerald-600" : v >= 7 ? "text-green-600" : v >= 5 ? "text-amber-600" : "text-red-600"}`}>{v.toFixed(2)}</span>
                                              <span className="text-[10px] text-neutral-400 line-through">{info.kmL.toFixed(1)}</span>
                                            </span>
                                          );
                                        }
                                        const v = info.kmL;
                                        return (
                                          <span
                                            className={`font-semibold ${v >= 12 ? "text-emerald-600" : v >= 7 ? "text-green-600" : v >= 5 ? "text-amber-600" : "text-red-600"}`}
                                            title={info.isSuspect ? `Atenção: ${v.toFixed(1)} km/L está fora da faixa esperada (6 a 20). Provável tanque parcial.` : undefined}
                                          >
                                            {v.toFixed(2)}
                                          </span>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-600">
                                      {h.costPerKm !== null ? `R$ ${h.costPerKm.toFixed(2)}` : "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-500 text-xs">{getDriver(orig.driverId) || "-"}</td>
                                    <td className="px-4 py-2.5 text-neutral-500 text-xs">{orig.station || "-"}</td>
                                    <td className="px-4 py-2.5 text-xs">{authUser ? <span className={(authUser.role === "admin" || authUser.role === "diretoria") ? "font-semibold text-neutral-800" : "text-neutral-500"}>{authUser.name}</span> : <span className="text-neutral-400 italic">—</span>}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDetailItem(orig); }} data-testid={`button-detail-dash-${h.id}`}><Eye className="w-3.5 h-3.5 text-blue-500" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditItem(orig); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                                      {isDiretoria && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); if (window.confirm("Excluir este abastecimento?")) deleteMutation.mutate(h.id); }}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              });
              })()}
            </div>
          )}
        </div>
      ) : (
        <Card className="bg-white border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-fueling">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Veículo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">KM</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Litros</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">R$/L</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Valor Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider bg-emerald-50">Média (km/L)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Combustível</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Decisão</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Posto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Motorista</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Autorizado por</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-purple-600 uppercase tracking-wider bg-purple-50/50">TLog</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-indigo-600 uppercase tracking-wider bg-indigo-50/50">NF IA</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={15} className="p-8 text-center text-neutral-400">Carregando...</td></tr>
                ) : filteredFuelings.length === 0 ? (
                  <tr><td colSpan={15} className="p-8 text-center text-neutral-400">Nenhum abastecimento encontrado</td></tr>
                ) : (
                  [...filteredFuelings].sort((a, b) => b.date.localeCompare(a.date)).map((f) => {
                    const v = getVehicle(f.vehicleId);
                    const vehicleFuels = (fuelings || []).filter(vf => vf.vehicleId === f.vehicleId);
                    const sortedByKm = [...vehicleFuels].sort((a, b) => a.km - b.km);
                    const fIdx = sortedByKm.findIndex(vf => vf.id === f.id);
                    let mediaKmL: number | null = null;
                    if (fIdx > 0) {
                      const prev = sortedByKm[fIdx - 1];
                      const dist = f.km - prev.km;
                      const liters = Number(f.liters) || 0;
                      if (dist > 0 && liters > 0) mediaKmL = dist / liters;
                    }
                    const isFirst = fIdx === 0;
                    return (
                      <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-fueling-${f.id}`}>
                        <td className="px-4 py-3 text-neutral-900">{formatDateBRT(f.date + "T12:00:00")}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900">{v?.plate || "-"}</td>
                        <td className="px-4 py-3 text-neutral-900 font-medium">{f.km.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-neutral-600">{Number(f.liters).toFixed(2)}L</td>
                        <td className="px-4 py-3 text-neutral-600">{f.costPerLiter ? `R$ ${Number(f.costPerLiter).toFixed(3)}` : "-"}</td>
                        <td className="px-4 py-3 text-neutral-600 font-medium">{f.totalCost ? `R$ ${Number(f.totalCost).toFixed(2)}` : "-"}</td>
                        <td className="px-4 py-3 bg-emerald-50/50" data-testid={`media-kml-${f.id}`}>
                          {isFirst ? (
                            <span className="text-xs text-neutral-400 italic">1º reg.</span>
                          ) : mediaKmL !== null ? (
                            <span className={`font-semibold ${mediaKmL >= 12 ? "text-emerald-600" : mediaKmL >= 7 ? "text-green-600" : mediaKmL >= 5 ? "text-amber-600" : "text-red-600"}`}>
                              {mediaKmL.toFixed(2)} km/L
                            </span>
                          ) : (
                            <span className="text-neutral-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{fuelTypeLabel[f.fuelType] || f.fuelType}</td>
                        <td className="px-4 py-3 text-xs" data-testid={`decision-${f.id}`}>{(() => {
                          if (f.recommendationFollowed === true) return <span className="text-emerald-600 font-semibold">Seguiu</span>;
                          if (f.recommendationFollowed === false) return <span className="text-red-600 font-semibold">Não seguiu</span>;
                          return <span className="text-neutral-400">—</span>;
                        })()}</td>
                        <td className="px-4 py-3 text-neutral-500 text-xs">{f.station || "-"}</td>
                        <td className="px-4 py-3 text-neutral-500 text-xs">{getDriver(f.driverId) || "-"}</td>
                        <td className="px-4 py-3 text-xs" data-testid={`text-autorizado-fuel-${f.id}`}>{(() => {
                          const au = (f as any).createdByUserId ? allUsers.find((u: any) => u.id === (f as any).createdByUserId) : null;
                          return au ? <span className={(au.role === "admin" || au.role === "diretoria") ? "font-semibold text-neutral-800" : "text-neutral-500"}>{au.name}</span> : <span className="text-neutral-400 italic">—</span>;
                        })()}</td>
                        <td className="px-4 py-3 text-center bg-purple-50/30" data-testid={`tlog-status-${f.id}`}>{(() => {
                          const tls = (f as any).ticketlogStatus;
                          if (!tls) return <span className="text-neutral-300">—</span>;
                          if (tls === "autorizado") return <ShieldCheck className="w-4 h-4 text-blue-500 mx-auto" />;
                          if (tls === "nfe_consultada") return <FileText className="w-4 h-4 text-green-500 mx-auto" />;
                          if (tls === "nfe_enviada") return <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />;
                          if (tls === "erro") return <XCircle className="w-4 h-4 text-red-500 mx-auto" />;
                          return <span className="text-neutral-300">—</span>;
                        })()}</td>
                        <td className="px-4 py-3 text-center bg-indigo-50/30" data-testid={`ai-status-${f.id}`}>{(() => {
                          const st = (f as any).aiValidationStatus;
                          if (st === "validado") return <span className="inline-flex items-center gap-1 text-green-700 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>;
                          if (st === "verificar") return <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Verificar</span>;
                          if (st === "pendente") return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin mx-auto" />;
                          if (st === "sem_foto") return <span className="text-neutral-300 text-xs">—</span>;
                          if (!f.receiptPhoto) return <span className="text-neutral-300 text-xs">—</span>;
                          return <span className="text-amber-500 text-xs font-medium">Aguard.</span>;
                        })()}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setDetailItem(f)} data-testid={`button-detail-${f.id}`}><Eye className="w-4 h-4 text-blue-500" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setEditItem(f); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                          {isDiretoria && <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Excluir este abastecimento?")) deleteMutation.mutate(f.id); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {stats.worstAvg && stats.worstAvg.avg < 6 && stats.worstAvg.avg > 0 && (
        <Card className="mt-6 p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">Alerta de Consumo Elevado</p>
              <p className="text-sm text-red-700">
                O veículo <strong>{stats.worstAvg.plate}</strong> está com média de <strong>{stats.worstAvg.avg.toFixed(2)} km/L</strong>, muito abaixo do esperado.
                Verifique possíveis problemas mecânicos ou uso indevido.
              </p>
            </div>
          </div>
        </Card>
      )}
      {detailItem && (
        <FuelingDetail
          fueling={detailItem}
          vehicle={getVehicle(detailItem.vehicleId)}
          driverName={getDriver(detailItem.driverId)}
          onClose={() => setDetailItem(null)}
        />
      )}
        </TabsContent>

        <TabsContent value="conciliacao">
          <ConciliacaoContent />
        </TabsContent>

        <TabsContent value="postos">
          <PostosContent />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
