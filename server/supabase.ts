import { createClient } from "@supabase/supabase-js";
import { setSupabaseHealth } from "./pg-fallback";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT = 16;
const HEALTH_WINDOW_SIZE = 40;
const HEALTH_FAIL_RATIO = 0.75;
const HEALTH_RECOVER_RATIO = 0.3;
// Cooldown assimétrico: entrar em fallback é caro (manda email + alerta),
// então 90s pra evitar flapping. Voltar pra primário é barato/seguro,
// então só 30s — não queremos ficar travados no fallback após Supabase recuperar.
const HEALTH_COOLDOWN_DOWN_MS = 90_000;
const HEALTH_COOLDOWN_UP_MS = 30_000;
const MIN_RESULTS_FOR_DECISION = 15;
// Atalho de recuperação rápida: se N requisições consecutivas passarem
// E já passou o cooldown UP, força HEALTHY ignorando o ratio da janela
// (a janela pode demorar pra "esquecer" os fails antigos quando o tráfego é baixo).
const CONSECUTIVE_SUCCESS_FOR_RECOVERY = 10;

let activeFetches = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeFetches++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeFetches--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    next();
  }
}

const healthWindow: boolean[] = [];
let lastHealthChange = 0;
let currentHealthState = true;
let consecutiveSuccesses = 0;

function recordResult(success: boolean): void {
  healthWindow.push(success);
  if (healthWindow.length > HEALTH_WINDOW_SIZE) {
    healthWindow.shift();
  }

  if (success) consecutiveSuccesses++;
  else consecutiveSuccesses = 0;

  const now = Date.now();

  // Recuperação rápida por sucessos consecutivos — antes mesmo do MIN_RESULTS_FOR_DECISION.
  // Resolve o caso onde o sistema fica travado em fallback porque a janela rolante
  // ainda guarda fails antigos quando o tráfego pós-recovery é baixo.
  if (
    !currentHealthState &&
    consecutiveSuccesses >= CONSECUTIVE_SUCCESS_FOR_RECOVERY &&
    now - lastHealthChange > HEALTH_COOLDOWN_UP_MS
  ) {
    currentHealthState = true;
    lastHealthChange = now;
    healthWindow.length = 0;
    setSupabaseHealth(true);
    console.log(`[supabase] Health: ONLINE (recovered fast — ${consecutiveSuccesses} sucessos consecutivos)`);
    return;
  }

  if (healthWindow.length < MIN_RESULTS_FOR_DECISION) return;

  const failures = healthWindow.filter((r) => !r).length;
  const failRatio = failures / healthWindow.length;

  if (currentHealthState && failRatio >= HEALTH_FAIL_RATIO) {
    if (now - lastHealthChange > HEALTH_COOLDOWN_DOWN_MS) {
      currentHealthState = false;
      lastHealthChange = now;
      setSupabaseHealth(false);
      console.warn(`[supabase] Health: OFFLINE (${failures}/${healthWindow.length} failures, ratio ${(failRatio * 100).toFixed(0)}%)`);
    }
  } else if (!currentHealthState && failRatio <= HEALTH_RECOVER_RATIO) {
    if (now - lastHealthChange > HEALTH_COOLDOWN_UP_MS) {
      currentHealthState = true;
      lastHealthChange = now;
      healthWindow.length = 0;
      setSupabaseHealth(true);
      console.log(`[supabase] Health: ONLINE (recovered, ratio ${(failRatio * 100).toFixed(0)}%)`);
    }
  }
}

async function resilientFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await acquireSlot();
  const fetchStart = Date.now();
  try {
    const response = await attemptFetch(url, init, 0);
    const fetchDuration = Date.now() - fetchStart;
    if (fetchDuration > 500) {
      const method = init?.method || "GET";
      const urlStr = typeof url === "string" ? url : url.toString();
      const path = urlStr.replace(/https?:\/\/[^/]+/, "").split("?")[0];
      console.warn(`[SLOW-SUPA] ${method} ${path} took ${fetchDuration}ms`);
    }
    return response;
  } finally {
    releaseSlot();
  }
}

function flattenHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

async function attemptFetch(url: RequestInfo | URL, init: RequestInit | undefined, attempt: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const mergedHeaders = {
      ...flattenHeaders(init?.headers),
      "Connection": "keep-alive",
    };
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      keepalive: true,
      headers: mergedHeaders,
    });
    clearTimeout(timeout);

    if (response.status === 521 || response.status === 502 || response.status === 503) {
      recordResult(false);
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise((r) => setTimeout(r, delay));
        return attemptFetch(url, init, attempt + 1);
      }
      throw new Error(`Supabase HTTP ${response.status}`);
    }

    recordResult(true);
    return response;
  } catch (err: any) {
    clearTimeout(timeout);
    recordResult(false);

    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
      return attemptFetch(url, init, attempt + 1);
    }

    throw err;
  }
}

const sharedOpts = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: resilientFetch,
  },
  db: { schema: "public" as const },
};

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, sharedOpts);

export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, sharedOpts);

export function getSupabaseStats() {
  const failures = healthWindow.filter((r) => !r).length;
  return {
    healthy: currentHealthState,
    activeFetches,
    queuedFetches: waitQueue.length,
    windowSize: healthWindow.length,
    windowFailures: failures,
    failRatio: healthWindow.length > 0 ? Math.round((failures / healthWindow.length) * 100) : 0,
  };
}
