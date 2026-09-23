import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODIGO_SERVICO_MUNICIPAL_CODE,
  ISS_ALIQUOTA,
  TORRES_CNPJ,
  NF_INSS_ANEXO_IV_TEXTO,
  NF_SIMPLES_NACIONAL_TEXTO,
} from "./asaas-helpers";
import {
  FOCUS_CODIGO_MUNICIPIO_SP,
  FOCUS_ITEM_LISTA_SERVICO,
  FOCUS_PROVIDER,
  FOCUS_API_HOMOLOG_URL,
  FOCUS_API_PRODUCTION_URL,
  buildFocusNfsePayload,
  extractFocusErrorMessage,
  focusCancelJustification,
  focusMunicipalNumber,
  focusNfseConsultRef,
  focusNfseRef,
  ibgeMunicipioFromCityUf,
  isFocusConnectivityError,
  isFocusManagedInvoice,
  isFocusNfseRef,
  mapFocusStatusToTorres,
  nfseUpdatesFromFocusObject,
  resolveFocusApiBaseUrl,
  shouldEmitNfseViaFocus,
  focusPdfUrl,
  focusTomadorEmail,
  isLikelyPdfUrl,
  isPrefeituraNfseHtmlUrl,
} from "./focus-nfe-helpers";
import { isFinalNfNumber, isLocalNfProcessingPlaceholder, isQueuedAtPrefecture } from "../../shared/nfse-status";

const tomadorOk = {
  name: "Cliente Teste LTDA",
  cpfCnpj: "07504505000132",
  email: "fin@cliente.com",
  address: "Rua das Flores",
  addressNumber: "123",
  bairro: "Centro",
  city: "São Paulo",
  state: "SP",
  zip: "01310-100",
  inscricaoMunicipal: "1234567",
};

test("resolveFocusApiBaseUrl: produção no ar não cai em homologação por omissão", () => {
  assert.equal(resolveFocusApiBaseUrl("producao"), FOCUS_API_PRODUCTION_URL);
  assert.equal(resolveFocusApiBaseUrl("homologação"), FOCUS_API_HOMOLOG_URL);
  assert.equal(resolveFocusApiBaseUrl("homologação", { vercelEnv: "production" }), FOCUS_API_PRODUCTION_URL);
  assert.equal(resolveFocusApiBaseUrl("", { vercelEnv: "production" }), FOCUS_API_PRODUCTION_URL);
  assert.equal(resolveFocusApiBaseUrl("[SENSITIVE]", { vercelEnv: "production" }), FOCUS_API_PRODUCTION_URL);
  assert.equal(resolveFocusApiBaseUrl("", { nodeEnv: "development" }), FOCUS_API_HOMOLOG_URL);
  assert.equal(resolveFocusApiBaseUrl("producao", { nodeEnv: "development" }), FOCUS_API_PRODUCTION_URL);
  assert.equal(
    resolveFocusApiBaseUrl("", { vercelEnv: "preview", nodeEnv: "production" }),
    FOCUS_API_PRODUCTION_URL,
  );
  assert.equal(
    resolveFocusApiBaseUrl("homologação", { vercelEnv: "preview", nodeEnv: "production" }),
    FOCUS_API_HOMOLOG_URL,
  );
});

test("focusNfseRef e isFocusNfseRef", () => {
  assert.equal(focusNfseRef(44), "torres-inv-44");
  assert.equal(isFocusNfseRef("torres-inv-44"), true);
  assert.equal(isFocusNfseRef("inv_abc"), false);
  assert.equal(isFocusNfseRef("2562"), false);
  assert.throws(() => focusNfseRef(0));
});

test("focusNfseConsultRef: PROCESSING/ERROR usa torres-inv-{id} sem nfse_ref", () => {
  assert.equal(focusNfseConsultRef({ id: 192, nfse_status: "ERROR" }), "torres-inv-192");
  assert.equal(focusNfseConsultRef({ id: 191, nfse_status: "PROCESSING" }), "torres-inv-191");
  assert.equal(focusNfseConsultRef({ id: 191, nfse_ref: "torres-inv-191", nfse_status: "AUTHORIZED" }), "torres-inv-191");
  assert.equal(focusNfseConsultRef({ id: 10, nfse_status: "AUTHORIZED" }), "");
});

test("isFinalNfNumber ignora ref Focus como ignora inv_ Asaas", () => {
  assert.equal(isFinalNfNumber("torres-inv-44"), false);
  assert.equal(isFinalNfNumber("inv_abc"), false);
  assert.equal(isFinalNfNumber("2562"), true);
});

test("placeholder local vs fila Focus", () => {
  assert.equal(isLocalNfProcessingPlaceholder("PROCESSING", null), true);
  assert.equal(isLocalNfProcessingPlaceholder("PROCESSING", "torres-inv-9"), false);
  assert.equal(isQueuedAtPrefecture("PROCESSING", "torres-inv-9"), true);
  assert.equal(isQueuedAtPrefecture("AUTHORIZED", "309"), false);
});

