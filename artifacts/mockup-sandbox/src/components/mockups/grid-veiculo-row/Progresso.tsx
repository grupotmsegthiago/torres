import { Power, Satellite, Gauge, MapPin, Users, AlertTriangle } from "lucide-react";

export function Progresso() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Faixa de status colorida à esquerda */}
        <div className="grid grid-cols-[6px_1fr] min-h-[90px]">
          <div className="bg-amber-400" />
          <div className="px-4 py-2.5">
            {/* Linha 1: identificação + KPIs principais */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="font-mono font-bold text-slate-900 dark:text-white text-base">UEB7H08</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">VW Polo Track · KIT TORRES</div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded">
                  <Satellite className="w-2.5 h-2.5" /> Sem sinal · 5 min
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs shrink-0">
                <Mini icon={<Power className="w-3.5 h-3.5 text-slate-400" />} value="OFF" />
                <Mini icon={<Gauge className="w-3.5 h-3.5 text-slate-400" />} value="0 km/h" />
                <Mini icon={<Users className="w-3.5 h-3.5 text-violet-500" />} value="2 ag." />
                <Mini icon={<AlertTriangle className="w-3.5 h-3.5 text-emerald-500" />} value="0 alertas" />
              </div>
            </div>

            {/* Linha 2: localização compacta */}
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">Av. Paulista, 1578 · Bela Vista · São Paulo/SP — registrada 13/05 12:55</span>
            </div>

            {/* Linha 3: barra de progresso da OS */}
            <div className="mt-2 flex items-center gap-3">
              <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 shrink-0 tabular-nums">
                TOR-0174
              </div>
              <div className="flex-1 relative h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-end pr-2" style={{ width: "41%" }}>
                  <span className="text-[10px] font-bold text-white">41%</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                  <span className="text-white drop-shadow">Em trânsito → destino</span>
                  <span className="tabular-nums">65 km · ETA 13:40</span>
                </div>
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums shrink-0">
                R$ 583,66
                <span className="text-slate-400 font-normal ml-1">DRE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium tabular-nums">
      {icon}<span>{value}</span>
    </div>
  );
}
