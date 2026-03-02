import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import type { Client } from "@shared/schema";

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: client?.name || "",
    cnpj: client?.cnpj || "",
    cpf: client?.cpf || "",
    email: client?.email || "",
    phone: client?.phone || "",
    contactPerson: client?.contactPerson || "",
    address: client?.address || "",
    city: client?.city || "",
    state: client?.state || "",
    zip: client?.zip || "",
    notes: client?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (client) {
        await apiRequest("PATCH", `/api/clients/${client.id}`, data);
      } else {
        await apiRequest("POST", "/api/clients", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: client ? "Cliente atualizado" : "Cliente cadastrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-client-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{client ? "Editar Cliente" : "Novo Cliente"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-form"><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Nome / Razão Social *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-client-name" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">CNPJ</label>
          <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} data-testid="input-client-cnpj" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">CPF</label>
          <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} data-testid="input-client-cpf" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">E-mail</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-client-email" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Telefone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-client-phone" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Pessoa de Contato</label>
          <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} data-testid="input-client-contact" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">CEP</label>
          <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} data-testid="input-client-zip" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Endereço</label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-client-address" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Cidade</label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-client-city" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Estado</label>
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} data-testid="input-client-state" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-client-notes" />
        </div>
        <div className="md:col-span-2 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-client">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function ClientsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const { toast } = useToast();
  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/clients/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/clients"] }); toast({ title: "Cliente removido" }); },
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-clients-title">Clientes</h1>
          <p className="text-sm text-neutral-500 mt-1">Cadastro e gestão de clientes</p>
        </div>
        <Button onClick={() => { setEditClient(undefined); setShowForm(true); }} data-testid="button-new-client">
          <Plus className="w-4 h-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      {showForm && (
        <ClientForm
          client={editClient}
          onClose={() => { setShowForm(false); setEditClient(undefined); }}
        />
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (clients || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum cliente cadastrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-clients">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Nome</th>
                  <th className="text-left p-3 font-medium text-neutral-600">CNPJ/CPF</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Telefone</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Cidade</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(clients || []).map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-client-${c.id}`}>
                    <td className="p-3 font-medium text-neutral-900">{c.name}</td>
                    <td className="p-3 text-neutral-600">{c.cnpj || c.cpf || "-"}</td>
                    <td className="p-3 text-neutral-600">{c.phone || "-"}</td>
                    <td className="p-3 text-neutral-600">{c.city || "-"}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditClient(c); setShowForm(true); }} data-testid={`button-edit-client-${c.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-client-${c.id}`}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
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
