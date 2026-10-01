import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, getQueryFn, invalidateRelatedQueries, queryClient } from "@/lib/queryClient";
import { titleCase, formatDateBRT } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type OsRow = {
  id: number;
  osNumber: string;
  status: string;
  missionStatus?: string | null;
  priority?: string | null;
  clientId?: number | null;
  vehicleId?: number | null;
  assignedEmployeeId?: number | null;
  assignedEmployee2Id?: number | null;
  kitId?: number | null;
  origin?: string | null;
  destination?: string | null;
  scheduledDate?: string | null;
};

type Emp = { id: number; name: string; role?: string | null; status?: string | null; matricula?: string | null };
type Veh = { id: number; plate: string; brand?: string | null; model?: string | null; status?: string | null };
type Kit = { id: number; name: string; description?: string | null; status?: string | null; items?: unknown[] };
type Client = { id: number; name: string };

const FECHADA = new Set(["concluida", "concluída", "cancelada", "recusada"]);

function osDisponivel(os: OsRow) {
  const status = String(os.status || "").toLowerCase();
  if (FECHADA.has(status)) return false;
  if (os.missionStatus === "encerrada") return false;
  return status === "aberta" || status === "agendada" || status === "em_andamento";
}

function parseApiError(err: unknown): { message: string; code?: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const json = JSON.parse(body);
    return { message: json.message || body, code: json.code };
  } catch {
    return { message: body || "Não foi possível vincular a OS." };
  }
}

export type VinculoInicial = {
  vehicleId: number;
  agent1?: number | null;
  agent2?: number | null;
  kitId?: number | null;
};

