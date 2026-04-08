import { createClient } from "@supabase/supabase-js";
import { setSupabaseHealth } from "./pg-fallback";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 5000;

let consecutiveFailures = 0;
let consecutiveSuccesses = 0;
let lastHealthChange = 0;
const HEALTH_CHANGE_COOLDOWN = 30_000;

function resilientFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return attemptFetch(url, init, 0);
}

async function attemptFetch(url: RequestInfo | URL, init: RequestInit | undefined, attempt: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      keepalive: true,
    });
    clearTimeout(timeout);
    consecutiveFailures = 0;
    consecutiveSuccesses++;
    if (consecutiveSuccesses >= 3) {
      const now = Date.now();
      if (now - lastHealthChange > HEALTH_CHANGE_COOLDOWN) {
        lastHealthChange = now;
        setSupabaseHealth(true);
      }
    }
    return response;
  } catch (err: any) {
    clearTimeout(timeout);
    consecutiveSuccesses = 0;
    consecutiveFailures++;

    if (consecutiveFailures >= 3) {
      const now = Date.now();
      if (now - lastHealthChange > HEALTH_CHANGE_COOLDOWN) {
        lastHealthChange = now;
        setSupabaseHealth(false);
      }
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
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
