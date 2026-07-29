/**
 * Cenários obrigatórios da correção estrutural (camada SWR + chaves).
 * Não exige Supabase/browser — prova o contrato servidor/cliente.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withSwrCache, bustSwrCache } from "../server/lib/swr-cache.ts";
import { queryKeys, RH_SUMMARY_SCHEMA } from "../shared/cache-keys.ts";

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

test("F5 com alteração recente: validate aguarda se age >= freshTtl (não HIT silencioso 3h)", async () => {
  bustSwrCache("scn-f5");
  let calls = 0;
  const wrapped = withSwrCache(
    { baseKey: "scn-f5", ttlMs: 3 * 3600_000, freshTtlMs: 50 },
    async (_req, res) => { calls++; res.json({ n: calls }); },
  );
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null);
  await new Promise((r) => setTimeout(r, 60));
  const f5 = fakeRes();
  await wrapped(fakeReq({ cached: "1", validate: "1" }), f5, null);
  assert.equal(f5._headers["x-cache"], "VALIDATE");
  assert.equal(f5._json.n, 2);
  assert.equal(f5._headers["x-cache-fresh"], "1");
});

test("troca de competência: chaves distintas (26–25 vs período anterior)", () => {
  const jul = queryKeys.rhSummary("2026-06-26", "2026-07-25");
  const jun = queryKeys.rhSummary("2026-05-26", "2026-06-25");
  assert.notDeepEqual(jul, jun);
  assert.equal(jul[1], `v${RH_SUMMARY_SCHEMA}`);
});

test("duas abas / sync: force invalida e recalcula; segunda leitura HIT fresco", async () => {
  bustSwrCache("scn-tabs");
  let calls = 0;
  const wrapped = withSwrCache(
    { baseKey: "scn-tabs", ttlMs: 3 * 3600_000, freshTtlMs: 120_000 },
    async (_req, res) => { calls++; res.json({ n: calls }); },
  );
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null);
  const force = fakeRes();
  await wrapped(fakeReq({ cached: "1", force: "1" }), force, null);
  assert.equal(force._headers["x-cache"], "FORCE");
  assert.equal(force._json.n, 2);
  const otherTab = fakeRes();
  await wrapped(fakeReq({ cached: "1", validate: "1" }), otherTab, null);
  assert.equal(otherTab._headers["x-cache"], "HIT");
  assert.equal(otherTab._json.n, 2);
  assert.equal(calls, 2);
});

test("clique duplo sync: gerações — só a mais recente aplica", () => {
  let applied = 0;
  let gen = 0;
  const run = (payload: number) => {
    const g = ++gen;
    return { g, apply: () => (g === gen ? (applied = payload, true) : false) };
  };
  const a = run(1);
  const b = run(2);
  assert.equal(b.apply(), true);
  assert.equal(a.apply(), false);
  assert.equal(applied, 2);
});

test("resposta antiga depois da nova: não substitui (mesmo contrato do syncGenRef)", () => {
  const ui = { v: 0 };
  let cur = 2;
  const apply = (g: number, v: number) => { if (g !== cur) return false; ui.v = v; return true; };
  assert.equal(apply(2, 200), true);
  assert.equal(apply(1, 100), false);
  assert.equal(ui.v, 200);
});

test("falha Supabase/handler: STALE explícito com fresh=0 (banner)", async () => {
  bustSwrCache("scn-fail");
  let calls = 0;
  const wrapped = withSwrCache(
    { baseKey: "scn-fail", ttlMs: 3 * 3600_000, freshTtlMs: 30, attachCacheMeta: true },
    async (_req, res) => {
      calls++;
      if (calls === 1) return res.json({ n: 1 });
      throw new Error("supabase down");
    },
  );
  await wrapped(fakeReq({ cached: "1" }), fakeRes(), null);
  await new Promise((r) => setTimeout(r, 40));
  const stale = fakeRes();
  await wrapped(fakeReq({ cached: "1", validate: "1" }), stale, null);
  assert.equal(stale._headers["x-cache"], "STALE");
  assert.equal(stale._headers["x-cache-fresh"], "0");
  assert.equal(stale._json.n, 1);
  assert.equal(stale._json._cacheMeta.fresh, false);
});

test("novo deploy (memória fria) + bust: MISS/VALIDATE sem loop", async () => {
  bustSwrCache("scn-deploy");
  let calls = 0;
  const wrapped = withSwrCache(
    { baseKey: "scn-deploy", ttlMs: 3 * 3600_000, freshTtlMs: 120_000 },
    async (_req, res) => { calls++; res.json({ n: calls }); },
  );
  const a = fakeRes();
  await wrapped(fakeReq({ cached: "1", validate: "1" }), a, null);
  assert.ok(["MISS", "VALIDATE"].includes(a._headers["x-cache"]));
  bustSwrCache("scn-deploy");
  const b = fakeRes();
  await wrapped(fakeReq({ cached: "1", validate: "1" }), b, null);
  assert.ok(["MISS", "VALIDATE"].includes(b._headers["x-cache"]));
  assert.equal(calls, 2);
});

test("sem chamadas duplicadas no singleflight (MISS concorrente)", async () => {
  bustSwrCache("scn-sf");
  let calls = 0;
  const wrapped = withSwrCache(
    { baseKey: "scn-sf", ttlMs: 60_000 },
    async (_req, res) => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      res.json({ n: calls });
    },
  );
  await Promise.all([
    wrapped(fakeReq({ cached: "1", validate: "1" }), fakeRes(), null),
    wrapped(fakeReq({ cached: "1", validate: "1" }), fakeRes(), null),
    wrapped(fakeReq({ cached: "1", validate: "1" }), fakeRes(), null),
  ]);
  assert.equal(calls, 1);
});
