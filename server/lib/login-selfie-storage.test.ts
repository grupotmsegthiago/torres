import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOGIN_SELFIE_BUCKET, persistLoginSelfieBlob } from "./login-selfie-storage";
import { isStoragePath } from "./private-blob-storage";

describe("login-selfie-storage", () => {
  it("bucket privado nomeado", () => {
    assert.equal(LOGIN_SELFIE_BUCKET, "login-selfies");
  });

  it("persistLoginSelfieBlob preserva path já migrado e placeholders", async () => {
    const path = "42/selfie_1710000000_abcdef.jpg";
    assert.equal(isStoragePath(path), true);
    assert.equal(await persistLoginSelfieBlob(42, path), path);
    assert.equal(await persistLoginSelfieBlob(42, "[ajuste-manual]"), "[ajuste-manual]");
    assert.equal(await persistLoginSelfieBlob(42, null), null);
    assert.equal(await persistLoginSelfieBlob(42, ""), "");
  });
});
