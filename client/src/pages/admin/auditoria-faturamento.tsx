import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, AlertTriangle, FileText, CheckCircle2, Clock, DollarSign, RefreshCw, ExternalLink, Receipt } from "lucide-react";

type Row = {
  tipo: "BILLING" | "OS_ESQUECIDA";
  billingId: number | null;
  soId: number | null;
  osNumber: string;
  dataMissao: string;
  clientId: number;
  clientName: string;
  billingCycle: "quinzenal" | "mensal";
  quinzena: string;
  periodoStart: string;
  periodoEnd: string;
  dueBy: string;
  valorOperacional: number | null;
  valorBilling: number;
  valorFatura: number | null;
  statusMedicao: string;
  invoiceId: number | null;
  invoiceStatus: string | null;
  invoiceUrl: string | null;
  asaasPaymentId: string | null;
  nfseStatus: string | null;
  nfseNumber: string | null;
  paymentDate: string | null;
  stage: "PENDENTE" | "APROVADA" | "ENVIADA" | "VENCIDA" | "NF_EMITIDA" | "PAGO" | "CANCELADA" | "FATURADA_LOCAL" | "ESQUECIDA";
  atraso: boolean;
  esquecida: boolean;
  divergenciaPct: number;
};

type Resp = {
  period: { from: string; to: string; today: string };
  totals: {
    totalLinhas: number; totalEsquecidas: number; totalAtrasadas: number;
    totalPagas: number; totalNFEmitidas: number; totalEnviadas: number;
    totalAprovadas: number; totalPendentes: number; totalDivergencia: number;
    valorTotalPeriodo: number; valorPago: number; valorEnviado: number; valorEsquecido: number;
    saudePct: number;
  };
  rows: Row[];
};

