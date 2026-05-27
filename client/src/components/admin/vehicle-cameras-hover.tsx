import { useState, useEffect, ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { HlsVideo } from "./hls-video";
import { Video, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/queryClient";

interface VehicleCamerasHoverProps {
  vehicleId: number | string;
  plate?: string | null;
  /** Quando true, indica que NÃO há ssx_integration_code cadastrado pra esse veículo. */
  noIntegration?: boolean;
  children: ReactNode;
  /** Atraso pra abrir (ms). Default 350ms — evita popover aparecer sem querer. */
  openDelay?: number;
}

type StreamState = {
  url?: string;
  error?: string;
  loading: boolean;
};

async function fetchStream(vehicleId: number | string, channel: number): Promise<{ url: string }> {
  const resp = await authFetch(`/api/ssx/stream?vehicleId=${vehicleId}&channel=${channel}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

/**
 * Hover-card reutilizável: renderiza as 2 câmeras (canal 1 + 2) da viatura
 * sob demanda. Só consulta a API SSX quando o card abre (evita warm-up
 * inútil de stream pra todos os veículos da lista).
 */
export function VehicleCamerasHover({
  vehicleId,
  plate,
  noIntegration,
  children,
  openDelay = 350,
}: VehicleCamerasHoverProps) {
  const [open, setOpen] = useState(false);
  const [cam1, setCam1] = useState<StreamState>({ loading: false });
  const [cam2, setCam2] = useState<StreamState>({ loading: false });

  useEffect(() => {
    if (!open || noIntegration) return;
    let cancel = false;
    setCam1({ loading: true });
    setCam2({ loading: true });
    fetchStream(vehicleId, 1)
      .then((d) => !cancel && setCam1({ loading: false, url: d.url }))
      .catch((e) => !cancel && setCam1({ loading: false, error: String(e?.message || e) }));
    fetchStream(vehicleId, 2)
      .then((d) => !cancel && setCam2({ loading: false, url: d.url }))
      .catch((e) => !cancel && setCam2({ loading: false, error: String(e?.message || e) }));
    return () => {
      cancel = true;
    };
  }, [open, vehicleId, noIntegration]);

  return (
    <HoverCard openDelay={openDelay} closeDelay={120} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-[560px] p-3 bg-slate-950 border border-slate-700 shadow-2xl"
        data-testid={`hover-cameras-${vehicleId}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
            <Video className="h-3.5 w-3.5 text-indigo-400" />
            <span className="font-bold">CÂMERAS AO VIVO</span>
            {plate && <span className="text-slate-400">• {plate}</span>}
          </div>
          <span className="text-[10px] text-emerald-400 font-mono animate-pulse">● LIVE</span>
        </div>

        {noIntegration ? (
          <div className="bg-amber-950/40 border border-amber-700/50 rounded p-3 flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Veículo sem código de integração SSX cadastrado. Vá em Veículos → editar → preencher "Código Integração SSX".</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <CameraTile label="🛣️ EXTERNA (CH 1)" state={cam1} testId={`cam-1-${vehicleId}`} />
            <CameraTile label="🔄 INTERNA (CH 2)" state={cam2} testId={`cam-2-${vehicleId}`} />
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function CameraTile({ label, state, testId }: { label: string; state: StreamState; testId: string }) {
  return (
    <div className="bg-black rounded overflow-hidden border border-slate-800">
      <div className="px-2 py-1 bg-slate-900 text-[10px] font-mono text-slate-300 flex items-center justify-between">
        <span>{label}</span>
      </div>
      <div className="aspect-video bg-slate-950">
        {state.loading ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Conectando…
          </div>
        ) : state.error ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-rose-400 font-mono px-2 text-center">
            {state.error}
          </div>
        ) : (
          <HlsVideo src={state.url} className="w-full h-full" testId={testId} />
        )}
      </div>
    </div>
  );
}
