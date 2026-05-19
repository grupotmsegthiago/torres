/**
 * Audita registros antigos com telefone/CEP incompletos.
 *
 * Por que: a validação nova (validateContactFields) só bloqueia novos cadastros
 * e edições. O banco já tem clients, employees e leads salvos com telefone
 * curto (< 10 dígitos), telefone longo (> 11 dígitos) ou CEP ≠ 8 dígitos.
 * Esses registros continuam quebrando SMS/WhatsApp/cobrança até alguém corrigir
 * na mão. Este script lista todos pra diretoria decidir como agir.
 *
 * Uso:
 *   npx tsx server/scripts/audit-incomplete-contacts.ts            (texto)
 *   npx tsx server/scripts/audit-incomplete-contacts.ts --csv      (CSV)
 *
 * Convenção: campo vazio/null é considerado OK (não obrigatório a nível de
 * cadastro). Só reporta quando há valor PRESENTE mas com contagem inválida.
 */
import { supabaseAdmin } from "../supabase.ts";

const AS_CSV = process.argv.includes("--csv");

type Row = { id: number | string; [k: string]: any };

type Finding = {
  table: string;
  id: number | string;
  label: string;
  field: string;
  kind: "phone_short" | "phone_long" | "zip_invalid";
  digits: number;
  value: string;
};

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

function digitCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (!str) return 0;
  return str.replace(/\D/g, "").length;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

function auditRow(
  table: string,
  row: Row,
  labelField: string,
  phones: string[],
  zips: string[],
): Finding[] {
  const out: Finding[] = [];
  const label = String(row[labelField] ?? "(sem nome)");
  for (const f of phones) {
    const v = row[f];
    if (!isPresent(v)) continue;
    const n = digitCount(v);
    if (n < 10) {
      out.push({ table, id: row.id, label, field: f, kind: "phone_short", digits: n, value: String(v) });
    } else if (n > 11) {
      out.push({ table, id: row.id, label, field: f, kind: "phone_long", digits: n, value: String(v) });
    }
  }
  for (const f of zips) {
    const v = row[f];
    if (!isPresent(v)) continue;
    const n = digitCount(v);
    if (n !== 8) {
      out.push({ table, id: row.id, label, field: f, kind: "zip_invalid", digits: n, value: String(v) });
    }
  }
  return out;
}

(async () => {
  const findings: Finding[] = [];

  const clients = await fetchAll("clients", "id,name,phone,zip");
  for (const r of clients) findings.push(...auditRow("clients", r, "name", ["phone"], ["zip"]));

  const employees = await fetchAll("employees", "id,name,phone,zip");
  for (const r of employees) findings.push(...auditRow("employees", r, "name", ["phone"], ["zip"]));

  const leads = await fetchAll("leads", "id,empresa,email,telefone,cep");
  for (const r of leads) {
    const label = r.empresa || r.email || "(sem identificação)";
    findings.push(...auditRow("leads", { ...r, __label: label }, "__label", ["telefone"], ["cep"]));
  }

  if (AS_CSV) {
    console.log("tabela,id,nome,campo,problema,digitos,valor");
    for (const f of findings) {
      const safe = (s: string) => `"${s.replace(/"/g, '""')}"`;
      console.log([f.table, f.id, safe(f.label), f.field, f.kind, f.digits, safe(f.value)].join(","));
    }
    process.exit(0);
  }

  console.log(`\n=== Auditoria de contatos incompletos ===\n`);
  const byTable: Record<string, Finding[]> = {};
  for (const f of findings) (byTable[f.table] ||= []).push(f);

  for (const table of ["clients", "employees", "leads"]) {
    const rows = byTable[table] || [];
    console.log(`[${table}] problemas=${rows.length}`);
    const phoneShort = rows.filter((r) => r.kind === "phone_short");
    const phoneLong = rows.filter((r) => r.kind === "phone_long");
    const zipBad = rows.filter((r) => r.kind === "zip_invalid");
    console.log(`  telefone curto (<10): ${phoneShort.length}`);
    console.log(`  telefone longo (>11): ${phoneLong.length}`);
    console.log(`  cep inválido (≠8):    ${zipBad.length}`);
    for (const f of rows) {
      console.log(`  - #${f.id} ${f.label} | ${f.field}="${f.value}" (${f.digits} dígitos, ${f.kind})`);
    }
    console.log();
  }

  console.log(`Total geral: ${findings.length}`);
  console.log(`\nDica: rode com --csv pra exportar e mandar pra diretoria.\n`);
  process.exit(0);
})().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
