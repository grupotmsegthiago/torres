import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch, queryClient, apiRequest } from "@/lib/queryClient";
import { Fuel, Plus, Pencil, Trash2, Search, AlertCircle, CheckCircle2 } from "lucide-react";

type Posto = {
  id: number;
  nome_posto: string;
  codigo_estabelecimento: string;
  endereco: string | null;
  cidade: string | null;
  ativo: boolean;
  notas: string | null;
};

const empty: Partial<Posto> = { nome_posto: "", codigo_estabelecimento: "", endereco: "", cidade: "", ativo: true, notas: "" };

export default function TicketlogPostosPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Posto> | null>(null);

  const { data: postos = [], isLoading } = useQuery<Posto[]>({ queryKey: ["/api/ticketlog/postos"] });
  const { data: tlStatus } = useQuery<{ configured: boolean; env: string }>({ queryKey: ["/api/ticketlog/status"] });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return postos;
    return postos.filter(p =>
      (p.nome_posto || "").toLowerCase().includes(q) ||
      (p.codigo_estabelecimento || "").includes(q) ||
      (p.cidade || "").toLowerCase().includes(q)
    );
  }, [postos, search]);

  const saveMutation = useMutation({
    mutationFn: async (p: Partial<Posto>) => {
      const body = {
        nomePosto: p.nome_posto,
        codigoEstabelecimento: p.codigo_estabelecimento,
        endereco: p.endereco || null,
        cidade: p.cidade || null,
        ativo: p.ativo !== false,
        notas: p.notas || null,
      };
      if (p.id) return apiRequest("PATCH", `/api/ticketlog/postos/${p.id}`, body);
      return apiRequest("POST", "/api/ticketlog/postos", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ticketlog/postos"] });
      setEditing(null);
      toast({ title: "Posto salvo!" });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/ticketlog/postos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ticketlog/postos"] });
      toast({ title: "Posto removido" });
    },
  });

  const revalidateBatch = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/fueling/validate-ticketlog/batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Erro");
      return data;
    },
    onSuccess: (d: any) => toast({
      title: "Re-validação concluída",
      description: `${d.tried || 0} tentativa(s) — ${d.ok || 0} OK, ${d.divergent || 0} divergente, ${d.failed || 0} falhou`,
    }),
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="space-y-4 p-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Fuel className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold text-neutral-900" data-testid="text-page-title">Postos TicketLog (DE/PARA)</h1>
              <p className="text-xs text-neutral-500">Mapeie cada posto físico ao seu código de estabelecimento TicketLog para validação automática.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => revalidateBatch.mutate()} disabled={revalidateBatch.isPending} data-testid="button-revalidate-all">
              {revalidateBatch.isPending ? "Revalidando..." : "Revalidar Pendentes (7d)"}
            </Button>
            <Button size="sm" onClick={() => setEditing({ ...empty })} data-testid="button-new-posto">
              <Plus className="w-4 h-4 mr-1" /> Novo Posto
            </Button>
          </div>
        </div>

        {tlStatus && !tlStatus.configured && (
          <Card className="p-3 bg-amber-50 border-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800">TicketLog não configurado. Adicione <code className="bg-amber-100 px-1 rounded">TICKETLOG_USER</code> e <code className="bg-amber-100 px-1 rounded">TICKETLOG_PASS</code> nas variáveis de ambiente.</p>
          </Card>
        )}
        {tlStatus && tlStatus.configured && (
          <Card className="p-3 bg-emerald-50 border-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-sm text-emerald-800">TicketLog conectado em <strong>{tlStatus.env}</strong>. Cada novo abastecimento é validado automaticamente; um cron tenta novamente a cada 20min para os pendentes.</p>
          </Card>
        )}

        <Card className="p-3">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
            <Input className="pl-8 h-9 text-sm" placeholder="Buscar posto, código, cidade..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
          </div>
        </Card>

        {isLoading ? (
          <p className="text-center text-sm text-neutral-400 py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-neutral-500">
            <Fuel className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
            <p className="font-medium mb-1">Nenhum posto cadastrado.</p>
            <p className="text-xs">Cadastre o nome do posto (igual ao que o agente digita) e o código de estabelecimento TicketLog correspondente.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-postos">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="p-2 text-left font-medium text-neutral-600">Nome do Posto</th>
                  <th className="p-2 text-left font-medium text-neutral-600">Código TL</th>
                  <th className="p-2 text-left font-medium text-neutral-600">Cidade</th>
                  <th className="p-2 text-left font-medium text-neutral-600">Endereço</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Ativo</th>
                  <th className="p-2 text-center font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-posto-${p.id}`}>
                    <td className="p-2 font-medium text-neutral-900">{p.nome_posto}</td>
                    <td className="p-2 font-mono text-xs">{p.codigo_estabelecimento}</td>
                    <td className="p-2 text-neutral-600">{p.cidade || "-"}</td>
                    <td className="p-2 text-neutral-600 max-w-xs truncate" title={p.endereco || ""}>{p.endereco || "-"}</td>
                    <td className="p-2 text-center">
                      {p.ativo ? <span className="text-emerald-600">●</span> : <span className="text-neutral-300">○</span>}
                    </td>
                    <td className="p-2 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing({ ...p })} data-testid={`button-edit-${p.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => {
                        if (confirm(`Remover posto "${p.nome_posto}"?`)) deleteMutation.mutate(p.id);
                      }} data-testid={`button-delete-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Posto" : "Novo Posto"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Nome do Posto *</label>
                <Input value={editing.nome_posto || ""} onChange={e => setEditing({ ...editing, nome_posto: e.target.value })}
                  placeholder="Ex: Auto Posto Barranco" data-testid="input-nome" />
                <p className="text-[10px] text-neutral-400 mt-1">Use o nome igual ao que o agente digita no app (acentos e capitalização não importam).</p>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Código de Estabelecimento TicketLog *</label>
                <Input value={editing.codigo_estabelecimento || ""} onChange={e => setEditing({ ...editing, codigo_estabelecimento: e.target.value })}
                  placeholder="Ex: 12345678" data-testid="input-codigo" />
                <p className="text-[10px] text-neutral-400 mt-1">Código numérico fornecido pela TicketLog para esse posto credenciado.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1 block">Cidade</label>
                  <Input value={editing.cidade || ""} onChange={e => setEditing({ ...editing, cidade: e.target.value })} data-testid="input-cidade" />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.ativo !== false} onCheckedChange={v => setEditing({ ...editing, ativo: v })} data-testid="switch-ativo" />
                    <span className="text-xs">Ativo</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Endereço</label>
                <Input value={editing.endereco || ""} onChange={e => setEditing({ ...editing, endereco: e.target.value })} data-testid="input-endereco" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1 block">Notas</label>
                <Input value={editing.notas || ""} onChange={e => setEditing({ ...editing, notas: e.target.value })} data-testid="input-notas" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="button-cancel">Cancelar</Button>
            <Button onClick={() => editing && saveMutation.mutate(editing)} disabled={saveMutation.isPending || !editing?.nome_posto || !editing?.codigo_estabelecimento} data-testid="button-save">
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
