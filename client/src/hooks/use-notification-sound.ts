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

let lastSpeedToneTime = 0;
const SPEED_TONE_DEBOUNCE_MS = 18000;

/** Toque curto enquanto o alerta de velocidade (acima de 110 km/h) estiver na tela. */
export function playSpeedTone() {
  const now = Date.now();
  if (now - lastSpeedToneTime < SPEED_TONE_DEBOUNCE_MS) return;
  if (!getSnapshot()) return;
  lastSpeedToneTime = now;
  try {
    const AudioCtx = window.AudioContext || ((window as Record<string, unknown>).webkitAudioContext as typeof AudioContext);
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(1480, ctx.currentTime + i * 0.22);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.22);
      osc.stop(ctx.currentTime + i * 0.22 + 0.12);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    setTimeout(() => ctx.close(), 1000);
  } catch (_e) {}
}

export function useSoundEnabled() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

let lastSirenTime = 0;
const SIREN_DEBOUNCE_MS = 18000;

/** Sirene curta enquanto houver mensagem não lida há mais de 2 minutos. */
export function playSiren() {
  const now = Date.now();
  if (now - lastSirenTime < SIREN_DEBOUNCE_MS) return;
  if (!getSnapshot()) return;
  lastSirenTime = now;
  try {
    const AudioCtx = window.AudioContext || ((window as Record<string, unknown>).webkitAudioContext as typeof AudioContext);
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.connect(gain);
    const start = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const hi = i % 2 === 0;
      osc.frequency.setValueAtTime(hi ? 920 : 620, start + i * 0.28);
    }
    osc.start(start);
    osc.stop(start + 1.7);
    gain.gain.setValueAtTime(0.22, start + 1.45);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.7);
    setTimeout(() => ctx.close(), 2000);
  } catch (_e) {}
}

let lastCriticalAlarmTime = 0;
const CRITICAL_ALARM_DEBOUNCE_MS = 30000;

export function playCriticalAlarm() {
  const now = Date.now();
  if (now - lastCriticalAlarmTime < CRITICAL_ALARM_DEBOUNCE_MS) return;
  if (!getSnapshot()) return;
  lastCriticalAlarmTime = now;
  try {
    const AudioCtx = window.AudioContext || ((window as Record<string, unknown>).webkitAudioContext as typeof AudioContext);
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);

    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "square";
      osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.35);
      osc.frequency.setValueAtTime(660, ctx.currentTime + i * 0.35 + 0.1);
      osc.frequency.setValueAtTime(440, ctx.currentTime + i * 0.35 + 0.2);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
    setTimeout(() => ctx.close(), 2200);
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
