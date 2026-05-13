import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { authFetch, queryClient, apiRequest } from "@/lib/queryClient";
import { Clock, Plus, Pencil, Trash2, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Users, ListChecks, FileSpreadsheet, ScanFace, KeyRound, Activity, Loader2, Coffee, Stethoscope, CalendarX, CalendarDays, Save, X, Gauge, AlertTriangle, UserX, Hourglass, PlayCircle, MinusCircle, Printer, Eye, DollarSign, TrendingUp, FileText, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import type { Employee } from "@shared/schema";

type Device = {
  id: number; nome: string; tipo: string; base_url: string; login: string; ativo: boolean; notas: string | null;
  last_sync_at: string | null; last_sync_status: string | null; last_sync_message: string | null;
};
type Mapping = {
  id: number; device_id: number; employee_id: number; control_id_user_id: string;
  control_id_user_name: string | null; matricula: string | null; ativo: boolean;
};
type Punch = {
  id: number; device_id: number; control_id_user_id: string; employee_id: number | null;
  punch_at: string; direction: string | null; source: string | null;
};
type EspelhoRhidData = {
  company: { name: string; cnpj: string; cei: string; endereco: string };
  employee: { id: number; name: string; matricula: string; cpf: string; pis: string; role: string; admissao: string; centroCusto: string; departamento: string };
  periodo: { from: string; to: string };
  days: Array<{
    date: string; label: string; weekday: string;
    marcacoes: string[];
    jornada: { ent1: string; sai1: string; ent2: string; sai2: string; ent3: string; sai3: string };
    duracao: string; ch: string;
    tratamentos: Array<{ horario: string; ocorr: string; motivo: string }>;
  }>;
  totalHHMM: string;
  horariosContratuais: Array<{ codigo: string; ent1: string; sai1: string; ent2: string; sai2: string }>;
  emitidoEm: string;
};
type FolhaPunch = { id: number; punchAt: string; time: string; direction: string | null; source: string | null };
type FolhaDay = {
  date: string; clockIn: string | null; lunchOut: string | null; lunchIn: string | null;
  clockOut: string | null; totalPunches: number; sources: string[]; hoursWorked?: string;
  punches?: FolhaPunch[];
  extraMin?: number; jornadaDiariaMin?: number;
};
type FolhaStats = {
  hoursWorked: number; hoursLimit: number; horaExtra: number; horasRestantes: number; percentUsed: number;
  daysWorked: number; baseSalary: number; valorHora: number; valorHoraExtra: number;
  custoBase: number; custoExtra: number; custoTotalEstimado: number; encargosPct: number; custoComEncargos: number;
  hasSalary: boolean;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ControlIdPage() {
  const [tab, setTab] = useState("painel");
  return (
    <AdminLayout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <ScanFace className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-neutral-900" data-testid="text-page-title">Ponto Eletrônico — Control iD</h1>
            <p className="text-xs text-neutral-500">Integração com aparelhos iDFace / iDFace MAX via Control iD Cloud. Batidas puxadas a cada 5 minutos automaticamente.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-neutral-100">
            <TabsTrigger value="aparelhos" data-testid="tab-aparelhos"><KeyRound className="w-3.5 h-3.5 mr-1" /> Aparelhos</TabsTrigger>
            <TabsTrigger value="mapping" data-testid="tab-mapping"><Users className="w-3.5 h-3.5 mr-1" /> Mapping Funcionários</TabsTrigger>
            <TabsTrigger value="batidas" data-testid="tab-batidas"><ListChecks className="w-3.5 h-3.5 mr-1" /> Batidas</TabsTrigger>
            <TabsTrigger value="folgas" data-testid="tab-folgas"><CalendarDays className="w-3.5 h-3.5 mr-1" /> Folgas/Faltas</TabsTrigger>
            <TabsTrigger value="painel" data-testid="tab-painel"><Gauge className="w-3.5 h-3.5 mr-1" /> Painel do Mês</TabsTrigger>
            <TabsTrigger value="folha" data-testid="tab-folha"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Folha de Ponto</TabsTrigger>
          </TabsList>
          <TabsContent value="aparelhos" className="mt-4"><DevicesTab /></TabsContent>
          <TabsContent value="mapping" className="mt-4"><MappingTab /></TabsContent>
          <TabsContent value="batidas" className="mt-4"><PunchesTab /></TabsContent>
          <TabsContent value="folgas" className="mt-4"><AbsencesTab /></TabsContent>
          <TabsContent value="painel" className="mt-4"><PainelMesTab /></TabsContent>
          <TabsContent value="folha" className="mt-4"><FolhaTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ═════════════════════ APARELHOS ═════════════════════
type SyncProgress = {
  rhidTotal: number; localTotal: number; missing: number; percent: number;
  rhidEmployees: number; mappedEmployees: number; unmappedEmployees: number;
  lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncMessage: string | null;
  isRunning: boolean; rhidLastPunchAt: string | null; localLastPunchAt: string | null;
};

function SyncProgressBar({ deviceId }: { deviceId: number }) {
  const { data, isLoading } = useQuery<SyncProgress>({
    queryKey: ["/api/control-id/devices", deviceId, "sync-progress"],
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return <div className="mt-3 text-xs text-neutral-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Calculando progresso...</div>;
  }

  const isComplete = data.percent >= 100 && data.missing === 0;
  const barColor = isComplete ? "bg-emerald-500" : data.percent >= 80 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="mt-3 p-2.5 rounded-md bg-neutral-50 border border-neutral-200" data-testid={`progress-device-${deviceId}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
          {isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${data.isRunning ? "animate-spin" : ""}`} />}
          <span data-testid={`text-sync-status-${deviceId}`}>
            {isComplete ? "Sincronizado" : `Sincronizando — faltam ${data.missing.toLocaleString("pt-BR")} batidas`}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-neutral-700" data-testid={`text-sync-percent-${deviceId}`}>{data.percent}%</span>
      </div>
      <Progress value={data.percent} className="h-1.5" indicatorClassName={barColor} />
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-neutral-600">
        <div><span className="text-neutral-400">RHID:</span> <strong className="font-mono" data-testid={`text-rhid-total-${deviceId}`}>{data.rhidTotal.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-neutral-400">Local:</span> <strong className="font-mono" data-testid={`text-local-total-${deviceId}`}>{data.localTotal.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-neutral-400">Func. mapeados:</span> <strong className="font-mono">{data.mappedEmployees}/{data.rhidEmployees}</strong></div>
        <div><span className="text-neutral-400">Atualiza a cada:</span> <strong className="text-emerald-600">1 min</strong></div>
      </div>
      {data.unmappedEmployees > 0 && (
        <p className="mt-1.5 text-[10px] text-amber-700 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {data.unmappedEmployees} funcionário(s) do RHID ainda sem mapeamento — use a aba <strong>Mapping</strong>.
        </p>
      )}
    </div>
  );
}

function DevicesTab() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<Device & { password?: string }> | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [backfillingId, setBackfillingId] = useState<number | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["/api/control-id/devices"],
    refetchInterval: 30000,
  });

  const saveMutation = useMutation({
    mutationFn: async (d: any) => {
      const body = { nome: d.nome, tipo: d.tipo || "idface_cloud", baseUrl: d.base_url, login: d.login, ativo: d.ativo !== false, notas: d.notas || null, ...(d.password ? { password: d.password } : {}) };
      if (d.id) return apiRequest("PATCH", `/api/control-id/devices/${d.id}`, body);
      if (!d.password) throw new Error("Senha obrigatória ao criar");
      return apiRequest("POST", "/api/control-id/devices", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/devices"] });
      setEditing(null);
      toast({ title: "Aparelho salvo!" });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/control-id/devices/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/control-id/devices"] }); toast({ title: "Removido" }); },
  });

  async function testConnection(id: number) {
    setTestingId(id);
    try {
      const r = await authFetch(`/api/control-id/devices/${id}/test`, { method: "POST" });
      const d = await r.json();
      toast({
        title: d.ok ? "✅ Conexão OK" : "❌ Falha na conexão",
        description: d.message,
        variant: d.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setTestingId(null); }
  }

  async function syncDevice(id: number) {
    setSyncingId(id);
    try {
      const r = await authFetch(`/api/control-id/devices/${id}/sync`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Sincronização concluída", description: `${d.fetched || 0} batida(s) buscada(s), ${d.saved || 0} nova(s), ${d.mapped || 0} mapeada(s)` });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally { setSyncingId(null); }
  }

  async function backfillDevice(id: number) {
    if (!confirm("Backfill total: vai buscar TODO o histórico de batidas (pode levar minutos e baixar milhares de registros). Confirma?")) return;
    setBackfillingId(id);
    try {
      const r = await authFetch(`/api/control-id/devices/${id}/backfill`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Backfill concluído", description: `${d.fetched || 0} batida(s) buscada(s), ${d.saved || 0} nova(s), ${d.skipped || 0} duplicada(s)` });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro no backfill", description: e.message, variant: "destructive" });
    } finally { setBackfillingId(null); }
  }

  async function autoImport(id: number) {
    setImportingId(id);
    try {
      const r = await authFetch(`/api/control-id/devices/${id}/auto-import`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      const unmatchedNames = (d.unmatched || []).map((u: any) => u.rhidName).join(", ");
      toast({
        title: "Auto-importação concluída",
        description: `${d.created} mapeamento(s) criado(s) automaticamente. ${d.unmatched?.length || 0} não casaram (mapeie manualmente): ${unmatchedNames || "—"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    } finally { setImportingId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-neutral-500">Cadastre aqui os aparelhos Control iD. As credenciais são criptografadas (AES-256-GCM) antes de salvar.</p>
        <Button size="sm" onClick={() => setEditing({ tipo: "idface_cloud", base_url: "https://api.controlid.com.br", ativo: true })} data-testid="button-new-device">
          <Plus className="w-4 h-4 mr-1" /> Novo Aparelho
        </Button>
      </div>

      {isLoading ? <p className="text-center text-sm text-neutral-400 py-8">Carregando...</p> :
        devices.length === 0 ? (
          <Card className="p-8 text-center text-sm text-neutral-500">
            <ScanFace className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
            <p className="font-bold mb-1">Nenhum aparelho cadastrado.</p>
            <p className="text-xs">Adicione o iDFace MAX preenchendo a URL da Control iD Cloud, login e senha.</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {devices.map(d => (
              <Card key={d.id} className="p-4" data-testid={`card-device-${d.id}`}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      {d.ativo ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-neutral-400" />}
                      <h3 className="font-bold text-neutral-900">{d.nome}</h3>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-600">{{ idface_cloud: "iDFace Cloud", idface_lan: "iDFace LAN", rep_c: "REP-C", idclass: "iDClass", rhid_cloud: "RHID Cloud" }[d.tipo as string] || d.tipo}</span>
                    </div>
                    <p className="text-xs text-neutral-500 font-mono">{d.base_url}</p>
                    <p className="text-xs text-neutral-500">Login: {d.login}</p>
                    {d.last_sync_at && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className={d.last_sync_status === "ok" ? "text-emerald-600" : "text-red-600"}>
                          {d.last_sync_status === "ok" ? <CheckCircle2 className="w-3 h-3 inline" /> : <AlertCircle className="w-3 h-3 inline" />}
                          {" "}última sync: {formatDateTime(d.last_sync_at)}
                        </span>
                        {d.last_sync_message && <span className="text-neutral-400">— {d.last_sync_message}</span>}
                      </div>
                    )}
                    <SyncProgressBar deviceId={d.id} />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={testingId === d.id} onClick={() => testConnection(d.id)} data-testid={`button-test-${d.id}`}>
                      {testingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1" />} Testar
                    </Button>
                    <Button variant="outline" size="sm" disabled={syncingId === d.id} onClick={() => syncDevice(d.id)} data-testid={`button-sync-${d.id}`}>
                      {syncingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Sync
                    </Button>
                    <Button variant="outline" size="sm" disabled={backfillingId === d.id} onClick={() => backfillDevice(d.id)} data-testid={`button-backfill-${d.id}`} title="Importar TODO o histórico de batidas (uma vez)">
                      {backfillingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />} Backfill
                    </Button>
                    <Button variant="outline" size="sm" disabled={importingId === d.id} onClick={() => autoImport(d.id)} data-testid={`button-import-${d.id}`} title="Importar funcionários do aparelho e auto-mapear por nome">
                      {importingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5 mr-1" />} Importar Funcionários
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...d, password: "" })} data-testid={`button-edit-${d.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => { if (confirm(`Remover "${d.nome}"?`)) deleteMutation.mutate(d.id); }} data-testid={`button-delete-${d.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar Aparelho" : "Novo Aparelho Control iD"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Nome do Aparelho *</label>
                <Input value={editing.nome || ""} onChange={e => setEditing({ ...editing, nome: e.target.value })} placeholder="Ex: iDFace Sede" data-testid="input-nome" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Tipo</label>
                <Select value={editing.tipo || "idface_cloud"} onValueChange={v => setEditing({ ...editing, tipo: v })}>
                  <SelectTrigger data-testid="select-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="idface_cloud">iDFace via Cloud</SelectItem>
                    <SelectItem value="idface_lan">iDFace na rede local (LAN)</SelectItem>
                    <SelectItem value="rep_c">REP-C (Portaria 671)</SelectItem>
                    <SelectItem value="idclass">iDClass / iDAccess</SelectItem>
                    <SelectItem value="rhid_cloud">RHID Cloud (ControlID)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Base URL da API *</label>
                <Input value={editing.base_url || ""} onChange={e => setEditing({ ...editing, base_url: e.target.value })} placeholder="https://api.controlid.com.br" data-testid="input-baseurl" />
                <p className="text-[10px] text-neutral-400 mt-1">URL fornecida pela Control iD para sua conta cloud (ou IP do aparelho na LAN).</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1 block">Login *</label>
                  <Input value={editing.login || ""} onChange={e => setEditing({ ...editing, login: e.target.value })} data-testid="input-login" />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1 block">Senha {editing.id ? "(deixe em branco p/ manter)" : "*"}</label>
                  <Input type="password" value={editing.password || ""} onChange={e => setEditing({ ...editing, password: e.target.value })} data-testid="input-password" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.ativo !== false} onCheckedChange={v => setEditing({ ...editing, ativo: v })} data-testid="switch-ativo" />
                <span className="text-xs">Ativo (sincroniza a cada 1 min)</span>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Notas</label>
                <Input value={editing.notas || ""} onChange={e => setEditing({ ...editing, notas: e.target.value })} data-testid="input-notas" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate(editing)} disabled={saveMutation.isPending || !editing?.nome || !editing?.base_url || !editing?.login || (!editing?.id && !editing?.password)} data-testid="button-save">
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════ MAPPING ═════════════════════
function MappingTab() {
  const { toast } = useToast();
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/control-id/devices"] });
  const [deviceId, setDeviceId] = useState<number | null>(null);
  useEffect(() => { if (!deviceId && devices.length > 0) setDeviceId(devices[0].id); }, [devices, deviceId]);

  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: mappings = [] } = useQuery<Mapping[]>({
    queryKey: ["/api/control-id/mappings", deviceId],
    queryFn: async () => { const r = await authFetch(`/api/control-id/mappings?deviceId=${deviceId}`); return r.json(); },
    enabled: !!deviceId,
  });
  const { data: deviceUsers = [], refetch: refetchDeviceUsers, isFetching: loadingUsers } = useQuery<Array<{ id: string; name: string; matricula?: string }>>({
    queryKey: ["/api/control-id/devices", deviceId, "users"],
    queryFn: async () => {
      const r = await authFetch(`/api/control-id/devices/${deviceId}/users`);
      const j = await r.json().catch(() => []);
      return Array.isArray(j) ? j : [];
    },
    enabled: false,
  });

  const [editing, setEditing] = useState<Partial<Mapping> | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (m: any) => {
      const body = {
        deviceId: m.device_id || deviceId,
        employeeId: m.employee_id,
        controlIdUserId: m.control_id_user_id,
        controlIdUserName: m.control_id_user_name || null,
        matricula: m.matricula || null,
        ativo: m.ativo !== false,
      };
      if (m.id) return apiRequest("PATCH", `/api/control-id/mappings/${m.id}`, body);
      return apiRequest("POST", "/api/control-id/mappings", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/mappings", deviceId] });
      setEditing(null); toast({ title: "Mapping salvo!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/control-id/mappings/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/control-id/mappings", deviceId] }); toast({ title: "Removido" }); },
  });

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const mappedUserIds = new Set(mappings.map(m => m.control_id_user_id));
  const unmappedDeviceUsers = deviceUsers.filter(u => !mappedUserIds.has(u.id));

  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-neutral-700">Aparelho:</span>
        <Select value={String(deviceId || "")} onValueChange={v => setDeviceId(Number(v))}>
          <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-device"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {devices.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetchDeviceUsers()} disabled={!deviceId || loadingUsers} data-testid="button-load-device-users">
          {loadingUsers ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          Buscar usuários do aparelho
        </Button>
        <Button size="sm" onClick={() => setEditing({ device_id: deviceId!, ativo: true })} disabled={!deviceId} data-testid="button-new-mapping">
          <Plus className="w-4 h-4 mr-1" /> Novo Mapping
        </Button>
      </Card>

      {unmappedDeviceUsers.length > 0 && (
        <Card className="p-3 bg-amber-50 border-amber-200">
          <p className="text-xs font-bold text-amber-800 mb-2">{unmappedDeviceUsers.length} usuário(s) cadastrado(s) no aparelho ainda sem mapping:</p>
          <div className="flex gap-2 flex-wrap">
            {unmappedDeviceUsers.slice(0, 20).map(u => (
              <button key={u.id} className="text-xs bg-white border border-amber-300 px-2 py-1 rounded hover:bg-amber-100"
                onClick={() => setEditing({ device_id: deviceId!, control_id_user_id: u.id, control_id_user_name: u.name, matricula: u.matricula, ativo: true })}
                data-testid={`button-quick-map-${u.id}`}>
                #{u.id} {u.name || "(s/ nome)"}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm" data-testid="table-mappings">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="p-2 text-left font-medium text-neutral-600">Funcionário (ERP)</th>
              <th className="p-2 text-left font-medium text-neutral-600">ID no Aparelho</th>
              <th className="p-2 text-left font-medium text-neutral-600">Nome no Aparelho</th>
              <th className="p-2 text-left font-medium text-neutral-600">Matrícula</th>
              <th className="p-2 text-center font-medium text-neutral-600">Ativo</th>
              <th className="p-2 text-center font-medium text-neutral-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-neutral-400">Nenhum mapping cadastrado para esse aparelho ainda.</td></tr>
            ) : mappings.map(m => (
              <tr key={m.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-mapping-${m.id}`}>
                <td className="p-2 font-medium">{empMap.get(m.employee_id)?.name || `#${m.employee_id}`}</td>
                <td className="p-2 font-mono text-xs">{m.control_id_user_id}</td>
                <td className="p-2 text-neutral-600">{m.control_id_user_name || "-"}</td>
                <td className="p-2 text-neutral-600">{m.matricula || "-"}</td>
                <td className="p-2 text-center">{m.ativo ? <span className="text-emerald-600">●</span> : <span className="text-neutral-300">○</span>}</td>
                <td className="p-2 text-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(m)} data-testid={`button-edit-mapping-${m.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { if (confirm("Remover mapping?")) deleteMutation.mutate(m.id); }} data-testid={`button-delete-mapping-${m.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar Mapping" : "Novo Mapping Funcionário ↔ Aparelho"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Funcionário (ERP) *</label>
                <Select value={String(editing.employee_id || "")} onValueChange={v => setEditing({ ...editing, employee_id: Number(v) })}>
                  <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">ID do usuário no aparelho *</label>
                <Input value={editing.control_id_user_id || ""} onChange={e => setEditing({ ...editing, control_id_user_id: e.target.value })} placeholder="Ex: 42" data-testid="input-cid-userid" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Nome no aparelho</label>
                <Input value={editing.control_id_user_name || ""} onChange={e => setEditing({ ...editing, control_id_user_name: e.target.value })} data-testid="input-cid-username" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Matrícula (PIS)</label>
                <Input value={editing.matricula || ""} onChange={e => setEditing({ ...editing, matricula: e.target.value })} data-testid="input-matricula" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.ativo !== false} onCheckedChange={v => setEditing({ ...editing, ativo: v })} data-testid="switch-mapping-ativo" />
                <span className="text-xs">Ativo</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate(editing)} disabled={saveMutation.isPending || !editing?.employee_id || !editing?.control_id_user_id} data-testid="button-save-mapping">
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════ BATIDAS ═════════════════════
function PunchesTab() {
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const [employeeId, setEmployeeId] = useState<string>("__all__");
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data: punches = [], isLoading } = useQuery<Punch[]>({
    queryKey: ["/api/control-id/punches", employeeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId && employeeId !== "__all__") params.set("employeeId", employeeId);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) { const d = new Date(to); d.setHours(23, 59, 59); params.set("to", d.toISOString()); }
      params.set("limit", "300");
      const r = await authFetch(`/api/control-id/punches?${params.toString()}`);
      return r.json();
    },
    refetchInterval: 30000,
  });

  const [editingPunch, setEditingPunch] = useState<Punch | null>(null);
  const [editPunchAt, setEditPunchAt] = useState("");
  const [editDirection, setEditDirection] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualEmpId, setManualEmpId] = useState("");
  const [manualWhen, setManualWhen] = useState(new Date().toISOString().slice(0, 16));
  const [manualDir, setManualDir] = useState("in");

  function startEdit(p: Punch) {
    setEditingPunch(p);
    const d = new Date(p.punch_at);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditPunchAt(local);
    setEditDirection(p.direction || "unknown");
  }

  async function saveEdit() {
    if (!editingPunch) return;
    try {
      const r = await authFetch(`/api/control-id/punches/${editingPunch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punchAt: new Date(editPunchAt).toISOString(), direction: editDirection }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Batida atualizada", description: d.rhidSynced ? "Sincronizado com o RHID." : (d.rhidError || "Salvo apenas localmente.") });
      setEditingPunch(null);
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function deletePunch(p: Punch) {
    if (!confirm(`Excluir esta batida (${formatDateTime(p.punch_at)})? Será removida do nosso sistema (no RHID continua).`)) return;
    try {
      const r = await authFetch(`/api/control-id/punches/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: "Batida excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function createManual() {
    if (!manualEmpId || !manualWhen) { toast({ title: "Preencha funcionário e data/hora", variant: "destructive" }); return; }
    try {
      const r = await authFetch("/api/control-id/manual-punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: Number(manualEmpId), punchAt: new Date(manualWhen).toISOString(), direction: manualDir }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Batida criada", description: d.rhidSynced ? "Enviada ao RHID com sucesso." : `Salva localmente. RHID: ${d.rhidError}` });
      setManualOpen(false);
      setManualEmpId(""); setManualWhen(new Date().toISOString().slice(0, 16));
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/punches"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="w-56 h-8 text-sm" data-testid="filter-employee"><SelectValue placeholder="Todos os funcionários" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os funcionários</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="filter-from" />
        <span className="text-xs text-neutral-500">até</span>
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="filter-to" />
        <span className="text-xs text-neutral-500">{punches.length} batida(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setManualOpen(true)} data-testid="button-manual-punch">
          <Plus className="w-3.5 h-3.5 mr-1" /> Bater Ponto
        </Button>
      </Card>

      <Card>
        {isLoading ? <p className="text-center text-sm text-neutral-400 py-8">Carregando...</p> : punches.length === 0 ? (
          <p className="text-center text-sm text-neutral-400 py-8">Nenhuma batida no período.</p>
        ) : (
          <table className="w-full text-sm" data-testid="table-punches">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="p-2 text-left font-medium text-neutral-600">Data/Hora (BRT)</th>
                <th className="p-2 text-left font-medium text-neutral-600">Funcionário</th>
                <th className="p-2 text-left font-medium text-neutral-600">ID Aparelho</th>
                <th className="p-2 text-center font-medium text-neutral-600">Direção</th>
                <th className="p-2 text-center font-medium text-neutral-600">Método</th>
                <th className="p-2 text-right font-medium text-neutral-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {punches.map(p => {
                const isEditing = editingPunch?.id === p.id;
                return (
                  <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-punch-${p.id}`}>
                    <td className="p-2 font-mono text-xs">
                      {isEditing ? (
                        <Input type="datetime-local" value={editPunchAt} onChange={e => setEditPunchAt(e.target.value)} className="h-7 text-xs w-44" data-testid={`input-edit-punchat-${p.id}`} />
                      ) : formatDateTime(p.punch_at)}
                    </td>
                    <td className="p-2 font-medium">
                      {p.employee_id ? (empMap.get(p.employee_id)?.name || `#${p.employee_id}`) : <span className="text-amber-600 text-xs">⚠ não mapeado</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">{p.control_id_user_id || "—"}</td>
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <Select value={editDirection} onValueChange={setEditDirection}>
                          <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-edit-dir-${p.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">Entrada</SelectItem>
                            <SelectItem value="out">Saída</SelectItem>
                            <SelectItem value="unknown">—</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.direction === "in" ? "bg-emerald-100 text-emerald-700" : p.direction === "out" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {p.direction === "in" ? "ENTRADA" : p.direction === "out" ? "SAÍDA" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center text-xs text-neutral-500">{p.source || "-"}</td>
                    <td className="p-2 text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={saveEdit} data-testid={`button-save-${p.id}`}><Save className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPunch(null)} data-testid={`button-cancel-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)} data-testid={`button-edit-punch-${p.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => deletePunch(p)} data-testid={`button-delete-punch-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Bater Ponto Manual</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1 block">Funcionário *</label>
              <Select value={manualEmpId} onValueChange={setManualEmpId}>
                <SelectTrigger data-testid="select-manual-emp"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1 block">Data/Hora *</label>
              <Input type="datetime-local" value={manualWhen} onChange={e => setManualWhen(e.target.value)} data-testid="input-manual-when" />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1 block">Direção</label>
              <Select value={manualDir} onValueChange={setManualDir}>
                <SelectTrigger data-testid="select-manual-dir"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada</SelectItem>
                  <SelectItem value="out">Saída</SelectItem>
                  <SelectItem value="unknown">Não informado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-neutral-500">A batida será criada no nosso sistema e enviada automaticamente ao RHID Cloud (se o funcionário estiver mapeado a um aparelho).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)} data-testid="button-manual-cancel">Cancelar</Button>
            <Button onClick={createManual} data-testid="button-manual-save">Bater Ponto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════ FOLGAS / FALTAS / ATESTADOS / FERIADOS ═════════════════════
type Absence = {
  id: number; employee_id: number; type: string;
  start_date: string; end_date: string | null;
  reason: string | null; status: string;
};

const ABSENCE_TYPES: Record<string, { label: string; color: string; icon: any }> = {
  folga: { label: "Folga", color: "bg-blue-100 text-blue-700", icon: Coffee },
  feriado: { label: "Feriado", color: "bg-purple-100 text-purple-700", icon: CalendarDays },
  atestado: { label: "Atestado Médico", color: "bg-amber-100 text-amber-700", icon: Stethoscope },
  falta: { label: "Falta", color: "bg-red-100 text-red-700", icon: CalendarX },
  ferias: { label: "Férias", color: "bg-emerald-100 text-emerald-700", icon: CalendarDays },
  licenca: { label: "Licença", color: "bg-indigo-100 text-indigo-700", icon: CalendarDays },
};

function AbsencesTab() {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const [filterEmp, setFilterEmp] = useState<string>("__all__");
  const [editing, setEditing] = useState<Partial<Absence> | null>(null);

  const { data: absences = [], isLoading } = useQuery<Absence[]>({
    queryKey: ["/api/employee-absences", filterEmp],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterEmp !== "__all__") params.set("employeeId", filterEmp);
      const r = await authFetch(`/api/employee-absences?${params.toString()}`);
      return r.json();
    },
  });

  async function save() {
    if (!editing?.employee_id || !editing?.type || !editing?.start_date) {
      toast({ title: "Preencha funcionário, tipo e data inicial", variant: "destructive" });
      return;
    }
    try {
      const url = editing.id ? `/api/employee-absences/${editing.id}` : "/api/employee-absences";
      const method = editing.id ? "PATCH" : "POST";
      const body = {
        employeeId: editing.employee_id, type: editing.type,
        startDate: editing.start_date, endDate: editing.end_date || null,
        reason: editing.reason || null, status: editing.status || "aprovado",
      };
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: editing.id ? "Atualizado" : "Lançamento criado" });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["/api/employee-absences"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: number) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      const r = await authFetch(`/api/employee-absences/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: "Excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-absences"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={filterEmp} onValueChange={setFilterEmp}>
          <SelectTrigger className="w-56 h-8 text-sm" data-testid="filter-absence-emp"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os funcionários</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-neutral-500">{absences.length} lançamento(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ type: "folga", status: "aprovado", start_date: new Date().toISOString().slice(0, 10) })} data-testid="button-new-absence">
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo Lançamento
        </Button>
      </Card>

      <Card>
        {isLoading ? <p className="text-center text-sm text-neutral-400 py-8">Carregando...</p> : absences.length === 0 ? (
          <p className="text-center text-sm text-neutral-400 py-8">Nenhum lançamento.</p>
        ) : (
          <table className="w-full text-sm" data-testid="table-absences">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="p-2 text-left font-medium text-neutral-600">Funcionário</th>
                <th className="p-2 text-left font-medium text-neutral-600">Tipo</th>
                <th className="p-2 text-left font-medium text-neutral-600">Início</th>
                <th className="p-2 text-left font-medium text-neutral-600">Fim</th>
                <th className="p-2 text-left font-medium text-neutral-600">Motivo</th>
                <th className="p-2 text-center font-medium text-neutral-600">Status</th>
                <th className="p-2 text-right font-medium text-neutral-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {absences.map(a => {
                const t = ABSENCE_TYPES[a.type] || { label: a.type, color: "bg-neutral-100 text-neutral-600", icon: CalendarDays };
                const Icon = t.icon;
                return (
                  <tr key={a.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-absence-${a.id}`}>
                    <td className="p-2 font-medium">{empMap.get(a.employee_id)?.name || `#${a.employee_id}`}</td>
                    <td className="p-2"><span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${t.color}`}><Icon className="w-3 h-3" /> {t.label.toUpperCase()}</span></td>
                    <td className="p-2 font-mono text-xs">{new Date(a.start_date).toLocaleDateString("pt-BR")}</td>
                    <td className="p-2 font-mono text-xs">{a.end_date ? new Date(a.end_date).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-2 text-xs text-neutral-600">{a.reason || "—"}</td>
                    <td className="p-2 text-center"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.status === "aprovado" ? "bg-emerald-100 text-emerald-700" : a.status === "pendente" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>{(a.status || "—").toUpperCase()}</span></td>
                    <td className="p-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ ...a, start_date: a.start_date.slice(0, 10), end_date: a.end_date?.slice(0, 10) || null })} data-testid={`button-edit-absence-${a.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remove(a.id)} data-testid={`button-delete-absence-${a.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Funcionário *</label>
                <Select value={String(editing.employee_id || "")} onValueChange={v => setEditing({ ...editing, employee_id: Number(v) })}>
                  <SelectTrigger data-testid="select-absence-emp"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Tipo *</label>
                <Select value={editing.type || "folga"} onValueChange={v => setEditing({ ...editing, type: v })}>
                  <SelectTrigger data-testid="select-absence-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ABSENCE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1 block">Data Início *</label>
                  <Input type="date" value={editing.start_date || ""} onChange={e => setEditing({ ...editing, start_date: e.target.value })} data-testid="input-absence-start" />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1 block">Data Fim</label>
                  <Input type="date" value={editing.end_date || ""} onChange={e => setEditing({ ...editing, end_date: e.target.value })} data-testid="input-absence-end" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Motivo / Observações</label>
                <Input value={editing.reason || ""} onChange={e => setEditing({ ...editing, reason: e.target.value })} placeholder="Ex: CID Z76.0, médico Dr. Silva" data-testid="input-absence-reason" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Status</label>
                <Select value={editing.status || "aprovado"} onValueChange={v => setEditing({ ...editing, status: v })}>
                  <SelectTrigger data-testid="select-absence-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="rejeitado">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="button-absence-cancel">Cancelar</Button>
            <Button onClick={save} data-testid="button-absence-save">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════ FOLHA CONSOLIDADA ═════════════════════
// ═════════════════════ PAINEL DO MÊS ═════════════════════
type PainelRow = {
  employeeId: number; name: string; role: string;
  mapped: boolean;
  hoursWorked: number; hoursLimit: number; hoursRemaining: number; percentUsed: number;
  daysWorked: number;
  todayStatus: "NAO_BATEU" | "EM_ANDAMENTO" | "EM_ABERTO" | "COMPLETO" | "AUSENCIA" | "NAO_MAPEADO" | "MES_PASSADO";
  unifiedStatus?: "NAO_BATEU" | "EM_ANDAMENTO" | "EM_ABERTO" | "COMPLETO" | "AUSENCIA" | "NAO_MAPEADO" | "MES_PASSADO" | "TRABALHANDO";
  todayPunchCount: number;
  openSinceMinutes: number | null;
  lastPunchAt: string | null;
  absenceType: string | null;
  onDutyToday?: boolean;
  dutyOsNumber?: string | null;
  dutyStatus?: string | null;
  dutyMissionStatus?: string | null;
  dutyScheduledAt?: string | null;
  partnerId?: number | null;
  partnerName?: string | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  NAO_BATEU: { label: "Não bateu", cls: "bg-red-100 text-red-700 border-red-300", Icon: UserX },
  EM_ANDAMENTO: { label: "Em andamento", cls: "bg-blue-100 text-blue-700 border-blue-300", Icon: PlayCircle },
  EM_ABERTO: { label: "Ponto em aberto", cls: "bg-amber-100 text-amber-800 border-amber-400", Icon: Hourglass },
  COMPLETO: { label: "Encerrou hoje", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", Icon: CheckCircle2 },
  TRABALHANDO: { label: "Trabalhando", cls: "bg-blue-100 text-blue-700 border-blue-400", Icon: PlayCircle },
  AUSENCIA: { label: "Ausência", cls: "bg-purple-100 text-purple-700 border-purple-300", Icon: CalendarX },
  NAO_MAPEADO: { label: "Sem mapeamento", cls: "bg-neutral-100 text-neutral-500 border-neutral-300", Icon: MinusCircle },
  MES_PASSADO: { label: "—", cls: "bg-neutral-100 text-neutral-400 border-neutral-200", Icon: MinusCircle },
};

function fmtSinceMin(min: number | null): string {
  if (min == null) return "";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function PainelMesTab() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<"TODOS" | "ALERTAS" | "NAO_BATEU" | "EM_ABERTO" | "PERTO_LIMITE">("ALERTAS");
  const [search, setSearch] = useState("");
  const { toast: painelToast } = useToast();

  // Mutation: força sync com a Control iD Cloud (puxa batidas novas do RHID)
  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/control-id/sync-all", {});
      return r.json();
    },
    onSuccess: (data: any) => {
      painelToast({
        title: "Sincronização concluída",
        description: data?.devices
          ? `${data.devices.length} aparelho(s) sincronizado(s).`
          : "Batidas atualizadas.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/painel-mes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/sync-diagnostic"] });
    },
    onError: (e: any) => {
      painelToast({ title: "Erro ao sincronizar", description: String(e?.message || e), variant: "destructive" });
    },
  });

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery<PainelRow[]>({
    queryKey: ["/api/control-id/painel-mes", month],
    queryFn: async () => {
      const r = await authFetch(`/api/control-id/painel-mes?month=${month}`);
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { data: diag } = useQuery<{
    unmappedEmployees: { id: number; name: string; role: string }[];
    orphanPunches: { controlIdUserId: string; deviceId: number; rhidName: string | null; punchCount: number; lastPunchAt: string }[];
    orphanTotal: number;
    devices: { id: number; nome: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncMessage: string | null; lastEventAt: string | null }[];
  }>({
    queryKey: ["/api/control-id/sync-diagnostic"],
    queryFn: async () => (await authFetch("/api/control-id/sync-diagnostic")).json(),
    refetchInterval: 120_000,
  });
  const [showDiag, setShowDiag] = useState(false);

  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const counts = useMemo(() => {
    const c = { naoBateu: 0, emAberto: 0, emAndamento: 0, completo: 0, ausencia: 0, naoMapeado: 0, pertoLimite: 0 };
    for (const r of rows) {
      if (r.todayStatus === "NAO_BATEU") c.naoBateu++;
      else if (r.todayStatus === "EM_ABERTO") c.emAberto++;
      else if (r.todayStatus === "EM_ANDAMENTO") c.emAndamento++;
      else if (r.todayStatus === "COMPLETO") c.completo++;
      else if (r.todayStatus === "AUSENCIA") c.ausencia++;
      else if (r.todayStatus === "NAO_MAPEADO") c.naoMapeado++;
      if (r.percentUsed >= 90) c.pertoLimite++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q) && !(r.role || "").toLowerCase().includes(q)) return false;
      if (filter === "TODOS") return true;
      if (filter === "NAO_BATEU") return r.todayStatus === "NAO_BATEU";
      if (filter === "EM_ABERTO") return r.todayStatus === "EM_ABERTO";
      if (filter === "PERTO_LIMITE") return r.percentUsed >= 90;
      if (filter === "ALERTAS") return r.todayStatus === "NAO_BATEU" || r.todayStatus === "EM_ABERTO" || r.percentUsed >= 90;
      return true;
    });
  }, [rows, filter, search]);

  // Detecta atraso RHID: última batida registrada no banco há mais de 2h
  const rhidDelayMinutes = useMemo(() => {
    if (!diag || !isCurrentMonth) return null;
    const d = diag.devices[0];
    if (!d?.lastEventAt) return null;
    return Math.round((Date.now() - new Date(d.lastEventAt).getTime()) / 60000);
  }, [diag, isCurrentMonth]);
  const rhidDelayed = rhidDelayMinutes !== null && rhidDelayMinutes > 120;

  return (
    <div className="space-y-3">
      {/* Banner de atraso RHID Cloud — aparece quando a batida mais recente tem >2h */}
      {isCurrentMonth && rhidDelayed && rhidDelayMinutes !== null && (
        <Card className="p-3 border-orange-400 bg-orange-50/60" data-testid="banner-rhid-delay">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-orange-800">RHID Cloud possivelmente atrasado</span>
              <span className="text-orange-700 ml-2 text-[12px]">
                A última batida registrada foi há{" "}
                <strong>{rhidDelayMinutes >= 60
                  ? `${Math.floor(rhidDelayMinutes / 60)}h${rhidDelayMinutes % 60 > 0 ? `${rhidDelayMinutes % 60}min` : ""}`
                  : `${rhidDelayMinutes}min`}</strong>.
                {" "}Batidas recentes do biométrico podem ainda não ter chegado ao RHID Cloud — o painel reflete apenas o que o RHID entregou. Aguarde a sincronização do dispositivo físico com a nuvem RHID.
              </span>
            </div>
          </div>
        </Card>
      )}

      {diag && (diag.unmappedEmployees.length > 0 || diag.orphanTotal > 0) && (
        <Card className="p-3 border-amber-300 bg-amber-50/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
              <AlertTriangle className="w-4 h-4" />
              Diagnóstico de sincronização Control iD
              <span className="ml-2 text-[11px] font-normal text-amber-700">
                {diag.unmappedEmployees.length} func. ativo(s) sem mapeamento
                {" · "}
                {diag.orphanTotal} batida(s) órfã(s) (7 dias)
                {" — "}
                não aparecem no painel
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowDiag(s => !s)} data-testid="button-toggle-diag">
              {showDiag ? "Ocultar" : "Detalhes"}
            </Button>
          </div>
          {showDiag && (
            <div className="grid md:grid-cols-2 gap-3 mt-3 text-xs">
              <div>
                <div className="font-semibold text-neutral-700 mb-1">Funcionários ativos sem mapeamento ({diag.unmappedEmployees.length})</div>
                {diag.unmappedEmployees.length === 0 ? (
                  <div className="text-neutral-400 italic">Nenhum — todos mapeados.</div>
                ) : (
                  <ul className="space-y-0.5 max-h-48 overflow-auto pr-1">
                    {diag.unmappedEmployees.map(e => (
                      <li key={e.id} className="flex items-center justify-between border-b border-amber-200/40 py-0.5" data-testid={`diag-unmapped-${e.id}`}>
                        <span><span className="font-medium">{e.name}</span> <span className="text-neutral-400">· {e.role}</span></span>
                        <span className="text-neutral-400 text-[10px]">#{e.id}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-[10px] text-neutral-500 mt-1">Solução: aba "Mapping Funcionários" → ligar o RHID userId ao funcionário.</div>
              </div>
              <div>
                <div className="font-semibold text-neutral-700 mb-1">Batidas órfãs no banco — RHID userIds não mapeados ({diag.orphanPunches.length})</div>
                {diag.orphanPunches.length === 0 ? (
                  <div className="text-neutral-400 italic">Nenhuma batida órfã nos últimos 7 dias.</div>
                ) : (
                  <ul className="space-y-0.5 max-h-48 overflow-auto pr-1">
                    {diag.orphanPunches.map(o => (
                      <li key={`${o.deviceId}-${o.controlIdUserId}`} className="flex items-center justify-between border-b border-amber-200/40 py-0.5" data-testid={`diag-orphan-${o.controlIdUserId}`}>
                        <span>
                          <span className="font-medium">{o.rhidName || <span className="italic text-neutral-400">sem nome no RHID</span>}</span>{" "}
                          <span className="text-neutral-400 font-mono text-[10px]">· id {o.controlIdUserId}</span>
                        </span>
                        <span className="text-neutral-500 text-[10px]">
                          <span className="font-bold text-amber-700">{o.punchCount}</span> batida(s) ·{" "}
                          {new Date(o.lastPunchAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-[10px] text-neutral-500 mt-1">Estas batidas <strong>chegaram</strong> do RHID e estão no banco, mas sem vínculo com funcionário — invisíveis no painel/folha. Crie o mapeamento e elas aparecerão automaticamente.</div>
              </div>
              {diag.devices.length > 0 && (
                <div className="md:col-span-2 border-t border-amber-200 pt-2">
                  <div className="font-semibold text-neutral-700 mb-1">Último sync por aparelho</div>
                  <ul className="grid md:grid-cols-2 gap-1">
                    {diag.devices.map(d => (
                      <li key={d.id} className="flex items-center justify-between text-[11px] border-b border-amber-200/40 py-0.5">
                        <span className="font-medium">{d.nome}</span>
                        <span className={d.lastSyncStatus === "ok" ? "text-emerald-700" : "text-red-700"}>
                          {d.lastSyncMessage || "—"}
                          {d.lastSyncAt && (
                            <span className="text-neutral-400 ml-1">
                              · {new Date(d.lastSyncAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44 h-9 text-sm" data-testid="input-painel-month" />
        <Input placeholder="Buscar funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="w-56 h-9 text-sm" data-testid="input-painel-search" />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9" data-testid="button-painel-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        <Button
          size="sm"
          onClick={() => syncNowMutation.mutate()}
          disabled={syncNowMutation.isPending}
          className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
          title="Força a leitura imediata da Control iD Cloud (RHID). Útil quando o aviso de atraso aparecer."
          data-testid="button-sync-now"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncNowMutation.isPending ? "animate-spin" : ""}`} />
          {syncNowMutation.isPending ? "Sincronizando..." : "Sincronizar Agora"}
        </Button>
        <span className="ml-auto text-[11px] text-neutral-500">{rows.length} funcionário(s) ativo(s) · atualiza a cada 60s</span>
      </Card>

      {isCurrentMonth && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <ChipStat label="Não bateram" value={counts.naoBateu} cls="bg-red-50 border-red-300 text-red-700" Icon={UserX} active={filter === "NAO_BATEU"} onClick={() => setFilter(filter === "NAO_BATEU" ? "TODOS" : "NAO_BATEU")} />
          <ChipStat label="Em aberto" value={counts.emAberto} cls="bg-amber-50 border-amber-400 text-amber-800" Icon={Hourglass} active={filter === "EM_ABERTO"} onClick={() => setFilter(filter === "EM_ABERTO" ? "TODOS" : "EM_ABERTO")} />
          <ChipStat label="Em andamento" value={counts.emAndamento} cls="bg-blue-50 border-blue-300 text-blue-700" Icon={PlayCircle} />
          <ChipStat label="Encerraram" value={counts.completo} cls="bg-emerald-50 border-emerald-300 text-emerald-700" Icon={CheckCircle2} />
          <ChipStat label="Ausentes" value={counts.ausencia} cls="bg-purple-50 border-purple-300 text-purple-700" Icon={CalendarX} />
          <ChipStat label="≥ 90% horas" value={counts.pertoLimite} cls="bg-orange-50 border-orange-400 text-orange-800" Icon={AlertTriangle} active={filter === "PERTO_LIMITE"} onClick={() => setFilter(filter === "PERTO_LIMITE" ? "TODOS" : "PERTO_LIMITE")} />
        </div>
      )}

      <Card className="p-2 flex flex-wrap gap-1 items-center text-xs">
        <span className="text-neutral-500 mr-1">Mostrar:</span>
        {[
          { v: "ALERTAS" as const, l: "Apenas alertas" },
          { v: "TODOS" as const, l: "Todos" },
          { v: "NAO_BATEU" as const, l: "Não bateram" },
          { v: "EM_ABERTO" as const, l: "Ponto aberto" },
          { v: "PERTO_LIMITE" as const, l: "Perto do limite" },
        ].map(opt => (
          <button
            key={opt.v}
            onClick={() => setFilter(opt.v)}
            data-testid={`filter-${opt.v}`}
            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition ${
              filter === opt.v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
            }`}
          >{opt.l}</button>
        ))}
      </Card>

      {isLoading ? (
        <p className="text-center text-sm text-neutral-400 py-8"><Loader2 className="w-5 h-5 animate-spin inline mr-1" /> Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-neutral-500">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-300 mb-2" />
          <p>Nada para mostrar com esse filtro.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-painel">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
                <th className="p-2 text-left font-semibold">Funcionário</th>
                {isCurrentMonth && <th className="p-2 text-left font-semibold">Status hoje</th>}
                <th className="p-2 text-left font-semibold">Última batida</th>
                <th className="p-2 text-right font-semibold">Horas no mês</th>
                <th className="p-2 text-left font-semibold w-[180px]">Limite (220h)</th>
                <th className="p-2 text-right font-semibold">Falta</th>
                <th className="p-2 text-center font-semibold">Dias</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const meta = STATUS_BADGE[r.unifiedStatus || r.todayStatus] || STATUS_BADGE.MES_PASSADO;
                const pct = Math.min(100, r.percentUsed);
                const barColor = pct >= 100 ? "bg-red-600" : pct >= 90 ? "bg-orange-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
                const dutyTime = r.dutyScheduledAt
                  ? new Date(r.dutyScheduledAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
                  : null;
                return (
                  <tr key={r.employeeId} className="border-b border-neutral-100 hover:bg-neutral-50/60" data-testid={`row-painel-${r.employeeId}`}>
                    <td className="p-2">
                      <div className="font-medium text-neutral-800 flex items-center gap-1.5">
                        {r.name}
                        {isCurrentMonth && r.onDutyToday && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-[10px] font-bold"
                            title={`Em serviço · OS ${r.dutyOsNumber || "—"}${dutyTime ? ` às ${dutyTime}` : ""}${r.partnerName ? ` · Dupla: ${r.partnerName}` : " · sem dupla"}`}
                            data-testid={`badge-duty-${r.employeeId}`}
                          >
                            <PlayCircle className="w-2.5 h-2.5" /> EM SERVIÇO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {r.role}{!r.mapped && <span className="ml-2 text-neutral-400 italic">· não mapeado</span>}
                      </div>
                      {isCurrentMonth && r.onDutyToday && (
                        <div className="text-[10px] text-neutral-600 mt-0.5 flex items-center flex-wrap gap-x-2" data-testid={`info-duty-${r.employeeId}`}>
                          <span><span className="text-neutral-400">OS:</span> <span className="font-mono font-semibold">{r.dutyOsNumber || "—"}</span>{dutyTime && <span className="text-neutral-400"> · {dutyTime}</span>}</span>
                          <span className="text-neutral-300">|</span>
                          <span>
                            <span className="text-neutral-400">+ Dupla:</span>{" "}
                            {r.partnerName
                              ? <span className="font-semibold text-neutral-700">{r.partnerName}</span>
                              : <span className="italic text-neutral-400">sem dupla</span>}
                          </span>
                        </div>
                      )}
                    </td>
                    {isCurrentMonth && (
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${meta.cls}`}>
                          <meta.Icon className="w-3 h-3" /> {meta.label}
                        </span>
                        {r.todayStatus === "EM_ABERTO" && r.openSinceMinutes != null && (
                          <div className="text-[10px] text-amber-700 mt-0.5">há {fmtSinceMin(r.openSinceMinutes)} sem fechar</div>
                        )}
                        {r.todayStatus === "EM_ABERTO" && (r.openSinceMinutes ?? 0) > 720 && rhidDelayed && (
                          <div className="text-[10px] text-orange-600 mt-0.5 flex items-center gap-0.5" title="Possível atraso no RHID Cloud — batida de fechamento pode ainda não ter chegado">
                            <AlertTriangle className="w-2.5 h-2.5" /> RHID pode estar atrasado
                          </div>
                        )}
                        {r.todayStatus === "AUSENCIA" && r.absenceType && (
                          <div className="text-[10px] text-purple-700 mt-0.5">{r.absenceType}</div>
                        )}
                        {(r.todayStatus === "EM_ANDAMENTO" || r.todayStatus === "COMPLETO" || r.todayStatus === "EM_ABERTO") && (
                          <div className="text-[10px] text-neutral-400 mt-0.5">{r.todayPunchCount} batida(s) hoje</div>
                        )}
                      </td>
                    )}
                    <td className="p-2 text-xs text-neutral-600">{r.lastPunchAt ? formatDateTime(r.lastPunchAt) : <span className="text-neutral-300">—</span>}</td>
                    <td className="p-2 text-right font-bold text-blue-600 tabular-nums">{r.hoursWorked.toFixed(2)}h</td>
                    <td className="p-2">
                      <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{pct.toFixed(0)}% de {r.hoursLimit}h</div>
                    </td>
                    <td className={`p-2 text-right font-semibold tabular-nums ${r.hoursRemaining < 0 ? "text-red-600" : r.hoursRemaining < 22 ? "text-orange-600" : "text-neutral-700"}`}>
                      {r.hoursRemaining < 0 ? `+${Math.abs(r.hoursRemaining).toFixed(1)}h extra` : `${r.hoursRemaining.toFixed(1)}h`}
                    </td>
                    <td className="p-2 text-center text-xs text-neutral-500">{r.daysWorked}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ChipStat({ label, value, cls, Icon, active, onClick }: { label: string; value: number; cls: string; Icon: any; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`p-2 rounded-lg border ${cls} ${onClick ? "cursor-pointer hover:shadow-sm" : "cursor-default"} ${active ? "ring-2 ring-offset-1 ring-blue-500" : ""} transition text-left`}
      data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-2xl font-bold leading-none mt-1 tabular-nums">{value}</div>
    </button>
  );
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FolhaTab() {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const [employeeId, setEmployeeId] = useState<string>("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [editingDay, setEditingDay] = useState<FolhaDay | null>(null);
  const [viewingDay, setViewingDay] = useState<FolhaDay | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [addDayOpen, setAddDayOpen] = useState(false);

  const employee = employees.find(e => String(e.id) === employeeId);

  const { data: folha = [], isLoading, refetch: refetchFolha } = useQuery<FolhaDay[]>({
    queryKey: ["/api/control-id/folha", employeeId, month],
    queryFn: async () => {
      if (!employeeId) return [];
      const r = await authFetch(`/api/control-id/folha/${employeeId}?month=${month}`);
      return r.json();
    },
    enabled: !!employeeId,
  });

  const { data: stats } = useQuery<FolhaStats>({
    queryKey: ["/api/control-id/folha-stats", employeeId, month],
    queryFn: async () => {
      const r = await authFetch(`/api/control-id/folha-stats/${employeeId}?month=${month}`);
      return r.json();
    },
    enabled: !!employeeId,
  });

  const [espelhoOpen, setEspelhoOpen] = useState(false);

  function openEspelho() { setEspelhoOpen(true); }

  return (
    <div className="space-y-3">
      <Card className="p-3 flex gap-2 items-center flex-wrap no-print">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="w-64 h-9 text-sm" data-testid="select-folha-employee"><SelectValue placeholder="Selecione um funcionário" /></SelectTrigger>
          <SelectContent>
            {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44 h-9 text-sm" data-testid="input-month" />
        {employeeId && (
          <>
            <Button variant="outline" size="sm" onClick={openEspelho} className="h-9" data-testid="button-print-individual">
              <Printer className="w-3.5 h-3.5 mr-1" /> Espelho RHID (oficial)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddDayOpen(true)} className="h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="button-add-day">
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Dia
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)} className="h-9 ml-auto" data-testid="button-print-batch">
          <FileText className="w-3.5 h-3.5 mr-1" /> Impressão em Lote
        </Button>
      </Card>

      {employeeId && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 no-print">
          <StatCard
            title="Horas trabalhadas"
            value={`${stats.hoursWorked.toFixed(2)}h`}
            sub={`de ${stats.hoursLimit}h · ${stats.percentUsed.toFixed(0)}%`}
            Icon={Clock}
            color="blue"
            progress={Math.min(100, stats.percentUsed)}
            barColor={stats.percentUsed >= 100 ? "bg-red-600" : stats.percentUsed >= 90 ? "bg-orange-500" : stats.percentUsed >= 70 ? "bg-amber-400" : "bg-emerald-500"}
          />
          <StatCard
            title="Hora Extra"
            value={`${stats.horaExtra.toFixed(2)}h`}
            sub={stats.horaExtra > 0 ? `${fmtBRL(stats.valorHoraExtra)}/h × ${stats.horaExtra.toFixed(1)}` : "Sem horas extras"}
            Icon={TrendingUp}
            color={stats.horaExtra > 0 ? "orange" : "neutral"}
          />
          <StatCard
            title="Restantes p/ limite"
            value={`${stats.horasRestantes.toFixed(2)}h`}
            sub={stats.horasRestantes <= 0 ? "Limite atingido" : "Antes de virar HE"}
            Icon={Hourglass}
            color={stats.horasRestantes <= 0 ? "red" : stats.horasRestantes < 22 ? "amber" : "emerald"}
          />
          <StatCard
            title="Custo estimado"
            value={fmtBRL(stats.custoTotalEstimado)}
            sub={!stats.hasSalary ? "Sem salário cadastrado" : stats.horaExtra > 0 ? `Base ${fmtBRL(stats.custoBase)} + HE ${fmtBRL(stats.custoExtra)}` : `Base ${fmtBRL(stats.custoBase)}`}
            Icon={DollarSign}
            color="emerald"
          />
        </div>
      )}

      {!employeeId ? (
        <FolhaOverview month={month} onSelect={(id) => setEmployeeId(String(id))} />
      ) : isLoading ? (
        <p className="text-center text-sm text-neutral-400 py-8 no-print">Carregando...</p>
      ) : folha.length === 0 ? (
        <Card className="p-8 text-center text-sm text-neutral-500 no-print">
          <Clock className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
          <p>Sem batidas para esse funcionário no mês selecionado.</p>
          <p className="text-xs mt-1 text-neutral-400">Confirme se ele está mapeado na aba "Mapping Funcionários".</p>
        </Card>
      ) : (
        <>
          <Card>
            <table className="w-full text-sm" data-testid="table-folha">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="p-2 text-left font-medium text-neutral-600">Data</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Entrada</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Saída Almoço</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Volta Almoço</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Saída</th>
                  <th className="p-2 text-right font-medium text-neutral-600">Horas</th>
                  <th className="p-2 text-right font-medium text-neutral-600">H. Extra</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Batidas</th>
                  <th className="p-2 text-right font-medium text-neutral-600 no-print">Ações</th>
                </tr>
              </thead>
              <tbody>
                {folha.map(d => (
                  <tr key={d.date} className="border-b border-neutral-100 hover:bg-neutral-50/60" data-testid={`row-folha-${d.date}`}>
                    <td className="p-2 font-medium">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })}</td>
                    <td className="p-2 text-center font-mono text-xs">{d.clockIn || "—"}</td>
                    <td className="p-2 text-center font-mono text-xs">{d.lunchOut || "—"}</td>
                    <td className="p-2 text-center font-mono text-xs">{d.lunchIn || "—"}</td>
                    <td className="p-2 text-center font-mono text-xs">{d.clockOut || "—"}</td>
                    <td className="p-2 text-right font-bold text-blue-600">{d.hoursWorked || "—"}</td>
                    <td className="p-2 text-right text-xs tabular-nums" data-testid={`text-extra-${d.date}`}>
                      {d.extraMin && d.extraMin > 0 ? (
                        <span className="font-semibold text-orange-600">+{Math.floor(d.extraMin / 60)}h {String(d.extraMin % 60).padStart(2, "0")}min</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="p-2 text-center text-xs text-neutral-400">{d.totalPunches}</td>
                    <td className="p-2 text-right no-print">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-neutral-600 hover:text-blue-600" title="Ver detalhes (espelho RHID)" onClick={() => setViewingDay(d)} data-testid={`button-view-day-${d.date}`}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-neutral-600 hover:text-emerald-600" title="Editar batidas do dia" onClick={() => setEditingDay(d)} data-testid={`button-edit-day-${d.date}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {stats && (() => {
                  const totalExtraMin = folha.reduce((s, d) => s + (Number(d.extraMin) || 0), 0);
                  return (
                    <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                      <td className="p-2" colSpan={5}>Total no mês ({stats.daysWorked} dias)</td>
                      <td className="p-2 text-right text-blue-700">{stats.hoursWorked.toFixed(2)}h</td>
                      <td className="p-2 text-right text-orange-600 tabular-nums" data-testid="text-total-extra-dia">
                        {totalExtraMin > 0 ? `+${Math.floor(totalExtraMin / 60)}h ${String(totalExtraMin % 60).padStart(2, "0")}min` : "—"}
                      </td>
                      <td className="p-2 text-center text-xs text-neutral-500" colSpan={2}>
                        {stats.horaExtra > 0 && <span className="text-orange-600">mês: +{stats.horaExtra.toFixed(2)}h</span>}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </Card>

        </>
      )}

      {editingDay && employeeId && (
        <EditDayDialog
          day={editingDay}
          employeeId={Number(employeeId)}
          onClose={() => setEditingDay(null)}
          onChanged={() => { refetchFolha(); queryClient.invalidateQueries({ queryKey: ["/api/control-id/folha-stats", employeeId, month] }); }}
        />
      )}
      {viewingDay && (
        <ViewDayDialog day={viewingDay} employeeName={employee?.name || ""} onClose={() => setViewingDay(null)} />
      )}
      {batchOpen && (
        <BatchPrintDialog month={month} employees={employees} onClose={() => setBatchOpen(false)} />
      )}
      {addDayOpen && employeeId && (
        <AddDayDialog
          employeeId={Number(employeeId)}
          defaultDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setAddDayOpen(false)}
          onChanged={() => { refetchFolha(); queryClient.invalidateQueries({ queryKey: ["/api/control-id/folha-stats", employeeId, month] }); }}
        />
      )}
      {espelhoOpen && employeeId && (
        <EspelhoRhidDialog employeeId={Number(employeeId)} month={month} onClose={() => setEspelhoOpen(false)} />
      )}
    </div>
  );
}

// ═══════════════ Espelho RHID (formato oficial Control iD) ═══════════════
function EspelhoRhidView({ data }: { data: EspelhoRhidData }) {
  const fromBR = new Date(data.periodo.from + "T12:00:00").toLocaleDateString("pt-BR");
  const toBR = new Date(data.periodo.to + "T12:00:00").toLocaleDateString("pt-BR");
  return (
    <div className="rhid-espelho">
      <div className="rhid-page-header">
        <span>Página 01 de 01</span>
        <span>Emitido em {data.emitidoEm}</span>
      </div>
      <div className="rhid-title-row">
        <div>
          <div className="rhid-title-1">Espelho</div>
          <div className="rhid-title-2">de Ponto Eletrônico</div>
        </div>
        <div className="rhid-period">DE {fromBR} ATÉ {toBR}</div>
      </div>

      <table className="rhid-info">
        <tbody>
          <tr>
            <td><b>EMPRESA:</b> {data.company.name}</td>
            <td><b>CNPJ:</b> {data.company.cnpj}</td>
            <td><b>CEI:</b> {data.company.cei || "—"}</td>
          </tr>
          <tr>
            <td colSpan={3}><b>ENDEREÇO:</b> {data.company.endereco}</td>
          </tr>
          <tr>
            <td><b>NOME:</b> {data.employee.name}</td>
            <td><b>PIS/PASEP:</b> {data.employee.pis}</td>
            <td><b>ADMISSÃO:</b> {data.employee.admissao}</td>
          </tr>
          <tr>
            <td><b>CENTRO DE CUSTO:</b> {data.employee.centroCusto}</td>
            <td><b>CPF:</b> {data.employee.cpf}</td>
            <td><b>MATRÍCULA:</b> {data.employee.matricula}</td>
          </tr>
          <tr>
            <td><b>DEPARTAMENTO:</b> {data.employee.departamento}</td>
            <td colSpan={2}><b>CARGO:</b> {data.employee.role}</td>
          </tr>
        </tbody>
      </table>

      <table className="rhid-table">
        <thead>
          <tr className="group-row">
            <th rowSpan={2}>DIA</th>
            <th rowSpan={2}>MARCAÇÕES REGISTRADAS<br/>NO PONTO ELETRÔNICO</th>
            <th colSpan={7}>JORNADA REALIZADA</th>
            <th colSpan={4}>TRATAMENTOS EFETUADOS SOBRE OS DADOS ORIGINAIS</th>
          </tr>
          <tr>
            <th>ENT. 1</th><th>SAÍ. 1</th>
            <th>ENT. 2</th><th>SAÍ. 2</th>
            <th>ENT. 3</th><th>SAÍ. 3</th>
            <th>DURAÇÃO</th>
            <th>CH</th><th>HORÁRIO</th><th>OCORR</th><th>MOTIVO</th>
          </tr>
        </thead>
        <tbody>
          {data.days.map(d => {
            const trat = d.tratamentos;
            const rowspan = Math.max(1, trat.length);
            return (
              <React.Fragment key={d.date}>
                <tr>
                  <td className="dia" rowSpan={rowspan}>{d.label} - {d.weekday}</td>
                  <td className="marcacoes" rowSpan={rowspan}>{d.marcacoes.join(" ")}</td>
                  <td rowSpan={rowspan}>{d.jornada.ent1}</td>
                  <td rowSpan={rowspan}>{d.jornada.sai1}</td>
                  <td rowSpan={rowspan}>{d.jornada.ent2}</td>
                  <td rowSpan={rowspan}>{d.jornada.sai2}</td>
                  <td rowSpan={rowspan}>{d.jornada.ent3}</td>
                  <td rowSpan={rowspan}>{d.jornada.sai3}</td>
                  <td className="duracao" rowSpan={rowspan}>{d.duracao}</td>
                  <td className="ch" rowSpan={rowspan}>{d.ch}</td>
                  <td>{trat[0]?.horario || ""}</td>
                  <td className="ocorr">{trat[0]?.ocorr || ""}</td>
                  <td className="motivo">{trat[0]?.motivo || ""}</td>
                </tr>
                {trat.slice(1).map((t, i) => (
                  <tr key={i} className="trat-extra">
                    <td>{t.horario}</td>
                    <td className="ocorr">{t.ocorr}</td>
                    <td className="motivo">{t.motivo}</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          <tr className="rhid-total">
            <td colSpan={8} className="text-right"><b>TOTAL</b></td>
            <td className="duracao"><b>{data.totalHHMM}</b></td>
            <td colSpan={4}></td>
          </tr>
        </tbody>
      </table>

      <div className="rhid-legend">(I)=Incluído, (P)=Pré-assinalado, (D)=Desconsiderado</div>

      <div className="rhid-horarios">
        <div className="rhid-horarios-title">Horários Contratuais<br/>do Empregado</div>
        <table className="rhid-horarios-table">
          <thead>
            <tr><th>CÓDIGO DO HORÁRIO(CH)</th><th>ENT</th><th>SAI</th><th>ENT</th><th>SAI</th></tr>
          </thead>
          <tbody>
            {data.horariosContratuais.map(h => (
              <tr key={h.codigo}><td>{h.codigo}</td><td>{h.ent1}</td><td>{h.sai1}</td><td>{h.ent2}</td><td>{h.sai2}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rhid-signatures">
        <div className="sig">
          <div className="line"></div>
          <div className="label">{data.employee.name}</div>
        </div>
        <div className="sig">
          <div className="line"></div>
          <div className="label">{data.company.name}</div>
        </div>
      </div>
    </div>
  );
}

function EspelhoRhidDialog({ employeeId, month, onClose }: { employeeId: number; month: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useQuery<EspelhoRhidData>({
    queryKey: ["/api/control-id/espelho-rhid", employeeId, month],
    queryFn: async () => {
      const r = await authFetch(`/api/control-id/espelho-rhid/${employeeId}?month=${month}&_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      const text = await r.text();
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Resposta não é JSON: ${text.slice(0, 200)}`);
      }
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: "always",
  });

  function doPrint() {
    document.body.classList.add("printing-espelho");
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("printing-espelho"), 500);
    }, 100);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto" aria-describedby={undefined}>
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-blue-600" />
            Espelho RHID — formato oficial Control iD
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-neutral-400" /></div>
        ) : data ? (
          <div className="rhid-espelho-container">
            <EspelhoRhidView data={data} />
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-red-500 space-y-3">
            <div>Erro ao carregar o espelho.</div>
            {error && <div className="text-xs text-neutral-500 font-mono break-all px-4">{(error as Error).message}</div>}
            <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        )}
        <DialogFooter className="no-print">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={doPrint} disabled={!data}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type OverviewRow = {
  employeeId: number; name: string; role: string | null; matricula: string | null;
  hoursWorked: number; hoursLimit: number; horaExtra: number; horasRestantes: number;
  percentUsed: number; daysWorked: number; baseSalary: number;
  custoBase: number; custoExtra: number; custoTotalEstimado: number; custoComEncargos: number; hasSalary: boolean;
};

function FolhaOverview({ month, onSelect }: { month: string; onSelect: (id: number) => void }) {
  const { data: rows = [], isLoading } = useQuery<OverviewRow[]>({
    queryKey: ["/api/control-id/folha-overview", month],
    queryFn: async () => {
      const r = await authFetch(`/api/control-id/folha-overview?month=${month}`);
      return r.json();
    },
  });

  if (isLoading) return <Card className="p-8 text-center text-sm text-neutral-400 no-print"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />Calculando visão geral...</Card>;

  const totals = rows.reduce((acc, r) => ({
    funcionarios: acc.funcionarios + 1,
    comBatidas: acc.comBatidas + (r.daysWorked > 0 ? 1 : 0),
    horas: acc.horas + r.hoursWorked,
    horaExtra: acc.horaExtra + r.horaExtra,
    custoBase: acc.custoBase + r.custoBase,
    custoExtra: acc.custoExtra + r.custoExtra,
    custoTotal: acc.custoTotal + r.custoTotalEstimado,
    custoEncargos: acc.custoEncargos + r.custoComEncargos,
    semSalario: acc.semSalario + (r.hasSalary ? 0 : 1),
    semBatidas: acc.semBatidas + (r.daysWorked === 0 ? 1 : 0),
    acimaLimite: acc.acimaLimite + (r.percentUsed >= 100 ? 1 : 0),
  }), { funcionarios: 0, comBatidas: 0, horas: 0, horaExtra: 0, custoBase: 0, custoExtra: 0, custoTotal: 0, custoEncargos: 0, semSalario: 0, semBatidas: 0, acimaLimite: 0 });

  const chartData = rows
    .filter(r => r.hoursWorked > 0)
    .slice(0, 15)
    .map(r => ({
      name: r.name.split(" ").slice(0, 2).join(" "),
      fullName: r.name,
      horas: r.hoursWorked,
      extra: r.horaExtra,
      pct: r.percentUsed,
      employeeId: r.employeeId,
    }));

  const custoChartData = rows
    .filter(r => r.custoTotalEstimado > 0)
    .sort((a, b) => b.custoTotalEstimado - a.custoTotalEstimado)
    .slice(0, 10)
    .map(r => ({
      name: r.name.split(" ").slice(0, 2).join(" "),
      fullName: r.name,
      base: r.custoBase,
      extra: r.custoExtra,
      employeeId: r.employeeId,
    }));

  const statusDist = [
    { name: "Sem batidas", value: totals.semBatidas, color: "#9ca3af" },
    { name: "Trabalhando (<70%)", value: rows.filter(r => r.daysWorked > 0 && r.percentUsed < 70).length, color: "#10b981" },
    { name: "Próximo (70-90%)", value: rows.filter(r => r.percentUsed >= 70 && r.percentUsed < 90).length, color: "#f59e0b" },
    { name: "Crítico (90-100%)", value: rows.filter(r => r.percentUsed >= 90 && r.percentUsed < 100).length, color: "#f97316" },
    { name: "Acima do limite (HE)", value: totals.acimaLimite, color: "#dc2626" },
  ].filter(s => s.value > 0);

  return (
    <div className="space-y-3 no-print">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard title="Funcionários ativos" value={String(totals.funcionarios)} sub={`${totals.comBatidas} com batidas no mês`} Icon={Users} color="blue" />
        <StatCard title="Horas totais" value={`${totals.horas.toFixed(1)}h`} sub={`${totals.horaExtra > 0 ? `+${totals.horaExtra.toFixed(1)}h extras` : "Sem horas extras"}`} Icon={Clock} color={totals.horaExtra > 0 ? "orange" : "blue"} />
        <StatCard title="Custo estimado" value={fmtBRL(totals.custoTotal)} sub={`Base ${fmtBRL(totals.custoBase)} + HE ${fmtBRL(totals.custoExtra)}`} Icon={DollarSign} color="emerald" />
        <StatCard title="Custo c/ encargos" value={fmtBRL(totals.custoEncargos)} sub={totals.semSalario > 0 ? `${totals.semSalario} sem salário cadastrado` : "Inclui encargos sociais"} Icon={TrendingUp} color={totals.semSalario > 0 ? "amber" : "emerald"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-3 lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-neutral-700">Horas trabalhadas por funcionário (top 15)</h3>
          </div>
          {chartData.length === 0 ? (
            <div className="text-center text-xs text-neutral-400 py-12">Sem batidas no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" stroke="#6b7280" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#374151" fontSize={11} width={120} />
                <RTooltip
                  formatter={(v: any, key: any, item: any) => key === "horas" ? [`${(v as number).toFixed(2)}h (${item.payload.pct.toFixed(0)}%)`, "Horas"] : [`${(v as number).toFixed(2)}h`, "Hora extra"]}
                  labelFormatter={(label, items: any[]) => items?.[0]?.payload?.fullName || label}
                />
                <Bar dataKey="horas" fill="#3b82f6" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => onSelect(d.employeeId)}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.pct >= 100 ? "#dc2626" : d.pct >= 90 ? "#f97316" : d.pct >= 70 ? "#f59e0b" : "#3b82f6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-bold text-neutral-700">Distribuição de status</h3>
          </div>
          {statusDist.length === 0 ? (
            <div className="text-center text-xs text-neutral-400 py-12">Sem dados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={(d: any) => d.value}>
                  {statusDist.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {custoChartData.length > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-neutral-700">Custo estimado por funcionário (top 10)</h3>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(220, custoChartData.length * 32)}>
            <BarChart data={custoChartData} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(1)}k`} />
              <YAxis type="category" dataKey="name" stroke="#374151" fontSize={11} width={120} />
              <RTooltip
                formatter={(v: any) => fmtBRL(v as number)}
                labelFormatter={(label, items: any[]) => items?.[0]?.payload?.fullName || label}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="base" stackId="c" fill="#10b981" name="Salário base" cursor="pointer" onClick={(d: any) => onSelect(d.employeeId)} />
              <Bar dataKey="extra" stackId="c" fill="#f97316" name="Hora extra" cursor="pointer" onClick={(d: any) => onSelect(d.employeeId)} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <div className="p-2 border-b bg-neutral-50 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-neutral-600" />
          <h3 className="text-sm font-bold text-neutral-700">Ranking detalhado · {new Date(month + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
          <span className="text-xs text-neutral-400 ml-auto">Clique numa linha pra abrir o espelho</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50/50 text-xs text-neutral-600">
              <th className="p-2 text-left">Funcionário</th>
              <th className="p-2 text-center">Dias</th>
              <th className="p-2 text-right">Horas</th>
              <th className="p-2 text-center w-32">% / Limite</th>
              <th className="p-2 text-right">H. Extra</th>
              <th className="p-2 text-right">Salário Base</th>
              <th className="p-2 text-right">Custo Total</th>
              <th className="p-2 text-right">Com Encargos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const barColor = r.percentUsed >= 100 ? "bg-red-600" : r.percentUsed >= 90 ? "bg-orange-500" : r.percentUsed >= 70 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <tr key={r.employeeId} className="border-b border-neutral-100 hover:bg-blue-50/40 cursor-pointer" onClick={() => onSelect(r.employeeId)} data-testid={`row-overview-${r.employeeId}`}>
                  <td className="p-2 font-medium">
                    {r.name}
                    {r.role && <span className="text-xs text-neutral-400 ml-2">· {r.role}</span>}
                    {!r.hasSalary && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">sem salário</span>}
                  </td>
                  <td className="p-2 text-center text-xs text-neutral-500">{r.daysWorked}</td>
                  <td className="p-2 text-right font-bold text-blue-600 tabular-nums">{r.hoursWorked.toFixed(2)}h</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, r.percentUsed)}%` }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-neutral-500 w-10 text-right">{r.percentUsed.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className={`p-2 text-right tabular-nums font-medium ${r.horaExtra > 0 ? "text-orange-600" : "text-neutral-300"}`}>
                    {r.horaExtra > 0 ? `${r.horaExtra.toFixed(2)}h` : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums text-neutral-600">{r.hasSalary ? fmtBRL(r.baseSalary) : "—"}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-emerald-700">{r.hasSalary ? fmtBRL(r.custoTotalEstimado) : "—"}</td>
                  <td className="p-2 text-right tabular-nums text-neutral-500">{r.hasSalary ? fmtBRL(r.custoComEncargos) : "—"}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                <td className="p-2">TOTAL ({totals.funcionarios} funcionários)</td>
                <td className="p-2 text-center text-xs">—</td>
                <td className="p-2 text-right text-blue-700 tabular-nums">{totals.horas.toFixed(2)}h</td>
                <td className="p-2"></td>
                <td className="p-2 text-right text-orange-600 tabular-nums">{totals.horaExtra > 0 ? `${totals.horaExtra.toFixed(2)}h` : "—"}</td>
                <td className="p-2 text-right tabular-nums text-neutral-600">{fmtBRL(totals.custoBase)}</td>
                <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBRL(totals.custoTotal)}</td>
                <td className="p-2 text-right tabular-nums text-neutral-700">{fmtBRL(totals.custoEncargos)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatCard({ title, value, sub, Icon, color, progress, barColor }: { title: string; value: string; sub?: string; Icon: any; color: "blue" | "emerald" | "amber" | "orange" | "red" | "neutral"; progress?: number; barColor?: string }) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    orange: "border-orange-200 bg-orange-50/40",
    red: "border-red-200 bg-red-50/40",
    neutral: "border-neutral-200 bg-neutral-50/40",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600", emerald: "text-emerald-600", amber: "text-amber-600",
    orange: "text-orange-600", red: "text-red-600", neutral: "text-neutral-400",
  };
  return (
    <Card className={`p-3 border ${colorMap[color]}`} data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{title}</span>
        <Icon className={`w-4 h-4 ${iconColor[color]}`} />
      </div>
      <div className={`text-xl font-bold tabular-nums ${iconColor[color]}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>}
      {progress != null && (
        <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-2 overflow-hidden">
          <div className={`h-full ${barColor || "bg-blue-500"} transition-all`} style={{ width: `${progress}%` }} />
        </div>
      )}
    </Card>
  );
}

function EditDayDialog({ day, employeeId, onClose, onChanged }: { day: FolhaDay; employeeId: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [punches, setPunches] = useState<FolhaPunch[]>(day.punches || []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editDir, setEditDir] = useState<string>("unknown");
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState(`${day.date}T08:00`);
  const [newDir, setNewDir] = useState("unknown");
  const [addingDay, setAddingDay] = useState(false);
  const [dayEntrada, setDayEntrada] = useState(`${day.date}T08:00`);
  const [dayLunchOut, setDayLunchOut] = useState(`${day.date}T12:00`);
  const [dayLunchIn, setDayLunchIn] = useState(`${day.date}T13:00`);
  const [daySaida, setDaySaida] = useState(`${day.date}T18:00`);
  const [savingDay, setSavingDay] = useState(false);

  async function addFullDay() {
    const slots: { time: string; direction: "in" | "out"; label: string }[] = [
      { time: dayEntrada, direction: "in", label: "Entrada" },
      { time: dayLunchOut, direction: "out", label: "Início Almoço" },
      { time: dayLunchIn, direction: "in", label: "Retorno Almoço" },
      { time: daySaida, direction: "out", label: "Saída" },
    ];
    setSavingDay(true);
    let okCount = 0;
    const errs: string[] = [];
    for (const s of slots) {
      try {
        const r = await authFetch("/api/control-id/manual-punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, punchAt: new Date(s.time).toISOString(), direction: s.direction }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        okCount++;
      } catch (e: any) {
        errs.push(`${s.label}: ${e.message}`);
      }
    }
    setSavingDay(false);
    if (errs.length === 0) {
      toast({ title: "Dia adicionado", description: `${okCount} batidas criadas (Entrada, Início/Retorno Almoço, Saída).` });
      setAddingDay(false);
      onChanged();
      onClose();
    } else {
      toast({ title: `${okCount} de 4 batidas criadas`, description: errs.join(" · "), variant: "destructive" });
      onChanged();
    }
  }

  function startEdit(p: FolhaPunch) {
    setEditingId(p.id);
    const d = new Date(p.punchAt);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditTime(local);
    setEditDir(p.direction || "unknown");
  }

  async function saveEdit(p: FolhaPunch) {
    try {
      const r = await authFetch(`/api/control-id/punches/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punchAt: new Date(editTime).toISOString(), direction: editDir }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Batida atualizada", description: d.rhidSynced ? "Sincronizado com o RHID." : (d.rhidError || "Salvo apenas localmente.") });
      setPunches(arr => arr.map(x => x.id === p.id ? { ...x, punchAt: new Date(editTime).toISOString(), direction: editDir, time: new Date(editTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) } : x));
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function delPunch(p: FolhaPunch) {
    if (!confirm(`Excluir batida ${p.time}?`)) return;
    try {
      const r = await authFetch(`/api/control-id/punches/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: "Batida excluída" });
      setPunches(arr => arr.filter(x => x.id !== p.id));
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function addPunch() {
    try {
      const r = await authFetch("/api/control-id/manual-punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, punchAt: new Date(newTime).toISOString(), direction: newDir }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Batida criada", description: d.rhidSynced ? "Enviada ao RHID." : (d.rhidError || "Salva localmente.") });
      setAdding(false);
      onChanged();
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Editar batidas — {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {punches.length === 0 ? (
            <div className="text-center text-sm text-neutral-400 py-4">Sem batidas neste dia.</div>
          ) : (
            <table className="w-full text-sm border rounded">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Data/Hora</th>
                  <th className="p-2 text-center">Direção</th>
                  <th className="p-2 text-center">Origem</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {punches.map((p, idx) => (
                  <tr key={p.id} className="border-t" data-testid={`row-edit-punch-${p.id}`}>
                    <td className="p-2 text-neutral-400 text-xs">{idx + 1}</td>
                    <td className="p-2 font-mono text-xs">
                      {editingId === p.id ? (
                        <Input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} className="h-7 text-xs w-44" />
                      ) : formatDateTime(p.punchAt)}
                    </td>
                    <td className="p-2 text-center">
                      {editingId === p.id ? (
                        <Select value={editDir} onValueChange={setEditDir}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">Entrada</SelectItem>
                            <SelectItem value="out">Saída</SelectItem>
                            <SelectItem value="unknown">—</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.direction === "in" ? "bg-emerald-100 text-emerald-700" : p.direction === "out" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {p.direction === "in" ? "ENTRADA" : p.direction === "out" ? "SAÍDA" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center text-xs text-neutral-500">{p.source || "—"}</td>
                    <td className="p-2 text-right">
                      {editingId === p.id ? (
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => saveEdit(p)}><Save className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => delPunch(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {adding ? (
            <Card className="p-3 bg-blue-50/40 border-blue-200 flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-[11px] font-medium text-neutral-600">Data/Hora</label>
                <Input type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-8 text-xs w-44" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-neutral-600">Direção</label>
                <Select value={newDir} onValueChange={setNewDir}>
                  <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada</SelectItem>
                    <SelectItem value="out">Saída</SelectItem>
                    <SelectItem value="unknown">—</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addPunch} className="h-8"><Save className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} className="h-8">Cancelar</Button>
            </Card>
          ) : addingDay ? (
            <Card className="p-3 bg-emerald-50/50 border-emerald-200 space-y-3">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Adicionar dia completo (4 batidas)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-emerald-700 uppercase">Entrada</label>
                  <Input type="datetime-local" value={dayEntrada} onChange={e => setDayEntrada(e.target.value)} className="h-8 text-xs" data-testid="input-day-entrada" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-amber-700 uppercase">Início Almoço</label>
                  <Input type="datetime-local" value={dayLunchOut} onChange={e => setDayLunchOut(e.target.value)} className="h-8 text-xs" data-testid="input-day-lunch-out" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-amber-700 uppercase">Retorno Almoço</label>
                  <Input type="datetime-local" value={dayLunchIn} onChange={e => setDayLunchIn(e.target.value)} className="h-8 text-xs" data-testid="input-day-lunch-in" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-red-700 uppercase">Saída</label>
                  <Input type="datetime-local" value={daySaida} onChange={e => setDaySaida(e.target.value)} className="h-8 text-xs" data-testid="input-day-saida" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setAddingDay(false)} className="h-8" disabled={savingDay}>Cancelar</Button>
                <Button size="sm" onClick={addFullDay} className="h-8 bg-emerald-600 hover:bg-emerald-700" disabled={savingDay} data-testid="button-save-full-day">
                  <Save className="w-3.5 h-3.5 mr-1" /> {savingDay ? "Salvando..." : "Salvar dia completo"}
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="flex-1">
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar batida manual
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddingDay(true)} className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="button-add-full-day">
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar dia (4 batidas)
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDayDialog({ day, employeeName, onClose }: { day: FolhaDay; employeeName: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-blue-600" />
            Espelho RHID — {employeeName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Card className="p-3 bg-neutral-50">
            <div className="text-xs text-neutral-500">Data</div>
            <div className="text-base font-bold">{new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
          </Card>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="border rounded p-2">
              <div className="text-[10px] uppercase font-bold text-emerald-700">Entrada</div>
              <div className="font-mono text-sm font-bold mt-1">{day.clockIn || "—"}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-[10px] uppercase font-bold text-amber-700">Saída Almoço</div>
              <div className="font-mono text-sm font-bold mt-1">{day.lunchOut || "—"}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-[10px] uppercase font-bold text-amber-700">Volta Almoço</div>
              <div className="font-mono text-sm font-bold mt-1">{day.lunchIn || "—"}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-[10px] uppercase font-bold text-red-700">Saída</div>
              <div className="font-mono text-sm font-bold mt-1">{day.clockOut || "—"}</div>
            </div>
          </div>
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-2">
            <span className="text-xs text-neutral-600">Total trabalhado:</span>
            <span className="font-bold text-blue-700">{day.hoursWorked || "—"}h</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-600 mb-1">Todas as batidas registradas no aparelho:</div>
            <div className="border rounded max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 sticky top-0">
                  <tr>
                    <th className="p-1.5 text-left">#</th>
                    <th className="p-1.5 text-left">Hora</th>
                    <th className="p-1.5 text-center">Direção</th>
                    <th className="p-1.5 text-left">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {(day.punches || []).map((p, idx) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-1.5 text-neutral-400">{idx + 1}</td>
                      <td className="p-1.5 font-mono">{p.time}</td>
                      <td className="p-1.5 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.direction === "in" ? "bg-emerald-100 text-emerald-700" : p.direction === "out" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {p.direction === "in" ? "ENTRADA" : p.direction === "out" ? "SAÍDA" : "—"}
                        </span>
                      </td>
                      <td className="p-1.5 text-neutral-500">{p.source || "—"}</td>
                    </tr>
                  ))}
                  {(day.punches || []).length === 0 && (
                    <tr><td colSpan={4} className="p-3 text-center text-neutral-400">Sem batidas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDayDialog({ employeeId, defaultDate, onClose, onChanged }: { employeeId: number; defaultDate: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState(defaultDate);
  const [entrada, setEntrada] = useState("08:00");
  const [lunchOut, setLunchOut] = useState("12:00");
  const [lunchIn, setLunchIn] = useState("13:00");
  const [saida, setSaida] = useState("18:00");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!date) {
      toast({ title: "Selecione a data", variant: "destructive" });
      return;
    }
    const slots: { time: string; direction: "in" | "out"; label: string }[] = [
      { time: `${date}T${entrada}`, direction: "in", label: "Entrada" },
      { time: `${date}T${lunchOut}`, direction: "out", label: "Início Almoço" },
      { time: `${date}T${lunchIn}`, direction: "in", label: "Retorno Almoço" },
      { time: `${date}T${saida}`, direction: "out", label: "Saída" },
    ];
    setSaving(true);
    let okCount = 0;
    const errs: string[] = [];
    for (const s of slots) {
      try {
        const r = await authFetch("/api/control-id/manual-punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, punchAt: new Date(s.time).toISOString(), direction: s.direction }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        okCount++;
      } catch (e: any) {
        errs.push(`${s.label}: ${e.message}`);
      }
    }
    setSaving(false);
    if (errs.length === 0) {
      toast({ title: "Dia adicionado", description: `${okCount} batidas criadas em ${new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}.` });
      onChanged();
      onClose();
    } else {
      toast({ title: `${okCount} de 4 batidas criadas`, description: errs.join(" · "), variant: "destructive" });
      onChanged();
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" /> Adicionar Dia — 4 batidas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase mb-1.5 block">Data</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" data-testid="input-add-day-date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-emerald-700 uppercase mb-1 block">Entrada</label>
              <Input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} className="h-9" data-testid="input-add-day-entrada" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-700 uppercase mb-1 block">Início Almoço</label>
              <Input type="time" value={lunchOut} onChange={e => setLunchOut(e.target.value)} className="h-9" data-testid="input-add-day-lunch-out" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-700 uppercase mb-1 block">Retorno Almoço</label>
              <Input type="time" value={lunchIn} onChange={e => setLunchIn(e.target.value)} className="h-9" data-testid="input-add-day-lunch-in" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-red-700 uppercase mb-1 block">Saída</label>
              <Input type="time" value={saida} onChange={e => setSaida(e.target.value)} className="h-9" data-testid="input-add-day-saida" />
            </div>
          </div>
          <div className="text-[11px] text-neutral-500">Cada batida será enviada ao RHID quando o funcionário estiver mapeado a um aparelho. Caso contrário, fica salva localmente.</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-confirm-add-day">
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Salvando..." : "Salvar 4 batidas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchPrintDialog({ month, employees, onClose }: { month: string; employees: Employee[]; onClose: () => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [printData, setPrintData] = useState<EspelhoRhidData[] | null>(null);

  function toggleAll() {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map(e => e.id)));
  }

  async function gerarLote() {
    if (selected.size === 0) { toast({ title: "Selecione ao menos um funcionário", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const ids = Array.from(selected);
      const data = await Promise.all(ids.map(id =>
        authFetch(`/api/control-id/espelho-rhid/${id}?month=${month}&_=${Date.now()}`, { cache: "no-store", headers: { "Accept": "application/json" } }).then(r => r.json() as Promise<EspelhoRhidData>)
      ));
      setPrintData(data);
      setTimeout(() => {
        document.body.classList.add("printing-espelho");
        window.print();
        setTimeout(() => {
          document.body.classList.remove("printing-espelho");
          setPrintData(null);
          onClose();
        }, 800);
      }, 200);
    } catch (e: any) {
      toast({ title: "Erro ao gerar lote", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={!printData} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              Impressão em Lote — {new Date(month + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-neutral-50 border rounded p-2">
              <span className="text-sm font-medium">{selected.size} de {employees.length} selecionado(s)</span>
              <Button size="sm" variant="outline" onClick={toggleAll}>{selected.size === employees.length ? "Desmarcar todos" : "Selecionar todos"}</Button>
            </div>
            <div className="border rounded max-h-80 overflow-auto">
              {employees.map(e => (
                <label key={e.id} className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-neutral-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => {
                      const s = new Set(selected);
                      if (s.has(e.id)) s.delete(e.id); else s.add(e.id);
                      setSelected(s);
                    }}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-neutral-500">· {e.role}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={gerarLote} disabled={loading || selected.size === 0}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1" />}
              Gerar e imprimir {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printData && (
        <div className="rhid-espelho-container">
          {printData.map((d, idx) => (
            <div key={d.employee.id} style={idx > 0 ? { pageBreakBefore: "always", marginTop: "20mm" } : undefined}>
              <EspelhoRhidView data={d} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
