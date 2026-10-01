import { test } from "node:test";
import assert from "node:assert/strict";
import { appendCiencia, manutencaoAberta, nomeDoLogin, ocultarAvisoManutencao } from "./manutencao-ciencia";

test("diretoria não vê o aviso de manutenção", () => {
  assert.equal(ocultarAvisoManutencao("diretoria", "vehicle_maintenance"), true);
  assert.equal(ocultarAvisoManutencao("admin", "vehicle_maintenance"), false);
  assert.equal(ocultarAvisoManutencao("funcionario", "vehicle_maintenance"), false);
  assert.equal(ocultarAvisoManutencao("diretoria", "outro"), false);
});

test("nome vem do login", () => {
  assert.equal(nomeDoLogin({ name: "Thiago Moreira", username: "thiago" }), "Thiago Moreira");
  assert.equal(nomeDoLogin({ name: "  ", username: "thiago" }), "thiago");
  assert.equal(nomeDoLogin(null), "Usuário");
});

test("ciência acumula o nome e não duplica a mesma pessoa", () => {
  const primeira = appendCiencia([], { userId: 4, name: "Ricardo Tadeu", at: "2026-10-01T17:00:00.000Z" });
  const segunda = appendCiencia(primeira, { userId: 55, name: "Tiago de Souza", at: "2026-10-01T17:05:00.000Z" });
  const repetida = appendCiencia(segunda, { userId: 4, name: "Ricardo Tadeu", at: "2026-10-01T18:00:00.000Z" });
  assert.equal(repetida.length, 2);
  assert.equal(repetida[0].name, "Ricardo Tadeu");
  assert.equal(repetida[1].name, "Tiago de Souza");
});

test("manutenção realizada ou cancelada não recebe ciência nova", () => {
  assert.equal(manutencaoAberta("em_andamento"), true);
  assert.equal(manutencaoAberta("agendada"), true);
  assert.equal(manutencaoAberta("realizada"), false);
  assert.equal(manutencaoAberta("cancelada"), false);
});
