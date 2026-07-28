import "dotenv/config";
import { spawnSync } from "child_process";
import { readdirSync, statSync } from "fs";
import path from "path";

const roots = ["server", "shared", "tests"];
const files = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full);
    } else if (name.endsWith(".test.ts") || name.endsWith(".test.mts")) {
      files.push(full);
    }
  }
}

for (const root of roots) walk(root);
files.sort();

if (files.length === 0) {
  console.error("Nenhum arquivo *.test.ts encontrado");
  process.exit(1);
}

console.log(`Rodando ${files.length} arquivos de teste...`);
const tsxBin = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const r = spawnSync(process.execPath, [tsxBin, "--test", ...files], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
