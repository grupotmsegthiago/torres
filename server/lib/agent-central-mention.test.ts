import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSummaryRequest, looksLikeFinalKm, looksLikeUpdateRequest, sanitizeFinanceiro, shortLocal, claimAckSlot, isBotMentioned, phoneSuffix8, isTeamSuffixMatch, planAckFlush, setBotLidForTest } from "./agent-central-mention.ts";
import { isFinalKmUpdate } from "../cron-whatsapp-forward.ts";

test("isFinalKmUpdate: reconhece a legenda de foto KM Final (card resumido)", () => {
  for (const m of ["📷 Foto: KM Final — KM 7.239", "Foto: km final", "📷 FOTO: KM FINAL — KM 1.234"]) {
    assert.equal(isFinalKmUpdate(m), true, `deveria reconhecer: ${m}`);
  }
});

test("isFinalKmUpdate: não confunde com outras fotos nem texto livre", () => {
  for (const m of [
    "📷 Foto: KM Saída — KM 6.887",
    "📷 Foto: KM Chegada — KM 6.887",
    "📷 Foto: Local de Destino",
    "Missão segue padrão, sem novidades",
    "km finalizado, voltando pra base",
    "sem km final ainda",
    "foto do km final no destino",
    "", null, undefined,
  ]) {
    assert.equal(isFinalKmUpdate(m as any), false, `não deveria reconhecer: ${JSON.stringify(m)}`);
  }
});

test("looksLikeFinalKm: reconhece pedido de km final no grupo", () => {
  for (const t of ["km final", "KM FINAL", "Foto do km final", "foto: km final", "manda o km final da OS"]) {
    assert.equal(looksLikeFinalKm(t), true, `deveria reconhecer: ${t}`);
  }
});

test("looksLikeFinalKm: não confunde com texto livre nem negações", () => {
  for (const t of [
    "km finalizado, voltando pra base", "qual o km?", "resumo", "bom dia", "", null,
    "sem km final ainda", "ainda não veio o km final", "não tem km final",
  ]) {
    assert.equal(looksLikeFinalKm(t as any), false, `não deveria reconhecer: ${JSON.stringify(t)}`);
  }
});

test("looksLikeSummaryRequest: reconhece pedidos de resumo", () => {
  for (const t of ["resumo", "Resumo do dia", "manda o resumão", "panorama", "como estão as viagens", "status geral"]) {
    assert.equal(looksLikeSummaryRequest(t), true, `deveria reconhecer: ${t}`);
  }
});

test("looksLikeSummaryRequest: ignora conversa fiada e pedidos de OS específica", () => {
  for (const t of ["bom dia", "ok obrigado", "cadê a OS 236", "alguma previsão?", "", "ab"]) {
    assert.equal(looksLikeSummaryRequest(t), false, `não deveria reconhecer: ${JSON.stringify(t)}`);
  }
});

test("conversa social cai FORA dos 3 fluxos operacionais (→ ignorada sem menção)", () => {
  // Mensagens sociais não devem casar com resumo, km final NEM pedido de
  // atualização. Sem casar em nenhum fluxo e SEM menção à Central, o handler
  // ignora (silêncio). Só responderia se marcassem o bot. (hasQuoted=false.)
  for (const t of [
    "bom dia, tudo bem?",
    "muito obrigado pelo trabalho de vocês!",
    "vocês são ótimos, parabéns pela equipe",
    "boa tarde",
    "valeu demais 🙏",
  ]) {
    assert.equal(looksLikeSummaryRequest(t), false, `resumo não deveria casar: ${t}`);
    assert.equal(looksLikeFinalKm(t), false, `km final não deveria casar: ${t}`);
    assert.equal(looksLikeUpdateRequest(t, false), false, `update não deveria casar: ${t}`);
  }
});

test("sanitizeFinanceiro: bloqueia vazamento de valor/cobrança e desvia pro financeiro", () => {
  for (const m of [
    "Olá! A escolta de amanhã fica R$ 1.200, pode confirmar?",
    "São 800 reais pela diária.",
    "Te mando o boleto agora.",
    "Pode pagar via pix.",
    "Segue o orçamento da operação.",
    "Sua fatura vence sexta.",
    "A cobrança será feita amanhã.",
    "O preço do serviço é fechado.",
  ]) {
    const out = sanitizeFinanceiro(m);
    assert.notEqual(out, m, `deveria trocar a mensagem financeira: ${m}`);
    assert.match(out, /financeiro/i, `desvio deveria citar o financeiro: ${m}`);
  }
});

test("sanitizeFinanceiro: NÃO mexe em conversa social/operacional legítima", () => {
  for (const m of [
    "Bom dia, João! Tudo tranquilo por aí?",
    "Conto com você pra atualizar a missão.",
    "Vou verificar essa informação e já te retorno.",
    "Sim, atendemos inclusive nos fins de semana!",
    "Ficamos felizes em ouvir isso, obrigado pela confiança.",
  ]) {
    assert.equal(sanitizeFinanceiro(m), m, `não deveria alterar: ${m}`);
  }
});

