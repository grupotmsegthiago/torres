/**
 * DTO seguro de usuário — allowlist explícita.
 * Nunca incluir senhas, hashes ou tokens.
 */

export type SafeUser = {
  id: number;
  email: string | null;
  username: string | null;
  name: string;
  role: string;
  employeeId: number | null;
  mustChangePassword: boolean;
  supabaseUid: string | null;
  avatarUrl: string | null;
  termsAcceptedAt: Date | string | null;
  termsIpAddress: string | null;
  termsUserAgent: string | null;
  createdAt: Date | string | null;
};

function pick(user: Record<string, unknown>, camel: string, snake: string): unknown {
  if (user[camel] !== undefined) return user[camel];
  if (user[snake] !== undefined) return user[snake];
  return undefined;
}

/**
 * Constrói objeto seguro campo a campo (sem spread do original).
 * Não muta o objeto de entrada.
 */
export function toSafeUser(user: unknown): SafeUser {
  if (user == null || typeof user !== "object") {
    return {
      id: 0,
      email: null,
      username: null,
      name: "",
      role: "funcionario",
      employeeId: null,
      mustChangePassword: false,
      supabaseUid: null,
      avatarUrl: null,
      termsAcceptedAt: null,
      termsIpAddress: null,
      termsUserAgent: null,
      createdAt: null,
    };
  }

  const u = user as Record<string, unknown>;
  const mustRaw = pick(u, "mustChangePassword", "must_change_password");

  return {
    id: Number(pick(u, "id", "id") ?? 0),
    email: (pick(u, "email", "email") as string | null | undefined) ?? null,
    username: (pick(u, "username", "username") as string | null | undefined) ?? null,
    name: String(pick(u, "name", "name") ?? ""),
    role: String(pick(u, "role", "role") ?? "funcionario"),
    employeeId:
      pick(u, "employeeId", "employee_id") == null
        ? null
        : Number(pick(u, "employeeId", "employee_id")),
    mustChangePassword: mustRaw === 1 || mustRaw === true,
    supabaseUid: (pick(u, "supabaseUid", "supabase_uid") as string | null | undefined) ?? null,
    avatarUrl: (pick(u, "avatarUrl", "avatar_url") as string | null | undefined) ?? null,
    termsAcceptedAt:
      (pick(u, "termsAcceptedAt", "terms_accepted_at") as Date | string | null | undefined) ?? null,
    termsIpAddress:
      (pick(u, "termsIpAddress", "terms_ip_address") as string | null | undefined) ?? null,
    termsUserAgent:
      (pick(u, "termsUserAgent", "terms_user_agent") as string | null | undefined) ?? null,
    createdAt: (pick(u, "createdAt", "created_at") as Date | string | null | undefined) ?? null,
  };
}

/** Colunas explícitas para leituras que alimentam API (nunca inclui plain_password). */
export const USER_SAFE_SELECT =
  "id, email, username, name, role, employee_id, must_change_password, supabase_uid, avatar_url, terms_accepted_at, terms_ip_address, terms_user_agent, created_at";

/** Garante que um payload serializável não contém campos sensíveis. */
export function assertNoPasswordFields(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return true;
  const json = JSON.stringify(payload);
  return !/(plainPassword|plain_password|"password"|passwordHash|password_hash|refreshToken|accessToken)/i.test(
    json,
  );
}
