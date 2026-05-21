import type { Express, RequestHandler } from "express";
import { supabaseAdmin } from "./supabase";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      supabaseUid?: string;
    }
  }
}

// ─── Cache LRU+TTL de tokens validados ──────────────────────────────────────
// Evita chamar supabaseAdmin.auth.getUser(token) (/auth/v1/user) e
// storage.getUserBySupabaseUid em CADA request — maior gargalo de heap/latência.
// Chave = token completo; valor = { user, supabaseUid, expiresAt }.
// TTL curto (60s) garante revogação rápida (logout/role-change).
type AuthCacheEntry = { user: User; supabaseUid: string; expiresAt: number };
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX = 1000;
const authCache = new Map<string, AuthCacheEntry>();
// Índice reverso supabaseUid → Set<token> para invalidação dirigida por usuário
// (logout/role-change/reset-password). Permite mudança de permissões surtir
// efeito imediato sem esperar o TTL de 60s.
const tokensBySupabaseUid = new Map<string, Set<string>>();

function authCacheGet(token: string): AuthCacheEntry | null {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    authCache.delete(token);
    tokensBySupabaseUid.get(entry.supabaseUid)?.delete(token);
    return null;
  }
  // Move pra "mais recente" (LRU via re-insert)
  authCache.delete(token);
  authCache.set(token, entry);
  return entry;
}

function authCacheSet(token: string, user: User, supabaseUid: string) {
  if (authCache.size >= AUTH_CACHE_MAX) {
    // Remove o mais antigo (primeira chave do Map)
    const oldest = authCache.keys().next().value;
    if (oldest !== undefined) {
      const oldEntry = authCache.get(oldest);
      authCache.delete(oldest);
      if (oldEntry) tokensBySupabaseUid.get(oldEntry.supabaseUid)?.delete(oldest);
    }
  }
  authCache.set(token, { user, supabaseUid, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  let set = tokensBySupabaseUid.get(supabaseUid);
  if (!set) { set = new Set(); tokensBySupabaseUid.set(supabaseUid, set); }
  set.add(token);
}

/** Invalida cache de um token específico (logout client-side). */
export function invalidateAuthCache(token?: string) {
  if (token) {
    const entry = authCache.get(token);
    authCache.delete(token);
    if (entry) tokensBySupabaseUid.get(entry.supabaseUid)?.delete(token);
  } else {
    authCache.clear();
    tokensBySupabaseUid.clear();
  }
}

/** Invalida todos os tokens cacheados de um usuário (mudança de role, reset
 *  de senha, desativação). Chame sempre que o User local mudar permissões. */
export function invalidateAuthCacheByUser(supabaseUid: string | null | undefined) {
  if (!supabaseUid) return;
  const tokens = tokensBySupabaseUid.get(supabaseUid);
  if (!tokens) return;
  tokens.forEach((tk) => authCache.delete(tk));
  tokensBySupabaseUid.delete(supabaseUid);
}

export const authenticateToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    req.user = undefined;
    return next();
  }

  const token = authHeader.split(" ")[1];

  // 1) Cache hit — pula chamadas remotas
  const cached = authCacheGet(token);
  if (cached) {
    req.user = cached.user;
    req.supabaseUid = cached.supabaseUid;
    return next();
  }

  // 2) Cache miss — valida no Supabase e busca user local
  try {
    const { data: { user: supaUser }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !supaUser) {
      req.user = undefined;
      return next();
    }

    const localUser = await storage.getUserBySupabaseUid(supaUser.id);
    if (localUser) {
      req.user = localUser;
      req.supabaseUid = supaUser.id;
      authCacheSet(token, localUser, supaUser.id);
    }
  } catch (err) {
    console.error("[auth] Token verification error:", err);
  }
  next();
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  next();
};

export const requireAdminRole: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  if (req.user.role === "diretoria") return next();
  if (req.user.role === "admin") return next();
  return res.status(403).json({ message: "Acesso restrito a administradores" });
};

export const requireDiretoria: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  if (req.user.role === "diretoria" || req.user.role === "admin") return next();
  return res.status(403).json({ message: "Acesso restrito à Diretoria/Admin" });
};

// Estrito: somente role === "diretoria". Usado em fluxos de
// aprovação financeira em que o ADM (Simone) NÃO pode atuar.
export const requireDiretoriaStrict: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  if (req.user.role === "diretoria") return next();
  return res.status(403).json({ message: "Acesso restrito à Diretoria" });
};

// Aprovador exclusivo do fluxo financeiro: somente Thiago.
// Identificado por e-mail (estável mesmo se mudarem o nome).
export const THIAGO_EMAIL = "thiago@grupotmseg.com.br";
export function isThiago(user?: { email?: string | null; name?: string | null } | null): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  if (email === THIAGO_EMAIL) return true;
  return false;
}
export const requireThiago: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  if (isThiago(req.user)) return next();
  return res.status(403).json({ message: "Apenas Thiago pode aprovar/recusar lançamentos financeiros." });
};

export function setupAuth(app: Express) {
  app.use(authenticateToken);
}
