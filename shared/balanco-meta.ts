/** Meta do período = meta mensal × (dias ÷ 30, mês comercial). */
export function metaPeriodoFromMensal(metaMensal: number, daysInPeriod: number): number {
  if (!metaMensal || metaMensal <= 0 || daysInPeriod <= 0) return 0;
  return Math.round((metaMensal / 30) * daysInPeriod * 100) / 100;
}
