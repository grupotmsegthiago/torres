import { test } from "node:test";
import assert from "node:assert/strict";
import { withSwrCache, bustSwrCache } from "./swr-cache.ts";

function fakeReq(query: any = {}) {
  return { query } as any;
}
function fakeRes() {
  const headers: Record<string, string> = {};
  const r: any = {
    statusCode: 200,
    set(k: string, v: string) { headers[k.toLowerCase()] = v; return r; },
    status(c: number) { r.statusCode = c; return r; },
    json(p: any) { r._json = p; return r; },
    _headers: headers,
  };
  return r;
}

test("sem ?cached=1 chama o handler direto (passthrough)", async () => {
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "pt", ttlMs: 1000 }, async (_req, res) => {
    calls++;
    res.status(200).json({ value: calls });
  });
  const res1 = fakeRes(); await wrapped(fakeReq({}), res1, null);
  const res2 = fakeRes(); await wrapped(fakeReq({}), res2, null);
  assert.equal(calls, 2);
  assert.equal(res1._headers["x-cache"], undefined);
});

test("MISS computa, HIT serve do cache sem recomputar", async () => {
  bustSwrCache("hit");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "hit", ttlMs: 1000 }, async (_req, res) => {
    calls++;
    res.status(200).json({ value: calls });
  });
  const miss = fakeRes(); await wrapped(fakeReq({ cached: "1" }), miss, null);
  assert.equal(miss._headers["x-cache"], "MISS");
  assert.deepEqual(miss._json, { value: 1 });

  const hit = fakeRes(); await wrapped(fakeReq({ cached: "1" }), hit, null);
  assert.equal(hit._headers["x-cache"], "HIT");
  assert.deepEqual(hit._json, { value: 1 });
  assert.equal(calls, 1);
});

test("STALE serve o valor antigo e recalcula em background", async () => {
  bustSwrCache("stale");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "stale", ttlMs: 50 }, async (_req, res) => {
    calls++;
    res.status(200).json({ value: calls });
  });
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null); // MISS -> value 1
  await new Promise((r) => setTimeout(r, 70));
  const stale = fakeRes(); await wrapped(fakeReq({ cached: "1" }), stale, null);
  assert.equal(stale._headers["x-cache"], "STALE");
  assert.deepEqual(stale._json, { value: 1 }); // serve o antigo na hora
  await new Promise((r) => setTimeout(r, 50)); // espera o refresh em background
  assert.equal(calls, 2);

  const hit = fakeRes(); await wrapped(fakeReq({ cached: "1" }), hit, null);
  assert.deepEqual(hit._json, { value: 2 });
});

test("force=1 recalcula na hora", async () => {
  bustSwrCache("force");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "force", ttlMs: 10000 }, async (_req, res) => {
    calls++;
    res.status(200).json({ value: calls });
  });
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null); // MISS value 1
  const forced = fakeRes(); await wrapped(fakeReq({ cached: "1", force: "1" }), forced, null);
  assert.equal(forced._headers["x-cache"], "MISS");
  assert.deepEqual(forced._json, { value: 2 });
});

test("resposta não-200 não é cacheada", async () => {
  bustSwrCache("err");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "err", ttlMs: 10000 }, async (_req, res) => {
    calls++;
    res.status(500).json({ message: "boom" });
  });
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null);
  const second = fakeRes(); await wrapped(fakeReq({ cached: "1" }), second, null);
  assert.equal(calls, 2); // recomputou, pois o erro não entrou no cache
});

test("singleflight: MISS concorrente não recalcula em paralelo", async () => {
  bustSwrCache("sf");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "sf", ttlMs: 10000 }, async (_req, res) => {
    calls++;
    await new Promise((r) => setTimeout(r, 40)); // cálculo lento
    res.status(200).json({ value: calls });
  });
  const a = fakeRes(); const b = fakeRes(); const c = fakeRes();
  await Promise.all([
    wrapped(fakeReq({ cached: "1" }), a, null),
    wrapped(fakeReq({ cached: "1" }), b, null),
    wrapped(fakeReq({ cached: "1" }), c, null),
  ]);
  assert.equal(calls, 1); // só 1 cálculo de verdade
  assert.deepEqual(a._json, { value: 1 });
  assert.deepEqual(b._json, { value: 1 });
  assert.deepEqual(c._json, { value: 1 });
});

test("evição: cache não cresce além do limite (chaves distintas)", async () => {
  bustSwrCache();
  const wrapped = withSwrCache({ baseKey: "ev", ttlMs: 10000 }, async (req, res) => {
    res.status(200).json({ from: req.query.from });
  });
  for (let i = 0; i < 250; i++) {
    await wrapped(fakeReq({ cached: "1", from: String(i) }), fakeRes(), null);
  }
  // a primeira chave (from=0) deve ter sido descartada; recomputa como MISS
  const recheck = fakeRes();
  await wrapped(fakeReq({ cached: "1", from: "0" }), recheck, null);
  assert.equal(recheck._headers["x-cache"], "MISS");
});

test("chave inclui params de query (from/to) mas ignora cached/force", async () => {
  bustSwrCache("key");
  let calls = 0;
  const wrapped = withSwrCache({ baseKey: "key", ttlMs: 10000 }, async (_req, res) => {
    calls++;
    res.status(200).json({ value: calls });
  });
  await wrapped(fakeReq({ cached: "1", from: "A", to: "B" }), fakeRes(), null);
  const sameKey = fakeRes(); await wrapped(fakeReq({ cached: "1", from: "A", to: "B" }), sameKey, null);
  assert.equal(sameKey._headers["x-cache"], "HIT");
  const otherKey = fakeRes(); await wrapped(fakeReq({ cached: "1", from: "X", to: "Y" }), otherKey, null);
  assert.equal(otherKey._headers["x-cache"], "MISS");
  assert.equal(calls, 2);
});
