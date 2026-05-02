process.env.TZ = "America/Sao_Paulo";

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { initCronJobs } from "./cron";
import { ensureDbSchema, ensureCalcMissionRPC } from "./db-init";
import { registerAsaasRoutes } from "./asaas";
import { registerDriverControlRoutes } from "./routes/driver-control";
import { registerPushRoutes } from "./routes/push";
import { APP_VERSION, APP_BUILD_AT } from "./constants";

const app = express();
app.set("etag", false);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(compression({ level: 6, threshold: 1024 }));

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: "text/plain" }));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// ─── /api/version (público, sem cache) ───
// Cliente PWA chama no boot pra detectar mismatch e disparar hard reset.
// Lê constants em runtime — qualquer require/import do APP_VERSION reflete aqui.
app.get("/api/version", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json({ version: APP_VERSION, builtAt: APP_BUILD_AT });
});

setupAuth(app);
registerPushRoutes(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const SLOW_THRESHOLD_MS = 500;
const MAX_SLOW_ENTRIES = 50;
const slowRoutes: Array<{ method: string; path: string; status: number; duration: number; ts: string }> = [];

export function getSlowRoutes() {
  return slowRoutes.slice();
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        let preview: string;
        if (Array.isArray(capturedJsonResponse)) {
          preview = `[Array(${capturedJsonResponse.length})]`;
        } else {
          try { preview = JSON.stringify(capturedJsonResponse).slice(0, 300); } catch { preview = "[unserializable]"; }
        }
        logLine += ` :: ${preview}`;
      }
      log(logLine);

      if (duration > SLOW_THRESHOLD_MS) {
        console.warn(`[SLOW] ${req.method} ${path} ${res.statusCode} took ${duration}ms`);
        slowRoutes.push({
          method: req.method,
          path,
          status: res.statusCode,
          duration,
          ts: new Date().toISOString(),
        });
        if (slowRoutes.length > MAX_SLOW_ENTRIES) slowRoutes.shift();
      }
    }
    capturedJsonResponse = undefined;
  });

  next();
});

(async () => {
  await ensureDbSchema();
  await ensureCalcMissionRPC();
  await registerRoutes(httpServer, app);
  registerAsaasRoutes(app);
  registerDriverControlRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  initCronJobs();

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
