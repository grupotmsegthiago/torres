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
  Car, Wallet, ClipboardList, Clock, Eye, User, Camera, Truck,
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
  contract_number: string | null; object: string | null;
  contratante_razao: string | null; contratante_cnpj: string | null;
  contratante_endereco: string | null; contratante_representante: string | null;
  contratante_email: string | null; contratante_telefone: string | null;
  vigencia_tipo: string; vigencia_inicio: string | null; vigencia_fim: string | null;
  data_assinatura: string | null; aviso_previo_dias: number;
  num_vigilantes: number; armamento_descricao: string | null;
  equipamentos: string | null; multa_mora_pct: number;
  juros_mora_pct: number; indice_correcao: string;
  reajuste_periodicidade: string | null; reajuste_indice: string | null;
  reajuste_observacoes: string | null; renovacao_automatica: boolean;
  testemunha1_nome: string | null; testemunha1_rg: string | null;
  testemunha1_cpf: string | null; testemunha1_telefone: string | null;
  testemunha2_nome: string | null; testemunha2_rg: string | null;
  testemunha2_cpf: string | null; testemunha2_telefone: string | null;
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

interface ClientVehicle {
  id: number; clientId: number; plate: string; model: string | null;
  brand: string | null; color: string | null; driverName: string | null;
  driverPhone: string | null; notes: string | null; createdAt: string;
}

type ClientTab = "VEICULOS" | "TABELA" | "CONTRATO" | "RELATORIO_MISSOES" | "RELATORIO_FATURAMENTO";

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

