/** Mesma frase na tela e na API. A NF não sai sem OS em escort_billings. */
export const NF_SEM_OS_MSG =
  "É obrigatório vincular pelo menos 1 Ordem de Serviço (OS) a esta fatura antes de emitir a Nota Fiscal.";

export function bloqueioNfSemOs(osVinculadas: number): string | null {
  if (!Number.isFinite(osVinculadas) || osVinculadas < 1) return NF_SEM_OS_MSG;
  return null;
}
