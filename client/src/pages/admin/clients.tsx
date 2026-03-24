import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, X, Pencil, Trash2, Search, Loader2, FileDown,
  ShieldCheck, AlertTriangle, CheckCircle2, Building2, Users,
  MapPin, Phone, Mail, Calendar, Banknote, BadgeCheck,
  FileText, DollarSign, BarChart3, ChevronLeft, Save,
  Moon, Route, Navigation, ChevronRight, Shield, Edit,
} from "lucide-react";
import type { Client } from "@shared/schema";
import { generatePresentation } from "@/lib/presentation";

const fmt = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "R$ 0,00";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

interface ServiceContract {
  id: string; client_id: number | null; client_name: string | null;
  contract_number: string | null; contratante_razao: string | null;
  contratante_cnpj: string | null; contratante_endereco: string | null;
  contratante_representante: string | null; vigencia_tipo: string;
  vigencia_inicio: string | null; vigencia_fim: string | null;
  data_assinatura: string | null; aviso_previo_dias: number;
  num_vigilantes: number; armamento_descricao: string | null;
  equipamentos: string | null; multa_mora_pct: number;
  juros_mora_pct: number; indice_correcao: string;
  observacoes: string | null; status: string; created_at: string;
}

interface EscortContract {
  id: string; client_id: number | null; client_name: string | null;
  valor_km_carregado: number; valor_km_vazio: number; franquia_minima_km: number;
  valor_hora_estadia: number; valor_diaria: number; vrp_base: number;
  adicional_noturno_vrp_pct: number; adicional_noturno_km_pct: number;
  adicional_periculosidade_pct: number; periculosidade_horas_limite: number;
  status: string;
}

interface EscortRoute {
  id: string; client_id: number | null; name: string;
  origin: string; destination: string; estimated_km: number;
  estimated_hours: number; is_noturno: boolean;
  notes: string | null; status: string;
}

interface EscortBilling {
  id: string; client_id: number | null; client_name: string | null;
  km_total: number; horas_missao: number; is_noturno: boolean;
  fat_total: number; pag_total: number; resultado_liquido: number;
  boletim_numero: string | null; boletim_gerado: boolean;
  origem: string | null; destino: string | null; created_at: string;
}

