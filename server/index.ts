import "dotenv/config";
import { createApp } from "./create-app";
import { initCronJobs } from "./cron";
import { initWhatsappForwardCron } from "./cron-whatsapp-forward";
import { initWhatsappMonitor } from "./whatsapp-monitor";
import { shouldRunBackgroundJobs } from "./platform";
import { log } from "./lib/logger";

export { log } from "./lib/logger";
export { getSlowRoutes } from "./slow-routes";

(async () => {
  const { httpServer } = await createApp({
    enableVite: process.env.NODE_ENV !== "production",
  });

  if (shouldRunBackgroundJobs()) {
    initCronJobs();
    initWhatsappForwardCron();
    initWhatsappMonitor();
  } else if (String(process.env.DISABLE_CRONS || "").trim().toLowerCase() === "true") {
    log("CRON desligado: DISABLE_CRONS=true");
  }

  const port = Number(process.env.PORT) || 5001;
  // localhost no Windows aponta para ::1. Escutar só em 0.0.0.0 recusa o navegador.
  const onListening = () => log(`serving on port ${port}`);
  const onBindError = (err: NodeJS.ErrnoException) => {
    if (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL") {
      httpServer.listen(port, "0.0.0.0", onListening);
      return;
    }
    throw err;
  };
  httpServer.once("error", onBindError);
  httpServer.listen({ port, host: "::", ipv6Only: false }, () => {
    httpServer.removeListener("error", onBindError);
    onListening();
  });

  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down...`);
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 3000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
