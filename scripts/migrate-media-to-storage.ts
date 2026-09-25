/**
 * CLI: migra lotes de mídia base64 → Storage.
 *
 * Uso:
 *   npx tsx scripts/migrate-media-to-storage.ts
 *   npx tsx scripts/migrate-media-to-storage.ts --limit=40
 *   npx tsx scripts/migrate-media-to-storage.ts --only=mission_photos
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou vars já usadas pelo app).
 * Idempotente: pode rodar várias vezes até migrated≈0.
 */
import { migrateMediaToStorage } from "../server/lib/migrate-media-to-storage";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const limit = Number(arg("limit") || "25");
  const only = arg("only") as "mission_photos" | "vehicle_fueling" | "employee_documents" | undefined;
  const tables = only ? [only] : undefined;
  console.log(`[migrate-media] início limit=${limit} tables=${tables?.join(",") || "all"}`);
  const report = await migrateMediaToStorage({ limitPerTable: limit, tables });
  console.log("[migrate-media] resultado:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("[migrate-media] FATAL:", e);
  process.exit(1);
});
