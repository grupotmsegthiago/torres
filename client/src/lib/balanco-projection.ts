// Projeção de faturamento do Balanço Gerencial — núcleo PURO e testável.
//
// Regra de negócio (Task: Balanço por data de agendamento):
// - Cada missão pertence ao dia do seu agendamento (`scheduled_date`, BRT). O faturamento de um
//   período (Semanal/Mensal/...) pode incluir missões AGENDADAS para os próximos dias do período,
//   que ainda NÃO rodaram.
// - A projeção para o fim do período deve extrapolar SÓ o ritmo realizado (faturamento dos dias já
//   decorridos), sem misturar os agendamentos futuros que já estão dentro do período — senão a
//   média diária infla (ex.: dividir o total incl. futuro por 1 dia decorrido).
// - A projeção nunca pode ficar abaixo do que já está contratado no período (realizado + agendado).

export interface ProjectionInput {
  /** Faturamento das missões agendadas em dias já decorridos (data <= hoje, BRT). */
  realizadoFat: number;
  /** Faturamento total do período (realizado + agendado para dias futuros do período). */
  totalFat: number;
  /** Dias já decorridos no período (>= 1). */
  elapsedDays: number;
  /** Total de dias do período. */
  daysInPeriod: number;
  /** Período inteiro já terminou (passado). */
  isPast: boolean;
}

export interface ProjectionResult {
  /** Faturamento agendado/previsto (futuro dentro do período). */
  agendadoFat: number;
  /** Média diária baseada SÓ no realizado. */
  dailyAvg: number;
  /** Projeção para o fim do período. */
  projection: number;
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const elapsed = Math.max(1, input.elapsedDays);
  const agendadoFat = Math.max(0, input.totalFat - input.realizadoFat);
  const dailyAvg = input.realizadoFat / elapsed;
  // Passado: total fechado. Futuro: extrapola o ritmo realizado, mas nunca abaixo do já contratado.
  const projection = input.isPast
    ? input.totalFat
    : Math.max(dailyAvg * input.daysInPeriod, input.totalFat);
  return { agendadoFat, dailyAvg, projection };
}
