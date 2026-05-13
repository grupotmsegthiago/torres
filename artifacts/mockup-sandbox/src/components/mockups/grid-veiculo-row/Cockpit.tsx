import { Power, Satellite, Gauge, Users, FileText, MapPin, TrendingUp, Clock } from "lucide-react";

export function Cockpit() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
        <div className="grid grid-cols-[220px_1fr_1fr_1fr_auto] items-stretch divide-x divide-slate-100 dark:divide-slate-800">
          {/* Bloco 1: identidade */}
          <div className="p-2.5 flex items-center gap-2.5">
            <div className="relative shrink-0">
              <img
                src="/__mockup/images/polo-branco.png"
                alt="VW Polo Track branco"
                className="w-16 h-16 rounded-md object-cover bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"
              />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />
            </div>
            <div className="min-w-0">
              <div className="font-mono font-bold text-slate-900 dark:text-white text-sm leading-tight">UEB7H08</div>
              <div className="text-[10px] text-slate-500 truncate">VW Polo Track</div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold truncate">TOR-0174 · KIT</div>
            </div>
          </div>

          {/* Bloco 2: telemetria */}
          <div className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Telemetria</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <Stat icon={<Power className="w-3 h-3" />} label="Ign" value="OFF" muted />
              <Stat icon={<Satellite className="w-3 h-3" />} label="GPS" value="—" warn />
              <Stat icon={<Gauge className="w-3 h-3" />} label="Vel" value="0 km/h" />
              <Stat icon={<Clock className="w-3 h-3" />} label="Últ" value="12:55" />
            </div>
          </div>

          {/* Bloco 3: missão */}
          <div className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Missão</div>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <FileText className="w-3 h-3 text-blue-500" />
                <span className="font-semibold">Em trânsito destino</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Users className="w-3 h-3 text-violet-500" />
                <span className="truncate">Gabriel · Fernando</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <MapPin className="w-3 h-3" />
                <span className="truncate tabular-nums">65 km · ETA 13:40</span>
              </div>
            </div>
          </div>

          {/* Bloco 4: financeiro */}
          <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20">
            <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
              <TrendingUp className="w-2.5 h-2.5" /> Financeiro
            </div>
            <div className="space-y-0.5 text-[11px] tabular-nums">
              <Money label="Fat" value="R$ 745,83" tone="strong" />
              <Money label="Comb" value="R$ 162,17" />
              <Money label="DRE" value="R$ 583,66" tone="positive" />
            </div>
          </div>

          {/* Bloco 5: progresso vertical */}
          <div className="px-4 py-3 flex flex-col items-center justify-center w-16">
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" className="stroke-blue-500" strokeWidth="3" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - 0.41)} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-200">41%</div>
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5">rota</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, warn, muted }: { icon: React.ReactNode; label: string; value: string; warn?: boolean; muted?: boolean }) {
  const tone = warn ? "text-amber-700 dark:text-amber-400 font-semibold" : muted ? "text-slate-500" : "text-slate-900 dark:text-white font-semibold";
  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-400">{icon}</span>
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function Money({ label, value, tone }: { label: string; value: string; tone?: "strong" | "positive" }) {
  const cls = tone === "positive" ? "text-emerald-700 dark:text-emerald-400 font-bold" : tone === "strong" ? "text-slate-900 dark:text-white font-semibold" : "text-slate-600 dark:text-slate-400";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
