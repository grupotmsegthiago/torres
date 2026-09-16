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
  buildNfseObservations,
  NF_OBSERVATIONS_MAX,
  fmtBRL,
  EMPRESA_PIX_ALEATORIA,
  parseInvoicePeriodInfo,
  formatNfNumber,
  buildNfClientEmail,
  INSS_DISPENSA_OBSERVACAO,
  INSS_OBSERVACAO_LEGAL,
  CNAE_PRINCIPAL,
  CODIGO_SERVICO_MUNICIPAL,
  CODIGO_SERVICO_MUNICIPAL_CODE,
  MUNICIPAL_SERVICE_ID_DEFAULT,
  MUNICIPAL_SERVICE_EXTERNAL_ID,
  DESCRICAO_SERVICO_FIXA,
  TORRES_CNPJ,
  buildMarkEmittedInvoiceUpdates,
  MARK_EMITTED_INVOICE_COLUMNS,
  isNfCorrectionError,
  describeAsaasPaymentNotification,
  isFinalNfNumber,
  isNfFullyIssued,
  classifyIssuedOrProcessing,
  nfseFieldsFromEmitResult,
  nfseUpdatesFromAsaasObject,
  describeNfProcessingWait,
  extractAsaasMunicipalNumber,
  municipalInscriptionIfChanged,
  isAsaasPrefeituraRejection,
  invoiceUpdatesAreMaterial,
  unstickStaleNfReconcile,
  NF_RECONCILE_STALE_MS,
  shouldMarkMissingNfAsError,
  canReemitNfse,
  pickPreferredAsaasNf,
  isAsaasInvoiceId,
  sanitizeNfDiscriminacao,
  isDiscriminacaoSchemaError,
  isLegacyEscoltaDiscriminacao,
  isHiddenDiscriminacaoRejection,
  shouldCancelRescheduleLegacyDiscriminacao,
  asaasNfIdForOfficialPut,
  hasAsaasRps,
  LEGACY_DISCRIMINACAO_STUCK_MSG,
  isAsaasNfCancelBlockedProcessing,
  buildNfsePutPayload,
  existingAsaasNfIdToRetry,
  shouldAutoRetryDiscriminacaoError,
  shouldNudgeNfseAuthorize,
  shouldAutoEmitMissingNfse,
  fiscalAddressMissingFields,
  assertFiscalAddressForNf,
  isOpenNfFollowUpStatus,
  NF_PROCESSING_STALE_HOURS,
  municipalServiceNameOficial,
  todayDateStr,
  isMissingMunicipalServiceCode,
  isQueuedAtPrefecture,
  isLocalNfProcessingPlaceholder,
  asaasCustomerEmailAllowed,
  isAsaasNotificationPolicyCompliant,
  buildAsaasNotificationPolicyUpdate,
  asaasDueDateIfDifferent,
  isManualInvoiceDueDate,
  planDueDateReconcile,
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

test("buildInssObservation: com retenção inclui alíquota legal, base 50% e valor formatados BRL", () => {
  const obs = buildInssObservation(true, 11, 55);
  assert.ok(obs.startsWith(INSS_OBSERVACAO_LEGAL));
  assert.match(obs, /Alíquota legal: 11\.00%/);
  assert.match(obs, /50% da base/);
  assert.match(obs, /efetivo 5\.50%/);
  assert.match(obs, /R\$ 55,00/);
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

test("netBoletoValue: com retenção 11% desconta 50% da alíquota (5,5%)", () => {
  const r = netBoletoValue(1000, { retemInss: true, inssAliquota: 11 });
  assert.equal(r.inssValor, 55);
  assert.equal(r.boleto, 945);
  assert.equal(r.inssAliquota, 5.5);
  assert.equal(r.issValor, 0);
});

test("netBoletoValue: retenção sem alíquota explícita usa 11% legal → 5,5% efetivo", () => {
  const r = netBoletoValue(2000, { retemInss: true });
  assert.equal(r.inssAliquota, 5.5);
  assert.equal(r.inssValor, 110);
  assert.equal(r.boleto, 1890);
});

test("netBoletoValue: arredonda INSS e boleto a 2 casas (sem dízima)", () => {
  const r = netBoletoValue(1234.56, { retemInss: true, inssAliquota: 11 });
  // 1234.56 * 0.055 = 67.9008 -> 67.90 ; 1234.56 - 67.90 = 1166.66
  assert.equal(r.inssValor, 67.9);
  assert.equal(r.boleto, 1166.66);
  assert.equal(Number((r.boleto + r.inssValor).toFixed(2)), 1234.56);
});

test("netBoletoValue: alíquota legal diferente de 11% também aplica 50% da base", () => {
  const r = netBoletoValue(1000, { retemInss: true, inssAliquota: 3.5 });
  assert.equal(r.inssAliquota, 1.75);
  assert.equal(r.inssValor, 17.5);
  assert.equal(r.boleto, 982.5);
});

test("netBoletoValue: emite NF desconta ISS 2% além do INSS efetivo", () => {
  const r = netBoletoValue(1000, { retemInss: true, inssAliquota: 11, retainIss: true });
  assert.equal(r.inssValor, 55);
  assert.equal(r.issValor, 20);
  assert.equal(r.issAliquota, 2);
  assert.equal(r.boleto, 925);
});

// ============================================================================
// buildFiscalPayload
// ============================================================================

test("buildFiscalPayload: padrão sem INSS zera inss e retém ISS 2%", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ);
  assert.equal(p.serviceListItem, CODIGO_SERVICO_MUNICIPAL);
  assert.equal(p.municipalServiceCode, CODIGO_SERVICO_MUNICIPAL_CODE);
  assert.equal(p.deductions, 0);
  assert.equal(p.effectiveDatePeriod, "MONTHLY");
  assert.equal(p.taxes.inss, 0);
  assert.equal(p.taxes.iss, 2);
  assert.equal(p.taxes.retainIss, true);
  assert.ok(p.observations.includes(`CNAE ${CNAE_PRINCIPAL}`));
  assert.match(p.observations, /Sem ret\. INSS|Sem retenção INSS/);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildFiscalPayload: retemInss=true usa 50% de 11% (5,5%)", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ, { retemInss: true });
  assert.equal(p.taxes.inss, 5.5);
  assert.equal(p.taxes.iss, 2);
  assert.equal(p.taxes.retainIss, true);
  assert.match(p.observations, /5,50%/);
  // 1000 * 5.5% = 55.00
  assert.match(p.observations, /R\$ 55,00/);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildFiscalPayload: alíquota INSS customizada aplica 50% da base", () => {
  const p = buildFiscalPayload(2000, TORRES_CNPJ, { retemInss: true, inssAliquota: 4.5 });
  assert.equal(p.taxes.inss, 2.25);
  // 2000 * 2.25% = 45.00
  assert.match(p.observations, /R\$ 45,00/);
});

