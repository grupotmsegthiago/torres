import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const MIGRATION = path.join(
  root,
  "supabase/migrations/20260805164000_harden_users_rls.sql",
);
const ROLLBACK = path.join(
  root,
  "supabase/migrations/rollback/20260805164000_rollback_users_rls.sql",
);
const VERIFY = path.join(root, "scripts/security/verify-users-rls.sql");

const SAFE_COLUMNS = [
  "id",
  "supabase_uid",
  "email",
  "username",
  "name",
  "role",
  "employee_id",
  "must_change_password",
  "avatar_url",
  "terms_accepted_at",
  "terms_ip_address",
  "terms_user_agent",
  "created_at",
] as const;

const COLUMN_GRANT_RE =
  /GRANT SELECT\s*\(\s*id\s*,\s*supabase_uid\s*,\s*email\s*,\s*username\s*,\s*name\s*,\s*role\s*,\s*employee_id\s*,\s*must_change_password\s*,\s*avatar_url\s*,\s*terms_accepted_at\s*,\s*terms_ip_address\s*,\s*terms_user_agent\s*,\s*created_at\s*\)\s*ON TABLE public\.users TO authenticated/i;

function read(p: string) {
  assert.ok(existsSync(p), `arquivo ausente: ${p}`);
  return readFileSync(p, "utf8");
}

function assertSafeColumnGrantModel(sql: string) {
  assert.doesNotMatch(
    sql,
    /GRANT SELECT ON TABLE public\.users TO authenticated/i,
  );
  assert.match(sql, COLUMN_GRANT_RE);
  const grantBlock = sql.match(
    /GRANT SELECT\s*\([\s\S]*?\)\s*ON TABLE public\.users TO authenticated/i,
  );
  assert.ok(grantBlock, "GRANT SELECT(colunas) ausente");
  assert.doesNotMatch(grantBlock[0], /plain_password/i);
  for (const col of SAFE_COLUMNS) {
    assert.match(grantBlock[0], new RegExp(`\\b${col}\\b`));
  }
}

describe("migration harden_users_rls (contrato)", () => {
  const sql = read(MIGRATION);

  it("habilita RLS sem FORCE", () => {
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY/i);
  });

  it("remove policies permissivas pelos nomes reais", () => {
    for (const name of [
      "Acesso Total Emergencial",
      "Acesso público aos perfis",
      "Usuários podem ver apenas seus próprios dados",
      "users_select_admin",
      "users_insert_admin",
      "users_update_admin",
      "Apenas usuários autenticados podem inserir",
      "users_update_own",
    ]) {
      assert.match(sql, new RegExp(`DROP POLICY IF EXISTS "${name}"`));
    }
  });

  it("cria exatamente users_select_own SELECT authenticated", () => {
    assert.match(sql, /CREATE POLICY "users_select_own"/);
    assert.match(sql, /FOR SELECT/);
    assert.match(sql, /TO authenticated/);
    assert.match(sql, /supabase_uid = \(SELECT auth\.uid\(\)\)::text/);
  });

  it("não recria USING \(true\)", () => {
    const creates = sql.split(/CREATE POLICY/i).slice(1).join("CREATE POLICY");
    assert.doesNotMatch(creates, /USING\s*\(\s*true\s*\)/i);
  });

  it("revoga anon/authenticated e concede só colunas seguras", () => {
    assert.match(sql, /REVOKE ALL ON TABLE public\.users FROM anon/i);
    assert.match(sql, /REVOKE ALL ON TABLE public\.users FROM authenticated/i);
    assertSafeColumnGrantModel(sql);
  });

  it("não concede GRANT SELECT ON TABLE a authenticated", () => {
    assert.doesNotMatch(
      sql,
      /GRANT SELECT ON TABLE public\.users TO authenticated/i,
    );
  });

  it("plain_password não aparece na lista concedida", () => {
    const grantBlock = sql.match(
      /GRANT SELECT\s*\([\s\S]*?\)\s*ON TABLE public\.users TO authenticated/i,
    );
    assert.ok(grantBlock);
    assert.doesNotMatch(grantBlock![0], /plain_password/i);
  });

  it("não apaga coluna nem dados", () => {
    assert.doesNotMatch(sql, /DROP COLUMN/i);
    assert.doesNotMatch(sql, /DELETE FROM public\.users/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
  });
});

describe("rollback users RLS (contrato de segurança mínima)", () => {
  const sql = read(ROLLBACK);

  it("não recria USING (true) nem grants anon", () => {
    const creates = sql.split(/CREATE POLICY/i).slice(1).join("CREATE POLICY");
    assert.doesNotMatch(creates, /USING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(sql, /GRANT [\s\S]+ TO anon/i);
    assert.match(sql, /REVOKE ALL ON TABLE public\.users FROM anon/i);
    assert.match(sql, /users_select_own/);
  });

  it("segue o mesmo modelo de colunas seguras (sem SELECT de tabela)", () => {
    assertSafeColumnGrantModel(sql);
  });
});

describe("verify-users-rls.sql", () => {
  const sql = read(VERIFY);

  it("falha em USING true, anon privs e plain_password", () => {
    assert.match(sql, /USING \(true\)|using_expr.*= 'true'|pg_get_expr.* = 'true'/);
    assert.match(sql, /anon/);
    assert.match(sql, /plain_password/);
    assert.match(sql, /RAISE EXCEPTION/);
    assert.match(sql, /service_role/);
    assert.match(sql, /is_app_user/);
  });

  it("testa ausência de SELECT de tabela para authenticated", () => {
    assert.match(sql, /role_table_grants/);
    assert.match(sql, /privilege_type = 'SELECT'/);
    assert.match(sql, /SELECT de tabela/);
  });

  it("testa ausência de acesso à plain_password", () => {
    assert.match(
      sql,
      /has_column_privilege\('authenticated',\s*'public\.users',\s*'plain_password',\s*'SELECT'\)/,
    );
    assert.match(sql, /column_name = 'plain_password'/);
  });
});

describe("frontend sem acesso direto a users", () => {
  it("client/src não contém from('users')", () => {
    const clientRoot = path.join(root, "client/src");
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, name.name);
        if (name.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name.name)) {
          const txt = readFileSync(full, "utf8");
          if (/from\(\s*['"]users['"]\s*\)/.test(txt)) offenders.push(full);
        }
      }
    }
    walk(clientRoot);
    assert.deepEqual(offenders, []);
  });
});

describe("backend admin via service_role", () => {
  it("storage usa supabaseAdmin para users", () => {
    const storage = readFileSync(path.join(root, "server/storage.ts"), "utf8");
    assert.match(storage, /getUserBySupabaseUid/);
    assert.match(storage, /supabaseAdmin\.from\("users"\)/);
  });

  it("hr expõe /api/users com requireAdminRole e toSafeUser", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.match(hr, /app\.get\("\/api\/users"/);
    assert.match(hr, /requireAdminRole/);
    assert.match(hr, /toSafeUser/);
    assert.doesNotMatch(hr, /delete safe\.plainPassword/);
  });
});
