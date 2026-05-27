import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface HlsVideoProps {
  src: string | null | undefined;
  className?: string;
  muted?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  /** Mensagem mostrada quando src está vazio ou falha. */
  fallbackText?: string;
  testId?: string;
}

/**
 * Player HLS minimalista — usa hls.js no Chrome/Firefox e fallback nativo no Safari.
 * Reinicializa quando `src` muda; libera o Hls() no unmount pra não vazar conexão.
 */
export function HlsVideo({
  src,
  className = "",
  muted = true,
  controls = false,
  autoPlay = true,
  fallbackText = "Sem sinal",
  testId,
}: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setError(src ? null : fallbackText);
      return;
    }
    setError(null);

    // Cleanup anterior
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        maxBufferLength: 8,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError("Falha no stream");
          try { hls.destroy(); } catch {}
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari nativo
      video.src = src;
    } else {
      setError("Navegador não suporta HLS");
    }

    return () => {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
    };
  }, [src, fallbackText]);

  return (
    <div className={`relative bg-black ${className}`} data-testid={testId}>
      <video
        ref={videoRef}
        muted={muted}
        autoPlay={autoPlay}
        playsInline
        controls={controls}
        className="w-full h-full object-cover"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 font-mono bg-slate-950/80 pointer-events-none">
          {error}
        </div>
      )}
    </div>
  );
}
