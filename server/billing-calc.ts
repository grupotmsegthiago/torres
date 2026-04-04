import { supabaseAdmin } from "./supabase";

export async function getHorasElapsedFromDB(osId: number): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc("calc_mission_elapsed_hours", { p_os_id: osId });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (e: any) {
    console.error(`[calc] RPC calc_mission_elapsed_hours failed for OS ${osId}:`, e.message);
    return 0;
  }
}

export function calcularFaturamentoLive(params: {
  horasMissao: number;
  kmInicial: number;
  kmFinal: number;
  contrato: any;
}): {
  fat_acionamento: number;
  fat_km: number;
  fat_hora_extra: number;
  fat_total: number;
  horas_excedentes: number;
  km_total: number;
  km_excedente: number;
  franquia_horas: number;
  franquia_km: number;
  has_acionamento: boolean;
} {
  const { horasMissao, kmInicial, kmFinal, contrato } = params;
  const n2 = (v: any) => Number(v) || 0;
  const franquiaHoras = n2(contrato.franquia_horas);
  const franquiaKm = n2(contrato.franquia_km) || n2(contrato.franquia_minima_km);
  const valorAcionamento = n2(contrato.valor_acionamento);
  const hasAcionamento = valorAcionamento > 0;
  const valorKmExtra = n2(contrato.valor_km_extra) || n2(contrato.valor_km_carregado);
  const valorHoraExtra = n2(contrato.valor_hora_extra) || n2(contrato.valor_hora_estadia);

  const kmTotal = Math.max(0, kmFinal - kmInicial);
  const kmExcedente = Math.max(0, kmTotal - franquiaKm);

  let fatAcionamento = 0;
  let fatKm = 0;
  let fatHoraExtra = 0;
  let horasExcedentes = 0;

  if (hasAcionamento) {
    fatAcionamento = valorAcionamento;
    fatKm = kmExcedente * valorKmExtra;
    horasExcedentes = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;
    fatHoraExtra = horasExcedentes * valorHoraExtra;
  } else {
    const kmFaturado = Math.max(kmTotal, franquiaKm);
    fatKm = kmFaturado * n2(contrato.valor_km_carregado);
  }

  const fatTotal = fatAcionamento + fatKm + fatHoraExtra;
  const r = (v: number) => Math.round(v * 100) / 100;

  return {
    fat_acionamento: r(fatAcionamento),
    fat_km: r(fatKm),
    fat_hora_extra: r(fatHoraExtra),
    fat_total: r(fatTotal),
    horas_excedentes: r(horasExcedentes),
    km_total: kmTotal,
    km_excedente: r(kmExcedente),
    franquia_horas: franquiaHoras,
    franquia_km: franquiaKm,
    has_acionamento: hasAcionamento,
  };
}
