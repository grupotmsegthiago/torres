import type { Request, Response, NextFunction } from "express";
import { log } from "./lib/logger";

const SLOW_THRESHOLD_MS = 500;
const MAX_SLOW_ENTRIES = 50;
const slowRoutes: Array<{ method: string; path: string; status: number; duration: number; ts: string }> = [];

export function getSlowRoutes() {
  return slowRoutes.slice();
}

export function installRequestLogger(app: import("express").Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const path = req.path;
    let responseSummary: string | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      if (path.startsWith("/api")) {
        try {
          if (Array.isArray(bodyJson)) {
            responseSummary = `[Array(${bodyJson.length})]`;
          } else if (bodyJson && typeof bodyJson === "object") {
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
}
