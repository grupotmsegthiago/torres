/**
 * Custo mensal unificado do colaborador (cadastro salary-summary + Balanço rh-summary).
 *
 * Unifica:
 *  - HE/noturno: batidas Control iD (banco mensal) → ponto_operacional → jornada_calculos
 *  - Diárias: operational_payments + agent_daily_allowances no mesmo período
 *  - Encargos CCT: FGTS (folha) + INSS patronal + seguro de vida
 *  - Separação: realizado / provisionado / descontos empregado / encargos
 */
import { getPayrollPeriod } from "@shared/payroll-period";
import { supabaseAdmin } from "../supabase";
import { r2, type PayrollBreakdown } from "./payroll";

/** Janela inclusiva 26→25 da competência `mesRef` (YYYY-MM) — só ponto/HE. */
export function payrollWindowFromMesRef(mesRef: string): { from: string; to: string; labelShort: string } {
  const y = Number(String(mesRef).slice(0, 4));
  const m = Number(String(mesRef).slice(5, 7));
  const p = getPayrollPeriod(y, m);
  return { from: p.startDate, to: p.endDate, labelShort: p.labelShort };
}

export type HorasFonte =
  | "ponto_operacional"
  | "jornada_calculos"
  | "batidas"
  | "nenhuma";

export type HorasPeriodoResult = {
  horasExtras: number;
  horasNoturnas: number;
  fonte: HorasFonte;
  registros: number;
};

async function heFromBatidas(opts: {
  employeeId: number;
  mesRef: string;
  horasMensais?: number;
}): Promise<HorasPeriodoResult | null> {
  try {
    const { buildFolhaPonto } = await import("../control-id");
    const dias = await buildFolhaPonto(opts.employeeId, opts.mesRef, {
      horasMensais: opts.horasMensais,
    });
    if (!dias || dias.length === 0) return null;
    const noturnoMin = dias.reduce(
      (s: number, d: any) => s + (Number(d.noturnoMin) || 0),
      0,
    );
    const hoursWorked =
      dias.reduce((s: number, d: any) => s + (Number(d.workedMin) || 0), 0) / 60;
    const limit = opts.horasMensais && opts.horasMensais > 0 ? opts.horasMensais : 220;
    // Banco mensal (= card Folha Control iD). NÃO usar Σ extraMin diário (8h48).
    const horasExtras = Math.max(0, hoursWorked - limit);
    const horasNoturnas = noturnoMin / 60;
    if (horasExtras <= 0 && horasNoturnas <= 0) {
      return { horasExtras: 0, horasNoturnas: 0, fonte: "batidas", registros: dias.length };
    }
    return {
      horasExtras: r2(horasExtras),
      horasNoturnas: r2(horasNoturnas),
      fonte: "batidas",
      registros: dias.length,
    };
  } catch (e: any) {
    console.warn("[resolveHoras] batidas:", e?.message || e);
    return null;
  }
}

/**
 * Resolve HE/noturnas do período.
 * Prioridade (pagamento Folha — caso Reis 29/07/2026):
 *   1) batidas Control iD — banco mensal (trab − 220), HH:MM sem segundos
 *   2) ponto_operacional / jornada_calculos — só se não houver batidas com valor
 */
