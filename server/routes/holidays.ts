import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
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

/** Retorna primeiro/último dia (YYYY-MM-DD) de um mês CIVIL (1-12).
 *  Use SOMENTE para coisas que rodam em mês civil: balanço gerencial,
 *  meta de faturamento, custos fixos contábeis. NÃO USE em RH (folha,
 *  ponto, holerite, horas extras, Cesta Básica II) — pra RH use
 *  `payrollPeriodRange` do mesmo arquivo (ciclo 26 → 25).
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

/** Retorna o período de folha de RH (ciclo 26 → 25) como strings
 *  YYYY-MM-DD INCLUSIVAS. `month` é o mês de FECHAMENTO (1-12), ex:
 *  month=5,year=2026 → { from: "2026-04-26", to: "2026-05-25" }.
 *  É drop-in para queries que já usam `gte(from).lte(to)`.
 */
export function payrollPeriodRange(year: number, month: number): { from: string; to: string } {
  const start = new Date(Date.UTC(year, month - 2, 26));   // 26 do mês anterior
  const end = new Date(Date.UTC(year, month - 1, 25));     // 25 do mês corrente
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}

/** Cache em memória do conjunto de feriados, keyed por faixa (from|to).
 *  Feriados quase nunca mudam, e telas como Balanço Gerencial chamam
 *  `loadHolidaySet` uma vez por funcionário (N+1). O cache elimina essas
 *  consultas repetidas dentro de uma mesma janela. Invalidado em
 *  qualquer escrita na tabela `holidays` (POST/DELETE abaixo). */
const HOLIDAY_CACHE_TTL_MS = 5 * 60 * 1000;
const holidayCache = new Map<string, { set: Set<string>; loadedAt: number }>();

export function invalidateHolidayCache() {
  holidayCache.clear();
}

/** Carrega todos os feriados (cache-friendly) e devolve um Set "YYYY-MM-DD". */
export async function loadHolidaySet(fromISO?: string, toISO?: string): Promise<Set<string>> {
  const key = `${fromISO || ""}|${toISO || ""}`;
  const hit = holidayCache.get(key);
  if (hit && Date.now() - hit.loadedAt < HOLIDAY_CACHE_TTL_MS) {
    return hit.set;
  }
  let q = supabaseAdmin.from("holidays").select("date");
  if (fromISO) q = q.gte("date", fromISO);
  if (toISO) q = q.lte("date", toISO);
  const { data } = await q;
  const set = new Set((data || []).map((h: any) => String(h.date).slice(0, 10)));
  holidayCache.set(key, { set, loadedAt: Date.now() });
  return set;
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
    invalidateHolidayCache();
    res.status(201).json(data);
  });

  app.delete("/api/holidays/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("holidays").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    invalidateHolidayCache();
    res.json({ ok: true });
  });
}
