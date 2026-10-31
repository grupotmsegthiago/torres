export function AgenteRelevo({ nome, foto }: { nome: string; foto?: string | null }) {
  const limpo = nome.replace(/^Escoltado:\s*/i, "").trim();
  const inicial = (limpo.split(" ").find(Boolean) || "?").slice(0, 1).toUpperCase();
  const curto = limpo.split(" ").find(Boolean) || limpo;
  return (
    <div className="flex w-[92px] flex-col items-center" title={limpo} data-testid="agente-relevo">
      <div className="relative flex h-[92px] w-full items-end justify-center">
        <span className="pointer-events-none absolute bottom-1 h-2.5 w-14 rounded-full bg-black/85 blur-[2px]" />
        <div
          className="relative h-[76px] w-[76px] overflow-hidden rounded-[22px] border-t border-white/40 border-b-2 border-b-black bg-gradient-to-b from-slate-500 to-slate-950 shadow-[0_14px_16px_rgba(0,0,0,0.88),inset_0_1px_1px_rgba(255,255,255,0.35)]"
        >
          {foto ? (
            <img
              src={foto}
              alt={limpo}
              className="h-full w-full object-cover object-top [filter:contrast(1.06)_saturate(1.05)]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-cyan-900 to-slate-950 text-xl font-black text-cyan-50">
              {inicial}
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent" />
        </div>
      </div>
      <p className="mt-0.5 max-w-full truncate text-center text-[11px] font-bold text-slate-100">{curto}</p>
    </div>
  );
}