export async function resolveHorasExtrasNoturnas(opts: {
  employeeId: number;
  from: string;
  to: string;
  mesRef: string;
  horasMensais?: number;
  /**
   * Batidas usam o ciclo 26→25 do `mesRef` (não o from/to do filtro).
   * Default true: vigilantes batem no Control iD; o rateio do período é feito
   * depois no Balanço (costDays/30). Sem isso, filtro semanal fica HE=0.
   */
  allowBatidasFallback?: boolean;
}): Promise<HorasPeriodoResult> {
  const { employeeId, mesRef } = opts;
  // Ponto/HE: SEMPRE ciclo 26→25 da competência. VR/refeição/outros no Balanço
  // continuam no mês civil do filtro — não misturar.
  const payroll = payrollWindowFromMesRef(mesRef);
  const inicio = `${payroll.from}T00:00:00-03:00`;
  const fim = `${payroll.to}T23:59:59-03:00`;
  const allowBatidas = opts.allowBatidasFallback !== false;

  // 1) Canônico: batidas Control iD (banco mensal + noturno da mesma folha).
  if (allowBatidas) {
    const fromBatidas = await heFromBatidas({
      employeeId,
      mesRef,
      horasMensais: opts.horasMensais,
    });
    if (fromBatidas && (fromBatidas.horasExtras > 0 || fromBatidas.horasNoturnas > 0)) {
      return fromBatidas;
    }
  }

  let horasExtras = 0;
  let horasNoturnas = 0;
  let fonte: HorasFonte = "nenhuma";
  let registros = 0;

  // 2) Fallback: ponto do app
  try {
    const { data: pontos } = await supabaseAdmin
      .from("ponto_operacional")
      .select("horas_extras, horas_noturno")
      .eq("employee_id", employeeId)
      .gte("entrada", inicio)
      .lte("entrada", fim);
    if (pontos && pontos.length > 0) {
      for (const p of pontos as any[]) {
        horasExtras += Number(p.horas_extras || 0);
        horasNoturnas += Number(p.horas_noturno || 0);
      }
      registros = pontos.length;
      if (horasExtras > 0 || horasNoturnas > 0) {
        return {
          horasExtras: r2(horasExtras),
          horasNoturnas: r2(horasNoturnas),
          fonte: "ponto_operacional",
          registros,
        };
      }
      fonte = "ponto_operacional";
    }
  } catch (e: any) {
    console.warn("[resolveHoras] ponto_operacional:", e?.message || e);
  }

  // 3) Fallback: jornada_calculos
  try {
    const { data: jorn } = await supabaseAdmin
      .from("jornada_calculos")
      .select("horas_extras, horas_noturnas")
      .eq("employee_id", employeeId)
      .eq("mes_referencia", mesRef);
    if (jorn && jorn.length > 0) {
      horasExtras = 0;
      horasNoturnas = 0;
      for (const j of jorn as any[]) {
        horasExtras += Number(j.horas_extras || 0);
        horasNoturnas += Number(j.horas_noturnas || 0);
      }
      registros = jorn.length;
      if (horasExtras > 0 || horasNoturnas > 0) {
        return {
          horasExtras: r2(horasExtras),
          horasNoturnas: r2(horasNoturnas),
          fonte: "jornada_calculos",
          registros,
        };
      }
      fonte = "jornada_calculos";
    }
  } catch (e: any) {
    console.warn("[resolveHoras] jornada_calculos:", e?.message || e);
  }

  return {
    horasExtras: r2(horasExtras),
    horasNoturnas: r2(horasNoturnas),
    fonte,
    registros,
  };
}

/**
 * Agrega HE/noturno para vários funcionários no período (Balanço).
 * 1) Batidas Control iD (canônico — banco mensal) para todos
 * 2) Quem ficar zerado: ponto_operacional / jornada_calculos
 */
