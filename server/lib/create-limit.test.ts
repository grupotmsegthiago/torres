import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimit } from "./create-limit";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("preserva a ordem dos resultados", async () => {
  const limit = createLimit(6);
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = await Promise.all(
    idx.map((i) => limit(async () => { await delay(Math.random() * 10); return i * 2; })),
  );
  assert.deepEqual(out, idx.map((i) => i * 2));
});

test("respeita o limite de concorrência", async () => {
  const limit = createLimit(3);
  let active = 0;
  let maxActive = 0;
  await Promise.all(
    Array.from({ length: 12 }).map(() => limit(async () => {
      active++; maxActive = Math.max(maxActive, active);
      await delay(15);
      active--;
    })),
  );
  assert.ok(maxActive <= 3, `maxActive=${maxActive} deveria ser <= 3`);
});

test("uma rejeição não derruba as outras", async () => {
  const limit = createLimit(2);
  const results = await Promise.allSettled([
    limit(async () => 1),
    limit(async () => { throw new Error("boom"); }),
    limit(async () => 3),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
});

test("rejeita concurrency inválido", () => {
  assert.throws(() => createLimit(0));
  assert.throws(() => createLimit(-1));
  assert.throws(() => createLimit(1.5));
});
