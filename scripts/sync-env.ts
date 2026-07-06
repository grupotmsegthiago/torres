/**
 * Sincroniza variáveis não vazias de .env → .replit [userenv.shared]
 * Uso: npx tsx scripts/sync-env.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const REPLIT_PATH = path.join(ROOT, ".replit");

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

function tomlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function syncReplit(vars: Record<string, string>) {
  if (!existsSync(REPLIT_PATH)) {
    console.warn("[sync-env] .replit não encontrado — pulando");
    return;
  }
  const content = readFileSync(REPLIT_PATH, "utf8");
  const start = content.indexOf("[userenv.shared]");
  if (start < 0) {
    console.warn("[sync-env] seção [userenv.shared] não encontrada em .replit");
    return;
  }
  const afterHeader = start + "[userenv.shared]".length;
  const nextSection = content.indexOf("\n[", afterHeader);
  const head = content.slice(0, afterHeader);
  const tail = nextSection >= 0 ? content.slice(nextSection) : "\n";
  const lines = Object.entries(vars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} = "${tomlEscape(v)}"`);
  const block = "\n" + lines.join("\n") + "\n";
  writeFileSync(REPLIT_PATH, head + block + tail);
  console.log(`[sync-env] .replit atualizado (${lines.length} variáveis)`);
}

function main() {
  if (!existsSync(ENV_PATH)) {
    console.error("[sync-env] .env não encontrado");
    process.exit(1);
  }
  const vars = parseEnv(readFileSync(ENV_PATH, "utf8"));
  const keys = Object.keys(vars);
  console.log(`[sync-env] ${keys.length} variáveis com valor em .env`);
  syncReplit(vars);
}

main();
