/**
 * Termômetro financeiro SVG — Faturamento vs Custo vs Lucro.
 * Referência visual: termômetro vertical com zonas vermelho→verde (prejuízo embaixo).
 * Não usa imagem externa; cores/status vêm de computeTermometroFinanceiro.
 */
import type { TermometroCor, TermometroResultado, TermometroSelo } from "@/lib/gestor-financeiro";

const ZONE_COLORS = {
  vermelho: "#f87171",
  laranja: "#fb923c",
  amarelo: "#fbbf24",
  verde: "#34d399",
  cinza: "#64748b",
} as const;

const LABELS: Array<{ key: TermometroCor; label: string; y: number }> = [
  { key: "verde", label: "SAUDÁVEL", y: 18 },
  { key: "amarelo", label: "ATENÇÃO", y: 58 },
  { key: "laranja", label: "MARGEM BAIXA", y: 98 },
  { key: "vermelho", label: "PREJUÍZO", y: 138 },
];

export function TermometroFinanceiroSvg({
  termo,
  size = 180,
}: {
  termo: TermometroResultado;
  size?: number;
}) {
  const h = size;
  const stemTop = 8;
  const stemBottom = h - 36;
  const stemH = stemBottom - stemTop;
  const fillH = (Math.max(0, Math.min(100, termo.fillPct)) / 100) * stemH;
  const fillY = stemBottom - fillH;
  const active = termo.cor;
  const mercury = ZONE_COLORS[active] || ZONE_COLORS.cinza;

  // 4 bandas iguais no stem (verde topo → vermelho base)
  const bandH = stemH / 4;

  return (
    <svg
      width={140}
      height={h}
      viewBox={`0 0 140 ${h}`}
      role="img"
      aria-label={`Termômetro ${termo.statusLabel}`}
      data-testid="svg-termometro-financeiro"
    >
      {/* Zonas de fundo */}
      <rect x={28} y={stemTop} width={22} height={bandH} rx={2} fill="#14532d" opacity={0.55} />
      <rect x={28} y={stemTop + bandH} width={22} height={bandH} fill="#713f12" opacity={0.55} />
      <rect x={28} y={stemTop + bandH * 2} width={22} height={bandH} fill="#7c2d12" opacity={0.55} />
      <rect x={28} y={stemTop + bandH * 3} width={22} height={bandH} fill="#7f1d1d" opacity={0.55} />

      {/* Preenchimento (mercúrio) */}
      {fillH > 0 && (
        <rect x={30} y={fillY} width={18} height={fillH} fill={mercury} rx={1} data-testid="termometro-fill" />
      )}

      {/* Contorno do stem */}
      <rect
        x={26}
        y={stemTop}
        width={26}
        height={stemH}
        rx={10}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={2.5}
      />
      {/* Reflexo */}
      <rect x={31} y={stemTop + 4} width={3} height={stemH - 10} rx={1} fill="#fff" opacity={0.25} />

      {/* Bulbo */}
      <circle cx={39} cy={h - 18} r={16} fill={mercury} stroke="#94a3b8" strokeWidth={2.5} />
      <circle cx={34} cy={h - 22} r={4} fill="#fff" opacity={0.35} />

      {/* Escala + labels */}
      {LABELS.map((L) => {
        const isActive = active === L.key;
        return (
          <g key={L.key}>
            <line x1={56} y1={L.y + 8} x2={64} y2={L.y + 8} stroke="#64748b" strokeWidth={1.5} />
            <circle
              cx={78}
              cy={L.y + 8}
              r={isActive ? 9 : 7}
              fill={ZONE_COLORS[L.key]}
              opacity={isActive ? 1 : 0.35}
              stroke={isActive ? "#f8fafc" : "transparent"}
              strokeWidth={1.5}
            />
            {/* Face simples */}
            <circle cx={75.5} cy={L.y + 6} r={0.9} fill="#0f172a" />
            <circle cx={80.5} cy={L.y + 6} r={0.9} fill="#0f172a" />
            {L.key === "verde" && (
              <path d={`M74 ${L.y + 10} Q78 ${L.y + 13} 82 ${L.y + 10}`} stroke="#0f172a" strokeWidth={1} fill="none" />
            )}
            {L.key === "amarelo" && (
              <line x1={74.5} y1={L.y + 10.5} x2={81.5} y2={L.y + 10.5} stroke="#0f172a" strokeWidth={1} />
            )}
            {(L.key === "laranja" || L.key === "vermelho") && (
              <path d={`M74 ${L.y + 11.5} Q78 ${L.y + 8.5} 82 ${L.y + 11.5}`} stroke="#0f172a" strokeWidth={1} fill="none" />
            )}
            <text
              x={92}
              y={L.y + 11}
              fontSize={isActive ? 8.5 : 7.5}
              fontWeight={isActive ? 800 : 600}
              fill={isActive ? ZONE_COLORS[L.key] : "#64748b"}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {L.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SeloTermometro({ selo }: { selo: TermometroSelo }) {
  const map: Record<TermometroSelo, { label: string; cls: string }> = {
    certificado: { label: "CERTIFICADO", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    conferencia: { label: "EM CONFERÊNCIA", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
    divergencia: { label: "DIVERGÊNCIA", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
    insuficiente: { label: "DADOS INSUFICIENTES", cls: "bg-slate-700/60 text-slate-400 border-slate-600" },
  };
  const s = map[selo];
  return (
    <span
      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${s.cls}`}
      data-testid="selo-termometro"
    >
      {s.label}
    </span>
  );
}
