import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "./_helpers";
import { z } from "zod";

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

  app.delete("/api/daily-allowances/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("agent_daily_allowances").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });
}
