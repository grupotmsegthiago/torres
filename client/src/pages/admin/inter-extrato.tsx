import AdminLayout from "@/components/admin/layout";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Loader2, RefreshCw, Download, ArrowUpRight, ArrowDownRight,
  Wallet, Calendar, AlertCircle, CheckCircle2, XCircle,
  Clock, TrendingUp, ExternalLink, Info,
} from "lucide-react";

interface InterStatus {
  connected: boolean;
  message?: string;
  ambiente?: string;
  contaCorrente?: string;
  saldo?: number;
  saldoBloqueado?: number;
}

interface Transacao {
  dataEntrada: string;
  tipoTransacao: string;
  tipoOperacao: "C" | "D";
  valor: number;
  titulo?: string;
  descricao?: string;
}

interface InterPagamento {
  id: number;
  tipo: "boleto" | "pix";
  valor: number;
  data_pagamento: string;
  descricao?: string;
  beneficiario_nome?: string;
  pix_destino_nome?: string;
  status: string;
  codigo_transacao_inter?: string;
  created_at: string;
}

const fmtBRL = (n: number | undefined | null) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (s: string) => {
  if (!s) return "—";
  try { return new Date(s + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return s; }
};

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function InterExtratoPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(todayMinus(30));
  const [to, setTo] = useState<string>(today);
  const [tipoFiltro, setTipoFiltro] = useState<"all" | "C" | "D">("all");

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<InterStatus>({
    queryKey: ["/api/inter/status"],
    refetchInterval: 60_000,
  });

  const { data: extrato, isLoading: extratoLoading, refetch: refetchExtrato } = useQuery<{ transacoes: Transacao[] }>({
    queryKey: ["/api/inter/extrato", from, to],
    enabled: !!status?.connected && !!from && !!to,
  });

  const { data: pagamentos = [], refetch: refetchPagamentos } = useQuery<InterPagamento[]>({
    queryKey: ["/api/inter/pagamentos"],
    refetchInterval: 30_000,
  });

  const pendentesAprovacao = useMemo(() => {
    const pendingStatuses = ["PENDENTE", "AGUARDANDO_APROVACAO", "PROCESSANDO"];
    return pagamentos.filter(p => pendingStatuses.includes((p.status || "").toUpperCase()));
  }, [pagamentos]);

  const transacoes = useMemo(() => {
    const list = extrato?.transacoes || [];
    return tipoFiltro === "all" ? list : list.filter(t => t.tipoOperacao === tipoFiltro);
  }, [extrato, tipoFiltro]);

  const totals = useMemo(() => {
    const list = extrato?.transacoes || [];
    let entradas = 0, saidas = 0;
    for (const t of list) {
      const v = Number(t.valor || 0);
      if (t.tipoOperacao === "C") entradas += v;
      else saidas += v;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [extrato]);

  function exportCsv() {
    const rows = [
      ["Data", "Tipo", "Operação", "Valor", "Título", "Descrição"],
      ...transacoes.map(t => [
        fmtData(t.dataEntrada),
        t.tipoTransacao || "",
        t.tipoOperacao === "C" ? "ENTRADA" : "SAÍDA",
        Number(t.valor || 0).toFixed(2).replace(".", ","),
        (t.titulo || "").replace(/\n/g, " "),
        (t.descricao || "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-inter_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Wallet className="w-6 h-6 text-orange-500" />
              Extrato Banco Inter
            </h1>
            <p className="text-sm text-neutral-500">Movimentação bancária da conta integrada com o Banco Inter PJ</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchStatus(); refetchExtrato(); refetchPagamentos(); }} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!transacoes.length} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* Aprovações pendentes de pagamento */}
        {pendentesAprovacao.length > 0 && (
          <Card className="p-4 border-amber-200 bg-amber-50/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-900">
                <Clock className="w-4 h-4" /> Pagamentos aguardando aprovação no IB PJ ({pendentesAprovacao.length})
              </h2>
              <a
                href="https://internetbanking.bancointer.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-700 hover:underline flex items-center gap-1"
                data-testid="link-ib-pj"
              >
                Aprovar no IB PJ <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-xs text-amber-800 mb-3 flex gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Por exigência do Banco Inter, todo pagamento PJ precisa de aprovação manual no app/IB PJ
                (com 2FA do administrador da conta). O sistema apenas envia e acompanha — a liberação final é feita lá.
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px]">Vence</TableHead>
                  <TableHead className="text-right w-[120px]">Valor</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentesAprovacao.map(p => (
                  <TableRow key={p.id} data-testid={`row-pendente-${p.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{p.tipo.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p.beneficiario_nome || p.pix_destino_nome || "—"}</TableCell>
                    <TableCell className="text-sm text-neutral-600">{p.descricao || "—"}</TableCell>
                    <TableCell className="text-xs">{fmtData(p.data_pagamento)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{fmtBRL(p.valor)}</TableCell>
                    <TableCell>
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Aplicação Automática (CDB) */}
        <Card className="p-4 border-blue-200 bg-blue-50/50">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Rendimento automático do saldo (CDB Auto)</h3>
              <p className="text-xs text-blue-800 mb-2">
                O Banco Inter oferece a <strong>Aplicação Automática</strong> que rende seu saldo em CDB com liquidez diária
                (≈ 100% do CDI). A configuração é feita uma única vez no app/IB PJ — o Inter não expõe API pública para
                ativar/desativar isso programaticamente. Uma vez ligado, o saldo da conta corrente acima de um piso definido
                por você é aplicado automaticamente todo dia útil e resgatado quando você precisar pagar algo (ex: este sistema).
              </p>
              <a
                href="https://www.bancointer.com.br/pra-empresa/cdb/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-700 font-medium hover:underline inline-flex items-center gap-1"
                data-testid="link-cdb-info"
              >
                Como ativar a Aplicação Automática <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </Card>

        {/* Cards de status */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500">Status</span>
              {statusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                status?.connected ?
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</Badge> :
                  <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Offline</Badge>}
            </div>
            <div className="text-sm font-mono text-neutral-700" data-testid="text-status-detail">
              {status?.ambiente || "—"} {status?.contaCorrente ? `· Conta ${status.contaCorrente}` : ""}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-neutral-500 mb-1">Saldo disponível</div>
            <div className="text-2xl font-bold text-neutral-900" data-testid="text-saldo-disponivel">
              {fmtBRL(status?.saldo)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-emerald-500" /> Entradas no período
            </div>
            <div className="text-2xl font-bold text-emerald-600" data-testid="text-total-entradas">
              {fmtBRL(totals.entradas)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3 text-red-500" /> Saídas no período
            </div>
            <div className="text-2xl font-bold text-red-600" data-testid="text-total-saidas">
              {fmtBRL(totals.saidas)}
            </div>
          </Card>
        </div>

        {!status?.connected && !statusLoading && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>Inter offline:</strong> {status?.message || "verifique credenciais e certificado mTLS."}
              </div>
            </div>
          </Card>
        )}

        {/* Filtros */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-neutral-600 flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> De</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-from" />
            </div>
            <div>
              <label className="text-xs text-neutral-600 flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Até</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-to" />
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-1">
              {[
                { l: "Hoje", d: 0 },
                { l: "7 dias", d: 7 },
                { l: "30 dias", d: 30 },
                { l: "90 dias", d: 90 },
              ].map(p => (
                <Button key={p.l} variant="outline" size="sm" onClick={() => { setFrom(todayMinus(p.d)); setTo(today); }} data-testid={`button-period-${p.d}`}>
                  {p.l}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button variant={tipoFiltro === "all" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("all")} data-testid="button-filter-all">Todos</Button>
              <Button variant={tipoFiltro === "C" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("C")} className={tipoFiltro === "C" ? "bg-emerald-600 hover:bg-emerald-700" : ""} data-testid="button-filter-credito">Entradas</Button>
              <Button variant={tipoFiltro === "D" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("D")} className={tipoFiltro === "D" ? "bg-red-600 hover:bg-red-700" : ""} data-testid="button-filter-debito">Saídas</Button>
            </div>
          </div>
        </Card>

        {/* Tabela */}
        <Card className="overflow-hidden">
          {extratoLoading ? (
            <div className="p-12 text-center text-neutral-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              Carregando extrato...
            </div>
          ) : transacoes.length === 0 ? (
            <div className="p-12 text-center text-neutral-500" data-testid="text-empty">
              Nenhuma transação no período selecionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right w-[140px]">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transacoes.map((t, i) => (
                  <TableRow key={i} data-testid={`row-tx-${i}`}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtData(t.dataEntrada)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{t.tipoTransacao || "—"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm font-medium">{t.titulo || "—"}</div>
                      {t.descricao && <div className="text-xs text-neutral-500 truncate">{t.descricao}</div>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${t.tipoOperacao === "C" ? "text-emerald-600" : "text-red-600"}`} data-testid={`text-valor-${i}`}>
                      {t.tipoOperacao === "C" ? "+" : "−"} {fmtBRL(t.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
