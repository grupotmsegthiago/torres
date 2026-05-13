import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { computeWorkedHours } from "../lib/hours-calc";

// ============================================================
// Divergências de Jornada — cruzamento Ponto × OS
// 2 alertas conforme prioridade do Thiago:
//   A) Agente em missão SEM ponto batido (nenhum par cobrindo a janela)
//   B) Ponto fechado (último OUT do par que cobre a missão) ANTES da OS encerrar
// Considera batidas vindas de iDFace (fixo) e iDCloud (mobile),
// pois ambas chegam em control_id_punches via API.
//
// PRECISÃO: usa o motor canônico computeWorkedHours pra parear batidas em
// (entrada, saída). Isso resolve TURNO NOTURNO — uma jornada que começa às
// 18h e fecha às 03:49 do dia seguinte é UM par só, e o "OUT" verdadeiro
// é 03:49 daquele par, não a próxima batida solta.
// Janela de busca de batidas = [target-1d, target+2d] em UTC, pra capturar
// pares que cruzam meia-noite em qualquer direção.
// ============================================================

function toBrtDayRange(ymd: string): { startUtc: string; endUtc: string; label: string } {
  const start = new Date(`${ymd}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const label = start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), label };
}

function fmtBrTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit",
  });
}

export type DivergenciaJornada =
  | {
      tipo: "MISSAO_SEM_PONTO";
      severidade: "alta";
      osId: number;
      osNumber: string;
      clientName: string;
      employeeId: number;
      employeeName: string;
      missionStartedAt: string | null;
      completedDate: string | null;
      detalhe: string;
    }
  | {
      tipo: "PONTO_FECHADO_OS_ABERTA";
      severidade: "media";
      osId: number;
      osNumber: string;
      clientName: string;
      employeeId: number;
      employeeName: string;
      missionStartedAt: string | null;
      completedDate: string | null;
      lastPunchOutAt: string;
      diffMinutos: number;
      detalhe: string;
    };

export async function computeDivergenciasJornada(targetDate: string): Promise<{
  data: string;
  totalOS: number;
  totalAgentesAvaliados: number;
  divergencias: DivergenciaJornada[];
  resumo: { missaoSemPonto: number; pontoFechadoOsAberta: number };
}> {
  const { startUtc, endUtc, label } = toBrtDayRange(targetDate);

  // 1) OS realizadas naquele dia (concluída OU em andamento naquele dia).
  const { data: osRows, error: osErr } = await supabaseAdmin
    .from("service_orders")
    .select("id, os_number, client_id, status, mission_status, assigned_employee_id, assigned_employee_2_id, mission_started_at, completed_date")
    .or(
      `and(mission_started_at.gte.${startUtc},mission_started_at.lt.${endUtc}),and(completed_date.gte.${startUtc},completed_date.lt.${endUtc})`
    )
    .neq("status", "recusada")
    .neq("status", "cancelada");
  if (osErr) throw osErr;

  const oss = (osRows || []).filter(
    (o: any) => o.assigned_employee_id || o.assigned_employee_2_id
  );

  if (oss.length === 0) {
    return { data: label, totalOS: 0, totalAgentesAvaliados: 0, divergencias: [], resumo: { missaoSemPonto: 0, pontoFechadoOsAberta: 0 } };
  }

  // 2) Coleta IDs únicos de agente e cliente
  const empIds = new Set<number>();
  const clientIds = new Set<number>();
  for (const o of oss) {
    if (o.assigned_employee_id) empIds.add(o.assigned_employee_id);
    if (o.assigned_employee_2_id) empIds.add(o.assigned_employee_2_id);
    if (o.client_id) clientIds.add(o.client_id);
  }

  // 3) Busca batidas em janela ±1 dia (3 dias totais) pra capturar pares
  // que cruzam meia-noite (turno noturno do agente de escolta).
  const punchStartUtc = new Date(new Date(startUtc).getTime() - 24 * 3600 * 1000).toISOString();
  const punchEndUtc = new Date(new Date(endUtc).getTime() + 24 * 3600 * 1000).toISOString();

  const [empRes, clientRes, punchRes] = await Promise.all([
    supabaseAdmin.from("employees").select("id, name").in("id", Array.from(empIds)),
    clientIds.size
      ? supabaseAdmin.from("clients").select("id, name").in("id", Array.from(clientIds))
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin
      .from("control_id_punches")
      .select("employee_id, punch_at")
      .in("employee_id", Array.from(empIds))
      .gte("punch_at", punchStartUtc)
      .lt("punch_at", punchEndUtc)
      .order("punch_at", { ascending: true }),
  ]);

  const empMap = new Map<number, string>();
  for (const e of (empRes.data || [])) empMap.set((e as any).id, (e as any).name);
  const clientMap = new Map<number, string>();
  for (const c of ((clientRes as any).data || [])) clientMap.set((c as any).id, (c as any).name);

  const punchesByEmp = new Map<number, Array<{ punch_at: string }>>();
  for (const p of ((punchRes as any).data || [])) {
    const id = (p as any).employee_id as number;
    if (!id) continue;
    if (!punchesByEmp.has(id)) punchesByEmp.set(id, []);
    punchesByEmp.get(id)!.push({ punch_at: (p as any).punch_at });
  }

  // Pré-calcula pares + open shift por funcionário (uma vez só)
  const journeyByEmp = new Map<number, ReturnType<typeof computeWorkedHours>>();
  for (const [empId, punches] of Array.from(punchesByEmp.entries())) {
    journeyByEmp.set(empId, computeWorkedHours(punches));
  }

  const divergencias: DivergenciaJornada[] = [];

  for (const o of oss as any[]) {
    const employees = [o.assigned_employee_id, o.assigned_employee_2_id].filter(Boolean) as number[];
    const clientName = clientMap.get(o.client_id) || `Cliente #${o.client_id}`;

    // Janela da missão: do início ao fim. Se ainda em andamento, usa "agora".
    const missionStartMs = o.mission_started_at ? new Date(o.mission_started_at).getTime() : null;
    const isOngoing = !o.completed_date && (o.status === "em_andamento" || o.mission_status === "em_andamento");
    const missionEndMs = o.completed_date
      ? new Date(o.completed_date).getTime()
      : isOngoing ? Date.now() : null;

    // Sem janela definida (OS sem início registrado), pula avaliação.
    if (missionStartMs == null || missionEndMs == null) continue;

    for (const empId of employees) {
      const empName = empMap.get(empId) || `Funcionário #${empId}`;
      const journey = journeyByEmp.get(empId);

      // ---- Decisão usando o motor canônico ----
      // Procura par que SOBREPONHA a janela da missão.
      let coveringPair: { entrada: Date; saida: Date } | null = null;
      if (journey) {
        for (const pair of journey.pairs) {
          const e = pair.entrada.getTime();
          const s = pair.saida.getTime();
          // sobreposição = não termina antes da missão começar nem começa depois da missão acabar
          if (s >= missionStartMs && e <= missionEndMs) {
            coveringPair = pair;
            break;
          }
        }
      }

      // Open shift (entrada sem saída) que começou antes do fim da missão
      // também conta como "estava com ponto aberto durante a missão".
      const openShiftCovers =
        journey?.hasOpenShift &&
        journey.openShiftSince &&
        journey.openShiftSince.getTime() <= missionEndMs;

      // ---- ALERTA A: missão sem ponto ----
      if (!coveringPair && !openShiftCovers) {
        divergencias.push({
          tipo: "MISSAO_SEM_PONTO",
          severidade: "alta",
          osId: o.id,
          osNumber: o.os_number,
          clientName,
          employeeId: empId,
          employeeName: empName,
          missionStartedAt: o.mission_started_at,
          completedDate: o.completed_date,
          detalhe: `Agente ${empName} aparece como alocado na OS ${o.os_number} mas NÃO tem jornada de ponto cobrindo a missão (nem iDFace nem iDCloud).`,
        });
        continue;
      }

      // ---- ALERTA B: ponto fechado ANTES da OS encerrar ----
      // (open shift = ponto não fechou ainda → não dispara B)
      if (coveringPair && !openShiftCovers && o.completed_date) {
        const saidaMs = coveringPair.saida.getTime();
        const osFimMs = missionEndMs;
        const diffMin = Math.round((osFimMs - saidaMs) / 60000);
        // Tolerância 15min — agente bate ponto e finaliza OS no app com pequeno delay.
        if (diffMin > 15) {
          divergencias.push({
            tipo: "PONTO_FECHADO_OS_ABERTA",
            severidade: "media",
            osId: o.id,
            osNumber: o.os_number,
            clientName,
            employeeId: empId,
            employeeName: empName,
            missionStartedAt: o.mission_started_at,
            completedDate: o.completed_date,
            lastPunchOutAt: coveringPair.saida.toISOString(),
            diffMinutos: diffMin,
            detalhe: `Jornada de ${empName} encerrou às ${fmtBrTime(coveringPair.saida)}, mas a OS ${o.os_number} só fechou às ${fmtBrTime(o.completed_date)} — ${diffMin} min trabalhados sem registro de ponto.`,
          });
        }
      }
    }
  }

  divergencias.sort((a, b) => {
    const sevOrder = { alta: 0, media: 1 } as const;
    if (sevOrder[a.severidade] !== sevOrder[b.severidade]) {
      return sevOrder[a.severidade] - sevOrder[b.severidade];
    }
    return b.osId - a.osId;
  });

  return {
    data: label,
    totalOS: oss.length,
    totalAgentesAvaliados: empIds.size,
    divergencias,
    resumo: {
      missaoSemPonto: divergencias.filter(d => d.tipo === "MISSAO_SEM_PONTO").length,
      pontoFechadoOsAberta: divergencias.filter(d => d.tipo === "PONTO_FECHADO_OS_ABERTA").length,
    },
  };
}

export function registerDivergenciasJornadaRoutes(app: Express) {
  app.get("/api/divergencias-jornada", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const ontemBrt = (() => {
        const now = new Date();
        const brtNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        brtNow.setDate(brtNow.getDate() - 1);
        return brtNow.toISOString().slice(0, 10);
      })();
      const ymd = (req.query.date as string) || ontemBrt;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        return res.status(400).json({ message: "date inválido (use YYYY-MM-DD)" });
      }
      const result = await computeDivergenciasJornada(ymd);
      res.json(result);
    } catch (err: any) {
      console.error("[divergencias-jornada]", err);
      res.status(500).json({ message: err.message });
    }
  });
}
