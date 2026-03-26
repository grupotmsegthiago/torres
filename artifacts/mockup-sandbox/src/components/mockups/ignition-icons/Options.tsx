import { Power, KeyRound, CircleDot, Zap, Car, ToggleLeft, ToggleRight } from "lucide-react";

function IconOption({ label, children, number }: { label: string; children: React.ReactNode; number: number }) {
  return (
    <div className="flex flex-col items-center gap-3 p-5 rounded-xl border border-neutral-200 bg-white shadow-sm min-w-[140px]">
      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Opção {number}</span>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          {children && (children as any)[0]}
          <span className="text-[10px] font-semibold text-green-600">Ligado</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          {children && (children as any)[1]}
          <span className="text-[10px] font-semibold text-red-600">Desligado</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-neutral-700 mt-1">{label}</span>
    </div>
  );
}

function CarKeyIcon({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <ellipse cx="10" cy="16" rx="7" ry="8" fill={color} opacity={0.15} stroke={color} strokeWidth="2" />
      <circle cx="10" cy="16" r="3" fill={color} />
      <rect x="15" y="14" width="14" height="4" rx="2" fill={color} />
      <rect x="24" y="11" width="3" height="3" rx="1" fill={color} />
      <rect x="24" y="18" width="3" height="3" rx="1" fill={color} />
    </svg>
  );
}

function IgnitionSwitch({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <circle cx="16" cy="16" r="13" fill="none" stroke={color} strokeWidth="2.5" />
      <circle cx="16" cy="16" r="9" fill={color} opacity={0.1} />
      <circle cx="16" cy="16" r="4" fill={color} />
      <line x1="16" y1="3" x2="16" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function KeyholeIcon({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <circle cx="16" cy="13" r="10" fill="none" stroke={color} strokeWidth="2.5" />
      <circle cx="16" cy="11" r="4" fill={color} />
      <rect x="14" y="14" width="4" height="8" rx="1.5" fill={color} />
    </svg>
  );
}

function DashboardLight({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 6px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <path d="M4 24 A14 14 0 0 1 28 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="22" x2={on ? "22" : "10"} y2={on ? "12" : "12"} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="22" r="2.5" fill={color} />
      <circle cx="7" cy="20" r="1.5" fill={color} opacity={0.5} />
      <circle cx="25" cy="20" r="1.5" fill={color} opacity={0.5} />
      <circle cx="10" cy="13" r="1.5" fill={color} opacity={0.5} />
      <circle cx="22" cy="13" r="1.5" fill={color} opacity={0.5} />
      <circle cx="16" cy="10" r="1.5" fill={color} opacity={0.5} />
    </svg>
  );
}

function EngineLightIcon({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <rect x="6" y="10" width="20" height="14" rx="2" fill={color} opacity={0.15} stroke={color} strokeWidth="2" />
      <rect x="3" y="14" width="3" height="6" rx="1" fill={color} />
      <rect x="26" y="12" width="3" height="4" rx="1" fill={color} />
      <line x1="10" y1="7" x2="10" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="7" x2="16" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="7" x2="22" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="14" width="12" height="2" rx="1" fill={color} />
      <rect x="10" y="18" width="8" height="2" rx="1" fill={color} />
    </svg>
  );
}

function BoltCircle({ on }: { on: boolean }) {
  const color = on ? "#22c55e" : "#ef4444";
  const glow = on ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))" : "none";
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ filter: glow }}>
      <circle cx="16" cy="16" r="13" fill={color} opacity={0.12} stroke={color} strokeWidth="2" />
      <path d="M18 6 L12 18 H17 L14 26 L22 14 H16 Z" fill={color} />
    </svg>
  );
}

export function Options() {
  return (
    <div className="min-h-screen bg-neutral-50 p-8 flex flex-col items-center gap-6">
      <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Ícones de Ignição — Escolha seu favorito</h2>
      <p className="text-sm text-neutral-500 mb-2">Verde = Ligado &nbsp;|&nbsp; Vermelho = Desligado</p>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 max-w-[700px]">
        <IconOption number={1} label="Chave Clássica">
          {[<CarKeyIcon on={true} key="on" />, <CarKeyIcon on={false} key="off" />]}
        </IconOption>

        <IconOption number={2} label="Botão Power">
          {[
            <Power key="on" className="w-8 h-8 text-green-500" style={{ filter: "drop-shadow(0 0 5px rgba(34,197,94,0.5))" }} />,
            <Power key="off" className="w-8 h-8 text-red-500" />
          ]}
        </IconOption>

        <IconOption number={3} label="Ignição (switch)">
          {[<IgnitionSwitch on={true} key="on" />, <IgnitionSwitch on={false} key="off" />]}
        </IconOption>

        <IconOption number={4} label="Fechadura">
          {[<KeyholeIcon on={true} key="on" />, <KeyholeIcon on={false} key="off" />]}
        </IconOption>

        <IconOption number={5} label="Velocímetro">
          {[<DashboardLight on={true} key="on" />, <DashboardLight on={false} key="off" />]}
        </IconOption>

        <IconOption number={6} label="Motor">
          {[<EngineLightIcon on={true} key="on" />, <EngineLightIcon on={false} key="off" />]}
        </IconOption>

        <IconOption number={7} label="Raio / Energia">
          {[<BoltCircle on={true} key="on" />, <BoltCircle on={false} key="off" />]}
        </IconOption>

        <IconOption number={8} label="Toggle ON/OFF">
          {[
            <ToggleRight key="on" className="w-8 h-8 text-green-500" style={{ filter: "drop-shadow(0 0 5px rgba(34,197,94,0.5))" }} />,
            <ToggleLeft key="off" className="w-8 h-8 text-red-500" />
          ]}
        </IconOption>
      </div>
    </div>
  );
}