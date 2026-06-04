import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSummaryRequest, looksLikeFinalKm, looksLikeUpdateRequest, sanitizeFinanceiro, shortLocal } from "./agent-central-mention.ts";
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

test("conversa social cai FORA dos 3 fluxos operacionais (→ conversa natural)", () => {
  // Mensagens sociais não devem casar com resumo, km final NEM pedido de
  // atualização. Assim o handler cai no fallback de conversa natural em vez de
  // silêncio. (looksLikeUpdateRequest com hasQuoted=false.)
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
