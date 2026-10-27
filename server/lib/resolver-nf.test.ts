import assert from "node:assert/strict";
import { test } from "node:test";
import { billingOverrideFromTomador, parseResolverNfBody } from "./resolver-nf";

const tomador = {
  cnpj: "07.504.505/0001-32",
  razaoSocial: "Outro Tomador LTDA",
  inscricaoMunicipal: "",
  email: "nf@outro.com",
  logradouro: "Rua das Flores",
  numero: "10",
  complemento: "SALA 12",
  bairro: "Centro",
  cep: "01310-100",
  codigoIbge: "3550308",
  uf: "sp",
};

test("parseResolverNfBody aceita e-mail do cadastro sem tomador", () => {
  const r = parseResolverNfBody({ email: "a@b.com, c@d.com" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.outroCnpj, false);
});

test("parseResolverNfBody rejeita CNPJ inválido no outro tomador", () => {
  const r = parseResolverNfBody({ outroCnpj: true, tomador: { ...tomador, cnpj: "11111111111111" } });
  assert.equal(r.ok, false);
});

test("billingOverrideFromTomador grava só a fatura e corta o complemento", () => {
  const r = parseResolverNfBody({ outroCnpj: true, tomador });
  assert.equal(r.ok, true);
  if (!r.ok || !r.data.tomador) return;
  const row = billingOverrideFromTomador(r.data.tomador);
  assert.equal(row.billing_cnpj, "07504505000132");
  assert.equal(row.billing_uf, "SP");
  assert.equal(row.billing_cep, "01310100");
  assert.equal(row.billing_complemento, "SALA 12");
  assert.equal(parseResolverNfBody({
    outroCnpj: true,
    tomador: { ...tomador, complemento: "COND PROLOGIS CCP PARK IIQUADRAAREA" },
  }).ok, false);
});