test("buildFiscalPayload: valor zero gera retenção zero", () => {
  const p = buildFiscalPayload(0, TORRES_CNPJ, { retemInss: true });
  assert.equal(p.taxes.inss, 5.5);
  assert.match(p.observations, /R\$ 0,00/);
});

test("buildFiscalPayload: inclui Simples Nacional resumido e valor bruto", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ);
  assert.match(p.observations, /Simples Nac\.|Simples Nacional/);
  assert.match(p.observations, /10\.833/);
  assert.match(p.observations, /R\$ 1000,00/);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildFiscalPayload: com INSS mostra bruto, INSS 5,5%, ISS e líquido em até 250 chars", () => {
  const p = buildFiscalPayload(1000, TORRES_CNPJ, { retemInss: true });
  assert.match(p.observations, /R\$ 1000,00/);
  assert.match(p.observations, /R\$ 55,00/);
  assert.match(p.observations, /R\$ 20,00/);
  assert.match(p.observations, /R\$ 925,00/);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

// ============================================================================
// buildValoresObservation
// ============================================================================

test("buildValoresObservation: sem INSS ainda mostra ISS 2% e líquido", () => {
  const out = buildValoresObservation(1500, false, 0);
  assert.match(out, /Valor bruto: R\$ 1500,00/);
  assert.match(out, /ISS retido \(2\.00%\): R\$ 30,00/);
  assert.match(out, /Valor líquido: R\$ 1470,00/);
});

test("buildValoresObservation: com INSS calcula líquido = bruto − INSS efetivo − ISS", () => {
  const out = buildValoresObservation(2000, true, 11);
  assert.match(out, /Valor bruto: R\$ 2000,00/);
  assert.match(out, /INSS retido \(5\.50%/);
  assert.match(out, /ISS retido \(2\.00%\): R\$ 40,00/);
  assert.match(out, /Valor líquido: R\$ 1850,00/);
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
  assert.equal(p.serviceDescription, DESCRICAO_SERVICO_FIXA);
  assert.match(p.observations, /CNAE 7870/);
  assert.match(p.observations, /Escolta Armada/);
  assert.equal("municipalServiceCode" in p, false);
  assert.equal(p.municipalServiceName, municipalServiceNameOficial());
  assert.equal(p.municipalServiceId, MUNICIPAL_SERVICE_ID_DEFAULT);
  assert.equal(p.municipalServiceExternalId, MUNICIPAL_SERVICE_EXTERNAL_ID);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildNfseInvoicePayload: Discriminacao nunca leva nome do cliente nem travessão", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "pay_1",
    value: 4254.3,
    description: "Escolta Armada — R.F.M. LOGISTICA E TRANSPORTES",
  });
  assert.equal(p.serviceDescription, DESCRICAO_SERVICO_FIXA);
  assert.equal(p.serviceDescription.includes("—"), false);
  assert.equal(p.serviceDescription.includes("R.F.M."), false);
  assert.equal(p.observations.includes("R.F.M."), false);
  assert.equal(p.observations.includes("—"), false);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildNfsePutPayload: omite payment/customer e envia taxes completos", () => {
  const post = buildNfseInvoicePayload({
    paymentId: "pay_1", value: 100, description: "X", customerId: "cus_1",
  });
  const put = buildNfsePutPayload(post);
  assert.equal("payment" in put, false);
  assert.equal("customer" in put, false);
  assert.equal(put.serviceDescription, DESCRICAO_SERVICO_FIXA);
  assert.equal("municipalServiceCode" in put, false);
  assert.equal(put.municipalServiceName, municipalServiceNameOficial());
  assert.equal(put.municipalServiceId, MUNICIPAL_SERVICE_ID_DEFAULT);
  assert.equal(put.municipalServiceExternalId, MUNICIPAL_SERVICE_EXTERNAL_ID);
  assert.equal(put.updatePayment, false);
  assert.equal(put.taxes.iss, 2);
  assert.equal(put.taxes.retainIss, true);
});

test("sanitizeNfDiscriminacao: troca travessão e control chars", () => {
  assert.equal(sanitizeNfDiscriminacao("A — B"), "A - B");
  assert.equal(sanitizeNfDiscriminacao(""), DESCRICAO_SERVICO_FIXA);
  assert.equal(sanitizeNfDiscriminacao("   "), DESCRICAO_SERVICO_FIXA);
});