export async function resolveHorasExtrasNoturnasBulk(opts: {
  employeeIds: number[];
  from: string;
  to: string;
  mesRef: string;
  horasMensaisByEmp?: Map<number, number>;
}): Promise<Map<number, HorasPeriodoResult>> {
  const { employeeIds, mesRef } = opts;
  const out = new Map<number, HorasPeriodoResult>();
  for (const id of employeeIds) {
    out.set(id, { horasExtras: 0, horasNoturnas: 0, fonte: "nenhuma", registros: 0 });
  }
  if (employeeIds.length === 0) return out;

  // 1) Canônico: batidas para todos (pagamento = card Folha Control iD).
  const { createLimit } = await import("./create-limit");
  const limitBat = createLimit(4);
  await Promise.all(
    employeeIds.map((id) =>
      limitBat(async () => {
        const fromBatidas = await heFromBatidas({
          employeeId: id,
          mesRef,
          horasMensais: opts.horasMensaisByEmp?.get(id),
        });
        if (fromBatidas && (fromBatidas.horasExtras > 0 || fromBatidas.horasNoturnas > 0)) {
          out.set(id, fromBatidas);
        }
      }),
    ),
  );

  const faltantes = employeeIds.filter((id) => {
    const cur = out.get(id)!;
    return cur.horasExtras <= 0 && cur.horasNoturnas <= 0;
  });
  if (faltantes.length === 0) return out;

  // Fallback ponto_operacional: mesma janela 26→25 das batidas (não mês civil do filtro).
  const payroll = payrollWindowFromMesRef(mesRef);
  const inicio = `${payroll.from}T00:00:00-03:00`;
  const fim = `${payroll.to}T23:59:59-03:00`;
  const comPontoValor = new Set<number>();

  // 2) Fallback em lote: ponto do app
  try {
    const { data: pontos } = await supabaseAdmin
      .from("ponto_operacional")
      .select("employee_id, horas_extras, horas_noturno")
      .gte("entrada", inicio)
      .lte("entrada", fim)
      .in("employee_id", faltantes);
    const regCount = new Map<number, number>();
    for (const p of (pontos || []) as any[]) {
      const id = Number(p.employee_id);
      if (!id || !out.has(id)) continue;
      const cur = out.get(id)!;
      cur.horasExtras += Number(p.horas_extras || 0);
      cur.horasNoturnas += Number(p.horas_noturno || 0);
      cur.fonte = "ponto_operacional";
      regCount.set(id, (regCount.get(id) || 0) + 1);
    }
    for (const [id, n] of regCount) {
      const cur = out.get(id)!;
      cur.registros = n;
      cur.horasExtras = r2(cur.horasExtras);
      cur.horasNoturnas = r2(cur.horasNoturnas);
      if (cur.horasExtras > 0 || cur.horasNoturnas > 0) comPontoValor.add(id);
    }
  } catch (e: any) {
    console.warn("[resolveHorasBulk] ponto:", e?.message || e);
  }

  const aindaFaltam = faltantes.filter((id) => !comPontoValor.has(id));
  if (aindaFaltam.length === 0) return out;

  // 3) Fallback: jornada_calculos
  try {
    const { data: jorn } = await supabaseAdmin
      .from("jornada_calculos")
      .select("employee_id, horas_extras, horas_noturnas")
      .eq("mes_referencia", mesRef)
      .in("employee_id", aindaFaltam);
    const regCount = new Map<number, number>();
    for (const r of (jorn || []) as any[]) {
      const id = Number(r.employee_id);
      if (!id || !out.has(id)) continue;
      const cur = out.get(id)!;
      if (cur.fonte !== "jornada_calculos") {
        cur.horasExtras = 0;
        cur.horasNoturnas = 0;
        cur.registros = 0;
      }
      cur.horasExtras += Number(r.horas_extras || 0);
      cur.horasNoturnas += Number(r.horas_noturnas || 0);
      cur.fonte = "jornada_calculos";
      regCount.set(id, (regCount.get(id) || 0) + 1);
    }
    for (const [id, n] of regCount) {
      const cur = out.get(id)!;
      cur.registros = n;
      cur.horasExtras = r2(cur.horasExtras);
      cur.horasNoturnas = r2(cur.horasNoturnas);
    }
  } catch (e: any) {
    console.warn("[resolveHorasBulk] jornada:", e?.message || e);
  }

  return out;
}

export type DiariasPeriodoResult = {
  total: number;
  operationalPayments: number;
  agentAllowances: number;
};

/** Soma diárias das duas fontes no período (sem double-count se só uma tiver valor). */
export async function sumDiariasForEmployee(
  employeeId: number,
  from: string,
  to: string,
): Promise<DiariasPeriodoResult> {
  let operationalPayments = 0;
  let agentAllowances = 0;

  try {
    const { data } = await supabaseAdmin
      .from("operational_payments")
      .select("amount")
      .eq("employee_id", employeeId)
      .eq("type", "diaria")
      .gte("payment_date", from)
      .lte("payment_date", to);
    for (const r of (data || []) as any[]) {
      operationalPayments += Number(r.amount || 0);
    }
  } catch {
    /* tabela pode não existir */
  }

  try {
    const { data } = await supabaseAdmin
      .from("agent_daily_allowances")
      .select("amount")
      .eq("employee_id", employeeId)
      .gte("date", from)
      .lte("date", to);
    for (const r of (data || []) as any[]) {
      agentAllowances += Number(r.amount || 0);
    }
  } catch {
    /* tabela pode não existir */
  }

  operationalPayments = r2(operationalPayments);
  agentAllowances = r2(agentAllowances);
  return {
    total: r2(operationalPayments + agentAllowances),
    operationalPayments,
    agentAllowances,
  };
}

