import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, ShieldCheck, AlertCircle, Calendar, Eye, Unlock, Lock } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BRL = (v: any) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtDate(d: string | null) {
  if (!d) return "—";
  const iso = d.split("T")[0];
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}

export default function ContratosExperienciaPage() {
  const [evidence, setEvidence] = useState<number | null>(null);
  const [bypass, setBypass] = useState<any | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const isDiretoria = user?.role === "diretoria";

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/probation-contracts/${id}/bypass-revoke`, {});
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/probation-contracts"] });
      toast({ title: "Liberação revogada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const { data: contratos = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/probation-contracts"],
    queryFn: async () => {
      const r = await authFetch("/api/probation-contracts");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30000,
  });

  const pendentes = contratos.filter(c => c.assinaturaStatus !== "assinado");
  const assinados = contratos.filter(c => c.assinaturaStatus === "assinado");

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <FileText className="w-7 h-7 text-indigo-600" /> Contratos de Experiência
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Contratos de 45 dias gerados automaticamente para vigilantes</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SummaryCard title="Total" value={contratos.length} color="text-neutral-800" />
          <SummaryCard title="Pendentes" value={pendentes.length} color="text-amber-700" icon={<AlertCircle className="w-5 h-5" />} />
          <SummaryCard title="Assinados" value={assinados.length} color="text-emerald-700" icon={<ShieldCheck className="w-5 h-5" />} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-neutral-400" /></div>
        ) : contratos.length === 0 ? (
          <Card className="p-8 text-center text-neutral-400">Nenhum contrato emitido ainda</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-xs font-bold text-neutral-500 uppercase">
                  <th className="text-left p-3">Funcionário</th>
                  <th className="text-left p-3">Função</th>
                  <th className="text-center p-3">Início</th>
                  <th className="text-center p-3">Término</th>
                  <th className="text-right p-3">Remuneração</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map(c => (
                  <tr key={c.id} className="border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`row-contrato-${c.id}`}>
                    <td className="p-3">
                      <div className="font-bold text-neutral-800">{c.employee?.name || `#${c.employeeId}`}</div>
                      <div className="text-xs text-neutral-400">Mat. {c.employee?.matricula || "—"}</div>
                    </td>
                    <td className="p-3 text-xs uppercase text-neutral-600">{c.funcao}</td>
                    <td className="p-3 text-center text-xs"><Calendar className="w-3 h-3 inline mr-1" />{fmtDate(c.startDate)}</td>
                    <td className="p-3 text-center text-xs"><Calendar className="w-3 h-3 inline mr-1" />{fmtDate(c.endDate)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">{BRL(c.remuneracao)}</td>
                    <td className="p-3 text-center">
                      {c.assinaturaStatus === "assinado" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200"><ShieldCheck className="w-3 h-3 mr-1" />Assinado</Badge>
                      ) : c.bypassDiretoria ? (
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200" title={`Liberado por ${c.bypassByName || "diretoria"}: ${c.bypassReason || ""}`}>
                          <Unlock className="w-3 h-3 mr-1" />Liberado s/ assinatura
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Pendente — bloqueado</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => window.open(`/api/probation-contracts/${c.id}/pdf`, "_blank")} data-testid={`button-pdf-${c.id}`}>
                          <FileText className="w-3.5 h-3.5 mr-1" /> PDF
                        </Button>
                        {c.assinaturaStatus === "assinado" && (
                          <Button variant="outline" size="sm" onClick={() => setEvidence(c.id)} data-testid={`button-evidence-${c.id}`}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> Evidência
                          </Button>
                        )}
                        {isDiretoria && c.assinaturaStatus !== "assinado" && !c.bypassDiretoria && (
                          <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setBypass(c)} data-testid={`button-bypass-${c.id}`}>
                            <Unlock className="w-3.5 h-3.5 mr-1" /> Liberar
                          </Button>
                        )}
                        {isDiretoria && c.bypassDiretoria && (
                          <Button variant="outline" size="sm" className="border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => { if (confirm("Revogar liberação? O funcionário voltará a ser bloqueado até assinar.")) revokeMutation.mutate(c.id); }} data-testid={`button-revoke-${c.id}`}>
                            <Lock className="w-3.5 h-3.5 mr-1" /> Revogar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {evidence && <EvidenceDialog id={evidence} onClose={() => setEvidence(null)} />}
      {bypass && <BypassDialog contrato={bypass} onClose={() => setBypass(null)} />}
    </AdminLayout>
  );
}

function SummaryCard({ title, value, color, icon }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-400 uppercase font-bold">{title}</p>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
        </div>
        {icon && <div className={color}>{icon}</div>}
      </div>
    </Card>
  );
}

function BypassDialog({ contrato, onClose }: { contrato: any; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/probation-contracts/${contrato.id}/bypass`, { reason });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/probation-contracts"] });
      toast({ title: "Funcionário liberado", description: "Acesso ao app liberado sem assinatura." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Unlock className="w-5 h-5 text-blue-600" /> Liberar sem assinatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            <p className="font-bold mb-1">Atenção — uso excepcional</p>
            <p>Esta ação libera o funcionário <span className="font-bold">{contrato.employee?.name || `#${contrato.employeeId}`}</span> a usar o aplicativo sem assinar o contrato de experiência. Fica registrado quem autorizou e o motivo.</p>
          </div>
          <div>
            <label className="text-xs font-bold text-neutral-700">Motivo da liberação <span className="text-red-500">*</span></label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: contrato físico já assinado em papel, aguardando digitalização"
              rows={3}
              data-testid="input-bypass-reason"
            />
            <p className="text-[10px] text-neutral-400 mt-1">Mínimo 5 caracteres. Este motivo fica auditado.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-bypass">Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 5} className="bg-blue-600 hover:bg-blue-700" data-testid="button-confirm-bypass">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Liberar funcionário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvidenceDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/probation-contracts", id, "signature"],
    queryFn: async () => {
      const r = await authFetch(`/api/probation-contracts/${id}/signature`);
      return await r.json();
    },
  });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Evidência de Assinatura — Contrato #{id}</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-neutral-500">Assinado em:</span> <span className="font-bold">{data.assinadoEm ? new Date(data.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</span></div>
              <div><span className="text-neutral-500">IP:</span> <span className="font-mono text-xs">{data.assinaturaIp || "—"}</span></div>
            </div>
            {data.assinaturaTermo && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs whitespace-pre-line">{data.assinaturaTermo}</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {data.assinaturaFacialFoto && (
                <div>
                  <p className="text-xs font-bold text-neutral-500 mb-1">Captura Facial</p>
                  <img src={data.assinaturaFacialFoto} alt="facial" className="w-full rounded-lg border border-neutral-200" />
                </div>
              )}
              {data.assinaturaDesenho && (
                <div>
                  <p className="text-xs font-bold text-neutral-500 mb-1">Assinatura Digital</p>
                  <img src={data.assinaturaDesenho} alt="assinatura" className="w-full rounded-lg border border-neutral-200 bg-white" />
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
