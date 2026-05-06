import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users, Filter, ChevronDown, ChevronRight, Download, Calendar, BarChart3, Loader2 } from "lucide-react";
import AdminLayout from "@/components/admin/layout";

type Source = "os" | "ponto" | "ambos";

type EmployeeRow = {
  employeeId: number;
  name: string;
  matricula: string | null;
  role: string | null;
  primeiraOs: { osId: number; osNumber: string | null; date: string } | null;
  osCount: number;
  totalHorasOs: number;
  totalHorasPonto: number;
  diasComPonto: number;
  mediaHorasPorOs: number;
  osList: Array<{
    osId: number;
    osNumber: string | null;
    date: string;
    ini: string;
    fim: string;
    horas: number;
    role: "principal" | "secundario";
    fonte: "step_logs" | "mission_dates" | "fallback" | "sem_horario";
  }>;
};

type Resp = {
  from: string | null;
  to: string | null;
  source: Source;
  totals: { totalHorasOs: number; totalHorasPonto: number; totalOsCount: number; employeesCount: number };
  employees: EmployeeRow[];
};

type Funcionario = { id: number; name: string; matricula?: string | null; status?: string };

function fmtH(h: number) {
  if (!h) return "0h00";
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${hh}h${String(mm).padStart(2, "0")}`;
}

function fmtDateBR(iso: string) {
  if (!iso) return "—";
  const ymd = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "--:--"; }
}

function todayBRTYmd() {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600000);
  return brt.toISOString().slice(0, 10);
}

function ymdAddDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function RelatorioHorasPage() {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>(ymdAddDays(todayBRTYmd(), -1));
  const [source, setSource] = useState<Source>("ambos");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: funcionarios } = useQuery<Funcionario[]>({ queryKey: ["/api/employees"] });

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (employeeId) params.set("employeeId", employeeId);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    params.set("source", source);
    return [`/api/relatorios/horas-trabalhadas?${params.toString()}`] as const;
  }, [employeeId, start, end, source]);

  const { data, isLoading, isFetching } = useQuery<Resp>({ queryKey });

  const applyPreset = (preset: "semana" | "mes" | "30d" | "ano" | "tudo") => {
    const today = todayBRTYmd();
    const ontem = ymdAddDays(today, -1);
    setEnd(ontem);
    if (preset === "semana") {
      setStart(ymdAddDays(today, -7));
    } else if (preset === "mes") {
      const d = new Date(`${today}T12:00:00-03:00`);
      setStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    } else if (preset === "30d") {
      setStart(ymdAddDays(today, -30));
    } else if (preset === "ano") {
      const d = new Date(`${today}T12:00:00-03:00`);
      setStart(`${d.getFullYear()}-01-01`);
    } else if (preset === "tudo") {
      setStart("");
    }
  };

  const exportCSV = () => {
    if (!data?.employees?.length) return;
    const rows = [
      ["Matrícula", "Nome", "1ª OS", "OSs no período", "Horas (OS)", "Média h/OS", "Dias com ponto", "Horas (Ponto)", "Diferença OS-Ponto"],
      ...data.employees.map(e => [
        e.matricula || "",
        e.name,
        e.primeiraOs ? fmtDateBR(e.primeiraOs.date) : "—",
        String(e.osCount),
        fmtH(e.totalHorasOs),
        fmtH(e.mediaHorasPorOs),
        String(e.diasComPonto),
        fmtH(e.totalHorasPonto),
        fmtH(e.totalHorasOs - e.totalHorasPonto),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-horas-${start || "inicio"}_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <Clock className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-neutral-900" data-testid="text-title">Relatório de Horas Trabalhadas</h1>
              <p className="text-xs text-neutral-500">Total de horas por funcionário (OS + Ponto Control iD)</p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            disabled={!data?.employees?.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow"
            data-testid="button-export-csv"
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-neutral-500" />
            <span className="text-xs font-black uppercase text-neutral-700 tracking-wider">Filtros</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Funcionário</label>
              <select
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg text-sm font-medium bg-white"
                data-testid="select-employee"
              >
                <option value="">Todos</option>
                {(funcionarios || []).map(f => (
                  <option key={f.id} value={f.id}>{f.matricula ? `${f.matricula} — ` : ""}{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Data inicial</label>
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg text-sm font-medium"
                data-testid="input-date-start"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Data final</label>
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg text-sm font-medium"
                data-testid="input-date-end"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Fonte</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as Source)}
                className="w-full p-2 border border-neutral-300 rounded-lg text-sm font-medium bg-white"
                data-testid="select-source"
              >
                <option value="ambos">OS + Ponto</option>
                <option value="os">Apenas OS (missões)</option>
                <option value="ponto">Apenas Ponto Control iD</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Atalhos</label>
              <div className="flex flex-wrap gap-1">
                {[
                  ["semana", "7 dias"],
                  ["mes", "Mês"],
                  ["30d", "30 dias"],
                  ["ano", "Ano"],
                  ["tudo", "Tudo"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => applyPreset(k as any)}
                    className="px-2 py-1 text-[10px] font-bold bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300"
                    data-testid={`button-preset-${k}`}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-neutral-400 mt-2 flex items-center gap-1">
            <Calendar size={10} /> Apenas dias <b>fechados</b> (até ontem). OSs em andamento são ignoradas.
          </p>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<Users size={16} />} color="emerald" label="Funcionários" value={String(data?.totals.employeesCount ?? 0)} testid="kpi-employees" />
          <KpiCard icon={<BarChart3 size={16} />} color="blue" label="OSs no período" value={String(data?.totals.totalOsCount ?? 0)} testid="kpi-os-count" />
          <KpiCard icon={<Clock size={16} />} color="violet" label="Horas (OS)" value={fmtH(data?.totals.totalHorasOs ?? 0)} testid="kpi-horas-os" />
          <KpiCard icon={<Clock size={16} />} color="amber" label="Horas (Ponto)" value={fmtH(data?.totals.totalHorasPonto ?? 0)} testid="kpi-horas-ponto" />
        </div>

        {/* Tabela */}
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h3 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Por Funcionário</h3>
            {isFetching && <Loader2 size={14} className="animate-spin text-neutral-400" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-[10px] font-black text-neutral-500 uppercase">
                  <th className="text-left px-3 py-2 w-8"></th>
                  <th className="text-left px-3 py-2">Matrícula</th>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">1ª OS</th>
                  <th className="text-right px-3 py-2">OSs</th>
                  <th className="text-right px-3 py-2">Horas (OS)</th>
                  <th className="text-right px-3 py-2">Média h/OS</th>
                  <th className="text-right px-3 py-2">Dias ponto</th>
                  <th className="text-right px-3 py-2">Horas (Ponto)</th>
                  <th className="text-right px-3 py-2">Δ OS - Ponto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-8 text-neutral-400"><Loader2 className="inline animate-spin mr-2" size={14} />Carregando…</td></tr>
                ) : !data?.employees?.length ? (
                  <tr><td colSpan={10} className="text-center py-8 text-neutral-400">Nenhum dado para os filtros selecionados</td></tr>
                ) : (
                  data.employees.map(e => {
                    const isOpen = expanded === e.employeeId;
                    const diff = e.totalHorasOs - e.totalHorasPonto;
                    return (
                      <Fragment key={`emp-${e.employeeId}`}>
                        <tr
                          className="hover:bg-emerald-50/50 cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : e.employeeId)}
                          data-testid={`row-employee-${e.employeeId}`}
                        >
                          <td className="px-3 py-2">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-neutral-600">{e.matricula || "—"}</td>
                          <td className="px-3 py-2 font-bold text-neutral-900" data-testid={`text-name-${e.employeeId}`}>{e.name}</td>
                          <td className="px-3 py-2 text-xs text-neutral-600">{e.primeiraOs ? fmtDateBR(e.primeiraOs.date) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{e.osCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-violet-700" data-testid={`text-horas-os-${e.employeeId}`}>{fmtH(e.totalHorasOs)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-neutral-500">{fmtH(e.mediaHorasPorOs)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{e.diasComPonto}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-700" data-testid={`text-horas-ponto-${e.employeeId}`}>{fmtH(e.totalHorasPonto)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${Math.abs(diff) > 1 ? "text-red-600" : "text-neutral-400"}`}>{fmtH(diff)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-neutral-50">
                            <td colSpan={10} className="px-4 py-3">
                              {e.osList.length === 0 ? (
                                <p className="text-xs text-neutral-500 italic">Nenhuma OS no período.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[9px] font-black uppercase text-neutral-500 border-b border-neutral-200">
                                        <th className="text-left py-1">OS</th>
                                        <th className="text-left py-1">Data</th>
                                        <th className="text-left py-1">Saída Base</th>
                                        <th className="text-left py-1">Chegada Base</th>
                                        <th className="text-right py-1">Horas</th>
                                        <th className="text-left py-1 pl-2">Função</th>
                                        <th className="text-left py-1 pl-2">Fonte</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {e.osList.map(o => (
                                        <tr key={`${o.osId}-${o.role}`} data-testid={`row-os-detail-${o.osId}-${e.employeeId}`}>
                                          <td className="py-1 font-mono font-bold">{o.osNumber || `#${o.osId}`}</td>
                                          <td className="py-1">{fmtDateBR(o.date)}</td>
                                          <td className="py-1 font-mono">{fmtTime(o.ini)}</td>
                                          <td className="py-1 font-mono">{fmtTime(o.fim)}</td>
                                          <td className="py-1 text-right font-mono font-bold text-violet-700">{fmtH(o.horas)}</td>
                                          <td className="py-1 pl-2">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${o.role === "principal" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                              {o.role === "principal" ? "Vigilante 1" : "Vigilante 2"}
                                            </span>
                                          </td>
                                          <td className="py-1 pl-2">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${o.fonte === "sem_horario" ? "bg-red-100 text-red-700" : "bg-neutral-200 text-neutral-700"}`}>
                                              {o.fonte === "step_logs" ? "Saída→Retorno" : o.fonte === "mission_dates" ? "Início→Fim" : o.fonte === "fallback" ? "Aproximado" : "Sem horário"}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({ icon, color, label, value, testid }: { icon: React.ReactNode; color: string; label: string; value: string; testid?: string }) {
  const colors: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-600 text-emerald-700 bg-emerald-50 border-emerald-200",
    blue: "from-blue-500 to-cyan-600 text-blue-700 bg-blue-50 border-blue-200",
    violet: "from-violet-500 to-purple-600 text-violet-700 bg-violet-50 border-violet-200",
    amber: "from-amber-500 to-orange-600 text-amber-700 bg-amber-50 border-amber-200",
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`border rounded-xl p-3 ${c.split(" ").slice(2).join(" ")}`} data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${c.split(" ").slice(0, 2).join(" ")} flex items-center justify-center text-white shadow`}>
          {icon}
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-600">{label}</span>
      </div>
      <p className={`text-xl font-black ${c.split(" ")[2]}`}>{value}</p>
    </div>
  );
}
