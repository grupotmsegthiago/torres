import assert from "node:assert/strict";
import { test } from "node:test";
import {
  corteDeLeitura,
  idsReaisDeLeitura,
  interpretarPayloadLidas,
  MISSION_LIDAS_EVENT,
  MISSION_LIDAS_TOPIC,
  semMensagensLidas,
  urlBroadcastLidas,
} from "./mission-lidas.ts";

test("ids reais ignoram lixo e repetidos", () => {
  assert.deepEqual(idsReaisDeLeitura([3, "4", 0, -1, 3.5, "x", 3, null]), [3, 4]);
  assert.deepEqual(idsReaisDeLeitura("3"), []);
});

test("corte de todas as mensagens ou só das tratadas", () => {
  assert.deepEqual(corteDeLeitura(null), { todas: true });
  assert.deepEqual(corteDeLeitura([8, 8, 0]), { ids: [8] });
});

test("payload remoto só vale com ids ou com todas", () => {
  assert.deepEqual(interpretarPayloadLidas({ ids: [9, "10"] }), { ids: [9, 10] });
  assert.deepEqual(interpretarPayloadLidas({ todas: true, ids: [1] }), { todas: true });
  assert.equal(interpretarPayloadLidas({ ids: [] }), null);
  assert.equal(interpretarPayloadLidas(null), null);
  assert.equal(interpretarPayloadLidas({ outra: true }), null);
});

test("a lista some para quem não clicou", () => {
  const lista = [{ id: 1, message: "a" }, { id: 2, message: "b" }, { id: 3, message: "c" }];
  assert.deepEqual(semMensagensLidas(lista, { ids: [2] }), [
    { id: 1, message: "a" },
    { id: 3, message: "c" },
  ]);
  assert.deepEqual(semMensagensLidas(lista, { todas: true }), []);
});

test("o aviso usa o canal público de leitura, sem abrir a tabela", () => {
  assert.equal(
    urlBroadcastLidas("https://exemplo.supabase.co/"),
    `https://exemplo.supabase.co/realtime/v1/api/broadcast/${MISSION_LIDAS_TOPIC}/events/${MISSION_LIDAS_EVENT}`,
  );
});
