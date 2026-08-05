import type { InsertUser } from "@shared/schema";

/** Campos graváveis em public.users — sem senha em texto (schema já sem plainPassword). */
export type UserWriteInput = InsertUser;
export type UserUpdateInput = Partial<UserWriteInput>;

const USER_WRITE_KEYS = [
  "supabaseUid",
  "email",
  "username",
  "name",
  "role",
  "employeeId",
  "mustChangePassword",
  "avatarUrl",
  "termsAcceptedAt",
  "termsIpAddress",
  "termsUserAgent",
] as const;

const FORBIDDEN_KEYS = new Set([
  "plainPassword",
  "plain_password",
  "password",
  "passwordHash",
  "password_hash",
  "tempPassword",
  "newPassword",
  "accessToken",
  "refreshToken",
  "token",
  "secret",
  "hash",
]);

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Allowlist de escrita em users.
 * Remove plainPassword/plain_password e qualquer campo desconhecido.
 * Não muta o objeto original.
 */
export function sanitizeUserWrite(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const allowed = new Set<string>(USER_WRITE_KEYS);

  for (const [key, value] of Object.entries(src)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEYS.has(key)) continue;
    const camel = key.includes("_") ? snakeToCamel(key) : key;
    if (FORBIDDEN_KEYS.has(camel)) continue;
    if (!allowed.has(camel)) continue;
    out[camel] = value;
  }
  return out;
}

/** True se o payload ainda contém chaves de senha (para testes/contratos). */
export function hasPasswordWriteFields(input: unknown): boolean {
  if (input == null || typeof input !== "object") return false;
  return Object.keys(input as object).some((k) => FORBIDDEN_KEYS.has(k));
}
