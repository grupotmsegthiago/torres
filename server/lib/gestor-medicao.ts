// =============================================================================
// GESTOR DE MEDIÇÃO SÊNIOR — motor DETERMINÍSTICO de auditoria das OS
// -----------------------------------------------------------------------------
// Princípio: NÃO existe segunda lógica de cálculo. O valor "correto" vem SEMPRE
// do motor oficial calcularEscolta() (server/billing-calc.ts), com as mesmas
// entradas que a aprovação usa (§8: tabela ATUAL da OS, KM do billing, ts da OS).
// Regras intocáveis preservadas: recusada = R$0 (§8.1); cancelada = tabela 100km.
// A IA (rota /explicar) apenas EXPLICA o resultado deste motor — nunca calcula.
// Valores comparados em CENTAVOS (inteiros) — tolerância padrão R$ 0,01.
// =============================================================================
import { supabaseAdmin } from "../supabase";
import { calcularEscolta } from "../billing-calc";
import { billingTotalForBoletim, osCanonicalTotal, round2 } from "./boletim-totals";
import { computeCanceladaBilling } from "./cancelada-billing";

export type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
export interface Issue { type: string; severity: Severidade; message: string }

export interface AuditResult {
  serviceOrderId: number;
  osNumber: string | null;
  clientId: number | null;
  clientName: string | null;
  dataMissao: string | null;
  osStatus: string;
  billingStatus: string | null;
  analysisStatus: string;          // CALCULADO_OK | DIVERGENCIA_* | DADOS_INCOMPLETOS | REGRA_NAO_ENCONTRADA | ATENCAO
  verdict: string;                 // frase verde/vermelha/amarela
  recommendation: "APROVAR" | "REVISAR" | "ANALISE_MANUAL";
  riskLevel: Severidade | null;
  expectedTotalCents: number | null;
  chargedTotalCents: number;
  differenceCents: number | null;  // cobrado - correto
  jaAprovada: boolean;             // billing congelado (APROVADA/FATURADO/PAGO)
  aprovavelEmLote: boolean;
  issues: Issue[];
  memoria: any;                    // memória de cálculo completa (JSON)
  contractId: string | null;
}

const cents = (v: any) => Math.round((Number(v) || 0) * 100);
const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hhmm = (horas: number) => {
  const totalMin = Math.round((Number(horas) || 0) * 60);
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
};

export const TOLERANCIA_CENTS = 1; // R$ 0,01 — só arredondamento

const FROZEN = new Set(["APROVADA", "FATURADO", "FATURADA", "PAGO"]);

const VERDE = "CALCULADO OK — PODE APROVAR";
const VERMELHO = "DIVERGÊNCIA ENCONTRADA — REVISAR CÁLCULO";
const AMARELO = "ATENÇÃO — ANÁLISE MANUAL NECESSÁRIA";
const LARANJA = "DIVERGÊNCIA DE COMPOSIÇÃO — TOTAL CORRETO, COMPONENTES DIFEREM";

// Componentes canônicos comparados 1-a-1 (mesmos 9 do osCanonicalTotal;
// pedágio/despesas/receitas são pass-through: iguais nos dois lados por construção).
const COMPONENTES: Array<{ key: string; label: string }> = [
  { key: "fat_acionamento", label: "Acionamento" },
  { key: "fat_km", label: "KM excedente" },
  { key: "fat_hora_extra", label: "Hora excedente" },
  { key: "fat_adicional_noturno", label: "Adicional noturno" },
  { key: "fat_estadia", label: "Estadia" },
  { key: "fat_pernoite", label: "Pernoite" },
];

/**
 * Audita UMA OS. `so` e `billing` são linhas cruas (snake_case) do Supabase.
 * `contratos` é um Map id→contrato pré-carregado (evita N+1 no lote);
 * `contratoAtivoPorCliente` cobre o fallback de OS sem tabela vinculada.
 */
