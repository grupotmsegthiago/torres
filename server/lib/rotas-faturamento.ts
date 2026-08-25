import { rotaCidades } from "../cron-whatsapp-forward";

export type RotaFaturamentoInput = {
  origin?: string | null;
  destination?: string | null;
  fatTotal: number;
  share: number;
  margemLiquida: number;
  despesas: number;
};

export type RotaFaturamentoItem = {
  rota: string;
  missoes: number;
  fatBruto: number;
  fatAgente: number;
  margemLiquida: number;
  despesas: number;
  lucro: number;
  pctFaturamento: number;
  margemPct: number;
  ticketMedio: number;
};

export type RotasFaturamentoResult = {
  rotas: RotaFaturamentoItem[];
  melhoresRotas: string[];
  totalFaturamento: number;
};

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Agrega faturamento por rota (origem → destino) a partir das OSs do período.
 * Usado no Ponto (Control iD) para o hover de lucratividade por rota.
 */
export function aggregateRotasFaturamento(items: RotaFaturamentoInput[]): RotasFaturamentoResult {
  const map = new Map<string, {
    missoes: number;
    fatBruto: number;
    fatAgente: number;
    margemLiquida: number;
    despesas: number;
  }>();

  for (const item of items) {
    if (item.fatTotal <= 0) continue;
    const rota = rotaCidades(item.origin, item.destination) || "Rota não informada";
    const cur = map.get(rota) || {
      missoes: 0,
      fatBruto: 0,
      fatAgente: 0,
      margemLiquida: 0,
      despesas: 0,
    };
    cur.missoes += 1;
    cur.fatBruto += item.fatTotal;
    cur.fatAgente += item.fatTotal * item.share;
    cur.margemLiquida += item.margemLiquida * item.share;
    cur.despesas += item.despesas * item.share;
    map.set(rota, cur);
  }

  const totalFaturamento = [...map.values()].reduce((s, r) => s + r.fatAgente, 0);

  const rotas: RotaFaturamentoItem[] = [...map.entries()]
    .map(([rota, v]) => {
      const lucro = v.margemLiquida;
      return {
        rota,
        missoes: v.missoes,
        fatBruto: round(v.fatBruto),
        fatAgente: round(v.fatAgente),
        margemLiquida: round(v.margemLiquida),
        despesas: round(v.despesas),
        lucro: round(lucro),
        pctFaturamento: totalFaturamento > 0 ? round((v.fatAgente / totalFaturamento) * 100, 1) : 0,
        margemPct: v.fatAgente > 0 ? round((lucro / v.fatAgente) * 100, 1) : 0,
        ticketMedio: v.missoes > 0 ? round(v.fatAgente / v.missoes) : 0,
      };
    })
    .sort((a, b) => b.fatAgente - a.fatAgente);

  const melhoresRotas = [...rotas]
    .filter((r) => r.missoes >= 1 && r.fatAgente > 0)
    .sort((a, b) => b.margemPct - a.margemPct || b.fatAgente - a.fatAgente)
    .slice(0, 3)
    .map((r) => r.rota);

  return {
    rotas,
    melhoresRotas,
    totalFaturamento: round(totalFaturamento),
  };
}
