import { useEffect, useId, useState, type ReactNode } from "react";
import { StatusBadge3D, type ViaturaStatusType } from "./StatusBadge3D";

export interface CartaPainel {
  id: number;
  texto: string;
  hora: string;
  autor: string;
}

export interface RotaCard3D {
  origem: string;
  destino: string;
  origemTexto: string;
  destinoTexto: string;
  pct: number | null;
  percorridoKm: number | null;
  totalKm: number | null;
  previsao: string | null;
  velocidade: number | null;
}

const THUMBNAIL = "/assets/mini-escolta-3d.png";

interface FleetCardProps {
  plate: string;
  vtr?: string | null;
  modelo?: string | null;
  driver: string;
  agent2?: string | null;
  cliente?: string;
  origem?: string;
  destino?: string;
  aviso?: string | null;
  alerta?: boolean;
  status: ViaturaStatusType;
  statusText: string;
  subtitle?: string;
  batteryPct: number | null;
  gpsSignal?: string;
  lastMessage?: string | null;
  osNumber?: string | null;
  linkAction: ReactNode;
  onSelect?: () => void;
  carThumbnailUrl?: string;
  rota?: RotaCard3D | null;
  cartas?: CartaPainel[];
  testId?: string;
}

const ROTA_P0 = { x: 18, y: 108 };
const ROTA_P1 = { x: 96, y: 132 };
const ROTA_P2 = { x: 168, y: 18 };
const ROTA_P3 = { x: 304, y: 42 };

function pontoNaRota(t: number) {
  const u = 1 - t;
  return {
    x: u ** 3 * ROTA_P0.x + 3 * u ** 2 * t * ROTA_P1.x + 3 * u * t ** 2 * ROTA_P2.x + t ** 3 * ROTA_P3.x,
    y: u ** 3 * ROTA_P0.y + 3 * u ** 2 * t * ROTA_P1.y + 3 * u * t ** 2 * ROTA_P2.y + t ** 3 * ROTA_P3.y,
  };
}

function RotaHolo({ rota }: { rota: RotaCard3D }) {
  const uid = useId().replace(/:/g, "");
  const temPct = rota.pct != null;
  const pct = temPct ? Math.max(0, Math.min(100, rota.pct as number)) : 0;
  const ponto = pontoNaRota(temPct ? pct / 100 : 0.08);
  const trilha = "M 18 108 C 96 132, 168 18, 304 42";
  const km = rota.percorridoKm != null && rota.totalKm != null
    ? `${rota.percorridoKm.toLocaleString("pt-BR")} km de ${rota.totalKm.toLocaleString("pt-BR")} km`
    : "Sem coordenada";

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" title={`${rota.origemTexto} → ${rota.destinoTexto}`}>
      <svg viewBox="0 0 320 148" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id={`${uid}-grid`} width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(103,232,249,0.22)" strokeWidth="0.7" />
          </pattern>
          <radialGradient id={`${uid}-wash`} cx="70%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#0891b2" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-40%" y="-60%" width="180%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`${uid}-core`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#ecfeff" />
            <stop offset="45%" stopColor="#a5f3fc" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="320" height="148" fill={`url(#${uid}-wash)`} />
        <rect width="320" height="148" fill={`url(#${uid}-grid)`} />
        <path d={trilha} fill="none" stroke="#67e8f9" strokeWidth="18" strokeLinecap="round" opacity="0.45" filter={`url(#${uid}-glow)`} />
        <path d={trilha} fill="none" stroke="#083344" strokeWidth="8" strokeLinecap="round" />
        <path d={trilha} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
        {temPct ? (
          <path
            d={trilha}
            fill="none"
            pathLength={100}
            stroke={`url(#${uid}-core)`}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={`${pct} ${100 - pct}`}
            filter={`url(#${uid}-glow)`}
          />
        ) : null}
        <circle cx={ROTA_P0.x} cy={ROTA_P0.y} r="6" fill="#083344" stroke="#ecfeff" strokeWidth="2" />
        <circle cx={ROTA_P3.x} cy={ROTA_P3.y} r="6" fill="#0e7490" stroke="#ecfeff" strokeWidth="2" />
        <circle cx={ponto.x} cy={ponto.y} r="8" fill="#ecfeff" opacity="0.35" filter={`url(#${uid}-glow)`} />
        <circle cx={ponto.x} cy={ponto.y} r="4.5" fill="#ffffff" stroke="#22d3ee" strokeWidth="2">
          <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </svg>
      <div className="absolute inset-x-2 top-1 z-40 flex items-center justify-between gap-2">
        <span className="shrink-0 text-[11px] font-black tracking-wide text-cyan-50 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]">
          {rota.origem} <span className="text-cyan-300">➔</span> {rota.destino}
        </span>
        <span className="min-w-0 truncate text-right text-[10px] font-bold text-cyan-100 drop-shadow-[0_0_8px_rgba(34,211,238,0.85)]">
          {km}
          {rota.previsao ? ` · ${rota.previsao}` : ""}
          {temPct ? ` · ${pct}%` : ""}
          {rota.velocidade != null ? ` · ${rota.velocidade} km/h` : ""}
        </span>
      </div>
    </div>
  );
}

