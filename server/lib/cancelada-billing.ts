import { supabaseAdmin } from "../supabase";
import { calcularEscolta } from "../billing-calc";

// =============================================================================
// FATURAMENTO DE OS CANCELADA — Tabela de 100 km (funcionamento mínimo)
// -----------------------------------------------------------------------------
// Regra do dono (ordem explícita p/ mudar a §8.1 de "cancelada"):
//   Toda OS CANCELADA puxa automaticamente a "tabela de 100 km" do cliente
//   (tabela de funcionamento mínimo). Cobra-se o valor base dessa tabela
//   (acionamento). Se houver excedente real de km/horas, computa-se normalmente
//   (km extra + hora extra fracionada). Se ficar dentro da franquia (≤100 km e
//   ≤3 h), cobra-se SOMENTE o valor da tabela de 100 km. Isso vale para toda OS
//   cancelada, inclusive quando a equipe nem foi acionada (mínimo = acionamento).
//
// Identificação da tabela de 100 km (confirmado pelo dono):
//   contrato do cliente com franquia_km = 100 E franquia_horas = 3 (status Ativo).
//   Fallback: qualquer tabela do cliente com franquia_km = 100; senão, o contrato
//   já vinculado à OS (escortContractId). Sem nenhum → não há como faturar.
//
// NUNCA usar pagamento aqui: cancelamento é faturamento (receita); pag_* = 0,
// resultado = fat_total. Consistente com o billing de cancelamento histórico.
// =============================================================================

export async function getTabela100km(clientId: number | null | undefined): Promise<any | null> {
  if (!clientId) return null;
  // Tabela padrão de funcionamento mínimo: franquia_km = 100 E franquia_horas = 3.
  const { data } = await supabaseAdmin
    .from("escort_contracts")
    .select("*")
    .eq("client_id", clientId)
    .eq("franquia_km", 100)
    .eq("franquia_horas", 3)
    .eq("status", "Ativo")
    .order("valor_acionamento", { ascending: true })
    .limit(1);
  if (data?.length) return data[0];

  // Fallback 1: qualquer tabela Ativa do cliente com franquia_km = 100.
  const { data: d2 } = await supabaseAdmin
    .from("escort_contracts")
    .select("*")
    .eq("client_id", clientId)
    .eq("franquia_km", 100)
    .eq("status", "Ativo")
    .order("valor_acionamento", { ascending: true })
    .limit(1);
  if (d2?.length) return d2[0];

  return null;
}

const n = (v: any) => Number(v) || 0;
const toBRT = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

export interface CanceladaInput {
  serviceOrderId: number;
  clientId: number | null | undefined;
  escortContractId?: string | null;
  scheduledDate?: string | null;
  missionStartedAt?: string | null;
  completedDate?: string | null;
  stepLogs?: any[];
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

// Resolve a tabela de 100 km (com fallback p/ o contrato da OS), extrai km/tempo
// reais da OS e calcula o faturamento de cancelamento via calcularEscolta.
// Retorna null somente quando não há NENHUM contrato utilizável.
export async function computeCanceladaBilling(input: CanceladaInput): Promise<CanceladaResult | null> {
  let contrato = await getTabela100km(input.clientId);
  let usouTabela100 = !!contrato;

  if (!contrato && input.escortContractId) {
    const { data: cc } = await supabaseAdmin
      .from("escort_contracts")
      .select("*")
      .eq("id", input.escortContractId)
      .limit(1);
    if (cc?.length) contrato = cc[0];
  }
  if (!contrato) return null;

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
  const kmIni = n(kmChegada?.km_value) || n(kmSaida?.km_value) || 0;
  const kmFinalRaw = n(kmFinalP?.km_value) || 0;
  const kmFin = kmFinalRaw > kmIni ? kmFinalRaw : kmIni;

  // Tempo real: início = mission_started_at (ou clique iniciar_missao/em_transito_destino);
  // fim = completed_date (instante do cancelamento), se válido.
  const logs = Array.isArray(input.stepLogs) ? input.stepLogs : [];
  const inicioEntry = [...logs]
    .reverse()
    .find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && (l.timestamp || l.completedAt));
  const inicio_ts = input.missionStartedAt
    ? new Date(input.missionStartedAt).toISOString()
    : inicioEntry
      ? new Date(inicioEntry.timestamp || inicioEntry.completedAt).toISOString()
      : null;
  const cdValid = input.completedDate && new Date(input.completedDate).getFullYear() > 2000;
  const fim_ts = cdValid ? new Date(input.completedDate as string).toISOString() : null;
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
    valor_franquia: nb(resultado.valor_franquia),
    valor_km_extra: nb(resultado.valor_km_extra),
    // Cancelamento = receita pura: pagamento zerado, resultado = faturamento.
    pag_vrp: 0,
    pag_periculosidade: 0,
    pag_adicional_noturno: 0,
    pag_reembolsos: 0,
    pag_total: 0,
    resultado_bruto: nb(resultado.fat_total),
    resultado_liquido: nb(resultado.fat_total),
    margem_percentual: 100,
    status: "CANCELADO",
  };

  return { contrato, usouTabela100, resultado, kmIni, kmFin, fatFields, horarios };
}
