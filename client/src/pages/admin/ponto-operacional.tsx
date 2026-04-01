import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Clock, Users, AlertTriangle, TrendingUp, ChevronDown, ChevronRight, Trash2, Timer, Plane } from "lucide-react";

function formatDateBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(entradaISO: string) {
  const ms = Date.now() - new Date(entradaISO).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h${String(m).padStart(2, "0")}`;
  }
  return `${h}h${String(m).padStart(2, "0")}`;
}

function getMesOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export default function PontoOperacionalPage() {
  const { toast } = useToast();
  const mesOptions = getMesOptions();
  const [mes, setMes] = useState(mesOptions[0].value);
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/ponto-operacional/resumo-mensal", mes],
    queryFn: () => fetch(`/api/ponto-operacional/resumo-mensal?mes=${mes}`, { credentials: "include" }).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ponto-operacional/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ponto-operacional/resumo-mensal"] }); toast({ title: "Registro excluído" }); },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const resumo = data?.resumo || [];
  const totalAgentes = resumo.length;
  const agentesEmViagem = resumo.filter((r: any) => r.pontoAberto).length;
  const agentesAlerta = resumo.filter((r: any) => r.status === "alerta").length;
  const agentesHoraExtra = resumo.filter((r: any) => r.status === "hora_extra").length;
  const custoExtraTotal = resumo.reduce((acc: number, r: any) => acc + r.custoHoraExtra, 0);

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="admin-ponto-operacional">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="text-page-title">Ponto Operacional</h1>
            <p className="text-sm text-neutral-500 mt-1">Controle de jornada de longa duração</p>
          </div>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            data-testid="select-mes"
          >
            {mesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-neutral-200 p-4" data-testid="card-total-agentes">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-neutral-400" />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Agentes</span>
            </div>
            <p className="text-2xl font-black text-neutral-900">{totalAgentes}</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4" data-testid="card-em-viagem">
            <div className="flex items-center gap-2 mb-2">
              <Plane className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Em Viagem</span>
            </div>
            <p className="text-2xl font-black text-blue-600">{agentesEmViagem}</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4" data-testid="card-alerta">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Próx. Limite</span>
            </div>
            <p className="text-2xl font-black text-amber-600">{agentesAlerta}</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4" data-testid="card-hora-extra">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-red-500" />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Hora Extra</span>
            </div>
            <p className="text-2xl font-black text-red-600">{agentesHoraExtra}</p>
            {custoExtraTotal > 0 && (
              <p className="text-[10px] text-red-500 mt-1">R$ {custoExtraTotal.toFixed(2)}</p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <p className="text-sm text-neutral-400">Carregando dados...</p>
          </div>
        ) : resumo.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <Clock className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-500">Nenhum registro neste mês</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resumo.map((r: any) => {
              const isExpanded = expandedEmployee === r.employeeId;
              const pct = Math.min(100, (r.totalHoras / r.limiteHoras) * 100);
              const barColor = r.status === "hora_extra" ? "bg-red-500" : r.status === "alerta" ? "bg-amber-500" : "bg-emerald-500";
              const statusBadge = r.status === "hora_extra"
                ? { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "HORA EXTRA" }
                : r.status === "alerta"
                ? { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "PRÓXIMO LIMITE" }
                : { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "NORMAL" };

              return (
                <div key={r.employeeId} className="bg-white rounded-xl border border-neutral-200 overflow-hidden" data-testid={`card-employee-${r.employeeId}`}>
                  <button
                    onClick={() => setExpandedEmployee(isExpanded ? null : r.employeeId)}
                    className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-50 transition-colors"
                    data-testid={`button-expand-${r.employeeId}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-neutral-900 truncate">{r.employeeName}</p>
                        {r.pontoAberto && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
                            <Plane className="w-3 h-3" />
                            EM VIAGEM — {formatElapsed(r.pontoAberto.entrada)}
                          </span>
                        )}
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex-1">
                          <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <p className="text-sm font-bold text-neutral-700 tabular-nums whitespace-nowrap">
                          {r.totalHoras.toFixed(1)}h <span className="text-neutral-300 font-normal">/ {r.limiteHoras}h</span>
                        </p>
                      </div>
                      {r.horasExtras > 0 && (
                        <p className="text-[10px] text-red-600 font-medium mt-1">
                          +{r.horasExtras.toFixed(1)}h extras • Custo: R$ {r.custoHoraExtra.toFixed(2)} (50% folha: R$ {r.bonusFuncionario.toFixed(2)} | 50% empresa: R$ {r.custoEmpresa.toFixed(2)})
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-neutral-300 shrink-0" /> : <ChevronRight className="w-5 h-5 text-neutral-300 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-neutral-100">
                      <div className="px-4 py-2 bg-neutral-50 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Registros do Mês ({r.jornadasConcluidas} jornadas)</p>
                      </div>
                      {r.registros.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <p className="text-xs text-neutral-400">Nenhum registro neste período</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                          {r.registros.map((reg: any) => (
                            <div key={reg.id} className="px-4 py-3 flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${reg.status === "aberto" ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-neutral-700">
                                  {formatDateBR(reg.entrada)}
                                  {reg.saida ? ` → ${formatDateBR(reg.saida)}` : " — em aberto"}
                                </p>
                                {reg.observacao && <p className="text-[10px] text-neutral-400 truncate">{reg.observacao}</p>}
                              </div>
                              <div className="text-right shrink-0 flex items-center gap-2">
                                <p className="text-xs font-bold text-neutral-900">
                                  {reg.status === "aberto" ? formatElapsed(reg.entrada) : `${Number(reg.horas_decimal).toFixed(1)}h`}
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (confirm("Excluir este registro?")) deleteMutation.mutate(reg.id); }}
                                  className="p-1 hover:bg-red-50 rounded text-neutral-300 hover:text-red-500 transition-colors"
                                  data-testid={`button-delete-${reg.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
