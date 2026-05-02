import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "./_helpers";
import { z } from "zod";

/**
 * Conta dias úteis (seg-sex) entre `from` e `to` (ambos inclusivos),
 * descontando os feriados informados em `holidaySet` (Set<"YYYY-MM-DD">).
 */
export function countBusinessDays(fromISO: string, toISO: string, holidaySet: Set<string>): number {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  if (to < from) return 0;
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow = cur.getDay(); // 0=dom 6=sab
    const iso = cur.toISOString().slice(0, 10);
    if (dow >= 1 && dow <= 5 && !holidaySet.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Retorna primeiro/último dia (YYYY-MM-DD) de um mês (1-12). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

/** Carrega todos os feriados (cache-friendly) e devolve um Set "YYYY-MM-DD". */
export async function loadHolidaySet(fromISO?: string, toISO?: string): Promise<Set<string>> {
  let q = supabaseAdmin.from("holidays").select("date");
  if (fromISO) q = q.gte("date", fromISO);
  if (toISO) q = q.lte("date", toISO);
  const { data } = await q;
  return new Set((data || []).map((h: any) => String(h.date).slice(0, 10)));
}

const insertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  national: z.boolean().optional().default(true),
});

export function registerHolidaysRoutes(app: Express) {
  app.get("/api/holidays", requireAuth, async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : null;
    let q = supabaseAdmin.from("holidays").select("*").order("date", { ascending: true });
    if (year) q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });

  app.post("/api/holidays", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const { data, error } = await supabaseAdmin
      .from("holidays")
      .insert({ date: parsed.data.date, name: parsed.data.name, national: parsed.data.national ?? true })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json(data);
  });

  app.delete("/api/holidays/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("holidays").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });
}
