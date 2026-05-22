// =============================================================
// Diárias automáticas por jornada > 16h — AGREGADAS POR QUINZENA
// Regra (Thiago):
//   - Se um par de batidas (entrada→saída) passar de 16h, gera
//     diária de R$43,00 pra TODOS os agentes da OS naquele turno
//     (assigned + assigned 2).
//   - NÃO lança uma linha por par. Em vez disso, agrega POR
//     FUNCIONÁRIO POR QUINZENA — uma única linha por agente
//     por quinzena (Q1: dias 1–15, Q2: dias 16–fim do mês),
//     somando os R$43 de cada par e listando as OSs na descrição.
//   - Idempotente: a cada execução, REPROCESSA a quinzena inteira
//     (apaga as linhas [AUTO] anteriores da quinzena e reinsere
//     uma linha consolidada por agente). Lançamentos manuais
//     (sem o prefixo [AUTO]) não são tocados.
// =============================================================
import { supabaseAdmin } from "../supabase";
import { computeWorkedHours } from "../lib/hours-calc";

export const DIARIA_LONG_SHIFT_VALOR = 43.0;
export const DIARIA_LONG_SHIFT_LIMITE_HORAS = 16;
// Prefixos que identificam linhas geradas automaticamente.
// Inclui o prefixo antigo pra limpar as linhas legacy do modelo "1 por par".
const DESC_PREFIX_NEW = "[AUTO-Q] Diárias jornada >16h";
const DESC_PREFIX_OLD = "[AUTO] Jornada >16h";

type AgenteResumo = {
  employeeId: number;
  employeeName: string;
  pares: number;
  totalValor: number;
  osNumbers: Set<string>;
};

type Resultado = {
  quinzena: string;            // ex: "Q1/2026-05"
  quinzenaInicio: string;      // YMD
  quinzenaFim: string;         // YMD
  paresLongosDetectados: number;
  linhasRemovidas: number;
  linhasCriadas: number;
  agentes: Array<{
    employeeId: number;
    employeeName: string;
    pares: number;
    totalValor: number;
    osNumbers: string[];
  }>;
};

