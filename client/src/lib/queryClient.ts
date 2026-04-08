import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

const CACHE_VERSION = "20260408-tz-fix-v3";
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("torres_cache_version");
  if (stored && stored !== CACHE_VERSION) {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("torres_cache_version", CACHE_VERSION);
    window.location.reload();
  } else if (!stored) {
    localStorage.setItem("torres_cache_version", CACHE_VERSION);
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    if (data?.session?.access_token) {
      return fetch(url, {
        ...init,
        headers: {
          "Authorization": `Bearer ${data.session.access_token}`,
          ...(init?.headers || {}),
        },
      });
    }
  }
  return res;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData?.session?.access_token) {
      const retryRes = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${refreshData.session.access_token}`,
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      await throwIfResNotOk(retryRes);
      return retryRes;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const GLOBAL_QUERY_KEYS = {
  vehicles: ["/api/vehicles"],
  employees: ["/api/employees"],
  serviceOrders: ["/api/service-orders"],
  operationalGrid: ["/api/operational-grid"],
  escortBillings: ["/api/escort/billings"],
  escortContracts: ["/api/escort/contracts"],
  boletimOs: ["/api/boletim-medicao/os-concluidas"],
  financialTx: ["/api/financial/transactions"],
  financialResumo: ["/api/financial/resumo"],
  financialDashboard: ["/api/financial/dashboard"],
  weaponKits: ["/api/weapon-kits"],
  vehicleTracking: ["/api/vehicle-tracking"],
  fueling: ["/api/fueling"],
  missionUpdates: ["/api/mission/updates"],
  clients: ["/api/clients"],
  invoices: ["/api/invoices"],
  ponto: ["/api/ponto-operacional"],
  timesheets: ["/api/employees"],
  holerites: ["/api/holerites"],
};

type InvalidationScope = "vehicle" | "employee" | "billing" | "financial" | "service-order" | "mission-cost" | "mission-update" | "client" | "invoice" | "hr" | "jornada-diretoria";

const _channel: BroadcastChannel | null = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("torres-sync")
  : null;

if (_channel) {
  _channel.onmessage = (e) => {
    if (e.data?.type === "invalidate" && e.data?.scope) {
      _invalidateLocal(e.data.scope as InvalidationScope);
    }
    if (e.data?.type === "invalidate-all") {
      queryClient.invalidateQueries();
    }
  };
}

let _pendingScopes = new Set<InvalidationScope>();
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function _flushInvalidations() {
  const scopes = [..._pendingScopes];
  _pendingScopes.clear();
  _debounceTimer = null;

  const keys = GLOBAL_QUERY_KEYS;
  const done = new Set<string>();
  const inv = (k: string[]) => {
    const key = k.join("|");
    if (done.has(key)) return;
    done.add(key);
    queryClient.invalidateQueries({ queryKey: k });
  };

  for (const scope of scopes) {
    _applyInvalidation(scope, inv, keys);
  }
}

function _invalidateLocal(scope: InvalidationScope) {
  _pendingScopes.add(scope);
  if (!_debounceTimer) {
    _debounceTimer = setTimeout(_flushInvalidations, 500);
  }
}

function _applyInvalidation(scope: InvalidationScope, inv: (k: string[]) => void, keys: typeof GLOBAL_QUERY_KEYS) {
  if (scope === "vehicle") {
    inv(keys.vehicles);
    inv(keys.fueling);
    inv(keys.financialDashboard);
    inv(keys.financialResumo);
    inv(keys.financialTx);
    inv(keys.operationalGrid);
    inv(keys.serviceOrders);
  }
  if (scope === "employee") {
    inv(keys.employees);
    inv(keys.financialDashboard);
    inv(keys.operationalGrid);
  }
  if (scope === "billing") {
    inv(keys.escortBillings);
    inv(keys.escortContracts);
    inv(keys.boletimOs);
    inv(keys.serviceOrders);
    inv(keys.operationalGrid);
    inv(keys.financialTx);
    inv(keys.financialResumo);
    inv(keys.financialDashboard);
  }
  if (scope === "financial") {
    inv(keys.financialTx);
    inv(keys.financialResumo);
    inv(keys.financialDashboard);
    inv(keys.escortBillings);
  }
  if (scope === "service-order") {
    inv(keys.serviceOrders);
    inv(keys.operationalGrid);
    inv(keys.escortBillings);
    inv(keys.boletimOs);
    inv(keys.vehicles);
    inv(keys.financialDashboard);
    inv(keys.financialTx);
    inv(keys.financialResumo);
    inv(keys.weaponKits);
    inv(keys.vehicleTracking);
    inv(keys.missionUpdates);
  }
  if (scope === "mission-cost") {
    inv(keys.serviceOrders);
    inv(keys.escortBillings);
    inv(keys.boletimOs);
    inv(keys.financialTx);
    inv(keys.financialResumo);
    inv(keys.financialDashboard);
    inv(keys.operationalGrid);
  }
  if (scope === "mission-update") {
    inv(keys.missionUpdates);
    queryClient.invalidateQueries({ queryKey: ["/api/mission/updates", "unread"] });
    inv(keys.operationalGrid);
    inv(keys.serviceOrders);
  }
  if (scope === "client") {
    inv(keys.clients);
    inv(keys.escortContracts);
    inv(keys.escortBillings);
    inv(keys.serviceOrders);
    inv(keys.operationalGrid);
  }
  if (scope === "invoice") {
    inv(keys.invoices);
    inv(keys.escortBillings);
    inv(keys.financialTx);
    inv(keys.financialResumo);
    inv(keys.financialDashboard);
  }
  if (scope === "hr") {
    inv(keys.employees);
    inv(keys.ponto);
    inv(keys.timesheets);
    inv(keys.holerites);
    queryClient.invalidateQueries({ queryKey: ["/api/my/hr-summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mobile/ponto/today"] });
  }
  if (scope === "jornada-diretoria") {
    queryClient.invalidateQueries({ queryKey: ["/api/jornada-diretoria"] });
    queryClient.invalidateQueries({ queryKey: ["/api/jornada-diretoria/alertas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/jornada-calculos"] });
    inv(keys.holerites);
  }
}

export function invalidateRelatedQueries(scope: InvalidationScope) {
  _invalidateLocal(scope);
  _channel?.postMessage({ type: "invalidate", scope });
}

export function invalidateAllQueries() {
  queryClient.invalidateQueries();
  _channel?.postMessage({ type: "invalidate-all" });
}

const AUTO_REFRESH_MS = 120_000;
let _autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoRefresh() {
  if (_autoRefreshTimer) return;
  _autoRefreshTimer = setInterval(() => {
    queryClient.invalidateQueries();
  }, AUTO_REFRESH_MS);
}

export function stopAutoRefresh() {
  if (_autoRefreshTimer) {
    clearInterval(_autoRefreshTimer);
    _autoRefreshTimer = null;
  }
}

if (typeof window !== "undefined") {
  startAutoRefresh();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      queryClient.invalidateQueries();
      startAutoRefresh();
      _ensureRealtimeAlive();
    }
  });

  function _buildRealtimeChannel(name: string) {
    return supabase.channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_costs" }, () => {
        _invalidateLocal("mission-cost");
        _invalidateLocal("financial");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_transactions" }, () => {
        _invalidateLocal("financial");
        _invalidateLocal("mission-cost");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_fueling" }, () => {
        _invalidateLocal("vehicle");
        _invalidateLocal("financial");
        _invalidateLocal("mission-cost");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => {
        _invalidateLocal("service-order");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_updates" }, () => {
        _invalidateLocal("mission-update");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "escort_billings" }, () => {
        _invalidateLocal("billing");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_alerts" }, () => {
        _invalidateLocal("jornada-diretoria");
        _invalidateLocal("billing");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_presence" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/presence"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        _invalidateLocal("invoice");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
        _invalidateLocal("client");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        _invalidateLocal("employee");
        _invalidateLocal("hr");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => {
        _invalidateLocal("vehicle");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ponto_registros" }, () => {
        _invalidateLocal("hr");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "timesheets" }, () => {
        _invalidateLocal("hr");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holerites" }, () => {
        _invalidateLocal("hr");
        _invalidateLocal("jornada-diretoria");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      });
  }

  let _realtimeGeneration = 0;
  let _activeChannel: ReturnType<typeof supabase.channel> | null = null;
  let _realtimeConnected = false;
  let _lastRealtimeEvent = Date.now();
  let _retryDelay = 3000;
  const _RETRY_MIN = 3000;
  const _RETRY_MAX = 60000;
  let _retryTimer: ReturnType<typeof setTimeout> | null = null;
  let _reconnecting = false;

  function _scheduleRetry() {
    if (_retryTimer) clearTimeout(_retryTimer);
    const delay = Math.min(_retryDelay, _RETRY_MAX);
    console.warn(`[Realtime] retrying in ${Math.round(delay / 1000)}s`);
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _subscribeRealtime();
    }, delay);
    _retryDelay = Math.min(_retryDelay * 2, _RETRY_MAX);
  }

  function _subscribeRealtime() {
    if (_reconnecting) return;
    _reconnecting = true;

    if (_activeChannel) {
      try { supabase.removeChannel(_activeChannel); } catch {}
      _activeChannel = null;
    }
    _realtimeConnected = false;
    _realtimeGeneration++;
    const gen = _realtimeGeneration;

    try {
      const ch = _buildRealtimeChannel(`realtime-sync-${gen}`)
        .subscribe((status, err) => {
          if (gen !== _realtimeGeneration) {
            try { supabase.removeChannel(ch); } catch {}
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Realtime] channel error:", err?.message ?? status);
            _realtimeConnected = false;
            _reconnecting = false;
            try { supabase.removeChannel(ch); } catch {}
            if (gen === _realtimeGeneration) {
              _scheduleRetry();
            }
          }
          if (status === "SUBSCRIBED") {
            const wasDisconnected = !_realtimeConnected;
            console.log("[Realtime] connected OK");
            _realtimeConnected = true;
            _lastRealtimeEvent = Date.now();
            _activeChannel = ch;
            _reconnecting = false;
            _retryDelay = _RETRY_MIN;
            if (wasDisconnected) {
              queryClient.invalidateQueries();
            }
          }
        });
    } catch {
      _reconnecting = false;
      _scheduleRetry();
    }
  }

  function _ensureRealtimeAlive() {
    if (_reconnecting || _retryTimer) return;
    const staleMs = Date.now() - _lastRealtimeEvent;
    if (!_realtimeConnected || staleMs > 300_000) {
      console.log("[Realtime] heartbeat: reconnecting (connected:", _realtimeConnected, "stale:", Math.round(staleMs / 1000), "s)");
      _subscribeRealtime();
    }
  }

  _subscribeRealtime();

  setInterval(_ensureRealtimeAlive, 60_000);

  window.addEventListener("online", () => {
    console.log("[Network] Online detected, refreshing all queries");
    queryClient.invalidateQueries();
    startAutoRefresh();
    _retryDelay = _RETRY_MIN;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    _reconnecting = false;
    setTimeout(_subscribeRealtime, 1000);
  });

  window.addEventListener("offline", () => {
    console.log("[Network] Offline detected");
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    _reconnecting = false;
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 0,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
