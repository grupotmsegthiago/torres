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
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

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
