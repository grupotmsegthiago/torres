import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Search, Loader2, FileDown, ShieldCheck } from "lucide-react";
import type { Client } from "@shared/schema";
import { generatePresentation } from "@/lib/presentation";

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { toast } = useToast();
  const [cnpjLoading, setCnpjLoading] = useState(false);
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

  const fetchCnpj = useCallback(async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      const phone = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}` : form.phone;
      setForm((prev) => ({
        ...prev,
        name: data.razao_social || prev.name,
        email: data.email && data.email !== "" ? data.email : prev.email,
        phone,
        address: [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", ") || prev.address,
        city: data.municipio || prev.city,
        state: data.uf || prev.state,
        zip: data.cep ? data.cep.replace(/(\d{5})(\d{3})/, "$1-$2") : prev.zip,
      }));
      toast({ title: "CNPJ encontrado", description: data.razao_social });
    } catch {
      toast({ title: "CNPJ não encontrado", description: "Verifique o número e tente novamente", variant: "destructive" });
    } finally {
      setCnpjLoading(false);
    }
  }, [form.phone, toast]);

  const handleCnpjChange = (value: string) => {
    const formatted = formatCnpj(value);
    setForm({ ...form, cnpj: formatted });
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 14) {
      fetchCnpj(formatted);
    }
  };

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
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">CNPJ</label>
          <div className="relative">
            <Input
              value={form.cnpj}
              onChange={(e) => handleCnpjChange(e.target.value)}
              placeholder="00.000.000/0000-00"
              data-testid="input-client-cnpj"
            />
            {cnpjLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
              </div>
            )}
            {!cnpjLoading && form.cnpj.replace(/\D/g, "").length === 14 && (
              <button
                type="button"
                onClick={() => fetchCnpj(form.cnpj)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                data-testid="button-search-cnpj"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-neutral-400 mt-1">Digite o CNPJ para preencher automaticamente</p>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Nome / Razão Social *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-client-name" />
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

function CreditAnalysisModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const runAnalysis = useCallback(async () => {
    const doc = (client.cnpj || client.cpf || "").replace(/\D/g, "");
    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      toast({ title: "Cliente sem CPF/CNPJ válido", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/consulta/analise-credito/${doc}`, { credentials: "include" });
      const data = await res.json();
      setResult(data);
    } catch {
      toast({ title: "Erro ao realizar análise", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [client, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="modal-credit-analysis">
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Análise de Risco</h2>
            <p className="text-xs text-neutral-500">{client.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-analysis"><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-5">
          {!result && !loading && (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-sm text-neutral-500 mb-4">Consultar SPC/Serasa, Score Quod e Protestos para:</p>
              <p className="font-medium text-neutral-900 mb-1">{client.name}</p>
              <p className="text-xs text-neutral-500 font-mono mb-6">{client.cnpj || client.cpf || "Sem documento"}</p>
              <Button onClick={runAnalysis} disabled={!client.cnpj && !client.cpf} data-testid="button-run-analysis">
                <ShieldCheck className="w-4 h-4 mr-2" /> Iniciar Análise
              </Button>
            </div>
          )}
          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Consultando 3 fontes simultaneamente...</p>
            </div>
          )}
          {result && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "SPC/Serasa", status: result.summary?.spcStatus, data: result.spc },
                  { label: "Score Quod", status: result.summary?.quodStatus, data: result.quod },
                  { label: "Protestos", status: result.summary?.protestoStatus, data: result.protesto },
                ].map((item) => (
                  <div key={item.label} className={`p-3 rounded-lg border text-center ${item.status === "consultado" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <p className="text-[10px] text-neutral-500 mb-1">{item.label}</p>
                    <p className={`text-xs font-bold ${item.status === "consultado" ? "text-green-700" : "text-red-700"}`} data-testid={`text-status-${item.label.toLowerCase().replace(/[/\s]/g, '-')}`}>
                      {item.status === "consultado" ? "Consultado" : "Erro"}
                    </p>
                  </div>
                ))}
              </div>
              {result.hasRestrictions && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  Algumas consultas retornaram erro. Verifique se o token APIBRASIL_TOKEN está configurado corretamente.
                </div>
              )}
              {[
                { label: "SPC/Serasa", data: result.spc },
                { label: "Score Quod", data: result.quod },
                { label: "Protestos", data: result.protesto },
              ].map((item) => (
                <div key={item.label} className="border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="bg-neutral-50 p-2.5 text-xs font-medium text-neutral-700">{item.label}</div>
                  <pre className="p-3 text-[10px] text-neutral-600 overflow-auto max-h-[150px] whitespace-pre-wrap break-words">
                    {JSON.stringify(item.data?.data || item.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [analysisClient, setAnalysisClient] = useState<Client | null>(null);
  const { toast } = useToast();

  const [generatingPdf, setGeneratingPdf] = useState<number | null>(null);

  const handlePresentation = async (id: number, name: string) => {
    setGeneratingPdf(id);
    try {
      await generatePresentation(name);
      toast({ title: "Apresentação gerada", description: "O download do PDF foi iniciado." });
    } catch {
      toast({ title: "Erro ao gerar apresentação", variant: "destructive" });
    } finally {
      setGeneratingPdf(null);
    }
  };
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
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAnalysisClient(c)}
                        title="Análise de Risco"
                        data-testid={`button-credit-analysis-${c.id}`}
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePresentation(c.id, c.name)}
                        title="Gerar Apresentação"
                        disabled={generatingPdf === c.id}
                        data-testid={`button-presentation-client-${c.id}`}
                      >
                        {generatingPdf === c.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : (
                          <FileDown className="w-4 h-4 text-blue-600" />
                        )}
                      </Button>
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

      {analysisClient && (
        <CreditAnalysisModal client={analysisClient} onClose={() => setAnalysisClient(null)} />
      )}
    </AdminLayout>
  );
}
