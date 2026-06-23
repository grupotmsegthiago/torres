import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanCnpj,
  buildInvoiceDescription,
  buildInssObservation,
  netBoletoValue,
  buildFiscalPayload,
  buildNfseInvoicePayload,
  buildValoresObservation,
  fmtBRL,
  EMPRESA_PIX_ALEATORIA,
  parseInvoicePeriodInfo,
  formatNfNumber,
  buildNfClientEmail,
  INSS_DISPENSA_OBSERVACAO,
  INSS_OBSERVACAO_LEGAL,
  SIMPLES_NACIONAL_OBSERVACAO,
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

test("buildFiscalPayload: inclui texto do Simples Nacional e valor bruto", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ);
  assert.ok(p.observations.includes(SIMPLES_NACIONAL_OBSERVACAO));
  assert.match(p.observations, /Valor bruto: R\$ 1000,00/);
});

test("buildFiscalPayload: com INSS mostra bruto, retido e líquido", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ, { retemInss: true });
  assert.match(p.observations, /Valor bruto: R\$ 1000,00/);
  assert.match(p.observations, /INSS retido \(11\.00%\): R\$ 110,00/);
  assert.match(p.observations, /Valor líquido: R\$ 890,00/);
});

// ============================================================================
// buildValoresObservation
// ============================================================================

test("buildValoresObservation: sem INSS mostra só o bruto", () => {
  assert.equal(buildValoresObservation(1500, false, 0), "Valor bruto: R$ 1500,00.");
});

test("buildValoresObservation: com INSS calcula líquido = bruto − retido", () => {
  const out = buildValoresObservation(2000, true, 11);
  assert.match(out, /Valor bruto: R\$ 2000,00/);
  assert.match(out, /INSS retido \(11\.00%\): R\$ 220,00/);
  assert.match(out, /Valor líquido: R\$ 1780,00/);
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

// ============================================================================
// parseInvoicePeriodInfo / formatNfNumber / EMPRESA_PIX_ALEATORIA
// ============================================================================

test("parseInvoicePeriodInfo: extrai competência e período da descrição padrão", () => {
  const desc = buildInvoiceDescription("Cliente X", "2026-06-01", "2026-06-30");
  const r = parseInvoicePeriodInfo(desc, "2026-07-10");
  assert.equal(r.competencia, "Junho/2026");
  assert.equal(r.dataExecucao, "01/06/2026 a 30/06/2026");
});

test("parseInvoicePeriodInfo: mesmo dia mostra só a data (sem 'a')", () => {
  const desc = buildInvoiceDescription("Cliente X", "2026-06-15", "2026-06-15");
  const r = parseInvoicePeriodInfo(desc, "2026-07-10");
  assert.equal(r.competencia, "Junho/2026");
  assert.equal(r.dataExecucao, "15/06/2026");
});

test("parseInvoicePeriodInfo: fallback de competência pelo vencimento quando descrição não casa", () => {
  const r = parseInvoicePeriodInfo("Descrição sem período", "2026-03-20");
  assert.equal(r.competencia, "Março/2026");
  assert.equal(r.dataExecucao, "");
});

test("parseInvoicePeriodInfo: descrição e vencimento vazios retorna campos vazios", () => {
  const r = parseInvoicePeriodInfo(null, null);
  assert.equal(r.competencia, "");
  assert.equal(r.dataExecucao, "");
});

test("formatNfNumber: número fiscal definitivo é retornado", () => {
  assert.equal(formatNfNumber("12345"), "12345");
});

test("formatNfNumber: id interno do Asaas (inv_) é tratado como sem número", () => {
  assert.equal(formatNfNumber("inv_8a9b"), null);
  assert.equal(formatNfNumber("INV_8a9b"), null);
});

test("formatNfNumber: vazio/null retorna null", () => {
  assert.equal(formatNfNumber(""), null);
  assert.equal(formatNfNumber(null), null);
  assert.equal(formatNfNumber("   "), null);
});

test("EMPRESA_PIX_ALEATORIA: é a chave aleatória do modelo do financeiro", () => {
  assert.equal(EMPRESA_PIX_ALEATORIA, "8165456b-57f5-4a6c-a633-fa0d004a89db");
});

// ============================================================================
// buildNfClientEmail
// ============================================================================

test("buildNfClientEmail: assunto e corpo seguem o modelo do financeiro", () => {
  const { subject, html } = buildNfClientEmail({
    client_name: "Cliente X",
    value: 1234.5,
    due_date: "2026-07-10",
    description: buildInvoiceDescription("Cliente X", "2026-06-01", "2026-06-30"),
    bank_slip_url: "https://boleto",
    nfse_url: "https://nf",
    nfse_number: "456",
    pix_copia_e_cola: "00020126PIXDINAMICOASAAS5204",
  });
  assert.equal(subject, "Prestação de Serviço de Escolta Armada Torres – NF nº 456");
  assert.match(html, /Prezados,/);
  assert.match(html, /Competência:/);
  assert.match(html, /Junho\/2026/);
  assert.match(html, /Data de Execução:/);
  assert.match(html, /01\/06\/2026 a 30\/06\/2026/);
  assert.match(html, /Nº da Nota Fiscal:/);
  assert.match(html, /Serviço Prestado:/);
  assert.match(html, /Escolta Armada/);
  assert.match(html, /Valor Total da Prestação de Serviço:/);
  assert.match(html, /1\.234,50/);
  assert.match(html, /Boleto Bancário/);
  assert.match(html, /PIX \(Copia e Cola\)/);
  assert.ok(html.includes("00020126PIXDINAMICOASAAS5204"));
  assert.match(html, /Permanecemos à disposição para quaisquer esclarecimentos\./);
});

test("buildNfClientEmail: PIX dinâmico do Asaas (baixa automática), nunca a chave estática", () => {
  const { html } = buildNfClientEmail({
    value: 100,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "1",
    pix_copia_e_cola: "00020126BR.GOV.BCB.PIX-DINAMICO",
  });
  assert.ok(html.includes("00020126BR.GOV.BCB.PIX-DINAMICO"));
  assert.equal(html.includes(EMPRESA_PIX_ALEATORIA), false);
});

test("buildNfClientEmail: sem PIX copia-e-cola omite a seção PIX (só boleto)", () => {
  const { html } = buildNfClientEmail({
    value: 100,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "1",
  });
  assert.match(html, /Boleto Bancário/);
  assert.equal(/PIX \(Copia e Cola\)/.test(html), false);
});

test("buildNfClientEmail: sem número fiscal usa assunto genérico e '—'", () => {
  const { subject, html } = buildNfClientEmail({
    value: 100,
    due_date: "2026-07-10",
    description: "Descrição sem período",
    nfse_number: "inv_abc",
  });
  assert.equal(subject, "Prestação de Serviço de Escolta Armada Torres");
  assert.match(html, /Nº da Nota Fiscal:<\/td><td[^>]*>—/);
});

test("buildNfClientEmail: com retenção de INSS mostra retenção e líquido a pagar", () => {
  const { html } = buildNfClientEmail({
    value: 1000,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "789",
    valor_inss_retido: 110,
    inss_aliquota: 11,
  });
  assert.match(html, /Retenção INSS/);
  assert.match(html, /Valor líquido a pagar:/);
  assert.match(html, /110,00/);
  assert.match(html, /890,00/);
});

test("buildNfClientEmail: sem INSS não mostra linhas de retenção", () => {
  const { html } = buildNfClientEmail({
    value: 500,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "1",
  });
  assert.equal(/Retenção INSS/.test(html), false);
  assert.equal(/Valor líquido a pagar/.test(html), false);
});
