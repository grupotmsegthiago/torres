import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeMigrateReport, type MigrateMediaReport } from "./migrate-media-to-storage";
import { isStoragePath, isInlineBase64Blob } from "./private-blob-storage";

describe("migrate-media-to-storage helpers", () => {
  it("summarizeMigrateReport soma todos os buckets", () => {
    const report: MigrateMediaReport = {
      missionPhotos: { scanned: 10, migrated: 8, failed: 1, skipped: 1 },
      fueling: { scanned: 4, migrated: 3, failed: 0, skipped: 1 },
      employeeDocs: { scanned: 2, migrated: 2, failed: 0, skipped: 0 },
      missionCosts: { scanned: 5, migrated: 4, failed: 1, skipped: 0 },
      loginSelfies: { scanned: 3, migrated: 3, failed: 0, skipped: 0 },
    };
    assert.deepEqual(summarizeMigrateReport(report), {
      scanned: 24,
      migrated: 20,
      failed: 2,
    });
  });

  it("paths de storage e data URI continuam discrimináveis", () => {
    assert.equal(isStoragePath("123/1710000000_abc123.jpg"), true);
    assert.equal(isStoragePath("data:image/jpeg;base64,aaaa"), false);
    assert.equal(
      isInlineBase64Blob("data:image/jpeg;base64," + "A".repeat(250)),
      true,
    );
  });
});
