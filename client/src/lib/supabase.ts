import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    // Subido de 2 → 10: com ~38 tabelas nos canais globais (incl. GPS de alta
    // frequência), o orçamento de 2 eventos/s era consumido pelas tabelas
    // ruidosas e os eventos do WhatsApp (baixo volume, mas críticos) eram
    // descartados/atrasados — exigindo F5 pra ver msg nova.
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
});
