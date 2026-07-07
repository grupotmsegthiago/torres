import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthProfile = {
  id: number;
  email: string;
  name: string;
  role: string;
  supabaseUid: string | null;
  username: string | null;
  avatarUrl: string | null;
  employeeId: number | null;
  mustChangePassword: boolean;
  termsAcceptedAt: string | null;
  matricula: string | null;
};

/** Mensagem amigável quando /api/auth/me falha após login no Supabase. */
export function authMeErrorMessage(status: number, body: { message?: string; code?: string }): string {
  if (status === 503) {
    return "Servidor temporariamente indisponível. Aguarde alguns segundos e tente de novo.";
  }
  if (status === 403 && body.code === "USER_NOT_REGISTERED") {
    return body.message || "Usuário autenticado, mas não cadastrado no sistema. Contate o administrador.";
  }
  if (status === 401) {
    return "Sessão inválida ou expirada. Faça login novamente.";
  }
  return body.message || "Erro ao obter perfil do usuário";
}

export async function fetchAuthMe(accessToken: string): Promise<AuthProfile> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return res.json();

  const errBody = await res.json().catch(() => ({}));
  throw new Error(authMeErrorMessage(res.status, errBody));
}

/** Login Supabase + carrega perfil local via /api/auth/me. */
export async function signInAndLoadProfile(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthProfile> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[auth] Supabase login error:", error.message, error);
    throw new Error(error.message);
  }
  if (!data?.session?.access_token) {
    console.error("[auth] Login sem sessão:", data);
    throw new Error("Login não retornou sessão. Verifique o e-mail e tente novamente.");
  }
  return fetchAuthMe(data.session.access_token);
}