export async function auditarOsCore(
  so: any,
  billing: any | null,
  contratos: Map<string, any>,
  contratoAtivoPorCliente: Map<number, any>,
): Promise<AuditResult> {
  const issues: Issue[] = [];
  const osStatus = String(so.status || "");
  const billingStatus = billing ? String(billing.status || "") : null;
  const jaAprovada = !!billingStatus && FROZEN.has(billingStatus.toUpperCase());
  const chargedTotalCents = billing ? cents(billingTotalForBoletim(billing, osStatus)) : 0;

  const base = {
    serviceOrderId: Number(so.id),
    osNumber: so.os_number || null,
    clientId: so.client_id ?? null,
    clientName: billing?.client_name || so.client_name || null,
    dataMissao: billing?.data_missao || so.scheduled_date || null,
    osStatus,
    billingStatus,
    chargedTotalCents,
    jaAprovada,
    contractId: null as string | null,
  };

  const finish = (
    analysisStatus: string,
    expectedTotalCents: number | null,
    memoria: any,
  ): AuditResult => {
    const differenceCents = expectedTotalCents === null ? null : chargedTotalCents - expectedTotalCents;
    const hasCritica = issues.some((i) => i.severity === "CRITICA");
    const hasAlta = issues.some((i) => i.severity === "ALTA");
    const hasMedia = issues.some((i) => i.severity === "MEDIA");
    const riskLevel: Severidade | null = hasCritica ? "CRITICA" : hasAlta ? "ALTA" : hasMedia ? "MEDIA" : issues.length ? "BAIXA" : null;
    const isComposicao = analysisStatus === "DIVERGENCIA_COMPOSICAO";
    const isDivergencia = analysisStatus.startsWith("DIVERGENCIA") && !isComposicao;
    const isOk = analysisStatus === "CALCULADO_OK";
    const verdict = isOk ? VERDE : isComposicao ? LARANJA : isDivergencia ? VERMELHO : AMARELO;
    const recommendation = isOk ? "APROVAR" : isDivergencia ? "REVISAR" : "ANALISE_MANUAL";
    return {
      ...base,
      analysisStatus,
      verdict,
      recommendation: recommendation as any,
      riskLevel,
      expectedTotalCents,
      differenceCents,
      // Cancelada fora do lote/auto-aprovação: aprovação de cancelada segue o
      // fluxo do boletim (regra 100km); o lote genérico recalcularia errado e
      // marcaria a OS como "concluida".
      aprovavelEmLote: isOk && !jaAprovada && billingStatus === "A_VERIFICAR" && osStatus !== "recusada" && osStatus !== "cancelada",
      issues,
      memoria,
    };
  };

  // ---------- §8.1: RECUSADA = R$ 0,00 SEMPRE ----------
  if (osStatus === "recusada") {
    if (chargedTotalCents > TOLERANCIA_CENTS) {
      issues.push({ type: "RECUSADA_COM_VALOR", severity: "CRITICA", message: `OS recusada com valor cobrado ${fmtBRL(chargedTotalCents)} — §8.1 exige R$ 0,00.` });
      return finish("DIVERGENCIA_VALOR", 0, { regra: "OS RECUSADA — faturamento R$ 0,00 incondicional (§8.1)" });
    }
    return finish("CALCULADO_OK", 0, { regra: "OS RECUSADA — faturamento R$ 0,00 incondicional (§8.1)" });
  }

  if (!billing) {
    issues.push({ type: "SEM_BILLING", severity: "CRITICA", message: "OS sem boletim/billing calculado — use o botão Calcular no Boletim de Medição." });
    return finish("DADOS_INCOMPLETOS", null, { regra: "Sem billing — não há valor cobrado para auditar." });
  }

  // ---------- CANCELADA = tabela 100km ----------
  if (osStatus === "cancelada") {
    const r = await computeCanceladaBilling({
      serviceOrderId: Number(so.id),
      clientId: so.client_id,
      escortContractId: so.escort_contract_id,
      scheduledDate: so.scheduled_date,
      missionStartedAt: so.mission_started_at,
      completedDate: so.completed_date,
      stepLogs: so.step_logs,
    });
    if (!r) {
      issues.push({ type: "SEM_TABELA_100KM", severity: "CRITICA", message: "OS cancelada sem tabela de 100km (nem contrato vinculado) — impossível calcular o mínimo." });
      return finish("REGRA_NAO_ENCONTRADA", null, { regra: "Cancelada cobra tabela 100km — nenhuma tabela utilizável encontrada." });
    }
    base.contractId = r.contrato?.id || null;
    // O "correto" da cancelada = tabela 100km + PASS-THROUGHS reais do billing
    // (pedágio/despesas/receitas não são cálculo — são despesas repassadas).
    // computeCanceladaBilling zera esses campos por construção; sem somá-los
    // aqui, toda cancelada com pedágio virava falso positivo.
    // Mesma composição do total oficial exibido no boletim (oficialBillingView).
    const passThroughCents = cents(billing.despesas_pedagio) + cents(billing.despesas_outras) + cents(billing.receitas_os);
    const expected = cents(r.fatFields.fat_total) + passThroughCents;
    const memoria = montarMemoria(r.contrato, r.resultado, billing, {
      regra: `OS CANCELADA — tabela de ${r.usouTabela100 ? "100km (funcionamento mínimo)" : "contrato da OS (fallback)"} + repasses (pedágio/despesas/receitas) do billing`,
    });
    if (memoria?.calculo_correto) {
      memoria.calculo_correto.pedagio = round2(Number(billing.despesas_pedagio || 0));
      memoria.calculo_correto.despesas = round2(Number(billing.despesas_outras || 0));
      memoria.calculo_correto.receitas_os = round2(Number(billing.receitas_os || 0));
      memoria.calculo_correto.total = round2(expected / 100);
    }
    const diff = chargedTotalCents - expected;
    if (Math.abs(diff) > TOLERANCIA_CENTS) {
      issues.push({ type: diff > 0 ? "VALOR_ACIMA" : "VALOR_ABAIXO", severity: "ALTA", message: `Cancelada: cobrado ${fmtBRL(chargedTotalCents)} vs tabela 100km + repasses ${fmtBRL(expected)} (${diff > 0 ? "+" : ""}${fmtBRL(diff)}).` });
      if (jaAprovada) {
        issues.push({ type: "ALTERACAO_POS_APROVACAO", severity: "ALTA", message: "Billing congelado (aprovado/faturado): o valor cobrado é o congelado. Divergência indica alteração posterior à aprovação — análise manual, não erro de cálculo." });
        return finish("ATENCAO", expected, memoria);
      }
      return finish("DIVERGENCIA_VALOR", expected, memoria);
    }
    return finish("CALCULADO_OK", expected, memoria);
  }

  // ---------- CONCLUÍDA (fluxo normal) ----------
  // Tabela: mesma precedência da aprovação (§8/TOR-0408): tabela ATUAL da OS →
  // contract_id congelado no billing → contrato Ativo do cliente.
  let contrato: any = null;
  if (so.escort_contract_id) contrato = contratos.get(String(so.escort_contract_id)) || null;
  if (!contrato && billing.contract_id) contrato = contratos.get(String(billing.contract_id)) || null;
  if (!contrato && so.client_id) contrato = contratoAtivoPorCliente.get(Number(so.client_id)) || null;
  if (!contrato) {
    issues.push({ type: "TABELA_AUSENTE", severity: "CRITICA", message: "Nenhuma tabela comercial localizada (OS sem contrato vinculado e cliente sem tabela ativa)." });
    return finish("REGRA_NAO_ENCONTRADA", null, { regra: "Sem tabela comercial — impossível calcular o valor correto." });
  }
  base.contractId = contrato.id || null;
  if (String(contrato.status || "") && String(contrato.status) !== "Ativo") {
    issues.push({ type: "TABELA_INATIVA", severity: "MEDIA", message: `Tabela vinculada está "${contrato.status}" (não Ativa) — confirmar vigência.` });
  }

  // Integridade de dados ANTES do cálculo
  const kmIni = Number(billing.km_inicial || 0);
  const kmFin = Number(billing.km_final || 0);
  if (kmFin < kmIni) {
    issues.push({ type: "KM_FINAL_MENOR", severity: "ALTA", message: `KM final (${kmFin}) menor que o inicial (${kmIni}) — possível erro de digitação/hodômetro. O cálculo usa max(ini, fim).` });
  }
  if (kmIni === 0 && kmFin === 0) {
    issues.push({ type: "KM_ZERADO", severity: "MEDIA", message: "KM inicial e final zerados no billing — quilometragem da missão não registrada." });
  }
  const temTs = !!(so.mission_started_at && so.completed_date && new Date(so.completed_date).getFullYear() > 2000);
  const temHorario = !!(billing.horario_inicio && billing.horario_fim);
  if (!temTs && !temHorario) {
    issues.push({ type: "HORARIOS_AUSENTES", severity: "MEDIA", message: "Sem início/fim da missão (nem timestamp nem horário) — franquia de horas não pode ser verificada." });
  }
  if (temTs) {
    const durMs = new Date(so.completed_date).getTime() - new Date(so.mission_started_at).getTime();
    if (durMs < 0) issues.push({ type: "DURACAO_NEGATIVA", severity: "ALTA", message: "Fim da missão anterior ao início — datas invertidas." });
    if (durMs === 0) issues.push({ type: "DURACAO_ZERADA", severity: "MEDIA", message: "Duração zerada (início = fim)." });
  }

  // Recalcula pelo MOTOR OFICIAL, com as MESMAS entradas da aprovação
  // (KM/valores congelados no billing + timestamps reais da OS).
  let resultado: any;
  try {
    resultado = calcularEscolta({
      km_inicial: kmIni,
      km_final: Math.max(kmIni, kmFin),
      km_vazio: Number(billing.km_vazio || 0),
      horas_missao: Number(billing.horas_missao || 0),
      horas_estadia: Number(billing.horas_estadia || 0),
      teve_pernoite: !!billing.teve_pernoite,
      horario_inicio: billing.horario_inicio || undefined,
      horario_fim: billing.horario_fim || undefined,
      horario_agendado: billing.horario_agendado || undefined,
      inicio_ts: so.mission_started_at ? new Date(so.mission_started_at).toISOString() : null,
      fim_ts: so.completed_date && new Date(so.completed_date).getFullYear() > 2000 ? new Date(so.completed_date).toISOString() : null,
      scheduled_date: so.scheduled_date ? new Date(so.scheduled_date).toISOString() : null,
      despesas_pedagio: Number(billing.despesas_pedagio || 0),
      despesas_combustivel: Number(billing.despesas_combustivel || 0),
      despesas_outras: Number(billing.despesas_outras || 0),
      receitas_os: Number(billing.receitas_os || 0),
      contrato,
    });
  } catch (e: any) {
    issues.push({ type: "CALCULO_IMPOSSIVEL", severity: "CRITICA", message: `Motor de cálculo falhou: ${e?.message}` });
    return finish("DADOS_INCOMPLETOS", null, { regra: "Cálculo impossível com os dados atuais." });
  }

  const expected = cents(resultado.fat_total);
  const memoria = montarMemoria(contrato, resultado, billing, null);

  // Duração absurda (>48h) = timestamp podre na OS, não missão real. O "valor
  // correto" sairia inflado (dezenas de horas extras) — isso NÃO é divergência
  // confiável, é dado quebrado: exige análise manual.
  if (Number(resultado.horas_trabalhadas || 0) > 48) {
    issues.push({ type: "DURACAO_ABSURDA", severity: "ALTA", message: `Duração calculada de ${hhmm(Number(resultado.horas_trabalhadas))} (>48h) — início/fim da OS provavelmente incorretos; recálculo não confiável.` });
    return finish("ATENCAO", expected, memoria);
  }

  // Divergência por COMPONENTE (aponta a origem: KM, horas, tabela...)
  let kmDiv = false, horaDiv = false;
  for (const c of COMPONENTES) {
    const esperado = cents((resultado as any)[c.key]);
    const cobrado = cents(billing[c.key]);
    if (Math.abs(esperado - cobrado) > TOLERANCIA_CENTS) {
      if (c.key === "fat_km") kmDiv = true;
      if (c.key === "fat_hora_extra") horaDiv = true;
      issues.push({
        type: `COMPONENTE_${c.key.toUpperCase()}`,
        severity: "ALTA",
        message: `${c.label}: correto ${fmtBRL(esperado)}, cobrado ${fmtBRL(cobrado)} (${cobrado - esperado > 0 ? "+" : ""}${fmtBRL(cobrado - esperado)}).`,
      });
    }
  }

  // fat_total persistido ≠ soma dos 9 componentes persistidos → inconsistência interna
  const canonCents = cents(osCanonicalTotal(billing));
  const fatTotalCents = cents(billing.fat_total);
  if (fatTotalCents > 0 && Math.abs(fatTotalCents - canonCents) > TOLERANCIA_CENTS) {
    issues.push({ type: "TOTAL_INCONSISTENTE", severity: "ALTA", message: `fat_total gravado (${fmtBRL(fatTotalCents)}) difere da soma dos componentes (${fmtBRL(canonCents)}) — possível ajuste manual sem memória.` });
  }

  const diff = chargedTotalCents - expected;
  if (Math.abs(diff) > TOLERANCIA_CENTS) {
    issues.push({
      type: diff > 0 ? "VALOR_ACIMA" : "VALOR_ABAIXO",
      severity: Math.abs(diff) >= 10000 ? "CRITICA" : "ALTA",
      message: `Valor cobrado está ${fmtBRL(Math.abs(diff))} ${diff > 0 ? "ACIMA" : "ABAIXO"} do cálculo pela tabela atual (correto ${fmtBRL(expected)}, cobrado ${fmtBRL(chargedTotalCents)}).`,
    });
    // Billing congelado (aprovado/faturado): o cobrado É o valor congelado da
    // aprovação — divergência com a tabela ATUAL indica alteração posterior à
    // aprovação, não erro de cálculo. Etapa 2 criará o alerta específico.
    if (jaAprovada) {
      issues.push({ type: "ALTERACAO_POS_APROVACAO", severity: "ALTA", message: "Billing congelado (aprovado/faturado): valor cobrado é o congelado na aprovação. Divergência com o recálculo atual indica alteração posterior à aprovação — análise manual, não erro de cálculo." });
      return finish("ATENCAO", expected, memoria);
    }
    const status = kmDiv && !horaDiv ? "DIVERGENCIA_KM" : horaDiv && !kmDiv ? "DIVERGENCIA_HORAS" : "DIVERGENCIA_VALOR";
    return finish(status, expected, memoria);
  }

  // Total bate mas algum COMPONENTE difere → divergência de COMPOSIÇÃO
  // (não dizer que o total está errado; a memória mostra componente a componente).
  if (kmDiv || horaDiv || issues.some((i) => i.type.startsWith("COMPONENTE_"))) {
    issues.push({ type: "COMPOSICAO_DIVERGENTE", severity: "MEDIA", message: `Total cobrado está CORRETO (${fmtBRL(chargedTotalCents)}), mas a composição difere do cálculo oficial — ver componentes acima.` });
    return finish("DIVERGENCIA_COMPOSICAO", expected, memoria);
  }

  // Valor bate — mas dados incompletos/alertas seguram a aprovação automática
  if (issues.some((i) => i.severity === "CRITICA" || i.severity === "ALTA")) {
    return finish("ATENCAO", expected, memoria);
  }
  if (issues.some((i) => i.severity === "MEDIA")) {
    return finish("ATENCAO", expected, memoria);
  }
  return finish("CALCULADO_OK", expected, memoria);
}

