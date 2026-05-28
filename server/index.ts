process.env.TZ = "America/Sao_Paulo";

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { initCronJobs } from "./cron";
import { initWhatsappForwardCron } from "./cron-whatsapp-forward";
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

// Body parser: limite global enxuto (2MB) pra não deixar qualquer endpoint
// alocar 10MB sob demanda. Endpoints específicos que recebem fotos base64
// (NF de combustível, fotos de missão, NFe TicketLog) ganham um parser
// dedicado de 10MB montado ANTES — quando o prefixo casa, esse parser roda
// primeiro e marca req._body, então o parser global enxuto vira no-op.
const PHOTO_UPLOAD_PATHS = [
  "/api/fueling",                 // POST/PATCH com receiptPhoto/pumpPhoto/odometerPhoto/platePhoto base64
  "/api/mobile/fueling",          // mobile: idem
  "/api/mission/photo",           // upload de foto de missão
  "/api/mission/photo-inspections-batch",
  "/api/mission/update",          // status update com foto (rede de segurança — cliente já comprime)
  "/api/employee-documents",      // RH: arquivar documento com foto/PDF (cliente comprime imagens; PDFs passam direto)
  /^\/api\/employees\/\d+\/dependents$/, // RH: dependente com certidão anexada
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
  // PERF: não reter o objeto inteiro da resposta — antes guardávamos
  // `capturedJsonResponse` em closure até o evento `finish`, o que segurava
  // payloads de MB (listas com fotos base64, relatórios) no heap durante
  // toda a transmissão. Agora extraímos só um sumário leve (length/preview)
  // sincronamente dentro do hook de res.json e liberamos a referência.
  let responseSummary: string | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (path.startsWith("/api")) {
      try {
        if (Array.isArray(bodyJson)) {
          responseSummary = `[Array(${bodyJson.length})]`;
        } else if (bodyJson && typeof bodyJson === "object") {
          // Pega só as chaves de topo + um preview curto (max 200 chars).
          // Não serializa o objeto inteiro — em payloads grandes isso ainda
          // alocaria a string completa. Stringify limitado a uma view rasa.
          const keys = Object.keys(bodyJson).slice(0, 8).join(",");
          responseSummary = `{${keys}${Object.keys(bodyJson).length > 8 ? ",…" : ""}}`;
        } else {
          responseSummary = String(bodyJson).slice(0, 100);
        }
      } catch {
        responseSummary = "[unserializable]";
      }
    }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = responseSummary
        ? `${req.method} ${path} ${res.statusCode} in ${duration}ms :: ${responseSummary}`
        : `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
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
    responseSummary = undefined;
  });

  next();
});

// Healthcheck registrado IMEDIATAMENTE, antes de qualquer await em Supabase.
// Garante que o deploy do Replit detecte porta aberta mesmo se o Supabase
// estiver fora — caso contrário db-init pendura por minutos e o deploy
// aborta com "port 5000 never opened". Ver replit.md (Boot resiliente).
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

(async () => {
  // PORTA ABERTA PRIMEIRO — não bloquear listen() em chamadas Supabase.
  // ensureDbSchema/ensureCalcMissionRPC rodam em background mais abaixo.
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
  initWhatsappForwardCron();

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

  // db-init em BACKGROUND — não bloqueia o listen acima. Se o Supabase
  // estiver fora, o app sobe em modo fallback e o schema é checado quando
  // o Supabase voltar (db-init usa IF NOT EXISTS, é idempotente).
  ensureDbSchema().catch((e: any) =>
    console.error("[db-init] ensureDbSchema (background) falhou:", e?.message || e),
  );
  ensureCalcMissionRPC().catch((e: any) =>
    console.error("[db-init] ensureCalcMissionRPC (background) falhou:", e?.message || e),
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
