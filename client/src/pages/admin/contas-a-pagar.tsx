import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, authFetch } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, CreditCard, FileText,
  AlertCircle, CheckCircle2, History, Banknote, Zap, Check, Ban, Hourglass,
} from "lucide-react";

interface FinTx {
  id: string;
  type: string;
  category_name?: string;
  entity_name?: string;
  description: string;
  amount: number;
  due_date: string;
  status?: string;
  origin_type?: string;
  origin_id?: string;
}

interface InterPagamento {
  id: number;
  tipo: "boleto" | "pix";
  codigo_transacao_inter: string;
  valor: number;
  data_pagamento: string;
  descricao?: string;
  status: string;
  created_at: string;
  pix_destino_nome?: string;
  beneficiario_cpf_cnpj?: string;
}

const fmtBRL = (n: number | undefined | null) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (s: string) => { try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return s; } };

export default function ContasAPagarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const [tab, setTab] = useState<"pendentes" | "historico">("pendentes");
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; tx?: FinTx; reason: string }>({ open: false, reason: "" });

  const approveMutation = useMutation({
    mutationFn: async (txId: string) => {
      const r = await authFetch(`/api/financial/transactions/${txId}/aprovar`, { method: "PATCH" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Lançamento aprovado", description: "Já pode ser pago via Inter." });
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-a-pagar"] });
    },
    onError: (e: any) => toast({ title: "Erro ao aprovar", description: e?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (payload: { txId: string; reason: string }) => {
      const r = await authFetch(`/api/financial/transactions/${payload.txId}/recusar`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: payload.reason }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Lançamento recusado", description: "Sumiu da lista de Contas a Pagar." });
      setRejectDialog({ open: false, reason: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-a-pagar"] });
    },
    onError: (e: any) => toast({ title: "Erro ao recusar", description: e?.message, variant: "destructive" }),
  });

  const { data: status } = useQuery<{ connected: boolean; saldo?: number; ambiente?: string; message?: string }>({
    queryKey: ["/api/inter/status"],
    refetchInterval: 60_000,
  });

  const { data: pendentes, isLoading } = useQuery<FinTx[]>({
    queryKey: ["/api/financeiro/contas-a-pagar"],
  });

  const { data: historico } = useQuery<InterPagamento[]>({
    queryKey: ["/api/inter/pagamentos"],
    enabled: tab === "historico" || !!status?.connected,
  });

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Banknote className="w-6 h-6 text-emerald-500" />
              Contas a Pagar
            </h1>
            <p className="text-sm text-neutral-500">
              Despesas pendentes — aprovação e consulta. Pagamentos via Banco Inter desativados.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-neutral-600" data-testid="badge-inter-disabled">
              Inter desativado
            </Badge>
          </div>
        </div>

        <Card className="p-4 border-neutral-200 bg-neutral-50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-neutral-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-neutral-700">
              <strong>Banco Inter desativado:</strong> PIX/boleto pela integração não estão disponíveis.
              Use baixa manual no Financeiro. Histórico Inter local, se existir, permanece na aba Histórico.
              {status?.message ? ` (${status.message})` : ""}
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setTab("pendentes")}
            className={`px-4 py-2 text-sm font-medium ${tab === "pendentes" ? "border-b-2 border-blue-600 text-blue-600" : "text-neutral-500 hover:text-neutral-700"}`}
            data-testid="tab-pendentes"
          >
            <CreditCard className="w-4 h-4 inline mr-1" /> Pendentes
          </button>
          <button
            onClick={() => setTab("historico")}
            className={`px-4 py-2 text-sm font-medium ${tab === "historico" ? "border-b-2 border-blue-600 text-blue-600" : "text-neutral-500 hover:text-neutral-700"}`}
            data-testid="tab-historico"
          >
            <History className="w-4 h-4 inline mr-1" /> Histórico
          </button>
        </div>

        {tab === "pendentes" ? (
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-neutral-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Carregando...</div>
            ) : !pendentes?.length ? (
              <div className="p-12 text-center text-neutral-500" data-testid="text-empty-pendentes">
                Nenhuma despesa pendente. Lance custos no módulo Financeiro para vê-los aqui.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Data</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right w-[140px]">Valor</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[260px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map(tx => {
                    const aguardando = tx.status === "AGUARDANDO_APROVACAO";
                    return (
                      <TableRow
                        key={tx.id}
                        data-testid={`row-tx-${tx.id}`}
                        className={aguardando ? "bg-neutral-50/60 opacity-70" : ""}
                      >
                        <TableCell className={`text-xs ${aguardando ? "text-neutral-500" : ""}`}>{fmtData(tx.due_date)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${aguardando ? "text-neutral-500 border-neutral-300" : ""}`}>{tx.category_name || "—"}</Badge></TableCell>
                        <TableCell className={`text-sm ${aguardando ? "text-neutral-500" : ""}`}>
                          {tx.description}
                          {tx.entity_name && <div className="text-xs text-neutral-400">{tx.entity_name}</div>}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${aguardando ? "text-neutral-500" : "text-red-600"}`}>
                          {fmtBRL(tx.amount)}
                        </TableCell>
                        <TableCell>
                          {aguardando ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs" data-testid={`badge-aguardando-${tx.id}`}>
                              <Hourglass className="w-3 h-3 mr-1" /> Aguardando aprovação
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Aprovado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {aguardando ? (
                            <div className="flex items-center gap-1.5">
                              {isDiretoria ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate(tx.id)}
                                    data-testid={`button-approve-${tx.id}`}
                                    title="Aprovar lançamento"
                                  >
                                    {approveMutation.isPending && approveMutation.variables === tx.id ? (
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3 mr-1" />
                                    )}
                                    Aprovar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                    onClick={() => setRejectDialog({ open: true, tx, reason: "" })}
                                    data-testid={`button-reject-${tx.id}`}
                                    title="Recusar lançamento"
                                  >
                                    <Ban className="w-3 h-3 mr-1" /> Recusar
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-neutral-500 italic" data-testid={`text-pending-info-${tx.id}`}>
                                  Aguarda aprovação da diretoria
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-500 italic" data-testid={`text-pay-disabled-${tx.id}`}>
                              Pagamento Inter indisponível — baixe no Financeiro
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {!historico?.length ? (
              <div className="p-12 text-center text-neutral-500" data-testid="text-empty-historico">
                Nenhum pagamento via Inter ainda.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Data</TableHead>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead>Destino / Descrição</TableHead>
                    <TableHead>Código Inter</TableHead>
                    <TableHead className="text-right w-[120px]">Valor</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map(p => (
                    <TableRow key={p.id} data-testid={`row-pay-${p.id}`}>
                      <TableCell className="text-xs">{fmtData(p.data_pagamento)}</TableCell>
                      <TableCell>
                        {p.tipo === "pix" ?
                          <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs"><Zap className="w-3 h-3 mr-1" />PIX</Badge> :
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><FileText className="w-3 h-3 mr-1" />Boleto</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{p.pix_destino_nome || p.beneficiario_cpf_cnpj || "—"}</div>
                        {p.descricao && <div className="text-xs text-neutral-500">{p.descricao}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-neutral-500 truncate max-w-[180px]">{p.codigo_transacao_inter}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmtBRL(p.valor)}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "APROVADO" ? "default" : "outline"} className={p.status === "APROVADO" ? "bg-emerald-600" : ""}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </div>

      <Dialog
        open={rejectDialog.open}
        onOpenChange={(o) => !o && setRejectDialog({ open: false, reason: "" })}
      >
        <DialogContent className="max-w-md" data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <Ban className="w-4 h-4" /> Recusar lançamento
            </DialogTitle>
            <DialogDescription>
              {rejectDialog.tx && (
                <span className="block text-sm">
                  <strong>{rejectDialog.tx.description}</strong>
                  <br />
                  Valor: <span className="font-mono">{fmtBRL(rejectDialog.tx.amount)}</span>
                  {rejectDialog.tx.entity_name && <> — {rejectDialog.tx.entity_name}</>}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" className="text-xs">Motivo da recusa (obrigatório)</Label>
            <Input
              id="reject-reason"
              placeholder="Ex.: valor divergente, fornecedor não autorizado, NF errada…"
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
              data-testid="input-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, reason: "" })}
              disabled={rejectMutation.isPending}
              data-testid="button-cancel-reject"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectDialog.reason.trim() || rejectMutation.isPending}
              onClick={() => rejectDialog.tx && rejectMutation.mutate({ txId: rejectDialog.tx.id, reason: rejectDialog.reason.trim() })}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Ban className="w-4 h-4 mr-1" />}
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
