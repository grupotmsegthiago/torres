/**
 * Reparação AUDITÁVEL do dia 21/07/2026 — JORGE DOS REIS OLIVEIRA (emp 22).
 *
 * NÃO executa em produção por padrão. Somente dry-run.
 *
 * Uso:
 *   npx tsx scripts/repair-reis-2026-07-21.mts
 *   npx tsx scripts/repair-reis-2026-07-21.mts --execute   # exige REPAIR_CONFIRM=SIM e autorização
 *
 * Cartão oficial Control iD emitido em 27/07/2026:
 *   00:00 · 02:24 · 08:00 · 14:00 → 8:24
 *
 * Ações:
 *   - 735073: 12:00 → 08:00
 *   - 780452: 13:00 → 14:00
 *   - preservar 750134@14:00 (dedup no cálculo)
 *   - NÃO recriar 735076
 *   - NÃO apagar registros
 */
import "dotenv/config";

const REASON =
  "Restauração conforme cartão oficial Control iD emitido em 27/07/2026";
const DOCUMENT_REF = "JORGE REIS - relatorio_2026727_1645.PDF";

const OPS = [
  {
    punchId: 735073,
    employeeId: 22,
    fromIso: "2026-07-21T12:00:00-03:00",
    toIso: "2026-07-21T08:00:00-03:00",
  },
  {
    punchId: 780452,
    employeeId: 22,
    fromIso: "2026-07-21T13:00:00-03:00",
    toIso: "2026-07-21T14:00:00-03:00",
  },
] as const;

async function main() {
  const execute = process.argv.includes("--execute");
  console.log("=== repair-reis-2026-07-21 ===");
  console.log("mode:", execute ? "EXECUTE" : "DRY-RUN");
  console.log("reason:", REASON);
  console.log("document_ref:", DOCUMENT_REF);
  console.log("ops:", JSON.stringify(OPS, null, 2));

  if (!execute) {
    console.log("\nDry-run OK. Nenhuma alteração aplicada.");
    console.log("Para executar (SOMENTE com autorização explícita):");
    console.log('  $env:REPAIR_CONFIRM="SIM"; npx tsx scripts/repair-reis-2026-07-21.mts --execute');
    return;
  }

  if (process.env.REPAIR_CONFIRM !== "SIM") {
    console.error("Abortado: defina REPAIR_CONFIRM=SIM para executar.");
    process.exit(1);
  }

  // Import dinâmico só no caminho execute (evita conexão acidental no dry-run).
  const { supabaseAdmin } = await import("../server/supabase");
  const { writePunchAudit, assertPunchMutable } = await import("../server/lib/punch-audit");

  for (const op of OPS) {
    const { data: before, error } = await supabaseAdmin
      .from("control_id_punches")
      .select("*")
      .eq("id", op.punchId)
      .maybeSingle();
    if (error || !before) throw new Error(`Punch ${op.punchId} não encontrado: ${error?.message}`);
    if (Number(before.employee_id) !== op.employeeId) {
      throw new Error(`Punch ${op.punchId} não pertence ao employee ${op.employeeId}`);
    }

    await assertPunchMutable(before.punch_at, {
      forceLockedOverride: false,
      role: "diretoria",
      reason: REASON,
    });
    await assertPunchMutable(op.toIso, {
      forceLockedOverride: false,
      role: "diretoria",
      reason: REASON,
    });

    const { data: after, error: upErr } = await supabaseAdmin
      .from("control_id_punches")
      .update({ punch_at: new Date(op.toIso).toISOString() })
      .eq("id", op.punchId)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    try {
      await writePunchAudit({
        punchId: op.punchId,
        employeeId: op.employeeId,
        action: "repair",
        beforeRow: before,
        afterRow: after,
        reason: REASON,
        documentRef: DOCUMENT_REF,
        actor: {
          userId: null,
          name: "repair-script",
          email: process.env.REPAIR_ACTOR_EMAIL || null,
          role: "diretoria",
        },
        meta: {
          script: "repair-reis-2026-07-21.mts",
          expected_from: op.fromIso,
          expected_to: op.toIso,
        },
      });
    } catch (e: any) {
      await supabaseAdmin
        .from("control_id_punches")
        .update({ punch_at: before.punch_at })
        .eq("id", op.punchId);
      throw e;
    }
    console.log(`OK punch ${op.punchId}: ${op.fromIso} → ${op.toIso}`);
  }
  console.log("Reparação concluída com auditoria.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