test("shouldEmitNfseViaFocus: legado Asaas vivo não migra", () => {
  assert.equal(shouldEmitNfseViaFocus({ nfse_number: null }, false), true);
  assert.equal(shouldEmitNfseViaFocus({ nfse_number: "inv_abc" }, true), false);
  assert.equal(shouldEmitNfseViaFocus({ nfse_number: "inv_abc" }, false), true);
  assert.equal(shouldEmitNfseViaFocus({ nfse_provider: "focus", nfse_ref: "torres-inv-1" }, true), true);
  assert.equal(isFocusManagedInvoice({ nfse_ref: "torres-inv-12" }), true);
  assert.equal(isFocusManagedInvoice({ nfse_number: "inv_x" }), false);
});

test("mapFocusStatusToTorres", () => {
  assert.equal(mapFocusStatusToTorres("autorizado"), "AUTHORIZED");
  assert.equal(mapFocusStatusToTorres("autorizada"), "AUTHORIZED");
  assert.equal(mapFocusStatusToTorres("processando_autorizacao"), "PROCESSING");
  assert.equal(mapFocusStatusToTorres("erro_autorizacao"), "ERROR");
  assert.equal(mapFocusStatusToTorres("cancelado"), "CANCELLED");
  assert.equal(mapFocusStatusToTorres("AUTHORIZED"), "AUTHORIZED");
});

