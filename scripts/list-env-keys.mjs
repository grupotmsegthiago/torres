/**
 * Lista SOMENTE os nomes das variáveis de um arquivo .env.
 * Nunca imprime valores.
 */
import fs from "fs";

const file = process.argv[2] || ".env";
if (!fs.existsSync(file)) {
  console.error(`FILE_MISSING:${file}`);
  process.exit(2);
}

const text = fs.readFileSync(file, "utf8");
const keys = new Set();
let parseErrors = 0;

for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;

  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (m) {
    keys.add(m[1]);
    continue;
  }

  // Suporte a bloco JSON legado (Replit dump) — só extrai chaves
  if (line.startsWith("{") || line.startsWith("[")) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const k of Object.keys(obj)) keys.add(k);
      }
    } catch {
      parseErrors += 1;
    }
  }
}

const list = [...keys].sort();
console.log(`FILE=${file}`);
console.log(`COUNT=${list.length}`);
console.log(`PARSE_ERRORS=${parseErrors}`);
for (const k of list) console.log(k);
