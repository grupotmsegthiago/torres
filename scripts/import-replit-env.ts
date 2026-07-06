/**
 * Gera .env a partir de .replit [userenv.shared] (mesmas variáveis do Replit Secrets).
 * Uso: npm run import-env:replit
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPLIT_PATH = path.join(ROOT, ".replit");
const ENV_PATH = path.join(ROOT, ".env");

function parseReplitShared(content: string): Record<string, string> {
  const start = content.indexOf("[userenv.shared]");
  if (start < 0) return {};

  const afterHeader = start + "[userenv.shared]".length;
  const nextSection = content.indexOf("\n[", afterHeader);
  const block = nextSection >= 0 ? content.slice(afterHeader, nextSection) : content.slice(afterHeader);

  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
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
    if (key && val) out[key] = val;
  }
  return out;
}

function main() {
  if (!existsSync(REPLIT_PATH)) {
    console.error("[import-env:replit] .replit não encontrado");
    process.exit(1);
  }

  const vars = parseReplitShared(readFileSync(REPLIT_PATH, "utf8"));
  const keys = Object.keys(vars);
  if (keys.length === 0) {
    console.error("[import-env:replit] Nenhuma variável em [userenv.shared]");
    process.exit(1);
  }

  const lines = [
    "# Gerado por npm run import-env:replit — não commitar",
    "# Copie os Secrets do Replit ou rode este script de novo",
    "",
    ...keys.sort((a, b) => a.localeCompare(b)).map((k) => `${k}=${vars[k]}`),
    "",
  ];

  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");
  console.log(`[import-env:replit] .env criado com ${keys.length} variáveis`);
  if (vars.SUPABASE_DATABASE_URL) {
    console.log("[import-env:replit] SUPABASE_DATABASE_URL presente — rode: npm run db:test");
  } else {
    console.warn("[import-env:replit] AVISO: SUPABASE_DATABASE_URL ausente no .replit");
  }
}

main();
