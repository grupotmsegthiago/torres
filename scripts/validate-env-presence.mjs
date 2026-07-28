/**
 * Valida presença/tipo de variáveis obrigatórias sem imprimir valores.
 */
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function loadDotenv(path) {
  const map = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let k = line.slice(0, i);
    let v = line.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    map[k] = v;
  }
  return map;
}

const env = loadDotenv(".env");
const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DATABASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SESSION_SECRET",
];
const recommended = [
  "CRON_SECRET",
  "CONTROLID_ENC_KEY",
  "PUBLIC_SITE_URL",
  "ASAAS_API_KEY",
  "ZAPI_INSTANCE_ID",
  "ZAPI_TOKEN",
  "ZAPI_CLIENT_TOKEN",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
];

function classify(v) {
  if (!v) return "missing";
  if (v.startsWith("eyJ")) return "jwt";
  if (/^https:\/\/[a-z0-9]+\.supabase\.co/i.test(v)) return "supabase_url";
  if (/^postgres(ql)?:\/\//i.test(v)) return "postgres_url";
  if (/^https?:\/\//i.test(v)) return "url";
  return "present";
}

const expectedRef = process.argv[2] || "erjhxwbutjyylxdthuuz";
const url = env.SUPABASE_URL || "";
const viteUrl = env.VITE_SUPABASE_URL || "";
const refFromUrl = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || null;

const report = {
  required: Object.fromEntries(required.map((k) => [k, classify(env[k])])),
  recommended: Object.fromEntries(recommended.map((k) => [k, classify(env[k])])),
  supabaseRefMatch: {
    expectedRef,
    refFromSupabaseUrl: refFromUrl,
    matches: refFromUrl === expectedRef,
    viteMatchesBackend: (env.VITE_SUPABASE_URL || "") === (env.SUPABASE_URL || ""),
    anonMatchesVite: (env.VITE_SUPABASE_ANON_KEY || "") === (env.SUPABASE_ANON_KEY || ""),
    dbHostContainsRef: (env.SUPABASE_DATABASE_URL || "").includes(expectedRef),
  },
  missingFromEnvVsExample: [],
  presentCount: Object.keys(env).filter((k) => env[k]).length,
};

if (fs.existsSync(".env.example")) {
  const ex = loadDotenv(".env.example");
  for (const k of Object.keys(ex)) {
    if (!(k in env) || !env[k]) report.missingFromEnvVsExample.push(k);
  }
}

console.log(JSON.stringify(report, null, 2));
