/**
 * Helpers de horário de batida de ponto (Control iD).
 *
 * Regra de negócio (placeholder x jornada contínua):
 *   O backend (POST /api/control-id/manual-punch) bloqueia 00:00 e 23:59 como
 *   "provável placeholder", porque batidas-placeholder antigas (00:00→23:59 sem
 *   nada no meio) inflavam jornadas falsas de 24h. Pra inserir mesmo assim é
 *   preciso enviar { force: true }.
 *
 *   No fluxo "Adicionar dia completo (4 batidas)", porém, os horários são
 *   digitados de propósito e há batidas intermediárias reais (almoço), então
 *   uma Saída 23:59 (ou Entrada 00:00) é JORNADA CONTÍNUA/PLANTÃO legítima que
 *   vira a meia-noite — não placeholder. Por isso o fluxo de dia completo
 *   auto-confirma (force) apenas esses horários de borda.
 */

/**
 * Retorna true se o horário (string `YYYY-MM-DDTHH:MM[...]`) é um dos horários
 * de borda 00:00 / 23:59 que o backend bloqueia como provável placeholder.
 */
export function isBoundaryPunchTime(timeStr: string): boolean {
  const hhmm = timeStr.slice(11, 16);
  return hhmm === "00:00" || hhmm === "23:59";
}
