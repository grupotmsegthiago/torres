import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, AlertTriangle, GitCompareArrows } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { maskBRL, parseBRL } from "@/lib/utils";

export type PedagioFinishReviewValue = {
  confirmed: boolean;
  ready: boolean;
  loading: boolean;
  adjustments: Array<{ id: number; amount: number }>;
  total: number;
  count: number;
};

type CostRow = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: string | number;
  costType?: string | null;
  employeeId?: number | null;
  hasPhoto?: boolean;
  photoUrl?: string | null;
};

function isPedagioExpense(c: CostRow): boolean {
  const cat = String(c.category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!cat.includes("pedagio")) return false;
  return String(c.costType || "expense") !== "revenue";
}

/** Estimativa do sistema — conceito separado do lançamento do agente. */
function isEstimativa(c: CostRow): boolean {
  const d = String(c.description || "");
  if (/\[ESTIMATIVA_/i.test(d)) return true;
  if (/estimativa/i.test(d) && (c.employeeId == null || Number(c.employeeId) === 0)) return true;
  return false;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Bloco obrigatório na finalização da OS: operador confere pedágios (fotos),
 * vê de/para (estimado vs agente) e decide o valor a cobrar.
 * Agente continua registrando normalmente.
 */
export function PedagioFinishReview({
  serviceOrderId,
  active,
  onChange,
  pedagioEstimadoOs,
  testIdPrefix = "pedagio-review",
}: {
  serviceOrderId: number | null | undefined;
  active: boolean;
  onChange: (v: PedagioFinishReviewValue) => void;
  /** Projeção da OS (campo pedagio_estimado) — separado dos lançamentos do agente. */
  pedagioEstimadoOs?: number | null;
  testIdPrefix?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ id: number; src: string | null; loading: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!active || !serviceOrderId) {
      setCosts([]);
      setAmounts({});
      setConfirmed(false);
      setError(null);
      onChangeRef.current({ confirmed: false, ready: false, loading: false, adjustments: [], total: 0, count: 0 });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setConfirmed(false);
    setError(null);
    authFetch(`/api/service-orders/${serviceOrderId}/costs`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Falha ao carregar pedágios");
        if (cancelled) return;
        const list = (Array.isArray(data) ? data : []).filter(isPedagioExpense);
        setCosts(list);
        const map: Record<number, string> = {};
        for (const c of list) {
          map[c.id] = Number(c.amount || 0).toFixed(2).replace(".", ",");
        }
        setAmounts(map);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Erro ao carregar pedágios");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, serviceOrderId]);

  const estimativas = useMemo(() => costs.filter(isEstimativa), [costs]);
  const agentes = useMemo(() => costs.filter((c) => !isEstimativa(c)), [costs]);
  const editable = agentes.length > 0 ? agentes : estimativas;

  const estimadoTotal = useMemo(() => {
    const osEst = Number(pedagioEstimadoOs);
    if (Number.isFinite(osEst) && osEst > 0) return osEst;
    return estimativas.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }, [pedagioEstimadoOs, estimativas]);

  const agentesTotal = useMemo(() => {
    return agentes.reduce((s, c) => s + (parseBRL(amounts[c.id] ?? String(c.amount)) || 0), 0);
  }, [agentes, amounts]);

  const total = useMemo(() => {
    // Cobrança oficial = soma dos editáveis (agentes se houver; senão estimativa).
    // Estimativas do sistema ficam fora quando há agente (zeradas no backend).
    return editable.reduce((s, c) => s + (parseBRL(amounts[c.id] ?? String(c.amount)) || 0), 0);
  }, [editable, amounts]);

  const bateu = useMemo(() => {
    if (agentes.length === 0 || estimadoTotal <= 0) return null;
    return Math.abs(agentesTotal - estimadoTotal) < 0.01;
  }, [agentes.length, agentesTotal, estimadoTotal]);

  const adjustments = useMemo(() => {
    const list: Array<{ id: number; amount: number }> = [];
    for (const c of editable) {
      list.push({ id: c.id, amount: parseBRL(amounts[c.id] ?? String(c.amount)) || 0 });
    }
    // Se há agente, zera estimativas explicitamente no payload (backend também garante).
    if (agentes.length > 0) {
      for (const c of estimativas) {
        list.push({ id: c.id, amount: 0 });
      }
    }
    return list;
  }, [editable, amounts, agentes.length, estimativas]);

  useEffect(() => {
    onChangeRef.current({
      confirmed,
      ready: !loading && !error && confirmed,
      loading,
      adjustments,
      total,
      count: agentes.length > 0 ? agentes.length : estimativas.length,
    });
  }, [confirmed, loading, error, adjustments, total, agentes.length, estimativas.length]);

  const openPhoto = async (costId: number) => {
    if (!serviceOrderId) return;
    setPhotoPreview({ id: costId, src: null, loading: true });
    try {
      const res = await authFetch(`/api/service-orders/${serviceOrderId}/costs/${costId}/photo`);
      const data = await res.json();
      if (!res.ok || !data?.photoUrl) throw new Error(data?.message || "Foto indisponível");
      setPhotoPreview({ id: costId, src: data.photoUrl, loading: false });
    } catch {
      setPhotoPreview({ id: costId, src: null, loading: false });
    }
  };

  if (!active) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2" data-testid={`${testIdPrefix}-box`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-amber-900">Conferência de pedágio obrigatória</p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            Estimativa do sistema e lançamento do agente são coisas diferentes. Compare o de/para e confirme o valor a cobrar do cliente.
          </p>
        </div>
      </div>

      {!loading && !error && (
        <div
          className="rounded-md border border-amber-200 bg-white/80 p-2.5 space-y-1.5"
          data-testid={`${testIdPrefix}-depara`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-600">
            <GitCompareArrows className="w-3.5 h-3.5" /> De/para pedágio
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-neutral-100 bg-neutral-50 px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase text-neutral-400">Estimado (sistema)</p>
              <p className="font-mono font-bold text-neutral-800" data-testid={`${testIdPrefix}-estimado`}>
                {fmt(estimadoTotal)}
              </p>
              <p className="text-[9px] text-neutral-400 mt-0.5">Google/local/manual — projeção</p>
            </div>
            <div className="rounded border border-neutral-100 bg-neutral-50 px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase text-neutral-400">Soma agentes</p>
              <p className="font-mono font-bold text-neutral-800" data-testid={`${testIdPrefix}-agentes`}>
                {fmt(agentesTotal)}
              </p>
              <p className="text-[9px] text-neutral-400 mt-0.5">Lançamentos com foto/valor</p>
            </div>
          </div>
          {bateu === true && (
            <p className="text-[10px] font-bold text-emerald-700" data-testid={`${testIdPrefix}-bateu`}>
              Valores batem — ainda assim valide e confirme para fechar a OS.
            </p>
          )}
          {bateu === false && (
            <p className="text-[10px] font-bold text-red-700" data-testid={`${testIdPrefix}-divergente`}>
              Divergência de {fmt(Math.abs(agentesTotal - estimadoTotal))}. A decisão final é do operador.
            </p>
          )}
          {bateu === null && agentes.length === 0 && (
            <p className="text-[10px] text-amber-800">
              Nenhum pedágio do agente ainda. Você pode confirmar com base na estimativa (ou R$ 0).
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-amber-800 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando pedágios...
        </div>
      ) : error ? (
        <p className="text-xs text-red-600 font-semibold">{error}</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {estimativas.length > 0 && agentes.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-neutral-400 px-0.5">Estimativa do sistema (referência — não soma se houver agente)</p>
              {estimativas.map((c) => (
                <div
                  key={c.id}
                  className="bg-neutral-50 border border-neutral-100 rounded-md px-2 py-1.5 flex justify-between gap-2"
                  data-testid={`${testIdPrefix}-est-${c.id}`}
                >
                  <p className="text-[10px] text-neutral-500 leading-snug flex-1">{c.description || "Estimativa"}</p>
                  <span className="text-[11px] font-mono font-bold text-neutral-600 shrink-0">{fmt(Number(c.amount) || 0)}</span>
                </div>
              ))}
            </div>
          )}

          {editable.length === 0 ? (
            <p className="text-xs text-amber-900 bg-white/70 border border-amber-100 rounded-md px-2 py-1.5" data-testid={`${testIdPrefix}-empty`}>
              Nenhum pedágio lançado nesta OS.
            </p>
          ) : (
            <>
              <p className="text-[9px] font-black uppercase text-neutral-400 px-0.5">
                {agentes.length > 0 ? "Lançamentos do agente (editável)" : "Estimativa a confirmar (editável)"}
              </p>
              {editable.map((c) => {
                const hasPhoto = !!c.hasPhoto || (!!c.photoUrl && String(c.photoUrl).length > 0);
                return (
                  <div key={c.id} className="bg-white border border-amber-100 rounded-md p-2 space-y-1.5" data-testid={`${testIdPrefix}-item-${c.id}`}>
                    <p className="text-[11px] text-neutral-700 font-medium leading-snug">{c.description || "Pedágio"}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[9px] font-bold uppercase text-neutral-400">Valor a cobrar (R$)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amounts[c.id] ?? ""}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [c.id]: maskBRL(e.target.value) }))}
                          className="w-full h-9 px-2 border border-neutral-200 rounded-md text-sm font-mono font-bold"
                          data-testid={`${testIdPrefix}-amount-${c.id}`}
                        />
                      </div>
                      {hasPhoto ? (
                        <button
                          type="button"
                          onClick={() => openPhoto(c.id)}
                          className="mt-4 inline-flex items-center gap-1 h-9 px-2.5 rounded-md bg-amber-100 border border-amber-200 text-[10px] font-bold uppercase text-amber-900 hover:bg-amber-200"
                          data-testid={`${testIdPrefix}-photo-${c.id}`}
                        >
                          <Camera className="w-3.5 h-3.5" /> Foto
                        </button>
                      ) : (
                        <span className="mt-4 text-[10px] text-neutral-400">Sem foto</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <div className="flex justify-between text-xs font-bold text-amber-950 px-0.5">
            <span>Total a cobrar (pedágio)</span>
            <span data-testid={`${testIdPrefix}-total`}>{fmt(total)}</span>
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer select-none pt-1" data-testid={`${testIdPrefix}-confirm`}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={loading || !!error}
        />
        <span className="text-[11px] text-neutral-800 font-semibold leading-snug">
          Validei o de/para e confirmo que o valor acima é o correto para cobrar do cliente e fechar a OS.
        </span>
      </label>

      {photoPreview && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPhotoPreview(null)}
          data-testid={`${testIdPrefix}-photo-modal`}
        >
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 border-b flex justify-between items-center">
              <p className="text-xs font-bold uppercase text-neutral-600">Comprovante</p>
              <button type="button" className="text-xs font-bold text-neutral-500" onClick={() => setPhotoPreview(null)}>Fechar</button>
            </div>
            <div className="bg-neutral-900 min-h-[200px] flex items-center justify-center">
              {photoPreview.loading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : photoPreview.src ? (
                <img src={photoPreview.src} alt="Comprovante pedágio" className="max-h-[70vh] w-full object-contain" />
              ) : (
                <p className="text-sm text-neutral-300">Foto indisponível</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
