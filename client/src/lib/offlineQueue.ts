import { supabase } from "./supabase";

const QUEUE_KEY = "torres_offline_queue";
const MAX_RETRIES = 12;

type SyncStatus = "idle" | "syncing" | "pending" | "failed";

interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body: any;
  createdAt: string;
  retries: number;
}

interface SyncEvent {
  pendingCount: number;
  status: SyncStatus;
  flushResult?: { sent: number; failed: number; eventId: number };
}

type QueueListener = (info: SyncEvent) => void;

const listeners = new Set<QueueListener>();
let currentStatus: SyncStatus = "idle";
let flushEventCounter = 0;
let latestFlushResult: { sent: number; failed: number; eventId: number } | undefined;

function notify(flushResult?: { sent: number; failed: number; eventId: number }) {
  const count = getQueue().length;
  const info: SyncEvent = { pendingCount: count, status: currentStatus, flushResult };
  listeners.forEach((fn) => fn(info));
}

export function subscribeQueue(fn: QueueListener): () => void {
  listeners.add(fn);
  fn({ pendingCount: getQueue().length, status: currentStatus });
  return () => { listeners.delete(fn); };
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
  currentStatus = "pending";
  notify();
  scheduleImmediateFlush();
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

const BACKOFF_STEPS_MS = [5000, 10000, 20000, 30000];

function getBackoffMs(retries: number): number {
  const idx = Math.min(retries, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[idx] + Math.random() * 1000;
}

let flushing = false;

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;

  const queue = getQueue();
  if (!queue.length) {
    flushing = false;
    currentStatus = "idle";
    notify();
    return { sent: 0, failed: 0 };
  }

  const token = await getAuthToken();
  if (!token) {
    flushing = false;
    currentStatus = "pending";
    notify();
    return { sent: 0, failed: 0 };
  }

  currentStatus = "syncing";
  notify();

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
        if (action.retries < MAX_RETRIES) remaining.push(action);
        else failed++;
      } else {
        action.retries++;
        if (action.retries < MAX_RETRIES) remaining.push(action);
        else failed++;
      }
    } catch {
      action.retries++;
      if (action.retries < MAX_RETRIES) remaining.push(action);
      else failed++;
    }
  }

  saveQueue(remaining);
  const eventId = ++flushEventCounter;
  latestFlushResult = { sent, failed, eventId };
  currentStatus = remaining.length > 0 ? "pending" : (failed > 0 ? "failed" : "idle");
  flushing = false;
  notify(latestFlushResult);
  return { sent, failed };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let immediateTimer: ReturnType<typeof setTimeout> | null = null;
let syncStarted = false;

function scheduleImmediateFlush() {
  if (immediateTimer) return;
  immediateTimer = setTimeout(async () => {
    immediateTimer = null;
    if (!navigator.onLine) return;
    await flushQueue();
  }, 800);
}

function scheduleNextSync() {
  if (syncTimer) clearTimeout(syncTimer);
  const queue = getQueue();
  if (!queue.length) {
    syncTimer = setTimeout(scheduleNextSync, 15000);
    return;
  }
  const maxRetries = Math.max(...queue.map((a) => a.retries), 0);
  const delay = getBackoffMs(maxRetries);
  syncTimer = setTimeout(async () => {
    if (navigator.onLine && getQueue().length > 0) {
      await flushQueue();
    }
    scheduleNextSync();
  }, delay);
}

export function startOfflineSync(onSync?: (result: { sent: number; failed: number }) => void) {
  if (syncStarted) return;
  syncStarted = true;

  if (onSync) {
    subscribeQueue((info) => {
      if (info.flushResult && info.flushResult.sent > 0) {
        onSync(info.flushResult);
      }
    });
  }

  window.addEventListener("online", () => {
    if (getQueue().length > 0) scheduleImmediateFlush();
  });

  if (navigator.onLine && getQueue().length > 0) {
    scheduleImmediateFlush();
  }
  scheduleNextSync();
}

export function forceFlush(): void {
  if (immediateTimer) { clearTimeout(immediateTimer); immediateTimer = null; }
  immediateTimer = setTimeout(async () => {
    immediateTimer = null;
    await flushQueue();
  }, 100);
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function isNetworkError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) return true;
  if (error instanceof TypeError && error.message.toLowerCase().includes("network")) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
    if (msg.includes("bad gateway") || msg.includes("service unavailable")) return true;
    if (msg.includes("failed to fetch") || msg.includes("load failed")) return true;
  }
  return false;
}
