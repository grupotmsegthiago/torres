import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhotoDataUri } from "./photo-data-uri.ts";

// REGRESSÃO bug 04/06/2026 (WAF bloqueava data:image;base64 → 403 na selfie de login).
// O cliente agora manda base64 cru + mime; o servidor remonta o data URI.

test("remonta data URI a partir de base64 cru + mime", () => {
  assert.equal(
    normalizePhotoDataUri("AAAABBBB", "image/jpeg"),
    "data:image/jpeg;base64,AAAABBBB",
  );
  assert.equal(
    normalizePhotoDataUri("XYZ", "image/png"),
    "data:image/png;base64,XYZ",
  );
});

test("usa image/jpeg como mime padrão quando ausente ou inválido", () => {
  assert.equal(normalizePhotoDataUri("XYZ"), "data:image/jpeg;base64,XYZ");
  assert.equal(normalizePhotoDataUri("XYZ", "evil; drop"), "data:image/jpeg;base64,XYZ");
  assert.equal(normalizePhotoDataUri("XYZ", 123), "data:image/jpeg;base64,XYZ");
});

test("mantém data URI legado intacto (compat cliente antigo)", () => {
  const legacy = "data:image/jpeg;base64,AAAA";
  assert.equal(normalizePhotoDataUri(legacy), legacy);
});

test("rejeita entrada vazia ou não-string", () => {
  assert.equal(normalizePhotoDataUri(""), null);
  assert.equal(normalizePhotoDataUri(undefined), null);
  assert.equal(normalizePhotoDataUri(null), null);
  assert.equal(normalizePhotoDataUri(123), null);
});
