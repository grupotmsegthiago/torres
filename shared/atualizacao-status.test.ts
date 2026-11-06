import assert from "node:assert/strict";
import test from "node:test";
import {
  atualizacaoAindaNaoLida,
  atualizacaoDoDiaOperacional,
  atualizacaoVisivelNoPainel,
  isAtualizacaoStatusVigilante,
  mensagemEntraNoPainel,
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

test("a fila do painel abre a etapa e o status, e pula a foto", () => {
  const escolhida = ultimaAtualizacaoStatusNaoLida([
    { id: 3, message: "📷 Foto: KM Saída — KM 100", readByAdmin: 0 },
    { id: 2, message: "🔄 Em Trânsito Destino", readByAdmin: 0 },
    { id: 1, message: "Trânsito intenso na rodovia", readByAdmin: 0 },
    { id: 0, message: "Pernoite", readByAdmin: 1 },
  ]);
  assert.equal(escolhida?.id, 2);
  assert.equal(mensagemEntraNoPainel("🔄 Em Trânsito Destino"), true);
  assert.equal(mensagemEntraNoPainel("🔄 Início Missão"), true);
  assert.equal(mensagemEntraNoPainel("🔄 checkout_armamento"), false);
  assert.equal(atualizacaoAindaNaoLida(0), true);
  assert.equal(atualizacaoAindaNaoLida("0"), true);
  assert.equal(atualizacaoAindaNaoLida(1), false);
});

test("mensagem de ontem não entra no painel; a de hoje fica até marcarem lida", () => {
  const agora = new Date("2026-11-06T18:00:00-03:00");
  const ontem = "2026-11-05T22:40:00-03:00";
  const hoje = "2026-11-06T11:05:00-03:00";
  assert.equal(atualizacaoDoDiaOperacional(ontem, agora), false);
  assert.equal(atualizacaoDoDiaOperacional(hoje, agora), true);
  assert.equal(atualizacaoDoDiaOperacional("2026-11-06T02:30:00.000Z", agora), false);
  assert.equal(atualizacaoVisivelNoPainel({ message: "Pernoite", createdAt: ontem }, agora), false);
  assert.equal(atualizacaoVisivelNoPainel({ message: "📷 Foto: Viatura Frente", createdAt: hoje }, agora), false);
  assert.equal(atualizacaoVisivelNoPainel({ message: "🔄 Em Trânsito Destino", createdAt: hoje }, agora), true);
  assert.equal(atualizacaoVisivelNoPainel({ message: "🔄 Em Trânsito Destino", createdAt: ontem }, agora), false);
  const escolhida = ultimaAtualizacaoStatusNaoLida([
    { id: 9, message: "Mensagem de ontem", createdAt: ontem, readByAdmin: 0 },
    { id: 8, message: "Na rua com o cliente", createdAt: hoje, readByAdmin: 0 },
    { id: 7, message: "Já tratei", createdAt: hoje, readByAdmin: 1 },
  ], agora);
  assert.equal(escolhida?.id, 8);
});
