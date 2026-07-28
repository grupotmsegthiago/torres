// Situação financeira por OS (Task #161) — badge + popover "Situação Financeira
// da Missão". O status vem PRONTO do servidor (/api/os-financeiro/situacao),
// derivado das fontes reais (fatura → NF → recebimento). Nunca calcular no front.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExternalLink, FileText, Receipt } from "lucide-react";

export interface SituacaoFinanceiraOS {
  status: string;
  detalhe: string | null;
  causaDivergencia: string | null;
  faturaId: number | null;
  faturaStatus: string | null;
  faturaValor: number | null;
  faturaLiquido: number | null;
  faturaQtdOs: number | null;
  vencimento: string | null;
  diasAtraso: number | null;
  dataPagamento: string | null;
  gateway: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  nfNumero: string | null;
  nfStatus: string | null;
  nfUrl: string | null;
  billingStatus: string | null;
  valorOs: number | null;
  valorAlocado: number | null;
  saldoOs: number | null;
  participacaoPct: number | null;
  percentualFaturaRecebido: number | null;
}

interface SituacaoResponse {
  meta: Record<string, { label: string; color: string }>;
  porOs: Record<string, SituacaoFinanceiraOS>;
}

const BADGE_CLASS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 border border-emerald-300",
  red: "bg-red-100 text-red-700 border border-red-300",
  orange: "bg-orange-100 text-orange-700 border border-orange-300",
  amber: "bg-amber-100 text-amber-800 border border-amber-300",
  blue: "bg-blue-100 text-blue-700 border border-blue-300",
  gray: "bg-neutral-100 text-neutral-600 border border-neutral-300",
};

/** Busca em lote a situação financeira das OSs visíveis (1 request por conjunto). */
export function useSituacaoFinanceira(osIds: number[]) {
  const ids = Array.from(new Set(osIds.filter((x) => Number.isInteger(x) && x > 0))).sort((a, b) => a - b);
  return useQuery<SituacaoResponse>({
    queryKey: ["/api/os-financeiro/situacao", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // Lotes de 500: telas grandes (gestão de OS) podem passar milhares de IDs
      // e o endpoint recusa acima de 2000 — dividir aqui cobre todos os callers.
      const CHUNK = 500;
      const parts: SituacaoResponse[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await apiRequest("POST", "/api/os-financeiro/situacao", { osIds: ids.slice(i, i + CHUNK) });
        parts.push(await res.json());
      }
      return {
        meta: parts[0]?.meta || {},
        porOs: Object.assign({}, ...parts.map((p) => p.porOs || {})),
      };
    },
  });
}

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-neutral-400">{k}</span>
      <span className={strong ? "font-semibold text-white" : "text-neutral-200"}>{v}</span>
    </div>
  );
}

export function SituacaoRecebimentoBadge({
  situacao,
  meta,
  compact,
}: {
  situacao: SituacaoFinanceiraOS | undefined;
  meta: Record<string, { label: string; color: string }> | undefined;
  compact?: boolean;
}) {
  if (!situacao) return <span className="text-xs text-neutral-400">—</span>;
  const m = meta?.[situacao.status] || { label: situacao.status, color: "gray" };
  const cls = BADGE_CLASS[m.color] || BADGE_CLASS.gray;
  const labelCurto =
    situacao.status === "PAGA" && situacao.faturaId ? `Paga — FAT ${situacao.faturaId}` :
    situacao.status === "VENCIDA" && situacao.diasAtraso ? `Vencida há ${situacao.diasAtraso}d` :
    situacao.status === "AGUARDANDO_PAGAMENTO" && situacao.vencimento ? `Em aberto — vence ${situacao.vencimento.slice(8, 10)}/${situacao.vencimento.slice(5, 7)}` :
    m.label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap cursor-pointer hover:opacity-80 ${cls}`}
          data-testid={`badge-situacao-recebimento`}
          title="Ver situação financeira da missão"
        >
          <Receipt className="h-3 w-3" />
          {compact ? m.label : labelCurto}
        </button>
      </PopoverTrigger>
      <PopoverContent onClick={(e) => e.stopPropagation()} className="w-80 bg-neutral-900 border-neutral-700 text-xs text-neutral-200 shadow-xl" align="end">
        <div className="font-semibold text-sm text-white mb-1">Situação Financeira da Missão</div>
        <div className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium mb-2 ${cls}`}>{m.label}</div>
        {situacao.detalhe && <div className="mb-2 text-neutral-300">{situacao.detalhe}</div>}
        {situacao.causaDivergencia && (
          <div className="mb-2 rounded border border-red-800 bg-red-950/60 p-2 text-red-300">{situacao.causaDivergencia}</div>
        )}
        <Row k="Valor da OS (oficial)" v={brl(situacao.valorOs)} strong />
        {situacao.valorAlocado != null && (situacao.valorAlocado > 0 || situacao.status === "PARCIALMENTE_PAGA") && (
          <>
            <Row k="Recebido desta OS" v={brl(situacao.valorAlocado)} strong />
            {(situacao.saldoOs || 0) > 0 && <Row k="Saldo em aberto" v={<span className="text-amber-300 font-semibold">{brl(situacao.saldoOs)}</span>} />}
          </>
        )}
        {situacao.faturaId ? (
          <>
            <div className="mt-2 mb-1 border-t border-neutral-700 pt-2 font-medium text-neutral-300">Fatura #{situacao.faturaId}{situacao.gateway ? ` · ${situacao.gateway.toUpperCase()}` : ""}</div>
            {(situacao.faturaQtdOs || 1) > 1 && (
              <div className="mb-1 text-[11px] text-amber-300">Fatura agrupada — cobre {situacao.faturaQtdOs} OSs</div>
            )}
            <Row k="Valor da fatura" v={brl(situacao.faturaValor)} />
            {situacao.percentualFaturaRecebido != null && situacao.percentualFaturaRecebido < 100 && situacao.percentualFaturaRecebido > 0 && (
              <Row k="Recebido da fatura" v={<span className="text-amber-300 font-semibold">{situacao.percentualFaturaRecebido}%</span>} />
            )}
            {situacao.participacaoPct != null && (situacao.faturaQtdOs || 1) > 1 && (
              <Row k="Participação desta OS" v={`${Number(situacao.participacaoPct).toFixed(0)}%`} />
            )}
            {situacao.faturaLiquido != null && <Row k="Líquido" v={brl(situacao.faturaLiquido)} />}
            <Row k="Vencimento" v={dia(situacao.vencimento)} />
            {situacao.diasAtraso != null && <Row k="Dias em atraso" v={<span className="text-red-400 font-semibold">{situacao.diasAtraso}</span>} />}
            {situacao.dataPagamento && <Row k="Pagamento" v={dia(situacao.dataPagamento)} />}
            {situacao.nfNumero && <Row k="NF" v={`${situacao.nfNumero}${situacao.nfStatus ? ` (${situacao.nfStatus})` : ""}`} />}
            <div className="mt-2 flex flex-wrap gap-2">
              {situacao.invoiceUrl && (
                <a href={situacao.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Abrir fatura
                </a>
              )}
              {situacao.nfUrl && (
                <a href={situacao.nfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
                  <FileText className="h-3 w-3" /> Abrir NF
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 border-t border-neutral-700 pt-2 text-neutral-400">Nenhuma fatura vinculada a esta OS.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
