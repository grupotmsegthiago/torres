import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, Car, Users, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const fmt = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtPct = (val: number) => `${val.toFixed(1)}%`;

const fmtCompact = (val: number) => {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

export function GaugeRing({
  pct,
  size = 88,
  stroke = 8,
  color,
  label,
  sublabel,
  testId,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color: string;
  label: string;
  sublabel?: string;
  testId?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 100));
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black font-mono text-slate-100">{fmtPct(pct)}</span>
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {sublabel && <span className="text-[10px] font-mono text-slate-500">{sublabel}</span>}
    </div>
  );
}

type DailyRow = {
  date: string;
  fat: number;
  custoReal: number;
  custoRH: number;
  custo: number;
  missions: number;
  combustivel?: number;
  pedagio?: number;
  manutencao?: number;
  pag?: number;
};

type DreLine = {
  key: string;
  label: string;
  color: string;
  values: number[];
  total: number;
  kind: "money" | "pct" | "count";
  emphasize?: boolean;
  negative?: boolean;
};

function buildColumns(daily: DailyRow[], period: string) {
  if (period === "YEAR" || period === "SEMESTER" || period === "QUARTER") {
    const byMonth: Record<string, DailyRow> = {};
    for (const d of daily) {
      const key = d.date.slice(0, 7);
      if (!byMonth[key]) {
        byMonth[key] = { date: key, fat: 0, custoReal: 0, custoRH: 0, custo: 0, missions: 0, combustivel: 0, pedagio: 0, manutencao: 0, pag: 0 };
      }
      const m = byMonth[key];
      m.fat += d.fat;
      m.custoReal += d.custoReal;
      m.custoRH += d.custoRH;
      m.custo += d.custo;
      m.missions += d.missions;
      m.combustivel = (m.combustivel || 0) + (d.combustivel || 0);
      m.pedagio = (m.pedagio || 0) + (d.pedagio || 0);
      m.manutencao = (m.manutencao || 0) + (d.manutencao || 0);
      m.pag = (m.pag || 0) + (d.pag || 0);
    }
    const cols = Object.values(byMonth).sort((a, b) => a.date.localeCompare(b.date));
    const labels = cols.map((c) => {
      const [y, m] = c.date.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    });
    return { cols, labels };
  }

  const cols = daily;
  const labels = cols.map((d) =>
    new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  );
  return { cols, labels };
}

