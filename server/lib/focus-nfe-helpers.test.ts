import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ISS_ALIQUOTA,
  ISS_RETAIN,
  TORRES_CNPJ,
} from "./asaas-helpers";
import {
  FOCUS_CODIGO_MUNICIPIO_SP,
  FOCUS_OPCAO_SIMPLES_ME_EPP,
  FOCUS_OPCAO_SIMPLES_NAO_OPTANTE,
  FOCUS_REGIME_ESPECIAL_NENHUM,
  FOCUS_PROVIDER,
  FOCUS_TIPO_RETENCAO_ISS_NAO_RETIDO,
  FOCUS_TRIBUTACAO_ISS_TRIBUTAVEL,
  FOCUS_API_HOMOLOG_URL,
  FOCUS_API_PRODUCTION_URL,
  FOCUS_SERVICO_FISCAL,
  buildDefaultNfseDescription,
  buildFocusNfsePayload,
  resolveFocusServicoCategoria,
  sanitizeNfseDescription,
  swapNfseCategoryPrefix,
  sanitizeComplement,
  extractFocusErrorMessage,
  focusCancelJustification,
  focusMunicipalNumber,
  focusDpsTimestamps,
  focusNfseConsultRef,
  focusNfseMunicipalResourcePath,
  focusNfseRef,
  focusNfsenEmitPath,
  focusNfsenResourcePath,
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

test("rotas Focus da NFS-e nacional", () => {
  assert.equal(focusNfsenEmitPath("torres-inv-9"), "/nfsen?ref=torres-inv-9");
  assert.equal(focusNfsenResourcePath("torres-inv-9"), "/nfsen/torres-inv-9");
  assert.equal(focusNfseMunicipalResourcePath("torres-inv-9"), "/nfse/torres-inv-9");
  assert.equal(focusNfsenEmitPath("a b"), "/nfsen?ref=a%20b");
});

test("competência da DPS fica no horário de Brasília", () => {
  const night = focusDpsTimestamps("2026-11-04T02:30:00.000Z");
  assert.equal(night.data_competencia, "2026-11-03");
  assert.equal(night.data_emissao, "2026-11-03T23:30:00-03:00");
});

test("vigilância e escolta levam a trinca fiscal e a alíquota do Simples", () => {
  const vigilancia = buildFocusNfsePayload({
    value: 2000,
    description: "Posto de vigilância patrimonial",
    prestadorIm: "12345",
    tomador: tomadorOk,
    categoria: "vigilancia",
    valorInssRetido: 220,
    aliquotaSimples: 2.55,
    codigoMunicipioPrestacao: "3509502",
  });
  assert.equal(vigilancia.codigo_tributacao_nacional_iss, "110201");
  assert.equal(vigilancia.codigo_nbs, "118025000");
  assert.equal(vigilancia.codigo_tributacao_municipal_iss, "07870");
  assert.equal(vigilancia.valor_cp, 220);
  assert.equal(vigilancia.percentual_aliquota_relativa_municipio, 2.55);
  assert.equal(vigilancia.tipo_retencao_iss, 1);
  assert.equal(vigilancia.codigo_municipio_prestacao, "3509502");

  const escolta = buildFocusNfsePayload({
    value: 800,
    description: "Serviço genérico",
    prestadorIm: "12345",
    tomador: { ...tomadorOk, city: "Serra", state: "ES", codigoMunicipioIbge: "3205002" },
    serviceOrderTypes: ["escolta"],
  });
  assert.equal(escolta.codigo_tributacao_nacional_iss, "110301");
  assert.equal(escolta.codigo_nbs, "118023000");
  assert.equal(escolta.codigo_tributacao_municipal_iss, "07897");
  assert.equal("valor_cp" in escolta, false);
  assert.equal(escolta.percentual_aliquota_relativa_municipio, ISS_ALIQUOTA);
  assert.equal(escolta.codigo_municipio_prestacao, "3205002");
  assert.equal(escolta.codigo_municipio_emissora, FOCUS_CODIGO_MUNICIPIO_SP);

  assert.equal(resolveFocusServicoCategoria({
    description: "Torres Vigilância Patrimonial — Escolta Armada",
  }).categoria, "escolta");
  assert.equal(resolveFocusServicoCategoria({
    description: "Vigilância patrimonial em posto físico",
  }).categoria, "vigilancia");
  assert.equal(resolveFocusServicoCategoria({
    serviceOrderTypes: ["escolta", "vigilancia"],
  }).conflito, true);
  assert.throws(
    () => buildFocusNfsePayload({
      value: 10,
      prestadorIm: "1",
      tomador: tomadorOk,
      serviceOrderTypes: ["escolta", "vigilancia"],
    }),
    /mistura/,
  );
});

test("não optante do Simples manda código 1 e regime nenhum", () => {
  const p = buildFocusNfsePayload({
    value: 10,
    prestadorIm: "1",
    optanteSimplesNacional: false,
    retemInss: false,
    tomador: tomadorOk,
  });
  assert.equal(p.codigo_opcao_simples_nacional, FOCUS_OPCAO_SIMPLES_NAO_OPTANTE);
  assert.equal(p.regime_especial_tributacao, FOCUS_REGIME_ESPECIAL_NENHUM);
  assert.equal("percentual_aliquota_relativa_municipio" in p, false);
  assert.equal("valor_cp" in p, false);
});

test("mapFocusStatusToTorres", () => {
  assert.equal(mapFocusStatusToTorres("autorizado"), "AUTHORIZED");
  assert.equal(mapFocusStatusToTorres("autorizada"), "AUTHORIZED");
  assert.equal(mapFocusStatusToTorres("processando_autorizacao"), "PROCESSING");
  assert.equal(mapFocusStatusToTorres("erro_autorizacao"), "ERROR");
  assert.equal(mapFocusStatusToTorres("cancelado"), "CANCELLED");
  assert.equal(mapFocusStatusToTorres("AUTHORIZED"), "AUTHORIZED");
});

test("buildFocusNfsePayload: DPS nacional, escolta 110301, ISS sem retenção, descrição Ref. com período", () => {
  const p = buildFocusNfsePayload({
    value: 1000,
    description: "Referente aos serviços de Escolta Armada - Período: 16/09/2026 a 30/09/2026 (Setembro/2026)",
    prestadorIm: "12345",
    dataEmissaoIso: "2026-11-03T15:00:00.000Z",
    tomador: tomadorOk,
    valorInssRetido: 0,
  });
  assert.equal(p.cnpj_prestador, TORRES_CNPJ);
  assert.equal(p.codigo_municipio_emissora, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.codigo_municipio_prestador, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.inscricao_municipal_prestador, "12345");
  assert.equal(p.cnpj_tomador, "07504505000132");
  assert.equal(p.cpf_tomador, undefined);
  assert.equal(p.codigo_municipio_tomador, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.cep_tomador, "01310100");
  assert.equal(p.codigo_tributacao_nacional_iss, FOCUS_SERVICO_FISCAL.escolta.codigo_tributacao_nacional_iss);
  assert.equal(p.codigo_nbs, "118023000");
  assert.equal(p.codigo_tributacao_municipal_iss, "07897");
  assert.equal(p.percentual_aliquota_relativa_municipio, ISS_ALIQUOTA);
  assert.equal("item_lista_servico" in p, false);
  assert.equal("prestador" in p, false);
  assert.equal("servico" in p, false);
  assert.equal(p.descricao_servico, "Ref. escolta armada (16/09/2026 a 30/09/2026)");
  assert.equal(p.tipo_retencao_iss, ISS_RETAIN ? 2 : FOCUS_TIPO_RETENCAO_ISS_NAO_RETIDO);
  assert.equal(p.tributacao_iss, FOCUS_TRIBUTACAO_ISS_TRIBUTAVEL);
  assert.equal(p.valor_servico, 1000);
  assert.equal("valor_iss" in p, false);
  assert.equal("valor_cp" in p, false);
  assert.equal(p.codigo_opcao_simples_nacional, FOCUS_OPCAO_SIMPLES_ME_EPP);
  assert.equal(p.regime_especial_tributacao, FOCUS_REGIME_ESPECIAL_NENHUM);
  assert.equal(p.codigo_municipio_prestacao, FOCUS_CODIGO_MUNICIPIO_SP);
  assert.equal(p.data_emissao, "2026-11-03T12:00:00-03:00");
  assert.equal(p.data_competencia, "2026-11-03");
  assert.equal("payment" in p, false);
});

test("buildFocusNfsePayload: discriminação MULTILOG leva OS e SM sem alterar o tomador", () => {
  const p = buildFocusNfsePayload({
    value: 3930.58,
    description: [
      "Referente aos serviços de Escolta Armada - Período: 16/09/2026 a 30/09/2026 (Setembro/2026)",
      "OS. 1312",
      "SM. 41128477",
    ].join("\n"),
    prestadorIm: "12345",
    tomador: tomadorOk,
    retemInss: true,
    inssAliquota: 11,
  });
  assert.match(p.descricao_servico, /OS: 1312/);
  assert.match(p.descricao_servico, /SM: 41128477/);
  assert.equal(p.cnpj_tomador, "07504505000132");
});

test("buildDefaultNfseDescription preserva período, OS e controle do cliente", () => {
  const text = buildDefaultNfseDescription({
    category: "escolta",
    description: "Referente aos serviços de Escolta Armada - Período: 01/10/2026 a 31/10/2026 (Outubro/2026)\nControle Cliente: 99812",
    notes: "Pedido de Compra / PO: 555",
    osNumbers: ["1234", "1235"],
    controles: ["ABC"],
  });
  assert.equal(
    text,
    "Ref. escolta armada (01/10/2026 a 31/10/2026) - OS: 1234, 1235 - Controle: ABC, 99812 - PO: 555",
  );
  const posto = buildDefaultNfseDescription({
    category: "vigilancia",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
  });
  assert.equal(posto, "Ref. vigilância (01/10/2026 a 31/10/2026)");
  const mes = buildDefaultNfseDescription({ category: "escolta", dueDate: "2026-10-15" });
  assert.equal(mes, "Ref. escolta armada (10/2026)");
  const escolta = "Ref. escolta armada (01/10/2026 a 31/10/2026)";
  const vigilancia = "Ref. vigilância (01/10/2026 a 31/10/2026)";
  const comOs = `${escolta} - OS: 1234`;
  assert.equal(swapNfseCategoryPrefix(comOs, escolta, vigilancia, false), `${vigilancia} - OS: 1234`);
  assert.equal(swapNfseCategoryPrefix(`${escolta} editado à mão`, escolta, vigilancia, true), `${escolta} editado à mão`);
});

test("buildFocusNfsePayload aceita categoria e descrição revistas no modal", () => {
  const p = buildFocusNfsePayload({
    value: 100,
    description: "Referente aos serviços de Escolta Armada - Período: 01/10/2026 a 31/10/2026",
    prestadorIm: "12345",
    tomador: tomadorOk,
    serviceOrderTypes: ["escolta", "vigilancia"],
    categoria: "vigilancia",
    descricaoServico: "Ref. vigilância (10/2026) - OS: 9 <tag> & controle",
  });
  assert.equal(p.codigo_tributacao_nacional_iss, "110201");
  assert.equal(p.codigo_nbs, "118025000");
  assert.equal(p.codigo_tributacao_municipal_iss, "07870");
  assert.equal(p.descricao_servico, "Ref. vigilância (10/2026) - OS: 9 tag controle");
});

test("sanitizeNfseDescription corta em 2000 e recusa texto curto", () => {
  const out = sanitizeNfseDescription(`${"A".repeat(2100)}<>&\u0001`);
  assert.equal(out.length, 2000);
  assert.equal(out, "A".repeat(2000));
  assert.equal(out.includes("<"), false);
  assert.equal(out.includes("&"), false);
  assert.throws(() => sanitizeNfseDescription("curto <>"), /10 caracteres/);
  assert.equal(sanitizeNfseDescription("Ref. escolta   armada\u0007 (10/2026)"), "Ref. escolta armada (10/2026)");
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
  assert.equal(fora.inscricao_municipal_tomador, undefined);
  assert.equal(fora.codigo_municipio_tomador, "3205002");
  assert.equal(fora.codigo_municipio_prestacao, "3205002");
  assert.equal(fora.codigo_municipio_emissora, FOCUS_CODIGO_MUNICIPIO_SP);
  const sp = buildFocusNfsePayload({
    value: 550,
    prestadorIm: "65831527",
    tomador: { ...tomadorOk, inscricaoMunicipal: "1234567" },
  });
  assert.equal(sp.inscricao_municipal_tomador, "1234567");
});

test("buildFocusNfsePayload: CPF no tomador e CCM só se ≤8 dígitos", () => {
  const p = buildFocusNfsePayload({
    value: 10,
    prestadorIm: "99",
    tomador: { ...tomadorOk, cpfCnpj: "390.533.447-05", inscricaoMunicipal: "188201912119" },
  });
  assert.equal(p.cpf_tomador, "39053344705");
  assert.equal(p.cnpj_tomador, undefined);
  assert.equal(p.inscricao_municipal_tomador, undefined);
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
  assert.equal(p.email_tomador, "igor@nimbusexpress.com.br");
  assert.ok(String(p.email_tomador).length <= 75);
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

test("sanitizeComplement corta no último espaço antes de 30", () => {
  assert.equal(
    sanitizeComplement("COND PROLOGIS CCP PARK IIQUADRAAREA REMANESCENTE BLOCO PREDIO 100"),
    "COND PROLOGIS CCP PARK",
  );
  assert.equal(sanitizeComplement("SALA 2"), "SALA 2");
  assert.equal(sanitizeComplement("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"), "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234");
  assert.equal(sanitizeComplement("   "), undefined);
});

test("buildFocusNfsePayload: complemento da nota tem no máximo 30", () => {
  const p = buildFocusNfsePayload({
    value: 1000,
    description: "Referente aos serviços de Escolta Armada",
    prestadorIm: "12345",
    tomador: {
      ...tomadorOk,
      complement: "COND PROLOGIS CCP PARK IIQUADRAAREA REMANESCENTE BLOCO PREDIO 100",
    },
  });
  assert.equal(p.complemento_tomador, "COND PROLOGIS CCP PARK");
  assert.ok(p.complemento_tomador.length <= 30);
});

