import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { HlsVideo } from "@/components/admin/hls-video";
import { Button } from "@/components/ui/button";
import { Video, AlertTriangle, ArrowLeft, Bell, Maximize2, Minimize2, Tv, PanelLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SsxVehicle {
  id: number;
  plate: string;
  brand?: string | null;
  model?: string | null;
  frota?: string | null;
  ssx_integration_code: string;
  last_address?: string | null;
  last_speed?: number | null;
  last_ignition?: number | null;
  agent1_name?: string | null;
  agent2_name?: string | null;
}

interface AiAlert {
  id: number;
  vehicle_id: number | null;
  integration_code: string;
  tipo: string;
  gravidade: string;
  ocorrido_em: string;
  ack_at: string | null;
  payload?: any;
}

/**
 * Extrai a URL do clipe gravado do evento do payload bruto que a SSX manda no
 * webhook. Como o formato do payload pode variar, procura primeiro por chaves
 * conhecidas e, se não achar, varre recursivamente por qualquer URL http(s) que
 * pareça um vídeo. Retorna null quando não há clipe → o overlay cai pra câmera
 * ao vivo da viatura.
 */
function extractClipUrl(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  // Só chaves explicitamente de vídeo/clipe — evita tratar um "url"/"link"
  // genérico (ex.: link de painel) como clipe e tentar tocá-lo como vídeo.
  const KNOWN_KEYS = new Set([
    "videourl", "video_url", "video", "clipurl", "clip_url", "clip",
    "mediaurl", "media_url", "eventvideo", "eventvideourl",
    "downloadurl", "download_url", "fileurl", "file_url",
    "recording", "recordingurl", "recording_url",
  ]);
  const looksVideo = (s: string) =>
    /^https?:\/\//i.test(s) && /\.(mp4|m3u8|mov|avi|webm|ts)(\?|$)/i.test(s);
  const seen = new Set<any>();
  function walk(obj: any): string | null {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
    seen.add(obj);
    // 1) chaves conhecidas com valor http(s)
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && KNOWN_KEYS.has(k.toLowerCase()) && /^https?:\/\//i.test(v)) return v;
    }
    // 2) qualquer string que pareça URL de vídeo
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && looksVideo(v)) return v;
    }
    // 3) desce nos objetos/arrays aninhados
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object") {
        const found = walk(v);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(payload);
}

const TOTAL_SLOTS = 12;
const CHANNELS = [1, 2] as const;

/**
 * Mosaico de até 12 quadrantes (6 viaturas × 2 câmeras), em grade 4 colunas ×
 * 3 linhas — quadrantes maiores pra facilitar a leitura na TV da operação.
 * Pagina quando ultrapassa 12. Modo "Foco" exibe 1 viatura em destaque.
 */
