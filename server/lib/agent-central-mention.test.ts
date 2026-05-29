import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSummaryRequest, looksLikeFinalKm, shortLocal } from "./agent-central-mention.ts";
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
