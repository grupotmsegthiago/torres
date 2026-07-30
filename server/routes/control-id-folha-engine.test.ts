/**
 * Guarda da rota Folha (?engine=pares).
 *
 * - Testes estruturais / funções puras: auxiliares (NÃO são integração HTTP)
 * - Teste de integração HTTP: Express real + fetch + spy via folhaRouteDeps
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import type { Server } from "node:http";
import {
  parseFolhaEngineQuery,
  resolveFolhaEngine,
} from "../lib/jornada-pares";
import { registerControlIdRoutes, folhaRouteDeps } from "./control-id";

const here = dirname(fileURLToPath(import.meta.url));

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

async function withEnvAsync(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

function buildTestApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = {
      id: 1,
      email: "teste@torres.local",
      role: "admin",
      name: "Teste Admin",
    };
    next();
  });
  registerControlIdRoutes(app);
  return app;
}

async function withServer(
  app: express.Express,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("porta de teste indisponível");
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

// ─── Estrutural / puro (NÃO é integração HTTP) ─────────────────────

test("estrutural: rota Folha usa parseFolhaEngineQuery e folhaRouteDeps", () => {
  const src = readFileSync(join(here, "control-id.ts"), "utf8");
  assert.match(src, /parseFolhaEngineQuery/);
  assert.match(src, /folhaRouteDeps\.buildFolhaPonto/);
});

test("puro: produção ignora ?engine=pares / FOLHA_ENGINE / override", () => {
  withEnv({ NODE_ENV: "production", FOLHA_ENGINE: "pares" }, () => {
    assert.equal(parseFolhaEngineQuery("pares"), undefined);
    assert.equal(resolveFolhaEngine("pares"), "first_last");
  });
});

test("puro: dev aceita pares", () => {
  withEnv({ NODE_ENV: "development", FOLHA_ENGINE: undefined }, () => {
    assert.equal(parseFolhaEngineQuery("pares"), "pares");
    assert.equal(resolveFolhaEngine(parseFolhaEngineQuery("pares")), "pares");
  });
});

// ─── Integração HTTP real ──────────────────────────────────────────

test("HTTP integração: produção + ?engine=pares → buildFolhaPonto recebe engine undefined", async () => {
  await withEnvAsync({ NODE_ENV: "production", FOLHA_ENGINE: "pares" }, async () => {
    const calls: Array<{ employeeId: number; monthYear: string; opts: any }> = [];
    const original = folhaRouteDeps.buildFolhaPonto;
    folhaRouteDeps.buildFolhaPonto = async (employeeId, monthYear, opts) => {
      calls.push({ employeeId, monthYear, opts });
      return [
        {
          date: "2026-07-20",
          engine: "first_last",
          workedMin: 775,
          hoursWorked: "12.92",
        },
      ];
    };

    try {
      const app = buildTestApp();
      await withServer(app, async (base) => {
        const res = await fetch(
          `${base}/api/control-id/folha/22?month=2026-07&engine=pares`,
        );
        const bodyText = await res.text();
        assert.equal(res.status, 200, bodyText);
        const body = JSON.parse(bodyText);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].employeeId, 22);
        assert.equal(calls[0].monthYear, "2026-07");
        assert.equal(calls[0].opts?.engine, undefined);
        assert.ok(Array.isArray(body));
        for (const day of body) {
          assert.notEqual(day.engine, "pares");
        }
        assert.equal(resolveFolhaEngine(calls[0].opts?.engine), "first_last");
      });
    } finally {
      folhaRouteDeps.buildFolhaPonto = original;
    }
  });
});

test("HTTP integração: desenvolvimento + ?engine=pares → buildFolhaPonto recebe engine pares", async () => {
  await withEnvAsync({ NODE_ENV: "development", FOLHA_ENGINE: undefined }, async () => {
    const calls: Array<{ opts: any }> = [];
    const original = folhaRouteDeps.buildFolhaPonto;
    folhaRouteDeps.buildFolhaPonto = async (_id, _m, opts) => {
      calls.push({ opts });
      return [{ date: "2026-07-20", engine: "pares", workedMin: 136 }];
    };

    try {
      const app = buildTestApp();
      await withServer(app, async (base) => {
        const res = await fetch(
          `${base}/api/control-id/folha/22?month=2026-07&engine=pares`,
        );
        const bodyText = await res.text();
        assert.equal(res.status, 200, bodyText);
        const body = JSON.parse(bodyText);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].opts?.engine, "pares");
        assert.equal(body[0].engine, "pares");
      });
    } finally {
      folhaRouteDeps.buildFolhaPonto = original;
    }
  });
});
