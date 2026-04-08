import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const sharedOpts = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
  db: { schema: "public" as const },
};

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, sharedOpts);

export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, sharedOpts);
