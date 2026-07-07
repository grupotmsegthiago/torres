/**
 * Exporta variáveis no formato exato do Replit para colar no Railway Raw Editor.
 * Uso: npm run export-env:railway
 */
import { writeFileSync } from "fs";
import path from "path";
import { formatReplitEnvLines, loadReplitEnv } from "./replit-env";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_PATH = path.join(ROOT, ".railway.env");

function main() {
  const vars = loadReplitEnv();
  // Railway injeta PORT automaticamente — não incluir PORT=5000 do Replit.
  const lines = formatReplitEnvLines(vars, false);

  writeFileSync(OUT_PATH, lines.join("\n") + "\n", "utf8");

  console.log("");
  console.log("=== Railway Raw Editor — APAGUE TUDO e cole só isto ===");
  console.log("");
  for (const line of lines) console.log(line);
  console.log("");
  console.log(`Arquivo salvo em .railway.env (${lines.length} variáveis, padrão Replit)`);
  console.log("Railway → Variables → Raw Editor → selecionar tudo → apagar → colar acima → Save");
}

main();
