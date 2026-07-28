/**
 * Inspeciona a FORMA do .env sem imprimir valores.
 * Relata: linhas, tipos de linha, chaves detectadas, presença de blocos.
 */
import fs from "fs";

const file = process.argv[2] || ".env";
const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

let blank = 0;
let comments = 0;
let dotenv = 0;
let jsonLike = 0;
let other = 0;
const dotenvKeys = [];
const emptyValues = [];
const nonEmpty = [];

for (const raw of lines) {
  const line = raw.trim();
  if (!line) {
    blank++;
    continue;
  }
  if (line.startsWith("#")) {
    comments++;
    continue;
  }
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  if (m) {
    dotenv++;
    dotenvKeys.push(m[1]);
    const val = m[2];
    // Não imprime valor — só classifica presença
    if (val === "" || val === '""' || val === "''") emptyValues.push(m[1]);
    else nonEmpty.push(m[1]);
    continue;
  }
  if (line.startsWith("{") || line.startsWith("[") || line.includes('":')) {
    jsonLike++;
    continue;
  }
  other++;
}

// Tenta parsear arquivo inteiro como JSON (dump Replit)
let wholeJsonKeys = [];
try {
  const obj = JSON.parse(text);
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    wholeJsonKeys = Object.keys(obj).sort();
  }
} catch {
  // ignore
}

// Tenta extrair chaves de objetos JSON multilinha
let multiJsonKeys = [];
const braceStart = text.indexOf("{");
const braceEnd = text.lastIndexOf("}");
if (braceStart >= 0 && braceEnd > braceStart) {
  try {
    const obj = JSON.parse(text.slice(braceStart, braceEnd + 1));
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      multiJsonKeys = Object.keys(obj).sort();
    }
  } catch {
    // ignore
  }
}

console.log(JSON.stringify({
  bytes: Buffer.byteLength(text),
  lines: lines.length,
  blank,
  comments,
  dotenvLines: dotenv,
  jsonLikeLines: jsonLike,
  otherLines: other,
  dotenvKeyCount: dotenvKeys.length,
  dotenvKeys: dotenvKeys.sort(),
  nonEmptyCount: nonEmpty.length,
  emptyValueCount: emptyValues.length,
  wholeJsonKeyCount: wholeJsonKeys.length,
  wholeJsonKeys,
  multiJsonKeyCount: multiJsonKeys.length,
  multiJsonKeys,
}, null, 2));
