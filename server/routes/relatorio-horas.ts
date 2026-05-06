import type { Express } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfTodayBRT(): Date {
  const now = new Date();
  const brtMs = now.getTime() - BRT_OFFSET_MS;
  const brt = new Date(brtMs);
  brt.setUTCHours(0, 0, 0, 0);
  return new Date(brt.getTime() + BRT_OFFSET_MS);
}

function ymdBRT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

function parseYmdToBRT(ymd: string): Date {
  return new Date(`${ymd}T00:00:00-03:00`);
}

function diffHours(start: string | Date | null, end: string | Date | null): number {
  if (!start || !end) return 0;
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const diff = (e.getTime() - s.getTime()) / 3600000;
  return diff > 0 ? diff : 0;
}

function findStepTs(stepLogs: any[], stepKey: string): string | null {
  if (!Array.isArray(stepLogs)) return null;
  const reversed = [...stepLogs].reverse();
  const direct = reversed.find((l: any) => l.step === stepKey);
  if (direct) return direct.timestamp || direct.completedAt || null;
  const next = reversed.find((l: any) => l.nextStep === stepKey);
  if (next) return next.timestamp || next.completedAt || null;
  return null;
}

function firstStepTs(stepLogs: any[]): string | null {
  if (!Array.isArray(stepLogs) || !stepLogs.length) return null;
  for (const l of stepLogs) {
    const ts = l.timestamp || l.completedAt;
    if (ts) return ts;
  }
  return null;
}

function lastStepTs(stepLogs: any[]): string | null {
  if (!Array.isArray(stepLogs) || !stepLogs.length) return null;
  for (let i = stepLogs.length - 1; i >= 0; i--) {
    const l = stepLogs[i];
    const ts = l.timestamp || l.completedAt;
    if (ts) return ts;
  }
  return null;
}

function osWindow(os: any): { ini: string | null; fim: string | null; from: "step_logs" | "mission_dates" | "fallback" | null } {
  const stepIni = findStepTs(os.step_logs, "checkout_km_saida");
  const stepFim = findStepTs(os.step_logs, "chegada_base") || findStepTs(os.step_logs, "encerrada") || findStepTs(os.step_logs, "retorno_base");
  if (stepIni && stepFim) return { ini: stepIni, fim: stepFim, from: "step_logs" };
  if (os.mission_started_at && os.completed_date) return { ini: os.mission_started_at, fim: os.completed_date, from: "mission_dates" };
  // Fallback amplo: primeiro/último step_log + completed_date
  const ini = stepIni || os.mission_started_at || firstStepTs(os.step_logs);
  const fim = stepFim || os.completed_date || lastStepTs(os.step_logs);
  if (ini && fim) return { ini, fim, from: "fallback" };
  return { ini: null, fim: null, from: null };
}

