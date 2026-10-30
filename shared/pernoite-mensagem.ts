const RE_PERNOITE = /pernoite/i;
const RE_REINICIO = /\b(rein[ií]cio|reiniciar|reiniciamos|reiniciei|sa[ií]\s*(do)?\s*pernoite|saindo\s*(do)?\s*pernoite|voltei\s+a\s+rodar|em\s+movimento|rodando\s+novamente|retomando\s+viagem)\b/i;

/** Mesma regra do Agente Central: a última mensagem indica pernoite até aparecer reinício. */
export function isPernoiteMessage(msg: string | null | undefined): boolean {
  if (!msg) return false;
  if (RE_REINICIO.test(msg)) return false;
  return RE_PERNOITE.test(msg);
}
