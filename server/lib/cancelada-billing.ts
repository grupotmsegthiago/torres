import { supabaseAdmin } from "../supabase";
import { calcularEscolta } from "../billing-calc";
import { isCanceladaPriceTable100km3, pickCanceladaPriceTable } from "../../shared/cancelada-price-table";

// =============================================================================
// FATURAMENTO DE OS CANCELADA — Tabela de 100 km (funcionamento mínimo)
// -----------------------------------------------------------------------------
// Regra do dono (ordem explícita p/ mudar a §8.1 de "cancelada"):
//   Toda OS CANCELADA usa exclusivamente a tabela persistida em
//   service_orders.escort_contract_id. Cobra-se o valor base dessa tabela
//   (acionamento). Se houver excedente real de km/horas, computa-se normalmente
//   (km extra + hora extra fracionada). Se ficar dentro da franquia (≤100 km e
//   ≤3 h), cobra-se SOMENTE o valor da tabela de 100 km. Isso vale para toda OS
//   cancelada, inclusive quando a equipe nem foi acionada (mínimo = acionamento).
//
// A cobrança usa a tabela ativa do cliente com franquia 100 km e 3 h.
// Se houver mais de uma, entra a de nome "100 km" com o menor acionamento.
// A tabela maior vinculada na OS (200 km, 500 km etc.) não vale para cancelada.
//
// NUNCA usar pagamento aqui: cancelamento é faturamento (receita); pag_* = 0,
// resultado = fat_total. Consistente com o billing de cancelamento histórico.
// =============================================================================

const n = (v: any) => Number(v) || 0;
const toBRT = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

export const CANCELADA_CLEAN_FINANCIAL_FIELDS = {
  receitas_os: 0,
  despesas_pedagio: 0,
  despesas_combustivel: 0,
  despesas_outras: 0,
  desp_total: 0,
  desp_pedagio: 0,
  desp_combustivel: 0,
  desp_outras: 0,
  pag_vrp: 0,
  pag_periculosidade: 0,
  pag_adicional_noturno: 0,
  pag_reembolsos: 0,
  pag_total: 0,
} as const;

export interface CanceladaOperador {
  houveDeslocamento: boolean;
  kmInicial: number;
  kmFinal: number;
  inicioIso: string;
  fimIso: string;
  valorPedagio: number;
}

export interface CanceladaInput {
  serviceOrderId: number;
  clientId: number | null | undefined;
  escortContractId?: string | null;
  scheduledDate?: string | null;
  missionStartedAt?: string | null;
  completedDate?: string | null;
  stepLogs?: any[];
  operador?: CanceladaOperador | null;
}

function asBrtIso(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fatos digitados no cancelamento. Horário sem fuso entra como horário de Brasília. */
export function validarCancelamentoOperador(
  raw: unknown,
): { ok: true; value: CanceladaOperador } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Informe horários, quilometragem, deslocamento e pedágio antes de cancelar. A OS não foi alterada." };
  }
  const body = raw as Record<string, unknown>;
  const inicioIso = asBrtIso(body.horarioInicio);
  const fimIso = asBrtIso(body.horarioFim);
  if (!inicioIso || !fimIso) {
    return { ok: false, message: "Informe o horário de início e o horário de fim. A OS não foi alterada." };
  }
  if (new Date(fimIso).getTime() < new Date(inicioIso).getTime()) {
    return { ok: false, message: "O horário de fim não pode ser anterior ao horário de início. A OS não foi alterada." };
  }
  const kmInicial = Number(body.kmInicial);
  const kmFinal = Number(body.kmFinal);
  if (!Number.isFinite(kmInicial) || !Number.isFinite(kmFinal) || kmInicial < 0 || kmFinal < 0) {
    return { ok: false, message: "Informe o KM inicial e o KM final. A OS não foi alterada." };
  }
  if (kmFinal < kmInicial) {
    return { ok: false, message: "O KM final não pode ser menor que o KM inicial. A OS não foi alterada." };
  }
  if (typeof body.houveDeslocamento !== "boolean") {
    return { ok: false, message: "Informe se houve deslocamento da equipe. A OS não foi alterada." };
  }
  const valorPedagio = Number(body.valorPedagio);
  if (!Number.isFinite(valorPedagio) || valorPedagio < 0) {
    return { ok: false, message: "Informe o valor do pedágio. Use 0,00 se não houve. A OS não foi alterada." };
  }
  return {
    ok: true,
    value: {
      houveDeslocamento: body.houveDeslocamento,
      kmInicial,
      kmFinal,
      inicioIso,
      fimIso,
      valorPedagio: Math.round(valorPedagio * 100) / 100,
    },
  };
}

