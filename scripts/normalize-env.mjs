/**
 * Converte .env no formato Replit (CHAVE\nvalor) para dotenv (CHAVE=valor).
 * Nunca imprime valores. Faz backup em .env.replit-dump.bak
 */
import fs from "fs";

const file = process.argv[2] || ".env";
const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

const isKey = (s) => /^[A-Z][A-Z0-9_]*$/.test(s) && s.length >= 3 && !/^[0-9A-F]{20,}$/.test(s);

const pairs = new Map();
const warnings = [];
let i = 0;

while (i < lines.length) {
  const raw = lines[i];
  const line = raw.trim();
  i++;
  if (!line || line.startsWith("#")) continue;

  // Já é dotenv
  const dm = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (dm) {
    pairs.set(dm[1], dm[2]);
    continue;
  }

  if (isKey(line)) {
    // procurar próximo não-vazio como valor
    let value = "";
    while (i < lines.length) {
      const n = lines[i].trim();
      i++;
      if (!n) continue;
      if (isKey(n)) {
        // chave sem valor — devolve para processamento
        warnings.push(`${line}=<EMPTY> (próxima linha também é chave: ${n})`);
        i--;
        value = "";
        break;
      }
      value = n;
      break;
    }
    if (pairs.has(line) && pairs.get(line) !== value) {
      warnings.push(`${line}=<OVERWRITE> (chave duplicada; mantendo último)`);
    }
    pairs.set(line, value);
    continue;
  }

  warnings.push(`SKIP_ORPHAN_LINE len=${line.length}`);
}

const backup = file + ".replit-dump.bak";
fs.copyFileSync(file, backup);

const ordered = [...pairs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const out = [
  "# Normalizado automaticamente a partir do dump Replit (chave/valor em linhas).",
  "# NÃO COMMITAR este arquivo.",
  "",
  ...ordered.map(([k, v]) => {
    // Escapa se necessário
    if (v === "") return `${k}=`;
    if (/[\s#"']/.test(v) || v.includes("=")) {
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${k}="${escaped}"`;
    }
    return `${k}=${v}`;
  }),
  "",
];

fs.writeFileSync(file, out.join("\n"), "utf8");

const empty = ordered.filter(([, v]) => !v).map(([k]) => k);
console.log(JSON.stringify({
  backup,
  pairCount: ordered.length,
  emptyKeys: empty,
  warningCount: warnings.length,
  warnings: warnings.slice(0, 40),
  keys: ordered.map(([k]) => k),
}, null, 2));
