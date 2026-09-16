import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailList,
  pickClientEmails,
  withTorresAlwaysCc,
  clientOutboundMail,
  asaasTomadorEmail,
  TORRES_ALWAYS_CC,
} from "@shared/client-emails";

test("parseEmailList: vírgula, ponto-e-vírgula e duplicata", () => {
  assert.deepEqual(
    parseEmailList("A@X.com; b@x.com, a@x.com\n c@z.com"),
    ["a@x.com", "b@x.com", "c@z.com"],
  );
  assert.deepEqual(parseEmailList("invalido"), []);
});

test("pickClientEmails: não mistura categoria", () => {
  const client = {
    email_operacional: "ops@cliente.com",
    email_financeiro: "fin@cliente.com; fin2@cliente.com",
    email_contratual: "contrato@cliente.com",
    email_medicao: "medicao@cliente.com",
    email: "legado@cliente.com",
  };
  assert.deepEqual(pickClientEmails(client, "operacional"), ["ops@cliente.com"]);
  assert.deepEqual(pickClientEmails(client, "financeiro"), ["fin@cliente.com", "fin2@cliente.com"]);
  assert.deepEqual(pickClientEmails(client, "contratual"), ["contrato@cliente.com"]);
  assert.deepEqual(pickClientEmails(client, "medicao"), ["medicao@cliente.com"]);
});

test("pickClientEmails: categoria vazia cai só no e-mail genérico", () => {
  const client = {
    email_financeiro: "fin@cliente.com",
    email: "legado@cliente.com",
  };
  assert.deepEqual(pickClientEmails(client, "operacional"), ["legado@cliente.com"]);
  assert.deepEqual(pickClientEmails(client, "financeiro"), ["fin@cliente.com"]);
});

test("pickClientEmails: aceita camelCase do storage", () => {
  assert.deepEqual(
    pickClientEmails({ emailMedicao: "m@c.com", emailFinanceiro: "f@c.com" }, "medicao"),
    ["m@c.com"],
  );
});

test("withTorresAlwaysCc: os 4 sempre em cópia, sem duplicar quem já está no To", () => {
  const { to, cc } = withTorresAlwaysCc(["fin@cliente.com", "financeiro@torresseguranca.com.br"]);
  assert.deepEqual(to, ["fin@cliente.com", "financeiro@torresseguranca.com.br"]);
  for (const must of TORRES_ALWAYS_CC) {
    if (must === "financeiro@torresseguranca.com.br") {
      assert.equal(cc.includes(must), false);
    } else {
      assert.equal(cc.includes(must), true);
    }
  }
});

test("clientOutboundMail: junta cadastro da categoria com extra e aplica CC", () => {
  const mail = clientOutboundMail(
    { email_medicao: "m@c.com" },
    "medicao",
    "extra@c.com",
  );
  assert.ok(mail);
  assert.deepEqual(mail.to, ["m@c.com", "extra@c.com"]);
  assert.equal(mail.cc.length, 4);
});

test("asaasTomadorEmail: só financeiro, não operacional", () => {
  assert.equal(
    asaasTomadorEmail({
      email_operacional: "ops@c.com",
      email_financeiro: "fin@c.com, fin2@c.com",
    }),
    "fin@c.com, fin2@c.com",
  );
  assert.equal(asaasTomadorEmail({ email_operacional: "ops@c.com" }), undefined);
});