/**
 * Com deslocamento, mantém a franquia calculada e soma o pedágio informado.
 * Sem deslocamento, a franquia fica em zero e o total é só o pedágio.
 */
export function aplicarFatosCancelamento(
  fatFields: Record<string, any>,
  operador: CanceladaOperador,
): Record<string, any> {
  const next = { ...fatFields };
  if (!operador.houveDeslocamento) {
    next.fat_acionamento = 0;
    next.fat_hora_extra = 0;
    next.fat_km = 0;
    next.fat_km_carregado = 0;
    next.fat_km_vazio = 0;
    next.fat_adicional_noturno = 0;
    next.fat_estadia = 0;
    next.fat_pernoite = 0;
    next.fat_diaria = 0;
    next.valor_franquia = 0;
    next.valor_km_extra = 0;
    next.km_excedente = 0;
  }
  const franquia =
    (Number(next.fat_acionamento) || 0) +
    (Number(next.fat_hora_extra) || 0) +
    (Number(next.fat_km) || 0) +
    (Number(next.fat_adicional_noturno) || 0) +
    (Number(next.fat_estadia) || 0) +
    (Number(next.fat_pernoite) || 0);
  const pedagio = Math.round((Number(operador.valorPedagio) || 0) * 100) / 100;
  next.despesas_pedagio = pedagio;
  next.desp_pedagio = pedagio;
  next.fat_total = Math.round((franquia + pedagio) * 100) / 100;
  next.resultado_bruto = next.fat_total;
  next.resultado_liquido = next.fat_total;
  next.margem_percentual = next.fat_total > 0 ? 100 : 0;
  return next;
}

export interface CanceladaResult {
  contrato: any;
  usouTabela100: boolean;
  resultado: any;
  kmIni: number;
  kmFin: number;
  fatFields: Record<string, any>;
  horarios: { horario_agendado: string | null; horario_inicio: string | null; horario_fim: string | null };
}

/** Ativo, 3 h, e 100 km na franquia do contrato ou na franquia mínima. */
export function isCanceladaContract100km3(contrato: any): boolean {
  return contrato?.status === "Ativo" && isCanceladaPriceTable100km3(contrato);
}

export async function getTabela100km(clientId: number | null | undefined) {
  if (!clientId) return null;
  const { data, error } = await supabaseAdmin
    .from("escort_contracts")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "Ativo");
  if (error) throw error;
  return pickCanceladaPriceTable(data || []);
}

// Resolve a tabela de 100 km / 3 h do cliente, extrai km/tempo reais e calcula
// o faturamento de cancelamento via calcularEscolta.
async function contratoSelecionado(input: CanceladaInput): Promise<any | null> {
  const id = String(input.escortContractId || "").trim();
  if (!id) return null;
  const { data, error } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", id).limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row || !isCanceladaContract100km3(row)) return null;
  if (input.clientId && Number(row.client_id) !== Number(input.clientId)) return null;
  return row;
}

