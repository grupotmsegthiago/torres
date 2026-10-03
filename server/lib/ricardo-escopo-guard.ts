import type { RequestHandler } from "express";
import { isBlockedApiForRicardo, isRicardoSemFinanceiro } from "../../shared/ricardo-escopo";

/** Fail-closed: só o Ricardo Tadeu. Não altera o perfil admin dos demais. */
export const ricardoEscopoGuard: RequestHandler = (req, res, next) => {
  if (!isRicardoSemFinanceiro(req.user)) return next();

  const path = req.originalUrl || req.path || "";
  if (isBlockedApiForRicardo(path)) {
    return res.status(403).json({ message: "Acesso financeiro oculto para este usuário." });
  }

  return next();
};
