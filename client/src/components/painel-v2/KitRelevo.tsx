import type { ClasseKit } from "@shared/kit-visual";

const FOTO: Record<ClasseKit, string> = {
  "38": "/assets/kit-38.png",
  "12": "/assets/kit-12.png",
  pistola: "/assets/kit-pistola.png",
};

const ROTULO: Record<ClasseKit, string> = {
  "38": "Revólver .38",
  "12": "Espingarda 12",
  pistola: "Pistola",
};

const RELEVO = "[filter:brightness(1.2)_contrast(1.08)_drop-shadow(0_8px_4px_rgba(0,0,0,0.9))_drop-shadow(0_1px_0_rgba(255,255,255,0.35))]";

export function KitRelevo({ armas, altura = "h-14" }: { armas: ClasseKit[]; altura?: string }) {
  if (armas.length === 0) return null;
  return (
    <div className="flex w-full items-end gap-1" data-testid="kit-relevo">
      {armas.map((classe) => (
        <div key={classe} className="relative flex min-w-0 flex-1 items-end justify-center" title={ROTULO[classe]}>
          <span className="pointer-events-none absolute bottom-0.5 h-1.5 w-8 rounded-full bg-black/80 blur-[1px]" />
          <img
            src={FOTO[classe]}
            alt={ROTULO[classe]}
            data-testid={`kit-foto-${classe}`}
            className={`relative ${altura} w-auto max-w-full object-contain object-bottom ${RELEVO}`}
          />
        </div>
      ))}
    </div>
  );
}