type ClientTab = "CONTRATO" | "TABELA" | "RELATORIO_OS";

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
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CNPJ</label>
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
          <p className="text-xs text-neutral-500 mt-1.5">Digite o CNPJ para preencher automaticamente</p>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Nome / Razão Social *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-client-name" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CPF</label>
          <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} data-testid="input-client-cpf" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">E-mail</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-client-email" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Telefone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-client-phone" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Pessoa de Contato</label>
          <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} data-testid="input-client-contact" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">CEP</label>
          <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} data-testid="input-client-zip" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Endereço</label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-client-address" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Cidade</label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-client-city" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Estado</label>
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} data-testid="input-client-state" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
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
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/consulta/analise-risco/${doc}`);
      const data = await res.json();
      setResult(data);
    } catch {
      toast({ title: "Erro ao realizar análise", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [client, toast]);

  const riskColor = result?.riskLevel === "BAIXO" ? "green" : result?.riskLevel === "MEDIO" ? "amber" : result?.riskLevel === "ALTO" ? "red" : "neutral";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="modal-credit-analysis">
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Análise de Risco</h2>
            <p className="text-xs text-neutral-500">{client.name} — via ReceitaWS</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-analysis"><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-5">
          {!result && !loading && (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-sm text-neutral-500 mb-4">Consultar dados cadastrais e análise de risco via ReceitaWS para:</p>
              <p className="font-medium text-neutral-900 mb-1">{client.name}</p>
              <p className="text-xs text-neutral-500 font-mono mb-2">{client.cnpj || client.cpf || "Sem documento"}</p>
              {!client.cnpj && client.cpf && (
                <p className="text-xs text-amber-600 mb-4">Análise de risco via ReceitaWS disponível apenas para CNPJ</p>
              )}
              <Button onClick={runAnalysis} disabled={!client.cnpj} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-run-analysis">
                <ShieldCheck className="w-4 h-4 mr-2" /> Iniciar Análise de Risco
              </Button>
            </div>
          )}
          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Consultando ReceitaWS...</p>
            </div>
          )}
          {result && !loading && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border-2 flex items-center gap-3 ${
                riskColor === "green" ? "border-green-300 bg-green-50" :
                riskColor === "amber" ? "border-amber-300 bg-amber-50" :
                riskColor === "red" ? "border-red-300 bg-red-50" :
                "border-neutral-300 bg-neutral-50"
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  riskColor === "green" ? "bg-green-200" :
                  riskColor === "amber" ? "bg-amber-200" :
                  riskColor === "red" ? "bg-red-200" : "bg-neutral-200"
                }`}>
                  {riskColor === "green" ? <CheckCircle2 className="w-6 h-6 text-green-700" /> :
                   riskColor === "red" ? <AlertTriangle className="w-6 h-6 text-red-700" /> :
                   <ShieldCheck className="w-6 h-6 text-amber-700" />}
                </div>
                <div>
                  <p className={`text-lg font-bold ${
                    riskColor === "green" ? "text-green-800" :
                    riskColor === "amber" ? "text-amber-800" :
                    riskColor === "red" ? "text-red-800" : "text-neutral-800"
                  }`} data-testid="text-risk-level">
                    Risco {result.riskLevel}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {result.risks?.length === 0 ? "Nenhum fator de risco identificado" : `${result.risks?.length} fator(es) de risco`}
                  </p>
                </div>
              </div>

              {result.risks?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {result.risks.map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-800">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.companyInfo && (
                <>
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <div className="bg-neutral-50 p-3 flex items-center gap-2 border-b border-neutral-200">
                      <Building2 className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-medium text-neutral-700">Dados da Empresa</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <InfoRow label="Razão Social" value={result.companyInfo.nome} />
                      {result.companyInfo.fantasia && <InfoRow label="Nome Fantasia" value={result.companyInfo.fantasia} />}
                      <InfoRow label="Situação" value={result.companyInfo.situacao} highlight={result.companyInfo.situacao === "ATIVA" ? "green" : "red"} />
                      <InfoRow label="Abertura" value={result.companyInfo.abertura} icon={<Calendar className="w-3 h-3" />} />
                      <InfoRow label="Tipo" value={result.companyInfo.tipo} />
                      <InfoRow label="Porte" value={result.companyInfo.porte} />
                      <InfoRow label="Natureza Jurídica" value={result.companyInfo.natureza} />
                      <InfoRow label="Capital Social" value={`R$ ${parseFloat(result.companyInfo.capitalSocial || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} icon={<Banknote className="w-3 h-3" />} />
                      <InfoRow label="Atividade Principal" value={result.companyInfo.atividadePrincipal} full />
                      <InfoRow label="Simples Nacional" value={result.companyInfo.simples} icon={<BadgeCheck className="w-3 h-3" />} />
                    </div>
                  </div>

                  {result.companyInfo.socios?.length > 0 && (
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                      <div className="bg-neutral-50 p-3 flex items-center gap-2 border-b border-neutral-200">
                        <Users className="w-4 h-4 text-neutral-500" />
                        <span className="text-sm font-medium text-neutral-700">Quadro Societário ({result.companyInfo.socios.length})</span>
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {result.companyInfo.socios.map((s: any, i: number) => (
                          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm text-neutral-900 font-medium">{s.nome}</span>
                            <span className="text-xs text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">{s.qualificacao}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <div className="bg-neutral-50 p-3 flex items-center gap-2 border-b border-neutral-200">
                      <MapPin className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-medium text-neutral-700">Contato e Endereço</span>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-neutral-700">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{result.companyInfo.endereco}</span>
                      </div>
                      {result.companyInfo.telefone && (
                        <div className="flex items-center gap-2 text-sm text-neutral-700">
                          <Phone className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{result.companyInfo.telefone}</span>
                        </div>
                      )}
                      {result.companyInfo.email && (
                        <div className="flex items-center gap-2 text-sm text-neutral-700">
                          <Mail className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{result.companyInfo.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!result.receita?.success && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  {result.receita?.error || "Erro ao consultar ReceitaWS"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon, highlight, full }: { label: string; value?: string; icon?: React.ReactNode; highlight?: "green" | "red"; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <div className="flex items-center gap-1">
        {icon && <span className="text-neutral-400">{icon}</span>}
        <p className={`text-xs font-medium ${
          highlight === "green" ? "text-green-700" :
          highlight === "red" ? "text-red-700" :
          "text-neutral-800"
        }`}>{value}</p>
      </div>
    </div>
  );
}

function ServiceContractModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: ServiceContract | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    contract_number: editing?.contract_number || "",
    contratante_razao: editing?.contratante_razao || clientName,
    contratante_cnpj: editing?.contratante_cnpj || "",
    contratante_endereco: editing?.contratante_endereco || "",
    contratante_representante: editing?.contratante_representante || "",
    vigencia_tipo: editing?.vigencia_tipo || "indeterminado",
    vigencia_inicio: editing?.vigencia_inicio?.split("T")[0] || new Date().toISOString().split("T")[0],
    vigencia_fim: editing?.vigencia_fim?.split("T")[0] || "",
    data_assinatura: editing?.data_assinatura?.split("T")[0] || new Date().toISOString().split("T")[0],
    aviso_previo_dias: editing?.aviso_previo_dias?.toString() || "30",
    num_vigilantes: editing?.num_vigilantes?.toString() || "2",
    armamento_descricao: editing?.armamento_descricao || "01 Revolver Cal. 38 + 01 Espingarda Cal. 12 Pump",
    equipamentos: editing?.equipamentos || "02 Coletes nível II-A, Rádio, Viatura identificada com rastreamento",
    multa_mora_pct: editing?.multa_mora_pct?.toString() || "2.00",
    juros_mora_pct: editing?.juros_mora_pct?.toString() || "1.00",
    indice_correcao: editing?.indice_correcao || "INPC",
    observacoes: editing?.observacoes || "",
  });
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        client_id: clientId, client_name: clientName,
        contract_number: form.contract_number || null,
        contratante_razao: form.contratante_razao || null,
        contratante_cnpj: form.contratante_cnpj || null,
        contratante_endereco: form.contratante_endereco || null,
        contratante_representante: form.contratante_representante || null,
        vigencia_tipo: form.vigencia_tipo,
        vigencia_inicio: form.vigencia_inicio || null,
        vigencia_fim: form.vigencia_tipo === "determinado" ? (form.vigencia_fim || null) : null,
        data_assinatura: form.data_assinatura || null,
        aviso_previo_dias: parseInt(form.aviso_previo_dias),
        num_vigilantes: parseInt(form.num_vigilantes),
        armamento_descricao: form.armamento_descricao || null,
        equipamentos: form.equipamentos || null,
        multa_mora_pct: parseFloat(form.multa_mora_pct),
        juros_mora_pct: parseFloat(form.juros_mora_pct),
        indice_correcao: form.indice_correcao,
        observacoes: form.observacoes || null,
        status: "Ativo",
      };
      if (editing) return apiRequest("PUT", `/api/service-contracts/${editing.id}`, payload);
      return apiRequest("POST", "/api/service-contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-contracts"] });
      toast({ title: editing ? "Contrato atualizado" : "Contrato cadastrado" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-service-contract">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Contrato" : "Novo Contrato de Prestação de Serviço"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><FileText size={12} /> Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nº Contrato</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold uppercase" placeholder="CT-2026/001" value={form.contract_number} onChange={e => sf("contract_number", e.target.value)} data-testid="input-contract-number" /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Data Assinatura</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.data_assinatura} onChange={e => sf("data_assinatura", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Building2 size={12} /> Contratante</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Razão Social</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.contratante_razao} onChange={e => sf("contratante_razao", e.target.value)} /></div>
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">CNPJ</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" placeholder="00.000.000/0000-00" value={form.contratante_cnpj} onChange={e => sf("contratante_cnpj", e.target.value)} data-testid="input-contratante-cnpj" /></div>
              </div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Endereço</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.contratante_endereco} onChange={e => sf("contratante_endereco", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Representante Legal</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.contratante_representante} onChange={e => sf("contratante_representante", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Calendar size={12} /> Vigência</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Tipo</label>
                <select className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold bg-white" value={form.vigencia_tipo} onChange={e => sf("vigencia_tipo", e.target.value)} data-testid="select-vigencia-tipo">
                  <option value="indeterminado">Indeterminado</option>
                  <option value="determinado">Determinado</option>
                </select>
              </div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Início</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vigencia_inicio} onChange={e => sf("vigencia_inicio", e.target.value)} /></div>
              {form.vigencia_tipo === "determinado" && (
                <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Término</label><input type="date" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vigencia_fim} onChange={e => sf("vigencia_fim", e.target.value)} /></div>
              )}
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Aviso Prévio (dias)</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.aviso_previo_dias} onChange={e => sf("aviso_previo_dias", e.target.value)} /></div>
            </div>
          </div>

          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><Shield size={12} /> Operacional</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nº Vigilantes</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.num_vigilantes} onChange={e => sf("num_vigilantes", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Índice Correção</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.indice_correcao} onChange={e => sf("indice_correcao", e.target.value)} /></div>
            </div>
            <div className="mt-3"><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Armamento</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.armamento_descricao} onChange={e => sf("armamento_descricao", e.target.value)} /></div>
            <div className="mt-3"><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Equipamentos</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" value={form.equipamentos} onChange={e => sf("equipamentos", e.target.value)} /></div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <p className="text-[10px] font-black text-red-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Penalidades</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Multa Mora (%)</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.multa_mora_pct} onChange={e => sf("multa_mora_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Juros Mora (% mês)</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.juros_mora_pct} onChange={e => sf("juros_mora_pct", e.target.value)} /></div>
            </div>
          </div>

          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações</label><textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm" rows={3} value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} /></div>

          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-service-contract"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Contrato
          </button>
        </form>
      </div>
    </div>
  );
}

function PriceTableModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: EscortContract | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    valor_km_carregado: editing?.valor_km_carregado?.toString() || "2.80",
    valor_km_vazio: editing?.valor_km_vazio?.toString() || "1.40",
    franquia_minima_km: editing?.franquia_minima_km?.toString() || "50",
    valor_hora_estadia: editing?.valor_hora_estadia?.toString() || "50.00",
    valor_diaria: editing?.valor_diaria?.toString() || "200.00",
    vrp_base: editing?.vrp_base?.toString() || "150.00",
    adicional_noturno_vrp_pct: editing?.adicional_noturno_vrp_pct?.toString() || "20",
    adicional_noturno_km_pct: editing?.adicional_noturno_km_pct?.toString() || "15",
    adicional_periculosidade_pct: editing?.adicional_periculosidade_pct?.toString() || "30",
    periculosidade_horas_limite: editing?.periculosidade_horas_limite?.toString() || "8",
  });
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        client_id: clientId, client_name: clientName,
        valor_km_carregado: parseFloat(form.valor_km_carregado), valor_km_vazio: parseFloat(form.valor_km_vazio),
        franquia_minima_km: parseInt(form.franquia_minima_km), valor_hora_estadia: parseFloat(form.valor_hora_estadia),
        valor_diaria: parseFloat(form.valor_diaria), vrp_base: parseFloat(form.vrp_base),
        adicional_noturno_vrp_pct: parseFloat(form.adicional_noturno_vrp_pct), adicional_noturno_km_pct: parseFloat(form.adicional_noturno_km_pct),
        adicional_periculosidade_pct: parseFloat(form.adicional_periculosidade_pct), periculosidade_horas_limite: parseInt(form.periculosidade_horas_limite),
        status: "Ativo",
      };
      if (editing) return apiRequest("PUT", `/api/escort/contracts/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/contracts"] });
      toast({ title: editing ? "Tabela atualizada" : "Tabela de preços criada" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-price-table">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Tabela de Preços" : "Nova Tabela de Preços"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Faturamento ao Cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Carregado</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_carregado} onChange={e => sf("valor_km_carregado", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/KM Vazio</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_km_vazio} onChange={e => sf("valor_km_vazio", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Franquia KM</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.franquia_minima_km} onChange={e => sf("franquia_minima_km", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Hora Estadia</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_hora_estadia} onChange={e => sf("valor_hora_estadia", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$ Diária</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.valor_diaria} onChange={e => sf("valor_diaria", e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest">Pagamento Vigilante</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">VRP Base (R$)</label><input type="number" step="0.01" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.vrp_base} onChange={e => sf("vrp_base", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Limite Horas</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.periculosidade_horas_limite} onChange={e => sf("periculosidade_horas_limite", e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest">Adicionais (%)</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Periculosidade</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_periculosidade_pct} onChange={e => sf("adicional_periculosidade_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno VRP</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_vrp_pct} onChange={e => sf("adicional_noturno_vrp_pct", e.target.value)} /></div>
              <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Noturno KM</label><input type="number" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.adicional_noturno_km_pct} onChange={e => sf("adicional_noturno_km_pct", e.target.value)} /></div>
            </div>
          </div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-price-table"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Tabela de Preços
          </button>
        </form>
      </div>
    </div>
  );
}

function RouteFormModal({ onClose, editing, clientId, clientName }: { onClose: () => void; editing: EscortRoute | null; clientId: number; clientName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: editing?.name || "", origin: editing?.origin || "", destination: editing?.destination || "",
    estimated_km: editing?.estimated_km?.toString() || "", estimated_hours: editing?.estimated_hours?.toString() || "0",
    is_noturno: editing?.is_noturno || false, notes: editing?.notes || "",
  });
  const sf = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { client_id: clientId, client_name: clientName, name: form.name, origin: form.origin, destination: form.destination, estimated_km: parseFloat(form.estimated_km), estimated_hours: parseFloat(form.estimated_hours || "0"), is_noturno: form.is_noturno, notes: form.notes || null, status: "Ativo" };
      if (editing) return apiRequest("PUT", `/api/escort/routes/${editing.id}`, payload);
      return apiRequest("POST", "/api/escort/routes", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/routes"] });
      toast({ title: editing ? "Rota atualizada" : "Rota cadastrada" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-route">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
          <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Rota" : "Nova Rota"}</h3>
          <button onClick={onClose}><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Nome da Rota</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" placeholder="Ex: SP-Santos" value={form.name} onChange={e => sf("name", e.target.value)} required data-testid="input-route-name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Origem</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.origin} onChange={e => sf("origin", e.target.value)} required /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Destino</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold uppercase" value={form.destination} onChange={e => sf("destination", e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Estimado</label><input type="number" step="0.1" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_km} onChange={e => sf("estimated_km", e.target.value)} required /></div>
            <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Horas Estimadas</label><input type="number" step="0.5" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" value={form.estimated_hours} onChange={e => sf("estimated_hours", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_noturno} onChange={e => sf("is_noturno", e.target.checked)} className="rounded" /><span className="text-xs font-bold text-neutral-700 uppercase">Rota noturna (22h-05h)</span></label>
          <div><label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Observações</label><textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm" rows={2} value={form.notes} onChange={e => sf("notes", e.target.value)} /></div>
          <button type="submit" disabled={saveMutation.isPending} data-testid="button-save-route"
            className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Rota
          </button>
        </form>
      </div>
    </div>
  );
}

function ClientPastaView({ client, onBack }: { client: Client; onBack: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ClientTab>("CONTRATO");
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingSC, setEditingSC] = useState<ServiceContract | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState<EscortContract | null>(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<EscortRoute | null>(null);
  const [osPeriod, setOsPeriod] = useState<"DAY" | "FORTNIGHT" | "MONTH">("MONTH");

  const { data: serviceContracts = [] } = useQuery<ServiceContract[]>({ queryKey: ["/api/service-contracts", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/service-contracts?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: priceContracts = [] } = useQuery<EscortContract[]>({ queryKey: ["/api/escort/contracts"] });
  const { data: clientRoutes = [] } = useQuery<EscortRoute[]>({ queryKey: ["/api/escort/routes", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/escort/routes?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: allBillings = [] } = useQuery<EscortBilling[]>({ queryKey: ["/api/escort/billings"] });

  const clientPrices = priceContracts.filter(c => c.client_id === client.id);
  const clientBillings = allBillings.filter(b => b.client_id === client.id);

  const filteredOS = (() => {
    const now = new Date();
    return clientBillings.filter(b => {
      const d = new Date(b.created_at);
      if (osPeriod === "DAY") return d.toDateString() === now.toDateString();
      if (osPeriod === "FORTNIGHT") { const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24); return diff <= 15; }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  })();

  const deleteSCMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/service-contracts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/service-contracts"] }); toast({ title: "Contrato excluído" }); },
  });

  const TABS: { id: ClientTab; label: string; icon: typeof FileText }[] = [
    { id: "CONTRATO", label: "Contrato", icon: FileText },
    { id: "TABELA", label: "Preços / Rotas", icon: DollarSign },
    { id: "RELATORIO_OS", label: "Relatório de OS", icon: BarChart3 },
  ];

  const getVigenciaStatus = (sc: ServiceContract) => {
    if (sc.status !== "Ativo") return { label: sc.status, color: "bg-neutral-100 text-neutral-500" };
    if (sc.vigencia_tipo === "indeterminado") return { label: "Vigente (Indeterminado)", color: "bg-green-100 text-green-700" };
    if (sc.vigencia_fim) {
      const fim = new Date(sc.vigencia_fim);
      const now = new Date();
      const diffDays = Math.ceil((fim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { label: "Vencido", color: "bg-red-100 text-red-700" };
      if (diffDays <= 30) return { label: `Vence em ${diffDays}d`, color: "bg-amber-100 text-amber-700" };
      return { label: "Vigente", color: "bg-green-100 text-green-700" };
    }
    return { label: "Vigente", color: "bg-green-100 text-green-700" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" data-testid="button-back-to-clients"><ChevronLeft size={20} className="text-neutral-600" /></button>
        <div>
          <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight" data-testid="text-client-pasta-name">{client.name}</h2>
          <p className="text-xs text-neutral-500">{client.cnpj || "CNPJ não cadastrado"} — Pasta do Cliente</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-client-${tab.id.toLowerCase()}`}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap flex-1 justify-center ${
                activeTab === tab.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "CONTRATO" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-neutral-500">Contratos de Prestação de Serviço com validade e controle</p>
            <Button onClick={() => { setEditingSC(null); setShowContractModal(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-service-contract"><Plus size={14} className="mr-1" /> Novo Contrato</Button>
          </div>
          {serviceContracts.length === 0 ? (
            <Card className="p-12 border-neutral-200 shadow-sm text-center"><FileText size={40} className="mx-auto text-neutral-300 mb-3" /><p className="text-sm font-bold text-neutral-400 uppercase">Nenhum contrato cadastrado para este cliente</p></Card>
          ) : serviceContracts.map(sc => {
            const vig = getVigenciaStatus(sc);
            return (
              <Card key={sc.id} className="p-5 border-neutral-200 shadow-sm" data-testid={`card-service-contract-${sc.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-black text-neutral-800 uppercase">{sc.contract_number || "Sem número"}</h4>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${vig.color}`}>{vig.label}</span>
                    </div>
                    <p className="text-[10px] text-neutral-500">Prestação de Serviços de Escolta Armada</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingSC(sc); setShowContractModal(true); }} className="p-1.5 rounded hover:bg-neutral-100"><Edit size={14} className="text-neutral-500" /></button>
                    <button onClick={() => { if (confirm("Excluir contrato?")) deleteSCMutation.mutate(sc.id); }} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Contratante</p><p className="text-xs font-bold text-neutral-800">{sc.contratante_razao || "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">CNPJ</p><p className="text-xs font-mono font-bold text-neutral-800">{sc.contratante_cnpj || "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Assinatura</p><p className="text-xs font-mono font-bold text-neutral-800">{sc.data_assinatura ? new Date(sc.data_assinatura).toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Vigência</p><p className="text-xs font-bold text-neutral-800">{sc.vigencia_tipo === "indeterminado" ? "Indeterminado" : `Até ${sc.vigencia_fim ? new Date(sc.vigencia_fim).toLocaleDateString("pt-BR") : "—"}`}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Vigilantes</p><p className="text-xs font-bold text-neutral-800">{sc.num_vigilantes}</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Aviso Prévio</p><p className="text-xs font-bold text-neutral-800">{sc.aviso_previo_dias} dias</p></div>
                  <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-[9px] font-black text-neutral-400 uppercase">Correção</p><p className="text-xs font-bold text-neutral-800">{sc.indice_correcao}</p></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "TABELA" && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><DollarSign size={16} /> Tabela de Preços</h3>
              <Button onClick={() => { setEditingPrice(null); setShowPriceModal(true); }} size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-price"><Plus size={14} className="mr-1" /> Nova Tabela</Button>
            </div>
            {clientPrices.length === 0 ? (
              <Card className="p-8 border-neutral-200 shadow-sm text-center"><DollarSign size={32} className="mx-auto text-neutral-300 mb-2" /><p className="text-xs font-bold text-neutral-400 uppercase">Nenhuma tabela de preços. Valores padrão serão utilizados.</p></Card>
            ) : clientPrices.map(cp => (
              <Card key={cp.id} className="p-4 border-neutral-200 shadow-sm mb-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setEditingPrice(cp); setShowPriceModal(true); }} data-testid={`card-price-${cp.id}`}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><p className="text-[9px] font-black text-blue-600 uppercase">KM Carregado</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_km_carregado))}/km</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">KM Vazio</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_km_vazio))}/km</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Estadia</p><p className="text-sm font-black font-mono">{fmt(Number(cp.valor_hora_estadia))}/h</p></div>
                  <div><p className="text-[9px] font-black text-amber-600 uppercase">VRP</p><p className="text-sm font-black font-mono">{fmt(Number(cp.vrp_base))}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Franquia</p><p className="text-sm font-black font-mono">{cp.franquia_minima_km} km</p></div>
                </div>
              </Card>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><Route size={16} /> Rotas Frequentes</h3>
              <Button onClick={() => { setEditingRoute(null); setShowRouteModal(true); }} size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-route"><Plus size={14} className="mr-1" /> Nova Rota</Button>
            </div>
            {clientRoutes.length === 0 ? (
              <Card className="p-8 border-neutral-200 shadow-sm text-center"><Route size={32} className="mx-auto text-neutral-300 mb-2" /><p className="text-xs font-bold text-neutral-400 uppercase">Nenhuma rota cadastrada para este cliente</p></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clientRoutes.map(r => (
                  <Card key={r.id} className="p-4 border-neutral-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setEditingRoute(r); setShowRouteModal(true); }} data-testid={`card-route-${r.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black text-neutral-800 uppercase">{r.name}</h4>
                      {r.is_noturno && <Moon size={14} className="text-indigo-600" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-600">
                      <Navigation size={12} className="text-green-600" /><span>{r.origin}</span><ChevronRight size={12} className="text-neutral-400" /><span>{r.destination}</span>
                    </div>
                    <p className="text-[10px] font-mono font-bold text-neutral-500 mt-1">{r.estimated_km} km · {r.estimated_hours}h</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "RELATORIO_OS" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><BarChart3 size={16} /> Relatório de OS</h3>
            <div className="flex gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
              {([["DAY", "Dia"], ["FORTNIGHT", "Quinzena"], ["MONTH", "Mês"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOsPeriod(k)} data-testid={`button-period-${k.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all ${osPeriod === k ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">OS no Período</p><p className="text-2xl font-black text-neutral-900">{filteredOS.length}</p></Card>
            <Card className="p-4 text-center bg-green-50"><p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p><p className="text-xl font-black text-green-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.fat_total), 0))}</p></Card>
            <Card className="p-4 text-center bg-red-50"><p className="text-[9px] font-black text-red-700 uppercase">Operacional</p><p className="text-xl font-black text-red-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.pag_total), 0))}</p></Card>
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p><p className="text-xl font-black text-neutral-700 font-mono">{filteredOS.reduce((a, b) => a + Number(b.km_total), 0)}</p></Card>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="px-3 py-3">BO</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Rota</th>
                  <th className="px-3 py-3">KM</th>
                  <th className="px-3 py-3 text-center">Not.</th>
                  <th className="px-3 py-3 text-right">Faturamento</th>
                  <th className="px-3 py-3 text-right">Operacional</th>
                  <th className="px-3 py-3 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredOS.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-neutral-400 font-bold uppercase text-sm">Nenhuma OS neste período</td></tr>
                ) : filteredOS.map(b => (
                  <tr key={b.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-3"><span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{b.boletim_numero || "—"}</span></td>
                    <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3 text-[10px] font-bold text-neutral-600">{b.origem && b.destino ? `${b.origem}→${b.destino}` : "—"}</td>
                    <td className="px-3 py-3 text-xs font-mono font-bold">{b.km_total}</td>
                    <td className="px-3 py-3 text-center">{b.is_noturno ? <Moon size={14} className="mx-auto text-indigo-600" /> : <span className="text-neutral-300">—</span>}</td>
                    <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{fmt(Number(b.fat_total))}</td>
                    <td className="px-3 py-3 text-right font-black font-mono text-sm text-red-600">{fmt(Number(b.pag_total))}</td>
                    <td className={`px-3 py-3 text-right font-black font-mono text-sm ${Number(b.fat_total) - Number(b.pag_total) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.fat_total) - Number(b.pag_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showContractModal && <ServiceContractModal onClose={() => { setShowContractModal(false); setEditingSC(null); }} editing={editingSC} clientId={client.id} clientName={client.name} />}
      {showPriceModal && <PriceTableModal onClose={() => { setShowPriceModal(false); setEditingPrice(null); }} editing={editingPrice} clientId={client.id} clientName={client.name} />}
      {showRouteModal && <RouteFormModal onClose={() => { setShowRouteModal(false); setEditingRoute(null); }} editing={editingRoute} clientId={client.id} clientName={client.name} />}
    </div>
  );
}

export default function ClientsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [analysisClient, setAnalysisClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
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

  if (viewingClient) {
    return (
      <AdminLayout>
        <ClientPastaView client={viewingClient} onBack={() => setViewingClient(null)} />
      </AdminLayout>
    );
  }

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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">CNPJ/CPF</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cidade</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(clients || []).map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer" data-testid={`row-client-${c.id}`} onClick={() => setViewingClient(c)}>
                    <td className="p-3 font-medium text-neutral-900">{c.name}</td>
                    <td className="p-3 text-neutral-600">{c.cnpj || c.cpf || "-"}</td>
                    <td className="p-3 text-neutral-600">{c.phone || "-"}</td>
                    <td className="p-3 text-neutral-600">{c.city || "-"}</td>
                    <td className="p-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
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
