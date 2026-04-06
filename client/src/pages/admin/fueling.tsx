import { useState, useMemo } from "react";
import { parseBRL, maskBRL } from "@/lib/utils";
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
  MapPin, Camera, Eye, ArrowLeft, ExternalLink
} from "lucide-react";
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

function computeStats(
  fuelings: VehicleFueling[],
  vehicles: Vehicle[]
): FuelingStats {
  let totalLiters = 0;
  let totalCost = 0;

  const byVehicle: Record<number, VehicleFueling[]> = {};
  for (const f of fuelings) {
    totalLiters += Number(f.liters) || 0;
    totalCost += Number(f.totalCost) || 0;
    if (!byVehicle[f.vehicleId]) byVehicle[f.vehicleId] = [];
    byVehicle[f.vehicleId].push(f);
  }

  const vehicleAvgs: { vehicleId: number; avg: number }[] = [];
  let totalKmDriven = 0;
  let totalLitersForAvg = 0;

  for (const [vid, records] of Object.entries(byVehicle)) {
    const sorted = [...records].sort((a, b) => a.km - b.km);
    const intervals = computeValidIntervals(sorted);
    const kmSum = intervals.reduce((s, i) => s + i.km, 0);
    const litersSum = intervals.reduce((s, i) => s + i.liters, 0);
    if (litersSum > 0 && kmSum > 0) {
      vehicleAvgs.push({ vehicleId: Number(vid), avg: kmSum / litersSum });
      totalKmDriven += kmSum;
      totalLitersForAvg += litersSum;
    }
  }

  const avgKmPerLiter = totalLitersForAvg > 0 ? totalKmDriven / totalLitersForAvg : 0;
  const avgCostPerKm = totalKmDriven > 0 ? totalCost / totalKmDriven : 0;

  const getPlate = (vid: number) => vehicles.find(v => v.id === vid)?.plate || "?";

  let bestAvg: FuelingStats["bestAvg"] = null;
  let worstAvg: FuelingStats["worstAvg"] = null;
  if (vehicleAvgs.length > 0) {
    const best = vehicleAvgs.reduce((a, b) => a.avg > b.avg ? a : b);
    const worst = vehicleAvgs.reduce((a, b) => a.avg < b.avg ? a : b);
    bestAvg = { plate: getPlate(best.vehicleId), avg: best.avg };
    worstAvg = { plate: getPlate(worst.vehicleId), avg: worst.avg };
  }

  return { totalLiters, totalCost, avgKmPerLiter, avgCostPerKm, totalFuelings: fuelings.length, bestAvg, worstAvg };
}

