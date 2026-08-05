import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const BASELINE = path.join(root, "scripts/security/baseline-plain-password-cleanup.sql");
const VERIFY = path.join(root, "scripts/security/verify-plain-password-cleanup.sql");
const MIGRATION = path.join(
  root,
  "supabase/migrations/20260805190500_null_legacy_plain_password.sql",
);
const ROLLBACK = path.join(
  root,
  "supabase/migrations/rollback/20260805190500_rollback_plain_password_cleanup.sql",
);
const RUNBOOK = path.join(root, "docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md");

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

describe("baseline-plain-password-cleanup.sql", () => {
  const sql = read(BASELINE);
  const code = executableSql(sql);

  it("não seleciona a coluna plain_password como valor", () => {
    assert.doesNotMatch(sql, /SELECT\s+plain_password\b/i);
    assert.doesNotMatch(sql, /SELECT\s+[\s\S]*?\bplain_password\s*,/i);
  });

  it("não calcula md5/hash/digest", () => {
    assert.doesNotMatch(sql, /\bmd5\s*\(/i);
    assert.doesNotMatch(sql, /\bdigest\s*\(/i);
    assert.doesNotMatch(sql, /\bencode\s*\(/i);
    assert.doesNotMatch(sql, /pgcrypto/i);
  });

  it("não retorna email/nome/username", () => {
    assert.doesNotMatch(code, /\bemail\b/i);
    assert.doesNotMatch(code, /\busername\b/i);
    assert.doesNotMatch(code, /[^_\w]name\s*[,)]|\.name\b|AS\s+name\b/i);
  });

  it("inclui contagens e metadados esperados", () => {
    assert.match(sql, /total_users/);
    assert.match(sql, /plain_password_filled|plain_password_not_null/);
    assert.match(sql, /with_supabase_uid/);
    assert.match(sql, /public_users_without_auth_match/);
    assert.match(sql, /auth_users_without_public_match/);
    assert.match(sql, /rls_enabled/);
    assert.match(sql, /policies_using_true/);
  });
});

describe("verify-plain-password-cleanup.sql", () => {
  const sql = read(VERIFY);

  it("exige preenchidos = 0", () => {
    assert.match(sql, /plain_password_filled[\s\S]*?expected=0|expected=0[\s\S]*?plain_password_filled/i);
    assert.match(sql, /v_filled\s*<>\s*0|v_filled\s*=\s*0/);
  });

  it("exige nulos = total", () => {
    assert.match(sql, /v_null\s*<>\s*v_total|plain_password_null/);
  });

  it("verifica RLS", () => {
    assert.match(sql, /relrowsecurity|rls_enabled/);
  });

  it("verifica policies USING(true)", () => {
    assert.match(sql, /USING\s*\(\s*true\s*\)|policies_using_true|pg_get_expr\(pol\.polqual/);
  });

  it("verifica grants anon/authenticated/service_role", () => {
    assert.match(sql, /anon/);
    assert.match(sql, /authenticated/);
    assert.match(sql, /service_role/);
    assert.match(sql, /plain_password/);
  });

  it("exige coluna ainda existente até PR4B (sem DROP nesta fase)", () => {
    // Verify pós-limpeza ainda exige a coluna física; DROP = PR4B.
    assert.match(sql, /plain_password_column_exists|column_name = 'plain_password'/);
    assert.match(sql, /DROP é PR4|PR4/);
  });
});

describe("schema TypeScript desacoplado (PR4A)", () => {
  it("shared/schema.ts não mapeia plainPassword", () => {
    const schema = read(path.join(root, "shared/schema.ts"));
    assert.doesNotMatch(schema, /plainPassword\s*:/);
    assert.doesNotMatch(schema, /text\("plain_password"\)/);
  });
});

describe("migration null_legacy_plain_password", () => {
  const sql = read(MIGRATION);
  const code = executableSql(sql);

  it("contém BEGIN/COMMIT", () => {
    assert.match(sql, /\bBEGIN\s*;/);
    assert.match(sql, /\bCOMMIT\s*;/);
  });

  it("valida total esperado 36", () => {
    assert.match(sql, /v_total\s*<>\s*36/);
  });

  it("valida preenchidos esperados 36", () => {
    assert.match(sql, /v_filled\s*<>\s*36/);
  });

  it("altera somente plain_password", () => {
    assert.match(sql, /UPDATE\s+public\.users\s+SET\s+plain_password\s*=\s*NULL/i);
    assert.doesNotMatch(sql, /SET\s+(?!plain_password)/i);
  });

  it("não contém DROP de coluna/tabela", () => {
    assert.doesNotMatch(code, /\bDROP\b/i);
  });

  it("não altera auth.users", () => {
    assert.doesNotMatch(sql, /UPDATE\s+auth\.users/i);
    assert.doesNotMatch(sql, /INSERT\s+INTO\s+auth\.users/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM\s+auth\.users/i);
  });

  it("não contém valores de senha nem emails", () => {
    assert.doesNotMatch(code, /torres@123/i);
    assert.doesNotMatch(code, /@torresseguranca/i);
    assert.doesNotMatch(code, /\bemail\b/i);
    assert.doesNotMatch(code, /'[A-Za-z0-9+/=]{20,}'/);
  });
});

describe("rollback documental", () => {
  const sql = read(ROLLBACK);

  it("não restaura valores", () => {
    assert.doesNotMatch(sql, /UPDATE\s+public\.users/i);
    assert.doesNotMatch(sql, /SET\s+plain_password\s*=\s*'[^']+'/i);
    assert.match(sql, /RAISE EXCEPTION/i);
    assert.match(sql, /Irreversible|authorized full database backup/i);
  });
});

describe("runbook plain-password cleanup", () => {
  const md = read(RUNBOOK);

  it("exige backup recente", () => {
    assert.match(md, /[Bb]ackup nativo recente|[Bb]ackup nativo/);
  });

  it("exige smoke pós-aplicação", () => {
    assert.match(md, /[Ss]moke|login admin|\/api\/auth\/me/);
  });

  it("não recomenda envio de senha", () => {
    assert.doesNotMatch(md, /enviar senha por e-?mail/i);
    assert.doesNotMatch(md, /envie a senha|enviar a senha temporária/i);
    assert.match(md, /Não recomenda envio de credenciais/i);
  });
});
