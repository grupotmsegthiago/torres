// FONTE ÚNICA de exibição financeira de um escort_billing (Etapa 1 do plano de
// sincronismo, aprovado pela diretoria em 28/07/2026).
//
// Antes, boletim-medicao.tsx e relatorio-faturamento.tsx tinham cada um a sua
// cópia destas regras (soma de componentes, fallback de hora extra/KM, regra
// recusada/cancelada). Agora as telas só exibem o que o servidor manda.
//
// IMPORTANTE: este módulo NUNCA grava nada — é visão de leitura. Valores
// persistidos (fat_*) têm precedência absoluta; os fallbacks só entram quando o
// campo não foi persistido (billings legados), espelhando a regra do motor
// oficial calcularEscolta (server/billing-calc.ts):
//   hora extra fracionada = horasExcedentes × valor (round2)
//   hora extra cheia      = ceil(horasExcedentes) × valor
//   km excedente          = max(0, km_total − franquia) × valor_km_extra (round2)

import { round2, osCanonicalTotal } from "./boletim-totals";

const n = (v: any) => Number(v) || 0;

export interface OficialView {
  acionamento: number;
  hora_extra: number;
  km: number;
  adicional_noturno: number;
  estadia: number;
  pernoite: number;
  pedagio: number;
  outras: number;
  receitas_os: number;
  total: number;
  /** true quando algum componente veio de fallback (não persistido) */
  usa_fallback: boolean;
}

/**
 * Visão financeira oficial de um billing para exibição.
 * @param b linha de escort_billings (snake_case)
 * @param osStatus status da service_order ("recusada" | "cancelada" | ...)
 * @param contrato linha de escort_contracts resolvida p/ a OS (ou null)
 */
export function oficialBillingView(b: any, osStatus?: string | null, contrato?: any | null): OficialView {
  // §8.1 INTOCÁVEL — recusada = R$ 0 em tudo, sempre.
  const isRecusada = osStatus === "recusada" || b?.status === "RECUSADA" || b?.status === "REJEITADA";
  if (isRecusada || !b) {
    return { acionamento: 0, hora_extra: 0, km: 0, adicional_noturno: 0, estadia: 0, pernoite: 0, pedagio: 0, outras: 0, receitas_os: 0, total: 0, usa_fallback: false };
  }

  const ct = contrato || {};
  const franquiaHoras = n(ct.franquia_horas) || n(b.franquia_horas);
  const franquiaKm = n(ct.franquia_km) || n(ct.franquia_minima_km) || n(b.km_franquia);
  const valorHoraExtra = n(ct.valor_hora_extra) || n(b.valor_hora_extra);
  const valorKmExtra = n(ct.valor_km_extra) || n(ct.valor_km_carregado) || n(b.valor_km_extra);
  const horaExtraFracionada = ct.hora_extra_fracionada !== false;

  const horasMissao = n(b.horas_missao);
  const kmTotal = n(b.km_total);
  const kmExcedente = n(b.km_excedente) || Math.max(0, kmTotal - franquiaKm);
  const hrExcedente = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;

  // Fallbacks — MESMA regra do motor oficial calcularEscolta.
  const horaExtraFallback = horaExtraFracionada
    ? round2(hrExcedente * valorHoraExtra)
    : round2(Math.ceil(hrExcedente) * valorHoraExtra);
  const kmFallback = round2(kmExcedente * valorKmExtra);

  let usaFallback = false;
  const acionamento = n(b.fat_acionamento) || (() => { const v = n(ct.valor_acionamento); if (v) usaFallback = true; return v; })();
  const horaExtra = n(b.fat_hora_extra) || (() => { if (horaExtraFallback) usaFallback = true; return horaExtraFallback; })();
  const km = n(b.fat_km) || (() => { if (kmFallback) usaFallback = true; return kmFallback; })();
  const adicionalNoturno = n(b.fat_adicional_noturno);
  const estadia = n(b.fat_estadia);
  const pernoite = n(b.fat_pernoite);
  const pedagio = n(b.despesas_pedagio);
  const outras = n(b.despesas_outras);
  const receitasOs = n(b.receitas_os);

  const somaComponentes = round2(acionamento + horaExtra + km + adicionalNoturno + estadia + pernoite + pedagio + outras + receitasOs);

  // CANCELADA (cliente cancelou, equipe acionada §8.1b): cobra acionamento +
  // extras — quando não há fat_total consistente, soma os componentes.
  const isCancelada = osStatus === "cancelada" || b.status === "CANCELADA" || b.status === "CANCELADO";
  let total: number;
  if (isCancelada) {
    const ft = round2(n(b.fat_total));
    total = ft > 0 ? ft : somaComponentes;
  } else {
    // Regra canônica (billingTotalForBoletim): fat_total persistido > 0 vence;
    // senão soma dos 9 componentes persistidos; senão a soma com fallbacks.
    const ft = round2(n(b.fat_total));
    total = ft > 0 ? ft : (osCanonicalTotal(b) > 0 ? osCanonicalTotal(b) : somaComponentes);
  }

  return {
    acionamento, hora_extra: horaExtra, km, adicional_noturno: adicionalNoturno,
    estadia, pernoite, pedagio, outras, receitas_os: receitasOs,
    total, usa_fallback: usaFallback,
  };
}

/** Resolve o contrato de um billing/OS com a MESMA precedência do /revisar:
 *  OS.escort_contract_id → billing.contract_id → contrato Ativo do cliente. */
export function resolverContratoParaBilling(b: any, os: any | null, contratos: any[]): any | null {
  const byId = (id: any) => contratos.find((c) => String(c.id) === String(id)) || null;
  if (os?.escort_contract_id && byId(os.escort_contract_id)) return byId(os.escort_contract_id);
  if (b?.contract_id && byId(b.contract_id)) return byId(b.contract_id);
  const clientId = b?.client_id ?? os?.client_id;
  if (clientId != null) return contratos.find((c) => String(c.client_id) === String(clientId) && c.status === "Ativo") || null;
  return null;
}
