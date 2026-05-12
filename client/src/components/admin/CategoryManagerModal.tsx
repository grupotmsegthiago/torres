import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tag, Plus, Trash2, Loader2, X } from "lucide-react";

export type CategoryTransactionType = "INCOME" | "EXPENSE";

export interface FinancialCategory {
  id: string;
  name: string;
  type: CategoryTransactionType;
  is_deduction: boolean;
  group: string;
  recurrence_type: string | null;
  tag: string | null;
  scope: string | null;
  parent_name: string | null;
}

const GROUP_OPTIONS = [
  { value: "CUSTOS_VARIAVEIS", label: "Custos Variáveis" },
  { value: "DESPESAS_FIXAS", label: "Despesas Fixas" },
  { value: "RECEITA_BRUTA", label: "Receita" },
  { value: "DEDUCOES", label: "Impostos/Deduções" },
  { value: "INVESTIMENTOS", label: "Investimentos" },
  { value: "NAO_OPERACIONAL", label: "Não Operacional" },
];

export function CategoryManagerModal({
  onClose,
  onSuccess,
  initialType = "EXPENSE",
}: {
  onClose: () => void;
  onSuccess?: () => void;
  initialType?: CategoryTransactionType;
}) {
  const { toast } = useToast();
  const { data: allCategories = [], refetch } = useQuery<FinancialCategory[]>({
    queryKey: ["/api/financial/categories"],
  });

  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [newParentName, setNewParentName] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubGroup, setNewSubGroup] = useState("DESPESAS_FIXAS");
  const [newSubType, setNewSubType] = useState<CategoryTransactionType>(initialType);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const parents = Array.from(new Set(
    allCategories.filter(c => c.parent_name).map(c => c.parent_name as string)
  )).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const subcategories = allCategories
    .filter(c => c.parent_name === selectedParent)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const createParentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/financial/categories", {
      name: newParentName.trim(), type: newSubType, group: newSubGroup,
      parent_name: newParentName.trim(), recurrence_type: "VARIAVEL",
      tag: "OPERACIONAL", scope: "EMPRESA", is_deduction: false,
    }),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] });
      setSelectedParent(newParentName.trim());
      setNewParentName("");
      toast({ title: "Grupo criado" });
      onSuccess?.();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createSubMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/financial/categories", {
      name: newSubName.trim(), type: newSubType, group: newSubGroup,
      parent_name: selectedParent, recurrence_type: "VARIAVEL",
      tag: "OPERACIONAL", scope: "EMPRESA", is_deduction: false,
    }),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] });
      setNewSubName("");
      toast({ title: "Subcategoria criada" });
      onSuccess?.();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/financial/categories/${id}`),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/financial/categories"] });
      setConfirmDeleteId(null);
      toast({ title: "Categoria removida" });
      onSuccess?.();
    },
    onError: (e: Error) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-category-manager">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-neutral-200">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 flex-shrink-0">
          <h3 className="font-black text-neutral-800 text-sm flex items-center gap-2 uppercase tracking-wider">
            <Tag size={16} className="text-green-600" /> Gerenciar Categorias
          </h3>
          <button onClick={onClose} data-testid="button-close-category-manager">
            <X size={18} className="text-neutral-400 hover:text-neutral-600" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 border-r border-neutral-100 flex flex-col bg-neutral-50 flex-shrink-0">
            <div className="p-3 border-b border-neutral-100">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-2">Grupos</p>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newParentName}
                  onChange={e => setNewParentName(e.target.value)}
                  placeholder="Novo grupo..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white"
                  data-testid="input-new-parent"
                  onKeyDown={e => { if (e.key === "Enter" && newParentName.trim()) { e.preventDefault(); createParentMutation.mutate(); } }}
                />
                <button
                  type="button"
                  disabled={!newParentName.trim() || createParentMutation.isPending}
                  onClick={() => createParentMutation.mutate()}
                  className="px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-black disabled:opacity-40"
                  data-testid="button-add-parent"
                >
                  {createParentMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {parents.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedParent(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    selectedParent === p
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-200"
                  }`}
                  data-testid={`button-parent-${p}`}
                >
                  {p}
                  <span className={`ml-1 text-[10px] ${selectedParent === p ? "text-neutral-300" : "text-neutral-400"}`}>
                    ({allCategories.filter(c => c.parent_name === p).length})
                  </span>
                </button>
              ))}
              {parents.length === 0 && (
                <p className="text-[10px] text-neutral-400 italic p-2">Nenhum grupo ainda</p>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedParent ? (
              <>
                <div className="p-3 border-b border-neutral-100 bg-white">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-2">
                    Subcategorias de <span className="text-neutral-700">{selectedParent}</span>
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <input
                      type="text"
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      placeholder="Nome da subcategoria..."
                      className="flex-1 min-w-[140px] px-2 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white"
                      data-testid="input-new-subcategory"
                      onKeyDown={e => { if (e.key === "Enter" && newSubName.trim()) { e.preventDefault(); createSubMutation.mutate(); } }}
                    />
                    <select
                      value={newSubType}
                      onChange={e => setNewSubType(e.target.value as CategoryTransactionType)}
                      className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white"
                      data-testid="select-sub-type"
                    >
                      <option value="EXPENSE">Despesa</option>
                      <option value="INCOME">Receita</option>
                    </select>
                    <select
                      value={newSubGroup}
                      onChange={e => setNewSubGroup(e.target.value)}
                      className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white"
                      data-testid="select-sub-group"
                    >
                      {GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                    <button
                      type="button"
                      disabled={!newSubName.trim() || createSubMutation.isPending}
                      onClick={() => createSubMutation.mutate()}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-black flex items-center gap-1 disabled:opacity-40"
                      data-testid="button-add-subcategory"
                    >
                      {createSubMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Adicionar
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {subcategories.length === 0 && (
                    <div className="text-center py-8">
                      <Tag size={28} className="mx-auto text-neutral-200 mb-2" />
                      <p className="text-xs text-neutral-400 font-bold">Nenhuma subcategoria neste grupo</p>
                      <p className="text-[10px] text-neutral-400">Use o formulário acima para adicionar</p>
                    </div>
                  )}
                  {subcategories.map(c => (
                    <div key={c.id}
                      className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-neutral-100 hover:border-neutral-200 group"
                      data-testid={`row-category-${c.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-neutral-800 uppercase block truncate">{c.name}</span>
                        <span className="text-[10px] text-neutral-400">
                          {GROUP_OPTIONS.find(g => g.value === c.group)?.label || c.group}
                          {" · "}
                          {c.type === "EXPENSE" ? "Despesa" : "Receita"}
                        </span>
                      </div>
                      {confirmDeleteId === c.id ? (
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <span className="text-[10px] text-red-600 font-bold">Confirmar?</span>
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                            className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-black"
                            data-testid={`button-confirm-delete-${c.id}`}
                          >
                            {deleteMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : "Sim"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 bg-neutral-200 text-neutral-600 rounded text-[10px] font-black"
                            data-testid={`button-cancel-delete-${c.id}`}
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="ml-2 p-1.5 rounded-md text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                          data-testid={`button-delete-${c.id}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <Tag size={40} className="mx-auto text-neutral-200 mb-3" />
                  <p className="text-sm font-bold text-neutral-500">Selecione um grupo à esquerda</p>
                  <p className="text-xs text-neutral-400 mt-1">ou crie um novo grupo para começar</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-neutral-100 bg-neutral-50 flex-shrink-0">
          <p className="text-[10px] text-neutral-400 text-center">
            {allCategories.length} categoria(s) cadastrada(s) · {parents.length} grupo(s)
          </p>
        </div>
      </div>
    </div>
  );
}