/** Soma diárias de todos os agentes no período (ambas as fontes). */
export async function sumDiariasForPeriodUnified(
  from: string,
  to: string,
): Promise<{ total: number; porAgente: Record<number, number> }> {
  const porAgente: Record<number, number> = {};
  let total = 0;

  const add = (id: number, v: number) => {
    if (!id || !v) return;
    porAgente[id] = r2((porAgente[id] || 0) + v);
    total = r2(total + v);
  };

  try {
    const { data } = await supabaseAdmin
      .from("operational_payments")
      .select("employee_id, amount")
      .eq("type", "diaria")
      .gte("payment_date", from)
      .lte("payment_date", to);
    for (const r of (data || []) as any[]) {
      add(Number(r.employee_id), Number(r.amount || 0));
    }
  } catch {
    /* ignore */
  }

  try {
    const { data } = await supabaseAdmin
      .from("agent_daily_allowances")
      .select("employee_id, amount")
      .gte("date", from)
      .lte("date", to);
    for (const r of (data || []) as any[]) {
      add(Number(r.employee_id), Number(r.amount || 0));
    }
  } catch {
    /* ignore */
  }

  return { total, porAgente };
}

export type BeneficiosExtras = {
  cesta: number;
  vt: number;
  outros: number;
  valeAlimentacao: number;
  assiduidade: number;
};

export type CustoEmpresaDetalhado = {
  diarias: number;
  inssPatronal: number;
  inssPatronalPct: number;
  seguroVida: number;
  /** Bruto folha + benefícios extras + diárias + seguro + INSS patronal (sem FGTS/provisões). */
  custoRealizado: number;
  /** FGTS mensal (provisões 13º/férias ficam só informativas — fora do custo). */
  custoProvisionado: number;
  /** Provisões CCT informativas (NÃO entram no custo total). */
  provisoesInformativas: number;
  /** FGTS + seguro + INSS patronal. */
  encargos: number;
  /** Realizado + FGTS/encargos CCT — sem provisões 13º/férias. */
  custoTotalEmpresa: number;
  descontosEmpregado: {
    inss: number;
    irrf: number;
    vt: number;
    total: number;
  };
};

/**
 * Compõe o Custo Empresa a partir da engine de folha + benefícios + diárias + encargos CCT.
 * FGTS e provisões continuam no total; INSS/IRRF do empregado NÃO entram no custo.
 */
export function composeCustoEmpresaDetalhado(input: {
  folha: PayrollBreakdown;
  beneficios: BeneficiosExtras;
  diarias?: number;
  inssPatronalPct?: number;
  seguroVidaMensal?: number;
  isClt?: boolean;
  /** Desconto de VT no líquido do empregado (informativo). */
  vtDesconto?: number;
}): CustoEmpresaDetalhado {
  const {
    folha,
    beneficios,
    diarias = 0,
    inssPatronalPct = 20,
    seguroVidaMensal = 0,
    isClt = true,
    vtDesconto = 0,
  } = input;

  const extras =
    Number(beneficios.cesta || 0) +
    Number(beneficios.vt || 0) +
    Number(beneficios.outros || 0) +
    Number(beneficios.valeAlimentacao || 0) +
    Number(beneficios.assiduidade || 0);

  const inssPatronal = isClt ? r2(folha.baseTributavel * (inssPatronalPct / 100)) : 0;
  const seguroVida = isClt ? r2(Number(seguroVidaMensal) || 0) : 0;
  const diariasN = r2(Number(diarias) || 0);

  // totalBruto = remuneração (sem VR/ajuda). VR e ajuda entram no realizado à parte.
  const custoRealizado = r2(
    folha.totalBruto +
      folha.refeicao +
      folha.ajudaCusto +
      extras +
      diariasN +
      inssPatronal +
      seguroVida,
  );
  // FGTS entra no custo; 13º/férias/1/3 só informativos (fora do total).
  const custoProvisionado = r2(folha.fgts);
  const provisoesInformativas = r2(folha.totalProvisoes);
  const encargos = r2(folha.fgts + inssPatronal + seguroVida);
  const custoTotalEmpresa = r2(custoRealizado + custoProvisionado);

  return {
    diarias: diariasN,
    inssPatronal,
    inssPatronalPct: isClt ? inssPatronalPct : 0,
    seguroVida,
    custoRealizado,
    custoProvisionado,
    provisoesInformativas,
    encargos,
    custoTotalEmpresa,
    descontosEmpregado: {
      inss: folha.inss,
      irrf: folha.irrf,
      vt: r2(vtDesconto),
      total: r2(folha.inss + folha.irrf + Number(vtDesconto || 0)),
    },
  };
}
