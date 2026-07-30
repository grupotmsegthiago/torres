/**
 * Homologação individual (somente leitura) — motor canônico.
 *
 * first_last é referência histórica inválida (não indício de erro do canônico).
 * Classifica dias: confirmado | pendente_orfao | pendente_cluster | pendente_misto | incompleto.
 *
 * Reis 21/07: aplica reparação VIRTUAL (sem UPDATE).
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
  for (const [, arr] of byDay) {
    const sorted = [...arr].sort((a, b) => a.getTime() - b.getTime());
    if (sorted.length < 2) continue;
    let w = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / 60000;
    if (sorted.length >= 4) w -= (sorted[2].getTime() - sorted[1].getTime()) / 60000;
    total += Math.min(Math.round(w), CAP);
  }
  return { total, he: Math.max(0, total - BASE) };
}

function applyVirtualRepair(punches: any[]): any[] {
  return punches.map((p) => {
    if (Number(p.id) === 735073) return { ...p, punch_at: "2026-07-21T08:00:00-03:00" };
    if (Number(p.id) === 780452) return { ...p, punch_at: "2026-07-21T14:00:00-03:00" };
    return p;
  });
}

async function main() {
  const { start, end } = monthToFechamento("2026-07");
  const punches: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("control_id_punches")
      .select("id, employee_id, punch_at, source, is_manual, external_id, direction")
      .gte("punch_at", start.toISOString())
      .lt("punch_at", end.toISOString())
      .not("employee_id", "is", null)
      .order("punch_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    punches.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const byEmp = new Map<number, any[]>();
  for (const p of punches) {
    if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
    byEmp.get(p.employee_id)!.push(p);
  }
  const empIds = [...byEmp.keys()].sort((a, b) => a - b);
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name").in("id", empIds);
  const nameById = new Map((emps || []).map((e: any) => [Number(e.id), e.name as string]));

  const employees: any[] = [];
  for (const empId of empIds) {
    let list = byEmp.get(empId)!;
    const virtualRepair = empId === 22;
    if (virtualRepair) list = applyVirtualRepair(list);

    const old = firstLastPeriod(list);
    const neu = computePeriodJornada(list, { baseMin: BASE });

    const days = neu.days.map((d) => ({
      date: d.day,
      status: d.status,
      worked: minutesToHHMM(d.workedMin),
      confirmed: minutesToHHMM(d.confirmedMin),
      provisional: minutesToHHMM(d.provisionalMin),
      pairs: d.pairs.map((pr) => `${pr.entrada.hhmm}→${pr.saida.hhmm}=${minutesToHHMM(pr.durationMin)}`),
      orphan_ids: d.orphans.map((o) => o.id).filter((x): x is number => x != null),
      orphan_times: d.orphans.map((o) => o.hhmm),
      ambiguous_clusters: d.clusters
        .filter((c) => c.ambiguous)
        .map((c) => ({ times: c.punches.map((x) => x.hhmm), ids: c.punches.map((x) => x.id) })),
      needs_manual: d.needsManualReview,
    }));

    employees.push({
      employee_id: empId,
      name: nameById.get(empId) || `#${empId}`,
      punches: list.length,
      virtual_repair_21jul: virtualRepair,
      // first_last = motor inválido (só histórico)
      total_antigo_first_last: minutesToHHMM(old.total),
      he_antigo_first_last: minutesToHHMM(old.he),
      // canônico
      total_canonico_pares: neu.totalWorkedHHMM,
      he_canonico: neu.heHHMM,
      total_confirmado_auto: neu.totalConfirmadoHHMM,
      he_confirmada_auto: neu.heConfirmadoHHMM,
      total_pendente_revisao: neu.totalPendenteHHMM,
      dias_confirmados: neu.confirmedDays.length,
      dias_pendentes: neu.pendingDays.length,
      orphan_ids: neu.orphans.map((o) => o.punch.id).filter((x): x is number => x != null),
      ambiguous_cluster_count: neu.ambiguousClusters.length,
      ambiguous_clusters: neu.ambiguousClusters.map((c) => ({
        day: c.day,
        times: c.punches.map((x) => x.hhmm),
        ids: c.punches.map((x) => x.id),
      })),
      homologacao:
        neu.pendingDays.length === 0
          ? "fechado_automatico"
          : neu.confirmedDays.length > 0
            ? "parcial_com_pendencias"
            : "somente_pendencias",
      days,
    });
  }

  const reis = employees.find((e) => e.employee_id === 22);
  const report = {
    generated_at: new Date().toISOString(),
    period: "2026-06-26/2026-07-25",
    rules: {
      old_motor: "first_last — TECNICAMENTE INVÁLIDO para folha",
      canonical:
        "BRT + trunc segundos + dedup minuto + cluster≤2min + pares 1→2 + órfãs + cap 19:59",
      confirmed: "dias sem órfã e sem cluster ambíguo",
      pending: "pares provisórios em dias com órfã/cluster; órfã não entra como jornada inventada",
      reis_official_target: "322:22 / HE 102:22 (cartão 27/07/2026)",
    },
    summary: {
      employees: employees.length,
      fechado_automatico: employees.filter((e) => e.homologacao === "fechado_automatico").length,
      parcial_com_pendencias: employees.filter((e) => e.homologacao === "parcial_com_pendencias").length,
      somente_pendencias: employees.filter((e) => e.homologacao === "somente_pendencias").length,
      reis_match_official:
        reis?.total_canonico_pares === "322:22" && reis?.he_canonico === "102:22",
      reis,
    },
    employees,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "homologacao-17-funcionarios.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  // CSV resumo
  const csvLines = [
    [
      "employee_id",
      "name",
      "total_antigo_first_last",
      "total_canonico",
      "he_canonico",
      "total_confirmado",
      "total_pendente",
      "dias_pendentes",
      "orphan_ids",
      "ambiguous_clusters",
      "homologacao",
    ].join(";"),
  ];
  for (const e of employees) {
    csvLines.push(
      [
        e.employee_id,
        e.name,
        e.total_antigo_first_last,
        e.total_canonico_pares,
        e.he_canonico,
        e.total_confirmado_auto,
        e.total_pendente_revisao,
        e.dias_pendentes,
        (e.orphan_ids || []).join("|"),
        e.ambiguous_cluster_count,
        e.homologacao,
      ].join(";"),
    );
  }
  const csvFile = path.join(OUT_DIR, "homologacao-17-funcionarios.csv");
  fs.writeFileSync(csvFile, csvLines.join("\n"), "utf8");

  console.log(JSON.stringify(report.summary, null, 2));
  console.log("wrote", outFile);
  console.log("wrote", csvFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
