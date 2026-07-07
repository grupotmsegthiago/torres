import type { VercelRequest } from "@vercel/node";

/** Rotas Express na raiz (não sob /api) mas reescritas como /api/* na Vercel. */
const ROOT_ALIASES: Record<string, string> = {
  "/api/healthz": "/healthz",
  "/api/robots.txt": "/robots.txt",
  "/api/sitemap.xml": "/sitemap.xml",
};

/**
 * A Vercel reescreve /api/foo/bar para um único handler (api/index ou
 * api/[...slug]). Sem restaurar o path, o Express vê só "/api" e o webhook
 * POST /api/whatsapp/webhook vira 404/405.
 */
export function resolveExpressPath(req: VercelRequest): string {
  const slug = req.query.slug;
  if (slug !== undefined) {
    const parts = (Array.isArray(slug) ? slug : [slug]).map(String).filter(Boolean);
    if (parts.length > 0) return `/api/${parts.join("/")}`;
  }

  const p = req.query.__p;
  if (typeof p === "string" && p.trim()) {
    const clean = p.trim().replace(/^\/+/, "");
    return clean.startsWith("api/") ? `/${clean}` : `/api/${clean}`;
  }

  for (const key of ["x-vercel-original-path", "x-invoke-path", "x-forwarded-uri"] as const) {
    const h = req.headers[key];
    if (typeof h === "string" && h.startsWith("/")) return h.split("?")[0];
  }

  return (req.url || "/").split("?")[0];
}

/** Reescreve req.url antes de passar ao Express; retorna o path (sem query). */
export function patchReqUrl(req: VercelRequest): string {
  let path = resolveExpressPath(req);
  const resolvedFromSlug = req.query.slug !== undefined;
  if (ROOT_ALIASES[path]) path = ROOT_ALIASES[path];

  const raw = req.url || "";
  let qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
  // Catch-all da Vercel embute ?slug=... na URL — não repassar ao Express.
  if (resolvedFromSlug && qs) {
    const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    params.delete("slug");
    const rest = params.toString();
    qs = rest ? `?${rest}` : "";
  }

  req.url = path + qs;
  return path;
}

export function isHealthzPath(path: string): boolean {
  return path === "/healthz" || path === "/api/healthz";
}
