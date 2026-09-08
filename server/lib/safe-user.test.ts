import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSafeUser, assertNoPasswordFields, type SafeUser } from "./safe-user";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

describe("toSafeUser (allowlist)", () => {
  it("remove plainPassword, plain_password, password e hashes", () => {
    const input = {
      id: 1,
      name: "Ana",
      role: "admin",
      email: "a@t.com",
      plainPassword: "secret",
      plain_password: "secret2",
      password: "secret3",
      passwordHash: "h",
      password_hash: "h2",
      hash: "h3",
      refreshToken: "rt",
      accessToken: "at",
      token: "t",
      secret: "s",
      mustChangePassword: 1,
    };
    const safe = toSafeUser(input);
    assert.equal((safe as any).plainPassword, undefined);
    assert.equal((safe as any).plain_password, undefined);
    assert.equal((safe as any).password, undefined);
    assert.equal((safe as any).passwordHash, undefined);
    assert.equal((safe as any).password_hash, undefined);
    assert.equal((safe as any).hash, undefined);
    assert.equal((safe as any).refreshToken, undefined);
    assert.equal((safe as any).accessToken, undefined);
    assert.equal((safe as any).token, undefined);
    assert.equal((safe as any).secret, undefined);
    assert.equal(safe.mustChangePassword, true);
    assert.ok(assertNoPasswordFields(safe));
  });

  it("preserva campos permitidos (camelCase)", () => {
    const safe = toSafeUser({
      id: 7,
      email: "x@y.com",
      username: "x",
      name: "X",
      role: "funcionario",
      employeeId: 9,
      mustChangePassword: false,
      supabaseUid: "uid-1",
      avatarUrl: "http://a",
      termsAcceptedAt: "2026-01-01",
      termsIpAddress: "1.1.1.1",
      termsUserAgent: "ua",
      createdAt: "2026-01-02",
    });
    assert.equal(safe.id, 7);
    assert.equal(safe.email, "x@y.com");
    assert.equal(safe.username, "x");
    assert.equal(safe.name, "X");
    assert.equal(safe.role, "funcionario");
    assert.equal(safe.employeeId, 9);
    assert.equal(safe.supabaseUid, "uid-1");
    assert.equal(safe.avatarUrl, "http://a");
  });

  it("funciona com snake_case", () => {
    const safe = toSafeUser({
      id: 2,
      name: "B",
      role: "diretoria",
      employee_id: 3,
      must_change_password: 1,
      supabase_uid: "uid-2",
      avatar_url: null,
      terms_accepted_at: null,
      terms_ip_address: null,
      terms_user_agent: null,
      created_at: null,
    });
    assert.equal(safe.employeeId, 3);
    assert.equal(safe.mustChangePassword, true);
    assert.equal(safe.supabaseUid, "uid-2");
  });

  it("não inclui campos desconhecidos", () => {
    const safe = toSafeUser({
      id: 1,
      name: "C",
      role: "admin",
      evilField: "leak",
      nested: { a: 1 },
    } as any);
    assert.equal((safe as any).evilField, undefined);
    assert.equal((safe as any).nested, undefined);
    const keys = Object.keys(safe).sort();
    assert.deepEqual(keys, [
      "avatarUrl",
      "createdAt",
      "email",
      "employeeId",
      "id",
      "mustChangePassword",
      "name",
      "role",
      "supabaseUid",
      "termsAcceptedAt",
      "termsIpAddress",
      "termsUserAgent",
      "username",
    ].sort());
  });

  it("não muta o objeto original", () => {
    const input = {
      id: 1,
      name: "D",
      role: "admin",
      plainPassword: "keep-me",
      mustChangePassword: 0,
    };
    const copy = { ...input };
    toSafeUser(input);
    assert.deepEqual(input, copy);
    assert.equal(input.plainPassword, "keep-me");
  });

  it("trata null/undefined", () => {
    const a = toSafeUser(null);
    const b = toSafeUser(undefined);
    assert.equal(a.id, 0);
    assert.equal(b.name, "");
    assert.equal(a.mustChangePassword, false);
  });
});

