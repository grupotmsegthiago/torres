import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  History, Loader2, AlertCircle, Calendar, Landmark, UserCog,
  FileCheck2, Wallet, PlusCircle, Activity,
} from "lucide-react";

interface TraceEvent {
  ts: number;
  at: string | null;
  kind: string;
  who: string | null;
  title: string;
  detail: string | null;
  value: number | null;
}

const TRACE_KIND: Record<string, { label: string; icon: any; dot: string; ring: string }> = {
  criada:     { label: "Criação",      icon: PlusCircle, dot: "bg-indigo-500",  ring: "ring-indigo-100" },
  auditoria:  { label: "Auditoria",    icon: FileCheck2, dot: "bg-slate-400",   ring: "ring-slate-100" },
  baixa:      { label: "Baixa manual", icon: UserCog,    dot: "bg-emerald-500", ring: "ring-emerald-100" },
  vencimento: { label: "Vencimento",   icon: Calendar,   dot: "bg-amber-500",   ring: "ring-amber-100" },
  banco:      { label: "Banco",        icon: Landmark,   dot: "bg-blue-600",    ring: "ring-blue-100" },
  financeiro: { label: "Caixa",        icon: Wallet,     dot: "bg-teal-500",    ring: "ring-teal-100" },
  nota:       { label: "Anotação",     icon: Activity,   dot: "bg-neutral-400", ring: "ring-neutral-100" },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING:          { label: "Pendente",     cls: "bg-amber-100 text-amber-700" },
  CONFIRMED:        { label: "Confirmado",   cls: "bg-blue-100 text-blue-700" },
  RECEIVED:         { label: "Recebido",     cls: "bg-emerald-100 text-emerald-700" },
  RECEIVED_IN_CASH: { label: "Pago Manual",  cls: "bg-emerald-100 text-emerald-700" },
  OVERDUE:          { label: "Vencido",      cls: "bg-red-100 text-red-700" },
  CANCELLED:        { label: "Cancelado",    cls: "bg-neutral-200 text-neutral-600" },
};

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function InvoiceTraceDialog({
  invoiceId, clientName, value, netValue, status, paymentDate, onClose,
}: {
  invoiceId: number;
  clientName: string;
  value?: number | null;
  netValue?: number | null;
  status?: string | null;
  paymentDate?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<{ invoice: any; events: TraceEvent[] }>({
    queryKey: ["/api/invoices", invoiceId, "rastreio"],
  });

  const events = data?.events || [];
  const st = (status && STATUS_LABEL[status]) || null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600" />
            Rastreio da Fatura #{invoiceId}
          </DialogTitle>
          <DialogDescription>
            Rota completa do dinheiro — quem criou, quem deu baixa, e quando o valor entrou.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-xl border bg-neutral-50 p-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-bold text-neutral-900 uppercase" data-testid="text-trace-client">{clientName}</p>
            <p className="text-[11px] text-neutral-500">
              {fmtBRL(value)}{netValue != null && netValue !== value ? ` · líquido ${fmtBRL(netValue)}` : ""}
              {paymentDate ? ` · pago em ${paymentDate}` : ""}
            </p>
          </div>
          {st && <Badge className={`${st.cls} font-bold`}>{st.label}</Badge>}
        </div>

        <div className="mt-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-neutral-400" data-testid="status-trace-loading">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando rastreio…
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm py-6" data-testid="status-trace-error">
              <AlertCircle className="w-4 h-4" /> Não foi possível carregar o rastreio.
            </div>
          )}
          {!isLoading && !isError && events.length === 0 && (
            <p className="text-sm text-neutral-400 py-6 text-center">Nenhum evento registrado para esta fatura.</p>
          )}

          {!isLoading && !isError && events.length > 0 && (
            <ol className="relative space-y-4" data-testid="list-trace-events">
              {events.map((ev, i) => {
                const k = TRACE_KIND[ev.kind] || TRACE_KIND.nota;
                const KIcon = k.icon;
                const when = ev.ts
                  ? new Date(ev.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  : (ev.at || "—");
                return (
                  <li key={i} className="relative flex gap-3" data-testid={`trace-event-${i}`}>
                    <div className="flex flex-col items-center">
                      <span className={`flex items-center justify-center w-8 h-8 rounded-full ${k.dot} text-white ring-4 ${k.ring} shrink-0`}>
                        <KIcon className="w-4 h-4" />
                      </span>
                      {i < events.length - 1 && <span className="w-px flex-1 bg-neutral-200 mt-1" />}
                    </div>
                    <div className="pb-1 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-neutral-900 capitalize">{ev.title}</p>
                        {ev.value != null && (
                          <span className="text-sm font-bold text-emerald-700 shrink-0">{fmtBRL(ev.value)}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        {when}{ev.who ? ` · ${ev.who}` : ""}
                      </p>
                      {ev.detail && (
                        <p className="text-xs text-neutral-600 mt-0.5 break-words">{ev.detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
