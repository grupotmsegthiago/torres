import { Power, Satellite, MapPin, Gauge, AlertTriangle, Users, FileText, Truck, ChevronRight } from "lucide-react";

export function Chips() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
        <div className="grid grid-cols-[180px_1fr_auto] items-center gap-4 px-4 py-3">
          {/* IDENT */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow">
              KIT
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">UEB7H08</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">VW Polo Track 2026</div>
            </div>
          </div>

          {/* CHIPS */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip icon={<Power className="w-3 h-3" />} label="OFF" tone="slate" />
            <Chip icon={<Satellite className="w-3 h-3" />} label="Sem sinal" tone="amber" />
            <Chip icon={<Gauge className="w-3 h-3" />} label="0 km/h" tone="slate" />
            <Chip icon={<MapPin className="w-3 h-3" />} label="Av. Paulista, 1578 — São Paulo/SP" tone="slate" wide />
            <Chip icon={<AlertTriangle className="w-3 h-3" />} label="Sem alertas 24h" tone="green" />
            <Chip icon={<Users className="w-3 h-3" />} label="Gabriel + 1" tone="violet" />
            <Chip icon={<FileText className="w-3 h-3" />} label="TOR-0174 · Em trânsito" tone="blue" />
            <Chip icon={<Truck className="w-3 h-3" />} label="ONIXSAT" tone="slate" />
          </div>

          <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, tone, wide }: { icon: React.ReactNode; label: string; tone: "slate" | "amber" | "green" | "violet" | "blue"; wide?: boolean }) {
  const styles = {
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800",
    green: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
    violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-800",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-800",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ring-1 text-[11px] font-medium whitespace-nowrap ${styles} ${wide ? "max-w-[260px] truncate" : ""}`}>
      {icon}
      <span className={wide ? "truncate" : ""}>{label}</span>
    </span>
  );
}
