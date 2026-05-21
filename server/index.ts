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

// SEO: rotas internas nunca devem ser indexadas (defesa em profundidade).
// Registrado ANTES das rotas /api/* pra valer pra todas elas.
app.use((req, res, next) => {
  const p = req.path;
  if (p.startsWith("/admin") || p.startsWith("/mobile") || p.startsWith("/api")) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }
  next();
});

// ─── /api/version (público, sem cache) ───
// Cliente PWA chama no boot pra detectar mismatch e disparar hard reset.
// Lê constants em runtime — qualquer require/import do APP_VERSION reflete aqui.
app.get("/api/version", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json({ version: APP_VERSION, builtAt: APP_BUILD_AT });
});

// ─── SEO: robots.txt + sitemap.xml ───
// Registrados ANTES do Vite/static pra não serem capturados pelo catch-all do SPA.
function siteBaseUrl(req: Request): string {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "torresvigilancia.com.br";
  return `${proto}://${host}`.replace(/\/$/, "");
}

app.get("/robots.txt", (req, res) => {
  const base = siteBaseUrl(req);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /mobile",
    "Disallow: /mobile/",
    "Disallow: /api",
    "Disallow: /api/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  res.type("text/plain; charset=utf-8").send(body);
});

app.get("/sitemap.xml", (req, res) => {
  const base = siteBaseUrl(req);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const urls = [
    { loc: `${base}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${base}/#servicos`, priority: "0.8", changefreq: "monthly" },
    { loc: `${base}/#diferenciais`, priority: "0.6", changefreq: "monthly" },
    { loc: `${base}/#sobre`, priority: "0.6", changefreq: "monthly" },
    { loc: `${base}/#cotacao`, priority: "0.9", changefreq: "weekly" },
    { loc: `${base}/#contato`, priority: "0.7", changefreq: "monthly" },
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  res.type("application/xml; charset=utf-8").send(body);
});

setupAuth(app);
registerPushRoutes(app);

import { log } from "./lib/logger";
export { log };

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
  // Coletor de telemetria do banco (1 amostra a cada 2min, mantém 7 dias)
  try {
    const { startTelemetrySampler } = await import("./db-telemetry");
    const { supabaseAdmin } = await import("./supabase");
    startTelemetrySampler(supabaseAdmin);
  } catch (err: any) {
    console.warn("[db-telemetry] sampler não iniciou:", err?.message);
  }
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