function computePerVehicleData(fuelings: VehicleFueling[], vehicles: Vehicle[]) {
  const byVehicle: Record<number, VehicleFueling[]> = {};
  for (const f of fuelings) {
    if (!byVehicle[f.vehicleId]) byVehicle[f.vehicleId] = [];
    byVehicle[f.vehicleId].push(f);
  }

  return vehicles.map(v => {
    const records = byVehicle[v.id] || [];
    const sorted = [...records].sort((a, b) => a.km - b.km);
    const totalLiters = records.reduce((s, f) => s + (Number(f.liters) || 0), 0);
    const totalCost = records.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);
    let avgKmL = 0;

    const intervals = computeValidIntervals(sorted);
    const kmSum = intervals.reduce((s, i) => s + i.km, 0);
    const litersSum = intervals.reduce((s, i) => s + i.liters, 0);
    if (litersSum > 0 && kmSum > 0) avgKmL = kmSum / litersSum;

    return {
      vehicle: v,
      count: records.length,
      totalLiters,
      totalCost,
      avgKmL,
      lastKm: sorted.length > 0 ? sorted[sorted.length - 1].km : 0,
      lastDate: records.length > 0 ? [...records].sort((a, b) => b.date.localeCompare(a.date))[0].date : null,
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

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Preço no Posto (obrigatório)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-amber-900 mb-1.5 block">Preço Gasolina (R$/L) *</label>
              <Input type="text" inputMode="numeric" value={form.gasolinePrice || "0,000"} onChange={(e) => setForm({ ...form, gasolinePrice: maskBRL(e.target.value, 3) })} placeholder="Ex: 5,790" className="bg-white" required data-testid="input-gasoline-price" />
            </div>
            <div>
              <label className="text-sm font-semibold text-amber-900 mb-1.5 block">Preço Álcool (R$/L) *</label>
              <Input type="text" inputMode="numeric" value={form.ethanolPrice || "0,000"} onChange={(e) => setForm({ ...form, ethanolPrice: maskBRL(e.target.value, 3) })} placeholder="Ex: 3,690" className="bg-white" required data-testid="input-ethanol-price" />
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
            }} required disabled={!pricesReady} className={!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""} data-testid="input-fueling-liters" />
            {!pricesReady && <p className="text-[10px] text-amber-600 mt-1">Preencha os preços acima para liberar</p>}
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Valor/Litro (R$)</label>
            <Input type="text" inputMode="numeric" value={form.costPerLiter || "0,00"} onChange={(e) => {
              const costPerLiter = maskBRL(e.target.value, 3);
              setForm({ ...form, costPerLiter, totalCost: autoCalcTotal(String(form.liters), costPerLiter) });
            }} disabled={!pricesReady} className={!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""} data-testid="input-fueling-cost-per-liter" />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Valor Total (R$)</label>
            <Input type="text" inputMode="numeric" value={form.totalCost || "0,00"} onChange={(e) => setForm({ ...form, totalCost: maskBRL(e.target.value) })} disabled={!pricesReady} className={!pricesReady ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""} data-testid="input-fueling-total" />
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

        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending || !pricesReady} data-testid="button-save-fueling">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
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

            <div className="text-xs text-neutral-400 pt-2 border-t border-neutral-100">
              Registrado em {fueling.createdAt ? new Date(fueling.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"} · ID #{fueling.id}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function FuelingPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VehicleFueling | undefined>();
  const [detailItem, setDetailItem] = useState<VehicleFueling | null>(null);
  const [filterVehicle, setFilterVehicle] = useState<number | "all">("all");
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
    if (filterMonth) list = list.filter(f => f.date?.startsWith(filterMonth));
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
  }, [fuelings, filterVehicle, filterMonth, searchFueling, vehicles, employees, allUsers]);

  const stats = useMemo(() => computeStats(filteredFuelings, vehicles), [filteredFuelings, vehicles]);
  const perVehicle = useMemo(() => computePerVehicleData(filteredFuelings, vehicles || []), [filteredFuelings, vehicles]);

  const getVehicle = (id: number) => vehicles.find(v => v.id === id);
  const getDriver = (id: number | null) => id ? employees.find(e => e.id === id)?.name : null;

  const fuelTypeLabel: Record<string, string> = {
    gasolina: "Gasolina", diesel: "Diesel", diesel_s10: "Diesel S10", etanol: "Etanol", gnv: "GNV",
  };

  const months = useMemo(() => {
    const set = new Set<string>();
    (fuelings || []).forEach(f => { if (f.date) set.add(f.date.slice(0, 7)); });
    return Array.from(set).sort().reverse();
  }, [fuelings]);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-fueling-title">Controle de Abastecimento</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão completa de combustível da frota</p>
        </div>
        <div className="flex gap-2">
          <Button variant={viewMode === "dashboard" ? "default" : "outline"} size="sm" onClick={() => setViewMode("dashboard")} data-testid="button-view-dashboard">
            <BarChart3 className="w-4 h-4 mr-1" /> Dashboard
          </Button>
          <Button variant={viewMode === "history" ? "default" : "outline"} size="sm" onClick={() => setViewMode("history")} data-testid="button-view-history">
            <Fuel className="w-4 h-4 mr-1" /> Histórico
          </Button>
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
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="h-9 border border-neutral-300 rounded-lg px-3 text-sm bg-white" data-testid="select-filter-month">
          <option value="">Todo período</option>
          {months.map(m => <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</option>)}
        </select>
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
              {perVehicle.map(pv => {
                const isExpanded = expandedVehicle === pv.vehicle.id;
                const vehicleFuelings = (fuelings || []).filter(f => f.vehicleId === pv.vehicle.id);
                const history = computeConsumptionHistory(vehicleFuelings);
                const avgOk = pv.avgKmL >= 7;
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
                          <p className="font-bold text-neutral-900">{pv.vehicle.plate}</p>
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
                          <p className={`font-bold flex items-center gap-1 ${pv.avgKmL > 0 ? (avgOk ? "text-green-600" : "text-red-600") : "text-neutral-400"}`}>
                            {pv.avgKmL > 0 ? (
                              <>
                                {!avgOk && <AlertTriangle className="w-3 h-3" />}
                                {pv.avgKmL.toFixed(2)} km/L
                              </>
                            ) : "-"}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-neutral-400">Último KM</p>
                          <p className="font-bold text-neutral-900">{pv.lastKm.toLocaleString("pt-BR")}</p>
                        </div>
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
                                    <td className="px-4 py-2.5 text-neutral-900">{new Date(h.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                                    <td className="px-4 py-2.5 text-neutral-900 font-medium">{h.km.toLocaleString("pt-BR")}</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{h.liters.toFixed(2)}L</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{orig.totalCost ? `R$ ${Number(orig.totalCost).toFixed(2)}` : "-"}</td>
                                    <td className="px-4 py-2.5 text-neutral-600">{orig.costPerLiter ? `R$ ${Number(orig.costPerLiter).toFixed(3)}` : "-"}</td>
                                    <td className="px-4 py-2.5">
                                      {h.kmL !== null ? (
                                        <span className={`font-semibold ${h.kmL >= 12 ? "text-emerald-600" : h.kmL >= 7 ? "text-green-600" : h.kmL >= 5 ? "text-amber-600" : "text-red-600"}`}>
                                          {h.kmL.toFixed(2)}
                                        </span>
                                      ) : idx === 0 ? <span className="text-xs text-neutral-400 italic">1º reg.</span> : <span className="text-neutral-300">-</span>}
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
              })}
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
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={13} className="p-8 text-center text-neutral-400">Carregando...</td></tr>
                ) : filteredFuelings.length === 0 ? (
                  <tr><td colSpan={13} className="p-8 text-center text-neutral-400">Nenhum abastecimento encontrado</td></tr>
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
                        <td className="px-4 py-3 text-neutral-900">{new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
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
    </AdminLayout>
  );
}