test("buildFocusNfsePayload: SP, 07870, ISS sem retenção, discriminacao escolta+legais", () => {
  const p = buildFocusNfsePayload({
    value: 1000,
    description: "Referente aos serviços de Escolta Armada - Período: 16/09/2026 a 30/09/2026 (Setembro/2026)",
    prestadorIm: "12345",
    tomador: tomadorOk,
    retemInss: true,
    inssAliquota: 11,
  });
  assert.equal(p.prestador.cnpj, TORRES_CNPJ);
  assert.equal(p.prestador.codigo_municipio, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.tomador.cnpj, "07504505000132");
  assert.equal(p.tomador.cpf, undefined);
  assert.equal(p.tomador.endereco.codigo_municipio, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.tomador.endereco.cep, "01310100");
  assert.equal(p.servico.item_lista_servico, FOCUS_ITEM_LISTA_SERVICO);
  assert.equal(p.servico.item_lista_servico, "07870");
  assert.equal(p.servico.codigo_tributario_municipio, CODIGO_SERVICO_MUNICIPAL_CODE);
  assert.match(p.servico.discriminacao, /Escolta Armada/);
  assert.match(p.servico.discriminacao, /16\/09\/2026/);
  assert.ok(p.servico.discriminacao.includes(NF_INSS_ANEXO_IV_TEXTO));
  assert.ok(p.servico.discriminacao.includes(NF_SIMPLES_NACIONAL_TEXTO));
  assert.equal(p.servico.iss_retido, false);
  assert.equal(p.servico.aliquota, ISS_ALIQUOTA);
  assert.equal(p.servico.valor_iss, 50);
  assert.equal("valor_iss_retido" in p.servico, false);
  assert.equal(p.servico.valor_inss, 110);
  assert.equal(p.optante_simples_nacional, true);
  assert.equal(p.natureza_operacao, "1");
  assert.equal(p.servico.codigo_municipio, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal("payment" in p, false);
});

test("buildFocusNfsePayload: tomador fora de SP não envia CCM paulistana", () => {
  const fora = buildFocusNfsePayload({
    value: 550,
    prestadorIm: "65831527",
    tomador: {
      ...tomadorOk,
      city: "Serra",
      state: "ES",
      zip: "29167032",
      codigoMunicipioIbge: "3205002",
      inscricaoMunicipal: "4372204",
    },
  });
  assert.equal(fora.tomador.inscricao_municipal, undefined);
  assert.equal(fora.tomador.endereco.codigo_municipio, "3205002");
  assert.equal(fora.natureza_operacao, "2");
  assert.equal(fora.servico.codigo_municipio, "3205002");
  const sp = buildFocusNfsePayload({
    value: 550,
    prestadorIm: "65831527",
    tomador: { ...tomadorOk, inscricaoMunicipal: "1234567" },
  });
  assert.equal(sp.tomador.inscricao_municipal, "1234567");
});

test("buildFocusNfsePayload: CPF no tomador e CCM só se ≤8 dígitos", () => {
  const p = buildFocusNfsePayload({
    value: 10,
    prestadorIm: "99",
    tomador: { ...tomadorOk, cpfCnpj: "390.533.447-05", inscricaoMunicipal: "188201912119" },
  });
  assert.equal(p.tomador.cpf, "39053344705");
  assert.equal(p.tomador.cnpj, undefined);
  assert.equal(p.tomador.inscricao_municipal, undefined);
});

test("buildFocusNfsePayload falha sem IM do prestador ou IBGE", () => {
  assert.throws(() => buildFocusNfsePayload({ value: 10, prestadorIm: "", tomador: tomadorOk }), /prestador/);
  assert.throws(
    () => buildFocusNfsePayload({
      value: 10,
      prestadorIm: "1",
      tomador: { ...tomadorOk, city: "Cidade Inexistente", state: "XX", codigoMunicipioIbge: null },
    }),
    /IBGE/,
  );
});

test("ibgeMunicipioFromCityUf", () => {
  assert.equal(ibgeMunicipioFromCityUf("São Paulo", "SP"), "3550308");
  assert.equal(ibgeMunicipioFromCityUf("campinas", "sp"), "3509502");
  assert.equal(ibgeMunicipioFromCityUf("Serra", "ES"), "3205002");
  assert.equal(ibgeMunicipioFromCityUf("Foo", "SP"), null);
});

test("focusTomadorEmail: um e-mail curto, nunca a lista inteira", () => {
  const lista = "igor@nimbusexpress.com.br; financeiro@nimbusexpress.com.br; financeiro2@nimbusexpress.com.br; mota@torresseguranca.com.br";
  assert.equal(focusTomadorEmail(lista), "igor@nimbusexpress.com.br");
  assert.ok(String(focusTomadorEmail(lista)).length <= 75);
  const p = buildFocusNfsePayload({
    value: 550,
    prestadorIm: "65831527",
    tomador: { ...tomadorOk, email: lista, city: "Serra", state: "ES", codigoMunicipioIbge: "3205002" },
  });
  assert.equal(p.tomador.email, "igor@nimbusexpress.com.br");
  assert.ok(String(p.tomador.email).length <= 75);
});

test("nfseUpdatesFromFocusObject: autorizada prefere DANFSe PDF à página HTML da prefeitura", () => {
  const u = nfseUpdatesFromFocusObject(
    {
      status: "autorizado",
      numero: "325",
      codigo_verificacao: "ABCD",
      url: "https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx?nf=325",
      url_danfse: "https://focusnfe.s3.sa-east-1.amazonaws.com/arquivos/x/DANFSEs/nf.pdf",
      caminho_xml_nota_fiscal: "notas/xml.xml",
      ref: "torres-inv-7",
    },
    { nfse_status: "PROCESSING", nfse_number: "torres-inv-7", nfse_error_message: "x" },
    "torres-inv-7",
  );
  assert.equal(u.nfse_status, "AUTHORIZED");
  assert.equal(u.nfse_number, "325");
  assert.match(String(u.nfse_url), /DANFSEs\/nf\.pdf/);
  assert.equal(u.nfse_codigo_verificacao, "ABCD");
  assert.equal(u.nfse_xml_path, "notas/xml.xml");
  assert.equal(u.nfse_provider, FOCUS_PROVIDER);
  assert.equal(u.nfse_error_message, null);
});

test("nfseUpdatesFromFocusObject: erro preserva mensagem da Focus", () => {
  const u = nfseUpdatesFromFocusObject(
    { status: "erro_autorizacao", erros: [{ mensagem: "CCM inválido" }] },
    { nfse_status: "PROCESSING", nfse_number: "torres-inv-1" },
    "torres-inv-1",
  );
  assert.equal(u.nfse_status, "ERROR");
  assert.match(String(u.nfse_error_message), /CCM inválido/);
});

test("extractFocusErrorMessage e justificativa de cancelamento", () => {
  assert.equal(extractFocusErrorMessage({ mensagem: "falhou" }), "falhou");
  assert.ok(focusCancelJustification("x").length >= 15);
  assert.equal(focusMunicipalNumber({ numero: "torres-inv-1" }), null);
  assert.equal(focusMunicipalNumber({ numero: "400" }), "400");
});

test("isFocusConnectivityError: token/homolog não é recusa da prefeitura", () => {
  assert.equal(isFocusConnectivityError("Access token inválido (host: homologacao.focusnfe.com.br)"), true);
  assert.equal(isFocusConnectivityError("Timeout ao chamar a Focus NFe"), true);
  assert.equal(isFocusConnectivityError("EmailTomador maxLength 75"), false);
});

test("focusPdfUrl prefere DANFSe e ignora HTML da prefeitura", () => {
  assert.equal(isPrefeituraNfseHtmlUrl("https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx?nf=325"), true);
  assert.equal(isLikelyPdfUrl("https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx?nf=325"), false);
  assert.equal(isLikelyPdfUrl("https://focusnfe.s3.sa-east-1.amazonaws.com/arquivos/x/DANFSEs/nf.pdf"), true);
  const url = focusPdfUrl({
    url: "https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx?nf=325",
    url_danfse: "https://focusnfe.s3.sa-east-1.amazonaws.com/arquivos/x/DANFSEs/nf.pdf",
  });
  assert.match(String(url), /DANFSEs\/nf\.pdf/);
  assert.equal(focusPdfUrl({
    url: "https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx?nf=325",
  }), null);
});

