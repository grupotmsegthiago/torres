export function promptCancellationReason(
  newStatus: "recusada" | "cancelada",
  currentReason?: string | null
): string | null {
  const label = newStatus === "recusada" ? "RECUSA" : "CANCELAMENTO";
  const acao = newStatus === "recusada" ? "recusar" : "cancelar";
  const seed = (currentReason || "").trim();
  const msg = `Informe o motivo da ${label} desta OS (mínimo 3 caracteres):\n\nEsta informação aparecerá em todas as telas que mostrarem esta OS.`;
  const raw = window.prompt(msg, seed);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3) {
    window.alert(`Motivo obrigatório para ${acao} a OS. Digite pelo menos 3 caracteres.`);
    return promptCancellationReason(newStatus, currentReason);
  }
  return trimmed;
}
