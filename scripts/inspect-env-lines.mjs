/**
 * Classifica cada linha do .env SEM imprimir valores.
 */
import fs from "fs";

const file = process.argv[2] || ".env";
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
const samples = {
  dotenv: 0,
  keyColon: 0,
  keySpace: 0,
  quotedKey: 0,
  looksLikeJwt: 0,
  looksLikeUrl: 0,
  looksLikeBase64Blob: 0,
  shortTokenish: 0,
  emptyOrWs: 0,
  unknown: 0,
};
const unknownShapes = [];
const possibleKeys = new Set();

function maskShape(s) {
  // Retorna só a "forma": letras/dígitos/símbolos, sem conteúdo real
  return s
    .replace(/[A-Za-z]/g, "A")
    .replace(/\d/g, "0")
    .slice(0, 80);
}

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.trim();
  if (!line) {
    samples.emptyOrWs++;
    continue;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) {
    samples.dotenv++;
    possibleKeys.add(line.split("=")[0].trim());
    continue;
  }
  if (/^"[A-Za-z_][A-Za-z0-9_]*"\s*:/.test(line) || /^[A-Za-z_][A-Za-z0-9_]*"\s*:/.test(line)) {
    samples.quotedKey++;
    const km = line.match(/([A-Za-z_][A-Za-z0-9_]*)/);
    if (km) possibleKeys.add(km[1]);
    continue;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(line)) {
    samples.keyColon++;
    possibleKeys.add(line.split(":")[0].trim());
    continue;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*\s+\S+/.test(line)) {
    samples.keySpace++;
    possibleKeys.add(line.split(/\s+/)[0]);
    continue;
  }
  if (line.startsWith("eyJ") && line.length > 40) {
    samples.looksLikeJwt++;
    continue;
  }
  if (/^https?:\/\//i.test(line)) {
    samples.looksLikeUrl++;
    continue;
  }
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(line)) {
    samples.looksLikeBase64Blob++;
    continue;
  }
  if (/^[A-Za-z0-9._-]{8,}$/.test(line) && line.length < 120) {
    samples.shortTokenish++;
    continue;
  }

  samples.unknown++;
  if (unknownShapes.length < 15) {
    unknownShapes.push({
      lineNo: i + 1,
      len: line.length,
      shape: maskShape(line),
      startsWithLetter: /^[A-Za-z]/.test(line),
      hasEquals: line.includes("="),
      hasColon: line.includes(":"),
      hasSpace: /\s/.test(line),
    });
  }
}

console.log(JSON.stringify({
  samples,
  possibleKeyCount: possibleKeys.size,
  possibleKeys: [...possibleKeys].sort(),
  unknownShapes,
}, null, 2));
