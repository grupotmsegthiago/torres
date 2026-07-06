import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";

function resolvePublicDir(): string {
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "..", "dist", "public"),
    path.resolve(process.cwd(), "dist", "public"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not find the build directory (tried: ${candidates.join(", ")}). Run npm run build first.`,
  );
}

export function serveStatic(app: Express) {
  const distPath = resolvePublicDir();

  // ─── Headers de cache CORRETOS para PWA ───
  // Arquivos com hash em /assets/* (Vite gera nome hash) → cache 1 ano (immutable)
  // index.html / sw.js / manifest.json → SEMPRE revalidar (no-cache)
  // Demais (icons, logos): 1 dia
  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const fname = path.basename(filePath);
      if (fname === "sw.js" || fname === "manifest.json" || fname === "index.html") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // Vite gera assets com hash no nome → seguro cachear longo
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        // ícones, logos, fontes públicas
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  }));

  // SPA fallback — index.html SEMPRE no-cache (essencial para destravar deploys)
  app.use("/{*path}", (_req: Request, res: Response, _next: NextFunction) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
