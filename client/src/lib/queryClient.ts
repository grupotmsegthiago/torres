import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

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
};

type InvalidationScope = "vehicle" | "employee" | "billing" | "financial" | "service-order" | "mission-cost";

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

function _invalidateLocal(scope: InvalidationScope) {
  const keys = GLOBAL_QUERY_KEYS;
  const inv = (k: string[]) => queryClient.invalidateQueries({ queryKey: k });

  if (scope === "vehicle") {
    inv(keys.vehicles);
    inv(keys.financialDashboard);
    inv(keys.operationalGrid);
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
}

export function invalidateRelatedQueries(scope: InvalidationScope) {
  _invalidateLocal(scope);
  _channel?.postMessage({ type: "invalidate", scope });
}

export function invalidateAllQueries() {
  queryClient.invalidateQueries();
  _channel?.postMessage({ type: "invalidate-all" });
}

const AUTO_REFRESH_MS = 60_000;
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
    }
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
