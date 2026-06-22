import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanCnpj,
  buildInvoiceDescription,
  buildInssObservation,
  netBoletoValue,
  buildFiscalPayload,
  buildNfseInvoicePayload,
  fmtBRL,
  INSS_DISPENSA_OBSERVACAO,
  INSS_OBSERVACAO_LEGAL,
  CNAE_PRINCIPAL,
  CODIGO_SERVICO_MUNICIPAL,
  CODIGO_SERVICO_MUNICIPAL_CODE,
  DESCRICAO_SERVICO_FIXA,
  TORRES_CNPJ,
} from "./asaas-helpers.ts";

// ============================================================================
// cleanCnpj
// ============================================================================

test("cleanCnpj: remove pontuação", () => {
  assert.equal(cleanCnpj("36.982.392/0001-89"), TORRES_CNPJ);
});

test("cleanCnpj: aceita null/undefined", () => {
  assert.equal(cleanCnpj(null), "");
  assert.equal(cleanCnpj(undefined), "");
  assert.equal(cleanCnpj(""), "");
});

test("cleanCnpj: remove letras e espaços", () => {
  assert.equal(cleanCnpj("AB 12 3"), "123");
});

// ============================================================================
// buildInvoiceDescription
// ============================================================================

test("buildInvoiceDescription: monta string com período BRT e mês", () => {
  const desc = buildInvoiceDescription("Cliente X", "2025-01-01", "2025-01-31");
  assert.match(desc, /Escolta Armada/);
  assert.match(desc, /01\/01\/2025/);
  assert.match(desc, /31\/01\/2025/);
  assert.match(desc, /Janeiro\/2025/);
});

test("buildInvoiceDescription: usa mês do início para mes/ano de referência", () => {
  // Período cruzando meses — mês de ref é o mês de início.
  const desc = buildInvoiceDescription("X", "2025-03-15", "2025-04-14");
  assert.match(desc, /Março\/2025/);
});

test("buildInvoiceDescription: dezembro mapeia corretamente", () => {
  const desc = buildInvoiceDescription("X", "2024-12-01", "2024-12-31");
  assert.match(desc, /Dezembro\/2024/);
});

// ============================================================================
// buildInssObservation
// ============================================================================

test("buildInssObservation: sem retenção retorna texto de dispensa", () => {
  assert.equal(buildInssObservation(false, 0, 0), INSS_DISPENSA_OBSERVACAO);
});

test("buildInssObservation: com retenção inclui alíquota e valor formatados BRL", () => {
  const obs = buildInssObservation(true, 11, 110);
  assert.ok(obs.startsWith(INSS_OBSERVACAO_LEGAL));
  assert.match(obs, /Alíquota: 11\.00%/);
  assert.match(obs, /R\$ 110,00/);
});

test("buildInssObservation: valor com centavos é formatado com vírgula", () => {
  const obs = buildInssObservation(true, 4.5, 45.67);
  assert.match(obs, /R\$ 45,67/);
  assert.match(obs, /4\.50%/);
});

// ============================================================================
// netBoletoValue (boleto líquido com retenção de INSS)
// ============================================================================

test("netBoletoValue: sem retenção mantém o valor bruto no boleto", () => {
  const r = netBoletoValue(1000, { retemInss: false });
  assert.equal(r.boleto, 1000);
  assert.equal(r.inssValor, 0);
  assert.equal(r.inssAliquota, 0);
});

test("netBoletoValue: opts ausente = sem retenção", () => {
  const r = netBoletoValue(1000);
  assert.equal(r.boleto, 1000);
  assert.equal(r.inssValor, 0);
});

test("netBoletoValue: com retenção 11% desconta o INSS do boleto", () => {
  const r = netBoletoValue(1000, { retemInss: true, inssAliquota: 11 });
  assert.equal(r.inssValor, 110);
  assert.equal(r.boleto, 890);
  assert.equal(r.inssAliquota, 11);
});

test("netBoletoValue: retenção sem alíquota explícita usa 11% padrão", () => {
  const r = netBoletoValue(2000, { retemInss: true });
  assert.equal(r.inssAliquota, 11);
  assert.equal(r.inssValor, 220);
  assert.equal(r.boleto, 1780);
});

test("netBoletoValue: arredonda INSS e boleto a 2 casas (sem dízima)", () => {
  const r = netBoletoValue(1234.56, { retemInss: true, inssAliquota: 11 });
  // 1234.56 * 0.11 = 135.8016 -> 135.80 ; 1234.56 - 135.80 = 1098.76
  assert.equal(r.inssValor, 135.8);
  assert.equal(r.boleto, 1098.76);
  // bruto reconstituível a partir do boleto + INSS retido
  assert.equal(Number((r.boleto + r.inssValor).toFixed(2)), 1234.56);
});

