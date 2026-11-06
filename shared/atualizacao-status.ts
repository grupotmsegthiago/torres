import { toDateKey } from "./date-key";

/**
 * Atualização de status é só o texto que o vigilante grava no aplicativo
 * em "Enviar Atualização". Foto de checklist e avanço de etapa gravam
 * outro texto (📷 / 🔄) e não abrem o aviso do painel.
 *
 * No painel entra o status de hoje (America/Sao_Paulo), até alguém marcar
 * como lida. Mensagem de ontem não reabre.
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

/** Início do dia operacional, com o fuso fixo de Brasília (sem horário de verão). */
export function inicioDoDiaOperacionalIso(agora = new Date()): string {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return `${dia}T00:00:00.000-03:00`;
}

/** Sem data, não esconde. Com data, só o dia operacional corrente. */
export function atualizacaoDoDiaOperacional(createdAt: unknown, agora = new Date()): boolean {
  if (createdAt == null || createdAt === "") return true;
  const dia = toDateKey(createdAt);
  if (!dia) return false;
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return dia === hoje;
}

export function atualizacaoVisivelNoPainel(
  item: { message?: string | null; createdAt?: unknown } | null | undefined,
  agora = new Date(),
): boolean {
  if (!item) return false;
  return isAtualizacaoStatusVigilante(item.message) && atualizacaoDoDiaOperacional(item.createdAt, agora);
}

/** A mais recente não lida que é status do vigilante neste dia. A lista entra da mais nova para a mais antiga. */
export function ultimaAtualizacaoStatusNaoLida<T extends { message?: string | null; createdAt?: unknown; readByAdmin?: number | string | null }>(
  updates: T[],
  agora = new Date(),
): T | undefined {
  return updates.find((u) => atualizacaoAindaNaoLida(u.readByAdmin) && atualizacaoVisivelNoPainel(u, agora));
}
