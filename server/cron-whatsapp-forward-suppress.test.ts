import test from "node:test";
import assert from "node:assert/strict";
import { isSuppressedPhotoCaption, transformClientCaptionMessage } from "./cron-whatsapp-forward";

test("isSuppressedPhotoCaption: KM Saída e Agente Equipado são suprimidas", () => {
  assert.equal(isSuppressedPhotoCaption("📷 Foto: KM Saída — KM 38.969"), true);
  assert.equal(isSuppressedPhotoCaption("📷 FOTO: KM SAIDA — KM 100"), true);
  assert.equal(isSuppressedPhotoCaption("📷 Foto: agente_equipado — KM 38.969"), true);
  assert.equal(isSuppressedPhotoCaption("📷 Foto: Agente Equipado"), true);
});

test("isSuppressedPhotoCaption: demais cards continuam saindo", () => {
  assert.equal(isSuppressedPhotoCaption("📷 Foto: KM Chegada — KM 38.969"), false);
  assert.equal(isSuppressedPhotoCaption("📷 Foto: KM Final — KM 8.130"), false);
  assert.equal(isSuppressedPhotoCaption("📷 Foto: Local de Destino"), false);
  assert.equal(isSuppressedPhotoCaption("📷 Foto: Local de Origem"), false);
  // texto livre do agente nunca é suprimido, mesmo mencionando km saída
  assert.equal(isSuppressedPhotoCaption("saindo agora, km saída 38.969"), false);
  assert.equal(isSuppressedPhotoCaption(""), false);
  assert.equal(isSuppressedPhotoCaption(null), false);
});

test("transformClientCaptionMessage: KM Chegada vira CHEGADA NO CLIENTE - KM INICIAL", () => {
  assert.equal(
    transformClientCaptionMessage("📷 Foto: KM Chegada — KM 38.969"),
    "CHEGADA NO CLIENTE - KM INICIAL - 38.969"
  );
  assert.equal(
    transformClientCaptionMessage("📷 FOTO: KM CHEGADA — KM 1.234"),
    "CHEGADA NO CLIENTE - KM INICIAL - 1.234"
  );
  // sem valor de KM na legenda
  assert.equal(
    transformClientCaptionMessage("📷 Foto: KM Chegada"),
    "CHEGADA NO CLIENTE - KM INICIAL"
  );
});

test("transformClientCaptionMessage: demais mensagens passam intactas", () => {
  assert.equal(
    transformClientCaptionMessage("📷 Foto: KM Final — KM 8.130"),
    "📷 Foto: KM Final — KM 8.130"
  );
  assert.equal(transformClientCaptionMessage("Em trânsito, tudo ok"), "Em trânsito, tudo ok");
  assert.equal(transformClientCaptionMessage(null), "");
});
