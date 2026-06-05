export type CancelGuardResult =
  | { ok: true }
  | { ok: false; code: number; message: string };

/**
 * Regra de cancelamento de lançamento financeiro pelo solicitante.
 *
 * Só é permitido cancelar enquanto o lançamento AINDA aguarda aprovação da
 * diretoria (status === "AGUARDANDO_APROVACAO"). Depois de aprovado (PENDING/
 * PAID) ou recusado (RECUSADA), o usuário comum não pode mais cancelar — só a
 * diretoria mexe (DELETE com requireDiretoria). Lançamentos automáticos (de
 * missão/combustível/etc.) também não podem ser cancelados por aqui.
 */
export function canCancelAguardando(
  tx: { status?: string | null; origin_type?: string | null } | null | undefined,
): CancelGuardResult {
  if (!tx) {
    return { ok: false, code: 404, message: "Lançamento não encontrado" };
  }
  if (tx.origin_type && tx.origin_type !== "manual") {
    return {
      ok: false,
      code: 403,
      message: "Lançamentos automáticos não podem ser cancelados manualmente.",
    };
  }
  if (tx.status !== "AGUARDANDO_APROVACAO") {
    return {
      ok: false,
      code: 403,
      message:
        "Só dá pra cancelar enquanto o lançamento aguarda aprovação da diretoria. Depois de aprovado ou recusado, fale com a diretoria.",
    };
  }
  return { ok: true };
}