test("netBoletoValue: alíquota diferente de 11% (ex.: 3,5%)", () => {
  const r = netBoletoValue(1000, { retemInss: true, inssAliquota: 3.5 });
  assert.equal(r.inssValor, 35);
  assert.equal(r.boleto, 965);
});

// ============================================================================
// buildFiscalPayload
// ============================================================================

test("buildFiscalPayload: padrão sem INSS zera inss e usa dispensa", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ);
  assert.equal(p.serviceListItem, CODIGO_SERVICO_MUNICIPAL);
  assert.equal(p.municipalServiceCode, CODIGO_SERVICO_MUNICIPAL_CODE);
  assert.equal(p.deductions, 0);
  assert.equal(p.effectiveDatePeriod, "MONTHLY");
  assert.equal(p.taxes.inss, 0);
  assert.equal(p.taxes.iss, 0);
  assert.equal(p.taxes.retainIss, false);
  assert.ok(p.observations.includes(`CNAE ${CNAE_PRINCIPAL}`));
  assert.ok(p.observations.includes(INSS_DISPENSA_OBSERVACAO));
});

test("buildFiscalPayload: retemInss=true usa alíquota default 11%", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ, { retemInss: true });
  assert.equal(p.taxes.inss, 11);
  assert.match(p.observations, /Alíquota: 11\.00%/);
  // 1000 * 11% = 110.00
  assert.match(p.observations, /R\$ 110,00/);
});

test("buildFiscalPayload: alíquota INSS customizada é respeitada", () => {
  const p = buildFiscalPayload(2000, TORRES_CNPJ, { retemInss: true, inssAliquota: 4.5 });
  assert.equal(p.taxes.inss, 4.5);
  // 2000 * 4.5% = 90.00
  assert.match(p.observations, /R\$ 90,00/);
});

test("buildFiscalPayload: valor zero gera retenção zero", () => {
  const p = buildFiscalPayload(0, TORRES_CNPJ, { retemInss: true });
  assert.equal(p.taxes.inss, 11);
  assert.match(p.observations, /R\$ 0,00/);
});

// ============================================================================
// buildNfseInvoicePayload
// ============================================================================

test("buildNfseInvoicePayload: anexa payment quando informado", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "pay_123",
    value: 100,
    description: "Desc teste",
  });
  assert.equal(p.payment, "pay_123");
  assert.equal(p.value, 100);
  assert.equal(p.serviceDescription, "Desc teste");
  assert.equal(p.municipalServiceCode, CODIGO_SERVICO_MUNICIPAL_CODE);
  assert.equal(p.municipalServiceName, DESCRICAO_SERVICO_FIXA);
});

test("buildNfseInvoicePayload: omite payment quando paymentId vazio", () => {
  const p = buildNfseInvoicePayload({ paymentId: "", value: 50, description: "X" });
  assert.equal("payment" in p, false);
});

test("buildNfseInvoicePayload: customerId anexa customer", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 100, description: "X", customerId: "cus_42",
  });
  assert.equal(p.customer, "cus_42");
});

test("buildNfseInvoicePayload: description vazia cai para descrição fixa", () => {
  const p = buildNfseInvoicePayload({ paymentId: "p", value: 100, description: "" });
  assert.equal(p.serviceDescription, DESCRICAO_SERVICO_FIXA);
});

test("buildNfseInvoicePayload: description só com espaços cai para descrição fixa", () => {
  const p = buildNfseInvoicePayload({ paymentId: "p", value: 100, description: "   " });
  assert.equal(p.serviceDescription, DESCRICAO_SERVICO_FIXA);
});

test("buildNfseInvoicePayload: retemInss=true seta INSS e valor parcial", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 1000, description: "X", retemInss: true,
  });
  assert.equal(p.taxes.inss, 11);
  assert.match(p.observations, /R\$ 110,00/);
});

test("buildNfseInvoicePayload: override de municipalServiceId aplica", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 100, description: "X", municipalServiceIdOverride: 999,
  });
  assert.equal(p.municipalServiceId, 999);
});

test("buildNfseInvoicePayload: sem override de municipalServiceId não inclui o campo", () => {
  const p = buildNfseInvoicePayload({ paymentId: "p", value: 100, description: "X" });
  assert.equal("municipalServiceId" in p, false);
});

test("buildNfseInvoicePayload: observations custom sobrescreve base", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 100, description: "X", observations: "Custom obs",
  });
  assert.ok(p.observations.startsWith("Custom obs"));
});

// ============================================================================
// fmtBRL
// ============================================================================

test("fmtBRL: formata valor com R$ e vírgula", () => {
  // \u00A0 = non-breaking space que aparece entre R$ e número em pt-BR
  const out = fmtBRL(1234.5);
  assert.match(out, /R\$/);
  assert.match(out, /1\.234,50/);
});

test("fmtBRL: zero formatado corretamente", () => {
  const out = fmtBRL(0);
  assert.match(out, /R\$/);
  assert.match(out, /0,00/);
});
