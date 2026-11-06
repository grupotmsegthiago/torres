import assert from "node:assert/strict";
import test from "node:test";
import {
  atualizacaoAindaNaoLida,
  isAtualizacaoStatusVigilante,
  ultimaAtualizacaoStatusNaoLida,
} from "./atualizacao-status";

test("status digitado no aplicativo é atualização", () => {
  assert.equal(isAtualizacaoStatusVigilante("Missão segue padrão, sem novidades"), true);
  assert.equal(isAtualizacaoStatusVigilante("Pernoite"), true);
  assert.equal(isAtualizacaoStatusVigilante("  Na Origem  "), true);
});

test("foto de checklist, avanço de etapa e ajuste manual não são atualização", () => {
  assert.equal(isAtualizacaoStatusVigilante("📷 Foto: Viatura Frente"), false);
  assert.equal(isAtualizacaoStatusVigilante("📷 Foto: KM Final — KM 8.130"), false);
  assert.equal(isAtualizacaoStatusVigilante("🔄 Em Trânsito Destino"), false);
  assert.equal(isAtualizacaoStatusVigilante("🔄 Chegada Destino"), false);
  assert.equal(isAtualizacaoStatusVigilante("AJUSTE MANUAL por Admin:\nEtapa alterada"), false);
  assert.equal(isAtualizacaoStatusVigilante(""), false);
  assert.equal(isAtualizacaoStatusVigilante(null), false);
});

test("a fila do painel fica com o status não lido, pulando foto e etapa mais novas", () => {
  const escolhida = ultimaAtualizacaoStatusNaoLida([
    { id: 3, message: "📷 Foto: KM Saída — KM 100", readByAdmin: 0 },
    { id: 2, message: "🔄 Em Trânsito Destino", readByAdmin: 0 },
    { id: 1, message: "Trânsito intenso na rodovia", readByAdmin: 0 },
    { id: 0, message: "Pernoite", readByAdmin: 1 },
  ]);
  assert.equal(escolhida?.id, 1);
  assert.equal(atualizacaoAindaNaoLida(0), true);
  assert.equal(atualizacaoAindaNaoLida("0"), true);
  assert.equal(atualizacaoAindaNaoLida(1), false);
});
