import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, authFetch } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2, Plus, Edit, Trash2, Search, Loader2, Save, X,
  Mail, Phone, KeyRound, Landmark, FileText, CheckCircle2, AlertCircle,
  MapPin, Briefcase, Users, BadgeCheck, AlertTriangle, Tag,
} from "lucide-react";
import { CategoryManagerModal, type FinancialCategory } from "@/components/admin/CategoryManagerModal";
import { BulkFixContactsDialog } from "@/components/admin/bulk-fix-contacts-dialog";
import { getContactIssues, summarizeContactIssues } from "@shared/contact-validation";

interface Fornecedor {
  id: number;
  nome: string;
  cnpj_cpf: string | null;
  categoria: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  chave_pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}


export default function FornecedoresPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [showBulkFix, setShowBulkFix] = useState(false);

  const { data: fornecedores = [], isLoading } = useQuery<Fornecedor[]>({
    queryKey: ["/api/fornecedores", "all"],
    queryFn: async () => {
      const res = await authFetch("/api/fornecedores");
      if (!res.ok) throw new Error("Erro ao carregar fornecedores");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/fornecedores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fornecedores"] });
      toast({ title: "Fornecedor inativado" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = [...fornecedores];
    if (!showInactive) list = list.filter(f => f.ativo);
    if (search.trim()) {
      const t = search.toLowerCase().trim();
      list = list.filter(f =>
        f.nome.toLowerCase().includes(t) ||
        (f.cnpj_cpf || "").toLowerCase().includes(t) ||
        (f.categoria || "").toLowerCase().includes(t) ||
        (f.email || "").toLowerCase().includes(t)
      );
    }
    if (onlyIncomplete) {
      list = list.filter(f => getContactIssues(f, { phones: ["telefone"], zips: ["cep"] }).length > 0);
    }
    return list;
  }, [fornecedores, search, showInactive, onlyIncomplete]);

  const incompleteCount = useMemo(
    () => fornecedores.filter(f => getContactIssues(f, { phones: ["telefone"], zips: ["cep"] }).length > 0).length,
    [fornecedores],
  );

  const handleDelete = (id: number, nome: string) => {
    if (!confirm(`Inativar fornecedor "${nome}"? Lançamentos existentes serão mantidos.`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-neutral-900 flex items-center gap-3" data-testid="text-title">
              <Building2 className="text-violet-600" size={28} /> Fornecedores
            </h1>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-1">Cadastro e dados bancários para Contas a Pagar</p>
          </div>
          <Button onClick={() => { setEditing(null); setIsFormOpen(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-novo-fornecedor">
            <Plus size={14} className="mr-1" /> Novo Fornecedor
          </Button>
        </div>

        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Buscar por nome, CNPJ/CPF, categoria, e-mail..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 uppercase whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} data-testid="checkbox-inactive" />
              Mostrar inativos
            </label>
            <button
              type="button"
              data-active={onlyIncomplete}
              onClick={() => setOnlyIncomplete(v => !v)}
              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md border transition-colors bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 data-[active=true]:bg-red-50 data-[active=true]:text-red-700 data-[active=true]:border-red-200 uppercase whitespace-nowrap"
              data-testid="toggle-only-incomplete-fornecedores"
              title="Mostrar apenas fornecedores com telefone ou CEP incompletos"
            >
              <AlertTriangle className="w-3 h-3" />
              Só incompletos <span className="ml-1 text-[10px] opacity-70">({incompleteCount})</span>
            </button>
            {incompleteCount > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkFix(true)}
                className="inline-flex items-center gap-1 text-xs font-black uppercase px-3 py-1.5 rounded-md border transition-colors bg-red-600 border-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                data-testid="button-bulk-fix-fornecedores"
                title="Corrigir telefone/CEP de todos os fornecedores incompletos"
              >
                Corrigir incompletos
              </button>
            )}
            <span className="text-xs font-black uppercase text-neutral-500" data-testid="text-count">{filtered.length} fornecedor(es)</span>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CNPJ/CPF</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Dados Bancários</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-neutral-700" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-neutral-400 italic font-bold uppercase text-sm" data-testid="text-empty">Nenhum fornecedor encontrado</td></tr>
                ) : filtered.map(f => {
                  const contactIssues = getContactIssues(f, { phones: ["telefone"], zips: ["cep"] });
                  const hasPhoneIssue = contactIssues.some(i => i.kind !== "zip_invalid");
                  const hasZipIssue = contactIssues.some(i => i.kind === "zip_invalid");
                  const badgeLabel = hasPhoneIssue && hasZipIssue ? "TEL/CEP" : hasZipIssue ? "CEP" : "TEL";
                  return (
                  <tr key={f.id} className={`hover:bg-neutral-50 ${!f.ativo ? "opacity-50" : ""}`} data-testid={`row-fornecedor-${f.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-neutral-800 uppercase">{f.nome}</span>
                        {contactIssues.length > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200"
                            title={summarizeContactIssues(contactIssues)}
                            data-testid={`badge-contact-issue-fornecedor-${f.id}`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {badgeLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-neutral-700">{f.cnpj_cpf || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {f.categoria ? (
                        <span className="text-[10px] font-bold uppercase bg-violet-100 text-violet-700 px-2 py-0.5 rounded border border-violet-200">{f.categoria}</span>
                      ) : <span className="text-xs text-neutral-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs space-y-0.5">
                        {f.email && <div className="flex items-center gap-1 text-neutral-600"><Mail size={10} /> {f.email}</div>}
                        {f.telefone && <div className="flex items-center gap-1 text-neutral-600"><Phone size={10} /> {f.telefone}</div>}
                        {!f.email && !f.telefone && <span className="text-neutral-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs space-y-0.5">
                        {f.chave_pix && <div className="flex items-center gap-1 text-emerald-700 font-bold"><KeyRound size={10} /> PIX: {f.chave_pix}</div>}
                        {f.banco && <div className="flex items-center gap-1 text-neutral-600"><Landmark size={10} /> {f.banco} {f.agencia && `Ag ${f.agencia}`} {f.conta && `Cc ${f.conta}`}</div>}
                        {!f.chave_pix && !f.banco && <span className="text-neutral-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {f.ativo ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-black uppercase border border-green-200"><CheckCircle2 size={10} /> Ativo</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[10px] font-black uppercase border border-neutral-200"><AlertCircle size={10} /> Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(f); setIsFormOpen(true); }} className="p-1.5 rounded text-blue-600 hover:bg-blue-50" data-testid={`button-edit-${f.id}`} title="Editar">
                          <Edit size={14} />
                        </button>
                        {f.ativo && (
                          <button onClick={() => handleDelete(f.id, f.nome)} disabled={deleteMutation.isPending} className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50" data-testid={`button-delete-${f.id}`} title="Inativar">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {isFormOpen && (
          <FornecedorFormModal
            editing={editing}
            onClose={() => { setIsFormOpen(false); setEditing(null); }}
          />
        )}

        <BulkFixContactsDialog
          open={showBulkFix}
          onOpenChange={setShowBulkFix}
          records={fornecedores}
          phoneField="telefone"
          zipField="cep"
          labelField="nome"
          endpointPrefix="/api/fornecedores"
          invalidateKeys={[["/api/fornecedores"]]}
          title="Corrigir telefone/CEP de fornecedores"
          entityLabel="fornecedor"
        />
      </div>
    </AdminLayout>
  );
}

interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  situacao: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  atividade: string | null;
  natureza_juridica: string | null;
  capital_social: number | null;
  abertura: string | null;
  socios: { nome: string; qualificacao: string }[];
  source: string;
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function FornecedorFormModal({ editing, onClose }: { editing: Fornecedor | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!editing;
  const [nome, setNome] = useState(editing?.nome || "");
  const [cnpjCpf, setCnpjCpf] = useState(editing?.cnpj_cpf || "");
  const [categoria, setCategoria] = useState(editing?.categoria || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [telefone, setTelefone] = useState(editing?.telefone || "");
  const [cep, setCep] = useState(editing?.cep || "");
  const [endereco, setEndereco] = useState(editing?.endereco || "");
  const [cidade, setCidade] = useState(editing?.cidade || "");
  const [uf, setUf] = useState(editing?.uf || "");
  const [chavePix, setChavePix] = useState(editing?.chave_pix || "");
  const [banco, setBanco] = useState(editing?.banco || "");
  const [agencia, setAgencia] = useState(editing?.agencia || "");
  const [conta, setConta] = useState(editing?.conta || "");
  const [tipoConta, setTipoConta] = useState(editing?.tipo_conta || "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes || "");
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Categorias hierárquicas (mesma fonte do módulo Financeiro)
  const { data: financialCategories = [] } = useQuery<FinancialCategory[]>({
    queryKey: ["/api/financial/categories"],
  });
  const expenseCategories = financialCategories.filter(c => c.type === "EXPENSE");
  const groupedCategories = expenseCategories.reduce((acc, c) => {
    const parent = c.parent_name || "Outros";
    if (!acc[parent]) acc[parent] = [];
    acc[parent].push(c);
    return acc;
  }, {} as Record<string, FinancialCategory[]>);

  const cleanCnpj = cnpjCpf.replace(/\D/g, "");
  const canSearch = cleanCnpj.length === 14;

  const handleCnpjSearch = async () => {
    if (!canSearch) return;
    setCnpjLoading(true);
    setCnpjData(null);
    try {
      const res = await authFetch(`/api/cnpj/${cleanCnpj}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "CNPJ não encontrado", description: err.message, variant: "destructive" });
        return;
      }
      const data: CnpjData = await res.json();
      setCnpjData(data);
      // Auto-preencher campos em branco
      if (!nome.trim()) setNome(data.razao_social);
      if (!email.trim() && data.email) setEmail(data.email);
      if (!telefone.trim() && data.telefone) setTelefone(data.telefone);
      if (!cep.trim() && data.cep) setCep(data.cep);
      if (!endereco.trim()) {
        const addr = [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean).join(", ");
        if (addr) setEndereco(addr);
      }
      if (!cidade.trim() && data.municipio) setCidade(data.municipio);
      if (!uf.trim() && data.uf) setUf(data.uf);
      toast({ title: "Dados preenchidos!", description: `${data.razao_social} — ${data.situacao || ""}` });
    } catch (e: any) {
      toast({ title: "Erro ao consultar CNPJ", description: e.message, variant: "destructive" });
    } finally {
      setCnpjLoading(false);
    }
  };

  const applyFromCnpj = () => {
    if (!cnpjData) return;
    setNome(cnpjData.razao_social);
    if (cnpjData.email) setEmail(cnpjData.email);
    if (cnpjData.telefone) setTelefone(cnpjData.telefone);
    if (cnpjData.cep) setCep(cnpjData.cep);
    const addr = [cnpjData.logradouro, cnpjData.numero, cnpjData.complemento, cnpjData.bairro]
      .filter(Boolean).join(", ");
    if (addr) setEndereco(addr);
    if (cnpjData.municipio) setCidade(cnpjData.municipio);
    if (cnpjData.uf) setUf(cnpjData.uf);
    const obs = [
      cnpjData.atividade ? `Atividade: ${cnpjData.atividade}` : null,
      cnpjData.natureza_juridica ? `Natureza: ${cnpjData.natureza_juridica}` : null,
      cnpjData.abertura ? `Abertura: ${cnpjData.abertura}` : null,
    ].filter(Boolean).join("\n");
    setObservacoes(obs);
    toast({ title: "Todos os campos aplicados!" });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        nome, cnpj_cpf: cnpjCpf, categoria, email, telefone,
        cep, endereco, cidade, uf,
        chave_pix: chavePix,
        banco, agencia, conta, tipo_conta: tipoConta, observacoes, ativo,
      };
      return isEdit
        ? apiRequest("PUT", `/api/fornecedores/${editing!.id}`, payload)
        : apiRequest("POST", "/api/fornecedores", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fornecedores"] });
      toast({ title: isEdit ? "Fornecedor atualizado" : "Fornecedor criado" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const situacaoAtiva = (cnpjData?.situacao || "").toUpperCase().includes("ATIV");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-fornecedor-form">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest" data-testid="text-form-title">
            {isEdit ? "Editar Fornecedor" : "Novo Fornecedor"}
          </h3>
          <button onClick={onClose} data-testid="button-close-form"><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
          const clean = (cnpjCpf || "").replace(/\D/g, "");
          if (clean.length !== 11 && clean.length !== 14) {
            toast({ title: "CPF ou CNPJ obrigatório", description: "Informe 11 (CPF) ou 14 (CNPJ) dígitos", variant: "destructive" });
            return;
          }
          saveMutation.mutate();
        }} className="p-6 space-y-4">

          {/* CNPJ com busca */}
          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">CNPJ / CPF *</label>
            <div className="flex gap-2">
              <input
                required
                type="text"
                className="flex-1 p-2.5 border border-neutral-200 rounded-lg text-sm font-mono bg-white"
                value={cnpjCpf}
                onChange={e => {
                  setCnpjCpf(formatCnpj(e.target.value));
                  setCnpjData(null);
                }}
                placeholder="00.000.000/0000-00"
                data-testid="input-cnpj-cpf"
              />
              <button
                type="button"
                onClick={handleCnpjSearch}
                disabled={!canSearch || cnpjLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white rounded-lg text-xs font-black uppercase hover:bg-violet-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                data-testid="button-buscar-cnpj"
              >
                {cnpjLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </button>
            </div>
            <p className="text-[9px] text-neutral-400 mt-1">Digite o CNPJ (14 dígitos) e clique em Buscar para preencher automaticamente</p>
          </div>

          {/* Card de resultado CNPJ */}
          {cnpjData && (
            <div className={`rounded-xl border p-4 space-y-3 ${situacaoAtiva ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`} data-testid="card-cnpj-result">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    {situacaoAtiva
                      ? <BadgeCheck size={15} className="text-emerald-600 flex-shrink-0" />
                      : <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />}
                    <span className={`text-[10px] font-black uppercase ${situacaoAtiva ? "text-emerald-700" : "text-amber-700"}`}>
                      {cnpjData.situacao || "Situação desconhecida"}
                    </span>
                  </div>
                  <p className="font-black text-sm text-neutral-900 uppercase">{cnpjData.razao_social}</p>
                  {cnpjData.nome_fantasia && <p className="text-xs text-neutral-500 italic">{cnpjData.nome_fantasia}</p>}
                </div>
                <button
                  type="button"
                  onClick={applyFromCnpj}
                  className="flex-shrink-0 text-[10px] font-black uppercase bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
                  data-testid="button-apply-cnpj"
                >
                  Aplicar tudo
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-neutral-700">
                {cnpjData.atividade && (
                  <div className="flex items-start gap-1.5 md:col-span-2">
                    <Briefcase size={11} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                    <span>{cnpjData.atividade}</span>
                  </div>
                )}
                {(cnpjData.logradouro || cnpjData.municipio) && (
                  <div className="flex items-start gap-1.5 md:col-span-2">
                    <MapPin size={11} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                    <span>
                      {[cnpjData.logradouro, cnpjData.numero, cnpjData.bairro, cnpjData.municipio, cnpjData.uf].filter(Boolean).join(", ")}
                      {cnpjData.cep ? ` — CEP ${cnpjData.cep}` : ""}
                    </span>
                  </div>
                )}
                {cnpjData.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={11} className="text-neutral-400 flex-shrink-0" />
                    <span>{cnpjData.email}</span>
                  </div>
                )}
                {cnpjData.telefone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={11} className="text-neutral-400 flex-shrink-0" />
                    <span>{cnpjData.telefone}</span>
                  </div>
                )}
                {cnpjData.abertura && (
                  <div className="flex items-center gap-1.5">
                    <FileText size={11} className="text-neutral-400 flex-shrink-0" />
                    <span>Abertura: {cnpjData.abertura}</span>
                  </div>
                )}
                {cnpjData.capital_social != null && cnpjData.capital_social > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Landmark size={11} className="text-neutral-400 flex-shrink-0" />
                    <span>Capital: R$ {cnpjData.capital_social.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {cnpjData.socios?.length > 0 && (
                  <div className="flex items-start gap-1.5 md:col-span-2">
                    <Users size={11} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                    <span>{cnpjData.socios.map(s => s.nome).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nome / Razão Social *</label>
              <input required type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase bg-white" value={nome} onChange={e => setNome(e.target.value)} data-testid="input-nome" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase flex items-center gap-1">
                  <Tag size={11} /> Categoria
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="text-[9px] font-black text-green-600 hover:text-green-700 uppercase"
                  data-testid="button-new-category"
                >
                  + Nova
                </button>
              </div>
              <select
                className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm uppercase font-bold bg-white"
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                data-testid="select-categoria"
              >
                <option value="">Selecione...</option>
                {Object.entries(groupedCategories)
                  .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
                  .map(([parent, cats]) => (
                    <optgroup key={parent} label={parent}>
                      {cats
                        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                        .map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                    </optgroup>
                  ))}
                {/* Compatibilidade: se a categoria atual não está mais cadastrada,
                    ainda exibe pra não perder o valor salvo */}
                {categoria && !expenseCategories.some(c => c.name === categoria) && (
                  <optgroup label="Categoria atual (não cadastrada)">
                    <option value={categoria}>{categoria}</option>
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Mail size={11} /> E-mail</label>
              <input type="email" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Phone size={11} /> Telefone</label>
              <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 91234-5678" data-testid="input-telefone" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><MapPin size={11} /> CEP</label>
              <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono bg-white" value={cep} onChange={e => setCep(e.target.value)} placeholder="01310-100" data-testid="input-cep" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Cidade</label>
              <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={cidade} onChange={e => setCidade(e.target.value)} data-testid="input-cidade" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Endereço</label>
              <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, complemento, bairro" data-testid="input-endereco" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">UF</label>
              <input type="text" maxLength={2} className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm uppercase font-bold bg-white" value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" data-testid="input-uf" />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <h4 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Landmark size={12} /> Dados Bancários (opcional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><KeyRound size={11} /> Chave PIX</label>
                <input type="text" className="w-full p-2.5 border border-emerald-200 rounded-lg text-sm font-mono bg-emerald-50/30" placeholder="CPF, e-mail, telefone, chave aleatória" value={chavePix} onChange={e => setChavePix(e.target.value)} data-testid="input-pix" />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Banco</label>
                <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={banco} onChange={e => setBanco(e.target.value)} data-testid="input-banco" />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Tipo de Conta</label>
                <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white uppercase font-bold" value={tipoConta} onChange={e => setTipoConta(e.target.value)} data-testid="select-tipo-conta">
                  <option value="">Selecione...</option>
                  <option value="CORRENTE">Corrente</option>
                  <option value="POUPANCA">Poupança</option>
                  <option value="PAGAMENTO">Pagamento</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Agência</label>
                <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono bg-white" value={agencia} onChange={e => setAgencia(e.target.value)} data-testid="input-agencia" />
              </div>
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Conta</label>
                <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono bg-white" value={conta} onChange={e => setConta(e.target.value)} data-testid="input-conta" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><FileText size={11} /> Observações</label>
            <textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} data-testid="textarea-observacoes" />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 uppercase cursor-pointer">
              <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} data-testid="checkbox-ativo" />
              Fornecedor ativo
            </label>
          )}

          <button disabled={saveMutation.isPending} type="submit" data-testid="button-save-fornecedor"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isEdit ? "Salvar Alterações" : "Cadastrar Fornecedor"}
          </button>
        </form>
      </div>
      {showCategoryModal && (
        <CategoryManagerModal
          initialType="EXPENSE"
          onClose={() => setShowCategoryModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] });
          }}
        />
      )}
    </div>
  );
}
