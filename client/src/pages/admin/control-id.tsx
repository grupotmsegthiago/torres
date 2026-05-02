import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch, queryClient, apiRequest } from "@/lib/queryClient";
import { Clock, Plus, Pencil, Trash2, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Users, ListChecks, FileSpreadsheet, ScanFace, KeyRound, Activity, Loader2 } from "lucide-react";
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
type FolhaDay = {
  date: string; clockIn: string | null; lunchOut: string | null; lunchIn: string | null;
  clockOut: string | null; totalPunches: number; sources: string[]; hoursWorked?: string;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ControlIdPage() {
  const [tab, setTab] = useState("aparelhos");
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
            <TabsTrigger value="folha" data-testid="tab-folha"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Folha de Ponto</TabsTrigger>
          </TabsList>
          <TabsContent value="aparelhos" className="mt-4"><DevicesTab /></TabsContent>
          <TabsContent value="mapping" className="mt-4"><MappingTab /></TabsContent>
          <TabsContent value="batidas" className="mt-4"><PunchesTab /></TabsContent>
          <TabsContent value="folha" className="mt-4"><FolhaTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ═════════════════════ APARELHOS ═════════════════════
function DevicesTab() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<Device & { password?: string }> | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

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
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-600">{d.tipo}</span>
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
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={testingId === d.id} onClick={() => testConnection(d.id)} data-testid={`button-test-${d.id}`}>
                      {testingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1" />} Testar
                    </Button>
                    <Button variant="outline" size="sm" disabled={syncingId === d.id} onClick={() => syncDevice(d.id)} data-testid={`button-sync-${d.id}`}>
                      {syncingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Sync
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
                <span className="text-xs">Ativo (sincroniza a cada 5 min)</span>
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
  useMemo(() => { if (!deviceId && devices.length > 0) setDeviceId(devices[0].id); }, [devices, deviceId]);

  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: mappings = [] } = useQuery<Mapping[]>({
    queryKey: ["/api/control-id/mappings", deviceId],
    queryFn: async () => { const r = await authFetch(`/api/control-id/mappings?deviceId=${deviceId}`); return r.json(); },
    enabled: !!deviceId,
  });
  const { data: deviceUsers = [], refetch: refetchDeviceUsers, isFetching: loadingUsers } = useQuery<Array<{ id: string; name: string; matricula?: string }>>({
    queryKey: ["/api/control-id/devices", deviceId, "users"],
    queryFn: async () => { const r = await authFetch(`/api/control-id/devices/${deviceId}/users`); return r.json(); },
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
        <span className="text-xs text-neutral-500 ml-auto">{punches.length} batida(s)</span>
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
              </tr>
            </thead>
            <tbody>
              {punches.map(p => (
                <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-punch-${p.id}`}>
                  <td className="p-2 font-mono text-xs">{formatDateTime(p.punch_at)}</td>
                  <td className="p-2 font-medium">
                    {p.employee_id ? (empMap.get(p.employee_id)?.name || `#${p.employee_id}`) : <span className="text-amber-600 text-xs">⚠ não mapeado</span>}
                  </td>
                  <td className="p-2 font-mono text-xs">{p.control_id_user_id}</td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.direction === "in" ? "bg-emerald-100 text-emerald-700" : p.direction === "out" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {p.direction === "in" ? "ENTRADA" : p.direction === "out" ? "SAÍDA" : "—"}
                    </span>
                  </td>
                  <td className="p-2 text-center text-xs text-neutral-500">{p.source || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ═════════════════════ FOLHA CONSOLIDADA ═════════════════════
function FolhaTab() {
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const [employeeId, setEmployeeId] = useState<string>("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data: folha = [], isLoading } = useQuery<FolhaDay[]>({
    queryKey: ["/api/control-id/folha", employeeId, month],
    queryFn: async () => {
      if (!employeeId) return [];
      const r = await authFetch(`/api/control-id/folha/${employeeId}?month=${month}`);
      return r.json();
    },
    enabled: !!employeeId,
  });

  const totalHoras = folha.reduce((s, d) => s + (Number(d.hoursWorked) || 0), 0);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex gap-2 items-center flex-wrap">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="w-64 h-9 text-sm" data-testid="select-folha-employee"><SelectValue placeholder="Selecione um funcionário" /></SelectTrigger>
          <SelectContent>
            {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44 h-9 text-sm" data-testid="input-month" />
        {employeeId && folha.length > 0 && (
          <span className="ml-auto text-sm font-bold text-neutral-700">Total: <span className="text-blue-600">{totalHoras.toFixed(2)}h</span> em {folha.length} dia(s)</span>
        )}
      </Card>

      {!employeeId ? (
        <Card className="p-8 text-center text-sm text-neutral-400">Selecione um funcionário para ver a folha consolidada das batidas Control iD.</Card>
      ) : isLoading ? (
        <p className="text-center text-sm text-neutral-400 py-8">Carregando...</p>
      ) : folha.length === 0 ? (
        <Card className="p-8 text-center text-sm text-neutral-500">
          <Clock className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
          <p>Sem batidas para esse funcionário no mês selecionado.</p>
          <p className="text-xs mt-1 text-neutral-400">Confirme se ele está mapeado na aba "Mapping Funcionários".</p>
        </Card>
      ) : (
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
                <th className="p-2 text-center font-medium text-neutral-600">Batidas</th>
              </tr>
            </thead>
            <tbody>
              {folha.map(d => (
                <tr key={d.date} className="border-b border-neutral-100" data-testid={`row-folha-${d.date}`}>
                  <td className="p-2 font-medium">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })}</td>
                  <td className="p-2 text-center font-mono text-xs">{d.clockIn || "—"}</td>
                  <td className="p-2 text-center font-mono text-xs">{d.lunchOut || "—"}</td>
                  <td className="p-2 text-center font-mono text-xs">{d.lunchIn || "—"}</td>
                  <td className="p-2 text-center font-mono text-xs">{d.clockOut || "—"}</td>
                  <td className="p-2 text-right font-bold text-blue-600">{d.hoursWorked || "—"}</td>
                  <td className="p-2 text-center text-xs text-neutral-400">{d.totalPunches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
