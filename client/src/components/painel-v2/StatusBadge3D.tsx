import { Wrench, TriangleAlert, ShieldCheck, CheckCircle2, WifiOff } from "lucide-react";

export type ViaturaStatusType =
  | "em_missao"
  | "na_origem"
  | "disponivel"
  | "manutencao_vencida"
  | "rodizio_sp"
  | "sem_sinal";

interface StatusBadge3DProps {
  status: ViaturaStatusType;
  customText?: string;
}

export function StatusBadge3D({ status, customText }: StatusBadge3DProps) {
  if (status === "manutencao_vencida") {
    return (
      <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase
        bg-gradient-to-b from-rose-600/40 via-red-950/80 to-black
        border-t border-rose-400 border-b-2 border-b-black border-x border-rose-600/40
        text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)]">
        <span className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
          <Wrench className="relative w-3.5 h-3.5 text-rose-300 drop-shadow-[0_0_6px_#f43f5e] animate-pulse" />
        </span>
        <span>{customText || "MANUTENÇÃO VENCIDA"}</span>
      </div>
    );
  }

  if (status === "rodizio_sp") {
    return (
      <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase
        bg-gradient-to-b from-amber-500/35 via-amber-950/80 to-black
        border-t border-amber-400 border-b-2 border-b-black border-x border-amber-600/40
        text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]">
        <span className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
          <TriangleAlert className="relative w-3.5 h-3.5 text-amber-300 drop-shadow-[0_0_6px_#fbbf24] animate-pulse" />
        </span>
        <span>{customText || "RODÍZIO SP"}</span>
      </div>
    );
  }

  if (status === "em_missao" || status === "na_origem") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase
        bg-gradient-to-b from-emerald-500/30 to-emerald-950/80
        border-t border-emerald-400 border-b-2 border-b-black border-x border-emerald-700/40
        text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)]">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>{customText || (status === "na_origem" ? "NA ORIGEM" : "EM TRÂNSITO")}</span>
      </div>
    );
  }

  if (status === "sem_sinal") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase
        bg-gradient-to-b from-red-900/20 to-slate-900 border-t border-red-500/40 border-b border-black text-rose-400">
        <WifiOff className="w-3.5 h-3.5" />
        <span>{customText || "SEM SINAL"}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase
      bg-gradient-to-b from-slate-800 to-slate-950 border-t border-slate-600/30 border-b border-black text-slate-400">
      <CheckCircle2 className="w-3.5 h-3.5" />
      <span>{customText || "DISPONÍVEL"}</span>
    </div>
  );
}
