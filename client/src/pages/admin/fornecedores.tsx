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
} from "lucide-react";

interface Fornecedor {
  id: number;
  nome: string;
  cnpj_cpf: string | null;
  categoria: string | null;
  email: string | null;
  telefone: string | null;
  chave_pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

const CATEGORIAS = [
  "COMBUSTÍVEL", "MANUTENÇÃO VEICULAR", "PEÇAS E PNEUS", "MATERIAL DE ESCRITÓRIO",
  "SERVIÇOS DE TI", "TELECOMUNICAÇÕES", "ALIMENTAÇÃO", "VIAGEM/HOSPEDAGEM",
  "EQUIPAMENTOS", "UNIFORMES E EPI", "ARMAMENTO E MUNIÇÃO", "TERCEIRIZADOS",
  "ALUGUEL E CONDOMÍNIO", "ENERGIA E ÁGUA", "IMPOSTOS E TAXAS", "ADVOCACIA/CONTÁBIL",
  "MARKETING", "OUTROS",
];

export default function FornecedoresPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);

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
    return list;
  }, [fornecedores, search, showInactive]);

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
                ) : filtered.map(f => (
                  <tr key={f.id} className={`hover:bg-neutral-50 ${!f.ativo ? "opacity-50" : ""}`} data-testid={`row-fornecedor-${f.id}`}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-sm text-neutral-800 uppercase">{f.nome}</span>
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
                ))}
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
      </div>
    </AdminLayout>
  );
}

function FornecedorFormModal({ editing, onClose }: { editing: Fornecedor | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!editing;
  const [nome, setNome] = useState(editing?.nome || "");
  const [cnpjCpf, setCnpjCpf] = useState(editing?.cnpj_cpf || "");
  const [categoria, setCategoria] = useState(editing?.categoria || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [telefone, setTelefone] = useState(editing?.telefone || "");
  const [chavePix, setChavePix] = useState(editing?.chave_pix || "");
  const [banco, setBanco] = useState(editing?.banco || "");
  const [agencia, setAgencia] = useState(editing?.agencia || "");
  const [conta, setConta] = useState(editing?.conta || "");
  const [tipoConta, setTipoConta] = useState(editing?.tipo_conta || "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes || "");
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        nome, cnpj_cpf: cnpjCpf, categoria, email, telefone, chave_pix: chavePix,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-fornecedor-form">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nome / Razão Social *</label>
              <input required type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase bg-white" value={nome} onChange={e => setNome(e.target.value)} data-testid="input-nome" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">CNPJ / CPF *</label>
              <input required type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono bg-white" value={cnpjCpf} onChange={e => setCnpjCpf(e.target.value)} data-testid="input-cnpj-cpf" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Categoria</label>
              <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm uppercase font-bold bg-white" value={categoria} onChange={e => setCategoria(e.target.value)} data-testid="select-categoria">
                <option value="">Selecione...</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Mail size={11} /> E-mail</label>
              <input type="email" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 flex items-center gap-1"><Phone size={11} /> Telefone</label>
              <input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" value={telefone} onChange={e => setTelefone(e.target.value)} data-testid="input-telefone" />
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
            <textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm bg-white" rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} data-testid="textarea-observacoes" />
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
    </div>
  );
}
