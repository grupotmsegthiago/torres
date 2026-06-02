import { test } from "node:test";
import assert from "node:assert/strict";
import { isFinalCardUpdate, alreadyForwardedFinal } from "./cron-whatsapp-forward.js";

test("isFinalCardUpdate: step finalizada é card de fim", () => {
  assert.equal(isFinalCardUpdate("finalizada", null), true);
});

test("isFinalCardUpdate: foto KM Final (chegada_destino) é card de fim", () => {
  assert.equal(isFinalCardUpdate("chegada_destino", "📷 Foto: KM Final — KM 8.130"), true);
});

test("isFinalCardUpdate: foto Local de Destino NÃO é card de fim", () => {
  assert.equal(isFinalCardUpdate("chegada_destino", "📷 Foto: Local de Destino"), false);
});

test("isFinalCardUpdate: texto livre 'km finalizado' NÃO dispara", () => {
  assert.equal(isFinalCardUpdate("em_transito_destino", "km finalizado sem novidades"), false);
});

test("alreadyForwardedFinal: lista vazia → false (primeiro fim, deve enviar)", () => {
  assert.equal(alreadyForwardedFinal([]), false);
});

test("alreadyForwardedFinal: só trânsito/chegada → false", () => {
  const prior = [
    { mission_step: "em_transito_destino", message: "Missão segue padrão, sem novidades" },
    { mission_step: "chegada_destino", message: "📷 Foto: Local de Destino" },
  ];
  assert.equal(alreadyForwardedFinal(prior), false);
});

test("alreadyForwardedFinal: já tem KM Final enviado → true (duplicata, skip)", () => {
  const prior = [
    { mission_step: "chegada_destino", message: "📷 Foto: Local de Destino" },
    { mission_step: "chegada_destino", message: "📷 Foto: KM Final — KM 8.130" },
  ];
  assert.equal(alreadyForwardedFinal(prior), true);
});

test("alreadyForwardedFinal: já tem step finalizada enviado → true", () => {
  assert.equal(alreadyForwardedFinal([{ mission_step: "finalizada", message: "🔄 Finalizada" }]), true);
});

// Cenário real OS TOR-0245 (01/06/2026): o 2º card de finalização (#6500)
// deve ser pulado porque o 1º (#6498) já foi enviado com sucesso.
test("cenário OS 0245: 2º KM Final é duplicata do 1º já enviado", () => {
  // priorSent = updates JÁ enviadas com sucesso (forwarded_at != null, sem erro),
  // excluindo a atual (#6500). Inclui #6498 (KM Final enviado OK).
  const priorSentForRow6500 = [
    { mission_step: "chegada_destino", message: "📷 Foto: Local de Destino" }, // #6497
    { mission_step: "chegada_destino", message: "📷 Foto: KM Final — KM 8.130" }, // #6498
    { mission_step: "chegada_destino", message: "📷 Foto: Local de Destino" }, // #6499
  ];
  assert.equal(alreadyForwardedFinal(priorSentForRow6500), true);

  // E o 1º card de finalização (#6498) NÃO deve ser pulado: antes dele nenhum
  // card de fim havia sido enviado.
  const priorSentForRow6498 = [
    { mission_step: "chegada_destino", message: "📷 Foto: Local de Destino" }, // #6497
  ];
  assert.equal(alreadyForwardedFinal(priorSentForRow6498), false);
});