function montarMemoria(contrato: any, resultado: any, billing: any, extra: any) {
  return {
    ...(extra || {}),
    tabela: {
      id: contrato?.id || null,
      nome: contrato?.nome_tabela || contrato?.descricao || null,
      acionamento: round2(Number(contrato?.valor_acionamento || 0)),
      franquia_km: Number(contrato?.franquia_km || contrato?.franquia_minima_km || 0),
      franquia_horas: Number(contrato?.franquia_horas || 0),
      valor_km_excedente: round2(Number(contrato?.valor_km_extra || contrato?.valor_km_carregado || 0)),
      valor_hora_excedente: round2(Number(contrato?.valor_hora_extra || contrato?.valor_hora_estadia || 0)),
      regra_hora: contrato?.hora_extra_fracionada === false ? "ARREDONDAR_HORA_COMPLETA" : "PROPORCIONAL",
      status: contrato?.status || null,
    },
    missao: {
      inicio: billing?.horario_inicio || null,
      inicio_considerado: resultado?.horario_inicio_considerado || null,
      fim: billing?.horario_fim || null,
      agendado: billing?.horario_agendado || null,
      duracao: hhmm(Number(resultado?.horas_trabalhadas || 0)),
      km_inicial: Number(billing?.km_inicial || 0),
      km_final: Number(billing?.km_final || 0),
      km_executado: Number(resultado?.km_total || 0),
      km_franquia: Number(resultado?.km_franquia || 0),
      km_excedente: Number(resultado?.km_excedente || 0),
    },
    calculo_correto: {
      acionamento: round2(Number(resultado?.fat_acionamento || 0)),
      km_excedente: round2(Number(resultado?.fat_km || 0)),
      hora_excedente: round2(Number(resultado?.fat_hora_extra || 0)),
      adicional_noturno: round2(Number(resultado?.fat_adicional_noturno || 0)),
      estadia: round2(Number(resultado?.fat_estadia || 0)),
      pernoite: round2(Number(resultado?.fat_pernoite || 0)),
      pedagio: round2(Number(billing?.despesas_pedagio || 0)),
      despesas: round2(Number(billing?.despesas_outras || 0)),
      receitas_os: round2(Number(billing?.receitas_os || 0)),
      total: round2(Number(resultado?.fat_total || 0)),
    },
    cobrado: {
      acionamento: round2(Number(billing?.fat_acionamento || 0)),
      km_excedente: round2(Number(billing?.fat_km || 0)),
      hora_excedente: round2(Number(billing?.fat_hora_extra || 0)),
      adicional_noturno: round2(Number(billing?.fat_adicional_noturno || 0)),
      estadia: round2(Number(billing?.fat_estadia || 0)),
      pernoite: round2(Number(billing?.fat_pernoite || 0)),
      pedagio: round2(Number(billing?.despesas_pedagio || 0)),
      despesas: round2(Number(billing?.despesas_outras || 0)),
      receitas_os: round2(Number(billing?.receitas_os || 0)),
      total: billing ? round2(Number(billing.fat_total || 0)) : 0,
    },
  };
}

