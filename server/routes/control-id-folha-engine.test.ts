/**
 * Integração / guarda da rota Folha: ?engine=pares não pode ativar pares em produção.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseFolhaEngineQuery,
  resolveFolhaEngine,
} from "../lib/jornada-pares";

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

test("rota Folha: fonte usa parseFolhaEngineQuery (não encaminha engine cru)", () => {
  const src = readFileSync(join(here, "control-id.ts"), "utf8");
  assert.match(src, /parseFolhaEngineQuery/);
  assert.match(src, /buildFolhaPonto\(employeeId, monthYear, \{ engine \}\)/);
  // Não deve mais montar engine a partir de string sem o guard:
  assert.doesNotMatch(
    src,
    /engineQ === "pares"[\s\S]*as "pares"/,
  );
});

test("parseFolhaEngineQuery: produção ignora ?engine=pares", () => {
  withEnv({ NODE_ENV: "production", FOLHA_ENGINE: "pares" }, () => {
    assert.equal(parseFolhaEngineQuery("pares"), undefined);
    assert.equal(parseFolhaEngineQuery("first_last"), undefined);
    assert.equal(resolveFolhaEngine(parseFolhaEngineQuery("pares")), "first_last");
    assert.equal(resolveFolhaEngine("pares"), "first_last");
  });
});

test("parseFolhaEngineQuery: dev aceita pares; produção não", () => {
  withEnv({ NODE_ENV: "development", FOLHA_ENGINE: undefined }, () => {
    assert.equal(parseFolhaEngineQuery("pares"), "pares");
    assert.equal(resolveFolhaEngine(parseFolhaEngineQuery("pares")), "pares");
  });
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(parseFolhaEngineQuery("pares"), undefined);
    assert.equal(resolveFolhaEngine(parseFolhaEngineQuery("pares")), "first_last");
  });
});

/**
 * Simula o caminho da rota: query → parseFolhaEngineQuery → resolveFolhaEngine.
 * Em produção o resultado efetivo da Folha é sempre first_last.
 */
test("integração rota Folha: NODE_ENV=production + ?engine=pares + FOLHA_ENGINE=pares → first_last", () => {
  withEnv({ NODE_ENV: "production", FOLHA_ENGINE: "pares" }, () => {
    const fromQuery = parseFolhaEngineQuery("pares");
    const engine = resolveFolhaEngine(fromQuery ?? "pares");
    assert.equal(fromQuery, undefined);
    assert.equal(engine, "first_last");
  });
});
