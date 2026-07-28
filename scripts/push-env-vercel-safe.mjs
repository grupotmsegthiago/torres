/**
 * Envia variáveis do .env para Vercel sem imprimir valores.
 * Uso: node scripts/push-env-vercel-safe.mjs
 * Pré-requisito: npx vercel login && npx vercel link
 *
 * Não sobrescreve variáveis já existentes (skip).
 * Use --force para sobrescrever.
 */
import fs from "fs";
import { spawnSync } from "child_process";

const force = process.argv.includes("--force");
const envs = ["production", "preview", "development"];

const PUBLIC_PREFIXES = ["VITE_"];
const SKIP = new Set(["PORT"]); // Vercel define PORT

function loadEnv(path) {
  const map = new Map();
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i);
    let v = line.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (k && v) map.set(k, v);
  }
  return map;
}

function vercel(args, input) {
  return spawnSync("npx", ["vercel", ...args], {
    input,
    encoding: "utf8",
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// Lista nomes existentes (vercel env ls não mostra valores completos na listagem)
const ls = vercel(["env", "ls"]);
if (ls.status !== 0) {
  console.error("Falha ao listar env na Vercel. Faça: npx vercel login && npx vercel link");
  console.error((ls.stderr || ls.stdout || "").split("\n").slice(0, 5).join("\n"));
  process.exit(1);
}

const existingNames = new Set();
for (const line of (ls.stdout || "").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s+/);
  if (m) existingNames.add(m[1]);
}

const env = loadEnv(".env");
const results = { added: [], skippedExisting: [], failed: [], public: [], private: [] };

for (const [key, value] of [...env.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (SKIP.has(key)) continue;
  const isPublic = PUBLIC_PREFIXES.some((p) => key.startsWith(p));
  (isPublic ? results.public : results.private).push(key);

  if (existingNames.has(key) && !force) {
    results.skippedExisting.push(key);
    console.log(`SKIP existing: ${key}`);
    continue;
  }

  // vercel env add NAME env < value
  for (const target of envs) {
    const args = ["env", "add", key, target];
    if (force) args.push("--force");
    const r = vercel(args, value);
    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || "").toLowerCase();
      if (err.includes("already") || err.includes("exist")) {
        results.skippedExisting.push(`${key}@${target}`);
        console.log(`SKIP exists: ${key} (${target})`);
      } else {
        results.failed.push(`${key}@${target}`);
        console.log(`FAIL: ${key} (${target})`);
      }
    } else {
      results.added.push(`${key}@${target}`);
      console.log(`OK: ${key} (${target})`);
    }
  }
}

console.log(JSON.stringify({
  summary: {
    added: results.added.length,
    skipped: results.skippedExisting.length,
    failed: results.failed.length,
    publicKeys: results.public,
    privateKeyCount: results.private.length,
  },
  failed: results.failed,
  skippedExisting: [...new Set(results.skippedExisting)],
}, null, 2));