/** Lê a imagem e marca os dois faróis na lente, acima da grade e longe do emblema. */
function detectarFarois(img: HTMLImageElement): { x: number; y: number }[] {
  const W = 180;
  const H = Math.max(1, Math.round((img.naturalHeight * W) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth) return [];
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const pixel = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return {
      a: data[i + 3],
      l: 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2],
    };
  };
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  const limiteAgente = Math.floor(W * 0.78);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < limiteAgente; x++) {
      if (pixel(x, y).a > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return [];
  const bw = maxX - minX;
  const bh = maxY - minY;
  const x1 = minX;
  const x2 = minX + Math.floor(bw * 0.42);
  const rows: { y: number; avg: number }[] = [];
  for (let y = minY + Math.floor(bh * 0.36); y <= minY + Math.floor(bh * 0.78); y++) {
    let sum = 0;
    let n = 0;
    for (let x = x1; x <= x2; x++) {
      const p = pixel(x, y);
      if (p.a > 40) {
        sum += p.l;
        n++;
      }
    }
    if (n >= 6) rows.push({ y, avg: sum / n });
  }
  let best: { drop: number; y: number; to: number; from: number } | null = null;
  for (let i = 0; i < rows.length - 5; i++) {
    const drop = rows[i].avg - rows[i + 4].avg;
    if (rows[i].avg > 55 && (!best || drop > best.drop)) {
      best = { drop, y: rows[i].y, to: rows[i + 4].y, from: rows[i].avg };
    }
  }
  if (!best) return [];
  const xs: number[] = [];
  for (let x = x1; x <= x2; x++) {
    const p = pixel(x, best.to);
    if (p.a > 40 && p.l < best.from * 0.55) xs.push(x);
  }
  if (xs.length < 4) return [];
  const g1 = xs[0];
  const g2 = xs[xs.length - 1];
  const gap = Math.max(1, best.to - best.y);
  const y0 = Math.min(H - 1, Math.round(best.to + gap * 0.4));
  const y1 = Math.min(H - 1, Math.round(best.to + gap * 2.4));
  const contraste = (x: number, y: number) => {
    const centro = pixel(x, y);
    if (centro.a <= 40) return -999;
    let sum = 0;
    let n = 0;
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -3], [0, 3], [-3, -2], [3, -2]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const p = pixel(xx, yy);
      if (p.a > 40) {
        sum += p.l;
        n++;
      }
    }
    if (n < 4) return -999;
    return centro.l - sum / n;
  };
  const pico = (xa: number, xb: number, ya: number, yb: number) => {
    let melhor = -999;
    let bx = xa;
    let by = ya;
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const nota = contraste(x, y);
        if (nota > melhor) {
          melhor = nota;
          bx = x;
          by = y;
        }
      }
    }
    return { x: bx, y: by };
  };
  const direito = pico(Math.round(g1 + (g2 - g1) * 0.58), g2, y0, y1);
  const faixa = Math.max(2, gap);
  const esquerdo = pico(g1, Math.round(g1 + (g2 - g1) * 0.24), Math.max(0, direito.y - faixa), Math.min(H - 1, direito.y + faixa));
  return [
    { x: esquerdo.x / W, y: esquerdo.y / H },
    { x: direito.x / W, y: direito.y / H },
  ];
}

