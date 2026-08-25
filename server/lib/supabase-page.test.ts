import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllSupabaseRows, SUPABASE_PAGE_SIZE } from "./supabase-page.ts";

test("fetchAllSupabaseRows: agrega páginas até a última incompleta", async () => {
  const calls: Array<[number, number]> = [];
  const rows = await fetchAllSupabaseRows<number>(async (from, to) => {
    calls.push([from, to]);
    if (from === 0) return { data: Array.from({ length: 1000 }, (_, i) => i), error: null };
    if (from === 1000) return { data: Array.from({ length: 42 }, (_, i) => 1000 + i), error: null };
    return { data: [], error: null };
  });
  assert.equal(rows.length, 1042);
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  assert.equal(SUPABASE_PAGE_SIZE, 1000);
});

test("fetchAllSupabaseRows: página vazia na 1ª chamada → []", async () => {
  const rows = await fetchAllSupabaseRows(async () => ({ data: [], error: null }));
  assert.deepEqual(rows, []);
});

test("fetchAllSupabaseRows: propaga erro do Supabase", async () => {
  await assert.rejects(
    () => fetchAllSupabaseRows(async () => ({ data: null, error: Object.assign(new Error("boom"), { message: "boom" }) })),
    (err: any) => String(err?.message || err) === "boom",
  );
});

test("fetchAllSupabaseRows: uma página cheia + vazia seguinte para", async () => {
  let n = 0;
  const rows = await fetchAllSupabaseRows<string>(async () => {
    n += 1;
    if (n === 1) return { data: Array.from({ length: 1000 }, (_, i) => `r${i}`), error: null };
    return { data: [], error: null };
  }, 1000);
  assert.equal(rows.length, 1000);
  assert.equal(n, 2);
});