test("isDiscriminacaoSchemaError: detecta rejeição da prefeitura SP", () => {
  assert.equal(isDiscriminacaoSchemaError("Retorno da prefeitura de São Paulo-SP: XML não compatível com Schema. The 'Discriminacao' element is invalid"), true);
  assert.equal(isDiscriminacaoSchemaError("Inscrição municipal inválida"), false);
  assert.equal(isDiscriminacaoSchemaError(null), false);
});

test("existingAsaasNfIdToRetry: só ERROR com inv_", () => {
  assert.equal(existingAsaasNfIdToRetry({ id: "inv_000022571641", status: "ERROR" }), "inv_000022571641");
  assert.equal(existingAsaasNfIdToRetry({ id: "inv_1", status: "SYNCHRONIZED" }), null);
  assert.equal(existingAsaasNfIdToRetry({ id: "2562", status: "ERROR" }), null);
});

test("shouldAutoRetryDiscriminacaoError: só schema + emite_nf", () => {
  const inv = {
    nfse_status: "ERROR",
    nfse_number: "inv_1",
    nfse_error_message: "XML não compatível com Schema. Discriminacao",
  };
  assert.equal(shouldAutoRetryDiscriminacaoError(inv, true), true);
  assert.equal(shouldAutoRetryDiscriminacaoError(inv, false), false);
  assert.equal(shouldAutoRetryDiscriminacaoError({
    nfse_status: "ERROR",
    nfse_number: "inv_1",
    nfse_error_message: "Inscrição municipal inválida",
  }, true), false);
  assert.equal(shouldAutoRetryDiscriminacaoError({
    nfse_status: "SYNCHRONIZED",
    nfse_number: "inv_1",
    nfse_error_message: null,
  }, true), false);
});

test("isLegacyEscoltaDiscriminacao: texto da fatura ≠ CNAE oficial", () => {
  assert.equal(isLegacyEscoltaDiscriminacao("Vigilância, segurança ou monitoramento de bens, pessoas e semoventes"), false);
  assert.equal(isLegacyEscoltaDiscriminacao("Escolta Armada — TRANSPACHECO — Período: 20/08/2026 a 28/08/2026"), true);
  assert.equal(isLegacyEscoltaDiscriminacao(null), false);
});

test("isHiddenDiscriminacaoRejection: #171 sim; #170 com RPS não; emitida não", () => {
  const descAntiga = "Escolta Armada — TRANSPACHECO — Período: 20/08/2026 a 28/08/2026";
  assert.equal(isHiddenDiscriminacaoRejection({
    status: "SYNCHRONIZED",
    number: null,
    rpsNumber: null,
    serviceDescription: descAntiga,
  }, true), true);
  assert.equal(hasAsaasRps({ rpsNumber: "295" }), true);
  assert.equal(isHiddenDiscriminacaoRejection({
    status: "SYNCHRONIZED",
    number: null,
    rpsNumber: "295",
    serviceDescription: "Vigilância, segurança ou monitoramento de bens, pessoas e semoventes",
  }, true), false);
  assert.equal(isHiddenDiscriminacaoRejection({
    status: "SYNCHRONIZED",
    number: null,
    rpsNumber: "295",
    serviceDescription: descAntiga,
  }, true), false);
  assert.equal(isHiddenDiscriminacaoRejection({
    status: "AUTHORIZED",
    number: "309",
    serviceDescription: descAntiga,
  }, true), false);
  assert.equal(isHiddenDiscriminacaoRejection({
    status: "SYNCHRONIZED",
    number: null,
    serviceDescription: descAntiga,
  }, false), false);
  assert.equal(shouldCancelRescheduleLegacyDiscriminacao({
    status: "SYNCHRONIZED",
    number: null,
    serviceDescription: descAntiga,
  }, true), true);
});

test("asaasNfIdForOfficialPut: ERROR e SCHEDULED antigo; SYNCHRONIZED não", () => {
  assert.equal(asaasNfIdForOfficialPut({
    id: "inv_1", status: "ERROR", number: null, serviceDescription: "Escolta Armada — X",
  }, true), "inv_1");
  assert.equal(asaasNfIdForOfficialPut({
    id: "inv_1", status: "SCHEDULED", number: null,
    serviceDescription: "Escolta Armada — X — Período: 01/01/2026",
  }, true), "inv_1");
  assert.equal(asaasNfIdForOfficialPut({
    id: "inv_1", status: "SYNCHRONIZED", number: null,
    serviceDescription: "Escolta Armada — X — Período: 01/01/2026",
  }, true), null);
  assert.equal(asaasNfIdForOfficialPut({
    id: "inv_1", status: "ERROR", number: "309",
  }, true), null);
});

test("nfseUpdatesFromAsaasObject: SYNCHRONIZED com Discriminacao antiga vira ERROR local", () => {
  const u = nfseUpdatesFromAsaasObject(
    {
      id: "inv_171",
      status: "SYNCHRONIZED",
      number: null,
      rpsNumber: null,
      serviceDescription: "Escolta Armada — TRANSPACHECO TRANSPORTE — Período: 20/08/2026 a 28/08/2026",
    },
    { nfse_status: "SYNCHRONIZED", nfse_number: "inv_171", nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_status, "ERROR");
  assert.equal(u.nfse_error_message, LEGACY_DISCRIMINACAO_STUCK_MSG);
});

test("nfseUpdatesFromAsaasObject: #170 oficial com RPS permanece processando", () => {
  const u = nfseUpdatesFromAsaasObject(
    {
      id: "inv_170",
      status: "SYNCHRONIZED",
      number: null,
      rpsNumber: "295",
      serviceDescription: "Vigilância, segurança ou monitoramento de bens, pessoas e semoventes",
    },
    { nfse_status: "SYNCHRONIZED", nfse_number: "inv_170", nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_status, undefined);
  assert.equal(u.nfse_error_message, undefined);
});

test("isAsaasNfCancelBlockedProcessing", () => {
  assert.equal(isAsaasNfCancelBlockedProcessing("A Nota fiscal está com status Processando emissão e não pode ser cancelada."), true);
  assert.equal(isAsaasNfCancelBlockedProcessing("Inscrição municipal inválida"), false);
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

test("buildNfseInvoicePayload: retemInss=true seta INSS efetivo 5,5% e ISS 2%", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 1000, description: "X", retemInss: true,
  });
  assert.equal(p.taxes.inss, 5.5);
  assert.equal(p.taxes.iss, 2);
  assert.equal(p.taxes.retainIss, true);
  assert.match(p.observations, /R\$ 55,00/);
});

test("buildNfseInvoicePayload: override de municipalServiceId aplica", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 100, description: "X", municipalServiceIdOverride: 999,
  });
  assert.equal(p.municipalServiceId, 999);
  assert.equal("municipalServiceCode" in p, false);
});

