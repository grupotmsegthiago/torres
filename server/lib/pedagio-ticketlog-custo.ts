export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** 1ª quinzena = dia 1 ao 15. 2ª = dia 16 ao último dia (28, 29, 30 ou 31). */
export function periodoQuinzena(ano: number, mes: number, qual: 1 | 2): { inicio: string; fim: string } {
  const mm = String(mes).padStart(2, "0");
  if (qual === 1) return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-15` };
  const last = String(ultimoDiaDoMes(ano, mes)).padStart(2, "0");
  return { inicio: `${ano}-${mm}-16`, fim: `${ano}-${mm}-${last}` };
}

export function isPeriodoQuinzena(inicio: string, fim: string): boolean {
  const a = String(inicio || "").slice(0, 10);
  const b = String(fim || "").slice(0, 10);
  const m = a.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return false;
  const q1 = periodoQuinzena(ano, mes, 1);
  const q2 = periodoQuinzena(ano, mes, 2);
  return (a === q1.inicio && b === q1.fim) || (a === q2.inicio && b === q2.fim);
}

export type TicketlogPeriodo = {
  periodo_inicio: string;
  periodo_fim: string;
  valor: number;
};

function utcDay(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function inclusiveDays(inicio: string, fim: string): number {
  const n = Math.round((utcDay(fim) - utcDay(inicio)) / 86400000) + 1;
  return n > 0 ? n : 0;
}

function overlapDays(a1: string, a2: string, b1: string, b2: string): number {
  const start = a1 > b1 ? a1 : b1;
  const end = a2 < b2 ? a2 : b2;
  if (start > end) return 0;
  return inclusiveDays(start, end);
}

/**
 * Custo Ticketlog que entra no filtro do Balanço.
 * Período idêntico vale o valor cheio. Senão, rateia os lançamentos que
 * cobrem ou cruzam o filtro, sem somar um dia que já está dentro de um período maior.
 */
export function resolverCustoTicketlog(inicio: string, fim: string, rows: TicketlogPeriodo[]): number {
  const q1 = inicio.slice(0, 10);
  const q2 = fim.slice(0, 10);
  if (!q1 || !q2 || q1 > q2) return 0;

  const overlapping = rows
    .map((r) => ({
      inicio: String(r.periodo_inicio).slice(0, 10),
      fim: String(r.periodo_fim).slice(0, 10),
      valor: Number(r.valor) || 0,
    }))
    .filter((r) => r.inicio && r.fim && r.inicio <= q2 && r.fim >= q1 && r.valor >= 0);

  const exact = overlapping.find((r) => r.inicio === q1 && r.fim === q2);
  if (exact) return Math.round(exact.valor * 100) / 100;

  const covering = overlapping.filter((r) => r.inicio <= q1 && r.fim >= q2);
  if (covering.length > 0) {
    const tight = covering.reduce((best, r) => (inclusiveDays(r.inicio, r.fim) < inclusiveDays(best.inicio, best.fim) ? r : best));
    const span = inclusiveDays(tight.inicio, tight.fim);
    const share = span > 0 ? (inclusiveDays(q1, q2) / span) * tight.valor : 0;
    return Math.round(share * 100) / 100;
  }

  const partes = overlapping.filter((r) => !overlapping.some((outro) =>
    (outro.inicio !== r.inicio || outro.fim !== r.fim) && outro.inicio <= r.inicio && outro.fim >= r.fim,
  ));
  const sum = partes.reduce((acc, r) => {
    const span = inclusiveDays(r.inicio, r.fim);
    const ov = overlapDays(q1, q2, r.inicio, r.fim);
    return acc + (span > 0 ? (ov / span) * r.valor : 0);
  }, 0);
  return Math.round(sum * 100) / 100;
}
