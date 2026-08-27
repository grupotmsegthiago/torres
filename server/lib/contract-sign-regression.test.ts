import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Trava a correção do fluxo de assinatura de contrato no app do vigilante.
// Histórico: POST com `data:image...` era bloqueado pelo WAF (403) e o 1º toque
// enviava assinatura null (setState assíncrono) → "Assinatura digital obrigatória".

test("tela mobile de contratos envia payload WAF-safe e passa a assinatura no submit", () => {
  const src = readFileSync(resolve("client/src/pages/mobile/contratos.tsx"), "utf8");
  assert.match(src, /facialFotoBase64/);
  assert.match(src, /assinaturaBase64/);
  assert.match(src, /splitDataUri/);
  assert.match(src, /onSubmit\(sig\)/);
  assert.match(src, /authFetch\(url\)/);
  assert.doesNotMatch(src, /window\.open\(pdfUrl/);
  assert.doesNotMatch(src, /apiRequest\("POST", endpoint, \{\s*facialFoto,/);
});

test("endpoints /sign de contrato aceitam base64 cru e comparam employeeId numericamente", () => {
  const perm = readFileSync(resolve("server/routes/permanent-contracts.ts"), "utf8");
  const prob = readFileSync(resolve("server/routes/probation-contracts.ts"), "utf8");
  for (const src of [perm, prob]) {
    assert.match(src, /resolveWafSafeImage/);
    assert.match(src, /facialFotoBase64/);
    assert.match(src, /assinaturaBase64/);
    assert.match(src, /Number\(contract\.employee_id\) !== Number\(req\.user\.employeeId\)/);
  }
});
