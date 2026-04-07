import { useState, useCallback, useRef } from "react";
import { formatDateBRT } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Loader2, Scale, Car, ChevronDown, ChevronRight,
  Calendar, Building2, Gavel, FileText, MapPin, ShieldAlert,
  CreditCard, AlertTriangle, Receipt, ScrollText, IdCard, Vote,
  Activity, Clock, Zap, CheckCircle2, XCircle, X
} from "lucide-react";

function formatCnpjInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatProcessNumber(num: string): string {
  if (!num || num.length !== 20) return num;
  return `${num.slice(0, 7)}-${num.slice(7, 9)}.${num.slice(9, 13)}.${num.slice(13, 14)}.${num.slice(14, 16)}.${num.slice(16)}`;
}

function formatDate(raw: string): string {
  if (!raw) return "-";
  if (raw.includes("T")) return formatDateBRT(raw);
  if (raw.length >= 8) return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}`;
  return raw;
}

function ResultCard({ title, icon, data, loading }: { title: string; icon: React.ReactNode; data: any; loading: boolean }) {
  if (loading) {
    return (
      <Card className="p-8 bg-white border-neutral-200 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-3" />
        <p className="text-sm text-neutral-500">Consultando {title}...</p>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card className="bg-white border-neutral-200 overflow-hidden">
      <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-neutral-700">{title}</span>
        <Badge variant={data.success ? "secondary" : "destructive"} className="ml-auto text-xs">
          {data.success ? "OK" : "Erro"}
        </Badge>
      </div>
      <div className="p-4">
        {!data.success ? (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {data.data?.error || "Erro na consulta"}
          </div>
        ) : (
          <pre className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded overflow-auto max-h-[400px] whitespace-pre-wrap break-words" data-testid="text-result-data">
            {JSON.stringify(data.data, null, 2)}
          </pre>
        )}
      </div>
    </Card>
  );
}

function useConsulta(baseUrl: string) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const search = useCallback(async (param: string) => {
    setLoading(true);
    setResult(null);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`${baseUrl}/${param}`);
      const data = await res.json();
      setResult(data);
      if (!data.success && data.data?.error) {
        toast({ title: "Aviso", description: data.data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [baseUrl, toast]);

  return { loading, result, search };
}

const TRIBUNAL_OPTIONS = [
  { value: "tjsp", label: "TJSP" }, { value: "tjrj", label: "TJRJ" },
  { value: "tjmg", label: "TJMG" }, { value: "tjrs", label: "TJRS" },
  { value: "tjpr", label: "TJPR" }, { value: "tjsc", label: "TJSC" },
  { value: "tjba", label: "TJBA" }, { value: "tjgo", label: "TJGO" },
  { value: "tjdf", label: "TJDF" }, { value: "tjpe", label: "TJPE" },
  { value: "tjce", label: "TJCE" }, { value: "tjes", label: "TJES" },
  { value: "trt1", label: "TRT1 (RJ)" }, { value: "trt2", label: "TRT2 (SP)" },
  { value: "trt3", label: "TRT3 (MG)" }, { value: "trt4", label: "TRT4 (RS)" },
  { value: "trt5", label: "TRT5 (BA)" }, { value: "trt6", label: "TRT6 (PE)" },
  { value: "trt9", label: "TRT9 (PR)" }, { value: "trt15", label: "TRT15 (Campinas)" },
];

function DataJudTab() {
  const { toast } = useToast();
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedTribunals, setSelectedTribunals] = useState<string[]>(["tjsp", "trt2", "trt15"]);
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);

  const toggleTribunal = (val: string) => {
    setSelectedTribunals(prev => prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]);
  };

  const handleSearch = useCallback(async () => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) { toast({ title: "Digite um CNPJ válido", variant: "destructive" }); return; }
    if (selectedTribunals.length === 0) { toast({ title: "Selecione pelo menos um tribunal", variant: "destructive" }); return; }
    setLoading(true); setResults(null);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/datajud/${digits}?tribunals=${selectedTribunals.join(",")}&size=20`);
      if (!res.ok) { const err = await res.json(); toast({ title: "Erro", description: err.message, variant: "destructive" }); return; }
      const data = await res.json();
      setResults(data);
      toast({ title: data.totalResultados === 0 ? "Nenhum processo encontrado" : `${data.totalResultados} processo(s) encontrado(s)` });
    } catch { toast({ title: "Erro ao consultar DataJud", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [cnpj, selectedTribunals, toast]);

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-5 h-5 text-neutral-700" />
          <h3 className="font-semibold text-neutral-900">Consulta DataJud - CNJ</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">Consulta pública de processos judiciais por CNPJ nos tribunais brasileiros.</p>
        <div className="flex gap-3 mb-4">
          <div className="flex-1"><Input value={cnpj} onChange={(e) => setCnpj(formatCnpjInput(e.target.value))} placeholder="00.000.000/0000-00" className="font-mono" data-testid="input-datajud-cnpj" /></div>
          <Button onClick={handleSearch} disabled={loading || cnpj.replace(/\D/g, "").length !== 14} data-testid="button-datajud-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
        <div className="mb-2">
          <p className="text-xs font-medium text-neutral-600 mb-2">Tribunais:</p>
          <div className="flex flex-wrap gap-1.5">
            {TRIBUNAL_OPTIONS.map(t => (
              <button key={t.value} onClick={() => toggleTribunal(t.value)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selectedTribunals.includes(t.value) ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"}`} data-testid={`button-tribunal-${t.value}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </Card>
      {loading && <Card className="p-8 bg-white border-neutral-200 text-center"><Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-3" /><p className="text-sm text-neutral-500">Consultando {selectedTribunals.length} tribunal(is)...</p></Card>}
      {results && !loading && (
        <Card className="bg-white border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-2"><Gavel className="w-4 h-4 text-neutral-600" /><span className="text-sm font-medium text-neutral-700">Resultados</span></div>
            <Badge variant="secondary" data-testid="badge-total-results">{results.totalResultados} processo(s)</Badge>
          </div>
          {results.totalResultados === 0 ? (
            <div className="p-8 text-center text-neutral-400"><Scale className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Nenhum processo encontrado.</p></div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {results.processos.map((p: any, i: number) => (
                <div key={i} className="hover:bg-neutral-50 transition-colors" data-testid={`row-process-${i}`}>
                  <button className="w-full p-4 text-left flex items-start gap-3" onClick={() => setExpandedProcess(expandedProcess === p.numeroProcesso ? null : p.numeroProcesso)} data-testid={`button-expand-process-${i}`}>
                    <div className="mt-0.5">{expandedProcess === p.numeroProcesso ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-neutral-900" data-testid={`text-process-number-${i}`}>{formatProcessNumber(p.numeroProcesso)}</span>
                        <Badge variant="outline" className="text-xs">{p.tribunal}</Badge>
                        <Badge variant="secondary" className="text-xs">{p.grau}</Badge>
                      </div>
                      <p className="text-xs text-neutral-600 mt-1">{p.classe}</p>
                      {p.assuntos && <p className="text-xs text-neutral-400 mt-0.5">{p.assuntos}</p>}
                    </div>
                    <div className="text-right shrink-0"><p className="text-xs text-neutral-500">{formatDate(p.dataAjuizamento)}</p></div>
                  </button>
                  {expandedProcess === p.numeroProcesso && (
                    <div className="px-4 pb-4 ml-7">
                      <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-neutral-400" /><span className="text-neutral-500">Órgão:</span><span className="text-neutral-800 font-medium">{p.orgaoJulgador || "-"}</span></div>
                          <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-neutral-400" /><span className="text-neutral-500">Atualização:</span><span className="text-neutral-800 font-medium">{formatDate(p.ultimaAtualizacao)}</span></div>
                        </div>
                        {p.movimentos?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Últimas Movimentações</p>
                            <div className="space-y-1.5">
                              {p.movimentos.map((m: any, j: number) => (
                                <div key={j} className="flex items-start gap-2 text-xs bg-white rounded px-3 py-2 border border-neutral-100" data-testid={`text-movement-${i}-${j}`}>
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

  const [notFound, setNotFound] = useState(false);
  const plateInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (clean.length < 7) { toast({ title: "Placa inválida", description: "Digite a placa no formato ABC1D23 (7 caracteres)", variant: "destructive" }); return; }
    setLoading(true); setResult(null); setNotFound(false);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/plate-lookup/${clean}`);
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 404) {
          setNotFound(true);
          toast({ title: "Placa não encontrada", description: err.message, variant: "destructive" });
        } else {
          toast({ title: "Erro", description: err.message, variant: "destructive" });
        }
        return;
      }
      setResult(await res.json());
      toast({ title: "Veículo encontrado" });
    } catch { toast({ title: "Erro ao consultar", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [plate, toast]);

  const handleClear = useCallback(() => {
    setPlate("");
    setResult(null);
    setNotFound(false);
    setTimeout(() => plateInputRef.current?.focus(), 100);
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><Car className="w-5 h-5 text-neutral-700" /><h3 className="font-semibold text-neutral-900">Consulta de Placa</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta dados do veículo pela placa (WD API).</p>
        <div className="flex gap-3">
          <Input ref={plateInputRef} value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); if (notFound) setNotFound(false); }} placeholder="ABC1D23" maxLength={8} className="font-mono font-bold tracking-wider uppercase max-w-xs" data-testid="input-consulta-placa" onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
          <Button onClick={handleSearch} disabled={loading || plate.replace(/[^a-zA-Z0-9]/g, "").length < 7} data-testid="button-consulta-placa">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
          {(result || notFound) && (
            <Button variant="outline" onClick={handleClear} data-testid="button-limpar-placa">
              <X className="w-4 h-4 mr-2" /> Limpar
            </Button>
          )}
        </div>
      </Card>
      {loading && <Card className="p-8 bg-white border-neutral-200 text-center"><Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto" /></Card>}
      {notFound && !loading && (
        <Card className="p-6 bg-white border-neutral-200 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center"><X className="w-6 h-6 text-red-500" /></div>
            <p className="font-semibold text-neutral-900">Placa não encontrada</p>
            <p className="text-sm text-neutral-500">Nenhum dado disponível para a placa <span className="font-mono font-bold">{plate}</span>. Verifique se a placa está correta.</p>
            <Button variant="outline" size="sm" onClick={handleClear} className="mt-2" data-testid="button-tentar-outra">
              Consultar outra placa
            </Button>
          </div>
        </Card>
      )}
      {result && !loading && (
        <Card className="bg-white border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-900 text-white px-4 py-2 rounded-md font-mono font-bold text-lg tracking-widest" data-testid="text-result-plate">{result.plate}</div>
              <div><p className="font-semibold text-neutral-900">{result.brand} {result.model}</p><p className="text-xs text-neutral-500">{result.year || "-"}</p></div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} data-testid="button-nova-consulta">
              <Search className="w-4 h-4 mr-1.5" /> Nova consulta
            </Button>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoField label="Marca" value={result.brand} testId="text-result-brand" />
            <InfoField label="Modelo" value={result.model} testId="text-result-model" />
            <InfoField label="Ano" value={result.year?.toString()} testId="text-result-year" />
            <InfoField label="Cor" value={result.color} testId="text-result-color" />
            <InfoField label="Chassi" value={result.chassi} testId="text-result-chassi" />
            <InfoField label="Combustível" value={result.fuel} testId="text-result-fuel" />
            <InfoField label="Tipo" value={result.type} testId="text-result-type" />
            <InfoField label="Cidade/UF" value={result.city && result.state ? `${result.city}/${result.state}` : "-"} testId="text-result-location" />
          </div>
        </Card>
      )}
    </div>
  );
}

function MultasPRFTab() {
  const [plate, setPlate] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/multas-prf");
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><ShieldAlert className="w-5 h-5 text-red-600" /><h3 className="font-semibold text-neutral-900">Multas PRF</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta multas da Polícia Rodoviária Federal por placa do veículo.</p>
        <div className="flex gap-3">
          <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC1D23" maxLength={8} className="font-mono font-bold uppercase max-w-xs" data-testid="input-multas-placa" onKeyDown={(e) => e.key === "Enter" && search(plate)} />
          <Button onClick={() => search(plate)} disabled={loading || plate.replace(/[^a-zA-Z0-9]/g, "").length < 7} data-testid="button-multas-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="Multas PRF" icon={<ShieldAlert className="w-4 h-4 text-red-600" />} data={result} loading={loading} />
    </div>
  );
}

function CNHTab() {
  const [cpf, setCpf] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/cnh");
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><IdCard className="w-5 h-5 text-blue-600" /><h3 className="font-semibold text-neutral-900">CNH por CPF</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta dados da Carteira Nacional de Habilitação pelo CPF.</p>
        <div className="flex gap-3">
          <Input value={cpf} onChange={(e) => setCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" className="font-mono max-w-xs" data-testid="input-cnh-cpf" onKeyDown={(e) => e.key === "Enter" && search(cpf.replace(/\D/g, ""))} />
          <Button onClick={() => search(cpf.replace(/\D/g, ""))} disabled={loading || cpf.replace(/\D/g, "").length !== 11} data-testid="button-cnh-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="CNH" icon={<IdCard className="w-4 h-4 text-blue-600" />} data={result} loading={loading} />
    </div>
  );
}

function ProcessosTab() {
  const [cpf, setCpf] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/processos");
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><Gavel className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-neutral-900">Ações e Processos</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta ações judiciais e processos por CPF.</p>
        <div className="flex gap-3">
          <Input value={cpf} onChange={(e) => setCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" className="font-mono max-w-xs" data-testid="input-processos-cpf" onKeyDown={(e) => e.key === "Enter" && search(cpf.replace(/\D/g, ""))} />
          <Button onClick={() => search(cpf.replace(/\D/g, ""))} disabled={loading || cpf.replace(/\D/g, "").length !== 11} data-testid="button-processos-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="Processos" icon={<Gavel className="w-4 h-4 text-amber-600" />} data={result} loading={loading} />
    </div>
  );
}

function SPCTab() {
  const [doc, setDoc] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/spc");
  const digits = doc.replace(/\D/g, "");
  const isCpf = digits.length <= 11;
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><CreditCard className="w-5 h-5 text-orange-600" /><h3 className="font-semibold text-neutral-900">SPC + Serasa</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta restrições de crédito no SPC e Serasa por CPF ou CNPJ.</p>
        <div className="flex gap-3">
          <Input value={doc} onChange={(e) => setDoc(isCpf ? formatCpfInput(e.target.value) : formatCnpjInput(e.target.value))} placeholder="CPF ou CNPJ" className="font-mono max-w-xs" data-testid="input-spc-doc" onKeyDown={(e) => e.key === "Enter" && search(digits)} />
          <Button onClick={() => search(digits)} disabled={loading || (digits.length !== 11 && digits.length !== 14)} data-testid="button-spc-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="SPC + Serasa" icon={<CreditCard className="w-4 h-4 text-orange-600" />} data={result} loading={loading} />
    </div>
  );
}

function QuodTab() {
  const [doc, setDoc] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/quod");
  const digits = doc.replace(/\D/g, "");
  const isCpf = digits.length <= 11;
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-green-600" /><h3 className="font-semibold text-neutral-900">Score Quod</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta score de crédito Quod por CPF ou CNPJ.</p>
        <div className="flex gap-3">
          <Input value={doc} onChange={(e) => setDoc(isCpf ? formatCpfInput(e.target.value) : formatCnpjInput(e.target.value))} placeholder="CPF ou CNPJ" className="font-mono max-w-xs" data-testid="input-quod-doc" onKeyDown={(e) => e.key === "Enter" && search(digits)} />
          <Button onClick={() => search(digits)} disabled={loading || (digits.length !== 11 && digits.length !== 14)} data-testid="button-quod-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="Score Quod" icon={<Activity className="w-4 h-4 text-green-600" />} data={result} loading={loading} />
    </div>
  );
}

function ProtestoTab() {
  const [doc, setDoc] = useState("");
  const { loading, result, search } = useConsulta("/api/consulta/protesto");
  const digits = doc.replace(/\D/g, "");
  const isCpf = digits.length <= 11;
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-red-500" /><h3 className="font-semibold text-neutral-900">Protesto Nacional</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Consulta protestos nacionais por CPF ou CNPJ.</p>
        <div className="flex gap-3">
          <Input value={doc} onChange={(e) => setDoc(isCpf ? formatCpfInput(e.target.value) : formatCnpjInput(e.target.value))} placeholder="CPF ou CNPJ" className="font-mono max-w-xs" data-testid="input-protesto-doc" onKeyDown={(e) => e.key === "Enter" && search(digits)} />
          <Button onClick={() => search(digits)} disabled={loading || (digits.length !== 11 && digits.length !== 14)} data-testid="button-protesto-search">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Consultar
          </Button>
        </div>
      </Card>
      <ResultCard title="Protesto Nacional" icon={<AlertTriangle className="w-4 h-4 text-red-500" />} data={result} loading={loading} />
    </div>
  );
}

function NFTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [nfData, setNfData] = useState("");

  const handleEmit = useCallback(async () => {
    if (!nfData.trim()) { toast({ title: "Preencha os dados da NF", variant: "destructive" }); return; }
    setLoading(true); setResult(null);
    try {
      const parsed = JSON.parse(nfData);
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/consulta/emitir-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: data.success ? "NF emitida com sucesso" : "Erro na emissão", variant: data.success ? "default" : "destructive" });
    } catch {
      toast({ title: "JSON inválido. Verifique o formato dos dados.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [nfData, toast]);

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-neutral-200">
        <div className="flex items-center gap-2 mb-4"><Receipt className="w-5 h-5 text-green-700" /><h3 className="font-semibold text-neutral-900">Emissão de Nota Fiscal</h3></div>
        <p className="text-xs text-neutral-500 mb-4">Envie os dados da NF em formato JSON para emissão via API Brasil.</p>
        <Textarea
          value={nfData}
          onChange={(e) => setNfData(e.target.value)}
          placeholder={'{\n  "cnpj_emitente": "00.000.000/0000-00",\n  "nome_destinatario": "...",\n  "itens": [...]\n}'}
          className="font-mono text-xs min-h-[200px] mb-4"
          data-testid="textarea-nf-data"
        />
        <Button onClick={handleEmit} disabled={loading} data-testid="button-emit-nf">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Receipt className="w-4 h-4 mr-2" />} Emitir Nota Fiscal
        </Button>
      </Card>
      <ResultCard title="Nota Fiscal" icon={<Receipt className="w-4 h-4 text-green-700" />} data={result} loading={loading} />
    </div>
  );
}

function LogsTab() {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/api-logs"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/api-logs/stats"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-white border-neutral-200 text-center">
            <p className="text-2xl font-bold text-neutral-900" data-testid="text-stats-total">{stats.total}</p>
            <p className="text-xs text-neutral-500">Total de Consultas</p>
          </Card>
          <Card className="p-4 bg-white border-neutral-200 text-center">
            <p className="text-2xl font-bold text-blue-600" data-testid="text-stats-today">{stats.today}</p>
            <p className="text-xs text-neutral-500">Consultas Hoje</p>
          </Card>
          <Card className="p-4 bg-white border-neutral-200 text-center">
            <p className="text-2xl font-bold text-green-600" data-testid="text-stats-success">{stats.byStatus?.success || 0}</p>
            <p className="text-xs text-neutral-500">Sucesso</p>
          </Card>
          <Card className="p-4 bg-white border-neutral-200 text-center">
            <p className="text-2xl font-bold text-red-600" data-testid="text-stats-errors">{stats.byStatus?.error || 0}</p>
            <p className="text-xs text-neutral-500">Erros</p>
          </Card>
        </div>
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-neutral-600" />
          <span className="text-sm font-medium text-neutral-700">Logs de Consumo da API</span>
          <Badge variant="secondary" className="ml-auto text-xs">{logs.length} registros</Badge>
        </div>
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-neutral-400 mx-auto" /></div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum log registrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-api-logs">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-2.5 font-medium text-neutral-600">Data/Hora</th>
                  <th className="text-left p-2.5 font-medium text-neutral-600">Endpoint</th>
                  <th className="text-left p-2.5 font-medium text-neutral-600">Método</th>
                  <th className="text-left p-2.5 font-medium text-neutral-600">Status</th>
                  <th className="text-left p-2.5 font-medium text-neutral-600">Origem</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l: any) => (
                  <tr key={l.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-log-${l.id}`}>
                    <td className="p-2.5 text-neutral-500 font-mono whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {l.createdAt ? new Date((/[Zz]$/.test(l.createdAt) || /[+-]\d{2}:\d{2}$/.test(l.createdAt)) ? l.createdAt : l.createdAt + "Z").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"}
                    </td>
                    <td className="p-2.5 text-neutral-800 font-mono">{l.endpoint}</td>
                    <td className="p-2.5"><Badge variant="outline" className="text-xs">{l.method}</Badge></td>
                    <td className="p-2.5">
                      <Badge variant={l.responseStatus >= 200 && l.responseStatus < 300 ? "secondary" : "destructive"} className="text-xs">
                        {l.responseStatus || "—"}
                      </Badge>
                    </td>
                    <td className="p-2.5 text-neutral-500">{l.source || "manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoField({ label, value, testId }: { label: string; value?: string; testId: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400 mb-0.5">{label}</p>
      <p className="text-sm text-neutral-800 font-medium" data-testid={testId}>{value || "-"}</p>
    </div>
  );
}

function TestarTodasTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTest = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/consulta/testar-todas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setResult(data);
      toast({
        title: `Teste concluído em ${data.elapsed}`,
        description: `${data.success} OK / ${data.errors} erros de ${data.totalApis} APIs`,
      });
    } catch {
      toast({ title: "Erro ao executar testes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-white border-neutral-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Testar Todas as APIs</h3>
            <p className="text-xs text-neutral-500">Executa uma consulta de teste em cada API simultaneamente</p>
          </div>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Serão testadas 9 APIs: DataJud (CNJ), Multas PRF, Dados Veículo, CNH, Processos, SPC/Serasa, Score Quod, Protesto Nacional e Situação Eleitoral.
          Dados fictícios serão usados para verificar a conectividade.
        </p>
        <Button onClick={handleTest} disabled={loading} className="bg-amber-600 hover:bg-amber-700" data-testid="button-test-all-apis">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
          {loading ? "Testando todas as APIs..." : "Executar Teste Completo"}
        </Button>
      </Card>

      {loading && (
        <Card className="p-8 bg-white border-neutral-200 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-neutral-600 font-medium">Testando 9 APIs simultaneamente...</p>
          <p className="text-xs text-neutral-400 mt-1">Isso pode levar alguns segundos</p>
        </Card>
      )}

      {result && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 bg-white border-neutral-200 text-center">
              <p className="text-2xl font-bold text-neutral-900" data-testid="text-test-total">{result.totalApis}</p>
              <p className="text-xs text-neutral-500">Total APIs</p>
            </Card>
            <Card className="p-4 bg-white border-neutral-200 text-center">
              <p className="text-2xl font-bold text-green-600" data-testid="text-test-success">{result.success}</p>
              <p className="text-xs text-neutral-500">Sucesso</p>
            </Card>
            <Card className="p-4 bg-white border-neutral-200 text-center">
              <p className="text-2xl font-bold text-red-600" data-testid="text-test-errors">{result.errors}</p>
              <p className="text-xs text-neutral-500">Erros</p>
            </Card>
            <Card className="p-4 bg-white border-neutral-200 text-center">
              <p className="text-2xl font-bold text-blue-600" data-testid="text-test-elapsed">{result.elapsed}</p>
              <p className="text-xs text-neutral-500">Tempo</p>
            </Card>
          </div>

          {!result.tokenConfigured && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>APIBRASIL_TOKEN não configurado. As APIs pagas retornarão erro 503 até que o token seja definido.</span>
              </div>
            </Card>
          )}

          <Card className="bg-white border-neutral-200 overflow-hidden">
            <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-neutral-700">Resultado por API</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {Object.entries(result.results).map(([name, r]: [string, any]) => (
                <div key={name} className="flex items-center gap-3 px-4 py-3" data-testid={`row-test-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${r.success ? "bg-green-100" : "bg-red-100"}`}>
                    {r.success ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{name}</p>
                    <p className="text-xs text-neutral-400">
                      Status HTTP: {r.status || "N/A"}
                      {r.error && ` — ${r.error}`}
                      {r.data?.error && typeof r.data.error === "string" && ` — ${r.data.error}`}
                    </p>
                  </div>
                  <Badge variant={r.success ? "secondary" : "destructive"} className="text-xs shrink-0">
                    {r.success ? "OK" : "ERRO"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: "testar", label: "Testar Todas", icon: Zap },
  { id: "datajud", label: "DataJud (CNJ)", icon: Scale },
  { id: "placa", label: "Placa", icon: Car },
  { id: "multas", label: "Multas PRF", icon: ShieldAlert },
  { id: "cnh", label: "CNH", icon: IdCard },
  { id: "processos", label: "Processos", icon: Gavel },
  { id: "spc", label: "SPC/Serasa", icon: CreditCard },
  { id: "quod", label: "Score Quod", icon: Activity },
  { id: "protesto", label: "Protestos", icon: AlertTriangle },
  { id: "nf", label: "Notas Fiscais", icon: Receipt },
  { id: "logs", label: "Logs API", icon: ScrollText },
] as const;

type TabId = typeof TABS[number]["id"];

export default function ConsultasPage() {
  const [activeTab, setActiveTab] = useState<TabId>("testar");

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-consultas-title">Consultas</h1>
        <p className="text-sm text-neutral-500 mt-1">APIs integradas para consulta de dados</p>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? tab.id === "testar" ? "bg-amber-500 text-white shadow-sm" : "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "testar" && <TestarTodasTab />}
      {activeTab === "datajud" && <DataJudTab />}
      {activeTab === "placa" && <PlacaTab />}
      {activeTab === "multas" && <MultasPRFTab />}
      {activeTab === "cnh" && <CNHTab />}
      {activeTab === "processos" && <ProcessosTab />}
      {activeTab === "spc" && <SPCTab />}
      {activeTab === "quod" && <QuodTab />}
      {activeTab === "protesto" && <ProtestoTab />}
      {activeTab === "nf" && <NFTab />}
      {activeTab === "logs" && <LogsTab />}
    </AdminLayout>
  );
}
