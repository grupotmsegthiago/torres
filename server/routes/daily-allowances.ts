import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { z } from "zod";
import { buildFolhaPonto } from "../control-id";
import { monthToFechamento } from "../lib/control-id-parsers";
import { getPayrollPeriod, getPayrollPeriodForDate } from "@shared/payroll-period";
import {
  acumularDiariaPonto,
  daysInclusive,
  descricaoDiariaManual,
  diaElegivelDiariaFolha,
  DIARIA_MANUAL_JUSTIFICATIVA_MIN,
  DIARIA_PONTO_UNIT,
  ehDiariaManual,
  ehDiariaPonto,
  formatPeriodoBR,
  rangeFitsDiarias,
} from "@shared/diarias-periodo";
import {
  DIARIA_LONG_SHIFT_VALOR,
  DIARIA_PONTO_DESCRICAO,
} from "../jobs/diarias-jornada-longa";

const insertSchema = z.object({
  employeeId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  description: z.string().optional().nullable(),
});

/**
 * Soma de diárias por agente em um período.
 * Devolve { total, porAgente: { [employeeId]: total } }.
 */
export async function sumDailyAllowancesForPeriod(fromISO: string, toISO: string): Promise<{
  total: number;
  porAgente: Record<number, number>;
}> {
  const { data, error } = await supabaseAdmin
    .from("agent_daily_allowances")
    .select("employee_id, amount, date")
    .gte("date", fromISO)
    .lte("date", toISO);
  if (error || !data) return { total: 0, porAgente: {} };
  let total = 0;
  const porAgente: Record<number, number> = {};
  for (const r of data as any[]) {
    const v = Number(r.amount || 0);
    total += v;
    porAgente[r.employee_id] = (porAgente[r.employee_id] || 0) + v;
  }
  return { total, porAgente };
}

