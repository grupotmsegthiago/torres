// Cache "stale-while-revalidate" em memória, opt-in por requisição (?cached=1).
//
// Objetivo: telas pesadas (ex.: Balanço Gerencial) abrem instantâneo servindo o
// último resultado calculado e o servidor recalcula em segundo plano só quando o
// dado passa do TTL (padrão 3h). Quem NÃO manda ?cached=1 (Painel Operacional ao
// vivo, Relatório de OS, Custos Fixos) continua recebendo a resposta calculada na
// hora — comportamento idêntico ao de antes. Como apenas embrulha o handler
// existente, os NÚMEROS são exatamente os mesmos; muda só QUANDO o cálculo roda.

import { supabaseAdmin } from "../supabase";

type CacheEntry = { at: number; data: any };

const store = new Map<string, CacheEntry>();
const refreshing = new Set<string>();
// "Singleflight": promessas de cálculo em andamento, p/ que requisições
// simultâneas no MISS compartilhem o mesmo cálculo em vez de dispararem N vezes.
const inflight = new Map<string, Promise<any>>();

// Limite de entradas pra evitar crescimento ilimitado da memória (a chave do
// operational-grid inclui from/to, então faixas históricas se acumulam). Ao
// estourar, descarta a entrada mais antiga (LRU simples por ordem de inserção).
const MAX_ENTRIES = 200;

// ===================== PERSISTÊNCIA (snapshot no Supabase) =====================
// Todo resultado que entra no cache em memória é espelhado (write-through,
// fire-and-forget) na tabela `swr_cache_snapshots`. No MISS frio (restart/deploy
// zerou a memória), tentamos carregar o snapshot persistido — 1 leitura barata —
// antes de disparar o recálculo pesado. Os NÚMEROS continuam sendo os do último
// cálculo real; muda só de onde o valor é servido.
const PERSIST_TABLE = "swr_cache_snapshots";
// Sob o test runner (node:test), a persistência fica DESLIGADA: senão um
// snapshot de uma rodada anterior ressuscita no MISS do teste (o delete do
// bustSwrCache é fire-and-forget) e o singleflight vira STALE+refresh → flaky.
const PERSIST_DISABLED =
  !!process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === "test";
// Payloads gigantes não valem o custo de rede/storage (e o grid histórico pode
// crescer). Acima disso, a entrada fica só em memória.
const MAX_PERSIST_BYTES = 8_000_000;
// Chaves já procuradas no snapshot nesta vida do processo (evita bater no banco
// a cada MISS de chave que nunca foi persistida).
const persistChecked = new Set<string>();
// Snapshot persistido velho demais (ex.: servidor ficou dias parado) não vale
// servir nem como stale — melhor recalcular do zero do que mostrar dado antigo.
const MAX_PERSIST_AGE_MS = 24 * 60 * 60 * 1000;

function persistEntry(key: string, entry: CacheEntry) {
  if (PERSIST_DISABLED) return;
  try {
    const raw = JSON.stringify(entry.data);
    if (!raw || raw.length > MAX_PERSIST_BYTES) return;
    void supabaseAdmin
      .from(PERSIST_TABLE)
      .upsert(
        { key, payload: entry.data, at: new Date(entry.at).toISOString() },
        { onConflict: "key" },
      )
      .then(({ error }) => {
        if (error && !/42P01|relation .* does not exist/i.test(error.message || "")) {
          console.warn(`[swr-cache] persist ${key} falhou: ${error.message}`);
        }
      });
  } catch {
    // nunca deixar a persistência derrubar a resposta
  }
}

async function loadPersistedEntry(key: string): Promise<CacheEntry | null> {
  persistChecked.add(key);
  if (PERSIST_DISABLED) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from(PERSIST_TABLE)
      .select("payload, at")
      .eq("key", key)
      .maybeSingle();
    if (error || !data || data.payload === undefined || data.payload === null) return null;
    const at = new Date(data.at || 0).getTime();
    if (!at || isNaN(at)) return null;
    if (Date.now() - at > MAX_PERSIST_AGE_MS) return null;
    return { at, data: data.payload };
  } catch {
    return null;
  }
}

/** Busca o snapshot persistido quando a memória está fria (1x por chave/processo). */
async function getEntryWithPersistFallback(key: string): Promise<CacheEntry | undefined> {
  let entry = store.get(key);
  if (!entry && !persistChecked.has(key)) {
    const persisted = await loadPersistedEntry(key);
    if (persisted) {
      setEntry(key, persisted, false);
      entry = persisted;
    }
  }
  return entry;
}