export function registerRelatorioHorasRoutes(app: Express) {
  app.get("/api/relatorios/horas-trabalhadas", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeIdQ = req.query.employeeId ? Number(req.query.employeeId) : null;
      const startQ = req.query.start ? String(req.query.start) : null;
      const endQ = req.query.end ? String(req.query.end) : null;
      const sourceQ = String(req.query.source || "ambos") as "os" | "ponto" | "ambos";

      const todayStart = startOfTodayBRT();
      const endLimit = endQ ? parseYmdToBRT(endQ) : todayStart;
      const endEffective = endLimit < todayStart ? new Date(endLimit.getTime() + 24 * 3600000) : todayStart;

      const { data: employees } = await supabaseAdmin
        .from("employees")
        .select("id, name, matricula, role, status")
        .order("name", { ascending: true });

      const empMap = new Map<number, any>();
      for (const e of employees || []) empMap.set(e.id, e);

      let osQuery = supabaseAdmin
        .from("service_orders")
        .select("id, os_number, status, mission_started_at, completed_date, scheduled_date, step_logs, assigned_employee_id, assigned_employee_2_id, cancellation_reason")
        .eq("status", "concluida")
        .not("completed_date", "is", null)
        .lt("completed_date", endEffective.toISOString());

      if (employeeIdQ) {
        osQuery = osQuery.or(`assigned_employee_id.eq.${employeeIdQ},assigned_employee_2_id.eq.${employeeIdQ}`);
      }

      const { data: osRows, error: osErr } = await osQuery;
      if (osErr) return res.status(500).json({ message: osErr.message });

      const osValid = (osRows || []).filter((o: any) => {
        if (o.cancellation_reason && String(o.cancellation_reason).trim().length > 2) return false;
        const refDate = o.completed_date || o.mission_started_at || o.scheduled_date;
        if (!refDate) return false;
        if (startQ) {
          const startDt = parseYmdToBRT(startQ);
          if (new Date(refDate) < startDt) return false;
        }
        return true;
      });

      const perEmployee = new Map<number, {
        employeeId: number;
        name: string;
        matricula: string | null;
        role: string | null;
        primeiraOs: { osId: number; osNumber: string | null; date: string } | null;
        osCount: number;
        totalHorasOs: number;
        totalHorasPonto: number;
        diasComPonto: number;
        osList: Array<{
          osId: number;
          osNumber: string | null;
          date: string;
          ini: string;
          fim: string;
          horas: number;
          role: "principal" | "secundario";
          fonte: "step_logs" | "mission_dates";
        }>;
      }>();

      const ensureEmp = (empId: number) => {
        if (perEmployee.has(empId)) return perEmployee.get(empId)!;
        const e = empMap.get(empId);
        const obj = {
          employeeId: empId,
          name: e?.name || `#${empId}`,
          matricula: e?.matricula || null,
          role: e?.role || null,
          primeiraOs: null,
          osCount: 0,
          totalHorasOs: 0,
          totalHorasPonto: 0,
          diasComPonto: 0,
          diasTrabalhados: 0,
          _diasSet: new Set<string>(),
          osList: [] as any[],
        };
        perEmployee.set(empId, obj);
        return obj;
      };

      if (sourceQ === "os" || sourceQ === "ambos") {
        for (const o of osValid) {
          const w = osWindow(o);
          const horas = w.ini && w.fim ? diffHours(w.ini, w.fim) : 0;
          const refDate = w.ini || o.mission_started_at || o.completed_date || o.scheduled_date;
          const dateLabel = ymdBRT(refDate);
          const principalId = o.assigned_employee_id ? Number(o.assigned_employee_id) : null;
          const secundarioId = o.assigned_employee_2_id ? Number(o.assigned_employee_2_id) : null;
          const targets: { id: number; role: "principal" | "secundario" }[] = [];
          if (principalId) targets.push({ id: principalId, role: "principal" });
          if (secundarioId && secundarioId !== principalId) targets.push({ id: secundarioId, role: "secundario" });

          for (const t of targets) {
            if (employeeIdQ && t.id !== employeeIdQ) continue;
            const emp = ensureEmp(t.id);
            emp.osCount += 1;
            emp.totalHorasOs += horas;
            emp._diasSet.add(dateLabel);
            emp.osList.push({
              osId: o.id,
              osNumber: o.os_number,
              date: dateLabel,
              ini: w.ini || refDate,
              fim: w.fim || refDate,
              horas: Math.round(horas * 100) / 100,
              role: t.role,
              fonte: (w.from || "sem_horario") as any,
            });
            const cur = emp.primeiraOs;
            const refIso = (w.ini || refDate) as string;
            if (!cur || refIso < cur.date) {
              emp.primeiraOs = { osId: o.id, osNumber: o.os_number, date: refIso };
            }
          }
        }
      }

      if (sourceQ === "ponto" || sourceQ === "ambos") {
        const empIdsForPunch = employeeIdQ
          ? [employeeIdQ]
          : Array.from(new Set([
              ...Array.from(perEmployee.keys()),
              ...((employees || []).filter((e: any) => e.status === "ativo").map((e: any) => e.id)),
            ]));

        const startISO = startQ ? parseYmdToBRT(startQ).toISOString() : new Date(0).toISOString();
        const endISO = endEffective.toISOString();

        if (empIdsForPunch.length > 0) {
          const { data: punches } = await supabaseAdmin
            .from("control_id_punches")
            .select("employee_id, punch_at")
            .in("employee_id", empIdsForPunch)
            .gte("punch_at", startISO)
            .lt("punch_at", endISO)
            .order("punch_at", { ascending: true });

          const byEmpDay = new Map<string, string[]>();
          for (const p of punches || []) {
            if (!p.employee_id) continue;
            const k = `${p.employee_id}|${ymdBRT(p.punch_at)}`;
            if (!byEmpDay.has(k)) byEmpDay.set(k, []);
            byEmpDay.get(k)!.push(p.punch_at);
          }

          for (const [key, list] of Array.from(byEmpDay.entries())) {
            const [empIdStr] = key.split("|");
            const empId = Number(empIdStr);
            const sorted = list.sort();
            const seen = new Set<string>();
            const clean: Date[] = [];
            for (const ts of sorted) {
              const minute = ts.slice(0, 16);
              if (seen.has(minute)) continue;
              seen.add(minute);
              clean.push(new Date(ts));
            }
            let dayMin = 0;
            for (let i = 0; i + 1 < clean.length; i += 2) {
              const diff = (clean[i + 1].getTime() - clean[i].getTime()) / 60000;
              if (diff > 0) dayMin += diff;
            }
            if (dayMin <= 0) continue;
            const emp = ensureEmp(empId);
            emp.totalHorasPonto += dayMin / 60;
            emp.diasComPonto += 1;
            const [, dayStr] = key.split("|");
            if (dayStr) emp._diasSet.add(dayStr);
          }
        }
      }

      const list = Array.from(perEmployee.values())
        .map(e => {
          const { _diasSet, ...rest } = e as any;
          return {
            ...rest,
            diasTrabalhados: _diasSet.size,
            totalHorasOs: Math.round(e.totalHorasOs * 100) / 100,
            totalHorasPonto: Math.round(e.totalHorasPonto * 100) / 100,
            mediaHorasPorOs: e.osCount > 0 ? Math.round((e.totalHorasOs / e.osCount) * 100) / 100 : 0,
            osList: e.osList.sort((a: any, b: any) => b.ini.localeCompare(a.ini)),
          };
        })
        .sort((a, b) => (b.totalHorasOs + b.totalHorasPonto) - (a.totalHorasOs + a.totalHorasPonto));

      const totals = {
        totalHorasOs: Math.round(list.reduce((s, e) => s + e.totalHorasOs, 0) * 100) / 100,
        totalHorasPonto: Math.round(list.reduce((s, e) => s + e.totalHorasPonto, 0) * 100) / 100,
        totalOsCount: list.reduce((s, e) => s + e.osCount, 0),
        employeesCount: list.filter(e => e.osCount > 0 || e.totalHorasPonto > 0).length,
      };

      console.log("[relatorio-horas] dias por emp:", list.map(e => `${e.name}=${e.diasTrabalhados}`).join(", "));
      res.json({
        from: startQ || null,
        to: endQ || null,
        endEffective: endEffective.toISOString(),
        source: sourceQ,
        totals,
        employees: list,
      });
    } catch (err: any) {
      console.error("[relatorio-horas]", err);
      res.status(500).json({ message: err.message });
    }
  });
}
