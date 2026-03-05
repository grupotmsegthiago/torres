import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, KeyRound } from "lucide-react";
import type { Employee } from "@shared/schema";

function CreateAccessModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/register", {
        username,
        password,
        name: employee.name,
        role: "funcionario",
        employeeId: employee.id,
      });
    },
    onSuccess: () => {
      toast({ title: "Acesso criado com sucesso" });
      setUsername("");
      setPassword("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Acesso - {employee.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Usuário *</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Ex: joao.silva"
              data-testid="input-access-username"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Senha *</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Senha de acesso"
              data-testid="input-access-password"
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-access">
              {mutation.isPending ? "Criando..." : "Criar Acesso"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: employee?.name || "",
    cpf: employee?.cpf || "",
    rg: employee?.rg || "",
    role: employee?.role || "",
    phone: employee?.phone || "",
    email: employee?.email || "",
    address: employee?.address || "",
    hireDate: employee?.hireDate || "",
    status: employee?.status || "ativo",
    notes: employee?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (employee) {
        await apiRequest("PATCH", `/api/employees/${employee.id}`, data);
      } else {
        await apiRequest("POST", "/api/employees", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: employee ? "Funcionário atualizado" : "Funcionário cadastrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-employee-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{employee ? "Editar Funcionário" : "Novo Funcionário"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Nome Completo *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-employee-name" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">CPF</label>
          <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} data-testid="input-employee-cpf" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">RG</label>
          <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} data-testid="input-employee-rg" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Cargo *</label>
          <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required placeholder="Ex: Vigilante, Motorista" data-testid="input-employee-role" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Telefone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-employee-phone" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">E-mail</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-employee-email" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Data de Admissão</label>
          <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} data-testid="input-employee-hire" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Endereço</label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-employee-address" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-employee-status">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="férias">Férias</option>
            <option value="afastado">Afastado</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-employee-notes" />
        </div>
        <div className="md:col-span-2 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-employee">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function EmployeesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Employee | undefined>();
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);
  const { toast } = useToast();
  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employees/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees"] }); toast({ title: "Funcionário removido" }); },
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-employees-title">Funcionários</h1>
          <p className="text-sm text-neutral-500 mt-1">Cadastro e gestão de funcionários</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-employee">
          <Plus className="w-4 h-4 mr-2" /> Novo Funcionário
        </Button>
      </div>

      {showForm && <EmployeeForm employee={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {accessEmployee && (
        <CreateAccessModal
          employee={accessEmployee}
          open={!!accessEmployee}
          onClose={() => setAccessEmployee(null)}
        />
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (employees || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum funcionário cadastrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-employees">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Nome</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Cargo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Telefone</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(employees || []).map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-employee-${e.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{e.name}</td>
                    <td className="p-3 text-neutral-600">{e.role}</td>
                    <td className="p-3 text-neutral-600">{e.phone || "-"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        e.status === "ativo" ? "bg-green-100 text-green-700" :
                        e.status === "férias" ? "bg-blue-100 text-blue-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{e.status}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAccessEmployee(e)}
                          title="Criar Acesso"
                          data-testid={`button-create-access-${e.id}`}
                        >
                          <KeyRound className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(e); setShowForm(true); }} data-testid={`button-edit-employee-${e.id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(e.id)} data-testid={`button-delete-employee-${e.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
