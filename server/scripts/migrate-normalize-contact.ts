/**
 * Migração idempotente: normaliza telefone e CEP em employees, clients,
 * client_vehicles e leads pra guardar apenas dígitos no banco.
 *
 * Por que: registros antigos vieram com formatos misturados (com/sem
 * máscara) — atrapalha busca, integrações de SMS/WhatsApp e relatórios.
 * Esta migração padroniza todos os registros existentes pro formato novo
 * (dígitos puros). O write-path já normaliza (server/lib/normalize-contact.ts).
 *
 * Uso:
 *   npx tsx server/scripts/migrate-normalize-contact.ts          (dry-run)
 *   npx tsx server/scripts/migrate-normalize-contact.ts --apply  (escreve)
 *
 * Idempotente: pode ser rodado várias vezes; só atualiza linhas cujo valor
 * canônico difere do atual. Pra confirmar conclusão, rode em dry-run no
 * final — todas as tabelas devem mostrar "atualizados=0".
 */
import { supabaseAdmin } from "../supabase.ts";
import { normalizePhone, normalizeZip } from "../lib/normalize-contact.ts";

const APPLY = process.argv.includes("--apply");

type Row = { id: number | string; [k: string]: any };

async function fetchAll(table: string, cols: string): Promise<Row[]> {
  const all: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(cols)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as any));
    if (data.length < pageSize) break;
  }
  return all;
}

async function normalizeTable(
  table: string,
  spec: { phones?: string[]; zips?: string[] },
) {
  const fields = ["id", ...(spec.phones || []), ...(spec.zips || [])].join(",");
  const rows = await fetchAll(table, fields);
  let toFix = 0;
  let unchanged = 0;
  const samples: any[] = [];
  for (const row of rows) {
    const updates: Record<string, any> = {};
    for (const f of spec.phones || []) {
      const orig = row[f];
      const norm = normalizePhone(orig);
      if (orig !== norm && !(orig == null && norm == null)) updates[f] = norm;
    }
    for (const f of spec.zips || []) {
      const orig = row[f];
      const norm = normalizeZip(orig);
      if (orig !== norm && !(orig == null && norm == null)) updates[f] = norm;
    }
    if (Object.keys(updates).length === 0) {
      unchanged++;
      continue;
    }
    toFix++;
    if (samples.length < 5) {
      const before: any = {};
      for (const f of [...(spec.phones || []), ...(spec.zips || [])]) before[f] = row[f];
      samples.push({ id: row.id, before, after: updates });
    }
    if (APPLY) {
      const { error } = await supabaseAdmin.from(table).update(updates).eq("id", row.id);
      if (error) console.error(`  ✗ update ${table}#${row.id}:`, error.message);
    }
  }
  console.log(`[${table}] total=${rows.length} mantidos=${unchanged} ${APPLY ? "atualizados" : "a-atualizar"}=${toFix}`);
  if (samples.length) console.log(`  amostras:`, JSON.stringify(samples, null, 2));
}

async function normalizeExtraDrivers() {
  const rows = await fetchAll("service_orders", "id,extra_drivers");
  let toFix = 0;
  let unchanged = 0;
  const samples: any[] = [];
  for (const row of rows) {
    const arr = row.extra_drivers;
    if (!Array.isArray(arr) || arr.length === 0) { unchanged++; continue; }
    let dirty = false;
    const next = arr.map((d: any) => {
      if (!d || typeof d !== "object") return d;
      const orig = d.phone;
      if (orig == null || orig === "") return d;
      const norm = normalizePhone(orig);
      if (norm !== orig) { dirty = true; return { ...d, phone: norm }; }
      return d;
    });
    if (!dirty) { unchanged++; continue; }
    toFix++;
    if (samples.length < 5) samples.push({ id: row.id, before: arr, after: next });
    if (APPLY) {
      const { error } = await supabaseAdmin.from("service_orders").update({ extra_drivers: next }).eq("id", row.id);
      if (error) console.error(`  ✗ update service_orders#${row.id} extra_drivers:`, error.message);
    }
  }
  console.log(`[service_orders.extra_drivers] total=${rows.length} mantidos=${unchanged} ${APPLY ? "atualizados" : "a-atualizar"}=${toFix}`);
  if (samples.length) console.log(`  amostras:`, JSON.stringify(samples, null, 2));
}

(async () => {
  console.log(`\n=== Normalize contact (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  await normalizeTable("clients", { phones: ["phone"], zips: ["zip"] });
  await normalizeTable("employees", { phones: ["phone"], zips: ["zip"] });
  await normalizeTable("client_vehicles", { phones: ["driver_phone"] });
  await normalizeTable("leads", { phones: ["telefone"], zips: ["cep"] });
  await normalizeTable("service_orders", { phones: ["escorted_driver_phone"] });
  await normalizeTable("gerenciadoras", { phones: ["contact_phone"] });
  await normalizeExtraDrivers();

  console.log(`\n${APPLY ? "✓ Aplicado." : "→ Dry-run. Rode com --apply pra escrever."}\n`);
  process.exit(0);
})().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
