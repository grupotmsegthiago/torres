// Rateio de recebimento por OS dentro de uma fatura — Etapa 2 do Vínculo
// OS↔Fatura (pagamento parcial, rateio e estorno automático).
//
// PURO: sem IO. A parte que grava no banco vive em invoice-payment.ts.
//
// Regra de prioridade do rateio (ordem do dono):
//   1. alocação manual (valorAlocadoManual no item) — respeitada primeiro;
//   2. identificação por item (recebido bate exatamente com o valor de UM item);
//   3. proporcional ao valor de cada item (sempre registrado como automático).
//
// Uma OS só conta como PAGA quando valor alocado >= valor do item - tolerância.

export const TOLERANCIA_CENTAVOS = 0.05;

export interface ItemRateio {
  billingId: string;
  valorItem: number;            // valor da OS dentro da fatura
  valorAlocadoManual?: number | null; // alocação manual prévia (prioridade 1)
}

export interface AlocacaoItem {
  billingId: string;
  valorItem: number;
  valorAlocado: number;
  quitado: boolean;             // alocado >= valorItem - tolerância
  origem: "manual" | "identificado" | "proporcional" | "integral";
}

export interface ResultadoRateio {
  itens: AlocacaoItem[];
  totalItens: number;
  totalAlocado: number;
  integral: boolean;            // recebido cobre todos os itens
  percentualRecebido: number;   // 0-100 sobre o total dos itens
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function ratearRecebimento(itensIn: ItemRateio[], valorRecebido: number): ResultadoRateio {
  const itens = itensIn.filter((i) => Number.isFinite(i.valorItem) && i.valorItem >= 0);
  const totalItens = r2(itens.reduce((s, i) => s + i.valorItem, 0));
  const recebido = Math.max(0, r2(Number(valorRecebido) || 0));

  // Pagamento integral (ou a maior): quita todos os itens pelo valor cheio.
  if (recebido >= totalItens - TOLERANCIA_CENTAVOS && totalItens > 0) {
    return {
      itens: itens.map((i) => ({ billingId: i.billingId, valorItem: r2(i.valorItem), valorAlocado: r2(i.valorItem), quitado: true, origem: "integral" })),
      totalItens, totalAlocado: totalItens, integral: true, percentualRecebido: 100,
    };
  }

  // 1) Alocações manuais têm prioridade e saem do bolo.
  let restante = recebido;
  const out: AlocacaoItem[] = [];
  const semManual: ItemRateio[] = [];
  for (const i of itens) {
    const manual = Number(i.valorAlocadoManual);
    if (Number.isFinite(manual) && manual > 0) {
      const aloc = r2(Math.min(manual, i.valorItem, restante));
      restante = r2(restante - aloc);
      out.push({ billingId: i.billingId, valorItem: r2(i.valorItem), valorAlocado: aloc, quitado: aloc >= i.valorItem - TOLERANCIA_CENTAVOS, origem: "manual" });
    } else {
      semManual.push(i);
    }
  }

  // 2) Identificação por item: restante bate com exatamente UM item em aberto.
  const identificados = semManual.filter((i) => Math.abs(i.valorItem - restante) <= TOLERANCIA_CENTAVOS);
  if (restante > 0 && identificados.length === 1) {
    for (const i of semManual) {
      const isAlvo = i === identificados[0];
      out.push({ billingId: i.billingId, valorItem: r2(i.valorItem), valorAlocado: isAlvo ? r2(restante) : 0, quitado: isAlvo, origem: "identificado" });
    }
    restante = 0;
  } else {
    // 3) Proporcional ao valor de cada item.
    const base = semManual.reduce((s, i) => s + i.valorItem, 0);
    let acumulado = 0;
    semManual.forEach((i, idx) => {
      let aloc: number;
      if (idx === semManual.length - 1) {
        aloc = r2(restante - acumulado); // último leva o resíduo do arredondamento
      } else {
        aloc = base > 0 ? r2((i.valorItem / base) * restante) : 0;
      }
      aloc = Math.max(0, Math.min(aloc, r2(i.valorItem)));
      acumulado = r2(acumulado + aloc);
      out.push({ billingId: i.billingId, valorItem: r2(i.valorItem), valorAlocado: aloc, quitado: aloc >= i.valorItem - TOLERANCIA_CENTAVOS, origem: "proporcional" });
    });
    restante = 0;
  }

  const totalAlocado = r2(out.reduce((s, i) => s + i.valorAlocado, 0));
  return {
    itens: out,
    totalItens,
    totalAlocado,
    integral: totalItens > 0 && totalAlocado >= totalItens - TOLERANCIA_CENTAVOS,
    percentualRecebido: totalItens > 0 ? Math.min(100, Math.round((totalAlocado / totalItens) * 100)) : 0,
  };
}
