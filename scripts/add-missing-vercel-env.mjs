/**
 * Adiciona na Vercel apenas variáveis presentes no .env local
 * e AUSENTES na Vercel. Nunca imprime valores. Nunca usa --force.
 */
import fs from "fs";
import { spawnSync } from "child_process";

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

const ls = spawnSync("npx", ["vercel", "env", "ls"], {
  encoding: "utf8",
  shell: true,
});
if (ls.status !== 0) {
  console.error("Falha vercel env ls");
  process.exit(1);
}

const existing = new Set();
for (const line of (ls.stdout || "").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s+/);
  if (m) existing.add(m[1]);
}

const local = loadEnv(".env");
const missing = [...local.keys()].filter((k) => !existing.has(k) && k !== "PORT");
console.log(JSON.stringify({ existingCount: existing.size, missing }, null, 2));

const targets = ["production", "preview", "development"];
const added = [];
const failed = [];

for (const key of missing) {
  const value = local.get(key);
  for (const env of targets) {
    const r = spawnSync("npx", ["vercel", "env", "add", key, env], {
      input: value,
      encoding: "utf8",
      shell: true,
    });
    if (r.status === 0) {
      added.push(`${key}@${env}`);
      console.log(`OK ${key} (${env})`);
    } else {
      const err = `${r.stderr || ""}${r.stdout || ""}`.toLowerCase();
      if (err.includes("already") || err.includes("exist")) {
        console.log(`SKIP exists ${key} (${env})`);
      } else {
        failed.push(`${key}@${env}`);
        console.log(`FAIL ${key} (${env})`);
      }
    }
  }
}

console.log(JSON.stringify({ added, failed }, null, 2));
