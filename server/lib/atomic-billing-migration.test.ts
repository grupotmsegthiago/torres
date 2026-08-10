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
const aclFix = readFileSync(
  path.join(root, "supabase/migrations/20260810184222_fix_atomic_billing_rpc_acl.sql"),
  "utf8",
);

test("migration TX é transacional e contém objetos atômicos", () => {
  for (const sql of [expand, enforcement, aclFix, rollbackExpand, rollbackEnforcement]) {
    assert.match(sql, /\bBEGIN;/);
    assert.match(sql, /\bCOMMIT;/);
  }
  assert.match(expand, /lock_version bigint NOT NULL DEFAULT 0/);
  assert.match(expand, /write_escort_billing_atomic/);
  assert.match(expand, /create_boletim_approval_atomic/);
  assert.match(expand, /freeze_boletim_billings_atomic/);
  assert.match(expand, /mark_escort_billings_invoiced_atomic/);
  assert.match(expand, /transition_invoice_billings_atomic/);
  assert.match(expand, /FOR UPDATE/);
  assert.match(expand, /pg_advisory_xact_lock/);
  assert.match(
    expand,
    /ordem global advisory OS -> service_orders -> contracts antes de billing locks/,
  );
  assert.match(
    expand,
    /UPDATE_OPEN e DELETE_OPEN compartilham exatamente o mesmo prefixo de locks/,
  );
  assert.match(
    expand,
    /'WRITE_OFFICIAL', 'UPDATE_OPEN', 'WRITE_CANCELLED', 'WRITE_REFUSED', 'DELETE_OPEN'/,
  );
  assert.doesNotMatch(
    expand,
    /step = 'km_final'[\s\S]{0,120}FOR SHARE/,
  );
  assert.match(enforcement, /BEFORE INSERT OR UPDATE OR DELETE ON public\.escort_billings/);
  assert.match(enforcement, /BEFORE DELETE ON public\.boletim_approvals/);
  assert.match(enforcement, /billing_snapshot, billing_ids, total_value, client_id/);
  assert.match(
    enforcement,
    /REVOKE EXECUTE ON FUNCTION public\.guard_escort_billing_atomic_write\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    enforcement,
    /REVOKE EXECUTE ON FUNCTION public\.guard_boletim_snapshot_atomic_write\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(expand, /CREATE ROLE torres_billing_rpc_owner/);
  assert.match(expand, /CREATE POLICY torres_billing_rpc_owner_all ON public\.escort_billings/);
  assert.match(expand, /CREATE POLICY torres_billing_rpc_owner_select ON public\.service_orders/);
  assert.match(expand, /REVOKE ALL ON FUNCTION public\.write_escort_billing_atomic\([\s\S]*?FROM anon, authenticated/);
  assert.match(
    expand,
    /FUNCTION public\.is_escort_billing_snapshotted[\s\S]*?LANGUAGE sql[\s\S]*?STABLE/,
  );
  assert.match(
    expand,
    /GRANT EXECUTE ON FUNCTION public\.is_escort_billing_snapshotted\(uuid, bigint\)[\s\S]*?TO service_role/,
  );
  assert.match(expand, /legacy\.status IN \('PENDENTE', 'APROVADO'\)/);
  assert.match(expand, /legacy\.billing_snapshot IS NULL/);
  assert.doesNotMatch(expand, /DELETE FROM public\.financial_transactions/);
  assert.match(enforcement, /current_user <> 'torres_billing_rpc_owner'/);
  assert.doesNotMatch(expand + enforcement, /set_config\('torres\.atomic_/);
  assert.match(rollbackExpand, /DROP POLICY IF EXISTS torres_billing_rpc_owner_all ON public\.escort_billings/);
  assert.match(rollbackExpand, /DROP ROLE IF EXISTS torres_billing_rpc_owner/);
});

test("migration TX é compatível com Supabase Hosted sem atributos privilegiados de role", () => {
  // Hosted 42501: CREATE/ALTER ROLE não pode tocar atributos privilegiados.
  const roleCommands = [
    ...expand.matchAll(
      /\b(?:CREATE|ALTER)\s+ROLE\s+torres_billing_rpc_owner\b[^;]*;/gi,
    ),
  ].map(([command]) => command);
  assert.equal(roleCommands.length, 1);
  for (const forbidden of [
    "BYPASSRLS",
    "NOBYPASSRLS",
    "SUPERUSER",
    "NOSUPERUSER",
    "CREATEDB",
    "NOCREATEDB",
    "CREATEROLE",
    "NOCREATEROLE",
    "REPLICATION",
    "NOREPLICATION",
  ]) {
    for (const command of roleCommands) {
      assert.doesNotMatch(
        command,
        new RegExp(`\\b${forbidden}\\b`, "i"),
        `expand não pode usar ${forbidden} em CREATE/ALTER ROLE torres_billing_rpc_owner`,
      );
    }
    assert.doesNotMatch(
      rollbackExpand,
      new RegExp(`(?:CREATE|ALTER)\\s+ROLE\\s+torres_billing_rpc_owner[\\s\\S]{0,200}?\\b${forbidden}\\b`, "i"),
      `rollback expand não pode usar ${forbidden} em CREATE/ALTER ROLE`,
    );
  }
  assert.doesNotMatch(expand, /\bALTER\s+ROLE\s+torres_billing_rpc_owner\b/i);
  assert.match(
    expand,
    /CREATE ROLE torres_billing_rpc_owner\s+NOLOGIN\s+NOINHERIT;/,
  );
  assert.match(
    expand,
    /GRANT torres_billing_rpc_owner TO CURRENT_USER WITH INHERIT FALSE;[\s\S]*?GRANT torres_billing_rpc_owner TO CURRENT_USER WITH SET TRUE;/,
  );
  assert.doesNotMatch(
    expand + rollbackExpand,
    /GRANT torres_billing_rpc_owner TO postgres\b/i,
  );
  assert.match(
    expand,
    /GRANT CREATE ON SCHEMA public TO torres_billing_rpc_owner;[\s\S]*?OWNER TO torres_billing_rpc_owner;[\s\S]*?REVOKE CREATE ON SCHEMA public FROM torres_billing_rpc_owner;/,
  );
  assert.match(
    expand,
    /REVOKE SET OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;[\s\S]*?REVOKE INHERIT OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;/,
  );
  assert.match(expand, /SECURITY DEFINER/);
  assert.match(expand, /SET search_path = public, pg_catalog/);
  assert.match(expand, /OWNER TO torres_billing_rpc_owner/);
  assert.match(expand, /GRANT EXECUTE[\s\S]*?TO service_role/);
  assert.doesNotMatch(expand, /GRANT EXECUTE[\s\S]*?TO (?:anon|authenticated|PUBLIC)\b/);
  assert.match(enforcement, /current_user <> 'torres_billing_rpc_owner'/);
  assert.match(
    expand,
    /Policies para a role interna \(substitui atributo privilegiado de bypass RLS no Hosted\)/,
  );
  assert.match(
    rollbackExpand,
    /GRANT torres_billing_rpc_owner TO CURRENT_USER WITH INHERIT FALSE;[\s\S]*?GRANT torres_billing_rpc_owner TO CURRENT_USER WITH SET TRUE;[\s\S]*?SET LOCAL ROLE torres_billing_rpc_owner;/,
  );
  assert.match(
    rollbackExpand,
    /DROP FUNCTION IF EXISTS public\.is_escort_billing_snapshotted\(uuid, bigint\);[\s\S]*?RESET ROLE;/,
  );
});

test("migration corretiva fecha ACL efetiva das sete RPCs TX", () => {
  const signatures = [
    "is_escort_billing_snapshotted\\(uuid, bigint\\)",
    "lock_service_orders_for_billings\\(uuid\\[\\]\\)",
    "write_escort_billing_atomic\\(text, jsonb, uuid, integer, bigint, jsonb\\)",
    "create_boletim_approval_atomic\\([\\s\\S]*?integer, text, integer, jsonb[\\s\\S]*?\\)",
    "freeze_boletim_billings_atomic\\(integer, text, text, timestamptz\\)",
    "mark_escort_billings_invoiced_atomic\\([\\s\\S]*?uuid\\[\\], integer, timestamptz, text[\\s\\S]*?\\)",
    "transition_invoice_billings_atomic\\(integer, text, timestamptz, text\\)",
  ];
  for (const signature of signatures) {
    assert.match(aclFix, new RegExp(`public\\.${signature}`, "m"));
  }
  assert.match(
    aclFix,
    /FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    aclFix,
    /TO service_role;/,
  );
  assert.doesNotMatch(
    aclFix,
    /GRANT EXECUTE[\s\S]*?lock_service_orders_for_billings[\s\S]*?TO service_role;/,
  );
  assert.match(
    aclFix,
    /SET LOCAL ROLE torres_billing_rpc_owner;[\s\S]*?RESET ROLE;/,
  );
  assert.doesNotMatch(
    aclFix,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|CREATE FUNCTION|CREATE POLICY|CREATE TRIGGER)\b/i,
  );
});

test("migration TX não duplica motor financeiro em SQL", () => {
  for (const sql of [expand, enforcement]) {
    assert.doesNotMatch(sql, /calcularEscolta|computeCanceladaBilling|fat_hora_extra\s*[+*]/);
  }
});

test("legado de billing é substituído e trigger de service_orders é preservado", () => {
  assert.match(enforcement, /DROP TRIGGER IF EXISTS trg_validate_escort_billing_approval/);
  assert.match(enforcement, /DROP FUNCTION IF EXISTS public\.validate_escort_billing_approval/);
  assert.doesNotMatch(enforcement, /DROP TRIGGER IF EXISTS trg_validate_service_order_approval/);
  assert.match(rollbackEnforcement, /CREATE TRIGGER trg_validate_escort_billing_approval/);
  assert.doesNotMatch(rollbackEnforcement, /CREATE TRIGGER trg_validate_service_order_approval/);
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

test("invoice delete usa resultado do lote atômico sem referência obsoleta", () => {
  const asaas = readFileSync(path.join(root, "server/asaas.ts"), "utf8");
  assert.match(asaas, /releasedBillings\.length/);
  assert.doesNotMatch(asaas, /linkedBillings\?\.length/);
});