export function registerDailyAllowancesRoutes(app: Express) {
  app.get("/api/daily-allowances", requireAuth, requireAdminRole, async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    let q = supabaseAdmin
      .from("agent_daily_allowances")
      .select("*")
      .order("date", { ascending: false })
      .limit(500);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: error.message });

    // Anexa nome do agente para display
    const empIds = Array.from(new Set((data || []).map((r: any) => r.employee_id)));
    const employees: Record<number, string> = {};
    if (empIds.length > 0) {
      const { data: emps } = await supabaseAdmin
        .from("employees")
        .select("id, name")
        .in("id", empIds);
      for (const e of (emps || []) as any[]) employees[e.id] = e.name;
    }
    res.json(
      (data || []).map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: employees[r.employee_id] || `Agente ${r.employee_id}`,
        date: r.date,
        amount: Number(r.amount || 0),
        description: r.description,
        createdAt: r.created_at,
      }))
    );
  });

  app.post("/api/daily-allowances", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const { data, error } = await supabaseAdmin
      .from("agent_daily_allowances")
      .insert({
        employee_id: parsed.data.employeeId,
        date: parsed.data.date,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json({
      id: data.id,
      employeeId: data.employee_id,
      date: data.date,
      amount: Number(data.amount || 0),
      description: data.description,
    });
  });

  const pontoSchema = z.object({
    employeeId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    on: z.boolean(),
    origem: z.enum(["PONTO_AUTOMATICO", "MANUAL"]).optional(),
    justificativa: z.string().optional().nullable(),
    amount: z.number().positive().max(1000).optional(),
  });

  app.get("/api/daily-allowances/ponto", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.query.employeeId);
    const month = String(req.query.month || "");
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Funcionário e mês inválidos" });
    }
    const { start, end } = monthToFechamento(month);
    const from = new Date(start.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    const to = new Date(end.getTime() - 3 * 3600000 - 1).toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("agent_daily_allowances")
      .select("id, employee_id, date, amount, description, origem, justificativa")
      .eq("employee_id", employeeId)
      .gte("date", from)
      .lte("date", to);
    if (error) return res.status(500).json({ message: error.message });
    res.json((data || [])
      .filter((r: any) => ehDiariaPonto(r) || ehDiariaManual(r))
      .map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        date: String(r.date).slice(0, 10),
        amount: Number(r.amount || 0),
        description: r.description,
        origem: r.origem === "MANUAL" || ehDiariaManual(r) ? "MANUAL" : "PONTO_AUTOMATICO",
        justificativa: r.justificativa || null,
      })));
  });

  app.post("/api/daily-allowances/ponto", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = pontoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos" });
    const { employeeId, date, month, on } = parsed.data;
    const origem = parsed.data.origem || "PONTO_AUTOMATICO";
    const manual = origem === "MANUAL";

    const { data: doDia, error: findErr } = await supabaseAdmin
      .from("agent_daily_allowances")
      .select("id, date, amount, description, origem, justificativa")
      .eq("employee_id", employeeId)
      .eq("date", date);
    if (findErr) return res.status(500).json({ message: findErr.message });
    const linhas = (doDia || []) as any[];
    const pontos = linhas.filter((r) => ehDiariaPonto(r));
    const manuais = linhas.filter((r) => ehDiariaManual(r));

    if (!on) {
      const ids = (manual ? manuais : pontos).map((r) => r.id);
      if (ids.length > 0) {
        const { error } = await supabaseAdmin.from("agent_daily_allowances").delete().in("id", ids);
        if (error) return res.status(500).json({ message: error.message });
      }
      return res.json({ on: false, date, amount: 0, origem });
    }

    const folha = await buildFolhaPonto(employeeId, month);
    const day = (folha || []).find((d: any) => String(d.date).slice(0, 10) === date);
    const elegivel = !!day && diaElegivelDiariaFolha(day);

    if (manual) {
      if (elegivel) {
        return res.status(400).json({
          message: "Este dia já tem as 4 batidas e passa de 16 horas. Marque a diária de R$ 43 na coluna.",
        });
      }
      const justificativa = String(parsed.data.justificativa || "").trim();
      if (justificativa.length < DIARIA_MANUAL_JUSTIFICATIVA_MIN) {
        return res.status(400).json({ message: "Informe a justificativa da diária manual." });
      }
      const aprovadorId = Number((req as any).user?.id);
      if (!Number.isInteger(aprovadorId) || aprovadorId <= 0) {
        return res.status(401).json({ message: "Operador não identificado." });
      }
      const amount = Math.round((parsed.data.amount ?? DIARIA_LONG_SHIFT_VALOR) * 100) / 100;
      if (pontos.length > 0) {
        const { error } = await supabaseAdmin.from("agent_daily_allowances").delete().in("id", pontos.map((r) => r.id));
        if (error) return res.status(500).json({ message: error.message });
      }
      const payload = {
        employee_id: employeeId,
        date,
        amount,
        description: descricaoDiariaManual(justificativa),
        origem: "MANUAL",
        justificativa,
        usuario_aprovador_id: aprovadorId,
      };
      if (manuais.length > 0) {
        const { data, error } = await supabaseAdmin
          .from("agent_daily_allowances")
          .update(payload)
          .eq("id", manuais[0].id)
          .select("id, date, amount, origem, justificativa")
          .single();
        if (error) return res.status(500).json({ message: error.message });
        return res.json({
          on: true,
          id: data.id,
          date: String(data.date).slice(0, 10),
          amount: Number(data.amount || amount),
          origem: "MANUAL",
          justificativa: data.justificativa,
        });
      }
      const { data, error } = await supabaseAdmin
        .from("agent_daily_allowances")
        .insert(payload)
        .select("id, date, amount, origem, justificativa")
        .single();
      if (error) return res.status(500).json({ message: error.message });
      return res.status(201).json({
        on: true,
        id: data.id,
        date: String(data.date).slice(0, 10),
        amount: Number(data.amount || amount),
        origem: "MANUAL",
        justificativa: data.justificativa,
      });
    }

    if (!elegivel) {
      return res.status(400).json({
        message: "A diária da jornada só libera com as 4 batidas (entrada, saída almoço, volta e saída) e jornada maior que 16 horas.",
      });
    }
    if (manuais.length > 0) {
      const { error } = await supabaseAdmin.from("agent_daily_allowances").delete().in("id", manuais.map((r) => r.id));
      if (error) return res.status(500).json({ message: error.message });
    }
    if (pontos.length > 0) {
      const row = pontos[0];
      return res.json({ on: true, id: row.id, date, amount: Number(row.amount || DIARIA_LONG_SHIFT_VALOR), origem: "PONTO_AUTOMATICO" });
    }

    const aprovadorId = Number((req as any).user?.id);
    const { data, error } = await supabaseAdmin
      .from("agent_daily_allowances")
      .insert({
        employee_id: employeeId,
        date,
        amount: DIARIA_LONG_SHIFT_VALOR,
        description: DIARIA_PONTO_DESCRICAO,
        origem: "PONTO_AUTOMATICO",
        justificativa: null,
        usuario_aprovador_id: Number.isInteger(aprovadorId) && aprovadorId > 0 ? aprovadorId : null,
      })
      .select("id, date, amount, origem")
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json({
      on: true,
      id: data.id,
      date: String(data.date).slice(0, 10),
      amount: Number(data.amount || DIARIA_LONG_SHIFT_VALOR),
      origem: "PONTO_AUTOMATICO",
    });
  });

  app.get("/api/daily-allowances/ponto-grade", requireAuth, requireAdminRole, async (req, res) => {
    const month = String(req.query.month || "");
    const fromQ = String(req.query.from || "");
    const toQ = String(req.query.to || "");
    let startDate: string;
    let endDate: string;
    let label: string;
    let days: string[];
    let monthOut = month;
    if (fromQ || toQ) {
      if (!rangeFitsDiarias(fromQ, toQ)) {
        return res.status(400).json({ message: "Intervalo inválido. Use no máximo 62 dias, com a data inicial até a final." });
      }
      startDate = fromQ;
      endDate = toQ;
      label = formatPeriodoBR(fromQ, toQ);
      days = daysInclusive(fromQ, toQ);
      if (!/^\d{4}-\d{2}$/.test(monthOut)) monthOut = fromQ.slice(0, 7);
    } else if (/^\d{4}-\d{2}$/.test(month)) {
      const [year, mm] = month.split("-").map(Number);
      const period = getPayrollPeriod(year, mm);
      startDate = period.startDate;
      endDate = period.endDate;
      label = period.label;
      days = daysInclusive(startDate, endDate);
    } else {
      const period = getPayrollPeriodForDate(new Date());
      startDate = period.startDate;
      endDate = period.endDate;
      label = period.label;
      days = daysInclusive(startDate, endDate);
      monthOut = `${period.year}-${String(period.month).padStart(2, "0")}`;
    }

    const daySet = new Set(days);
    const [{ data: emps, error: empErr }, { data: flags, error: flagErr }] = await Promise.all([
      supabaseAdmin.from("employees").select("id, name, matricula, role, status").eq("status", "ativo").order("name"),
      supabaseAdmin
        .from("agent_daily_allowances")
        .select("employee_id, date, amount, description, origem, justificativa")
        .gte("date", startDate)
        .lte("date", endDate),
    ]);
    if (empErr) return res.status(500).json({ message: empErr.message });
    if (flagErr) return res.status(500).json({ message: flagErr.message });

    const byEmp = acumularDiariaPonto(
      ((flags || []) as any[])
        .filter((f) => daySet.has(String(f.date).slice(0, 10)))
        .filter((f) => ehDiariaPonto(f) || ehDiariaManual(f))
        .map((f) => ({
          employeeId: Number(f.employee_id),
          date: String(f.date).slice(0, 10),
          amount: Number(f.amount),
          description: f.description,
        })),
      DIARIA_PONTO_UNIT,
    );

    const rows = ((emps || []) as any[])
      .filter((e) => /vigilante|escolta/i.test(String(e.role || "")) || byEmp.has(Number(e.id)))
      .map((e) => {
        const slot = byEmp.get(Number(e.id)) || { dates: [], total: 0 };
        return {
          employeeId: Number(e.id),
          name: String(e.name || ""),
          matricula: String(e.matricula || ""),
          dates: slot.dates,
          total: Math.round(slot.total * 100) / 100,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.employeeId - b.employeeId);

    const totalGeral = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100;
    res.json({
      month: monthOut,
      from: startDate,
      to: endDate,
      label,
      valorUnitario: DIARIA_LONG_SHIFT_VALOR,
      days,
      rows,
      totalGeral,
    });
  });

  app.delete("/api/daily-allowances/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("agent_daily_allowances").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });
}
