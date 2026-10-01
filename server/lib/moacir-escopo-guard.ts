import type { RequestHandler } from "express";
import { isBlockedApiForMoacir, isMoacirRestrito, redactMoacirPayload } from "../../shared/moacir-escopo";

/** Fail-closed: só o Moacir. Não altera cache compartilhado (redige uma cópia na saída). */
export const moacirEscopoGuard: RequestHandler = (req, res, next) => {
  if (!isMoacirRestrito(req.user)) return next();

  const path = req.originalUrl || req.path || "";
  if (isBlockedApiForMoacir(path)) {
    return res.status(403).json({ message: "Acesso oculto para este usuário." });
  }

  if (path.split("?")[0].startsWith("/api/auth/")) return next();

  const origJson = res.json.bind(res);
  res.json = (body: unknown) => origJson(redactMoacirPayload(body));
  return next();
};
