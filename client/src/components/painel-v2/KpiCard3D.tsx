import type { ReactNode } from "react";

interface KpiProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ReactNode;
  accentColor?: "cyan" | "emerald" | "amber" | "blue" | "electric" | "rose";
  tinted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  onSelect?: () => void;
  testId?: string;
}

const colorMap = {
  cyan: {
    border: "border-t-cyan-400/50",
    text: "text-cyan-300",
    glow: "drop-shadow-[0_0_10px_rgba(6,182,212,0.65)]",
    icon: "text-cyan-300",
    capsule: "from-[#102028] via-[#0a171f] to-[#040b10] border-t-cyan-400/50 border-x-cyan-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(6,182,212,0.45)]",
    wash: "bg-gradient-to-b from-[#13202e] via-[#0c1420] to-[#05090f]",
    label: "text-cyan-300",
  },
  emerald: {
    border: "border-t-emerald-400/60",
    text: "text-emerald-300",
    glow: "drop-shadow-[0_0_10px_rgba(52,211,153,0.7)]",
    icon: "text-emerald-300",
    capsule: "from-[#182d24] via-[#0b1f16] to-[#040e0a] border-t-emerald-400/60 border-x-emerald-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(16,185,129,0.45)]",
    wash: "bg-gradient-to-b from-[#132820] via-[#0a1b14] to-[#040e0a]",
    label: "text-emerald-300",
  },
  amber: {
    border: "border-t-amber-400/70",
    text: "text-amber-300",
    glow: "drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]",
    icon: "text-amber-300",
    capsule: "from-[#2a2010] via-[#1a1408] to-[#0c0904] border-t-amber-400/60 border-x-amber-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(245,158,11,0.45)]",
    wash: "bg-gradient-to-b from-[#2b2213] via-[#16120a] to-[#0a0704]",
    label: "text-amber-300",
  },
  blue: {
    border: "border-t-sky-400/55",
    text: "text-sky-300",
    glow: "drop-shadow-[0_0_10px_rgba(56,189,248,0.65)]",
    icon: "text-sky-300",
    capsule: "from-[#102430] via-[#0a1824] to-[#040c12] border-t-sky-400/55 border-x-sky-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(56,189,248,0.45)]",
    wash: "bg-gradient-to-b from-[#102430] via-[#0a1824] to-[#040c12]",
    label: "text-sky-300",
  },
  electric: {
    border: "border-t-blue-400/70",
    text: "text-blue-300",
    glow: "drop-shadow-[0_0_10px_rgba(59,130,246,0.75)]",
    icon: "text-blue-300",
    capsule: "from-[#121c34] via-[#0a1224] to-[#050814] border-t-blue-400/60 border-x-blue-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(59,130,246,0.5)]",
    wash: "bg-gradient-to-b from-[#121c34] via-[#0a1224] to-[#050814]",
    label: "text-blue-300",
  },
  rose: {
    border: "border-t-rose-400/70",
    text: "text-rose-300",
    glow: "drop-shadow-[0_0_10px_rgba(244,63,94,0.7)]",
    icon: "text-rose-300",
    capsule: "from-[#3a1520] via-[#1a0a10] to-[#0a0406] border-t-rose-400/70 border-x-rose-900/50",
    art: "drop-shadow-[0_8px_12px_rgba(244,63,94,0.45)]",
    wash: "bg-gradient-to-b from-[#2b1317] via-[#160a0d] to-[#0a0406]",
    label: "text-rose-300",
  },
};

export function KpiIconRelief({
  src,
  alt,
  accentColor,
  rings = false,
}: {
  src: string;
  alt: string;
  accentColor: NonNullable<KpiProps["accentColor"]>;
  rings?: boolean;
}) {
  const styles = colorMap[accentColor];
  return (
    <div className="relative w-16 h-16 shrink-0">
      {rings ? (
        <>
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 animate-ping" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/35 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]" />
        </>
      ) : null}
      <div
        className={`relative z-[1] w-16 h-16 rounded-xl flex items-center justify-center
          bg-gradient-to-b ${styles.capsule}
          border-t border-b-2 border-b-black
          shadow-[0_6px_14px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.25)]`}
      >
        <img
          src={src}
          alt={alt}
          className={`w-14 h-14 object-contain ${styles.art} hover:scale-110 transition-transform`}
        />
      </div>
    </div>
  );
}

export function KpiGlyphRelief({
  accentColor,
  children,
  pulse = false,
}: {
  accentColor: NonNullable<KpiProps["accentColor"]>;
  children: ReactNode;
  pulse?: boolean;
}) {
  const styles = colorMap[accentColor];
  return (
    <div
      className={`relative w-11 h-11 shrink-0 rounded-xl flex items-center justify-center
        bg-gradient-to-b ${styles.capsule}
        border-t border-b-2 border-b-black
        shadow-[0_6px_14px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.25)]
        ${pulse ? "animate-pulse" : ""}`}
    >
      {children}
    </div>
  );
}

export function KpiCard3D({ label, value, hint, icon, accentColor = "cyan", tinted = false, selected = false, dimmed = false, onSelect, testId }: KpiProps) {
  const styles = colorMap[accentColor];

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } } : undefined}
      className={`relative rounded-2xl px-4 py-3
        ${tinted ? styles.wash : "bg-gradient-to-b from-[#162131] to-[#0c121d]"}
        ${styles.border} border-b-2 border-b-black/90 border-x border-slate-700/70
        shadow-[0_12px_24px_-4px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.14)]
        flex items-center justify-between gap-3 min-w-0 overflow-visible
        ${onSelect ? "cursor-pointer transition hover:brightness-125" : ""}
        ${selected ? "ring-2 ring-white/80 brightness-110" : ""}
        ${dimmed ? "opacity-40" : ""}`}
      data-testid={testId}
    >
      <div className="min-w-0">
        <span className={`block text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase truncate ${tinted ? styles.label : "text-slate-400"}`}>
          {label}
        </span>
        <span className={`text-2xl font-black ${styles.text} ${styles.glow} font-mono tabular-nums leading-none`}>
          {value}
        </span>
        {hint ? <span className="block text-[10px] text-slate-500 font-semibold mt-0.5">{hint}</span> : null}
      </div>
      {icon ? <div className={`shrink-0 ${styles.icon}`}>{icon}</div> : null}
    </div>
  );
}