function setEntry(key: string, entry: CacheEntry, persist = true) {
  // re-inserir move a chave pro fim (mais recente) no Map.
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  if (persist) persistEntry(key, entry);
}

export interface SwrCacheOptions {
  /** Validade em ms. Passando disso, serve o valor velho e recalcula em background. */
  ttlMs: number;
  /**
   * Janela "fresco" p/ `?validate=1` (Folha/RH/Balanço).
   * Se age < freshTtlMs → HIT; senão aguarda recálculo (não serve 3h silencioso).
   */
  freshTtlMs?: number;
  /** Prefixo da chave (1 por rota). Os parâmetros de query entram automaticamente. */
  baseKey: string;
  /** Anexa `_cacheMeta` no JSON (status/age/fresh) — opt-in p/ não quebrar testes legados. */
  attachCacheMeta?: boolean;
  /** Schema técnico (ex.: RH_SUMMARY_SCHEMA) espelhado em `_cacheMeta.schema`. */
  schema?: number;
  /**
   * Query-params das chaves a manter aquecidas pelo warm-up serializado
   * (ver startSwrWarmup). Função (não valor) p/ ranges "correntes" (semana/mês)
   * serem recalculados a cada passada.
   */
  warmQueries?: () => Array<Record<string, string>>;
}

type Handler = (req: any, res: any, next?: any) => any;

function buildKey(baseKey: string, req: any): string {
  const q = req?.query || {};
  const parts = Object.keys(q)
    .filter((k) => k !== "cached" && k !== "force" && k !== "validate")
    .sort()
    .map((k) => `${k}=${String(q[k])}`);
  return parts.length ? `${baseKey}?${parts.join("&")}` : baseKey;
}

function attachMeta(
  payload: any,
  opts: SwrCacheOptions,
  status: string,
  ageSec: number,
  computedAtMs: number | null,
  fresh: boolean,
): any {
  if (!opts.attachCacheMeta) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    ...payload,
    _cacheMeta: {
      status,
      ageSec,
      computedAt: computedAtMs ? new Date(computedAtMs).toISOString() : null,
      fresh,
      schema: opts.schema ?? null,
    },
  };
}

// res "fake" que só captura o JSON, usado no recálculo em segundo plano (não há
// resposta HTTP real para enviar nesse caminho).
function makeCaptureRes() {
  const captured: { statusCode: number; payload: any; has: boolean } = {
    statusCode: 200,
    payload: undefined,
    has: false,
  };
  const res: any = {
    statusCode: 200,
    set() { return res; },
    setHeader() { return res; },
    header() { return res; },
    status(code: number) { res.statusCode = code; captured.statusCode = code; return res; },
    json(payload: any) { captured.payload = payload; captured.statusCode = res.statusCode; captured.has = true; return res; },
    send(payload: any) { captured.payload = payload; captured.statusCode = res.statusCode; captured.has = true; return res; },
    end() { return res; },
  };
  return { res, captured };
}

