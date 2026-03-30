import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn, authFetch } from "@/lib/queryClient";
import { titleCase } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, KeyRound, Camera, Loader2, DollarSign, Search, FileText, Upload, AlertTriangle, Eye, ScanLine, CheckCircle2, ShieldCheck, Car, ClipboardList, Ban, Clock, Shield, FolderOpen, ArrowLeft, Download, Home, RefreshCw, MapPin } from "lucide-react";
import type { Employee, EmployeeSalary, EmployeeDocument } from "@shared/schema";

const CARGOS = ["Vigilante", "Adm", "Gerente", "Supervisor", "Operador"];
const CATEGORIAS = ["Mensalista", "Free Lance", "Temporário", "Terceirizado"];
const FORMAS_PAGAMENTO = ["PIX", "Transferência Bancária", "Dinheiro", "Cheque"];
const ESTADO_CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];
const ESCOLARIDADE = ["Fundamental", "Médio", "Superior", "Pós-graduação", "Mestrado", "Doutorado"];

const DOCS_WITH_EXPIRY = new Set(["CNH", "CNV", "ASO", "Certificado Formação Vigilante", "Certificado Formação Escolta Armada", "Reciclagem Escolta Armada", "Certidão de Pontuação CNH"]);
const docRequiresExpiry = (type: string) => DOCS_WITH_EXPIRY.has(type);

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function CreateAccessModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();

  const cpfDigits = employee.cpf ? employee.cpf.replace(/\D/g, "") : "";
  const hasCpf = cpfDigits.length === 11;

  const { data: existingUser, isLoading: checkingUser } = useQuery<{ id: number; email: string; role: string; mustChangePassword?: number } | null>({
    queryKey: ["/api/users/by-employee", employee.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/users/by-employee/${employee.id}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  const hasAccess = !!existingUser;
  const currentPassword = hasAccess && existingUser.mustChangePassword ? "torres@123 (padrão)" : hasAccess ? "Alterada pelo funcionário" : null;

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/register-by-cpf", {
        cpf: cpfDigits,
        name: employee.name,
        employeeId: employee.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/by-employee", employee.id] });
      toast({ title: "Acesso criado", description: "Login: CPF. Senha padrão: torres@123" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/users/${existingUser!.id}/reset-password`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/by-employee", employee.id] });
      toast({ title: "Senha resetada", description: "Nova senha: torres@123. O funcionário precisará alterá-la no próximo login." });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasAccess ? "Gerenciar Acesso" : "Criar Acesso"} - {titleCase(employee.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {checkingUser ? (
            <div className="flex items-center justify-center py-6 text-neutral-400 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Verificando...
            </div>
          ) : !hasCpf ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Dados incompletos</p>
              <p>Para criar o acesso automático, o funcionário precisa ter <strong>CPF</strong> cadastrado.</p>
            </div>
          ) : hasAccess ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Acesso ativo</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Login:</span>
                  <span className="font-semibold text-neutral-800">CPF ({formatCpf(cpfDigits)})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Senha atual:</span>
                  <span className="font-semibold text-neutral-800">{currentPassword}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Perfil:</span>
                  <span className="font-semibold text-neutral-800">{existingUser.role === "admin" ? "Administrador" : existingUser.role === "diretoria" ? "Diretoria" : "Funcionário"}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetMutation.isPending ? "Resetando..." : "Resetar Senha para torres@123"}
              </Button>
            </>
          ) : (
            <>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Login:</span>
                  <span className="font-semibold text-neutral-800">CPF ({formatCpf(cpfDigits)})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Senha padrão:</span>
                  <span className="font-semibold text-neutral-800">torres@123</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Perfil:</span>
                  <span className="font-semibold text-neutral-800">Funcionário</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">O funcionário deverá alterar a senha no primeiro acesso.</p>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full" data-testid="button-save-access">
                {createMutation.isPending ? "Criando..." : "Criar Acesso Automático"}
              </Button>
            </>
          )}
          <Button type="button" variant="outline" onClick={onClose} className="w-full">Fechar</Button>
        </div>
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
          <DialogTitle>Salários - {titleCase(employee.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Salário Base (R$) *</label>
              <Input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} required data-testid="input-salary-value" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data Vigência *</label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required data-testid="input-salary-date" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Motivo</label>
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

function isDocExpiringSoon(dateStr: string | null): "expired" | "warning" | "ok" {
  if (!dateStr) return "ok";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays < 30) return "warning";
  return "ok";
}

function DocumentsModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: docs = [], isLoading } = useQuery<EmployeeDocument[]>({
    queryKey: ["/api/employee-documents", employee.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/employee-documents/${employee.id}`);
      return res.json();
    },
    enabled: open,
  });

  const [docForm, setDocForm] = useState({
    type: "CNH",
    documentNumber: "",
    expiryDate: "",
    issueDate: "",
    notes: "",
    fileData: "",
    fileName: "",
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDocForm(prev => ({ ...prev, fileData: ev.target!.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/employee-documents", {
        employeeId: employee.id,
        type: docForm.type,
        documentNumber: docForm.documentNumber || undefined,
        expiryDate: docForm.expiryDate || undefined,
        issueDate: docForm.issueDate || undefined,
        notes: docForm.notes || undefined,
        fileData: docForm.fileData || undefined,
        fileName: docForm.fileName || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-documents", employee.id] });
      setDocForm({ type: "CNH", documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" });
      toast({ title: "Documento salvo" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employee-documents/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-documents", employee.id] });
      toast({ title: "Documento removido" });
    },
  });

  const generateContract = () => {
    const esc = (s: string | null | undefined) => (s || "N/A").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const contractHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Contrato - ${esc(employee.name)}</title>
      <style>
        body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.8; color: #000; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 30px; text-transform: uppercase; }
        h2 { text-align: center; font-size: 14px; margin-bottom: 20px; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
        .header h3 { margin: 0; }
        p { text-align: justify; margin: 10px 0; font-size: 13px; }
        .field { font-weight: bold; }
        .section { margin-top: 25px; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
        .sig-block { text-align: center; width: 45%; }
        .sig-line { border-top: 1px solid #000; padding-top: 5px; margin-top: 60px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        td { padding: 6px 10px; border: 1px solid #ccc; font-size: 12px; }
        td:first-child { font-weight: bold; background: #f5f5f5; width: 35%; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <div class="header">
        <h3>TORRES VIGILÂNCIA PATRIMONIAL LTDA</h3>
        <p style="font-size:11px;text-align:center;">CNPJ: 36.982.392/0001-89</p>
      </div>
      <h1>CONTRATO DE TRABALHO</h1>
      <h2>CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO</h2>
      <div class="section">
        <p>Pelo presente instrumento particular de contrato individual de trabalho, de um lado <span class="field">TORRES VIGILÂNCIA PATRIMONIAL LTDA</span>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 36.982.392/0001-89, doravante denominada <span class="field">EMPREGADORA</span>, e de outro lado:</p>
        <table>
          <tr><td>Nome Completo</td><td>${esc(employee.name)}</td></tr>
          <tr><td>CPF</td><td>${esc(employee.cpf)}</td></tr>
          <tr><td>RG</td><td>${esc(employee.rg)}</td></tr>
          <tr><td>CNH</td><td>${esc(employee.cnhNumber)}</td></tr>
          <tr><td>Data de Nascimento</td><td>${esc(employee.birthDate)}</td></tr>
          <tr><td>Nacionalidade</td><td>${employee.nationality ? esc(employee.nationality) : "Brasileira"}</td></tr>
          <tr><td>Estado Civil</td><td>${esc(employee.maritalStatus)}</td></tr>
          <tr><td>Nome da Mãe</td><td>${esc(employee.motherName)}</td></tr>
          <tr><td>Endereço</td><td>${esc(employee.address)}</td></tr>
          <tr><td>Telefone</td><td>${esc(employee.phone)}</td></tr>
          <tr><td>E-mail</td><td>${esc(employee.email)}</td></tr>
          <tr><td>PIS</td><td>${esc(employee.pis)}</td></tr>
          <tr><td>Matrícula</td><td>${esc(employee.matricula)}</td></tr>
          <tr><td>Cargo</td><td>${esc(employee.role)}</td></tr>
          <tr><td>Categoria</td><td>${employee.category ? esc(employee.category) : "Mensalista"}</td></tr>
          <tr><td>Data de Admissão</td><td>${employee.hireDate ? esc(employee.hireDate) : new Date().toLocaleDateString("pt-BR")}</td></tr>
        </table>
        <p>Doravante denominado(a) <span class="field">EMPREGADO(A)</span>, têm entre si, justo e contratado, o presente contrato de trabalho, que se regerá pelas cláusulas e condições a seguir estipuladas:</p>
      </div>
      <div class="section">
        <p><strong>CLÁUSULA 1ª - DA FUNÇÃO:</strong> O(A) EMPREGADO(A) é admitido(a) para exercer a função de <span class="field">${esc(employee.role)}</span>, obrigando-se a executar as tarefas que lhe forem atribuídas, compatíveis com sua qualificação profissional.</p>
        <p><strong>CLÁUSULA 2ª - DO LOCAL DE TRABALHO:</strong> O(A) EMPREGADO(A) prestará seus serviços na sede da EMPREGADORA ou em locais por ela determinados, conforme necessidade operacional, incluindo atividades externas como escoltas armadas e vigilância patrimonial.</p>
        <p><strong>CLÁUSULA 3ª - DA JORNADA DE TRABALHO:</strong> A jornada de trabalho será conforme escala definida pela EMPREGADORA, respeitando os limites legais estabelecidos pela CLT e legislação vigente.</p>
        <p><strong>CLÁUSULA 4ª - DA REMUNERAÇÃO:</strong> A título de remuneração, o(a) EMPREGADO(A) receberá salário conforme o acordado entre as partes e registrado em sistema, pagamento via ${employee.paymentMethod ? esc(employee.paymentMethod) : "PIX"}.</p>
        <p><strong>CLÁUSULA 5ª - DAS OBRIGAÇÕES DO EMPREGADO:</strong> O(A) EMPREGADO(A) se compromete a: (a) Manter sigilo absoluto sobre informações da empresa e dos clientes; (b) Zelar pelos equipamentos, armamentos e viaturas sob sua responsabilidade; (c) Manter documentação profissional válida (CNH, CNV, certificados); (d) Cumprir normas de segurança e protocolos operacionais; (e) Apresentar-se adequadamente fardado e equipado para o serviço.</p>
        <p><strong>CLÁUSULA 6ª - DO ARMAMENTO E EQUIPAMENTOS:</strong> O(A) EMPREGADO(A) será responsável pelo armamento e equipamentos que lhe forem entregues durante o exercício de suas funções, devendo zelar por sua conservação e utilização conforme normas vigentes.</p>
        <p><strong>CLÁUSULA 7ª - DAS DISPOSIÇÕES GERAIS:</strong> O presente contrato obedecerá ao que dispõe a Consolidação das Leis do Trabalho (CLT) e demais legislações pertinentes.</p>
      </div>
      <p style="margin-top:30px;text-align:center;font-size:12px;">E por estarem de pleno acordo, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>
      <p style="text-align:center;font-size:12px;margin-top:15px;">Local e Data: _________________________, ____/____/________</p>
      <div class="signatures">
        <div class="sig-block"><div class="sig-line">TORRES VIGILÂNCIA PATRIMONIAL LTDA<br/>CNPJ: 36.982.392/0001-89</div></div>
        <div class="sig-block"><div class="sig-line">${esc(employee.name)}<br/>CPF: ${esc(employee.cpf)}</div></div>
      </div>
      </body></html>
    `;
    const w = window.open("", "_blank");
    if (w) { w.document.write(contractHtml); w.document.close(); w.print(); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Documentos - {titleCase(employee.name)}</span>
            <Button variant="outline" size="sm" onClick={generateContract} data-testid="button-generate-contract">
              <FileText className="w-4 h-4 mr-1" /> Gerar Contrato
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="border border-neutral-200 rounded-lg p-4">
            <legend className="text-xs font-semibold text-neutral-600 px-2">Adicionar Documento</legend>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Tipo *</label>
                <select value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-doc-type">
                  <option value="CNH">CNH</option>
                  <option value="CNV">CNV</option>
                  <option value="RG">RG</option>
                  <option value="CPF">CPF</option>
                  <option value="CTPS">CTPS</option>
                  <option value="PIS/PASEP/NIS">PIS/PASEP/NIS</option>
                  <option value="Comprovante de Residência">Comprovante de Residência</option>
                  <option value="Fotos 3x4">Fotos 3x4</option>
                  <option value="Título de Eleitor">Título de Eleitor</option>
                  <option value="Certificado de Reservista">Certificado de Reservista</option>
                  <option value="Certidão de Pontuação CNH">Certidão de Pontuação CNH</option>
                  <option value="Dados Bancários">Dados Bancários</option>
                  <option value="Certificado Formação Vigilante">Certificado Formação Vigilante</option>
                  <option value="Certificado Formação Escolta Armada">Certificado Formação Escolta Armada</option>
                  <option value="Reciclagem Escolta Armada">Reciclagem Escolta Armada</option>
                  <option value="ASO">ASO</option>
                  <option value="Certidão Nascimento/Casamento">Certidão Nascimento/Casamento</option>
                  <option value="Certidão Nascimento Filhos">Certidão Nascimento Filhos</option>
                  <option value="Antecedente Criminal Polícia Civil">Antecedente Criminal Polícia Civil</option>
                  <option value="Antecedente Criminal Polícia Militar">Antecedente Criminal Polícia Militar</option>
                  <option value="Certidão de COP">Certidão de COP</option>
                  <option value="Contrato Assinado">Contrato Assinado</option>
                  <option value="Certificado Curso">Certificado Curso</option>
                  <option value="Atestado">Atestado</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nº Documento</label>
                <Input value={docForm.documentNumber} onChange={(e) => setDocForm({ ...docForm, documentNumber: e.target.value })} placeholder="Número" data-testid="input-doc-number" />
              </div>
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data Emissão</label>
                <Input type="date" value={docForm.issueDate} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} data-testid="input-doc-issue" />
              </div>
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Validade{docRequiresExpiry(docForm.type) ? " *" : ""}</label>
                <Input type="date" value={docForm.expiryDate} onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} data-testid="input-doc-expiry" />
              </div>
              <div>
                <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Foto/PDF</label>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()} data-testid="button-upload-doc">
                  <Upload className="w-3 h-3 mr-1" /> {docForm.fileName || "Anexar"}
                </Button>
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !docForm.type} className="w-full" data-testid="button-save-doc">
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </fieldset>

          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-neutral-700 mb-2">Documentos Cadastrados</h4>
            {isLoading ? (
              <p className="text-xs text-neutral-400 text-center py-4">Carregando...</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhum documento</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {docs.map((d) => {
                  const status = isDocExpiringSoon(d.expiryDate);
                  return (
                    <div key={d.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-doc-${d.id}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                          d.type === "CNH" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                          d.type === "CNV" ? "bg-violet-50 text-violet-700 border border-violet-200" :
                          d.type === "Comprovante de Residência" ? "bg-teal-50 text-teal-700 border border-teal-200" :
                          "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}>{d.type}</span>
                        <div className="min-w-0">
                          {d.documentNumber && <span className="text-xs text-neutral-600 font-mono">{d.documentNumber}</span>}
                          {d.expiryDate && (
                            <span className={`text-xs ml-2 px-1.5 py-0.5 rounded font-medium ${
                              status === "expired" ? "bg-red-100 text-red-700" :
                              status === "warning" ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            }`}>
                              {status === "expired" ? "VENCIDO " : status === "warning" ? "VENCE EM BREVE " : "Val. "}
                              {new Date(d.expiryDate).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {d.fileData && (
                          <Button variant="ghost" size="icon" onClick={() => {
                            if (d.fileData!.startsWith("data:application/pdf") || d.fileData!.startsWith("data:image")) {
                              const w = window.open("", "_blank");
                              if (w) {
                                if (d.fileData!.startsWith("data:image")) {
                                  w.document.write(`<img src="${d.fileData}" style="max-width:100%" />`);
                                } else {
                                  w.document.write(`<iframe src="${d.fileData}" style="width:100%;height:100vh;border:none" />`);
                                }
                              }
                            }
                          }} title="Visualizar" data-testid={`button-view-doc-${d.id}`}>
                            <Eye className="w-3 h-3 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} data-testid={`button-delete-doc-${d.id}`}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
  const cnhFileRef = useRef<HTMLInputElement>(null);
  const cnvFileRef = useRef<HTMLInputElement>(null);
  const residFileRef = useRef<HTMLInputElement>(null);
  const [cpfLoading, setCpfLoading] = useState(false);

  type DocAttachment = { fileData: string; fileName: string; scanning: boolean };
  const [docAttachments, setDocAttachments] = useState<Record<string, DocAttachment>>({
    CNH: { fileData: "", fileName: "", scanning: false },
    CNV: { fileData: "", fileName: "", scanning: false },
    "Comprovante de Residência": { fileData: "", fileName: "", scanning: false },
  });

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
    addressLat: (employee as any)?.addressLat || null,
    addressLng: (employee as any)?.addressLng || null,
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
    blockType: employee?.blockType || "",
    blockReason: employee?.blockReason || "",
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
    if (clean.length !== 11) {
      toast({ title: "CPF incompleto", description: "Digite os 11 dígitos do CPF", variant: "destructive" });
      return;
    }
    setCpfLoading(true);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/cpf-lookup/${clean}`);
      if (res.ok) {
        const data = await res.json();
        const filledFields: string[] = [];
        setForm((prev) => {
          const updated = { ...prev };
          if (data.nome && !prev.name) { updated.name = data.nome; filledFields.push("Nome"); }
          if (data.data_nascimento && !prev.birthDate) { updated.birthDate = data.data_nascimento; filledFields.push("Nascimento"); }
          if (data.nome_mae && !prev.motherName) { updated.motherName = data.nome_mae; filledFields.push("Mãe"); }
          if (data.nome_pai && !prev.fatherName) { updated.fatherName = data.nome_pai; filledFields.push("Pai"); }
          if (data.sexo && !prev.nationality) {
            updated.nationality = "Brasileira";
            filledFields.push("Nacionalidade");
          }
          return updated;
        });
        if (filledFields.length > 0) {
          toast({ title: "Dados preenchidos via CPF", description: filledFields.join(", ") });
        } else {
          toast({ title: "CPF consultado", description: "Nenhum dado novo encontrado ou campos já preenchidos" });
        }
      } else {
        const err = await res.json().catch(() => ({ message: "Erro desconhecido" }));
        toast({ title: "Erro na consulta", description: err.message || "CPF não encontrado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Não foi possível consultar o CPF", variant: "destructive" });
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

  const compressImage = useCallback((dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      if (dataUrl.startsWith("data:application/pdf")) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (maxDim * h) / w; w = maxDim; }
          else { w = (maxDim * w) / h; h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }, []);

  const runOcrAndFillForm = useCallback(async (dataUrl: string, docType: string) => {
    try {
      const res = await authFetch("/api/employees/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: "Erro desconhecido" }));
        console.error("OCR error response:", errBody);
        return null;
      }

      const extracted = await res.json();
      console.log("OCR extracted:", extracted);
      return extracted;
    } catch (err) {
      console.error("OCR fetch error:", err);
      return null;
    }
  }, []);

  const applyOcrToForm = useCallback((extracted: any, docType: string) => {
    if (!extracted) return;
    const filledFields: string[] = [];
    const val = (v: any) => typeof v === "string" && v.trim().length > 0 ? v.trim() : "";

    setForm((prev) => {
      const updated = { ...prev };
      const n = val(extracted.name);
      const cpf = val(extracted.cpf);
      const rg = val(extracted.rg);
      const cnh = val(extracted.cnhNumber);
      const birth = val(extracted.birthDate);
      const mother = val(extracted.motherName);
      const father = val(extracted.fatherName);
      const nat = val(extracted.nationality);
      const marital = val(extracted.maritalStatus);
      const addr = val(extracted.address);

      if (n && !prev.name) { updated.name = n; filledFields.push("Nome"); }
      if (cpf && !prev.cpf) { updated.cpf = cpf; filledFields.push("CPF"); }
      if (rg && !prev.rg) { updated.rg = rg; filledFields.push("RG"); }
      if (cnh && !prev.cnhNumber) { updated.cnhNumber = cnh; filledFields.push("CNH"); }
      if (birth && !prev.birthDate) { updated.birthDate = birth; filledFields.push("Nascimento"); }
      if (mother && !prev.motherName) { updated.motherName = mother; filledFields.push("Mãe"); }
      if (father && !prev.fatherName) { updated.fatherName = father; filledFields.push("Pai"); }
      if (nat && !prev.nationality) { updated.nationality = nat; filledFields.push("Nacionalidade"); }
      if (marital && !prev.maritalStatus) { updated.maritalStatus = marital; filledFields.push("Est. Civil"); }
      if (addr && !prev.address) { updated.address = addr; filledFields.push("Endereço"); }
      return updated;
    });

    if (filledFields.length > 0) {
      toast({ title: `${docType} processada`, description: `Dados extraídos: ${filledFields.join(", ")}` });
    } else {
      toast({ title: `${docType} anexada`, description: "Nenhum dado novo extraído do documento" });
    }
  }, [toast]);

  const handleDocAttachment = useCallback(async (docType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setDocAttachments(prev => ({ ...prev, [docType]: { ...prev[docType], scanning: true } }));

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target!.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setDocAttachments(prev => ({
        ...prev,
        [docType]: { fileData: dataUrl, fileName: file.name, scanning: true },
      }));

      const compressedUrl = await compressImage(dataUrl);
      const extracted = await runOcrAndFillForm(compressedUrl, docType);

      if (extracted) {
        if (docType === "Comprovante de Residência") {
          const addr = typeof extracted.address === "string" && extracted.address.trim() ? extracted.address.trim() : "";
          if (addr) {
            setForm((prev) => ({ ...prev, address: prev.address || addr }));
            toast({ title: "Comprovante processado", description: `Endereço extraído: ${addr}` });
          } else {
            toast({ title: "Comprovante anexado", description: "Endereço não identificado — preencha manualmente" });
          }
        } else {
          applyOcrToForm(extracted, docType);
        }
      } else {
        toast({ title: `${docType} anexada`, description: "Documento salvo. Leitura automática indisponível." });
      }
    } catch (err: any) {
      console.error("Doc attachment error:", err);
      toast({ title: "Erro ao anexar", description: err.message || "Tente novamente", variant: "destructive" });
      setDocAttachments(prev => ({ ...prev, [docType]: { fileData: "", fileName: "", scanning: false } }));
      return;
    } finally {
      setDocAttachments(prev => ({ ...prev, [docType]: { ...prev[docType], scanning: false } }));
    }
  }, [toast, runOcrAndFillForm, applyOcrToForm, compressImage]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        matricula: employee ? employee.matricula : (nextMatricula?.matricula || data.matricula),
      };
      let employeeId: number;
      let autoUserInfo: { autoUserCreated?: boolean; autoUserError?: string | null } = {};
      if (employee) {
        const { matricula, ...updateData } = payload;
        const res = await apiRequest("PATCH", `/api/employees/${employee.id}`, updateData);
        employeeId = employee.id;
      } else {
        const res = await apiRequest("POST", "/api/employees", payload);
        const created = await res.json();
        employeeId = created.id;
        autoUserInfo = created;
      }

      if (!employee) {
        const docsToCreate = Object.entries(docAttachments).filter(
          ([_, att]) => att.fileData
        );
        for (const [docType, att] of docsToCreate) {
          try {
            await apiRequest("POST", "/api/employee-documents", {
              employeeId,
              type: docType,
              fileData: att.fileData,
              fileName: att.fileName,
            });
          } catch {}
        }
      }
      return autoUserInfo;
    },
    onSuccess: (autoUserInfo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      const attachedCount = Object.values(docAttachments).filter(a => a.fileData).length;
      const docMsg = !employee && attachedCount > 0 ? ` com ${attachedCount} documento(s)` : "";
      if (!employee && autoUserInfo?.autoUserCreated) {
        toast({ title: `Funcionário cadastrado${docMsg}`, description: "Login criado automaticamente via CPF. Senha padrão: torres@123 (será alterada no primeiro acesso)." });
      } else if (!employee && autoUserInfo?.autoUserError) {
        toast({ title: `Funcionário cadastrado${docMsg}`, description: `Aviso: login não criado — ${autoUserInfo.autoUserError}` });
      } else {
        toast({ title: employee ? "Funcionário atualizado" : `Funcionário cadastrado${docMsg}` });
      }
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

      {!employee && (
        <div className="mb-5" data-testid="ocr-employee-upload">
          <div className="flex items-center gap-2 mb-3">
            <ScanLine className="w-5 h-5 text-neutral-500" />
            <h3 className="text-sm font-semibold text-neutral-700">Documentos Obrigatórios</h3>
            <span className="text-xs text-neutral-400">— Anexe os documentos e os dados serão preenchidos automaticamente</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { type: "CNH", label: "CNH", icon: Car, ref: cnhFileRef, desc: "Carteira Nacional de Habilitação" },
              { type: "CNV", label: "CNV", icon: ShieldCheck, ref: cnvFileRef, desc: "Certificado Nacional de Vigilante" },
              { type: "Comprovante de Residência", label: "Comp. Residência", icon: Home, ref: residFileRef, desc: "Comprovante de endereço atualizado" },
            ] as const).map(({ type, label, icon: Icon, ref, desc }) => {
              const att = docAttachments[type];
              return (
                <div key={type} className="relative">
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleDocAttachment(type, e)}
                    disabled={att.scanning}
                  />
                  <div
                    className={`p-3 border-2 border-dashed rounded-lg cursor-pointer transition-all text-center ${
                      att.fileData
                        ? "border-green-300 bg-green-50"
                        : "border-neutral-300 bg-neutral-50 hover:border-neutral-400"
                    }`}
                    onClick={() => !att.scanning && ref.current?.click()}
                    data-testid={`upload-doc-${type.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {att.scanning ? (
                      <div className="flex flex-col items-center gap-1 py-1">
                        <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                        <p className="text-xs text-neutral-500">Processando...</p>
                      </div>
                    ) : att.fileData ? (
                      <div className="flex flex-col items-center gap-1 py-1">
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                        <p className="text-xs font-medium text-green-700">{label} anexada</p>
                        <p className="text-xs text-green-600 truncate max-w-full">{att.fileName}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 py-1">
                        <Icon className="w-6 h-6 text-neutral-400" />
                        <p className="text-xs font-medium text-neutral-600">{label}</p>
                        <p className="text-xs text-neutral-500">{desc}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={async (e) => {
        e.preventDefault();
        if (form.status === "bloqueado_definitivo") {
          if (!form.blockType) {
            toast({ title: "Campo obrigatório", description: "Selecione o tipo de bloqueio (Criminal, Processo ou Ambos)", variant: "destructive" });
            return;
          }
          if (!form.blockReason.trim()) {
            toast({ title: "Campo obrigatório", description: "O motivo do bloqueio é obrigatório", variant: "destructive" });
            return;
          }
        }
        const submitData = { ...form };
        if (submitData.status !== "bloqueado_definitivo") {
          submitData.blockType = "";
          submitData.blockReason = "";
        }
        if (submitData.address && (!submitData.addressLat || !submitData.addressLng) && window.google?.maps?.Geocoder) {
          try {
            const geocoder = new window.google.maps.Geocoder();
            const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
              geocoder.geocode({ address: submitData.address, region: "br" }, (results, status) => {
                if (status === "OK" && results && results.length > 0) resolve(results);
                else reject(new Error(status));
              });
            });
            const loc = result[0].geometry.location;
            submitData.addressLat = loc.lat();
            submitData.addressLng = loc.lng();
          } catch {}
        }
        mutation.mutate(submitData);
      }} className="space-y-6">
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
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Matrícula</label>
              <Input value={displayMatricula} disabled className="bg-neutral-50 font-mono" data-testid="input-employee-matricula" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Status</label>
              <select value={form.status} onChange={(e) => {
                const newStatus = e.target.value;
                setForm({ ...form, status: newStatus, blockType: newStatus !== "bloqueado_definitivo" ? "" : form.blockType, blockReason: newStatus !== "bloqueado_definitivo" ? "" : form.blockReason });
              }} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-status">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="férias">Férias</option>
                <option value="afastado">Afastado</option>
                <option value="bloqueado_definitivo">Bloqueado Definitivo</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Cargo *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" required data-testid="select-employee-role">
                {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {form.status === "bloqueado_definitivo" && (
          <fieldset className="border-2 border-red-300 rounded-lg p-4 bg-red-50/50">
            <legend className="text-xs font-semibold text-red-700 px-2 flex items-center gap-1">
              <Ban className="w-3.5 h-3.5" />
              Bloqueio Definitivo
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-red-600 mb-1 block font-medium">Tipo de Bloqueio *</label>
                <select
                  value={form.blockType}
                  onChange={(e) => setForm({ ...form, blockType: e.target.value })}
                  className="w-full h-10 border border-red-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10 outline-none transition-all duration-200"
                  data-testid="select-employee-block-type"
                >
                  <option value="">Selecione...</option>
                  <option value="criminal">Criminal</option>
                  <option value="processo">Processo</option>
                  <option value="ambos">Ambos (Criminal + Processo)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-red-600 mb-1 block font-medium">Motivo do Bloqueio *</label>
                <Textarea
                  value={form.blockReason}
                  onChange={(e) => setForm({ ...form, blockReason: e.target.value })}
                  placeholder="Descreva o motivo do bloqueio..."
                  rows={2}
                  className="border-red-200 bg-white"
                  data-testid="input-employee-block-reason"
                />
              </div>
            </div>
          </fieldset>
        )}

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Dados Pessoais</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CPF *</label>
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
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">RG *</label>
              <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} required data-testid="input-employee-rg" />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nome Completo *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-employee-name" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data de Nascimento</label>
              <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} data-testid="input-employee-birth" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nacionalidade</label>
              <Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="Brasileira" data-testid="input-employee-nationality" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Estado Civil</label>
              <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-marital">
                <option value="">Selecione</option>
                {ESTADO_CIVIL.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nome da Mãe</label>
              <Input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} data-testid="input-employee-mother" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nome do Pai</label>
              <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} data-testid="input-employee-father" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Escolaridade</label>
              <select value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-education">
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
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-employee-phone" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">E-mail</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-employee-email" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Endereço</label>
              <PlacesAutocomplete
                value={form.address}
                onChange={(val) => setForm({ ...form, address: val })}
                onPlaceSelect={(p) => setForm((prev) => ({ ...prev, address: p.address, addressLat: p.lat, addressLng: p.lng }))}
                placeholder="Buscar endereço..."
                theme="light"
                data-testid="input-employee-address"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Documentos e Profissional</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CNH</label>
              <Input value={form.cnhNumber} onChange={(e) => setForm({ ...form, cnhNumber: e.target.value })} data-testid="input-employee-cnh" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">PIS</label>
              <Input value={form.pis} onChange={(e) => setForm({ ...form, pis: e.target.value })} data-testid="input-employee-pis" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-category">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data de Admissão</label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} data-testid="input-employee-hire" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Vencimento de Férias</label>
              <Input type="date" value={form.vacationExpiry} onChange={(e) => setForm({ ...form, vacationExpiry: e.target.value })} data-testid="input-employee-vacation" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Sindicato</label>
              <Input value={form.sindicato} onChange={(e) => setForm({ ...form, sindicato: e.target.value })} data-testid="input-employee-sindicato" />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Dados Bancários / Pagamento</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Forma de Pagamento</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-payment">
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Banco</label>
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Ex: Itaú, Bradesco" data-testid="input-employee-bank" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Agência</label>
              <Input value={form.bankAgency} onChange={(e) => setForm({ ...form, bankAgency: e.target.value })} data-testid="input-employee-agency" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Conta</label>
              <Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} data-testid="input-employee-account" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Chave PIX</label>
              <Input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} placeholder="CPF, e-mail, celular ou chave aleatória" data-testid="input-employee-pix" />
            </div>
          </div>
        </fieldset>

        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
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

type HRTab = "absences" | "fines" | "disciplinary" | "timesheets" | "payslips";
const HR_TABS: { key: HRTab; label: string; icon: any }[] = [
  { key: "absences", label: "Faltas / Atestados", icon: AlertTriangle },
  { key: "fines", label: "Multas", icon: Ban },
  { key: "disciplinary", label: "Disciplinar", icon: Shield },
  { key: "timesheets", label: "Folha de Ponto", icon: Clock },
  { key: "payslips", label: "Holerite", icon: DollarSign },
];

type PastaTab = "documentos" | "multas" | "disciplinar" | "faltas" | "ponto" | "holerite" | "salarios" | "contrato";
const PASTA_TABS: { key: PastaTab; label: string; icon: any }[] = [
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "contrato", label: "Contrato", icon: ClipboardList },
  { key: "multas", label: "Multas", icon: Ban },
  { key: "disciplinar", label: "Disciplinar", icon: Shield },
  { key: "faltas", label: "Faltas", icon: AlertTriangle },
  { key: "ponto", label: "Ponto", icon: Clock },
  { key: "holerite", label: "Holerite", icon: DollarSign },
  { key: "salarios", label: "Salários", icon: DollarSign },
];

const ABSENCE_TYPES = ["Falta", "Atestado Médico", "Licença", "Suspensão", "Outro"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function HRDialog({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<HRTab>("absences");

  const { data: absences = [], isLoading: loadingAbs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "absences"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/absences`); return r.json(); },
    enabled: open,
  });
  const { data: fines = [], isLoading: loadingFines } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "fines"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/fines`); return r.json(); },
    enabled: open,
  });
  const { data: timesheets = [], isLoading: loadingTs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "timesheets"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/timesheets`); return r.json(); },
    enabled: open,
  });
  const { data: payslips = [], isLoading: loadingPs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "payslips"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/payslips`); return r.json(); },
    enabled: open,
  });

  const [showAbsForm, setShowAbsForm] = useState(false);
  const [absForm, setAbsForm] = useState({ type: "Falta", startDate: "", endDate: "", reason: "", status: "pendente" });
  const addAbsence = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/absences`, absForm); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "absences"] }); setShowAbsForm(false); setAbsForm({ type: "Falta", startDate: "", endDate: "", reason: "", status: "pendente" }); toast({ title: "Falta/atestado registrado" }); },
  });
  const deleteAbsence = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/absences/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "absences"] }); toast({ title: "Registro removido" }); },
  });

  const [showFineForm, setShowFineForm] = useState(false);
  const [fineForm, setFineForm] = useState({ date: "", infraction: "", amount: "", points: "", status: "pendente", notes: "" });
  const addFine = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/fines`, { ...fineForm, amount: fineForm.amount ? Number(fineForm.amount) : null, points: fineForm.points ? Number(fineForm.points) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "fines"] }); setShowFineForm(false); setFineForm({ date: "", infraction: "", amount: "", points: "", status: "pendente", notes: "" }); toast({ title: "Multa registrada" }); },
  });
  const deleteFine = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/fines/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "fines"] }); toast({ title: "Multa removida" }); },
  });

  const { data: disciplinary = [], isLoading: loadingDisc } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "disciplinary"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/disciplinary`); return r.json(); },
    enabled: open,
  });

  const [showDiscForm, setShowDiscForm] = useState(false);
  const [discForm, setDiscForm] = useState({ type: "Advertência", date: "", reason: "", description: "", status: "ativa" });
  const addDisciplinary = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/disciplinary`, discForm); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "disciplinary"] }); setShowDiscForm(false); setDiscForm({ type: "Advertência", date: "", reason: "", description: "", status: "ativa" }); toast({ title: "Registro disciplinar adicionado" }); },
  });
  const deleteDisciplinary = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/disciplinary/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "disciplinary"] }); toast({ title: "Registro removido" }); },
  });

  const [showTsForm, setShowTsForm] = useState(false);
  const [tsForm, setTsForm] = useState({ date: "", clockIn: "", clockOut: "", lunchOut: "", lunchIn: "", overtime: "", notes: "" });
  const addTimesheet = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/timesheets`, { ...tsForm, overtime: tsForm.overtime ? Number(tsForm.overtime) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "timesheets"] }); setShowTsForm(false); setTsForm({ date: "", clockIn: "", clockOut: "", lunchOut: "", lunchIn: "", overtime: "", notes: "" }); toast({ title: "Ponto registrado" }); },
  });
  const deleteTimesheet = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/timesheets/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "timesheets"] }); toast({ title: "Ponto removido" }); },
  });
  const [pontoDetalhe, setPontoDetalhe] = useState<any>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const openPontoDetalhe = async (tsId: number) => {
    setLoadingDetalhe(true);
    try {
      const r = await authFetch(`/api/employees/${employee.id}/ponto-detalhado/${tsId}`);
      if (!r.ok) throw new Error("Erro ao carregar detalhes");
      const data = await r.json();
      setPontoDetalhe(data);
    } catch { toast({ title: "Erro ao carregar detalhes do ponto", variant: "destructive" }); }
    setLoadingDetalhe(false);
  };

  const [showPsForm, setShowPsForm] = useState(false);
  const [psForm, setPsForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), grossSalary: "", netSalary: "", deductions: "", benefits: "", notes: "" });
  const addPayslip = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/payslips`, { ...psForm, grossSalary: psForm.grossSalary ? Number(psForm.grossSalary) : null, netSalary: psForm.netSalary ? Number(psForm.netSalary) : null, deductions: psForm.deductions ? Number(psForm.deductions) : null, benefits: psForm.benefits ? Number(psForm.benefits) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); setShowPsForm(false); setPsForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), grossSalary: "", netSalary: "", deductions: "", benefits: "", notes: "" }); toast({ title: "Holerite registrado" }); },
  });
  const deletePayslip = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/payslips/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); toast({ title: "Holerite removido" }); },
  });

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "-";
  const fmtCurrency = (v: number | null) => v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">RH — {titleCase(employee.name)}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-neutral-200 mb-4">
          {HR_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${tab === t.key ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"}`}
              data-testid={`tab-hr-${t.key}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "absences" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Faltas e Atestados</h3>
              <Button size="sm" onClick={() => setShowAbsForm(!showAbsForm)} data-testid="button-add-absence"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showAbsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={absForm.type} onChange={(e) => setAbsForm({ ...absForm, type: e.target.value })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-absence-type">
                    {ABSENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={absForm.status} onChange={(e) => setAbsForm({ ...absForm, status: e.target.value })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-absence-status">
                    <option value="pendente">Pendente</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={absForm.startDate} onChange={(e) => setAbsForm({ ...absForm, startDate: e.target.value })} placeholder="Data Início" data-testid="input-absence-start" />
                  <Input type="date" value={absForm.endDate} onChange={(e) => setAbsForm({ ...absForm, endDate: e.target.value })} placeholder="Data Fim" data-testid="input-absence-end" />
                </div>
                <Input value={absForm.reason} onChange={(e) => setAbsForm({ ...absForm, reason: e.target.value })} placeholder="Motivo" data-testid="input-absence-reason" />
                <Button size="sm" onClick={() => addAbsence.mutate()} disabled={!absForm.startDate || addAbsence.isPending} data-testid="button-save-absence">Salvar</Button>
              </div>
            )}
            {loadingAbs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : absences.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum registro</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Início</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Fim</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Motivo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((a: any) => (
                    <tr key={a.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{a.type}</td>
                      <td className="px-3 py-2">{fmtDate(a.startDate)}</td>
                      <td className="px-3 py-2">{fmtDate(a.endDate)}</td>
                      <td className="px-3 py-2 text-neutral-500">{a.reason || "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${a.status === "aprovado" ? "bg-green-50 text-green-700" : a.status === "rejeitado" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>{a.status}</span>
                      </td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deleteAbsence.mutate(a.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "fines" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Multas de Trânsito</h3>
              <Button size="sm" onClick={() => setShowFineForm(!showFineForm)} data-testid="button-add-fine"><Plus className="w-4 h-4 mr-1" />Nova</Button>
            </div>
            {showFineForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <Input type="date" value={fineForm.date} onChange={(e) => setFineForm({ ...fineForm, date: e.target.value })} placeholder="Data" data-testid="input-fine-date" />
                <Input value={fineForm.infraction} onChange={(e) => setFineForm({ ...fineForm, infraction: e.target.value })} placeholder="Infração" data-testid="input-fine-infraction" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={fineForm.amount} onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })} placeholder="Valor (R$)" data-testid="input-fine-amount" />
                  <Input type="number" value={fineForm.points} onChange={(e) => setFineForm({ ...fineForm, points: e.target.value })} placeholder="Pontos" data-testid="input-fine-points" />
                </div>
                <select value={fineForm.status} onChange={(e) => setFineForm({ ...fineForm, status: e.target.value })} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-fine-status">
                  <option value="pendente">Pendente</option>
                  <option value="paga">Paga</option>
                  <option value="contestada">Contestada</option>
                </select>
                <Input value={fineForm.notes} onChange={(e) => setFineForm({ ...fineForm, notes: e.target.value })} placeholder="Observações" data-testid="input-fine-notes" />
                <Button size="sm" onClick={() => addFine.mutate()} disabled={!fineForm.date || !fineForm.infraction || addFine.isPending} data-testid="button-save-fine">Salvar</Button>
              </div>
            )}
            {loadingFines ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : fines.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhuma multa registrada</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Infração</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Valor</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Pontos</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {fines.map((f: any) => (
                    <tr key={f.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{fmtDate(f.date)}</td>
                      <td className="px-3 py-2">{f.infraction}</td>
                      <td className="px-3 py-2">{fmtCurrency(f.amount)}</td>
                      <td className="px-3 py-2">{f.points ?? "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${f.status === "paga" ? "bg-green-50 text-green-700" : f.status === "contestada" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>{f.status}</span>
                      </td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deleteFine.mutate(f.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "disciplinary" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-700">Advertências e Suspensões</h3>
              <Button size="sm" variant="outline" onClick={() => setShowDiscForm(!showDiscForm)} data-testid="button-add-disciplinary">
                <Plus className="w-3.5 h-3.5 mr-1" /> Novo
              </Button>
            </div>

            {showDiscForm && (
              <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-200">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 block mb-1">Tipo</label>
                    <select value={discForm.type} onChange={(e) => setDiscForm({...discForm, type: e.target.value})} className="w-full h-9 border border-neutral-200 rounded-lg px-2 text-sm" data-testid="select-disc-type">
                      <option value="Advertência">Advertência</option>
                      <option value="Suspensão">Suspensão</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 block mb-1">Data</label>
                    <Input type="date" value={discForm.date} onChange={(e) => setDiscForm({...discForm, date: e.target.value})} data-testid="input-disc-date" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 block mb-1">Status</label>
                    <select value={discForm.status} onChange={(e) => setDiscForm({...discForm, status: e.target.value})} className="w-full h-9 border border-neutral-200 rounded-lg px-2 text-sm" data-testid="select-disc-status">
                      <option value="ativa">Ativa</option>
                      <option value="cumprida">Cumprida</option>
                      <option value="revogada">Revogada</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-1">Motivo</label>
                  <Input value={discForm.reason} onChange={(e) => setDiscForm({...discForm, reason: e.target.value})} placeholder="Motivo da advertência/suspensão" data-testid="input-disc-reason" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-1">Descrição (opcional)</label>
                  <Textarea value={discForm.description} onChange={(e) => setDiscForm({...discForm, description: e.target.value})} placeholder="Detalhes adicionais" data-testid="input-disc-description" />
                </div>
                <Button size="sm" onClick={() => addDisciplinary.mutate()} disabled={!discForm.date || !discForm.reason || addDisciplinary.isPending} data-testid="button-save-disciplinary">
                  {addDisciplinary.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Salvar
                </Button>
              </div>
            )}

            {loadingDisc ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : disciplinary.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum registro disciplinar</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-neutral-400 uppercase tracking-wider"><th className="text-left py-2 font-medium">Tipo</th><th className="text-left py-2 font-medium">Data</th><th className="text-left py-2 font-medium">Motivo</th><th className="text-left py-2 font-medium">Status</th><th className="py-2"></th></tr></thead>
                <tbody>
                  {disciplinary.map((d: any) => (
                    <tr key={d.id} className="border-b border-neutral-100" data-testid={`row-disc-${d.id}`}>
                      <td className="py-2 font-semibold">{d.type}</td>
                      <td className="py-2">{fmtDate(d.date)}</td>
                      <td className="py-2">{d.reason}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${d.status === "ativa" ? "bg-red-50 text-red-700" : d.status === "cumprida" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{d.status}</span></td>
                      <td className="py-2 text-right"><Button variant="ghost" size="icon" onClick={() => deleteDisciplinary.mutate(d.id)} data-testid={`button-delete-disc-${d.id}`}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "timesheets" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Folha de Ponto</h3>
              <Button size="sm" onClick={() => setShowTsForm(!showTsForm)} data-testid="button-add-timesheet"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showTsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <Input type="date" value={tsForm.date} onChange={(e) => setTsForm({ ...tsForm, date: e.target.value })} placeholder="Data" data-testid="input-ts-date" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={tsForm.clockIn} onChange={(e) => setTsForm({ ...tsForm, clockIn: e.target.value })} placeholder="Entrada" data-testid="input-ts-clockin" />
                  <Input type="time" value={tsForm.clockOut} onChange={(e) => setTsForm({ ...tsForm, clockOut: e.target.value })} placeholder="Saída" data-testid="input-ts-clockout" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={tsForm.lunchOut} onChange={(e) => setTsForm({ ...tsForm, lunchOut: e.target.value })} placeholder="Saída Almoço" data-testid="input-ts-lunchout" />
                  <Input type="time" value={tsForm.lunchIn} onChange={(e) => setTsForm({ ...tsForm, lunchIn: e.target.value })} placeholder="Retorno Almoço" data-testid="input-ts-lunchin" />
                </div>
                <Input type="number" step="0.5" value={tsForm.overtime} onChange={(e) => setTsForm({ ...tsForm, overtime: e.target.value })} placeholder="Horas extras" data-testid="input-ts-overtime" />
                <Input value={tsForm.notes} onChange={(e) => setTsForm({ ...tsForm, notes: e.target.value })} placeholder="Observações" data-testid="input-ts-notes" />
                <Button size="sm" onClick={() => addTimesheet.mutate()} disabled={!tsForm.date || addTimesheet.isPending} data-testid="button-save-timesheet">Salvar</Button>
              </div>
            )}
            {loadingTs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : timesheets.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum ponto registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Data</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Entrada</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Saida Almoco</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Retorno</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Saida</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">HE</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Local</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map((t: any) => (
                    <tr key={t.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{fmtDate(t.date)}</td>
                      <td className="px-3 py-2">{t.clockIn || "-"}</td>
                      <td className="px-3 py-2">{t.lunchOut || "-"}</td>
                      <td className="px-3 py-2">{t.lunchIn || "-"}</td>
                      <td className="px-3 py-2">{t.clockOut || "-"}</td>
                      <td className="px-3 py-2">{t.overtime ? `${t.overtime}h` : "-"}</td>
                      <td className="px-3 py-2 text-center">{t.clockInLat ? <MapPin className="w-3.5 h-3.5 text-green-500 inline" /> : <span className="text-neutral-300">-</span>}</td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openPontoDetalhe(t.id)} disabled={loadingDetalhe} title="Ver Relatorio Completo"><Eye className="w-3.5 h-3.5 text-blue-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteTimesheet.mutate(t.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {pontoDetalhe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPontoDetalhe(null)}>
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="modal-ponto-detalhe-old">
              <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex justify-between items-center z-10">
                <div>
                  <h3 className="font-black text-neutral-800 uppercase text-sm tracking-widest">Relatorio de Ponto</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{pontoDetalhe.employeeName} - {fmtDate(pontoDetalhe.date)}</p>
                </div>
                <button onClick={() => setPontoDetalhe(null)} className="p-1 rounded-lg hover:bg-neutral-100"><X className="w-5 h-5 text-neutral-400" /></button>
              </div>
              <div className="p-6 space-y-5">
                {[
                  { label: "Entrada", time: pontoDetalhe.clockIn, photo: pontoDetalhe.clockInPhoto, geo: pontoDetalhe.clockInGeo, address: pontoDetalhe.clockInAddress },
                  { label: "Saida Almoco", time: pontoDetalhe.lunchOut, photo: pontoDetalhe.lunchOutPhoto, geo: pontoDetalhe.lunchOutGeo, address: pontoDetalhe.lunchOutAddress },
                  { label: "Retorno Almoco", time: pontoDetalhe.lunchIn, photo: pontoDetalhe.lunchInPhoto, geo: pontoDetalhe.lunchInGeo, address: pontoDetalhe.lunchInAddress },
                  { label: "Saida", time: pontoDetalhe.clockOut, photo: pontoDetalhe.clockOutPhoto, geo: pontoDetalhe.clockOutGeo, address: pontoDetalhe.clockOutAddress },
                ].filter(s => s.time).map((step, idx) => (
                  <div key={idx} className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="bg-neutral-50 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-neutral-500" />
                        <span className="text-xs font-black text-neutral-700 uppercase tracking-wider">{step.label}</span>
                        <span className="text-sm font-mono font-bold text-neutral-900">{step.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.geo?.atHQ && <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Na Sede</span>}
                        {step.geo?.lat && !step.geo?.atHQ && <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Fora da Sede ({step.geo.distance}m)</span>}
                        {step.geo?.atHome && <span className="flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full"><Home className="w-3 h-3" /> Na Residencia ({step.geo.distHome}m)</span>}
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        {step.photo ? (
                          <img src={step.photo} alt={step.label} className="w-full rounded-lg border border-neutral-200 object-cover max-h-48" />
                        ) : (
                          <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-lg border border-neutral-200"><Camera className="w-8 h-8 text-neutral-300" /><span className="text-xs text-neutral-400 ml-2">Sem foto</span></div>
                        )}
                      </div>
                      <div className="space-y-2">
                        {step.geo?.lat ? (
                          <>
                            <div className="bg-neutral-50 p-3 rounded-lg">
                              <p className="text-[9px] font-black text-neutral-400 uppercase">Coordenadas</p>
                              <p className="text-xs font-mono text-neutral-700">{step.geo.lat?.toFixed(6)}, {step.geo.lng?.toFixed(6)}</p>
                            </div>
                            <div className="bg-neutral-50 p-3 rounded-lg">
                              <p className="text-[9px] font-black text-neutral-400 uppercase">Distancia da Sede</p>
                              <p className={`text-sm font-black ${step.geo.atHQ ? "text-green-700" : "text-red-700"}`}>{step.geo.distance}m</p>
                              <p className="text-[9px] text-neutral-400">{pontoDetalhe.hqAddress}</p>
                            </div>
                            {step.geo.distHome !== null && (
                              <div className={`p-3 rounded-lg ${step.geo.atHome ? "bg-orange-50 border border-orange-200" : "bg-neutral-50"}`}>
                                <p className="text-[9px] font-black text-neutral-400 uppercase">Distancia da Residencia</p>
                                <p className={`text-sm font-black ${step.geo.atHome ? "text-orange-700" : "text-neutral-700"}`}>{step.geo.distHome}m</p>
                                {step.geo.atHome && <p className="text-[9px] text-orange-600 font-bold mt-0.5">ALERTA: Ponto batido proximo a residencia!</p>}
                              </div>
                            )}
                            {step.address && (
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <p className="text-[9px] font-black text-blue-500 uppercase">Endereco Confirmado</p>
                                <p className="text-[11px] text-blue-800 leading-relaxed mt-0.5">{step.address}</p>
                              </div>
                            )}
                            <a href={`https://www.google.com/maps?q=${step.geo.lat},${step.geo.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-600 font-bold hover:underline">
                              <MapPin className="w-3 h-3" /> Ver no Google Maps
                            </a>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full bg-neutral-50 rounded-lg"><MapPin className="w-6 h-6 text-neutral-300" /><span className="text-xs text-neutral-400 ml-2">Sem localizacao</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "payslips" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Holerites</h3>
              <Button size="sm" onClick={() => setShowPsForm(!showPsForm)} data-testid="button-add-payslip"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showPsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={psForm.month} onChange={(e) => setPsForm({ ...psForm, month: Number(e.target.value) })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-payslip-month">
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <Input type="number" value={psForm.year} onChange={(e) => setPsForm({ ...psForm, year: Number(e.target.value) })} placeholder="Ano" data-testid="input-payslip-year" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={psForm.grossSalary} onChange={(e) => setPsForm({ ...psForm, grossSalary: e.target.value })} placeholder="Salário Bruto" data-testid="input-payslip-gross" />
                  <Input type="number" step="0.01" value={psForm.netSalary} onChange={(e) => setPsForm({ ...psForm, netSalary: e.target.value })} placeholder="Salário Líquido" data-testid="input-payslip-net" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={psForm.deductions} onChange={(e) => setPsForm({ ...psForm, deductions: e.target.value })} placeholder="Descontos" data-testid="input-payslip-deductions" />
                  <Input type="number" step="0.01" value={psForm.benefits} onChange={(e) => setPsForm({ ...psForm, benefits: e.target.value })} placeholder="Benefícios" data-testid="input-payslip-benefits" />
                </div>
                <Input value={psForm.notes} onChange={(e) => setPsForm({ ...psForm, notes: e.target.value })} placeholder="Observações" data-testid="input-payslip-notes" />
                <Button size="sm" onClick={() => addPayslip.mutate()} disabled={addPayslip.isPending} data-testid="button-save-payslip">Salvar</Button>
              </div>
            )}
            {loadingPs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : payslips.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum holerite registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Mês/Ano</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Bruto</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Descontos</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Benefícios</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Líquido</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p: any) => (
                    <tr key={p.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{MONTHS[p.month - 1]}/{p.year}</td>
                      <td className="px-3 py-2">{fmtCurrency(p.grossSalary)}</td>
                      <td className="px-3 py-2 text-red-600">{fmtCurrency(p.deductions)}</td>
                      <td className="px-3 py-2 text-green-600">{fmtCurrency(p.benefits)}</td>
                      <td className="px-3 py-2 font-bold">{fmtCurrency(p.netSalary)}</td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deletePayslip.mutate(p.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmployeePastaView({ employee, onClose, onEdit }: { employee: Employee; onClose: () => void; onEdit: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === "diretoria" || user?.role === "admin";
  const [tab, setTab] = useState<PastaTab>("documentos");
  const fileRef = useRef<HTMLInputElement>(null);
  const [excelMonth, setExcelMonth] = useState(new Date().getMonth() + 1);
  const [excelYear, setExcelYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await authFetch(`/api/employees/${employee.id}/folha-ponto-excel?month=${excelMonth}&year=${excelYear}`);
      if (!res.ok) throw new Error("Erro ao gerar Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Folha_Ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[excelMonth - 1]}_${excelYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel exportado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const { data: docs = [], isLoading: loadingDocs } = useQuery<EmployeeDocument[]>({
    queryKey: ["/api/employee-documents", employee.id],
    queryFn: async () => { const r = await authFetch(`/api/employee-documents/${employee.id}`); return r.json(); },
  });
  const { data: absences = [], isLoading: loadingAbs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "absences"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/absences`); return r.json(); },
  });
  const { data: fines = [], isLoading: loadingFines } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "fines"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/fines`); return r.json(); },
  });
  const { data: disciplinary = [], isLoading: loadingDisc } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "disciplinary"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/disciplinary`); return r.json(); },
  });
  const { data: timesheets = [], isLoading: loadingTs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "timesheets"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/timesheets`); return r.json(); },
  });
  const { data: payslips = [], isLoading: loadingPs } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "payslips"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/payslips`); return r.json(); },
  });
  const { data: salaries = [], isLoading: loadingSal } = useQuery<EmployeeSalary[]>({
    queryKey: ["/api/employees", employee.id, "salaries"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/salaries`); return r.json(); },
  });

  const [docForm, setDocForm] = useState({ type: "RG", documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" });
  const [showDocForm, setShowDocForm] = useState(false);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setDocForm(p => ({ ...p, fileData: ev.target!.result as string, fileName: file.name }));
    reader.readAsDataURL(file);
  };
  const createDoc = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/employee-documents", { employeeId: employee.id, ...docForm }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employee-documents", employee.id] }); setDocForm({ type: "CNH", documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" }); setShowDocForm(false); toast({ title: "Documento salvo" }); },
  });
  const deleteDoc = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employee-documents/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employee-documents", employee.id] }); toast({ title: "Documento removido" }); },
  });

  const [showAbsForm, setShowAbsForm] = useState(false);
  const [absForm, setAbsForm] = useState({ type: "Falta", startDate: "", endDate: "", reason: "", status: "pendente" });
  const addAbsence = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/absences`, absForm); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "absences"] }); setShowAbsForm(false); setAbsForm({ type: "Falta", startDate: "", endDate: "", reason: "", status: "pendente" }); toast({ title: "Registrado" }); },
  });
  const deleteAbsence = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/absences/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "absences"] }); toast({ title: "Removido" }); },
  });

  const [showFineForm, setShowFineForm] = useState(false);
  const [fineForm, setFineForm] = useState({ date: "", infraction: "", amount: "", points: "", status: "pendente", notes: "" });
  const addFine = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/fines`, { ...fineForm, amount: fineForm.amount ? Number(fineForm.amount) : null, points: fineForm.points ? Number(fineForm.points) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "fines"] }); setShowFineForm(false); setFineForm({ date: "", infraction: "", amount: "", points: "", status: "pendente", notes: "" }); toast({ title: "Multa registrada" }); },
  });
  const deleteFine = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/fines/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "fines"] }); toast({ title: "Multa removida" }); },
  });

  const [showDiscForm, setShowDiscForm] = useState(false);
  const [discForm, setDiscForm] = useState({ type: "Advertência", date: "", reason: "", description: "", status: "ativa" });
  const addDisciplinary = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/disciplinary`, discForm); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "disciplinary"] }); setShowDiscForm(false); setDiscForm({ type: "Advertência", date: "", reason: "", description: "", status: "ativa" }); toast({ title: "Registrado" }); },
  });
  const deleteDisciplinary = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/disciplinary/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "disciplinary"] }); toast({ title: "Removido" }); },
  });

  const [showTsForm, setShowTsForm] = useState(false);
  const [tsForm, setTsForm] = useState({ date: "", clockIn: "", clockOut: "", lunchOut: "", lunchIn: "", overtime: "", notes: "" });
  const addTimesheet = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/timesheets`, { ...tsForm, overtime: tsForm.overtime ? Number(tsForm.overtime) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "timesheets"] }); setShowTsForm(false); setTsForm({ date: "", clockIn: "", clockOut: "", lunchOut: "", lunchIn: "", overtime: "", notes: "" }); toast({ title: "Ponto registrado" }); },
  });
  const deleteTimesheet = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/timesheets/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "timesheets"] }); toast({ title: "Removido" }); },
  });
  const [pontoDetalhe, setPontoDetalhe] = useState<any>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const openPontoDetalhe = async (tsId: number) => {
    setLoadingDetalhe(true);
    try {
      const r = await authFetch(`/api/employees/${employee.id}/ponto-detalhado/${tsId}`);
      if (!r.ok) throw new Error("Erro ao carregar detalhes");
      const data = await r.json();
      setPontoDetalhe(data);
    } catch { toast({ title: "Erro ao carregar detalhes do ponto", variant: "destructive" }); }
    setLoadingDetalhe(false);
  };

  const [showPsForm, setShowPsForm] = useState(false);
  const [psForm, setPsForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), grossSalary: "", netSalary: "", deductions: "", benefits: "", notes: "" });
  const addPayslip = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/payslips`, { ...psForm, grossSalary: psForm.grossSalary ? Number(psForm.grossSalary) : null, netSalary: psForm.netSalary ? Number(psForm.netSalary) : null, deductions: psForm.deductions ? Number(psForm.deductions) : null, benefits: psForm.benefits ? Number(psForm.benefits) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); setShowPsForm(false); setPsForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), grossSalary: "", netSalary: "", deductions: "", benefits: "", notes: "" }); toast({ title: "Holerite registrado" }); },
  });
  const deletePayslip = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/payslips/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); toast({ title: "Removido" }); },
  });

  const [showSalForm, setShowSalForm] = useState(false);
  const [salForm, setSalForm] = useState({ baseSalary: "", effectiveDate: "", reason: "" });
  const addSalary = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/salaries`, salForm); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] }); setShowSalForm(false); setSalForm({ baseSalary: "", effectiveDate: "", reason: "" }); toast({ title: "Salário cadastrado" }); },
  });
  const deleteSalary = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employee-salaries/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] }); toast({ title: "Registro removido" }); },
  });

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "-";
  const fmtCurrency = (v: number | null) => v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-";
  const docExpiryStatus = (dateStr: string | null): "expired" | "warning" | "ok" => {
    if (!dateStr) return "ok";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return "expired";
    if (diffDays < 30) return "warning";
    return "ok";
  };

  const generateContract = () => {
    const esc = (s: string | null | undefined) => (s || "N/A").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const contractHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Contrato - ${esc(employee.name)}</title><style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.8;color:#000}h1{text-align:center;font-size:18px;margin-bottom:30px;text-transform:uppercase}h2{text-align:center;font-size:14px;margin-bottom:20px}.header{text-align:center;margin-bottom:40px;border-bottom:2px solid #000;padding-bottom:20px}.header h3{margin:0}p{text-align:justify;margin:10px 0;font-size:13px}.field{font-weight:bold}.section{margin-top:25px}.signatures{margin-top:60px;display:flex;justify-content:space-between}.sig-block{text-align:center;width:45%}.sig-line{border-top:1px solid #000;padding-top:5px;margin-top:60px;font-size:12px}table{width:100%;border-collapse:collapse;margin:15px 0}td{padding:6px 10px;border:1px solid #ccc;font-size:12px}td:first-child{font-weight:bold;background:#f5f5f5;width:35%}@media print{body{margin:0}}</style></head><body><div class="header"><h3>TORRES VIGILÂNCIA PATRIMONIAL LTDA</h3><p style="font-size:11px;text-align:center;">CNPJ: 36.982.392/0001-89</p></div><h1>CONTRATO DE TRABALHO</h1><h2>CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO</h2><div class="section"><p>Pelo presente instrumento particular de contrato individual de trabalho, de um lado <span class="field">TORRES VIGILÂNCIA PATRIMONIAL LTDA</span>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 36.982.392/0001-89, doravante denominada <span class="field">EMPREGADORA</span>, e de outro lado:</p><table><tr><td>Nome Completo</td><td>${esc(employee.name)}</td></tr><tr><td>CPF</td><td>${esc(employee.cpf)}</td></tr><tr><td>RG</td><td>${esc(employee.rg)}</td></tr><tr><td>CNH</td><td>${esc(employee.cnhNumber)}</td></tr><tr><td>Matrícula</td><td>${esc(employee.matricula)}</td></tr><tr><td>Cargo</td><td>${esc(employee.role)}</td></tr><tr><td>Categoria</td><td>${employee.category ? esc(employee.category) : "Mensalista"}</td></tr><tr><td>Data de Admissão</td><td>${employee.hireDate ? esc(employee.hireDate) : new Date().toLocaleDateString("pt-BR")}</td></tr></table></div><div class="signatures"><div class="sig-block"><div class="sig-line">TORRES VIGILÂNCIA PATRIMONIAL LTDA<br/>CNPJ: 36.982.392/0001-89</div></div><div class="sig-block"><div class="sig-line">${esc(employee.name)}<br/>CPF: ${esc(employee.cpf)}</div></div></div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(contractHtml); w.document.close(); w.print(); }
  };

  const DOC_TYPES = ["RG", "CPF", "CTPS", "PIS/PASEP/NIS", "Comprovante de Residência", "Fotos 3x4", "Título de Eleitor", "Certificado de Reservista", "CNH", "CNV", "Certidão de Pontuação CNH", "Dados Bancários", "Certificado Formação Vigilante", "Certificado Formação Escolta Armada", "Reciclagem Escolta Armada", "ASO", "Certidão Nascimento/Casamento", "Certidão Nascimento Filhos", "Carteira Vacinação/Comprovante Escolar", "Antecedente Criminal Polícia Civil", "Antecedente Criminal Polícia Militar", "Certidão de COP", "Contrato Assinado", "Termo de Aceite", "Termo de Responsabilidade", "Outro"];


  const REQUIRED_DOCS = [
    { group: "Identificação e Documentos Pessoais", items: [
      { type: "RG", label: "RG" },
      { type: "CPF", label: "CPF" },
      { type: "CTPS", label: "Carteira de Trabalho (CTPS)" },
      { type: "PIS/PASEP/NIS", label: "PIS/PASEP/NIS" },
      { type: "Comprovante de Residência", label: "Comprovante de Residência" },
      { type: "Fotos 3x4", label: "03 Fotos 3x4 recentes" },
      { type: "Título de Eleitor", label: "Título de Eleitor" },
      { type: "Certificado de Reservista", label: "Certificado de Reservista (homens 18-45)" },
    ]},
    { group: "Habilitação e Formação", items: [
      { type: "CNH", label: "CNH / CNV" },
      { type: "Certidão de Pontuação CNH", label: "Certidão de Pontuação de CNH" },
      { type: "Dados Bancários", label: "Dados Bancários" },
      { type: "Certificado Formação Vigilante", label: "Certificado de Formação de Vigilante" },
      { type: "Certificado Formação Escolta Armada", label: "Certificado de Formação de Escolta Armada" },
      { type: "Reciclagem Escolta Armada", label: "Última Reciclagem de Escolta Armada" },
      { type: "ASO", label: "ASO - Atestado de Saúde Ocupacional (Admissional)" },
    ]},
    { group: "Dependentes (se necessário)", items: [
      { type: "Certidão Nascimento/Casamento", label: "Certidão de Nascimento/Casamento" },
      { type: "Certidão Nascimento Filhos", label: "Certidão de Nascimento de Filhos (menores 14 anos)" },
      { type: "Carteira Vacinação/Comprovante Escolar", label: "Carteira de Vacinação e Comprovante Escolar" },
    ]},
    { group: "Certidões Obrigatórias", items: [
      { type: "Antecedente Criminal Polícia Civil", label: "Antecedente Criminal Polícia Civil" },
      { type: "Antecedente Criminal Polícia Militar", label: "Antecedente Criminal Polícia Militar" },
      { type: "Certidão de COP", label: "Certidão de COP (Objeto em Pé)" },
    ]},
  ];

  const getDocStatus = (docType: string) => docs.some((d: any) => d.type === docType);

  const MANDATORY_DOC_TYPES = REQUIRED_DOCS
    .filter(g => g.group !== "Dependentes (se necessário)")
    .flatMap(g => g.items.map(i => i.type));
  const missingDocs = MANDATORY_DOC_TYPES.filter(t => !getDocStatus(t));
  const allDocsComplete = missingDocs.length === 0;
  const isDiretoria = user?.role === "diretoria";

  const tabCounts: Record<PastaTab, number> = {
    documentos: docs.length,
    contrato: 0,
    multas: fines.length,
    disciplinar: disciplinary.length,
    faltas: absences.length,
    ponto: timesheets.length,
    holerite: payslips.length,
    salarios: salaries.length,
  };

  return (
    <div data-testid="employee-pasta-view">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-back-employees">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-full bg-neutral-100 overflow-hidden border-2 border-neutral-200">
            {employee.photoUrl ? (
              <img src={employee.photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-lg font-bold">
                {employee.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900" data-testid="text-pasta-employee-name">{titleCase(employee.name)}</h1>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span className="font-mono">{employee.matricula}</span>
              <span>•</span>
              <span>{employee.role}</span>
              <span>•</span>
              <span className="font-mono">{employee.cpf}</span>
              <span className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                employee.status === "ativo" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                employee.status === "bloqueado_definitivo" ? "bg-red-50 text-red-700 border border-red-200" :
                "bg-neutral-100 text-neutral-600 border border-neutral-200"
              }`}>{employee.status === "bloqueado_definitivo" ? "BLOQUEADO" : employee.status?.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} data-testid="button-edit-from-pasta">
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-neutral-200 mb-4 overflow-x-auto">
        {PASTA_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"}`}
            data-testid={`tab-pasta-${t.key}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className="ml-1 bg-neutral-100 text-neutral-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{tabCounts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      <Card className="bg-white border-neutral-200 p-4">
        {tab === "documentos" && (
          <div className="space-y-4">
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <div className="bg-neutral-900 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-white" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Checklist de Documentos Obrigatórios</h3>
                </div>
                <span className="text-[10px] font-bold text-neutral-400">
                  {REQUIRED_DOCS.reduce((acc, g) => acc + g.items.filter(i => getDocStatus(i.type)).length, 0)}/{REQUIRED_DOCS.reduce((acc, g) => acc + g.items.length, 0)} entregues
                </span>
              </div>
              <div className="p-3 space-y-3 bg-neutral-50/50">
                {REQUIRED_DOCS.map((group) => (
                  <div key={group.group}>
                    <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">{group.group}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {group.items.map((item) => {
                        const delivered = getDocStatus(item.type);
                        const matchedDoc = delivered ? docs.find((d: any) => d.type === item.type && d.fileData) : null;
                        return (
                          <div key={item.type} className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${delivered ? "bg-emerald-50 border border-emerald-100" : "bg-white border border-neutral-100"}`} data-testid={`checklist-${item.type.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                            {delivered ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                            )}
                            <span className={`flex-1 ${delivered ? "text-emerald-700 font-medium" : "text-neutral-600"}`}>{item.label}</span>
                            {matchedDoc && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const a = document.createElement("a");
                                  a.href = matchedDoc.fileData;
                                  a.download = matchedDoc.fileName || `${item.type}.pdf`;
                                  a.click();
                                }}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors flex-shrink-0"
                                title={`Baixar ${matchedDoc.fileName || item.label}`}
                                data-testid={`download-checklist-${item.type.toLowerCase().replace(/[\s/]+/g, "-")}`}
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-neutral-400 italic mt-1">Após aprovação, o candidato terá 3 dias úteis para entrega da documentação.</p>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Documentos Arquivados</h3>
              <Button size="sm" onClick={() => setShowDocForm(!showDocForm)} data-testid="button-add-doc-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showDocForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <select value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-doc-type-pasta">
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input value={docForm.documentNumber} onChange={(e) => setDocForm({ ...docForm, documentNumber: e.target.value })} placeholder="Nº do documento" data-testid="input-doc-number-pasta" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] font-semibold text-neutral-400 block mb-1">Emissão</label><Input type="date" value={docForm.issueDate} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} data-testid="input-doc-issue-pasta" /></div>
                  <div><label className="text-[10px] font-semibold text-neutral-400 block mb-1">Validade{docRequiresExpiry(docForm.type) ? " *" : ""}</label><Input type="date" value={docForm.expiryDate} onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} data-testid="input-doc-expiry-pasta" /></div>
                </div>
                <Input value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} placeholder="Observações" data-testid="input-doc-notes-pasta" />
                <div className="flex gap-2 items-center">
                  <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleFile} />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-upload-doc-pasta">
                    <Upload className="w-3.5 h-3.5 mr-1" /> {docForm.fileName || "Anexar arquivo (máx 5MB)"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setDocForm({ type: docForm.type, documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" }); if (fileRef.current) fileRef.current.value = ""; }} data-testid="button-clear-doc-pasta">
                    <X className="w-3.5 h-3.5 mr-1" /> Limpar
                  </Button>
                  <Button size="sm" onClick={() => createDoc.mutate()} disabled={createDoc.isPending} data-testid="button-save-doc-pasta">Salvar</Button>
                </div>
              </div>
            )}
            {loadingDocs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : docs.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum documento arquivado</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Número</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Emissão</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Validade</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Arquivo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d: any) => (
                    <tr key={d.id} className="border-b border-neutral-100" data-testid={`row-doc-${d.id}`}>
                      <td className="px-3 py-2 font-semibold">{d.type}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.documentNumber || "-"}</td>
                      <td className="px-3 py-2">{fmtDate(d.issueDate)}</td>
                      <td className="px-3 py-2">{d.expiryDate ? (() => { const st = docExpiryStatus(d.expiryDate); return (<span className={`inline-flex items-center gap-1 ${st === "expired" ? "text-red-600 font-bold" : st === "warning" ? "text-amber-600 font-semibold" : ""}`}>{fmtDate(d.expiryDate)}{st === "expired" && <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold uppercase">Vencido</span>}{st === "warning" && <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase">Vencendo</span>}</span>); })() : "-"}</td>
                      <td className="px-3 py-2">
                        {d.fileData ? (
                          <button className="text-blue-600 text-xs underline flex items-center gap-1" onClick={() => {
                            const w = window.open("", "_blank");
                            if (w) {
                              if (d.fileData!.startsWith("data:image")) {
                                w.document.write(`<html><head><title>${d.fileName || d.type}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5"><img src="${d.fileData}" style="max-width:100%;max-height:100vh;object-fit:contain" /></body></html>`);
                              } else {
                                w.document.write(`<html><head><title>${d.fileName || d.type}</title></head><body style="margin:0"><iframe src="${d.fileData}" style="width:100%;height:100vh;border:none"></iframe></body></html>`);
                              }
                              w.document.close();
                            }
                          }} data-testid={`link-download-doc-${d.id}`}>
                            <Eye className="w-3.5 h-3.5" />{d.fileName || "Ver"}
                          </button>
                        ) : "-"}
                      </td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deleteDoc.mutate(d.id)} data-testid={`button-delete-doc-${d.id}`}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "contrato" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Contrato de Trabalho</h3>
              <Button
                size="sm"
                onClick={() => {
                  if (!allDocsComplete && !isDiretoria) {
                    toast({ title: "Documentação incompleta", description: `Faltam ${missingDocs.length} documento(s) obrigatório(s). Somente a Diretoria pode autorizar a geração sem documentação completa.`, variant: "destructive" });
                    return;
                  }
                  if (!allDocsComplete && isDiretoria) {
                    toast({ title: "Atenção", description: `Gerando contrato com ${missingDocs.length} documento(s) pendente(s) — autorizado pela Diretoria.` });
                  }
                  generateContract();
                }}
                data-testid="button-generate-contract-pasta"
              >
                <FileText className="w-4 h-4 mr-1" /> Gerar Contrato
              </Button>
            </div>

            {!allDocsComplete && (
              <div className={`border rounded-lg p-3 ${isDiretoria ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 ${isDiretoria ? "text-amber-600" : "text-red-600"}`} />
                  <span className={`text-xs font-bold uppercase ${isDiretoria ? "text-amber-700" : "text-red-700"}`}>
                    {missingDocs.length} documento(s) obrigatório(s) pendente(s)
                  </span>
                </div>
                <ul className="space-y-0.5 ml-6">
                  {missingDocs.map(t => (
                    <li key={t} className={`text-xs ${isDiretoria ? "text-amber-600" : "text-red-600"}`}>• {t}</li>
                  ))}
                </ul>
                {isDiretoria ? (
                  <p className="text-[10px] text-amber-500 mt-2 italic">Você possui autorização da Diretoria para gerar o contrato mesmo com documentos pendentes.</p>
                ) : (
                  <p className="text-[10px] text-red-500 mt-2 italic">Geração de contrato bloqueada. Somente a Diretoria pode autorizar.</p>
                )}
              </div>
            )}

            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">Nome</span><span className="font-medium">{titleCase(employee.name)}</span></div>
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">CPF</span><span className="font-mono">{employee.cpf}</span></div>
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">Cargo</span><span>{employee.role}</span></div>
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">Categoria</span><span>{employee.category || "Mensalista"}</span></div>
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">Admissão</span><span>{employee.hireDate || "-"}</span></div>
                <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">Pagamento</span><span>{employee.paymentMethod || "PIX"}</span></div>
              </div>
              {allDocsComplete && <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Documentação completa — contrato liberado para geração.</p>}
            </div>
          </div>
        )}

        {tab === "multas" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Multas de Trânsito</h3>
              <Button size="sm" onClick={() => setShowFineForm(!showFineForm)} data-testid="button-add-fine-pasta"><Plus className="w-4 h-4 mr-1" />Nova</Button>
            </div>
            {showFineForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <Input type="date" value={fineForm.date} onChange={(e) => setFineForm({ ...fineForm, date: e.target.value })} placeholder="Data" data-testid="input-fine-date-pasta" />
                <Input value={fineForm.infraction} onChange={(e) => setFineForm({ ...fineForm, infraction: e.target.value })} placeholder="Infração" data-testid="input-fine-infraction-pasta" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={fineForm.amount} onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })} placeholder="Valor (R$)" data-testid="input-fine-amount-pasta" />
                  <Input type="number" value={fineForm.points} onChange={(e) => setFineForm({ ...fineForm, points: e.target.value })} placeholder="Pontos" data-testid="input-fine-points-pasta" />
                </div>
                <select value={fineForm.status} onChange={(e) => setFineForm({ ...fineForm, status: e.target.value })} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-fine-status-pasta">
                  <option value="pendente">Pendente</option><option value="paga">Paga</option><option value="contestada">Contestada</option>
                </select>
                <Input value={fineForm.notes} onChange={(e) => setFineForm({ ...fineForm, notes: e.target.value })} placeholder="Observações" data-testid="input-fine-notes-pasta" />
                <Button size="sm" onClick={() => addFine.mutate()} disabled={!fineForm.date || !fineForm.infraction || addFine.isPending} data-testid="button-save-fine-pasta">Salvar</Button>
              </div>
            )}
            {loadingFines ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : fines.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhuma multa registrada</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200"><tr><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Data</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Infração</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Valor</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Pontos</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Status</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {fines.map((f: any) => (
                    <tr key={f.id} className="border-b border-neutral-100" data-testid={`row-fine-${f.id}`}>
                      <td className="px-3 py-2">{fmtDate(f.date)}</td>
                      <td className="px-3 py-2">{f.infraction}</td>
                      <td className="px-3 py-2">{fmtCurrency(f.amount)}</td>
                      <td className="px-3 py-2">{f.points ?? "-"}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${f.status === "paga" ? "bg-green-50 text-green-700" : f.status === "contestada" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>{f.status}</span></td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deleteFine.mutate(f.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "disciplinar" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Advertências e Suspensões</h3>
              <Button size="sm" variant="outline" onClick={() => setShowDiscForm(!showDiscForm)} data-testid="button-add-disc-pasta"><Plus className="w-3.5 h-3.5 mr-1" />Novo</Button>
            </div>
            {showDiscForm && (
              <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-200">
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs font-semibold text-neutral-500 block mb-1">Tipo</label><select value={discForm.type} onChange={(e) => setDiscForm({...discForm, type: e.target.value})} className="w-full h-9 border border-neutral-200 rounded-lg px-2 text-sm" data-testid="select-disc-type-pasta"><option value="Advertência">Advertência</option><option value="Suspensão">Suspensão</option></select></div>
                  <div><label className="text-xs font-semibold text-neutral-500 block mb-1">Data</label><Input type="date" value={discForm.date} onChange={(e) => setDiscForm({...discForm, date: e.target.value})} data-testid="input-disc-date-pasta" /></div>
                  <div><label className="text-xs font-semibold text-neutral-500 block mb-1">Status</label><select value={discForm.status} onChange={(e) => setDiscForm({...discForm, status: e.target.value})} className="w-full h-9 border border-neutral-200 rounded-lg px-2 text-sm" data-testid="select-disc-status-pasta"><option value="ativa">Ativa</option><option value="cumprida">Cumprida</option><option value="revogada">Revogada</option></select></div>
                </div>
                <Input value={discForm.reason} onChange={(e) => setDiscForm({...discForm, reason: e.target.value})} placeholder="Motivo" data-testid="input-disc-reason-pasta" />
                <Textarea value={discForm.description} onChange={(e) => setDiscForm({...discForm, description: e.target.value})} placeholder="Descrição (opcional)" data-testid="input-disc-description-pasta" />
                <Button size="sm" onClick={() => addDisciplinary.mutate()} disabled={!discForm.date || !discForm.reason || addDisciplinary.isPending} data-testid="button-save-disc-pasta">Salvar</Button>
              </div>
            )}
            {loadingDisc ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : disciplinary.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum registro disciplinar</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-neutral-400 uppercase tracking-wider"><th className="text-left py-2 font-medium">Tipo</th><th className="text-left py-2 font-medium">Data</th><th className="text-left py-2 font-medium">Motivo</th><th className="text-left py-2 font-medium">Status</th><th className="py-2"></th></tr></thead>
                <tbody>
                  {disciplinary.map((d: any) => (
                    <tr key={d.id} className="border-b border-neutral-100" data-testid={`row-disc-pasta-${d.id}`}>
                      <td className="py-2 font-semibold">{d.type}</td>
                      <td className="py-2">{fmtDate(d.date)}</td>
                      <td className="py-2">{d.reason}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${d.status === "ativa" ? "bg-red-50 text-red-700" : d.status === "cumprida" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{d.status}</span></td>
                      <td className="py-2 text-right"><Button variant="ghost" size="icon" onClick={() => deleteDisciplinary.mutate(d.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "faltas" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Faltas e Atestados</h3>
              <Button size="sm" onClick={() => setShowAbsForm(!showAbsForm)} data-testid="button-add-absence-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showAbsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={absForm.type} onChange={(e) => setAbsForm({ ...absForm, type: e.target.value })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-absence-type-pasta">
                    {ABSENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={absForm.status} onChange={(e) => setAbsForm({ ...absForm, status: e.target.value })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-absence-status-pasta">
                    <option value="pendente">Pendente</option><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={absForm.startDate} onChange={(e) => setAbsForm({ ...absForm, startDate: e.target.value })} placeholder="Data Início" data-testid="input-absence-start-pasta" />
                  <Input type="date" value={absForm.endDate} onChange={(e) => setAbsForm({ ...absForm, endDate: e.target.value })} placeholder="Data Fim" data-testid="input-absence-end-pasta" />
                </div>
                <Input value={absForm.reason} onChange={(e) => setAbsForm({ ...absForm, reason: e.target.value })} placeholder="Motivo" data-testid="input-absence-reason-pasta" />
                <Button size="sm" onClick={() => addAbsence.mutate()} disabled={!absForm.startDate || addAbsence.isPending} data-testid="button-save-absence-pasta">Salvar</Button>
              </div>
            )}
            {loadingAbs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : absences.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum registro</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200"><tr><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Tipo</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Início</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Fim</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Motivo</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Status</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {absences.map((a: any) => (
                    <tr key={a.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{a.type}</td>
                      <td className="px-3 py-2">{fmtDate(a.startDate)}</td>
                      <td className="px-3 py-2">{fmtDate(a.endDate)}</td>
                      <td className="px-3 py-2 text-neutral-500">{a.reason || "-"}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${a.status === "aprovado" ? "bg-green-50 text-green-700" : a.status === "rejeitado" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>{a.status}</span></td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deleteAbsence.mutate(a.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "ponto" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-sm font-bold text-neutral-700">Folha de Ponto</h3>
              <div className="flex items-center gap-2">
                <select value={excelMonth} onChange={(e) => setExcelMonth(Number(e.target.value))} className="border border-neutral-200 rounded px-2 py-1 text-xs" data-testid="select-excel-month">
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <Input type="number" value={excelYear} onChange={(e) => setExcelYear(Number(e.target.value))} className="w-20 h-7 text-xs" data-testid="input-excel-year" />
                <Button size="sm" variant="outline" onClick={exportExcel} disabled={exporting} data-testid="button-export-excel-ponto">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                  Exportar Excel
                </Button>
                {canEdit && (
                  <Button size="sm" onClick={() => setShowTsForm(!showTsForm)} data-testid="button-add-timesheet-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
                )}
              </div>
            </div>
            {canEdit && showTsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <Input type="date" value={tsForm.date} onChange={(e) => setTsForm({ ...tsForm, date: e.target.value })} placeholder="Data" data-testid="input-ts-date-pasta" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={tsForm.clockIn} onChange={(e) => setTsForm({ ...tsForm, clockIn: e.target.value })} placeholder="Entrada" data-testid="input-ts-clockin-pasta" />
                  <Input type="time" value={tsForm.clockOut} onChange={(e) => setTsForm({ ...tsForm, clockOut: e.target.value })} placeholder="Saída" data-testid="input-ts-clockout-pasta" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={tsForm.lunchOut} onChange={(e) => setTsForm({ ...tsForm, lunchOut: e.target.value })} placeholder="Saída Almoço" data-testid="input-ts-lunchout-pasta" />
                  <Input type="time" value={tsForm.lunchIn} onChange={(e) => setTsForm({ ...tsForm, lunchIn: e.target.value })} placeholder="Retorno Almoço" data-testid="input-ts-lunchin-pasta" />
                </div>
                <Input type="number" step="0.5" value={tsForm.overtime} onChange={(e) => setTsForm({ ...tsForm, overtime: e.target.value })} placeholder="Horas extras" data-testid="input-ts-overtime-pasta" />
                <Input value={tsForm.notes} onChange={(e) => setTsForm({ ...tsForm, notes: e.target.value })} placeholder="Observações" data-testid="input-ts-notes-pasta" />
                <Button size="sm" onClick={() => addTimesheet.mutate()} disabled={!tsForm.date || addTimesheet.isPending} data-testid="button-save-timesheet-pasta">Salvar</Button>
              </div>
            )}
            {!canEdit && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700" data-testid="text-ponto-readonly">
                Visualização somente leitura. Apenas Diretoria e Administrador podem editar registros de ponto.
              </div>
            )}
            {loadingTs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : timesheets.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum ponto registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200"><tr><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Data</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Entrada</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">S. Almoco</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Retorno</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Saida</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">HE</th><th className="text-center px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Local</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {timesheets.map((t: any) => {
                    const hasPhoto = !!t.clockInPhoto || !!t.clockOutPhoto;
                    const hasGeo = !!t.clockInLat;
                    return (
                    <tr key={t.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{fmtDate(t.date)}</td>
                      <td className="px-3 py-2">{t.clockIn || "-"}</td>
                      <td className="px-3 py-2">{t.lunchOut || "-"}</td>
                      <td className="px-3 py-2">{t.lunchIn || "-"}</td>
                      <td className="px-3 py-2">{t.clockOut || "-"}</td>
                      <td className="px-3 py-2">{t.overtime ? `${t.overtime}h` : "-"}</td>
                      <td className="px-3 py-2 text-center">{hasGeo ? <MapPin className="w-3.5 h-3.5 text-green-500 inline" /> : hasPhoto ? <Camera className="w-3.5 h-3.5 text-blue-400 inline" /> : <span className="text-neutral-300">-</span>}</td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openPontoDetalhe(t.id)} disabled={loadingDetalhe} title="Ver Relatorio Completo" data-testid={`button-ponto-detail-${t.id}`}><Eye className="w-3.5 h-3.5 text-blue-500" /></Button>
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => deleteTimesheet.mutate(t.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {pontoDetalhe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPontoDetalhe(null)}>
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="modal-ponto-detalhe">
              <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex justify-between items-center z-10">
                <div>
                  <h3 className="font-black text-neutral-800 uppercase text-sm tracking-widest">Relatorio de Ponto</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{pontoDetalhe.employeeName} - {fmtDate(pontoDetalhe.date)}</p>
                </div>
                <button onClick={() => setPontoDetalhe(null)} className="p-1 rounded-lg hover:bg-neutral-100"><X className="w-5 h-5 text-neutral-400" /></button>
              </div>
              <div className="p-6 space-y-5">
                {[
                  { label: "Entrada", time: pontoDetalhe.clockIn, photo: pontoDetalhe.clockInPhoto, geo: pontoDetalhe.clockInGeo, address: pontoDetalhe.clockInAddress },
                  { label: "Saida Almoco", time: pontoDetalhe.lunchOut, photo: pontoDetalhe.lunchOutPhoto, geo: pontoDetalhe.lunchOutGeo, address: pontoDetalhe.lunchOutAddress },
                  { label: "Retorno Almoco", time: pontoDetalhe.lunchIn, photo: pontoDetalhe.lunchInPhoto, geo: pontoDetalhe.lunchInGeo, address: pontoDetalhe.lunchInAddress },
                  { label: "Saida", time: pontoDetalhe.clockOut, photo: pontoDetalhe.clockOutPhoto, geo: pontoDetalhe.clockOutGeo, address: pontoDetalhe.clockOutAddress },
                ].filter(s => s.time).map((step, idx) => (
                  <div key={idx} className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="bg-neutral-50 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-neutral-500" />
                        <span className="text-xs font-black text-neutral-700 uppercase tracking-wider">{step.label}</span>
                        <span className="text-sm font-mono font-bold text-neutral-900">{step.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.geo?.atHQ && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Na Sede</span>
                        )}
                        {step.geo?.lat && !step.geo?.atHQ && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Fora da Sede ({step.geo.distance}m)</span>
                        )}
                        {step.geo?.atHome && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full"><Home className="w-3 h-3" /> Na Residencia ({step.geo.distHome}m)</span>
                        )}
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        {step.photo ? (
                          <img src={step.photo} alt={step.label} className="w-full rounded-lg border border-neutral-200 object-cover max-h-48" />
                        ) : (
                          <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-lg border border-neutral-200"><Camera className="w-8 h-8 text-neutral-300" /><span className="text-xs text-neutral-400 ml-2">Sem foto</span></div>
                        )}
                      </div>
                      <div className="space-y-2">
                        {step.geo?.lat ? (
                          <>
                            <div className="bg-neutral-50 p-3 rounded-lg">
                              <p className="text-[9px] font-black text-neutral-400 uppercase">Coordenadas</p>
                              <p className="text-xs font-mono text-neutral-700">{step.geo.lat?.toFixed(6)}, {step.geo.lng?.toFixed(6)}</p>
                            </div>
                            <div className="bg-neutral-50 p-3 rounded-lg">
                              <p className="text-[9px] font-black text-neutral-400 uppercase">Distancia da Sede</p>
                              <p className={`text-sm font-black ${step.geo.atHQ ? "text-green-700" : "text-red-700"}`}>{step.geo.distance}m</p>
                              <p className="text-[9px] text-neutral-400">{pontoDetalhe.hqAddress}</p>
                            </div>
                            {step.geo.distHome !== null && (
                              <div className={`p-3 rounded-lg ${step.geo.atHome ? "bg-orange-50 border border-orange-200" : "bg-neutral-50"}`}>
                                <p className="text-[9px] font-black text-neutral-400 uppercase">Distancia da Residencia</p>
                                <p className={`text-sm font-black ${step.geo.atHome ? "text-orange-700" : "text-neutral-700"}`}>{step.geo.distHome}m</p>
                                {step.geo.atHome && <p className="text-[9px] text-orange-600 font-bold mt-0.5">ALERTA: Ponto batido proximo a residencia!</p>}
                              </div>
                            )}
                            {step.address && (
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <p className="text-[9px] font-black text-blue-500 uppercase">Endereco Confirmado</p>
                                <p className="text-[11px] text-blue-800 leading-relaxed mt-0.5">{step.address}</p>
                              </div>
                            )}
                            <a href={`https://www.google.com/maps?q=${step.geo.lat},${step.geo.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-600 font-bold hover:underline">
                              <MapPin className="w-3 h-3" /> Ver no Google Maps
                            </a>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full bg-neutral-50 rounded-lg"><MapPin className="w-6 h-6 text-neutral-300" /><span className="text-xs text-neutral-400 ml-2">Sem localizacao</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {pontoDetalhe.notes && (
                  <div className="bg-neutral-50 p-3 rounded-xl">
                    <p className="text-[9px] font-black text-neutral-400 uppercase">Observacoes</p>
                    <p className="text-xs text-neutral-700">{pontoDetalhe.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "holerite" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Holerites</h3>
              <Button size="sm" onClick={() => setShowPsForm(!showPsForm)} data-testid="button-add-payslip-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showPsForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={psForm.month} onChange={(e) => setPsForm({ ...psForm, month: Number(e.target.value) })} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-payslip-month-pasta">
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <Input type="number" value={psForm.year} onChange={(e) => setPsForm({ ...psForm, year: Number(e.target.value) })} placeholder="Ano" data-testid="input-payslip-year-pasta" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={psForm.grossSalary} onChange={(e) => setPsForm({ ...psForm, grossSalary: e.target.value })} placeholder="Salário Bruto" data-testid="input-payslip-gross-pasta" />
                  <Input type="number" step="0.01" value={psForm.netSalary} onChange={(e) => setPsForm({ ...psForm, netSalary: e.target.value })} placeholder="Salário Líquido" data-testid="input-payslip-net-pasta" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={psForm.deductions} onChange={(e) => setPsForm({ ...psForm, deductions: e.target.value })} placeholder="Descontos" data-testid="input-payslip-deductions-pasta" />
                  <Input type="number" step="0.01" value={psForm.benefits} onChange={(e) => setPsForm({ ...psForm, benefits: e.target.value })} placeholder="Benefícios" data-testid="input-payslip-benefits-pasta" />
                </div>
                <Input value={psForm.notes} onChange={(e) => setPsForm({ ...psForm, notes: e.target.value })} placeholder="Observações" data-testid="input-payslip-notes-pasta" />
                <Button size="sm" onClick={() => addPayslip.mutate()} disabled={addPayslip.isPending} data-testid="button-save-payslip-pasta">Salvar</Button>
              </div>
            )}
            {loadingPs ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : payslips.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum holerite registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200"><tr><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Mês/Ano</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Bruto</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Descontos</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Benefícios</th><th className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Líquido</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {payslips.map((p: any) => (
                    <tr key={p.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2">{MONTHS[p.month - 1]}/{p.year}</td>
                      <td className="px-3 py-2">{fmtCurrency(p.grossSalary)}</td>
                      <td className="px-3 py-2 text-red-600">{fmtCurrency(p.deductions)}</td>
                      <td className="px-3 py-2 text-green-600">{fmtCurrency(p.benefits)}</td>
                      <td className="px-3 py-2 font-bold">{fmtCurrency(p.netSalary)}</td>
                      <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => deletePayslip.mutate(p.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "salarios" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-neutral-700">Histórico Salarial</h3>
              <Button size="sm" onClick={() => setShowSalForm(!showSalForm)} data-testid="button-add-salary-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showSalForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] font-semibold text-neutral-400 block mb-1">Salário Base (R$) *</label><Input type="number" step="0.01" value={salForm.baseSalary} onChange={(e) => setSalForm({ ...salForm, baseSalary: e.target.value })} placeholder="Ex: 2500.00" data-testid="input-salary-value-pasta" /></div>
                  <div><label className="text-[10px] font-semibold text-neutral-400 block mb-1">Data Vigência *</label><Input type="date" value={salForm.effectiveDate} onChange={(e) => setSalForm({ ...salForm, effectiveDate: e.target.value })} data-testid="input-salary-date-pasta" /></div>
                </div>
                <Input value={salForm.reason} onChange={(e) => setSalForm({ ...salForm, reason: e.target.value })} placeholder="Motivo (Ex: Promoção, Reajuste)" data-testid="input-salary-reason-pasta" />
                <Button size="sm" onClick={() => addSalary.mutate()} disabled={!salForm.baseSalary || !salForm.effectiveDate || addSalary.isPending} data-testid="button-save-salary-pasta">
                  {addSalary.isPending ? "Salvando..." : "Adicionar"}
                </Button>
              </div>
            )}
            {loadingSal ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : salaries.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">Nenhum salário registrado</p>
            ) : (
              <div className="space-y-2">
                {salaries.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-salary-pasta-${s.id}`}>
                    <div>
                      <span className="text-sm font-semibold text-neutral-900">R$ {Number(s.baseSalary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-neutral-500 ml-2">{s.effectiveDate}</span>
                      {s.reason && <span className="text-xs text-neutral-400 ml-2">({s.reason})</span>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteSalary.mutate(s.id)} data-testid={`button-delete-salary-pasta-${s.id}`}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function EmployeesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Employee | undefined>();
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);
  const [pastaEmployee, setPastaEmployee] = useState<Employee | null>(null);
  const [docAlertOpen, setDocAlertOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const empId = params.get("id");
    if (empId && employees.length > 0 && !pastaEmployee) {
      const found = employees.find((e) => e.id === Number(empId));
      if (found) {
        setPastaEmployee(found);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [employees]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employees/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees"] }); toast({ title: "Funcionário removido" }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const inactivateMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("PATCH", `/api/employees/${id}`, { status: "inativo" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees"] }); toast({ title: "Funcionário inativado" }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      {pastaEmployee ? (
        <EmployeePastaView
          employee={pastaEmployee}
          onClose={() => setPastaEmployee(null)}
          onEdit={() => { setEditItem(pastaEmployee); setShowForm(true); }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-employees-title">Funcionários</h1>
              <p className="text-sm text-neutral-500 mt-1">Cadastro e gestão de funcionários</p>
            </div>
            <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-employee">
              <Plus className="w-4 h-4 mr-2" /> Novo Funcionário
            </Button>
          </div>

          {(() => {
            const getMissing = (e: Employee) => {
              const m: string[] = [];
              if (!e.photoUrl) m.push("Foto");
              if (!e.cnhNumber) m.push("CNH");
              if (!e.cnhExpiry) m.push("Validade CNH");
              if (!(e as any).cnvNumber) m.push("CNV");
              if (!(e as any).cnvExpiry) m.push("Validade CNV");
              if (!(e as any).vestNumber) m.push("Colete Nº");
              if (!(e as any).vestExpiry) m.push("Validade Colete");
              if (!e.rg) m.push("RG");
              if (!e.phone) m.push("Telefone");
              if (!e.address) m.push("Endereço");
              if (!e.hireDate) m.push("Data Admissão");
              return m;
            };
            const activeEmps = (employees || []).filter(e => e.status === "ativo");
            const empsWithMissing = activeEmps.map(e => ({ emp: e, missing: getMissing(e) })).filter(x => x.missing.length > 0);
            const [showDocAlert, setShowDocAlert] = [docAlertOpen, setDocAlertOpen];

            if (empsWithMissing.length > 0) return (
              <div className="mb-4">
                <button
                  onClick={() => setShowDocAlert(!showDocAlert)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                  data-testid="alert-missing-docs"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="text-sm font-semibold text-amber-800 flex-1 text-left">
                    {empsWithMissing.length} funcionário{empsWithMissing.length > 1 ? "s" : ""} com documentação pendente
                  </span>
                  <span className="text-xs text-amber-600 font-medium">{showDocAlert ? "Ocultar" : "Ver detalhes"}</span>
                </button>
                {showDocAlert && (
                  <div className="mt-2 border border-amber-100 rounded-lg bg-white overflow-hidden max-h-[400px] overflow-y-auto shadow-sm">
                    {empsWithMissing.map(({ emp, missing }) => (
                      <div key={emp.id} className="px-4 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 cursor-pointer" onClick={() => setPastaEmployee(emp)} data-testid={`alert-doc-${emp.id}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold text-neutral-800">{emp.name}</span>
                          <span className="text-[10px] font-mono text-neutral-400">{emp.matricula}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {missing.map(doc => (
                            <span key={doc} className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 font-semibold border border-red-100">{doc}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
            return null;
          })()}

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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Foto</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Matrícula</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Nome</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">CPF</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cargo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Categoria</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Docs</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(employees || []).map((e) => {
                      const missingDocs: string[] = [];
                      if (!e.photoUrl) missingDocs.push("Foto");
                      if (!e.cnhNumber) missingDocs.push("CNH");
                      if (!e.cnhExpiry) missingDocs.push("Val. CNH");
                      if (!(e as any).cnvNumber) missingDocs.push("CNV");
                      if (!(e as any).cnvExpiry) missingDocs.push("Val. CNV");
                      if (!(e as any).vestNumber) missingDocs.push("Colete");
                      if (!(e as any).vestExpiry) missingDocs.push("Val. Colete");
                      if (!e.rg) missingDocs.push("RG");
                      if (!e.phone) missingDocs.push("Telefone");
                      if (!e.address) missingDocs.push("Endereço");
                      if (!e.hireDate) missingDocs.push("Admissão");
                      return (
                      <tr key={e.id} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer" onClick={() => setPastaEmployee(e)} data-testid={`row-employee-${e.id}`}>
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
                        <td className="p-3">
                          {missingDocs.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold border border-emerald-100" data-testid={`docs-ok-${e.id}`}>
                              <CheckCircle2 className="w-3 h-3" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold border border-amber-100 cursor-help" title={missingDocs.join(", ")} data-testid={`docs-missing-${e.id}`}>
                              <AlertTriangle className="w-3 h-3" /> {missingDocs.length}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide inline-block w-fit ${
                            e.status === "ativo" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            e.status === "férias" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                            e.status === "bloqueado_definitivo" ? "bg-red-50 text-red-700 border border-red-200" :
                            "bg-neutral-100 text-neutral-600 border border-neutral-200"
                          }`}>{e.status === "bloqueado_definitivo" ? "BLOQUEADO" : e.status === "ativo" ? "ATIVO" : e.status === "férias" ? "FÉRIAS" : e.status?.toUpperCase()}</span>
                        </td>
                        <td className="p-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setPastaEmployee(e)} title="Abrir Pasta" data-testid={`button-pasta-${e.id}`}>
                              <FolderOpen className="w-4 h-4 text-neutral-700" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setAccessEmployee(e)} title="Criar Acesso" data-testid={`button-create-access-${e.id}`}>
                              <KeyRound className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setEditItem(e); setShowForm(true); }} data-testid={`button-edit-employee-${e.id}`}><Pencil className="w-4 h-4" /></Button>
                            {isDiretoria ? (
                              <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE ${e.name}? Esta ação não pode ser desfeita.`)) deleteMutation.mutate(e.id); }} data-testid={`button-delete-employee-${e.id}`} title="Excluir permanentemente"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                            ) : e.status !== "inativo" ? (
                              <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Inativar o funcionário ${e.name}?`)) inactivateMutation.mutate(e.id); }} data-testid={`button-inactivate-employee-${e.id}`} title="Inativar"><Ban className="w-4 h-4 text-amber-500" /></Button>
                            ) : null}
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
        </>
      )}

      {showForm && <EmployeeForm employee={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {accessEmployee && (
        <CreateAccessModal employee={accessEmployee} open={!!accessEmployee} onClose={() => setAccessEmployee(null)} />
      )}
    </AdminLayout>
  );
}