export async function computeCanceladaBilling(input: CanceladaInput): Promise<CanceladaResult | null> {
  const contrato = (await contratoSelecionado(input)) || (await getTabela100km(input.clientId));
  if (!contrato || !isCanceladaContract100km3(contrato)) return null;
  const usouTabela100 = true;

  // KM real da OS — mesma convenção do recálculo de boletim: a franquia conta a
  // partir da chegada na origem (km_chegada); km_saida é fallback.
  const { data: photos } = await supabaseAdmin
    .from("mission_photos")
    .select("step, km_value, created_at")
    .eq("service_order_id", input.serviceOrderId)
    .order("created_at", { ascending: true });
  const ph = photos || [];
  const last = (step: string) => [...ph].reverse().find((p: any) => p.step === step);
  const kmSaida = last("km_saida");
  const kmChegada = last("km_chegada");
  const kmFinalP = last("km_final");
  const operador = input.operador || null;
  const kmIni = operador ? operador.kmInicial : (n(kmChegada?.km_value) || n(kmSaida?.km_value) || 0);
  const kmFinalRaw = operador ? operador.kmFinal : (n(kmFinalP?.km_value) || 0);
  const kmFin = operador ? operador.kmFinal : (kmFinalRaw > kmIni ? kmFinalRaw : kmIni);

  // Tempo real: início = mission_started_at (ou clique iniciar_missao/em_transito_destino);
  // fim = completed_date (instante do cancelamento), se válido.
  // No cancelamento pela tela, horários e KM digitados pelo operador prevalecem.
  const logs = Array.isArray(input.stepLogs) ? input.stepLogs : [];
  const inicioEntry = [...logs]
    .reverse()
    .find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && (l.timestamp || l.completedAt));
  const inicio_ts = operador
    ? operador.inicioIso
    : input.missionStartedAt
      ? new Date(input.missionStartedAt).toISOString()
      : inicioEntry
        ? new Date(inicioEntry.timestamp || inicioEntry.completedAt).toISOString()
        : null;
  const cdValid = input.completedDate && new Date(input.completedDate).getFullYear() > 2000;
  const fim_ts = operador ? operador.fimIso : (cdValid ? new Date(input.completedDate as string).toISOString() : null);
  const scheduled_date = input.scheduledDate ? new Date(input.scheduledDate).toISOString() : null;

  const horarios = {
    horario_agendado: input.scheduledDate ? toBRT(new Date(input.scheduledDate)) : null,
    horario_inicio: inicio_ts ? toBRT(new Date(inicio_ts)) : null,
    horario_fim: fim_ts ? toBRT(new Date(fim_ts)) : null,
  };

  const resultado = calcularEscolta({
    km_inicial: kmIni,
    km_final: kmFin,
    km_vazio: 0,
    horas_missao: 0,
    horas_estadia: 0,
    teve_pernoite: false,
    horario_agendado: horarios.horario_agendado || undefined,
    horario_inicio: horarios.horario_inicio || undefined,
    horario_fim: horarios.horario_fim || undefined,
    inicio_ts,
    fim_ts,
    scheduled_date,
    despesas_pedagio: 0,
    despesas_combustivel: 0,
    despesas_outras: 0,
    receitas_os: 0,
    contrato,
  });

  const nb = (v: any) => Number(v) || 0;
  const fatFields = {
    km_inicial: nb(kmIni),
    km_final: nb(kmFin),
    km_carregado: nb(resultado.km_carregado),
    km_vazio: 0,
    km_total: nb(resultado.km_total),
    km_faturado: nb(resultado.km_faturado),
    km_franquia: nb(resultado.km_franquia),
    km_excedente: nb(resultado.km_excedente),
    horario_inicio_considerado: resultado.horario_inicio_considerado,
    horas_missao: nb(resultado.horas_trabalhadas),
    horas_trabalhadas: nb(resultado.horas_trabalhadas),
    horas_estadia: 0,
    teve_pernoite: false,
    is_noturno: resultado.is_noturno,
    fat_acionamento: nb(resultado.fat_acionamento),
    fat_hora_extra: nb(resultado.fat_hora_extra),
    fat_km: nb(resultado.fat_km),
    fat_km_carregado: nb(resultado.faturamento.km_carregado),
    fat_km_vazio: nb(resultado.faturamento.km_vazio),
    fat_estadia: nb(resultado.fat_estadia),
    fat_pernoite: nb(resultado.fat_pernoite),
    fat_diaria: nb(resultado.fat_pernoite),
    fat_adicional_noturno: nb(resultado.fat_adicional_noturno),
    fat_total: nb(resultado.fat_total),
    // Cancelada não carrega custos/receitas anteriores nem pedágio estimado.
    // O único valor comercial vem do motor de cancelamento acima.
    ...CANCELADA_CLEAN_FINANCIAL_FIELDS,
    valor_franquia: nb(resultado.valor_franquia),
    valor_km_extra: nb(resultado.valor_km_extra),
    // Cancelamento = receita pura: pagamento zerado, resultado = faturamento.
    resultado_bruto: nb(resultado.fat_total),
    resultado_liquido: nb(resultado.fat_total),
    margem_percentual: 100,
    status: "CANCELADO",
  };
  const fatAplicado = operador ? aplicarFatosCancelamento(fatFields, operador) : fatFields;

  return { contrato, usouTabela100, resultado, kmIni, kmFin, fatFields: fatAplicado, horarios };
}
