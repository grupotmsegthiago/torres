import { supabaseAdmin } from "./supabase";

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function calcDistanciaGPS(serviceOrderId: number): Promise<{ km: number; pontos: number }> {
  try {
    const { data: positions, error } = await supabaseAdmin
      .from("mission_positions")
      .select("latitude, longitude")
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: true });
    if (error || !positions || positions.length < 2) return { km: 0, pontos: positions?.length || 0 };

    let totalKm = 0;
    for (let i = 1; i < positions.length; i++) {
      const p1 = positions[i - 1];
      const p2 = positions[i];
      if (p1.latitude && p1.longitude && p2.latitude && p2.longitude) {
        totalKm += haversineDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      }
    }
    return { km: Math.round(totalKm * 100) / 100, pontos: positions.length };
  } catch (e: any) {
    console.error(`[calc] calcDistanciaGPS error OS #${serviceOrderId}:`, e.message);
    return { km: 0, pontos: 0 };
  }
}

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

export function calcHorasElapsedLocal(
  missionStartedAt: string | null | undefined,
  completedDate: string | null | undefined,
): number {
  if (!missionStartedAt) return 0;
  const parseDate = (v: string) => {
    const s = String(v);
    return new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
  };
  const start = parseDate(missionStartedAt);
  const end = completedDate ? parseDate(completedDate) : new Date();
  const diffMs = end.getTime() - start.getTime();
  // Truncar para minutos inteiros (descartar segundos) — hora extra conta só HH:MM
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return Math.max(0, diffMinutes / 60);
}

export function extractKmFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(\d+)\s*km/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

export function calcularFaturamentoLive(params: {
  horasMissao: number;
  kmInicial: number;
  kmFinal: number;
  contrato: any;
  kmRota?: number;
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
  km_rota_limitado: boolean;
} {
  const { horasMissao, kmInicial, kmFinal, contrato, kmRota } = params;
  const n2 = (v: any) => Number(v) || 0;
  const franquiaHoras = n2(contrato.franquia_horas);
  const franquiaKm = n2(contrato.franquia_km) || n2(contrato.franquia_minima_km);
  const valorAcionamento = n2(contrato.valor_acionamento);
  const hasAcionamento = valorAcionamento > 0;
  const valorKmExtra = n2(contrato.valor_km_extra) || n2(contrato.valor_km_carregado);
  const valorHoraExtra = n2(contrato.valor_hora_extra) || n2(contrato.valor_hora_estadia);

  const kmOdometro = Math.max(0, kmFinal - kmInicial);
  const kmRotaLimitado = kmRota && kmRota > 0 && kmOdometro > kmRota;
  const kmTotal = kmRotaLimitado ? kmRota : kmOdometro;
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
    km_rota_limitado: !!kmRotaLimitado,
  };
}

export function calcularInicioCobranca(agendado?: string, chegadaReal?: string): { inicio_considerado: string; usou_agendado: boolean } {
  if (!agendado && !chegadaReal) return { inicio_considerado: "00:00", usou_agendado: false };
  if (!agendado) return { inicio_considerado: chegadaReal!, usou_agendado: false };
  if (!chegadaReal) return { inicio_considerado: agendado, usou_agendado: true };
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const minAg = toMin(agendado);
  const minReal = toMin(chegadaReal);
  if (minReal <= minAg) return { inicio_considerado: chegadaReal, usou_agendado: false };
  return { inicio_considerado: agendado, usou_agendado: true };
}

