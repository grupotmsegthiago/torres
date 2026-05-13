import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";

// ============================================================
// Divergências de Jornada — cruzamento Ponto × OS
// 2 alertas conforme prioridade do Thiago:
//   A) Agente em missão SEM ponto batido no dia
//   B) Ponto fechado (OUT) ANTES da OS encerrar (= HE não registrada)
// Considera batidas vindas de iDFace (fixo) e iDCloud (mobile),
// pois ambas chegam em control_id_punches via API.
// ============================================================

function toBrtDayRange(ymd: string): { startUtc: string; endUtc: string; label: string } {
  // BRT = UTC-3 sem DST (regra do projeto). 00:00 BRT = 03:00 UTC.
  const start = new Date(`${ymd}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const label = start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), label };
}

function fmtBrTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtBrDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
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
  //    Filtro: missionStartedAt OU completedDate dentro da janela BRT.
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

  const [empRes, clientRes, punchRes] = await Promise.all([
    supabaseAdmin.from("employees").select("id, name").in("id", Array.from(empIds)),
    clientIds.size
      ? supabaseAdmin.from("clients").select("id, name").in("id", Array.from(clientIds))
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin
      .from("control_id_punches")
      .select("employee_id, punch_at, direction")
      .in("employee_id", Array.from(empIds))
      .gte("punch_at", startUtc)
      .lt("punch_at", endUtc)
      .order("punch_at", { ascending: true }),
  ]);

  const empMap = new Map<number, string>();
  for (const e of (empRes.data || [])) empMap.set((e as any).id, (e as any).name);
  const clientMap = new Map<number, string>();
  for (const c of ((clientRes as any).data || [])) clientMap.set((c as any).id, (c as any).name);

  // Punches por employee_id (já ordenados por horário)
  const punchesByEmp = new Map<number, Array<{ punch_at: string; direction: string | null }>>();
  for (const p of ((punchRes as any).data || [])) {
    const id = (p as any).employee_id as number;
    if (!id) continue;
    if (!punchesByEmp.has(id)) punchesByEmp.set(id, []);
    punchesByEmp.get(id)!.push({ punch_at: (p as any).punch_at, direction: (p as any).direction });
  }

  const divergencias: DivergenciaJornada[] = [];

  for (const o of oss as any[]) {
    const employees = [o.assigned_employee_id, o.assigned_employee_2_id].filter(Boolean) as number[];
    const clientName = clientMap.get(o.client_id) || `Cliente #${o.client_id}`;

    for (const empId of employees) {
      const empName = empMap.get(empId) || `Funcionário #${empId}`;
      const punches = punchesByEmp.get(empId) || [];

      // ---- ALERTA A: missão sem ponto no dia ----
      if (punches.length === 0) {
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
          detalhe: `Agente ${empName} aparece como alocado na OS ${o.os_number} mas NÃO bateu ponto em ${label} (nem iDFace nem iDCloud).`,
        });
        continue; // se não tem ponto, não dá pra avaliar B
      }

      // ---- ALERTA B: OS encerrou DEPOIS do último ponto OUT ----
      // (= HE não registrada, risco trabalhista)
      const lastOut = [...punches].reverse().find(p => (p.direction || "").toLowerCase() === "out");
      // Fallback: se não há direction marcada, usa o último punch como aproximação.
      const lastFechamento = lastOut || punches[punches.length - 1];
      if (!lastFechamento) continue;

      const osFimIso = o.completed_date || (o.status === "em_andamento" ? new Date().toISOString() : null);
      if (!osFimIso) continue;

      const lastOutMs = new Date(lastFechamento.punch_at).getTime();
      const osFimMs = new Date(osFimIso).getTime();
      const diffMin = Math.round((osFimMs - lastOutMs) / 60000);

      // Tolerância de 15min — batidas têm latência e o agente pode bater antes
      // de finalizar a OS no app por questão de minutos.
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
          lastPunchOutAt: lastFechamento.punch_at,
          diffMinutos: diffMin,
          detalhe: `Último ponto de ${empName} foi às ${fmtBrTime(lastFechamento.punch_at)}, mas a OS ${o.os_number} ${o.completed_date ? `encerrou às ${fmtBrTime(o.completed_date)}` : "continua aberta"} — diferença de ${diffMin} min sem registro.`,
        });
      }
    }
  }

  // Ordena: alta antes de media; dentro do tipo, OS mais recente primeiro.
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
      // Default: ontem (fechamento do dia anterior em BRT)
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
