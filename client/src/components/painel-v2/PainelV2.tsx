import type { ReactNode } from "react";

/** Moldura visual do cockpit. Não calcula KPI nem posição — só organiza o que o grid já entregou. */
export function PainelV2({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[1.6rem] border border-slate-800/90 bg-[#070b12] text-slate-100 p-3 sm:p-4 space-y-4
        shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]
        bg-[radial-gradient(circle_at_1px_1px,rgba(56,189,248,0.07)_1px,transparent_0)] [background-size:22px_22px]"
      data-testid="painel-operacional-v2"
    >
      {children}
    </div>
  );
}
