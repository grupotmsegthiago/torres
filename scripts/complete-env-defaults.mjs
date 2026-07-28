/**
 * Completa .env com defaults NÃO sigilosos e espelhamentos seguros.
 * Gera CRON_SECRET se ausente. Não imprime valores.
 */
import fs from "fs";
import crypto from "crypto";

function load(path) {
  const map = new Map();
  const order = [];
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
    if (!map.has(k)) order.push(k);
    map.set(k, v);
  }
  return { map, order };
}

function save(path, map) {
  const keys = [...map.keys()].sort();
  const lines = [
    "# Torres — ambiente local (NÃO COMMITAR)",
    "# Normalizado/completado automaticamente durante migração Replit → Vercel",
    "",
  ];
  for (const k of keys) {
    const v = map.get(k) ?? "";
    if (v === "") {
      lines.push(`${k}=`);
      continue;
    }
    if (/[\s#"']/.test(v) || v.includes("=")) {
      lines.push(`${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${k}=${v}`);
    }
  }
  lines.push("");
  fs.writeFileSync(path, lines.join("\n"), "utf8");
}

const { map } = load(".env");
const added = [];
const setIfMissing = (k, v) => {
  if (!map.get(k)) {
    map.set(k, v);
    added.push(k);
  }
};

setIfMissing("TZ", "America/Sao_Paulo");
setIfMissing("PORT", "5000");
setIfMissing("NODE_ENV", "development");
setIfMissing("PUBLIC_SITE_URL", "https://torresseguranca.vercel.app");
setIfMissing("SSX_BASE_URL", "https://integration.systemsatx.com.br");
setIfMissing("DISABLE_LOCAL_FALLBACK", "true");
setIfMissing("ASAAS_API_URL", map.get("ASAAS_API_URL") || "https://www.asaas.com/api/v3");
setIfMissing("INTER_AMBIENTE", "sandbox");

if (!map.get("DATABASE_URL") && map.get("SUPABASE_DATABASE_URL")) {
  map.set("DATABASE_URL", map.get("SUPABASE_DATABASE_URL"));
  added.push("DATABASE_URL");
}
if (!map.get("GOOGLE_MAPS_API_KEY") && map.get("VITE_GOOGLE_MAPS_API_KEY")) {
  map.set("GOOGLE_MAPS_API_KEY", map.get("VITE_GOOGLE_MAPS_API_KEY"));
  added.push("GOOGLE_MAPS_API_KEY");
}
if (!map.get("OPENAI_API_KEY") && map.get("AI_INTEGRATIONS_OPENAI_API_KEY")) {
  map.set("OPENAI_API_KEY", map.get("AI_INTEGRATIONS_OPENAI_API_KEY"));
  added.push("OPENAI_API_KEY");
}
// Control iD: usa SESSION_SECRET existente para não invalidar dados já cifrados
if (!map.get("CONTROLID_ENC_KEY") && map.get("SESSION_SECRET")) {
  map.set("CONTROLID_ENC_KEY", map.get("SESSION_SECRET"));
  added.push("CONTROLID_ENC_KEY");
}
if (!map.get("CRON_SECRET")) {
  map.set("CRON_SECRET", crypto.randomBytes(32).toString("hex"));
  added.push("CRON_SECRET");
}

save(".env", map);
console.log(JSON.stringify({ added, totalKeys: map.size }, null, 2));