test("buildNfseInvoicePayload: prefeitura usa ID 402 e omite municipalServiceCode", () => {
  const p = buildNfseInvoicePayload({ paymentId: "p", value: 100, description: "X" });
  assert.equal(p.municipalServiceId, 402);
  assert.equal(p.municipalServiceExternalId, 402);
  assert.equal("municipalServiceCode" in p, false);
  assert.equal(p.municipalServiceName, "07870 - Vigilância, segurança ou monitoramento de bens, pessoas e semoventes");
  assert.equal(p.serviceDescription, DESCRICAO_SERVICO_FIXA);
  assert.equal(String(p.serviceDescription).startsWith("07870"), false);
});

test("buildNfseInvoicePayload: observations custom não sobrescreve o modelo oficial", () => {
  const p = buildNfseInvoicePayload({
    paymentId: "p", value: 100, description: "X", observations: "Custom obs",
  });
  assert.equal(p.observations.includes("Custom obs"), false);
  assert.match(p.observations, /CNAE 7870/);
  assert.ok(p.observations.length <= NF_OBSERVATIONS_MAX);
});

test("buildNfseObservations: modelo do financeiro com período, INSS, Simples e valores ≤ 250", () => {
  const desc = buildInvoiceDescription("Cliente X", "2026-07-17", "2026-07-17");
  const obs = buildNfseObservations({
    value: 632.80,
    description: desc,
    retemInss: true,
    inssAliquota: 11,
  });
  assert.match(obs, /CNAE 7870/);
  assert.match(obs, /Escolta Armada/);
  assert.match(obs, /17\/07\/2026 a 17\/07\/2026 \(Julho\/2026\)/);
  assert.match(obs, /Anexo IV/);
  assert.match(obs, /2\.110\/2022/);
  assert.match(obs, /5,50%/);
  assert.match(obs, /R\$ 34,80/); // 632.80 * 5.5%
  assert.match(obs, /Simples Nac\./);
  assert.match(obs, /PIS\/COFINS\/CSLL/);
  assert.match(obs, /10\.833/);
  assert.match(obs, /R\$ 632,80/);
  assert.match(obs, /R\$ 12,66/); // ISS 2%
  assert.match(obs, /R\$ 585,34/); // líquido
  assert.ok(obs.length <= 250, `observations ${obs.length}: ${obs}`);
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

test("parseInvoicePeriodInfo: descrição com travessão (sem parêntese de competência)", () => {
  const r = parseInvoicePeriodInfo(
    "Escolta Armada — RFM — Período: 28/07/2026 a 28/07/2026 — 2 OS(s)",
    "2026-10-04",
  );
  assert.equal(r.competencia, "Julho/2026");
  assert.equal(r.dataExecucao, "28/07/2026");
});

test("buildNfseObservations: período da fatura legado (travessão) entra no texto ≤ 250", () => {
  const obs = buildNfseObservations({
    value: 3428.16,
    description: "Escolta Armada — RFM — Período: 28/07/2026 a 28/07/2026 — 2 OS(s)",
    retemInss: true,
    inssAliquota: 11,
  });
  assert.match(obs, /28\/07\/2026 a 28\/07\/2026 \(Julho\/2026\)/);
  assert.ok(obs.length <= NF_OBSERVATIONS_MAX, `len ${obs.length}: ${obs}`);
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

test("buildNfClientEmail: com retenção de INSS mostra retenção, ISS e líquido a pagar", () => {
  const { html } = buildNfClientEmail({
    value: 1000,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "789",
    valor_inss_retido: 55,
    inss_aliquota: 5.5,
    valor_iss_retido: 20,
    iss_aliquota: 2,
  });
  assert.match(html, /Retenção INSS/);
  assert.match(html, /Retenção ISS/);
  assert.match(html, /Valor líquido a pagar:/);
  assert.match(html, /55,00/);
  assert.match(html, /20,00/);
  assert.match(html, /925,00/);
});

test("buildNfClientEmail: sem INSS ainda mostra ISS 2% padrão da NF", () => {
  const { html } = buildNfClientEmail({
    value: 500,
    due_date: "2026-07-10",
    description: "x",
    nfse_number: "1",
  });
  assert.equal(/Retenção INSS/.test(html), false);
  assert.match(html, /Retenção ISS/);
  assert.match(html, /Valor líquido a pagar/);
});

test("buildMarkEmittedInvoiceUpdates: grava AUTHORIZED e observação, sem nfse_authorized_at", () => {
  const updates = buildMarkEmittedInvoiceUpdates({
    invoice: { nfse_observations: "histórica" },
    email: "thiago@example.com",
    nfNumber: "2562",
    note: "PAGO DIA 04/08",
    nowIso: "2026-08-25T16:00:00.000Z",
  });
  assert.equal(updates.nfse_status, "AUTHORIZED");
  assert.equal(updates.nfse_number, "2562");
  assert.match(updates.nfse_observations, /thiago@example.com/);
  assert.match(updates.nfse_observations, /PAGO DIA 04\/08/);
  assert.match(updates.nfse_observations, /histórica/);
  assert.equal("nfse_authorized_at" in updates, false);
  for (const key of Object.keys(updates)) {
    assert.ok(
      (MARK_EMITTED_INVOICE_COLUMNS as readonly string[]).includes(key),
      `coluna inesperada no payload: ${key}`,
    );
  }
});

test("buildMarkEmittedInvoiceUpdates: número vazio não inclui nfse_number", () => {
  const updates = buildMarkEmittedInvoiceUpdates({
    invoice: {},
    email: "a@b.c",
    nfNumber: "   ",
    nowIso: "2026-08-25T16:00:00.000Z",
  });
  assert.equal("nfse_number" in updates, false);
  assert.equal(updates.nfse_status, "AUTHORIZED");
});

test("isNfCorrectionError: e-mail ausente é correção, não erro de integração", () => {
  assert.equal(isNfCorrectionError("NF não emitida: e-mail do cliente ausente ou inválido no cadastro."), true);
  assert.equal(isNfCorrectionError("Timeout Asaas"), false);
});

test("describeAsaasPaymentNotification: envio e leitura com destinatário", () => {
  const sent = describeAsaasPaymentNotification({
    event: "PAYMENT_CREATED",
    status: "SENT",
    emailAddress: "pagador@cliente.com",
    dateCreated: "2026-08-01T12:00:00Z",
  });
  assert.equal(sent.kind, "email");
  assert.match(sent.title, /cobrança enviado/);
  assert.match(sent.title, /enviado/);
  assert.equal(sent.detail, "Para: pagador@cliente.com");

  const read = describeAsaasPaymentNotification({
    event: "PAYMENT_CREATED",
    status: "READ",
    scheduleDate: "2026-08-02T09:00:00Z",
  });
  assert.match(read.title, /lido/);
  assert.equal(read.at, "2026-08-02T09:00:00Z");
});

test("isFinalNfNumber: ignora id interno Asaas e vazio", () => {
  assert.equal(isFinalNfNumber(null), false);
  assert.equal(isFinalNfNumber(""), false);
  assert.equal(isFinalNfNumber("inv_abc123"), false);
  assert.equal(isFinalNfNumber("INV_ABC"), false);
  assert.equal(isFinalNfNumber("2562"), true);
  assert.equal(isFinalNfNumber("RPS-99"), true);
});

test("isNfFullyIssued: AUTHORIZED sem número municipal NÃO é emitida", () => {
  assert.equal(isNfFullyIssued("AUTHORIZED", null), false);
  assert.equal(isNfFullyIssued("AUTHORIZED", "inv_xyz"), false);
  assert.equal(isNfFullyIssued("AUTHORIZED", "2562"), true);
  assert.equal(isNfFullyIssued("SYNCHRONIZED", "100"), true);
});

test("classifyIssuedOrProcessing: FAT sem nº fica processando (não emitida)", () => {
  assert.equal(classifyIssuedOrProcessing("AUTHORIZED", null), "NF_PROCESSANDO");
  assert.equal(classifyIssuedOrProcessing("ISSUED", "inv_x"), "NF_PROCESSANDO");
  assert.equal(classifyIssuedOrProcessing("SYNCHRONIZED", "inv_x"), "NF_PROCESSANDO");
  assert.equal(classifyIssuedOrProcessing("SYNCHRONIZED", null), "NF_PROCESSANDO");
  assert.equal(classifyIssuedOrProcessing("SYNCHRONIZED", "318"), "NF_EMITIDA");
  assert.equal(classifyIssuedOrProcessing("AUTHORIZED", "2562"), "NF_EMITIDA");
  assert.equal(classifyIssuedOrProcessing("SCHEDULED", "inv_x"), "NF_PROCESSANDO");
  assert.equal(classifyIssuedOrProcessing("ERROR", null), null);
});

test("nfseFieldsFromEmitResult: não inventa AUTHORIZED; guarda inv_ para sync", () => {
  assert.deepEqual(nfseFieldsFromEmitResult({ id: "inv_1", status: "SCHEDULED" }), {
    nfse_status: "SCHEDULED",
    nfse_number: "inv_1",
  });
  assert.deepEqual(nfseFieldsFromEmitResult({ id: "inv_1", status: "AUTHORIZED", number: "88" }), {
    nfse_status: "AUTHORIZED",
    nfse_number: "88",
  });
  assert.deepEqual(nfseFieldsFromEmitResult({}), { nfse_status: "SCHEDULED" });
});

test("isAsaasInvoiceId", () => {
  assert.equal(isAsaasInvoiceId("inv_abc"), true);
  assert.equal(isAsaasInvoiceId("2562"), false);
  assert.equal(isAsaasInvoiceId(null), false);
});

test("nfseUpdatesFromAsaasObject: guarda inv_ quando ainda não há nº municipal", () => {
  const u = nfseUpdatesFromAsaasObject(
    { id: "inv_xyz", status: "AUTHORIZED", number: null },
    { nfse_status: "AUTHORIZED", nfse_number: null, nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_number, "inv_xyz");
  assert.equal(u.nfse_status, undefined);
});

test("nfseUpdatesFromAsaasObject: nº municipal substitui inv_", () => {
  const u = nfseUpdatesFromAsaasObject(
    { id: "inv_xyz", status: "AUTHORIZED", number: "2562", pdfUrl: "https://nf.pdf" },
    { nfse_status: "AUTHORIZED", nfse_number: "inv_xyz", nfse_url: null, nfse_error_message: "x" },
  );
  assert.equal(u.nfse_number, "2562");
  assert.equal(u.nfse_url, "https://nf.pdf");
  assert.equal(u.nfse_error_message, null);
});

test("extractAsaasMunicipalNumber: aceita number numérico e ignora RPS", () => {
  assert.equal(extractAsaasMunicipalNumber({ number: 2562 }), "2562");
  assert.equal(extractAsaasMunicipalNumber({ nfeNumber: "88" }), "88");
  assert.equal(extractAsaasMunicipalNumber({ number: null, rpsNumber: "123" }), null);
  assert.equal(extractAsaasMunicipalNumber({ number: "inv_abc" }), null);
});

test("municipalInscriptionIfChanged: CCM do tomador, não número da NFS-e", () => {
  assert.equal(municipalInscriptionIfChanged(null, null), null);
  assert.equal(municipalInscriptionIfChanged("07930", ""), null);
  assert.equal(municipalInscriptionIfChanged("07930", "07930"), null);
  assert.equal(municipalInscriptionIfChanged("7.930", "07930"), null);
  assert.equal(municipalInscriptionIfChanged("07930", "7.930"), null);
  assert.equal(municipalInscriptionIfChanged("", "07930"), "07930");
  assert.equal(municipalInscriptionIfChanged("00000", "07930"), "07930");
});

test("isAsaasPrefeituraRejection: rejeição ≠ fila da prefeitura", () => {
  assert.equal(isAsaasPrefeituraRejection("Aguardando processamento da prefeitura"), false);
  assert.equal(isAsaasPrefeituraRejection("Enviado para a prefeitura"), false);
  assert.equal(isAsaasPrefeituraRejection("The 'Discriminacao' element is invalid"), true);
  assert.equal(isAsaasPrefeituraRejection("Inscrição municipal inválida"), true);
  assert.equal(isAsaasPrefeituraRejection("Retorno do portal nacional: Falha ao comunicar com o sistema da prefeitura"), true);
  assert.equal(isAsaasPrefeituraRejection("Código: _NFe002\nDescrição: O Código de Serviço municipal deve ser informado"), true);
  assert.equal(isMissingMunicipalServiceCode("_NFe002 código de serviço municipal deve ser informado"), true);
});

test("nfseUpdatesFromAsaasObject: SYNCHRONIZED com rejeição vira ERROR", () => {
  const u = nfseUpdatesFromAsaasObject(
    { id: "inv_xyz", status: "SYNCHRONIZED", number: null, statusDescription: "The 'Discriminacao' element is invalid" },
    { nfse_status: "SYNCHRONIZED", nfse_number: "inv_xyz", nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_status, "ERROR");
  assert.match(String(u.nfse_error_message), /Discriminacao/);
});

test("nfseUpdatesFromAsaasObject: SYNCHRONIZED aguardando prefeitura não vira ERROR", () => {
  const u = nfseUpdatesFromAsaasObject(
    { id: "inv_xyz", status: "SYNCHRONIZED", number: null, statusDescription: "Aguardando processamento da prefeitura" },
    { nfse_status: "SYNCHRONIZED", nfse_number: "inv_xyz", nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_status, undefined);
  assert.equal(u.nfse_error_message, undefined);
});

test("invoiceUpdatesAreMaterial: ignora só updated_at", () => {
  assert.equal(invoiceUpdatesAreMaterial(
    { status: "PENDING", nfse_status: "SYNCHRONIZED" },
    { status: "PENDING", nfse_status: "SYNCHRONIZED", updated_at: "2026-09-09T16:00:00-03:00" },
  ), false);
  assert.equal(invoiceUpdatesAreMaterial(
    { status: "PENDING", nfse_number: "inv_1" },
    { status: "PENDING", nfse_number: "2562" },
  ), true);
  assert.equal(invoiceUpdatesAreMaterial(
    { net_value: "4254.30", status: "PENDING" },
    { net_value: 4254.3, status: "PENDING" },
  ), false);
});

test("unstickStaleNfReconcile: libera running após timeout", () => {
  const stale = { running: true, startedAt: new Date(Date.now() - NF_RECONCILE_STALE_MS - 1000).toISOString() };
  assert.equal(unstickStaleNfReconcile(stale, new Date()), true);
  assert.equal(stale.running, false);
  const fresh = { running: true, startedAt: new Date().toISOString() };
  assert.equal(unstickStaleNfReconcile(fresh, new Date()), false);
  assert.equal(fresh.running, true);
});

test("describeNfProcessingWait: explica AUTHORIZED sem número", () => {
  const msg = describeNfProcessingWait({
    nfse_status: "AUTHORIZED",
    nfse_number: null,
    created_at: "2026-08-26T13:38:39.000-03:00",
    updated_at: "2026-08-26T19:00:40.000-03:00",
  }, new Date("2026-08-27T12:17:00-03:00"));
  assert.ok(msg && /AUTHORIZED/.test(msg) && /Asaas/.test(msg));
  assert.equal(describeNfProcessingWait({ nfse_status: "AUTHORIZED", nfse_number: "2562" }), null);
  const withRps = describeNfProcessingWait({
    nfse_status: "SYNCHRONIZED",
    nfse_number: null,
    created_at: "2026-09-09T12:00:00-03:00",
    updated_at: "2026-09-09T12:00:00-03:00",
  }, new Date("2026-09-09T13:00:00-03:00"), null, 296);
  assert.ok(withRps && /RPS 296/.test(withRps));
});

test("shouldMarkMissingNfAsError: só cobrança em aberto e stale, não fatura paga antiga", () => {
  const staleCreated = new Date(Date.now() - (NF_PROCESSING_STALE_HOURS + 1) * 3600_000).toISOString();
  assert.equal(shouldMarkMissingNfAsError({
    status: "PENDING",
    nfse_status: "AUTHORIZED",
    nfse_number: null,
    created_at: staleCreated,
  }), true);
  assert.equal(shouldMarkMissingNfAsError({
    status: "RECEIVED",
    nfse_status: "AUTHORIZED",
    nfse_number: null,
    created_at: staleCreated,
  }), false);
  assert.equal(shouldMarkMissingNfAsError({
    status: "PENDING",
    nfse_status: "AUTHORIZED",
    nfse_number: "2562",
    created_at: staleCreated,
  }), false);
});

test("canReemitNfse: AUTHORIZED sem nº municipal NÃO bloqueia como já emitida", () => {
  const blocked = canReemitNfse({ nfse_status: "AUTHORIZED", nfse_number: "2562" });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /duplicidade/);

  const waiting = canReemitNfse({ nfse_status: "AUTHORIZED", nfse_number: null });
  assert.equal(waiting.allowed, false);
  assert.match(waiting.reason, /Sincronizar/);

  const erro = canReemitNfse({ nfse_status: "ERRO", nfse_number: null, nfse_error_message: "tomador" });
  assert.equal(erro.allowed, true);

  const authorizedGhost = canReemitNfse({
    nfse_status: "AUTHORIZED",
    nfse_number: null,
    nfse_error_message: "NFS-e não encontrada no Asaas",
  });
  assert.equal(authorizedGhost.allowed, true);

  const hidden171 = canReemitNfse({
    nfse_status: "ERROR",
    nfse_number: "inv_000022684480",
    nfse_error_message: LEGACY_DISCRIMINACAO_STUCK_MSG,
  });
  assert.equal(hidden171.allowed, true);
});

test("pickPreferredAsaasNf: prefere emitida, depois processando", () => {
  const picked = pickPreferredAsaasNf([
    { id: "inv_c", status: "CANCELED" },
    { id: "inv_p", status: "SCHEDULED" },
    { id: "inv_ok", status: "AUTHORIZED", number: "99" },
  ]);
  assert.equal(picked.id, "inv_ok");
  const processing = pickPreferredAsaasNf([
    { id: "inv_c", status: "CANCELED" },
    { id: "inv_p", status: "PROCESSING" },
  ]);
  assert.equal(processing.id, "inv_p");
  assert.equal(pickPreferredAsaasNf([]), null);
});

test("shouldNudgeNfseAuthorize: falha de comunicação ou código municipal na mesma inv_*", () => {
  assert.equal(shouldNudgeNfseAuthorize("ERROR", null), false);
  assert.equal(shouldNudgeNfseAuthorize("SCHEDULED", "inv_x"), false);
  assert.equal(shouldNudgeNfseAuthorize("AUTHORIZED", null), false);
  assert.equal(shouldNudgeNfseAuthorize("ERROR", "inv_x"), false);
  assert.equal(
    shouldNudgeNfseAuthorize(
      "ERROR",
      "inv_000022722108",
      "Retorno da prefeitura de São Paulo-SP: Falha ao comunicar com o sistema da prefeitura",
    ),
    true,
  );
  assert.equal(
    shouldNudgeNfseAuthorize(
      "SYNCHRONIZED",
      "inv_000022722111",
      "Retorno do portal nacional: Falha ao comunicar com o sistema da prefeitura",
    ),
    true,
  );
  assert.equal(
    shouldNudgeNfseAuthorize(
      "ERROR",
      "inv_000022684480",
      "Código: _NFe002 — O Código de Serviço municipal deve ser informado",
    ),
    true,
  );
});

test("fiscalAddressMissingFields: CEP 8 dígitos + logradouro, número, cidade, UF", () => {
  assert.deepEqual(
    fiscalAddressMissingFields({
      address: "Rua A",
      address_number: "10",
      city: "São Paulo",
      state: "SP",
      zip: "01310-100",
    }),
    [],
  );
  assert.ok(fiscalAddressMissingFields({ address: "Rua A", city: "São Paulo", state: "SP", zip: "01310100" }).includes("número"));
  assert.ok(fiscalAddressMissingFields({ address: "Rua A", address_number: "10", city: "SP", state: "S", zip: "01310100" }).includes("UF"));
  assert.ok(fiscalAddressMissingFields({ address: "Rua A", address_number: "10", city: "São Paulo", state: "SP", zip: "01310" }).includes("CEP (8 dígitos)"));
  assert.equal(assertFiscalAddressForNf({ address: "Rua A" }, false), null);
  assert.match(String(assertFiscalAddressForNf({ address: "Rua A" }, true)), /Falta:/);
});

test("shouldAutoEmitMissingNfse: worker cria NFS-e se a cobrança existe e o Asaas ainda não tem nota", () => {
  const old = new Date(Date.now() - 30 * 60_000).toISOString();
  const fresh = new Date(Date.now() - 2 * 60_000).toISOString();
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", created_at: old }, { paymentLookupEmpty: true, emiteNf: true }), true);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", created_at: old }, { paymentLookupEmpty: false, emiteNf: true }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", created_at: old }, { paymentLookupEmpty: true, emiteNf: false }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", created_at: fresh }, { paymentLookupEmpty: true, emiteNf: true }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "CANCELLED", created_at: old }, { paymentLookupEmpty: true, emiteNf: true }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", nfse_status: "AUTHORIZED", nfse_number: "309", created_at: old }, { paymentLookupEmpty: true, emiteNf: true }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", nfse_number: "inv_abc", created_at: old }, { paymentLookupEmpty: true, emiteNf: true }), false);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", nfse_status: "PROCESSING", created_at: old }, { paymentLookupEmpty: true, emiteNf: true }), true);
  assert.equal(shouldAutoEmitMissingNfse({ status: "PENDING", nfse_status: "PROCESSING", created_at: fresh }, { paymentLookupEmpty: true, emiteNf: true }), true);
});