export function calcularHorasTrabalhadas(inicio: string, fim?: string): number {
  if (!fim) return 0;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  let diff = toMin(fim) - toMin(inicio);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

export function calcularEscolta(dados: {
  km_inicial: number; km_final: number; km_vazio: number;
  horas_missao: number; horas_estadia: number; teve_pernoite: boolean;
  horario_inicio?: string; horario_fim?: string;
  horario_agendado?: string;
  despesas_pedagio: number; despesas_combustivel: number; despesas_outras: number;
  receitas_os?: number;
  contrato: any;
  kmRota?: number;
}) {
  const { km_inicial, km_final, km_vazio, horas_estadia, teve_pernoite, horario_inicio, horario_fim, horario_agendado, despesas_pedagio, despesas_combustivel, despesas_outras, contrato, kmRota } = dados;
  const receitas_os = Number(dados.receitas_os) || 0;

  if (km_final < km_inicial) throw new Error("KM final não pode ser menor que KM inicial");

  const n = (v: any) => Number(v) || 0;
  const hasAcionamento = n(contrato.valor_acionamento) > 0;
  const franquiaKm = n(contrato.franquia_km) || n(contrato.franquia_minima_km);
  const franquiaHoras = n(contrato.franquia_horas);
  const valorKmCarregado = n(contrato.valor_km_carregado);
  const valorKmVazio = n(contrato.valor_km_vazio);
  const valorKmExtra = n(contrato.valor_km_extra) || valorKmCarregado;
  const valorHoraExtra = n(contrato.valor_hora_extra) || n(contrato.valor_hora_estadia);
  const valorAcionamento = n(contrato.valor_acionamento);

  const { inicio_considerado, usou_agendado } = calcularInicioCobranca(horario_agendado, horario_inicio);
  const horas_trabalhadas_calc = horario_fim ? calcularHorasTrabalhadas(inicio_considerado, horario_fim) : dados.horas_missao;
  const horas_missao = horas_trabalhadas_calc > 0 ? horas_trabalhadas_calc : dados.horas_missao;

  const kmOdometro = km_final - km_inicial;
  const km_total = (kmRota && kmRota > 0 && kmOdometro > kmRota) ? kmRota : kmOdometro;
  const km_carregado = Math.max(0, km_total - km_vazio);

  const km_franquia = franquiaKm;
  const km_excedente = Math.max(0, km_carregado - km_franquia);
  const km_faturado_carregado = Math.max(km_carregado, km_franquia);
  const require_photo = km_total > 500;

  const isNoturno = (() => {
    const checkHour = (t?: string) => {
      if (!t) return false;
      const h = parseInt(t.split(":")[0]);
      return h >= 22 || h < 5;
    };
    return checkHour(inicio_considerado) || checkHour(horario_fim);
  })();

  const despesas_total = despesas_pedagio + despesas_combustivel + despesas_outras;

  let fat_km_carregado: number;
  let fat_km_vazio: number;
  let fat_km: number;
  let valor_franquia: number;
  let valor_km_extra_calc: number;
  let fat_acionamento = 0;
  let fat_hora_extra = 0;

  if (hasAcionamento) {
    fat_acionamento = valorAcionamento;
    fat_km_carregado = km_excedente * valorKmExtra;
    fat_km_vazio = km_vazio * valorKmVazio;
    fat_km = fat_km_carregado + fat_km_vazio;
    valor_franquia = valorAcionamento;
    valor_km_extra_calc = fat_km_carregado;
    const horasExcedentes = Math.max(0, horas_missao - franquiaHoras);
    fat_hora_extra = horasExcedentes * valorHoraExtra;
  } else {
    fat_km_carregado = km_faturado_carregado * valorKmCarregado;
    fat_km_vazio = km_vazio * valorKmVazio;
    fat_km = fat_km_carregado + fat_km_vazio;
    valor_franquia = Math.min(km_carregado, km_franquia) * valorKmCarregado;
    valor_km_extra_calc = km_excedente * valorKmCarregado;
  }

  const fat_estadia = horas_estadia * n(contrato.valor_hora_estadia);
  const fat_pernoite = teve_pernoite ? n(contrato.valor_diaria) : 0;
  let fat_adicional_noturno = 0;
  if (isNoturno) {
    fat_adicional_noturno = (hasAcionamento ? (fat_acionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
  }
  const fat_total = (hasAcionamento ? fat_acionamento : 0) + fat_km + fat_hora_extra + fat_estadia + fat_pernoite + fat_adicional_noturno + despesas_pedagio + despesas_outras;

  let pag_vrp = n(contrato.vrp_base);
  let pag_periculosidade = 0;
  const periculosidadeHorasLimite = n(contrato.periculosidade_horas_limite);
  if (periculosidadeHorasLimite > 0 && horas_missao > periculosidadeHorasLimite) {
    const horas_extras = horas_missao - periculosidadeHorasLimite;
    const valor_hora_base = pag_vrp / periculosidadeHorasLimite;
    pag_periculosidade = horas_extras * valor_hora_base * (n(contrato.adicional_periculosidade_pct) / 100);
  }
  let pag_adicional_noturno = 0;
  if (isNoturno) {
    pag_adicional_noturno = pag_vrp * (n(contrato.adicional_noturno_vrp_pct) / 100);
  }
  const pag_reembolsos = despesas_total;
  const pag_total = pag_vrp + pag_periculosidade + pag_adicional_noturno + pag_reembolsos;

  const resultado_bruto = fat_total - pag_total;
  const resultado_liquido = resultado_bruto - despesas_total;
  const margem_pct = fat_total > 0 ? (resultado_liquido / fat_total) * 100 : 0;

  const r = (v: number) => Math.round(v * 100) / 100;

  return {
    km_carregado, km_vazio, km_total, km_faturado: km_faturado_carregado, require_photo, is_noturno: isNoturno,
    km_franquia, km_excedente: r(km_excedente), valor_franquia: r(valor_franquia), valor_km_extra: r(valor_km_extra_calc),
    horario_inicio_considerado: inicio_considerado, usou_agendado, horas_trabalhadas: r(horas_missao),
    modelo_acionamento: hasAcionamento,
    fat_acionamento: r(fat_acionamento), fat_hora_extra: r(fat_hora_extra),
    franquia_horas: franquiaHoras, franquia_km: franquiaKm,
    faturamento: {
      acionamento: r(fat_acionamento), km_carregado: r(fat_km_carregado), km_vazio: r(fat_km_vazio),
      hora_extra: r(fat_hora_extra),
      estadia: r(fat_estadia), diaria: fat_pernoite, adicional_noturno: r(fat_adicional_noturno),
      total: r(fat_total),
    },
    pagamento: {
      vrp: pag_vrp, periculosidade: r(pag_periculosidade),
      adicional_noturno: r(pag_adicional_noturno), reembolsos: pag_reembolsos,
      total: r(pag_total),
    },
    despesas: { pedagio: despesas_pedagio, combustivel: despesas_combustivel, outras: despesas_outras, total: despesas_total },
    receitas_os: r(receitas_os),
    resultado: { bruto: r(resultado_bruto), liquido: r(resultado_liquido), margem_pct: r(margem_pct) },
    fat_km: r(fat_km), fat_estadia: r(fat_estadia), fat_pernoite,
    fat_adicional_noturno: r(fat_adicional_noturno), fat_total: r(fat_total),
    pag_vrp, pag_periculosidade: r(pag_periculosidade),
    pag_adicional_noturno: r(pag_adicional_noturno), pag_reembolsos, pag_total: r(pag_total),
  };
}
