import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/typography.css";

// ─── Service Worker com detecção automática de nova versão ───
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        console.log("[SW] registrado:", reg.scope);

        // Polling de updates a cada 60s (pega novas versões mesmo sem reload)
        setInterval(() => { reg.update().catch(() => {}); }, 60_000);

        // Detecta nova versão instalando
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        });

        // Já tem um SW esperando ao carregar a página
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(reg.waiting);
        }
      })
      .catch((err) => console.warn("[SW] erro:", err));

    // Recarrega quando o novo SW assume controle
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

function showUpdateToast(worker: ServiceWorker) {
  // Toast nativo simples — não depende do React (pode aparecer antes do app carregar)
  const existing = document.getElementById("__sw_update_toast");
  if (existing) return;
  const div = document.createElement("div");
  div.id = "__sw_update_toast";
  div.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #18181b; color: white; padding: 12px 20px; border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 999999;
    display: flex; align-items: center; gap: 12px; font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px; max-width: 90vw; animation: slideUp 0.3s ease-out;
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

// ─── Pede permissão de notificação para usuários autenticados ───
if ("Notification" in window && Notification.permission === "default") {
  // Pede após 5s pra não atrapalhar o login
  setTimeout(() => {
    Notification.requestPermission().catch(() => {});
  }, 5000);
}

createRoot(document.getElementById("root")!).render(<App />);
