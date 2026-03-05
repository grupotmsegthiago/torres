import { useState, useCallback } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Loader2, Scale, Car, ChevronDown, ChevronRight,
  Calendar, Building2, Gavel, FileText, MapPin
} from "lucide-react";

function formatCnpjInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatProcessNumber(num: string): string {
  if (!num || num.length !== 20) return num;
  return `${num.slice(0, 7)}-${num.slice(7, 9)}.${num.slice(9, 13)}.${num.slice(13, 14)}.${num.slice(14, 16)}.${num.slice(16)}`;
}

function formatDate(raw: string): string {
  if (!raw) return "-";
  if (raw.includes("T")) {
    return new Date(raw).toLocaleDateString("pt-BR");
  }
  if (raw.length >= 8) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${d}/${m}/${y}`;
  }
  return raw;
}

const TRIBUNAL_OPTIONS = [
  { value: "tjsp", label: "TJSP" },
  { value: "tjrj", label: "TJRJ" },
  { value: "tjmg", label: "TJMG" },
  { value: "tjrs", label: "TJRS" },
  { value: "tjpr", label: "TJPR" },
  { value: "tjsc", label: "TJSC" },
  { value: "tjba", label: "TJBA" },
  { value: "tjgo", label: "TJGO" },
  { value: "tjdf", label: "TJDF" },
  { value: "tjpe", label: "TJPE" },
  { value: "tjce", label: "TJCE" },
  { value: "tjes", label: "TJES" },
  { value: "trt1", label: "TRT1 (RJ)" },
  { value: "trt2", label: "TRT2 (SP)" },
  { value: "trt3", label: "TRT3 (MG)" },
  { value: "trt4", label: "TRT4 (RS)" },
  { value: "trt5", label: "TRT5 (BA)" },
  { value: "trt6", label: "TRT6 (PE)" },
  { value: "trt9", label: "TRT9 (PR)" },
  { value: "trt15", label: "TRT15 (Campinas)" },
];

function DataJudTab() {
  const { toast } = useToast();
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedTribunals, setSelectedTribunals] = useState<string[]>(["tjsp", "trt2", "trt15"]);
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);

  const toggleTribunal = (val: string) => {
    setSelectedTribunals(prev =>
      prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]
    );
  };

  const handleSearch = useCallback(async () => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast({ title: "Digite um CNPJ válido com 14 dígitos", variant: "destructive" });
      return;
    }
    if (selectedTribunals.length === 0) {
      toast({ title: "Selecione pelo menos um tribunal", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const tribunals = selectedTribunals.join(",");
      const res = await fetch(`/api/datajud/${digits}?tribunals=${tribunals}&size=20`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Erro na consulta", description: err.message, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setResults(data);
      if (data.totalResultados === 0) {
        toast({ title: "Nenhum processo encontrado para este CNPJ" });
      } else {
        toast({ title: `${data.totalResultados} processo(s) encontrado(s)` });
      }
    } catch {
      toast({ title: "Erro ao consultar DataJud", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [cnpj, selectedTribunals, toast]);

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-5 h-5 text-neutral-700" />
          <h3 className="font-semibold text-neutral-900">Consulta DataJud - CNJ</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Consulta pública de processos judiciais por CNPJ nos tribunais brasileiros.
        </p>

        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(formatCnpjInput(e.target.value))}
              placeholder="00.000.000/0000-00"
              className="font-mono"
              data-testid="input-datajud-cnpj"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || cnpj.replace(/\D/g, "").length !== 14}
            data-testid="button-datajud-search"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Consultar
          </Button>
        </div>

        <div className="mb-2">
          <p className="text-xs font-medium text-neutral-600 mb-2">Tribunais:</p>
          <div className="flex flex-wrap gap-1.5">
            {TRIBUNAL_OPTIONS.map(t => (
              <button
                key={t.value}
                onClick={() => toggleTribunal(t.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedTribunals.includes(t.value)
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                }`}
                data-testid={`button-tribunal-${t.value}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading && (
        <Card className="p-8 bg-white border-neutral-200 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Consultando {selectedTribunals.length} tribunal(is)...</p>
        </Card>
      )}

      {results && !loading && (
        <Card className="bg-white border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gavel className="w-4 h-4 text-neutral-600" />
              <span className="text-sm font-medium text-neutral-700">Resultados</span>
            </div>
            <Badge variant="secondary" data-testid="badge-total-results">
              {results.totalResultados} processo(s)
            </Badge>
          </div>

          {results.totalResultados === 0 ? (
            <div className="p-8 text-center text-neutral-400">
              <Scale className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum processo encontrado para o CNPJ informado.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {results.processos.map((p: any, i: number) => (
                <div key={i} className="hover:bg-neutral-50 transition-colors" data-testid={`row-process-${i}`}>
                  <button
                    className="w-full p-4 text-left flex items-start gap-3"
                    onClick={() => setExpandedProcess(expandedProcess === p.numeroProcesso ? null : p.numeroProcesso)}
                    data-testid={`button-expand-process-${i}`}
                  >
                    <div className="mt-0.5">
                      {expandedProcess === p.numeroProcesso
                        ? <ChevronDown className="w-4 h-4 text-neutral-400" />
                        : <ChevronRight className="w-4 h-4 text-neutral-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-neutral-900" data-testid={`text-process-number-${i}`}>
                          {formatProcessNumber(p.numeroProcesso)}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{p.tribunal}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{p.grau}</Badge>
                      </div>
                      <p className="text-xs text-neutral-600 mt-1">{p.classe}</p>
                      {p.assuntos && <p className="text-xs text-neutral-400 mt-0.5">{p.assuntos}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-neutral-500">{formatDate(p.dataAjuizamento)}</p>
                    </div>
                  </button>

                  {expandedProcess === p.numeroProcesso && (
                    <div className="px-4 pb-4 ml-7">
                      <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-neutral-500">Órgão Julgador:</span>
                            <span className="text-neutral-800 font-medium">{p.orgaoJulgador || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-neutral-500">Última Atualização:</span>
                            <span className="text-neutral-800 font-medium">{formatDate(p.ultimaAtualizacao)}</span>
                          </div>
                        </div>

                        {p.movimentos && p.movimentos.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              Últimas Movimentações
                            </p>
                            <div className="space-y-1.5">
                              {p.movimentos.map((m: any, j: number) => (
                                <div
                                  key={j}
                                  className="flex items-start gap-2 text-xs bg-white rounded px-3 py-2 border border-neutral-100"
                                  data-testid={`text-movement-${i}-${j}`}
                                >
                                  <span className="text-neutral-400 shrink-0 font-mono">{formatDate(m.dataHora)}</span>
                                  <span className="text-neutral-700">{m.nome}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function PlacaTab() {
  const { toast } = useToast();
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSearch = useCallback(async () => {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (clean.length < 7) {
      toast({ title: "Digite uma placa válida", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/plate-lookup/${clean}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Erro na consulta", description: err.message, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setResult(data);
      toast({ title: "Veículo encontrado" });
    } catch {
      toast({ title: "Erro ao consultar placa", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [plate, toast]);

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4">
          <Car className="w-5 h-5 text-neutral-700" />
          <h3 className="font-semibold text-neutral-900">Consulta de Placa</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Consulta dados do veículo pela placa via API Brasil. Requer token APIBRASIL_TOKEN configurado.
        </p>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              maxLength={8}
              className="font-mono font-bold tracking-wider uppercase"
              data-testid="input-consulta-placa"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || plate.replace(/[^a-zA-Z0-9]/g, "").length < 7}
            data-testid="button-consulta-placa"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Consultar
          </Button>
        </div>
      </Card>

      {loading && (
        <Card className="p-8 bg-white border-neutral-200 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Consultando placa...</p>
        </Card>
      )}

      {result && !loading && (
        <Card className="bg-white border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100 bg-neutral-50">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-900 text-white px-4 py-2 rounded-md font-mono font-bold text-lg tracking-widest" data-testid="text-result-plate">
                {result.plate}
              </div>
              <div>
                <p className="font-semibold text-neutral-900" data-testid="text-result-brand-model">
                  {result.brand} {result.model}
                </p>
                <p className="text-xs text-neutral-500">{result.year || "-"}</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoField icon={<Car className="w-3.5 h-3.5" />} label="Marca" value={result.brand} testId="text-result-brand" />
              <InfoField icon={<Car className="w-3.5 h-3.5" />} label="Modelo" value={result.model} testId="text-result-model" />
              <InfoField icon={<Calendar className="w-3.5 h-3.5" />} label="Ano" value={result.year?.toString()} testId="text-result-year" />
              <InfoField label="Cor" value={result.color} testId="text-result-color" />
              <InfoField label="Chassi" value={result.chassi} testId="text-result-chassi" />
              <InfoField label="Combustível" value={result.fuel} testId="text-result-fuel" />
              <InfoField label="Tipo" value={result.type} testId="text-result-type" />
              <InfoField icon={<MapPin className="w-3.5 h-3.5" />} label="Cidade/UF" value={result.city && result.state ? `${result.city}/${result.state}` : "-"} testId="text-result-location" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function InfoField({ icon, label, value, testId }: { icon?: React.ReactNode; label: string; value?: string; testId: string }) {
  return (
    <div>
      <p className="text-[10px] text-neutral-400 mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-neutral-800 font-medium" data-testid={testId}>{value || "-"}</p>
    </div>
  );
}

const TABS = [
  { id: "datajud", label: "DataJud (CNJ)", icon: Scale },
  { id: "placa", label: "Consulta de Placa", icon: Car },
] as const;

type TabId = typeof TABS[number]["id"];

export default function ConsultasPage() {
  const [activeTab, setActiveTab] = useState<TabId>("datajud");

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-consultas-title">Consultas</h1>
        <p className="text-sm text-neutral-500 mt-1">APIs integradas para consulta de dados</p>
      </div>

      <div className="flex gap-1 mb-6 bg-neutral-100 p-1 rounded-lg w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "datajud" && <DataJudTab />}
      {activeTab === "placa" && <PlacaTab />}
    </AdminLayout>
  );
}
