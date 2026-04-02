import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn, invalidateRelatedQueries } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Pencil, Trash2, Gauge, Search, Loader2, Link2, Unlink, History, Camera, ImageIcon, FileText, Download, Eye } from "lucide-react";
import type { Vehicle, VehicleFueling, VehicleAssignment, Employee } from "@shared/schema";

function VehicleForm({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const { toast } = useToast();
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tcTestLoading, setTcTestLoading] = useState(false);
  const [tcTestResult, setTcTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [form, setForm] = useState({
    plate: vehicle?.plate || "",
    model: vehicle?.model || "",
    brand: vehicle?.brand || "",
    year: vehicle?.year || new Date().getFullYear(),
    color: vehicle?.color || "",
    chassi: vehicle?.chassi || "",
    renavam: vehicle?.renavam || "",
    status: vehicle?.status || "disponível",
    trackerId: vehicle?.trackerId || "",
    trackerApiUrl: vehicle?.trackerApiUrl || "",
    trackerType: (vehicle as any)?.trackerType || "none",
    truckscontrolIdentifier: (vehicle as any)?.truckscontrolIdentifier || "",
    km: vehicle?.km || 0,
    initialKm: (vehicle as any)?.initialKm || 0,
    documentFile: (vehicle as any)?.documentFile || "",
    photoFront: vehicle?.photoFront || "",
    photoLeft: vehicle?.photoLeft || "",
    photoRear: vehicle?.photoRear || "",
    photoRight: vehicle?.photoRight || "",
    iconType: (vehicle as any)?.iconType || "polo",
    notes: vehicle?.notes || "",
  });

  const lookupPlate = useCallback(async (plate: string) => {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 7) return;

    setLookupLoading(true);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/plate-lookup/${clean}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Consulta de placa", description: err.message || "Erro na consulta", variant: "destructive" });
        return;
      }
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        brand: data.brand || prev.brand,
        model: data.model || prev.model,
        year: data.year || prev.year,
        color: data.color || prev.color,
        chassi: data.chassi || prev.chassi,
        notes: prev.notes || [data.fuel, data.type, data.city && data.state ? `${data.city}/${data.state}` : ""].filter(Boolean).join(" | "),
      }));
      toast({ title: "Dados do veículo preenchidos automaticamente" });
    } catch {
      toast({ title: "Erro ao consultar placa", variant: "destructive" });
    } finally {
      setLookupLoading(false);
    }
  }, [toast]);

  const handlePlateChange = useCallback((value: string) => {
    const upper = value.toUpperCase();
    setForm(prev => ({ ...prev, plate: upper }));
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    const clean = upper.replace(/[^A-Z0-9]/g, "");
    if (clean.length === 7 && !vehicle) {
      lookupTimeout.current = setTimeout(() => lookupPlate(clean), 500);
    }
  }, [lookupPlate, vehicle]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (vehicle) {
        await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, data);
      } else {
        await apiRequest("POST", "/api/vehicles", data);
      }
    },
    onSuccess: () => {
      invalidateRelatedQueries("vehicle");
      toast({ title: vehicle ? "Veículo atualizado" : "Veículo cadastrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-vehicle-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{vehicle ? "Editar Veículo" : "Novo Veículo"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Placa *</label>
          <div className="relative">
            <Input
              value={form.plate}
              onChange={(e) => handlePlateChange(e.target.value)}
              required
              placeholder="ABC1D23"
              maxLength={8}
              className="pr-10 uppercase font-mono font-bold tracking-wider"
              data-testid="input-vehicle-plate"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {lookupLoading ? (
                <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={() => lookupPlate(form.plate)}
                  className="p-1 hover:bg-neutral-100 rounded"
                  title="Consultar placa"
                  data-testid="button-lookup-plate"
                >
                  <Search className="w-4 h-4 text-neutral-400" />
                </button>
              )}
            </div>
          </div>
          {!vehicle && <p className="text-xs text-neutral-500 mt-1.5">Digite a placa completa para buscar automaticamente</p>}
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Marca *</label>
          <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required data-testid="input-vehicle-brand" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Modelo *</label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required data-testid="input-vehicle-model" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Ano</label>
          <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} data-testid="input-vehicle-year" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Cor</label>
          <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="input-vehicle-color" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">KM Inicial (vida útil)</label>
          <Input type="number" value={form.initialKm} onChange={(e) => setForm({ ...form, initialKm: Number(e.target.value) })} placeholder="Ex: 45000" data-testid="input-vehicle-initial-km" />
          <span className="text-[11px] text-neutral-400 mt-0.5 block">KM que o veículo já tinha ao ser cadastrado</span>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">KM Atual</label>
          <Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: Number(e.target.value) })} data-testid="input-vehicle-km" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Chassi</label>
          <Input value={form.chassi} onChange={(e) => setForm({ ...form, chassi: e.target.value })} data-testid="input-vehicle-chassi" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">RENAVAM</label>
          <Input value={form.renavam} onChange={(e) => setForm({ ...form, renavam: e.target.value })} data-testid="input-vehicle-renavam" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Documento (CRLV/CRV)</label>
          {form.documentFile ? (
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
              <FileText className="w-5 h-5 text-neutral-600 shrink-0" />
              <span className="text-sm text-neutral-700 font-medium truncate flex-1">
                {form.documentFile.startsWith("data:application/pdf") ? "Documento.pdf" : "Documento anexado"}
              </span>
              <a
                href={form.documentFile}
                download={`documento-${form.plate || "veiculo"}`}
                className="p-1 hover:bg-neutral-200 rounded transition-colors"
                title="Baixar documento"
                data-testid="button-download-document"
              >
                <Download className="w-4 h-4 text-neutral-500" />
              </a>
              {form.documentFile.startsWith("data:image") && (
                <a
                  href={form.documentFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-neutral-200 rounded transition-colors"
                  title="Visualizar"
                  data-testid="button-view-document"
                >
                  <Eye className="w-4 h-4 text-neutral-500" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setForm({ ...form, documentFile: "" })}
                className="p-1 hover:bg-red-100 rounded transition-colors"
                title="Remover documento"
                data-testid="button-remove-document"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-3 px-3 py-3 rounded-lg border-2 border-dashed border-neutral-300 bg-white cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition-colors">
              <FileText className="w-5 h-5 text-neutral-400" />
              <span className="text-sm text-neutral-500">Clique para anexar documento (PDF ou imagem, máx. 10MB)</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    toast({ title: "Arquivo muito grande", description: "Máximo 10MB", variant: "destructive" });
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setForm(prev => ({ ...prev, documentFile: reader.result as string }));
                  reader.readAsDataURL(file);
                }}
                data-testid="input-document-file"
              />
            </label>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-vehicle-status">
            <option value="disponível">Disponível</option>
            <option value="em_uso">Em Uso</option>
            <option value="manutenção">Manutenção</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-semibold text-neutral-700 mb-2 block">Ícone no Mapa / Grid</label>
          <div className="flex items-center gap-3">
            {[
              { key: "polo", label: "Polo Track", src: "/polo-icon.webp" },
              { key: "kwid", label: "Renault Kwid", src: "/kwid-icon.png" },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setForm({ ...form, iconType: opt.key })}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all ${
                  form.iconType === opt.key
                    ? "border-neutral-900 bg-neutral-50 shadow-sm"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
                data-testid={`btn-icon-${opt.key}`}
              >
                <div className={`w-10 h-10 rounded-full overflow-hidden border-2 flex-shrink-0 ${
                  form.iconType === opt.key ? "border-neutral-900" : "border-neutral-300"
                }`}>
                  <img src={opt.src} alt={opt.label} className="w-full h-full object-cover" />
                </div>
                <span className={`text-sm font-medium ${form.iconType === opt.key ? "text-neutral-900" : "text-neutral-500"}`}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-neutral-600" />
            <span className="text-sm font-medium text-neutral-800">Rastreador</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Tipo de Rastreador</label>
              <select value={form.trackerType} onChange={(e) => setForm({ ...form, trackerType: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-tracker-type">
                <option value="truckscontrol">TrucksControl</option>
                <option value="custom">OnixSat</option>
                <option value="none">Sem Rastreador</option>
              </select>
            </div>
            {form.trackerType === "truckscontrol" && (
              <>
                <div>
                  <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Identificador TrucksControl</label>
                  <Input value={form.truckscontrolIdentifier} onChange={(e) => setForm({ ...form, truckscontrolIdentifier: e.target.value })} placeholder="Usa placa se vazio" data-testid="input-tc-identifier" />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={tcTestLoading}
                    onClick={async () => {
                      setTcTestLoading(true);
                      setTcTestResult(null);
                      try {
                        const { authFetch } = await import("@/lib/queryClient");
                        const res = await authFetch("/api/truckscontrol/test");
                        const data = await res.json();
                        setTcTestResult(data);
                      } catch {
                        setTcTestResult({ success: false, message: "Erro de conexão" });
                      } finally {
                        setTcTestLoading(false);
                      }
                    }}
                    data-testid="button-test-truckscontrol"
                  >
                    {tcTestLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Testando...</> : "Testar Conexão"}
                  </Button>
                </div>
                {tcTestResult && (
                  <div className={`md:col-span-3 text-xs px-3 py-2 rounded ${tcTestResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} data-testid="text-tc-test-result">
                    {tcTestResult.message}
                  </div>
                )}
              </>
            )}
            {form.trackerType === "custom" && (
              <>
                <div>
                  <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">ID Rastreador</label>
                  <Input value={form.trackerId} onChange={(e) => setForm({ ...form, trackerId: e.target.value })} placeholder="ID do dispositivo" data-testid="input-vehicle-tracker" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">URL API Rastreador</label>
                  <Input value={form.trackerApiUrl} onChange={(e) => setForm({ ...form, trackerApiUrl: e.target.value })} placeholder="https://api.rastreador.com/..." data-testid="input-vehicle-tracker-url" />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="md:col-span-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-neutral-600" />
            <span className="text-sm font-medium text-neutral-800">Fotos do Veículo</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["photoFront", "photoLeft", "photoRear", "photoRight"] as const).map((key, i) => {
              const labels = ["Dianteira", "Lateral Esq.", "Traseira", "Lateral Dir."];
              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  <label className="text-xs text-neutral-500 font-medium">{labels[i]}</label>
                  {form[key] ? (
                    <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-neutral-200 bg-white group">
                      <img src={form[key]} alt={labels[i]} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, [key]: "" })}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`btn-remove-${key}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-neutral-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition-colors">
                      <ImageIcon className="w-6 h-6 text-neutral-300 mb-1" />
                      <span className="text-xs text-neutral-500">Clique para enviar</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => setForm(prev => ({ ...prev, [key]: reader.result as string }));
                          reader.readAsDataURL(file);
                        }}
                        data-testid={`input-${key}`}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-vehicle-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-vehicle">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

function calcAverage(fuelings: VehicleFueling[], vehicleId: number): string {
  const vf = fuelings.filter((f) => f.vehicleId === vehicleId).sort((a, b) => a.km - b.km);
  if (vf.length < 2) return "-";
  const totalKm = vf[vf.length - 1].km - vf[0].km;
  const totalLiters = vf.slice(1).reduce((sum, f) => sum + Number(f.liters), 0);
  if (totalLiters === 0) return "-";
  return (totalKm / totalLiters).toFixed(2) + " km/l";
}

function VehicleAssignmentModal({ vehicle, open, onClose }: { vehicle: Vehicle; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }), enabled: open });
  const { data: history = [], isLoading: histLoading } = useQuery<VehicleAssignment[]>({
    queryKey: ["/api/vehicle-assignments", vehicle.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/vehicle-assignments/${vehicle.id}`);
      return res.json();
    },
    enabled: open,
  });

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [kmAtAction, setKmAtAction] = useState(String(vehicle.km || 0));
  const [notes, setNotes] = useState("");

  const latestAction = history.length > 0 ? history[0] : null;
  const isCurrentlyAssigned = latestAction?.action === "vincular";
  const currentEmployee = isCurrentlyAssigned ? employees.find(e => e.id === latestAction!.employeeId) : null;

  const assignMutation = useMutation({
    mutationFn: async (action: "vincular" | "desvincular") => {
      const empId = action === "vincular" ? parseInt(selectedEmployee) : latestAction!.employeeId;
      await apiRequest("POST", "/api/vehicle-assignments", {
        vehicleId: vehicle.id,
        employeeId: empId,
        action,
        kmAtAction: parseInt(kmAtAction) || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-assignments", vehicle.id] });
      invalidateRelatedQueries("vehicle");
      setSelectedEmployee("");
      setNotes("");
      toast({ title: "Operação registrada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeEmployees = employees.filter(e => e.status === "ativo");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Viatura {vehicle.plate} - Vinculação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCurrentlyAssigned && currentEmployee ? (
            <div className="bg-neutral-50 rounded-lg p-3 border">
              <p className="text-sm text-neutral-600 mb-2">
                Vinculado a: <strong className="text-neutral-900">{currentEmployee.name}</strong>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={kmAtAction} onChange={(e) => setKmAtAction(e.target.value)} placeholder="KM atual" data-testid="input-unlink-km" />
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo" data-testid="input-unlink-vehicle-notes" />
              </div>
              <Button variant="destructive" size="sm" className="mt-2" onClick={() => assignMutation.mutate("desvincular")} disabled={assignMutation.isPending} data-testid="button-unlink-vehicle">
                <Unlink className="w-4 h-4 mr-1" /> Desvincular
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Selecione o Agente *</label>
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-assign-vehicle-employee">
                  <option value="">Selecione...</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.matricula} - {e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={kmAtAction} onChange={(e) => setKmAtAction(e.target.value)} placeholder="KM atual" data-testid="input-link-vehicle-km" />
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" data-testid="input-link-vehicle-notes" />
              </div>
              <Button onClick={() => assignMutation.mutate("vincular")} disabled={assignMutation.isPending || !selectedEmployee} data-testid="button-link-vehicle">
                <Link2 className="w-4 h-4 mr-1" /> Vincular ao Agente
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-1">
              <History className="w-4 h-4" /> Histórico de Vinculações
            </h4>
            {histLoading ? (
              <p className="text-xs text-neutral-400 text-center py-4">Carregando...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhum registro</p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-vehicle-history-${h.id}`}>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${h.action === "vincular" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                        {h.action === "vincular" ? "VINCULADO" : "DESVINCULADO"}
                      </span>
                      <span className="text-xs text-neutral-600 ml-2">
                        {employees.find(e => e.id === h.employeeId)?.name || `ID ${h.employeeId}`}
                      </span>
                      {h.kmAtAction && <span className="text-xs text-neutral-400 ml-2">{h.kmAtAction.toLocaleString()} km</span>}
                      {h.notes && <span className="text-xs text-neutral-400 ml-1">- {h.notes}</span>}
                    </div>
                    <span className="text-xs text-neutral-500 shrink-0">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString("pt-BR") + " " + new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Vehicle | undefined>();
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: fuelings = [] } = useQuery<VehicleFueling[]>({ queryKey: ["/api/fueling"], queryFn: getQueryFn({ on401: "throw" }) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vId = params.get("id");
    if (vId && vehicles.length > 0 && !editItem) {
      const found = vehicles.find((v) => v.id === Number(vId));
      if (found) {
        setEditItem(found);
        setShowForm(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [vehicles]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/vehicles/${id}`); },
    onSuccess: () => { invalidateRelatedQueries("vehicle"); toast({ title: "Veículo removido" }); },
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-vehicles-title">Veículos</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestão da frota</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-vehicle">
          <Plus className="w-4 h-4 mr-2" /> Novo Veículo
        </Button>
      </div>

      {showForm && <VehicleForm vehicle={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {assignVehicle && (
        <VehicleAssignmentModal vehicle={assignVehicle} open={!!assignVehicle} onClose={() => setAssignVehicle(null)} />
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (vehicles || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum veículo cadastrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-vehicles">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Placa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Veículo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">KM Atual</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">KM Inicial</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">KM Rodados</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Média</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(vehicles || []).map((v) => {
                  const lastOilKm = (v as any).lastOilChangeKm || 0;
                  const kmRodados = (v.km || 0) - lastOilKm;
                  const needsMaint = kmRodados >= 9000;
                  return (
                  <tr key={v.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${needsMaint ? "bg-red-50/50" : ""}`} data-testid={`row-vehicle-${v.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{v.plate}</td>
                    <td className="p-3 text-neutral-600">{v.brand} {v.model} {v.year}</td>
                    <td className="p-3 text-neutral-600 font-semibold">{v.km?.toLocaleString() || "0"}</td>
                    <td className="p-3 text-neutral-400 text-sm">{(v as any).initialKm?.toLocaleString() || "0"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${needsMaint ? "text-red-600" : kmRodados >= 7500 ? "text-amber-600" : "text-neutral-700"}`}>
                          {kmRodados.toLocaleString()}
                        </span>
                        {needsMaint && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold uppercase animate-pulse" data-testid={`badge-maintenance-${v.id}`}>
                            MANUTENÇÃO
                          </span>
                        )}
                        {!needsMaint && kmRodados >= 7500 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500 text-white font-bold uppercase" data-testid={`badge-attention-${v.id}`}>
                            ATENÇÃO
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-1">
                        <div className={`h-1.5 rounded-full transition-all ${needsMaint ? "bg-red-500" : kmRodados >= 7500 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min((kmRodados / 9000) * 100, 100)}%` }} />
                      </div>
                    </td>
                    <td className="p-3 text-neutral-600">
                      <span className="flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5" />
                        {calcAverage(fuelings || [], v.id)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                        v.status === "disponível" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        v.status === "em_uso" ? "bg-neutral-900 text-white" :
                        v.status === "manutenção" ? "bg-red-50 text-red-700 border border-red-200" :
                        "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }`}>{v.status === "em_uso" ? "EM USO" : v.status === "disponível" ? "DISPONÍVEL" : v.status === "manutenção" ? "MANUTENÇÃO" : v.status}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setAssignVehicle(v)} title="Vincular/Desvincular Agente" data-testid={`button-assign-vehicle-${v.id}`}>
                          <Link2 className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(v); setShowForm(true); }} data-testid={`button-edit-vehicle-${v.id}`}><Pencil className="w-4 h-4" /></Button>
                        {isDiretoria && <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Excluir permanentemente ${v.plate}?`)) deleteMutation.mutate(v.id); }} data-testid={`button-delete-vehicle-${v.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
