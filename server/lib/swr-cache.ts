// Cache "stale-while-revalidate" em memória, opt-in por requisição (?cached=1).
//
// Objetivo: telas pesadas (ex.: Balanço Gerencial) abrem instantâneo servindo o
// último resultado calculado e o servidor recalcula em segundo plano só quando o
// dado passa do TTL (padrão 3h). Quem NÃO manda ?cached=1 (Painel Operacional ao
// vivo, Relatório de OS, Custos Fixos) continua recebendo a resposta calculada na
// hora — comportamento idêntico ao de antes. Como apenas embrulha o handler
// existente, os NÚMEROS são exatamente os mesmos; muda só QUANDO o cálculo roda.

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

function setEntry(key: string, entry: CacheEntry) {
  // re-inserir move a chave pro fim (mais recente) no Map.
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export interface SwrCacheOptions {
  /** Validade em ms. Passando disso, serve o valor velho e recalcula em background. */
  ttlMs: number;
  /** Prefixo da chave (1 por rota). Os parâmetros de query entram automaticamente. */
  baseKey: string;
}

type Handler = (req: any, res: any, next?: any) => any;

function buildKey(baseKey: string, req: any): string {
  const q = req?.query || {};
  const parts = Object.keys(q)
    .filter((k) => k !== "cached" && k !== "force")
    .sort()
    .map((k) => `${k}=${String(q[k])}`);
  return parts.length ? `${baseKey}?${parts.join("&")}` : baseKey;
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

function triggerBackgroundRefresh(key: string, handler: Handler, req: any) {
  if (refreshing.has(key)) return;
  refreshing.add(key);
  (async () => {
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
  })();
}

/**
 * Embrulha um handler Express adicionando cache stale-while-revalidate quando a
 * requisição vier com `?cached=1`. `?force=1` (junto com cached=1) recalcula na
 * hora e atualiza o cache (botão "Atualizar agora").
 */
export function withSwrCache(opts: SwrCacheOptions, handler: Handler): Handler {
  return async (req: any, res: any, next: any) => {
    if (req?.query?.cached !== "1") return handler(req, res, next);

    const key = buildKey(opts.baseKey, req);
    const now = Date.now();

    if (req.query.force === "1") store.delete(key);

    const entry = store.get(key);
    res.set("Cache-Control", "no-store");

    if (entry && now - entry.at < opts.ttlMs) {
      res.set("X-Cache", "HIT");
      res.set("X-Cache-Age", String(Math.floor((now - entry.at) / 1000)));
      return res.json(entry.data);
    }

    if (entry) {
      // velho: responde já com o que tem e recalcula em segundo plano
      res.set("X-Cache", "STALE");
      res.set("X-Cache-Age", String(Math.floor((now - entry.at) / 1000)));
      res.json(entry.data);
      triggerBackgroundRefresh(key, handler, req);
      return;
    }

    // sem cache: se já há um cálculo em andamento p/ essa chave (singleflight),
    // espera ele e serve o mesmo resultado em vez de recalcular em paralelo.
    const pending = inflight.get(key);
    if (pending) {
      try {
        const payload = await pending;
        res.set("X-Cache", "HIT");
        res.set("X-Cache-Age", "0");
        return res.json(payload);
      } catch {
        // o líder falhou; cai pro cálculo normal abaixo
      }
    }

    // líder: calcula na hora, guarda o sucesso e compartilha via inflight.
    res.set("X-Cache", "MISS");
    res.set("X-Cache-Age", "0");
    let resolveInflight: (v: any) => void = () => {};
    let rejectInflight: (e: any) => void = () => {};
    const promise = new Promise<any>((resolve, reject) => { resolveInflight = resolve; rejectInflight = reject; });
    promise.catch(() => {}); // evita unhandledRejection quando não há follower aguardando
    inflight.set(key, promise);

    const origJson = res.json.bind(res);
    let settled = false;
    res.json = (payload: any) => {
      if ((res.statusCode || 200) === 200 && payload !== undefined) {
        setEntry(key, { at: Date.now(), data: payload });
        if (!settled) { settled = true; resolveInflight(payload); inflight.delete(key); }
      } else if (!settled) {
        settled = true; rejectInflight(new Error("non-200")); inflight.delete(key);
      }
      return origJson(payload);
    };
    try {
      return await handler(req, res, next);
    } catch (err) {
      if (!settled) { settled = true; rejectInflight(err); inflight.delete(key); }
      throw err;
    }
  };
}

/** Invalida entradas do cache (todas, ou as que começam com o prefixo). */
export function bustSwrCache(prefix?: string) {
  if (!prefix) { store.clear(); inflight.clear(); return; }
  for (const k of Array.from(store.keys())) {
    if (k === prefix || k.startsWith(prefix)) store.delete(k);
  }
  for (const k of Array.from(inflight.keys())) {
    if (k === prefix || k.startsWith(prefix)) inflight.delete(k);
  }
}
