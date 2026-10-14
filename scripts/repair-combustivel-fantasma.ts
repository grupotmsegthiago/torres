/**
 * Repara lado de CUSTO em escort_billings com combustível fantasma.
 * NÃO altera fat_* / despesas_pedagio cobrado ao cliente (boletim comercial).
 *
 * Uso:
 *   npx tsx scripts/repair-combustivel-fantasma.ts --dry-run
 *   npx tsx scripts/repair-combustivel-fantasma.ts --apply --os TOR-0783
 *   npx tsx scripts/repair-combustivel-fantasma.ts --apply --all-inflated
 */
import { createClient } from "@supabase/supabase-js";
import { buildCostSideRepairFromMissionCosts } from "../server/lib/billing-margem-agente";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const allInflated = args.includes("--all-inflated");
const osArgIdx = args.indexOf("--os");
const osFilter = osArgIdx >= 0 ? String(args[osArgIdx + 1] || "").toUpperCase() : "";

async function main() {
  let q = sb
    .from("escort_billings")
    .select("id, service_order_id, fat_total, despesas_combustivel, despesas_pedagio, despesas_outras, pag_vrp, pag_periculosidade, pag_adicional_noturno, pag_reembolsos, pag_total, resultado_liquido, status")
    .gt("despesas_combustivel", 1000)
    .gte("data_missao", "2026-09-01")
    .order("despesas_combustivel", { ascending: false })
    .limit(50);
  const { data: bills, error } = await q;
  if (error) throw error;

  const soIds = [...new Set((bills || []).map((b: any) => b.service_order_id))];
  const { data: sos } = await sb.from("service_orders").select("id, os_number").in("id", soIds);
  const osById = new Map((sos || []).map((s: any) => [s.id, s.os_number]));

  const { data: mcs } = await sb
    .from("mission_costs")
    .select("service_order_id, amount, category, cost_type")
    .in("service_order_id", soIds);
  const mcByOs = new Map<number, any[]>();
  for (const mc of mcs || []) {
    const id = Number(mc.service_order_id);
    const arr = mcByOs.get(id) || [];
    arr.push(mc);
    mcByOs.set(id, arr);
  }

  let repaired = 0;
  for (const b of bills || []) {
    const osNumber = String(osById.get(b.service_order_id) || "");
    if (osFilter && osNumber !== osFilter) continue;
    const costs = mcByOs.get(Number(b.service_order_id)) || [];
    const repair = buildCostSideRepairFromMissionCosts(b, costs);
    const billingComb = Number(b.despesas_combustivel || 0);
    if (billingComb <= (repair.despesas_combustivel + 1) * 5) {
      if (!allInflated && !osFilter) continue;
      if (billingComb <= repair.despesas_combustivel + 1) continue;
    }
    console.log(
      `${dryRun ? "[dry-run]" : "[apply]"} ${osNumber} billing=${b.id} status=${b.status} ` +
        `comb ${billingComb}→${repair.despesas_combustivel} liquido ${b.resultado_liquido}→${repair.resultado_liquido} fat=${b.fat_total}`,
    );
    if (dryRun) {
      repaired++;
      continue;
    }
    const { error: upErr } = await sb
      .from("escort_billings")
      .update({
        despesas_combustivel: repair.despesas_combustivel,
        despesas_outras: repair.despesas_outras,
        desp_total: repair.desp_total,
        pag_reembolsos: repair.pag_reembolsos,
        pag_total: repair.pag_total,
        resultado_bruto: repair.resultado_bruto,
        resultado_liquido: repair.resultado_liquido,
        margem_percentual: repair.margem_percentual,
      })
      .eq("id", b.id);
    if (upErr) throw upErr;

    await sb.from("service_orders").update({
      custo_combustivel_alocado: repair.despesas_combustivel,
      custo_pedagio_alocado: Number(
        (costs.filter((c: any) => {
          const cat = String(c.category || "").toLowerCase();
          return c.cost_type === "expense" && (cat === "pedágio" || cat === "pedagio");
        }).reduce((s: number, c: any) => s + Number(c.amount || 0), 0)).toFixed(2),
      ),
      custo_total_alocado: repair.desp_total + Number(b.pag_vrp || 0) + Number(b.pag_periculosidade || 0) + Number(b.pag_adicional_noturno || 0),
      lucro_calculado: repair.resultado_liquido,
      margem_calculada: repair.margem_percentual,
    }).eq("id", b.service_order_id);

    await sb.from("system_audit_logs").insert({
      user_name: "repair-combustivel-fantasma",
      user_role: "system",
      action: "REPAIR_COMBUSTIVEL_FANTASMA",
      target_id: b.id,
      target_type: "escort_billing",
      details: `${osNumber}: despesas_combustivel ${billingComb}→${repair.despesas_combustivel}; resultado_liquido ${b.resultado_liquido}→${repair.resultado_liquido}; fat_total preservado ${b.fat_total}`,
    });
    repaired++;
  }
  console.log(`Done. ${repaired} billing(s). dryRun=${dryRun}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
