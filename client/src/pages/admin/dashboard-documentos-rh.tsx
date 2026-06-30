import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSignature, FileCheck2, FileClock, AlertTriangle, ShieldCheck, Search, Bell, Eye, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

interface DashRow {
  id: number;
  employeeId: number;
  employeeName: string;
  documentType: string;
  documentLabel: string;
  title: string;
  status: string;
  assinaturaStatus: string;
  createdAt: string;
  assinadoEm: string | null;
  reminderCount: number;
  whatsappNotifyStatus: "enviado" | "sem_telefone" | "bloqueado" | "falha" | null;
  whatsappNotifyAt: string | null;
  ageDays: number;
}

const WA_NOTIFY_META: Record<string, { label: string; cls: string; title: string }> = {
  enviado: { label: "WhatsApp enviado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", title: "O aviso saiu pelo WhatsApp." },
  sem_telefone: { label: "Sem telefone", cls: "bg-amber-50 text-amber-700 border-amber-200", title: "Funcionário sem telefone cadastrado — aviso NÃO enviado." },
  bloqueado: { label: "Bloqueado (nº Central)", cls: "bg-red-50 text-red-700 border-red-200", title: "A Central está pareada no número errado — nenhum aviso saiu. Reconecte o número oficial." },
  falha: { label: "Falha no envio", cls: "bg-red-50 text-red-700 border-red-200", title: "A Z-API recusou o envio ou houve erro de rede — aviso NÃO entregue." },
};
interface DashData {
  cards: { emitidosPeriodo: number; assinados: number; pendentes: number; urgentes: number; conformidade: number; totalAll: number; periodDays: number };
  byType: { type: string; label: string; assinados: number; pendentes: number }[];
  rows: DashRow[];
}

function brtDateTime(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); } catch { return d; }
}