function ymdBrt(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

/**
 * Dado um YMD qualquer, retorna início/fim da QUINZENA que contém esse dia.
 * Q1: 01–15 do mês. Q2: 16 até o último dia.
 */
function quinzenaRange(targetYmd: string): { label: string; startYmd: string; endYmd: string } {
  const [yyyy, mm, dd] = targetYmd.split("-").map((n) => parseInt(n, 10));
  const lastDay = new Date(yyyy, mm, 0).getDate(); // último dia do mês
  if (dd <= 15) {
    return {
      label: `Q1/${yyyy}-${String(mm).padStart(2, "0")}`,
      startYmd: `${yyyy}-${String(mm).padStart(2, "0")}-01`,
      endYmd: `${yyyy}-${String(mm).padStart(2, "0")}-15`,
    };
  }
  return {
    label: `Q2/${yyyy}-${String(mm).padStart(2, "0")}`,
    startYmd: `${yyyy}-${String(mm).padStart(2, "0")}-16`,
    endYmd: `${yyyy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Processa a QUINZENA que contém targetYmd e lança/atualiza as diárias
 * agregadas por agente. Apaga linhas [AUTO]/[AUTO-Q] antigas da quinzena
 * antes de reinserir — lançamentos manuais ficam intocados.
 */
export async function processDiariasJornadaLonga(targetYmd: string): Promise<Resultado> {
  const { label: quinzenaLabel, startYmd, endYmd } = quinzenaRange(targetYmd);
  const startIso = `${startYmd}T00:00:00-03:00`;
  const endIso = `${endYmd}T23:59:59-03:00`;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  // 1) Funcionários
  const { data: employees } = await supabaseAdmin
    .from("employees")
    .select("id, name, status");
  const empMap = new Map<number, string>();
  for (const e of (employees || []) as any[]) empMap.set(e.id, e.name);
  const empIds = Array.from(empMap.keys());

  if (empIds.length === 0) {
    return {
      quinzena: quinzenaLabel,
      quinzenaInicio: startYmd,
      quinzenaFim: endYmd,
      paresLongosDetectados: 0,
      linhasRemovidas: 0,
      linhasCriadas: 0,
      agentes: [],
    };
  }

  // 2) Janela ampla pra capturar pares que cruzem a borda da quinzena
  const punchStart = new Date(startMs - 24 * 3600 * 1000).toISOString();
  const punchEnd = new Date(endMs + 3 * 24 * 3600 * 1000).toISOString();

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

  // 3) Detecta pares > 16h cuja ENTRADA caia dentro da quinzena (evita dupla contagem em quinzenas adjacentes)
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
      const entradaMs = par.entrada.getTime();
      if (entradaMs < startMs || entradaMs > endMs) continue;
      paresLongos.push({ employeeId: empId, entrada: par.entrada, saida: par.saida, horas });
    }
  }

  // 4) OSs sobrepostas (pra dupla = ambos agentes recebem)
  let allOs: any[] = [];
  if (paresLongos.length > 0) {
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
    allOs = (osList || []) as any[];
  }

  // 5) Agrega por agente
  const porAgente = new Map<number, AgenteResumo>();
  function bump(agId: number, valor: number, osNumber: string | null) {
    if (!porAgente.has(agId)) {
      porAgente.set(agId, {
        employeeId: agId,
        employeeName: empMap.get(agId) || `#${agId}`,
        pares: 0,
        totalValor: 0,
        osNumbers: new Set<string>(),
      });
    }
    const x = porAgente.get(agId)!;
    x.pares += 1;
    x.totalValor += valor;
    if (osNumber) x.osNumbers.add(osNumber);
  }

  for (const par of paresLongos) {
    const parEntradaMs = par.entrada.getTime();
    const parSaidaMs = par.saida.getTime();
    const osSobreposta = allOs.find((o) => {
      const isAgent = o.assigned_employee_id === par.employeeId || o.assigned_employee_2_id === par.employeeId;
      if (!isAgent) return false;
      const ini = o.mission_started_at ? new Date(o.mission_started_at).getTime() : null;
      const fim = o.completed_date ? new Date(o.completed_date).getTime() : Date.now();
      if (ini == null) return false;
      return ini <= parSaidaMs && fim >= parEntradaMs;
    });
    const agentesDestino: number[] = osSobreposta
      ? [osSobreposta.assigned_employee_id, osSobreposta.assigned_employee_2_id].filter((x: any) => Boolean(x))
      : [par.employeeId];
    for (const agId of agentesDestino) {
      bump(agId, DIARIA_LONG_SHIFT_VALOR, osSobreposta?.os_number || null);
    }
  }

  // 6) Limpa linhas AUTO antigas da quinzena (tanto modelo antigo "1 por par"
  //    quanto AUTO-Q de execuções anteriores). Lançamentos manuais não tocam.
  const { data: oldRows } = await supabaseAdmin
    .from("agent_daily_allowances")
    .select("id, description")
    .gte("date", startYmd)
    .lte("date", endYmd)
    .or(`description.ilike.${DESC_PREFIX_NEW}%,description.ilike.${DESC_PREFIX_OLD}%`);
  const idsToDelete = (oldRows || []).map((r: any) => r.id);
  let linhasRemovidas = 0;
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("agent_daily_allowances")
      .delete()
      .in("id", idsToDelete);
    if (delErr) console.error("[diarias-quinzena] erro ao deletar antigas:", delErr);
    else linhasRemovidas = idsToDelete.length;
  }

  // 7) Insere uma linha por agente, datada no FIM da quinzena
  let linhasCriadas = 0;
  const agentesOut: Resultado["agentes"] = [];
  for (const resumo of Array.from(porAgente.values())) {
    const osList = Array.from(resumo.osNumbers).sort();
    const osTxt = osList.length > 0 ? ` — OSs: ${osList.join(", ")}` : "";
    const descricao = `${DESC_PREFIX_NEW} — ${quinzenaLabel} — ${resumo.pares} jornada${resumo.pares === 1 ? "" : "s"} >16h${osTxt} — R$ ${DIARIA_LONG_SHIFT_VALOR.toFixed(2).replace(".", ",")} × ${resumo.pares}`;
    const { error: insErr } = await supabaseAdmin
      .from("agent_daily_allowances")
      .insert({
        employee_id: resumo.employeeId,
        date: endYmd,
        amount: resumo.totalValor.toFixed(2),
        description: descricao,
      });
    if (insErr) {
      console.error("[diarias-quinzena] erro ao inserir:", insErr);
    } else {
      linhasCriadas++;
    }
    agentesOut.push({
      employeeId: resumo.employeeId,
      employeeName: resumo.employeeName,
      pares: resumo.pares,
      totalValor: +resumo.totalValor.toFixed(2),
      osNumbers: osList,
    });
  }

  agentesOut.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt-BR"));

  return {
    quinzena: quinzenaLabel,
    quinzenaInicio: startYmd,
    quinzenaFim: endYmd,
    paresLongosDetectados: paresLongos.length,
    linhasRemovidas,
    linhasCriadas,
    agentes: agentesOut,
  };
}
