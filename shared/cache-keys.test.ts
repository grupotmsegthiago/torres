import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RH_SUMMARY_SCHEMA,
  rhSummarySwrBaseKey,
  RH_SUMMARY_SWR_BUST_PREFIXES,
  queryKeys,
  isRhSummaryQueryKey,
} from "./cache-keys.ts";

test("schema e baseKey SWR derivados de um único lugar", () => {
  assert.equal(rhSummarySwrBaseKey(), `rh-summary-v${RH_SUMMARY_SCHEMA}`);
  assert.ok(RH_SUMMARY_SWR_BUST_PREFIXES.includes(rhSummarySwrBaseKey()));
  assert.ok(RH_SUMMARY_SWR_BUST_PREFIXES.includes("rh-summary"));
});

test("queryKeys.rhSummary inclui schema e período", () => {
  const key = queryKeys.rhSummary("2026-06-26", "2026-07-25");
  assert.deepEqual(key, [
    "/api/fixed-costs/rh-summary",
    `v${RH_SUMMARY_SCHEMA}`,
    "cached",
    "2026-06-26",
    "2026-07-25",
  ]);
  assert.ok(isRhSummaryQueryKey(key));
  assert.equal(isRhSummaryQueryKey(["/api/operational-grid"]), false);
});

test("períodos distintos geram chaves distintas (sem reaproveitar placeholder)", () => {
  const a = queryKeys.rhSummary("2026-06-26", "2026-07-25");
  const b = queryKeys.rhSummary("2026-05-26", "2026-06-25");
  assert.notDeepEqual(a, b);
  assert.equal(a[0], b[0]);
  assert.equal(a[3], "2026-06-26");
  assert.equal(b[3], "2026-05-26");
});
