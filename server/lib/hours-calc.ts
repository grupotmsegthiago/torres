/**
 * Cálculo canônico de horas trabalhadas a partir de batidas do Control iD.
 *
 * Esta é a ÚNICA fonte de verdade do cálculo de jornada do sistema.
 * Todas as telas/relatórios que mostram horas trabalhadas devem usar
 * `computeWorkedHours` para garantir resultados consistentes.
 *
 * Algoritmo:
 *  1) Ordena globalmente as batidas por timestamp (ascendente).
 *  2) Deduplica por minuto BRT (mesma minuto = batida duplicada do equipamento).
 *  3) Pareia em (entrada, saída): (0,1), (2,3), (4,5)...
 *     - Funciona para 2 batidas (entrada/saída direta).
 *     - Funciona para 4 batidas (entrada / saída-almoço / volta / saída).
 *     - Funciona para qualquer número par.
 *  4) Atribui a duração do par ao dia BRT da batida de ENTRADA.
 *     Isso garante que turnos cruzando meia-noite (vigilância 12x36, 24h)
 *     sejam contados no dia em que começaram, sem partir nem perder horas.
 *  5) Se sobrar uma batida ímpar no fim, é "ponto em aberto" e não é contado.
 *
 * Convenções:
 *  - BRT = America/Sao_Paulo (UTC-3, sem horário de verão).
 *  - punch_at é armazenado como timestamptz; a função aceita ISO string ou Date.
 */

export interface PunchInput {
  punch_at: string | Date;
}

export interface WorkedHoursResult {
  /** Total em minutos (todos os dias somados). */
  totalMinutes: number;
  /** Total em horas (totalMinutes / 60). */
  totalHours: number;
  /** Minutos trabalhados por dia BRT (yyyy-mm-dd). */
  perDayMinutes: Map<string, number>;
  /** Quantos dias distintos têm jornada > 0. */
  daysWorked: number;
  /** True se a última batida ficou ímpar (turno em aberto). */
  hasOpenShift: boolean;
  /** Timestamp da última batida ímpar (entrada sem saída), ou null. */
  openShiftSince: Date | null;
  /** Pares (entrada, saida) já casados — necessário pra cruzamentos com OS. */
  pairs: Array<{ entrada: Date; saida: Date }>;
}

/** Converte um timestamp para a data BRT yyyy-mm-dd. */
export function ymdBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // BRT = UTC-3 (sem horário de verão). Subtraindo 3h e pegando a data UTC,
  // obtemos o dia BRT correto.
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

/** Cria a chave de minuto BRT para deduplicação (yyyy-mm-ddTHH:MM). */
function minuteKeyBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16);
}

/**
 * Cálculo canônico — recebe todas as batidas de UM funcionário em qualquer
 * intervalo e devolve total + breakdown diário.
 */
export function computeWorkedHours(punches: PunchInput[]): WorkedHoursResult {
  // 1) Ordena ascendente.
  const sorted = punches
    .filter((p) => p && p.punch_at != null)
    .map((p) => (typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at))
    .sort((a, b) => a.getTime() - b.getTime());

  // 2) Dedup por minuto BRT.
  const seen = new Set<string>();
  const clean: Date[] = [];
  for (const d of sorted) {
    const key = minuteKeyBRT(d);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(d);
  }

  const perDayMinutes = new Map<string, number>();
  const pairs: Array<{ entrada: Date; saida: Date }> = [];
  let totalMinutes = 0;

  // 3) Itera em pares (entrada, saída).
  let i = 0;
  for (; i + 1 < clean.length; i += 2) {
    const entrada = clean[i];
    const saida = clean[i + 1];
    const diffMin = (saida.getTime() - entrada.getTime()) / 60000;
    if (diffMin <= 0) continue;
    pairs.push({ entrada, saida });
    // 4) Atribui ao dia BRT da entrada.
    const dayKey = ymdBRT(entrada);
    perDayMinutes.set(dayKey, (perDayMinutes.get(dayKey) || 0) + diffMin);
    totalMinutes += diffMin;
  }

  // 5) Sobrou uma batida ímpar = ponto em aberto.
  const hasOpenShift = i < clean.length;
  const openShiftSince = hasOpenShift ? clean[clean.length - 1] : null;

  let daysWorked = 0;
  for (const min of Array.from(perDayMinutes.values())) {
    if (min > 0) daysWorked++;
  }

  return {
    totalMinutes: Math.round(totalMinutes),
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    perDayMinutes,
    daysWorked,
    hasOpenShift,
    openShiftSince,
    pairs,
  };
}

/**
 * Helper: separa total de horas em "normais" (até 220h/mês) e "extras"
 * (excedente). Usado por folha/custos fixos.
 * Limite mensal CLT padrão = 220h.
 */
export function splitNormalAndOvertime(
  totalHours: number,
  monthlyLimit = 220,
): { horasNormais: number; horasExtras: number } {
  const horasNormais = Math.min(monthlyLimit, totalHours);
  const horasExtras = Math.max(0, totalHours - monthlyLimit);
  return { horasNormais, horasExtras };
}
