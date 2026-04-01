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
  if (req.user.role === "diretoria") return next();
  return res.status(403).json({ message: "Apenas a Diretoria pode excluir registros" });
};

export function setupAuth(app: Express) {
  app.use(authenticateToken);
}
