import MobileLayout from "@/components/mobile/layout";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useState } from "react";
import {
  AlertTriangle, Ban, Clock, DollarSign, Loader2, FileX, Shield,
} from "lucide-react";

type HRTab = "absences" | "fines" | "disciplinary" | "timesheets" | "payslips";

const TABS: { key: HRTab; label: string; icon: any }[] = [
  { key: "absences", label: "Faltas", icon: AlertTriangle },
  { key: "fines", label: "Multas", icon: Ban },
  { key: "disciplinary", label: "Discipl.", icon: Shield },
  { key: "timesheets", label: "Ponto", icon: Clock },
  { key: "payslips", label: "Holerite", icon: DollarSign },
];

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function _eu(ts: string) { return /[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z"; }
function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(_eu(d)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function fmtCurrency(v: number | null) {
  if (v == null) return "-";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function MeuRHPage() {
  const [tab, setTab] = useState<HRTab>("absences");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/my/hr-summary"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const absences = data?.absences || [];
  const fines = data?.fines || [];
  const disciplinary = data?.disciplinary || [];
  const timesheets = data?.timesheets || [];
  const payslips = data?.payslips || [];

  return (
    <MobileLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider" data-testid="text-meu-rh-title">Meu RH</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Seus registros de RH</p>
        </div>

        <div className="flex gap-1 bg-neutral-100 rounded-2xl p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t.key
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-400"
              }`}
              data-testid={`tab-mobile-hr-${t.key}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
          </div>
        ) : (
          <>
            {tab === "absences" && (
              <div className="space-y-2">
                {absences.length === 0 ? (
                  <EmptyState text="Nenhuma falta ou atestado registrado" />
                ) : (
                  absences.map((a: any) => (
                    <div key={a.id} className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-absence-${a.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-neutral-800">{a.type}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-xs text-neutral-500">
                        {fmtDate(a.startDate)}
                        {a.endDate ? ` — ${fmtDate(a.endDate)}` : ""}
                      </p>
                      {a.reason && <p className="text-xs text-neutral-400 mt-1">{a.reason}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "fines" && (
              <div className="space-y-2">
                {fines.length === 0 ? (
                  <EmptyState text="Nenhuma multa registrada" />
                ) : (
                  fines.map((f: any) => (
                    <div key={f.id} className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-fine-${f.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-neutral-800">{f.infraction}</span>
                        <StatusBadge status={f.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        <span>{fmtDate(f.date)}</span>
                        {f.amount != null && <span className="font-semibold text-red-600">{fmtCurrency(f.amount)}</span>}
                        {f.points != null && <span>{f.points} pts</span>}
                      </div>
                      {f.notes && <p className="text-xs text-neutral-400 mt-1">{f.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "disciplinary" && (
              <div className="space-y-2">
                {disciplinary.length === 0 ? (
                  <EmptyState text="Nenhum registro disciplinar" />
                ) : (
                  disciplinary.map((d: any) => (
                    <div key={d.id} className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-disciplinary-${d.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-neutral-800">{d.type}</span>
                        <StatusBadge status={d.status} />
                      </div>
                      <p className="text-xs text-neutral-500">{fmtDate(d.date)}</p>
                      <p className="text-xs text-neutral-600 mt-1 font-medium">{d.reason}</p>
                      {d.description && <p className="text-xs text-neutral-400 mt-1">{d.description}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "timesheets" && (
              <div className="space-y-2">
                {timesheets.length === 0 ? (
                  <EmptyState text="Nenhum ponto registrado" />
                ) : (
                  timesheets.map((t: any) => (
                    <div key={t.id} className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-timesheet-${t.id}`}>
                      <p className="text-sm font-bold text-neutral-800 mb-2">{fmtDate(t.date)}</p>
                      <div className="grid grid-cols-2 gap-y-1 text-xs">
                        <span className="text-neutral-400">Entrada</span>
                        <span className="text-neutral-700 font-medium">{t.clockIn || "-"}</span>
                        <span className="text-neutral-400">Saída Almoço</span>
                        <span className="text-neutral-700 font-medium">{t.lunchOut || "-"}</span>
                        <span className="text-neutral-400">Retorno</span>
                        <span className="text-neutral-700 font-medium">{t.lunchIn || "-"}</span>
                        <span className="text-neutral-400">Saída</span>
                        <span className="text-neutral-700 font-medium">{t.clockOut || "-"}</span>
                        {t.overtime > 0 && (
                          <>
                            <span className="text-neutral-400">Horas Extras</span>
                            <span className="text-green-600 font-bold">{t.overtime}h</span>
                          </>
                        )}
                      </div>
                      {t.notes && <p className="text-xs text-neutral-400 mt-2 border-t border-neutral-100 pt-1">{t.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "payslips" && (
              <div className="space-y-2">
                {payslips.length === 0 ? (
                  <EmptyState text="Nenhum holerite registrado" />
                ) : (
                  payslips.map((p: any) => (
                    <div key={p.id} className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-payslip-${p.id}`}>
                      <p className="text-sm font-bold text-neutral-800 mb-2">{MONTHS[p.month - 1]} / {p.year}</p>
                      <div className="grid grid-cols-2 gap-y-1 text-xs">
                        <span className="text-neutral-400">Bruto</span>
                        <span className="text-neutral-700 font-medium">{fmtCurrency(p.grossSalary)}</span>
                        <span className="text-neutral-400">Descontos</span>
                        <span className="text-red-600 font-medium">{fmtCurrency(p.deductions)}</span>
                        <span className="text-neutral-400">Benefícios</span>
                        <span className="text-green-600 font-medium">{fmtCurrency(p.benefits)}</span>
                        <span className="text-neutral-400 font-bold">Líquido</span>
                        <span className="text-neutral-900 font-black">{fmtCurrency(p.netSalary)}</span>
                      </div>
                      {p.notes && <p className="text-xs text-neutral-400 mt-2 border-t border-neutral-100 pt-1">{p.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MobileLayout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-neutral-300">
      <FileX className="w-10 h-10 mb-2" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pendente: "bg-yellow-50 text-yellow-700 border-yellow-200",
    aprovado: "bg-green-50 text-green-700 border-green-200",
    rejeitado: "bg-red-50 text-red-700 border-red-200",
    paga: "bg-green-50 text-green-700 border-green-200",
    contestada: "bg-blue-50 text-blue-700 border-blue-200",
    ativa: "bg-red-50 text-red-700 border-red-200",
    cumprida: "bg-green-50 text-green-700 border-green-200",
    revogada: "bg-neutral-50 text-neutral-600 border-neutral-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${colors[status] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
      {status}
    </span>
  );
}
