import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  status?: string | null;
  reason?: string | null;
  size?: number;
  className?: string;
}

export function CancelReasonBadge({ status, reason, size = 14, className = "" }: Props) {
  const s = (status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s !== "cancelada" && s !== "recusada") return null;
  const label = s === "recusada" ? "Recusada" : "Cancelada";
  const motivo = (reason || "").trim() || "Motivo não informado";
  const color = s === "recusada"
    ? "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200"
    : "bg-red-100 text-red-700 border-red-300 hover:bg-red-200";
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${color} cursor-help ${className}`}
            data-testid="badge-cancel-reason"
            onClick={(e) => e.stopPropagation()}
          >
            <Info size={size - 2} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-white border shadow-lg p-3">
          <div className="text-xs">
            <p className="font-bold uppercase tracking-wide mb-1" style={{ color: s === "recusada" ? "#c2410c" : "#b91c1c" }}>
              OS {label}
            </p>
            <p className="text-neutral-700 whitespace-pre-wrap break-words">{motivo}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
