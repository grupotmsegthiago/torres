/**
 * Custo mensal unificado do colaborador (cadastro salary-summary + Balanço rh-summary).
 *
 * Unifica:
 *  - HE/noturno: ponto_operacional → jornada_calculos → batidas (buildFolhaPonto)
 *  - Diárias: operational_payments + agent_daily_allowances no mesmo período
 *  - Encargos CCT: FGTS (folha) + INSS patronal + seguro de vida
 *  - Separação: realizado / provisionado / descontos empregado / encargos
 */
import { supabaseAdmin } from "../supabase";
import { r2, type PayrollBreakdown } from "./payroll";

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

/**
 * Resolve HE/noturnas do período.
 * Se a fonte anterior existir mas vier zerada, cai para a próxima (não trava em HE=0).
 */
function periodDayCount(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export async function resolveHorasExtrasNoturnas(opts: {
  employeeId: number;
  from: string;
  to: string;
  mesRef: string;
  horasMensais?: number;
  /** Fallback batidas usa ciclo 26→25 do mesRef — só seguro em janelas ~mensais. Default: auto (>=25 dias). */
  allowBatidasFallback?: boolean;
}): Promise<HorasPeriodoResult> {
  const { employeeId, from, to, mesRef } = opts;
  const inicio = `${from}T00:00:00-03:00`;
  const fim = `${to}T23:59:59-03:00`;
  const allowBatidas =
    opts.allowBatidasFallback ?? periodDayCount(from, to) >= 25;

  let horasExtras = 0;
  let horasNoturnas = 0;
  let fonte: HorasFonte = "nenhuma";
  let registros = 0;

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

  // Fallback: batidas Control iD — soma extraMin diário (jornadaDiaria = horas_mensais÷25)
  // e noturnoMin. Só em janela ~mensal (evita HE do mês num filtro de semana/dia).
  if (allowBatidas) {
    try {
      const { buildFolhaPonto } = await import("../control-id");
      const dias = await buildFolhaPonto(employeeId, mesRef, {
        horasMensais: opts.horasMensais,
      });
      if (dias && dias.length > 0) {
        const extraMin = dias.reduce(
          (s: number, d: any) => s + (Number(d.extraMin) || 0),
          0,
        );
        const noturnoMin = dias.reduce(
          (s: number, d: any) => s + (Number(d.noturnoMin) || 0),
          0,
        );
        // Preferência: extras diários do ponto. Fallback: hoursWorked − 220 (buildFolhaStats).
        const hoursWorked =
          dias.reduce((s: number, d: any) => s + (Number(d.workedMin) || 0), 0) / 60;
        const limit = opts.horasMensais && opts.horasMensais > 0 ? opts.horasMensais : 220;
        const heDiario = extraMin / 60;
        const heMensal = Math.max(0, hoursWorked - limit);
        horasExtras = heDiario > 0 ? heDiario : heMensal;
        horasNoturnas = noturnoMin / 60;
        if (horasExtras > 0 || horasNoturnas > 0) {
          return {
            horasExtras: r2(horasExtras),
            horasNoturnas: r2(horasNoturnas),
            fonte: "batidas",
            registros: dias.length,
          };
        }
        fonte = fonte === "nenhuma" ? "batidas" : fonte;
        registros = dias.length;
      }
    } catch (e: any) {
      console.warn("[resolveHoras] batidas:", e?.message || e);
    }
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
 * Batidas só como fallback individual quando ponto+jornada = 0 (evita N+1 pesado).
 */
export async function resolveHorasExtrasNoturnasBulk(opts: {
  employeeIds: number[];
  from: string;
  to: string;
  mesRef: string;
  horasMensaisByEmp?: Map<number, number>;
}): Promise<Map<number, HorasPeriodoResult>> {
  const { employeeIds, from, to, mesRef } = opts;
  const out = new Map<number, HorasPeriodoResult>();
  for (const id of employeeIds) {
    out.set(id, { horasExtras: 0, horasNoturnas: 0, fonte: "nenhuma", registros: 0 });
  }
  if (employeeIds.length === 0) return out;

  const inicio = `${from}T00:00:00-03:00`;
  const fim = `${to}T23:59:59-03:00`;
  const comPontoValor = new Set<number>();

  try {
    const { data: pontos } = await supabaseAdmin
      .from("ponto_operacional")
      .select("employee_id, horas_extras, horas_noturno")
      .gte("entrada", inicio)
      .lte("entrada", fim)
      .in("employee_id", employeeIds);
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

  try {
    const { data: jorn } = await supabaseAdmin
      .from("jornada_calculos")
      .select("employee_id, horas_extras, horas_noturnas")
      .eq("mes_referencia", mesRef)
      .in("employee_id", employeeIds);
    const regCount = new Map<number, number>();
    for (const r of (jorn || []) as any[]) {
      const id = Number(r.employee_id);
      if (!id || !out.has(id) || comPontoValor.has(id)) continue;
      const cur = out.get(id)!;
      if (cur.fonte === "ponto_operacional" && (cur.horasExtras > 0 || cur.horasNoturnas > 0)) continue;
      // Zera se estava em ponto zerado e vamos usar jornada
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

  // Fallback batidas só para quem ainda está zerado — e só em janela ~mensal.
  const faltantes =
    periodDayCount(from, to) >= 25
      ? employeeIds.filter((id) => {
          const cur = out.get(id)!;
          return cur.horasExtras <= 0 && cur.horasNoturnas <= 0;
        })
      : [];
  if (faltantes.length > 0) {
    const { createLimit } = await import("./create-limit");
    const limit = createLimit(4);
    await Promise.all(
      faltantes.map((id) =>
        limit(async () => {
          const resolved = await resolveHorasExtrasNoturnas({
            employeeId: id,
            from,
            to,
            mesRef,
            horasMensais: opts.horasMensaisByEmp?.get(id),
            allowBatidasFallback: true,
          });
          // Só sobrescreve se batidas trouxe valor (senão mantém fonte anterior)
          if (resolved.fonte === "batidas" && (resolved.horasExtras > 0 || resolved.horasNoturnas > 0)) {
            out.set(id, resolved);
          }
        }),
      ),
    );
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
  /** FGTS mensal + provisões (13º/férias/1/3/encargos s/ provisões). */
  custoProvisionado: number;
  /** FGTS + seguro + INSS patronal. */
  encargos: number;
  /** Realizado + provisionado — custo total empresa. */
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
  const custoProvisionado = r2(folha.fgts + folha.totalProvisoes);
  const encargos = r2(folha.fgts + inssPatronal + seguroVida);
  const custoTotalEmpresa = r2(custoRealizado + custoProvisionado);

  return {
    diarias: diariasN,
    inssPatronal,
    inssPatronalPct: isClt ? inssPatronalPct : 0,
    seguroVida,
    custoRealizado,
    custoProvisionado,
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
