import { test } from "node:test";
import assert from "node:assert/strict";
import { missionDateYmd, ymdInInclusiveRange } from "./billing-period.ts";

test("missionDateYmd: usa scheduled_date da OS, não a data de gravação do billing", () => {
  assert.equal(
    missionDateYmd({ scheduled_date: "2026-09-14T15:00:00-03:00" }, { data_missao: "2026-09-17T10:30:05-03:00" }),
    "2026-09-14",
  );
  assert.equal(
    missionDateYmd({ scheduledDate: "2026-09-15 15:00:00-03" }, { data_missao: "2026-09-17T10:30:05-03:00" }),
    "2026-09-15",
  );
  assert.equal(missionDateYmd(null, { data_missao: "2026-09-03T12:00:00-03:00" }), "2026-09-03");
});

test("ymdInInclusiveRange: quinzena 1–15 inclui 14 e 15, exclui 17; 16–30 inclui 17", () => {
  assert.equal(ymdInInclusiveRange("2026-09-14", "2026-09-01", "2026-09-15"), true);
  assert.equal(ymdInInclusiveRange("2026-09-15", "2026-09-01", "2026-09-15"), true);
  assert.equal(ymdInInclusiveRange("2026-09-17", "2026-09-01", "2026-09-15"), false);
  assert.equal(ymdInInclusiveRange("2026-09-17", "2026-09-16", "2026-09-30"), true);
  assert.equal(ymdInInclusiveRange("2026-09-15", "2026-09-16", "2026-09-30"), false);
});
