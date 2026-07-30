/**
 * Simulação SOMENTE LEITURA: motor antigo (first_last) vs canônico (pares+cluster)
 * para todos os funcionários do período 26/06/2026–25/07/2026.
 *
 * Também simula a reparação do Reis 21/07 em memória (sem UPDATE).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../server/supabase";
import {
  computePeriodJornada,
  minutesToHHMM,
  type JornadaPunchInput,
} from "../server/lib/jornada-calc";
import { monthToFechamento } from "../server/lib/control-id-parsers";

const CAP = 1199;
const BASE = 220 * 60;
const OUT_DIR = path.join(".local", "db-backups", "folha-pairing-20260730-184645");

function firstLastPeriod(punches: JornadaPunchInput[]) {
  const byDay = new Map<string, Date[]>();
  for (const p of punches) {
    const d = typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at;
    const day = new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(d);
  }
  let total = 0;
  const perDay: Record<string, number> = {};
  for (const [day, arr] of [...byDay.entries()].sort()) {
    const sorted = [...arr].sort((a, b) => a.getTime() - b.getTime());
    if (sorted.length < 2) {
      perDay[day] = 0;
      continue;
    }
    let w = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / 60000;
    if (sorted.length >= 4) w -= (sorted[2].getTime() - sorted[1].getTime()) / 60000;
    w = Math.min(Math.round(w), CAP);
    perDay[day] = w;
    total += w;
  }
  return { total, perDay, he: Math.max(0, total - BASE) };
}

function applyVirtualRepair(punches: any[]): any[] {
  return punches.map((p) => {
    if (Number(p.id) === 735073) {
      return { ...p, punch_at: "2026-07-21T08:00:00-03:00" };
    }
    if (Number(p.id) === 780452) {
      return { ...p, punch_at: "2026-07-21T14:00:00-03:00" };
    }
    return p;
  });
}

async function main() {
  const { start, end } = monthToFechamento("2026-07");
  // Pagina — PostgREST limita ~1000 linhas por request.
  const punches: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error: punchErr } = await supabaseAdmin
      .from("control_id_punches")
      .select("id, employee_id, punch_at, source, is_manual, external_id, direction")
      .gte("punch_at", start.toISOString())
      .lt("punch_at", end.toISOString())
      .not("employee_id", "is", null)
      .order("punch_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (punchErr) throw new Error(punchErr.message);
    punches.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  console.log("punches_loaded", punches.length, "range", start.toISOString(), "→", end.toISOString());

  const byEmp = new Map<number, any[]>();
  for (const p of punches || []) {
    if (p.employee_id == null) continue;
    if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
    byEmp.get(p.employee_id)!.push(p);
  }

  const empIds = [...byEmp.keys()];
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, status")
    .in("id", empIds.length ? empIds : [-1]);
  const nameById = new Map((emps || []).map((e: any) => [Number(e.id), e.name]));

  const rows: any[] = [];
  const allClusters: any[] = [];
  let changed = 0;

  for (const empId of empIds.sort((a, b) => a - b)) {
    const emp = { id: empId, name: nameById.get(empId) || `#${empId}` };
    let list = byEmp.get(emp.id) || [];
    const isReis = emp.id === 22;
    if (isReis) list = applyVirtualRepair(list);

    const old = firstLastPeriod(list);
    const neu = computePeriodJornada(list, { baseMin: BASE });
    const delta = neu.totalWorkedMin - old.total;

    if (delta !== 0) changed++;

    const dayDiffs: any[] = [];
    const days = new Set([...Object.keys(old.perDay), ...neu.days.map((d) => d.day)]);
    for (const day of [...days].sort()) {
      const o = old.perDay[day] || 0;
      const n = neu.days.find((d) => d.day === day)?.workedMin || 0;
      if (o !== n) {
        dayDiffs.push({ day, old: minutesToHHMM(o), neu: minutesToHHMM(n), deltaMin: n - o });
      }
    }

    for (const c of neu.clusters.filter((x) => x.clustered)) {
      allClusters.push({
        employee_id: emp.id,
        employee_name: emp.name,
        day: c.day,
        times: c.punches.map((p) => p.hhmm),
        ids: c.punches.map((p) => p.id),
        role: c.role,
        representative: c.representative.hhmm,
        ambiguous: c.ambiguous,
        safe: c.clustered && !c.ambiguous,
      });
    }

    rows.push({
      employee_id: emp.id,
      name: emp.name,
      punches: list.length,
      old_hhmm: minutesToHHMM(old.total),
      old_he: minutesToHHMM(old.he),
      new_hhmm: neu.totalWorkedHHMM,
      new_he: neu.heHHMM,
      delta_min: delta,
      day_diffs: dayDiffs,
      ambiguous_clusters: neu.ambiguousClusters.length,
      safe_clusters: neu.safeClusters.length,
      orphans: neu.orphans.length,
      virtual_repair_21jul: isReis,
    });
  }

  rows.sort((a, b) => Math.abs(b.delta_min) - Math.abs(a.delta_min));

  const reis = rows.find((r) => r.employee_id === 22);
  const report = {
    generated_at: new Date().toISOString(),
    period: "2026-06-26/2026-07-25",
    note: "Reis 21/07 com reparação VIRTUAL (em memória). Banco não alterado.",
    summary: {
      employees: rows.length,
      changed,
      unchanged: rows.length - changed,
      reis,
      top_deltas: rows.filter((r) => r.delta_min !== 0).slice(0, 15),
    },
    clusters: {
      total: allClusters.length,
      safe: allClusters.filter((c) => c.safe).length,
      ambiguous: allClusters.filter((c) => c.ambiguous).length,
      list: allClusters,
    },
    employees: rows,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "simular-folha-pairing-result.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("clusters:", report.clusters.total, "safe:", report.clusters.safe, "ambiguous:", report.clusters.ambiguous);
  console.log("wrote", outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
