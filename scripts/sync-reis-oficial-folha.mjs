/**
 * Alinha batidas do Reis (emp 22) ao cartão oficial Control iD
 * competência 26/06/2026 → 25/07/2026 (HE 102:22).
 *
 * Local-only: source=folha_pdf_import, sem sync RHID.
 * Trava o período para o AFD não ressuscitar extras.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const replit = fs.readFileSync(new URL("../.replit", import.meta.url), "utf8");
const url = replit.match(/SUPABASE_URL = "([^"]+)"/)[1];
const key = replit.match(/SUPABASE_SERVICE_ROLE_KEY = "([^"]+)"/)[1];
const sb = createClient(url, key);

const EMP = 22;
const DEVICE = 1;
const UID = "27";
const FROM = "2026-06-26";
const TO = "2026-07-25";

/** Cartão oficial PDF JORGE_REIS_-_relatorio_2026727_1645_0461.PDF */
const DAYS = [
  ["2026-06-26", ["01:00", "11:56", "13:00", "23:31"]],
  ["2026-06-27", ["07:59", "11:59", "12:57", "23:59"]],
  ["2026-06-28", ["00:00", "12:05", "13:08", "23:59"]],
  ["2026-06-29", ["00:00", "12:13", "13:20", "23:59"]],
  ["2026-06-30", ["00:27", "15:32", "16:29", "23:59"]],
  ["2026-07-01", ["00:00", "12:03", "13:07", "23:59"]],
  ["2026-07-02", ["00:00", "12:32", "13:33", "23:59"]],
  ["2026-07-03", ["00:00", "11:58", "13:02", "23:59"]],
  ["2026-07-04", ["00:00", "03:40"]],
  ["2026-07-06", ["04:16", "13:18", "14:22", "23:59"]],
  ["2026-07-07", ["00:00", "12:12", "13:18", "22:25"]],
  ["2026-07-08", ["13:07", "14:26", "15:30", "20:45"]],
  ["2026-07-10", ["02:58", "11:47", "13:00", "18:05"]],
  ["2026-07-12", ["23:13", "23:59"]],
  ["2026-07-13", ["00:00", "11:35", "12:31", "14:51"]],
  ["2026-07-14", ["05:00", "11:34", "12:35", "14:16"]],
  ["2026-07-15", ["01:00", "12:09", "13:12", "23:59"]],
  ["2026-07-18", ["00:00", "05:12"]],
  ["2026-07-20", ["05:53", "07:00", "12:11", "13:20", "23:59"]],
  ["2026-07-21", ["00:00", "02:24", "08:00", "14:00"]],
  ["2026-07-22", ["05:47", "12:32", "13:28", "22:28"]],
  ["2026-07-23", ["05:24", "12:07", "13:06", "22:14"]],
  ["2026-07-24", ["06:49", "11:58", "13:00", "22:09"]],
];

function punchAt(date, hhmm) {
  return `${date}T${hhmm}:00-03:00`;
}

async function main() {
  const startIso = `${FROM}T00:00:00-03:00`;
  const endIso = `${TO}T23:59:59-03:00`;

  const { data: existing, error: selErr } = await sb
    .from("control_id_punches")
    .select("id")
    .eq("employee_id", EMP)
    .gte("punch_at", startIso)
    .lte("punch_at", endIso);
  if (selErr) throw selErr;
  const ids = (existing || []).map((r) => r.id);
  console.log("deleting", ids.length, "punches");
  if (ids.length) {
    const { error: delErr } = await sb.from("control_id_punches").delete().in("id", ids);
    if (delErr) throw delErr;
  }

  const rows = [];
  for (const [date, times] of DAYS) {
    times.forEach((t, i) => {
      const dir = i % 2 === 0 ? "in" : "out";
      rows.push({
        employee_id: EMP,
        device_id: DEVICE,
        control_id_user_id: UID,
        punch_at: punchAt(date, t),
        direction: dir,
        source: "folha_pdf_import",
        is_manual: true,
        external_id: null,
      });
    });
  }
  console.log("inserting", rows.length, "official punches");
  const { error: insErr } = await sb.from("control_id_punches").insert(rows);
  if (insErr) throw insErr;

  // Lock period (idempotent: skip if already covers range)
  const { data: locks } = await sb
    .from("control_id_locked_periods")
    .select("*")
    .eq("start_date", FROM)
    .eq("end_date", TO);
  if (!locks?.length) {
    const { error: lockErr } = await sb.from("control_id_locked_periods").insert({
      start_date: FROM,
      end_date: TO,
      device_id: null,
      note: "Folha Reis fechada — cartão oficial Control iD (HE 102:22) · 31/07/2026",
      locked_by: "agent (ordem do dono: espelho oficial do mês)",
    });
    if (lockErr) throw lockErr;
    console.log("locked period", FROM, "→", TO);
  } else {
    console.log("lock already exists", locks[0].id);
  }

  // Verify
  const { data: after } = await sb
    .from("control_id_punches")
    .select("punch_at, source")
    .eq("employee_id", EMP)
    .gte("punch_at", startIso)
    .lte("punch_at", endIso)
    .order("punch_at");
  console.log("now", after?.length, "punches; sources", [...new Set((after || []).map((p) => p.source))]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