export function VincularOsButton({ inicial, compact, testId }: {
  inicial?: VinculoInicial | null;
  compact?: boolean;
  testId?: string;
} = {}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const daViatura = useRef(false);
  const kitSugerido = useRef(false);
  const [busca, setBusca] = useState("");
  const [osId, setOsId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [agent1, setAgent1] = useState<number | null>(null);
  const [agent2, setAgent2] = useState<number | null>(null);
  const [kitId, setKitId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [forceNeeded, setForceNeeded] = useState<string | null>(null);

  const enabled = open;
  const { data: orders = [], isLoading: loadingOs } = useQuery<OsRow[]>({
    queryKey: ["/api/service-orders"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
  });
  const { data: employees = [] } = useQuery<Emp[]>({
    queryKey: ["/api/employees"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
  });
  const { data: vehicles = [] } = useQuery<Veh[]>({
    queryKey: ["/api/vehicles"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
  });
  const { data: kits = [] } = useQuery<Kit[]>({
    queryKey: ["/api/weapon-kits"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
  });
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
  });

  const disponiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const clientName = (id?: number | null) => clients.find(c => c.id === id)?.name || "";
    return orders
      .filter(osDisponivel)
      .filter(os => {
        if (!q) return true;
        const blob = [os.osNumber, os.origin, os.destination, os.status, clientName(os.clientId)].join(" ").toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => {
        const falta = (os: OsRow) => (!os.vehicleId || !os.assignedEmployeeId ? 0 : 1);
        if (falta(a) !== falta(b)) return falta(a) - falta(b);
        const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
        const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
        return db - da;
      });
  }, [orders, busca, clients]);

  const vigilantes = useMemo(() => {
    const ativos = employees.filter(e => e.status !== "inativo");
    const daEscolta = ativos.filter(e => /vigilante|escolta/i.test(e.role || ""));
    const base = daEscolta.length > 0 ? daEscolta : ativos;
    const extras = [agent1, agent2]
      .filter((id): id is number => !!id && !base.some(e => e.id === id))
      .map(id => employees.find(e => e.id === id))
      .filter((e): e is Emp => !!e);
    return [...base, ...extras].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [employees, agent1, agent2]);

  const viaturas = useMemo(
    () => [...vehicles].sort((a, b) => a.plate.localeCompare(b.plate, "pt-BR")),
    [vehicles],
  );

  useEffect(() => {
    if (!osId || daViatura.current) return;
    const os = orders.find(o => Number(o.id) === Number(osId));
    if (!os) return;
    const row = os as OsRow & { vehicle_id?: number | null; assigned_employee_id?: number | null; assigned_employee_2_id?: number | null; kit_id?: number | null };
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    setVehicleId(num(row.vehicleId ?? row.vehicle_id));
    setAgent1(num(row.assignedEmployeeId ?? row.assigned_employee_id));
    setAgent2(num(row.assignedEmployee2Id ?? row.assigned_employee_2_id));
    setKitId(num(row.kitId ?? row.kit_id));
    setForceNeeded(null);
  }, [osId, orders]);

  useEffect(() => {
    if (!open || !daViatura.current || kitSugerido.current || kitId || !vehicleId || kits.length === 0) return;
    const plate = vehicles.find(v => v.id === vehicleId)?.plate?.toUpperCase().trim();
    const matched = plate ? kits.find(k => (k.description || "").toUpperCase().includes(plate)) : null;
    kitSugerido.current = true;
    if (matched) setKitId(matched.id);
  }, [open, vehicleId, kitId, kits, vehicles]);

  const abrir = () => {
    if (inicial?.vehicleId) {
      daViatura.current = true;
      kitSugerido.current = !!inicial.kitId;
      setOsId(null);
      setVehicleId(inicial.vehicleId);
      setAgent1(inicial.agent1 ?? null);
      setAgent2(inicial.agent2 ?? null);
      setKitId(inicial.kitId ?? null);
      setForceNeeded(null);
    } else {
      daViatura.current = false;
      kitSugerido.current = false;
    }
    setOpen(true);
  };

  const aoTrocarViatura = (id: number | null) => {
    setVehicleId(id);
    const plate = vehicles.find(v => v.id === id)?.plate?.toUpperCase().trim();
    const matched = plate ? kits.find(k => (k.description || "").toUpperCase().includes(plate)) : null;
    if (matched) setKitId(matched.id);
  };

  const reset = () => {
    daViatura.current = false;
    kitSugerido.current = false;
    setBusca("");
    setOsId(null);
    setVehicleId(null);
    setAgent1(null);
    setAgent2(null);
    setKitId(null);
    setForceNeeded(null);
  };

  const salvar = async (force: boolean) => {
    if (!osId) {
      toast({ title: "Escolha a OS", variant: "destructive" });
      return;
    }
    if (!vehicleId) {
      toast({ title: "Escolha a viatura", variant: "destructive" });
      return;
    }
    if (vehicles.find(v => v.id === vehicleId)?.status === "manutenção") {
      toast({ title: "Viatura em manutenção", description: "Escolha outra viatura para vincular.", variant: "destructive" });
      return;
    }
    if (!agent1) {
      toast({ title: "Escolha o vigilante 1", variant: "destructive" });
      return;
    }
    if (agent2 && agent2 === agent1) {
      toast({ title: "Os dois vigilantes precisam ser pessoas diferentes", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/service-orders/${osId}`, {
        vehicleId,
        assignedEmployeeId: agent1,
        assignedEmployee2Id: agent2,
        kitId,
        ...(force ? { _forceReassign: true } : {}),
      });
      invalidateRelatedQueries("mission-acceptance");
      queryClient.invalidateQueries({ queryKey: ["/api/weapon-kits"] });
      toast({ title: "OS vinculada", description: "Viatura, vigilantes e kit foram gravados na OS." });
      setOpen(false);
      reset();
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.code === "REASSIGN_IN_PROGRESS") {
        setForceNeeded(parsed.message);
      } else {
        toast({ title: "Não vinculou", description: parsed.message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const selectClass = "w-full h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900";

  return (
    <>
      <Button
        size="sm"
        onClick={(e) => { e.stopPropagation(); abrir(); }}
        className={compact
          ? "h-6 px-1.5 text-[10px] font-bold uppercase tracking-wide bg-neutral-900 text-white hover:bg-neutral-700 rounded-md gap-1 shadow-none"
          : "bg-white text-neutral-900 hover:bg-neutral-100 border border-white/20 rounded-2xl gap-2 font-semibold shadow-none"}
        data-testid={testId || "button-vincular-os"}
      >
        <Link2 className={compact ? "w-3 h-3" : "w-4 h-4"} />
        Vincular OS
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular OS</DialogTitle>
            <DialogDescription>
              {daViatura.current
                ? "A viatura, os vigilantes e o kit desta linha já entram preenchidos. Escolha a OS disponível para gravar."
                : "Escolha a OS disponível e grave a viatura, os dois vigilantes e o kit nela."}
            </DialogDescription>
          </DialogHeader>

          {loadingOs ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Buscar OS</label>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Número, cliente ou rota"
                  className={`${selectClass} mt-1`}
                  data-testid="input-vincular-os-busca"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">OS disponível</label>
                <select
                  value={osId ? String(osId) : ""}
                  onChange={(e) => setOsId(e.target.value ? Number(e.target.value) : null)}
                  className={`${selectClass} mt-1`}
                  data-testid="select-vincular-os"
                >
                  <option value="">{disponiveis.length ? "Selecione..." : "Nenhuma OS disponível"}</option>
                  {disponiveis.map(os => {
                    const cliente = clients.find(c => c.id === os.clientId)?.name;
                    const rota = [os.origin, os.destination].filter(Boolean).join(" → ");
                    const quando = os.scheduledDate ? formatDateBRT(os.scheduledDate) : "";
                    return (
                      <option key={os.id} value={String(os.id)}>
                        {os.osNumber} · {cliente || os.status}{rota ? ` · ${rota}` : ""}{quando ? ` · ${quando}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Viatura</label>
                <select
                  value={vehicleId ? String(vehicleId) : ""}
                  onChange={(e) => aoTrocarViatura(e.target.value ? Number(e.target.value) : null)}
                  className={`${selectClass} mt-1`}
                  data-testid="select-vincular-viatura"
                >
                  <option value="">Selecione...</option>
                  {viaturas.map(v => (
                    <option key={v.id} value={String(v.id)} disabled={v.status === "manutenção"}>
                      {v.plate} — {v.model || v.brand || "viatura"}{v.status === "manutenção" ? " · em manutenção" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Vigilante 1</label>
                  <select
                    value={agent1 ? String(agent1) : ""}
                    onChange={(e) => setAgent1(e.target.value ? Number(e.target.value) : null)}
                    className={`${selectClass} mt-1`}
                    data-testid="select-vincular-agente-1"
                  >
                    <option value="">Selecione...</option>
                    {vigilantes.map(e => (
                      <option key={e.id} value={String(e.id)}>{titleCase(e.name)}{e.matricula ? ` · ${e.matricula}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Vigilante 2</label>
                  <select
                    value={agent2 ? String(agent2) : ""}
                    onChange={(e) => setAgent2(e.target.value ? Number(e.target.value) : null)}
                    className={`${selectClass} mt-1`}
                    data-testid="select-vincular-agente-2"
                  >
                    <option value="">Selecione...</option>
                    {vigilantes.map(e => (
                      <option key={`a2-${e.id}`} value={String(e.id)}>{titleCase(e.name)}{e.matricula ? ` · ${e.matricula}` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Kit de armamento</label>
                <select
                  value={kitId ? String(kitId) : ""}
                  onChange={(e) => setKitId(e.target.value ? Number(e.target.value) : null)}
                  className={`${selectClass} mt-1`}
                  data-testid="select-vincular-kit"
                >
                  <option value="">Sem kit</option>
                  {kits.map(k => (
                    <option key={k.id} value={String(k.id)}>
                      {k.name}{k.items?.length ? ` (${k.items.length} armas)` : ""}{k.status === "em_uso" ? " · em uso" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {forceNeeded && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3" data-testid="text-vincular-reassign">
                  {forceNeeded}
                </p>
              )}

              <Button
                onClick={() => salvar(!!forceNeeded)}
                disabled={saving || !osId}
                className="w-full h-12 rounded-xl font-bold uppercase tracking-wider"
                data-testid="button-confirmar-vinculo-os"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : forceNeeded ? "Confirmar troca da equipe" : "Vincular na OS"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
