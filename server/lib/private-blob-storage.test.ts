import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStoragePath,
  isInlineBase64Blob,
  hasBlobValue,
  buildStoragePath,
  extFromMimeOrName,
} from "./private-blob-storage.ts";

test("isStoragePath: aceita path típico do bucket", () => {
  assert.equal(isStoragePath("123/1699999999_ab12cd.jpg"), true);
  assert.equal(isStoragePath("pending/receipt_1700000000_xyz789.png"), true);
  assert.equal(isStoragePath("42/cnh_1_abc.pdf"), true);
});

test("isStoragePath: rejeita data URI, http, placeholder e lixo", () => {
  assert.equal(isStoragePath("data:image/jpeg;base64,AAAA"), false);
  assert.equal(isStoragePath("https://example.com/x.jpg"), false);
  assert.equal(isStoragePath("[ajuste-manual]"), false);
  assert.equal(isStoragePath(""), false);
  assert.equal(isStoragePath("short"), false);
  assert.equal(isStoragePath("no-slash-or-ext"), false);
});

test("isInlineBase64Blob: só data URI base64 grande", () => {
  assert.equal(isInlineBase64Blob("data:image/jpeg;base64," + "A".repeat(250)), true);
  assert.equal(isInlineBase64Blob("data:image/jpeg;base64,AA"), false);
  assert.equal(isInlineBase64Blob("123/1_x.jpg"), false);
});

test("hasBlobValue / buildStoragePath / extFromMimeOrName", () => {
  assert.equal(hasBlobValue("x"), true);
  assert.equal(hasBlobValue(""), false);
  const p = buildStoragePath(99, "jpg", "receipt");
  assert.match(p, /^99\/receipt_\d+_[a-z0-9]+\.jpg$/);
  assert.equal(extFromMimeOrName("image/png"), "png");
  assert.equal(extFromMimeOrName("application/pdf"), "pdf");
  assert.equal(extFromMimeOrName("file.WEBP"), "webp");
});
