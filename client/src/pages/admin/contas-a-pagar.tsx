import AdminLayout from "@/components/admin/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, RefreshCw, CreditCard, Send, FileText, Calendar,
  AlertCircle, CheckCircle2, History, Banknote, Zap,
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
  const [tab, setTab] = useState<"pendentes" | "historico">("pendentes");
  const [payDialog, setPayDialog] = useState<{ open: boolean; tx?: FinTx }>({ open: false });

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
            <p className="text-sm text-neutral-500">Pague boletos e PIX direto pelo Banco Inter, com baixa automática</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-neutral-500">Saldo Inter</div>
              <div className="text-lg font-bold text-emerald-600" data-testid="text-saldo">{fmtBRL(status?.saldo)}</div>
            </div>
            {status?.connected ?
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {status.ambiente}
              </Badge> :
              <Badge variant="destructive">Offline</Badge>}
          </div>
        </div>

        {!status?.connected && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>Inter offline:</strong> {status?.message || "configure credenciais para liberar pagamentos."}
              </div>
            </div>
          </Card>
        )}

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
                    <TableHead className="w-[180px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map(tx => (
                    <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                      <TableCell className="text-xs">{fmtData(tx.due_date)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{tx.category_name || "—"}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {tx.description}
                        {tx.entity_name && <div className="text-xs text-neutral-500">{tx.entity_name}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-red-600">{fmtBRL(tx.amount)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!status?.connected}
                          onClick={() => setPayDialog({ open: true, tx })}
                          data-testid={`button-pay-${tx.id}`}
                        >
                          <Send className="w-3 h-3 mr-1" /> Pagar via Inter
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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

      {payDialog.open && payDialog.tx && (
        <PayDialog
          tx={payDialog.tx}
          onClose={() => setPayDialog({ open: false })}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/inter/pagamentos"] });
            queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-a-pagar"] });
            queryClient.invalidateQueries({ queryKey: ["/api/inter/status"] });
            toast({ title: "Pagamento enviado!", description: "Acompanhe o status na aba Histórico." });
            setPayDialog({ open: false });
          }}
        />
      )}
    </AdminLayout>
  );
}

function PayDialog({ tx, onClose, onSuccess }: { tx: FinTx; onClose: () => void; onSuccess: () => void }) {
  const [metodo, setMetodo] = useState<"pix" | "boleto">("pix");
  // PIX
  const [pixChave, setPixChave] = useState("");
  const [pixNome, setPixNome] = useState("");
  const [pixCpfCnpj, setPixCpfCnpj] = useState("");
  // Boleto
  const [codBarras, setCodBarras] = useState("");
  const [boletoCpfCnpj, setBoletoCpfCnpj] = useState("");
  const [vencBoleto, setVencBoleto] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState(tx.description || "");

  const mPix = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/inter/pix", {
      valor: Number(tx.amount),
      descricao,
      destinatario: { tipo: "CHAVE", chave: pixChave, nome: pixNome, cpfCnpj: pixCpfCnpj },
    }),
    onSuccess,
  });

  const mBoleto = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/inter/pagamento/boleto", {
      codBarraLinhaDigitavel: codBarras.replace(/\D/g, ""),
      valorPagar: Number(tx.amount),
      dataPagamento: new Date().toISOString().slice(0, 10),
      dataVencimento: vencBoleto,
      cpfCnpjBeneficiario: boletoCpfCnpj.replace(/\D/g, ""),
    }),
    onSuccess,
  });

  const isLoading = mPix.isPending || mBoleto.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar via Banco Inter</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-bold text-red-600">{fmtBRL(tx.amount)}</span>{" — "}
            {tx.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Método</Label>
            <Select value={metodo} onValueChange={(v: any) => setMetodo(v)}>
              <SelectTrigger data-testid="select-metodo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX (instantâneo)</SelectItem>
                <SelectItem value="boleto">Boleto bancário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {metodo === "pix" ? (
            <>
              <div>
                <Label className="text-xs">Chave PIX</Label>
                <Input value={pixChave} onChange={e => setPixChave(e.target.value)} placeholder="CPF/CNPJ/email/telefone/aleatória" data-testid="input-pix-chave" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Nome destinatário</Label>
                  <Input value={pixNome} onChange={e => setPixNome(e.target.value)} data-testid="input-pix-nome" />
                </div>
                <div>
                  <Label className="text-xs">CPF/CNPJ destinatário</Label>
                  <Input value={pixCpfCnpj} onChange={e => setPixCpfCnpj(e.target.value)} data-testid="input-pix-cpfcnpj" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs">Linha digitável (47 dígitos)</Label>
                <Input value={codBarras} onChange={e => setCodBarras(e.target.value)} placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000" data-testid="input-cod-barras" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">CNPJ beneficiário</Label>
                  <Input value={boletoCpfCnpj} onChange={e => setBoletoCpfCnpj(e.target.value)} data-testid="input-boleto-cnpj" />
                </div>
                <div>
                  <Label className="text-xs">Vencimento</Label>
                  <Input type="date" value={vencBoleto} onChange={e => setVencBoleto(e.target.value)} data-testid="input-venc" />
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} data-testid="input-descricao" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading} data-testid="button-cancel">Cancelar</Button>
          <Button
            onClick={() => (metodo === "pix" ? mPix.mutate() : mBoleto.mutate())}
            disabled={isLoading || (metodo === "pix" ? !pixChave : !codBarras)}
            data-testid="button-confirm-pay"
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