test("isOpenNfFollowUpStatus: acompanha processando/erro em aberto", () => {
  assert.equal(isOpenNfFollowUpStatus({ status: "PENDING", nfse_status: "ERROR", nfse_number: null }), true);
  assert.equal(isOpenNfFollowUpStatus({ status: "PENDING", nfse_status: "AUTHORIZED", nfse_number: "99" }), false);
  assert.equal(isOpenNfFollowUpStatus({ status: "CANCELED", nfse_status: "ERROR" }), false);
});

test("asaasCustomerEmailAllowed: só cobrança criada", () => {
  assert.equal(asaasCustomerEmailAllowed("PAYMENT_CREATED"), true);
  assert.equal(asaasCustomerEmailAllowed("PAYMENT_DUEDATE_WARNING"), false);
  assert.equal(asaasCustomerEmailAllowed("PAYMENT_OVERDUE"), false);
  assert.equal(asaasCustomerEmailAllowed("PAYMENT_UPDATED"), false);
});

test("política de e-mail Asaas: desliga lembrete/atraso; mantém só CREATED", () => {
  assert.equal(isAsaasNotificationPolicyCompliant({
    event: "PAYMENT_CREATED", enabled: true, emailEnabledForCustomer: true,
  }), true);
  assert.equal(isAsaasNotificationPolicyCompliant({
    event: "PAYMENT_DUEDATE_WARNING", enabled: true, emailEnabledForCustomer: true,
  }), false);
  assert.equal(isAsaasNotificationPolicyCompliant({
    event: "PAYMENT_OVERDUE", enabled: false, emailEnabledForCustomer: false,
  }), true);
  const patch = buildAsaasNotificationPolicyUpdate({ id: "not_1", event: "PAYMENT_DUEDATE_WARNING", scheduleOffset: 10 });
  assert.equal(patch.enabled, false);
  assert.equal(patch.emailEnabledForCustomer, false);
  const created = buildAsaasNotificationPolicyUpdate({ id: "not_2", event: "PAYMENT_CREATED" });
  assert.equal(created.enabled, true);
  assert.equal(created.emailEnabledForCustomer, true);
});

