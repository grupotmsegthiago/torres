/**
 * Backup remoto verificável (somente leitura) das estruturas afetadas pela
 * correção Control iD / folha.
 *
 * Não aplica migration, não altera dados.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const PROJECT = "erjhxwbutjyylxdthuuz";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(
  ".local",
  "db-backups",
  `remoto-folha-pairing-${stamp}`,
);

function sha256(buf: string | Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function fetchAll(
  sb: ReturnType<typeof createClient>,
  table: string,
  select: string,
  orderCol: string,
) {
  const rows: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .order(orderCol, { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return rows;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY necessários para backup remoto");
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  fs.mkdirSync(OUT, { recursive: true });

  const manifests: any = {
    generated_at_utc: new Date().toISOString(),
    generated_at_brt: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }),
    project_id: PROJECT,
    method: "supabase-js service_role SELECT (logical backup)",
    restore_plan: [
      "1. NÃO usar este JSON como restore cego em produção sem revisão.",
      "2. Preferir Point-in-Time Recovery (PITR) do Supabase no dashboard se disponível.",
      "3. Restore lógico pontual: reinserir rows a partir dos arquivos *.json por tabela,",
      "   respeitando FKs e sem sobrescrever IDs sem necessidade.",
      "4. control_id_punches: restaurar por id a partir de control_id_punches.json se necessário.",
      "5. Após restore, validar COUNT e sha256 do manifesto.",
    ],
    tables: {} as Record<string, any>,
  };

  // Período crítico + tabelas relacionadas
  const periodStart = "2026-06-26T03:00:00.000Z";
  const periodEnd = "2026-07-26T03:00:00.000Z";

  const punches: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("control_id_punches")
      .select("id,employee_id,device_id,control_id_user_id,punch_at,direction,source,external_id,is_manual,raw_event,created_at,rhid_synced_at,rhid_sync_error,processed")
      .gte("punch_at", periodStart)
      .lt("punch_at", periodEnd)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    punches.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const locked = await fetchAll(sb, "control_id_locked_periods", "*", "id");
  const historico = await fetchAll(
    sb,
    "folha_historico_mensal",
    "id,employee_id,employee_name,month_year,horas_trabalhadas,horas_extra,horas_noturnas,source,snapshot_at,updated_at",
    "id",
  );

  // fila — amostra completa pode ser grande; backup por employee_id no período recente
  const queue: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("rhid_sync_queue")
      .select("id,kind,op,ref_id,employee_id,device_id,payload,status,attempts,last_error,created_at,processed_at")
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    queue.push(...(data || []));
    if (!data || data.length < 1000 || queue.length >= 5000) break;
  }

  const files: Array<[string, any]> = [
    ["control_id_punches_period.json", punches],
    ["control_id_locked_periods.json", locked],
    ["folha_historico_mensal.json", historico],
    ["rhid_sync_queue_recent.json", queue],
  ];

  for (const [name, data] of files) {
    const body = JSON.stringify(data);
    const file = path.join(OUT, name);
    fs.writeFileSync(file, body);
    const hash = sha256(body);
    manifests.tables[name] = {
      rows: Array.isArray(data) ? data.length : 0,
      bytes: Buffer.byteLength(body),
      sha256: hash,
    };
    console.log(name, manifests.tables[name]);
  }

  // Contagens de verificação (read-only)
  const counts: Record<string, number> = {};
  for (const t of [
    "control_id_punches",
    "control_id_locked_periods",
    "folha_historico_mensal",
    "rhid_sync_queue",
    "audit_logs",
  ]) {
    const { count, error } = await sb.from(t).select("id", { count: "exact", head: true });
    if (error) {
      counts[t] = -1;
      console.warn("count fail", t, error.message);
    } else {
      counts[t] = count || 0;
    }
  }
  manifests.live_counts = counts;
  manifests.period = { start: periodStart, end: periodEnd, punches_in_period: punches.length };
  manifests.note =
    "Backup LÓGICO verificável. Para dump físico completo use PITR/Supabase dashboard ou pg_dump com DATABASE_URL.";

  const manPath = path.join(OUT, "MANIFEST.json");
  const manBody = JSON.stringify(manifests, null, 2);
  fs.writeFileSync(manPath, manBody);
  fs.writeFileSync(path.join(OUT, "MANIFEST.sha256"), sha256(manBody) + "  MANIFEST.json\n");

  const restoreMd = `# Plano de restauração — ${path.basename(OUT)}

## Evidência
- Gerado em: ${manifests.generated_at_utc} (UTC) / ${manifests.generated_at_brt} (BRT)
- Projeto: ${PROJECT}
- Pasta: \`${OUT}\`
- SHA-256 do manifesto: ver \`MANIFEST.sha256\`

## Verificação
\`\`\`
node -e "const c=require('crypto');const fs=require('fs');const b=fs.readFileSync('MANIFEST.json');console.log(c.createHash('sha256').update(b).digest('hex'))"
\`\`\`

## Ordem preferencial de restore
1. **PITR Supabase** (se habilitado) — restaurar para timestamp imediatamente anterior à migration.
2. Restore lógico seletivo dos JSON (apenas se PITR indisponível).
3. Revalidar \`live_counts\` e amostras do Reis (employee_id=22).

## O que NÃO fazer
- Não aplicar \`pg_restore\` cego sem checklist.
- Não apagar \`control_id_punches\` para “bater total”.
- Não reprocessar folha sem autorização.
`;
  fs.writeFileSync(path.join(OUT, "RESTORE.md"), restoreMd);

  console.log(JSON.stringify({ out: OUT, manifest_sha256: sha256(manBody), counts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