export default function CamerasLivePage() {
  const [foco, setFoco] = useState<number | null>(null);
  const [pagina, setPagina] = useState(0);
  const [alertas, setAlertas] = useState<AiAlert[]>([]);
  const [alertaOverlay, setAlertaOverlay] = useState<AiAlert | null>(null);
  const { toast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Modo TV: esconde sidebar/header do AdminLayout pra exibir só o mosaico
  // (ideal pra projetar na televisão da operação). Lê ?tv=1 da URL pra entrar direto.
  const [tvMode, setTvMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("tv") === "1";
  });

  // Fullscreen API + atalho de teclado F11 (intercepta e usa requestFullscreen do container,
  // que é mais limpo que F11 nativo porque mantém a UI da câmera fullscreen sem barra do navegador
  // se possível — o browser pode pedir confirmação na 1ª vez).
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && document.fullscreenElement) {
        // Esc nativo já sai; aqui só sincroniza state
        setIsFullscreen(false);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setTvMode(false); // sair de fullscreen também sai do modo TV
      } else {
        await document.documentElement.requestFullscreen();
        setTvMode(true); // entrar em fullscreen ativa modo TV automaticamente
      }
    } catch (e) {
      // browser bloqueou (sem gesto do usuário etc) — silencia
    }
  }

  function toggleTvMode() {
    setTvMode((v) => !v);
  }

  async function ackAlert(id: number) {
    try {
      const resp = await authFetch(`/api/ssx/alerts/${id}/ack`, { method: "POST" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (_) {
      // Falhou no servidor: NÃO marca local nem fecha — senão a diretoria vê
      // "analisado" sem ter persistido. Mantém o overlay aberto e avisa.
      toast({
        title: "Não foi possível marcar como analisado",
        description: "Verifique a conexão e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, ack_at: new Date().toISOString() } : a)));
    setAlertaOverlay(null);
  }

  const { data, isLoading, error } = useQuery<{ vehicles: SsxVehicle[] }>({
    queryKey: ["/api/ssx/vehicles"],
    refetchInterval: 60_000,
  });

  // Alertas recentes (24h) + realtime
  const { data: alertsData } = useQuery<{ alerts: AiAlert[] }>({
    queryKey: ["/api/ssx/alerts/recent"],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (alertsData?.alerts) setAlertas(alertsData.alerts);
  }, [alertsData]);

  useEffect(() => {
    const ch = supabase.channel("vehicle-ai-alerts");
    ch.on("broadcast", { event: "new-alert" }, (msg: any) => {
      const a = msg?.payload as AiAlert;
      if (!a) return;
      setAlertas((prev) => [{ ...a, ack_at: null }, ...prev].slice(0, 100));
      // Abre o vídeo sobreposto automaticamente quando o alerta chega — só se não
      // houver outro alerta já aberto em análise (não interrompe a diretoria).
      setAlertaOverlay((prev) => prev ?? { ...a, ack_at: null });
    }).subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  const vehicles = data?.vehicles || [];
  const tiles = useMemo(() => {
    const out: { vehicle: SsxVehicle; channel: number }[] = [];
    for (const v of vehicles) for (const ch of CHANNELS) out.push({ vehicle: v, channel: ch });
    return out;
  }, [vehicles]);

  const totalPages = Math.max(1, Math.ceil(tiles.length / TOTAL_SLOTS));
  const start = pagina * TOTAL_SLOTS;
  const visibleTiles = tiles.slice(start, start + TOTAL_SLOTS);
  const emptySlots = Math.max(0, TOTAL_SLOTS - visibleTiles.length);

  const focoVehicle = foco ? vehicles.find((v) => v.id === foco) : null;
  const alertasNaoAck = alertas.filter((a) => !a.ack_at);

  function alertOf(vehicleId: number): AiAlert | undefined {
    return alertasNaoAck.find((a) => a.vehicle_id === vehicleId);
  }

  const content = (
      <div className={`bg-slate-950 text-slate-100 ${tvMode ? "min-h-screen p-2" : "min-h-screen p-4"}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Video className="h-5 w-5 text-indigo-400" />
              Central de Câmeras AO VIVO
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                SSX Tracking
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5" data-testid="text-stats">
              {vehicles.length} viatura(s) integrada(s) • {tiles.length} canal(is) ativo(s) de {TOTAL_SLOTS} por página
              {totalPages > 1 && ` • página ${pagina + 1}/${totalPages}`}
            </p>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            {alertasNaoAck.length > 0 && (
              <button
                onClick={() => setAlertaOverlay(alertasNaoAck[0])}
                className="text-xs bg-red-900/40 border border-red-700 text-red-200 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 animate-pulse hover:bg-red-800/60 cursor-pointer"
                data-testid="badge-alertas"
                title="Abrir o último alerta para análise (vídeo sobreposto)"
              >
                <Bell className="h-3.5 w-3.5" />
                {alertasNaoAck.length} alerta(s) IA pendente(s)
              </button>
            )}
            {totalPages > 1 && !focoVehicle && (
              <>
                <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} data-testid="button-prev-page">
                  ← Anterior
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.min(totalPages - 1, p + 1))} disabled={pagina >= totalPages - 1} data-testid="button-next-page">
                  Próxima →
                </Button>
              </>
            )}
            {focoVehicle && (
              <Button size="sm" onClick={() => setFoco(null)} data-testid="button-back-mosaic">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Voltar ao Mosaico
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={toggleTvMode}
              data-testid="button-tv-mode"
              title={tvMode ? "Mostrar menu lateral" : "Modo TV (esconde menu lateral)"}
            >
              {tvMode ? (
                <><PanelLeft className="h-3.5 w-3.5 mr-1" /> Mostrar menu</>
              ) : (
                <><Tv className="h-3.5 w-3.5 mr-1" /> Modo TV</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleFullscreen}
              data-testid="button-fullscreen"
              title={isFullscreen ? "Sair de tela cheia (F11 ou Esc)" : "Tela cheia (F11) — esconde menu também"}
            >
              {isFullscreen ? (
                <><Minimize2 className="h-3.5 w-3.5 mr-1" /> Sair tela cheia</>
              ) : (
                <><Maximize2 className="h-3.5 w-3.5 mr-1" /> Tela cheia (F11)</>
              )}
            </Button>
          </div>
        </div>

        {/* Loading / erro / vazio */}
        {isLoading && (
          <div className="text-center text-slate-500 py-12 font-mono text-sm">Carregando viaturas integradas…</div>
        )}
        {error && (
          <div className="bg-red-950/40 border border-red-700 text-red-200 p-4 rounded-lg" data-testid="text-error">
            Erro ao carregar veículos: {String((error as any)?.message || error)}
          </div>
        )}
        {!isLoading && vehicles.length === 0 && !error && (
          <div className="bg-amber-950/30 border border-amber-700/50 text-amber-200 p-6 rounded-lg flex items-start gap-3" data-testid="text-empty">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm mb-1">Nenhuma viatura integrada ainda</p>
              <p className="text-xs text-amber-300">
                Para ativar a câmera ao vivo, vá em <span className="font-mono">Veículos</span> → edite cada viatura
                e preencha o campo <span className="font-mono">"Código Integração SSX"</span> com o código fornecido
                pelo portal da SSX. Você disse que tem 5 viaturas, mas só 1 instalada — começa por essa.
              </p>
            </div>
          </div>
        )}

        {/* Modo foco */}
        {focoVehicle && (
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl">
            <div className="border-b border-slate-800 pb-4 mb-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">
                  {focoVehicle.frota ? `${focoVehicle.frota} — ` : ""}{focoVehicle.brand} {focoVehicle.model}
                </h2>
                <p className="text-xs text-indigo-400 font-mono">
                  {focoVehicle.plate} • {focoVehicle.last_address || "sem posição"}
                </p>
                {(focoVehicle.agent1_name || focoVehicle.agent2_name) && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-mono text-slate-300">
                    <span className="font-bold text-indigo-300">🚔 {focoVehicle.plate}</span>
                    {focoVehicle.agent1_name && <span data-testid={`foco-agent1-${focoVehicle.id}`}>🥷 AGT 1: {focoVehicle.agent1_name}</span>}
                    {focoVehicle.agent2_name && <span data-testid={`foco-agent2-${focoVehicle.id}`}>🥷 AGT 2: {focoVehicle.agent2_name}</span>}
                  </div>
                )}
              </div>
              {typeof focoVehicle.last_speed === "number" && (
                <div className="text-right">
                  <span className="text-2xl font-mono font-bold text-emerald-400">{focoVehicle.last_speed}</span>
                  <span className="text-xs text-slate-500 font-mono ml-1">km/h</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {CHANNELS.map((ch) => (
                <FocoCamera key={ch} vehicleId={focoVehicle.id} channel={ch} />
              ))}
            </div>
            {alertOf(focoVehicle.id) && (
              <div className="mt-4 bg-red-950/50 border border-red-500 text-red-200 p-4 rounded-lg animate-pulse" data-testid="alert-foco">
                <p className="font-bold text-sm">⚠️ Alerta IA: {alertOf(focoVehicle.id)!.tipo} ({alertOf(focoVehicle.id)!.gravidade})</p>
              </div>
            )}
          </div>
        )}

        {/* Mosaico */}
        {!focoVehicle && vehicles.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="grid-mosaic">
            {visibleTiles.map(({ vehicle, channel }, idx) => (
              <MosaicTile
                key={`${vehicle.id}-${channel}`}
                vehicle={vehicle}
                channel={channel}
                alert={alertOf(vehicle.id)}
                onFocus={() => setFoco(vehicle.id)}
                testId={`tile-${vehicle.id}-${channel}`}
              />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center min-h-[160px] text-slate-600 text-[10px] font-mono"
                data-testid={`slot-empty-${i}`}
              >
                [ SLOT LIVRE ]
              </div>
            ))}
          </div>
        )}

        {/* Vídeo sobreposto pra análise da diretoria: clipe gravado do evento
            quando a SSX manda o link, senão câmera ao vivo da viatura. */}
        {alertaOverlay && (
          <AlertOverlay
            alert={alertaOverlay}
            vehicle={vehicles.find((v) => v.id === alertaOverlay.vehicle_id) || null}
            onClose={() => setAlertaOverlay(null)}
            onAck={ackAlert}
          />
        )}
      </div>
  );

  // Em modo TV: renderiza sem AdminLayout (sem sidebar/header) — só o mosaico fullscreen
  return tvMode ? content : <AdminLayout>{content}</AdminLayout>;
}

function MosaicTile({
  vehicle, channel, alert, onFocus, testId,
}: {
  vehicle: SsxVehicle;
  channel: number;
  alert?: AiAlert;
  onFocus: () => void;
  testId: string;
}) {
  const { data, error, isLoading } = useQuery<{ url: string }>({
    queryKey: ["/api/ssx/stream", vehicle.id, channel],
    queryFn: async () => {
      const r = await authFetch(`/api/ssx/stream?vehicleId=${vehicle.id}&channel=${channel}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return d;
    },
    refetchInterval: 5 * 60_000, // URL HLS pode expirar; refresca a cada 5min
    retry: 1,
  });

  const isAlerting = !!alert;
  return (
    <div
      className={`relative bg-black rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        isAlerting ? "border-red-600 animate-pulse" : "border-slate-800 hover:border-indigo-500"
      }`}
      onClick={onFocus}
      data-testid={testId}
    >
      <div className="w-full aspect-video bg-slate-950 relative">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-mono">Conectando…</div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-rose-400 font-mono px-2 text-center">
            {String((error as any)?.message || "sem sinal")}
          </div>
        ) : (
          <HlsVideo src={data?.url} className="w-full h-full" />
        )}
        <div className="absolute top-1 left-1 bg-black/70 text-[10px] text-white px-1 rounded font-mono">
          {vehicle.plate} CH{channel}
        </div>
        {/* Overlay agentes — só na CH1 pra não duplicar */}
        {channel === 1 && (vehicle.agent1_name || vehicle.agent2_name) && (
          <div className="absolute top-1 right-1 bg-black/75 text-white text-[9px] font-mono px-1.5 py-1 rounded leading-tight max-w-[60%]">
            <div className="font-bold text-indigo-300 truncate">🚔 {vehicle.plate}</div>
            {vehicle.agent1_name && (
              <div className="truncate" data-testid={`text-agent1-${vehicle.id}`}>
                🥷 AGT 1: {vehicle.agent1_name}
              </div>
            )}
            {vehicle.agent2_name && (
              <div className="truncate" data-testid={`text-agent2-${vehicle.id}`}>
                🥷 AGT 2: {vehicle.agent2_name}
              </div>
            )}
          </div>
        )}
        {typeof vehicle.last_speed === "number" && (
          <div className="absolute bottom-1 left-1 bg-black/70 text-[10px] text-white px-1 rounded font-mono">
            {vehicle.last_speed} km/h
          </div>
        )}
        {isAlerting && (
          <div className="absolute bottom-1 right-1 bg-red-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase animate-pulse">
            🚨 {alert!.tipo}
          </div>
        )}
      </div>
    </div>
  );
}

function FocoCamera({ vehicleId, channel }: { vehicleId: number; channel: number }) {
  const { data, error, isLoading } = useQuery<{ url: string }>({
    queryKey: ["/api/ssx/stream", vehicleId, channel, "foco"],
    queryFn: async () => {
      const r = await authFetch(`/api/ssx/stream?vehicleId=${vehicleId}&channel=${channel}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return d;
    },
    refetchInterval: 5 * 60_000,
  });
  return (
    <div className="bg-black rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
      <div className="p-3 bg-slate-800 text-xs font-bold text-slate-300 font-mono flex justify-between">
        <span>CÂMERA {channel === 1 ? "🛣️ EXTERNA" : "🔄 INTERNA"} (CH {channel})</span>
        <span className="text-emerald-400 animate-pulse">● LIVE</span>
      </div>
      <div className="aspect-video bg-slate-950">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 font-mono text-sm">Conectando…</div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center text-rose-400 font-mono text-sm px-4 text-center">
            {String((error as any)?.message || "sem sinal")}
          </div>
        ) : (
          <HlsVideo src={data?.url} className="w-full h-full" controls />
        )}
      </div>
    </div>
  );
}

/**
 * Overlay de análise de alerta IA pra diretoria. Mostra o clipe gravado do
 * evento quando a SSX manda o link no payload; quando não vem clipe, cai pra
 * câmera ao vivo da viatura (2 canais). Fecha clicando fora ou no botão.
 */
function AlertOverlay({
  alert, vehicle, onClose, onAck,
}: {
  alert: AiAlert;
  vehicle?: SsxVehicle | null;
  onClose: () => void;
  onAck: (id: number) => void;
}) {
  const clipUrl = useMemo(() => extractClipUrl(alert.payload), [alert.payload]);
  const isM3u8 = clipUrl ? /\.m3u8(\?|$)/i.test(clipUrl) : false;
  const quando = (() => {
    try {
      return new Date(alert.ocorrido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch { return alert.ocorrido_em; }
  })();

  // Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="overlay-alert"
    >
      <div
        className="bg-slate-900 border-2 border-red-600 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800 bg-red-950/40">
          <div>
            <h2 className="text-lg font-bold text-red-100 flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              Alerta IA: <span className="uppercase">{alert.tipo || "evento"}</span>
              <span className="text-[10px] uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">{alert.gravidade}</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-1" data-testid="text-overlay-info">
              {vehicle
                ? `${vehicle.frota ? vehicle.frota + " — " : ""}${vehicle.plate}`
                : `Cód. integração ${alert.integration_code}`} • {quando}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onClose} data-testid="button-close-overlay">
            Fechar ✕
          </Button>
        </div>

        {/* Vídeo */}
        <div className="p-4">
          {clipUrl ? (
            <>
              <div className="text-[11px] font-mono text-emerald-400 mb-2">🎬 CLIPE GRAVADO DO EVENTO</div>
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {isM3u8 ? (
                  <HlsVideo src={clipUrl} className="w-full h-full" controls autoPlay={false} muted={false} />
                ) : (
                  <video
                    src={clipUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                    data-testid="video-clip"
                  />
                )}
              </div>
            </>
          ) : vehicle ? (
            <>
              <div className="text-[11px] font-mono text-amber-400 mb-2">
                📡 SEM CLIPE DO EVENTO — CÂMERA AO VIVO DA VIATURA
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CHANNELS.map((ch) => (
                  <FocoCamera key={ch} vehicleId={vehicle.id} channel={ch} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-slate-500 py-12 font-mono text-sm" data-testid="text-overlay-empty">
              Sem clipe do evento e viatura não identificada — não há câmera ao vivo pra exibir.
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
          {!alert.ack_at && (
            <Button size="sm" onClick={() => onAck(alert.id)} data-testid="button-ack-alert">
              Marcar como analisado
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
