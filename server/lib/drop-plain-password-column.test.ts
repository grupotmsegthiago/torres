import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const BASELINE = path.join(root, "scripts/security/baseline-drop-plain-password.sql");
const HOMOLOGATE = path.join(
  root,
  "scripts/security/homologate-drop-plain-password-baseline.sql",
);
const VERIFY = path.join(root, "scripts/security/verify-drop-plain-password.sql");
const MIGRATION = path.join(
  root,
  "supabase/migrations/20260805210000_drop_users_plain_password.sql",
);
const ROLLBACK = path.join(
  root,
  "supabase/migrations/rollback/20260805210000_rollback_drop_users_plain_password.sql",
);
const RUNBOOK = path.join(root, "docs/security/RUNBOOK-DROP-PLAIN-PASSWORD.md");

function read(p: string) {
  assert.ok(existsSync(p), `arquivo ausente: ${p}`);
  return readFileSync(p, "utf8");
}

/** SQL executável apenas — ignora linhas `--` e blocos de comentário C-style. */
function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, "");
}

describe("baseline-drop-plain-password.sql", () => {
  const sql = read(BASELINE);
  const code = executableSql(sql);

  it("é somente SELECT (sem DML/DDL de escrita)", () => {
    assert.doesNotMatch(code, /\bUPDATE\s+[a-z_]+\./i);
    assert.doesNotMatch(code, /\bUPDATE\s+SET\b/i);
    assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(code, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(code, /\bDROP\s+(COLUMN|TABLE)\b/i);
    assert.doesNotMatch(code, /\bALTER\s+TABLE\b/i);
    assert.match(code, /\bSELECT\b/i);
  });

  it("não retorna PII (email/nome/username/senha)", () => {
    assert.doesNotMatch(sql, /SELECT\s+plain_password\b/i);
    assert.doesNotMatch(code, /\bemail\b/i);
    assert.doesNotMatch(code, /\busername\b/i);
    assert.doesNotMatch(code, /[^_\w]name\s*[,)]|\.name\b|AS\s+name\b/i);
    assert.doesNotMatch(code, /torres@123/i);
  });

  it("inclui contagens, Auth, RLS e catálogos de dependência", () => {
    assert.match(sql, /total_users/);
    assert.match(sql, /plain_password_filled/);
    assert.match(sql, /plain_password_null/);
    assert.match(sql, /auth_match|without_supabase_uid/);
    assert.match(sql, /rls_enabled/);
    assert.match(sql, /policies_using_true/);
    assert.match(sql, /dep_pg_depend_external|pg_depend/);
    assert.match(sql, /dep_functions/);
    assert.match(sql, /dep_procedures/);
    assert.match(sql, /dep_rules|pg_rewrite/);
    assert.match(sql, /plain_password_column_grants_total|grants_anon/);
    assert.match(sql, /dependency_total/);
    assert.match(sql, /consulted_at_utc/);
  });
});

