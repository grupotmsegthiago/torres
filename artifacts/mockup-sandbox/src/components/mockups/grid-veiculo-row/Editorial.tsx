import { Satellite, Gauge, Users, MapPin, ArrowRight } from "lucide-react";

export function Editorial() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 p-4 font-sans">
      <div className="group bg-white dark:bg-slate-900 border-l-4 border-amber-400 hover:border-blue-500 transition-colors rounded-r-lg shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:shadow-md">
        <div className="grid grid-cols-[1.4fr_2fr_1fr_auto] items-center gap-6 px-5 py-3">
          {/* IDENTIDADE */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tracking-tight">UEB7H08</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-400">Polo · Kit</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              <Satellite className="w-3 h-3" />
              <span>GPS sem sinal</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <Gauge className="w-3 h-3 text-slate-400" />
              <span className="text-slate-500 tabular-nums">0 km/h</span>
            </div>
          </div>

          {/* CONTEXTO */}
          <div className="border-l border-slate-100 dark:border-slate-800 pl-6">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">TOR-0174 · Em trânsito destino</div>
            <div className="text-sm text-slate-700 dark:text-slate-200 truncate">
              <MapPin className="w-3.5 h-3.5 inline -mt-0.5 text-slate-400 mr-1" />
              Av. Paulista, 1578 — Bela Vista · São Paulo/SP
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
              <Users className="w-3 h-3 text-violet-500" />
              <span>Gabriel A. · Fernando D.</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="tabular-nums">65 km restantes · ETA 13:40</span>
            </div>
          </div>

          {/* FINANCEIRO */}
          <div className="border-l border-slate-100 dark:border-slate-800 pl-6">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">DRE da OS</div>
            <div className="font-bold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums leading-none">R$ 583</div>
            <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
              fat <span className="text-slate-700 dark:text-slate-200 font-semibold">R$ 745</span>
              <span className="mx-1.5 text-slate-300">·</span>
              comb <span className="text-slate-700 dark:text-slate-200">R$ 162</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">41<span className="text-sm text-slate-400">%</span></div>
              <div className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">rota</div>
            </div>
            <button className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-500 hover:text-white text-slate-500 flex items-center justify-center transition-colors">
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
