import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer, FileText, Clock, MapPin, Camera, Car, Users, DollarSign, Route } from "lucide-react";
import { formatBRT } from "@/lib/utils";

interface LaudoData {
  geradoEm: string;
  os: {
    id: number;
    numero: string;
    tipo: string;
    status: string;
    prioridade: string;
    descricao: string;
    rota: string | null;
    dataAgendada: string | null;
    dataConclusao: string | null;
    missionStartedAt: string | null;
    statusMissao: string | null;
    escortedDriverName: string | null;
    escortedVehiclePlate: string | null;
    origin: string | null;
    destination: string | null;
    notas: string | null;
  };
  cliente: {
    id: number;
    nome: string;
    cnpj: string | null;
    contato: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
  equipe: {
    agente1: { id: number; nome: string; matricula: string; cargo: string; telefone: string } | null;
    agente2: { id: number; nome: string; matricula: string; cargo: string; telefone: string } | null;
  };
  viatura: {
    id: number;
    placa: string;
    modelo: string;
    marca: string;
    cor: string | null;
    km: number | null;
  } | null;
  km: {
    saida: number | null;
    chegada: number | null;
    final: number | null;
    rodados: number | null;
  };
  cronologia: Array<{
    horario: string;
    tipo: string;
    descricao: string;
    local: string | null;
    fotoUrl: string | null;
  }>;
  evidencias: Array<{
    id: number;
    step: string;
    fotoUrl: string;
    km: number | null;
    notas: string | null;
    horario: string;
  }>;
  posicoes: Array<{
    lat: number;
    lng: number;
    horario: string;
    step: string | null;
  }>;
  custos: {
    itens: Array<{ tipo: string; descricao: string; valor: number }>;
    total: number;
  };
  faturamento: {
    status: string;
    valorTotal: number;
    valorEscolta: number;
  } | null;
  aceites: Array<{
    agenteId: number;
    status: string;
    respondidoEm: string | null;
    motivo: string | null;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  concluida: "Concluída",
  em_andamento: "Em Andamento",
  pendente: "Pendente",
  cancelada: "Cancelada",
};

const STEP_LABELS: Record<string, string> = {
  km_saida: "KM Saída",
  foto_veiculo: "Foto Veículo",
  foto_carga: "Foto Carga",
  foto_documentos: "Foto Documentos",
  km_chegada: "KM Chegada",
  km_final: "KM Final",
  foto_entrega: "Foto Entrega",
  ocorrencia: "Ocorrência",
};

export default function LaudoPage() {
  const params = useParams<{ osId: string }>();
  const [, navigate] = useLocation();
  const osId = params.osId;

  const { data: laudo, isLoading, error } = useQuery<LaudoData>({
    queryKey: ["/api/laudo", osId],
    enabled: !!osId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="laudo-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !laudo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" data-testid="laudo-error">
        <p className="text-destructive">Erro ao carregar laudo</p>
        <Button variant="outline" onClick={() => navigate("/service-orders")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const handlePrint = () => window.print();

  return (
    <div className="max-w-4xl mx-auto p-4 print:p-0 print:max-w-none" data-testid="laudo-container">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Button variant="ghost" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="w-4 h-4 mr-2" /> Imprimir
        </Button>
      </div>

      <div className="space-y-6 print:space-y-4">
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold tracking-tight print:text-xl" data-testid="text-laudo-title">
            TORRES VIGILANCIA PATRIMONIAL
          </h1>
          <p className="text-sm text-muted-foreground mt-1">CNPJ: 36.982.392/0001-89</p>
          <h2 className="text-lg font-semibold mt-3 print:text-base">
            RELATÓRIO DE ENCERRAMENTO DE MISSÃO
          </h2>
          <div className="flex justify-center gap-4 mt-2 text-sm">
            <span className="font-mono font-bold" data-testid="text-os-number">OS: {laudo.os.numero}</span>
            <Badge variant={laudo.os.status === "concluida" ? "default" : "secondary"} data-testid="badge-status">
              {STATUS_LABELS[laudo.os.status] || laudo.os.status}
            </Badge>
          </div>
        </div>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Dados da Operação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div><span className="font-medium">Tipo:</span> {laudo.os.tipo === "escolta" ? "Escolta Armada" : laudo.os.tipo}</div>
              <div><span className="font-medium">Prioridade:</span> {laudo.os.prioridade}</div>
              <div><span className="font-medium">Rota:</span> {laudo.os.rota || "—"}</div>
              <div><span className="font-medium">Origem:</span> {laudo.os.origin || "—"}</div>
              <div><span className="font-medium">Destino:</span> {laudo.os.destination || "—"}</div>
              <div><span className="font-medium">Início:</span> {laudo.os.missionStartedAt ? formatBRT(laudo.os.missionStartedAt) : "—"}</div>
              <div><span className="font-medium">Conclusão:</span> {laudo.os.dataConclusao ? formatBRT(laudo.os.dataConclusao) : "—"}</div>
              <div><span className="font-medium">Motorista Escoltado:</span> {laudo.os.escortedDriverName || "—"}</div>
              <div><span className="font-medium">Placa Escoltado:</span> {laudo.os.escortedVehiclePlate || "—"}</div>
            </div>
            {laudo.os.descricao && (
              <div className="mt-2 text-sm"><span className="font-medium">Descrição:</span> {laudo.os.descricao}</div>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Empresa Contratante
            </CardTitle>
          </CardHeader>
          <CardContent>
            {laudo.cliente ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div><span className="font-medium">Razão Social:</span> {laudo.cliente.nome}</div>
                <div><span className="font-medium">CNPJ:</span> {laudo.cliente.cnpj || "—"}</div>
                <div><span className="font-medium">Contato:</span> {laudo.cliente.contato || "—"}</div>
                <div><span className="font-medium">Telefone:</span> {laudo.cliente.telefone || "—"}</div>
                <div><span className="font-medium">Email:</span> {laudo.cliente.email || "—"}</div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Cliente não vinculado</p>}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Equipe e Viatura
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {laudo.equipe.agente1 && (
                <>
                  <div><span className="font-medium">Agente 1:</span> {laudo.equipe.agente1.nome}</div>
                  <div><span className="font-medium">Matrícula:</span> {laudo.equipe.agente1.matricula}</div>
                </>
              )}
              {laudo.equipe.agente2 && (
                <>
                  <div><span className="font-medium">Agente 2:</span> {laudo.equipe.agente2.nome}</div>
                  <div><span className="font-medium">Matrícula:</span> {laudo.equipe.agente2.matricula}</div>
                </>
              )}
            </div>
            {laudo.viatura && (
              <>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div><span className="font-medium">Viatura:</span> {laudo.viatura.marca} {laudo.viatura.modelo}</div>
                  <div><span className="font-medium">Placa:</span> {laudo.viatura.placa}</div>
                  <div><span className="font-medium">Cor:</span> {laudo.viatura.cor || "—"}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Route className="w-4 h-4" /> Quilometragem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-sm text-center">
              <div>
                <div className="text-muted-foreground">KM Saída</div>
                <div className="text-lg font-bold" data-testid="text-km-saida">{laudo.km.saida ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">KM Chegada</div>
                <div className="text-lg font-bold" data-testid="text-km-chegada">{laudo.km.chegada ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">KM Final</div>
                <div className="text-lg font-bold" data-testid="text-km-final">{laudo.km.final ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">KM Rodados</div>
                <div className="text-lg font-bold text-primary" data-testid="text-km-rodados">{laudo.km.rodados ?? "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {laudo.cronologia.length > 0 && (
          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Cronologia da Operação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-cronologia">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium">Horário</th>
                      <th className="text-left py-2 pr-4 font-medium">Tipo</th>
                      <th className="text-left py-2 pr-4 font-medium">Descrição</th>
                      <th className="text-left py-2 font-medium">Local</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laudo.cronologia.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">{formatBRT(c.horario)}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">{c.tipo}</Badge>
                        </td>
                        <td className="py-2 pr-4">{c.descricao}</td>
                        <td className="py-2 text-muted-foreground">{c.local || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {laudo.evidencias.length > 0 && (
          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="w-4 h-4" /> Evidências Fotográficas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 print:grid-cols-3">
                {laudo.evidencias.map((e) => (
                  <div key={e.id} className="border rounded-lg overflow-hidden" data-testid={`evidence-photo-${e.id}`}>
                    {e.fotoUrl && e.fotoUrl !== "[ajuste-manual]" ? (
                      <img
                        src={e.fotoUrl}
                        alt={STEP_LABELS[e.step] || e.step}
                        className="w-full h-32 object-cover print:h-24"
                      />
                    ) : (
                      <div className="w-full h-32 bg-muted flex items-center justify-center text-xs text-muted-foreground print:h-24">
                        {e.fotoUrl === "[ajuste-manual]" ? "Ajuste Manual" : "Sem foto"}
                      </div>
                    )}
                    <div className="p-2 text-xs">
                      <div className="font-medium">{STEP_LABELS[e.step] || e.step}</div>
                      {e.km && <div className="text-muted-foreground">KM: {e.km}</div>}
                      {e.notas && <div className="text-muted-foreground">{e.notas}</div>}
                      <div className="text-muted-foreground">{formatBRT(e.horario)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {laudo.custos.itens.length > 0 && (
          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Custos da Missão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm" data-testid="table-custos">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Tipo</th>
                    <th className="text-left py-2 font-medium">Descrição</th>
                    <th className="text-right py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {laudo.custos.itens.map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{c.tipo}</td>
                      <td className="py-2">{c.descricao}</td>
                      <td className="py-2 text-right font-mono">R$ {c.valor.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-2" colSpan={2}>Total</td>
                    <td className="py-2 text-right font-mono" data-testid="text-custo-total">R$ {laudo.custos.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {laudo.faturamento && (
          <Card className="print:shadow-none print:border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Faturamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm text-center">
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <Badge variant="outline" data-testid="badge-faturamento-status">{laudo.faturamento.status}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Valor Escolta</div>
                  <div className="text-lg font-bold">R$ {laudo.faturamento.valorEscolta.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Valor Total</div>
                  <div className="text-lg font-bold text-primary" data-testid="text-faturamento-total">R$ {laudo.faturamento.valorTotal.toFixed(2)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="border-t-2 border-black pt-4 mt-8 text-center text-xs text-muted-foreground print:mt-4">
          <p>Documento gerado eletronicamente em {formatBRT(laudo.geradoEm)}</p>
          <p className="mt-1">Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89</p>
          <p className="font-mono mt-2 text-[10px]">ID: {laudo.os.numero}-{laudo.os.id}</p>
        </div>
      </div>
    </div>
  );
}
