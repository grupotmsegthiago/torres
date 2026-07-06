process.env.TZ = "America/Sao_Paulo";

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth } from "./auth";
import { ensureDbSchema, ensureCalcMissionRPC } from "./db-init";
import { registerAsaasRoutes } from "./asaas";
import { registerDriverControlRoutes } from "./routes/driver-control";
import { registerCobrancaJudicialRoutes } from "./routes/cobranca-judicial";
import { registerPushRoutes } from "./routes/push";
import { APP_VERSION, APP_BUILD_AT } from "./constants";
import { installRequestLogger } from "./slow-routes";
import { isVercel } from "./platform";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export type CreateAppOptions = {
  /** Em dev local com Vite HMR; ignorado na Vercel (sempre estático). */
  enableVite?: boolean;
};

let appReady: Promise<{ app: Express; httpServer: Server }> | null = null;

function siteBaseUrl(req: Request): string {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "torresvigilancia.com.br";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function createApp(options: CreateAppOptions = {}): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  app.set("etag", false);

  app.use(compression({ level: 6, threshold: 1024 }));

  const PHOTO_UPLOAD_PATHS = [
    "/api/fueling",
    "/api/mobile/fueling",
    "/api/mission/photo",
    "/api/mission/photo-inspections-batch",
    "/api/mission/update",
    "/api/employee-documents",
    /^\/api\/employees\/\d+\/dependents$/,
  ];
  const rawBodyVerify = (req: IncomingMessage, _res: ServerResponse, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(PHOTO_UPLOAD_PATHS, express.json({ limit: "10mb", verify: rawBodyVerify }));
  app.use(
    express.json({
      limit: "2mb",
      verify: rawBodyVerify,
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

  app.use((req, res, next) => {
    const p = req.path;
    if (p.startsWith("/admin") || p.startsWith("/mobile") || p.startsWith("/api")) {
      res.set("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  app.get("/api/version", (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.json({ version: APP_VERSION, builtAt: APP_BUILD_AT });
  });

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
  installRequestLogger(app);

  app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  if (!isVercel()) {
    try {
      const { startTelemetrySampler } = await import("./db-telemetry");
      const { supabaseAdmin } = await import("./supabase");
      startTelemetrySampler(supabaseAdmin);
    } catch (err: any) {
      console.warn("[db-telemetry] sampler não iniciou:", err?.message);
    }
  }

  registerAsaasRoutes(app);
  registerDriverControlRoutes(app);
  registerCobrancaJudicialRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  const useVite = options.enableVite === true && process.env.NODE_ENV !== "production";
  if (useVite) {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  } else if (!isVercel()) {
    // Na Vercel o CDN serve dist/public (vercel.json outputDirectory + rewrites).
    serveStatic(app);
  }

  ensureDbSchema().catch((e: any) =>
    console.error("[db-init] ensureDbSchema (background) falhou:", e?.message || e),
  );
  ensureCalcMissionRPC().catch((e: any) =>
    console.error("[db-init] ensureCalcMissionRPC (background) falhou:", e?.message || e),
  );

  if (!isVercel()) {
    const { startSwrWarmup } = await import("./lib/swr-cache");
    startSwrWarmup();
  }

  return { app, httpServer };
}

/** Singleton para cold start da Vercel — evita re-registrar rotas a cada request. */
export function getOrCreateApp(options: CreateAppOptions = {}): Promise<Express> {
  if (!appReady) appReady = createApp(options);
  return appReady.then(({ app }) => app);
}
