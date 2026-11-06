/**
 * Atualização de status é só o texto que o vigilante grava no aplicativo
 * em "Enviar Atualização". Foto de checklist e avanço de etapa gravam
 * outro texto (📷 / 🔄) e não abrem o aviso do painel.
 */

export function isAtualizacaoStatusVigilante(message?: string | null): boolean {
  const texto = String(message ?? "").trim();
  if (!texto) return false;
  if (texto.startsWith("🔄")) return false;
  if (texto.startsWith("📷")) return false;
  if (/^ajuste manual\b/i.test(texto)) return false;
  return true;
}

/** A linha ainda está na fila não lida do painel. */
export function atualizacaoAindaNaoLida(readByAdmin: unknown): boolean {
  return !readByAdmin || readByAdmin === 0 || readByAdmin === "0";
}

/** A mais recente não lida que é status do vigilante. A lista entra da mais nova para a mais antiga. */
export function ultimaAtualizacaoStatusNaoLida<T extends { message?: string | null; readByAdmin?: number | string | null }>(
  updates: T[],
): T | undefined {
  return updates.find((u) => atualizacaoAindaNaoLida(u.readByAdmin) && isAtualizacaoStatusVigilante(u.message));
}