function FaroisPiscando({ src }: { src: string }) {
  const [farois, setFarois] = useState<{ left: number; top: number; width: number; height: number }[]>([]);

  useEffect(() => {
    let ativo = true;
    const img = new Image();
    img.onload = () => {
      if (!ativo) return;
      const pontos = detectarFarois(img);
      const largura = 112;
      const altura = 96;
      const escala = Math.min(largura / img.naturalWidth, altura / img.naturalHeight);
      const desenhadaL = img.naturalWidth * escala;
      const desenhadaA = img.naturalHeight * escala;
      const origemX = 0;
      const origemY = altura - desenhadaA;
      const lampadaL = Math.max(8, desenhadaL * 0.055);
      const lampadaA = Math.max(3, desenhadaA * 0.04);
      setFarois(pontos.map((ponto) => ({
        left: origemX + ponto.x * desenhadaL - lampadaL / 2,
        top: origemY + ponto.y * desenhadaA - lampadaA / 2,
        width: lampadaL,
        height: lampadaA,
      })));
    };
    img.src = src;
    return () => {
      ativo = false;
    };
  }, [src]);

  return (
    <>
      {farois.map((farol, indice) => (
        <span
          key={indice}
          className="pointer-events-none absolute z-40 rounded-full bg-white"
          data-testid="farol-pisca"
          style={{
            left: farol.left,
            top: farol.top,
            width: farol.width,
            height: farol.height,
            boxShadow: "0 0 4px 2px #ffffff, 0 0 12px 5px rgba(255,255,255,0.95)",
            animation: "farol-pisca 0.55s steps(2, end) infinite",
          }}
        />
      ))}
    </>
  );
}

