import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/typography.css";

// ─── Auto-update PWA: detectar versão nova e fazer hard reset ───
// ANTI-PATTERN evitado: confiar APENAS no skipWaiting() do SW. Se o SW antigo
// nunca expirar (PWA instalada no iOS p.ex.), o usuário fica preso.
// Solução: pergunta ao /api/version no boot. Se versão local salva diferente,
// faz hard reset (caches + SWs + IDB) e recarrega — preservando login.
const VERSION_KEY = "__app_version";
const RESET_FLAG = "__did_hard_reset";

async function hardResetAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("indexedDB" in window && (indexedDB as any).databases) {
      try {
        const dbs = await (indexedDB as any).databases();
        await Promise.all((dbs || []).map((d: any) => d.name && indexedDB.deleteDatabase(d.name)));
      } catch {}
    }
    try { sessionStorage.clear(); } catch {}
    try {
      const KEEP = ["auth_token", "supabase.auth.token", "notification_sound_enabled"];
      const keep: Record<string, string> = {};
      for (const k of KEEP) { const v = localStorage.getItem(k); if (v != null) keep[k] = v; }
      localStorage.clear();
      for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
    } catch {}
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set("__r", Date.now().toString());
  window.location.replace(url.toString());
}

async function checkVersionAndMaybeReset() {
  // Evita loop: se já fizemos reset nesta sessão, não tenta de novo
  if (sessionStorage.getItem(RESET_FLAG)) return;
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version) return;
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored && stored !== version) {
      console.log(`[version] mismatch ${stored} → ${version}, fazendo hard reset`);
      sessionStorage.setItem(RESET_FLAG, "1");
      localStorage.setItem(VERSION_KEY, version);
      await hardResetAndReload();
      return;
    }
    if (!stored) localStorage.setItem(VERSION_KEY, version);
  } catch {}
}

// Auto-limpeza leve no boot: caches obsoletos + SWs órfãos do antigo modelo
async function bootCleanup() {
  // Apenas tenta limpar caches do SW (não toca em nada do React Query/IDB do app)
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      // Remove caches antigos com prefixos conhecidos
      await Promise.all(
        keys
          .filter((k) => k.startsWith("workbox-") || k.startsWith("torres-") || k === "v1")
          .map((k) => caches.delete(k))
      );
    }
  } catch {}
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    bootCleanup().then(() => checkVersionAndMaybeReset());

    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        console.log("[SW] registrado:", reg.scope);

        setInterval(() => { reg.update().catch(() => {}); }, 60_000);

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        });

        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(reg.waiting);
        }
      })
      .catch((err) => console.warn("[SW] erro:", err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });

  // Re-checa versão sempre que a aba volta a ficar visível
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkVersionAndMaybeReset();
  });
} else {
  bootCleanup().then(() => checkVersionAndMaybeReset());
}

function showUpdateToast(worker: ServiceWorker) {
  const existing = document.getElementById("__sw_update_toast");
  if (existing) return;
  const div = document.createElement("div");
  div.id = "__sw_update_toast";
  div.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #18181b; color: white; padding: 12px 20px; border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 999999;
    display: flex; align-items: center; gap: 12px; font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px; max-width: 90vw;
  `;
  div.innerHTML = `
    <span>🚀 Nova versão disponível!</span>
    <button id="__sw_update_btn" style="
      background: #10b981; color: white; border: none; padding: 6px 14px;
      border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;
    ">Atualizar</button>
    <button id="__sw_dismiss_btn" style="
      background: transparent; color: #a1a1aa; border: none; cursor: pointer; font-size: 18px;
    ">×</button>
  `;
  document.body.appendChild(div);
  document.getElementById("__sw_update_btn")!.onclick = () => {
    worker.postMessage({ type: "SKIP_WAITING" });
    div.innerHTML = '<span>Atualizando...</span>';
  };
  document.getElementById("__sw_dismiss_btn")!.onclick = () => div.remove();
}

if ("Notification" in window && Notification.permission === "default") {
  setTimeout(() => { Notification.requestPermission().catch(() => {}); }, 5000);
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Elemento #root não encontrado");
}

createRoot(rootEl).render(<App />);