export default function DashboardDocumentosRHPage() {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "assinado">("todos");

  const { data, isLoading } = useQuery<DashData>({ queryKey: ["/api/hr/signable-documents/dashboard", days] });

  const reminderMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/signable-documents/${id}/reminder`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/signable-documents/dashboard"] });
      toast({ title: "Lembrete enviado", description: "O funcionário será notificado no app." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const filteredRows = useMemo(() => {
    let rows = data?.rows || [];
    if (statusFilter !== "todos") rows = rows.filter(r => statusFilter === "assinado" ? r.assinaturaStatus === "assinado" : r.assinaturaStatus !== "assinado");
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.employeeName.toLowerCase().includes(q) || r.documentLabel.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
    return rows;
  }, [data, statusFilter, search]);

  const cards = data?.cards;

  const undelivered = useMemo(() => {
    const rows = data?.rows || [];
    return {
      bloqueado: rows.filter(r => r.whatsappNotifyStatus === "bloqueado").length,
      semTelefone: rows.filter(r => r.whatsappNotifyStatus === "sem_telefone").length,
      falha: rows.filter(r => r.whatsappNotifyStatus === "falha").length,
    };
  }, [data]);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-neutral-800 flex items-center gap-2">
              <FileSignature className="w-6 h-6 text-emerald-600" /> Dashboard Gerencial — Documentos RH
            </h1>
            <p className="text-sm text-neutral-500">Emissão, assinatura digital e conformidade de documentos dos colaboradores.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Período:</span>
            {[7, 30, 90].map(d => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)} data-testid={`button-period-${d}`}>{d}d</Button>
            ))}
          </div>
        </div>

        {!isLoading && undelivered.bloqueado > 0 && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-3" data-testid="alert-wa-bloqueado">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-black">A Central de WhatsApp está no número errado — {undelivered.bloqueado} aviso(s) de documento NÃO saíram.</p>
              <p className="text-red-700">O envio está bloqueado porque o chip pareado não é o número oficial da Central. Reconecte o número correto para que os vigilantes voltem a ser avisados.</p>
            </div>
          </div>
        )}
        {!isLoading && (undelivered.semTelefone > 0 || undelivered.falha > 0) && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3" data-testid="alert-wa-naoentregue">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-black">Alguns vigilantes podem não ter sido avisados por WhatsApp.</p>
              <p className="text-amber-700">
                {undelivered.semTelefone > 0 ? `${undelivered.semTelefone} sem telefone cadastrado. ` : ""}
                {undelivered.falha > 0 ? `${undelivered.falha} com falha no envio. ` : ""}
                Veja a coluna "Aviso WhatsApp" na tabela abaixo.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-neutral-400" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card icon={<FileSignature className="w-5 h-5 text-blue-600" />} label={`Emitidos (${cards?.periodDays}d)`} value={cards?.emitidosPeriodo ?? 0} testid="card-emitidos" />
              <Card icon={<FileCheck2 className="w-5 h-5 text-emerald-600" />} label="Assinados" value={cards?.assinados ?? 0} testid="card-assinados" />
              <Card icon={<FileClock className="w-5 h-5 text-amber-600" />} label="Pendentes" value={cards?.pendentes ?? 0} testid="card-pendentes" />
              <Card icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Urgentes (>7d)" value={cards?.urgentes ?? 0} testid="card-urgentes" />
              <Card icon={<ShieldCheck className="w-5 h-5 text-violet-600" />} label="Conformidade" value={`${cards?.conformidade ?? 0}%`} testid="card-conformidade" />
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4">
              <h2 className="text-sm font-black text-neutral-700 mb-3">Status por tipo de documento</h2>
              {(data?.byType || []).length === 0 ? (
                <p className="text-sm text-neutral-400 py-8 text-center">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data?.byType || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="assinados" name="Assinados" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pendentes" name="Pendentes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200">
              <div className="flex items-center gap-2 p-4 border-b border-neutral-100 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input className="pl-9" placeholder="Buscar por funcionário ou documento..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-docs" />
                </div>
                {(["todos", "pendente", "assinado"] as const).map(s => (
                  <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} data-testid={`button-filter-${s}`} className="capitalize">{s}</Button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-dashboard-docs">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Funcionário</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Documento</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Aviso WhatsApp</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Emitido</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Assinado em</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-neutral-400">Nenhum documento encontrado.</td></tr>
                    ) : filteredRows.map(r => {
                      const assinado = r.assinaturaStatus === "assinado";
                      const urgent = !assinado && r.ageDays > 7;
                      return (
                        <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-dashdoc-${r.id}`}>
                          <td className="px-4 py-3 font-medium text-neutral-800">{r.employeeName}</td>
                          <td className="px-4 py-3 text-neutral-600">{r.documentLabel}</td>
                          <td className="px-4 py-3">
                            {assinado ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ASSINADO</span>
                            ) : urgent ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-red-50 text-red-700 border border-red-200">URGENTE · {r.ageDays}d</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200">PENDENTE</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const meta = r.whatsappNotifyStatus ? WA_NOTIFY_META[r.whatsappNotifyStatus] : null;
                              if (!meta) {
                                return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-neutral-100 text-neutral-400 border border-neutral-200" title="Aviso por WhatsApp ainda não processado." data-testid={`wa-status-${r.id}`}>—</span>;
                              }
                              return (
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${meta.cls}`} title={`${meta.title}${r.whatsappNotifyAt ? ` (${brtDateTime(r.whatsappNotifyAt)})` : ""}`} data-testid={`wa-status-${r.id}`}>
                                  {meta.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-500">{brtDateTime(r.createdAt)}</td>
                          <td className="px-4 py-3 text-xs text-neutral-500">{brtDateTime(r.assinadoEm)}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Button size="sm" variant="outline" className="h-8 mr-1" onClick={() => window.open(`/api/signable-documents/${r.id}/pdf`, "_blank")} data-testid={`button-ver-doc-${r.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {!assinado && (
                              <Button size="sm" variant="outline" className="h-8" disabled={reminderMutation.isPending} onClick={() => reminderMutation.mutate(r.id)} data-testid={`button-reminder-${r.id}`}>
                                <Bell className="w-3.5 h-3.5 mr-1" /> Lembrar{r.reminderCount > 0 ? ` (${r.reminderCount})` : ""}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Card({ icon, label, value, testid }: { icon: React.ReactNode; label: string; value: string | number; testid: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-black text-neutral-800">{value}</p>
    </div>
  );
}
