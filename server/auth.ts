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

export const authenticateToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    req.user = undefined;
    return next();
  }

  const token = authHeader.split(" ")[1];
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