describe("homologate-drop-plain-password-baseline.sql", () => {
  const sql = read(HOMOLOGATE);
  const code = executableSql(sql);

  it("é somente leitura (sem DML/DDL de escrita / sem DROP)", () => {
    assert.doesNotMatch(code, /\bUPDATE\s+[a-z_]+\./i);
    assert.doesNotMatch(code, /\bUPDATE\s+SET\b/i);
    assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(code, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(code, /\bDROP\s+(COLUMN|TABLE)\b/i);
    assert.doesNotMatch(code, /\bALTER\s+TABLE\b/i);
    assert.match(code, /\bSELECT\b/i);
  });

  it("não seleciona valores de PII/senha", () => {
    assert.doesNotMatch(sql, /SELECT\s+plain_password\b/i);
    assert.doesNotMatch(code, /\bemail\b/i);
    assert.doesNotMatch(code, /\busername\b/i);
    assert.doesNotMatch(code, /torres@123/i);
  });

  it("exige PASS/FAIL nos critérios pré-DROP", () => {
    assert.match(sql, /PASS assert=total_users/);
    assert.match(sql, /FAIL assert=plain_password_filled/);
    assert.match(sql, /PASS assert=plain_password_column_exists/);
    assert.match(sql, /PASS assert=auth_match/);
    assert.match(sql, /PASS assert=dependency_total/);
    assert.match(sql, /PASS assert=rls_enabled/);
    assert.match(sql, /PASS assert=policies_using_true/);
    assert.match(sql, /PASS assert=users_select_own_present/);
    assert.match(sql, /PASS assert=authenticated_plain_password_grant_absent/);
  });

  it("alinha dependency_total à migration (grants só diagnóstico)", () => {
    assert.match(sql, /deptype\s*=\s*'n'/);
    assert.match(sql, /prokind\s*=\s*'f'/);
    assert.match(sql, /prokind\s*=\s*'p'/);
    assert.match(sql, /pg_rewrite|rulename\s*<>\s*'_RETURN'/);
    assert.match(sql, /grants are diagnostic-only|grants_diag|diagnostic/i);
    assert.match(sql, /HOMOLOGAÇÃO PR4B \/ 4\.5B BASELINE OK/);
    assert.match(sql, /DROP AINDA NÃO APLICADO/);
  });
});

describe("migration drop_users_plain_password", () => {
  const sql = read(MIGRATION);
  const code = executableSql(sql);

  it("contém BEGIN/COMMIT", () => {
    assert.match(code, /\bBEGIN\s*;/i);
    assert.match(code, /\bCOMMIT\s*;/i);
  });

  it("valida total = 36", () => {
    assert.match(sql, /v_total\s*<>\s*36|expected 36/i);
  });

  it("valida filled = 0", () => {
    assert.match(sql, /v_filled\s*<>\s*0/);
  });

  it("valida null = total", () => {
    assert.match(sql, /v_null\s*<>\s*v_total/);
  });

  it("valida coluna existe antes do DROP", () => {
    assert.match(sql, /v_column_exists\s*<>\s*1/);
  });

  it("consulta pg_depend com refobjid/refobjsubid (attnum)", () => {
    assert.match(sql, /pg_depend/);
    assert.match(sql, /refobjid\s*=\s*v_relid/);
    assert.match(sql, /refobjsubid\s*=\s*v_attnum/);
    assert.match(sql, /attnum/);
    assert.match(sql, /deptype\s*=\s*'n'/);
  });

  it("cobre functions e procedures", () => {
    assert.match(sql, /prokind\s*=\s*'f'/);
    assert.match(sql, /prokind\s*=\s*'p'/);
    assert.match(sql, /v_dep_functions/);
    assert.match(sql, /v_dep_procedures/);
  });

  it("cobre rules / pg_rewrite", () => {
    assert.match(sql, /pg_rewrite/);
    assert.match(sql, /rulename\s*<>\s*'_RETURN'/);
    assert.match(sql, /v_dep_rules/);
  });

  it("audita grants sem usá-los como bloqueio", () => {
    assert.match(sql, /v_col_grants|role_column_grants/);
    assert.match(sql, /diagnostic|diagnóstico|not a DROP blocker|NÃO bloqueiam/i);
    assert.doesNotMatch(sql, /v_col_grants\s*<>\s*0[\s\S]*?RAISE EXCEPTION/);
    assert.doesNotMatch(
      sql,
      /IF\s+v_col_grants\s*<>\s*0\s+THEN\s+RAISE EXCEPTION/i,
    );
  });

  it("valida dependências externas = 0 com RAISE EXCEPTION", () => {
    assert.match(sql, /v_dependencies\s*<>\s*0/);
    assert.match(sql, /v_dep_catalog/);
    assert.match(sql, /RAISE EXCEPTION[\s\S]*external dependencies|has external dependencies/i);
  });

  it("não usa CASCADE", () => {
    assert.doesNotMatch(code, /DROP\s+COLUMN[\s\S]{0,80}\bCASCADE\b/i);
    assert.doesNotMatch(code, /\bCASCADE\s*;/i);
  });

  it("só faz DROP da coluna plain_password", () => {
    assert.match(code, /DROP\s+COLUMN\s+plain_password\b/i);
    assert.doesNotMatch(code, /DROP\s+COLUMN\s+(?!plain_password\b)/i);
    assert.doesNotMatch(code, /DROP\s+TABLE\b/i);
  });

  it("não altera auth.users e não tem DML", () => {
    assert.doesNotMatch(code, /UPDATE\s+auth\.users/i);
    assert.doesNotMatch(code, /ALTER\s+TABLE\s+auth\.users/i);
    assert.doesNotMatch(code, /DELETE\s+FROM\s+auth\.users/i);
    assert.doesNotMatch(code, /\bUPDATE\b/i);
    assert.doesNotMatch(code, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i);
  });

  it("não contém senha / torres@123", () => {
    assert.doesNotMatch(code, /torres@123/i);
    assert.doesNotMatch(code, /password\s*=\s*'/i);
  });

  it("documenta não aplicar automaticamente", () => {
    assert.match(sql, /NÃO aplicar automaticamente|não aplicar automaticamente/i);
  });
});

describe("verify-drop-plain-password.sql", () => {
  const sql = read(VERIFY);

  it("exige coluna ausente", () => {
    assert.match(sql, /plain_password_column_absent|v_col_exists/i);
    assert.match(sql, /IF\s+v_col_exists/i);
  });

  it("exige grants da coluna ausentes após DROP", () => {
    assert.match(sql, /plain_password_column_grants_absent|v_col_grants/);
    assert.match(sql, /v_col_grants\s*<>\s*0/);
  });

  it("confirma ausência de deps/rules/functions pós-DROP", () => {
    assert.match(sql, /no_pg_depend_on_plain_password|v_dep_catalog/);
    assert.match(sql, /no_rules_on_plain_password|v_dep_rules/);
    assert.match(sql, /no_functions_procedures_on_plain_password|v_dep_procs/);
  });

  it("preserva RLS", () => {
    assert.match(sql, /relrowsecurity|rls_enabled/);
  });

  it("preserva policies (users_select_own, USING true = 0)", () => {
    assert.match(sql, /users_select_own/);
    assert.match(sql, /policies_using_true/);
  });

  it("produz PASS/FAIL com expected/found", () => {
    assert.match(sql, /PASS assert=/);
    assert.match(sql, /FAIL assert=/);
    assert.match(sql, /expected=/);
    assert.match(sql, /found=/);
  });

  it("preserva Auth match e service_role", () => {
    assert.match(sql, /auth_match|public_without_auth_match/);
    assert.match(sql, /service_role/);
  });
});

describe("rollback estrutural drop plain_password", () => {
  const sql = read(ROLLBACK);
  const code = executableSql(sql);

  it("só recria coluna NULL", () => {
    assert.match(code, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+plain_password\s+text\s+NULL/i);
  });

  it("não repopula valores", () => {
    assert.doesNotMatch(code, /\bUPDATE\b/i);
    assert.doesNotMatch(code, /\bINSERT\b/i);
    assert.doesNotMatch(code, /SET\s+plain_password\s*=/i);
    assert.doesNotMatch(code, /torres@123/i);
  });
});

describe("runbook DROP plain_password", () => {
  const md = read(RUNBOOK);

  it("exige backup", () => {
    assert.match(md, /[Bb]ackup nativo/);
  });

  it("exige smoke", () => {
    assert.match(md, /[Ss]moke/);
    assert.match(md, /\/api\/auth\/me/);
  });

  it("proíbe regravar senha", () => {
    assert.match(md, /[Nn]ão.*regravar senha|[Nn]ão.*senha em texto/i);
  });

  it("status PR4B preparado sem aplicar", () => {
    assert.match(md, /DROP AINDA NÃO APLICADO/);
    assert.match(md, /homologate-drop-plain-password-baseline\.sql/);
    assert.match(md, /4\.5B/);
  });
});
