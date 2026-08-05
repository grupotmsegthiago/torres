import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { generateTempPassword } from "./temp-password";
import { sanitizeUserWrite, hasPasswordWriteFields } from "./user-write";

const root = path.resolve(import.meta.dirname, "../..");

describe("generateTempPassword", () => {
  it("não retorna valor fixo torres@123", () => {
    for (let i = 0; i < 20; i++) {
      assert.notEqual(generateTempPassword(), "torres@123");
    }
  });

  it("produz valores diferentes", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    assert.notEqual(a, b);
  });

  it("tem comprimento adequado e diversidade", () => {
    const p = generateTempPassword();
    assert.ok(p.length >= 10);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[a-z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[@#$%&*!]/);
  });
});

describe("sanitizeUserWrite", () => {
  it("remove plainPassword / plain_password / password", () => {
    const clean = sanitizeUserWrite({
      email: "a@b.c",
      name: "X",
      role: "funcionario",
      plainPassword: "secret",
      plain_password: "secret2",
      password: "p",
      mustChangePassword: 1,
      employeeId: 3,
    });
    assert.equal(clean.email, "a@b.c");
    assert.equal(clean.mustChangePassword, 1);
    assert.equal(clean.employeeId, 3);
    assert.equal(clean.plainPassword, undefined);
    assert.equal(clean.plain_password, undefined);
    assert.equal(clean.password, undefined);
    assert.equal(hasPasswordWriteFields(clean), false);
  });

  it("não inclui campos desconhecidos", () => {
    const clean = sanitizeUserWrite({ name: "A", hack: true, refreshToken: "x" });
    assert.equal(clean.name, "A");
    assert.equal((clean as any).hack, undefined);
    assert.equal((clean as any).refreshToken, undefined);
  });

  it("não muta o objeto original", () => {
    const input = { name: "A", plainPassword: "keep" };
    sanitizeUserWrite(input);
    assert.equal(input.plainPassword, "keep");
  });
});

describe("writers de produção sem plainPassword", () => {
  it("createUser/updateUser usam sanitizeUserWrite", () => {
    const storage = readFileSync(path.join(root, "server/storage.ts"), "utf8");
    assert.match(storage, /sanitizeUserWrite/);
    assert.match(storage, /UserWriteInput/);
    assert.doesNotMatch(storage, /createUser\([\s\S]*?plainPassword/);
  });

  it("hr create/reset/register não gravam plainPassword", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.doesNotMatch(hr, /plainPassword\s*:/);
    assert.doesNotMatch(hr, /torres@123/);
    assert.match(hr, /generateTempPassword/);
    assert.match(hr, /tempPassword,/);
    assert.match(hr, /newPassword,/);
    assert.match(hr, /oneShot:\s*true/);
    assert.match(hr, /mustChangePassword:\s*1/);
  });

  it("employees auto-create não grava plainPassword", () => {
    const emp = readFileSync(path.join(root, "server/routes/employees.ts"), "utf8");
    assert.doesNotMatch(emp, /plainPassword\s*:/);
    assert.doesNotMatch(emp, /torres@123/);
    assert.match(emp, /generateTempPassword/);
  });

  it("change-password não atualiza plainPassword", () => {
    const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    const idx = routes.indexOf("/api/auth/change-password");
    assert.ok(idx > 0);
    const slice = routes.slice(idx, idx + 800);
    assert.match(slice, /mustChangePassword:\s*0/);
    assert.doesNotMatch(slice, /plainPassword/);
  });

  it("logs de users não incluem senha", () => {
    const hr = readFileSync(path.join(root, "server/routes/hr.ts"), "utf8");
    assert.doesNotMatch(hr, /JSON\.stringify\(req\.body/);
    assert.doesNotMatch(hr, /console\.log\([^)]*tempPassword/);
    assert.doesNotMatch(hr, /console\.log\([^)]*newPassword/);
    assert.doesNotMatch(hr, /console\.log\([^)]*plainPassword/);
  });

  it("API/UI continuam sem exposição (PR1)", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/users.tsx"), "utf8");
    assert.doesNotMatch(ui, /plainPassword/);
    assert.doesNotMatch(ui, /torres@123/);
    assert.match(ui, /Senha protegida/);
  });

  it("schema legado mantém coluna (sem DROP)", () => {
    const schema = readFileSync(path.join(root, "shared/schema.ts"), "utf8");
    assert.match(schema, /plainPassword:\s*text\("plain_password"\)/);
  });

  it("artefatos presentes", () => {
    assert.ok(existsSync(path.join(root, "server/lib/temp-password.ts")));
    assert.ok(existsSync(path.join(root, "server/lib/user-write.ts")));
  });
});