// -----------------------------------------------------------------------------
// LOTE — carrega tudo paginado (memória: .in() corta em 1000; paginar sempre)
// -----------------------------------------------------------------------------
const SO_COLS = "id, os_number, status, mission_status, client_id, escort_contract_id, scheduled_date, mission_started_at, completed_date, step_logs";

async function pageAll(query: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await query(i, i + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export interface LoteFiltros { clientId?: number; from?: string; to?: string; osStatus?: string }

export async function auditarLote(filtros: LoteFiltros): Promise<AuditResult[]> {
  const statuses = filtros.osStatus ? [filtros.osStatus] : ["concluida", "cancelada", "recusada"];
  const sos = await pageAll((a, b) => {
    let q = supabaseAdmin.from("service_orders").select(SO_COLS).in("status", statuses).order("id", { ascending: true }).range(a, b);
    if (filtros.clientId) q = q.eq("client_id", filtros.clientId);
    if (filtros.from) q = q.gte("scheduled_date", filtros.from);
    if (filtros.to) q = q.lte("scheduled_date", `${filtros.to}T23:59:59`);
    return q;
  });
  if (!sos.length) return [];

  // Billings das OSs (chunks de 200 ids)
  const billingByOs = new Map<number, any>();
  for (let i = 0; i < sos.length; i += 200) {
    const ids = sos.slice(i, i + 200).map((s) => s.id);
    const rows = await pageAll((a, b) => supabaseAdmin.from("escort_billings").select("*").in("service_order_id", ids).range(a, b));
    for (const r of rows) if (!billingByOs.has(r.service_order_id)) billingByOs.set(r.service_order_id, r);
  }

  // Contratos referenciados + contrato Ativo por cliente (fallback)
  const contratos = new Map<string, any>();
  const allContracts = await pageAll((a, b) => supabaseAdmin.from("escort_contracts").select("*").range(a, b));
  for (const c of allContracts) contratos.set(String(c.id), c);
  const contratoAtivoPorCliente = new Map<number, any>();
  for (const c of allContracts) {
    if (c.status === "Ativo" && c.client_id != null && !contratoAtivoPorCliente.has(Number(c.client_id))) {
      contratoAtivoPorCliente.set(Number(c.client_id), c);
    }
  }

  // Auditoria com concorrência limitada (canceladas fazem queries de fotos)
  const results: AuditResult[] = new Array(sos.length);
  let idx = 0;
  const CONC = 5;
  await Promise.all(
    Array.from({ length: Math.min(CONC, sos.length) }, async () => {
      while (true) {
        const i = idx++;
        if (i >= sos.length) return;
        const so = sos[i];
        try {
          results[i] = await auditarOsCore(so, billingByOs.get(so.id) || null, contratos, contratoAtivoPorCliente);
        } catch (e: any) {
          results[i] = {
            serviceOrderId: so.id, osNumber: so.os_number || null, clientId: so.client_id ?? null,
            clientName: null, dataMissao: so.scheduled_date || null, osStatus: so.status,
            billingStatus: null, analysisStatus: "DADOS_INCOMPLETOS", verdict: AMARELO,
            recommendation: "ANALISE_MANUAL", riskLevel: "CRITICA",
            expectedTotalCents: null, chargedTotalCents: 0, differenceCents: null,
            jaAprovada: false, aprovavelEmLote: false,
            issues: [{ type: "ERRO_AUDITORIA", severity: "CRITICA", message: e?.message || "erro" }],
            memoria: null, contractId: null,
          };
        }
      }
    }),
  );
  return results;
}

export async function auditarOsById(osId: number): Promise<AuditResult | null> {
  const { data: so } = await supabaseAdmin.from("service_orders").select(SO_COLS).eq("id", osId).maybeSingle();
  if (!so) return null;
  const { data: b } = await supabaseAdmin.from("escort_billings").select("*").eq("service_order_id", osId).limit(1);
  const contratos = new Map<string, any>();
  const ids = [so.escort_contract_id, b?.[0]?.contract_id].filter(Boolean).map(String);
  if (ids.length) {
    const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").in("id", ids);
    for (const c of cc || []) contratos.set(String(c.id), c);
  }
  const ativoPorCliente = new Map<number, any>();
  if (so.client_id) {
    const { data: ac } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.client_id).eq("status", "Ativo").limit(1);
    if (ac?.length) ativoPorCliente.set(Number(so.client_id), ac[0]);
  }
  return auditarOsCore(so, b?.[0] || null, contratos, ativoPorCliente);
}

/**
 * Reavalia AUTOMATICAMENTE uma OS que já tem auditoria persistida — usada
 * quando o billing muda (recalcular/aprovar) pra que alertas antigos não fiquem
 * abertos depois que a divergência deixa de existir (caso TOR-0482).
 * Fire-and-forget: nunca derruba o fluxo principal; só grava nova análise.
 */
export async function reauditarSeJaAuditada(serviceOrderId: number, user: string): Promise<void> {
  if (!Number.isFinite(serviceOrderId) || serviceOrderId <= 0) return;
  try {
    const { data } = await supabaseAdmin.from("medicao_audits")
      .select("id").eq("service_order_id", serviceOrderId).limit(1);
    if (!data?.length) return; // nunca auditada — não cria alerta novo sozinho
    const r = await auditarOsById(serviceOrderId);
    if (r) await salvarAudits([r], `${user} (auto)`);
  } catch (e: any) {
    console.error(`[gestor-medicao] Reavaliação automática falhou p/ OS ${serviceOrderId}:`, e?.message);
  }
}

// Persistência (histórico append-only, análise reproduzível)
export async function salvarAudits(results: AuditResult[], user: string) {
  const now = new Date().toISOString();
  const rows = results.map((r) => ({
    service_order_id: r.serviceOrderId,
    analyzed_at: now,
    analyzed_by: user,
    analysis_status: r.analysisStatus,
    verdict: r.verdict,
    recommendation: r.recommendation,
    risk_level: r.riskLevel,
    os_status: r.osStatus,
    billing_status: r.billingStatus,
    contract_id: r.contractId,
    expected_total: r.expectedTotalCents === null ? null : r.expectedTotalCents / 100,
    charged_total: r.chargedTotalCents / 100,
    difference: r.differenceCents === null ? null : r.differenceCents / 100,
    issues: r.issues,
    memoria: r.memoria,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin.from("medicao_audits").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}
