import { useRef, useCallback, useState, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "notification_sound_enabled";

let lastBeepTime = 0;
const BEEP_DEBOUNCE_MS = 2000;

type UpdateItem = { id: string | number; [key: string]: unknown };

let sharedEnabled = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
})();

const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  return sharedEnabled;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setSharedEnabled(val: boolean) {
  sharedEnabled = val;
  try { localStorage.setItem(STORAGE_KEY, String(val)); } catch {}
  listeners.forEach((cb) => cb());
}

function playBeep() {
  const now = Date.now();
  if (now - lastBeepTime < BEEP_DEBOUNCE_MS) return;
  lastBeepTime = now;
  try {
    const AudioCtx = window.AudioContext || ((window as Record<string, unknown>).webkitAudioContext as typeof AudioContext);
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 600);
  } catch (_e) {}
}

let lastAlarmTime = 0;
const ALARM_DEBOUNCE_MS = 30000;

export function playAlarm() {
  const now = Date.now();
  if (now - lastAlarmTime < ALARM_DEBOUNCE_MS) return;
  if (!getSnapshot()) return;
  lastAlarmTime = now;
  try {
    const AudioCtx = window.AudioContext || ((window as Record<string, unknown>).webkitAudioContext as typeof AudioContext);
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "square";
      osc.frequency.setValueAtTime(660, ctx.currentTime + i * 0.4);
      osc.frequency.setValueAtTime(440, ctx.currentTime + i * 0.4 + 0.15);
      osc.start(ctx.currentTime + i * 0.4);
      osc.stop(ctx.currentTime + i * 0.4 + 0.3);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);
    setTimeout(() => ctx.close(), 1500);
  } catch (_e) {}
}

export function useNotificationSound(updates: UpdateItem[]) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot);

  const prevIdsRef = useRef<Set<string | number>>(new Set());
  const initialLoadRef = useRef(true);

  const toggle = useCallback(() => {
    setSharedEnabled(!getSnapshot());
  }, []);

  useEffect(() => {
    const currentIds = new Set(
      (updates || []).map((u) => u.id)
    );

    if (initialLoadRef.current) {
      prevIdsRef.current = currentIds;
      initialLoadRef.current = false;
      return;
    }

    const hasNew = currentIds.size > 0 &&
      [...currentIds].some((id) => !prevIdsRef.current.has(id));

    prevIdsRef.current = currentIds;

    if (hasNew && enabled) {
      playBeep();
    }
  }, [updates, enabled]);

  return { enabled, toggle };
}
