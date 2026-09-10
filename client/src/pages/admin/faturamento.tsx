import { useMemo, useState, Fragment } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { authFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, RefreshCw,
  Circle, FileSpreadsheet,
} from "lucide-react";

type Semaforo = "verde" | "amarelo" | "vermelho";
type RowStatus = "FALTA_OS" | "SEM_APROVACAO" | "A_FATURAR" | "EM_ABERTO" | "ATRASADO" | "PAGO" | "CICLO_ABERTO";

type OsItem = {
  id: number;
  osNumber: string;
  date: string;
  status: string;
  billingStatus: string | null;
  ready: boolean;
  invoiced: boolean;
  paid: boolean;
  valor: number;
};

type Row = {
  clientId: number;
  clientName: string;
  cycle: string;
  cycleLabel: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  dueBy: string;
  osTotal: number;
  osReady: number;
  osFaturadas: number;
  osPagas: number;
  osFaltando: number;
  osSemAprovacao: number;
  valorTotal: number;
  valorAberto: number;
  valorPago: number;
  dataFaturamento: string | null;
  dataPagamento: string | null;
  diasAtraso: number | null;
  status: RowStatus;
  semaforo: Semaforo;
  os: OsItem[];
};

type Resp = {
  fonte: string;
  period: { from: string; to: string; today: string };
  kpis: {
    semaforo: Semaforo;
    osSemFaturar: number;
    osSemAprovacao: number;
    ciclosAtrasados: number;
    valorAberto: number;
    valorPago: number;
    diasAtrasoMedio: number | null;
    alertasAbertos: number;
  };
  rows: Row[];
  alertas: Array<{ id: number | string; clientName: string; alertType: string; message: string }>;
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}` : d;
};

const STATUS_LABEL: Record<RowStatus, string> = {
  FALTA_OS: "OS fora",
  SEM_APROVACAO: "Sem aprovação",
  A_FATURAR: "A faturar",
  EM_ABERTO: "Em aberto",
  ATRASADO: "Atrasado",
  PAGO: "Pago",
  CICLO_ABERTO: "Ciclo aberto",
};

const DOT: Record<Semaforo, string> = {
  vermelho: "text-red-500 fill-red-500",
  amarelo: "text-amber-400 fill-amber-400",
  verde: "text-emerald-500 fill-emerald-500",
};

const ROW_BG: Record<Semaforo, string> = {
  vermelho: "bg-red-50/80 hover:bg-red-50",
  amarelo: "bg-amber-50/50 hover:bg-amber-50",
  verde: "bg-white hover:bg-neutral-50",
};

export default function FaturamentoDiretoriaPage() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [filtro, setFiltro] = useState<"todos" | "problema" | "aberto" | "pago">("problema");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<Resp>({
    queryKey: ["/api/controle-faturamento", from, to],
    queryFn: async () => {
      const r = await authFetch(`/api/controle-faturamento?from=${from}&to=${to}`);
      if (!r.ok) throw new Error("Falha ao carregar faturamento");
      return r.json();
    },
    staleTime: 30_000,
  });

  const kpis = data?.kpis;
  const rows = data?.rows || [];
  const filtered = useMemo(() => {
    if (filtro === "problema") return rows.filter((r) => r.semaforo !== "verde");
    if (filtro === "aberto") return rows.filter((r) => r.status === "EM_ABERTO" || r.status === "ATRASADO" || r.status === "A_FATURAR");
    if (filtro === "pago") return rows.filter((r) => r.status === "PAGO");
    return rows;
  }, [rows, filtro]);

  const hero = kpis?.semaforo || "verde";
  const heroCopy =
    hero === "vermelho" ? "Tem OS sem faturar ou ciclo atrasado"
    : hero === "amarelo" ? "Há ciclo em aberto ou aguardando pagamento"
    : "Tudo faturado e em dia";

  return (
    <AdminLayout>
      <div className="p-5 space-y-4 max-w-[1400px]">
        <div className={`rounded-2xl border px-5 py-4 flex flex-wrap items-center justify-between gap-4 ${
          hero === "vermelho" ? "bg-red-600 text-white border-red-700"
          : hero === "amarelo" ? "bg-amber-400 text-neutral-900 border-amber-500"
          : "bg-emerald-600 text-white border-emerald-700"
        }`}>
          <div className="flex items-center gap-3">
            {hero === "verde" ? <CheckCircle2 className="w-9 h-9" /> : <AlertTriangle className="w-9 h-9" />}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">Diretoria · Faturamento</div>
              <div className="text-2xl font-black leading-tight" data-testid="text-semaforo">
                {hero === "vermelho" ? "CRÍTICO" : hero === "amarelo" ? "ATENÇÃO" : "OK"}
              </div>
              <div className="text-sm font-medium opacity-90">{heroCopy}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px] bg-white/90 text-neutral-900" data-testid="input-from" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px] bg-white/90 text-neutral-900" data-testid="input-to" />
            <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi n={kpis.osSemFaturar} label="OS sem fatura" danger={kpis.osSemFaturar > 0} />
            <Kpi n={kpis.osSemAprovacao} label="Sem aprovação" danger={kpis.osSemAprovacao > 0} />
            <Kpi n={kpis.ciclosAtrasados} label="Ciclos atrasados" danger={kpis.ciclosAtrasados > 0} />
            <Kpi n={fmt(kpis.valorAberto)} label="Em aberto" />
            <Kpi n={fmt(kpis.valorPago)} label="Pago" ok />
            <Kpi n={kpis.diasAtrasoMedio != null ? `${kpis.diasAtrasoMedio}d` : "—"} label="Atraso médio" danger={!!kpis.diasAtrasoMedio} />
          </div>
        )}

        {!!data?.alertas?.length && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1" data-testid="panel-alertas">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Alertas Financeiro</div>
            {data.alertas.slice(0, 6).map((a) => (
              <div key={String(a.id)} className="text-sm text-amber-950 flex gap-2">
                <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                <span><b>{a.clientName}</b> — {a.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(["problema", "aberto", "pago", "todos"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                filtro === f ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-600 border-neutral-200"
              }`}
              data-testid={`filter-${f}`}
            >
              {f === "problema" ? "O que está errado" : f === "aberto" ? "Em aberto" : f === "pago" ? "Pago" : "Tudo"}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-400">{filtered.length} ciclo(s)</span>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b bg-neutral-50">
                  <th className="text-left py-2 px-3 w-8" />
                  <th className="text-left py-2 px-2">Cliente</th>
                  <th className="text-left py-2 px-2">Período</th>
                  <th className="text-left py-2 px-2">Ciclo</th>
                  <th className="text-center py-2 px-2">OS</th>
                  <th className="text-left py-2 px-2">Faturamento</th>
                  <th className="text-left py-2 px-2">Pagamento</th>
                  <th className="text-center py-2 px-2">Dias</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="py-10 text-center text-neutral-400">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-emerald-700 font-semibold">Nada fora do lugar neste filtro.</td></tr>
                ) : filtered.map((r) => {
                  const key = `${r.clientId}|${r.periodStart}|${r.periodEnd}`;
                  const open = expanded === key;
                  const cobertura = `${r.osFaturadas}/${r.osTotal}`;
                  const coberturaOk = r.osFaturadas === r.osTotal;
                  return (
                    <Fragment key={key}>
                      <tr
                        key={key}
                        className={`border-b cursor-pointer ${ROW_BG[r.semaforo]}`}
                        onClick={() => setExpanded(open ? null : key)}
                        data-testid={`row-ciclo-${r.clientId}-${r.periodStart}`}
                      >
                        <td className="px-3 py-2.5">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-2 py-2.5 font-semibold max-w-[220px] truncate">{r.clientName}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{r.periodLabel}</td>
                        <td className="px-2 py-2.5 text-xs">{r.cycleLabel}</td>
                        <td className={`px-2 py-2.5 text-center font-mono font-bold ${coberturaOk ? "text-emerald-700" : "text-red-700"}`}>
                          {cobertura}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(r.dataFaturamento)}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(r.dataPagamento)}</td>
                        <td className={`px-2 py-2.5 text-center font-bold ${r.diasAtraso ? "text-red-700" : "text-neutral-400"}`}>
                          {r.diasAtraso ? r.diasAtraso : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                            <Circle className={`w-3 h-3 ${DOT[r.semaforo]}`} />
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${key}-os`} className="bg-neutral-50">
                          <td colSpan={9} className="px-6 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                OS do ciclo · {fmt(r.valorTotal)}
                              </div>
                              <Link href="/admin/boletim-medicao">
                                <span className="text-xs font-bold text-blue-700 hover:underline">Abrir boletim</span>
                              </Link>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                              {r.os.map((o) => (
                                <Link key={o.id} href={`/admin/laudo/${o.id}`}>
                                  <span className={`flex items-center justify-between gap-2 text-xs px-2 py-1 rounded ${
                                    o.paid ? "text-emerald-800"
                                    : o.invoiced ? "text-amber-800"
                                    : o.ready ? "text-blue-800"
                                    : "text-red-800 bg-red-100"
                                  }`}>
                                    <span className="font-mono font-bold">{o.osNumber}</span>
                                    <span>{fmtDate(o.date)}</span>
                                    <span className="font-semibold">{o.paid ? "PAGO" : o.invoiced ? "FATURADA" : o.ready ? "APROVADA" : (o.billingStatus || "SEM BILLING")}</span>
                                    <span>{fmt(o.valor)}</span>
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-neutral-400 flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" />
          Fonte: OS + billing oficial + fatura. Recusada não entra. Quinzenal 1–15 / 16–fim · Mensal 1–último dia · Diário = o dia.
        </p>
      </div>
    </AdminLayout>
  );
}

function Kpi({ n, label, danger, ok }: { n: number | string; label: string; danger?: boolean; ok?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${danger ? "border-red-200 bg-red-50" : ok ? "border-emerald-200 bg-emerald-50" : "border-neutral-200 bg-white"}`}>
      <div className={`text-2xl font-black tabular-nums ${danger ? "text-red-700" : ok ? "text-emerald-700" : "text-neutral-900"}`} data-testid={`kpi-${label}`}>
        {n}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-0.5">{label}</div>
    </div>
  );
}
