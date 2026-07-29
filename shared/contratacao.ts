/**
 * Regime de contratação do colaborador.
 * - clt: folha completa (impostos, provisões, HE, benefícios CCT)
 * - pj:  valor fixo mensal — sem impostos, variáveis nem hora extra
 *
 * Legado: "fixo" é tratado como alias de "pj".
 */
export type TipoContratacao = "clt" | "pj";

export function normalizeTipoContratacao(
  tipo: string | null | undefined,
): TipoContratacao {
  const t = String(tipo || "clt").toLowerCase().trim();
  if (t === "pj" || t === "fixo") return "pj";
  return "clt";
}

/** true = CLT (encargos/HE/benefícios variáveis). false = PJ (valor fixo). */
export function isCltContrato(tipo: string | null | undefined): boolean {
  return normalizeTipoContratacao(tipo) === "clt";
}

export function labelTipoContratacao(tipo: string | null | undefined): string {
  return normalizeTipoContratacao(tipo) === "pj" ? "PJ" : "CLT";
}
