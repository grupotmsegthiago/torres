import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const expand = readFileSync(
  path.join(root, "supabase/migrations/20260807180000_atomic_billing_expand.sql"),
  "utf8",
);
const enforcement = readFileSync(
  path.join(root, "supabase/migrations/pending/20260807181000_atomic_billing_enforcement.sql"),
  "utf8",
);
const rollbackExpand = readFileSync(
  path.join(root, "supabase/migrations/rollback/20260807180000_rollback_atomic_billing_expand.sql"),
  "utf8",
);
const rollbackEnforcement = readFileSync(
  path.join(root, "supabase/migrations/rollback/20260807181000_rollback_atomic_billing_enforcement.sql"),
  "utf8",
);

test("migration TX é transacional e contém objetos atômicos", () => {
  for (const sql of [expand, enforcement, rollbackExpand, rollbackEnforcement]) {
    assert.match(sql, /\bBEGIN;/);
    assert.match(sql, /\bCOMMIT;/);
  }
  assert.match(expand, /lock_version bigint NOT NULL DEFAULT 0/);
  assert.match(expand, /write_escort_billing_atomic/);
  assert.match(expand, /create_boletim_approval_atomic/);
  assert.match(expand, /FOR UPDATE/);
  assert.match(expand, /pg_advisory_xact_lock/);
  assert.match(enforcement, /BEFORE INSERT OR UPDATE OR DELETE ON public\.escort_billings/);
  assert.match(enforcement, /BEFORE DELETE ON public\.boletim_approvals/);
});

test("migration TX não duplica motor financeiro em SQL", () => {
  for (const sql of [expand, enforcement]) {
    assert.doesNotMatch(sql, /calcularEscolta|computeCanceladaBilling|fat_hora_extra\s*[+*]/);
  }
});

test("objetos live-only legados são removidos e rollback os restaura", () => {
  assert.match(enforcement, /DROP TRIGGER IF EXISTS trg_validate_escort_billing_approval/);
  assert.match(enforcement, /DROP FUNCTION IF EXISTS public\.validate_escort_billing_approval/);
  assert.match(enforcement, /DROP TRIGGER IF EXISTS trg_validate_service_order_approval/);
  assert.match(rollbackEnforcement, /CREATE TRIGGER trg_validate_escort_billing_approval/);
  assert.match(rollbackEnforcement, /CREATE TRIGGER trg_validate_service_order_approval/);
});

function listProductionTs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) files.push(...listProductionTs(file));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) files.push(file);
  }
  return files;
}

test("nenhum writer de produção faz DML direto em escort_billings", () => {
  const directDml = /from\(["']escort_billings["']\)[\s\S]{0,240}\.(?:insert|upsert|update|delete)\s*\(/;
  const offenders = listProductionTs(path.join(root, "server"))
    .filter((file) => directDml.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});

test("snapshot não possui INSERT/DELETE direto no código de produção", () => {
  const directDml = /from\(["']boletim_approvals["']\)[\s\S]{0,240}\.(?:insert|delete)\s*\(/;
  const offenders = listProductionTs(path.join(root, "server"))
    .filter((file) => directDml.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});
