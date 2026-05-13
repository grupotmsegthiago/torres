import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

type CriticalNotification = {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  related_type: string | null;
  related_id: number | null;
  created_at: string;
};

export function CriticalAlertGate() {
  const { user } = useAuth();
  const { data = [] } = useQuery<CriticalNotification[]>({
    queryKey: ["/api/notifications/critical"],
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const [acking, setAcking] = useState(false);
  const ackMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/ack`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/critical"] });
    },
  });

  if (!user || data.length === 0) return null;

  const current = data[0];
  const isVehicleMaint = current.type === "vehicle_maintenance";
  const Icon = isVehicleMaint ? Wrench : AlertTriangle;
  const totalRemaining = data.length;

  const handleAck = async () => {
    setAcking(true);
    try {
      await ackMutation.mutateAsync(current.id);
    } finally {
      setAcking(false);
    }
  };

  const createdBR = new Date(current.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      data-testid="critical-alert-gate"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-4 border-red-500">
        <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-100">
              Aviso obrigatório {totalRemaining > 1 ? `(${totalRemaining})` : ""}
            </p>
            <h2 className="text-base font-black text-white uppercase tracking-wide" data-testid="text-alert-title">
              {current.title}
            </h2>
          </div>
        </div>

        <div className="p-5">
          <p className="text-sm text-neutral-800 leading-relaxed mb-3" data-testid="text-alert-message">
            {current.message}
          </p>
          <p className="text-[11px] text-neutral-400 mb-5">Emitido em {createdBR}</p>

          <Button
            onClick={handleAck}
            disabled={acking}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider text-sm py-5"
            data-testid="button-ack-alert"
          >
            {acking ? "Confirmando..." : totalRemaining > 1 ? "Estou ciente — próximo aviso" : "Estou ciente"}
          </Button>

          <p className="text-[10px] text-center text-neutral-400 mt-3">
            Você precisa confirmar a ciência para continuar usando o aplicativo.
          </p>
        </div>
      </div>
    </div>
  );
}