describe("API/UI contratos (fonte)", () => {
  it("toSafeUser usa allowlist sem spread do user", () => {
    const src = readFileSync(path.join(root, "server/lib/safe-user.ts"), "utf8");
    assert.match(src, /export function toSafeUser/);
    assert.doesNotMatch(src, /\.\.\.\s*user\b/);
    assert.doesNotMatch(src, /delete\s+\w+\.plainPassword/);
  });

  it("GET /api/users não tem exceção por role para plainPassword", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.doesNotMatch(hr, /delete safe\.plainPassword/);
    assert.match(hr, /filtered\.map\(\(u\) => toSafeUser\(u\)\)/);
    assert.match(hr, /user:\s*toSafeUser\(user\)/);
    assert.match(hr, /tempPassword/);
    assert.match(hr, /oneShot:\s*true/);
  });

  it("auth/me e perfil usam toSafeUser", () => {
    const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    assert.match(routes, /app\.get\("\/api\/auth\/me"/);
    assert.match(routes, /toSafeUser\(req\.user/);
    assert.match(routes, /app\.get\("\/api\/auth\/perfil"/);
  });

  it("auth cache aplica toSafeUser / toAuthUser", () => {
    const auth = readFileSync(path.join(root, "server/auth.ts"), "utf8");
    assert.match(auth, /toSafeUser/);
    assert.match(auth, /toAuthUser/);
  });

  it("storage leituras usam USER_SAFE_SELECT", () => {
    const storage = readFileSync(path.join(root, "server/storage.ts"), "utf8");
    assert.match(storage, /USER_SAFE_SELECT/);
    assert.match(storage, /\.select\(USER_SAFE_SELECT\)/);
  });

  it("UsersPage importa useAuth — sem isso /admin/usuarios fica em tela branca", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/users.tsx"), "utf8");
    assert.match(ui, /import \{ useAuth \} from "@\/hooks\/use-auth"/);
    assert.match(ui, /useAuth\(\)/);
  });

  it("UI não renderiza plainPassword nem fallback torres@123", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/users.tsx"), "utf8");
    assert.doesNotMatch(ui, /plainPassword/);
    assert.doesNotMatch(ui, /plain_password/);
    assert.doesNotMatch(ui, /torres@123/);
    assert.doesNotMatch(ui, /FALLBACK_PASSWORD/);
    assert.match(ui, /Senha protegida/);
    assert.match(ui, /não será exibida novamente/);
    assert.match(ui, /oneShotCredentials|OneShotCredentials/);
    assert.doesNotMatch(ui, /localStorage|sessionStorage/);

    const empUi = readFileSync(path.join(root, "client/src/pages/admin/employees.tsx"), "utf8");
    assert.doesNotMatch(empUi, /plainPassword/);
    assert.doesNotMatch(empUi, /torres@123/);
    assert.match(empUi, /Senha protegida/);
    assert.match(empUi, /oneShotPassword/);
  });

  it("POST /api/users não loga payload bruto com senha", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.doesNotMatch(hr, /JSON\.stringify\(req\.body/);
  });

  it("register-by-cpf retorna SafeUser + tempPassword one-shot", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.match(hr, /register-by-cpf[\s\S]*?tempPassword,/);
    assert.match(hr, /register-by-cpf[\s\S]*?oneShot:\s*true/);
    assert.doesNotMatch(hr, /register-by-cpf[\s\S]*?plainPassword/);
  });
});

describe("SafeUser tipagem mínima", () => {
  it("retorno satisfaz shape SafeUser", () => {
    const safe: SafeUser = toSafeUser({ id: 1, name: "E", role: "admin" });
    assert.equal(typeof safe.mustChangePassword, "boolean");
    assert.ok("employeeId" in safe);
  });
});

describe("artefatos presentes", () => {
  it("safe-user.ts existe", () => {
    assert.ok(existsSync(path.join(root, "server/lib/safe-user.ts")));
  });
});
