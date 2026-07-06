/**
 * Parser das variáveis do Replit ([userenv.shared] + [env] PORT).
 * Ordem e chaves são a fonte de verdade — Railway/Vercel devem espelhar isso.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
export const REPLIT_PATH = path.join(ROOT, ".replit");

/** Ordem exata de [userenv.shared] no .replit (não reordenar). */
export const REPLIT_SHARED_KEYS = [
  "APIBRASIL_TOKEN",
  "APIBRASIL_DEVICE_NOTAS",
  "APIBRASIL_DEVICE_PROCESSOS",
  "APIBRASIL_DEVICE_CNH",
  "APIBRASIL_DEVICE_CERTIDAO_PJ",
  "APIBRASIL_DEVICE_MULTAS",
  "APIBRASIL_DEVICE_PROTESTO",
  "APIBRASIL_DEVICE_QUOD",
  "APIBRASIL_DEVICE_RISCO_PJ",
  "APIBRASIL_DEVICE_SPC",
  "APIBRASIL_DEVICE_ELEITORAL",
  "APIBRASIL_DEVICE_PLACA_DADOS",
  "APIBRASIL_DEVICE_TOKEN",
  "APIBRASIL_SOCKET_CHANNEL",
  "RECEITAWS_TOKEN",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_GOOGLE_MAPS_API_KEY",
  "TRUCKSCONTROL_CHAVE",
  "TRUCKSCONTROL_SENHA",
  "WDAPI_TOKEN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_FROM",
  "ASAAS_API_URL",
  "RHID_API_URL",
  "RHID_EMAIL",
  "ASAAS_MUNICIPAL_SERVICE_ID",
] as const;

export type ReplitEnvKey = (typeof REPLIT_SHARED_KEYS)[number];

function parseTomlSection(content: string, header: string): Record<string, string> {
  const start = content.indexOf(header);
  if (start < 0) return {};

  const afterHeader = start + header.length;
  const nextSection = content.indexOf("\n[", afterHeader);
  const block = nextSection >= 0 ? content.slice(afterHeader, nextSection) : content.slice(afterHeader);

  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && val) out[key] = val;
  }
  return out;
}

/** Lê .replit e devolve só o padrão Replit (shared + PORT). */
export function loadReplitEnv(): Record<string, string> {
  if (!existsSync(REPLIT_PATH)) {
    throw new Error(".replit não encontrado");
  }

  const content = readFileSync(REPLIT_PATH, "utf8");
  const shared = parseTomlSection(content, "[userenv.shared]");
  const envBlock = parseTomlSection(content, "[env]");

  const out: Record<string, string> = {};
  for (const key of REPLIT_SHARED_KEYS) {
    if (shared[key]) out[key] = shared[key];
  }
  if (envBlock.PORT) out.PORT = envBlock.PORT;

  return out;
}

/** Formato KEY=value para Railway Raw Editor (sem comentários, ordem Replit). */
export function formatReplitEnvLines(vars: Record<string, string>, includePort = true): string[] {
  const lines: string[] = [];
  for (const key of REPLIT_SHARED_KEYS) {
    if (vars[key]) lines.push(`${key}=${vars[key]}`);
  }
  if (includePort && vars.PORT) lines.push(`PORT=${vars.PORT}`);
  return lines;
}

/** Filtra um .env genérico para manter só chaves do Replit. */
export function filterToReplitPattern(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of REPLIT_SHARED_KEYS) {
    if (vars[key]?.trim()) out[key] = vars[key].trim();
  }
  if (vars.PORT?.trim()) out.PORT = vars.PORT.trim();
  return out;
}

export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}
