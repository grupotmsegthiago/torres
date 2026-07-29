/**
 * Fetch de endpoints SWR do Balanço/Folha com metadados de cache.
 * - validate=1 no mount/F5 (revalida se age >= freshTtl)
 * - force=1 no Sincronizar (sempre recalcula e espera)
 */
import type { CacheMeta, CacheStatus } from "@shared/cache-keys";
import { authFetch } from "./queryClient";

export type CachedJsonResult<T> = {
  data: T;
  meta: CacheMeta;
  headers: { cache: string; ageSec: number; fresh: boolean };
};

function parseMeta(res: Response, body: any): CacheMeta {
  const status = (res.headers.get("X-Cache") || body?._cacheMeta?.status || "MISS") as CacheStatus;
  const ageSec = Number(res.headers.get("X-Cache-Age") ?? body?._cacheMeta?.ageSec ?? 0) || 0;
  const freshHeader = res.headers.get("X-Cache-Fresh");
  const fresh =
    freshHeader != null
      ? freshHeader === "1"
      : Boolean(body?._cacheMeta?.fresh ?? (status === "MISS" || status === "FORCE" || status === "VALIDATE" || ageSec === 0));
  return {
    status,
    ageSec,
    computedAt: body?._cacheMeta?.computedAt ?? null,
    fresh,
    schema: body?._cacheMeta?.schema ?? undefined,
  };
}

/** Remove `_cacheMeta` do payload para não poluir consumidores. */
export function stripCacheMeta<T>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { _cacheMeta: _, ...rest } = body as any;
  return rest as T;
}

export async function fetchCachedJson<T = unknown>(
  url: string,
  mode: "validate" | "force" = "validate",
): Promise<CachedJsonResult<T>> {
  const sep = url.includes("?") ? "&" : "?";
  const flag = mode === "force" ? "force=1" : "validate=1";
  const full = `${url}${sep}cached=1&${flag}`;
  const res = await authFetch(full);
  if (!res.ok) throw new Error(`Falha ao carregar (${res.status})`);
  const body = await res.json();
  const meta = parseMeta(res, body);
  return {
    data: stripCacheMeta(body) as T,
    meta,
    headers: { cache: meta.status, ageSec: meta.ageSec, fresh: meta.fresh },
  };
}

/** Observabilidade segura (sem PII) — console estruturado. */
export function logCacheEvent(event: string, detail: Record<string, string | number | boolean | null | undefined>) {
  try {
    console.info(`[cache] ${event}`, detail);
  } catch { /* noop */ }
}

/** Formata idade do cache para banner (sem PII). */
export function formatCacheAge(ageSec: number): string {
  if (!Number.isFinite(ageSec) || ageSec < 0) return "idade desconhecida";
  if (ageSec < 60) return `${ageSec}s`;
  const min = Math.floor(ageSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}