const fmt = (n: number | null | undefined) =>
  (Number(n || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return y && m && day ? `${day}/${m}/${y}` : s;
};

const stageStyle = (st: Row["stage"], atraso: boolean) => {
  if (atraso) return { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200", label: "ATRASADA" };
  switch (st) {
    case "PAGO": return { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200", label: "PAGA" };
    case "NF_EMITIDA": return { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-200", label: "NF EMITIDA" };
    case "ENVIADA": return { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-800 dark:text-blue-200", label: "ENVIADA" };
    case "VENCIDA": return { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-200", label: "VENCIDA" };
    case "APROVADA": return { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-800 dark:text-purple-200", label: "APROVADA" };
    case "FATURADA_LOCAL": return { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-800 dark:text-indigo-200", label: "FATURADA (s/ Asaas)" };
    case "PENDENTE": return { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-800 dark:text-yellow-200", label: "PENDENTE" };
    case "ESQUECIDA": return { bg: "bg-red-200 dark:bg-red-900/60", text: "text-red-900 dark:text-red-100", label: "ESQUECIDA" };
    case "CANCELADA": return { bg: "bg-zinc-200 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300", label: "CANCELADA" };
    default: return { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300", label: String(st) };
  }
};

export default function AuditoriaFaturamentoPage() {
  const today = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "atrasadas" | "esquecidas" | "divergentes" | "pendentes" | "pagas">("todas");

  const { data, isLoading, refetch, isFetching } = useQuery<Resp>({
    queryKey: ["/api/auditoria-faturamento", from, to],
    queryFn: async () => {
      const r = await fetch(`/api/auditoria-faturamento?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar auditoria");
      return r.json();
    },
    staleTime: 30000,
  });

  const rows = data?.rows || [];
  const totals = data?.totals;

  const filteredRows = useMemo(() => {
    let out = rows;
    if (filter === "atrasadas") out = out.filter(r => r.atraso);
    else if (filter === "esquecidas") out = out.filter(r => r.esquecida);
    else if (filter === "divergentes") out = out.filter(r => r.divergenciaPct > 5);
    else if (filter === "pendentes") out = out.filter(r => r.stage === "PENDENTE" || r.stage === "APROVADA");
    else if (filter === "pagas") out = out.filter(r => r.stage === "PAGO");
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        (r.osNumber || "").toLowerCase().includes(q) ||
        (r.clientName || "").toLowerCase().includes(q) ||
        (r.invoiceId ? `fat#${r.invoiceId}` : "").includes(q) ||
        (r.asaasPaymentId || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, filter, search]);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="title-auditoria">
              <ShieldCheck className="h-6 w-6 text-violet-600" />
              Auditoria de Ciclo de Faturamento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pente fino do ciclo: medição → aprovação → boleto → NF → pagamento. Atraso, esquecidas e divergências em uma tela só.
            </p>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline" data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Filtros de período + busca */}
        <Card>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-from" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-to" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Filtro rápido</label>
              <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                <SelectTrigger data-testid="select-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="atrasadas">Só atrasadas</SelectItem>
                  <SelectItem value="esquecidas">Só esquecidas (sem boletim)</SelectItem>
                  <SelectItem value="divergentes">Só divergência de valor &gt;5%</SelectItem>
                  <SelectItem value="pendentes">Pendentes / Aprovadas (não viraram boleto)</SelectItem>
                  <SelectItem value="pagas">Só pagas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Buscar</label>
              <Input placeholder="OS, cliente, fat#, asaas..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            </div>
          </CardContent>
        </Card>

        {/* Saúde do faturamento */}
        {totals && (
          <Card className="bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 border-violet-200 dark:border-violet-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="text-sm text-muted-foreground">Saúde do faturamento — período {fmtDate(data?.period.from)} → {fmtDate(data?.period.to)}</div>
                  <div className="text-3xl font-bold text-violet-700 dark:text-violet-300" data-testid="text-saude-pct">
                    {totals.saudePct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmt(totals.valorPago + totals.valorEnviado)} já viraram boleto/NF de {fmt(totals.valorTotalPeriodo)} no período
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {totals.totalEsquecidas > 0 && (
                    <Badge variant="destructive" className="text-sm" data-testid="badge-esquecidas">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {totals.totalEsquecidas} OS esquecida(s) — {fmt(totals.valorEsquecido)} no limbo
                    </Badge>
                  )}
                  {totals.totalAtrasadas > 0 && (
                    <Badge variant="destructive" className="text-sm" data-testid="badge-atrasadas">
                      <Clock className="h-3 w-3 mr-1" /> {totals.totalAtrasadas} OS atrasada(s) (passaram do prazo da quinzena)
                    </Badge>
                  )}
                </div>
              </div>
              <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.min(100, totals.saudePct)}%` }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cards de status */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatusCard label="Pendente" value={totals.totalPendentes} icon={<Clock className="h-4 w-4" />} color="bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200" />
            <StatusCard label="Aprovada" value={totals.totalAprovadas} icon={<CheckCircle2 className="h-4 w-4" />} color="bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200" />
            <StatusCard label="Enviada (boleto)" value={totals.totalEnviadas} icon={<FileText className="h-4 w-4" />} color="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200" />
            <StatusCard label="NF Emitida" value={totals.totalNFEmitidas} icon={<Receipt className="h-4 w-4" />} color="bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" />
            <StatusCard label="Pagas" value={totals.totalPagas} icon={<DollarSign className="h-4 w-4" />} color="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" />
            <StatusCard label="Atrasadas" value={totals.totalAtrasadas} icon={<AlertTriangle className="h-4 w-4" />} color="bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" />
            <StatusCard label="Divergência valor" value={totals.totalDivergencia} icon={<AlertTriangle className="h-4 w-4" />} color="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" />
          </div>
        )}

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Linhas auditadas <span className="text-muted-foreground font-normal">({filteredRows.length} de {rows.length})</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando…</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhuma linha para os filtros atuais.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-2">OS</th>
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2">Cliente</th>
                      <th className="py-2 pr-2">Ciclo</th>
                      <th className="py-2 pr-2 text-right">Valor op.</th>
                      <th className="py-2 pr-2 text-right">Valor faturado</th>
                      <th className="py-2 pr-2">Estágio</th>
                      <th className="py-2 pr-2">Fatura</th>
                      <th className="py-2 pr-2">Pago em</th>
                      <th className="py-2 pr-2">Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => {
                      const st = stageStyle(r.stage, r.atraso);
                      const valor = r.valorBilling || r.valorOperacional || 0;
                      const valorFat = r.valorFatura;
                      const divergent = r.divergenciaPct > 5;
                      return (
                        <tr key={`${r.tipo}-${r.billingId || r.soId || i}`} className="border-b hover:bg-muted/40" data-testid={`row-audit-${r.billingId || r.soId}`}>
                          <td className="py-2 pr-2 font-mono text-xs">
                            {r.soId ? (
                              <Link href={`/admin/laudo/${r.soId}`} className="text-blue-600 hover:underline" data-testid={`link-os-${r.soId}`}>
                                {r.osNumber}
                              </Link>
                            ) : r.osNumber}
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(r.dataMissao)}</td>
                          <td className="py-2 pr-2 max-w-[260px] truncate" title={r.clientName}>{r.clientName}</td>
                          <td className="py-2 pr-2 text-xs">
                            <Badge variant="outline" className="text-[10px]">
                              {r.billingCycle === "quinzenal" ? `Quinz. ${r.quinzena}` : "Mensal"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-2 text-right whitespace-nowrap">{r.valorOperacional ? fmt(r.valorOperacional) : "—"}</td>
                          <td className={`py-2 pr-2 text-right whitespace-nowrap ${divergent ? "text-amber-700 dark:text-amber-300 font-semibold" : ""}`}
                              title={divergent ? `Divergência ${r.divergenciaPct}%` : undefined}>
                            {valorFat != null ? fmt(valorFat) : (valor ? fmt(valor) : "—")}
                            {divergent && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                          </td>
                          <td className="py-2 pr-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${st.bg} ${st.text}`} data-testid={`badge-stage-${r.billingId || r.soId}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {r.invoiceId ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono">FAT #{r.invoiceId}</span>
                                {r.invoiceUrl && (
                                  <a href={r.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-600" data-testid={`link-invoice-${r.invoiceId}`}>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {r.nfseNumber && !String(r.nfseNumber).startsWith("inv_") && (
                                  <span className="ml-1 text-green-700 dark:text-green-300">NF {r.nfseNumber}</span>
                                )}
                              </div>
                            ) : r.esquecida ? (
                              <span className="text-red-600 dark:text-red-400 font-semibold">— sem boletim —</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap text-xs">{r.paymentDate ? fmtDate(r.paymentDate) : "—"}</td>
                          <td className={`py-2 pr-2 whitespace-nowrap text-xs ${r.atraso ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                            até {fmtDate(r.dueBy)}
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

function StatusCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`} data-testid={`card-status-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold opacity-80">{label}</div>
        {icon}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
