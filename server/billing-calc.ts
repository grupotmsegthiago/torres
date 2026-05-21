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
  scheduledDate?: string | null,
): number {
  if (!missionStartedAt) return 0;
  const parseDate = (v: string) => {
    const s = String(v);
    return new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
  };
  // Regra: o início para cobrança é o agendamento; se o agente iniciou ANTES do agendamento, usa o início real.
  const realStart = parseDate(missionStartedAt);
  const start = scheduledDate
    ? (() => {
        const sched = parseDate(scheduledDate);
        return realStart.getTime() < sched.getTime() ? realStart : sched;
      })()
    : realStart;
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

/**
 * Agrega mission_costs nos buckets de faturamento.
 *
 * REGRA CRÍTICA — Pedágio repassado ao cliente:
 *   O sistema cria DUAS entries em mission_costs para cada pedágio:
 *     1) cost_type="expense" (custo da empresa)
 *     2) cost_type="revenue" (reembolso ao cliente)
 *   A fórmula fat_total já soma `despesas_pedagio` como receita (repasse),
 *   portanto a entry "revenue" do pedágio NÃO deve ser contabilizada em
 *   `receitas_os` — senão duplica (bug TOR-0179: fat_total=611,24 em vez
 *   de 580,44 quando pedágio aparecia em ambos os lados).
 *
 * Outras receitas (não-pedágio) com cost_type="revenue" continuam somando
 * normalmente em `receitas_os`.
 */
export function splitMissionCostsForBilling(mcs: Array<any>): {
  despesas_pedagio: number;
  despesas_combustivel: number;
  despesas_outras: number;
  receitas_os: number;
  revenueItems: Array<{ id: any; description: string; amount: number; category: string }>;
} {
  let despesas_pedagio = 0;
  let despesas_combustivel = 0;
  let despesas_outras = 0;
  let receitas_os = 0;
  const revenueItems: Array<{ id: any; description: string; amount: number; category: string }> = [];
  const n = (v: any) => Number(v) || 0;
  const r = (v: number) => Math.round(v * 100) / 100;
  for (const mc of mcs || []) {
    const amt = n((mc as any).amount);
    const isRevenue = ((mc as any).cost_type ?? (mc as any).costType) === "revenue";
    const catRaw = String((mc as any).category || "").trim().toLowerCase();
    // Match EXATO da categoria "Pedágio" criada automaticamente pelo sistema.
    // Categorias custom como "Pedágio Cliente" são receitas legítimas e NÃO devem ser ignoradas.
    const isPedagioExpenseCat = catRaw === "pedágio" || catRaw === "pedagio";
    const isCombustivel = catRaw.includes("combustível") || catRaw.includes("combustivel") || catRaw.includes("abastecimento");
    if (isRevenue) {
      // Pedágio duplicado: o sistema cria a entry revenue automaticamente quando há expense
      // de pedágio. NÃO somar em receitas_os — o repasse já está representado por despesas_pedagio
      // na fórmula fat_total.
      if (isPedagioExpenseCat) continue;
      receitas_os += amt;
      revenueItems.push({
        id: (mc as any).id,
        description: (mc as any).description || (mc as any).category || "Receita OS",
        amount: amt,
        category: (mc as any).category || "Outros",
      });
    } else {
      if (isPedagioExpenseCat) despesas_pedagio += amt;
      else if (isCombustivel) despesas_combustivel += amt;
      else despesas_outras += amt;
    }
  }
  return {
    despesas_pedagio: r(despesas_pedagio),
    despesas_combustivel: r(despesas_combustivel),
    despesas_outras: r(despesas_outras),
    receitas_os: r(receitas_os),
    revenueItems,
  };
}

export const DEFAULT_BILLING_CONTRACT = {
  valor_km_carregado: 2.80,
  valor_km_vazio: 1.40,
  valor_km_extra: 2.40,
  franquia_minima_km: 50,
  franquia_km: 50,
  franquia_horas: 3,
  valor_hora_estadia: 50,
  valor_hora_extra: 110,
  valor_acionamento: 0,
  valor_diaria: 200,
  vrp_base: 150,
  adicional_noturno_vrp_pct: 20,
  adicional_noturno_km_pct: 15,
  adicional_periculosidade_pct: 30,
} as const;

export function shouldSkipBillingHours(
  so: { mission_status?: string | null; status?: string | null; scheduled_date?: string | null },
  now: number = Date.now(),
): boolean {
  const missionNotStartedYet = !so.mission_status || so.mission_status === "aguardando";
  const scheduledInFuture = (() => {
    if (!so.scheduled_date) return false;
    const s = String(so.scheduled_date);
    const sched = new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
    return sched.getTime() > now;
  })();
  return missionNotStartedYet || (so.status === "agendada" && scheduledInFuture);
}

export function resolveContractForOs(
  so: { escort_contract_id?: number | null; client_id?: number | null },
  contractMap: Map<number, any>,
  clientContractMap: Map<number, any>,
  defaultContract: any = DEFAULT_BILLING_CONTRACT,
): any {
  if (so.escort_contract_id && contractMap.has(so.escort_contract_id)) {
    return contractMap.get(so.escort_contract_id);
  }
  if (so.client_id && clientContractMap.has(so.client_id)) {
    return clientContractMap.get(so.client_id);
  }
  return defaultContract;
}

export interface ComputeBillingPayloadInput {
  so: any;
  contrato: any;
  photos: Array<{ step: string; km_value: any }>;
  mCosts: Array<{ category?: string | null; amount: any; cost_type?: string | null }>;
  horasMissao: number;
  clientName: string | null;
  empName: string | null;
  emp2Name: string | null;
  vehPlate: string | null;
  nowDate?: Date;
}

export function computeBillingPayloadForOs(input: ComputeBillingPayloadInput) {
  const { so, contrato, photos, mCosts, horasMissao, clientName, empName, emp2Name, vehPlate } = input;
  const now = input.nowDate ?? new Date();
  const n = (v: any) => Number(v) || 0;
  const r = (v: number) => Math.round(v * 100) / 100;
  const toBRT = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

  const kmChegadaPhoto = photos.find((p) => p.step === "km_chegada");
  const kmSaidaPhoto = photos.find((p) => p.step === "km_saida");
  const kmFinalPhoto = photos.find((p) => p.step === "km_final");
  const kmInicial = n(kmChegadaPhoto?.km_value) || n(kmSaidaPhoto?.km_value);
  const kmFinalVal = n(kmFinalPhoto?.km_value);
  const kmFinal = kmFinalVal > kmInicial ? kmFinalVal : kmInicial;

  const missionEndDate = so.completed_date ? new Date(so.completed_date) : now;
  const scheduledDate = so.scheduled_date ? new Date(so.scheduled_date) : null;
  const missionStartDate = so.mission_started_at ? new Date(so.mission_started_at) : null;

  const scheduledTime = scheduledDate ? toBRT(scheduledDate) : undefined;
  const startTime = missionStartDate ? toBRT(missionStartDate) : undefined;
  const endTime = toBRT(missionEndDate);

  const billingStartDate = missionStartDate || scheduledDate;
  const inicioConsiderado = billingStartDate ? toBRT(billingStartDate) : (startTime || scheduledTime || "00:00");

  const km_total = kmFinal - kmInicial;
  const km_carregado = Math.max(0, km_total);

  const billing = calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato });
  let { fat_acionamento, fat_km, fat_hora_extra, fat_total } = billing;
  const { km_excedente, has_acionamento: hasAcionamento } = billing;
  const franquiaKm = billing.franquia_km;

  const isNoturno = (() => {
    const checkH = (t?: string) => {
      if (!t) return false;
      const h = parseInt(t.split(":")[0]);
      return h >= 22 || h < 5;
    };
    return checkH(inicioConsiderado) || checkH(endTime);
  })();
  if (isNoturno) {
    fat_total += (hasAcionamento ? (fat_acionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
  }

  const { despesas_pedagio, despesas_combustivel, despesas_outras, receitas_os } = splitMissionCostsForBilling(mCosts);
  fat_total += despesas_pedagio + receitas_os;

  const pag_vrp = n(contrato.vrp_base);
  const resultado_bruto = fat_total - pag_vrp;

  return {
    service_order_id: so.id,
    client_id: so.client_id, client_name: clientName || "--",
    contract_id: contrato.id || null,
    km_inicial: n(kmInicial), km_final: n(kmFinal), km_vazio: 0,
    km_carregado: n(km_carregado), km_total: n(km_total),
    km_faturado: n(Math.max(km_carregado, franquiaKm)), km_franquia: n(franquiaKm),
    km_excedente: n(km_excedente),
    horario_agendado: scheduledTime || null,
    horario_inicio: startTime || null, horario_fim: endTime || null,
    horario_inicio_considerado: inicioConsiderado,
    horas_missao: r(horasMissao), horas_trabalhadas: r(horasMissao),
    horas_estadia: 0, teve_pernoite: false, is_noturno: isNoturno,
    fat_acionamento: r(fat_acionamento), fat_km: r(fat_km), fat_hora_extra: r(fat_hora_extra), fat_total: r(fat_total),
    valor_franquia: hasAcionamento ? r(fat_acionamento) : r(Math.min(km_carregado, franquiaKm) * n(contrato.valor_km_carregado)),
    valor_km_extra: r(km_excedente * (hasAcionamento ? n(contrato.valor_km_extra) : n(contrato.valor_km_carregado))),
    pag_vrp: r(pag_vrp), pag_total: r(pag_vrp),
    resultado_bruto: r(resultado_bruto), resultado_liquido: r(resultado_bruto),
    margem_percentual: fat_total > 0 ? r((resultado_bruto / fat_total) * 100) : 0,
    vigilante_id: so.assigned_employee_id, vigilante_name: empName || "--",
    vigilante2_id: so.assigned_employee_2_id || null, vigilante2_name: emp2Name || null,
    origem: so.origin || null, destino: so.destination || null,
    placa_viatura: vehPlate || null,
    placa_escoltado: so.escorted_vehicle_plate || null,
    motorista_escoltado: so.escorted_driver_name || null,
    despesas_pedagio: r(despesas_pedagio), despesas_combustivel: r(despesas_combustivel), despesas_outras: r(despesas_outras), receitas_os: r(receitas_os),
    data_missao: (() => {
      const a = so.mission_started_at ? new Date(so.mission_started_at).getTime() : Infinity;
      const b = so.scheduled_date ? new Date(so.scheduled_date).getTime() : Infinity;
      if (a === Infinity && b === Infinity) return now;
      return a <= b ? so.mission_started_at : so.scheduled_date;
    })(),
    status: "A_VERIFICAR" as const, created_by: "CRON" as const,
  };
}

function truncHHMM(t: string): string {
  const parts = t.split(":");
  return `${parts[0]}:${parts[1] || "00"}`;
}

export function calcularInicioCobranca(agendado?: string, chegadaReal?: string): { inicio_considerado: string; usou_agendado: boolean } {
  if (!agendado && !chegadaReal) return { inicio_considerado: "00:00", usou_agendado: false };
  if (!agendado) return { inicio_considerado: truncHHMM(chegadaReal!), usou_agendado: false };
  if (!chegadaReal) return { inicio_considerado: truncHHMM(agendado), usou_agendado: true };
  const toMin = (t: string) => { const p = truncHHMM(t).split(":").map(Number); return p[0] * 60 + (p[1] || 0); };
  const minAg = toMin(agendado);
  const minReal = toMin(chegadaReal);
  if (minReal <= minAg) return { inicio_considerado: truncHHMM(chegadaReal), usou_agendado: false };
  return { inicio_considerado: truncHHMM(agendado), usou_agendado: true };
}

export function calcularHorasTrabalhadas(inicio: string, fim?: string): number {
  if (!fim) return 0;
  const toMin = (t: string) => { const p = truncHHMM(t).split(":").map(Number); return p[0] * 60 + (p[1] || 0); };
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
    const horaExtraFracionada = contrato.hora_extra_fracionada !== false;
    if (horaExtraFracionada) {
      const minutosExcedentes = Math.round(horasExcedentes * 60);
      fat_hora_extra = Math.round((minutosExcedentes / 60) * valorHoraExtra * 100) / 100;
    } else {
      fat_hora_extra = Math.ceil(horasExcedentes) * valorHoraExtra;
    }
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
  const fat_total = (hasAcionamento ? fat_acionamento : 0) + fat_km + fat_hora_extra + fat_estadia + fat_pernoite + fat_adicional_noturno + despesas_pedagio + despesas_outras + receitas_os;

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
