import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, KeyRound, Camera, Loader2, DollarSign, Search } from "lucide-react";
import type { Employee, EmployeeSalary } from "@shared/schema";

const CARGOS = ["Vigilante", "Adm", "Gerente", "Supervisor", "Operador"];
const CATEGORIAS = ["Mensalista", "Free Lance", "Temporário", "Terceirizado"];
const FORMAS_PAGAMENTO = ["PIX", "Transferência Bancária", "Dinheiro", "Cheque"];
const ESTADO_CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];
const ESCOLARIDADE = ["Fundamental", "Médio", "Superior", "Pós-graduação", "Mestrado", "Doutorado"];

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function CreateAccessModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("funcionario");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/register", {
        username,
        password,
        name: employee.name,
        role,
        employeeId: employee.id,
      });
    },
    onSuccess: () => {
      toast({ title: "Acesso criado com sucesso" });
      setUsername("");
      setPassword("");
      setRole("funcionario");
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
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Ex: joao.silva" data-testid="input-access-username" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Senha *</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Senha de acesso" data-testid="input-access-password" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Perfil</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              data-testid="select-access-role"
            >
              <option value="funcionario">Funcionário</option>
              <option value="admin">Administrador</option>
              <option value="diretoria">Diretoria</option>
            </select>
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

function SalaryModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: salaries = [], isLoading } = useQuery<EmployeeSalary[]>({
    queryKey: ["/api/employees", employee.id, "salaries"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/employees/${employee.id}/salaries`);
      return res.json();
    },
    enabled: open,
  });

  const [form, setForm] = useState({ baseSalary: "", effectiveDate: "", reason: "", notes: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/employees/${employee.id}/salaries`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] });
      setForm({ baseSalary: "", effectiveDate: "", reason: "", notes: "" });
      toast({ title: "Salário cadastrado" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employee-salaries/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] });
      toast({ title: "Registro removido" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Salários - {employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Salário Base (R$) *</label>
              <Input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} required data-testid="input-salary-value" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Data Vigência *</label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required data-testid="input-salary-date" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Motivo</label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex: Promoção, Reajuste" data-testid="input-salary-reason" />
            </div>
            <div className="flex items-end">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.baseSalary || !form.effectiveDate} className="w-full" data-testid="button-save-salary">
                {createMutation.isPending ? "Salvando..." : "Adicionar"}
              </Button>
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-neutral-700 mb-2">Histórico Salarial</h4>
            {isLoading ? (
              <p className="text-xs text-neutral-400 text-center py-4">Carregando...</p>
            ) : salaries.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhum registro salarial</p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {salaries.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-salary-${s.id}`}>
                    <div>
                      <span className="text-sm font-semibold text-neutral-900">R$ {Number(s.baseSalary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-neutral-500 ml-2">{s.effectiveDate}</span>
                      {s.reason && <span className="text-xs text-neutral-400 ml-2">({s.reason})</span>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} data-testid={`button-delete-salary-${s.id}`}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
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

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cpfLoading, setCpfLoading] = useState(false);

  const [form, setForm] = useState({
    matricula: employee?.matricula || "",
    name: employee?.name || "",
    cpf: employee?.cpf || "",
    rg: employee?.rg || "",
    cnhNumber: employee?.cnhNumber || "",
    pis: employee?.pis || "",
    role: employee?.role || "Vigilante",
    category: employee?.category || "Mensalista",
    phone: employee?.phone || "",
    email: employee?.email || "",
    address: employee?.address || "",
    birthDate: employee?.birthDate || "",
    motherName: employee?.motherName || "",
    fatherName: employee?.fatherName || "",
    nationality: employee?.nationality || "",
    maritalStatus: employee?.maritalStatus || "",
    education: employee?.education || "",
    hireDate: employee?.hireDate || "",
    vacationExpiry: employee?.vacationExpiry || "",
    sindicato: employee?.sindicato || "",
    paymentMethod: employee?.paymentMethod || "PIX",
    bankName: employee?.bankName || "",
    bankAgency: employee?.bankAgency || "",
    bankAccount: employee?.bankAccount || "",
    pixKey: employee?.pixKey || "",
    photoUrl: employee?.photoUrl || "",
    status: employee?.status || "ativo",
    notes: employee?.notes || "",
  });

  const { data: nextMatricula } = useQuery<{ matricula: string }>({
    queryKey: ["/api/employees/next-matricula"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/employees/next-matricula");
      return res.json();
    },
    enabled: !employee,
  });

  const fetchCpfData = useCallback(async (cpf: string) => {
    const clean = cpf.replace(/\D/g, "");
    if (clean.length !== 11) return;
    setCpfLoading(true);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/cpf-lookup/${clean}`);
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({
          ...prev,
          name: data.nome || prev.name,
          birthDate: data.data_nascimento || prev.birthDate,
          motherName: data.nome_mae || prev.motherName,
        }));
        toast({ title: "Dados do CPF preenchidos" });
      }
    } catch {
      // silently fail
    } finally {
      setCpfLoading(false);
    }
  }, [toast]);

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 400;
        let w = img.width, h = img.height;
        if (w > h) { h = (maxSize * h) / w; w = maxSize; }
        else { w = (maxSize * w) / h; h = maxSize; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setForm((prev) => ({ ...prev, photoUrl: canvas.toDataURL("image/jpeg", 0.7) }));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        matricula: employee ? employee.matricula : (nextMatricula?.matricula || data.matricula),
      };
      if (employee) {
        const { matricula, ...updateData } = payload;
        await apiRequest("PATCH", `/api/employees/${employee.id}`, updateData);
      } else {
        await apiRequest("POST", "/api/employees", payload);
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

  const displayMatricula = employee ? employee.matricula : (nextMatricula?.matricula || "Gerando...");

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-employee-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{employee ? "Editar Funcionário" : "Novo Funcionário"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-6">
        <div className="flex items-start gap-6">
          <div className="shrink-0">
            <div
              className="w-24 h-24 rounded-full bg-neutral-100 border-2 border-neutral-200 flex items-center justify-center cursor-pointer overflow-hidden hover:border-neutral-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-employee-photo"
            >
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-neutral-300" />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoCapture} />
            <p className="text-[10px] text-neutral-400 text-center mt-1">Clique para foto</p>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Matrícula</label>
              <Input value={displayMatricula} disabled className="bg-neutral-50 font-mono" data-testid="input-employee-matricula" />
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
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Cargo *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-employee-role">
                {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Dados Pessoais</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <label className="text-xs text-neutral-500 mb-1 block">CPF *</label>
              <div className="flex gap-1">
                <Input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })}
                  required
                  placeholder="000.000.000-00"
                  data-testid="input-employee-cpf"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => fetchCpfData(form.cpf)} disabled={cpfLoading} title="Buscar dados do CPF" data-testid="button-cpf-lookup">
                  {cpfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">RG *</label>
              <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} required data-testid="input-employee-rg" />
            </div>
            <div className="md:col-span-1">
              <label className="text-xs text-neutral-500 mb-1 block">Nome Completo *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-employee-name" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Data de Nascimento</label>
              <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} data-testid="input-employee-birth" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Nacionalidade</label>
              <Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="Brasileira" data-testid="input-employee-nationality" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Estado Civil</label>
              <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-employee-marital">
                <option value="">Selecione</option>
                {ESTADO_CIVIL.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Nome da Mãe</label>
              <Input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} data-testid="input-employee-mother" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Nome do Pai</label>
              <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} data-testid="input-employee-father" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Escolaridade</label>
              <select value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-employee-education">
                <option value="">Selecione</option>
                {ESCOLARIDADE.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Contato e Endereço</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-employee-phone" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">E-mail</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-employee-email" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Endereço</label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-employee-address" />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Documentos e Profissional</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">CNH</label>
              <Input value={form.cnhNumber} onChange={(e) => setForm({ ...form, cnhNumber: e.target.value })} data-testid="input-employee-cnh" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">PIS</label>
              <Input value={form.pis} onChange={(e) => setForm({ ...form, pis: e.target.value })} data-testid="input-employee-pis" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-employee-category">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Data de Admissão</label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} data-testid="input-employee-hire" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Vencimento de Férias</label>
              <Input type="date" value={form.vacationExpiry} onChange={(e) => setForm({ ...form, vacationExpiry: e.target.value })} data-testid="input-employee-vacation" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Sindicato</label>
              <Input value={form.sindicato} onChange={(e) => setForm({ ...form, sindicato: e.target.value })} data-testid="input-employee-sindicato" />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Dados Bancários / Pagamento</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Forma de Pagamento</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-employee-payment">
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Banco</label>
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Ex: Itaú, Bradesco" data-testid="input-employee-bank" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Agência</label>
              <Input value={form.bankAgency} onChange={(e) => setForm({ ...form, bankAgency: e.target.value })} data-testid="input-employee-agency" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Conta</label>
              <Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} data-testid="input-employee-account" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Chave PIX</label>
              <Input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} placeholder="CPF, e-mail, celular ou chave aleatória" data-testid="input-employee-pix" />
            </div>
          </div>
        </fieldset>

        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-employee-notes" />
        </div>

        <div className="flex gap-3">
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
  const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null);
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
        <CreateAccessModal employee={accessEmployee} open={!!accessEmployee} onClose={() => setAccessEmployee(null)} />
      )}

      {salaryEmployee && (
        <SalaryModal employee={salaryEmployee} open={!!salaryEmployee} onClose={() => setSalaryEmployee(null)} />
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
                  <th className="text-left p-3 font-medium text-neutral-600">Foto</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Matrícula</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Nome</th>
                  <th className="text-left p-3 font-medium text-neutral-600">CPF</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Cargo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Categoria</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Telefone</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(employees || []).map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-employee-${e.id}`}>
                    <td className="p-3">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 overflow-hidden">
                        {e.photoUrl ? (
                          <img src={e.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs font-bold">
                            {e.name.charAt(0)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-neutral-500">{e.matricula}</td>
                    <td className="p-3 font-medium text-neutral-900">{e.name}</td>
                    <td className="p-3 text-neutral-600 text-xs font-mono">{e.cpf}</td>
                    <td className="p-3 text-neutral-600">{e.role}</td>
                    <td className="p-3 text-neutral-600 text-xs">{e.category || "-"}</td>
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
                        <Button variant="ghost" size="icon" onClick={() => setSalaryEmployee(e)} title="Salários" data-testid={`button-salary-${e.id}`}>
                          <DollarSign className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setAccessEmployee(e)} title="Criar Acesso" data-testid={`button-create-access-${e.id}`}>
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
