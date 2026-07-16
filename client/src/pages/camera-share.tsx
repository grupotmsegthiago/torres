import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HlsVideo } from "@/components/admin/hls-video";
import { Video, ShieldAlert, Clock } from "lucide-react";

interface ShareInfo {
  plate: string;
  brand?: string | null;
  model?: string | null;
  frota?: string | null;
  expiresAt: string;
}

const CHANNEL_LABEL: Record<number, string> = {
  1: "Câmera 1 — Externa",
  2: "Câmera 2 — Interna",
};

/**
 * Página pública de acompanhamento das câmeras da viatura via link externo
 * (token assinado com validade). Sem login — o cliente só enxerga os 2 canais
 * da viatura do link, nada mais do sistema.
 */
export default function CameraSharePage() {
  const [, params] = useRoute("/camera/:token");
  const token = params?.token || "";

  const { data: info, error, isLoading } = useQuery<ShareInfo>({
    queryKey: ["/api/public/camera-share", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/camera-share/${encodeURIComponent(token)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return d;
    },
    enabled: !!token,
    retry: 1,
  });

  // Relógio pra mostrar quando expira / detectar expiração com a página aberta
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!info?.expiresAt) return;
    const check = () => setExpired(Date.now() > new Date(info.expiresAt).getTime());
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [info?.expiresAt]);

  const invalid = !!error || expired || !token;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Video className="h-5 w-5 text-indigo-400" />
              Torres Vigilância — Câmeras ao vivo
            </h1>
            {info && (
              <p className="text-xs text-indigo-300 font-mono mt-0.5" data-testid="text-share-plate">
                {info.frota ? `${info.frota} — ` : ""}
                {[info.brand, info.model].filter(Boolean).join(" ")} • {info.plate}
              </p>
            )}
          </div>
          {info && !invalid && (
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5" data-testid="text-share-expiry">
              <Clock className="h-3.5 w-3.5" />
              Link válido até {new Date(info.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
          )}
        </div>

        {isLoading && (
          <div className="text-center text-slate-500 py-16 font-mono text-sm">Carregando…</div>
        )}

        {invalid && !isLoading && (
          <div className="bg-red-950/40 border border-red-800 text-red-200 p-6 rounded-xl flex items-start gap-3" data-testid="text-share-invalid">
            <ShieldAlert className="h-6 w-6 flex-shrink-0" />
            <div>
              <p className="font-bold">Link inválido ou expirado</p>
              <p className="text-xs text-red-300 mt-1">
                Solicite um novo link de acompanhamento à equipe da Torres Vigilância.
              </p>
            </div>
          </div>
        )}

        {info && !invalid && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((ch) => (
              <ShareCamera key={ch} token={token} channel={ch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareCamera({ token, channel }: { token: string; channel: number }) {
  const { data, error, isLoading, refetch, isFetching } = useQuery<{ url: string }>({
    queryKey: ["/api/public/camera-share", token, "stream", channel],
    queryFn: async () => {
      const r = await fetch(`/api/public/camera-share/${encodeURIComponent(token)}/stream?channel=${channel}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return d;
    },
    refetchInterval: 5 * 60_000, // URL HLS da SSX expira; renova a cada 5min
    retry: 1,
  });

  return (
    <div className="bg-black border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-300">{CHANNEL_LABEL[channel] || `Canal ${channel}`}</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-[10px] text-indigo-300 hover:text-indigo-200 font-mono disabled:opacity-50"
          data-testid={`button-share-refresh-${channel}`}
        >
          {isFetching ? "atualizando…" : "atualizar"}
        </button>
      </div>
      <div className="aspect-video bg-black flex items-center justify-center">
        {isLoading ? (
          <span className="text-slate-600 text-xs font-mono">Conectando…</span>
        ) : error ? (
          <span className="text-slate-500 text-xs font-mono px-4 text-center" data-testid={`text-share-offline-${channel}`}>
            Sem sinal no momento — a viatura pode estar desligada ou fora de cobertura.
          </span>
        ) : (
          <HlsVideo
            src={data?.url}
            className="w-full h-full object-contain"
            controls
            muted
            autoPlay
            fallbackText="Sem sinal"
            testId={`video-share-${channel}`}
          />
        )}
      </div>
    </div>
  );
}