function primeiroEUltimo(nome: string): string {
  const particulas = new Set(["de", "da", "do", "dos", "das", "e"]);
  const partes = nome.trim().split(/\s+/).filter((parte) => parte && !particulas.has(parte.toLowerCase()));
  if (partes.length <= 2) return partes.join(" ") || nome;
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function EquipeAoLado({ driver, agent2 }: { driver: string; agent2?: string | null }) {
  const agente = agent2 || "Sem agente";
  return (
    <div className="mb-1 w-[6.4rem] shrink-0 space-y-1 text-[10px] leading-tight">
      <div title={driver}>
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Condutor</div>
        <div className="font-semibold text-slate-100">{primeiroEUltimo(driver)}</div>
      </div>
      <div title={agente}>
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Agente</div>
        <div className="font-semibold text-slate-100">{primeiroEUltimo(agente)}</div>
      </div>
    </div>
  );
}

function glowFor(status: ViaturaStatusType) {
  if (status === "manutencao_vencida") {
    return "border-t-rose-400 border-x-rose-600/40 border-b-2 border-b-black ring-2 ring-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.35)]";
  }
  if (status === "rodizio_sp") {
    return "border-t-amber-400 border-x-amber-600/40 border-b-2 border-b-black ring-2 ring-amber-500/80 shadow-[0_0_25px_rgba(245,158,11,0.3)]";
  }
  if (status === "em_missao" || status === "na_origem") {
    return "border-t-emerald-400/90 border-x-emerald-500/30 border-b-2 border-b-black shadow-[0_0_20px_rgba(16,185,129,0.25),inset_0_1px_2px_rgba(255,255,255,0.16)] ring-1 ring-emerald-500/40";
  }
  if (status === "sem_sinal") {
    return "border-t-rose-500/70 border-x-rose-500/20 border-b-2 border-b-black shadow-[0_0_16px_rgba(244,63,94,0.18)] ring-1 ring-rose-500/30";
  }
  return "border-t border-slate-700/80 border-x border-slate-800/80 border-b-2 border-b-black shadow-[0_12px_24px_-4px_rgba(0,0,0,0.85)]";
}

export function FleetCard3D({
  plate,
  vtr,
  modelo,
  driver,
  agent2,
  cliente = "—",
  origem = "—",
  destino = "—",
  aviso,
  alerta = false,
  status,
  statusText,
  subtitle,
  batteryPct,
  lastMessage,
  osNumber,
  linkAction,
  onSelect,
  carThumbnailUrl = THUMBNAIL,
  rota,
  cartas = [],
  testId,
}: FleetCardProps) {
  const piscaFarol = cartas.length > 0 || alerta;
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const dash = batteryPct == null ? 0 : (Math.max(0, Math.min(100, batteryPct)) / 100) * circ;
  const ring = batteryPct != null && batteryPct < 30 ? "#f59e0b" : "#22d3ee";

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } } : undefined}
      className={`relative w-full rounded-2xl bg-gradient-to-b from-[#131b28] via-[#0c121d] to-[#080d16] p-4
        cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:brightness-110
        flex flex-col justify-between overflow-hidden group ${glowFor(status)}`}
      data-testid={testId}
      data-cartas={cartas.length > 0 ? String(cartas.length) : undefined}
    >
      <style>{`@keyframes farol-pisca { 0%, 46% { opacity: 1; } 50%, 96% { opacity: 0.08; } 100% { opacity: 1; } }`}</style>
      {cartas.length > 0 ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-amber-300 shadow-[0_0_26px_rgba(251,191,36,0.75),inset_0_0_16px_rgba(251,191,36,0.2)]"
          style={{ animation: "farol-pisca 0.9s steps(2, end) infinite" }}
        />
      ) : null}
      {status === "em_missao" || status === "na_origem" ? (
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-emerald-300/40 animate-pulse" />
      ) : null}
      {status === "manutencao_vencida" ? (
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-rose-500/70 shadow-[inset_0_0_24px_rgba(244,63,94,0.18)] animate-[pulse_2s_ease-in-out_infinite]" />
      ) : null}
      {status === "rodizio_sp" ? (
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-amber-400/70 shadow-[inset_0_0_24px_rgba(245,158,11,0.16)] animate-[pulse_2.5s_ease-in-out_infinite]" />
      ) : null}

      <div className="flex items-start justify-between gap-2 z-10">
        <div className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-wider text-slate-100 font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {plate}
            </span>
            {vtr ? <span className="text-[11px] font-black tracking-wide text-cyan-200">{vtr}</span> : null}
          </span>
          {modelo ? <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{modelo}</span> : null}
          {subtitle && subtitle !== "Disponível" ? <span className="block text-[11px] text-slate-400 truncate">{subtitle}</span> : null}
        </div>
        <StatusBadge3D status={status} customText={statusText} />
      </div>

      {aviso ? <div className="mt-1 truncate text-[10px] font-black uppercase tracking-wide text-amber-200">{aviso}</div> : null}

      <div className="mt-2 flex items-end gap-1.5">
        <div className="relative z-30 h-24 w-28 shrink-0">
          <img
            src={carThumbnailUrl}
            alt={`Viatura ${plate}`}
            className="h-full w-full object-contain object-left-bottom [filter:brightness(1.2)_drop-shadow(0_12px_8px_rgba(0,0,0,0.95))_drop-shadow(0_0_12px_rgba(255,255,255,0.7))]"
          />
          {piscaFarol ? <FaroisPiscando src={carThumbnailUrl} /> : null}
        </div>
        <EquipeAoLado driver={driver} agent2={agent2} />
        {rota ? (
          <div className="relative h-28 min-w-0 flex-1 overflow-hidden rounded-xl border border-cyan-400/30 bg-[#061018] shadow-[inset_0_0_36px_rgba(34,211,238,0.28),0_0_18px_rgba(34,211,238,0.15)]">
            <RotaHolo rota={rota} />
            <div className="absolute bottom-1 right-2 z-40 max-w-[80%] truncate text-right text-[10px] font-bold text-cyan-50 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]" title={cliente}>
              <span className="font-semibold text-cyan-300">Cliente </span>{cliente}
            </div>
          </div>
        ) : (
          <div className="mb-1 flex min-w-0 flex-1 items-end justify-end gap-2">
            <div className="min-w-0 text-right text-[10px] leading-tight">
              <div className="truncate text-slate-200" title={cliente}>
                <span className="text-slate-500">Cliente </span>{cliente}
              </div>
              {origem !== "—" || destino !== "—" ? (
                <div className="truncate text-slate-400" title={`${origem} → ${destino}`}>
                  {origem} <span className="text-cyan-400">➔</span> {destino}
                </div>
              ) : null}
              {lastMessage && lastMessage !== "—" ? <div className="truncate text-amber-200/90" title={lastMessage}>{lastMessage}</div> : null}
            </div>
            <div className="relative shrink-0 w-12 h-12">
              <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
                <circle cx="24" cy="24" r={radius} fill="#090f19" stroke="rgba(34,211,238,0.18)" strokeWidth="3" />
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  fill="none"
                  stroke={ring}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-black text-cyan-300 leading-none">
                  {batteryPct == null ? "—" : `${batteryPct}%`}
                </span>
                <span className="text-[8px] text-slate-500 uppercase">Bat</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {rota && lastMessage ? <div className="mt-1 truncate text-[10px] text-amber-200/90" title={lastMessage}>{lastMessage}</div> : null}

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 mt-1 gap-2">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide truncate">
          {osNumber ? `OS ${osNumber}` : "Sem OS vinculada"}
        </span>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {linkAction}
        </div>
      </div>
    </div>
  );
}
