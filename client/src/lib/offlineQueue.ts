import { supabase } from "./supabase";

const QUEUE_KEY = "torres_offline_queue";

interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body: any;
  createdAt: string;
  retries: number;
}

function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueAction(url: string, method: string, body: any) {
  const queue = getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    method,
    body,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  saveQueue(queue);
}

export function getPendingCount(): number {
  return getQueue().length;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const queue = getQueue();
  if (!queue.length) return { sent: 0, failed: 0 };

  const token = await getAuthToken();
  if (!token) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(action.body),
      });
      if (res.ok) {
        sent++;
      } else if (res.status === 401) {
        const { data } = await supabase.auth.refreshSession();
        if (data?.session?.access_token) {
          const retry = await fetch(action.url, {
            method: action.method,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${data.session.access_token}`,
            },
            body: JSON.stringify(action.body),
          });
          if (retry.ok) { sent++; continue; }
        }
        action.retries++;
        if (action.retries < 5) remaining.push(action);
        else failed++;
      } else {
        action.retries++;
        if (action.retries < 5) remaining.push(action);
        else failed++;
      }
    } catch {
      action.retries++;
      if (action.retries < 5) remaining.push(action);
      else failed++;
    }
  }

  saveQueue(remaining);
  return { sent, failed };
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startOfflineSync(onSync?: (result: { sent: number; failed: number }) => void) {
  if (syncInterval) return;

  const trySync = async () => {
    if (!navigator.onLine) return;
    const count = getPendingCount();
    if (count === 0) return;
    const result = await flushQueue();
    if (onSync) onSync(result);
  };

  window.addEventListener("online", trySync);
  syncInterval = setInterval(trySync, 15000);
  trySync();
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function isNetworkError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) return true;
  if (error instanceof TypeError && error.message.toLowerCase().includes("network")) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return false;
}
