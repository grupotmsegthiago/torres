// =============================================================
// Diárias automáticas por jornada > 16h
// Regra (Thiago):
//   - Se um par de batidas (entrada→saída) passar de 16h, gera
//     diária de R$43,00 pra TODOS os agentes da OS naquele turno
//     (assigned + assigned 2).
//   - Idempotente: usa description com chave única (par + employee).
// =============================================================
import { supabaseAdmin } from "../supabase";
import { computeWorkedHours } from "../lib/hours-calc";

export const DIARIA_LONG_SHIFT_VALOR = 43.0;
export const DIARIA_LONG_SHIFT_LIMITE_HORAS = 16;
const DESC_PREFIX = "[AUTO] Jornada >16h";

type Resultado = {
  data: string;
  paresLongosDetectados: number;
  diariasGeradas: number;
  diariasJaExistentes: number;
  detalhes: Array<{
    parEntrada: string;
    parSaida: string;
    parHoras: number;
    employeeIdOrigem: number;
    employeeNameOrigem: string;
    osNumber: string | null;
    osId: number | null;
    diariasParaAgentes: Array<{ employeeId: number; employeeName: string; jaExistia: boolean }>;
  }>;
};

function brtRange(ymd: string) {
  const start = new Date(`${ymd}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function ymdBrt(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function fmtBr(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Processa o dia targetYmd (BRT) e lança diárias automaticamente.
 * Idempotente: mesma diária não é lançada 2x.
 */
export async function processDiariasJornadaLonga(targetYmd: string): Promise<Resultado> {
  const { start: dayStart, end: dayEnd } = brtRange(targetYmd);

  // 1) Pega TODOS os funcionários (inclusive inativos — se OS antiga
  // tinha agente que hoje está inativo, ele ainda merece a diária retroativa)
  const { data: employees } = await supabaseAdmin
    .from("employees")
    .select("id, name, status");

  const empMap = new Map<number, string>();
  for (const e of (employees || []) as any[]) empMap.set(e.id, e.name);
  const empIds = Array.from(empMap.keys());

  if (empIds.length === 0) {
    return { data: targetYmd, paresLongosDetectados: 0, diariasGeradas: 0, diariasJaExistentes: 0, detalhes: [] };
  }

  // 2) Janela ampla pra capturar pares longos:
  //    - 1 dia ANTES do alvo (pra entrada na noite anterior cruzando meia-noite)
  //    - 3 dias DEPOIS do alvo (pra saída atrasada do tipo "agente esqueceu de
  //      bater por 2 dias" — capturando pares de até ~3 dias).
  const punchStart = new Date(dayStart.getTime() - 24 * 3600 * 1000).toISOString();
  const punchEnd = new Date(dayEnd.getTime() + 3 * 24 * 3600 * 1000).toISOString();

  const { data: punches } = await supabaseAdmin
    .from("control_id_punches")
    .select("employee_id, punch_at")
    .in("employee_id", empIds)
    .gte("punch_at", punchStart)
    .lt("punch_at", punchEnd)
    .order("punch_at", { ascending: true });

  const punchesByEmp = new Map<number, Array<{ punch_at: string }>>();
  for (const p of (punches || []) as any[]) {
    if (!punchesByEmp.has(p.employee_id)) punchesByEmp.set(p.employee_id, []);
    punchesByEmp.get(p.employee_id)!.push({ punch_at: p.punch_at });
  }

  // 3) Detecta pares > 16h cuja entrada caia no dia alvo
  type ParLongo = {
    employeeId: number;
    entrada: Date;
    saida: Date;
    horas: number;
  };
  const paresLongos: ParLongo[] = [];
  for (const [empId, pl] of Array.from(punchesByEmp.entries())) {
    const r = computeWorkedHours(pl);
    for (const par of r.pairs) {
      const horas = (par.saida.getTime() - par.entrada.getTime()) / 3600000;
      if (horas <= DIARIA_LONG_SHIFT_LIMITE_HORAS) continue;
      // Só conta o par se a ENTRADA cair no dia alvo (BRT) — evita reprocessar
      // o mesmo par em dias diferentes.
      if (ymdBrt(par.entrada) !== targetYmd) continue;
      paresLongos.push({ employeeId: empId, entrada: par.entrada, saida: par.saida, horas });
    }
  }

  if (paresLongos.length === 0) {
    return { data: targetYmd, paresLongosDetectados: 0, diariasGeradas: 0, diariasJaExistentes: 0, detalhes: [] };
  }

  // 4) Pra cada par, encontra OS desse agente que sobreponha o par
  // (busca todas OS do agente na janela ampla, depois filtra por sobreposição)
  const overlappingStart = new Date(Math.min(...paresLongos.map(p => p.entrada.getTime()))).toISOString();
  const overlappingEnd = new Date(Math.max(...paresLongos.map(p => p.saida.getTime()))).toISOString();

  const { data: osList } = await supabaseAdmin
    .from("service_orders")
    .select("id, os_number, assigned_employee_id, assigned_employee_2_id, mission_started_at, completed_date")
    .or(
      `and(mission_started_at.gte.${overlappingStart},mission_started_at.lte.${overlappingEnd}),and(completed_date.gte.${overlappingStart},completed_date.lte.${overlappingEnd}),and(mission_started_at.lte.${overlappingStart},completed_date.gte.${overlappingEnd})`
    )
    .neq("status", "recusada")
    .neq("status", "cancelada");

  const allOs = (osList || []) as any[];

  // 5) Pra cada par, lança diária pra dupla da OS sobreposta
  const detalhes: Resultado["detalhes"] = [];
  let diariasGeradas = 0;
  let diariasJaExistentes = 0;

  for (const par of paresLongos) {
    const empName = empMap.get(par.employeeId) || `Funcionário #${par.employeeId}`;
    const parEntradaMs = par.entrada.getTime();
    const parSaidaMs = par.saida.getTime();

    // OS sobreposta = OS desse agente onde mission_started_at <= parSaida e (completed_date>=parEntrada || completed_date null)
    const osSobreposta = allOs.find((o) => {
      const isAgent = o.assigned_employee_id === par.employeeId || o.assigned_employee_2_id === par.employeeId;
      if (!isAgent) return false;
      const ini = o.mission_started_at ? new Date(o.mission_started_at).getTime() : null;
      const fim = o.completed_date ? new Date(o.completed_date).getTime() : Date.now();
      if (ini == null) return false;
      return ini <= parSaidaMs && fim >= parEntradaMs;
    });

    // Se não tem OS sobreposta, ainda assim lança a diária (pro próprio agente),
    // pq Thiago decidiu que é AUTOMÁTICO toda vez que par > 16h.
    const agentesDestino: number[] = osSobreposta
      ? [osSobreposta.assigned_employee_id, osSobreposta.assigned_employee_2_id].filter((x: any) => Boolean(x))
      : [par.employeeId];

    const dataDiaria = ymdBrt(par.entrada); // diária registrada no dia da entrada
    const parKey = `${par.entrada.toISOString()}|${par.saida.toISOString()}`;
    const descricao = `${DESC_PREFIX} (${par.horas.toFixed(2)}h) — par ${fmtBr(par.entrada)}→${fmtBr(par.saida)}${osSobreposta ? ` — OS ${osSobreposta.os_number}` : ""} — origem agente ${empName}`;

    const detalheDiarias: Resultado["detalhes"][number]["diariasParaAgentes"] = [];

    for (const agId of agentesDestino) {
      // Idempotência: procura diária existente pra esse agente nessa data com prefixo do par
      const dedupKey = `${DESC_PREFIX}%${parKey.slice(0, 30)}%`; // descrição inclui ISO da entrada como discriminante
      // Mais seguro: buscar exato pela substring do par (entrada ISO)
      const { data: existing } = await supabaseAdmin
        .from("agent_daily_allowances")
        .select("id, description")
        .eq("employee_id", agId)
        .eq("date", dataDiaria)
        .like("description", `${DESC_PREFIX}%${par.entrada.toISOString()}%`);

      const jaExistia = (existing || []).length > 0;
      if (!jaExistia) {
        const { error: insErr } = await supabaseAdmin
          .from("agent_daily_allowances")
          .insert({
            employee_id: agId,
            date: dataDiaria,
            amount: DIARIA_LONG_SHIFT_VALOR.toFixed(2),
            description: descricao + ` [par_iso=${par.entrada.toISOString()}]`,
          });
        if (!insErr) diariasGeradas++;
        else console.error("[diarias-long-shift] erro ao inserir:", insErr);
      } else {
        diariasJaExistentes++;
      }
      detalheDiarias.push({
        employeeId: agId,
        employeeName: empMap.get(agId) || `#${agId}`,
        jaExistia,
      });
    }

    detalhes.push({
      parEntrada: par.entrada.toISOString(),
      parSaida: par.saida.toISOString(),
      parHoras: Math.round(par.horas * 100) / 100,
      employeeIdOrigem: par.employeeId,
      employeeNameOrigem: empName,
      osNumber: osSobreposta?.os_number || null,
      osId: osSobreposta?.id || null,
      diariasParaAgentes: detalheDiarias,
    });
  }

  return {
    data: targetYmd,
    paresLongosDetectados: paresLongos.length,
    diariasGeradas,
    diariasJaExistentes,
    detalhes,
  };
}
