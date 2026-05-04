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
import { Clock, Plus, Pencil, Trash2, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Users, ListChecks, FileSpreadsheet, ScanFace, KeyRound, Activity, Loader2, Coffee, Stethoscope, CalendarX, CalendarDays, Save, X } from "lucide-react";
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
            <TabsTrigger value="folgas" data-testid="tab-folgas"><CalendarDays className="w-3.5 h-3.5 mr-1" /> Folgas/Faltas</TabsTrigger>
            <TabsTrigger value="folha" data-testid="tab-folha"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Folha de Ponto</TabsTrigger>
          </TabsList>
          <TabsContent value="aparelhos" className="mt-4"><DevicesTab /></TabsContent>
          <TabsContent value="mapping" className="mt-4"><MappingTab /></TabsContent>
          <TabsContent value="batidas" className="mt-4"><PunchesTab /></TabsContent>
          <TabsContent value="folgas" className="mt-4"><AbsencesTab /></TabsContent>
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