function ServiceContractModal({ onClose, editing, client }: { onClose: () => void; editing: ServiceContract | null; client: Client }) {
    const { toast } = useToast();
    const fullAddress = [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ");
    const oneYearLater = (() => {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split("T")[0];
    })();
    const [form, setForm] = useState({
      contract_number: editing?.contract_number || "",
      data_assinatura: editing?.data_assinatura?.split("T")[0] || new Date().toISOString().split("T")[0],
      contratante_razao: editing?.contratante_razao || client.name,
      contratante_cnpj: editing?.contratante_cnpj || client.cnpj || "",
      contratante_endereco: editing?.contratante_endereco || fullAddress,
      contratante_representante: editing?.contratante_representante || client.contactPerson || "",
      contratante_email: editing?.contratante_email || client.email || "",
      contratante_telefone: editing?.contratante_telefone || client.phone || "",
      vigencia_tipo: editing?.vigencia_tipo || "determinado",
      vigencia_inicio: editing?.vigencia_inicio?.split("T")[0] || new Date().toISOString().split("T")[0],
      vigencia_fim: editing?.vigencia_fim?.split("T")[0] || oneYearLater,
      aviso_previo_dias: editing?.aviso_previo_dias?.toString() || "30",
      renovacao_automatica: editing?.renovacao_automatica ?? true,
      num_vigilantes: editing?.num_vigilantes?.toString() || "2",
      armamento_descricao: editing?.armamento_descricao || "01 Revolver Cal. 38 + 01 Espingarda Cal. 12 Pump",
      equipamentos: editing?.equipamentos || "02 Coletes nível II-A, Rádio, Viatura identificada com rastreamento",
      reajuste_periodicidade: editing?.reajuste_periodicidade || "anual",
      reajuste_indice: editing?.reajuste_indice || "INPC",
      reajuste_observacoes: editing?.reajuste_observacoes || "Reajuste anual pelo INPC acumulado no período, aplicável a cada aniversário do contrato.",
      multa_mora_pct: editing?.multa_mora_pct?.toString() || "2.00",
      juros_mora_pct: editing?.juros_mora_pct?.toString() || "1.00",
      indice_correcao: editing?.indice_correcao || "INPC",
      testemunha1_nome: editing?.testemunha1_nome || "",
      testemunha1_rg: editing?.testemunha1_rg || "",
      testemunha1_cpf: editing?.testemunha1_cpf || "",
      testemunha1_telefone: editing?.testemunha1_telefone || "",
      testemunha2_nome: editing?.testemunha2_nome || "",
      testemunha2_rg: editing?.testemunha2_rg || "",
      testemunha2_cpf: editing?.testemunha2_cpf || "",
      testemunha2_telefone: editing?.testemunha2_telefone || "",
      observacoes: editing?.observacoes || "",
    });
    const sf = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

    const saveMutation = useMutation({
      mutationFn: () => {
        const payload = {
          client_id: client.id, client_name: client.name,
          contract_number: form.contract_number || null,
          object: "Prestação de Serviços de Escolta Armada",
          data_assinatura: form.data_assinatura || null,
          contratante_razao: form.contratante_razao || null,
          contratante_cnpj: form.contratante_cnpj || null,
          contratante_endereco: form.contratante_endereco || null,
          contratante_representante: form.contratante_representante || null,
          contratante_email: form.contratante_email || null,
          contratante_telefone: form.contratante_telefone || null,
          vigencia_tipo: form.vigencia_tipo,
          vigencia_inicio: form.vigencia_inicio || null,
          vigencia_fim: form.vigencia_tipo === "determinado" ? (form.vigencia_fim || null) : null,
          aviso_previo_dias: parseInt(form.aviso_previo_dias),
          renovacao_automatica: form.renovacao_automatica,
          num_vigilantes: parseInt(form.num_vigilantes),
          armamento_descricao: form.armamento_descricao || null,
          equipamentos: form.equipamentos || null,
          reajuste_periodicidade: form.reajuste_periodicidade || null,
          reajuste_indice: form.reajuste_indice || null,
          reajuste_observacoes: form.reajuste_observacoes || null,
          multa_mora_pct: parseFloat(form.multa_mora_pct),
          juros_mora_pct: parseFloat(form.juros_mora_pct),
          indice_correcao: form.indice_correcao,
          testemunha1_nome: form.testemunha1_nome || null,
          testemunha1_rg: form.testemunha1_rg || null,
          testemunha1_cpf: form.testemunha1_cpf || null,
          testemunha1_telefone: form.testemunha1_telefone || null,
          testemunha2_nome: form.testemunha2_nome || null,
          testemunha2_rg: form.testemunha2_rg || null,
          testemunha2_cpf: form.testemunha2_cpf || null,
          testemunha2_telefone: form.testemunha2_telefone || null,
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

    const inputCls = "w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold focus:outline-none focus:border-neutral-400";
    const monoCls = "w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold focus:outline-none focus:border-neutral-400";
    const labelCls = "text-[10px] font-black text-neutral-400 uppercase mb-1 block";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-service-contract">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 sticky top-0 z-10">
            <h3 className="font-bold text-neutral-800 uppercase text-xs tracking-widest">{editing ? "Editar Contrato" : "Novo Contrato de Prestação de Serviço"}</h3>
            <button onClick={onClose} data-testid="button-close-contract"><X size={20} className="text-neutral-400 hover:text-neutral-600" /></button>
          </div>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="p-6 space-y-4">
            <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
              <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><FileText size={12} /> Identificação</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Nº Contrato</label><input type="text" className={`${monoCls} uppercase`} placeholder="CT-2026/001" value={form.contract_number} onChange={e => sf("contract_number", e.target.value)} data-testid="input-contract-number" /></div>
                <div><label className={labelCls}>Data Assinatura / Registro</label><input type="date" className={monoCls} value={form.data_assinatura} onChange={e => sf("data_assinatura", e.target.value)} /></div>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Objeto</label>
                <input type="text" className={inputCls} value="Prestação de Serviços de Escolta Armada" readOnly />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <p className="text-[10px] font-black text-blue-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Building2 size={12} /> Contratante</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Razão Social</label><input type="text" className={inputCls} value={form.contratante_razao} onChange={e => sf("contratante_razao", e.target.value)} /></div>
                  <div><label className={labelCls}>CNPJ</label><input type="text" className={monoCls} placeholder="00.000.000/0000-00" value={form.contratante_cnpj} onChange={e => sf("contratante_cnpj", e.target.value)} data-testid="input-contratante-cnpj" /></div>
                </div>
                <div><label className={labelCls}>Endereço Completo</label><input type="text" className={inputCls} value={form.contratante_endereco} onChange={e => sf("contratante_endereco", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>E-mail</label><input type="email" className={inputCls} value={form.contratante_email} onChange={e => sf("contratante_email", e.target.value)} /></div>
                  <div><label className={labelCls}>Telefone</label><input type="text" className={monoCls} value={form.contratante_telefone} onChange={e => sf("contratante_telefone", e.target.value)} /></div>
                </div>
                <div><label className={labelCls}>Representante Legal</label><input type="text" className={`${inputCls} uppercase`} value={form.contratante_representante} onChange={e => sf("contratante_representante", e.target.value)} /></div>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
              <p className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-widest flex items-center gap-1"><Calendar size={12} /> Vigência (Padrão: 1 ano, renovável)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select className={`${inputCls} bg-white`} value={form.vigencia_tipo} onChange={e => {
                    sf("vigencia_tipo", e.target.value);
                    if (e.target.value === "determinado" && !form.vigencia_fim) {
                      const d = new Date(form.vigencia_inicio || Date.now());
                      d.setFullYear(d.getFullYear() + 1);
                      sf("vigencia_fim", d.toISOString().split("T")[0]);
                    }
                  }} data-testid="select-vigencia-tipo">
                    <option value="determinado">Determinado (1 ano)</option>
                    <option value="indeterminado">Indeterminado</option>
                  </select>
                </div>
                <div><label className={labelCls}>Início</label><input type="date" className={monoCls} value={form.vigencia_inicio} onChange={e => {
                  sf("vigencia_inicio", e.target.value);
                  if (form.vigencia_tipo === "determinado") {
                    const d = new Date(e.target.value); d.setFullYear(d.getFullYear() + 1);
                    sf("vigencia_fim", d.toISOString().split("T")[0]);
                  }
                }} /></div>
                {form.vigencia_tipo === "determinado" && (
                  <div><label className={labelCls}>Término</label><input type="date" className={monoCls} value={form.vigencia_fim} onChange={e => sf("vigencia_fim", e.target.value)} /></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><label className={labelCls}>Aviso Prévio (dias)</label><input type="number" className={monoCls} value={form.aviso_previo_dias} onChange={e => sf("aviso_previo_dias", e.target.value)} /></div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.renovacao_automatica} onChange={e => sf("renovacao_automatica", e.target.checked)} className="w-4 h-4 rounded accent-neutral-900" />
                    <span className="text-xs font-bold text-neutral-700 uppercase">Renovação automática</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <p className="text-[10px] font-black text-green-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Reajuste</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Periodicidade</label>
                  <select className={`${inputCls} bg-white`} value={form.reajuste_periodicidade} onChange={e => sf("reajuste_periodicidade", e.target.value)}>
                    <option value="anual">Anual</option>
                    <option value="semestral">Semestral</option>
                    <option value="nenhum">Sem reajuste</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Índice</label>
                  <select className={`${inputCls} bg-white`} value={form.reajuste_indice} onChange={e => sf("reajuste_indice", e.target.value)}>
                    <option value="INPC">INPC</option>
                    <option value="IGPM">IGP-M</option>
                    <option value="IPCA">IPCA</option>
                  </select>
                </div>
              </div>
              <div className="mt-3"><label className={labelCls}>Cláusula de Reajuste</label><textarea className={`${inputCls} resize-none`} rows={2} value={form.reajuste_observacoes} onChange={e => sf("reajuste_observacoes", e.target.value)} /></div>
            </div>

            <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
              <p className="text-[10px] font-black text-neutral-500 uppercase mb-3 tracking-widest flex items-center gap-1"><Shield size={12} /> Operacional</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Nº Vigilantes</label><input type="number" className={monoCls} value={form.num_vigilantes} onChange={e => sf("num_vigilantes", e.target.value)} /></div>
                <div><label className={labelCls}>Índice Correção</label><input type="text" className={`${inputCls} uppercase`} value={form.indice_correcao} onChange={e => sf("indice_correcao", e.target.value)} /></div>
              </div>
              <div className="mt-3"><label className={labelCls}>Armamento</label><input type="text" className={inputCls} value={form.armamento_descricao} onChange={e => sf("armamento_descricao", e.target.value)} /></div>
              <div className="mt-3"><label className={labelCls}>Equipamentos</label><input type="text" className={inputCls} value={form.equipamentos} onChange={e => sf("equipamentos", e.target.value)} /></div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-100">
              <p className="text-[10px] font-black text-red-700 uppercase mb-3 tracking-widest flex items-center gap-1"><DollarSign size={12} /> Penalidades</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Multa Mora (%)</label><input type="number" step="0.01" className={monoCls} value={form.multa_mora_pct} onChange={e => sf("multa_mora_pct", e.target.value)} /></div>
                <div><label className={labelCls}>Juros Mora (% mês)</label><input type="number" step="0.01" className={monoCls} value={form.juros_mora_pct} onChange={e => sf("juros_mora_pct", e.target.value)} /></div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <p className="text-[10px] font-black text-purple-700 uppercase mb-3 tracking-widest flex items-center gap-1"><User size={12} /> Testemunha 1</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className={labelCls}>Nome Completo</label><input type="text" className={`${inputCls} uppercase`} value={form.testemunha1_nome} onChange={e => sf("testemunha1_nome", e.target.value)} data-testid="input-testemunha1-nome" /></div>
                <div><label className={labelCls}>RG</label><input type="text" className={monoCls} value={form.testemunha1_rg} onChange={e => sf("testemunha1_rg", e.target.value)} /></div>
                <div><label className={labelCls}>CPF</label><input type="text" className={monoCls} placeholder="000.000.000-00" value={form.testemunha1_cpf} onChange={e => sf("testemunha1_cpf", e.target.value)} /></div>
                <div className="col-span-2"><label className={labelCls}>Telefone</label><input type="text" className={monoCls} placeholder="(00) 00000-0000" value={form.testemunha1_telefone} onChange={e => sf("testemunha1_telefone", e.target.value)} /></div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <p className="text-[10px] font-black text-purple-700 uppercase mb-3 tracking-widest flex items-center gap-1"><User size={12} /> Testemunha 2</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className={labelCls}>Nome Completo</label><input type="text" className={`${inputCls} uppercase`} value={form.testemunha2_nome} onChange={e => sf("testemunha2_nome", e.target.value)} data-testid="input-testemunha2-nome" /></div>
                <div><label className={labelCls}>RG</label><input type="text" className={monoCls} value={form.testemunha2_rg} onChange={e => sf("testemunha2_rg", e.target.value)} /></div>
                <div><label className={labelCls}>CPF</label><input type="text" className={monoCls} placeholder="000.000.000-00" value={form.testemunha2_cpf} onChange={e => sf("testemunha2_cpf", e.target.value)} /></div>
                <div className="col-span-2"><label className={labelCls}>Telefone</label><input type="text" className={monoCls} placeholder="(00) 00000-0000" value={form.testemunha2_telefone} onChange={e => sf("testemunha2_telefone", e.target.value)} /></div>
              </div>
            </div>

            <div><label className={labelCls}>Observações</label><textarea className={`${inputCls} resize-none`} rows={3} value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} /></div>

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
  const [osPeriod, setOsPeriod] = useState<"FORTNIGHT" | "MONTH">("MONTH");
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<ClientVehicle | null>(null);
  const [vForm, setVForm] = useState({ plate: "", model: "", brand: "", color: "", driverName: "", driverPhone: "", notes: "" });

  const { data: serviceContracts = [] } = useQuery<ServiceContract[]>({ queryKey: ["/api/service-contracts", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/service-contracts?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: priceContracts = [] } = useQuery<EscortContract[]>({ queryKey: ["/api/escort/contracts"] });
  const { data: clientRoutes = [] } = useQuery<EscortRoute[]>({ queryKey: ["/api/escort/routes", { client_id: client.id }], queryFn: async () => { const r = await fetch(`/api/escort/routes?client_id=${client.id}`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: allBillings = [] } = useQuery<EscortBilling[]>({ queryKey: ["/api/escort/billings"] });
  const { data: clientVehiclesList = [] } = useQuery<ClientVehicle[]>({ queryKey: ["/api/clients", client.id, "vehicles"], queryFn: async () => { const r = await fetch(`/api/clients/${client.id}/vehicles`, { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });
  const { data: allServiceOrders = [] } = useQuery<any[]>({ queryKey: ["/api/service-orders"], queryFn: async () => { const r = await fetch("/api/service-orders", { credentials: "include" }); const d = await r.json(); return Array.isArray(d) ? d : []; } });

  const clientPrices = priceContracts.filter(c => c.client_id === client.id);
  const clientBillings = allBillings.filter(b => b.client_id === client.id);
  const clientOrders = allServiceOrders.filter(o => o.clientId === client.id);

  const filteredOS = (() => {
    const now = new Date();
    return clientBillings.filter(b => {
      const d = new Date(b.created_at);
      if (osPeriod === "FORTNIGHT") { const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24); return diff <= 15; }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  })();

  const filteredMissions = (() => {
    const now = new Date();
    return clientOrders.filter(o => {
      if (o.status !== "concluida" && o.missionStatus !== "encerrada") return false;
      const d = new Date(o.completedDate || o.createdAt);
      if (osPeriod === "FORTNIGHT") { const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24); return diff <= 15; }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  })();

  const deleteSCMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/service-contracts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/service-contracts"] }); toast({ title: "Contrato excluído" }); },
  });

  const saveVehicleMutation = useMutation({
    mutationFn: () => {
      if (editingVehicle) return apiRequest("PATCH", `/api/client-vehicles/${editingVehicle.id}`, vForm);
      return apiRequest("POST", `/api/clients/${client.id}/vehicles`, vForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id, "vehicles"] });
      toast({ title: editingVehicle ? "Veículo atualizado" : "Veículo cadastrado" });
      setShowVehicleForm(false); setEditingVehicle(null);
      setVForm({ plate: "", model: "", brand: "", color: "", driverName: "", driverPhone: "", notes: "" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/client-vehicles/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id, "vehicles"] }); toast({ title: "Veículo removido" }); },
    onError: (err: Error) => toast({ title: "Erro ao remover veículo", description: err.message, variant: "destructive" }),
  });

  const TABS: { id: ClientTab; label: string; icon: typeof FileText }[] = [
    { id: "VEICULOS", label: "Veículos", icon: Car },
    { id: "TABELA", label: "Tabelas", icon: DollarSign },
    { id: "CONTRATO", label: "Contratos", icon: FileText },
    { id: "RELATORIO_MISSOES", label: "Missões", icon: ClipboardList },
    { id: "RELATORIO_FATURAMENTO", label: "Faturamento", icon: Wallet },
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

  const hasActiveContract = serviceContracts.some(sc => sc.status === "Ativo");
  const contractBlockedTabs: ClientTab[] = ["VEICULOS", "TABELA", "RELATORIO_MISSOES", "RELATORIO_FATURAMENTO"];

  const openBillings = clientBillings.filter(b => b.boletim_gerado && !["FATURADO", "PAGO"].includes((b as any).status || ""));
  const closedBillings = clientBillings.filter(b => ["FATURADO", "PAGO"].includes((b as any).status || ""));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" data-testid="button-back-to-clients"><ChevronLeft size={20} className="text-neutral-600" /></button>
        <div>
          <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight" data-testid="text-client-pasta-name">{client.name}</h2>
          <p className="text-xs text-neutral-500">{client.cnpj || "CNPJ não cadastrado"} — Pasta do Cliente</p>
        </div>
      </div>

      {!hasActiveContract && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3" data-testid="alert-no-contract">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Contrato obrigatório</p>
            <p className="text-xs text-amber-600 mt-0.5">Este cliente não possui contrato ativo. Cadastre um contrato de prestação de serviço antes de realizar qualquer operação.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-1">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const isBlocked = !hasActiveContract && contractBlockedTabs.includes(tab.id);
            return (
              <button key={tab.id} onClick={() => { if (!isBlocked) setActiveTab(tab.id); }} data-testid={`tab-client-${tab.id.toLowerCase()}`}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap flex-1 justify-center ${
                  isBlocked ? "text-neutral-300 cursor-not-allowed opacity-50" :
                  activeTab === tab.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`} disabled={isBlocked}>
                <tab.icon size={14} />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "VEICULOS" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><Car size={16} /> Veículos do Cliente</h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">Veículos cadastrados automaticamente nas missões ou manualmente</p>
            </div>
            <Button onClick={() => { setEditingVehicle(null); setVForm({ plate: "", model: "", brand: "", color: "", driverName: "", driverPhone: "", notes: "" }); setShowVehicleForm(true); }} className="bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase" data-testid="button-new-client-vehicle"><Plus size={14} className="mr-1" /> Novo Veículo</Button>
          </div>

          {showVehicleForm && (
            <Card className="p-5 border-blue-200 shadow-md bg-blue-50/30">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-xs font-black text-neutral-800 uppercase">{editingVehicle ? "Editar Veículo" : "Cadastrar Veículo"}</h4>
                <button onClick={() => { setShowVehicleForm(false); setEditingVehicle(null); }}><X size={18} className="text-neutral-400" /></button>
              </div>
              <form onSubmit={e => { e.preventDefault(); saveVehicleMutation.mutate(); }} className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Placa *</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold uppercase" placeholder="ABC1D23" value={vForm.plate} onChange={e => setVForm(p => ({ ...p, plate: e.target.value.toUpperCase() }))} required data-testid="input-vehicle-plate" /></div>
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Modelo</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" placeholder="Sprinter" value={vForm.model} onChange={e => setVForm(p => ({ ...p, model: e.target.value }))} data-testid="input-vehicle-model" /></div>
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Marca</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" placeholder="Mercedes" value={vForm.brand} onChange={e => setVForm(p => ({ ...p, brand: e.target.value }))} /></div>
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Cor</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" placeholder="Branca" value={vForm.color} onChange={e => setVForm(p => ({ ...p, color: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Motorista</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-bold" placeholder="Nome do motorista" value={vForm.driverName} onChange={e => setVForm(p => ({ ...p, driverName: e.target.value }))} data-testid="input-vehicle-driver" /></div>
                  <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Telefone Motorista</label><input type="text" className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm font-mono font-bold" placeholder="(21) 99999-0000" value={vForm.driverPhone} onChange={e => setVForm(p => ({ ...p, driverPhone: e.target.value }))} /></div>
                </div>
                <div><label className="text-[9px] font-black text-neutral-400 uppercase mb-1 block">Observações</label><textarea className="w-full p-2.5 border border-neutral-200 rounded-lg text-sm" rows={2} value={vForm.notes} onChange={e => setVForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <button type="submit" disabled={saveVehicleMutation.isPending || !vForm.plate} className="w-full bg-neutral-900 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50" data-testid="button-save-client-vehicle">
                  {saveVehicleMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Veículo
                </button>
              </form>
            </Card>
          )}

          {clientVehiclesList.length === 0 && !showVehicleForm ? (
            <Card className="p-12 border-neutral-200 shadow-sm text-center"><Car size={40} className="mx-auto text-neutral-300 mb-3" /><p className="text-sm font-bold text-neutral-400 uppercase">Nenhum veículo cadastrado</p><p className="text-[10px] text-neutral-300 mt-1">Veículos escoltados serão registrados automaticamente ao preencher uma OS</p></Card>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <table className="w-full text-left border-collapse" data-testid="table-client-vehicles">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Placa</th>
                    <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Modelo</th>
                    <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Motorista</th>
                    <th className="text-left px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Telefone</th>
                    <th className="text-right px-4 py-2.5 font-black text-neutral-400 uppercase tracking-wider text-[10px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientVehiclesList.map(v => (
                    <tr key={v.id} className="border-b border-neutral-50 hover:bg-neutral-50" data-testid={`row-client-vehicle-${v.id}`}>
                      <td className="px-4 py-3 font-mono font-black text-neutral-800 text-sm">{v.plate}</td>
                      <td className="px-4 py-3 text-xs font-bold text-neutral-600">{v.model ? `${v.brand || ""} ${v.model}`.trim() : "—"}{v.color ? ` · ${v.color}` : ""}</td>
                      <td className="px-4 py-3 text-xs font-bold text-neutral-700">{v.driverName || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">{v.driverPhone || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditingVehicle(v); setVForm({ plate: v.plate, model: v.model || "", brand: v.brand || "", color: v.color || "", driverName: v.driverName || "", driverPhone: v.driverPhone || "", notes: v.notes || "" }); setShowVehicleForm(true); }} className="p-1.5 rounded hover:bg-neutral-100 mr-1" data-testid={`button-edit-vehicle-${v.id}`}><Pencil size={14} className="text-neutral-500" /></button>
                        <button onClick={() => { if (confirm("Remover veículo?")) deleteVehicleMutation.mutate(v.id); }} className="p-1.5 rounded hover:bg-red-50" data-testid={`button-delete-vehicle-${v.id}`}><Trash2 size={14} className="text-red-400" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      {activeTab === "RELATORIO_MISSOES" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><ClipboardList size={16} /> Relatório de Missões</h3>
            <div className="flex gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
              {([["FORTNIGHT", "Quinzena"], ["MONTH", "Mês"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOsPeriod(k)} data-testid={`button-period-${k.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all ${osPeriod === k ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">Missões</p><p className="text-2xl font-black text-neutral-900">{filteredMissions.length}</p></Card>
            <Card className="p-4 text-center bg-green-50"><p className="text-[9px] font-black text-green-700 uppercase">Faturamento</p><p className="text-xl font-black text-green-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.fat_total), 0))}</p></Card>
            <Card className="p-4 text-center bg-red-50"><p className="text-[9px] font-black text-red-700 uppercase">Operacional</p><p className="text-xl font-black text-red-700 font-mono">{fmt(filteredOS.reduce((a, b) => a + Number(b.pag_total), 0))}</p></Card>
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">KM Total</p><p className="text-xl font-black text-neutral-700 font-mono">{filteredOS.reduce((a, b) => a + Number(b.km_total), 0)}</p></Card>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <table className="w-full text-left border-collapse" data-testid="table-missions">
              <thead>
                <tr className="bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="px-3 py-3">OS</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Rota</th>
                  <th className="px-3 py-3">Veículo Escoltado</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredMissions.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-neutral-400 font-bold uppercase text-sm">Nenhuma missão neste período</td></tr>
                ) : filteredMissions.map(o => {
                  const billing = clientBillings.find(b => (b as any).service_order_id === o.id);
                  return (
                    <tr key={o.id} className="hover:bg-neutral-50 cursor-pointer" onClick={() => setSelectedMissionId(o.id)} data-testid={`row-mission-${o.id}`}>
                      <td className="px-3 py-3"><span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{o.osNumber}</span></td>
                      <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(o.completedDate || o.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-3 text-[10px] font-bold text-neutral-600">{o.origin && o.destination ? `${o.origin} → ${o.destination}` : "—"}</td>
                      <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-600">{o.escortedVehiclePlate || "—"}</td>
                      <td className="px-3 py-3"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${o.status === "concluida" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{o.status === "concluida" ? "Concluída" : o.status}</span></td>
                      <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{billing ? fmt(Number(billing.fat_total)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "RELATORIO_FATURAMENTO" && (
        <div className="space-y-6">
          <h3 className="text-sm font-black text-neutral-700 uppercase flex items-center gap-2"><Wallet size={16} /> Relatório de Faturamento</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center"><p className="text-[9px] font-black text-neutral-400 uppercase">Total Boletins</p><p className="text-2xl font-black text-neutral-900">{clientBillings.length}</p></Card>
            <Card className="p-4 text-center bg-green-50"><p className="text-[9px] font-black text-green-700 uppercase">Faturamento Total</p><p className="text-xl font-black text-green-700 font-mono">{fmt(clientBillings.reduce((a, b) => a + Number(b.fat_total), 0))}</p></Card>
            <Card className="p-4 text-center bg-amber-50"><p className="text-[9px] font-black text-amber-700 uppercase">Em Aberto</p><p className="text-xl font-black text-amber-700 font-mono">{fmt(openBillings.reduce((a, b) => a + Number(b.fat_total), 0))}</p><p className="text-[9px] text-amber-600 mt-0.5">{openBillings.length} boletim(ns)</p></Card>
            <Card className="p-4 text-center bg-blue-50"><p className="text-[9px] font-black text-blue-700 uppercase">Fechados</p><p className="text-xl font-black text-blue-700 font-mono">{fmt(closedBillings.reduce((a, b) => a + Number(b.fat_total), 0))}</p><p className="text-[9px] text-blue-600 mt-0.5">{closedBillings.length} boletim(ns)</p></Card>
          </div>

          <div>
            <h4 className="text-xs font-black text-neutral-500 uppercase mb-3 flex items-center gap-2"><AlertTriangle size={14} /> Boletins em Aberto / Pendentes</h4>
            {clientBillings.filter(b => !["FATURADO", "PAGO"].includes((b as any).status || "")).length === 0 ? (
              <Card className="p-8 text-center"><CheckCircle2 size={32} className="mx-auto text-green-300 mb-2" /><p className="text-xs font-bold text-neutral-400 uppercase">Todos os boletins estão fechados</p></Card>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <table className="w-full text-left border-collapse" data-testid="table-billing-open">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-100 text-[10px] font-black uppercase tracking-widest text-amber-700">
                      <th className="px-3 py-3">BO</th>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Rota</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {clientBillings.filter(b => !["FATURADO", "PAGO"].includes((b as any).status || "")).map(b => (
                      <tr key={b.id} className="hover:bg-neutral-50">
                        <td className="px-3 py-3"><span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{b.boletim_numero || "—"}</span></td>
                        <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-3 text-[10px] font-bold text-neutral-600">{b.origem && b.destino ? `${b.origem}→${b.destino}` : "—"}</td>
                        <td className="px-3 py-3"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${(b as any).status === "A_VERIFICAR" ? "bg-amber-100 text-amber-700" : (b as any).status === "APROVADA" ? "bg-green-100 text-green-700" : (b as any).status === "REJEITADA" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>{(b as any).status || "—"}</span></td>
                        <td className="px-3 py-3 text-right font-black font-mono text-sm text-amber-700">{fmt(Number(b.fat_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {closedBillings.length > 0 && (
            <div>
              <h4 className="text-xs font-black text-neutral-500 uppercase mb-3 flex items-center gap-2"><CheckCircle2 size={14} /> Boletins Fechados / Pagos</h4>
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <table className="w-full text-left border-collapse" data-testid="table-billing-closed">
                  <thead>
                    <tr className="bg-green-50 border-b border-green-100 text-[10px] font-black uppercase tracking-widest text-green-700">
                      <th className="px-3 py-3">BO</th>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Rota</th>
                      <th className="px-3 py-3">KM</th>
                      <th className="px-3 py-3 text-right">Faturamento</th>
                      <th className="px-3 py-3 text-right">Lucro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {closedBillings.map(b => (
                      <tr key={b.id} className="hover:bg-neutral-50">
                        <td className="px-3 py-3"><span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{b.boletim_numero || "—"}</span></td>
                        <td className="px-3 py-3 text-xs font-mono font-bold text-neutral-500">{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-3 text-[10px] font-bold text-neutral-600">{b.origem && b.destino ? `${b.origem}→${b.destino}` : "—"}</td>
                        <td className="px-3 py-3 text-xs font-mono font-bold">{b.km_total}</td>
                        <td className="px-3 py-3 text-right font-black font-mono text-sm text-green-600">{fmt(Number(b.fat_total))}</td>
                        <td className={`px-3 py-3 text-right font-black font-mono text-sm ${Number(b.fat_total) - Number(b.pag_total) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.fat_total) - Number(b.pag_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showContractModal && <ServiceContractModal onClose={() => { setShowContractModal(false); setEditingSC(null); }} editing={editingSC} client={client} />}
      {showPriceModal && <PriceTableModal onClose={() => { setShowPriceModal(false); setEditingPrice(null); }} editing={editingPrice} clientId={client.id} clientName={client.name} />}
      {showRouteModal && <RouteFormModal onClose={() => { setShowRouteModal(false); setEditingRoute(null); }} editing={editingRoute} clientId={client.id} clientName={client.name} />}
      {selectedMissionId && <MissionDetailModal osId={selectedMissionId} onClose={() => setSelectedMissionId(null)} />}
    </div>
  );
}

function MissionDetailModal({ osId, onClose }: { osId: number; onClose: () => void }) {
  const { data: os, isLoading } = useQuery<any>({
    queryKey: ["/api/service-orders", osId, "enriched"],
    queryFn: async () => {
      const r = await fetch(`/api/service-orders/${osId}/enriched`, { credentials: "include" });
      return r.json();
    },
  });

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtTime = (d: string | null) => d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const b = os?.billing;
  const photos = os?.photos || [];
  const kmSaida = photos.find((p: any) => p.step === "km_saida");
  const kmFinal = photos.find((p: any) => p.step === "km_final");
  const stepsOrder = ["checkin_selfie", "km_saida", "checkin_viatura", "checkin_armamento", "checkin_dados_motorista", "km_final", "checkout_viatura", "checkout_armamento", "checkout_selfie"];
  const stepLabels: Record<string, string> = {
    checkin_selfie: "Selfie Check-in", km_saida: "KM Saída", checkin_viatura: "Vistoria Viatura (Saída)",
    checkin_armamento: "Vistoria Armamento (Saída)", checkin_dados_motorista: "Dados Motorista Escoltado",
    km_final: "KM Final", checkout_viatura: "Vistoria Viatura (Retorno)", checkout_armamento: "Vistoria Armamento (Retorno)",
    checkout_selfie: "Selfie Check-out",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} data-testid="modal-mission-detail">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {isLoading || !os ? (
          <div className="p-12 text-center"><Loader2 size={32} className="mx-auto animate-spin text-neutral-300" /><p className="text-xs text-neutral-400 mt-3 font-bold uppercase">Carregando dados da OS...</p></div>
        ) : (
          <>
            <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex justify-between items-center z-10">
              <div>
                <h3 className="font-black text-neutral-800 uppercase text-sm tracking-widest flex items-center gap-2">
                  <FileText size={18} /> OS {os.osNumber}
                </h3>
                <p className="text-[10px] text-neutral-400 mt-0.5">Detalhes completos da missão</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${os.status === "concluida" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {os.status === "concluida" ? "Concluída" : os.status}
                </span>
                {os.missionStatus && (
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${os.missionStatus === "encerrada" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"}`}>
                    {os.missionStatus}
                  </span>
                )}
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100"><X size={20} className="text-neutral-400" /></button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><FileText size={12} /> Dados Iniciais da OS</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Tipo</p><p className="text-xs font-bold text-neutral-800">{os.type || "—"}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Prioridade</p><p className="text-xs font-bold text-neutral-800">{os.priority || "—"}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Agendamento</p><p className="text-xs font-mono font-bold text-neutral-800">{fmtDate(os.scheduledDate)}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Conclusão</p><p className="text-xs font-mono font-bold text-neutral-800">{fmtDate(os.completedDate)}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Criação</p><p className="text-xs font-mono font-bold text-neutral-800">{fmtDate(os.createdAt)}</p></div>
                  <div><p className="text-[9px] font-black text-neutral-400 uppercase">Solicitante</p><p className="text-xs font-bold text-neutral-800">{os.requesterName || "—"}</p></div>
                </div>
                {os.description && (
                  <div className="mt-3"><p className="text-[9px] font-black text-neutral-400 uppercase">Descrição</p><p className="text-xs text-neutral-700">{os.description}</p></div>
                )}
                {os.notes && (
                  <div className="mt-2"><p className="text-[9px] font-black text-neutral-400 uppercase">Observações</p><p className="text-xs text-neutral-700">{os.notes}</p></div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <p className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1"><User size={10} /> Agente 1</p>
                  <p className="text-xs font-bold text-neutral-800">{os.employee1Name || "—"}</p>
                </div>
                {os.employee2Name && (
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <p className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1"><User size={10} /> Agente 2</p>
                    <p className="text-xs font-bold text-neutral-800">{os.employee2Name}</p>
                  </div>
                )}
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                  <p className="text-[9px] font-black text-neutral-500 uppercase flex items-center gap-1"><Car size={10} /> Viatura</p>
                  <p className="text-xs font-mono font-bold text-neutral-800">{os.vehiclePlate || "—"}</p>
                  {os.vehicleModel && <p className="text-[10px] text-neutral-500">{os.vehicleModel}</p>}
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                  <p className="text-[9px] font-black text-neutral-500 uppercase flex items-center gap-1"><Shield size={10} /> Kit</p>
                  <p className="text-xs font-bold text-neutral-800">{os.kitName || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                  <p className="text-[9px] font-black text-neutral-500 uppercase flex items-center gap-1"><MapPin size={10} /> Origem</p>
                  <p className="text-xs font-bold text-neutral-800">{os.origin || "—"}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                  <p className="text-[9px] font-black text-neutral-500 uppercase flex items-center gap-1"><MapPin size={10} /> Destino</p>
                  <p className="text-xs font-bold text-neutral-800">{os.destination || "—"}</p>
                </div>
              </div>

              {(os.escortedVehiclePlate || os.escortedDriverName) && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1"><Truck size={12} /> Veículo Escoltado</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Placa</p><p className="text-sm font-mono font-black text-neutral-800">{os.escortedVehiclePlate || "—"}</p></div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Motorista</p><p className="text-xs font-bold text-neutral-800">{os.escortedDriverName || "—"}</p></div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Telefone</p><p className="text-xs font-mono font-bold text-neutral-800">{os.escortedDriverPhone || "—"}</p></div>
                  </div>
                </div>
              )}

              {os.missionStartedAt && (
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                  <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Clock size={12} /> Horários da Missão</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Início Real</p><p className="text-sm font-mono font-black text-neutral-800">{fmtTime(os.missionStartedAt)}</p></div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Conclusão</p><p className="text-sm font-mono font-black text-neutral-800">{os.completedDate ? fmtTime(os.completedDate) : "—"}</p></div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Rota</p><p className="text-xs font-bold text-neutral-800">{os.route || "—"}</p></div>
                  </div>
                </div>
              )}

              {photos.length > 0 && (
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                  <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Camera size={12} /> Vistoria do Agente ({photos.length} registros)</p>
                  <div className="space-y-2">
                    {stepsOrder.map(step => {
                      const photo = photos.find((p: any) => p.step === step);
                      if (!photo) return null;
                      return (
                        <div key={step} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-neutral-100">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-green-500" />
                            <span className="text-[10px] font-black text-neutral-700 uppercase">{stepLabels[step] || step}</span>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            {photo.kmValue && <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{photo.kmValue} km</span>}
                            {photo.notes && <span className="text-[10px] text-neutral-500 max-w-[150px] truncate">{photo.notes}</span>}
                            <span className="text-[9px] text-neutral-400 font-mono">{photo.createdAt ? fmtTime(photo.createdAt) : ""}</span>
                            {photo.latitude && <span className="text-[9px] text-neutral-300">GPS ✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {kmSaida?.kmValue && kmFinal?.kmValue && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-700 uppercase">KM Percorrido (Hodômetro)</span>
                      <span className="text-sm font-black font-mono text-blue-800">{kmFinal.kmValue - kmSaida.kmValue} km</span>
                    </div>
                  )}
                </div>
              )}

              {(os.baseReturnKm || os.baseCleanStatus) && (
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                  <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Eye size={12} /> Vistoria Interna (Retorno à Base)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">KM Retorno</p><p className="text-xs font-mono font-bold text-neutral-800">{os.baseReturnKm || "—"}</p></div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Estado Viatura</p>
                      <p className={`text-xs font-bold ${os.baseCleanStatus === "ok" ? "text-green-700" : "text-red-700"}`}>{os.baseCleanStatus === "ok" ? "OK / Limpa" : os.baseCleanStatus || "—"}</p>
                    </div>
                    <div><p className="text-[9px] font-black text-neutral-400 uppercase">Checklist Conferido</p>
                      <p className={`text-xs font-bold ${os.baseChecklistConfirmed ? "text-green-700" : "text-red-700"}`}>{os.baseChecklistConfirmed ? "Sim ✓" : "Não"}</p>
                    </div>
                  </div>
                  {os.baseCleanNotes && (
                    <div className="mt-2"><p className="text-[9px] font-black text-neutral-400 uppercase">Observações da Vistoria</p><p className="text-xs text-neutral-700">{os.baseCleanNotes}</p></div>
                  )}
                </div>
              )}

              {b && (
                <div className="border-t border-neutral-200 pt-5">
                  <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1"><DollarSign size={12} /> Cálculo de Faturamento</p>

                  {b.horario_inicio_considerado && (
                    <div className={`p-3 rounded-xl border mb-3 ${b.horario_agendado && b.horario_inicio && b.horario_inicio_considerado !== b.horario_agendado ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-neutral-500 uppercase">Horário para Cobrança</p>
                          <p className="text-lg font-black font-mono">{b.horario_inicio_considerado}</p>
                        </div>
                        <div className="text-right">
                          {b.horario_agendado && <p className="text-[9px] text-neutral-400">Agendado: <span className="font-mono font-bold">{b.horario_agendado}</span></p>}
                          {b.horario_inicio && <p className="text-[9px] text-neutral-400">Chegada Real: <span className="font-mono font-bold">{b.horario_inicio}</span></p>}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="bg-blue-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-blue-600 uppercase">KM Total</p><p className="text-lg font-black font-mono text-blue-800">{Number(b.km_total || 0)}</p></div>
                    <div className="bg-blue-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-blue-600 uppercase">Carregado</p><p className="text-lg font-black font-mono text-blue-800">{Number(b.km_carregado || 0)}</p></div>
                    <div className="bg-neutral-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Franquia</p><p className="text-lg font-black font-mono text-neutral-800">{Number(b.km_franquia || 0)}</p></div>
                    <div className={`p-3 rounded-xl text-center ${Number(b.km_excedente) > 0 ? "bg-red-50" : "bg-neutral-50"}`}><p className="text-[9px] font-black text-neutral-500 uppercase">Excedente</p><p className={`text-lg font-black font-mono ${Number(b.km_excedente) > 0 ? "text-red-600" : "text-neutral-600"}`}>{Number(b.km_excedente || 0)}</p></div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-neutral-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">KM Vazio</p><p className="text-sm font-black font-mono">{Number(b.km_vazio || 0)}</p></div>
                    <div className="bg-neutral-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Horas</p><p className="text-sm font-black font-mono">{Number(b.horas_trabalhadas || b.horas_missao || 0)}h</p></div>
                    <div className="bg-neutral-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Estadia</p><p className="text-sm font-black font-mono">{Number(b.horas_estadia || 0)}h</p></div>
                    <div className="bg-neutral-50 p-3 rounded-xl text-center"><p className="text-[9px] font-black text-neutral-500 uppercase">Noturno</p><p className="text-sm font-black font-mono">{b.is_noturno ? "Sim" : "Não"}</p></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                      <p className="text-[9px] font-black text-green-700 uppercase mb-2">Faturamento (Cliente)</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]"><span className="text-neutral-500">KM Carregado</span><span className="font-mono font-bold">{fmt(Number(b.fat_km_carregado || b.fat_km || 0))}</span></div>
                        {Number(b.fat_km_vazio || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">KM Vazio</span><span className="font-mono font-bold">{fmt(Number(b.fat_km_vazio))}</span></div>}
                        {Number(b.fat_estadia || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Estadia</span><span className="font-mono font-bold">{fmt(Number(b.fat_estadia))}</span></div>}
                        {Number(b.fat_pernoite || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Pernoite</span><span className="font-mono font-bold">{fmt(Number(b.fat_pernoite))}</span></div>}
                        {Number(b.fat_diaria || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Diária</span><span className="font-mono font-bold">{fmt(Number(b.fat_diaria))}</span></div>}
                        {Number(b.fat_adicional_noturno || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Ad. Noturno</span><span className="font-mono font-bold">{fmt(Number(b.fat_adicional_noturno))}</span></div>}
                        <div className="border-t border-green-200 pt-1 mt-1 flex justify-between text-xs"><span className="font-black text-green-800">TOTAL</span><span className="font-black font-mono text-green-800">{fmt(Number(b.fat_total))}</span></div>
                      </div>
                    </div>

                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                      <p className="text-[9px] font-black text-red-700 uppercase mb-2">Pagamento (Vigilante)</p>
                      <div className="space-y-1">
                        {Number(b.pag_vrp || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">VRP</span><span className="font-mono font-bold">{fmt(Number(b.pag_vrp))}</span></div>}
                        {Number(b.pag_periculosidade || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Periculosidade</span><span className="font-mono font-bold">{fmt(Number(b.pag_periculosidade))}</span></div>}
                        {Number(b.pag_adicional_noturno || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Ad. Noturno</span><span className="font-mono font-bold">{fmt(Number(b.pag_adicional_noturno))}</span></div>}
                        {Number(b.pag_reembolsos || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-neutral-500">Reembolsos</span><span className="font-mono font-bold">{fmt(Number(b.pag_reembolsos))}</span></div>}
                        <div className="border-t border-red-200 pt-1 mt-1 flex justify-between text-xs"><span className="font-black text-red-800">TOTAL</span><span className="font-black font-mono text-red-800">{fmt(Number(b.pag_total))}</span></div>
                      </div>
                    </div>
                  </div>

                  {Number(b.desp_pedagio || b.despesas_pedagio || 0) > 0 && (
                    <div className="bg-neutral-50 p-3 rounded-xl mb-3">
                      <p className="text-[9px] font-black text-neutral-500 uppercase">Despesas</p>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[10px] text-neutral-500">Pedágio: <span className="font-mono font-bold">{fmt(Number(b.desp_pedagio || b.despesas_pedagio || 0))}</span></span>
                      </div>
                    </div>
                  )}

                  <div className={`p-4 rounded-xl text-center border ${Number(b.resultado_liquido) >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-[9px] font-black text-neutral-500 uppercase">Resultado Líquido</p>
                    <p className={`text-2xl font-black font-mono ${Number(b.resultado_liquido) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(Number(b.resultado_liquido))}</p>
                    {Number(b.margem_percentual) !== 0 && <p className="text-[10px] font-mono text-neutral-500 mt-0.5">Margem: {Number(b.margem_percentual).toFixed(1)}%</p>}
                  </div>

                  {b.status && (
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${
                        b.status === "A_VERIFICAR" ? "bg-amber-100 text-amber-800" :
                        b.status === "APROVADA" ? "bg-green-100 text-green-800" :
                        b.status === "REJEITADA" ? "bg-red-100 text-red-800" :
                        b.status === "FATURADO" ? "bg-blue-100 text-blue-800" :
                        b.status === "PAGO" ? "bg-emerald-100 text-emerald-800" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>Billing: {b.status}</span>
                      {b.boletim_numero && <span className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{b.boletim_numero}</span>}
                    </div>
                  )}

                  {b.revisado_por && (
                    <div className="mt-3 bg-neutral-50 p-3 rounded-xl">
                      <p className="text-[9px] font-black text-neutral-400 uppercase">Revisado por</p>
                      <p className="text-xs font-bold text-neutral-700">{b.revisado_por} em {b.revisado_em ? new Date(b.revisado_em).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                  )}

                  {b.motivo_rejeicao && (
                    <div className="mt-2 bg-red-50 p-3 rounded-xl border border-red-200">
                      <p className="text-[9px] font-black text-red-700 uppercase">Motivo da Rejeição</p>
                      <p className="text-xs font-bold text-red-800">{b.motivo_rejeicao}</p>
                    </div>
                  )}
                </div>
              )}

              {!b && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
                  <AlertTriangle size={24} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-xs font-black text-amber-700 uppercase">OS sem cálculo de faturamento</p>
                  <p className="text-[10px] text-amber-600 mt-1">Esta OS foi concluída mas não possui dados de KM válidos para gerar o boletim automaticamente.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
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
