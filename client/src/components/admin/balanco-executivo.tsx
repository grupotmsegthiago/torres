import { useMemo } from "react";
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
}) {
  const { cols, labels } = useMemo(() => buildColumns(dailyData, period), [dailyData, period]);

  const lines: DreLine[] = useMemo(() => {
    const fat = cols.map((c) => c.fat);
    const pag = cols.map((c) => c.pag ?? Math.max(0, c.custoReal - (c.combustivel || 0) - (c.pedagio || 0) - (c.manutencao || 0)));
    const rh = cols.map((c) => c.custoRH);
    // Rateia fixos e despesas oficiais do período proporcional ao faturamento do dia (fallback: igual)
    const fatSum = fat.reduce((a, b) => a + b, 0) || cols.length || 1;
    const fixos = cols.map((c) => (totals.custosFixosRateados * c.fat) / fatSum);
    const comb = cols.map((c) => c.combustivel || 0);
    const ped = cols.map((c) => c.pedagio || 0);
    const man = cols.map((c) => c.manutencao || 0);
    // Se não houver breakdown diário de combustível etc., rateia totais do período
    const combSum = comb.reduce((a, b) => a + b, 0);
    const pedSum = ped.reduce((a, b) => a + b, 0);
    const manSum = man.reduce((a, b) => a + b, 0);
    const combVals = combSum > 0 ? comb : cols.map((c) => (totals.desp_combustivel * c.fat) / fatSum);
    const pedVals = pedSum > 0 ? ped : cols.map((c) => (totals.desp_pedagio * c.fat) / fatSum);
    const manVals = manSum > 0 ? man : cols.map((c) => (totals.desp_manutencao * c.fat) / fatSum);
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
      { key: "rh", label: "RH · Folha", color: "#fcd34d", values: rh, total: sum(rh) || totals.provisaoRH, kind: "money", negative: true },
      { key: "fix", label: "Custos Fixos", color: "#a78bfa", values: fixos, total: sum(fixos) || totals.custosFixosRateados, kind: "money", negative: true },
      { key: "custo", label: "Custo Total", color: "#f87171", values: custo, total: sum(custo) || totals.custoTotal, kind: "money", emphasize: true, negative: true },
      { key: "lucro", label: "Lucro Líquido", color: "#60a5fa", values: lucro, total: sum(lucro) || totals.lucro, kind: "money", emphasize: true },
      { key: "margem", label: "Margem %", color: "#22d3ee", values: margem, total: totals.margem, kind: "pct", emphasize: true },
    ];
  }, [cols, totals]);

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Calendar size={14} className="text-cyan-400" /> Balanço Gerencial — DRE do período
          </h4>
          <span className="text-[10px] font-bold text-slate-500 uppercase">{cols.length} colunas</span>
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
                {lines.map((line, idx) => (
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
                    {line.values.map((v, i) => (
                      <td
                        key={`${line.key}-${i}`}
                        className={`text-right font-mono px-2 py-2 ${
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
                        } ${line.emphasize ? "font-black" : "font-semibold"}`}
                      >
                        {line.kind === "pct" ? fmtPct(v) : fmtCompact(v)}
                      </td>
                    ))}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
