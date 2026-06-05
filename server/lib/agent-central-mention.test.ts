import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSummaryRequest, looksLikeFinalKm, looksLikeUpdateRequest, sanitizeFinanceiro, shortLocal, claimAckSlot, isBotMentioned } from "./agent-central-mention.ts";
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
