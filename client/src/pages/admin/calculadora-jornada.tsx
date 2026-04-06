import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calculator, Trash2, Clock, DollarSign, Moon, AlertTriangle } from "lucide-react";

export default function CalculadoraJornadaPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState("");
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [inicioMissao, setInicioMissao] = useState("");
  const [fimMissao, setFimMissao] = useState("");
  const [pctAtivo, setPctAtivo] = useState("100");
  const [salarioBase, setSalarioBase] = useState("");
  const [mesReferencia, setMesReferencia] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const isDiretoria = user?.role === "diretoria";

  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"], enabled: isDiretoria });
  const { data: serviceOrders = [] } = useQuery<any[]>({ queryKey: ["/api/service-orders"], enabled: isDiretoria });
  const { data: calculos = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/jornada-calculos", mesReferencia],
    queryFn: () => apiRequest("GET", `/api/jornada-calculos?mes=${mesReferencia}`).then(r => r.json()),
    enabled: isDiretoria,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/jornada-calculos", body),
    onSuccess: () => {
      toast({ title: "Cálculo salvo com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/jornada-calculos"] });
      setInicioMissao("");
      setFimMissao("");
      setPctAtivo("100");
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jornada-calculos/${id}`),
    onSuccess: () => {
      toast({ title: "Registro removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/jornada-calculos"] });
    },
  });

  if (!isDiretoria) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold" data-testid="text-access-denied">Acesso Negado</h2>
            <p className="text-muted-foreground">Apenas diretoria pode acessar este módulo.</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !inicioMissao || !fimMissao || !salarioBase) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      employee_id: Number(employeeId),
      service_order_id: serviceOrderId && serviceOrderId !== "none" ? Number(serviceOrderId) : null,
      inicio_missao: inicioMissao,
      fim_missao: fimMissao,
      pct_ativo: Number(pctAtivo),
      salario_base: Number(salarioBase),
      mes_referencia: mesReferencia,
    });
  };

  const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtH = (v: any) => Number(v || 0).toFixed(1) + "h";

  const empName = (id: number) => employees.find((e: any) => e.id === id)?.name || `#${id}`;

  const totals = calculos.reduce((acc: any, c: any) => ({
    bruto: acc.bruto + Number(c.total_bruto || 0),
    hAtivo: acc.hAtivo + Number(c.horas_ativo || 0),
    hSobre: acc.hSobre + Number(c.horas_sobreaviso || 0),
    hNot: acc.hNot + Number(c.horas_noturnas || 0),
    hExt: acc.hExt + Number(c.horas_extras || 0),
  }), { bruto: 0, hAtivo: 0, hSobre: 0, hNot: 0, hExt: 0 });

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Calculator className="w-6 h-6" />
          <h1 className="page-title" data-testid="text-page-title">Calculadora de Jornada — Escolta Armada</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="section-subtitle">Novo Cálculo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="form-label">Funcionário *</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="form-label">OS (opcional)</Label>
                <Select value={serviceOrderId} onValueChange={setServiceOrderId}>
                  <SelectTrigger data-testid="select-os"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {serviceOrders.map((os: any) => (
                      <SelectItem key={os.id} value={String(os.id)}>OS #{os.id} - {os.clientName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="form-label">Salário Base (R$) *</Label>
                <Input type="number" step="0.01" value={salarioBase} onChange={e => setSalarioBase(e.target.value)} placeholder="Ex: 2200.00" data-testid="input-salario" />
              </div>

              <div>
                <Label className="form-label">Início Missão *</Label>
                <Input type="datetime-local" value={inicioMissao} onChange={e => setInicioMissao(e.target.value)} data-testid="input-inicio" />
              </div>

              <div>
                <Label className="form-label">Fim Missão *</Label>
                <Input type="datetime-local" value={fimMissao} onChange={e => setFimMissao(e.target.value)} data-testid="input-fim" />
              </div>

              <div>
                <Label className="form-label">% Ativo (restante = sobreaviso)</Label>
                <Input type="number" min="0" max="100" value={pctAtivo} onChange={e => setPctAtivo(e.target.value)} data-testid="input-pct-ativo" />
              </div>

              <div>
                <Label className="form-label">Mês Referência</Label>
                <Input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} data-testid="input-mes-ref" />
              </div>

              <div className="flex items-end">
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-calcular" className="w-full">
                  {createMutation.isPending ? "Calculando..." : "Calcular e Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="helper-text text-muted-foreground">Horas Ativo</p>
              <p className="text-lg font-bold" data-testid="text-total-hativo">{fmtH(totals.hAtivo)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="helper-text text-muted-foreground">Sobreaviso</p>
              <p className="text-lg font-bold" data-testid="text-total-hsobre">{fmtH(totals.hSobre)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Moon className="w-5 h-5 mx-auto mb-1 text-purple-500" />
              <p className="helper-text text-muted-foreground">Noturnas</p>
              <p className="text-lg font-bold" data-testid="text-total-hnot">{fmtH(totals.hNot)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-red-500" />
              <p className="helper-text text-muted-foreground">Extras</p>
              <p className="text-lg font-bold" data-testid="text-total-hext">{fmtH(totals.hExt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <p className="helper-text text-muted-foreground">Total Bruto</p>
              <p className="text-lg font-bold" data-testid="text-total-bruto">{fmt(totals.bruto)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="section-subtitle">Cálculos — {mesReferencia}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : calculos.length === 0 ? (
              <p className="text-muted-foreground" data-testid="text-empty">Nenhum cálculo neste mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-text">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 form-label">Funcionário</th>
                      <th className="p-2 form-label">Início</th>
                      <th className="p-2 form-label">Fim</th>
                      <th className="p-2 form-label text-right">Ativo</th>
                      <th className="p-2 form-label text-right">Sobreaviso</th>
                      <th className="p-2 form-label text-right">Noturnas</th>
                      <th className="p-2 form-label text-right">Extras</th>
                      <th className="p-2 form-label text-right">Total Bruto</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculos.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-muted/50" data-testid={`row-calculo-${c.id}`}>
                        <td className="p-2 font-medium">{empName(c.employee_id)}</td>
                        <td className="p-2 text-muted-foreground">{new Date(c.inicio_missao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                        <td className="p-2 text-muted-foreground">{new Date(c.fim_missao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                        <td className="p-2 text-right">{fmtH(c.horas_ativo)}</td>
                        <td className="p-2 text-right">{fmtH(c.horas_sobreaviso)}</td>
                        <td className="p-2 text-right">{fmtH(c.horas_noturnas)}</td>
                        <td className="p-2 text-right">{fmtH(c.horas_extras)}</td>
                        <td className="p-2 text-right font-bold">{fmt(c.total_bruto)}</td>
                        <td className="p-2">
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-${c.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="section-subtitle">Regras CCT SP 2026</CardTitle>
          </CardHeader>
          <CardContent className="table-text text-muted-foreground space-y-1">
            <p>Hora normal: salário base / 220</p>
            <p>Sobreaviso: hora normal x 1/3</p>
            <p>Hora extra: hora normal x 1,5 (acima de 220h/mês)</p>
            <p>Adicional noturno: +20% entre 22h e 05h (BRT)</p>
            <p>Periculosidade: 30% fixo sobre salário base</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
