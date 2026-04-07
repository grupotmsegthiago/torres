self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Torres Chat", {
      body: data.body || "Você tem uma nova mensagem",
      icon: "/logo-torres.svg",
      badge: "/logo-torres.svg",
      tag: "chat-message",
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/mobile/chat"));
});

self.addEventListener("fetch", () => {});
