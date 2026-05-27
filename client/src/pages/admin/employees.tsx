import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn, authFetch, invalidateRelatedQueries } from "@/lib/queryClient";
import { titleCase, parseBRL, formatDateBRT } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, KeyRound, Camera, Loader2, DollarSign, Search, FileText, Upload, AlertTriangle, Eye, ScanLine, CheckCircle2, ShieldCheck, Car, ClipboardList, Ban, Clock, Shield, FolderOpen, ArrowLeft, Download, Home, RefreshCw, MapPin, UserX, Fuel, Users, Baby, Receipt, PiggyBank, Calendar } from "lucide-react";
import { getContactIssues, summarizeContactIssues } from "@shared/contact-validation";
import { Badge } from "@/components/ui/badge";
import type { Employee, EmployeeSalary, EmployeeDocument } from "@shared/schema";
import { BrandedContractDialog } from "@/components/branded-contract-dialog";
import { BulkFixContactsDialog } from "@/components/admin/bulk-fix-contacts-dialog";

// Anexar foto direto do celular vem em 4-8 MB e estoura o limite do POST
// (413 request entity too large). Comprime via canvas pra max 1280px no
// maior lado + JPEG q=0.7 (igual handlePhotoCapture do mobile/missao.tsx).
// PDF passa direto. Resultado típico: ~80-250 KB.
function readAndCompressFile(file: File): Promise<{ dataUrl: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = (ev) => {
      const originalDataUrl = ev.target!.result as string;
      if (!file.type.startsWith("image/") || originalDataUrl.startsWith("data:application/pdf")) {
        resolve({ dataUrl: originalDataUrl, fileName: file.name });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxSize = 1280;
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round((h / w) * maxSize); w = maxSize; }
          else { w = Math.round((w / h) * maxSize); h = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve({ dataUrl: originalDataUrl, fileName: file.name }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.7);
        const origKB = Math.round(originalDataUrl.length * 0.75 / 1024);
        const newKB = Math.round(compressed.length * 0.75 / 1024);
        console.log(`[doc-upload] foto comprimida: ${origKB} KB → ${newKB} KB (${w}x${h})`);
        const baseName = file.name.replace(/\.(png|webp|heic|heif|gif|bmp|tiff?)$/i, "").replace(/\.jpe?g$/i, "");
        resolve({ dataUrl: compressed, fileName: `${baseName || "foto"}.jpg` });
      };
      img.onerror = () => resolve({ dataUrl: originalDataUrl, fileName: file.name });
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

const BRL = (v: any) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const iso = String(d).split("T")[0];
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

const CARGOS = ["Vigilante", "Adm", "Gerente", "Supervisor", "Operador", "Auxiliar de Limpeza"];

// Catálogo canônico de documentos por perfil — fonte única em
// shared/documents-catalog.ts (compartilhada com server/onboarding +
// server/jobs/document-compliance). Re-exportada aqui pra continuar
// permitindo `import { buildRequiredDocsCatalog } from "./employees"`.
import {
  buildRequiredDocsCatalog,
  filterDocsCatalogByRole,
  profileFromRole,
  type DocItem,
  type DocGroup,
} from "@shared/documents-catalog";
export { buildRequiredDocsCatalog, filterDocsCatalogByRole, profileFromRole };
export type { DocItem, DocGroup };
const CATEGORIAS = ["Mensalista", "Free Lance", "Temporário", "Terceirizado"];
const FORMAS_PAGAMENTO = ["PIX", "Transferência Bancária", "Dinheiro", "Cheque"];
const ESTADO_CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];

const CCT_SP_2025 = {
  label: "CCT SP 2025/2026",
  salarioBase: 2432.50,
  periculosidadePct: 30,
  get periculosidade() { return this.salarioBase * (this.periculosidadePct / 100); },
  valeRefeicaoDia: 43.00,
  cestaBasica: 200.00,
  diasUteisMes: 22,
  encargosSociaisPct: 80,
  horaExtraValor: 22.99,
  get valeRefeicaoMes() { return this.valeRefeicaoDia * this.diasUteisMes; },
  get totalBruto() { return this.salarioBase + this.periculosidade + this.valeRefeicaoMes + this.cestaBasica; },
  pagamentoDiaUtil: 5,
};
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

function formatPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)})${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCepBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

const CNH_CATEGORIAS = ["A", "B", "AB", "C", "AC", "D", "AD", "E", "AE"];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

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
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    },
    enabled: open,
  });

  const [form, setForm] = useState({
    baseSalary: "",
    effectiveDate: "",
    reason: "",
    notes: "",
    valeRefeicaoDiario: "43.00",
    cestaBasica: "200.00",
    valeTransporteMensal: "0",
    beneficiosOutros: "0",
    encargosPct: "80",
    horasMensais: "220",
    periculosidadePct: "30",
    dependentesIr: "0",
    ajudaCustoMensal: "0",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/employees/${employee.id}/salaries`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      setForm({
        baseSalary: "", effectiveDate: "", reason: "", notes: "",
        valeRefeicaoDiario: "43.00", cestaBasica: "200.00",
        valeTransporteMensal: "0", beneficiosOutros: "0",
        encargosPct: "80", horasMensais: "220",
        periculosidadePct: "30", dependentesIr: "0", ajudaCustoMensal: "0",
      });
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Salários - {titleCase(employee.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Salário Base (R$) *</label>
              <Input type="text" inputMode="decimal" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} required data-testid="input-salary-value" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data Vigência *</label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required data-testid="input-salary-date" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Motivo</label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex: Promoção, Reajuste" data-testid="input-salary-reason" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Encargos (%)</label>
              <Input type="text" inputMode="decimal" value={form.encargosPct} onChange={(e) => setForm({ ...form, encargosPct: e.target.value })} placeholder="80" data-testid="input-salary-encargos" />
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold text-neutral-700 mb-2">Benefícios CCT</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">VR — Valor por dia útil (R$)</label>
                <Input type="text" inputMode="decimal" value={form.valeRefeicaoDiario} onChange={(e) => setForm({ ...form, valeRefeicaoDiario: e.target.value })} placeholder="43.00" data-testid="input-salary-vr-diario" />
                <p className="text-[11px] text-neutral-500 mt-1">Multiplicado pelos dias úteis do mês (sem feriados)</p>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Cesta Básica (R$/mês)</label>
                <Input type="text" inputMode="decimal" value={form.cestaBasica} onChange={(e) => setForm({ ...form, cestaBasica: e.target.value })} placeholder="200.00" data-testid="input-salary-cesta" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Vale Transporte (R$/mês)</label>
                <Input type="text" inputMode="decimal" value={form.valeTransporteMensal} onChange={(e) => setForm({ ...form, valeTransporteMensal: e.target.value })} placeholder="0" data-testid="input-salary-vt" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Outros Benefícios (R$/mês)</label>
                <Input type="text" inputMode="decimal" value={form.beneficiosOutros} onChange={(e) => setForm({ ...form, beneficiosOutros: e.target.value })} placeholder="0" data-testid="input-salary-outros" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Horas Mensais</label>
                <Input type="text" inputMode="decimal" value={form.horasMensais} onChange={(e) => setForm({ ...form, horasMensais: e.target.value })} placeholder="220" data-testid="input-salary-horas" />
              </div>
            </div>
            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-semibold text-neutral-700 mb-2">Folha 2025 (CLT)</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Periculosidade (%)</label>
                  <Input type="text" inputMode="decimal" value={form.periculosidadePct} onChange={(e) => setForm({ ...form, periculosidadePct: e.target.value })} placeholder="30" data-testid="input-salary-peric" />
                  <p className="text-[10px] text-neutral-500 mt-0.5">Padrão vigilantes: 30%</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Dependentes IR</label>
                  <Input type="number" min="0" value={form.dependentesIr} onChange={(e) => setForm({ ...form, dependentesIr: e.target.value })} placeholder="0" data-testid="input-salary-deps" />
                  <p className="text-[10px] text-neutral-500 mt-0.5">R$ 189,59/dependente</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Ajuda de Custo (R$/mês)</label>
                  <Input type="text" inputMode="decimal" value={form.ajudaCustoMensal} onChange={(e) => setForm({ ...form, ajudaCustoMensal: e.target.value })} placeholder="0" data-testid="input-salary-ajuda" />
                  <p className="text-[10px] text-neutral-500 mt-0.5">Valor fixo mensal</p>
                </div>
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.baseSalary || !form.effectiveDate} className="w-full mt-3" data-testid="button-save-salary">
                {createMutation.isPending ? "Salvando..." : "Adicionar Salário"}
              </Button>
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">
              Diárias pontuais (plantões extras, ajudas) são lançadas separadamente em <strong>Custos Fixos → Diárias</strong>.
            </p>
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

function _eu(ts: string) { return /[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z"; }
function isDocExpiringSoon(dateStr: string | null): "expired" | "warning" | "ok" {
  if (!dateStr) return "ok";
  const d = new Date(_eu(dateStr));
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays < 30) return "warning";
  return "ok";
}

function DocumentsModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const [showBrandedContract, setShowBrandedContract] = useState(false);
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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 15MB (será comprimido se for imagem)", variant: "destructive" });
      return;
    }
    try {
      const { dataUrl, fileName } = await readAndCompressFile(file);
      setDocForm(prev => ({ ...prev, fileData: dataUrl, fileName }));
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
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
          <tr><td>CTPS</td><td>${esc((employee as any).ctpsNumber)}${(employee as any).ctpsSerie ? ` / Série ${esc((employee as any).ctpsSerie)}` : ""}</td></tr>
          <tr><td>Matrícula</td><td>${esc(employee.matricula)}</td></tr>
          <tr><td>Cargo</td><td>${esc(employee.role)}</td></tr>
          <tr><td>Categoria</td><td>${employee.category ? esc(employee.category) : "Mensalista"}</td></tr>
          <tr><td>Data de Admissão</td><td>${employee.hireDate ? esc(employee.hireDate) : formatDateBRT(new Date())}</td></tr>
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
            <Button variant="outline" size="sm" onClick={() => setShowBrandedContract(true)} data-testid="button-generate-contract">
              <FileText className="w-4 h-4 mr-1" /> Gerar Contrato
            </Button>
          </DialogTitle>
        </DialogHeader>
        {showBrandedContract && (
          <BrandedContractDialog
            open={showBrandedContract}
            onClose={() => setShowBrandedContract(false)}
            entityType="employee"
            entityId={employee.id}
            entityName={employee.name}
            defaults={{ nome: employee.name, documento: employee.cpf || "", endereco: employee.address || "", cargo: employee.role || "" }}
          />
        )}
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
                              {formatDateBRT(d.expiryDate)}
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

  const { data: fullEmployee, isLoading: loadingFullEmployee } = useQuery<Employee>({
    queryKey: ["/api/employees", employee?.id],
    queryFn: async () => {
      const res = await authFetch(`/api/employees/${employee!.id}`);
      if (!res.ok) throw new Error("Erro ao carregar dados completos");
      return res.json();
    },
    enabled: !!employee?.id,
    staleTime: 0,
  });

  const emp = fullEmployee || employee;

  type DocAttachment = { fileData: string; fileName: string; scanning: boolean };
  const [docAttachments, setDocAttachments] = useState<Record<string, DocAttachment>>({
    CNH: { fileData: "", fileName: "", scanning: false },
    CNV: { fileData: "", fileName: "", scanning: false },
    "Comprovante de Residência": { fileData: "", fileName: "", scanning: false },
  });

  const [formInitialized, setFormInitialized] = useState(!employee);
  const [form, setForm] = useState({
    matricula: "",
    name: "",
    cpf: "",
    rg: "",
    orgaoEmissor: "",
    ufEmissor: "",
    cnhNumber: "",
    cnhCategoria: "",
    cnhExpiry: "",
    cnvNumber: "",
    cnvExpiry: "",
    ctpsNumber: "",
    ctpsSerie: "",
    pis: "",
    role: "Vigilante",
    category: "Mensalista",
    tipoContratacao: "clt" as "clt" | "fixo",
    phone: "",
    email: "",
    zip: "",
    address: "",
    addressNumber: "",
    addressComplement: "",
    bairro: "",
    city: "",
    state: "",
    addressLat: null as number | null,
    addressLng: null as number | null,
    birthDate: "",
    motherName: "",
    fatherName: "",
    nationality: "",
    maritalStatus: "",
    education: "",
    hireDate: "",
    vacationExpiry: "",
    sindicato: "",
    paymentMethod: "PIX",
    bankName: "",
    bankAgency: "",
    bankAccount: "",
    pixKey: "",
    photoUrl: "",
    status: "ativo",
    blockType: "",
    blockReason: "",
    notes: "",
  });

  useEffect(() => {
    if (fullEmployee && !formInitialized) {
      const e = fullEmployee as any;
      setForm({
        matricula: e.matricula || "",
        name: e.name || "",
        cpf: e.cpf || "",
        rg: e.rg || "",
        orgaoEmissor: e.orgaoEmissor || "",
        ufEmissor: e.ufEmissor || "",
        cnhNumber: e.cnhNumber || "",
        cnhCategoria: e.cnhCategoria || "",
        cnhExpiry: e.cnhExpiry || "",
        cnvNumber: e.cnvNumber || "",
        cnvExpiry: e.cnvExpiry || "",
        ctpsNumber: e.ctpsNumber || "",
        ctpsSerie: e.ctpsSerie || "",
        pis: e.pis || "",
        role: e.role || "Vigilante",
        category: e.category || "Mensalista",
        tipoContratacao: (e.tipoContratacao || e.tipo_contratacao || "clt") as "clt" | "fixo",
        phone: e.phone ? formatPhoneBR(e.phone) : "",
        email: e.email || "",
        zip: e.zip ? formatCepBR(e.zip) : "",
        address: e.address || "",
        addressNumber: e.addressNumber || "",
        addressComplement: e.addressComplement || "",
        bairro: e.bairro || "",
        city: e.city || "",
        state: e.state || "",
        addressLat: e.addressLat || null,
        addressLng: e.addressLng || null,
        birthDate: e.birthDate || "",
        motherName: e.motherName || "",
        fatherName: e.fatherName || "",
        nationality: e.nationality || "",
        maritalStatus: e.maritalStatus || "",
        education: e.education || "",
        hireDate: e.hireDate || "",
        vacationExpiry: e.vacationExpiry || "",
        sindicato: e.sindicato || "",
        paymentMethod: e.paymentMethod || "PIX",
        bankName: e.bankName || "",
        bankAgency: e.bankAgency || "",
        bankAccount: e.bankAccount || "",
        pixKey: e.pixKey || "",
        photoUrl: e.photoUrl || "",
        status: e.status || "ativo",
        blockType: e.blockType || "",
        blockReason: e.blockReason || "",
        notes: e.notes || "",
      });
      setFormInitialized(true);
    }
  }, [fullEmployee, formInitialized]);

  const { data: nextMatricula } = useQuery<{ matricula: string }>({
    queryKey: ["/api/employees/next-matricula"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/employees/next-matricula");
      return res.json();
    },
    enabled: !employee,
  });

  const [cepLoading, setCepLoading] = useState(false);
  const fetchCepData = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      toast({ title: "CEP incompleto", description: "Digite os 8 dígitos do CEP", variant: "destructive" });
      return;
    }
    setCepLoading(true);
    try {
      const r = await fetch(`/api/cep/${clean}`, { credentials: "include" });
      if (!r.ok) {
        toast({ title: "CEP não encontrado", variant: "destructive" });
        return;
      }
      const data = await r.json();
      setForm((prev) => ({
        ...prev,
        address: data.address || prev.address,
        bairro: data.bairro || prev.bairro,
        city: data.city || prev.city,
        state: data.state || prev.state,
        addressLat: data.lat ?? prev.addressLat,
        addressLng: data.lng ?? prev.addressLng,
      }));
      toast({ title: "Endereço preenchido", description: `${data.address}, ${data.bairro} — ${data.city}/${data.state}` });
    } catch (err: any) {
      toast({ title: "Erro ao consultar CEP", description: err.message || "Tente novamente", variant: "destructive" });
    } finally {
      setCepLoading(false);
    }
  }, [toast]);

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
      const orgao = val(extracted.orgaoEmissor).toUpperCase().slice(0, 6);
      const ufEmissor = val(extracted.ufEmissor).toUpperCase().slice(0, 2);
      const cnh = val(extracted.cnhNumber);
      const cnhCat = val(extracted.cnhCategoria).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
      const cnhExp = val(extracted.cnhExpiry);
      const birth = val(extracted.birthDate);
      const mother = val(extracted.motherName);
      const father = val(extracted.fatherName);
      const nat = val(extracted.nationality);
      const marital = val(extracted.maritalStatus);
      const addr = val(extracted.address);
      const addrNum = val(extracted.addressNumber);
      const addrComp = val(extracted.addressComplement);
      const bairro = val(extracted.bairro);
      const city = val(extracted.city);
      const state = val(extracted.state).toUpperCase().slice(0, 2);
      const zipRaw = val(extracted.zip).replace(/\D/g, "");
      const zip = zipRaw.length === 8 ? `${zipRaw.slice(0, 5)}-${zipRaw.slice(5)}` : (zipRaw ? val(extracted.zip) : "");

      if (n && !prev.name) { updated.name = n; filledFields.push("Nome"); }
      if (cpf && !prev.cpf) { updated.cpf = cpf; filledFields.push("CPF"); }
      if (rg && !prev.rg) { updated.rg = rg; filledFields.push("RG"); }
      if (orgao && !prev.orgaoEmissor) { updated.orgaoEmissor = orgao; filledFields.push("Órgão Emissor"); }
      if (ufEmissor && !prev.ufEmissor) { updated.ufEmissor = ufEmissor; filledFields.push("UF Emissor"); }
      if (cnh && !prev.cnhNumber) { updated.cnhNumber = cnh; filledFields.push("CNH"); }
      if (cnhCat && !prev.cnhCategoria) { updated.cnhCategoria = cnhCat; filledFields.push("Categoria CNH"); }
      if (cnhExp && !prev.cnhExpiry) { updated.cnhExpiry = cnhExp; filledFields.push("Validade CNH"); }
      if (birth && !prev.birthDate) { updated.birthDate = birth; filledFields.push("Nascimento"); }
      if (mother && !prev.motherName) { updated.motherName = mother; filledFields.push("Mãe"); }
      if (father && !prev.fatherName) { updated.fatherName = father; filledFields.push("Pai"); }
      if (nat && !prev.nationality) { updated.nationality = nat; filledFields.push("Nacionalidade"); }
      if (marital && !prev.maritalStatus) { updated.maritalStatus = marital; filledFields.push("Est. Civil"); }
      if (addr && !prev.address) { updated.address = addr; filledFields.push("Endereço"); }
      if (addrNum && !prev.addressNumber) { updated.addressNumber = addrNum; filledFields.push("Número"); }
      if (addrComp && !prev.addressComplement) { updated.addressComplement = addrComp; filledFields.push("Complemento"); }
      if (bairro && !prev.bairro) { updated.bairro = bairro; filledFields.push("Bairro"); }
      if (city && !prev.city) { updated.city = city; filledFields.push("Cidade"); }
      if (state && !prev.state) { updated.state = state; filledFields.push("UF"); }
      if (zip && !prev.zip) { updated.zip = zip; filledFields.push("CEP"); }
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
        applyOcrToForm(extracted, docType);
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
        const saved = await res.json();
        if (!saved || !saved.id) {
          throw new Error("O servidor não confirmou o salvamento. Tente novamente.");
        }
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
      invalidateRelatedQueries("employee");
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

  const displayMatricula = employee ? (emp?.matricula || employee.matricula) : (nextMatricula?.matricula || "Gerando...");

  if (employee && loadingFullEmployee) {
    return (
      <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-employee-form">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Editar Funcionário</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
          <p className="text-sm text-neutral-500">Carregando dados completos do funcionário...</p>
        </div>
      </Card>
    );
  }

  if (employee && !formInitialized) {
    return (
      <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-employee-form">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Editar Funcionário</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
          <p className="text-sm text-neutral-500">Preparando formulário...</p>
        </div>
      </Card>
    );
  }

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
        if (!form.motherName?.trim()) {
          toast({ title: "Campo obrigatório", description: "O nome da mãe é obrigatório", variant: "destructive" });
          return;
        }
        {
          const d = (form.phone || "").replace(/\D/g, "");
          if (d.length > 0 && (d.length < 10 || d.length > 11)) {
            toast({ title: "Telefone inválido", description: "Telefone deve ter 10 ou 11 dígitos (DDD + número).", variant: "destructive" });
            return;
          }
        }
        {
          const d = (form.zip || "").replace(/\D/g, "");
          if (d.length > 0 && d.length !== 8) {
            toast({ title: "CEP inválido", description: "CEP deve ter exatamente 8 dígitos.", variant: "destructive" });
            return;
          }
        }
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
              <div className="flex gap-1">
                <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} required className="flex-1" data-testid="input-employee-rg" />
                <Input value={form.orgaoEmissor} onChange={(e) => setForm({ ...form, orgaoEmissor: e.target.value.toUpperCase().slice(0, 6) })} placeholder="Órgão" className="w-20" data-testid="input-employee-orgao-emissor" />
                <select value={form.ufEmissor} onChange={(e) => setForm({ ...form, ufEmissor: e.target.value })} className="w-16 h-10 border border-neutral-300 rounded-lg px-2 text-sm bg-white" data-testid="select-employee-uf-emissor">
                  <option value="">UF</option>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
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
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nome da Mãe <span className="text-red-500">*</span></label>
              <Input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} required data-testid="input-employee-mother" />
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
          <legend className="text-xs font-semibold text-neutral-600 px-2">Contato</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneBR(e.target.value) })} placeholder="(11)91111-1111" data-testid="input-employee-phone" />
              {(() => {
                const d = (form.phone || "").replace(/\D/g, "");
                if (d.length > 0 && (d.length < 10 || d.length > 11)) {
                  return <p className="text-xs text-red-600 mt-1" data-testid="error-employee-phone">Telefone deve ter 10 ou 11 dígitos.</p>;
                }
                return null;
              })()}
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">E-mail</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-employee-email" />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Endereço</legend>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CEP</label>
              <div className="flex gap-1">
                <Input
                  value={form.zip}
                  onChange={(e) => {
                    const masked = formatCepBR(e.target.value);
                    setForm({ ...form, zip: masked });
                    if (masked.replace(/\D/g, "").length === 8) fetchCepData(masked);
                  }}
                  placeholder="02412-111"
                  data-testid="input-employee-zip"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => fetchCepData(form.zip)} disabled={cepLoading} title="Buscar endereço pelo CEP" data-testid="button-cep-lookup">
                  {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {(() => {
                const d = (form.zip || "").replace(/\D/g, "");
                if (d.length > 0 && d.length !== 8) {
                  return <p className="text-xs text-red-600 mt-1" data-testid="error-employee-zip">CEP deve ter 8 dígitos.</p>;
                }
                return null;
              })()}
            </div>
            <div className="md:col-span-4">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Logradouro</label>
              <PlacesAutocomplete
                value={form.address}
                onChange={(val) => setForm({ ...form, address: val })}
                onPlaceSelect={(p) => setForm((prev) => ({ ...prev, address: p.address, addressLat: p.lat, addressLng: p.lng }))}
                placeholder="Rua, Avenida..."
                theme="light"
                data-testid="input-employee-address"
              />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Número</label>
              <Input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} placeholder="123" data-testid="input-employee-address-number" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Complemento</label>
              <Input value={form.addressComplement} onChange={(e) => setForm({ ...form, addressComplement: e.target.value })} placeholder="Apto, bloco..." data-testid="input-employee-address-complement" />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Bairro</label>
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} data-testid="input-employee-bairro" />
            </div>
            <div className="md:col-span-4">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Cidade</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-employee-city" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Estado</label>
              <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-state">
                <option value="">UF</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">CNH — Carteira Nacional de Habilitação</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Número da CNH</label>
              <Input value={form.cnhNumber} onChange={(e) => setForm({ ...form, cnhNumber: e.target.value })} data-testid="input-employee-cnh" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Categoria</label>
              <select value={form.cnhCategoria} onChange={(e) => setForm({ ...form, cnhCategoria: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-cnh-categoria">
                <option value="">Selecione</option>
                {CNH_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Validade CNH</label>
              <Input type="date" value={form.cnhExpiry} onChange={(e) => setForm({ ...form, cnhExpiry: e.target.value })} data-testid="input-employee-cnh-expiry" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Foto / PDF da CNH</label>
            <input
              ref={cnhFileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleDocAttachment("CNH", e)}
              disabled={docAttachments["CNH"]?.scanning}
              data-testid="input-file-cnh"
            />
            <div
              className={`p-3 border-2 border-dashed rounded-lg cursor-pointer transition-all text-center ${
                docAttachments["CNH"]?.fileData ? "border-green-300 bg-green-50" : "border-neutral-300 bg-neutral-50 hover:border-neutral-400"
              }`}
              onClick={() => !docAttachments["CNH"]?.scanning && cnhFileRef.current?.click()}
              data-testid="upload-doc-cnh-block"
            >
              {docAttachments["CNH"]?.scanning ? (
                <div className="flex items-center justify-center gap-2 py-1"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs text-neutral-500">Processando OCR...</span></div>
              ) : docAttachments["CNH"]?.fileData ? (
                <div className="flex items-center justify-center gap-2 py-1"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs font-medium text-green-700 truncate">{docAttachments["CNH"].fileName}</span></div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-1"><Car className="w-4 h-4 text-neutral-400" /><span className="text-xs text-neutral-600">Anexar foto ou PDF da CNH {!employee && "(OCR auto-preenche os campos)"}</span></div>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">CNV — Carteira Nacional de Vigilante</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Número da CNV</label>
              <Input value={form.cnvNumber} onChange={(e) => setForm({ ...form, cnvNumber: e.target.value })} data-testid="input-employee-cnv" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Validade CNV</label>
              <Input type="date" value={form.cnvExpiry} onChange={(e) => setForm({ ...form, cnvExpiry: e.target.value })} data-testid="input-employee-cnv-expiry" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Foto / PDF da CNV</label>
            <input
              ref={cnvFileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleDocAttachment("CNV", e)}
              disabled={docAttachments["CNV"]?.scanning}
              data-testid="input-file-cnv"
            />
            <div
              className={`p-3 border-2 border-dashed rounded-lg cursor-pointer transition-all text-center ${
                docAttachments["CNV"]?.fileData ? "border-green-300 bg-green-50" : "border-neutral-300 bg-neutral-50 hover:border-neutral-400"
              }`}
              onClick={() => !docAttachments["CNV"]?.scanning && cnvFileRef.current?.click()}
              data-testid="upload-doc-cnv-block"
            >
              {docAttachments["CNV"]?.scanning ? (
                <div className="flex items-center justify-center gap-2 py-1"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs text-neutral-500">Processando OCR...</span></div>
              ) : docAttachments["CNV"]?.fileData ? (
                <div className="flex items-center justify-center gap-2 py-1"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs font-medium text-green-700 truncate">{docAttachments["CNV"].fileName}</span></div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-1"><ShieldCheck className="w-4 h-4 text-neutral-400" /><span className="text-xs text-neutral-600">Anexar foto ou PDF da CNV {!employee && "(OCR auto-preenche os campos)"}</span></div>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-neutral-200 rounded-lg p-4">
          <legend className="text-xs font-semibold text-neutral-600 px-2">Documentos e Profissional</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">PIS</label>
              <Input value={form.pis} onChange={(e) => setForm({ ...form, pis: e.target.value })} data-testid="input-employee-pis" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CTPS (Número)</label>
              <Input value={form.ctpsNumber} onChange={(e) => setForm({ ...form, ctpsNumber: e.target.value })} placeholder="Ex: 1234567" data-testid="input-employee-ctps-number" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CTPS (Série)</label>
              <Input value={form.ctpsSerie} onChange={(e) => setForm({ ...form, ctpsSerie: e.target.value })} placeholder="Ex: 001-1" data-testid="input-employee-ctps-serie" />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" data-testid="select-employee-category">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Regime de Contratação</label>
              <select
                value={form.tipoContratacao}
                onChange={(e) => setForm({ ...form, tipoContratacao: e.target.value as "clt" | "fixo" })}
                className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200"
                data-testid="select-employee-tipo-contratacao"
              >
                <option value="clt">CLT (com encargos e descontos)</option>
                <option value="fixo">Valor Fixo (sem encargos/descontos)</option>
              </select>
              <p className="text-[11px] text-neutral-500 mt-1">
                {form.tipoContratacao === "fixo"
                  ? "Bruto = líquido. Sem INSS, IRRF, FGTS, férias, 13º."
                  : "Folha CLT padrão (INSS, IRRF, FGTS, provisões)."}
              </p>
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

type PastaTab = "documentos" | "multas" | "disciplinar" | "faltas" | "ponto" | "holerite" | "salarios" | "contrato" | "treinamento" | "aceites" | "dependentes";
const PASTA_TABS: { key: PastaTab; label: string; icon: any }[] = [
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "contrato", label: "Contrato", icon: ClipboardList },
  { key: "treinamento", label: "Treinamento", icon: Shield },
  { key: "dependentes", label: "Dependentes", icon: Users },
  { key: "multas", label: "Multas", icon: Ban },
  { key: "disciplinar", label: "Disciplinar", icon: Shield },
  { key: "faltas", label: "Faltas", icon: AlertTriangle },
  { key: "ponto", label: "Ponto", icon: Clock },
  { key: "holerite", label: "Holerite", icon: DollarSign },
  { key: "salarios", label: "Salários", icon: DollarSign },
  { key: "aceites", label: "Missões", icon: Shield },
];

interface OnboardingItem { label: string; status: "ok" | "pendente" | "vencido" | "neutro"; detail?: string; }
interface OnboardingStage { key: "documentacao" | "contratos" | "treinamento" | "holerites"; label: string; status: "ok" | "pendente" | "vencido" | "neutro"; blocking?: boolean; pendencias: string[]; itens: OnboardingItem[]; }
interface OnboardingResult { employeeId: number; employeeName: string; role: string | null; status: "ok" | "pendente"; apto: boolean; stages: OnboardingStage[]; pendencias: string[]; computedAt: string; }
interface OnboardingSummary { employeeId: number; apto: boolean; stages: { key: "documentacao" | "contratos" | "treinamento" | "holerites"; status: "ok" | "pendente" | "vencido" | "neutro"; blocking: boolean; count: number }[]; }

function OnboardingTimeline({ employeeId, onJumpToTab }: { employeeId: number; onJumpToTab?: (tab: PastaTab) => void }) {
  const { data, isLoading } = useQuery<OnboardingResult>({
    queryKey: ["/api/employees", employeeId, "onboarding"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employeeId}/onboarding`); return r.json(); },
    refetchInterval: 120000,
  });
  if (isLoading || !data) {
    return <div className="mb-4 p-4 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-500">Carregando status do onboarding...</div>;
  }
  if (!Array.isArray((data as any)?.stages)) {
    return <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-700">Status do onboarding indisponível no momento. Tente recarregar em alguns instantes.</div>;
  }
  const apto = data.apto;
  const total = data.stages.length;
  const concluidoCount = data.stages.filter(s => s.status === "ok" || s.status === "neutro").length;
  const stageColor = (s: OnboardingStage["status"]) =>
    s === "ok" ? "bg-emerald-500 border-emerald-500 text-white" :
    s === "vencido" ? "bg-red-500 border-red-500 text-white" :
    s === "neutro" ? "bg-neutral-300 border-neutral-300 text-white" :
    "bg-amber-400 border-amber-400 text-white";
  const stageBadge = (s: OnboardingStage["status"]) =>
    s === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    s === "vencido" ? "bg-red-50 text-red-700 border-red-200" :
    s === "neutro" ? "bg-neutral-100 text-neutral-500 border-neutral-200" :
    "bg-amber-50 text-amber-700 border-amber-200";
  const stageLabel = (s: OnboardingStage["status"]) =>
    s === "ok" ? "OK" : s === "vencido" ? "Vencido" : s === "neutro" ? "Não avaliado" : "Pendente";
  const tabFor: Record<OnboardingStage["key"], PastaTab> = {
    documentacao: "documentos",
    contratos: "contrato",
    treinamento: "treinamento",
    holerites: "holerite",
  };

  return (
    <div className={`mb-4 rounded-xl border-2 ${apto ? "border-emerald-300 bg-emerald-50/30" : "border-amber-300 bg-amber-50/40"} p-4`} data-testid="onboarding-timeline">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {apto ? (
            <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-neutral-900">
              {apto ? "Apto a entrar em OS" : "Funcionário NÃO pode entrar em OS"}
            </div>
            <div className="text-[11px] text-neutral-600">
              {apto
                ? "Todas as etapas do onboarding estão concluídas."
                : `Etapas concluídas: ${concluidoCount} de ${total} — corrija as pendências abaixo para liberar.`}
            </div>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">
          Onboarding
        </div>
      </div>

      {/* Timeline horizontal */}
      <div className="relative flex items-start justify-between gap-2 mb-3">
        <div className="absolute left-[14%] right-[14%] top-4 h-0.5 bg-neutral-200" />
        {data.stages.map((s, idx) => (
          <button
            key={s.key}
            onClick={() => onJumpToTab && onJumpToTab(tabFor[s.key])}
            className="relative z-10 flex-1 flex flex-col items-center gap-1.5 group"
            data-testid={`onboarding-stage-${s.key}`}
          >
            <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-sm shadow-sm ${stageColor(s.status)} group-hover:scale-110 transition-transform`}>
              {s.status === "ok" ? <CheckCircle2 className="w-5 h-5" /> : s.status === "neutro" ? <span className="text-base leading-none">–</span> : (idx + 1)}
            </div>
            <div className="text-center">
              <div className="text-[11px] font-bold text-neutral-800">{s.label}</div>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${stageBadge(s.status)}`}>
                {stageLabel(s.status)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Pendências detalhadas por etapa */}
      {!apto && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {data.stages.map(s => (
            <div key={s.key} className={`p-3 rounded-lg border ${s.status === "ok" ? "border-emerald-200 bg-white" : s.status === "vencido" ? "border-red-200 bg-white" : s.status === "neutro" ? "border-neutral-200 bg-white" : "border-amber-200 bg-white"}`}>
              <div className="text-[11px] font-bold text-neutral-800 mb-1.5 flex items-center justify-between">
                <span>{s.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${stageBadge(s.status)}`}>
                  {stageLabel(s.status)}
                </span>
              </div>
              {s.status === "ok" ? (
                <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Tudo em ordem
                </div>
              ) : s.status === "neutro" ? (
                <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                  {s.itens[0]?.detail || "Sem dados para avaliar"}
                </div>
              ) : (
                <ul className="space-y-1">
                  {s.itens.filter(i => i.status !== "ok").slice(0, 6).map((i, idx) => (
                    <li key={idx} className="text-[11px] text-neutral-700 flex items-start gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${i.status === "vencido" ? "bg-red-500" : "bg-amber-500"}`} />
                      <span>
                        <span className="font-semibold">{i.label}</span>
                        {i.detail && <span className="text-neutral-500"> — {i.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.status !== "ok" && onJumpToTab && (
                <button
                  onClick={() => onJumpToTab(tabFor[s.key])}
                  className="mt-2 text-[10px] font-bold text-neutral-700 hover:text-neutral-900 underline"
                  data-testid={`onboarding-fix-${s.key}`}
                >
                  Corrigir →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TRAINING_TYPES = [
  "Formação de Vigilante",
  "Especialização Escolta Armada",
  "Reciclagem",
  "NR-09 (Riscos Ambientais)",
  "NR-10 (Elétrica)",
  "Curso Direção Defensiva",
  "Outro",
];

function TreinamentoTab({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Formação de Vigilante", completedAt: "", expiryDate: "", certificateUrl: "", instructor: "", cargaHoraria: "", notes: "" });
  const { data: trainings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/employees", employeeId, "trainings"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employeeId}/trainings`); return r.json(); },
  });
  const createT = useMutation({
    mutationFn: async () => {
      const payload: any = { type: form.type, completedAt: form.completedAt };
      if (form.expiryDate) payload.expiryDate = form.expiryDate;
      if (form.certificateUrl) payload.certificateUrl = form.certificateUrl;
      if (form.instructor) payload.instructor = form.instructor;
      if (form.cargaHoraria) payload.cargaHoraria = Number(form.cargaHoraria);
      if (form.notes) payload.notes = form.notes;
      const r = await apiRequest("POST", `/api/employees/${employeeId}/trainings`, payload);
      if (!r.ok) throw new Error((await r.json()).message || "Erro");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "trainings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "onboarding"] });
      setShowForm(false);
      setForm({ type: "Formação de Vigilante", completedAt: "", expiryDate: "", certificateUrl: "", instructor: "", cargaHoraria: "", notes: "" });
      toast({ title: "Treinamento registrado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const delT = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("DELETE", `/api/trainings/${id}`); if (!r.ok) throw new Error((await r.json()).message); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "trainings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "onboarding"] });
      toast({ title: "Treinamento removido" });
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Treinamentos e Certificações</h3>
          <p className="text-[11px] text-neutral-500">Cursos de formação, reciclagens e capacitações obrigatórias.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)} data-testid="button-add-training">
          <Plus className="w-3.5 h-3.5 mr-1" /> {showForm ? "Cancelar" : "Novo"}
        </Button>
      </div>
      {showForm && (
        <Card className="p-4 border-neutral-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Tipo *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-9 border border-neutral-300 rounded px-3 text-sm" data-testid="select-training-type">
                {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Carga Horária (h)</label>
              <Input type="number" value={form.cargaHoraria} onChange={(e) => setForm({ ...form, cargaHoraria: e.target.value })} placeholder="40" data-testid="input-training-carga" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Realizado em *</label>
              <Input type="date" value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} data-testid="input-training-completed" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Validade (vencimento)</label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} data-testid="input-training-expiry" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Instrutor / Instituição</label>
              <Input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} data-testid="input-training-instructor" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Link do Certificado</label>
              <Input value={form.certificateUrl} onChange={(e) => setForm({ ...form, certificateUrl: e.target.value })} placeholder="https://..." data-testid="input-training-cert" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-neutral-600 block mb-1">Observações</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-training-notes" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => createT.mutate()} disabled={createT.isPending || !form.completedAt} data-testid="button-save-training">
              {createT.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </Card>
      )}
      {isLoading ? (
        <div className="text-xs text-neutral-500 py-6 text-center">Carregando...</div>
      ) : trainings.length === 0 ? (
        <div className="text-xs text-neutral-500 py-8 text-center border border-dashed border-neutral-300 rounded">Nenhum treinamento registrado</div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 rounded">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-600 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Realizado</th>
                <th className="px-3 py-2 text-left">Validade</th>
                <th className="px-3 py-2 text-left">Carga</th>
                <th className="px-3 py-2 text-left">Instrutor</th>
                <th className="px-3 py-2 text-left">Cert</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {trainings.map(t => {
                const expired = t.expiryDate && String(t.expiryDate) < today;
                return (
                  <tr key={t.id} className="border-t border-neutral-100" data-testid={`row-training-${t.id}`}>
                    <td className="px-3 py-2 font-semibold text-neutral-800">{t.type}</td>
                    <td className="px-3 py-2">{t.completedAt}</td>
                    <td className="px-3 py-2">
                      {t.expiryDate ? (
                        <span className={expired ? "text-red-600 font-bold" : ""}>
                          {t.expiryDate}{expired && <span className="ml-1 text-[9px] px-1 py-0.5 bg-red-100 text-red-700 rounded font-bold uppercase">Vencido</span>}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-2">{t.cargaHoraria ? `${t.cargaHoraria}h` : "-"}</td>
                    <td className="px-3 py-2">{t.instructor || "-"}</td>
                    <td className="px-3 py-2">
                      {t.certificateUrl ? <a href={t.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Abrir</a> : "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { if (confirm("Remover treinamento?")) delT.mutate(t.id); }} className="text-red-600 hover:text-red-800" data-testid={`button-delete-training-${t.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/fines`, { ...fineForm, amount: fineForm.amount ? parseBRL(fineForm.amount) : null, points: fineForm.points ? Number(fineForm.points) : null }); },
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
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/payslips`, { ...psForm, grossSalary: psForm.grossSalary ? parseBRL(psForm.grossSalary) : null, netSalary: psForm.netSalary ? parseBRL(psForm.netSalary) : null, deductions: psForm.deductions ? parseBRL(psForm.deductions) : null, benefits: psForm.benefits ? parseBRL(psForm.benefits) : null }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); setShowPsForm(false); setPsForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), grossSalary: "", netSalary: "", deductions: "", benefits: "", notes: "" }); toast({ title: "Holerite registrado" }); },
  });
  const deletePayslip = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/payslips/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "payslips"] }); toast({ title: "Holerite removido" }); },
  });

  const fmtDate = (d: string | null) => d ? formatDateBRT(d) : "-";
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
                  <Input type="text" inputMode="decimal" value={psForm.grossSalary} onChange={(e) => setPsForm({ ...psForm, grossSalary: e.target.value })} placeholder="Salário Bruto" data-testid="input-payslip-gross" />
                  <Input type="text" inputMode="decimal" value={psForm.netSalary} onChange={(e) => setPsForm({ ...psForm, netSalary: e.target.value })} placeholder="Salário Líquido" data-testid="input-payslip-net" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="text" inputMode="decimal" value={psForm.deductions} onChange={(e) => setPsForm({ ...psForm, deductions: e.target.value })} placeholder="Descontos" data-testid="input-payslip-deductions" />
                  <Input type="text" inputMode="decimal" value={psForm.benefits} onChange={(e) => setPsForm({ ...psForm, benefits: e.target.value })} placeholder="Benefícios" data-testid="input-payslip-benefits" />
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

function SalaryTabContent({ employee, isDiretoria, salaries, loadingSal, showSalForm, setShowSalForm, salForm, setSalForm, addSalary, deleteSalary }: {
  employee: Employee; isDiretoria: boolean; salaries: any[]; loadingSal: boolean;
  showSalForm: boolean; setShowSalForm: (v: boolean) => void;
  salForm: { baseSalary: string; effectiveDate: string; reason: string }; setSalForm: (v: any) => void;
  addSalary: any; deleteSalary: any;
}) {
  const { toast } = useToast();
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [showCctEdit, setShowCctEdit] = useState(false);
  // CCT resolvido pelo cargo: vigilante→vigilancia, limpeza→siemaco, etc.
  // Garante que o "Kit CCT" mostre os valores certos pro cargo de cada funcionário.
  const cctQueryUrl = `/api/cct-config?cargo=${encodeURIComponent(employee.role || "")}`;
  const { data: cctData } = useQuery<typeof CCT_SP_2025>({
    queryKey: [cctQueryUrl],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 60_000,
  });
  const cctCfg = cctData || CCT_SP_2025;
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  // Label da competência de folha (ciclo 26 → 25). Ex: maio/2026 = 26/abr → 25/mai.
  const _periodoFolha = (() => {
    try { return getPayrollPeriod(selYear, selMonth); } catch { return null; }
  })();
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery<any>({
    queryKey: [`/api/employees/${employee.id}/salary-summary?month=${selMonth}&year=${selYear}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountCategory, setDiscountCategory] = useState<"falta" | "multa" | "abastecimento" | null>(null);
  const [discountForm, setDiscountForm] = useState({ type: "Falta injustificada", description: "", amount: "", numFaltas: "1", occurrenceDate: "" });
  const DISCOUNT_TYPES = ["Abastecimento indevido", "Multa de trânsito", "Falta injustificada", "Atraso", "Dano a equipamento", "Adiantamento", "Outro"];
  const addDiscountMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/employees/${employee.id}/salary-discounts`, {
        ...discountForm, amount: parseBRL(discountForm.amount), month: selMonth, year: selYear,
      });
    },
    onSuccess: () => {
      refetchSummary();
      setShowDiscountForm(false);
      setDiscountCategory(null);
      setDiscountForm({ type: "Falta injustificada", description: "", amount: "", numFaltas: "1", occurrenceDate: "" });
      toast({ title: "Desconto lançado" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
  const deleteDiscountMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/salary-discounts/${id}`); },
    onSuccess: () => { refetchSummary(); toast({ title: "Desconto removido" }); },
  });
  const fmtR = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const printHolerite = () => {
    if (!summary) return;
    const v = summary.vencimentos;
    const propLabel = summary.proporcional ? ` (${summary.diasTrabalhados}/30 dias)` : "";
    const lines = [
      `TORRES VIGILÂNCIA PATRIMONIAL LTDA — CNPJ 36.982.392/0001-89`,
      `HOLERITE — ${MESES[selMonth-1].toUpperCase()} / ${selYear}`,
      ``,
      `Funcionário: ${summary.employee.name}`,
      `Matrícula: ${summary.employee.matricula || "—"} | CPF: ${summary.employee.cpf || "—"} | Cargo: ${summary.employee.role || "—"}`,
      summary.proporcional ? `Admissão: ${summary.employee.hireDate} — Proporcional ${summary.diasTrabalhados} dias` : "",
      ``,
      `═══════════════════ VENCIMENTOS ═══════════════════`,
      `Salário Base${propLabel}: ${fmtR(v.salarioBase)}`,
      `Periculosidade (30%)${propLabel}: ${fmtR(v.periculosidade)}`,
      summary.horasExtras?.horas > 0 ? `Horas Extras (${summary.horasExtras.horas}h via Ponto iD): ${fmtR(v.horasExtrasValor || 0)}` : "",
      summary.horasExtras?.noturnas > 0 ? `Adicional Noturno (${summary.horasExtras.noturnas}h): ${fmtR(v.adicionalNoturnoValor || 0)}` : "",
      v.dsr > 0 ? `DSR sobre HE/Noturno: ${fmtR(v.dsr)}` : "",
      `Vale Refeição${propLabel}: ${fmtR(v.valeRefeicao)}`,
      summary.cestaBasicaIIAplicada
        ? `Cesta Básica II${propLabel} (${summary.cestaBasicaIIFaixa} - ${summary.cestaBasicaIIAtestados} atestado(s) no mês): ${fmtR(v.cestaBasica)}`
        : `Cesta Básica${propLabel}: ${fmtR(v.cestaBasica)}`,
      `TOTAL VENCIMENTOS: ${fmtR(v.total)}`,
      ``,
      `═══════════════════ DEDUÇÕES LEGAIS (CLT) ═══════════════════`,
      `INSS: ${fmtR(summary.deducoesLegais?.inss || 0)}`,
      `IRRF (${summary.deducoesLegais?.dependentesIR || 0} dep): ${fmtR(summary.deducoesLegais?.irrf || 0)}`,
      `FGTS (depósito empregador 8%): ${fmtR(summary.deducoesLegais?.fgts || 0)}`,
      `TOTAL DEDUÇÕES (descontadas do funcionário): ${fmtR(summary.deducoesLegais?.total || 0)}`,
      ``,
    ];
    if (summary.descontos.length > 0) {
      lines.push(`═══════════════════ DESCONTOS ═══════════════════`);
      for (const d of summary.descontos) lines.push(`${d.type}: ${d.description} — ${fmtR(d.amount)}`);
      lines.push(`TOTAL DESCONTOS: ${fmtR(summary.totalDescontos)}`);
      lines.push(``);
    }
    lines.push(`═══════════════════════════════════════════════════`);
    lines.push(`LÍQUIDO A RECEBER: ${fmtR(summary.liquido)}`);
    lines.push(`═══════════════════════════════════════════════════`);
    const w = window.open("", "_blank");
    if (w) { w.document.write(`<pre style="font-family:monospace;font-size:13px;padding:40px;max-width:700px;margin:auto;">${lines.filter(l=>l!==undefined).join("\n")}</pre>`); w.document.close(); w.print(); }
  };

  const propTag = summary?.proporcional ? ` (${summary.diasTrabalhados}/30d)` : "";

  return (
    <div className="space-y-5" data-testid="section-salarios">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))} className="border border-neutral-200 rounded-lg px-3 py-2 text-xs font-semibold bg-white" data-testid="select-salary-month">
            {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))} className="border border-neutral-200 rounded-lg px-3 py-2 text-xs font-semibold bg-white" data-testid="select-salary-year">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          {(employee.role?.toLowerCase().includes("vigilante") || employee.role?.toLowerCase().includes("escolta")) && (
            <>
              <Button size="sm" variant="outline" className="text-xs gap-1 h-8 border-neutral-300" onClick={() => { const today = new Date().toISOString().slice(0, 10); setSalForm({ baseSalary: String(cctCfg.salarioBase), effectiveDate: today, reason: `Kit ${cctCfg.label}` }); setShowSalForm(true); }} data-testid="button-apply-cct-kit">
                <ShieldCheck className="w-3 h-3" /> Kit CCT
              </Button>
              {isDiretoria && (
                <Button size="sm" variant="outline" className="text-xs gap-1 h-8 border-neutral-300" onClick={() => setShowCctEdit(true)} data-testid="button-edit-cct-kit" title="Editar valores do Kit CCT (Diretoria)">
                  <Pencil className="w-3 h-3" /> Editar CCT
                </Button>
              )}
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 h-8 border-neutral-300"
            onClick={async () => {
              const isVig = (employee.role?.toLowerCase().includes("vigilante") || employee.role?.toLowerCase().includes("escolta"));
              try {
                if (isVig && isDiretoria) {
                  await apiRequest("POST", `/api/employees/${employee.id}/apply-cct-kit`, {});
                  toast({ title: "Kit CCT reaplicado", description: "Novo registro salarial criado com os valores atuais da CCT." });
                }
                await queryClient.invalidateQueries({ queryKey: ["/api/cct-config"] });
                await queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "salaries"] });
                await refetchSummary();
              } catch (e: any) {
                toast({ title: "Erro ao atualizar", description: e?.message || String(e), variant: "destructive" });
              }
            }}
            disabled={loadingSummary}
            data-testid="button-refresh-summary"
            title="Reaplicar Kit CCT atual e recarregar valores"
          >
            <RefreshCw className={`w-3 h-3 ${loadingSummary ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1 h-8 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setShowDiscountForm(!showDiscountForm); setDiscountCategory(null); }} data-testid="button-launch-discount">
            <Ban className="w-3 h-3" /> Lançar Ocorrência
          </Button>
          {summary && (
            <Button size="sm" variant="outline" className="text-xs gap-1 h-8 border-neutral-300" onClick={printHolerite} data-testid="button-print-holerite">
              <Download className="w-3 h-3" /> Holerite
            </Button>
          )}
        </div>
      </div>

      {loadingSummary ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div> : summary && (
        <>
          <div className="bg-neutral-900 rounded-xl p-4 md:p-5" data-testid="card-salary-hero">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Remuneração Líquida Estimada</span>
              <span className="text-[10px] text-neutral-500" data-testid="text-payroll-period">
                {_periodoFolha ? `${_periodoFolha.labelShort}/${selYear}` : `${MESES[selMonth-1]} ${selYear}`}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-bold text-white tracking-tight" data-testid="text-salary-liquido">{fmtR(summary.liquido)}</span>
              {summary.deducoesLegais?.total > 0 && <span className="text-[10px] text-amber-300 font-medium">(-{fmtR(summary.deducoesLegais.total)} INSS+IRRF)</span>}
              {summary.totalDescontos > 0 && <span className="text-[10px] text-red-400 font-medium">(-{fmtR(summary.totalDescontos)} ocorr.)</span>}
            </div>
            {summary.proporcional && (
              <div className="flex items-center gap-1.5 mt-2">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-[11px] text-amber-300 font-medium">
                  Proporcional — Admissão {summary.employee.hireDate} — {summary.diasTrabalhados} dias ({(summary.fatorProporcional * 100).toFixed(0)}%)
                </span>
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-neutral-400">Vencimentos: <span className="text-emerald-400 font-semibold">{fmtR(summary.vencimentos.total)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-neutral-400">INSS+IRRF: <span className="text-amber-400 font-semibold">{fmtR(summary.deducoesLegais?.total || 0)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] text-neutral-400">Ocorrências: <span className="text-red-400 font-semibold">{fmtR(summary.totalDescontos)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-neutral-400">Custo Empresa: <span className="text-blue-300 font-semibold">{fmtR(summary.custoTotalEmpresa || 0)}</span></span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-neutral-200 rounded-xl overflow-hidden" data-testid="card-vencimentos">
              <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                  </div>
                  <span className="text-xs uppercase tracking-wider text-emerald-800 font-bold">Vencimentos</span>
                </div>
                <span className="text-xs font-bold text-emerald-700">{fmtR(summary.vencimentos.total)}</span>
              </div>
              <div className="p-3 space-y-2">
                <div className="bg-white border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">Salário Base</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{cctCfg.label}{propTag}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">+ {fmtR(summary.vencimentos.salarioBase)}</span>
                </div>
                <div className="bg-white border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">Periculosidade</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">30% sobre base{propTag}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">+ {fmtR(summary.vencimentos.periculosidade)}</span>
                </div>
                <div className="bg-white border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">Vale Refeição</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">R$ {((summary.vencimentos.valeRefeicao || 0) / Math.max(1, summary.diasUteis || 1)).toFixed(2).replace('.', ',')}/dia × {summary.diasUteis || 0} dias úteis{propTag}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">+ {fmtR(summary.vencimentos.valeRefeicao)}</span>
                </div>
                <div className="bg-white border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">Cesta Básica</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">Conforme CCT{propTag}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">+ {fmtR(summary.vencimentos.cestaBasica)}</span>
                </div>
                {summary.horasExtras?.horas > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-he-auto">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                        Horas Extras
                        <span className="text-[9px] bg-indigo-200/60 text-indigo-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Auto · Ponto iD</span>
                      </div>
                      <div className="text-[10px] text-indigo-500 mt-0.5">{summary.horasExtras.horas}h × valor hora × 1,60 ({summary.horasExtras.fonte === "ponto_operacional" ? "Control iD" : "lançamento manual"} · {summary.horasExtras.registros} reg.)</div>
                    </div>
                    <span className="text-sm font-bold text-indigo-700 tabular-nums">+ {fmtR(summary.vencimentos.horasExtrasValor || 0)}</span>
                  </div>
                )}
                {summary.horasExtras?.noturnas > 0 && (
                  <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-noturno-auto">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                        Adicional Noturno
                        <span className="text-[9px] bg-violet-200/60 text-violet-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Auto · Ponto iD</span>
                      </div>
                      <div className="text-[10px] text-violet-500 mt-0.5">{summary.horasExtras.noturnas}h × valor hora × 1,20</div>
                    </div>
                    <span className="text-sm font-bold text-violet-700 tabular-nums">+ {fmtR(summary.vencimentos.adicionalNoturnoValor || 0)}</span>
                  </div>
                )}
                {summary.vencimentos.dsr > 0 && (
                  <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-dsr">
                    <div>
                      <div className="text-xs font-semibold text-sky-800">DSR sobre HE / Noturno</div>
                      <div className="text-[10px] text-sky-500 mt-0.5">Repouso semanal remunerado (CLT)</div>
                    </div>
                    <span className="text-sm font-bold text-sky-700 tabular-nums">+ {fmtR(summary.vencimentos.dsr)}</span>
                  </div>
                )}
                {summary.vencimentos.ajudaCusto > 0 && (
                  <div className="bg-white border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-neutral-800">Ajuda de Custo</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Indenizatório (não tributável)</div>
                    </div>
                    <span className="text-sm font-bold text-emerald-700 tabular-nums">+ {fmtR(summary.vencimentos.ajudaCusto)}</span>
                  </div>
                )}
                {summary.horasExtras && summary.horasExtras.horas === 0 && summary.horasExtras.noturnas === 0 && (
                  <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-lg p-2.5 flex items-center gap-2" data-testid="row-he-empty">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-[10px] text-neutral-500">Sem horas extras / noturnas registradas no Ponto iD para este mês</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-neutral-200 rounded-xl overflow-hidden" data-testid="card-descontos">
              <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                    <Ban className="w-3.5 h-3.5 text-red-700" />
                  </div>
                  <span className="text-xs uppercase tracking-wider text-red-800 font-bold">Descontos / Retenções</span>
                </div>
                <span className="text-xs font-bold text-red-700">{summary.totalDescontos > 0 ? `- ${fmtR(summary.totalDescontos)}` : "R$ 0,00"}</span>
              </div>
              <div className="p-3">
                {summary.descontos.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400 font-medium">Nenhum desconto em {MESES[selMonth-1]}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary.descontos.map((d: any) => (
                      <div key={d.id} className="bg-white border border-red-100 rounded-lg p-3" data-testid={`discount-item-${d.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="text-xs font-semibold text-neutral-800">{d.type}</div>
                            <div className="text-[10px] text-neutral-400 mt-0.5 truncate">{d.description}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-red-600 tabular-nums">- {fmtR(d.amount)}</span>
                            {isDiretoria && (
                              <button onClick={() => deleteDiscountMut.mutate(d.id)} className="text-red-300 hover:text-red-600 transition-colors" data-testid={`button-delete-discount-${d.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-red-50">
                          <span className="text-[9px] text-neutral-400 font-mono">{d.createdAt ? new Date(_eu(d.createdAt)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                          {d.createdBy && <span className="text-[9px] text-neutral-400">por {d.createdBy}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-amber-200 rounded-xl overflow-hidden" data-testid="card-deducoes-legais">
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <Receipt className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <span className="text-xs uppercase tracking-wider text-amber-800 font-bold">Deduções Legais (CLT)</span>
                </div>
                <span className="text-xs font-bold text-amber-700">- {fmtR(summary.deducoesLegais?.total || 0)}</span>
              </div>
              <div className="p-3 space-y-2">
                <div className="bg-white border border-amber-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-inss">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">INSS</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">Faixas progressivas 7,5% / 9% / 12% / 14%</div>
                  </div>
                  <span className="text-sm font-bold text-amber-700 tabular-nums">- {fmtR(summary.deducoesLegais?.inss || 0)}</span>
                </div>
                <div className="bg-white border border-amber-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-irrf">
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">IRRF</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{summary.deducoesLegais?.dependentesIR || 0} dep. × R$ 189,59 — Tabela 2025</div>
                  </div>
                  <span className="text-sm font-bold text-amber-700 tabular-nums">- {fmtR(summary.deducoesLegais?.irrf || 0)}</span>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 flex items-center justify-between" data-testid="row-fgts">
                  <div>
                    <div className="text-xs font-semibold text-blue-800">FGTS (8% — empresa)</div>
                    <div className="text-[10px] text-blue-400 mt-0.5">Não desconta do funcionário · custo da empresa</div>
                  </div>
                  <span className="text-sm font-bold text-blue-700 tabular-nums">{fmtR(summary.deducoesLegais?.fgts || 0)}</span>
                </div>
              </div>
            </div>

            <div className="border border-violet-200 rounded-xl overflow-hidden" data-testid="card-provisoes">
              <div className="bg-violet-50 border-b border-violet-100 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                    <PiggyBank className="w-3.5 h-3.5 text-violet-700" />
                  </div>
                  <span className="text-xs uppercase tracking-wider text-violet-800 font-bold">Provisões Mensais</span>
                </div>
                <span className="text-xs font-bold text-violet-700">{fmtR(summary.provisoes?.total || 0)}</span>
              </div>
              <div className="p-3 space-y-2">
                <div className="bg-white border border-violet-100 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-800">13º salário</div>
                  <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR(summary.provisoes?.decimoTerceiro || 0)}</span>
                </div>
                <div className="bg-white border border-violet-100 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-800">Férias</div>
                  <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR(summary.provisoes?.ferias || 0)}</span>
                </div>
                <div className="bg-white border border-violet-100 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-800">1/3 Constitucional</div>
                  <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR(summary.provisoes?.tercoFerias || 0)}</span>
                </div>
                <div className="bg-white border border-violet-100 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-800">FGTS s/ Férias+13º</div>
                  <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR(summary.provisoes?.fgtsSobreFerias13 || 0)}</span>
                </div>
                <div className="bg-white border border-violet-100 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-800">INSS s/ Férias+13º</div>
                  <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR(summary.provisoes?.inssSobreFerias13 || 0)}</span>
                </div>
                <div className="text-[10px] text-violet-500 italic px-1 pt-1">
                  Mesma engine usada na Controladoria — reflete no custo fixo automaticamente.
                </div>
              </div>
            </div>
          </div>

          {showDiscountForm && (
            <div className="border border-red-200 rounded-xl p-4 bg-red-50/30" data-testid="form-discount">
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-red-600" />
                <span className="text-xs uppercase tracking-wider text-red-700 font-bold">Lançar Ocorrência — {MESES[selMonth-1]} {selYear}</span>
              </div>

              {!discountCategory ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="discount-category-selector">
                  <button
                    className="border-2 border-neutral-200 rounded-xl p-4 hover:border-red-300 hover:bg-red-50/50 transition-all text-left group"
                    onClick={() => {
                      const diaSalario = +(cctCfg.salarioBase / 30).toFixed(2);
                      const dsrProporcional = +(diaSalario / 6).toFixed(2);
                      const totalFalta = +(diaSalario + dsrProporcional).toFixed(2);
                      setDiscountCategory("falta");
                      setDiscountForm({ type: "Falta injustificada", description: `1 falta(s) — Dia: R$${diaSalario.toFixed(2)} + DSR: R$${dsrProporcional.toFixed(2)}`, amount: String(totalFalta), numFaltas: "1", occurrenceDate: "" });
                    }}
                    data-testid="btn-category-falta"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                        <UserX className="w-4 h-4 text-red-600" />
                      </div>
                      <span className="text-sm font-bold text-neutral-800">Falta</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">Desconta o dia + DSR proporcional automaticamente</p>
                  </button>
                  <button
                    className="border-2 border-neutral-200 rounded-xl p-4 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
                    onClick={() => {
                      setDiscountCategory("multa");
                      setDiscountForm({ type: "Multa de trânsito", description: "", amount: "", numFaltas: "1", occurrenceDate: "" });
                    }}
                    data-testid="btn-category-multa"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <span className="text-sm font-bold text-neutral-800">Multa / Avaria</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">Valor fixo informado — multas, danos, avarias</p>
                  </button>
                  <button
                    className="border-2 border-neutral-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
                    onClick={() => {
                      setDiscountCategory("abastecimento");
                      setDiscountForm({ type: "Abastecimento indevido", description: "", amount: "", numFaltas: "1", occurrenceDate: "" });
                    }}
                    data-testid="btn-category-abastecimento"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <Fuel className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-neutral-800">Abastecimento</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">Abastecimento indevido ou excedente</p>
                  </button>
                </div>
              ) : discountCategory === "falta" ? (
                <div className="space-y-3" data-testid="form-falta">
                  <div className="bg-white border border-red-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <UserX className="w-4 h-4 text-red-600" />
                      <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Desconto por Falta</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Qtd. de Faltas</label>
                        <Input type="number" min="1" max="30" value={discountForm.numFaltas} onChange={(e) => {
                          const n = Math.max(1, Number(e.target.value) || 1);
                          const diaSalario = +(cctCfg.salarioBase / 30).toFixed(2);
                          const dsrProporcional = +((diaSalario * n) / 6).toFixed(2);
                          const totalFalta = +(diaSalario * n + dsrProporcional).toFixed(2);
                          setDiscountForm({ ...discountForm, numFaltas: String(n), amount: String(totalFalta), description: `${n} falta(s) — Dia: R$${(diaSalario * n).toFixed(2)} + DSR: R$${dsrProporcional.toFixed(2)}` });
                        }} className="text-xs h-9" data-testid="input-faltas-qty" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Data da Ocorrência</label>
                        <Input type="date" value={discountForm.occurrenceDate} onChange={(e) => setDiscountForm({ ...discountForm, occurrenceDate: e.target.value })} className="text-xs h-9" data-testid="input-falta-date" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Valor Calculado (R$)</label>
                        <Input type="text" inputMode="decimal" value={discountForm.amount} readOnly className="text-xs h-9 bg-red-50 font-bold text-red-700" data-testid="input-falta-amount" />
                      </div>
                    </div>
                    <div className="mt-2 bg-neutral-50 rounded-md p-2">
                      <p className="text-[10px] text-neutral-500">
                        <span className="font-semibold">Cálculo:</span> Salário Base (R$ {cctCfg.salarioBase.toFixed(2)}) ÷ 30 = R$ {(cctCfg.salarioBase / 30).toFixed(2)}/dia × {discountForm.numFaltas} falta(s) + DSR proporcional (1/6)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => {
                      const dateStr = discountForm.occurrenceDate ? ` em ${formatDateBRT(discountForm.occurrenceDate + "T12:00:00")}` : "";
                      const desc = `${discountForm.numFaltas} falta(s)${dateStr} — Dia + DSR proporcional`;
                      discountForm.description = desc;
                      addDiscountMut.mutate();
                    }} disabled={!discountForm.amount || addDiscountMut.isPending} className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 gap-1.5" data-testid="button-save-falta">
                      {addDiscountMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                      Lançar Falta
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => { setDiscountCategory(null); setShowDiscountForm(false); }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3" data-testid={`form-${discountCategory}`}>
                  <div className="bg-white border border-neutral-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {discountCategory === "multa" ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <Fuel className="w-4 h-4 text-blue-600" />}
                      <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">{discountCategory === "multa" ? "Multa / Avaria" : "Abastecimento Indevido"}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {discountCategory === "multa" && (
                        <div>
                          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Tipo</label>
                          <select value={discountForm.type} onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs bg-white" data-testid="select-multa-type">
                            <option value="Multa de trânsito">Multa de trânsito</option>
                            <option value="Dano a equipamento">Dano a equipamento</option>
                            <option value="Avaria na viatura">Avaria na viatura</option>
                            <option value="Outro">Outro</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Descrição</label>
                        <Input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })} placeholder={discountCategory === "multa" ? "Ex: Multa radar BR-101 viatura UER7D08" : "Ex: Abastecimento dia 15/03 - R$ a mais"} className="text-xs h-9" data-testid="input-occurrence-description" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Valor (R$)</label>
                        <Input type="text" inputMode="decimal" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })} placeholder="150.00" className="text-xs h-9" data-testid="input-occurrence-amount" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addDiscountMut.mutate()} disabled={!discountForm.amount || !discountForm.description || addDiscountMut.isPending} className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 gap-1.5" data-testid="button-save-occurrence">
                      {addDiscountMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                      Lançar Desconto
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => { setDiscountCategory(null); setShowDiscountForm(false); }}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}

      <div className="border-t border-neutral-100 pt-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-neutral-400" />
            <h3 className="text-xs uppercase tracking-wider font-bold text-neutral-600">Histórico Salarial</h3>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => setShowSalForm(!showSalForm)} data-testid="button-add-salary-pasta">
            <Plus className="w-3 h-3" /> Novo Registro
          </Button>
        </div>
        {showSalForm && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Salário Base (R$)</label>
                <Input type="text" inputMode="decimal" value={salForm.baseSalary} onChange={(e) => setSalForm({ ...salForm, baseSalary: e.target.value })} placeholder="2432.50" className="text-xs h-9" data-testid="input-salary-value-pasta" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Data Vigência</label>
                <Input type="date" value={salForm.effectiveDate} onChange={(e) => setSalForm({ ...salForm, effectiveDate: e.target.value })} className="text-xs h-9" data-testid="input-salary-date-pasta" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Motivo</label>
              <Input value={salForm.reason} onChange={(e) => setSalForm({ ...salForm, reason: e.target.value })} placeholder="Ex: Promoção, Reajuste CCT" className="text-xs h-9" data-testid="input-salary-reason-pasta" />
            </div>
            <Button size="sm" onClick={() => addSalary.mutate()} disabled={!salForm.baseSalary || !salForm.effectiveDate || addSalary.isPending} className="text-xs h-8" data-testid="button-save-salary-pasta">
              {addSalary.isPending ? "Salvando..." : "Adicionar Registro"}
            </Button>
          </div>
        )}
        {loadingSal ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : salaries.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">Nenhum registro salarial</p>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Data Vigência</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Salário Base</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Motivo</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {salaries.map((s: any) => (
                  <tr key={s.id} className="hover:bg-neutral-50 transition-colors" data-testid={`row-salary-pasta-${s.id}`}>
                    <td className="px-4 py-2.5 font-mono text-neutral-600">{s.effectiveDate}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-neutral-900 tabular-nums">R$ {Number(s.baseSalary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-neutral-500 max-w-[200px] truncate">{s.reason || "—"}</td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => deleteSalary.mutate(s.id)} className="text-neutral-300 hover:text-red-500 transition-colors" data-testid={`button-delete-salary-pasta-${s.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-neutral-400 text-center italic">Pagamento todo {cctCfg.pagamentoDiaUtil}º dia útil do mês · {cctCfg.label}</p>

      {showCctEdit && (
        <CctEditDialog open={showCctEdit} onOpenChange={setShowCctEdit} initial={cctCfg} />
      )}
    </div>
  );
}

function CctField({ label, value, onChange, suffix, testId }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; testId: string }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">{label}</label>
      <div className="relative">
        <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="text-xs h-9 pr-10" data-testid={testId} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">{suffix}</span>}
      </div>
    </div>
  );
}

function CctEditDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial: typeof CCT_SP_2025 }) {
  const { toast } = useToast();
  const buildForm = (i: typeof CCT_SP_2025) => ({
    label: i.label,
    salarioBase: String(i.salarioBase),
    periculosidadePct: String(i.periculosidadePct),
    valeRefeicaoDia: String(i.valeRefeicaoDia),
    cestaBasica: String(i.cestaBasica),
    diasUteisMes: String(i.diasUteisMes),
    encargosSociaisPct: String(i.encargosSociaisPct),
    horaExtraValor: String(i.horaExtraValor),
    pagamentoDiaUtil: String(i.pagamentoDiaUtil),
    fgtsPct: String((i as any).fgtsPct ?? 8),
    inssPatronalPct: String((i as any).inssPatronalPct ?? 20),
    seguroVidaMensal: String((i as any).seguroVidaMensal ?? 0),
  });
  const [form, setForm] = useState(buildForm(initial));
  // Sincroniza o form com os valores reais do servidor sempre que o dialog abre
  // ou quando o `initial` (vindo do useQuery /api/cct-config) muda.
  useEffect(() => {
    if (open) setForm(buildForm(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const num = (v: string) => Number(String(v).replace(",", "."));
  const periculosidade = +(num(form.salarioBase) * (num(form.periculosidadePct) / 100) || 0).toFixed(2);
  const valeRefeicaoMes = +(num(form.valeRefeicaoDia) * num(form.diasUteisMes) || 0).toFixed(2);
  const totalBruto = +(num(form.salarioBase) + periculosidade + valeRefeicaoMes + num(form.cestaBasica) || 0).toFixed(2);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: form.label,
        salarioBase: num(form.salarioBase),
        periculosidadePct: num(form.periculosidadePct),
        valeRefeicaoDia: num(form.valeRefeicaoDia),
        cestaBasica: num(form.cestaBasica),
        diasUteisMes: Math.max(1, Math.round(num(form.diasUteisMes))),
        encargosSociaisPct: num(form.encargosSociaisPct),
        horaExtraValor: num(form.horaExtraValor),
        pagamentoDiaUtil: Math.max(1, Math.round(num(form.pagamentoDiaUtil))),
        fgtsPct: num(form.fgtsPct),
        inssPatronalPct: num(form.inssPatronalPct),
        seguroVidaMensal: num(form.seguroVidaMensal),
      };
      const res = await apiRequest("PUT", "/api/cct-config", payload);
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        return {};
      }
    },
    onSuccess: (data: any) => {
      const n = data?.appliedCount || 0;
      toast({
        title: "Kit CCT atualizado",
        description: n > 0
          ? `Novos valores salvos e aplicados para ${n} vigilante(s) ativo(s).`
          : "Novos valores salvos.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cct-config"] });
      invalidateRelatedQueries("employee");
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-edit-cct">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Editar Kit CCT</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block mb-1">Nome / Identificação da CCT</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="text-xs h-9" data-testid="input-cct-label" />
            </div>
            <CctField label="Salário Base" value={form.salarioBase} onChange={(v) => setForm({ ...form, salarioBase: v })} suffix="R$" testId="input-cct-salario" />
            <CctField label="Periculosidade" value={form.periculosidadePct} onChange={(v) => setForm({ ...form, periculosidadePct: v })} suffix="%" testId="input-cct-periculosidade" />
            <CctField label="Vale-Refeição / dia" value={form.valeRefeicaoDia} onChange={(v) => setForm({ ...form, valeRefeicaoDia: v })} suffix="R$" testId="input-cct-vr" />
            <CctField label="Dias úteis / mês" value={form.diasUteisMes} onChange={(v) => setForm({ ...form, diasUteisMes: v })} suffix="dias" testId="input-cct-dias" />
            <CctField label="Cesta Básica" value={form.cestaBasica} onChange={(v) => setForm({ ...form, cestaBasica: v })} suffix="R$" testId="input-cct-cesta" />
            <CctField label="Hora Extra" value={form.horaExtraValor} onChange={(v) => setForm({ ...form, horaExtraValor: v })} suffix="R$/h" testId="input-cct-he" />
            <CctField label="Encargos Sociais" value={form.encargosSociaisPct} onChange={(v) => setForm({ ...form, encargosSociaisPct: v })} suffix="%" testId="input-cct-encargos" />
            <CctField label="Pagamento (dia útil)" value={form.pagamentoDiaUtil} onChange={(v) => setForm({ ...form, pagamentoDiaUtil: v })} suffix="º" testId="input-cct-dia-pagamento" />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-2">Recolhimentos da Empresa</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <CctField label="FGTS" value={form.fgtsPct} onChange={(v) => setForm({ ...form, fgtsPct: v })} suffix="%" testId="input-cct-fgts" />
              <CctField label="INSS Patronal" value={form.inssPatronalPct} onChange={(v) => setForm({ ...form, inssPatronalPct: v })} suffix="%" testId="input-cct-inss" />
              <CctField label="Seguro de Vida" value={form.seguroVidaMensal} onChange={(v) => setForm({ ...form, seguroVidaMensal: v })} suffix="R$/mês" testId="input-cct-seguro-vida" />
            </div>
            <div className="text-[10px] text-amber-700/80 mt-2">FGTS e INSS Patronal incidem sobre Salário + Periculosidade + Hora Extra. Seguro de Vida é valor fixo mensal por funcionário.</div>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-1.5">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-2">Prévia do Cálculo</div>
            <div className="flex justify-between text-xs"><span className="text-neutral-600">Salário Base</span><span className="font-semibold tabular-nums">R$ {num(form.salarioBase).toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-neutral-600">+ Periculosidade ({form.periculosidadePct}%)</span><span className="font-semibold tabular-nums">R$ {periculosidade.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-neutral-600">+ VR ({form.valeRefeicaoDia}/dia × {form.diasUteisMes})</span><span className="font-semibold tabular-nums">R$ {valeRefeicaoMes.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-neutral-600">+ Cesta Básica</span><span className="font-semibold tabular-nums">R$ {num(form.cestaBasica).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-neutral-200"><span>Total Bruto Mensal</span><span className="text-emerald-700 tabular-nums">R$ {totalBruto.toFixed(2)}</span></div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-900 space-y-1">
            <div><strong>Encargos Sociais (%)</strong> — é o quanto a empresa paga <em>além</em> do salário bruto do funcionário: INSS patronal (~20%), FGTS (8%), provisão de 13º (~8,33%), férias + 1/3 (~11,11%), RAT/SAT e outros. O padrão de 80% reflete o custo total de um vigilante para a empresa (salário + benefícios + impostos). Esse percentual é usado nos relatórios de custo de mão-de-obra e no rateio de custo por OS — não vai no holerite do funcionário.</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Esses valores são aplicados quando você clica <strong>"Kit CCT"</strong> no funcionário ou na listagem. Salários já lançados não são alterados retroativamente.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-cancel-cct">Cancelar</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-cct">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Salvar Kit CCT
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CadastrarControlIdButton({ employee }: { employee: Employee }) {
  const { toast } = useToast();
  const { data: mappings } = useQuery<any[]>({
    queryKey: ["/api/control-id/mappings"],
  });
  const jaCadastrado = (mappings || []).some((m: any) => Number(m.employee_id) === employee.id && m.ativo);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/control-id/employees/${employee.id}/register`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      const titles: Record<string, string> = {
        created: "Cadastrado no Control iD",
        linked_existing: "Vinculado a usuário existente do Control iD",
        already_mapped: "Funcionário já estava cadastrado",
      };
      const desc = data.punchesBackfilled > 0
        ? `${data.punchesBackfilled} batida(s) órfã(s) atribuída(s) ao funcionário. Foto continua pendente.`
        : "Cadastro feito. Foto continua pendente — registrar no aparelho.";
      toast({ title: titles[data.status] || "Cadastro concluído", description: desc });
      queryClient.invalidateQueries({ queryKey: ["/api/control-id/mappings"] });
    },
    onError: (err: any) => {
      toast({ title: "Falha ao cadastrar no Control iD", description: err?.message || String(err), variant: "destructive" });
    },
  });

  if (employee.status !== "ativo") return null;

  if (jaCadastrado) {
    return (
      <Button variant="outline" size="sm" disabled className="bg-emerald-50 border-emerald-200 text-emerald-700" data-testid="button-controlid-ja-cadastrado">
        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Control iD OK
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (!employee.cpf) {
          toast({ title: "CPF obrigatório", description: "Cadastre o CPF do funcionário antes de enviar para o Control iD.", variant: "destructive" });
          return;
        }
        if (confirm(`Cadastrar ${titleCase(employee.name)} no Control iD/RHID?\n\nNome, CPF e matrícula serão enviados. A foto precisará ser cadastrada manualmente no aparelho depois.`)) {
          mutation.mutate();
        }
      }}
      disabled={mutation.isPending}
      data-testid="button-cadastrar-controlid"
    >
      {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ScanLine className="w-3.5 h-3.5 mr-1" />}
      Cadastrar no Control iD
    </Button>
  );
}

function EmployeePastaView({ employee, onClose, onEdit }: { employee: Employee; onClose: () => void; onEdit: () => void }) {
  const [showBrandedContractPasta, setShowBrandedContractPasta] = useState(false);
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
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/salaries`); const j = await r.json(); return Array.isArray(j) ? j : []; },
  });
  const { data: dependents = [], isLoading: loadingDeps } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "dependents"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/dependents`); return r.json(); },
  });
  const { data: probationContracts = [], isLoading: loadingProb } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "probation-contracts"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/probation-contracts`); return r.json(); },
  });
  // (isVigilanteRole boolean removido — duplicava o helper-função declarado mais
  // abaixo. Use `empIsVig` para a checagem booleana do funcionário corrente.)
  const createProbationMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/probation-contracts", { employeeId: employee.id });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "probation-contracts"] });
      toast({ title: "Contrato de Experiência criado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const [probBypassDialog, setProbBypassDialog] = useState<any | null>(null);
  const [probBypassReason, setProbBypassReason] = useState("");
  const probBypassMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await apiRequest("POST", `/api/probation-contracts/${id}/bypass`, { reason });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "probation-contracts"] });
      setProbBypassDialog(null); setProbBypassReason("");
      toast({ title: "Acesso liberado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const probRevokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/probation-contracts/${id}/bypass-revoke`, {});
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "probation-contracts"] });
      toast({ title: "Liberação revogada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ===== Contrato Definitivo (CLT, prazo indeterminado) =====
  const { data: permanentContracts = [], isLoading: loadingPerm } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "permanent-contracts"],
    queryFn: async () => { const r = await authFetch(`/api/employees/${employee.id}/permanent-contracts`); return r.json(); },
  });
  const [permBypassDialog, setPermBypassDialog] = useState<any | null>(null);
  const [permBypassReason, setPermBypassReason] = useState("");
  const permBypassMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await apiRequest("POST", `/api/permanent-contracts/${id}/bypass`, { reason });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "permanent-contracts"] });
      setPermBypassDialog(null); setPermBypassReason("");
      toast({ title: "Acesso liberado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const permRevokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/permanent-contracts/${id}/bypass-revoke`, {});
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "permanent-contracts"] });
      toast({ title: "Liberação revogada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const syncPermMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/permanent-contracts/sync-due`, {});
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "permanent-contracts"] });
      toast({ title: "Verificação concluída", description: `${data.created} contrato(s) gerado(s)` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const [showDepForm, setShowDepForm] = useState(false);
  const [depForm, setDepForm] = useState({ name: "", birthDate: "", parentesco: "filho", cpf: "", deduzIr: true, certidaoData: "", certidaoFileName: "", notes: "" });
  const handleCertidaoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 15MB (será comprimido se for imagem)", variant: "destructive" }); return; }
    try {
      const { dataUrl, fileName } = await readAndCompressFile(file);
      setDepForm(p => ({ ...p, certidaoData: dataUrl, certidaoFileName: fileName }));
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  };
  const addDependent = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/dependents`, depForm); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "dependents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      setDepForm({ name: "", birthDate: "", parentesco: "filho", cpf: "", deduzIr: true, certidaoData: "", certidaoFileName: "", notes: "" });
      setShowDepForm(false);
      toast({ title: "Dependente adicionado", description: "Contagem de IRRF atualizada automaticamente." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
  const deleteDependent = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/employee-dependents/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "dependents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/rh-summary"] });
      toast({ title: "Dependente removido" });
    },
  });

  const [docForm, setDocForm] = useState({ type: "RG", documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" });
  const [showDocForm, setShowDocForm] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 15MB (será comprimido se for imagem)", variant: "destructive" }); return; }
    try {
      const { dataUrl, fileName } = await readAndCompressFile(file);
      setDocForm(p => ({ ...p, fileData: dataUrl, fileName }));
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  };
  const createDoc = useMutation({
    mutationFn: async () => {
      if (docRequiresExpiry(docForm.type) && !docForm.expiryDate) {
        throw new Error("Data de validade é obrigatória para este tipo de documento");
      }
      const payload = {
        employeeId: employee.id,
        type: docForm.type,
        documentNumber: docForm.documentNumber || null,
        expiryDate: docForm.expiryDate || null,
        issueDate: docForm.issueDate || null,
        notes: docForm.notes || null,
        fileData: docForm.fileData || null,
        fileName: docForm.fileName || null,
      };
      await apiRequest("POST", "/api/employee-documents", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/employee-documents", employee.id] }); setDocForm({ type: "CNH", documentNumber: "", expiryDate: "", issueDate: "", notes: "", fileData: "", fileName: "" }); setShowDocForm(false); toast({ title: "Documento salvo" }); },
    onError: (e: Error) => { toast({ title: "Erro ao salvar documento", description: e.message, variant: "destructive" }); },
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
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/fines`, { ...fineForm, amount: fineForm.amount ? parseBRL(fineForm.amount) : null, points: fineForm.points ? Number(fineForm.points) : null }); },
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
    mutationFn: async () => { await apiRequest("POST", `/api/employees/${employee.id}/payslips`, { ...psForm, grossSalary: psForm.grossSalary ? parseBRL(psForm.grossSalary) : null, netSalary: psForm.netSalary ? parseBRL(psForm.netSalary) : null, deductions: psForm.deductions ? parseBRL(psForm.deductions) : null, benefits: psForm.benefits ? parseBRL(psForm.benefits) : null }); },
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

  const fmtDate = (d: string | null) => d ? formatDateBRT(d) : "-";
  const fmtCurrency = (v: number | null) => v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-";
  const docExpiryStatus = (dateStr: string | null): "expired" | "warning" | "ok" => {
    if (!dateStr) return "ok";
    const d = new Date(_eu(dateStr));
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return "expired";
    if (diffDays < 30) return "warning";
    return "ok";
  };

  const generateContract = () => {
    const esc = (s: string | null | undefined) => (s || "N/A").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const contractHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Contrato - ${esc(employee.name)}</title><style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.8;color:#000}h1{text-align:center;font-size:18px;margin-bottom:30px;text-transform:uppercase}h2{text-align:center;font-size:14px;margin-bottom:20px}.header{text-align:center;margin-bottom:40px;border-bottom:2px solid #000;padding-bottom:20px}.header h3{margin:0}p{text-align:justify;margin:10px 0;font-size:13px}.field{font-weight:bold}.section{margin-top:25px}.signatures{margin-top:60px;display:flex;justify-content:space-between}.sig-block{text-align:center;width:45%}.sig-line{border-top:1px solid #000;padding-top:5px;margin-top:60px;font-size:12px}table{width:100%;border-collapse:collapse;margin:15px 0}td{padding:6px 10px;border:1px solid #ccc;font-size:12px}td:first-child{font-weight:bold;background:#f5f5f5;width:35%}@media print{body{margin:0}}</style></head><body><div class="header"><h3>TORRES VIGILÂNCIA PATRIMONIAL LTDA</h3><p style="font-size:11px;text-align:center;">CNPJ: 36.982.392/0001-89</p></div><h1>CONTRATO DE TRABALHO</h1><h2>CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO</h2><div class="section"><p>Pelo presente instrumento particular de contrato individual de trabalho, de um lado <span class="field">TORRES VIGILÂNCIA PATRIMONIAL LTDA</span>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 36.982.392/0001-89, doravante denominada <span class="field">EMPREGADORA</span>, e de outro lado:</p><table><tr><td>Nome Completo</td><td>${esc(employee.name)}</td></tr><tr><td>CPF</td><td>${esc(employee.cpf)}</td></tr><tr><td>RG</td><td>${esc(employee.rg)}</td></tr><tr><td>CNH</td><td>${esc(employee.cnhNumber)}</td></tr><tr><td>Matrícula</td><td>${esc(employee.matricula)}</td></tr><tr><td>Cargo</td><td>${esc(employee.role)}</td></tr><tr><td>Categoria</td><td>${employee.category ? esc(employee.category) : "Mensalista"}</td></tr><tr><td>Data de Admissão</td><td>${employee.hireDate ? esc(employee.hireDate) : formatDateBRT(new Date())}</td></tr></table></div><div class="signatures"><div class="sig-block"><div class="sig-line">TORRES VIGILÂNCIA PATRIMONIAL LTDA<br/>CNPJ: 36.982.392/0001-89</div></div><div class="sig-block"><div class="sig-line">${esc(employee.name)}<br/>CPF: ${esc(employee.cpf)}</div></div></div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(contractHtml); w.document.close(); w.print(); }
  };

  const DOC_TYPES = ["RG", "CPF", "CTPS", "PIS/PASEP/NIS", "Comprovante de Residência", "Fotos 3x4", "Título de Eleitor", "Certificado de Reservista", "CNH", "CNV", "Certidão de Pontuação CNH", "Dados Bancários", "Certificado Formação Vigilante", "Certificado Formação Escolta Armada", "Reciclagem Escolta Armada", "ASO", "Certidão Nascimento/Casamento", "Certidão Nascimento Filhos", "Carteira Vacinação/Comprovante Escolar", "Antecedente Criminal Polícia Civil", "Antecedente Criminal Polícia Militar", "Certidão de COP", "Contrato Assinado", "Termo de Aceite", "Termo de Responsabilidade", "Outro"];


  // Determina perfil de cobrança documental do funcionário.
  // Cargos operacionais (vigilante/escolta/operador) precisam de docs DRT/PF
  // adicionais; demais cargos (Adm, Gerente, Supervisor, Auxiliar de Limpeza)
  // têm checklist enxuto.
  const isVigilanteRole = (role: string | null | undefined) => {
    const r = (role || "").toLowerCase();
    return r.includes("vigilante") || r.includes("escolta") || r.includes("operacional") || r.includes("operador");
  };
  const empIsVig = isVigilanteRole(employee.role);

  const ALL_REQUIRED_DOCS_FULL = buildRequiredDocsCatalog();
  const REQUIRED_DOCS = filterDocsCatalogByRole(ALL_REQUIRED_DOCS_FULL, empIsVig);

  const getDocStatus = (docType: string) => {
    if (docType === "Fotos 3x4" && employee.photoUrl) return true;
    // Pra Antecedentes Criminais unificado (perfil admin), aceita também
    // qualquer um dos dois antigos (Civil/Militar) como entregue, pra não
    // forçar re-upload de quem já tinha sob o nome antigo.
    if (docType === "Antecedentes Criminais") {
      return docs.some((d: any) => d.type === "Antecedentes Criminais" ||
        d.type === "Antecedente Criminal Polícia Civil" ||
        d.type === "Antecedente Criminal Polícia Militar");
    }
    return docs.some((d: any) => d.type === docType);
  };

  const MANDATORY_DOC_TYPES = REQUIRED_DOCS
    .filter(g => g.group !== "Dependentes (se necessário)")
    .flatMap(g => g.items.filter(i => !(i as any).optional).map(i => i.type));
  const missingDocs = MANDATORY_DOC_TYPES.filter(t => !getDocStatus(t));
  const allDocsComplete = missingDocs.length === 0;
  const isDiretoria = user?.role === "diretoria";

  const { data: empAcceptances = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", employee.id, "acceptances"],
    enabled: tab === "aceites",
  });

  const tabCounts: Record<PastaTab, number> = {
    documentos: docs.length,
    contrato: 0,
    treinamento: 0,
    dependentes: dependents.length,
    multas: fines.length,
    disciplinar: disciplinary.length,
    faltas: absences.length,
    ponto: timesheets.length,
    holerite: payslips.length,
    salarios: salaries.length,
    aceites: empAcceptances.length,
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
          <CadastrarControlIdButton employee={employee} />
          <Button variant="outline" size="sm" onClick={onEdit} data-testid="button-edit-from-pasta">
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
        </div>
      </div>

      <OnboardingTimeline employeeId={employee.id} onJumpToTab={(t) => setTab(t)} />

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
              <Button size="sm" onClick={() => {
                if (!showDocForm) {
                  const available = DOC_TYPES.filter((t) => t === "Outro" || DOCS_WITH_EXPIRY.has(t) || !docs.some((d: any) => d.type === t));
                  const firstAvail = available[0] || "Outro";
                  setDocForm(prev => ({ ...prev, type: firstAvail }));
                }
                setShowDocForm(!showDocForm);
              }} data-testid="button-add-doc-pasta"><Plus className="w-4 h-4 mr-1" />Novo</Button>
            </div>
            {showDocForm && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                <select value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-sm" data-testid="select-doc-type-pasta">
                  {DOC_TYPES.filter((t) => {
                    if (t === "Outro") return true;
                    if (DOCS_WITH_EXPIRY.has(t)) return true;
                    return !docs.some((d: any) => d.type === t);
                  }).map((t) => <option key={t} value={t}>{t}</option>)}
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

        {tab === "treinamento" && (
          <TreinamentoTab employeeId={employee.id} />
        )}

        {tab === "contrato" && (
          <div className="space-y-4">
            {/* ===== Contrato de Experiência (45 dias) — vigilantes ===== */}
            {empIsVig && (
              <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Contrato de Experiência (45 dias)</h3>
                  {probationContracts.length === 0 && canEdit && (
                    <Button size="sm" variant="outline" onClick={() => createProbationMutation.mutate()} disabled={createProbationMutation.isPending} data-testid="button-create-probation">
                      {createProbationMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Gerar
                    </Button>
                  )}
                </div>
                {loadingProb ? (
                  <div className="text-xs text-neutral-500">Carregando...</div>
                ) : probationContracts.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">Nenhum contrato de experiência emitido. {canEdit ? "Clique em Gerar para criar." : ""}</p>
                ) : (
                  probationContracts.map((c: any) => {
                    const status = c.assinaturaStatus === "assinado" ? "assinado" : (c.bypassDiretoria ? "liberado" : "pendente");
                    const startD = c.startDate?.split("T")[0] || c.startDate;
                    const endD = c.endDate?.split("T")[0] || c.endDate;
                    return (
                      <div key={c.id} className="bg-white border border-neutral-200 rounded-md p-3 space-y-2" data-testid={`row-probation-${c.id}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={
                            status === "assinado" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            status === "liberado" ? "bg-amber-100 text-amber-800 border-amber-200" :
                            "bg-red-100 text-red-800 border-red-200"
                          }>
                            {status === "assinado" ? "ASSINADO" : status === "liberado" ? "LIBERADO PELA DIRETORIA" : "PENDENTE DE ASSINATURA"}
                          </Badge>
                          <span className="text-neutral-600"><Calendar className="w-3 h-3 inline mr-0.5" /> {fmtDate(startD)} → {fmtDate(endD)} ({c.durationDays || 45} dias)</span>
                          <span className="text-neutral-600 font-medium">{c.funcao}</span>
                          <span className="text-neutral-600">{BRL(c.remuneracao)}</span>
                        </div>
                        {status === "liberado" && c.bypassReason && (
                          <p className="text-[10px] text-amber-700 italic">Motivo: {c.bypassReason}{c.bypassByName ? ` — por ${c.bypassByName}` : ""}</p>
                        )}
                        {status === "assinado" && c.assinadoEm && (
                          <p className="text-[10px] text-emerald-700">Assinado em {new Date(c.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.open(`/api/probation-contracts/${c.id}/pdf`, "_blank")} data-testid={`button-prob-pdf-${c.id}`}>
                            <FileText className="w-3.5 h-3.5 mr-1" /> Ver PDF
                          </Button>
                          {isDiretoria && status === "pendente" && (
                            <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => setProbBypassDialog(c)} data-testid={`button-prob-bypass-${c.id}`}>
                              Liberar acesso
                            </Button>
                          )}
                          {isDiretoria && status === "liberado" && (
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => probRevokeMutation.mutate(c.id)} disabled={probRevokeMutation.isPending} data-testid={`button-prob-revoke-${c.id}`}>
                              Revogar liberação
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ===== Contrato Definitivo (CLT prazo indeterminado) — gerado quando experiência vence ===== */}
            {empIsVig && (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Contrato Definitivo (CLT — prazo indeterminado)</h3>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => syncPermMutation.mutate()} disabled={syncPermMutation.isPending} data-testid="button-sync-permanent">
                      {syncPermMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Verificar agora
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-emerald-700 italic">Gerado automaticamente quando o Contrato de Experiência (45d) for assinado e vencer. Verificação diária às 03:10 BRT.</p>
                {loadingPerm ? (
                  <div className="text-xs text-neutral-500">Carregando...</div>
                ) : permanentContracts.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">Nenhum contrato definitivo gerado ainda.</p>
                ) : (
                  permanentContracts.map((c: any) => {
                    const status = c.assinaturaStatus === "assinado" ? "assinado" : (c.bypassDiretoria ? "liberado" : "pendente");
                    const startD = c.startDate?.split("T")[0] || c.startDate;
                    return (
                      <div key={c.id} className="bg-white border border-neutral-200 rounded-md p-3 space-y-2" data-testid={`row-permanent-${c.id}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={
                            status === "assinado" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            status === "liberado" ? "bg-amber-100 text-amber-800 border-amber-200" :
                            "bg-red-100 text-red-800 border-red-200"
                          }>
                            {status === "assinado" ? "ASSINADO" : status === "liberado" ? "LIBERADO PELA DIRETORIA" : "PENDENTE DE ASSINATURA"}
                          </Badge>
                          <span className="text-neutral-600"><Calendar className="w-3 h-3 inline mr-0.5" /> Início {fmtDate(startD)}</span>
                          <span className="text-neutral-600 font-medium">{c.funcao}</span>
                          <span className="text-neutral-600">{BRL(c.remuneracao)}</span>
                        </div>
                        {status === "liberado" && c.bypassReason && (
                          <p className="text-[10px] text-amber-700 italic">Motivo: {c.bypassReason}{c.bypassByName ? ` — por ${c.bypassByName}` : ""}</p>
                        )}
                        {status === "assinado" && c.assinadoEm && (
                          <p className="text-[10px] text-emerald-700">Assinado em {new Date(c.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.open(`/api/permanent-contracts/${c.id}/pdf`, "_blank")} data-testid={`button-perm-pdf-${c.id}`}>
                            <FileText className="w-3.5 h-3.5 mr-1" /> Ver PDF
                          </Button>
                          {isDiretoria && status === "pendente" && (
                            <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => setPermBypassDialog(c)} data-testid={`button-perm-bypass-${c.id}`}>
                              Liberar acesso
                            </Button>
                          )}
                          {isDiretoria && status === "liberado" && (
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => permRevokeMutation.mutate(c.id)} disabled={permRevokeMutation.isPending} data-testid={`button-perm-revoke-${c.id}`}>
                              Revogar liberação
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Dialog motivo bypass — definitivo */}
            <Dialog open={!!permBypassDialog} onOpenChange={(o) => !o && setPermBypassDialog(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Liberar acesso — Contrato Definitivo</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-neutral-600">Esta ação fica registrada no histórico. Informe o motivo (mínimo 5 caracteres):</p>
                  <Textarea value={permBypassReason} onChange={(e) => setPermBypassReason(e.target.value)} rows={3} placeholder="Ex.: contrato físico já assinado, será digitalizado posteriormente..." data-testid="textarea-perm-bypass-reason" />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setPermBypassDialog(null); setPermBypassReason(""); }}>Cancelar</Button>
                    <Button onClick={() => permBypassMutation.mutate({ id: permBypassDialog.id, reason: permBypassReason })} disabled={permBypassReason.trim().length < 5 || permBypassMutation.isPending} data-testid="button-perm-bypass-confirm">
                      {permBypassMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Liberar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Dialog motivo bypass — experiência */}
            <Dialog open={!!probBypassDialog} onOpenChange={(o) => !o && setProbBypassDialog(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Liberar acesso sem assinatura</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-neutral-600">Esta ação fica registrada no histórico do contrato. Informe o motivo (mínimo 5 caracteres):</p>
                  <Textarea value={probBypassReason} onChange={(e) => setProbBypassReason(e.target.value)} rows={3} placeholder="Ex.: contrato físico já assinado, será digitalizado posteriormente..." data-testid="textarea-prob-bypass-reason" />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setProbBypassDialog(null); setProbBypassReason(""); }}>Cancelar</Button>
                    <Button onClick={() => probBypassMutation.mutate({ id: probBypassDialog.id, reason: probBypassReason })} disabled={probBypassReason.trim().length < 5 || probBypassMutation.isPending} data-testid="button-prob-bypass-confirm">
                      {probBypassMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Liberar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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
                  setShowBrandedContractPasta(true);
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
                {(employee as any).ctpsNumber && <div><span className="text-[10px] font-bold text-neutral-400 uppercase block">CTPS</span><span className="font-mono">{(employee as any).ctpsNumber}{(employee as any).ctpsSerie ? ` / ${(employee as any).ctpsSerie}` : ""}</span></div>}
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
                  <Input type="text" inputMode="decimal" value={psForm.grossSalary} onChange={(e) => setPsForm({ ...psForm, grossSalary: e.target.value })} placeholder="Salário Bruto" data-testid="input-payslip-gross-pasta" />
                  <Input type="text" inputMode="decimal" value={psForm.netSalary} onChange={(e) => setPsForm({ ...psForm, netSalary: e.target.value })} placeholder="Salário Líquido" data-testid="input-payslip-net-pasta" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="text" inputMode="decimal" value={psForm.deductions} onChange={(e) => setPsForm({ ...psForm, deductions: e.target.value })} placeholder="Descontos" data-testid="input-payslip-deductions-pasta" />
                  <Input type="text" inputMode="decimal" value={psForm.benefits} onChange={(e) => setPsForm({ ...psForm, benefits: e.target.value })} placeholder="Benefícios" data-testid="input-payslip-benefits-pasta" />
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

        {tab === "dependentes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs uppercase tracking-wider font-bold text-neutral-600">Dependentes do Funcionário</h3>
                <span className="text-[10px] text-neutral-500">({dependents.filter((d: any) => d.deduzIr).length} para IRRF · R$ 189,59/dependente)</span>
              </div>
              <div className="flex items-center gap-2">
                {dependents.length === 0 && !((employee as any).dependentesDeclarados) && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const r = await apiRequest("POST", `/api/employees/${employee.id}/dependentes/declarar-sem`);
                    if (r.ok) {
                      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/employees", employee.id, "onboarding"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/onboarding-summary"] });
                      toast({ title: "Declarado: sem dependentes" });
                    }
                  }} data-testid="button-declare-no-dependents">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Não tenho dependentes
                  </Button>
                )}
                {((employee as any).dependentesDeclarados) && dependents.length === 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Sem dependentes (declarado)
                  </span>
                )}
                <Button size="sm" onClick={() => {
                  if ((employee as any).dependentesDeclarados) {
                    apiRequest("POST", `/api/employees/${employee.id}/dependentes/limpar-declaracao`).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
                    });
                  }
                  setShowDepForm(!showDepForm);
                }} data-testid="button-add-dependent">
                  <Plus className="w-3.5 h-3.5 mr-1" /> {showDepForm ? "Cancelar" : "Adicionar Dependente"}
                </Button>
              </div>
            </div>

            {dependents.length === 0 && !((employee as any).dependentesDeclarados) && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Obrigatório:</strong> informe os dependentes do funcionário ou clique em <strong>"Não tenho dependentes"</strong> para declarar a ausência. O funcionário não pode ser escalado em OS sem essa informação.
                </span>
              </div>
            )}

            {showDepForm && (
              <fieldset className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
                <legend className="text-xs font-semibold text-neutral-600 px-2">Novo Dependente</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">Nome completo *</label>
                    <Input value={depForm.name} onChange={(e) => setDepForm({ ...depForm, name: e.target.value })} placeholder="Ex.: João da Silva Jr." data-testid="input-dep-name" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">Data de Nascimento *</label>
                    <Input type="date" value={depForm.birthDate} onChange={(e) => setDepForm({ ...depForm, birthDate: e.target.value })} data-testid="input-dep-birth" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">Parentesco</label>
                    <select className="w-full border border-neutral-200 rounded h-9 px-2 text-sm bg-white" value={depForm.parentesco} onChange={(e) => setDepForm({ ...depForm, parentesco: e.target.value })} data-testid="select-dep-parentesco">
                      <option value="filho">Filho(a)</option>
                      <option value="enteado">Enteado(a)</option>
                      <option value="conjuge">Cônjuge / Companheiro(a)</option>
                      <option value="pais">Pais / Avós</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">CPF (opcional)</label>
                    <Input value={depForm.cpf} onChange={(e) => setDepForm({ ...depForm, cpf: e.target.value })} placeholder="000.000.000-00" data-testid="input-dep-cpf" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">Certidão de Nascimento (PDF/JPG/PNG, máx 5MB)</label>
                    <div className="flex items-center gap-2">
                      <Input type="file" accept=".pdf,image/*" onChange={handleCertidaoFile} className="text-xs" data-testid="input-dep-certidao" />
                      {depForm.certidaoFileName && (
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />{depForm.certidaoFileName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="dep-deduz-ir" checked={depForm.deduzIr} onChange={(e) => setDepForm({ ...depForm, deduzIr: e.target.checked })} data-testid="checkbox-dep-deduz-ir" />
                    <label htmlFor="dep-deduz-ir" className="text-xs text-neutral-700">
                      Abate IRRF (filhos até 21 anos, ou 24 se universitário, e dependentes legais conforme RFB)
                    </label>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-neutral-700 mb-1 block">Observações</label>
                    <Input value={depForm.notes} onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })} placeholder="Ex.: estuda na faculdade X, recebe pensão..." data-testid="input-dep-notes" />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button size="sm" onClick={() => addDependent.mutate()} disabled={addDependent.isPending || !depForm.name || !depForm.birthDate} data-testid="button-save-dependent">
                    {addDependent.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    Salvar Dependente
                  </Button>
                </div>
              </fieldset>
            )}

            {loadingDeps ? (
              <div className="text-center py-8 text-neutral-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...</div>
            ) : dependents.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-neutral-200 rounded-lg">
                <Baby className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                <p className="text-sm text-neutral-500">Nenhum dependente cadastrado</p>
                <p className="text-[11px] text-neutral-400 mt-1">Adicione filhos e cônjuge para abater R$ 189,59 cada no IRRF</p>
              </div>
            ) : (
              <table className="w-full text-xs border border-neutral-200 rounded-lg overflow-hidden">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-600">Nome</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-600">Parentesco</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-600">Nasc.</th>
                    <th className="px-3 py-2 text-center font-semibold text-neutral-600">Idade</th>
                    <th className="px-3 py-2 text-center font-semibold text-neutral-600">IRRF</th>
                    <th className="px-3 py-2 text-center font-semibold text-neutral-600">Certidão</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {dependents.map((d: any) => {
                    const idade = d.birthDate ? Math.floor((Date.now() - new Date(d.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
                    return (
                      <tr key={d.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-dependent-${d.id}`}>
                        <td className="px-3 py-2 font-medium text-neutral-900">{titleCase(d.name)}</td>
                        <td className="px-3 py-2 capitalize text-neutral-600">{d.parentesco}</td>
                        <td className="px-3 py-2 text-neutral-600">{formatDateBRT(d.birthDate)}</td>
                        <td className="px-3 py-2 text-center text-neutral-600">{idade}a</td>
                        <td className="px-3 py-2 text-center">
                          {d.deduzIr ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-100">
                              <CheckCircle2 className="w-3 h-3" />Sim
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[10px]">Não</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {d.certidaoData ? (
                            <button onClick={() => { const a = document.createElement("a"); a.href = d.certidaoData; a.download = d.certidaoFileName || `certidao_${d.name}.pdf`; a.click(); }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-100 hover:bg-blue-100"
                              data-testid={`download-certidao-${d.id}`}>
                              <Download className="w-3 h-3" />Baixar
                            </button>
                          ) : (
                            <span className="text-neutral-300 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remover dependente "${d.name}"?`)) deleteDependent.mutate(d.id); }} data-testid={`button-delete-dependent-${d.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "salarios" && <SalaryTabContent employee={employee} isDiretoria={isDiretoria} salaries={salaries} loadingSal={loadingSal} showSalForm={showSalForm} setShowSalForm={setShowSalForm} salForm={salForm} setSalForm={setSalForm} addSalary={addSalary} deleteSalary={deleteSalary} />}

        {tab === "aceites" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs uppercase tracking-wider font-bold text-neutral-600">Histórico de Missões e Aceites</h3>
            </div>
            {empAcceptances.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-neutral-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-neutral-900">{empAcceptances.length}</p>
                  <p className="text-[10px] text-neutral-500 uppercase">Total</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-green-700">{empAcceptances.filter((a: any) => a.status === "aceito").length}</p>
                  <p className="text-[10px] text-green-600 uppercase">Aceitos</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-red-700">{empAcceptances.filter((a: any) => a.status === "recusado").length}</p>
                  <p className="text-[10px] text-red-600 uppercase">Recusados</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-yellow-700">{empAcceptances.filter((a: any) => a.status === "expirado").length}</p>
                  <p className="text-[10px] text-yellow-600 uppercase">Expirados</p>
                </div>
              </div>
            )}
            {empAcceptances.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-6">Nenhum registro de aceite de missão</p>
            ) : (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs" data-testid="table-employee-acceptances">
                  <thead>
                    <tr className="bg-neutral-50 border-b">
                      <th className="text-left px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold">OS</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold">Data Missão</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold">Status</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold">Respondido em</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold">Motivo Recusa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {empAcceptances.map((a: any) => (
                      <tr key={a.id} className="hover:bg-neutral-50" data-testid={`row-acceptance-${a.id}`}>
                        <td className="px-3 py-2 font-bold">{a.osNumber}</td>
                        <td className="px-3 py-2">{a.osDate ? new Date(a.osDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td>
                        <td className="px-3 py-2">
                          <Badge className={
                            a.status === "aceito" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                            a.status === "recusado" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                            a.status === "expirado" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                            "bg-neutral-100 text-neutral-600 hover:bg-neutral-100"
                          }>
                            {a.status === "aceito" ? "✅ Aceito" : a.status === "recusado" ? "🔴 Recusado" : a.status === "expirado" ? "⏰ Expirado" : "🟡 Pendente"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">{a.responded_at ? new Date(a.responded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-3 py-2 text-neutral-500">{a.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
      {showBrandedContractPasta && (
        <BrandedContractDialog
          open={showBrandedContractPasta}
          onClose={() => setShowBrandedContractPasta(false)}
          entityType="employee"
          entityId={employee.id}
          entityName={employee.name}
          defaults={{ nome: employee.name, documento: employee.cpf || "", endereco: employee.address || "", cargo: employee.role || "" }}
        />
      )}
    </div>
  );
}

function ApplyCctBulkButton() {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/employees/apply-cct-kit", { effectiveDate: new Date().toISOString().slice(0, 10) });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: `Kit CCT aplicado para ${data.count} vigilante(s)` });
      invalidateRelatedQueries("employee");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (confirm("Aplicar Kit CCT SP 2025/2026 (R$2.432,50 base) para TODOS os vigilantes ativos?")) {
          mutation.mutate();
        }
      }}
      disabled={mutation.isPending}
      data-testid="button-apply-cct-bulk"
    >
      {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
      Kit CCT
    </Button>
  );
}

export default function EmployeesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Employee | undefined>();
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);
  const [pastaEmployee, setPastaEmployee] = useState<Employee | null>(null);
  const [onboardingDetailEmp, setOnboardingDetailEmp] = useState<Employee | null>(null);
  const [docAlertOpen, setDocAlertOpen] = useState(false);
  const [empPage, setEmpPage] = useState(1);
  const [searchEmp, setSearchEmp] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ativo" | "inativo" | "todos">("ativo");
  const [deptFilter, setDeptFilter] = useState<"vigilantes" | "administrativo" | "todos">("todos");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [showBulkFix, setShowBulkFix] = useState(false);
  const EMP_PER_PAGE = 20;
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const { data: employees = [], isLoading } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: docsSummary = {} } = useQuery<Record<string, string[]>>({ queryKey: ["/api/employee-documents-summary"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: salariesBulk = {} } = useQuery<Record<number, { baseSalary: number; effectiveDate: string }>>({
    queryKey: ["/api/employees/salaries-bulk"],
    enabled: isDiretoria,
  });

  const isVigilanteRole = (role?: string | null) => {
    const r = (role || "").toLowerCase();
    return r === "vigilante" || r.includes("vigil");
  };
  const getRegime = (e: Employee): { label: string; cls: string } => {
    const cat = ((e as any).category || "").toLowerCase();
    if (cat.includes("terceir") || cat.includes("free") || cat === "pj") {
      return { label: "PJ", cls: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    if ((e as any).ctpsNumber) {
      return { label: "CLT", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    return { label: "S/ Registro", cls: "bg-neutral-100 text-neutral-600 border-neutral-300" };
  };
  const fmtBRL = (v?: number | null) => v == null || isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const { data: onboardingSummary = [] } = useQuery<OnboardingSummary[]>({
    queryKey: ["/api/onboarding-summary"],
    queryFn: async () => { const r = await authFetch("/api/onboarding-summary"); const j = await r.json(); return Array.isArray(j) ? j : []; },
    refetchInterval: 180000,
  });
  const onboardingByEmp = new Map<number, OnboardingSummary>((Array.isArray(onboardingSummary) ? onboardingSummary : []).map(s => [s.employeeId, s]));

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
    onSuccess: () => { invalidateRelatedQueries("employee"); toast({ title: "Funcionário removido" }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const inactivateMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("PATCH", `/api/employees/${id}`, { status: "inativo" }); },
    onSuccess: () => { invalidateRelatedQueries("employee"); toast({ title: "Funcionário inativado" }); },
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
            <div className="flex gap-2">
              {isDiretoria && <ApplyCctBulkButton />}
              <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-employee">
                <Plus className="w-4 h-4 mr-2" /> Novo Funcionário
              </Button>
            </div>
          </div>

          {(() => {
            // Usa a mesma fonte canônica do checklist dentro do cadastro
            // (buildRequiredDocsCatalog), filtrada pelo perfil do funcionário.
            // Sem isso, qualquer divergência entre as duas listas vira falso
            // positivo no alerta — bug histórico de 26/05/2026.
            const CATALOG = buildRequiredDocsCatalog();
            const isVigilante = (e: Employee) => {
              const r = (e.role || "").toLowerCase();
              return r.includes("vigilante") || r.includes("escolta") || r.includes("operacional") || r.includes("operador");
            };
            // Alias curtos pra economizar espaço nos badges do alerta.
            const SHORT_LABEL: Record<string, string> = {
              "Carteira de Trabalho (CTPS)": "CTPS",
              "Comprovante de Residência": "Compr. Residência",
              "03 Fotos 3x4 recentes": "Foto 3x4",
              "Certificado de Reservista (homens 18-45)": "Reservista",
              "CNH / CNV": "CNH/CNV",
              "Certidão de Pontuação de CNH": "Pontuação CNH",
              "Comprovante de Formação Escolar": "Form. Escolar",
              "Certificado de Formação de Vigilante (validade dispensada)": "Form. Vigilante",
              "Certificado de Formação de Escolta Armada (validade dispensada)": "Form. Escolta",
              "Última Reciclagem de Escolta Armada": "Reciclagem Escolta",
              "ASO - Atestado de Saúde Ocupacional": "ASO",
              "Antecedente Criminal Polícia Civil": "Antec. P. Civil",
              "Antecedente Criminal Polícia Militar": "Antec. P. Militar",
              "Certidão de COP (Objeto em Pé)": "COP",
            };
            const ANTEC_ALIASES = new Set([
              "Antecedentes Criminais",
              "Antecedente Criminal Polícia Civil",
              "Antecedente Criminal Polícia Militar",
            ]);
            const getMissing = (e: Employee, deliveredTypes: string[]) => {
              const m: string[] = [];
              const isVig = isVigilante(e);
              const filtered = filterDocsCatalogByRole(CATALOG, isVig);
              for (const g of filtered) {
                if (g.group === "Dependentes (se necessário)") continue;
                for (const doc of g.items) {
                  if (doc.optional) continue;
                  if (doc.type === "Fotos 3x4" && e.photoUrl) continue;
                  // Backcompat: Antecedentes Criminais aceita qualquer um dos 3 nomes.
                  if (doc.type === "Antecedentes Criminais") {
                    if (deliveredTypes.some(t => ANTEC_ALIASES.has(t))) continue;
                  }
                  if (deliveredTypes.includes(doc.type)) continue;
                  m.push(SHORT_LABEL[doc.label] || doc.label);
                }
              }
              return m;
            };
            const activeEmps = (employees || []).filter(e => e.status === "ativo");
            const empsWithMissing = activeEmps
              .map(e => ({ emp: e, missing: getMissing(e, docsSummary[String(e.id)] || []) }))
              .filter(x => x.missing.length > 0);
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
            <div className="px-4 py-3 border-b border-neutral-200 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  placeholder="Buscar por nome, CPF ou matrícula..."
                  value={searchEmp}
                  onChange={e => { setSearchEmp(e.target.value); setEmpPage(1); }}
                  className="pl-10 h-9"
                  data-testid="input-search-employees"
                />
              </div>
              {(() => {
                const all = employees || [];
                const counts = {
                  ativo: all.filter(e => e.status === "ativo").length,
                  inativo: all.filter(e => e.status !== "ativo").length,
                  todos: all.length,
                };
                const deptCounts = {
                  vigilantes: all.filter(e => isVigilanteRole(e.role)).length,
                  administrativo: all.filter(e => !isVigilanteRole(e.role)).length,
                  todos: all.length,
                };
                const tabs: Array<{ key: "ativo" | "inativo" | "todos"; label: string; cls: string }> = [
                  { key: "ativo", label: "Ativos", cls: "data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700 data-[active=true]:border-emerald-200" },
                  { key: "inativo", label: "Inativos", cls: "data-[active=true]:bg-neutral-100 data-[active=true]:text-neutral-700 data-[active=true]:border-neutral-300" },
                  { key: "todos", label: "Todos", cls: "data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:border-blue-200" },
                ];
                const deptTabs: Array<{ key: "vigilantes" | "administrativo" | "todos"; label: string; cls: string }> = [
                  { key: "vigilantes", label: "Vigilantes", cls: "data-[active=true]:bg-indigo-50 data-[active=true]:text-indigo-700 data-[active=true]:border-indigo-200" },
                  { key: "administrativo", label: "Administrativo", cls: "data-[active=true]:bg-amber-50 data-[active=true]:text-amber-700 data-[active=true]:border-amber-200" },
                  { key: "todos", label: "Todos Setores", cls: "data-[active=true]:bg-neutral-100 data-[active=true]:text-neutral-700 data-[active=true]:border-neutral-300" },
                ];
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      {tabs.map(t => (
                        <button
                          key={t.key}
                          data-active={statusFilter === t.key}
                          onClick={() => { setStatusFilter(t.key); setEmpPage(1); }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 ${t.cls}`}
                          data-testid={`tab-status-${t.key}`}
                        >
                          {t.label} <span className="ml-1 text-[10px] opacity-70">({counts[t.key]})</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 border-t border-neutral-100 pt-2 flex-wrap">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mr-1">Setor:</span>
                      {deptTabs.map(t => (
                        <button
                          key={t.key}
                          data-active={deptFilter === t.key}
                          onClick={() => { setDeptFilter(t.key); setEmpPage(1); }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 ${t.cls}`}
                          data-testid={`tab-dept-${t.key}`}
                        >
                          {t.label} <span className="ml-1 text-[10px] opacity-70">({deptCounts[t.key]})</span>
                        </button>
                      ))}
                      {(() => {
                        const incompleteCount = (employees || []).filter(e => getContactIssues(e, { phones: ["phone"], zips: ["zip"] }).length > 0).length;
                        return (
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              data-active={onlyIncomplete}
                              onClick={() => { setOnlyIncomplete(v => !v); setEmpPage(1); }}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 data-[active=true]:bg-red-50 data-[active=true]:text-red-700 data-[active=true]:border-red-200"
                              data-testid="toggle-only-incomplete-employees"
                              title="Mostrar apenas funcionários com telefone ou CEP incompletos"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Só incompletos <span className="ml-1 text-[10px] opacity-70">({incompleteCount})</span>
                            </button>
                            {incompleteCount > 0 && (
                              <button
                                onClick={() => setShowBulkFix(true)}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors bg-red-600 border-red-600 text-white hover:bg-red-700"
                                data-testid="button-bulk-fix-employees"
                                title="Corrigir telefone e CEP de todos os funcionários incompletos"
                              >
                                Corrigir incompletos
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-neutral-400">Carregando...</div>
            ) : (employees || []).length === 0 ? (
              <div className="p-8 text-center text-neutral-400">Nenhum funcionário cadastrado</div>
            ) : (() => {
              const byStatus = (employees || []).filter(e =>
                statusFilter === "todos" ? true :
                statusFilter === "ativo" ? e.status === "ativo" :
                e.status !== "ativo"
              );
              const byDept = byStatus.filter(e =>
                deptFilter === "todos" ? true :
                deptFilter === "vigilantes" ? isVigilanteRole(e.role) :
                !isVigilanteRole(e.role)
              );
              const bySearch = searchEmp.trim()
                ? byDept.filter(e => {
                    const s = searchEmp.toLowerCase();
                    return e.name?.toLowerCase().includes(s) || e.cpf?.toLowerCase().includes(s) || e.matricula?.toLowerCase().includes(s);
                  })
                : byDept;
              const filtered = onlyIncomplete
                ? bySearch.filter(e => getContactIssues(e, { phones: ["phone"], zips: ["zip"] }).length > 0)
                : bySearch;
              const totalEmpPages = Math.ceil(filtered.length / EMP_PER_PAGE);
              const safeEmpPage = Math.min(empPage, totalEmpPages || 1);
              const paginated = filtered.slice((safeEmpPage - 1) * EMP_PER_PAGE, safeEmpPage * EMP_PER_PAGE);
              return (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-employees">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Foto</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Matrícula</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Nome</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">CPF</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cargo</th>
                      {isDiretoria && (
                        <>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider" title="Visível apenas para Diretoria (LGPD)">Registro</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider" title="Visível apenas para Diretoria (LGPD)">Salário</th>
                        </>
                      )}
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Categoria</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Onboarding</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((e) => {
                      const ob = onboardingByEmp.get(e.id);
                      const stageMap: Record<string, { key: string; status: "ok" | "pendente" | "vencido" | "neutro"; count: number; blocking: boolean }> = {};
                      (ob?.stages || []).forEach(s => { stageMap[s.key] = s; });
                      const flagDefs: { key: "documentacao" | "contratos" | "treinamento" | "holerites"; label: string }[] = [
                        { key: "documentacao", label: "Doc" },
                        { key: "contratos", label: "Cont" },
                        { key: "treinamento", label: "Trein" },
                        { key: "holerites", label: "Hol" },
                      ];
                      const flagCls = (st?: "ok" | "pendente" | "vencido" | "neutro") =>
                        st === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        st === "vencido" ? "bg-red-50 text-red-700 border-red-200" :
                        st === "pendente" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        st === "neutro" ? "bg-neutral-100 text-neutral-500 border-neutral-200" :
                        "bg-neutral-50 text-neutral-400 border-neutral-200";
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
                        <td className="p-3 font-medium text-neutral-900">
                          <div className="flex items-center gap-1.5">
                            <span>{e.name}</span>
                            {(() => {
                              const issues = getContactIssues(e, { phones: ["phone"], zips: ["zip"] });
                              if (!issues.length) return null;
                              return (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200"
                                  title={summarizeContactIssues(issues)}
                                  data-testid={`badge-contact-issue-employee-${e.id}`}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {issues.some(i => i.kind === "zip_invalid") && issues.some(i => i.kind !== "zip_invalid") ? "TEL/CEP" : issues[0].kind === "zip_invalid" ? "CEP" : "TEL"}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="p-3 text-neutral-600 text-xs font-mono">{e.cpf}</td>
                        <td className="p-3 text-neutral-600">{e.role}</td>
                        {isDiretoria && (() => {
                          const reg = getRegime(e);
                          const sal = salariesBulk[e.id]?.baseSalary;
                          return (
                            <>
                              <td className="p-3" data-testid={`cell-regime-${e.id}`}>
                                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wide ${reg.cls}`}>
                                  {reg.label}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono text-xs text-neutral-700" data-testid={`cell-salary-${e.id}`}>
                                {sal ? fmtBRL(sal) : <span className="text-neutral-300">—</span>}
                              </td>
                            </>
                          );
                        })()}
                        <td className="p-3 text-neutral-600 text-xs">{e.category || "-"}</td>
                        <td className="p-3" onClick={(ev) => { ev.stopPropagation(); setOnboardingDetailEmp(e); }}>
                          <div className="flex flex-wrap gap-1 cursor-pointer" data-testid={`onboarding-flags-${e.id}`} title="Clique para ver detalhes">
                            {flagDefs.map(f => {
                              const st = stageMap[f.key]?.status;
                              const cnt = stageMap[f.key]?.count || 0;
                              return (
                                <span key={f.key} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${flagCls(st)}`} data-testid={`flag-${f.key}-${e.id}`}>
                                  {st === "ok" ? <CheckCircle2 className="w-3 h-3" /> : st === "neutro" ? <span className="w-3 h-3 inline-flex items-center justify-center leading-none">–</span> : <AlertTriangle className="w-3 h-3" />}
                                  {f.label}
                                  {st !== "ok" && st !== "neutro" && cnt > 0 && <span className="ml-0.5">({cnt})</span>}
                                </span>
                              );
                            })}
                          </div>
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
              {totalEmpPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                  <span className="text-xs text-neutral-500">{filtered.length} funcionário{filtered.length !== 1 ? "s" : ""} — Página {safeEmpPage} de {totalEmpPages}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={safeEmpPage <= 1} onClick={() => setEmpPage(p => Math.max(1, p - 1))} data-testid="button-emp-prev">Anterior</Button>
                    <Button variant="outline" size="sm" disabled={safeEmpPage >= totalEmpPages} onClick={() => setEmpPage(p => Math.min(totalEmpPages, p + 1))} data-testid="button-emp-next">Próxima</Button>
                  </div>
                </div>
              )}
              </>
              );
            })()}
          </Card>
        </>
      )}

      {showForm && <EmployeeForm employee={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {accessEmployee && (
        <CreateAccessModal employee={accessEmployee} open={!!accessEmployee} onClose={() => setAccessEmployee(null)} />
      )}

      {onboardingDetailEmp && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOnboardingDetailEmp(null)} data-testid="modal-onboarding-detail">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Pendências de Onboarding</h2>
                <p className="text-xs text-neutral-500">{onboardingDetailEmp.name} — {onboardingDetailEmp.matricula}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { const emp = onboardingDetailEmp; setOnboardingDetailEmp(null); setPastaEmployee(emp); }} data-testid="button-open-pasta-from-modal">
                  <FolderOpen className="w-4 h-4 mr-1" /> Abrir Pasta
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOnboardingDetailEmp(null)} data-testid="button-close-onboarding-modal">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-5">
              <OnboardingTimeline employeeId={onboardingDetailEmp.id} />
            </div>
          </div>
        </div>
      )}
      <BulkFixContactsDialog
        open={showBulkFix}
        onOpenChange={setShowBulkFix}
        records={employees || []}
        phoneField="phone"
        zipField="zip"
        labelField="name"
        endpointPrefix="/api/employees"
        invalidateKeys={[["/api/employees"]]}
        title="Corrigir telefone/CEP de funcionários"
        entityLabel="funcionário"
      />
    </AdminLayout>
  );
}
