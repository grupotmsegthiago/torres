import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Link2, Unlink, FileText, History, Search, Upload, AlertTriangle } from "lucide-react";
import type { Weapon, WeaponAssignment, Employee } from "@shared/schema";

const WEAPON_TYPES = ["Revólver", "Pistola", "Espingarda", "Carabina", "Fuzil", "Outro"];
const CALIBERS = [".38", ".380 ACP", "9mm", ".40 S&W", ".45 ACP", "12 GA", "5.56x45mm", ".308 Win", "Outro"];

function isExpiringSoon(dateStr: string | null): "expired" | "warning" | "ok" {
  if (!dateStr) return "ok";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays < 30) return "warning";
  return "ok";
}

function WeaponForm({ weapon, onClose }: { weapon?: Weapon; onClose: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    type: weapon?.type || "Pistola",
    brand: weapon?.brand || "",
    model: weapon?.model || "",
    caliber: weapon?.caliber || "9mm",
    serialNumber: weapon?.serialNumber || "",
    registrationNumber: weapon?.registrationNumber || "",
    registrationExpiry: weapon?.registrationExpiry || "",
    registrationFileData: weapon?.registrationFileData || "",
    status: weapon?.status || "disponível",
    notes: weapon?.notes || "",
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, registrationFileData: ev.target!.result as string }));
      toast({ title: "Arquivo anexado" });
    };
    reader.readAsDataURL(file);
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (weapon) {
        await apiRequest("PATCH", `/api/weapons/${weapon.id}`, data);
      } else {
        await apiRequest("POST", "/api/weapons", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weapons"] });
      toast({ title: weapon ? "Arma atualizada" : "Arma cadastrada" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-weapon-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{weapon ? "Editar Arma" : "Nova Arma"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Tipo *</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-weapon-type">
              {WEAPON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Marca *</label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required placeholder="Ex: Taurus" data-testid="input-weapon-brand" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Modelo *</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required placeholder="Ex: G2C" data-testid="input-weapon-model" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Calibre *</label>
            <select value={form.caliber} onChange={(e) => setForm({ ...form, caliber: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-weapon-caliber">
              {CALIBERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Nº Série *</label>
            <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} required placeholder="Número de série da arma" data-testid="input-weapon-serial" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Nº Registro</label>
            <Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} placeholder="Registro junto à PF/EB" data-testid="input-weapon-registration" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Validade do Registro</label>
            <Input type="date" value={form.registrationExpiry} onChange={(e) => setForm({ ...form, registrationExpiry: e.target.value })} data-testid="input-weapon-reg-expiry" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-weapon-status">
              <option value="disponível">Disponível</option>
              <option value="em uso">Em Uso</option>
              <option value="manutenção">Manutenção</option>
              <option value="inativa">Inativa</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full">
              <label className="text-xs text-neutral-500 mb-1 block">PDF do Registro</label>
              <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-registration">
                <Upload className="w-4 h-4 mr-2" />
                {form.registrationFileData ? "Substituir PDF" : "Anexar PDF"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-weapon-notes" />
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-weapon">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

function AssignWeaponModal({ weapon, open, onClose }: { weapon: Weapon; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }), enabled: open });
  const { data: history = [], isLoading: histLoading } = useQuery<WeaponAssignment[]>({
    queryKey: ["/api/weapon-assignments", weapon.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/weapon-assignments/${weapon.id}`);
      return res.json();
    },
    enabled: open,
  });

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [notes, setNotes] = useState("");

  const assignMutation = useMutation({
    mutationFn: async (action: "vincular" | "desvincular") => {
      const empId = action === "vincular" ? parseInt(selectedEmployee) : weapon.assignedEmployeeId!;
      await apiRequest("POST", "/api/weapon-assignments", {
        weaponId: weapon.id,
        employeeId: empId,
        action,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weapons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weapon-assignments", weapon.id] });
      setSelectedEmployee("");
      setNotes("");
      toast({ title: "Operação realizada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeEmployees = employees.filter(e => e.status === "ativo");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular/Desvincular Agente - {weapon.brand} {weapon.model}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {weapon.assignedEmployeeId ? (
            <div className="bg-neutral-50 rounded-lg p-3 border">
              <p className="text-sm text-neutral-600 mb-2">
                Vinculado a: <strong className="text-neutral-900">{employees.find(e => e.id === weapon.assignedEmployeeId)?.name || `ID ${weapon.assignedEmployeeId}`}</strong>
              </p>
              <div className="flex gap-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo da desvinculação (opcional)" className="text-sm" data-testid="input-unlink-notes" />
                <Button variant="destructive" size="sm" onClick={() => assignMutation.mutate("desvincular")} disabled={assignMutation.isPending} data-testid="button-unlink-weapon">
                  <Unlink className="w-4 h-4 mr-1" /> Desvincular
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Selecione o Agente *</label>
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-assign-employee">
                  <option value="">Selecione...</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.matricula} - {e.name}</option>)}
                </select>
              </div>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)" className="text-sm" data-testid="input-link-notes" />
              <Button onClick={() => assignMutation.mutate("vincular")} disabled={assignMutation.isPending || !selectedEmployee} data-testid="button-link-weapon">
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
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-weapon-history-${h.id}`}>
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.action === "vincular" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {h.action === "vincular" ? "Vinculado" : "Desvinculado"}
                      </span>
                      <span className="text-xs text-neutral-600 ml-2">
                        {employees.find(e => e.id === h.employeeId)?.name || `ID ${h.employeeId}`}
                      </span>
                      {h.notes && <span className="text-xs text-neutral-400 ml-2">({h.notes})</span>}
                    </div>
                    <span className="text-[10px] text-neutral-400">
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

export default function WeaponsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Weapon | undefined>();
  const [assignWeapon, setAssignWeapon] = useState<Weapon | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { data: weapons = [], isLoading } = useQuery<Weapon[]>({ queryKey: ["/api/weapons"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/weapons/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/weapons"] }); toast({ title: "Arma removida" }); },
  });

  const filtered = weapons.filter(w => {
    const term = searchTerm.toLowerCase();
    return !term || w.brand.toLowerCase().includes(term) || w.model.toLowerCase().includes(term) || w.serialNumber.toLowerCase().includes(term) || w.caliber.toLowerCase().includes(term);
  });

  const expiringWeapons = weapons.filter(w => isExpiringSoon(w.registrationExpiry) !== "ok");

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-weapons-title">Armamento</h1>
          <p className="text-sm text-neutral-500 mt-1">Cadastro e controle de armas</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-weapon">
          <Plus className="w-4 h-4 mr-2" /> Nova Arma
        </Button>
      </div>

      {expiringWeapons.length > 0 && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {expiringWeapons.length} arma(s) com registro vencido ou próximo do vencimento
            </span>
          </div>
        </Card>
      )}

      {showForm && <WeaponForm weapon={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {assignWeapon && (
        <AssignWeaponModal weapon={assignWeapon} open={!!assignWeapon} onClose={() => setAssignWeapon(null)} />
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        <div className="p-3 border-b border-neutral-200">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar arma..."
              className="pl-9"
              data-testid="input-search-weapons"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma arma cadastrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-weapons">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Marca / Modelo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Calibre</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Nº Série</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Registro</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Val. Registro</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Agente</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const regStatus = isExpiringSoon(w.registrationExpiry);
                  const assignedEmp = w.assignedEmployeeId ? employees.find(e => e.id === w.assignedEmployeeId) : null;
                  return (
                    <tr key={w.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-weapon-${w.id}`}>
                      <td className="p-3 text-neutral-700">{w.type}</td>
                      <td className="p-3 font-medium text-neutral-900">{w.brand} {w.model}</td>
                      <td className="p-3 text-neutral-600">{w.caliber}</td>
                      <td className="p-3 font-mono text-xs text-neutral-500">{w.serialNumber}</td>
                      <td className="p-3 text-xs text-neutral-600">{w.registrationNumber || "-"}</td>
                      <td className="p-3">
                        {w.registrationExpiry ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            regStatus === "expired" ? "bg-red-100 text-red-700" :
                            regStatus === "warning" ? "bg-amber-100 text-amber-700" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {new Date(w.registrationExpiry).toLocaleDateString("pt-BR")}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="p-3 text-sm text-neutral-700">
                        {assignedEmp ? assignedEmp.name : <span className="text-neutral-400">-</span>}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          w.status === "disponível" ? "bg-green-100 text-green-700" :
                          w.status === "em uso" ? "bg-blue-100 text-blue-700" :
                          w.status === "manutenção" ? "bg-amber-100 text-amber-700" :
                          "bg-neutral-100 text-neutral-600"
                        }`}>{w.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="ghost" size="icon" onClick={() => setAssignWeapon(w)} title="Vincular/Desvincular" data-testid={`button-assign-weapon-${w.id}`}>
                            <Link2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          {w.registrationFileData && (
                            <Button variant="ghost" size="icon" onClick={() => {
                              const link = document.createElement("a");
                              link.href = w.registrationFileData!;
                              link.download = `registro_${w.serialNumber}.pdf`;
                              link.click();
                            }} title="Baixar Registro" data-testid={`button-download-reg-${w.id}`}>
                              <FileText className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => { setEditItem(w); setShowForm(true); }} data-testid={`button-edit-weapon-${w.id}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(w.id)} data-testid={`button-delete-weapon-${w.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
