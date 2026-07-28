/**
 * Tenta recuperar pares NOME→(presença) de um .env malformado.
 * Nunca imprime valores — só nomes, comprimento e tipo do valor.
 */
import fs from "fs";

const KNOWN = [
  "TZ","PORT","NODE_ENV","PUBLIC_SITE_URL",
  "SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DATABASE_URL",
  "VITE_SUPABASE_URL","VITE_SUPABASE_ANON_KEY","DATABASE_URL",
  "SESSION_SECRET","CONTROLID_ENC_KEY","CRON_SECRET",
  "SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_FROM","SMTP_PASS",
  "VITE_GOOGLE_MAPS_API_KEY","GOOGLE_MAPS_API_KEY",
  "ASAAS_API_URL","ASAAS_API_KEY","ASAAS_MUNICIPAL_SERVICE_ID","ASAAS_WEBHOOK_TOKEN",
  "INTER_CLIENT_ID","INTER_CLIENT_SECRET","INTER_CONTA_CORRENTE","INTER_CERT_CRT","INTER_CERT_KEY","INTER_AMBIENTE",
  "ZAPI_INSTANCE_ID","ZAPI_TOKEN","ZAPI_CLIENT_TOKEN","ZAPI_EXPECTED_PHONE",
  "OPENAI_API_KEY","AI_INTEGRATIONS_OPENAI_API_KEY","AI_INTEGRATIONS_OPENAI_BASE_URL",
  "APIBRASIL_TOKEN","APIBRASIL_DEVICE_NOTAS","APIBRASIL_DEVICE_PROCESSOS","APIBRASIL_DEVICE_CNH",
  "APIBRASIL_DEVICE_CERTIDAO_PJ","APIBRASIL_DEVICE_MULTAS","APIBRASIL_DEVICE_PROTESTO",
  "APIBRASIL_DEVICE_QUOD","APIBRASIL_DEVICE_RISCO_PJ","APIBRASIL_DEVICE_SPC",
  "APIBRASIL_DEVICE_ELEITORAL","APIBRASIL_DEVICE_PLACA_DADOS","APIBRASIL_DEVICE_TOKEN",
  "APIBRASIL_SOCKET_CHANNEL","RECEITAWS_TOKEN","WDAPI_TOKEN","BRASILAPI_TOKEN",
  "TRUCKSCONTROL_CHAVE","TRUCKSCONTROL_SENHA",
  "SSX_BASE_URL","SSX_EMAIL","SSX_PASSWORD","SSX_TOKEN",
  "TICKETLOG_USER","TICKETLOG_PASS","TICKETLOG_ENV",
  "RHID_API_URL","RHID_EMAIL","DISABLE_LOCAL_FALLBACK",
];

const text = fs.readFileSync(process.argv[2] || ".env", "utf8");
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const foundByName = [];
for (const name of KNOWN) {
  // Match KEY=value or standalone KEY line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === name || line.startsWith(name + "=") || line.startsWith(name + ":")) {
      let valuePreviewType = "unknown";
      let valueLen = 0;
      if (line.includes("=")) {
        const v = line.slice(line.indexOf("=") + 1);
        valueLen = v.length;
        valuePreviewType = classify(v);
      } else if (line.includes(":")) {
        const v = line.slice(line.indexOf(":") + 1).trim();
        valueLen = v.length;
        valuePreviewType = classify(v);
      } else if (i + 1 < lines.length) {
        // possível formato chave\nvalor
        const next = lines[i + 1];
        if (!KNOWN.includes(next) && !/^[A-Z][A-Z0-9_]{2,}$/.test(next)) {
          valueLen = next.length;
          valuePreviewType = classify(next) + "_next_line";
        }
      }
      foundByName.push({ name, lineIndex: i + 1, valueLen, valuePreviewType });
      break;
    }
  }
}

function classify(v) {
  if (!v) return "empty";
  if (v.startsWith("eyJ")) return "jwt";
  if (/^https?:\/\//i.test(v)) return "url";
  if (/^postgres(ql)?:\/\//i.test(v)) return "postgres_url";
  if (/^\$2[aby]?\$/.test(v) || v.startsWith("$")) return "secret_or_hash";
  if (v.includes("@") && v.includes(".")) return "email_or_host";
  if (/^\d+$/.test(v)) return "number";
  if (v.length > 80) return "long_blob";
  if (v.length > 20) return "tokenish";
  return "short";
}

// Conta linhas que parecem NOMES de env (UPPER_SNAKE)
const upperSnakeLines = lines.filter((l) => /^[A-Z][A-Z0-9_]{2,}$/.test(l));

// Pares dotenv válidos
const dotenvPairs = [];
for (const line of lines) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) dotenvPairs.push({ name: m[1], valueLen: m[2].length, type: classify(m[2]) });
}

console.log(JSON.stringify({
  totalNonEmptyLines: lines.length,
  upperSnakeNameLines: upperSnakeLines,
  dotenvPairs,
  knownNamesFound: foundByName,
  diagnosis:
    dotenvPairs.length < 10 && upperSnakeLines.length < 5
      ? "ENV_MALFORMED_VALUES_WITHOUT_KEYS"
      : dotenvPairs.length >= 10
        ? "ENV_DOTENV_OK"
        : "ENV_PARTIAL",
}, null, 2));