test("claimAckSlot: 2 pedidos seguidos no MESMO grupo → só 1 ack (anti-robô)", () => {
  // Cenário real (Thiago): "Atualização tor-0259" e "Atualização Edvandro e
  // Vitor" segundos depois. São OSs diferentes, então o dedupe por-OS não pega;
  // o cooldown por-grupo precisa segurar a 2ª confirmação visível.
  const grupo = "1203630xxxx@g.us";
  const t0 = 1_000_000_000_000;
  assert.equal(claimAckSlot(grupo, t0), true, "1º pedido deve mandar ack");
  assert.equal(claimAckSlot(grupo, t0 + 5_000), false, "2º pedido 5s depois NÃO manda ack");
  assert.equal(claimAckSlot(grupo, t0 + 60_000), false, "ainda dentro da janela (60s) → sem ack");
  assert.equal(claimAckSlot(grupo, t0 + 90_001), true, "passou a janela (90s) → ack de novo");
});

test("claimAckSlot: grupos diferentes não interferem entre si", () => {
  const t0 = 2_000_000_000_000;
  assert.equal(claimAckSlot("grupoA@g.us", t0), true);
  assert.equal(claimAckSlot("grupoB@g.us", t0 + 1_000), true, "grupo B é independente do A");
});

test("shortLocal: encurta endereços para Cidade/UF", () => {
  assert.equal(
    shortLocal("DHL MEDICAMENTO - Avenida Júlia Gaioli - Água Chata, Guarulhos - SP, Brasil"),
    "Guarulhos/SP",
  );
  assert.equal(shortLocal("Jaboatão dos Guararapes, PE, Brasil"), "Jaboatão dos Guararapes/PE");
  assert.equal(shortLocal("Cajamar, SP, Brasil"), "Cajamar/SP");
  assert.equal(shortLocal("Pirapora do Bom Jesus - SP, Brasil"), "Pirapora do Bom Jesus/SP");
});

test("shortLocal: lida com vazio/nulo", () => {
  assert.equal(shortLocal(null), "");
  assert.equal(shortLocal(undefined), "");
  assert.equal(shortLocal(""), "");
});

// O número da Central (instância Z-API) vem no payload como `ni`/`connectedPhone`.
const BOT = "5511926839456";

test("isBotMentioned: detecta @menção ao número da Central no texto", () => {
  // @<numero> é como o WhatsApp embute a menção no corpo da mensagem.
  assert.equal(isBotMentioned({ ni: BOT, text: { message: `@${BOT} bom dia, tudo certo?` } }), true);
  // tolera DDI/DDD: menção sem o "55" ainda casa pelos últimos 8 dígitos
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "oi @11926839456 manda ver" } }), true);
  // legenda de imagem também conta
  assert.equal(isBotMentioned({ ni: BOT, image: { caption: `@${BOT} olha essa foto` } }), true);
});

test("isBotMentioned: detecta menção via lista `mentioned` da Z-API", () => {
  assert.equal(isBotMentioned({ ni: BOT, mentioned: [BOT], text: { message: "alguém aí?" } }), true);
  assert.equal(isBotMentioned({ ni: BOT, mentioned: ["5511999999999"], text: { message: "oi" } }), false);
});

test("isBotMentioned: NÃO acusa menção em conversa social ou pedido de OS sem @", () => {
  // payloads REAIS dos logs de produção (grupo, sem marcar o bot)
  assert.equal(isBotMentioned({ ni: BOT, isGroup: true, text: { message: "Hoop" } }), false);
  assert.equal(isBotMentioned({ ni: BOT, isGroup: true, text: { message: "Atualização Andre e Carlos" } }), false);
  // marcação de OUTRA pessoa não conta como menção ao bot
  assert.equal(isBotMentioned({ ni: BOT, text: { message: "@5511954563755 cadê você?" } }), false);
  // sem número do bot no payload → não dá pra afirmar menção
  assert.equal(isBotMentioned({ text: { message: `@${BOT} oi` } }), false);
  assert.equal(isBotMentioned(null), false);
});

test("regra do dono: social sem menção → IGNORA; OS ou menção → responde", () => {
  // (a) social, sem menção, fora de OS → nenhum fluxo casa E não é menção = silêncio
  const social = "bom dia, tudo bem?";
  assert.equal(looksLikeSummaryRequest(social), false);
  assert.equal(looksLikeFinalKm(social), false);
  assert.equal(looksLikeUpdateRequest(social, false), false);
  assert.equal(isBotMentioned({ ni: BOT, text: { message: social } }), false);
  // (b) assunto de OS → responde (pega no pré-filtro de update)
  assert.equal(looksLikeUpdateRequest("Atualização Andre e Carlos", false), true);
  // (c) marcaram o bot numa conversa social → responde (natural)
  assert.equal(isBotMentioned({ ni: BOT, text: { message: `@${BOT} obrigado pelo apoio!` } }), true);
});

// ===========================================================================
// ACK DEFERIDO — "esperar a equipe antes de responder no grupo"
// ===========================================================================