test("asaasDueDateIfDifferent: só devolve se o boleto Asaas divergir", () => {
  assert.equal(asaasDueDateIfDifferent("2026-09-01", "2026-09-18"), "2026-09-01");
  assert.equal(asaasDueDateIfDifferent("2026-09-18", "2026-09-18"), null);
  assert.equal(asaasDueDateIfDifferent(null, "2026-09-18"), null);
});

test("isManualInvoiceDueDate: marca de alteração de vencimento", () => {
  assert.equal(isManualInvoiceDueDate({ nfse_observations: "[Vencimento alterado por x: 2026-09-18 → 2026-09-01]" }), true);
  assert.equal(isManualInvoiceDueDate({ notes: "Aprovado por TAINA" }), false);
});

test("planDueDateReconcile: manual empurra Torres→Asaas; automático espelha boleto", () => {
  assert.deepEqual(planDueDateReconcile({ localDueDate: "2026-09-18", asaasDueDate: "2026-09-01", manual: true }), { action: "push", dueDate: "2026-09-18" });
  assert.deepEqual(planDueDateReconcile({ localDueDate: "2026-09-18", asaasDueDate: "2026-09-18", manual: true }), { action: "none" });
  assert.deepEqual(planDueDateReconcile({ localDueDate: "2026-09-18", asaasDueDate: "2026-09-01", manual: false }), { action: "pull", dueDate: "2026-09-01" });
  assert.deepEqual(planDueDateReconcile({ localDueDate: "2026-09-01", asaasDueDate: "2026-09-01", manual: false }), { action: "none" });
});

