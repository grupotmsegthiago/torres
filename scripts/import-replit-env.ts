/**
 * Gera .env a partir de .replit [userenv.shared] (mesmas variáveis do Replit Secrets).
 * Uso: npm run import-env:replit
 */
import { writeFileSync } from "fs";
import path from "path";
import {
  formatReplitEnvLines,
  loadReplitEnv,
  REPLIT_SHARED_KEYS,
} from "./replit-env";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

function main() {
  const vars = loadReplitEnv();
  const present = REPLIT_SHARED_KEYS.filter((k) => vars[k]);
  if (present.length === 0) {
    console.error("[import-env:replit] Nenhuma variável em [userenv.shared]");
    process.exit(1);
  }

  const lines = [
    "# Padrão Replit — gerado por npm run import-env:replit (não commitar)",
    "",
    ...formatReplitEnvLines(vars),
    "",
  ];

  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");
  console.log(`[import-env:replit] .env criado com ${formatReplitEnvLines(vars).length} variáveis (padrão Replit)`);
  if (vars.SUPABASE_DATABASE_URL) {
    console.log("[import-env:replit] Rode: npm run db:test");
    console.log("[import-env:replit] Railway Raw: npm run export-env:railway");
  }
}

main();