test("phoneSuffix8: extrai os 8 últimos dígitos do telefone normalizado", () => {
  assert.equal(phoneSuffix8("5511916893018"), "16893018");
  assert.equal(phoneSuffix8("(11) 91689-3018"), "16893018");
  assert.equal(phoneSuffix8(null), "");
  assert.equal(phoneSuffix8("123"), ""); // < 8 dígitos
});

test("isTeamSuffixMatch: reconhece número da equipe pelos 8 dígitos finais (ignora DDI/formatos)", () => {
  const equipe = new Set(["16893018", "55304083"]);
  // mesmo número com DDI 55 + DDD → bate pelos 8 finais
  assert.equal(isTeamSuffixMatch(equipe, "5511916893018"), true);
  assert.equal(isTeamSuffixMatch(equipe, "11955304083"), true);
  // número de cliente que não está na equipe → não bate
  assert.equal(isTeamSuffixMatch(equipe, "5511999998888"), false);
  assert.equal(isTeamSuffixMatch(equipe, null), false);
  assert.equal(isTeamSuffixMatch(equipe, "999"), false);
});

test("planAckFlush: 1 ack por grupo, suprime já-entregue, cobre duplicados do mesmo grupo", () => {
  const rows = [
    { id: 1, group_id: "G1", fulfilled_at: null },          // → ack
    { id: 2, group_id: "G1", fulfilled_at: null },          // → coberto pelo ack do G1
    { id: 3, group_id: "G2", fulfilled_at: "2026-06-05" },  // → suprimido (já entregue)
    { id: 4, group_id: "G3", fulfilled_at: null },          // → ack
  ];
  const { toAck, toSuppressFulfilled, coveredByGroupAck } = planAckFlush(rows);
  assert.deepEqual(toAck.map((r) => r.id), [1, 4]);
  assert.deepEqual(coveredByGroupAck.map((r) => r.id), [2]);
  assert.deepEqual(toSuppressFulfilled.map((r) => r.id), [3]);
});

test("planAckFlush: lista vazia → nada a fazer", () => {
  const { toAck, toSuppressFulfilled, coveredByGroupAck } = planAckFlush([]);
  assert.equal(toAck.length, 0);
  assert.equal(toSuppressFulfilled.length, 0);
  assert.equal(coveredByGroupAck.length, 0);
});

test("isBotMentioned: @menção via LID (padrão novo do WhatsApp) — token no texto", () => {
  // Cenário real do bug: o WhatsApp embute o LID do bot (não o telefone) na menção.
  const BOT = "5511926839456";
  const LID = "184147477803257@lid"; // GET /device → campo `lid`
  const body = { connectedPhone: BOT, text: { message: "@184147477803257 atualiza o Reis x Everton" } };
  // SEM o LID, a Central não se reconhece (era exatamente o "cagou tb" do dono).
  assert.equal(isBotMentioned(body), false);
  // COM o LID (via param), reconhece a marcação.
  assert.equal(isBotMentioned(body, LID), true);
});

test("isBotMentioned: @menção via LID na lista `mentioned` da Z-API", () => {
  const BOT = "5511926839456";
  const LID = "184147477803257";
  assert.equal(isBotMentioned({ connectedPhone: BOT, mentioned: ["184147477803257@lid"], text: { message: "alguém aí?" } }, LID), true);
  assert.equal(isBotMentioned({ connectedPhone: BOT, mentioned: ["999999999999999@lid"], text: { message: "oi" } }, LID), false);
});

test("isBotMentioned: LID casa INTEIRO (não pelos 8 finais) — sem falso positivo", () => {
  const BOT = "5511926839456"; // last8 do telefone = 26839456
  const LID = "184147477803257"; // last8 do LID = 47803257
  // Outro LID com os MESMOS 8 dígitos finais do LID do bot NÃO pode casar.
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@999947803257 oi" } }, LID), false);
  // O LID exato casa.
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@184147477803257 oi" } }, LID), true);
});

test("isBotMentioned: setBotLidForTest popula o cache e dispensa o param", () => {
  const BOT = "5511926839456";
  setBotLidForTest("184147477803257@lid");
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@184147477803257 atualiza" } }), true);
  setBotLidForTest(null); // limpa pra não vazar pros outros testes
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@184147477803257 atualiza" } }), false);
  // Telefone continua casando independente do LID.
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@5511926839456 oi" } }), true);
});

test("isBotMentioned: LID de terceiro com os 8 finais IGUAIS ao telefone do bot NÃO casa", () => {
  const BOT = "5511926839456"; // last8 do telefone = 26839456
  const LID = "184147477803257";
  // Token de 15 díg (LID-shaped) terminando em 26839456 — sufixo igual ao telefone.
  // Sem o guard de tamanho, casaria por last8 (falso positivo). Deve dar false.
  assert.equal(isBotMentioned({ connectedPhone: BOT, text: { message: "@123456726839456 oi" } }, LID), false);
  assert.equal(isBotMentioned({ connectedPhone: BOT, mentioned: ["123456726839456@lid"], text: { message: "oi" } }, LID), false);
});
