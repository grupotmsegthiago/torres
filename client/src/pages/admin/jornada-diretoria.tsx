import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Users, AlertTriangle, Clock, TrendingUp, Search } from "lucide-react";

export default function JornadaDiretoriaPage() {
  const { user } = useAuth();

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

  const getStatus = (horas: number) => {
    if (horas > 220) return { label: "EXCEDIDO", color: "bg-red-500 text-white" };
    if (horas >= 210) return { label: "ALERTA", color: "bg-amber-500 text-white" };
    return { label: "NORMAL", color: "bg-emerald-500 text-white" };
  };

  const fmtH = (v: any) => Number(v || 0).toFixed(1) + "h";

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6" />
          <h1 className="page-title" data-testid="text-page-title">Jornada — Visão Diretoria</h1>
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
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="helper-text text-muted-foreground">Próximos do Limite (210-220h)</p>
              <p className="text-2xl font-bold text-amber-600" data-testid="text-prox-limite">{agentesProxLimite}</p>
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