test("todayDateStr: data civil BRT, não UTC", () => {
  assert.match(todayDateStr(new Date("2026-09-15T02:30:00.000Z")), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayDateStr(new Date("2026-09-15T02:30:00.000Z")), "2026-09-14");
});

test("isQueuedAtPrefecture: PROCESSING local sem inv_* não é fila da prefeitura", () => {
  assert.equal(isLocalNfProcessingPlaceholder("PROCESSING", null), true);
  assert.equal(isQueuedAtPrefecture("PROCESSING", null), false);
  assert.equal(isQueuedAtPrefecture("PROCESSING", "inv_abc"), true);
  assert.equal(isQueuedAtPrefecture("SYNCHRONIZED", "inv_abc"), true);
  assert.equal(isQueuedAtPrefecture("AUTHORIZED", "309"), false);
});

test("nfseUpdatesFromAsaasObject: falha de comunicação do portal vira ERROR", () => {
  const u = nfseUpdatesFromAsaasObject(
    { id: "inv_omega", status: "SYNCHRONIZED", number: null, statusDescription: "Retorno do portal nacional: Falha ao comunicar com o sistema da prefeitura" },
    { nfse_status: "SYNCHRONIZED", nfse_number: "inv_omega", nfse_url: null, nfse_error_message: null },
  );
  assert.equal(u.nfse_status, "ERROR");
  assert.match(String(u.nfse_error_message), /Falha ao comunicar/);
});

