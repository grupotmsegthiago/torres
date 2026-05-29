import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSummaryRequest, shortLocal } from "./agent-central-mention.ts";

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