// ===================== WARM-UP SERIALIZADO =====================
// Mantém as chaves mais usadas (dashboard, rh-summary, grid da semana/mês
// correntes) sempre mornas, recalculando UM endpoint por vez com pausa entre
// eles — nunca uma rajada de consultas simultâneas no Supabase.
type WarmupSpec = {
  baseKey: string;
  ttlMs: number;
  handler: Handler;
  queries: () => Array<Record<string, string>>;
};
const warmups: WarmupSpec[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let warmupStarted = false;

/**
 * Inicia o warm-up: primeira passada após `initialDelayMs` (deixa o boot
 * respirar) e depois checagens periódicas. Só recalcula quando a entrada está
 * perto de vencer (75% do TTL) — snapshot persistido fresco conta como quente,
 * então um restart NÃO dispara recálculo desnecessário.
 */
export function startSwrWarmup(opts?: { initialDelayMs?: number; intervalMs?: number; gapMs?: number }) {
  if (warmupStarted) return;
  warmupStarted = true;
  const initialDelayMs = opts?.initialDelayMs ?? 90_000;
  const intervalMs = opts?.intervalMs ?? 15 * 60_000;
  const gapMs = opts?.gapMs ?? 5_000;

  let passRunning = false;
  const runPass = async () => {
    if (passRunning) return;
    passRunning = true;
    try {
      for (const spec of warmups) {
        for (const q of spec.queries()) {
          const req = { query: { ...q, cached: "1" } };
          const key = buildKey(spec.baseKey, req);
          try {
            const entry = await getEntryWithPersistFallback(key);
            const refreshAt = spec.ttlMs * 0.75;
            if (entry && Date.now() - entry.at < refreshAt) continue;
            const t0 = Date.now();
            await refreshKeyNow(key, spec.handler, req);
            console.log(`[swr-warmup] ${key} recalculado em ${Date.now() - t0}ms`);
          } catch (e: any) {
            console.warn(`[swr-warmup] ${key} falhou: ${e?.message || e}`);
          }
          // pausa entre chaves: nunca dois recálculos pesados colados
          await sleep(gapMs);
        }
      }
    } finally {
      passRunning = false;
    }
  };

  setTimeout(() => {
    runPass().catch((e) => console.warn("[swr-warmup] passada falhou:", e?.message || e));
    setInterval(() => {
      runPass().catch((e) => console.warn("[swr-warmup] passada falhou:", e?.message || e));
    }, intervalMs);
  }, initialDelayMs);
}

/** Recalcula uma chave via captureRes e atualiza o cache. Versão await-ável. */
async function refreshKeyNow(key: string, handler: Handler, req: any): Promise<void> {
  if (refreshing.has(key)) return;
  refreshing.add(key);
  try {
    const { res, captured } = makeCaptureRes();
    await handler(req, res);
    if (captured.has && captured.statusCode === 200 && captured.payload !== undefined) {
      setEntry(key, { at: Date.now(), data: captured.payload });
    }
  } catch {
    // mantém o valor antigo no cache; tenta de novo no próximo acesso
  } finally {
    refreshing.delete(key);
  }
}

function triggerBackgroundRefresh(key: string, handler: Handler, req: any) {
  void refreshKeyNow(key, handler, req);
}

/**
 * Embrulha um handler Express adicionando cache stale-while-revalidate quando a
 * requisição vier com `?cached=1`.
 * - `?force=1` — recalcula na hora (Sincronizar).
 * - `?validate=1` — se age >= freshTtlMs (ou sem freshTtl), aguarda recálculo;
 *   se ainda fresco, serve HIT. Impede F5 silencioso com dado de até 3h.
 */
export function withSwrCache(opts: SwrCacheOptions, handler: Handler): Handler {
  if (opts.warmQueries) {
    warmups.push({ baseKey: opts.baseKey, ttlMs: opts.ttlMs, handler, queries: opts.warmQueries });
  }
  return async (req: any, res: any, next: any) => {
    if (req?.query?.cached !== "1") return handler(req, res, next);

    const key = buildKey(opts.baseKey, req);
    const now = Date.now();
    const wantForce = req.query.force === "1";
    const wantValidate = req.query.validate === "1";
    const freshTtl = opts.freshTtlMs != null ? opts.freshTtlMs : opts.ttlMs;
    res.set("Cache-Control", "no-store");

    const purgeKey = () => {
      store.delete(key);
      if (!PERSIST_DISABLED) {
        void supabaseAdmin.from(PERSIST_TABLE).delete().eq("key", key).then(() => {});
      }
      persistChecked.delete(key);
    };

    // Snapshot anterior (antes de purge) — fallback explícito se o recálculo falhar.
    const prior = await getEntryWithPersistFallback(key);
    const softCopy: CacheEntry | null = prior
      ? { at: prior.at, data: prior.data }
      : null;
    // Preserva o json original — fallback STALE não pode passar pelo override.
    const sendJson = res.json.bind(res);

    if (wantForce) purgeKey();

    let entry = wantForce ? undefined : prior;

    // validate=1: se não há entry fresco o bastante → aguarda recálculo (como force).
    if (wantValidate && !wantForce) {
      const ageMs = entry ? now - entry.at : Infinity;
      if (!entry || ageMs >= freshTtl) {
        purgeKey();
        entry = undefined;
      }
    }

    const serveSoftStale = (): boolean => {
      if (!softCopy) return false;
      // Restaura só em memória (não regrava snapshot como se fosse sucesso).
      setEntry(key, softCopy, false);
      const ageSec = Math.floor((Date.now() - softCopy.at) / 1000);
      res.statusCode = 200;
      res.set("X-Cache", "STALE");
      res.set("X-Cache-Age", String(ageSec));
      res.set("X-Cache-Fresh", "0");
      sendJson(attachMeta(softCopy.data, opts, "STALE", ageSec, softCopy.at, false));
      return true;
    };

    if (entry && now - entry.at < opts.ttlMs) {
      const ageSec = Math.floor((now - entry.at) / 1000);
      const fresh = ageSec * 1000 < freshTtl;
      // Sem validate: HIT dentro do hard TTL (legado). Com validate já filtramos acima.
      res.set("X-Cache", "HIT");
      res.set("X-Cache-Age", String(ageSec));
      res.set("X-Cache-Fresh", fresh ? "1" : "0");
      return res.json(attachMeta(entry.data, opts, "HIT", ageSec, entry.at, fresh));
    }

    if (entry && !wantForce && !wantValidate) {
      // STALE legado: responde antigo + refresh background (grid/dashboard sem validate).
      const ageSec = Math.floor((now - entry.at) / 1000);
      res.set("X-Cache", "STALE");
      res.set("X-Cache-Age", String(ageSec));
      res.set("X-Cache-Fresh", "0");
      res.json(attachMeta(entry.data, opts, "STALE", ageSec, entry.at, false));
      triggerBackgroundRefresh(key, handler, req);
      return;
    }

    // validate/force com entry além do hard TTL — purga e recalcula.
    if (entry && (wantForce || wantValidate)) {
      purgeKey();
      entry = undefined;
    }

    const pending = inflight.get(key);
    if (pending) {
      try {
        const payload = await pending;
        const label = wantForce ? "FORCE" : wantValidate ? "VALIDATE" : "HIT";
        res.set("X-Cache", label);
        res.set("X-Cache-Age", "0");
        res.set("X-Cache-Fresh", "1");
        return res.json(attachMeta(payload, opts, label, 0, Date.now(), true));
      } catch {
        if ((wantForce || wantValidate) && serveSoftStale()) return;
        /* líder falhou e sem soft — cai no recálculo próprio abaixo */
      }
    }

    const cacheLabel = wantForce ? "FORCE" : wantValidate ? "VALIDATE" : "MISS";
    res.set("X-Cache", cacheLabel);
    res.set("X-Cache-Age", "0");
    res.set("X-Cache-Fresh", "1");
    let resolveInflight: (v: any) => void = () => {};
    let rejectInflight: (e: any) => void = () => {};
    const promise = new Promise<any>((resolve, reject) => { resolveInflight = resolve; rejectInflight = reject; });
    promise.catch(() => {});
    inflight.set(key, promise);

    let settled = false;
    res.json = (payload: any) => {
      if ((res.statusCode || 200) === 200 && payload !== undefined) {
        const at = Date.now();
        setEntry(key, { at, data: payload });
        if (!settled) { settled = true; resolveInflight(payload); inflight.delete(key); }
        return sendJson(attachMeta(payload, opts, cacheLabel, 0, at, true));
      }
      if (!settled) {
        settled = true; rejectInflight(new Error("non-200")); inflight.delete(key);
      }
      // validate/force falhou: não devolver erro cru se há snapshot — banner no cliente.
      if ((wantForce || wantValidate) && softCopy) {
        const ageSec = Math.floor((Date.now() - softCopy.at) / 1000);
        setEntry(key, softCopy, false);
        res.statusCode = 200;
        res.set("X-Cache", "STALE");
        res.set("X-Cache-Age", String(ageSec));
        res.set("X-Cache-Fresh", "0");
        return sendJson(attachMeta(softCopy.data, opts, "STALE", ageSec, softCopy.at, false));
      }
      return sendJson(payload);
    };
    try {
      return await handler(req, res, next);
    } catch (err) {
      if (!settled) { settled = true; rejectInflight(err); inflight.delete(key); }
      if ((wantForce || wantValidate) && serveSoftStale()) return;
      throw err;
    }
  };
}

/** Invalida entradas do cache (todas, ou as que começam com o prefixo). */
export function bustSwrCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    inflight.clear();
    persistChecked.clear();
    if (!PERSIST_DISABLED) {
      void supabaseAdmin.from(PERSIST_TABLE).delete().neq("key", "").then(() => {});
    }
    return;
  }
  for (const k of Array.from(store.keys())) {
    if (k === prefix || k.startsWith(prefix)) store.delete(k);
  }
  for (const k of Array.from(inflight.keys())) {
    if (k === prefix || k.startsWith(prefix)) inflight.delete(k);
  }
  for (const k of Array.from(persistChecked)) {
    if (k === prefix || k.startsWith(prefix)) persistChecked.delete(k);
  }
  // remove snapshots persistidos do prefixo (senão o MISS frio ressuscita dado invalidado)
  if (!PERSIST_DISABLED) {
    void supabaseAdmin.from(PERSIST_TABLE).delete().like("key", `${prefix}%`).then(() => {});
  }
}
