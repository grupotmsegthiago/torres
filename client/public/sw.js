// Service Worker — Torres ERP
// Versão é atualizada a cada deploy (build inclui timestamp)
const SW_VERSION = "v1.0.0-2026-05-02";

self.addEventListener("install", (event) => {
  // NÃO chama skipWaiting() automaticamente — espera mensagem do cliente
  // pra que o usuário receba o toast "Nova versão disponível"
  console.log("[SW] install", SW_VERSION);
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate", SW_VERSION);
  event.waitUntil(
    (async () => {
      // Limpa todos os caches antigos (não usamos Cache API, mas garante limpeza)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Mensagem do cliente: aplicar atualização imediatamente
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Torres", {
      body: data.body || "Você tem uma nova mensagem",
      icon: "/icon-192x192.png",
      badge: "/icon-72x72.png",
      tag: data.tag || "torres-message",
      data: { url: data.url || "/mobile/chat" },
      requireInteraction: false,
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/mobile/chat";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// Fetch handler vazio — não cacheamos via SW (cache é via headers HTTP)
self.addEventListener("fetch", () => {});
