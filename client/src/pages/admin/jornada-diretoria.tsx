import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, AlertTriangle, Clock, TrendingUp, Search, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

export default function JornadaDiretoriaPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [mesReferencia, setMesReferencia] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busca, setBusca] = useState("");

  const isDiretoria = user?.role === "diretoria";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/jornada-diretoria", mesReferencia],
    queryFn: () => apiRequest("GET", `/api/jornada-diretoria?mes=${mesReferencia}`).then(r => r.json()),
    enabled: isDiretoria,
  });

  const { data: alertas } = useQuery<any[]>({
    queryKey: ["/api/jornada-diretoria/alertas", mesReferencia],
    queryFn: () => apiRequest("GET", `/api/jornada-diretoria/alertas?mes=${mesReferencia}`).then(r => r.json()),
    enabled: isDiretoria,
  });

  const gerarHoleritesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/jornada-diretoria/gerar-holerites", { mes: mesReferencia }).then(r => r.json()),
    onSuccess: (result: any) => {
      toast({
        title: "Holerites gerados",
        description: `${result.criados} holerites gerados, ${result.existentes} já existiam`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jornada-diretoria"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
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

  const resumo = data?.resumo || [];

  const filtered = useMemo(() => {
    if (!busca.trim()) return resumo;
    const term = busca.toLowerCase();
    return resumo.filter((r: any) => r.employeeName?.toLowerCase().includes(term));
  }, [resumo, busca]);

  const totalAgentes = filtered.length;
  const agentesHoraExtra = filtered.filter((r: any) => r.totalHoras > 220).length;
  const agentesProxLimite = filtered.filter((r: any) => r.totalHoras >= 210 && r.totalHoras <= 220).length;
  const alertasNaoResolvidos = (alertas || []).length;

  const getStatus = (horas: number) => {
    if (horas > 220) return { label: "EXCEDIDO", color: "bg-red-500 text-white" };
    if (horas >= 210) return { label: "ALERTA", color: "bg-amber-500 text-white" };
    return { label: "NORMAL", color: "bg-emerald-500 text-white" };
  };

  const fmtH = (v: any) => {
    const totalMin = Math.round(Number(v || 0) * 60);
    const sign = totalMin < 0 ? "-" : "";
    const m = Math.abs(totalMin);
    return `${sign}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  const exportExcel = () => {
    const rows = filtered.map((r: any) => ({
      Nome: r.employeeName,
      "Total (h)": +Number(r.totalHoras || 0).toFixed(2),
      "Ativas (h)": +Number(r.horasAtivo || 0).toFixed(2),
      "Sobreaviso (h)": +Number(r.horasSobreaviso || 0).toFixed(2),
      "Noturnas (h)": +Number(r.horasNoturno || 0).toFixed(2),
      "Extras (h)": +Number(r.horasExtras || 0).toFixed(2),
      Status: getStatus(r.totalHoras).label,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jornada");
    const [ano, mes] = mesReferencia.split("-");
    XLSX.writeFile(wb, `jornada-${mes}-${ano}.xlsx`);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6" />
            <h1 className="page-title" data-testid="text-page-title">Jornada — Visão Diretoria</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={filtered.length === 0} data-testid="button-export-excel">
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Exportar Excel
            </Button>
            <Button size="sm" onClick={() => gerarHoleritesMutation.mutate()} disabled={gerarHoleritesMutation.isPending || resumo.length === 0} data-testid="button-gerar-holerites">
              {gerarHoleritesMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              Gerar Holerites do Mês
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="form-label">Mês/Ano</Label>
            <Input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} data-testid="input-mes-ref" />
          </div>
          <div>
            <Label className="form-label">Buscar funcionário</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nome do agente..." value={busca} onChange={e => setBusca(e.target.value)} data-testid="input-busca" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="helper-text text-muted-foreground">Total de Agentes</p>
              <p className="text-2xl font-bold" data-testid="text-total-agentes">{totalAgentes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-red-500" />
              <p className="helper-text text-muted-foreground">Com Hora Extra</p>
              <p className="text-2xl font-bold text-red-600" data-testid="text-hora-extra">{agentesHoraExtra}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center relative">
              <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="helper-text text-muted-foreground">Próximos do Limite</p>
              <p className="text-2xl font-bold text-amber-600" data-testid="text-prox-limite">{agentesProxLimite}</p>
              {alertasNaoResolvidos > 0 && (
                <Badge className="absolute top-2 right-2 bg-red-600 text-white text-xs" data-testid="badge-alertas-pendentes">
                  {alertasNaoResolvidos} alerta{alertasNaoResolvidos > 1 ? "s" : ""}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="section-subtitle">Jornada por Funcionário — {mesReferencia}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground" data-testid="text-empty">Nenhum registro encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-text">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 form-label">Nome</th>
                      <th className="p-2 form-label text-right">Total</th>
                      <th className="p-2 form-label text-right">Ativas</th>
                      <th className="p-2 form-label text-right">Sobreaviso</th>
                      <th className="p-2 form-label text-right">Noturnas</th>
                      <th className="p-2 form-label text-right">Extras</th>
                      <th className="p-2 form-label text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any) => {
                      const status = getStatus(r.totalHoras);
                      return (
                        <tr key={r.employeeId} className="border-b hover:bg-muted/50" data-testid={`row-jornada-${r.employeeId}`}>
                          <td className="p-2 font-medium">{r.employeeName}</td>
                          <td className="p-2 text-right font-bold">{fmtH(r.totalHoras)}</td>
                          <td className="p-2 text-right">{fmtH(r.horasAtivo)}</td>
                          <td className="p-2 text-right">{fmtH(r.horasSobreaviso)}</td>
                          <td className="p-2 text-right">{fmtH(r.horasNoturno)}</td>
                          <td className="p-2 text-right">{fmtH(r.horasExtras)}</td>
                          <td className="p-2 text-center">
                            <Badge className={status.color} data-testid={`badge-status-${r.employeeId}`}>{status.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
