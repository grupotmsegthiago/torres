import { test } from "node:test";
import assert from "node:assert/strict";
import { mensagemContatoMotorista, saudacaoMotorista, whatsAppMotoristaUrl } from "./driver-whatsapp";

test("saudação segue o horário de São Paulo", () => {
  assert.equal(saudacaoMotorista(new Date("2026-10-01T14:00:00Z")), "Bom dia");
  assert.equal(saudacaoMotorista(new Date("2026-10-01T16:00:00Z")), "Boa tarde");
  assert.equal(saudacaoMotorista(new Date("2026-10-01T23:30:00Z")), "Boa noite");
});

test("WhatsApp abre com o primeiro nome e o texto pronto", () => {
  const quando = new Date("2026-10-01T16:00:00Z");
  const url = whatsAppMotoristaUrl("(11) 98888-7777", "TIAGO DE SOUZA CELERGE", quando);
  assert.ok(url);
  const text = decodeURIComponent(url!.split("text=")[1]);
  assert.match(url!, /^https:\/\/wa\.me\/5511988887777\?text=/);
  assert.match(text, /^Boa tarde! Meu nome é Tiago, sou da empresa Torres Vigilancia Patrimonial/);
  assert.match(text, /poderia me informar a situação\?$/);
});