export function BalancoExecutivoPanel({
  dailyData,
  totals,
  period,
  vehicles,
  agents,
  daysInPeriod,
  metaDiariaViatura,
  missions = [],
  periodExpenses = [],
}: {
  dailyData: DailyRow[];
  totals: {
    fat: number;
    pag: number;
    desp_combustivel: number;
    desp_pedagio: number;
    desp_manutencao: number;
    provisaoRH: number;
    custosFixosRateados: number;
    custoTotal: number;
    lucro: number;
    margem: number;
    total: number;
  };
  period: string;
  vehicles: { plate: string; model: string; fat_total: number; pag_total: number; despesas: number; missions: number }[];
  agents: { name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas?: number }[];
  daysInPeriod: number;
  metaDiariaViatura: number;
  missions?: any[];
  periodExpenses?: Array<{
    date?: string;
    amount: number;
    origin_type?: string;
    description?: string;
    entity_name?: string;
    category_name?: string;
  }>;
}) {
  const { cols, labels } = useMemo(() => buildColumns(dailyData, period), [dailyData, period]);
  const [drill, setDrill] = useState<null | { key: string; label: string; date: string; amount: number }>(null);

  const lines: DreLine[] = useMemo(() => {
    const fat = cols.map((c) => c.fat);
    const pag = cols.map((c) => c.pag ?? 0);
    // RH e Fixos: rateio IGUAL por dia do período (não sobe/desce com o faturamento do dia)
    const rhDia = totals.provisaoRH / Math.max(daysInPeriod, 1);
    const fixoDia = totals.custosFixosRateados / Math.max(daysInPeriod, 1);
    const rh = cols.map(() => rhDia);
    const fixos = cols.map(() => fixoDia);
    const combVals = cols.map((c) => c.combustivel || 0);
    const pedVals = cols.map((c) => c.pedagio || 0);
    const manVals = cols.map((c) => c.manutencao || 0);
    const custo = cols.map((_, i) => pag[i] + combVals[i] + pedVals[i] + manVals[i] + rh[i] + fixos[i]);
    const lucro = cols.map((_, i) => fat[i] - custo[i]);
    const margem = cols.map((_, i) => (fat[i] > 0 ? (lucro[i] / fat[i]) * 100 : 0));

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    return [
      { key: "fat", label: "Faturamento Bruto", color: "#34d399", values: fat, total: sum(fat) || totals.fat, kind: "money", emphasize: true },
      { key: "pag", label: "VRP / Agentes", color: "#f87171", values: pag, total: sum(pag) || totals.pag, kind: "money", negative: true },
      { key: "comb", label: "Combustível", color: "#fb923c", values: combVals, total: sum(combVals) || totals.desp_combustivel, kind: "money", negative: true },
      { key: "ped", label: "Pedágio", color: "#fbbf24", values: pedVals, total: sum(pedVals) || totals.desp_pedagio, kind: "money", negative: true },
      { key: "man", label: "Manutenção", color: "#f472b6", values: manVals, total: sum(manVals) || totals.desp_manutencao, kind: "money", negative: true },
      { key: "rh", label: "RH · Folha", color: "#fcd34d", values: rh, total: totals.provisaoRH, kind: "money", negative: true },
      { key: "fix", label: "Custos Fixos", color: "#a78bfa", values: fixos, total: totals.custosFixosRateados, kind: "money", negative: true },
      { key: "custo", label: "Custo Total", color: "#f87171", values: custo, total: sum(custo) || totals.custoTotal, kind: "money", emphasize: true, negative: true },
      { key: "lucro", label: "Lucro Líquido", color: "#60a5fa", values: lucro, total: sum(lucro) || totals.lucro, kind: "money", emphasize: true },
      { key: "margem", label: "Margem %", color: "#22d3ee", values: margem, total: totals.margem, kind: "pct", emphasize: true },
    ];
  }, [cols, totals, daysInPeriod]);

  const drillRows = useMemo(() => {
    if (!drill) return [] as Array<{ label: string; detail?: string; amount: number }>;
    const day = drill.date;
    if (drill.key === "pag") {
      return missions
        .filter((m) => (m.data || "").split("T")[0] === day)
        .map((m) => ({
          label: m.os_number || `OS #${m.service_order_id || m.id}`,
          detail: `${m.vigilante || "—"} · ${m.placa_viatura || "—"} · ${m.client_name || ""}`,
          amount: Number(m.pag_labor ?? m.pag_total) || 0,
        }))
        .filter((r) => r.amount > 0);
    }
    if (drill.key === "comb" || drill.key === "ped" || drill.key === "man") {
      return periodExpenses
        .filter((t) => (t.date || "").split("T")[0] === day)
        .filter((t) => {
          const o = String(t.origin_type || "").toLowerCase();
          const c = String(t.category_name || "").toLowerCase();
          if (drill.key === "comb") {
            return o === "fueling" || o === "vehicle_fueling" || (o === "mission_cost" && c.includes("combust"));
          }
          if (drill.key === "man") {
            return o === "maintenance" || (o === "mission_cost" && c.includes("manut"));
          }
          // pedágio
          return o === "mission_cost" && !c.includes("combust") && !c.includes("manut");
        })
        .map((t) => ({
          label: t.description || t.entity_name || t.category_name || t.origin_type || "Lançamento",
          detail: `${t.origin_type || "?"} · ${t.category_name || "sem categoria"} · ${t.entity_name || ""}`,
          amount: Number(t.amount) || 0,
        }));
    }
    if (drill.key === "fix") {
      return [{
        label: "Rateio igual do mês",
        detail: `Custos fixos do período ÷ ${daysInPeriod} dias = valor constante em cada coluna`,
        amount: totals.custosFixosRateados / Math.max(daysInPeriod, 1),
      }];
    }
    if (drill.key === "rh") {
      return [{
        label: "Folha operacional rateada",
        detail: `RH mensal ÷ ${daysInPeriod} dias (mesmo valor todos os dias)`,
        amount: totals.provisaoRH / Math.max(daysInPeriod, 1),
      }];
    }
    return [];
  }, [drill, missions, periodExpenses, daysInPeriod, totals]);

  const chartData = useMemo(
    () =>
      cols.map((c, i) => ({
        name: labels[i],
        fat: Math.round(c.fat),
        custo: Math.round(lines.find((l) => l.key === "custo")?.values[i] || c.custo),
        lucro: Math.round((lines.find((l) => l.key === "lucro")?.values[i] || 0)),
      })),
    [cols, labels, lines],
  );

  const metaPeriodoViatura = metaDiariaViatura * daysInPeriod;
  const margemColor = totals.margem >= 35 ? "#34d399" : totals.margem >= 25 ? "#fbbf24" : "#f87171";
  const gaugeData = [
    { name: "margem", value: Math.max(0, Math.min(totals.margem, 100)) },
    { name: "rest", value: Math.max(0, 100 - Math.max(0, Math.min(totals.margem, 100))) },
  ];

  return (
    <div className="space-y-4" data-testid="panel-balanco-executivo">
      {/* DRE densa */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 overflow-hidden shadow-xl shadow-black/30">
        <div className="flex flex-col gap-1 px-4 py-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Calendar size={14} className="text-cyan-400" /> Balanço Gerencial — DRE do período
            </h4>
            <span className="text-[10px] font-bold text-slate-500 uppercase">{cols.length} colunas</span>
          </div>
          <p className="text-[10px] text-slate-500">
            Clique em VRP, Combustível ou Pedágio de um dia para ver os lançamentos. Fixos e RH são rateio igual (mês ÷ {daysInPeriod} dias).
          </p>
        </div>
        {cols.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-sm font-bold uppercase">Nenhuma missão no período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[720px]" data-testid="table-dre-balanco">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 uppercase tracking-wide">
                  <th className="text-left font-black px-3 py-2.5 sticky left-0 bg-slate-900 z-10 min-w-[140px]">Conta</th>
                  {labels.map((l) => (
                    <th key={l} className="text-right font-bold px-2 py-2.5 whitespace-nowrap">{l}</th>
                  ))}
                  <th className="text-right font-black px-3 py-2.5 text-cyan-300">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const clickable = ["pag", "comb", "ped", "man", "rh", "fix"].includes(line.key);
                  return (
                  <tr
                    key={line.key}
                    className={`${idx % 2 === 0 ? "bg-slate-950/40" : "bg-slate-900/40"} ${line.emphasize ? "border-y border-slate-700/60" : ""}`}
                    data-testid={`dre-row-${line.key}`}
                  >
                    <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-200">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: line.color }} />
                        {line.label}
                      </span>
                    </td>
                    {line.values.map((v, i) => {
                      const date = cols[i]?.date || "";
                      const cellCls = `text-right font-mono px-2 py-2 ${
                          line.kind === "pct"
                            ? v >= 35
                              ? "text-emerald-400"
                              : v >= 0
                                ? "text-amber-300"
                                : "text-rose-400"
                            : line.negative
                              ? "text-rose-300/90"
                              : v < 0
                                ? "text-rose-400"
                                : "text-slate-200"
                        } ${line.emphasize ? "font-black" : "font-semibold"} ${clickable && v > 0 ? "cursor-pointer hover:bg-slate-700/50 underline decoration-slate-600 underline-offset-2" : ""}`;
                      return clickable && v > 0 ? (
                        <td key={`${line.key}-${i}`} className={cellCls}>
                          <button
                            type="button"
                            className="w-full text-right"
                            onClick={() => setDrill({ key: line.key, label: line.label, date, amount: v })}
                            data-testid={`dre-cell-${line.key}-${date}`}
                          >
                            {line.kind === "pct" ? fmtPct(v) : fmtCompact(v)}
                          </button>
                        </td>
                      ) : (
                        <td key={`${line.key}-${i}`} className={cellCls}>
                          {line.kind === "pct" ? fmtPct(v) : fmtCompact(v)}
                        </td>
                      );
                    })}
                    <td
                      className={`text-right font-mono font-black px-3 py-2 ${
                        line.kind === "pct"
                          ? totals.margem >= 35
                            ? "text-emerald-300"
                            : "text-amber-300"
                          : line.key === "lucro"
                            ? totals.lucro >= 0
                              ? "text-sky-300"
                              : "text-rose-400"
                            : line.key === "fat"
                              ? "text-emerald-300"
                              : "text-slate-100"
                      }`}
                    >
                      {line.kind === "pct" ? fmtPct(line.total) : fmt(line.total)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-700 text-slate-100" data-testid="dialog-dre-drill">
          <DialogHeader>
            <DialogTitle className="text-slate-50">
              {drill?.label} — {drill?.date ? new Date(drill.date + "T12:00").toLocaleDateString("pt-BR") : ""}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Origem dos lançamentos deste dia (fonte ERP). Total célula: {drill ? fmt(drill.amount) : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto space-y-2 text-xs">
            {drillRows.length === 0 ? (
              <p className="text-slate-500 py-6 text-center">Nenhum lançamento detalhado para este dia.</p>
            ) : (
              drillRows.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-700 p-2 flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 truncate">{r.label}</p>
                    {r.detail && <p className="text-slate-500 truncate">{r.detail}</p>}
                  </div>
                  <p className="font-mono font-black text-amber-300 shrink-0">{fmt(r.amount)}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Gráficos inferiores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-3">Faturamento × Custo × Lucro</h4>
          {chartData.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">Sem dados para o gráfico</p>
          ) : (
            <div className="h-[240px]" data-testid="chart-balanco-barras">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(Number(v))} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
                    formatter={(value: number, name: string) => [fmt(value), name === "fat" ? "Faturamento" : name === "custo" ? "Custo" : "Lucro"]}
                  />
                  <Bar dataKey="fat" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="custo" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="lucro" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex gap-4 mt-2 text-[10px] font-bold uppercase text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400" /> Fat</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-400" /> Custo</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-400" /> Lucro</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4 flex flex-col items-center justify-center" data-testid="chart-balanco-margem">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-2 self-start">Margem Líquida</h4>
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  startAngle={210}
                  endAngle={-30}
                  innerRadius="68%"
                  outerRadius="92%"
                  stroke="none"
                >
                  <Cell fill={margemColor} />
                  <Cell fill="rgba(148,163,184,0.12)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <span className="text-3xl font-black font-mono text-slate-50" data-testid="text-gauge-margem">{fmtPct(totals.margem)}</span>
              <span className="text-[10px] font-bold uppercase text-slate-500">meta 35%</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-1">
            Lucro <span className="font-mono font-black text-sky-300">{fmt(totals.lucro)}</span>
            {" · "}
            {totals.total} OS
          </p>
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-3 flex items-center gap-2">
            <Car size={14} className="text-emerald-400" /> Top Viaturas
          </h4>
          {vehicles.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-2.5">
              {vehicles.slice(0, 5).map((v, i) => {
                const metaPct = metaPeriodoViatura > 0 ? (v.fat_total / metaPeriodoViatura) * 100 : 0;
                const ok = metaPct >= 100;
                return (
                  <div key={v.plate} className="space-y-1" data-testid={`top-vehicle-${i}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-slate-600 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-100 flex items-center gap-1.5 truncate">
                          {v.plate}
                          <span className="text-slate-500 font-bold truncate">{v.model}</span>
                          {ok && <Trophy size={12} className="text-emerald-400 shrink-0" />}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{v.missions} missões</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-black font-mono ${ok ? "text-emerald-400" : "text-amber-300"}`}>{fmtPct(metaPct)}</p>
                        <p className="text-[11px] font-bold font-mono text-emerald-300/90">{fmt(v.fat_total)}</p>
                      </div>
                    </div>
                    <div className="ml-8 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-3 flex items-center gap-2">
            <Users size={14} className="text-sky-400" /> Top Agentes
          </h4>
          {agents.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-2.5">
              {agents.slice(0, 5).map((a, i) => {
                const metaPct = metaPeriodoViatura > 0 ? (a.fat_total / metaPeriodoViatura) * 100 : 0;
                const ok = metaPct >= 100;
                return (
                  <div key={a.name} className="space-y-1" data-testid={`top-agent-${i}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-slate-600 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-100 flex items-center gap-1.5 truncate">
                          {a.name}
                          {ok && <Trophy size={12} className="text-emerald-400 shrink-0" />}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{a.missions} missões</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-black font-mono ${ok ? "text-emerald-400" : "text-amber-300"}`}>{fmtPct(metaPct)}</p>
                        <p className="text-[11px] font-bold font-mono text-emerald-300/90">{fmt(a.fat_total)}</p>
                      </div>
                    </div>
                    <div className="ml-8 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
