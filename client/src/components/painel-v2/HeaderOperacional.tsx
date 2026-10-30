import type { ReactNode } from "react";
import { Radio, RefreshCw } from "lucide-react";

interface HeaderOperacionalProps {
  time: string;
  date: string;
  online: boolean;
  countdown: string;
  lastRefresh: string;
  refreshing: boolean;
  onRefresh: () => void;
  statusSlot?: ReactNode;
  actions?: ReactNode;
}

export function HeaderOperacional({
  time,
  date,
  online,
  countdown,
  lastRefresh,
  refreshing,
  onRefresh,
  statusSlot,
  actions,
}: HeaderOperacionalProps) {
  return (
    <header className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-cyan-400/10 border border-cyan-300/30 flex items-center justify-center shadow-[0_0_18px_rgba(34,211,238,0.25)]">
          <Radio className="w-5 h-5 text-cyan-300" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black tracking-[0.14em] text-cyan-100 uppercase" data-testid="text-grid-title">
            Grid Operacional
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Monitoramento em tempo real</p>
        </div>
        {statusSlot}
      </div>

      <div
        className="justify-self-center rounded-2xl bg-[#0c1422]/90 border border-slate-600/70 px-5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]"
        data-testid="brt-central-clock"
      >
        <div className="text-2xl sm:text-3xl font-black tabular-nums tracking-[0.12em] text-white text-center leading-none" data-testid="text-brt-time">
          {time}
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          <span>{date}</span>
          <span className={online ? "text-emerald-400" : "text-amber-400"} data-testid="badge-conexao">
            {online ? "Conexão" : "Sem rede"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2">
        {actions}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-xl
            text-cyan-100 bg-gradient-to-b from-slate-800 to-slate-950 border-t border-cyan-400/30 border-b border-black
            shadow-[0_2px_6px_rgba(0,0,0,0.55)] hover:brightness-125 disabled:opacity-60"
          data-testid="button-refresh-grid"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
        <span className="text-[10px] text-slate-500 tabular-nums" data-testid="countdown-timer">
          Próxima {countdown} · última {lastRefresh}
        </span>
      </div>
    </header>
  );
}
