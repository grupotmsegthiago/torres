import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailList,
  pickClientEmails,
  withTorresAlwaysCc,
  clientOutboundMail,
  asaasTomadorEmail,
  financeiroCadastroEmails,
  nfseTomadorEmail,
  TORRES_ALWAYS_CC,
  TORRES_ALWAYS_BCC,
} from "@shared/client-emails";

test("parseEmailList: vírgula, ponto-e-vírgula e duplicata", () => {
  assert.deepEqual(
    parseEmailList("A@X.com; b@x.com, a@x.com\n c@z.com"),
    ["a@x.com", "b@x.com", "c@z.com"],
  );
  assert.deepEqual(parseEmailList("invalido"), []);
});

test("parseEmailList: remove prefixo mailto: (GO LOG / cola Outlook)", () => {
  assert.deepEqual(
    parseEmailList("mailto:carlos@gologtrans.com.br; mota@torresseguranca.com.br"),
    ["carlos@gologtrans.com.br", "mota@torresseguranca.com.br"],
  );
  assert.deepEqual(parseEmailList("MAILTO: fin@cliente.com"), ["fin@cliente.com"]);
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

test("withTorresAlwaysCc: os 4 sempre em cópia e thiago em cópia oculta", () => {
  const { to, cc, bcc } = withTorresAlwaysCc(["fin@cliente.com", "financeiro@torresseguranca.com.br"]);
  assert.deepEqual(to, ["fin@cliente.com", "financeiro@torresseguranca.com.br"]);
  for (const must of TORRES_ALWAYS_CC) {
    if (must === "financeiro@torresseguranca.com.br") {
      assert.equal(cc.includes(must), false);
    } else {
      assert.equal(cc.includes(must), true);
    }
  }
  assert.deepEqual(bcc, [...TORRES_ALWAYS_BCC]);
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

test("asaasTomadorEmail: só o primeiro financeiro (Asaas não aceita lista)", () => {
  assert.equal(
    asaasTomadorEmail({
      email_operacional: "ops@c.com",
      email_financeiro: "fin@c.com, fin2@c.com",
    }),
    "fin@c.com",
  );
  assert.equal(
    asaasTomadorEmail({
      email_financeiro: "mailto:carlos@gologtrans.com.br; mota@torresseguranca.com.br",
    }),
    "carlos@gologtrans.com.br",
  );
  assert.equal(asaasTomadorEmail({ email_operacional: "ops@c.com" }), undefined);
});

test("nfseTomadorEmail: só o primeiro do campo financeiro do cadastro", () => {
  const nimbus = {
    email: "legado@nimbus.com",
    email_operacional: "ops@nimbus.com",
    email_financeiro: "igor@nimbusexpress.com.br; financeiro@nimbusexpress.com.br; financeiro2@nimbusexpress.com.br; mota@torresseguranca.com.br",
  };
  assert.equal(nfseTomadorEmail(nimbus), "igor@nimbusexpress.com.br");
  assert.deepEqual(financeiroCadastroEmails(nimbus), [
    "igor@nimbusexpress.com.br",
    "financeiro@nimbusexpress.com.br",
    "financeiro2@nimbusexpress.com.br",
    "mota@torresseguranca.com.br",
  ]);
  assert.equal(nfseTomadorEmail({ email: "legado@c.com", email_operacional: "ops@c.com" }), undefined);
});
